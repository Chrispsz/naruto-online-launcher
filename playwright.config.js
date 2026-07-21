// @ts-check
// ═══════════════════════════════════════════════════════════════════════════
// Playwright config — Shinobi Launcher preview E2E smoke tests
//
// The preview is the single-file build at /home/z/my-project/public/launcher.html
// served by the Next.js dev server (port 3000). The dev server is expected to
// already be running — Playwright does NOT auto-start it. In CI the server can
// be brought up separately (e.g. `next dev` in a background step) before
// `npm run test:e2e` runs.
//
// Why no webServer block: the dev server is shared across many tasks in this
// sandbox, so we reuse it instead of starting a fresh one per test run. If you
// want Playwright to manage its own server locally, add a webServer block that
// runs `cd .. && npm run dev` (or equivalent) with `port: 3000` and
// `reuseExistingServer: true`.
// ═══════════════════════════════════════════════════════════════════════════
const { defineConfig, devices } = require('@playwright/test');

/** @type {import('@playwright/test').PlaywrightTestConfig} */
module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 0 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list']],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    // Chromium headless runs in many sandboxes need --no-sandbox.
    launchOptions: {
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
