# Shinobi Launcher — Roadmap v5.26.0 and beyond
# Roadmap do Shinobi Launcher — v5.26.0 em diante

This document is the strategic roadmap for the Shinobi Launcher. It is split into
three sections: (1) a feasibility assessment of the hypothetical **"modo
automático"** (automatic mode), (2) a set of innovation directions independent of
auto-mode, and (3) an honest accounting of technical debt with prioritization
for v5.27.0.

Each section is written in English first, followed by a Portuguese summary
(`Resumo PT`) covering the headers and key conclusions. Code references point to
real files and functions in `src/`.

---

## Section 1 — Modo Automático: Feasibility Assessment
## Seção 1 — Modo Automático: Avaliação de Viabilidade

"Modo automático" is defined here as a launcher feature that fully automates the
gameplay loop: launch on schedule, keep the session alive, recover from stalls,
switch accounts on a queue, and farm in-game events / daily rewards without user
input. We assess each sub-capability independently, then give a verdict.

### 1.1 Auto-launch on schedule — Feasibility: Easy

**What exists.** `src/utils/EventTimers.js` already implements the entire
scheduling substrate:

- A 30-second polling loop in `start()` that walks every active region's events
  and compares `nextOccurrenceMs()` against `Date.now()` (lines 398-438).
- Timezone math for all four server regions (`br`, `na`, `eu`, `hk`) including
  DST detection in `getServerOffsetHours()` (lines 139-147).
- `nextOccurrenceMs(region, serverHour, days)` already handles weekday filters
  (lines 162-179).

**What is needed.** A small branch in the polling loop: instead of (or in
addition to) calling `showNotification()`, call `Launcher.launchProfile(id)` for
any profile whose `autoLaunchSchedule` matches the current slot. The launcher
API (`src/app/Launcher.js`, lines 87-210) is already idempotent — re-calling
`launchProfile()` on an open profile focuses the existing window rather than
opening a duplicate (lines 95-103).

**Limitation.** This only works while the Electron process is running. If the
user fully quits the launcher, the OS-level task scheduler (Windows Task
Scheduler, `launchd`, `cron`) becomes responsible — that is out of scope for a
launcher feature and should be documented, not built.

**Verdict.** Easy. Existing infrastructure covers ~90% of the work; only a
per-profile schedule field, an IPC handler, a UI toggle, and a few lines in
`EventTimers.start()` are needed.

### 1.2 Keep-alive / anti-idle — Feasibility: Medium (with risk)

**Goal.** Prevent the game from auto-logging-out after a period of inactivity.

**Approaches.**

- **Simulated input events.** Electron's `webContents.sendInputEvent({type:'mouseMove', ...})`
  can dispatch synthetic mouse-move events to the game window without moving
  the OS cursor. This is the cleanest approach. The infrastructure to target a
  specific profile's webContents already exists: `Launcher.getWebContents(profileId)`
  (lines 251-256).
- **JS injection.** `webContents.executeJavaScript()` could call any
  heartbeat-style function the game exposes. Risk: Naruto Online is a Flash
  game running inside an `<embed>` / `<object>` tag; the inner ActionScript
  heartbeat is not reachable from the JS context. This approach is unlikely to
  work without reverse engineering.
- **Keep-alive packets.** Would require reverse-engineering the game's network
  protocol and forging packets via `session.webRequest`. Not feasible and not
  worth the maintenance cost.

**Anti-bot risk.** Naruto Online is a legacy Flash title with a small player
base; formal anti-bot detection is likely minimal but unverified. Synthetic
mouse movement to prevent idle logout is in a legal/ToS gray zone — it is the
same category as "jiggle the mouse" utilities. We cannot guarantee the
publisher will tolerate it.

**Verdict.** Medium. The technical implementation is small (a 30-60s interval
sending `mouseMove` events). The risk is policy, not engineering. Recommendation:
build it, label it "anti-idle" rather than "bot", default it OFF, and document
the risk in the UI.

