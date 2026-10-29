import { test, expect } from '@playwright/test';

const TOKEN = 'admin-e2e';
const GAME = 'http://127.0.0.1:4319';
const XSS = '<img src=x onerror=window.__xss=1>';

/** A player driven through the game API; every call carries the cookie and the latest revision. */
async function player(request) {
  const start = await request.post(`${GAME}/api/start`, { data: {} });
  expect(start.status()).toBe(200);
  let view = await start.json();
  const sessionId = view.session.id;
  const act = async (name, body = {}) => {
    const res = await request.post(`${GAME}/api/${name}`, { data: { sessionId, revision: view.session.revision, ...body } });
    expect(res.status(), name).toBe(200);
    view = await res.json();
    return view;
  };
  await act('reveal');
  return {
    id: sessionId,
    ask: (question, character = 'pip') => act('interview', { character, question }),
    verdict: async () => {
      for (const character of ['momo', 'nori']) await act('interview', { character, question: 'Did you hear the bell?' });
      return act('verdict', { suspect: 'momo', confidence: 70 });
    },
  };
}

async function connect(page) {
  await page.goto('/admin');
  await page.locator('#token').fill(TOKEN);
  await page.locator('#save').click();
  await expect(page.locator('#status')).toHaveText(/connected/, { timeout: 5000 });
}

test('connects', async ({ page }) => {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  const res = await page.goto('/admin');
  const csp = res.headers()['content-security-policy'];
  expect(csp).toContain("script-src 'self'");
  expect(csp).not.toContain('unsafe-inline');
  await page.locator('#token').fill(TOKEN);
  await page.locator('#save').click();
  await expect(page.locator('#status')).toHaveText(/connected/, { timeout: 5000 });
  await page.waitForTimeout(1500);
  expect(errors).toEqual([]);
});

test('heartbeat_online', async ({ page, browser }) => {
  await connect(page);
  const tab = await (await browser.newContext()).newPage();
  await tab.goto(`${GAME}/`);
  await expect(page.locator('#players')).toContainText(/[1-9]\d*/, { timeout: 10_000 });
  await tab.context().close();
});

test('question_answer_rows', async ({ page, request }) => {
  const text = `Where were you at the bell? ${Date.now()}`;
  await connect(page);
  await page.locator('[data-filter="kind"]', { hasText: 'All events' }).click();
  const p = await player(request);
  await page.locator('[data-filter="text"]').fill(text);
  await p.ask(text);
  await expect(page.locator('#log [data-kind="question"]')).toHaveCount(1, { timeout: 5000 });
  await expect(page.locator('#log [data-kind="question"]').first()).toContainText(text);
  await page.locator('[data-filter="text"]').fill('');
  const answer = page.locator('#log [data-kind="answer"]', { has: page.locator(`[data-player="${p.id}"]`) });
  await expect(answer).toHaveCount(1, { timeout: 5000 });
  await expect(answer).toContainText('rehearsal');
});

test('xss_text', async ({ page, request }) => {
  await connect(page);
  await page.locator('[data-filter="kind"]', { hasText: 'All events' }).click();
  const p = await player(request);
  await page.locator('[data-filter="text"]').fill('onerror');
  await p.ask(XSS);
  const cell = page.locator('#log [data-kind="question"]').first();
  await expect(cell).toBeVisible({ timeout: 5000 });
  await expect(cell).toContainText(XSS);
  expect(await page.locator('#log img').count()).toBe(0);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
});

test('drilldown', async ({ page, request }) => {
  await connect(page);
  await page.locator('[data-filter="kind"]', { hasText: 'All events' }).click();
  const p = await player(request);
  await p.ask(`drill ${Date.now()}`);
  await p.verdict();
  const row = page.locator(`#log [data-kind="verdict"] [data-player="${p.id}"]`).first();
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.click();
  const panel = page.locator('#player-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Verdict:');
});

test('round', async ({ page }) => {
  await connect(page);
  await page.locator('#round button', { hasText: 'Start round' }).click();
  await page.locator('#round input').first().fill('Session B');
  await page.locator('#round button', { hasText: /^Start$/ }).click();
  await expect(page.locator('#round')).toContainText('Session B', { timeout: 5000 });
  await expect(page.locator('#round')).toContainText(/0/);
});

test('stream_401', async ({ request }) => {
  const res = await request.get('/admin/stream');
  expect(res.status()).toBe(401);
});
