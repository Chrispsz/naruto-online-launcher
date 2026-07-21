// ═══════════════════════════════════════════════════════════════════════════
// preview.smoke.test.js — core smoke tests for the Shinobi Launcher preview.
//
// Target: http://localhost:3000/launcher.html (single-file build served by the
// Next.js dev server). The renderer talks to a stubbed Electron API defined in
// __mocks__/preview-mock.js, so the page behaves as if it were inside Electron.
//
// Selector notes (verified against src/ui/index.html at v5.26.0):
//   - Only THREE nav tabs exist in the sidebar: Accounts, Events, Settings.
//     "About" and "Diagnostics" are NOT separate tabs — About is a section
//     inside the Settings view (#aboutCard) and Diagnostics is a row inside
//     the Advanced settings section. This file tests what the HTML actually
//     contains.
//   - Body uses `background: var(--bg)` with `--bg: #000000` (AMOLED black).
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require('@playwright/test');

const PREVIEW_PATH = '/launcher.html';

test.describe('Preview — core smoke', () => {
  test('page loads without console errors', async ({ page }) => {
    const errors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

    await page.goto(PREVIEW_PATH, { waitUntil: 'networkidle' });
    // Give the mock IPC time to push profiles:updated etc.
    await page.waitForSelector('#profileGrid', { timeout: 10_000 });
    await page.waitForTimeout(500);

    // Any errors during initial render are a regression.
    expect(errors, `console errors: ${JSON.stringify(errors)}`).toEqual([]);
  });

  test('document title is "Shinobi Launcher"', async ({ page }) => {
    await page.goto(PREVIEW_PATH, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveTitle(/Shinobi Launcher/);
  });

  test('main container renders (not a blank screen)', async ({ page }) => {
    await page.goto(PREVIEW_PATH, { waitUntil: 'domcontentloaded' });
    const app = page.locator('.app');
    await app.waitFor({ state: 'visible' });
    await expect(app).toBeVisible();
    // Sidebar + main both present.
    await expect(page.locator('.sidebar')).toBeVisible();
    await expect(page.locator('.main')).toBeVisible();
  });

  test('profile grid renders (cards or empty state, never blank)', async ({ page }) => {
    await page.goto(PREVIEW_PATH, { waitUntil: 'networkidle' });
    const grid = page.locator('#profileGrid');
    await grid.waitFor({ state: 'visible' });

    // The mock ships 6 profiles, so we expect cards. We accept either a
    // populated grid OR the empty-state placeholder — both count as
    // "the panel rendered", but a fully empty grid.innerHTML would fail.
    const cardCount = await grid.locator('.card').count();
    const emptyState = await grid.locator('.empty').count();
    expect(cardCount + emptyState).toBeGreaterThan(0);
  });

  test('all three nav tabs are present and clickable', async ({ page }) => {
    await page.goto(PREVIEW_PATH, { waitUntil: 'domcontentloaded' });

    const expectedTabs = [
      { view: 'accounts', label: /Accounts|Contas/ },
      { view: 'events', label: /Events|Eventos/ },
      { view: 'settings', label: /Settings|Configurações/ },
    ];

    for (const { view, label } of expectedTabs) {
      const tab = page.locator(`.nav-item[data-view="${view}"]`);
      await tab.waitFor({ state: 'visible' });
      await expect(tab).toBeVisible();
      // The Events tab has two child spans (the i18n label + #eventBadge),
      // so scope to the data-i18n span to stay strict-mode safe.
      const labelSpan = tab.locator('span[data-i18n]');
      await expect(labelSpan).toContainText(label);
      await expect(tab).toBeEnabled();
    }
  });

  test('clicking each nav tab swaps the active view', async ({ page }) => {
    await page.goto(PREVIEW_PATH, { waitUntil: 'networkidle' });
    await page.waitForSelector('#profileGrid');

    // Accounts is the default-active view.
    await expect(page.locator('#view-accounts')).toBeVisible();
    await expect(page.locator('#view-events')).toBeHidden();
    await expect(page.locator('#view-settings')).toBeHidden();

    // Events
    await page.locator('.nav-item[data-view="events"]').click();
    await expect(page.locator('#view-events')).toBeVisible();
    await expect(page.locator('#view-accounts')).toBeHidden();

    // Settings — and the About card (which lives inside Settings) becomes visible
    await page.locator('.nav-item[data-view="settings"]').click();
    await expect(page.locator('#view-settings')).toBeVisible();
    await expect(page.locator('#view-accounts')).toBeHidden();
    await expect(page.locator('#aboutCard')).toBeVisible();

    // Back to Accounts
    await page.locator('.nav-item[data-view="accounts"]').click();
    await expect(page.locator('#view-accounts')).toBeVisible();
    await expect(page.locator('#view-settings')).toBeHidden();
  });

  test('About section inside Settings shows version v5.26.0', async ({ page }) => {
    await page.goto(PREVIEW_PATH, { waitUntil: 'networkidle' });
    await page.locator('.nav-item[data-view="settings"]').click();
    await page.waitForSelector('#aboutCard');

    const versionPill = page.locator('#advAboutVersion');
    await expect(versionPill).toBeVisible();
    await expect(versionPill).toContainText('v5.26.0');

    // The sidebar version pill should agree.
    await expect(page.locator('#version')).toContainText('v5.26.0');
  });

  test('theme is AMOLED black (body background-color is rgb(0, 0, 0))', async ({ page }) => {
    await page.goto(PREVIEW_PATH, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.app');

    const bg = await page.evaluate(() =>
      getComputedStyle(document.body).backgroundColor
    );
    // AMOLED pure black. variables.css defines --bg: #000000.
    expect(bg).toBe('rgb(0, 0, 0)');

    // And the design-token var should also resolve to #000000.
    const bgVar = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
    );
    expect(bgVar.toLowerCase()).toBe('#000000');
  });
});