### 1.3 Auto-stall recovery — Feasibility: Easy (already exists)

**What exists.** `src/app/StallDetector.js` is a complete watchdog:

- Detects loader stalls: 45s without network activity OR a burst of 2+ failed
  SWF downloads in 60s (DEFAULTS, lines 44-52).
- Auto-recovers by calling the `onStall` callback, which `SessionLifecycle`
  wires to `reloadWithPreAuth()` (same path as the F5 shortcut).
- Self-limits to 3 auto-reloads per 10-minute window (lines 150-163) to prevent
  infinite loops when the server is genuinely down.
- Self-disables after 120s of stable activity (lines 138-148) so it does not
  waste CPU during active gameplay.

**What is needed for auto-mode.** Nothing — `SessionLifecycle.attach()` already
attaches a `StallDetector` to every game window. Auto-mode just needs to ensure
the detector is not muted (it is currently always-on by default).

**Verdict.** Easy. No new code; possibly a config toggle for visibility.

### 1.4 Auto-account switching — Feasibility: Medium

**What exists.**

- `Launcher.closeProfile(id)` closes a window by profile ID (lines 229-233).
- `Launcher.launchProfile(id)` opens a new isolated window with its own
  partition (lines 87-210).
- Each profile gets a separate `partition:` (per-profile session isolation, line
  136), so closing one and opening another does not leak cookies.
- `SessionLifecycle` emits a `closed` callback (line 177) that deletes the
  registry entry — clean state for the next launch.

**What is needed.** A queue runner: given `[profileId1, profileId2, ...]`,
sequentially `closeProfile(current)` → wait for `closed` event →
`launchProfile(next)` → wait for `ready-to-show` or `did-finish-load` →
advance. This is ~80-120 lines of orchestration code, plus IPC + UI.

**Race conditions.** Closing and reopening in quick succession on the same
partition should be safe because `partition.getPartitionName(profile)` returns
a stable string per profile and Electron reuses session objects. However, the
`StallDetector` from the previous window must have detached (its `closed`
handler runs cleanup). This is already handled but should be tested with an
automated E2E test.

**Verdict.** Medium. Sequential logic is simple; the risk is in timing
edge cases (close before open completes) that need careful handling and tests.

### 1.5 Auto-event farming — Feasibility: Not feasible

**What it would require.**

- Detecting in-game events (boss spawn, dungeon open) requires either pixel
  detection on the rendered Flash frame or memory reading of the Flash process.
  Flash does not expose a DOM the launcher can introspect.
- Auto-navigating to event locations requires scripted click sequences that
  break every time the game UI changes.
- Completing events requires gameplay logic (combat, pathing, party formation) —
  this is a full bot, not a launcher feature.

**ToS conflict.** Naruto Online's EULA prohibits automation. Building this
turns the launcher into a bot, which exposes users to account bans and exposes
the project to legal risk. It is outside the scope of what a launcher should do.

**Verdict.** Not feasible as a launcher feature. Belongs in separate botting
tools that the user assumes responsibility for. The launcher should explicitly
disclaim this category.

### 1.6 Auto-daily reward claim — Feasibility: Medium-Hard (not recommended)

**What it would require.**

- Navigation to a reward NPC requires either fixed pixel coordinates (brittle
  across resolutions and game updates) or image matching against a screenshot
  (`webContents.capturePage()` + template matching).
- The claim click itself is easy once coordinates are known, but maintaining
  the image templates against game updates is high-effort.
- OCR is theoretically possible but adds heavy dependencies (tesseract.js or
  similar) for marginal benefit.

**Recommendation.** Do not build. The maintenance cost is disproportionate to
the value, and it sits in the same ToS gray zone as 1.5. If users want this,
they should use a dedicated macro tool with their own risk assessment.

**Verdict.** Medium-Hard technically, Not recommended strategically.

### Overall verdict — Modo Automático

