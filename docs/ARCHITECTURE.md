# Architecture

> How Shinobi Launcher is structured, and how data flows between modules.

## Process model

Shinobi Launcher runs **two Electron processes**:

1. **Manager process** (main) — the launcher window itself. Hosts the UI (`src/ui/`), handles IPC, manages profiles, runs the MemoryGuard daemon.
2. **Game process** (per profile) — a separate `BrowserWindow` with its own session partition (`persist:profile-<id>`), opened when you click **Play**. Each game window is fully isolated from the others.

```
┌─────────────────────────────────────────────────────────┐
│  Manager Process (main.js)                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  UI (app.js) │  │  IpcRouter   │  │ MemoryGuard  │   │
│  │  index.html  │←→│  (handlers)  │  │  (daemon)    │   │
│  └──────────────┘  └──────┬───────┘  └──────────────┘   │
│                           │                              │
│         ┌─────────────────┼─────────────────┐            │
│         │                 │                 │            │
│    ┌────▼────┐      ┌─────▼─────┐     ┌─────▼─────┐     │
│    │ profiles│      │  config   │     │  network  │     │
│    │ (vault) │      │ (i18n,…)  │     │ (blocker) │     │
│    └────┬────┘      └───────────┘     └───────────┘     │
└─────────┼────────────────────────────────────────────────┘
          │  BrowserWindow({ partition: persist:profile-<id> })
          ▼
┌─────────────────────────────────────────────────────────┐
│  Game Process (per profile)                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  Flash PPAPI │  │ SessionLife- │  │  StallDetec- │   │
│  │  (plugin)    │  │ cycle (hooks)│  │  tor (auto-F5)│  │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## Module map

### `src/app/` — Application logic
| File | Responsibility |
|------|---------------|
| `Launcher.js` | Opens/closes game windows, manages the `gameWindows` Map |
| `SessionLifecycle.js` | Attaches event hooks: `did-finish-load`, `did-fail-load`, `render-process-gone`, `will-navigate`, `new-window`, `unresponsive`, `close`. Runs auto-login on each page load. |
| `CpuOptimizer.js` | Sets CPU core affinity for single-threaded Flash (pins to one P-core to reduce context switches) |
| `GpuDetector.js` | Detects GPU vendor (NVIDIA/AMD/Intel) and returns env vars for the GPU process |
| `FlashUpdater.js` | On-demand download of Clean Flash PPAPI 34 if missing |
| `StallDetector.js` | Watches WebRequest events; auto-reloads if essential SWFs fail to load |

### `src/config/` — Configuration
| File | Responsibility |
|------|---------------|
| `i18n.js` | Bilingual dictionary (EN + PT) + `t()` / `tl()` / `getAll()` |
| `regions.js` | 4 game regions: BR, NA, EU, HK (each with display name + server range) |
| `urls.js` | Game URLs per region (login page, server list, game embed) |
| `optimization.js` | Preset definitions (kept for backwards compat; UI uses toggles now) |
| `settings.js` | Default config + persistence (`config.json`) |
| `hardware.js` | Hardware profile detection (modern / legacy / cpu) |

### `src/flash/` — Flash plugin
| File | Responsibility |
|------|---------------|
| `mms.js` | Generates `mms.cfg` (Flash config) — real keys only (see [OPTIMIZATIONS.md](OPTIMIZATIONS.md)) |
| `plugin.js` | Locates the PPAPI plugin path across platforms |

### `src/main/` — Chromium flags
| File | Responsibility |
|------|---------------|
| `flags.js` | **Single source of truth** for all Chromium command-line switches. Called once at boot before `app.whenReady()`. |
| `debug.js` | Dev-only debug helpers |

### `src/memory/` — Memory management
| File | Responsibility |
|------|---------------|
| `MemoryGuard.js` | Daemon sampling RAM every 60s per game window |
| `GcDaemon.js` | 3-layer GC execution (JS gc → session.clearCache → OS working-set trim) |
| `guard.js` | Public facade |

### `src/network/` — Network layer
| File | Responsibility |
|------|---------------|
| `blocker.js` | WebRequest filter blocking known tracker/ad domains |
| `cookies.js` | Cookie isolation + cleanup per session partition |
| `api-login.js` | OAuth-style login via Oasgames API (faster than form injection) |
| `tempmail.js` | Temporary email creation (mail.tm) for dev auto-account creation |
| `inspector.js` | DevTools inspection bridge (dev-only) |

### `src/profiles/` — Profile management
| File | Responsibility |
|------|---------------|
| `manager.js` | Public profile API: create, list, update, delete, launch |
| `store.js` | `profiles.json` persistence + schema validation |
| `partition.js` | Session partition name generation + cleanup |
| `ProfileVault.js` | Encrypted credential storage + **auto-login script builder** (see [AUTO-LOGIN.md](AUTO-LOGIN.md)) |
| `CryptoService.js` | AES-256-GCM encrypt/decrypt + machine-bound key derivation |
| `vault.js` | Public facade for ProfileVault |
| `PasswordManager.js` | Legacy password import/export (backup flow) |

### `src/ui/` — User interface
| File | Responsibility |
|------|---------------|
| `index.html` | Main launcher window markup (sidebar + topbar + 3 views + 2 modals) |
| `styles.css` | All styles (1700 lines, vanilla CSS, no preprocessor) |
| `variables.css` | Design tokens (colors, spacing, typography, radii, transitions) |
| `app.js` | All UI logic: rendering, IPC, events, modals, i18n application |
| `manager/IpcRouter.js` | IPC handler registry (manager side) |
| `manager/ManagerWindow.js` | Manager window factory |
| `manager/KeyboardShortcuts.js` | Global key bindings (Ctrl+N, F8, F11, etc.) |
| `controller.js`, `game-launcher.js`, `server-selector.js` | Small UI helpers |

### `src/utils/` — Shared utilities
| File | Responsibility |
|------|---------------|
| `logger.js` | Leveled logger (debug/info/warn/error) with file rotation |
| `EventTimers.js` | Event schedule per region + next-fire calculation + reminder scheduling |

## Data flow: launching a game

```
User clicks "Play"
        │
        ▼
