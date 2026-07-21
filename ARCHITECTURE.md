# Architecture

> How Shinobi Launcher is structured, and how data flows between modules.
>
> See also: [README.md](README.md) for the user-facing overview, [FLASH_SETUP.md](FLASH_SETUP.md) for the PPAPI plugin loader.

---

# English

## Process model

Shinobi Launcher runs **two kinds of Electron processes**:

1. **Manager process** (the main process, started by `src/main.js`) — the launcher window itself. Hosts the UI (`src/ui/index.html` + `app.js`), handles IPC, manages profiles, runs the MemoryGuard + GcDaemon + EventTimers daemons. There is exactly one of these per running launcher.
2. **Game process** (per profile, opened by `src/app/Launcher.js`) — a separate `BrowserWindow` with its own session partition (`persist:profile-<id>`), opened when the user clicks **Play**. Each game window is fully isolated from the others: cookies, localStorage, cache, service workers, and the network blocker are all per-partition. The Flash PPAPI plugin runs inside this renderer process.

There is no third process type. The "loading" window (`src/ui/loading/loading.html`) and the "setup" window (`src/ui/setup/setup.html`) are both `BrowserWindow`s owned by the manager process — they are short-lived and used only during Flash fallback download (loading) and first-boot wizard (setup, currently skipped).

### Boot sequence

`src/main.js` runs the following sequence on `app.whenReady()`:

```
app.whenReady()
   │
   1. flags.applyAll({ flashPath, flashVersion, hardwareProfile, forceBatata })
   │     └─ appends --no-sandbox, --always-authorize-plugins, --ppapi-flash-path,
   │        --ppapi-flash-version, --js-flags=--expose-gc --max-old-space-size=<N>,
   │        --disable-features=..., --enable-features=..., disk-cache-size, etc.
   │
   2. flashPath = flash.findFlashPlugin()
   │     └─ searches 6 paths (see FLASH_SETUP.md); returns null if all miss
   │
   3. if (flashPath) flash.configureFlash(flashPath)
      else show Flash-missing prompt (no auto-download since v1.0.1)
   │
   4. ManagerWindow.createManagerWindow({ onReady: ... })
   │     └─ loads src/ui/index.html into a 1000x760 BrowserWindow
   │
   5. IpcRouter.register()           — registers all ipcMain handlers
   6. StateBroadcaster.startAutoRefresh()  — wires store/vault/memory/event listeners
   7. EventTimers.startWithProfiles(store.getAll())
   8. GcDaemon.start()                — interval = MemoryGuard.getIntervalMs()
   9. CpuOptimizer.applyToMain()      — main-process affinity (Linux only)
```

The daemons (steps 6-8) all `unref()` their timers so they don't keep the process alive on quit.

---

## IPC flow

The renderer (`src/ui/app.js`) talks to the main process via the `ipcRenderer` module (the renderer has `nodeIntegration: true` and `contextIsolation: false` — the UI is a trusted local page that loads only `index.html` from disk, so the bridge is direct).

On the main-process side, **`src/ui/manager/IpcRouter.js`** is the single registry of `ipcMain.on` / `ipcMain.handle` handlers. It groups them by domain:

| Channel prefix | Domain | Handlers |
|----------------|--------|----------|
| `profiles:*` | Profile CRUD | `profiles:list`, `profiles:create`, `profiles:update`, `profiles:delete`, `profiles:reorder` |
| `vault:*` | Credential vault | `vault:set`, `vault:get`, `vault:has`, `vault:remove`, `vault:export`, `vault:import` |
| `launch:*` | Game window lifecycle | `launch:profile`, `launch:close`, `launch:focus` |
| `memory:*` | Memory state | `memory:stats`, `memory:gc` (manual F8), `memory:set-threshold` |
| `events:*` | Event timers | `events:upcoming`, `events:mute`, `events:set-remind-min`, `events:set-lang` |
| `tempmail:*` | Alt account | `tempmail:create`, `tempmail:status` |
| `inspector:*` | Devtools panel | `inspector:open`, `inspector:close`, `inspector:poll` |
| `config:*` | Settings | `config:get`, `config:set`, `config:reset`, `config:export-diagnostics` |

Each handler delegates to a domain module (`store`, `vault`, `Launcher`, `MemoryGuard`, `EventTimers`, `tempmail`, `inspector`, `settings`) — IpcRouter itself holds no business logic.

**`src/ui/manager/StateBroadcaster.js`** is the inverse direction: main → renderer pushes. It owns four push functions (`pushProfiles`, `pushMemory`, `pushEvents`, `pushAll`) and a periodic 30-second timer that refreshes the renderer's memory + event badges. It also subscribes to event emitters from `store.onChange`, `MemoryGuard.onMemoryUpdate`, `MemoryGuard.onGC`, and `EventTimers.onRemind` so changes are pushed immediately, not just on the 30s tick.

```
┌─────────────────────────────┐       ipcMain.handle / ipcMain.on        ┌─────────────────────┐
│  Renderer (src/ui/app.js)   │ ───────────────────────────────────────► │   IpcRouter         │
│                             │                                          │  (handlers, 1:1)    │
│  - renderProfiles()         │ ◄─────────────────────────────────────── │   delegates to:     │
│  - renderEvents()           │       webContents.send (push)            │   store / vault /   │
│  - updateMemoryBar()        │                                          │   Launcher / mg /   │
└─────────────────────────────┘                                          │   et / tempmail /   │
                                                                         │   inspector / cfg   │
                                                                         └──────────┬──────────┘
                                                                                    │
                                          ┌─────────────────────────────────────────┴─────┐
                                          │  StateBroadcaster (push, periodic 30s + onChange)│
                                          │  - pushProfiles()  → store.getAll() + vault      │
                                          │  - pushMemory()    → MemoryGuard.getStats()      │
                                          │  - pushEvents()    → EventTimers.getUpcoming()   │
                                          └─────────────────────────────────────────────────┘
```

**`src/ui/manager/KeyboardShortcuts.js`** attaches a `before-input-event` listener to each game window's `webContents`. It intercepts F5 (clear login + pre-auth + reload), F8 (manual GC), F12 (toggle DevTools), Alt+F4 (graceful close), and blocks F10 + Ctrl+Shift+I/J (so users have to use F12 instead of Chromium's menu shortcuts).

