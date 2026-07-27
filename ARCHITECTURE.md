# Architecture

> How Shinobi Launcher is structured, and how data flows between modules.
> See also: [README.md](README.md) for the user-facing overview, [FLASH_SETUP.md](FLASH_SETUP.md) for the PPAPI plugin loader.

---

## Overview

Shinobi Launcher is an Electron 11 app that hosts multiple isolated Naruto Online game sessions (one per profile) inside a single manager window. Each profile gets its own `persist:profile-<id>` session partition, its own encrypted credential entry in a machine-bound vault, and its own `BrowserWindow` opened on demand. The manager process owns the daemons (MemoryGuard, EventTimers) and the IPC router; game windows are isolated renderers that load the Flash PPAPI plugin.

The codebase is organized into eight domains under `src/` (map below), with a facade module preserving the legacy public API wherever a god-object was split (`controller.js`, `game-launcher.js`, `vault.js`, `guard.js`).

**Invariants maintained across all changes:**

- The renderer is a trusted local page (`nodeIntegration: true`, `contextIsolation: false`) — never loads remote content.
- All `setInterval`/`setTimeout` daemons call `.unref()` so quit isn't blocked; renderer intervals are cleared on `beforeunload`.
- Cache/storage is never cleared on a partition with an active Flash player (would blank the canvas).
- The vault key is machine-bound and never leaves the host; only encrypted blobs are written to disk.
- No network call is made by the launcher binary itself at runtime (no telemetry, no auto-updater); the only project-side network call is GitHub Actions on tag push.

---

## Module map

```text
src/
├── main.js                       App entry: app.whenReady() → boot sequence
├── preload.js                    Renderer bridge (contextBridge)
├── main/
│   ├── flags.js                  Chromium/Electron CLI flags (--no-sandbox, PPAPI, --expose-gc)
│   └── debug.js                  SHINOBI_DEBUG boot-time flag
├── ui/
│   ├── index.html                Manager window UI
│   ├── app.js                    Renderer controller
│   ├── controller.js             Facade over ManagerWindow/IpcRouter/StateBroadcaster
│   ├── game-launcher.js          Facade over Launcher/SessionLifecycle/KeyboardShortcuts
│   ├── server-selector.js        Region/cluster picker (cached)
│   ├── styles.css                AMOLED black + shinobi gold theme
│   ├── variables.css             CSS custom properties
│   ├── manager/
│   │   ├── ManagerWindow.js      Owns the launcher BrowserWindow (1000x760)
│   │   ├── IpcRouter.js          Single ipcMain handler registry
│   │   ├── StateBroadcaster.js   main→renderer push (30s tick + onChange)
│   │   └── KeyboardShortcuts.js  before-input-event: F5/F12/Alt+F4 etc.
│   ├── loading/loading.html      Short-lived Flash-provisioning window
│   └── setup/setup.html          First-boot wizard (currently skipped)
├── profiles/
│   ├── store.js                  Profile CRUD (JSON persistence)
│   ├── manager.js                ProfileManager facade
│   ├── partition.js              `persist:profile-<id>` name generator
│   ├── ProfileVault.js           Encrypted credential vault CRUD + auto-login script
│   ├── CryptoService.js          Pure AES-256-GCM + PBKDF2 primitives
│   ├── PasswordManager.js        Machine-bound key derivation
│   └── vault.js                  Facade over the three above
├── config/
│   ├── settings.js               config.json schema + validation
│   ├── regions.js                Region catalog (br/na/eu/hk)
│   ├── urls.js                   Game/login API endpoints per region
│   ├── i18n.js                   EN/PT string catalog
│   ├── hardware.js               RAM/GPU detection
│   └── optimization.js           CpuOptimizer + GpuDetector config
├── network/
│   ├── blocker.js                Tracker/ad domain deny-list (onBeforeRequest)
│   ├── cookies.js                Persistent cookie setup per partition
│   ├── tempmail.js               Disposable email alt-account creator
│   ├── api-login.js              passport.oasgames.com login + oas_user cookie
│   └── inspector.js              Dev-only network inspector
├── memory/
│   ├── MemoryGuard.js            RSS monitor + active webContents registry
│   └── guard.js                  Backward-compat alias for MemoryGuard (GcDaemon was removed pre-v1.0.0)
├── app/
│   ├── Launcher.js               Per-profile BrowserWindow factory + registry
│   ├── SessionLifecycle.js       did-finish-load/crash/close handlers + pre-auth
│   ├── StallDetector.js          SWF failure / 45s idle watchdog → auto-reload
│   ├── CpuOptimizer.js           Main-process CPU affinity (Linux)
│   ├── GpuDetector.js            GPU vendor/profile detection
│   └── Auditor.js                Network auditor (dev-only, F3)
├── flash/
│   ├── plugin.js                 findFlashPlugin() searches 6 paths
│   └── mms.js                    Flash mms.cfg configuration
└── utils/
    ├── logger.js                 electron-log wrapper
    ├── EventTimers.js            Multi-region event reminders + DST auto-detect
    ├── diagnostics.js            Diagnostics bundle export
    ├── jwt.js                    JWT decode + expiry
    └── throttle.js               Generic throttle helper
```

