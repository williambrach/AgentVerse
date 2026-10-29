import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { joinTeam } from './team.mjs';

const unique = () => `Team ${randomUUID().slice(0, 8)}`;

/** Drives one banana case to a verdict over the API, with the page's cookie (and so its team). */
async function play(request, guess = 'momo', prior = null) {
  const post = async (name, body, view) => {
    const res = await request.post(`/api/${name}`, { data: { sessionId: view?.session?.id, revision: view?.session?.revision, ...body } });
    expect(res.status(), name).toBe(200);
    return res.json();
  };
  let view = prior ? await post('reset', { caseId: 'banana-mystery' }, prior) : await post('start', { caseId: 'banana-mystery' });
  for (const character of ['momo', 'nori', 'pip']) view = await post('interview', { character, question: 'Did you hear the bell?' }, view);
  return post('verdict', { suspect: guess, confidence: 70 }, view);
}

async function checkIn(page, name) {
  await page.goto('/');
  await page.locator('#team-name').fill(name);
  await page.locator('#team-submit').click();
  await expect(page.locator('#team-button')).toContainText(name);
}

test('gate_first', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#team-form')).toBeVisible();
  await expect(page.locator('#begin-button, #team-button, canvas')).toHaveCount(0);
  const name = unique();
  await checkIn(page, name);
  await expect(page.locator('#team-form')).toHaveCount(0);
  await expect(page.locator('#intro')).toBeVisible();
});

test('bad_name_inline', async ({ page }) => {
  const posts = [];
  page.on('request', r => { if (r.url().endsWith('/api/team') && r.method() === 'POST') posts.push(r.url()); });
  await page.goto('/');
  await page.locator('#team-name').fill('x');
  await page.locator('#team-submit').click();
  await expect(page.locator('#team-error')).toContainText('Team names are 2 to 24');
  await expect(page.locator('#team-form')).toBeVisible();
  expect(posts).toEqual([]);
});

test('join_same_team', async ({ browser, baseURL }) => {
  const name = unique();
  const a = await browser.newContext({ baseURL });
  const b = await browser.newContext({ baseURL });
  try {
    await joinTeam(a, name);
    const started = await (await a.request.post('/api/start', { data: { caseId: 'banana-mystery' } })).json();
    const page = await b.newPage();
    await page.goto('/');
    await page.locator('#team-name').fill(name.toLowerCase());
    await page.locator('#team-submit').click();
    await expect(page.locator('#team-join')).toContainText(`Join ${name}`);
    await page.locator('#team-join').click();
    await expect(page.locator('#team-button')).toContainText(name);
    const seen = await (await b.request.get('/api/state')).json();
    expect(seen.session.id).toBe(started.session.id);
    expect(seen.session.team.name).toBe(name);
  } finally { await a.close(); await b.close(); }
});

test('reload_keeps_team', async ({ page }) => {
  const name = unique();
  await page.goto('/');
  await page.locator('#team-name').fill(name);
  await page.locator('#team-submit').click();
  await expect(page.locator('#team-button')).toContainText(name);
  await page.reload();
  await expect(page.locator('#team-button')).toContainText(name);
  await expect(page.locator('#team-form')).toHaveCount(0);
});

test('leaderboard_after_correct', async ({ page }) => {
  const name = unique();
  await joinTeam(page, name);
  const view = await play(page.request);
  expect(view.session.verdict).toBeTruthy();
  await page.goto('/');
  await page.locator('#begin-button').click();
  await page.locator('#leaderboard-button').click();
  await expect(page.locator('#leaderboard')).toBeVisible();
  const own = page.locator('.board-row.you');
  await expect(own).toContainText(name);
  await expect(own).toContainText('1 pt');
  await page.locator('#leaderboard-close').click();
  await expect(page.locator('#leaderboard')).toHaveCount(0);
});

test('replay_keeps_points', async ({ page }) => {
  const name = unique();
  await joinTeam(page, name);
  const first = await play(page.request);
  await play(page.request, 'momo', first);
  await page.goto('/');
  await page.locator('#begin-button').click();
  await page.locator('#leaderboard-button').click();
  const own = page.locator('.board-row.you');
  await expect(own).toContainText('1 pt');
  await expect(own).not.toContainText('2 pts');
});

test('topbar_fits_after_check_in', async ({ page }, testInfo) => {
  await joinTeam(page, unique());
  for (const [width, height] of [[1440, 1000], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.locator('#begin-button').click();
    await expect(page.locator('#intro')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`topbar-${width}.png`) });
    const tops = await page.locator('.topbar > *').evaluateAll(els => els.filter(e => e.offsetParent).map(e => { const r = e.getBoundingClientRect(); return Math.round(r.top + r.height / 2); }));
    if (width === 1440) {
      expect(Math.max(...tops) - Math.min(...tops), `top bar wraps: ${tops}`).toBeLessThanOrEqual(6);
      // The label only hides below 1180 px, so it stays visible at 1440 px.
      await expect(page.locator('.authored-label')).toBeVisible();
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  }
});
