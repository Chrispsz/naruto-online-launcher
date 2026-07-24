# Changelog

All notable changes to **Shinobi Launcher** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

> **Pre-v1.0.0 history**
>
> This repository was squashed to a single commit on 2026-07-21 to establish a
> clean public baseline. The full pre-squash history (153 commits, v4.9.2 →
> v5.26.0) is preserved locally in the `archive/v5-messy` branch and is
> available to maintainers on request. The changelog below starts at v1.0.0.

---

## [1.3.0] — 2026-07-25

### Added — Test Coverage (+80 tests, 7 previously-untested modules)
- `src/__tests__/main.test.js` — 14 tests covering bootstrap orchestrator (MESA env IIFE, flags.applyAll, app.on/process.on registrations, app.ready success + flashPath=null error paths, launchGameForProfile delegation).
- `src/__tests__/preload.test.js` — 8 tests covering contextBridge exposures (__SHINOBI_DEBUG__, narutoLauncher API, DEBUG env propagation, exactly-2-keys invariant).
- `src/memory/__tests__/guard.test.js` — 12 tests covering the guard↔MemoryGuard alias identity, 9 export-shape checks, shared-state via reportCrash + setForceLowSpec threshold propagation.
- `src/ui/__tests__/app.test.js` — 10 tests for the renderer with a hand-rolled DOM mock (window.api shape, IPC delegations, 5 ipcRenderer.on channels, manager:ready send, dynamic-scale at 3 screen widths).
- `src/ui/__tests__/controller.test.js` — 13 tests covering facade delegation (createManagerWindow/showManager wire onReady=pushAll, 4 aliased-refs identity checks).
- `src/ui/__tests__/game-launcher.test.js` — 9 tests covering facade re-export identity, 5 export-shape checks, 3 delegation checks.
- `src/ui/__tests__/server-selector.test.js` — 14 tests covering net.request success path with parse/sort/User-Agent, s9999 filter, dedup, locale map, HTTP/error/throw paths, cache hit, clearCache(region) vs clearCache().

### Added — Performance Helpers
- `src/utils/throttle.js` — zero-dependency `debounce` + `throttle` helpers with `flush`/`cancel` and leading/trailing edge options. Pure CommonJS so both main and renderer can require it.
- `src/utils/__tests__/throttle.test.js` — 34 unit tests (validation, trailing/leading edges, flush/cancel, 100-call burst coalescing).

### Security — Hardening (2 fixes applied)
- **CRITICAL** `src/app/Launcher.js`: removed `webSecurity: false` and `allowRunningInsecureContent: true` from the game BrowserWindow. Defaults now in effect (webSecurity:true, allowRunningInsecureContent:false). Game login still works over HTTP because the cookies layer sets `secure=false` on game cookies — same-origin requests are unaffected.
- **HIGH** `src/ui/setup/setup.html`: added strict CSP meta tag (`default-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline';`) matching the policy already applied to `index.html`. Closes a gap where the first-run setup window (loaded via `file://`) had no CSP.

### Security — Verified Compliant
- PBKDF2 iterations: 200,000 (2× OWASP 2023 minimum, SHA-512, 32-byte salt).
- `enableRemoteModule`: not used anywhere.
- `preload.js`: uses `contextBridge.exposeInMainWorld` exclusively — no `require`/`eval`/`process` exposure.
- No hardcoded secrets (ripgrep sweep clean).
- IPC input validation: comprehensive across 45+ handlers in IpcRouter.js + 4 in main.js (type checks + length caps + allowlists).

### Security — Deferred (with rationale)
- Electron 11.5.0 is EOL (3+ years past). Pinned for PPAPI Flash support (last Electron version with PPAPI). Upgrading requires migrating to Ruffle (Flash-in-WASM) — architectural decision beyond this release.
- `src/ui/manager/ManagerWindow.js` `nodeIntegration:true, contextIsolation:false` — test explicitly asserts the insecure values; full preload-based refactor required before this can land.
- Chromium sandbox disabled via `flags.js` (`no-sandbox`, `disable-gpu-sandbox`, `disable-setuid-sandbox`) — required for Flash PPAPI on Linux.

### Performance — Hardening (1 fix applied)
- `src/ui/app.js`: wrapped `renderProfiles()` calls in `auto-login:status` + `game-window:status` IPC handlers with 16ms trailing-edge debounce. When a game launches, 3-5 IPC events fire in <100ms — debouncing collapses the burst into one DOM render instead of N rebuilds.