app.js → ipcRenderer.invoke('profile:launch', id)
        │
        ▼
IpcRouter → manager.launch(id)
        │
        ▼
Launcher.launch(profile)
  ├─ creates BrowserWindow({ partition: persist:profile-<id> })
  ├─ SessionLifecycle.attach(win, ctx)
  │    ├─ did-finish-load → injects FB mock + runs auto-login
  │    ├─ render-process-gone → auto-reload (max 3/10min)
  │    └─ will-navigate → intercepts Oasgames redirects
  ├─ MemoryGuard.watch(win)
  └─ StallDetector.attach(win)
        │
        ▼
Game window loads → Flash PPAPI renders → user plays
```

## Data flow: auto-login

See **[AUTO-LOGIN.md](AUTO-LOGIN.md)** for the full flow.

## Configuration files (user data)

| Path | Content |
|------|---------|
| `~/.shinobi-launcher/config.json` | Launcher config (language, region, toggles) |
| `~/.shinobi-launcher/profiles.json` | Profile list (name, region, server, lastPlayed) |
| `~/.shinobi-launcher/vault.json` | Encrypted credentials (AES-256-GCM) |
| `~/.shinobi-launcher/logs/` | Rotated log files |
| `~/AppData/Roaming/Macromedia/Flash Player/mms.cfg` (Win) / `~/.macromedia/Flash_Player/mms.cfg` (Linux) | Flash config (generated by `mms.js`) |

## Testing

- **Unit tests**: `src/**/__tests__/*.test.js` — 1235 tests, 38 suites.
- **Integration tests**: `tests/` — end-to-end profile lifecycle.
- Run: `npm test` (or `npm run test:coverage`).