**Feasible as a launcher feature: partially.** The "session automation" half
(scheduled launch, anti-idle, stall recovery, account switching) is feasible
and useful. The "gameplay automation" half (event farming, reward claiming) is
botting and should be excluded.

**Recommended MVP scope (v5.27.0 or v5.28.0):**

1. Auto-launch on schedule — reuses EventTimers, small lift.
2. Auto-stall recovery — already exists, just enable by default in auto-mode.
3. Auto-account switching — sequential queue runner.

**Explicitly excluded from MVP and from the project scope:**

- Auto-event farming (1.5) — botting, ToS violation.
- Auto-reward claiming (1.6) — fragile, gray-zone, high maintenance.
- Keep-alive / anti-idle (1.2) — defer to v5.29.0+; needs a clear "attended
  anti-idle" framing and a default-OFF toggle, plus explicit ToS disclosure
  in the UI.

### Resumo PT — Seção 1

**Veredito geral:** o "modo automático" é viável **parcialmente** como recurso
do launcher.

- **Lançamento agendado (1.1):** Fácil. O `EventTimers.js` já tem toda a
  infraestrutura de timezone e o loop de 30s; basta chamar
  `Launcher.launchProfile()` em vez de `showNotification()`.
- **Keep-alive / anti-idle (1.2):** Médio. Técnico é simples
  (`sendInputEvent`), mas há risco de ToS — adiar para versão futura com
  toggle default OFF.
- **Auto-recuperação de stall (1.3):** Fácil — **já existe** em
  `StallDetector.js`.
- **Troca automática de contas (1.4):** Médio. Lógica sequencial simples;
  risco está em race conditions close→launch.
- **Auto-farm de eventos (1.5):** **Inviável** como recurso de launcher — é
  botting, viola ToS, exige leitura de memória ou detecção de pixels.
- **Auto-claim de recompensas (1.6):** Médio-Difícil, **não recomendado** —
  frágil, alta manutenção, zona cinzenta de ToS.

**MVP recomendado:** lançamento agendado + recuperação de stall (já existe) +
troca sequencial de contas. Excluir: farm de eventos, claim de recompensas,
keep-alive (adjar para v5.29.0+).

---

## Section 2 — Innovation Directions
## Seção 2 — Direções de Inovação

The following features are independent of auto-mode and were validated against
the existing codebase. Only technically sound proposals are included; the
backup/restore vault idea was dropped because `profiles:export-file` and
`profiles:import-file` already exist in `IpcRouter.js` (lines 715, 733).

### 2.1 Profile statistics dashboard — Complexity: S

**What it does.** A new panel in the manager UI showing per-profile and
aggregate stats: total launches, total playtime, stall frequency, last-session
duration, most-used region.

**Why users want it.** Multi-account players want to see which accounts they
actually play, how stable each server is for them, and whether their stall
recovery is firing too often (a signal of network issues).

**Why it is easy.** The data is already collected and exposed via IPC:
`profile:get-stats` (line 201), `profile:launch-timeline` (line 207),
`profile:launch-log-stats` (line 216). The work is renderer-only: a new view
in `src/ui/index.html` that consumes these channels and renders charts.

**Extends.** `src/ui/index.html`, `src/ui/app.js`, possibly a small
`src/ui/views/Stats.js` module.

### 2.2 Built-in screenshot manager — Complexity: S

**What it does.** A "Take screenshot" hotkey (e.g., Ctrl+Shift+S) while a game
window is focused, plus a gallery panel in the manager UI to browse, rename,
and delete screenshots.

**Why users want it.** Players regularly share screenshots of rare drops,
event results, and bugs. Today they use OS-level tools (Win+Shift+S, ShareX).
A built-in option tied to the profile would auto-organize captures by account
and date.

**Why it is easy.** Electron's `webContents.capturePage()` is a single async
call. The `preload.js` (lines 8-11) mentions a `launcher:screenshot` channel
that was removed in v4.1 because no handler existed — the channel can be
restored with a real handler in `IpcRouter.js`. The hotkey infrastructure
already exists: `src/ui/manager/KeyboardShortcuts.js` attaches key handlers to
game windows.

