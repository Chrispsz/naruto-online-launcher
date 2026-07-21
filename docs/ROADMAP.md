# Roadmap

> Planned features and areas for innovation. Last updated: v5.24.0.

## Current state (v5.24.0)

The launcher is stable and feature-complete for its core purpose (multi-account isolated play). 1235 tests pass, lint is clean, and all optimizations are real (no placebo). The UI is minimal and aligned (VLM 8-9/10 across views).

## Where we can still innovate

### UX / player experience
- [ ] **Profile drag-and-drop reordering** — currently profiles sort by name; let users pin a custom order.
- [ ] **Per-profile event filters** — let users mute specific events per profile (e.g., silence Escort reminders on an alt account).
- [ ] **In-game screenshot gallery** — `Ctrl+Shift+S` already captures; add a gallery view to browse + copy + delete past shots.
- [ ] **One-click "launch all"** — open N accounts with a single click (with a confirmation modal showing total estimated RAM usage).
- [ ] **Session timer on each card** — show how long each account has been online (helps avoid the 2h session-expiry surprise).

### Performance
- [ ] **Linux Wayland native rendering path** — currently falls back to XWayland; direct Wayland would reduce input latency.
- [ ] **Per-profile RAM budget** — let users cap each profile's RAM; MemoryGuard would trigger GC earlier for budgeted profiles.
- [ ] **Flash asset pre-fetch** — pre-download common zone SWFs in the background on launcher start (faster first-enter of each zone).
- [ ] **GPU profiling overlay** — optional FPS + RAM + GPU overlay on the game window (dev-tools style, toggle with a hotkey).

### Security / privacy
- [ ] **Vault password lock** — optional master password to decrypt the vault (currently relies on the machine-bound key alone).
- [ ] **Auto-lock on idle** — re-encrypt the vault in memory after N minutes of launcher inactivity.
- [ ] **Per-region tracker blocklist updates** — ship region-specific blocklists (BR/NA/EU/HK have different tracker domains).

### Platform
- [ ] **macOS build** — currently Linux + Windows only. Flash PPAPI on macOS is tricky (Apple deprecated it in 2020), but Clean Flash might work. Low priority.
- [ ] **Portable Linux build** — single-file AppImage that doesn't write to `~/.shinobi-launcher` (use a relative `data/` folder). Useful for USB-stick play.
- [ ] **Auto-update** — currently manual. Electron's `autoUpdater` doesn't work with AppImage + portable EXE; would need a custom update flow.

### Community
- [ ] **Preset sharing** — export/import optimization presets as a shareable JSON file (so community members can share "best FPS for Intel UHD 620" configs).
- [ ] **Event timezone override** — let users manually set their timezone per region (currently auto-detected from the OS).

## What we won't add

- **Bots / auto-play** — against the game's ToS and would get accounts banned.
- **In-game overlays that inject into the SWF** — too fragile, breaks on every game update.
- **Telemetry / analytics** — the launcher is zero-tracking by design.
- **Mobile support** — the launcher is PC-only by design (Flash PPAPI can't run on mobile).

## How to propose a feature

Open an [issue](https://github.com/Chrispsz/naruto-online-launcher/issues) with the `feature-request` label. Describe the use case (not just the solution) — we'll discuss the design before implementation.
