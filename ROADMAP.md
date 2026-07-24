# Shinobi Launcher — Roadmap

> Strategic direction for Shinobi Launcher. Updated through v1.3.1.

---

## Vision

Shinobi Launcher aims to be the most transparent, privacy-respecting multi-account launcher for Naruto Online: best-in-class session isolation, real performance tuning, and a growing diagnostic/UX layer — without ever crossing into botting, telemetry, or platform lock-in. The roadmap prioritizes stability and honest scope over feature churn. The long-term differentiator is a transparency layer (network auditor, server-health indicators, session-expiry prediction) that no competing launcher currently ships.

---

## Design principles

Every release must respect four constraints, in priority order:

1. **Privacy first.** No telemetry, no phone-home, no crash reporting. The only network call the project makes is the GitHub Actions build on tag push.
2. **Lean runtime.** One runtime dependency (`electron-log`). No GPU-heavy effects (backdrop-filter, parallax). All `setInterval`s are `.unref()`'d and cleaned up on close.
3. **Honest scope.** No botting, no auto-farming, no auto-reward claiming — these violate the game's ToS and turn a launcher into a bot.
4. **Preserve the public API.** When refactoring a god-object, keep a facade module so callers (and tests) don't change.

---

## Completed

Major milestones in the public history (post-v1.0.0 squash):

- **v1.0.0** — First public release. Squashed the legacy v4.x/v5.x history into a clean single commit; GitHub Release with full notes. Multi-account runtime, AES-256-GCM machine-bound vault, EventTimers (4 regions, DST-aware), MemoryGuard + GcDaemon, Flash PPAPI native, F5/F8/F12 shortcuts.
- **v1.0.1** — Removed `FlashUpdater` auto-download fallback (legal/size); Flash binary is now user-supplied. Removed `tempmail.readInbox()`. Documented recovery in `FLASH_SETUP.md`.
- **v1.1.0** — 6-region cluster model (br/na/de/es/pl/fr) with SVG flag icons (font-independent — renders identically on Windows/Linux/macOS); license headers across all source files; `SHINOBI_DEBUG` boot flag + Ctrl+Shift+D UI toggle; Dev Tools tab hidden by default.
- **v1.1.1** — 6-cluster alignment across launcher + site mock; dead-code removal (10 unused React components, 1 orphan mock file, `request-logger.js`, `configureFlash()`, no-op `injectGC`); renderer interval leak fixes; net -876 lines.
- **v1.2.0** — Professionalization pass: `Auditor.js` (network request inspection, dev-only via F3), HTTP diagnostics scaffolding, server-health indicators, memory-audit cycle confirmed 10/10 (zero synchronous I/O in hot paths, zero unbounded Maps/Sets, zero DOM queries in loops).
- **v1.3.0** — Coverage + security + perf: Playwright E2E smoke suite added, `beforeunload` cleanup on all renderer intervals, stale version-tag sweep across source, `renderProfiles` IPC debounced, CSS duplicate-selector merge.
- **v1.3.1** — Shell script professionalization: 3 dev-facing scripts translated PT→EN with `set -euo pipefail`, `bash -n` validated. Tag pushed; GitHub Actions build-release triggered (Linux AppImage + Windows portable).

Test baseline at v1.3.1: 1240 unit/integration tests across 45 suites, lint clean. Memory audit: 10/10 (no leak regressions).

---

## In progress / Next

Concrete items queued for v1.4.0 and beyond. Items are ordered by priority; complexity ratings in brackets.

- **ManagerWindow preload refactor** [M] — Split `IpcRouter.js` (~800 lines, ~50 handlers) into domain-specific files (profile, vault, dev, events, inspector). Same treatment for `SessionLifecycle.js` (766 lines). Keep the facade so `main.js` and tests don't change.
- **E2E test expansion** [S-M] — Broaden Playwright coverage beyond the smoke suite. Priority paths: close→launch race conditions, crash-loop cap (3-in-10-min), `StallDetector` → `reloadWithPreAuth` flow.
- **Real-OS CI** [M] — Add Windows + macOS CI runners. Electron APIs in `Launcher.js` are mocked in unit tests but never run against a real Electron build on those platforms. Needs CI budget.
- **Profile statistics dashboard** [S] — Consume the existing `profile:get-stats` / `profile:launch-timeline` / `profile:launch-log-stats` IPC channels into a renderer-only Stats view. Zero backend changes; data is already collected.
- **Built-in screenshot manager** [S] — Restore the `launcher:screenshot` channel (currently a dead comment in `preload.js` line 10) with a real handler + Ctrl+Shift+S hotkey + gallery view. Resolves the trivial-debt item below.
- **Discord webhook for event notifications** [S] — New `src/notifications/DiscordWebhook.js` registering on `EventTimers.onRemind`/`onEnd`. ~50 lines + a `config.json` field for the webhook URL.
- **Multi-account concurrent launch** [S] — `profiles:launch-all` IPC + UI button with a hardware advisory (`src/config/hardware.js` already detects RAM/GPU). N concurrent Flash instances are CPU/RAM-heavy.
- **Ruffle migration exploration** [L, research only] — Spike a PPAPI-free renderer path using Ruffle (WebAssembly Flash emulator) to deprecate the binary Flash dependency long-term. No commitment; first step is a proof-of-concept against the game's login flow.

