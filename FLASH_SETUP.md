# Flash PPAPI Setup

> How the Shinobi Launcher loads the Flash PPAPI plugin, where to get the binaries, and what to do when something goes wrong.

---

# English

## Why Flash is needed

**Naruto Online is a Flash game.** The client (`http://naruto.narutowebgame.com/...`) loads a chain of `.swf` files into a Pepper Flash (PPAPI) plugin. There is no HTML5 client — without a working PPAPI plugin, the game canvas stays black.

Adobe ended Flash support in December 2020 (EOL). Modern Chromium (>=88) and every Tauri/WebView2 runtime have removed PPAPI. The only way to keep Naruto Online running on a desktop is to bundle a "Clean Flash" PPAPI build (an unofficial patched fork that ignores the EOL kill-switch) inside an old Electron that still supports the `ppapi-flash-path` command-line switch. That is exactly what Shinobi Launcher does: it pins **Electron 11.5.0** (the last release with working Pepper Flash) and ships **Clean Flash PPAPI 34.0.0.x** from the [`darktohka/clean-flash-builds`](https://github.com/darktohka/clean-flash-builds) project.

For the broader context and the Adobe EOL announcement, see:
- Adobe Flash Player End of Life: <https://www.adobe.com/products/flashplayer/end-of-life.html>
- Clean Flash builds: <https://github.com/darktohka/clean-flash-builds>

If you are looking for a way to run Naruto Online without a bundled PPAPI binary, **there is none today**. Ruffle (a WASM Flash player) does not yet support the ActionScript 3 + heavy network I/O that Naruto Online requires. The launcher will keep shipping the bundled binary for as long as the game servers stay online.

---

## Where the binaries live

The launcher ships the binaries **committed to the repository** at the project root, not as a download-on-first-run step:

```
shinobi-launcher/
├── flash/
│   ├── pepflashplayer.dll          # Windows PPAPI plugin (34.0.0.376, ~16 MB)
│   ├── libpepflashplayer.so        # Linux PPAPI plugin   (34.0.0.137, ~16 MB)
│   ├── manifest.json               # version metadata (cross-platform)
│   ├── manifest-windows.json       # Windows-specific version metadata
│   └── manifest-linux.json         # Linux-specific version metadata
```

| Platform | Filename | Expected version |
|----------|----------|------------------|
| Windows  | `flash/pepflashplayer.dll`   | 34.0.0.376 |
| Linux    | `flash/libpepflashplayer.so` | 34.0.0.137 |

Both files are larger than 1 MB (the loader's minimum-size sanity check). They are read by the launcher at startup — no extraction, no install step.

---

## How the auto-loader works

The Flash plugin loader is `src/flash/plugin.js`. Its main entry point is `findFlashPlugin()`, which:

1. Checks the platform. `win32` and `linux` are supported; `darwin` is rejected (macOS cannot run PPAPI Flash).
2. Resolves the platform-specific plugin name (`pepflashplayer.dll` on Windows, `libpepflashplayer.so` on Linux).
3. Builds a list of **six candidate search paths**, in order:

   | # | Path | Mode |
   |---|------|------|
   | 1 | `process.resourcesPath/flash/<plugin>` | Packaged app (AppImage / portable EXE) |
   | 2 | `path.dirname(app.getPath('exe'))/flash/<plugin>` | Portable EXE sitting next to `flash/` |
   | 3 | `app.getAppPath()` (with `.asar` stripped) `/flash/<plugin>` | ASAR-packaged dev / prod |
   | 4 | `process.cwd()/flash/<plugin>` | Run from project root |
   | 5 | `__dirname/../../flash/<plugin>` | Dev mode (`src/flash/` → repo root `flash/`) |
   | 6 | `userData/flash-cache/<plugin>` | User-supplied manual drop (no auto-download — see note below) |

4. Deduplicates the paths (some resolve to the same absolute location).
5. Returns the first path where the file exists **and** is larger than 1 MB. Logs each attempt.
6. If nothing matches, returns `null` and logs the full list of attempted paths.

`configureFlash(flashPath)` then reads the version from the sibling `manifest.json` (falling back to a hardcoded `FLASH_VERSIONS` constant if the manifest is missing) and appends two Chromium command-line switches:

```
--ppapi-flash-path=<absolute path to the binary>
--ppapi-flash-version=<e.g. 34.0.0.376>
```

The other Chromium flags (sandbox off, `--always-authorize-plugins`, JS heap size, etc.) are applied by `src/main/flags.js` — the Flash loader only owns the path + version. This split is deliberate: an earlier version of the loader overrode `js-flags` set by `main.js`, which broke `--expose-gc` and the MemoryGuard daemon. v3.0.0 fixed that by moving every non-Flash-specific flag to `main/flags.js`.

---

## No automatic fallback (since v1.0.1)

Previous versions shipped a `FlashUpdater` module that auto-downloaded Clean Flash from `darktohka/clean-flash-builds` if all six search paths missed. **That module was removed** — Flash is EOL, the pinned binaries are committed to the repo, and an auto-download adds attack surface (a compromised GitHub release would silently replace the plugin).

**If the loader returns `null`**, the launcher does NOT try to recover on its own. The game tab will show a Flash-missing prompt. Manual recovery:

1. Re-clone the repo (or copy `flash/pepflashplayer.dll` / `flash/libpepflashplayer.so` from a known-good checkout).
2. Drop the binary at `userData/flash-cache/<plugin>` (search path #6) if you want to keep it user-local.
3. Restart the launcher.

The committed `flash/` directory (paths 1-5) always wins. The 6th path is a user-supplied escape hatch, never auto-populated.

---

## Replacing the binaries

To swap in a different Clean Flash build (for example, to test a newer patched version):

1. Find the asset you want on <https://github.com/darktohka/clean-flash-builds/releases>.
2. Extract the PPAPI plugin:
   - Windows: from `ChineseFlash-Patched-Win-<ver>.7z`, take `pepflashplayer.dll`.
   - Linux: from `flash_player_patched_ppapi_linux.x86_64.tar.gz`, take `libpepflashplayer.so`.
3. Drop it into the project root `flash/` directory, **overwriting** the existing file. Keep the exact filename — the loader looks up by name, not by glob.
4. (Optional) Update `flash/manifest.json` so the `version` field matches the new binary. If you skip this, `configureFlash` falls back to `FLASH_VERSIONS` (`34.0.0.376` Windows / `34.0.0.137` Linux) — the launcher runs fine, but the `--ppapi-flash-version` switch will report the wrong version. Some Oasgames pages check the Flash version string; if you see "Flash version too old" warnings in the game, update the manifest.
5. Restart the launcher. The first boot log line will read `Flash <version> path configurado`.

You do **not** need to rebuild the AppImage or portable EXE to swap a binary in dev mode. For a packaged app, drop the new binary next to the executable in the same `flash/` subfolder (search path #2) and it will be picked up on next launch.

---

## Troubleshooting

### Symptom: launcher opens but the game canvas stays black, with no "Press to play" prompt
**Cause:** the PPAPI plugin was not loaded. Check `userData/logs/main.log` for the line `Flash PPAPI NÃO encontrado!`.
**Fix:**
- Verify that `flash/pepflashplayer.dll` (Windows) or `flash/libpepflashplayer.so` (Linux) exists at one of the six search paths and is larger than 1 MB.
- If you deleted it, restore from the repo or drop a known-good binary into `userData/flash-cache/<plugin>` (search path #6). There is **no automatic download** anymore — see "No automatic fallback" above.
- Confirm the manifest version matches the binary if you replaced it manually.

### Symptom: launcher runs without Flash and the game never launches
This is the expected fallback behavior — the launcher itself does not require Flash. Only the game does. If you see the manager window open normally but the game tab shows a Flash-missing prompt, the binary is missing. Follow the steps above.

### Symptom: `Flash <version> path configurado` log appears, but the game still shows a black canvas
The binary loaded but PPAPI initialization failed inside Chromium. Common causes:
- Running on Wayland without `--ozone-platform=wayland` (the launcher auto-detects Wayland and applies `use-gl=desktop` on X11 only). Try `GDK_BACKEND=x11 ./ShinobiLauncher-*.AppImage`.
- GPU driver blocklist. Toggle **Settings → Force CPU rendering** (requires restart) to fall back to SwiftShader.
- Corrupt binary. Replace it from a known-good repo checkout, or drop a fresh one into `userData/flash-cache/<plugin>` (search path #6).

### Symptom: game launches but shows "Flash version too old"
Update `flash/manifest.json` so its `version` (Windows) or `linux_version` (Linux) field matches the actual binary version. The launcher reports this string to Oasgames via `--ppapi-flash-version`.

---

## Source references

| File | Purpose |
|------|---------|
| `src/flash/plugin.js` | `findFlashPlugin()`, `configureFlash()`, `getFlashVersion()` — the loader |
| `src/flash/mms.js` | Generates `mms.cfg` for Modo Low-Spec (Low-PC mode) |
| `src/main/flags.js` | Applies all other Chromium flags (`--no-sandbox`, `--always-authorize-plugins`, JS heap, etc.) |
| `src/main.js` | Boot orchestration: `applyAll(flags)` → `findFlashPlugin()` → `configureFlash()` → `createManagerWindow()` (or shows a Flash-missing prompt — no auto-download) |
| `flash/manifest*.json` | Version metadata read by `getFlashVersion()` |

---

# Português

## Por que o Flash é necessário

**Naruto Online é um jogo em Flash.** O cliente (`http://naruto.narutowebgame.com/...`) carrega uma cadeia de arquivos `.swf` em um plugin Pepper Flash (PPAPI). Não há cliente HTML5 — sem um plugin PPAPI funcionando, o canvas do jogo fica preto.

A Adobe encerrou o suporte ao Flash em dezembro de 2020 (EOL). Chromium moderno (>=88) e todo runtime Tauri/WebView2 removeram PPAPI. A única forma de manter Naruto Online rodando em desktop é empacotar um build "Clean Flash" PPAPI (um fork não-oficial com patch que ignora o kill-switch de EOL) dentro de um Electron antigo que ainda suporta o switch de linha de comando `ppapi-flash-path`. É exatamente isso que o Shinobi Launcher faz: pinou o **Electron 11.5.0** (a última release com Pepper Flash funcionando) e embarca o **Clean Flash PPAPI 34.0.0.x** do projeto [`darktohka/clean-flash-builds`](https://github.com/darktohka/clean-flash-builds).

Para o contexto geral e o anúncio de EOL da Adobe, veja:
- Adobe Flash Player End of Life: <https://www.adobe.com/products/flashplayer/end-of-life.html>
- Builds do Clean Flash: <https://github.com/darktohka/clean-flash-builds>

Se você procura uma forma de rodar Naruto Online sem um binário PPAPI embarcado, **hoje não existe**. O Ruffle (um player Flash em WASM) ainda não suporta o ActionScript 3 + I/O de rede pesado que Naruto Online exige. O launcher vai continuar embarcando o binário enquanto os servidores do jogo ficarem no ar.

---

## Onde os binários ficam

O launcher embarca os binários **committed ao repositório** na raiz do projeto, não como download no primeiro boot:

```
shinobi-launcher/
├── flash/
│   ├── pepflashplayer.dll          # plugin PPAPI Windows (34.0.0.376, ~16 MB)
│   ├── libpepflashplayer.so        # plugin PPAPI Linux   (34.0.0.137, ~16 MB)
│   ├── manifest.json               # metadata de versão (cross-platform)
│   ├── manifest-windows.json       # metadata de versão específica Windows
│   └── manifest-linux.json         # metadata de versão específica Linux
```

| Plataforma | Arquivo | Versão esperada |
|------------|---------|-----------------|
| Windows  | `flash/pepflashplayer.dll`   | 34.0.0.376 |
| Linux    | `flash/libpepflashplayer.so` | 34.0.0.137 |

Ambos os arquivos são maiores que 1 MB (o sanity check de tamanho mínimo do loader). Eles são lidos pelo launcher no startup — sem extração, sem passo de instalação.

---

## Como o auto-loader funciona

O loader do plugin Flash é `src/flash/plugin.js`. Seu ponto de entrada principal é `findFlashPlugin()`, que:

1. Checa a plataforma. `win32` e `linux` são suportadas; `darwin` é rejeitado (macOS não roda PPAPI Flash).
2. Resolve o nome do plugin específico da plataforma (`pepflashplayer.dll` no Windows, `libpepflashplayer.so` no Linux).
3. Constrói uma lista de **seis caminhos candidatos de busca**, em ordem:

   | # | Caminho | Modo |
   |---|---------|------|
   | 1 | `process.resourcesPath/flash/<plugin>` | App empacotado (AppImage / portable EXE) |
   | 2 | `path.dirname(app.getPath('exe'))/flash/<plugin>` | Portable EXE ao lado de `flash/` |
   | 3 | `app.getAppPath()` (com `.asar` removido) `/flash/<plugin>` | Dev / prod empacotado em ASAR |
   | 4 | `process.cwd()/flash/<plugin>` | Rodando da raiz do projeto |
   | 5 | `__dirname/../../flash/<plugin>` | Dev mode (`src/flash/` → `flash/` na raiz do repo) |
   | 6 | `userData/flash-cache/<plugin>` | Drop manual do usuário (sem auto-download — veja nota abaixo) |

4. Deduplica os caminhos (alguns resolvem para o mesmo absoluto).
5. Retorna o primeiro caminho onde o arquivo existe **e** é maior que 1 MB. Loga cada tentativa.
6. Se nada match, retorna `null` e loga a lista completa dos caminhos tentados.

`configureFlash(flashPath)` então lê a versão do `manifest.json` irmão (caindo para uma constante `FLASH_VERSIONS` hardcoded se o manifest faltar) e adiciona dois switches de linha de comando do Chromium:

```
--ppapi-flash-path=<caminho absoluto para o binário>
--ppapi-flash-version=<ex.: 34.0.0.376>
```

Os demais switches do Chromium (sandbox off, `--always-authorize-plugins`, heap do JS, etc.) são aplicados por `src/main/flags.js` — o loader do Flash só cuida do path + versão. Esse split é deliberado: uma versão anterior do loader sobrescrevia o `js-flags` setado pelo `main.js`, quebrando o `--expose-gc` e o daemon MemoryGuard. A v3.0.0 corrigiu isso movendo todo flag não-Flash para `main/flags.js`.

---

## Sem fallback automático (desde v1.0.1)

Versões anteriores embarcavam um módulo `FlashUpdater` que auto-baixava Clean Flash de `darktohka/clean-flash-builds` se todos os seis caminhos falhassem. **Esse módulo foi removido** — Flash é EOL, os binários pinned já estão committed no repo, e um auto-download adiciona superfície de ataque (uma release do GitHub comprometida substituiria silenciosamente o plugin).

**Se o loader retorna `null`**, o launcher NÃO tenta se recuperar sozinho. A aba do jogo vai mostrar um prompt de Flash faltando. Recuperação manual:

1. Re-clone o repo (ou copie `flash/pepflashplayer.dll` / `flash/libpepflashplayer.so` de um checkout conhecido-bom).
2. Solte o binário em `userData/flash-cache/<plugin>` (caminho de busca #6) se quiser mantê-lo user-local.
3. Reinicie o launcher.

O diretório `flash/` committed (caminhos 1-5) sempre vence. O 6º caminho é uma válvula de escape user-supplied, nunca auto-populado.

---

## Substituindo os binários

Para trocar por um build diferente do Clean Flash (ex.: para testar uma versão patched mais nova):

1. Encontre o asset que você quer em <https://github.com/darktohka/clean-flash-builds/releases>.
2. Extraia o plugin PPAPI:
   - Windows: de `ChineseFlash-Patched-Win-<ver>.7z`, pegue `pepflashplayer.dll`.
   - Linux: de `flash_player_patched_ppapi_linux.x86_64.tar.gz`, pegue `libpepflashplayer.so`.
3. Coloque no diretório `flash/` na raiz do projeto, **sobrescrevendo** o arquivo existente. Mantenha o nome exato — o loader procura por nome, não por glob.
4. (Opcional) Atualize `flash/manifest.json` para que o campo `version` match o novo binário. Se você pular isso, `configureFlash` cai para `FLASH_VERSIONS` (`34.0.0.376` Windows / `34.0.0.137` Linux) — o launcher roda fine, mas o switch `--ppapi-flash-version` vai reportar a versão errada. Algumas páginas da Oasgames checam a string de versão do Flash; se você ver avisos de "Flash version too old" no jogo, atualize o manifest.
5. Reinicie o launcher. A primeira linha de log de boot vai ler `Flash <version> path configurado`.

Você **não** precisa rebuildar o AppImage ou portable EXE para trocar um binário em dev mode. Para um app empacotado, coloque o novo binário ao lado do executável no mesmo subdiretório `flash/` (caminho de busca #2) e ele será pego no próximo launch.

---

## Troubleshooting

### Sintoma: o launcher abre mas o canvas do jogo fica preto, sem prompt de "Press to play"
**Causa:** o plugin PPAPI não foi carregado. Cheque `userData/logs/main.log` pela linha `Flash PPAPI NÃO encontrado!`.
**Fix:**
- Verifique que `flash/pepflashplayer.dll` (Windows) ou `flash/libpepflashplayer.so` (Linux) existe em um dos seis caminhos de busca e é maior que 1 MB.
- Se você deletou, restaure do repo ou solte um binário conhecido-bom em `userData/flash-cache/<plugin>` (caminho #6). **Não há mais auto-download** — veja "Sem fallback automático" acima.
- Confirme que a versão do manifest bate com o binário se você substituiu manualmente.

### Sintoma: o launcher roda sem Flash e o jogo nunca abre
Este é o comportamento fallback esperado — o launcher em si não requer Flash. Só o jogo requer. Se você vê a janela do manager abrir normalmente mas a aba do jogo mostra um prompt de Flash faltando, o binário está em falta. Siga os passos acima.

### Sintoma: log `Flash <version> path configurado` aparece, mas o jogo ainda mostra canvas preto
O binário carregou mas a inicialização do PPAPI falhou dentro do Chromium. Causas comuns:
- Wayland sem `--ozone-platform=wayland` (o launcher auto-detecta Wayland e aplica `use-gl=desktop` só em X11). Tente `GDK_BACKEND=x11 ./ShinobiLauncher-*.AppImage`.
- Blocklist de driver de GPU. Alterne **Configurações → Forçar renderização por CPU** (requer restart) para cair no SwiftShader.
- Binário corrompido. Substitua por um checkout conhecido-bom do repo, ou solte um binário novo em `userData/flash-cache/<plugin>` (caminho #6).

### Sintoma: o jogo abre mas mostra "Flash version too old"
Atualize `flash/manifest.json` para que o campo `version` (Windows) ou `linux_version` (Linux) match a versão real do binário. O launcher reporta essa string para a Oasgames via `--ppapi-flash-version`.

---

## Referências de código

| Arquivo | Propósito |
|---------|-----------|
| `src/flash/plugin.js` | `findFlashPlugin()`, `configureFlash()`, `getFlashVersion()` — o loader |
| `src/flash/mms.js` | Gera `mms.cfg` para o Modo Low-Spec (Low-PC mode) |
| `src/main/flags.js` | Aplica todos os outros flags Chromium (`--no-sandbox`, `--always-authorize-plugins`, heap JS, etc.) |
| `src/main.js` | Orquestração de boot: `applyAll(flags)` → `findFlashPlugin()` → `configureFlash()` → `createManagerWindow()` (ou mostra prompt de Flash faltando — sem auto-download) |
| `flash/manifest*.json` | Metadata de versão lida por `getFlashVersion()` |
