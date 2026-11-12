import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const GAME = 'http://127.0.0.1:4319';
const ADMIN = 'http://127.0.0.1:4320';
const PASSWORD = 'admin-e2e';
const contentFile = rel => join(process.env.OVERRIDE_E2E_DATA, 'content-admin', rel);
const authed = { headers: { authorization: `Bearer ${PASSWORD}`, 'content-type': 'application/json' } };

async function signIn(page, path = '/admin') {
  await page.goto(path);
  await page.locator('#password').fill(PASSWORD);
  await page.locator('#signin').click();
}
// The editor draws one page at a time: walk the side panel until the field shows.
async function openField(page, path) {
  const area = page.locator(`[data-path="${path}"]`);
  await page.locator('#sections .nav-item').first().waitFor({ state: 'visible', timeout: 8000 });
  const keys = await page.locator('#sections .nav-item').evaluateAll(els => els.map(e => e.dataset.section));
  for (const key of keys) {
    await page.click(`#sections .nav-item[data-section="${key}"]`);
    await page.locator('#section details').evaluateAll(ds => ds.forEach(d => { d.open = true; }));
    if (await area.count()) { await area.waitFor({ state: 'visible', timeout: 5000 }); return area; }
  }
  throw new Error(`No field ${path} on any page`);
}
async function restoreAuthored(request, id) {
  await request.post(`${ADMIN}/admin/content/${id}/revert`, { ...authed, data: { rev: 0 } });
}

test.beforeEach(async ({ page }) => { page.on('dialog', d => d.accept()); });

test('text_signin_and_second_tab', async ({ page, context }) => {
  await page.goto('/admin');
  await expect(page.locator('#auth')).toBeVisible();
  await page.locator('#password').fill('nope');
  await page.locator('#signin').click();
  await expect(page.locator('#auth-error')).toContainText('Wrong password.');
  await page.locator('#password').fill(PASSWORD);
  await page.locator('#signin').click();
  await expect(page.locator('#signout')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#auth')).toBeHidden();

  const cookie = (await context.cookies(ADMIN)).find(c => c.name === 'override_admin');
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe('Strict');

  const tab = await context.newPage();
  await tab.goto('/admin/maker.html?case=banana-mystery');
  await expect(tab.locator('.names input[data-path="characters.momo.name"]')).toHaveCount(1, { timeout: 8000 });
  await expect(tab.locator('#auth')).toBeHidden();
  await expect(tab.locator('#case-select option').filter({ hasText: 'Game text' })).toHaveCount(1);
});

test('text_rename_character_and_publish', async ({ page, request }) => {
  const file = contentFile('cases/banana-mystery.json');
  try {
    await signIn(page, '/admin/maker.html?case=banana-mystery');
    const name = await openField(page, 'characters.momo.name');
    await name.fill('Mango');
    await page.click('#publish');
    await expect(page.locator('#publish-note')).toContainText('by admin', { timeout: 5000 });
    const text = readFileSync(file, 'utf8');
    expect(text).toContain('"characters.momo.name": "Mango"');
    expect(text.endsWith('\n')).toBe(true);
  } finally {
    await restoreAuthored(request, 'banana-mystery');
  }
  expect(existsSync(file)).toBe(false);
});

test('text_renaissance_secret_field_error', async ({ page }) => {
  await signIn(page, '/admin/maker.html?case=renaissance-traveler');
  const detail = await (await page.request.get(`${ADMIN}/admin/content/renaissance-traveler`, authed)).json();
  const paths = detail.order;
  // Castelvento v2: no talk fields; each character's traveller secret is an editable field.
  expect(paths.some(p => p.startsWith('talk.'))).toBe(false);
  const secret = paths.find(p => /^characters\.[a-z]+\.secrets\.traveler$/.test(p));
  expect(secret).toBeTruthy();
  const area = await openField(page, secret);
  await area.fill('You came from {locala}.');
  await page.click('#publish');
  const err = page.locator('.field').filter({ has: page.locator(`textarea[data-path="${secret}"]`) }).locator('.field-error');
  await expect(err).toBeVisible({ timeout: 5000 });
  await expect(err).not.toHaveText('');
});

test('text_game_override_shown_literally_and_restore_deletes_file', async ({ page, browser, request }) => {
  const file = contentFile('game.json');
  try {
    await signIn(page, '/admin/maker.html?case=game');
    const label = await openField(page, 'ui.hud.notebook');
    await label.fill('<b>Casebook</b>');
    await page.click('#publish');
    await expect(page.locator('#publish-note')).toContainText('by admin', { timeout: 5000 });
    expect(readFileSync(file, 'utf8')).toContain('ui.hud.notebook');

    const served = await (await request.get(`${GAME}/api/text`)).json();
    expect(served.text['hud.notebook']).toBe('<b>Casebook</b>');

    const ctx = await browser.newContext();
    const game = await ctx.newPage();
    await game.request.post(`${GAME}/api/team`, { data: { name: `Text ${Date.now() % 100000}` } });
    await game.request.post(`${GAME}/api/start`, { data: { caseId: 'banana-mystery' } });
    await game.goto(`${GAME}/`);
    const button = game.locator('#notebook-button');
    await expect(button).toBeVisible({ timeout: 15_000 });
    const html = await button.innerHTML();
    expect(html).toContain('&lt;b&gt;Casebook&lt;/b&gt;');
    expect(html).not.toContain('<b>Casebook');
    await ctx.close();
  } finally {
    await restoreAuthored(request, 'game');
  }
  expect(existsSync(file)).toBe(false);
});
