import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { joinTeam } from './team.mjs';

const unique = () => `Team ${randomUUID().slice(0, 8)}`;

// Every grove character marked honest: whatever the cast, exactly one (the bell-minder) is right, so one point.
const ALL_HONEST = { momo: 'honest', nori: 'honest', pip: 'honest', kiki: 'honest' };
// The tower's three apprentices are all honest but fooled: a perfect 3/3.
const TOWER_PERFECT = { wren: 'fooled', basil: 'fooled', juniper: 'fooled' };

/** Drives one case (banana by default) to a role verdict over the API, with the page's cookie (and so its team). */
async function play(request, roles = ALL_HONEST, prior = null, caseId = 'banana-mystery') {
  const post = async (name, body, view) => {
    const res = await request.post(`/api/${name}`, { data: { sessionId: view?.session?.id, revision: view?.session?.revision, ...body } });
    expect(res.status(), name).toBe(200);
    return res.json();
  };
  let view = prior ? await post('reset', { caseId }, prior) : await post('start', { caseId });
  for (const character of Object.keys(roles)) view = await post('interview', { character, question: 'Did you hear the bell?' }, view);
  return post('verdict', { roles, confidence: 70 }, view);
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
  // Two tower games (3 questions each) stay inside the 6-questions-a-minute limit.
  const first = await play(page.request, TOWER_PERFECT, null, 'tower-echo-bell');
  await play(page.request, TOWER_PERFECT, first, 'tower-echo-bell');
  await page.goto('/');
  await page.locator('#begin-button').click();
  await page.locator('#leaderboard-button').click();
  const own = page.locator('.board-row.you');
  await expect(own).toContainText('3 pts');
  await expect(own).not.toContainText('6 pts');
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
