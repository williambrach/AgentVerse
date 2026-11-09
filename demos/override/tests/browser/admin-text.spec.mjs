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
// Click the section nav first: a field in a collapsed section is not visible.
async function openField(page, path) {
  const area = page.locator(`textarea[data-path="${path}"]`);
  const key = await area.evaluate(a => a.closest('[data-section]')?.dataset.section);
  if (key) await page.click(`#sections button[data-section="${key}"]`);
  await area.waitFor({ state: 'visible', timeout: 5000 });
  return area;
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
  await expect(tab.locator('textarea[data-path="characters.momo.name"]')).toHaveCount(1, { timeout: 8000 });
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

test('text_renaissance_slip_line_field_error', async ({ page }) => {
  await signIn(page, '/admin/maker.html?case=renaissance-traveler');
  await expect(page.locator('textarea[data-path]').first()).toHaveCount(1, { timeout: 8000 });
  const paths = await page.locator('textarea[data-path]').evaluateAll(els => els.map(e => e.dataset.path));
  expect(paths.some(p => p.startsWith('talk.lines.'))).toBe(true);
  const slip = paths.find(p => /^talk\.slips\.[a-z]+\.0\.line$/.test(p));
  expect(slip).toBeTruthy();
  const area = await openField(page, slip);
  await area.fill('A plain line with nothing in it.');
  await page.click('#publish');
  const err = page.locator('.field').filter({ has: page.locator(`textarea[data-path="${slip}"]`) }).locator('.field-error');
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
