<div align="center">

<img src="assets/icon.png" width="120" alt="Shinobi Launcher" />

# Shinobi Launcher

**Privacy-first multi-account launcher for Naruto Online**

Encrypted vault · Isolated sessions · GPU/CPU tuning · Zero tracking · Linux + Windows

<br />

[![Version](https://img.shields.io/badge/version-1.4.0-d4a543?style=flat-square)](https://github.com/Chrispsz/naruto-online-launcher/releases/latest)
[![CI](https://github.com/Chrispsz/naruto-online-launcher/actions/workflows/ci.yml/badge.svg)](https://github.com/Chrispsz/naruto-online-launcher/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/Chrispsz/naruto-online-launcher?style=flat-square)](LICENSE)
[![Downloads](https://img.shields.io/github/downloads/Chrispsz/naruto-online-launcher/total?style=flat-square&color=6e7681)](https://github.com/Chrispsz/naruto-online-launcher/releases/latest)
[![Electron](https://img.shields.io/badge/electron-11.5.0-47848f?style=flat-square)](#-architecture)
[![Platforms](https://img.shields.io/badge/platform-Linux%20%7C%20Windows-6e7681?style=flat-square)](#-install)

</div>

Shinobi Launcher is a desktop launcher for the browser MMO **Naruto Online** (Oasgames). It wraps a custom Chromium + Flash PPAPI runtime so you can run multiple accounts side by side, keep credentials in an encrypted vault, and get notified before in-game events fire — all from one distraction-free window. The UI is AMOLED pure black (`#000000`) with shinobi gold (`#d4a543`) accents, built for long sessions. No telemetry, no crash reporter, no phone-home — everything stays on your machine.

> Naruto Online still requires Flash PPAPI. Modern Chromium (≥88) and Tauri/WebView2 dropped PPAPI — **Electron 11.5 is the last runtime with working Pepper Flash**. The launcher exists precisely so the remaining community can keep playing.

---

## ✨ Features

| | Feature | What it does |
|---|---|---|
| 🥷 | **Isolated multi-account** | Each account gets its own `persist:profile-<id>` session partition — cookies, localStorage, cache and SWs never cross accounts. |
| 🔐 | **AES-256 encrypted vault** | Credentials stored with AES-256-GCM; key derived from a machine-bound seed via PBKDF2-SHA512 (100k rounds). A stolen `vault.json` is useless on any other machine. |
| ⚡ | **GPU / CPU optimization** | Curated Chromium flags for Flash PPAPI, plus Force-CPU and Modo Low-Spec profiles, CPU affinity pinning and `oom_score_adj` tuning. |
| 🛡️ | **Stall auto-recovery** | Renderer crashes auto-reload (3/10 min per profile); a `StallDetector` watches SWF failures and zero-network stalls, then triggers `reloadWithPreAuth`. |
| ⏰ | **Multi-region event timers** | 11 events × 4 regions (BR · NA · EU · HK), native desktop notifications N minutes before start, DST auto-detected, bilingual names. |
| 📧 | **Temp email for alts** | One-click mail.tm inbox + Oasgames passport registration; captures the 2h JWT login key automatically (5 accounts/hour cap). |
| 🚫 | **Tracker blocker** | `network/blocker.js` filters Google Analytics, DoubleClick, Facebook pixels and Oasgames analytics at the WebRequest layer — game APIs whitelisted. |
| 🌐 | **Bilingual EN + PT-BR** | Every user-facing string ships in both English and Brazilian Portuguese; toggle persists to `config.json`. |

---

## 📦 Install

Grab the latest build from the [**Releases**](https://github.com/Chrispsz/naruto-online-launcher/releases/latest) page.

**Linux** — AppImage or installer script:

```bash
# Option A: AppImage
chmod +x ShinobiLauncher-*.AppImage
./ShinobiLauncher-*.AppImage

# Option B: installer (detects Arch/Ubuntu/Fedora, installs Flash deps if missing)
unzip naruto-online-linux.zip
chmod +x install.sh
./install.sh
```

**Windows** — download the portable `.zip`, extract, run `NarutoOnline.exe`. No installation required.

---

## ⌨️ Keyboard shortcuts

| Key | Action |
|---|---|
| `F5` | Clear current account's login (cookies + storage, then pre-auth via API and reload) |
| `F6` | Switch region |
| `F7` | Switch hardware profile (auto / cpu / gpu) |
| `F11` | Fullscreen |
| `Ctrl+N` | New account |
| `Ctrl+Shift+S` | Screenshot |
| `Ctrl+Shift+T` | Always on top |
| `Alt+1` … `Alt+9` | Quick-launch profile 1–9 |

---

## 🏗️ Architecture

Single-responsibility modules under `src/`, no god objects — each subsystem has a thin facade preserving the public API.

```
src/
├── main.js              # Electron bootstrap: ready → flags → flash → window → daemons
├── preload.js           # contextBridge: window.narutoLauncher API
├── app/                 # Launcher · SessionLifecycle · CpuOptimizer · GpuDetector · StallDetector
├── config/              # settings · regions · i18n · urls · hardware · optimization
├── flash/               # plugin (findFlashPlugin) · mms (Low-Spec mms.cfg generator)
├── network/             # blocker · inspector · cookies · tempmail · api-login
├── profiles/            # store · ProfileVault · CryptoService · PasswordManager · partition
├── memory/              # MemoryGuard (RSS monitor + active-webContents registry)
├── ui/                  # index.html · styles.css · app.js · manager/ · controller facades
└── utils/               # logger · diagnostics · EventTimers · jwt
```

Full deep-dive (process model, IPC flow, vault crypto, launch sequence) → **[ARCHITECTURE.md](ARCHITECTURE.md)**.

---

## 🔒 Security

- **AES-256-GCM** for credentials; key derived from a machine-bound seed + 32-byte per-installation salt via **PBKDF2-SHA512, 100k iterations**. Master-password backups use **200k iterations** so derived keys can't be shared.
- `contextIsolation: true` + `nodeIntegration: false` + a hardened `preload.js` exposing only the `narutoLauncher` bridge.
- Threat model: protects against offline reading of `vault.json` on a different machine or under a different user.
- `--no-sandbox` is required for PPAPI Flash injection (documented Chromium limitation, not a launcher vulnerability).
- **No telemetry, no crash reporter, no auto-update phone-home.** Flash binaries are committed to the repo for reproducible builds — see **[FLASH_SETUP.md](FLASH_SETUP.md)**.

Full policy and supported versions → **[SECURITY.md](SECURITY.md)**.

---

## 🛠️ Development

```bash
npm install --ignore-scripts   # skip the ~180MB Electron binary if you only lint
npm run lint                   # ESLint (legacy config pinned via ESLINT_USE_FLAT_CONFIG=false)
```

Contributions welcome — see **[CONTRIBUTING.md](CONTRIBUTING.md)**. Golden rule: lint stays clean.

---

## 📚 Documentation

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — module map, process model, IPC and crypto flows
- **[FLASH_SETUP.md](FLASH_SETUP.md)** — PPAPI binaries, replacement, multi-platform notes
- **[ROADMAP.md](ROADMAP.md)** — what's next
- **[CHANGELOG.md](CHANGELOG.md)** — release history
- **[SECURITY.md](SECURITY.md)** — threat model and supported versions
- **[CONTRIBUTING.md](CONTRIBUTING.md)** — dev setup, conventions, PR checklist

---

## 🌍 Regions

🇧🇷 **BR** · 🇺🇸 **NA** · 🇫🇷🇩🇪🇪🇸🇵🇱 **EU** · 🇭🇰 **HK** — eleven scheduled events per region, native notifications, DST-aware.

---

## 💎 Credits

- **Flash PPAPI builds** — [darktohka/clean-flash-builds](https://github.com/darktohka/clean-flash-builds) (Clean Flash 34.0.0.x)
- **Naruto Online community** — BR / NA / EU / HK players, for validating event schedules
- Not affiliated with Oasis Games. "Naruto Online" is a trademark of its respective owners.

---

## 📄 License

MIT — free to use, modify and distribute. See **[LICENSE](LICENSE)**.

<div align="center">
<sub>Built for the Naruto Online community — Linux + Windows, PC-only.</sub>
</div>

---

<details>
<summary>🇧🇷 Português (BR)</summary>

O **Shinobi Launcher** é um launcher desktop para o MMO de navegador **Naruto Online** (Oasgames). Ele envolve um runtime Chromium + Flash PPAPI customizado para você rodar várias contas lado a lado, guardar credenciais em um cofre criptografado e ser avisado antes dos eventos começarem — tudo de uma única janela limpa. A interface é AMOLED preto puro (`#000000`) com detalhes em dourado shinobi (`#d4a543`), feita para sessões longas. Sem telemetria, sem crash reporter, sem phone-home — tudo fica na sua máquina.

**Principais funcionalidades:**

- 🥷 Multi-conta totalmente isolada (partições `persist:profile-<id>`)
- 🔐 Cofre AES-256-GCM com chave derivada por PBKDF2-SHA512 (100k iterações)
- ⚡ Otimização de GPU/CPU — flags Chromium, Modo Low-Spec, afinidade de CPU
- 🛡️ Auto-recuperação de stall — reloader de renderer + `StallDetector` de SWF
- ⏰ Timer de eventos multi-região (BR · NA · EU · HK), 11 eventos por região
- 📧 Email temporário via mail.tm para criar alts em um clique
- 🚫 Bloqueador de trackers (GA, DoubleClick, Facebook, Oasgames)
- 🌐 UI bilíngue EN + PT-BR

**Instalação (Linux):**

```bash
# AppImage
chmod +x ShinobiLauncher-*.AppImage
./ShinobiLauncher-*.AppImage

# ou installer script (detecta Arch/Ubuntu/Fedora)
unzip naruto-online-linux.zip
chmod +x install.sh
./install.sh
```

**Windows:** baixe o `.zip` portátil, extraia, rode `NarutoOnline.exe`.

**Atalhos de teclado:** a tabela em inglês acima é a referência canônica (F5 limpa login, F6 troca região, F7 troca perfil de hardware, F11 tela cheia, Ctrl+N nova conta, Ctrl+Shift+S screenshot, Ctrl+Shift+T sempre visível, Alt+1..9 quick-launch).

**Documentação completa:** [ARCHITECTURE.md](ARCHITECTURE.md) · [FLASH_SETUP.md](FLASH_SETUP.md) · [ROADMAP.md](ROADMAP.md) · [CHANGELOG.md](CHANGELOG.md) · [SECURITY.md](SECURITY.md) · [CONTRIBUTING.md](CONTRIBUTING.md).

</details>
