# Flash PPAPI Setup

> How the Shinobi Launcher loads the Flash PPAPI plugin, where the binaries live,
> and what to do when something goes wrong.

---

## Why Flash is needed

**Naruto Online is a Flash game.** The client loads a chain of `.swf` files into
a Pepper Flash (PPAPI) plugin. There is no HTML5 client — without PPAPI the game
canvas stays black.

Adobe ended Flash support in December 2020. Modern Chromium (>=88) and every
Tauri/WebView2 runtime have removed PPAPI. The only way to keep Naruto Online
running on a desktop is to bundle a "Clean Flash" PPAPI build (an unofficial
patched fork that ignores the EOL kill-switch) inside an old Electron that still
supports the `ppapi-flash-path` switch. Shinobi Launcher does exactly that —
**Electron 11.5.0** (the last release with working Pepper Flash) plus **Clean
Flash PPAPI 34.0.0.x** from
[`darktohka/clean-flash-builds`](https://github.com/darktohka/clean-flash-builds).
There is no Ruffle path today — it does not yet support the ActionScript 3 +
heavy network I/O that Naruto Online requires.

---

## Where the binaries live

The binaries are **committed to the repository** at the project root — no
download-on-first-run step, no install step.

```
shinobi-launcher/
└── flash/
    ├── pepflashplayer.dll          # Windows PPAPI plugin (34.0.0.376, ~16 MB)
    ├── libpepflashplayer.so        # Linux   PPAPI plugin (34.0.0.137, ~16 MB)
    ├── manifest.json               # version metadata (cross-platform)
    ├── manifest-windows.json       # Windows-specific version metadata
    └── manifest-linux.json         # Linux-specific   version metadata
```

| Platform | Filename                      | Expected version |
|----------|-------------------------------|------------------|
| Windows  | `flash/pepflashplayer.dll`    | 34.0.0.376       |
| Linux    | `flash/libpepflashplayer.so`  | 34.0.0.137       |

Both files exceed 1 MB (the loader's minimum-size sanity check).

---

## How the auto-loader works

The loader is `src/flash/plugin.js`. `findFlashPlugin()` rejects `darwin`
(macOS cannot run PPAPI Flash), resolves the platform-specific plugin name, then
probes **six candidate search paths** in order and returns the first hit larger
than 1 MB (logging each attempt) — or `null` if nothing matches:

| # | Path                                                         | Mode                                         |
|---|--------------------------------------------------------------|----------------------------------------------|
| 1 | `process.resourcesPath/flash/<plugin>`                       | Packaged app (AppImage / portable EXE)       |
| 2 | `path.dirname(app.getPath('exe'))/flash/<plugin>`            | Portable EXE sitting next to `flash/`        |
| 3 | `app.getAppPath()` (`.asar` stripped) `/flash/<plugin>`      | ASAR-packaged dev / prod                     |
| 4 | `process.cwd()/flash/<plugin>`                               | Run from project root                        |
| 5 | `__dirname/../../flash/<plugin>`                             | Dev mode (`src/flash/` → repo root `flash/`) |
| 6 | `userData/flash-cache/<plugin>`                              | User-supplied manual drop (never auto-fill)  |

`configureFlash(flashPath)` reads the version from `manifest.json` (falling back
to `FLASH_VERSIONS`) and appends `--ppapi-flash-path` + `--ppapi-flash-version`
to Chromium. All other Chromium flags live in `src/main/flags.js` — the loader
only owns path + version, so it never overrides `--js-flags` set by `main.js`
(which would break `--expose-gc` and the MemoryGuard daemon).
`src/flash/mms.js` generates `mms.cfg` for Modo Low-Spec (Low-PC mode).

---

## No automatic fallback (since v1.0.1)

Earlier versions shipped a `FlashUpdater` that auto-downloaded Clean Flash when
all six paths missed. **That module was removed** — Flash is EOL, binaries are
committed, and an auto-download would add attack surface (a compromised GitHub
release would silently replace the plugin).

If the loader returns `null`, the launcher does NOT recover on its own — the game
tab shows a Flash-missing prompt. Manual recovery: re-clone the repo (or copy
`flash/pepflashplayer.dll` / `flash/libpepflashplayer.so` from a known-good
checkout), optionally drop at `userData/flash-cache/<plugin>` (path #6), then
restart.

---

## Manual override (developers only)

End users do not need this — binaries are committed. To swap in a different Clean
Flash build for testing:

1. Download from <https://github.com/darktohka/clean-flash-builds/releases>.
2. Extract the PPAPI plugin: Windows `pepflashplayer.dll` from
   `ChineseFlash-Patched-Win-<ver>.7z`; Linux `libpepflashplayer.so` from
   `flash_player_patched_ppapi_linux.x86_64.tar.gz`.
3. Drop into the project root `flash/`, **overwriting** the existing file. Keep
   the exact filename — the loader looks up by name, not by glob.
4. (Optional) Update `flash/manifest.json` `version` to match the new binary.
   Otherwise `--ppapi-flash-version` reports the wrong string (some Oasgames pages
   check it — "Flash version too old" warnings mean the manifest needs updating).
5. Restart. First boot log reads `Flash <version> path configurado`.

For packaged apps, drop the binary next to the executable in the same `flash/`
subfolder (search path #2) — no rebuild required.

---

## Troubleshooting

| Symptom                                                          | Cause                                              | Fix                                                                                                                                                  |
|------------------------------------------------------------------|----------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------|
| Launcher opens but canvas stays black, no "Press to play"        | PPAPI plugin not loaded                            | Check `userData/logs/main.log` for `Flash PPAPI NÃO encontrado!`. Verify the binary exists at a search path and is >1 MB. Restore from repo or drop into `userData/flash-cache/` (path #6). |
| Manager window opens but game tab shows Flash-missing prompt     | Expected fallback — binary is missing              | The launcher itself does not require Flash; only the game does. Follow the recovery steps above.                                                      |
| `Flash <version> path configurado` logged but canvas still black | Binary loaded but PPAPI init failed inside Chromium | Wayland: try `GDK_BACKEND=x11`. GPU blocklist: toggle **Settings → Force CPU rendering** (requires restart) for SwiftShader. Corrupt binary: replace from a known-good checkout. |
| Game launches but shows "Flash version too old"                  | `flash/manifest.json` version doesn't match binary | Update `manifest.json` `version` (Windows) / `linux_version` (Linux) to match the actual binary version.                                             |
| Wayland session crashes or shows blank                           | PPAPI + Wayland + GPU combo                        | Force X11 with `GDK_BACKEND=x11`, or use `linux/run.sh` (auto Wayland → XWayland fallback).                                                         |
| `flash/` directory missing after fresh clone                     | LFS pointer not pulled or shallow clone            | Re-clone with full history, or download the binaries directly from a tagged release.                                                                 |

---

## Source references

- `src/flash/plugin.js` — `findFlashPlugin()`, `configureFlash()`, `getFlashVersion()` (the loader)
- `src/flash/mms.js` — generates `mms.cfg` for Modo Low-Spec
- `src/main/flags.js` — all non-Flash Chromium flags (`--no-sandbox`, `--always-authorize-plugins`, JS heap, etc.)
- `src/main.js` — boot: `applyAll(flags)` → `findFlashPlugin()` → `configureFlash()` → `createManagerWindow()` (or Flash-missing prompt)
- `flash/manifest*.json` — version metadata read by `getFlashVersion()`

## External references

- Adobe Flash Player End of Life: <https://www.adobe.com/products/flashplayer/end-of-life.html>
- Clean Flash builds: <https://github.com/darktohka/clean-flash-builds>