---

## Profile vault security flow

The credential vault is a three-module split (Phase 3e). Each module has a single responsibility:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  src/profiles/ProfileVault.js   (CRUD + auto-login script)                   │
│  ──────────────────────────────────────────                                  │
│   setCredentials(profileId, user, pass):                                     │
│     1. _ensureLoaded()              — load vault.json from userData          │
│     2. _encryptWithMachineKey(user) ─► CryptoService.encrypt(plaintext, key) │
│     3. _encryptWithMachineKey(pass) ─► CryptoService.encrypt(plaintext, key) │
│     4. _store[profileId] = { user, pass, updatedAt }                         │
│     5. _persist()                   — atomic write (tmp + rename)            │
│                                                                              │
│   getCredentials(profileId):                                                 │
│     1. _ensureLoaded()                                                        │
│     2. _decryptWithMachineKey(entry.user)  → CryptoService.decrypt(payload)  │
│     3. _decryptWithMachineKey(entry.pass)  → CryptoService.decrypt(payload)  │
│     4. return { user, pass } (or null on tag-mismatch — key changed/tamper)  │
└──────────────────────────────────┬───────────────────────────────────────────┘
                                   │  uses key
                                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  src/profiles/PasswordManager.js   (machine-bound key derivation)            │
│  ──────────────────────────────────────────────                              │
│   getMachineKey():                                                           │
│     1. machineSeed = os.hostname() + '|' + os.userInfo().username + '|'      │
│                     + app.getPath('userData') + '|shinobi-vault-v2'          │
│     2. salt = getSalt()  — 32-byte random, persisted to userData/vault.salt  │
│     3. key = pbkdf2Sync(machineSeed, salt, 100000, 32, 'sha512')             │
│     4. cache in _cachedKey; return key                                       │
│                                                                              │
│   deriveMasterKey(password, salt):  — for backup export/import only          │
│     return CryptoService.deriveKey(password, salt)   // 200,000 iterations   │
└──────────────────────────────────┬───────────────────────────────────────────┘
                                   │  uses primitives
                                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  src/profiles/CryptoService.js   (pure crypto primitives)                    │
│  ─────────────────────────────────────────────                              │
│   encrypt(plaintext, key):                                                   │
│     iv = randomBytes(12)                                                     │
│     cipher = createCipheriv('aes-256-gcm', key, iv)                          │
│     ct = cipher.update(plaintext) + cipher.final()                           │
│     tag = cipher.getAuthTag()                                                │
│     return base64(iv || ct || tag)                                           │
│                                                                              │
│   decrypt(payload, key):                                                     │
│     buf = base64decode(payload)                                              │
│     iv = buf[0..12], tag = buf[-16..], ct = buf[12..-16]                     │
│     decipher = createDecipheriv('aes-256-gcm', key, iv); setAuthTag(tag)     │
│     return decipher.update(ct) + decipher.final()  (or '' on auth failure)   │
│                                                                              │
│   Constants: PBKDF2_ITERATIONS=200000, PBKDF2_KEYLEN=32,                     │
│              PBKDF2_SALT_LEN=32, GCM_IV_LEN=12, BACKUP_VERSION=1             │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Key properties:**

- AES-256-GCM (authenticated encryption — tampering is detected by the auth tag, decryption returns `''` instead of garbage).
- 12-byte random IV per encryption, prepended to the ciphertext.
- 32-byte random salt per installation, persisted to `userData/vault.salt`.
- The on-disk vault key uses **PBKDF2-SHA512, 100,000 iterations** derived from a machine-bound seed.
- The master-password backup (export/import) uses **PBKDF2-SHA512, 200,000 iterations** — a different round count so a derived backup key cannot be reused to read `vault.json` directly.
- `_persist()` writes via tmp-file + atomic rename so a crash mid-write never corrupts the vault.
- Vault size is capped at 256 KB (`MAX_VAULT_BYTES`); oversized writes are refused.

**Threat model:** protects against offline reading of `vault.json` on a different machine or under a different OS user. Does not protect against an attacker running inside the same process (the key is in memory while the launcher is running).

---

## Launch flow

When the user clicks **Play** on a profile, the renderer sends `launch:profile` with the profile ID. The flow is:

```
Renderer: launch:profile(profileId)
   │
   ▼
IpcRouter → Launcher.launchProfile(profileId)
   │
   1. profile = store.get(profileId)
   2. if already open in gameWindows Map → window.show() + focus(); return
   3. partitionName = partition.getPartitionName(profile)   // "persist:profile-<id>" or shadow
   4. ses = session.fromPartition(partitionName)
   5. setupBlocker(ses)                  // network/blocker.js — idempotent per session
   6. setupPersistentCookies(ses)        // network/cookies.js
   7. win = new BrowserWindow({ webPreferences: { partition, plugins:true, ... } })
   8. KeyboardShortcuts.attach(win, profile.name, ses, onClearLogin)
   9. MemoryGuard.registerGameWebContents(profileId, win.webContents)
  10. SessionLifecycle.attach(win, ses, profile, getGameUrl)
  11. SessionLifecycle._loadGameWithPreAuth(profileId, profile, win, ses, getGameUrl)
         │
         ├─ if vault.hasCredentials(profileId):
         │     creds = vault.getCredentials(profileId)
         │     apiLogin.loginAndInject(ses, creds.user, creds.pass)
         │       │  // POSTs to passport.oasgames.com, gets oas_user cookie,
         │       │  // injects it into the partition BEFORE loadURL
         │       └─ then win.loadURL(gameUrl)   // server sees the cookie, redirects straight to game
         │
         └─ else: win.loadURL(gameUrl)   // form-injection auto-login handles it after load
   12. gameWindows.set(profileId, { window, partitionName, ... })
   13. onOpened() → ManagerWindow.send('launch:opened', { profileId })
```

`SessionLifecycle` attaches handlers for `did-finish-load`, `did-fail-load`, `render-process-gone`, `unresponsive`, `will-navigate`, `new-window`, `close`, `closed`, `ready-to-show`. On `did-finish-load` it injects the CSS theme override + a small Facebook-SDK mock (to silence `oas_facebook_tools.js` retries) + the auto-login script (from `vault.buildAutoLoginScript`) when no pre-auth cookie was set.

