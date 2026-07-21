// ═══════════════════════════════════════════════════════════════════════════
// settings.flow.test.js — Settings panel flow.
//
// Selector notes (verified against src/ui/index.html @ v5.26.0):
//   - Settings view: #view-settings, made visible by clicking
//     `.nav-item[data-view="settings"]`.
//   - Settings sections: `.settings-section` blocks. Three are visible by
//     default (General / Optimization / Advanced); a fourth (#devToolsSection)
//     is hidden by default and is gated behind SHINOBI_DEBUG, so we only assert
//     on the visible count (>=2 per the brief).
//   - Language `<select id="setLang">` has options: en (English), pt (Português).
//   - The mock (preview-mock.js) seeds `mockLang='pt'` by default, so initial
//     strings are Portuguese. Toggling to EN re-fetches i18n and re-renders.
//
// Strings used for the i18n toggle assertion (from preview-mock.js dict):
//   - PT: 'Geral', 'Otimização', 'Avançado'
//   - EN: 'General', 'Optimization', 'Advanced'
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require('@playwright/test');

const PREVIEW_PATH = '/launcher.html';

test.describe('Settings panel — flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PREVIEW_PATH, { waitUntil: 'networkidle' });
    await page.waitForSelector('#profileGrid');
    // Open Settings.
    await page.locator('.nav-item[data-view="settings"]').click();
    await page.waitForSelector('#view-settings.visible, #view-settings.active', { timeout: 5_000 }).catch(() => {});
    await expect(page.locator('#view-settings')).toBeVisible();
  });

  test('language toggle (EN/PT) is present with both options', async ({ page }) => {
    const langSelect = page.locator('#setLang');
    await expect(langSelect).toBeVisible();
    await expect(langSelect).toBeEnabled();

    const optionValues = await langSelect.locator('option').evaluateAll((opts) =>
      opts.map((o) => o.value)
    );
    expect(optionValues).toEqual(expect.arrayContaining(['en', 'pt']));
  });

  test('at least 2 settings sections render', async ({ page }) => {
    const sections = page.locator('#view-settings .settings-section');
    const count = await sections.count();
    expect(count).toBeGreaterThanOrEqual(2);

    // The three "always-visible" sections should each have a header.
    const headers = await page
      .locator('#view-settings .settings-section .settings-header span')
      .first()
      .allTextContents();
    expect(headers.length).toBeGreaterThan(0);
  });

  test('toggling language from PT to EN changes visible section header text', async ({
    page,
  }) => {
    // The default mock language is PT — first section header should read "Geral".
    const firstHeader = page
      .locator('#view-settings .settings-section .settings-header span')
      .first();

    await expect(firstHeader).toContainText('Geral');

    // Switch to English.
    await page.selectOption('#setLang', 'en');
    // Mock resolves i18n:set-lang immediately; app.js re-applies dict + re-renders.
    await expect(firstHeader).toContainText('General', { timeout: 5_000 });

    // And switch back to PT — verifies round-trip, not just a one-shot change.
    await page.selectOption('#setLang', 'pt');
    await expect(firstHeader).toContainText('Geral', { timeout: 5_000 });
  });

  test('EN/PT toggle also flips the Optimization header (cross-check)', async ({
    page,
  }) => {
    // Collect every visible settings-header span text in PT first.
    await page.selectOption('#setLang', 'pt');
    await page.waitForTimeout(300);
    const ptHeaders = await page
      .locator('#view-settings .settings-section .settings-header span')
      .allTextContents();
    expect(ptHeaders).toEqual(expect.arrayContaining(['Geral', 'Otimização', 'Avançado']));

    // Switch to EN and re-collect.
    await page.selectOption('#setLang', 'en');
    await page.waitForTimeout(300);
    const enHeaders = await page
      .locator('#view-settings .settings-section .settings-header span')
      .allTextContents();
    expect(enHeaders).toEqual(expect.arrayContaining(['General', 'Optimization', 'Advanced']));

    // The two collections must NOT be identical — proves the strings actually changed.
    expect(enHeaders).not.toEqual(ptHeaders);
  });

  test('About card (inside Settings) is visible and reports version v5.26.0', async ({
    page,
  }) => {
    const about = page.locator('#aboutCard');
    await expect(about).toBeVisible();
    await expect(about.locator('#advAboutVersion')).toContainText('v5.26.0');
    // Meta grid has Author/License/Platform/Runtime rows.
    const metaRows = about.locator('.about-meta-item');
    await expect(metaRows).toHaveCount(4);
  });
});
