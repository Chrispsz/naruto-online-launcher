<div align="center">

# 🥷 Shinobi Launcher — Naruto Online

**Um launcher multi-conta limpo e minimalista para Naruto Online.**
Contas isoladas • Cofre de credenciais criptografado • Otimizações reais de performance • Linux + Windows • Zero rastreamento

<!--VERSION:v5.24.0-->

[![Versão](https://img.shields.io/badge/versão-5.24.0-d4a543?style=flat-square)](https://github.com/Chrispsz/naruto-online-launcher/releases/latest)
[![Licença](https://img.shields.io/github/license/Chrispsz/naruto-online-launcher?style=flat-square)](LICENSE)
[![Testes](https://img.shields.io/badge/testes-1235%20passando-10b981?style=flat-square)](#testes)
[![Downloads](https://img.shields.io/github/downloads/Chrispsz/naruto-online-launcher/total?style=flat-square&color=dc2626)](https://github.com/Chrispsz/naruto-online-launcher/releases/latest)

**Idiomas:** [English](README.md) • [Português](README.pt-BR.md)

</div>

---

## ⚡ O que é

O Shinobi Launcher é um launcher desktop para o MMO de navegador **Naruto Online** (Oasgames). Ele envolve um runtime Chromium + Flash PPAPI customizado para você rodar várias contas lado a lado, salvar credenciais com segurança e ser avisado antes dos eventos começarem — tudo de uma única janela limpa, sem distrações.

> **Por que Electron 11?** Naruto Online ainda requer Flash PPAPI. Chromium moderno (≥88) e todos os runtimes Tauri/WebView2 removeram suporte a PPAPI. Electron 11.5 é a última versão com Pepper Flash funcionando — não há alternativa sem um rebuild completo de CEF.

---

## ✨ Funcionalidades

### Multi-conta, totalmente isolada
Cada conta ganha uma partição de sessão própria do Chromium (`persist:profile-<id>`). Cookies, localStorage, cache e service workers são 100% isolados — uma conta nunca toca na outra. Rode quantas contas sua RAM permitir, sem gerenciar cookies.

### Cofre de credenciais criptografado
Usuários e senhas são salvos localmente com criptografia **AES-256-GCM** amarrada a uma chave específica da máquina. Quando a sessão do jogo expira (sessões Oasgames duram ~2h), o launcher re-injeta as credenciais automaticamente — sem redigitar.

### Lembretes de eventos
11 eventos programados por região (BR / NA / EU / HK), cobrindo diários (Boss Mundial, Arena 3v3, Dungeon em Time, Escolta, Instância Ninja, Treinamento Ninja, Bond, Desafio Diário, Reset Diário) e semanais (Guerra de Clã, Arena de Guildas). Notificações desktop nativas disparam N minutos antes de cada evento começar.

### Otimizações reais de performance
- **Otimização inteligente** — sempre ativa. Aplica um conjunto curado de flags Chromium ajustadas para Flash PPAPI: sem throttling de background, sem hang monitor, sandbox desativada (necessário para PPAPI), cache de disco dimensionado à RAM.
- **Forçar renderização por CPU** — para GPUs com problema de driver. Adiciona `--disable-gpu` + `--use-gl=swiftshader` + `--num-raster-threads=<min(CPU_CORES,4)>`. Requer reinício.
- **Modo PC Fraco** — para PCs antigos ou <4GB RAM. Escreve `EnableHardwareAcceleration=0` + `AssetCacheSize=0` + `AutoUpdateDisable=1` no `mms.cfg` (config do Flash). Libera memória e descansa a GPU. Faz efeito na próxima abertura do jogo — sem reiniciar.

<details>
<summary><b>📋 Lista completa de flags de otimização</b></summary>

| Flag | Função | Real? |
|------|---------|-------|
| `--no-sandbox` | Necessário para injeção do Flash PPAPI | ✅ |
| `--disable-gpu-sandbox` | Mesmo que acima | ✅ |
| `--always-authorize-plugins` | Carregar Flash sem prompt do usuário | ✅ |
| `--disable-background-timer-throttling` | Manter timers do jogo precisos em background | ✅ |
| `--disable-renderer-backgrounding` | Não despriorizar renderer do jogo | ✅ |
| `--disable-hang-monitor` | Não matar loops longos do Flash | ✅ |
| `--ignore-gpu-blocklist` | Permitir GPU mesmo se blocklisted | ✅ |
| `--disable-gpu` (modo CPU apenas) | Forçar renderização por software | ✅ |
| `--use-gl=swiftshader` (modo CPU apenas) | Backend GL de software | ✅ |
| `--js-flags=--max-old-space-size=<N>` | Heap V8 dimensionado à RAM | ✅ |
| `EnableHardwareAcceleration=0` (mms.cfg, PC Fraco) | Desabilita HW accel do Flash | ✅ |
| `AssetCacheSize=0` (mms.cfg, PC Fraco) | Zera cache de assets do Flash → menos RAM | ✅ |

Removidos como placebo na auditoria v5.20.0: `StageQuality`, `OverrideFPS`, `FontSmoothingType`, `EnableSockets` (essas são propriedades AS3 ou params de embed HTML, **não** chaves do mms.cfg — o Flash ignora silenciosamente).
</details>

### Guardião de memória
Flash PPAPI + Chromium 87 tem vazamento de memória crônico — após 1-2h uma janela de jogo pode ultrapassar 1GB e travar. O daemon **MemoryGuard** amostra a RAM a cada 60s; quando uma janela passa de 700MB (configurável) ele dispara um GC de 3 camadas: JS `gc()` → `session.clearCache()` → trim de working-set do SO (Windows: `EmptyWorkingSet`). F8 manual também disponível.

### Auto-recuperação
Se o renderer de uma janela de jogo crashar (OOM, saída anormal), o launcher recarrega automaticamente após 1.5s — até 3 crashes por 10 minutos por perfil, depois para (proteção contra loop). Motivos não recuperáveis (clean-exit, killed) são ignorados.

---

## 📦 Instalação

### Linux
Baixe o AppImage da release mais recente, torne executável e rode:
```bash
chmod +x ShinobiLauncher-*.AppImage
./ShinobiLauncher-*.AppImage
```
Ou use o script de instalação (detecta Arch/Ubuntu/Fedora e instala dependências Flash PPAPI se faltar):
```bash
unzip naruto-online-linux.zip
chmod +x install.sh
./install.sh
```

### Windows
Baixe o `.zip` portátil, extraia e rode `ShinobiLauncher.exe` — sem instalação.

---

## ⌨️ Atalhos

| Tecla | Ação |
|-------|------|
| `Ctrl+N` | Nova conta |
| `F8` | Forçar limpeza de memória |
| `F5` | Limpar login da conta atual |
| `F11` | Tela cheia |
| `Ctrl+Shift+S` | Screenshot |
| `Ctrl+Shift+T` | Sempre no topo |
| `Ctrl++/−/0` | Zoom |

---

## 🛠️ Stack técnica

```
Shell:        Electron 11.5.0 (último com PPAPI Flash)
Flash:        Clean Flash PPAPI 34.0 (fork darktohka)
Runtime:      Node.js (main process) + Electron APIs
UI:           HTML/CSS/JS puro (zero framework)
Multi-conta:  Partitions de sessão do Chromium
GC de memória:3 camadas (JS + session + OS working set)
Cripto:       AES-256-GCM + chave amarrada à máquina
Build:        electron-builder → AppImage + Portable EXE
CI/CD:        GitHub Actions (lint + test + build + release)
Testes:       Jest (1235 testes, 38 suites)
```

---

## 🧩 Estrutura do projeto

```
shinobi-launcher/
├── src/
│   ├── main.js              # Entry point do Electron
│   ├── preload.js           # Bridge IPC com context isolation
│   ├── app/
│   │   ├── Launcher.js          # Ciclo de vida da janela + perfil
│   │   ├── SessionLifecycle.js  # Hooks de evento (load/fail/crash/auto-login)
│   │   ├── CpuOptimizer.js      # Afinidade de núcleo para Flash single-thread
│   │   ├── GpuDetector.js       # Detecção de GPU + env vars
│   │   ├── FlashUpdater.js      # Download PPAPI on-demand
│   │   └── StallDetector.js     # Auto-F5 quando SWF falha
│   ├── config/              # i18n, regiões, URLs, presets de otimização
│   ├── flash/               # Geração do mms.cfg + loader de plugin
│   ├── main/                # Flags Chromium (fonte única de verdade)
│   ├── memory/              # MemoryGuard + GcDaemon
│   ├── network/             # Cookies, bloqueador de trackers, login API, tempmail
│   ├── profiles/            # CRUD + cofre criptografado + script de auto-login
│   ├── ui/                  # index.html + styles.css + app.js + variables.css
│   └── utils/               # Logger, EventTimers, helpers
├── linux/                   # install.sh + .desktop + run.sh
├── assets/                  # icon.ico + icon.png
├── tools/                   # network-monitor.js (debug)
├── scripts/                 # build-preview.sh + helpers de debug
├── docs/                    # ARCHITECTURE, OPTIMIZATIONS, AUTO-LOGIN
├── tests/                   # Setup Jest + testes de integração
└── .github/workflows/       # build-release.yml
```

Veja **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** para o mapa completo de módulos e fluxo de dados.

---

## 🔧 Desenvolvimento

```bash
# Clonar
git clone https://github.com/Chrispsz/naruto-online-launcher.git
cd naruto-online-launcher

# Instalar (pular postinstall — binário Electron não é necessário para lint/test)
npm install --ignore-scripts

# Rodar
npm start

# Lint
npm run lint

# Testes
npm test
```

Requer Node.js ≥16. Veja **[CONTRIBUTING.md](CONTRIBUTING.md)** para o guia completo de contribuição.

---

## 🧪 Testes

<a name="testes"></a>

- **1235 testes em 38 suites**, todos passando.
- Cobertura: cripto, cofre, CRUD de perfil, lifecycle de sessão, timers de eventos, i18n, otimização, bloqueador de rede, cookies, guardião de memória.
- Rode com `npm test` (ou `npm run test:coverage` para relatório de cobertura).

---

## 🔒 Segurança

- Credenciais criptografadas com **AES-256-GCM**, chave derivada de um identificador amarrado à máquina (não portável entre máquinas — um arquivo de cofre roubado é inútil).
- `--no-sandbox` é necessário para injeção do Flash PPAPI (limitação documentada do Chromium, não vulnerabilidade do launcher).
- Requisições de rede são filtradas por `network/blocker.js` — domínios de tracker conhecidos são bloqueados no nível WebRequest.
- **Sem telemetria, sem crash reporter, sem auto-update phone-home.** Tudo fica local.
- Exportação de diagnóstico (Configurações → Avançado → Exportar .zip) inclui logs + config + info do sistema, **nunca credenciais**.

Veja **[SECURITY.md](SECURITY.md)** para a política completa e versões suportadas.

---

## 🗺️ Roadmap

Veja **[docs/ROADMAP.md](docs/ROADMAP.md)** para funcionalidades planejadas. Foco atual:

- Reordenação de perfis por drag-and-drop
- Filtros de eventos customizados por perfil
- Galeria de screenshots in-game
- Caminho de renderização nativa Wayland no Linux

---

## 📜 Licença

MIT — livre para usar, modificar e distribuir. ⭐ Deixe uma star se ajudar!

<div align="center">
<sub>Feito com 🥷 para a comunidade Naruto Online • Sem afiliação com Oasis Games</sub>
</div>