### Performance — Verified OK
- `EventTimers.fired` Map already mitigated in source: max-size 200 + 3h TTL eviction + cached `occ` timestamp for O(1) cleanup comparisons.
- `PasswordManager.getMachineKey()` already cached via `_cachedKey`.
- `CryptoService.deriveKey` intentionally not cached (unique salt per backup export).
- All `setInterval`s properly cleared on shutdown/window-close. No listener leaks.

### Changed — CI/CD
- `build-release.yml`: Node 16.20.2 → 20 LTS (EOL alignment).
- `build-release.yml`: removed `branches: [main]` push trigger — tag-gated only, saves multi-OS build minutes on every main commit.
- `build-release.yml`: added `--ignore-scripts` to `npm install` (supply-chain hardening).
- `ci.yml`: added `permissions: contents: read` (least-privilege).
- `ci.yml`: added `--no-audit --no-fund` to `npm install` (consistent with build-release).
- `ci.yml`: added `ESLINT_USE_FLAT_CONFIG` env to lint step (explicit config).

### Verified
- 1240/1240 tests pass (45/45 suites), lint clean.
- Test delta: 1126 → 1240 (+114), suites: 37 → 45 (+8).

## [1.2.0] — 2026-07-25

### Changed
- Codebase fully professionalized to English: ~1230 PT→EN renames across comments, identifiers, log messages, and runtime strings (cycles 6–15).
- 4 previously-deferred HIGH audit items resolved via i18n ternary integration in `app.js` (prompt dialogs + button labels).
- All 87 audit findings from Cycle 14 closed.

### Fixed
- Test fixtures updated to match EN string changes (IpcRouter profile clone suffix).

### Verified
- 1101/1101 tests pass (37/37 suites), lint clean.

## [Unreleased]

### Added
- `src/network/request-logger.js` — per-profile JSONL request/response logger with size-based rotation (5 MB) and 3-day retention. Privacy-first: default OFF, sensitive headers (Cookie/Authorization) redacted, non-blocking I/O. Companion to `inspector.js` (which keeps aggregate stats only).
- `src/app/Auditor.js` — Phase 1 of per-profile session metadata collection (playtime, session count, event triggers, stalls, network errors, crashes, auto-reloads). In-memory + throttled persistence to `userData/audit/<profileId>.json` (atomic write, 90-day retention). Not yet wired into `SessionLifecycle` — Phase 2 will add hooks + UI panel.
- `tools/ai-eval.js` — OpenRouter-powered AI code review pipeline. Uses free-tier models (`nvidia/nemotron-3-ultra-550b:free`, `google/gemma-4-31b:free`, `poolside/laguna-m.1:free`) with focus modes (security / refactor / all). Two eval runs already produced: `.launcher-research-backup/eval-2026-07-22T13-07-27-security.md` (4/10) and `eval-2026-07-22T13-09-18-refactor.md` (6.5/10).
- `.launcher-research-backup/ai-apis-research.md` — full survey of free AI API providers (OpenRouter `:free`, Google AI Studio, Groq, Hugging Face, Cloudflare Workers AI, GitHub Models) with rate limits, context windows, and recommended stack for the launcher.
- `RESEARCH.md` — competitive analysis of the Naruto Online launcher ecosystem (5 direct competitors, 6 community tools, 9 player pain points mapped to feature opportunities).
- `HOW_THEY_MODIFY_FLASH.md` — technical breakdown of the 4 techniques used by modded launchers (network interception, renderer JS injection, direct API querying, OS-level memory manipulation). Documents which are safe to replicate and which cross the ToS line.
- `STRATEGY.md` — strategic positioning document. Maps the competitive landscape into a 2×2 (open/closed × free/paid), identifies Naruto Online Nexus as the most advanced competitor (Next.js SPA with user accounts), and proposes a 90-day plan across 4 versions.
- `SCOPE.md` — refined product philosophy: "best at what we do, link to the rest". Defines the HTTP interception architecture for non-cheat, transparent data use, and the dividing line between diagnostic/advisory features (in scope) and gameplay-state features (out of scope, cheat-adjacent).

### Changed
- Code-polish passes (17 cron runs, 7 productive): sealed real memory leak in `EventTimers.js` `fired` Map (never cleared), removed redundant `_relTimeTimer` polling in `ui/app.js`, pruned 161 lines of dead CSS selectors in `styles.css`, removed 19 tombstone comments across `preload.js`, `main.js`, `tempmail.js`, `i18n.js`, `preview-mock.js`. Net −420 lines across 8 files with zero functional regression.

## [1.1.2] — 2026-07-24