Each facade module (`controller.js`, `game-launcher.js`, `vault.js`, `guard.js`) preserves the public API of its underlying modules so callers don't change.

---

## Process model

Two Electron process types:

```text
┌────────────────────────────────────┐         ┌──────────────────────────────┐
│  MANAGER PROCESS  (src/main.js)    │  opens  │  GAME PROCESS  (per profile) │
│  single instance                   │ ──────► │  one BrowserWindow per Play │
│  ─ UI (renderer)                   │         │  ─ partition: persist:profile-<id>│
│  ─ IpcRouter + StateBroadcaster    │         │  ─ own cookies/cache/storage │
│  ─ MemoryGuard                     │         │  ─ Flash PPAPI plugin        │
│  ─ EventTimers                     │         │  ─ KeyboardShortcuts (F5/F12) │
└────────────────────────────────────┘         └──────────────────────────────┘
```

The manager is the only main process; game windows are separate `BrowserWindow`s with isolated session partitions (`persist:profile-<id>`), opened by `src/app/Launcher.js` when the user clicks **Play**. The "loading" window (`src/ui/loading/loading.html`) and "setup" window (`src/ui/setup/setup.html`) are short-lived `BrowserWindow`s owned by the manager — used only for Flash fallback and first-boot wizard.

---

## Boot sequence

`src/main.js` on `app.whenReady()`:

1. `flags.applyAll({ flashPath, flashVersion, hardwareProfile, forceLowSpec })` — appends `--no-sandbox`, `--always-authorize-plugins`, `--ppapi-flash-path`, `--ppapi-flash-version`, `--js-flags=--expose-gc --max-old-space-size=<N>`, feature flags, `disk-cache-size`.
2. `flashPath = flash.findFlashPlugin()` — searches 6 paths; returns `null` if all miss.
3. If `flashPath` → `flash.configureFlash(flashPath)`. Else: show Flash-missing prompt (no auto-download since v1.0.1).
4. `ManagerWindow.createManagerWindow({ onReady })` — loads `src/ui/index.html` into a 1000x760 `BrowserWindow`.
5. `IpcRouter.register()` — registers all `ipcMain` handlers.
6. `StateBroadcaster.startAutoRefresh()` — wires `store`/`vault`/`memory`/`event` listeners.
7. `EventTimers.startWithProfiles(store.getAll())`.
8. `CpuOptimizer.applyToMain()` — main-process affinity (Linux only).

Daemons (steps 6–7) all `unref()` their timers so they don't keep the process alive on quit.

---

## IPC flow

The renderer (`src/ui/app.js`) talks to the main process via `ipcRenderer` (renderer has `nodeIntegration: true`, `contextIsolation: false` — the UI is a trusted local page loaded from disk). On the main side, **`src/ui/manager/IpcRouter.js`** is the single registry of `ipcMain.on`/`ipcMain.handle`, grouped by domain:

| Channel prefix | Domain | Handlers |
|----------------|--------|----------|
| `profiles:*` | Profile CRUD | `list`, `create`, `update`, `delete`, `reorder` |
| `vault:*` | Credential vault | `set`, `get`, `has`, `remove`, `export`, `import` |
| `launch:*` | Game window lifecycle | `profile`, `close`, `focus` |
| `memory:*` | (no IPC channel) | Memory state is **push-only** via `StateBroadcaster.pushMemory` (30s tick + `MemoryGuard.onMemoryUpdate`/`onGC` onChange). The legacy `memory:gc` manual-force handler was removed with `GcDaemon` pre-v1.0.0. |
| `events:*` | Event timers | `upcoming`, `mute`, `set-remind-min`, `set-lang` |
| `tempmail:*` | Alt account | `create`, `status` |
| `inspector:*` | Devtools panel | `open`, `close`, `poll` |
| `config:*` | Settings | `get`, `set`, `reset`, `export-diagnostics` |

