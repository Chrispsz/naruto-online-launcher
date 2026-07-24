# Contributing

Thanks for your interest in contributing to **Shinobi Launcher**! Whether you're fixing a typo, squashing a bug, or proposing a new feature, every contribution is welcome. This guide will get you from clone to PR in a few minutes.

## Development setup

```bash
# Clone the repository
git clone https://github.com/Chrispsz/naruto-online-launcher.git
cd naruto-online-launcher

# Install dependencies (skip postinstall — Electron binary isn't needed for lint/test)
npm install --ignore-scripts

# Run in development mode
npm start

# Run tests
npm test

# Run lint
npm run lint

# Run lint with auto-fix
npm run lint:fix

# Format code
npm run format
```

**Requirements:** Node.js ≥18 (CI uses Node 20 LTS), npm. The Electron binary downloads on `npm start` but is **not** needed for lint/test.

## Project structure

See **[ARCHITECTURE.md](ARCHITECTURE.md)** for the full module map.

```
src/
├── main.js              # Electron entry point
├── preload.js           # Context-isolated IPC bridge
├── app/                 # Application logic (Launcher, SessionLifecycle, …)
├── config/              # i18n, regions, URLs, optimization presets
├── flash/               # mms.cfg generation + plugin loader
├── main/                # Chromium flags (single source of truth)
├── memory/              # MemoryGuard + GcDaemon
├── network/             # Cookies, blocker, API login, tempmail
├── profiles/            # CRUD + encrypted vault + auto-login script
├── ui/                  # index.html + styles.css + app.js + variables.css
└── utils/               # Logger, EventTimers, helpers
```

## Code standards

- **ESLint + Prettier** — mandatory. The CI gate fails on any lint error.
- **TypeScript**: not used (vanilla JS with JSDoc). Keep JSDoc annotations on public functions.
- **Commits**: English or Portuguese, descriptive. Suggested format: `<type>: <description>` (e.g., `fix: auto-login loop guard`, `feat: drag-drop profile reorder`, `docs: add ARCHITECTURE.md`).
- **PRs**: clear description of what changed and why. Reference the issue if applicable.
- **Design system**: AMOLED black background + shinobi gold (`#d4a543`) accents. Do **not** introduce indigo or blue — they break the visual identity.

## Testing

- **All new code must have tests.** Aim for ≥80% coverage on changed lines.
- Tests live in `src/**/__tests__/*.test.js` (co-located with the module) and `tests/` (integration).
- Run the full suite before submitting: `npm test`.
- Run a single suite: `npx jest src/profiles/__tests__/vault.test.js`.

## Before submitting a PR

1. `npm run lint` — fix all errors.
2. `npm test` — all 1240 tests must pass.
3. Test manually on Linux and/or Windows if your change affects the UI or game launch.
4. If you added a new feature, update the relevant docs (`README.md`, `ARCHITECTURE.md`, `FLASH_SETUP.md`). The README is bilingual (EN + collapsible PT-BR section) — update both halves when touching user-facing copy.

## Bilingual docs

The launcher supports EN + PT-BR. If you add or change a user-facing string:

1. Add the key to **both** `en` and `pt` dictionaries in `src/config/i18n.js`.
2. Update the fallback text in `src/ui/index.html` (the `data-i18n="..."` attribute's text content).
3. Update the mock dictionaries in `__mocks__/preview-mock.js` (both languages).

## Reporting bugs

Open an [issue](https://github.com/Chrispsz/naruto-online-launcher/issues) with:

1. **Launcher version** (Settings → About, or `package.json`).
2. **OS** (distro + version for Linux, or Windows build).
3. **Hardware profile** (Auto / Low-Spec / Force High — see Settings).
4. **Steps to reproduce**.
5. **Expected vs actual behavior**.
6. **Logs** — export via Settings → Advanced → Export diagnostics (.zip). This includes logs + config + system info, **never credentials**.

## Questions?

Open an [issue](https://github.com/Chrispsz/naruto-online-launcher/issues) with the `question` label, or start a Discussion. Be excellent to each other — see [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