**Extends.** `src/ui/manager/IpcRouter.js` (new handler
`screenshot:capture` + `screenshot:list` + `screenshot:delete`),
`src/ui/manager/KeyboardShortcuts.js` (new hotkey), `src/ui/index.html`
(gallery view).

### 2.3 Discord webhook integration for event notifications — Complexity: S

**What it does.** Forwards event reminders and end-of-event notifications to a
user-configured Discord channel via webhook, in addition to the existing
desktop notifications.

**Why users want it.** Players in clan/guild Discord servers want event pings
in a shared channel so the whole group shows up on time. Some users also want
notifications on their phones when they are away from the PC.

**Why it is easy.** `EventTimers.js` exposes `onRemind(cb)` (line 287) and
`onEnd(cb)` (line 291) listener registration. A new
`src/notifications/DiscordWebhook.js` module that registers listeners and
POSTs to a webhook URL is ~50 lines of code. The URL is stored in
`config.json` (extend `validateConfig()` in `src/config/settings.js`).

**Extends.** New `src/notifications/DiscordWebhook.js`, `src/config/settings.js`
(new field), `src/main.js` (register listeners on boot), manager UI (settings
field).

### 2.4 Multi-account concurrent launch — Complexity: S

**What it does.** A "Launch all" or multi-select "Launch selected" button that
opens several profiles at once, each in its own window, with a resource
warning if the user picks more than 2-3.

**Why users want it.** Multi-account players (alts, mules, dual-boxing)
currently launch profiles one by one. A bulk action saves clicks and lets them
get all sessions logged in before an event window opens.

**Why it is easy.** The launcher already supports concurrent windows: the
`gameWindows` Map in `Launcher.js` (line 40) is keyed by `profileId`, and each
profile gets its own `partition:` (line 136) for full session isolation. The
work is a new IPC handler `profiles:launch-all` that loops over an array and
calls `launchProfile()` for each, plus a UI button. The only nuance is a
hardware warning — N concurrent Flash instances are CPU/RAM-heavy; the
existing hardware profile detection (`src/config/hardware.js`) can advise.

**Extends.** `src/ui/manager/IpcRouter.js` (new handler),
`src/ui/index.html` (multi-select UI + warning), `src/config/hardware.js`
(advisory lookup).

### 2.5 Smart region routing — Complexity: M

**What it does.** Before launching a profile, ping each of the four server
regions (`br`, `na`, `eu`, `hk`) and either auto-select the lowest-latency one
or display latency badges next to each region in the UI.

**Why users want it.** Players who travel or use VPNs often end up on a
sub-optimal region. A latency-aware picker removes the guesswork.

**Why it is medium.** A new `src/network/ping.js` module that opens a TCP
connection to each region's game host and measures RTT. The region list
already lives in `src/config/regions.js` and `src/config/urls.js`. The
complexity is in caching (pings should not run on every launch — maybe every
30 min) and in not blocking the launch flow (run async, show results when
ready, do not delay the click).

**Extends.** New `src/network/ping.js`, `src/config/regions.js` (host list),
`src/profiles/store.js` (optional `autoRegion` flag per profile), manager UI
(latency badges).

### 2.6 Cloud sync for encrypted vault — Complexity: M

**What it does.** Sync the encrypted profile vault across devices via a cloud
provider (Google Drive, Dropbox, or a generic WebDAV endpoint), so a user with
the launcher installed on two PCs can keep profiles in sync.

**Why users want it.** Power users with a desktop and a laptop, or users who
reinstall their OS, want their profiles (with encrypted credentials) to
follow them without manual export/import.

**Why it is medium.** The encrypted vault already exists:
`src/profiles/vault.js` is a facade over `CryptoService` + `PasswordManager` +
`ProfileVault`, and `profiles:export-encrypted` in `IpcRouter.js` (line 626)
already produces an encrypted blob. The work is: (1) an OAuth flow for the
chosen provider, (2) a sync engine that uploads the blob on change and
downloads on startup with conflict detection, (3) UI for connect/disconnect.
The crypto is already sound; the lift is the OAuth + sync orchestration.