### Changed
- Removed `GcDaemon` — forced GC on main every 50 MB was a useless optimization (`94b587b`).
- 6-cluster alignment + dead code removal + leak fixes (v1.1.1 commit, shipped under the v1.1.2 tag).
- Wired `Auditor` into `SessionLifecycle` (Phase 2 of per-profile session metadata collection).
- Added `src/network/request-logger.js` (per-profile JSONL request/response logger with 5 MB rotation + 3-day retention) and `src/app/Auditor.js` (Phase 1).
- Added `tools/ai-eval.js` AI code-review pipeline + research notes (`RESEARCH.md`, `STRATEGY.md`, `SCOPE.md`, `HOW_THEY_MODIFY_FLASH.md`).
- Code-polish cron passes — net −420 lines (sealed memory leak in `EventTimers.js` `fired` Map, pruned 161 lines of dead CSS, removed 19 tombstone comments).
- Removed `FlashUpdater` — Flash is EOL, binaries committed in repo; scrubbed references across docs.
- Cleaned up redundant docs + trimmed CHANGELOG to v1.0.0 baseline.

## [1.0.0] — 2026-07-21

### Summary
First public release. Squashed from 153 pre-squash commits (v4.9.2 → v5.26.0) into a single clean commit to establish a professional baseline.

### Core capabilities
- **Multi-account, fully isolated** — each account gets its own Chromium session partition (`persist:profile-<id>`). Cookies, localStorage, cache, and service workers are 100% isolated.
- **Encrypted credential vault** — AES-256-GCM + PBKDF2-SHA512 (100k iterations on-disk, 200k for master-password backups). Machine-bound key.
- **Multi-region event reminders** — 4 server clusters (BR / NA / EU / HK), 11 events per region, DST auto-detected, native desktop notifications N minutes before each event.
- **Memory guard daemon** — samples RSS every 5 min (2 min in Modo Low-Spec); triggers layered GC (idle-session `clearCache()` + `process.gc(true)` + Windows `EmptyWorkingSet`) when memory crosses 700 MB normal / 450 MB low-spec thresholds.
- **Stall auto-recovery** — 3 retries within 10 min, auto re-login via form injection + API pre-auth, self-disabling after 120s stable.
- **Modo Low-Spec (low-end PC mode)** — auto-enabled on <4 GB RAM, or manually forced. Writes `EnableHardwareAcceleration=0` + `AssetCacheSize=0` + `AutoUpdateDisable=1` to `mms.cfg`.
- **Temp email for alt accounts** — mail.tm integration, rate-limited to 5 accounts/hour, captures 2h JWT login key automatically.
- **Tracker blocking** — WebRequest-level filter for known tracker domains (Google Analytics, DoubleClick, Facebook pixels, Oasgames analytics). Game API endpoints explicitly whitelisted.
- **Cross-platform** — Linux (AppImage) + Windows (portable EXE). Zero tracking, zero dependencies, FUSE-free.
- **Bilingual** — EN + PT-BR UI and documentation.

### Testing
- **1235 unit tests** across 38 Jest suites — all passing.
- **18 end-to-end tests** across 3 Playwright spec files (smoke / accounts flow / settings flow) — all passing.
- ESLint clean. Prettier clean.

### Documentation
- `README.md` (516 lines, bilingual EN+PT) — comprehensive project overview, honest technical claims, security model, install/dev/test commands.
- `ARCHITECTURE.md` (785 lines, bilingual) — deep-dive with ASCII diagrams: process model, boot sequence, IPC flow, vault crypto flow, launch sequence, memory management, event timers.
- `FLASH_SETUP.md` (293 lines, bilingual) — Flash PPAPI acquisition guide, auto-loader internals, troubleshooting.
- `ROADMAP.md` (280 lines, bilingual) — modo automático feasibility assessment, 7 innovation directions, 10-item technical debt list.
- `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md` — community and security docs.

### Professionalization
- MIT license.
- GitHub Issue templates (bug report + feature request) + PR template.
- CI workflow (lint + test + preview build on every push).
- Build & Release workflow (Linux AppImage + Windows portable, triggered on `v*` tags).
- GitHub topics: `electron`, `flash`, `ppapi`, `naruto-online`, `launcher`, `game-launcher`, `privacy`, `cross-platform`, `linux`, `windows`.
- GitHub Release v1.0.0 with full release notes.

### Credits
- **Clean Flash builds** — [`darktohka/clean-flash-builds`](https://github.com/darktohka/clean-flash-builds) (Linux v1.7, Windows v1.54).
- **Community** — the Naruto Online BR/NA/EU/HK player base, for event-schedule validation and feedback.
