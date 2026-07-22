# Changelog

All notable changes to **Shinobi Launcher** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

> **Pre-v1.0.0 history**
>
> This repository was squashed to a single commit on 2026-07-21 to establish a
> clean public baseline. The full pre-squash history (153 commits, v4.9.2 →
> v5.26.0) is preserved locally in the `backup/messy-history-v5` branch and is
> available to maintainers on request. The changelog below starts at v1.0.0.

---

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

## [1.0.0] — 2026-07-21

### Summary
First public release. Squashed from 153 pre-squash commits (v4.9.2 → v5.26.0) into a single clean commit to establish a professional baseline.

### Core capabilities
- **Multi-account, fully isolated** — each account gets its own Chromium session partition (`persist:profile-<id>`). Cookies, localStorage, cache, and service workers are 100% isolated.
- **Encrypted credential vault** — AES-256-GCM + PBKDF2-SHA512 (100k iterations on-disk, 200k for master-password backups). Machine-bound key.
- **Multi-region event reminders** — 4 server clusters (BR / NA / EU / HK), 11 events per region, DST auto-detected, native desktop notifications N minutes before each event.
- **Memory guard daemon** — samples RSS every 5 min (2 min in Modo Batata); triggers layered GC (idle-session `clearCache()` + `process.gc(true)` + Windows `EmptyWorkingSet`) when memory crosses 700 MB normal / 450 MB low-spec thresholds.
- **Stall auto-recovery** — 3 retries within 10 min, auto re-login via form injection + API pre-auth, self-disabling after 120s stable.
- **Modo Batata (low-end PC mode)** — auto-enabled on <4 GB RAM, or manually forced. Writes `EnableHardwareAcceleration=0` + `AssetCacheSize=0` + `AutoUpdateDisable=1` to `mms.cfg`.
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