**Extends.** `src/profiles/vault.js` (sync hook on save),
new `src/sync/CloudSync.js` + provider modules, `src/ui/manager/IpcRouter.js`
(sync IPC), manager UI (settings panel).

### 2.7 Macro recorder (attended only) — Complexity: M-L

**What it does.** A "Record" toggle in a game window that captures the user's
mouse clicks and key presses with timestamps; a "Play" hotkey that replays the
sequence. Saved macros are per-profile.

**Why users want it.** Repetitive in-game tasks (daily NPC visits, material
crafting, multiple identical purchases) take dozens of identical clicks. A
macro recorder turns this into a one-keypress replay.

**Why it is M-L.** Electron supports `webContents.sendInputEvent()` for
playback. Recording requires intercepting input events on the game window —
doable via a global keyboard/mouse hook (`electron.globalShortcut` + a
native module for mouse, or `ioHook`). The complexity is in: (1) timing
accuracy (replay must respect original inter-event delays), (2) UI for
managing saved macros, (3) clear framing as "attended macro" — the user is
present and triggers the replay; this is NOT unattended botting.

**ToS caveat.** Must be framed as attended assistance (user is at the
keyboard), not unattended automation. Default OFF, with a clear disclaimer.
This is the grayest feature in the list — if the project wants to stay
strictly ToS-clean, skip this one.

**Extends.** New `src/app/MacroRecorder.js` (record + replay engine),
`src/ui/manager/IpcRouter.js` (macro CRUD IPC), `src/ui/index.html`
(macro manager UI), possibly a native module for global input hooks.

### Resumo PT — Seção 2

Sete direções validadas contra o codebase (a ideia de "backup/restore do vault"
foi descartada porque `profiles:export-file` já existe):

| # | Recurso | Complexidade | Estende |
|---|---------|--------------|---------|
| 2.1 | Dashboard de estatísticas de perfil | S | UI renderer (IPC já existe) |
| 2.2 | Gerenciador de screenshots embutido | S | `IpcRouter.js` + `KeyboardShortcuts.js` |
| 2.3 | Webhook do Discord para eventos | S | Novo `DiscordWebhook.js` + `EventTimers.onRemind()` |
| 2.4 | Lançamento concorrente multi-conta | S | `IpcRouter.js` + UI (Map já suporta) |
| 2.5 | Roteamento inteligente de região | M | Novo `ping.js` + `regions.js` |
| 2.6 | Sync na nuvem do vault criptografado | M | `vault.js` + novo `CloudSync.js` |
| 2.7 | Gravador de macros (somente assistido) | M-L | Novo `MacroRecorder.js` (risco ToS) |

**Prioridades sugeridas para v5.27.0:** 2.1 (estatísticas), 2.2 (screenshots),
2.3 (Discord) — todas S, baixo risco, alto valor percebido. Defer 2.5-2.7 para
v5.28.0+.

---

## Section 3 — Technical Debt & Next Steps
## Seção 3 — Dívida Técnica e Próximos Passos

This section is an honest accounting of what is not yet solid in the codebase.
Items already being addressed by parallel tasks are noted as such.

### 3.1 Known debt

