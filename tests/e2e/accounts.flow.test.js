// ═══════════════════════════════════════════════════════════════════════════
// accounts.flow.test.js — Accounts panel flow.
//
// Selector notes (verified against src/ui/app.js renderProfiles() @ v5.26.0):
//   - "Add account" button: #newBtn in the topbar.
//   - Empty state: #profileGrid renders a `.empty` block (h3 + p + button) when
//     no profiles exist; otherwise renders `.card` entries.
//   - Card structure: `.card[data-card-id]` > `.card-head` > `.name-row .name`
//     (account name) + `.meta-row .region` (region label like BR/NA/EU/HK) +
//     `.meta-row .server-text` (server uppercase).
//   - Card actions: Play, Edit, Credentials (vault), Delete — selected via
//     `[data-act="launch"|"edit"|"vault"|"del"]`.
//
// NOTE on favorite toggle: the task brief mentioned a "favorite toggle button
// exists on cards", but the codebase removed favorites in v5.17.0 (see app.js
// comment: "toggleFavorite() removed — favorite button deleted from card UI").
// There is NO favorite toggle in the rendered card DOM. Per the task rules
// ("If a selector doesn't exist in the HTML, don't write a test for it"), this
// file does NOT assert on a favorite button. Instead we assert on the four
// action buttons that actually exist (Play/Edit/Vault/Delete).
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require('@playwright/test');

const PREVIEW_PATH = '/launcher.html';

// Mock ships 6 profiles (preview-mock.js): Hokage_BR, Anbu_NA, Sannin_EU,
// Genin_HK, Jounin_BR, Kage_BR — sorted alphabetically by name on render.
const EXPECTED_MOCK_NAMES = [
  'Anbu_NA',
  'Genin_HK',
  'Hokage_BR',
  'Jounin_BR',
  'Kage_BR',
  'Sannin_EU',
];

test.describe('Accounts panel — flow', () => {
  test.beforeEach(async ({ page }) => {
    // The renderer's del() uses window.confirm() — auto-accept so the
    // delete actually fires (otherwise Playwright dismisses and nothing happens).
    page.on('dialog', (d) => d.accept());
    await page.goto(PREVIEW_PATH, { waitUntil: 'networkidle' });
    await page.waitForSelector('#profileGrid');
    // Give mock IPC the 120ms broadcast window it uses for profiles:updated.
    await page.waitForTimeout(300);
  });

  test('"Add account" button is present and clickable', async ({ page }) => {
    const addBtn = page.locator('#newBtn');
    await expect(addBtn).toBeVisible();
    await expect(addBtn).toBeEnabled();

    // Clicking it opens the profile modal.
    await addBtn.click();
    const modal = page.locator('#profileModal');
    await modal.waitFor({ state: 'visible' });
    await expect(modal).toBeVisible();
    await expect(page.locator('#modalTitle')).toBeVisible();
  });

  test('account cards render with name + region (mock provides 6)', async ({ page }) => {
    const cards = page.locator('#profileGrid .card');
    await expect(cards.nth(0)).toBeVisible();
    await expect(cards).toHaveCount(EXPECTED_MOCK_NAMES.length);

    const names = await cards.locator('.name').allTextContents();
    expect(names).toEqual(EXPECTED_MOCK_NAMES);

    // Every card has a region label (BR / NA / EU / HK).
    const regions = await cards.locator('.region').allTextContents();
    expect(regions).toHaveLength(EXPECTED_MOCK_NAMES.length);
    for (const r of regions) {
      expect(['BR', 'NA', 'EU', 'HK']).toContain(r);
    }
  });

  test('every card exposes the four action buttons (Play/Edit/Vault/Delete)', async ({ page }) => {
    const cards = page.locator('#profileGrid .card');
    await expect(cards.nth(0)).toBeVisible();

    const count = await cards.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      await expect(card.locator('[data-act="launch"]')).toBeVisible();
      await expect(card.locator('[data-act="edit"]')).toBeVisible();
      await expect(card.locator('[data-act="vault"]')).toBeVisible();
      await expect(card.locator('[data-act="del"]')).toBeVisible();
    }
  });

  test('clicking Edit opens the profile modal in edit mode', async ({ page }) => {
    const firstCard = page.locator('#profileGrid .card').first();
    await firstCard.locator('[data-act="edit"]').click();

    const modal = page.locator('#profileModal');
    await modal.waitFor({ state: 'visible' });
    await expect(modal).toBeVisible();

    // The name field should be pre-filled with the selected account's name.
    const nameInput = page.locator('#fName');
    await expect(nameInput).toBeVisible();
    const value = await nameInput.inputValue();
    expect(value.length).toBeGreaterThan(0);
  });

  test('empty state path — when all accounts are deleted, empty state shows', async ({
    page,
  }) => {
    // Sanity: cards exist before deletion.
    const cards = page.locator('#profileGrid .card');
    await expect(cards).toHaveCount(EXPECTED_MOCK_NAMES.length);

    // Delete every card. The mock's profile:delete handler mutates the
    // in-memory MOCK_PROFILES list and re-broadcasts profiles:updated (~120ms
    // later). We assert on the post-deletion card count so each iteration
    // waits for the broadcast to land before proceeding.
    for (let i = EXPECTED_MOCK_NAMES.length - 1; i >= 0; i--) {
      await cards.first().locator('[data-act="del"]').click();
      await expect(cards).toHaveCount(i);
    }

    const empty = page.locator('#profileGrid .empty');
    await expect(empty).toBeVisible();
    await expect(empty.locator('h3')).toBeVisible();
    await expect(empty.locator('button#emptyNewBtn')).toBeVisible();
  });
});