### Crash / stall recovery

`render-process-gone` with reason `oom` or `abnormal-exit` triggers `SessionLifecycle._handleCrash()`:

```
crashCount[profileId]++
if crashCount[profileId] <= 3 in last 10 min:
   setTimeout(reloadWithPreAuth, 1500)   // 1.5s backoff
else:
   ManagerWindow.send('launch:crash-loop', { profileId, reason })
```

Clean exits (reason `clean-exit`) and user kills (reason `killed`) are skipped.

`StallDetector` runs in parallel: it watches `webRequest.onCompleted` + `onErrorOccurred` on the partition's session, tracking SWF failures. If 2+ SWFs fail within 60s **or** 45s pass with zero network activity while the loading screen is still up, it calls `onStall()` which delegates to `SessionLifecycle.reloadWithPreAuth` — same flow as F5: clear cookies + storage, pre-auth via API, then `win.loadURL`. After 120s of stable activity the watchdog stops (game is up, no more babysitting).

`FlashUpdater` (the old auto-download fallback) was **removed in v1.0.1**. If `findFlashPlugin()` returns `null`, the launcher shows a Flash-missing prompt and the user must restore the binary manually. See [FLASH_SETUP.md](FLASH_SETUP.md) for the rationale and recovery steps.

---

## Memory management

Two modules, split out of the former `guard.js` god-object in Phase 3f:

### MemoryGuard (`src/memory/MemoryGuard.js`) — monitor + registry

- Samples `process.memoryUsage().rss` on demand via `getStats()` (called by the GcDaemon interval and the StateBroadcaster push).
- Maintains a registry of **active game webContents** (`registerGameWebContents(profileId, wc)` / `unregister`). This is the key data structure that lets the GcDaemon know which partitions **must not** have their cache cleared (clearing cache on a partition with an active Flash player causes a black canvas — discovered and fixed in v5.0).
- Two profiles:
  - **Normal** (>= 4 GB RAM): 5-minute interval, 700 MB threshold, no preventive GC.
  - **Modo Batata** (< 4 GB RAM or manually forced): 2-minute interval, 450 MB threshold, preventive GC on every tick.
- Exposes `onMemoryUpdate(cb)` and `onGC(cb)` listeners — the StateBroadcaster subscribes to both.
- Records telemetry: `manualGCCount`, `autoGCCount`, `crashCount`.
- Webview-level `window.gc()` injection is a **NO-OP since v4.9.1** — it paused Flash. The registry is still populated (the GcDaemon uses it for the black-screen fix), but `injectGC()` and `startWebviewGC()` do nothing.

### GcDaemon (`src/memory/GcDaemon.js`) — periodic GC + `collect()`

`collect()` runs a layered cleanup:

```
collect({ manual: bool })
   │
   1. throttle check: skip if last GC < 30s ago (THROTTLE_MS)
   2. _collecting guard: skip if already running (anti-reentrance)
   │
   3. Layer 1: _clearIdleSessions()
   │     - await session.defaultSession.clearCache()
   │     - await session.defaultSession.clearStorageData({ storages: ['cachestorage'] })
   │     - for each profile in store.getAll():
   │         if profile.id NOT in MemoryGuard.getActiveProfileIds():
   │           await session.fromPartition(partName).clearCache()
   │           await session.fromPartition(partName).clearStorageData({ storages: ['cachestorage'] })
   │         else: SKIP (BLACK SCREEN FIX v5.0)
   │     NOTE: 'shadercache' is intentionally NOT cleared — recompiling GPU
   │           shaders mid-session blanks the Flash canvas.
   │
   4. Layer 2: V8 major GC on the MAIN process
   │     if typeof process.gc === 'function': process.gc(true)
   │     (safe — does not touch the renderer where Flash runs)
   │
   5. Layer 3 (Windows only): _emptyWorkingSetWindows()
   │     powershell -Command "[psapi]::EmptyWorkingSet(GetCurrentProcess().Handle)"
   │     fallback: SetProcessWorkingSetSize to zero
   │
   6. wait 200ms, re-sample stats, log "GcDaemon: GC <before>MB → <after>MB (-<saved>MB)"
   7. MemoryGuard._recordGC(isManual, result) — fires onGC listeners
```

`start()` schedules the interval tick (using `MemoryGuard.getIntervalMs()`). Each tick: `MemoryGuard._notify()` (pushes stats to listeners) and conditionally `collect()` if `totalMB > threshold` OR (batata AND preventive).

`F8` keyboard shortcut calls `collect({ manual: true })` directly — bypasses the threshold check but still respects throttle + anti-reentrance.

---

## Event timers

`src/utils/EventTimers.js` is a self-contained event-reminder system. It does not depend on a timezone library — DST is auto-detected by comparing the current `Date` UTC offset against the configured base offset for each region.

```
EventTimers.start(activeRegions)
   │
   1. _timer = setInterval(checkAllRegions, 30000)   // every 30s
   2. _timer.unref()  — does not keep the process alive
   │
   checkAllRegions():
     for each region in activeRegions:
       for each event in EVENTS_BY_REGION[region]:
         for each hour in event.hours:
           occ = nextOccurrenceMs(region, hour, event.days)   // next server-time occurrence
           remind = globalRemindMin !== null ? globalRemindMin : event.remindMin
           fireAt = occ - remind * 60 * 1000
           endAt  = occ + event.durationMin * 60000
           state = fired.get(region + ':' + event.id + ':' + occ) || { reminded:false, endFired:false }
           │
           if (!state.reminded && now in [fireAt, fireAt+60s)):
               state.reminded = true
               showNotification(event, region, lang)   // native Notification, bilingual name
               onRemind listeners fire → StateBroadcaster.pushEvents()
           │
           if (state.reminded && !state.endFired && now in [endAt, endAt+60s)):
               state.endFired = true
               showEndNotification(event, region, lang)
               onEnd listeners fire
     │
     cleanup: if fired.size > 500, prune entries with endFired && !reminded
```

**Region catalog** (`REGION_TZ`): 4 clusters, each with 11 events:

