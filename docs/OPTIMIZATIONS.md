# Optimizations

> What the launcher tunes, why, and which ones are real vs placebo.

Shinobi Launcher applies three layers of optimization. **All of them are real** — the v5.20.0 audit removed every placebo key (see the table at the bottom).

## Layer 1: Smart optimization (always on)

A curated set of Chromium command-line flags applied at boot via `src/main/flags.js`. These tune the runtime for Flash PPAPI specifically — they're not generic "make Chrome faster" flags.

| Flag | Why it matters for Flash |
|------|--------------------------|
| `--no-sandbox` | **Required.** PPAPI Flash can't inject into a sandboxed renderer. |
| `--disable-gpu-sandbox` | Same — GPU sandbox blocks PPAPI. |
| `--disable-setuid-sandbox` | Linux: allows the Flash helper process to start. |
| `--always-authorize-plugins` | Loads Flash without a user prompt every launch. |
| `--allow-outdated-plugins` | Clean Flash 34 reports as "outdated" — bypass the warning. |
| `--disable-background-timer-throttling` | Flash game timers (boss spawns, cooldowns) stay accurate when the window is in the background. |
| `--disable-renderer-backgrounding` | Don't deprioritize the Flash renderer when the window loses focus. |
| `--disable-backgrounding-occluded-windows` | Same, for occluded windows. |
| `--disable-hang-monitor` | Flash loops (long boss fights, AFK farming) would trigger the hang monitor and kill the process. |
| `--ignore-gpu-blocklist` | Allow GPU acceleration even if the driver is on Chromium's blocklist. |
| `--disable-plugin-power-saver` | Don't throttle Flash to save power. |
| `--disk-cache-size=<268435456>` (or 134MB if <4GB RAM) | Size the HTTP cache for game assets (SWFs, images). |
| `--js-flags=--expose-gc,--max-old-space-size=<N>` | Expose `gc()` for the MemoryGuard + size the V8 heap to RAM (384MB / 768MB / 1024MB / 1536MB by tier). |

These are **harmless but kept for hygiene** (reduce background noise, don't affect Flash directly):
`--disable-background-networking`, `--disable-component-update`, `--disable-default-apps`, `--disable-extensions`, `--disable-translate`, `--disable-domain-reliability`, `--disable-client-side-phishing-detection`.

## Layer 2: Force CPU rendering (toggle)

For GPUs with driver issues (artifacts, crashes, black screen). When on, sets `config.hardwareProfile = 'cpu'` and appends:

| Flag | Effect |
|------|--------|
| `--disable-gpu` | Disables GPU compositing entirely. |
| `--use-gl=swiftshader` | Software GL backend (Linux: `swiftshader`, Windows: empty = ANGLE SwiftShader). |
| `--num-raster-threads=<min(CPU_CORES,4)>` | Multi-thread software rasterization (up to 4 threads). |

Also writes `EnableHardwareAcceleration=0` to `mms.cfg` so Flash itself uses software rendering.

**Requires restart** — Chromium flags are read only at process boot. The launcher shows a "Restart required" row in Settings when you toggle this.

**Tradeoff:** CPU rendering is slower (20-40% lower FPS on modern hardware) but stable on broken GPUs.

## Layer 3: Low-end PC mode (toggle)

For old PCs or <4GB RAM. When on, sets `config.advancedMode = true` and writes real mms.cfg keys:

| Key | Effect |
|------|--------|
| `EnableHardwareAcceleration=0` | Flash uses software rendering → unloads the GPU. |
| `AssetCacheSize=0` | Drops Flash's internal asset cache → frees RAM (re-downloads assets on demand). |
| `AutoUpdateDisable=1` | Disables Flash's auto-updater (cosmetic — PPAPI standalone doesn't auto-update, but the key is documented and harmless). |

Also always written (regardless of mode):
| Key | Effect |
|------|--------|
| `OverrideGPUValidation=1` | Bypass buggy GPU driver validation (works around artifacts on old Intel iGPUs). |

**No restart needed** — Flash reads `mms.cfg` at plugin load, which happens when the game window opens. Toggle it, launch the game, done.

**Tradeoff:** With `AssetCacheSize=0`, Flash re-downloads assets each session (slightly longer load on first enter of each zone) but uses ~150-300MB less RAM sustained.

## What was removed (placebo audit, v5.20.0)

These were in `mms.cfg` for years but are **not real mms.cfg keys** — Flash silently ignores them. They're AS3 properties (`stage.quality`, `stage.frameRate`) or HTML embed params (`FlashVars`), not config file directives.

| Removed key | Why it's placebo |
|-------------|------------------|
| `StageQuality=LOW` | That's an AS3 property (`stage.quality`), not an mms.cfg key. The game's AS3 code controls it. |
| `OverrideFPS=60` | Same — FPS is `stage.frameRate` in AS3. mms.cfg can't override it. |
| `EnableSockets=1` | Socket policy is `crossdomain.xml`, not mms.cfg. |
| `FontSmoothingType=0` | That's an OS-level setting, not Flash. |
| `DisableHardwareAcceleration=1` (duplicate) | Already covered by `EnableHardwareAcceleration=0` — was a redundant duplicate. |

## Memory guard (separate from the above)

The MemoryGuard daemon (`src/memory/MemoryGuard.js`) is a separate concern — it watches per-window RAM usage and triggers 3-layer GC when a window crosses 700MB:

1. **JS layer**: `win.webContents.executeJavaScript('gc()')` — forces V8 garbage collection (requires `--expose-gc` flag).
2. **Session layer**: `session.clearCache()` + `session.clearStorageData({ storages: ['cachestorage', 'serviceworkers'] })` — clears HTTP cache and service worker caches per partition.
3. **OS layer**: On Windows, calls `EmptyWorkingSet` on the game process via `psapi.dll` (trims the working set, forcing Windows to reclaim paged memory). On Linux, sends `MADV_DONTNEED` via `madvise` on the process's main memory mapping.

Manual trigger: **F8**.

## CPU optimizer (separate)

`src/app/CpuOptimizer.js` sets CPU core affinity for each game window process. Flash's main loop is single-threaded, so pinning it to one P-core (performance core) reduces context switches and thermal throttling on hybrid CPUs (Intel 12th+ gen P/E cores).

- Windows: `SetProcessAffinityMask` via `kernel32.dll`.
- Linux: `sched_setaffinity` via syscall.

Only pins the main renderer process — child processes (GPU, Flash helper) are left to the OS scheduler.
