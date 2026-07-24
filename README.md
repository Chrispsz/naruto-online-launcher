<div align="center">

# Shinobi Launcher — Naruto Online

**A clean, minimal multi-account launcher for Naruto Online.**
Isolated accounts • Encrypted credential vault • Real performance optimizations • Linux + Windows • Zero tracking

[![Version](https://img.shields.io/badge/version-1.2.0-d4a543?style=flat-square)](https://github.com/Chrispsz/naruto-online-launcher/releases/latest)
[![License](https://img.shields.io/github/license/Chrispsz/naruto-online-launcher?style=flat-square)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-1101%20passing-10b981?style=flat-square)](#testing)
[![Electron](https://img.shields.io/badge/electron-11.5.0-47848f?style=flat-square)](#why-electron-11)
[![Platforms](https://img.shields.io/badge/platform-Linux%20%7C%20Windows-6e7681?style=flat-square)](#install)

</div>

---

# English

## What it is

Shinobi Launcher is a desktop launcher for the browser MMO **Naruto Online** (Oasgames). It wraps a custom Chromium + Flash PPAPI runtime so you can run multiple accounts side by side, save credentials securely, and get notified before in-game events start — all from a single, distraction-free window.

The UI is AMOLED pure black (`#000000`) with shinobi gold (`#d4a543`) accents, designed for long sessions and zero eye strain. PC-only (Windows and Linux). No telemetry, no crash reporter, no auto-update phone-home.

### Why Electron 11?

Naruto Online still requires Flash PPAPI. Modern Chromium (>=88) and all Tauri/WebView2 runtimes dropped PPAPI support. **Electron 11.5 is the last version with working Pepper Flash** — there is no alternative without a full CEF rebuild. This is a documented Chromium limitation, not a launcher vulnerability. Flash itself is EOL; the launcher exists precisely so the remaining Naruto Online community can keep playing.

---

## Features

### Multi-account, fully isolated
Each account gets its own Chromium session partition (`persist:profile-<id>`). Cookies, localStorage, cache, and service workers are 100% isolated — one account never touches another. Run as many accounts as your RAM allows, no cookie juggling.

### Encrypted credential vault
Usernames and passwords are stored locally with **AES-256-GCM** encryption. The 256-bit key is derived from a machine-bound seed (hostname + username + userData path + per-installation random salt) via **PBKDF2-SHA512** (100,000 iterations). When a game session expires (Oasgames sessions last ~2h), the launcher re-injects credentials automatically — no re-typing. A stolen `vault.json` is useless on any other machine.

### Multi-region event reminders
Four real Naruto Online server clusters are supported: **BR** (America/Sao_Paulo), **NA** (America/New_York), **EU** (Europe/Berlin), **HK** (Asia/Hong_Kong). Eleven scheduled events per region (World Boss, Arena 3v3, Team Dungeon, Escort, Ninja Instance, Ninja Training, Bond/Check-in, Daily Challenge, Daily Reset, Clan War, Guild Arena). Native desktop notifications fire N minutes before each event starts; an "ended" notification fires when it concludes. DST is auto-detected.

### Real performance optimizations
- **Smart optimization** — always on. Curated Chromium flags tuned for Flash PPAPI: background throttling off, hang monitor off, sandbox disabled (required for PPAPI), disk cache sized to RAM.
- **Force CPU rendering** — for GPUs with driver issues. Appends `--disable-gpu` + `--use-gl=swiftshader` + `--num-raster-threads=<min(CPU_CORES,4)>`. Requires restart.
- **Low-end PC mode ("Modo Low-Spec")** — auto-enabled on systems with <4 GB RAM, or manually forced. Writes `EnableHardwareAcceleration=0` + `AssetCacheSize=0` + `AutoUpdateDisable=1` to `mms.cfg` (Flash config). Tighter memory thresholds and preventive GC. Takes effect on next game launch — no restart needed.
- **CPU affinity** — Flash is single-threaded for game logic; the renderer process is pinned to P-cores via `taskset` (Linux) or `Set-Process -ProcessorAffinity` (Windows), plus `renice -n -5` / `os.setPriority()` and `oom_score_adj=-500` on Linux.

### Stall detection + auto-recovery
If a game window's renderer crashes (OOM, abnormal exit), the launcher auto-reloads after 1.5 s — up to 3 crashes per 10 minutes per profile (loop protection). Clean exits and user kills are skipped. A `StallDetector` also watches sub-resource (SWF) failures via `webRequest.onCompleted`/`onErrorOccurred` and triggers a `reloadWithPreAuth` when 2+ SWFs fail in 60s or 45s pass with zero network activity during loading. After 120s of stable activity the watchdog stops (the game is up).

### Memory guard
Flash PPAPI + Chromium 87 has chronic memory leaks — after 1-2h a single game window can exceed 1 GB and stall. The **MemoryGuard** daemon samples RSS every 5 min (2 min in Modo Low-Spec); when total memory crosses 700 MB normal / 450 MB low-spec, the **GcDaemon** triggers a layered GC: idle-session `clearCache()` (never touches partitions with an active game — that caused black screens), V8 `process.gc(true)` on the main process, and on Windows `EmptyWorkingSet` via PowerShell. Manual `F8` also available. The webview-level `window.gc()` was disabled in v4.9.1 because it paused Flash.

### Event timer + notifications
`EventTimers.js` polls every 30 s for upcoming events across all active regions, computes server-time-to-user-time conversion without a TZ library (DST auto-detected), and fires native `Notification` reminders N minutes before each event starts. Reminders are bilingual (event names have `name_pt` + `name_en`).

### Temp email for alt accounts
Built-in integration with the mail.tm API lets you generate a temporary inbox and register a fresh Naruto Online (Oasgames passport) account in one click — captures the 2h JWT login key automatically. Rate-limited to 5 accounts/hour (mail.tm limit).

### Ad / tracker blocker
`network/blocker.js` filters known tracker domains at the WebRequest level (Google Analytics, DoubleClick, Facebook tracking pixels, Oasgames analytics). Game API endpoints (`odp3.oasgames.com`, `vipsac.oasgames.com`) are explicitly whitelisted so server lists and the VIP store keep working.

### Bilingual UI (EN + PT)
Every user-facing string in `src/config/i18n.js` ships in both English and Brazilian Portuguese. Toggle in Settings; the choice is persisted to `config.json`.

> **Codebase note (v1.2.0):** Comments, identifiers, log messages, and runtime strings are fully professionalized to English (PT→EN, ~1230 renames across cycles 6–15). The UI remains bilingual EN/PT for end users.

### Keyboard shortcuts

| Key | Action |
|-------|------|
| `Ctrl+N` | New account |
| `F8` | Force memory cleanup |
| `F5` | Clear current account's login (cookies + storage, then pre-auth via API and reload) |
| `F11` | Fullscreen |
| `F12` | Toggle DevTools |
| `Ctrl+Shift+S` | Screenshot |
| `Ctrl+Shift+T` | Always on top |
| `Alt+F4` | Close game window (graceful) |
| `Ctrl++/-/0` | Zoom |

---

## Screenshots

A live preview of the launcher UI is available in development via the Next.js dev server (build a single-file preview with `scripts/build-preview.sh`, which inlines `variables.css` + `styles.css` + `app.js` into `public/launcher.html`). Real screenshots will be added to `/docs/img/` before the next stable release.

---

## Requirements

| Component | Version | Notes |
|-----------|---------|-------|
| Node.js | >= 16.0.0 | `package.json` engines field. Required for `npm install`, lint, and tests. |
| Electron | 11.5.0 | Pinned in `devDependencies`. Last version with working PPAPI Flash — see "Why Electron 11" above. |
| Flash PPAPI | 34.0.0.x | Binaries are **committed to the repo** at `flash/pepflashplayer.dll` (Windows) and `flash/libpepflashplayer.so` (Linux). See **[FLASH_SETUP.md](FLASH_SETUP.md)** for details and how to replace them. |
| OS | Windows 10+ or Linux x64 | macOS is not supported (no PPAPI Flash). |

> The Electron binary itself is downloaded by `npm install`'s postinstall hook. If you install with `--ignore-scripts` (the repo default for CI), `npm start` will not work until you run `npm rebuild electron` or a full `npm install` once.

---

## Flash binary setup

Flash PPAPI binaries ship **committed to the repository** at the project root:

```
shinobi-launcher/
├── flash/
│   ├── pepflashplayer.dll          # Windows PPAPI plugin (34.0.0.376)
│   ├── libpepflashplayer.so        # Linux PPAPI plugin (34.0.0.137)
│   ├── manifest.json               # version metadata
│   ├── manifest-windows.json
│   └── manifest-linux.json
```

The auto-loader (`src/flash/plugin.js` → `findFlashPlugin()`) searches six paths in order (packaged resources, exe directory, app path, cwd, dev `flash/`, and `userData/flash-cache/` for a user-supplied manual drop) and picks the first binary larger than 1 MB. If all paths miss, the launcher does **not** auto-download — it shows a Flash-missing prompt and the user must restore the binary manually. (The old `FlashUpdater` auto-download fallback was removed in v1.0.1: Flash is EOL, the pinned binaries ship committed in the repo, and an auto-download adds attack surface.)

To replace the binaries (e.g. with a different Clean Flash build), just drop the new file into `flash/` at the project root — same filename, same platform suffix. See **[FLASH_SETUP.md](FLASH_SETUP.md)** for the full guide.

---

## Install

### From a release (end users)

**Linux** — download the AppImage, make it executable, run:
```bash
chmod +x ShinobiLauncher-*.AppImage
./ShinobiLauncher-*.AppImage
```
Or use the installer script (detects Arch/Ubuntu/Fedora and installs Flash PPAPI dependencies if missing):
```bash
unzip naruto-online-linux.zip
chmod +x install.sh
./install.sh
```

**Windows** — download the portable `.zip`, extract, run `ShinobiLauncher.exe`. No installation required.

### From source (developers)

```bash
git clone https://github.com/Chrispsz/naruto-online-launcher.git
cd naruto-online-launcher

# Install (skip postinstall if you only need lint/test — Electron binary is ~180MB)
npm install            # or: npm install --ignore-scripts

# Run the launcher (requires the Electron binary, so use a full install)
npm start
```

---

## Development

```bash
npm run lint           # ESLint (flat config disabled — pinned to legacy .eslintrc)
npm run lint:fix       # ESLint with --fix
npm test               # Jest — 1101 tests across 37 suites
npm run test:coverage  # Jest with coverage report
npm run format         # Prettier --write src/

# Build a single-file HTML preview for the Next.js dev server
bash scripts/build-preview.sh
# → writes /home/z/my-project/public/launcher.html (inlines CSS + JS)

# Package distributables (requires a full electron install)
npm run build          # AppImage (Linux) + portable EXE (Windows)
npm run build:linux    # AppImage only
npm run build:win      # portable EXE only
```

See **[CONTRIBUTING.md](CONTRIBUTING.md)** for the full contributor guide and **[ARCHITECTURE.md](ARCHITECTURE.md)** for the module map and data flow.

---

## Architecture overview

Shinobi Launcher is split into **13 source modules** under `src/`, each with a single responsibility (the codebase went through a Phase 3 god-object split — every former "God Object" was broken into focused modules with a thin facade preserving the old API).

| # | Module | Path | Responsibility |
|---|--------|------|----------------|
| 1 | UI (renderer) | `src/ui/` | `index.html`, `styles.css`, `variables.css`, `app.js` — vanilla JS, zero framework. AMOLED black + shinobi gold theme. |
| 2 | UI Manager | `src/ui/manager/` | `ManagerWindow` (lifecycle), `IpcRouter` (IPC handlers), `StateBroadcaster` (push state to renderer), `KeyboardShortcuts` (F5/F8/F12/Alt+F4). |
| 3 | App | `src/app/` | `Launcher` (window+profile lifecycle), `SessionLifecycle` (load/fail/crash hooks + auto-login), `CpuOptimizer` (affinity/nice/oom_score), `GpuDetector` (NVIDIA/AMD/Intel), `StallDetector` (SWF failure watchdog). |
| 4 | Profiles | `src/profiles/` | `store` (CRUD), `ProfileVault` (encrypted credential CRUD + auto-login script builder), `CryptoService` (pure AES-256-GCM + PBKDF2), `PasswordManager` (machine-bound key derivation), `partition` (session partition names), `manager` (orchestrator). |
| 5 | Network | `src/network/` | `blocker` (tracker/ad filter), `inspector` (per-profile devtools panel), `cookies` (persistent session cookies), `tempmail` (mail.tm alt-account registration), `api-login` (pre-auth via Oasgames passport API). |
| 6 | Memory | `src/memory/` | `MemoryGuard` (RSS monitor + active-webview registry), `GcDaemon` (layered GC: idle clearCache + process.gc + Windows EmptyWorkingSet). |
| 7 | Config | `src/config/` | `settings` (load/save config.json), `regions` (valid region codes), `i18n` (EN + PT string tables), `urls` (game URLs per region/language/server), `hardware` (CPU/GPU profiles), `optimization` (performance/balanced/quality presets). |
| 8 | Utils | `src/utils/` | `logger` (electron-log wrapper), `diagnostics` (export logs+config .zip — never credentials), `EventTimers` (event reminders + TZ math), `jwt` (HS256 decode for loginKey). |
| 9 | Flash | `src/flash/` | `plugin` (findFlashPlugin + configureFlash), `mms` (mms.cfg generator for Low-PC mode). |
| 10 | Main | `src/main/` | `flags` (single source of truth for Chromium command-line switches), `debug` (debug-mode helpers). |
| 11 | Entry | `src/main.js` + `src/preload.js` | Electron bootstrap: app.whenReady → applyAll flags → findFlashPlugin → createManagerWindow → start daemons. |
| 12 | UI sub-views | `src/ui/loading/`, `src/ui/setup/` | `loading.html` (boot splash, currently unused post-FlashUpdater removal), `setup.html` (first-boot wizard, currently skipped — defaults are sensible). |
| 13 | UI controller | `src/ui/controller.js` + `src/ui/server-selector.js` + `src/ui/game-launcher.js` | Facades re-exporting the manager module trio + server picker dropdown logic + Launcher facade. |

See **[ARCHITECTURE.md](ARCHITECTURE.md)** for the deep dive (process model, IPC flow, vault crypto flow, launch sequence, memory management, event timers, and a text diagram).

---

## Configuration

All runtime configuration lives in `src/config/`:

| File | Purpose |
|------|---------|
| `settings.js` | Load/save `userData/config.json`. Validates region, hardwareProfile, language, optimizationPreset, forceLowSpec, mutedEvents, windowBounds. |
| `regions.js` | Valid game-region codes (BR / NA / EU / HK) — the launcher language list (PT / EN / FR / DE / ES / PL) lives here too, used by the server selector. |
| `i18n.js` | Bilingual string tables (English + Brazilian Portuguese). Every user-facing string has both. |
| `urls.js` | Game URL builder per region/language/server. |
| `hardware.js` | Hardware profile validation (auto / cpu / gpu). |
| `optimization.js` | Optimization presets (performance / balanced / quality). |

User preferences are persisted to `<userData>/config.json`. Credentials are persisted separately to `<userData>/vault.json` (encrypted) with the per-installation salt in `<userData>/vault.salt`.

---

## Security

- Credentials encrypted with **AES-256-GCM**. The 256-bit key is derived from a machine-bound seed (hostname + username + userData path + `"shinobi-vault-v2"`) plus a per-installation 32-byte random salt (stored in `vault.salt`) via **PBKDF2-SHA512, 100,000 iterations**.
- Master-password backups use **PBKDF2-SHA512, 200,000 iterations** (a different KDF round count so backups and the on-disk vault can't share a derived key).
- Threat model: protects against offline reading of `vault.json` on a different machine or under a different user. Does not protect against an attacker with access to the running process.
- `--no-sandbox` is required for PPAPI Flash injection (documented Chromium limitation, not a launcher vulnerability).
- Network requests are filtered by `network/blocker.js` — known tracker domains are blocked at the WebRequest level. Game API endpoints are explicitly whitelisted.
- **No telemetry, no crash reporter, no auto-update phone-home.** Everything stays local.
- Diagnostics export (Settings → Advanced → Export .zip) includes logs + config + system info, **never credentials**.

See **[SECURITY.md](SECURITY.md)** for the full policy and supported versions.

---

## Testing

<a name="testing"></a>

- **1101 tests across 37 suites**, all passing.
- Covers: crypto (AES-256-GCM + PBKDF2), vault CRUD, profile store, session lifecycle, event timers + TZ math, i18n, optimization flags, network blocker, cookies, tempmail rate-limiting, memory guard, GC daemon, plugin loader path resolution.
- Run with `npm test` (or `npm run test:coverage` for a coverage report).
- Jest setup is in `tests/setup.js` — mocks `electron` and `electron-log` so the full test suite runs without an Electron binary.

---

## Contributing

PRs are welcome. Read **[CONTRIBUTING.md](CONTRIBUTING.md)** first. The golden rule: **lint must stay clean and all 1101 tests must pass** — no regressions, no exceptions.

---

## License

MIT — free to use, modify, and distribute. See **[LICENSE](LICENSE)**.

---

## Credits

- **Author:** Chrispsz ([@Chrispsz](https://github.com/Chrispsz))
- **Flash PPAPI builds:** [darktohka/clean-flash-builds](https://github.com/darktohka/clean-flash-builds) — Clean Flash PPAPI 34.0.0.x
- **Community:** the Naruto Online BR/NA/EU/HK player base, for the event-schedule validation
- **Not affiliated with Oasis Games.** "Naruto Online" is a trademark of its respective owners. This launcher is a community tool.

<div align="center">
<sub>Built for the Naruto Online community — Linux + Windows, PC-only.</sub>
</div>

---

# Português

## O que é

O Shinobi Launcher é um launcher desktop para o MMO de navegador **Naruto Online** (Oasgames). Ele envolve um runtime Chromium + Flash PPAPI customizado para você rodar várias contas lado a lado, salvar credenciais com segurança e ser avisado antes dos eventos começarem — tudo de uma única janela limpa, sem distrações.

A interface é AMOLED preto puro (`#000000`) com detalhes em dourado shinobi (`#d4a543`), projetada para sessões longas e zero cansaço visual. Apenas PC (Windows e Linux). Sem telemetria, sem crash reporter, sem auto-update phone-home.

### Por que Electron 11?

Naruto Online ainda requer Flash PPAPI. Chromium moderno (>=88) e todos os runtimes Tauri/WebView2 removeram suporte a PPAPI. **Electron 11.5 é a última versão com Pepper Flash funcionando** — não há alternativa sem um rebuild completo de CEF. Esta é uma limitação documentada do Chromium, não uma vulnerabilidade do launcher. O Flash em si é EOL; o launcher existe justamente para que a comunidade restante do Naruto Online continue jogando.

---

## Funcionalidades

### Multi-conta, totalmente isolado
Cada conta tem sua própria partição de sessão Chromium (`persist:profile-<id>`). Cookies, localStorage, cache e service workers são 100% isolados — uma conta nunca toca a outra. Rode quantas contas sua RAM permitir, sem brigas com cookie.

### Cofre de credenciais criptografado
Usuários e senhas são armazenados localmente com **AES-256-GCM**. A chave de 256 bits é derivada de um seed de máquina (hostname + username + caminho do userData + salt aleatório por instalação) via **PBKDF2-SHA512** (100.000 iterações). Quando a sessão do jogo expira (sessões Oasgames duram ~2h), o launcher re-injeta as credenciais automaticamente — sem redigitar. Um `vault.json` roubado é inútil em qualquer outra máquina.

### Lembretes de eventos multi-região
Quatro clusters reais de servidores Naruto Online suportados: **BR** (America/Sao_Paulo), **NA** (America/New_York), **EU** (Europe/Berlin), **HK** (Asia/Hong_Kong). Onze eventos agendados por região (Boss Mundial, Arena 3v3, Dungeon em Time, Escolta, Instância Ninja, Treinamento Ninja, Bond/Check-in, Desafio Diário, Reset Diário, Guerra de Clã, Arena de Guildas). Notificações desktop nativas disparam N minutos antes de cada evento começar; uma notificação de "encerrado" dispara quando ele termina. DST é auto-detectado.

### Otimizações reais de performance
- **Smart optimization** — sempre ligado. Set curado de flags Chromium ajustadas para Flash PPAPI: background-throttling off, hang monitor off, sandbox desabilitado (requerido para PPAPI), disk cache dimensionado à RAM.
- **Forçar renderização por CPU** — para GPUs com problemas de driver. Adiciona `--disable-gpu` + `--use-gl=swiftshader` + `--num-raster-threads=<min(CPU_CORES,4)>`. Requer restart.
- **Modo PC modesto ("Modo Low-Spec")** — auto-ativado em sistemas com <4 GB RAM, ou forçado manualmente. Escreve `EnableHardwareAcceleration=0` + `AssetCacheSize=0` + `AutoUpdateDisable=1` no `mms.cfg` (config do Flash). Thresholds de memória mais apertados e GC preventivo. Faz efeito no próximo launch do jogo — sem restart.
- **Afinidade de CPU** — Flash é single-threaded para lógica do jogo; o processo renderer é fixado em P-cores via `taskset` (Linux) ou `Set-Process -ProcessorAffinity` (Windows), mais `renice -n -5` / `os.setPriority()` e `oom_score_adj=-500` no Linux.

### Detecção de stall + auto-recuperação
Se o renderer de uma janela de jogo crashar (OOM, saída anormal), o launcher auto-recarrega após 1,5 s — até 3 crashes por 10 minutos por perfil (proteção contra loop). Saídas limpas e kills do usuário são pulados. Um `StallDetector` também observa falhas de sub-recursos (SWFs) via `webRequest.onCompleted`/`onErrorOccurred` e dispara um `reloadWithPreAuth` quando 2+ SWFs falham em 60s ou 45s passam sem atividade de rede durante o loading. Após 120s de atividade estável o watchdog para (o jogo está no ar).

### Guardião de memória
Flash PPAPI + Chromium 87 tem vazamentos crônicos — depois de 1-2h uma janela de jogo pode passar de 1 GB e travar. O daemon **MemoryGuard** amostra o RSS a cada 5 min (2 min no Modo Low-Spec); quando a memória total cruza 700 MB normal / 450 MB low-spec, o **GcDaemon** dispara um GC em camadas: `clearCache()` das sessions ociosas (nunca toca partitions com jogo ativo — isso causava tela preta), `process.gc(true)` no processo main, e no Windows `EmptyWorkingSet` via PowerShell. `F8` manual também disponível. O `window.gc()` no renderer foi desativado em v4.9.1 porque pausava o Flash.

### Timer de eventos + notificações
`EventTimers.js` polla a cada 30 s por eventos próximos em todas as regiões ativas, faz a conversão hora-do-servidor → hora-do-usuário sem library de TZ (DST auto-detectado), e dispara lembretes nativos via `Notification` N minutos antes de cada evento começar. Os lembretes são bilíngues (nomes de evento têm `name_pt` + `name_en`).

### Email temporário para contas alt
Integração embutida com a API mail.tm permite gerar uma inbox temporária e registrar uma conta nova no Naruto Online (passport Oasgames) em um clique — captura o JWT loginKey de 2h automaticamente. Rate-limitado a 5 contas/hora (limite mail.tm).

### Bloqueador de anúncios / trackers
`network/blocker.js` filtra domínios conhecidos de rastreamento no nível WebRequest (Google Analytics, DoubleClick, tracking pixels do Facebook, analytics da Oasgames). Endpoints de API do jogo (`odp3.oasgames.com`, `vipsac.oasgames.com`) são explicitamente whitelisted para que a lista de servidores e a loja VIP continuem funcionando.

### UI bilíngue (EN + PT)
Toda string visível ao usuário em `src/config/i18n.js` vem em inglês e português brasileiro. Alterne em Configurações; a escolha é persistida em `config.json`.

### Atalhos de teclado

| Tecla | Ação |
|-------|------|
| `Ctrl+N` | Nova conta |
| `F8` | Forçar limpeza de memória |
| `F5` | Limpar login da conta atual (cookies + storage, depois pré-auth via API e reload) |
| `F11` | Tela cheia |
| `F12` | Alternar DevTools |
| `Ctrl+Shift+S` | Screenshot |
| `Ctrl+Shift+T` | Sempre visível |
| `Alt+F4` | Fechar janela do jogo (graceful) |
| `Ctrl++/-/0` | Zoom |

---

## Screenshots

Um preview ao vivo da UI do launcher está disponível em desenvolvimento via dev server do Next.js (construa um preview single-file com `scripts/build-preview.sh`, que inlina `variables.css` + `styles.css` + `app.js` em `public/launcher.html`). Screenshots reais serão adicionados em `/docs/img/` antes da próxima release estável.

---

## Requisitos

| Componente | Versão | Observações |
|------------|--------|-------------|
| Node.js | >= 16.0.0 | Campo `engines` do `package.json`. Necessário para `npm install`, lint e testes. |
| Electron | 11.5.0 | Pinado em `devDependencies`. Última versão com PPAPI Flash funcionando — veja "Por que Electron 11" acima. |
| Flash PPAPI | 34.0.0.x | Binários **committed ao repositório** em `flash/pepflashplayer.dll` (Windows) e `flash/libpepflashplayer.so` (Linux). Veja **[FLASH_SETUP.md](FLASH_SETUP.md)** para detalhes e como substituí-los. |
| OS | Windows 10+ ou Linux x64 | macOS não é suportado (sem PPAPI Flash). |

> O binário Electron em si é baixado pelo hook postinstall do `npm install`. Se você instalar com `--ignore-scripts` (o default do repo para CI), `npm start` não vai funcionar até rodar `npm rebuild electron` ou um `npm install` completo uma vez.

---

## Setup do binário Flash

Os binários Flash PPAPI vêm **committed ao repositório** na raiz do projeto:

```
shinobi-launcher/
├── flash/
│   ├── pepflashplayer.dll          # plugin PPAPI Windows (34.0.0.376)
│   ├── libpepflashplayer.so        # plugin PPAPI Linux (34.0.0.137)
│   ├── manifest.json               # metadata de versão
│   ├── manifest-windows.json
│   └── manifest-linux.json
```

O auto-loader (`src/flash/plugin.js` → `findFlashPlugin()`) procura em seis caminhos em ordem (resources empacotados, diretório do exe, app path, cwd, `flash/` dev, e `userData/flash-cache/` para drop manual do usuário) e pega o primeiro binário maior que 1 MB. Se todos falharem, o launcher **não** auto-baixa — ele mostra um prompt de Flash faltando e o usuário precisa restaurar o binário manualmente. (O antigo `FlashUpdater` com auto-download foi removido na v1.0.1: Flash é EOL, os binários pinned já vêm committed no repo, e um auto-download adiciona superfície de ataque.)

Para substituir os binários (ex.: com um build diferente do Clean Flash), basta colocar o novo arquivo em `flash/` na raiz do projeto — mesmo nome, mesmo sufixo de plataforma. Veja **[FLASH_SETUP.md](FLASH_SETUP.md)** para o guia completo.

---

## Instalação

### A partir de uma release (usuários finais)

**Linux** — baixe o AppImage, dê permissão de execução, rode:
```bash
chmod +x ShinobiLauncher-*.AppImage
./ShinobiLauncher-*.AppImage
```
Ou use o script de instalação (detecta Arch/Ubuntu/Fedora e instala dependências Flash PPAPI se faltarem):
```bash
unzip naruto-online-linux.zip
chmod +x install.sh
./install.sh
```

**Windows** — baixe o `.zip` portátil, extraia, rode `ShinobiLauncher.exe`. Não precisa instalar.

### A partir do código (desenvolvedores)

```bash
git clone https://github.com/Chrispsz/naruto-online-launcher.git
cd naruto-online-launcher

# Instale (skip postinstall se você só precisa de lint/teste — binário Electron é ~180MB)
npm install            # ou: npm install --ignore-scripts

# Rode o launcher (requer o binário Electron, então use install completo)
npm start
```

---

## Desenvolvimento

```bash
npm run lint           # ESLint (flat config desabilitado — pinado em .eslintrc legacy)
npm run lint:fix       # ESLint com --fix
npm test               # Jest — 1101 testes em 37 suítes
npm run test:coverage  # Jest com relatório de cobertura
npm run format         # Prettier --write src/

# Constrói um preview HTML single-file para o dev server do Next.js
bash scripts/build-preview.sh
# → escreve /home/z/my-project/public/launcher.html (inlina CSS + JS)

# Empacota distribuíveis (requer install completo do electron)
npm run build          # AppImage (Linux) + portable EXE (Windows)
npm run build:linux    # só AppImage
npm run build:win      # só portable EXE
```

Veja **[CONTRIBUTING.md](CONTRIBUTING.md)** para o guia completo de contribuição e **[ARCHITECTURE.md](ARCHITECTURE.md)** para o mapa de módulos e fluxo de dados.

---

## Visão geral da arquitetura

O Shinobi Launcher é dividido em **13 módulos fonte** sob `src/`, cada um com responsabilidade única (a codebase passou por um split de god-objects na Fase 3 — todo "God Object" antigo foi quebrado em módulos focados com uma facade fina preservando a API antiga).

| # | Módulo | Caminho | Responsabilidade |
|---|--------|---------|------------------|
| 1 | UI (renderer) | `src/ui/` | `index.html`, `styles.css`, `variables.css`, `app.js` — vanilla JS, zero framework. Tema AMOLED preto + dourado shinobi. |
| 2 | UI Manager | `src/ui/manager/` | `ManagerWindow` (lifecycle), `IpcRouter` (handlers IPC), `StateBroadcaster` (push de estado para o renderer), `KeyboardShortcuts` (F5/F8/F12/Alt+F4). |
| 3 | App | `src/app/` | `Launcher` (lifecycle de janela+perfil), `SessionLifecycle` (hooks load/fail/crash + auto-login), `CpuOptimizer` (affinity/nice/oom_score), `GpuDetector` (NVIDIA/AMD/Intel), `StallDetector` (watchdog de falha SWF). |
| 4 | Profiles | `src/profiles/` | `store` (CRUD), `ProfileVault` (CRUD de credenciais criptografadas + builder do script de auto-login), `CryptoService` (AES-256-GCM + PBKDF2 puros), `PasswordManager` (derivação de chave de máquina), `partition` (nomes de partição), `manager` (orchestrator). |
| 5 | Network | `src/network/` | `blocker` (filtro de tracker/anúncio), `inspector` (painel devtools por perfil), `cookies` (cookies de sessão persistente), `tempmail` (registro de conta alt via mail.tm), `api-login` (pré-auth via API passport Oasgames). |
| 6 | Memory | `src/memory/` | `MemoryGuard` (monitor RSS + registry de webviews ativas), `GcDaemon` (GC em camadas: clearCache ocioso + process.gc + EmptyWorkingSet Windows). |
| 7 | Config | `src/config/` | `settings` (load/save config.json), `regions` (códigos de região válidos), `i18n` (tabelas EN + PT), `urls` (URLs do jogo por região/idioma/servidor), `hardware` (perfis CPU/GPU), `optimization` (presets performance/balanced/quality). |
| 8 | Utils | `src/utils/` | `logger` (wrapper electron-log), `diagnostics` (export logs+config .zip — nunca credenciais), `EventTimers` (lembretes + math de TZ), `jwt` (decode HS256 do loginKey). |
| 9 | Flash | `src/flash/` | `plugin` (findFlashPlugin + configureFlash), `mms` (gerador de mms.cfg para Modo Low-Spec). |
| 10 | Main | `src/main/` | `flags` (single source of truth dos switches de linha de comando Chromium), `debug` (helpers de debug mode). |
| 11 | Entry | `src/main.js` + `src/preload.js` | Bootstrap Electron: app.whenReady → applyAll flags → findFlashPlugin → createManagerWindow → start daemons. |
| 12 | Sub-views UI | `src/ui/loading/`, `src/ui/setup/` | `loading.html` (splash de boot, atualmente não usado pós-remoção do FlashUpdater), `setup.html` (wizard de primeiro boot, atualmente pulado — defaults são sensatos). |
| 13 | Controller UI | `src/ui/controller.js` + `src/ui/server-selector.js` + `src/ui/game-launcher.js` | Facades re-exportando o trio manager + lógica do dropdown de servidor + facade do Launcher. |

Veja **[ARCHITECTURE.md](ARCHITECTURE.md)** para o mergulho profundo (modelo de processos, fluxo IPC, fluxo de criptografia do vault, sequência de launch, gerenciamento de memória, event timers, e um diagrama em texto).

---

## Configuração

Toda configuração de runtime vive em `src/config/`:

| Arquivo | Propósito |
|---------|-----------|
| `settings.js` | Load/save `userData/config.json`. Valida region, hardwareProfile, language, optimizationPreset, forceLowSpec, mutedEvents, windowBounds. |
| `regions.js` | Códigos válidos de região do jogo (BR / NA / EU / HK) — a lista de idiomas do launcher (PT / EN / FR / DE / ES / PL) também vive aqui, usada pelo seletor de servidor. |
| `i18n.js` | Tabelas bilíngues de strings (Inglês + Português brasileiro). Toda string visível ao usuário tem ambas. |
| `urls.js` | Builder de URL do jogo por região/idioma/servidor. |
| `hardware.js` | Validação de perfil de hardware (auto / cpu / gpu). |
| `optimization.js` | Presets de otimização (performance / balanced / quality). |

Preferências do usuário são persistidas em `<userData>/config.json`. Credenciais são persistidas separadamente em `<userData>/vault.json` (criptografado) com o salt por instalação em `<userData>/vault.salt`.

---

## Segurança

- Credenciais criptografadas com **AES-256-GCM**. A chave de 256 bits é derivada de um seed de máquina (hostname + username + caminho do userData + `"shinobi-vault-v2"`) mais um salt aleatório de 32 bytes por instalação (armazenado em `vault.salt`) via **PBKDF2-SHA512, 100.000 iterações**.
- Backups com senha mestre usam **PBKDF2-SHA512, 200.000 iterações** (contagem de rounds diferente do KDF, então backups e o vault em disco não podem compartilhar chave derivada).
- Modelo de ameaça: protege contra leitura offline do `vault.json` em outra máquina ou outro usuário. Não protege contra atacante com acesso ao processo rodando.
- `--no-sandbox` é necessário para injeção do Flash PPAPI (limitação documentada do Chromium, não vulnerabilidade do launcher).
- Requisições de rede são filtradas por `network/blocker.js` — domínios conhecidos de rastreamento são bloqueados no nível WebRequest. Endpoints de API do jogo são explicitamente whitelisted.
- **Sem telemetria, sem crash reporter, sem auto-update phone-home.** Tudo fica local.
- Export de diagnósticos (Configurações → Avançado → Exportar .zip) inclui logs + config + info do sistema, **nunca credenciais**.

Veja **[SECURITY.md](SECURITY.md)** para a política completa e versões suportadas.

---

## Testes

<a name="testes"></a>

- **1101 testes em 37 suítes**, todos passando.
- Cobertura: crypto (AES-256-GCM + PBKDF2), CRUD do vault, profile store, session lifecycle, event timers + math de TZ, i18n, flags de otimização, network blocker, cookies, rate-limit do tempmail, memory guard, GC daemon, plugin loader, resolução de caminhos.
- Rode com `npm test` (ou `npm run test:coverage` para relatório de cobertura).
- Setup do Jest em `tests/setup.js` — mocka `electron` e `electron-log` para a suíte completa rodar sem binário Electron.

---

## Contribuindo

PRs são bem-vindos. Leia **[CONTRIBUTING.md](CONTRIBUTING.md)** primeiro. Regra de ouro: **lint tem que continuar limpo e os 1101 testes têm que passar** — sem regressões, sem exceções.

---

## Licença

MIT — livre para usar, modificar e distribuir. Veja **[LICENSE](LICENSE)**.

---

## Créditos

- **Autor:** Chrispsz ([@Chrispsz](https://github.com/Chrispsz))
- **Builds Flash PPAPI:** [darktohka/clean-flash-builds](https://github.com/darktohka/clean-flash-builds) — Clean Flash PPAPI 34.0.0.x
- **Comunidade:** a base de jogadores de Naruto Online BR/NA/EU/HK, pela validação dos horários de eventos
- **Não afiliado à Oasis Games.** "Naruto Online" é marca registrada de seus respectivos donos. Este launcher é uma ferramenta comunitária.

<div align="center">
<sub>Construído para a comunidade Naruto Online — Linux + Windows, apenas PC.</sub>
</div>