Each handler delegates to a domain module (`store`, `vault`, `Launcher`, `MemoryGuard`, `EventTimers`, `tempmail`, `inspector`, `settings`); IpcRouter holds no business logic.

```text
┌──────────────────────┐   ipcMain.handle/on   ┌──────────────────┐
│  Renderer            │ ────────────────────► │  IpcRouter       │
│  src/ui/app.js       │                       │  delegates to:   │
│  - renderProfiles()  │ ◄──────────────────── │  store / vault / │
│  - renderEvents()    │   webContents.send    │  Launcher / mg / │
│  - updateMemoryBar() │   (push)              │  et / tempmail / │
└──────────────────────┘                       │  inspector / cfg │
                                               └────────┬─────────┘
                                                        │
                       ┌────────────────────────────────┴────────┐
                       │  StateBroadcaster (30s tick + onChange)  │
                       │  pushProfiles/Memory/Events/All          │
                       └──────────────────────────────────────────┘
```

**`src/ui/manager/StateBroadcaster.js`** is the inverse direction (main → renderer push). It owns four push functions (`pushProfiles`, `pushMemory`, `pushEvents`, `pushAll`) and a periodic 30-second timer. It also subscribes to `store.onChange`, `MemoryGuard.onMemoryUpdate`, `MemoryGuard.onGC`, and `EventTimers.onRemind`, so changes push immediately, not only on the 30s tick.

**`src/ui/manager/KeyboardShortcuts.js`** attaches a `before-input-event` listener to each game window: F5 (clear login + pre-auth + reload), F12 (toggle DevTools), Alt+F4 (graceful close). F10 and Ctrl+Shift+I/J are blocked (force users to F12 instead of Chromium menu shortcuts). The legacy F8 (manual GC) binding was removed alongside `GcDaemon` pre-v1.0.0 — F8 is no longer intercepted.

---

## Vault crypto flow

Three-module split, each with a single responsibility:

- **`CryptoService.js`** — pure primitives. `encrypt(plaintext, key)`: random 12-byte IV → AES-256-GCM → returns `base64(iv || ciphertext || authTag)`. `decrypt(payload, key)` returns `''` on auth-tag failure (tamper is detected, never returns garbage). Constants: `PBKDF2_ITERATIONS=200000`, `PBKDF2_KEYLEN=32`, `PBKDF2_SALT_LEN=32`, `GCM_IV_LEN=12`.
- **`PasswordManager.js`** — machine-bound key derivation. `getMachineKey()` builds a seed from `os.hostname()` + `os.userInfo().username` + `app.getPath('userData')` + `'shinobi-vault-v2'`, then `pbkdf2Sync(seed, salt, 100000, 32, 'sha512')`. Salt is 32 random bytes persisted to `userData/vault.salt`. `deriveMasterKey(password, salt)` is used only for backup export/import (200,000 iterations).
- **`ProfileVault.js`** — CRUD on `vault.json`. `setCredentials(id, user, pass)` encrypts both fields with the machine key and persists via tmp-file + atomic rename (crash-safe). `getCredentials(id)` returns `{ user, pass }` or `null` on tag mismatch. Vault capped at 256 KB (`MAX_VAULT_BYTES`).

**Threat model:** protects against offline reading of `vault.json` on a different machine or under a different OS user. Does not protect against an attacker running inside the same process (the key is in memory while the launcher is running).

---

## Launch sequence

Renderer sends `launch:profile(profileId)` → IpcRouter → `Launcher.launchProfile(id)`:

1. `profile = store.get(id)`. If already in `gameWindows` Map → `window.show()` + `focus()`; return.
2. `partitionName = partition.getPartitionName(profile)` (`persist:profile-<id>` or shadow).
3. `ses = session.fromPartition(partitionName)`.
4. `setupBlocker(ses)` (network/blocker.js — idempotent per session).
5. `setupPersistentCookies(ses)` (network/cookies.js).
6. `win = new BrowserWindow({ webPreferences: { partition, plugins:true } })`.
7. `KeyboardShortcuts.attach(win, profile.name, ses, onClearLogin)`.
8. `MemoryGuard.registerGameWebContents(profileId, win.webContents)`.
9. `SessionLifecycle.attach(win, ses, profile, getGameUrl)`.
10. `SessionLifecycle._loadGameWithPreAuth(...)`: if `vault.hasCredentials(id)` → `apiLogin.loginAndInject(ses, user, pass)` POSTs to `passport.oasgames.com`, injects `oas_user` cookie, then `win.loadURL(gameUrl)`. Else `win.loadURL(gameUrl)` and form-injection auto-login runs on `did-finish-load`.
11. `gameWindows.set(profileId, { window, partitionName })`; `ManagerWindow.send('launch:opened', { profileId })`.

