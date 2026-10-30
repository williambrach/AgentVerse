import { test, expect, request as playwrightRequest } from '@playwright/test';

const GAME = 'http://127.0.0.1:4319';
const AUTHORED_HASH = 'd891b333116d';

/** A fresh player on banana-mystery, read through the game API. */
async function freshView() {
  const request = await playwrightRequest.newContext(); // its own cookie, so every call is a new player
  const res = await request.post(`${GAME}/api/start`, { data: { caseId: 'banana-mystery' } });
  expect(res.status()).toBe(200);
  const view = await res.json();
  await request.dispose();
  const state = view.case ?? view;
  return { lead: (state.copy ?? view.copy).intro.lead, hash: state.contentHash ?? view.contentHash };
}

test('maker_edits_publishes_and_restores', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));

  try {
    const response = await page.goto('/admin/maker.html?case=banana-mystery');
    expect(response.headers()['content-security-policy']).toBeTruthy();

    await page.locator('#token').fill('maker-e2e');
    await page.locator('#save').click();
    const lead = page.locator('textarea[data-path="copy.intro.lead"]');
    await expect(lead).toBeVisible({ timeout: 5000 });
    await lead.fill('E2E lead');

    await page.locator('#preview').click();
    await expect(page.locator('#prompt')).toContainText('You play Momo');

    await page.locator('#publish').click();
    await expect(page.locator('#publish-note')).toContainText('rev 1 by maker');

    const edited = await freshView();
    expect(edited.lead).toBe('E2E lead');
    expect(edited.hash).not.toBe(AUTHORED_HASH);
  } finally {
    // Leave the authored text in place for any later spec, even when an assertion above failed.
    const authored = page.locator('#history li', { hasText: 'authored' }).getByRole('button', { name: 'Restore' });
    if (await authored.count()) await authored.first().click();
  }

  await expect(page.locator('body')).toContainText('Restored rev');
  await expect.poll(async () => (await freshView()).hash, { timeout: 5000 }).toBe(AUTHORED_HASH);
  expect(errors).toEqual([]);
});