| # | Item | Severity | Status |
|---|------|----------|--------|
| D1 | No E2E tests (only unit + integration via Jest, 1235 tests) | Medium | Being added in parallel task |
| D2 | Flash binaries not bundled — user must download PPAPI Flash separately | Medium | Out of scope (legal/size) |
| D3 | Electron binary not validated in sandbox (preview-only testing) | Medium | Sandbox limitation; needs real-OS CI |
| D4 | 8 stale version tags in main-process files | Low | Being cleaned in parallel task |
| D5 | 2 renderer intervals lack `beforeunload` cleanup | Medium | Being fixed in parallel task |
| D6 | CSS is ~1884 lines with near-duplicate rules | Low | Open |
| D7 | `preload.js` references a removed `launcher:screenshot` channel (line 10) — dead comment, not a bug, but confusing | Trivial | Open |
| D8 | `SessionLifecycle.js` is 766 lines — mixes CSS injection, FB mock, auto-login, lifecycle hooks | Low | Open (refactor candidate) |
| D9 | `IpcRouter.js` is 800 lines with ~50 handlers in one file | Low | Open (could split by domain: profile, vault, dev, events, inspector) |
| D10 | No CI on Windows/macOS — Electron calls in `Launcher.js` are mocked in tests but never run against a real Electron build on those platforms | Medium | Needs CI runner |

### 3.2 Prioritization

**Must do before v5.27.0 (stabilizers):**

- D5 — renderer intervals without `beforeunload` cleanup. This can leak
  intervals across window reloads and cause subtle bugs (e.g., a stale timer
  firing after the user navigates away). Cheap fix, high confidence.
- D4 — stale version tags. Pure noise reduction; cheap.
- D7 — dead `launcher:screenshot` comment in `preload.js`. Either remove the
  comment or restore the channel (which aligns with feature 2.2). One-line fix.
- D6 (partial) — consolidate obvious CSS duplicates. Do not attempt a full
  rewrite; just merge selectors that are clearly the same rule repeated.

**Should do for v5.27.0 (small features):**

- Feature 2.1 (statistics dashboard) — S, renderer-only, high perceived value.
- Feature 2.2 (screenshot manager) — S, also resolves D7 cleanly.
- Feature 2.3 (Discord webhook) — S, self-contained.

**Can wait until v5.28.0:**

- Feature 2.4 (multi-account concurrent launch) — S, but needs hardware
  advisory testing on real machines.
- Feature 2.5 (smart region routing) — M, new module.
- D8, D9 — refactor `SessionLifecycle.js` and `IpcRouter.js` into smaller
  domain-specific modules. Not urgent (they work) but will pay off as features
  are added.

**Can wait until v5.29.0+:**

- Feature 2.6 (cloud sync) — M, OAuth + sync engine.
- Feature 2.7 (macro recorder) — M-L, ToS-sensitive, needs framing decision.
- MVP of modo automático (Section 1: scheduled launch + sequential account
  switching; stall recovery already exists).
- D1 (E2E tests) — ongoing, parallel task.
- D2 (Flash bundling) — legal/size decision, likely never.
- D3, D10 (real-OS validation) — needs CI budget.

### 3.3 Non-goals (explicitly out of scope)

- Auto-event farming (Section 1.5) — botting, ToS violation.
- Auto-reward claiming (Section 1.6) — fragile, gray-zone.
- Unattended macro playback (Section 2.7 framing) — same category.
- Bundling Flash PPAPI binaries — legal and size concerns.
- Replacing Electron with another framework — no business case.

### Resumo PT — Seção 3

Dívida técnica conhecida: 10 itens (D1-D10). Destes, 3 estão sendo tratados em
tarefas paralelas (D1 E2E, D4 tags de versão, D5 intervals sem cleanup).

**Antes de v5.27.0 (estabilizadores):** D5 (intervals), D4 (version tags), D7
(comentário morto em `preload.js`), D6 parcial (duplicatas CSS óbvias).

**Para v5.27.0 (recursos pequenos):** 2.1 dashboard de estatísticas, 2.2
screenshots, 2.3 webhook Discord.

**Para v5.28.0:** 2.4 lançamento multi-conta, 2.5 roteamento de região, refator
de D8/D9.

**Para v5.29.0+:** 2.6 sync na nuvem, 2.7 macros, MVP do modo automático
(lançamento agendado + troca de contas).

**Fora de escopo (non-goals):** auto-farm de eventos, auto-claim de recompensas,
macro não-assistido, bundling de binários Flash.