Deferred to v1.5.0+: smart region routing (latency-aware region picker), cloud sync for the encrypted vault (OAuth + sync engine), attended macro recorder (ToS-sensitive, needs framing decision).

---

## Future innovation directions

Validated against the current codebase. Each is technically sound; complexity and priority noted. Listed here so they aren't lost between releases.

- **Smart region routing** [M] — TCP-ping each of the 4 server regions on launch (cached 30 min, async — does not block the click). Auto-select lowest-latency or surface latency badges in the UI. New `src/network/ping.js` + `regions.js` host list.
- **Cloud sync for the encrypted vault** [M] — Sync the encrypted `vault.json` blob across devices via WebDAV/Google Drive/Dropbox. The crypto is already sound (`vault:export-encrypted` produces the blob); the lift is OAuth + sync orchestration with conflict detection.
- **Attended macro recorder** [M-L, ToS-sensitive] — Record + replay mouse/keyboard sequences per profile via `webContents.sendInputEvent()`. Must be framed as attended assistance (user at keyboard triggers replay), default OFF, with explicit ToS disclosure. Skip if the project wants to stay strictly ToS-clean.
- **Concurrent multi-account launch advisory** [S] — Already in the Next list above; the hardware advisory (N concurrent Flash instances are RAM/CPU-heavy) is the only nuance.
- **Shinobi Sensei AI advisor** [L, research] — LLM-powered advisor that reads the Auditor's network data and surfaces suggestions (e.g., "you have 3 unredeemed gift codes", "this server's response time degraded 40% in the last hour"). No competitor has this; depends on Auditor maturity first.

---

## Modo automático — feasibility summary

A full "automatic mode" was assessed across six sub-capabilities. The "session automation" half is feasible; the "gameplay automation" half is botting and is excluded.

- **Auto-launch on schedule** — Easy. `EventTimers.js` already has the 30s polling loop and timezone math; a per-profile `autoLaunchSchedule` field + branch in the polling loop is all that's needed.
- **Keep-alive / anti-idle** — Medium. `webContents.sendInputEvent({type:'mouseMove'})` is the clean approach. ToS gray zone — defer to v1.5.0+, default OFF, label "anti-idle" not "bot".
- **Auto-stall recovery** — Already exists in `StallDetector.js` (2+ SWF failures in 60s or 45s idle → `reloadWithPreAuth`, self-disables after 120s stable).
- **Auto-account switching** — Medium. Sequential queue runner (`closeProfile(current)` → wait `closed` → `launchProfile(next)`), ~80–120 lines. Risk is in close→launch timing edge cases that need E2E coverage.
- **Auto-event farming** — Not feasible as a launcher feature. Requires pixel detection or Flash process memory reading; ToS violation; belongs in separate botting tools the user owns.
- **Auto-daily reward claim** — Not recommended. Pixel/OCR brittleness, high maintenance, same ToS gray zone as farming.

**Recommended MVP scope (v1.4.0 or v1.5.0):** scheduled launch + stall recovery (already exists) + sequential account switching. Explicitly excluded from MVP: farming, reward claiming, anti-idle (deferred). See git history (`messy-history-v5` backup branch) for the full per-capability analysis with line references.

---

## Technical debt

Top 5 items, in priority order:

1. **`IpcRouter.js` + `SessionLifecycle.js` size** — 800 + 766 lines mixing concerns; split into domain-specific modules (pays off as features land).
2. **No CI on Windows/macOS** — Electron APIs in `Launcher.js` are mocked in unit tests but never run against a real Electron build on those platforms.
3. **CSS near-duplicates** — `styles.css` is ~1884 lines with repeated selectors; merge obvious duplicates, no full rewrite.
4. **Dead `launcher:screenshot` comment in `preload.js`** — trivial; fixed by the screenshot-manager feature above.
5. **Flash binary not bundled** — by design (legal/size); Linux users must source `libpepflashplayer.so` manually. Documented in `FLASH_SETUP.md`.

---

## Non-goals

Explicitly out of scope, now and in future versions:

- **No telemetry or auto-updater phone-home.** The launcher never reports usage, crashes, or account data anywhere. Updates are user-initiated (download from GitHub Releases). No background update checks.
- **No macOS build.** Flash PPAPI on macOS is unsupported by `clean-flash-builds`; the launcher targets Linux AppImage + Windows portable only.
- **No botting.** Auto-event farming, auto-reward claiming, and unattended macro playback are excluded by policy — they violate the game's ToS and would turn the launcher into a bot.
- **No account selling, brokering, or sharing.** The launcher is a personal-use multi-account tool. The tempmail feature exists for legitimate alt-account creation by the user themselves.

---

## Release cadence

Releases are tag-driven: a `vX.Y.Z` annotated tag push triggers `build-release.yml` on GitHub Actions, which produces the Linux AppImage and Windows portable artifacts attached to the GitHub Release. There is no fixed calendar cadence — releases ship when a coherent set of items from the *In progress* list above is ready, or when a regression warrants a patch. Patch releases (`.Z` bump) are reserved for bugfixes and dependency updates; minor releases (`.Y` bump) carry new features; major releases (`.X` bump) would require a runtime or threat-model change (e.g., Ruffle migration, vault format v2).

