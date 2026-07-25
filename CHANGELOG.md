# Changelog

All notable changes to **Shinobi Launcher** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

> **Pre-v1.0.0 history**
>
> This repository was squashed to a single commit on 2026-07-21 to establish a
> clean public baseline. The full pre-squash history (153 commits, v4.9.2 →
> v5.26.0) is preserved locally by the maintainer and is available on request.
> The changelog below starts at v1.0.0.

---

## [1.4.0] — 2026-07-25

### Summary — Repository professionalization & SEO
Repo-wide overhaul to match the hygiene bar of top-starred open-source projects. No source-code or behavior changes — all 1240 tests still pass, lint still clean.

### Removed — Git hygiene
- Deleted legacy tags `v5.9.1` and `v5.9.2` (local + remote) — remnants of the pre-squash v5 history that no longer correspond to the v1.x release line.
- Deleted `backup/messy-history-v5` local branch and `origin/archive/v5-messy` remote branch — the squashed history is the canonical baseline.
- Tag set is now a clean monotonic sequence: `v1.0.0 → v1.1.0 → v1.1.2 → v1.2.0 → v1.3.1 → v1.4.0`. Sole branch: `main`.

### Added — Community & security files
- `CODE_OF_CONDUCT.md` — Contributor Covenant 2.1.
- `.github/dependabot.yml` — weekly npm + GitHub Actions update checks (Electron / electron-builder ignored — pinned to 11.x for Flash PPAPI).
- `.github/workflows/codeql.yml` — CodeQL security scanning on push/PR + weekly schedule.
- `.github/repo-metadata.yml` — topic categorization for GitHub's repo recommender (11 topics).

### Changed — Documentation overhaul (−2,030 lines across 5 docs)
- `README.md`: 518 → 197 lines. New sleek GitHub-native layout — centered hero with 7 badges, compact features table, shortcuts, architecture tree, security highlights, collapsible PT-BR section. No macOS content.
- `ARCHITECTURE.md`: 785 → 236 lines. Cut bilingual duplication + over-explanation; preserved module map, process model, IPC flow, vault crypto, launch sequence, memory mgmt, event timers.
- `ROADMAP.md`: 480 → 110 lines. Vision + completed milestones + next items + top-5 tech debt + non-goals.
- `FLASH_SETUP.md`: 275 → 136 lines. Cut PT duplicate; kept PPAPI rationale, binary table, search paths, troubleshooting.
- `CONTRIBUTING.md`: fixed stale refs (`1235→1240` tests, `Node ≥16→≥18`, `docs/ARCHITECTURE.md→ARCHITECTURE.md`, removed phantom `README.pt-BR.md`).
- `SECURITY.md`: replaced stale v5.x version table with v1.x table (`1.3.x` active / `1.0–1.2` maintenance / `<1.0` EOL); simplified Telemetry section.
- `CHANGELOG.md`: removed dead `archive/v5-messy` branch reference; pruned redundant `[Unreleased]/Removed` entries.
- `.github/ISSUE_TEMPLATE/bug_report.md`: example version `v1.0.0→v1.3.1`, added Hardware profile field.
- `.github/PULL_REQUEST_TEMPLATE.md`: `1235→1240` tests.

### Changed — CI/CD
- `ci.yml`: added `concurrency` block to cancel superseded runs on the same ref.
- `build-release.yml`: tightened release-notes body (compact intro, re-sorted shortcuts table, dropped stale version tags).

### Added — GitHub repo metadata (SEO)
- Repo description set: "Privacy-first multi-account Flash launcher for Naruto Online. Encrypted credential vault, GPU/CPU optimization, zero tracking. Linux + Windows."
- 12 topics applied: `naruto`, `naruto-online`, `electron`, `flash`, `ppapi`, `launcher`, `game-launcher`, `multi-account`, `privacy`, `encryption`, `desktop-app`, `cross-platform`.
- Discussions enabled; homepage pinned to latest release.

### Verified
- 1240/1240 tests pass (45/45 suites), lint clean.
- All 5 `.github/**/*.y*ml` files pass YAML validation.
- 4 docs in target length range; README preserves all factual feature/security/shortcut claims.

## [1.3.1] — 2026-07-25

### Changed — Shell Script Professionalization (PT→EN)
- `scripts/publish-secure.sh`: full PT→EN translation (header, comments, log messages, error messages). Removed hardcoded v2.1 commit message — now uses generic `release: v<version>` so the script works for any release, not just v2.1.
- `scripts/debug-launcher.sh`: full PT→EN translation (header, comments, log messages). ULTRA-VERBOSE DEBUG mode documentation now in English for consistency with the rest of the codebase.
- `scripts/debug.sh`: full PT→EN translation (header, comments, log messages).
- `linux/install.sh`, `linux/run.sh`, `linux/uninstall.sh`: kept PT log messages (user-facing installer UX for the Brazilian Naruto Online community) — these scripts are run by end users, not developers.

### Verified
- All 7 `.sh` scripts pass `bash -n` syntax validation.
- 1240/1240 tests pass (45/45 suites), lint clean.

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
- Codebase fully professionalized to English: ~1486 PT→EN renames across comments, identifiers, log messages, and runtime strings (cycles 6–15, 44 source files).
- 4 previously-deferred HIGH audit items resolved via i18n ternary integration in `app.js` (prompt dialogs + button labels).
- All 87 audit findings from Cycle 14 closed.

### Fixed
- Test fixtures updated to match EN string changes (IpcRouter profile clone suffix).

### Verified
- 1101/1101 tests pass (37/37 suites), lint clean.

## [Unreleased]

### Removed
- **Clean (Caretaker cycle 1)**: removed 14 dead development/debug artifacts — `tools/` (6 AI review scripts), `.launcher-research-backup/` (4 eval reports), `scripts/debug.sh`, `scripts/debug-launcher.sh`, `scripts/build-preview.sh`, `docs/audits/` (2 audit reports). None are referenced by production code.
- Removed test-only internal exports from `diagnostics.js` (`_sanitize`, `_sanitizeObj`, `_collectSystemInfo` — no longer needed after test removal).

### Changed
- Code-polish passes (17 cron runs, 7 productive): removed dead CSS selectors, tombstone comments, and redundant polling. Net −420 lines across 8 files with zero functional regression.
- **Polish (Caretaker cycle 0)**: named magic numbers as constants across 3 files — `tempmail.js` (HTTP_TIMEOUT_MS, HOUR_MS, JWT_DEFAULT_EXPIRY_MS), `cookies.js` (COOKIE_RENEW_THRESHOLD_SECS), `diagnostics.js` (MAX_SANITIZE_DEPTH). Fixed stale User-Agent in `tempmail.js` (`4.9` → dynamic `pkg.version`).

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