| Region | Timezone | Base UTC offset | DST | Server events |
|--------|----------|-----------------|-----|---------------|
| `br` | America/Sao_Paulo | -3 | none | World Boss, Arena 3v3, Team Dungeon, Escort, Ninja Instance, Ninja Training, Clan War, Guild Arena, Bond/Check-in, Daily Challenge, Daily Reset |
| `na` | America/New_York | -5 | -4 (DST) | (same 11, different hours) |
| `eu` | Europe/Berlin | +1 | +2 (DST) | (same 11, different hours) |
| `hk` | Asia/Hong_Kong | +8 | none | (same 11, different hours) |

Each event has `name_pt` + `name_en` (bilingual), `days[]` (weekday numbers — empty = daily), `hours[]` (server-time hours), `durationMin`, `category`, and `remindMin` (overridable globally via `setRemindMin`).

`startWithProfiles(profiles)` filters profiles by `notificationsEnabled !== false`, deduplicates their regions, and calls `start(regions)`. If no profile has notifications enabled, the daemon stays idle (no timer).

The StateBroadcaster's 30s push timer calls `EventTimers.getUpcoming(region)` to refresh the Events badge in the UI.

---

## Architecture diagram (text)

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  MANAGER PROCESS  (src/main.js, single instance)                                    │
│                                                                                     │
│  ┌─────────────────────┐    IPC (ipcMain.handle / .on)    ┌──────────────────────┐  │
│  │   RENDERER (trusted)│ ◄──────────────────────────────► │     IpcRouter        │  │
│  │   src/ui/           │                                  │  src/ui/manager/     │  │
│  │   ├─ index.html     │    push (webContents.send)       │  registers handlers  │  │
│  │   ├─ app.js         │ ◄─────────────────────────────── │  per domain:         │  │
│  │   ├─ styles.css     │                                  │  profiles / vault /  │  │
│  │   ├─ variables.css  │                                  │  launch / memory /   │  │
│  │   ├─ controller.js  │                                  │  events / tempmail / │  │
│  │   ├─ server-        │                                  │  inspector / config  │  │
│  │   │  selector.js    │                                  └──────────┬───────────┘  │
│  │   └─ game-          │                                             │              │
│  │      launcher.js    │                                  ┌──────────▼───────────┐  │
│  └─────────────────────┘                                  │  StateBroadcaster    │  │
│                                                          │  30s timer + onChange│  │
│                                                          │  pushProfiles/Memory │  │
│                                                          │  /Events/All         │  │
│                                                          └──────────┬───────────┘  │
│                                                                     │              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────▼─────────┐    │
│  │  profiles/   │  │   config/    │  │  network/    │  │      memory/         │    │
│  │  ├─ store    │  │  ├─ settings │  │  ├─ blocker  │  │  ├─ MemoryGuard      │    │
│  │  ├─ Profile- │  │  ├─ regions  │  │  ├─ cookies  │  │  │   (RSS monitor,   │    │
│  │  │  Vault    │  │  ├─ i18n     │  │  ├─ tempmail │  │  │    active-wc reg) │    │
│  │  ├─ Crypto-  │  │  ├─ urls     │  │  ├─ api-login│  │  ├─ GcDaemon         │    │
│  │  │  Service  │  │  ├─ hardware │  │  └─ inspector│  │  │   (layered GC)    │    │
│  │  ├─ Password-│  │  └─ optim.   │  └──────────────┘  │  └─ guard (facade)  │    │
│  │  │  Manager  │  └──────────────┘                     └─────────────────────┘    │
│  │  ├─ partition│                                                                │
│  │  └─ manager  │           ┌──────────────────┐  ┌──────────────────────────┐     │
│  └──────────────┘           │   utils/         │  │   app/                   │     │
│                             │  ├─ logger       │  │  ├─ Launcher             │     │
│  ┌──────────────┐           │  ├─ diagnostics  │  │  ├─ SessionLifecycle     │     │
│  │   flash/     │           │  ├─ EventTimers  │  │  ├─ CpuOptimizer         │     │
│  │  ├─ plugin   │           │  └─ jwt          │  │  ├─ GpuDetector          │     │
│  │  └─ mms      │           └──────────────────┘  │  ├─ StallDetector        │     │
│  └──────────────┘                                 │  └─ (FlashUpdater removed) │     │
│                                                   └────────────┬─────────────┘     │
│                                                                │                   │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────────┘                   │
│  │   main/      │  │  flash/*.dll │  │  BrowserWindow({ partition: persist:profile-<id> })│
│  │  ├─ flags    │  │  flash/*.so  │  ▼                                              │
│  │  └─ debug    │  │  manifests   │  ┌──────────────────────────────────────────┐   │
│  └──────────────┘  └──────────────┘  │  GAME PROCESS (per profile)              │   │
│                                      │                                          │   │
│                                      │  ┌────────────────┐  ┌─────────────────┐  │   │
│                                      │  │ webContents    │  │ Flash PPAPI     │  │   │
│                                      │  │ (Chromium 87)  │──│ pepflashplayer  │  │   │
│                                      │  │                │  │ .dll / .so      │  │   │
│                                      │  │ loads:         │  │                 │  │   │
│                                      │  │  naruto webgame│  │ runs the .swf   │  │   │
│                                      │  │  + .swf chain  │  │ chain           │  │   │
│                                      │  └────────┬───────┘  └─────────────────┘  │   │
│                                      │           │                              │   │
│                                      │  KeyboardShortcuts.attach (F5/F8/F12)    │   │
│                                      │  StallDetector.watch (SWF failure → F5)   │   │
│                                      │  MemoryGuard.register (RSS sample target) │   │
│                                      └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

Each game window is a separate `BrowserWindow` with its own session partition — they share the main process's daemons (MemoryGuard, EventTimers, GcDaemon) but never share cookies, cache, or localStorage with each other.

---

# Português

## Modelo de processos

O Shinobi Launcher roda **dois tipos de processo Electron**:

1. **Processo Manager** (o processo main, iniciado por `src/main.js`) — a própria janela do launcher. Hospeda a UI (`src/ui/index.html` + `app.js`), trata IPC, gerencia perfis, roda os daemons MemoryGuard + GcDaemon + EventTimers. Há exatamente um por launcher rodando.
2. **Processo de jogo** (por perfil, aberto por `src/app/Launcher.js`) — uma `BrowserWindow` separada com sua própria partição de sessão (`persist:profile-<id>`), aberta quando o usuário clica em **Play**. Cada janela de jogo é totalmente isolada das outras: cookies, localStorage, cache, service workers e o bloqueador de rede são todos por partição. O plugin Flash PPAPI roda dentro deste processo renderer.

Não há um terceiro tipo de processo. A janela de "loading" (`src/ui/loading/loading.html`) e a de "setup" (`src/ui/setup/setup.html`) são ambas `BrowserWindow`s pertencentes ao processo manager — são de curta duração e usadas apenas durante o download fallback do Flash (loading) e o wizard de primeiro boot (setup, atualmente pulado).

### Sequência de boot

`src/main.js` executa a seguinte sequência em `app.whenReady()`:

```
app.whenReady()
   │
   1. flags.applyAll({ flashPath, flashVersion, hardwareProfile, forceBatata })
   │     └─ adiciona --no-sandbox, --always-authorize-plugins, --ppapi-flash-path,
   │        --ppapi-flash-version, --js-flags=--expose-gc --max-old-space-size=<N>,
   │        --disable-features=..., --enable-features=..., disk-cache-size, etc.
   │
   2. flashPath = flash.findFlashPlugin()
   │     └─ procura em 6 caminhos (veja FLASH_SETUP.md); retorna null se todos falharem
   │
   3. if (flashPath) flash.configureFlash(flashPath)
      else mostrar prompt de Flash faltando (sem auto-download desde v1.0.1)
   │
   4. ManagerWindow.createManagerWindow({ onReady: ... })
   │     └─ carrega src/ui/index.html em uma BrowserWindow 1000x760
   │
   5. IpcRouter.register()           — registra todos os handlers ipcMain
   6. StateBroadcaster.startAutoRefresh()  — conecta listeners de store/vault/memory/event
   7. EventTimers.startWithProfiles(store.getAll())
   8. GcDaemon.start()                — interval = MemoryGuard.getIntervalMs()
   9. CpuOptimizer.applyToMain()      — affinity do processo main (só Linux)
```

Os daemons (passos 6-8) todos fazem `unref()` dos timers para não manter o processo vivo no quit.

---

## Fluxo IPC

O renderer (`src/ui/app.js`) fala com o processo main via o módulo `ipcRenderer` (o renderer tem `nodeIntegration: true` e `contextIsolation: false` — a UI é uma página local confiável que carrega apenas `index.html` do disco, então a ponte é direta).

Do lado do processo main, **`src/ui/manager/IpcRouter.js`** é o registro único de handlers `ipcMain.on` / `ipcMain.handle`. Ele os agrupa por domínio:

| Prefixo de canal | Domínio | Handlers |
|-------------------|---------|----------|
| `profiles:*` | CRUD de perfil | `profiles:list`, `profiles:create`, `profiles:update`, `profiles:delete`, `profiles:reorder` |
| `vault:*` | Cofre de credenciais | `vault:set`, `vault:get`, `vault:has`, `vault:remove`, `vault:export`, `vault:import` |
| `launch:*` | Lifecycle da janela de jogo | `launch:profile`, `launch:close`, `launch:focus` |
| `memory:*` | Estado de memória | `memory:stats`, `memory:gc` (F8 manual), `memory:set-threshold` |
| `events:*` | Event timers | `events:upcoming`, `events:mute`, `events:set-remind-min`, `events:set-lang` |
| `tempmail:*` | Conta alt | `tempmail:create`, `tempmail:status` |
| `inspector:*` | Painel devtools | `inspector:open`, `inspector:close`, `inspector:poll` |
| `config:*` | Configurações | `config:get`, `config:set`, `config:reset`, `config:export-diagnostics` |

Cada handler delega para um módulo de domínio (`store`, `vault`, `Launcher`, `MemoryGuard`, `EventTimers`, `tempmail`, `inspector`, `settings`) — o IpcRouter em si não guarda lógica de negócio.

**`src/ui/manager/StateBroadcaster.js`** é a direção inversa: pushes main → renderer. Ele tem quatro funções de push (`pushProfiles`, `pushMemory`, `pushEvents`, `pushAll`) e um timer periódico de 30 segundos que atualiza os badges de memória + eventos do renderer. Ele também assina event emitters de `store.onChange`, `MemoryGuard.onMemoryUpdate`, `MemoryGuard.onGC`, e `EventTimers.onRemind` para que mudanças sejam pushed imediatamente, não só no tick de 30s.

```
┌─────────────────────────────┐       ipcMain.handle / ipcMain.on        ┌─────────────────────┐
│  Renderer (src/ui/app.js)   │ ───────────────────────────────────────► │   IpcRouter         │
│                             │                                          │  (handlers, 1:1)    │
│  - renderProfiles()         │ ◄─────────────────────────────────────── │   delega para:      │
│  - renderEvents()           │       webContents.send (push)            │   store / vault /   │
│  - updateMemoryBar()        │                                          │   Launcher / mg /   │
└─────────────────────────────┘                                          │   et / tempmail /   │
                                                                         │   inspector / cfg   │
                                                                         └──────────┬──────────┘
                                                                                    │
                                          ┌─────────────────────────────────────────┴─────┐
                                          │  StateBroadcaster (push, periódico 30s + onChange)│
                                          │  - pushProfiles()  → store.getAll() + vault      │
                                          │  - pushMemory()    → MemoryGuard.getStats()      │
                                          │  - pushEvents()    → EventTimers.getUpcoming()   │
                                          └─────────────────────────────────────────────────┘
```

**`src/ui/manager/KeyboardShortcuts.js`** anexa um listener `before-input-event` ao `webContents` de cada janela de jogo. Ele intercepta F5 (limpar login + pré-auth + reload), F8 (GC manual), F12 (toggle DevTools), Alt+F4 (close graceful), e bloqueia F10 + Ctrl+Shift+I/J (para os usuários usarem F12 em vez dos atalhos de menu do Chromium).

---

## Fluxo de segurança do cofre de perfis

O cofre de credenciais é um split em três módulos (Fase 3e). Cada módulo tem responsabilidade única:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  src/profiles/ProfileVault.js   (CRUD + script de auto-login)                │
│  ──────────────────────────────────────────                                  │
│   setCredentials(profileId, user, pass):                                     │
│     1. _ensureLoaded()              — carrega vault.json do userData         │
│     2. _encryptWithMachineKey(user) ─► CryptoService.encrypt(plaintext, key) │
│     3. _encryptWithMachineKey(pass) ─► CryptoService.encrypt(plaintext, key) │
│     4. _store[profileId] = { user, pass, updatedAt }                         │
│     5. _persist()                   — escrita atômica (tmp + rename)         │
│                                                                              │
│   getCredentials(profileId):                                                 │
│     1. _ensureLoaded()                                                        │
│     2. _decryptWithMachineKey(entry.user)  → CryptoService.decrypt(payload)  │
│     3. _decryptWithMachineKey(entry.pass)  → CryptoService.decrypt(payload)  │
│     4. return { user, pass } (ou null em tag-mismatch — chave mudou/tamper)  │
└──────────────────────────────────┬───────────────────────────────────────────┘
                                   │  usa chave
                                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  src/profiles/PasswordManager.js   (derivação de chave de máquina)           │
│  ──────────────────────────────────────────────                              │
│   getMachineKey():                                                           │
│     1. machineSeed = os.hostname() + '|' + os.userInfo().username + '|'      │
│                     + app.getPath('userData') + '|shinobi-vault-v2'          │
│     2. salt = getSalt()  — 32 bytes random, persistido em userData/vault.salt│
│     3. key = pbkdf2Sync(machineSeed, salt, 100000, 32, 'sha512')             │
│     4. cacheia em _cachedKey; retorna key                                    │
│                                                                              │
│   deriveMasterKey(password, salt):  — só para export/import de backup        │
│     return CryptoService.deriveKey(password, salt)   // 200.000 iterações    │
└──────────────────────────────────┬───────────────────────────────────────────┘
                                   │  usa primitivas
                                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  src/profiles/CryptoService.js   (primitivas de cripto puras)                │
│  ─────────────────────────────────────────────                              │
│   encrypt(plaintext, key):                                                   │
│     iv = randomBytes(12)                                                     │
│     cipher = createCipheriv('aes-256-gcm', key, iv)                          │
│     ct = cipher.update(plaintext) + cipher.final()                           │
│     tag = cipher.getAuthTag()                                                │
│     return base64(iv || ct || tag)                                           │
│                                                                              │
│   decrypt(payload, key):                                                     │
│     buf = base64decode(payload)                                              │
│     iv = buf[0..12], tag = buf[-16..], ct = buf[12..-16]                     │
│     decipher = createDecipheriv('aes-256-gcm', key, iv); setAuthTag(tag)     │
│     return decipher.update(ct) + decipher.final()  (ou '' em falha de auth)  │
│                                                                              │
│   Constants: PBKDF2_ITERATIONS=200000, PBKDF2_KEYLEN=32,                     │
│              PBKDF2_SALT_LEN=32, GCM_IV_LEN=12, BACKUP_VERSION=1             │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Propriedades principais:**

- AES-256-GCM (criptografia autenticada — tampering é detectado pela auth tag, decrypt retorna `''` em vez de lixo).
- 12 bytes de IV random por encriptação, prependido ao ciphertext.
- 32 bytes de salt random por instalação, persistido em `userData/vault.salt`.
- A chave do vault em disco usa **PBKDF2-SHA512, 100.000 iterações** derivada de um seed de máquina.
- O backup com senha mestre (export/import) usa **PBKDF2-SHA512, 200.000 iterações** — contagem de rounds diferente para que uma chave derivada de backup não possa ser reusada para ler `vault.json` diretamente.
- `_persist()` escreve via tmp-file + rename atômico para que um crash mid-write nunca corrompa o vault.
- O tamanho do vault é limitado a 256 KB (`MAX_VAULT_BYTES`); escritas oversized são recusadas.

**Modelo de ameaça:** protege contra leitura offline do `vault.json` em outra máquina ou outro usuário do SO. Não protege contra atacante rodando dentro do mesmo processo (a chave está em memória enquanto o launcher roda).

---

## Fluxo de launch

Quando o usuário clica em **Play** em um perfil, o renderer envia `launch:profile` com o ID do perfil. O fluxo é:

```
Renderer: launch:profile(profileId)
   │
   ▼
IpcRouter → Launcher.launchProfile(profileId)
   │
   1. profile = store.get(profileId)
   2. se já aberto no Map gameWindows → window.show() + focus(); return
   3. partitionName = partition.getPartitionName(profile)   // "persist:profile-<id>" ou shadow
   4. ses = session.fromPartition(partitionName)
   5. setupBlocker(ses)                  // network/blocker.js — idempotente por session
   6. setupPersistentCookies(ses)        // network/cookies.js
   7. win = new BrowserWindow({ webPreferences: { partition, plugins:true, ... } })
   8. KeyboardShortcuts.attach(win, profile.name, ses, onClearLogin)
   9. MemoryGuard.registerGameWebContents(profileId, win.webContents)
  10. SessionLifecycle.attach(win, ses, profile, getGameUrl)
  11. SessionLifecycle._loadGameWithPreAuth(profileId, profile, win, ses, getGameUrl)
         │
         ├─ se vault.hasCredentials(profileId):
         │     creds = vault.getCredentials(profileId)
         │     apiLogin.loginAndInject(ses, creds.user, creds.pass)
         │       │  // POSTa para passport.oasgames.com, pega cookie oas_user,
         │       │  // injeta na partição ANTES do loadURL
         │       └─ then win.loadURL(gameUrl)   // servidor vê o cookie, redireciona direto pro jogo
         │
         └─ else: win.loadURL(gameUrl)   // auto-login por form-injection cuida depois do load
   12. gameWindows.set(profileId, { window, partitionName, ... })
   13. onOpened() → ManagerWindow.send('launch:opened', { profileId })
```

`SessionLifecycle` anexa handlers para `did-finish-load`, `did-fail-load`, `render-process-gone`, `unresponsive`, `will-navigate`, `new-window`, `close`, `closed`, `ready-to-show`. Em `did-finish-load` ele injeta a sobrescrita de CSS de tema + um pequeno mock do Facebook SDK (para silenciar retries de `oas_facebook_tools.js`) + o script de auto-login (de `vault.buildAutoLoginScript`) quando não havia cookie de pré-auth.

### Recuperação de crash / stall

`render-process-gone` com reason `oom` ou `abnormal-exit` dispara `SessionLifecycle._handleCrash()`:

```
crashCount[profileId]++
se crashCount[profileId] <= 3 nos últimos 10 min:
   setTimeout(reloadWithPreAuth, 1500)   // backoff de 1,5s
senão:
   ManagerWindow.send('launch:crash-loop', { profileId, reason })
```

Saídas limpas (reason `clean-exit`) e kills do usuário (reason `killed`) são puladas.

`StallDetector` roda em paralelo: observa `webRequest.onCompleted` + `onErrorOccurred` na session da partição, rastreando falhas de SWF. Se 2+ SWFs falham em 60s **ou** 45s passam sem atividade de rede enquanto a tela de loading ainda está up, ele chama `onStall()` que delega para `SessionLifecycle.reloadWithPreAuth` — mesmo fluxo do F5: limpa cookies + storage, pré-auth via API, então `win.loadURL`. Após 120s de atividade estável o watchdog para (o jogo está no ar, sem mais babysitting).

`FlashUpdater` (o antigo fallback de auto-download) foi **removido na v1.0.1**. Se `findFlashPlugin()` retorna `null`, o launcher mostra um prompt de Flash faltando e o usuário precisa restaurar o binário manualmente. Veja [FLASH_SETUP.md](FLASH_SETUP.md) para o rationale e os passos de recuperação.

---

## Gerenciamento de memória

Dois módulos, separados do antigo god-object `guard.js` na Fase 3f:

### MemoryGuard (`src/memory/MemoryGuard.js`) — monitor + registry

- Amostra `process.memoryUsage().rss` on demand via `getStats()` (chamado pelo interval do GcDaemon e pelo push do StateBroadcaster).
- Mantém um registry de **webContents de jogo ativos** (`registerGameWebContents(profileId, wc)` / `unregister`). Esta é a estrutura-chave que permite ao GcDaemon saber quais partições **não** devem ter o cache limpo (limpar cache em uma partição com Flash player ativo causa canvas preto — descoberto e corrigido em v5.0).
- Dois perfis:
  - **Normal** (>= 4 GB RAM): intervalo de 5 minutos, threshold 700 MB, sem GC preventivo.
  - **Modo Batata** (< 4 GB RAM ou forçado manualmente): intervalo de 2 minutos, threshold 450 MB, GC preventivo em todo tick.
- Expõe listeners `onMemoryUpdate(cb)` e `onGC(cb)` — o StateBroadcaster assina ambos.
- Registra telemetria: `manualGCCount`, `autoGCCount`, `crashCount`.
- A injeção de `window.gc()` no renderer é **NO-OP desde v4.9.1** — pausava o Flash. O registry ainda é populado (o GcDaemon o usa para o fix de black screen), mas `injectGC()` e `startWebviewGC()` não fazem nada.

### GcDaemon (`src/memory/GcDaemon.js`) — GC periódico + `collect()`

`collect()` roda uma limpeza em camadas:

```
collect({ manual: bool })
   │
   1. checagem de throttle: skip se último GC < 30s atrás (THROTTLE_MS)
   2. guarda _collecting: skip se já rodando (anti-reentrância)
   │
   3. Camada 1: _clearIdleSessions()
   │     - await session.defaultSession.clearCache()
   │     - await session.defaultSession.clearStorageData({ storages: ['cachestorage'] })
   │     - para cada perfil em store.getAll():
   │         se profile.id NÃO está em MemoryGuard.getActiveProfileIds():
   │           await session.fromPartition(partName).clearCache()
   │           await session.fromPartition(partName).clearStorageData({ storages: ['cachestorage'] })
   │         senão: SKIP (BLACK SCREEN FIX v5.0)
   │     NOTA: 'shadercache' é intencionalmente NÃO limpo — recompilar GPU
   │           shaders mid-session blanka o canvas do Flash.
   │
   4. Camada 2: V8 major GC no processo MAIN
   │     se typeof process.gc === 'function': process.gc(true)
   │     (seguro — não toca no renderer onde o Flash roda)
   │
   5. Camada 3 (só Windows): _emptyWorkingSetWindows()
   │     powershell -Command "[psapi]::EmptyWorkingSet(GetCurrentProcess().Handle)"
   │     fallback: SetProcessWorkingSetSize para zero
   │
   6. espera 200ms, re-amostra stats, log "GcDaemon: GC <before>MB → <after>MB (-<saved>MB)"
   7. MemoryGuard._recordGC(isManual, result) — dispara listeners onGC
```

`start()` agenda o tick de interval (usando `MemoryGuard.getIntervalMs()`). Cada tick: `MemoryGuard._notify()` (pusha stats para listeners) e condicionalmente `collect()` se `totalMB > threshold` OU (batata AND preventive).

O atalho `F8` chama `collect({ manual: true })` diretamente — bypassa a checagem de threshold mas ainda respeita throttle + anti-reentrância.

---

## Event timers

`src/utils/EventTimers.js` é um sistema self-contained de lembretes de eventos. Não depende de library de timezone — DST é auto-detectado comparando o offset UTC atual do `Date` contra o offset base configurado para cada região.

```
EventTimers.start(activeRegions)
   │
   1. _timer = setInterval(checkAllRegions, 30000)   // a cada 30s
   2. _timer.unref()  — não mantém o processo vivo
   │
   checkAllRegions():
     para cada region em activeRegions:
       para cada event em EVENTS_BY_REGION[region]:
         para cada hour em event.hours:
           occ = nextOccurrenceMs(region, hour, event.days)   // próxima ocorrência server-time
           remind = globalRemindMin !== null ? globalRemindMin : event.remindMin
           fireAt = occ - remind * 60 * 1000
           endAt  = occ + event.durationMin * 60000
           state = fired.get(region + ':' + event.id + ':' + occ) || { reminded:false, endFired:false }
           │
           se (!state.reminded && now in [fireAt, fireAt+60s)):
               state.reminded = true
               showNotification(event, region, lang)   // Notification nativa, nome bilíngue
               listeners onRemind disparam → StateBroadcaster.pushEvents()
           │
           se (state.reminded && !state.endFired && now in [endAt, endAt+60s)):
               state.endFired = true
               showEndNotification(event, region, lang)
               listeners onEnd disparam
     │
     cleanup: se fired.size > 500, pruna entradas com endFired && !reminded
```

**Catálogo de regiões** (`REGION_TZ`): 4 clusters, cada um com 11 eventos:

| Região | Fuso | Offset UTC base | DST | Eventos do servidor |
|--------|------|-----------------|-----|---------------------|
| `br` | America/Sao_Paulo | -3 | nenhum | World Boss, Arena 3v3, Team Dungeon, Escort, Ninja Instance, Ninja Training, Clan War, Guild Arena, Bond/Check-in, Daily Challenge, Daily Reset |
| `na` | America/New_York | -5 | -4 (DST) | (mesmos 11, horas diferentes) |
| `eu` | Europe/Berlin | +1 | +2 (DST) | (mesmos 11, horas diferentes) |
| `hk` | Asia/Hong_Kong | +8 | nenhum | (mesmos 11, horas diferentes) |

Cada evento tem `name_pt` + `name_en` (bilíngue), `days[]` (números de weekday — vazio = diário), `hours[]` (horas server-time), `durationMin`, `category`, e `remindMin` (override global via `setRemindMin`).

`startWithProfiles(profiles)` filtra perfis por `notificationsEnabled !== false`, deduplica suas regiões, e chama `start(regions)`. Se nenhum perfil tem notificações habilitadas, o daemon fica idle (sem timer).

O timer de push de 30s do StateBroadcaster chama `EventTimers.getUpcoming(region)` para atualizar o badge de Events na UI.

---

## Diagrama de arquitetura (texto)

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  PROCESSO MANAGER  (src/main.js, instância única)                                   │
│                                                                                     │
│  ┌─────────────────────┐    IPC (ipcMain.handle / .on)    ┌──────────────────────┐  │
│  │   RENDERER (confiável)◄──────────────────────────────► │     IpcRouter        │  │
│  │   src/ui/           │                                  │  src/ui/manager/     │  │
│  │   ├─ index.html     │    push (webContents.send)       │  registra handlers   │  │
│  │   ├─ app.js         │ ◄─────────────────────────────── │  por domínio:        │  │
│  │   ├─ styles.css     │                                  │  profiles / vault /  │  │
│  │   ├─ variables.css  │                                  │  launch / memory /   │  │
│  │   ├─ controller.js  │                                  │  events / tempmail / │  │
│  │   ├─ server-        │                                  │  inspector / config  │  │
│  │   │  selector.js    │                                  └──────────┬───────────┘  │
│  │   └─ game-          │                                             │              │
│  │      launcher.js    │                                  ┌──────────▼───────────┐  │
│  └─────────────────────┘                                  │  StateBroadcaster    │  │
│                                                          │  30s timer + onChange│  │
│                                                          │  pushProfiles/Memory │  │
│                                                          │  /Events/All         │  │
│                                                          └──────────┬───────────┘  │
│                                                                     │              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────▼─────────┐    │
│  │  profiles/   │  │   config/    │  │  network/    │  │      memory/         │    │
│  │  ├─ store    │  │  ├─ settings │  │  ├─ blocker  │  │  ├─ MemoryGuard      │    │
│  │  ├─ Profile- │  │  ├─ regions  │  │  ├─ cookies  │  │  │   (monitor RSS,   │    │
│  │  │  Vault    │  │  ├─ i18n     │  │  ├─ tempmail │  │  │    registry wc)   │    │
│  │  ├─ Crypto-  │  │  ├─ urls     │  │  ├─ api-login│  │  ├─ GcDaemon         │    │
│  │  │  Service  │  │  ├─ hardware │  │  └─ inspector│  │  │   (GC em camadas) │    │
│  │  ├─ Password-│  │  └─ optim.   │  └──────────────┘  │  └─ guard (facade)  │    │
│  │  │  Manager  │  └──────────────┘                     └─────────────────────┘    │
│  │  ├─ partition│                                                                │
│  │  └─ manager  │           ┌──────────────────┐  ┌──────────────────────────┐     │
│  └──────────────┘           │   utils/         │  │   app/                   │     │
│                             │  ├─ logger       │  │  ├─ Launcher             │     │
│  ┌──────────────┐           │  ├─ diagnostics  │  │  ├─ SessionLifecycle     │     │
│  │   flash/     │           │  ├─ EventTimers  │  │  ├─ CpuOptimizer         │     │
│  │  ├─ plugin   │           │  └─ jwt          │  │  ├─ GpuDetector          │     │
│  │  └─ mms      │           └──────────────────┘  │  ├─ StallDetector        │     │
│  └──────────────┘                                 │  └─ (FlashUpdater removed) │     │
│                                                   └────────────┬─────────────┘     │
│                                                                │                   │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────────┘                   │
│  │   main/      │  │  flash/*.dll │  │  BrowserWindow({ partition: persist:profile-<id> })│
│  │  ├─ flags    │  │  flash/*.so  │  ▼                                              │
│  │  └─ debug    │  │  manifests   │  ┌──────────────────────────────────────────┐   │
│  └──────────────┘  └──────────────┘  │  PROCESSO DE JOGO (por perfil)           │   │
│                                      │                                          │   │
│                                      │  ┌────────────────┐  ┌─────────────────┐  │   │
│                                      │  │ webContents    │  │ Flash PPAPI     │  │   │
│                                      │  │ (Chromium 87)  │──│ pepflashplayer  │  │   │
│                                      │  │                │  │ .dll / .so      │  │   │
│                                      │  │ carrega:       │  │                 │  │   │
│                                      │  │  naruto webgame│  │ roda a cadeia   │  │   │
│                                      │  │  + cadeia .swf │  │ de .swf         │  │   │
│                                      │  └────────┬───────┘  └─────────────────┘  │   │
│                                      │           │                              │   │
│                                      │  KeyboardShortcuts.attach (F5/F8/F12)    │   │
│                                      │  StallDetector.watch (falha SWF → F5)     │   │
│                                      │  MemoryGuard.register (alvo de amostra RSS)│   │
│                                      └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

Cada janela de jogo é uma `BrowserWindow` separada com sua própria partição de sessão — elas compartilham os daemons do processo main (MemoryGuard, EventTimers, GcDaemon) mas nunca compartilham cookies, cache, ou localStorage entre si.