`SessionLifecycle` also attaches `did-finish-load` (CSS theme + FB-SDK mock + auto-login script), `did-fail-load`, `render-process-gone`, `unresponsive`, `will-navigate`, `new-window`, `close`, `closed`, `ready-to-show`.

**Crash / stall recovery.** `render-process-gone` with reason `oom` or `abnormal-exit` increments `crashCount[profileId]`; ≤3 in 10 min → `setTimeout(reloadWithPreAuth, 1500)`, else emits `launch:crash-loop`. Clean-exit and killed reasons are skipped. `StallDetector` watches `webRequest.onCompleted`/`onErrorOccurred` on the partition; 2+ SWF failures in 60s **or** 45s of no network activity while loading triggers `reloadWithPreAuth`. Self-disables after 120s of stable activity.

---

## Memory management

MemoryGuard was split out of the former `guard.js` god-object (the split also produced a `GcDaemon` companion, since removed — see historical note below):

**MemoryGuard (`src/memory/MemoryGuard.js`) — monitor + registry.** Samples `process.memoryUsage().rss` via `getStats()`. Maintains the registry of active game webContents (`registerGameWebContents`/`unregister`) — a low-cost observability hook that records which partitions currently host an active Flash player (clearing cache on a partition with an active Flash player causes a black canvas; the registry was originally consumed by `GcDaemon` to skip such partitions, but `GcDaemon` was removed pre-v1.0.0 as a useless optimization — see CHANGELOG entry for `94b587b` — and the registry is now self-standing). Two profiles: Normal (≥4 GB RAM, 5-min interval, 700 MB threshold, no preventive GC) and Low-Spec (<4 GB or forced, 2-min interval, 450 MB threshold, preventive GC every tick). Exposes `onMemoryUpdate(cb)` and `onGC(cb)`. Renderer-side `window.gc()` injection is a NO-OP since v4.9.1 — it paused Flash — but the registry is still populated.

> **Historical note.** The launcher previously shipped a companion `GcDaemon` (`src/memory/GcDaemon.js`) that ran periodic layered GC (idle-session cache clear → V8 major GC → Windows `EmptyWorkingSet`) and was bound to `F8` for manual invocation. It was removed pre-v1.0.0 (`commit 94b587b`) because the forced GC on the main process every 50 MB provided no measurable benefit and the cache-clear pass risked blanking active Flash canvases. The `F8` binding was removed alongside it — `F8` is no longer intercepted (Chromium's default F8 behavior applies).

---

## Event timers

`src/utils/EventTimers.js` is self-contained — no timezone library. DST is auto-detected by comparing the current `Date` UTC offset against the configured base offset for each region.

`start(activeRegions)` sets a 30-second `setInterval` (`.unref()`'d) running `checkAllRegions()`: for each region's events and hours, computes `nextOccurrenceMs(region, hour, days)`, then fires `showNotification` at `occ - remind*60s` and `showEndNotification` at `occ + durationMin*60s`. State is tracked in a `fired` Map (pruned when >500 entries). `onRemind(cb)` / `onEnd(cb)` listener registration lets `StateBroadcaster` push immediately.

**Region catalog** (`REGION_TZ`): 4 clusters, each with 11 events:

| Region | Timezone | Base UTC offset | DST |
|--------|----------|-----------------|-----|
| `br` | America/Sao_Paulo | -3 | none |
| `na` | America/New_York | -5 | -4 (DST) |
| `eu` | Europe/Berlin | +1 | +2 (DST) |
| `hk` | Asia/Hong_Kong | +8 | none |

Each event has bilingual `name_pt`/`name_en`, `days[]` (empty = daily), `hours[]` (server-time), `durationMin`, `category`, `remindMin` (globally overridable via `setRemindMin`). `startWithProfiles(profiles)` filters by `notificationsEnabled !== false`, deduplicates regions, and stays idle if no profile has notifications on. The StateBroadcaster's 30s push calls `EventTimers.getUpcoming(region)` to refresh the Events badge.
