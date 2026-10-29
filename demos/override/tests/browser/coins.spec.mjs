import { test, expect } from './team.mjs';
import { castOf, truthOf, sessionIdOf, pickRole } from './cast.mjs';

const COUNTER = '#coin-counter';

async function fresh(page, caseId = 'banana-mystery') {
  await page.goto(`/?case=${caseId}`);
  await page.locator('#begin-button').click();
  await expect(page.locator('#intro')).toHaveCount(0);
  await page.locator('#reset-button').click();
  await page.locator(`.case-option input[name="case"][value="${caseId}"]`).check();
  await page.locator('#confirm-reset').click();
  await expect(page.locator('#case-switch')).toHaveCount(0);
}
async function go(page, location, heading) {
  await page.locator(`nav [data-go="${location}"]`).click();
  await expect(page.locator('#panel h2')).toHaveText(heading, { timeout: 12_000 });
}
async function ask(page, id, name, total) {
  await go(page, id, name);
  await page.locator('[data-quick-question]').click();
  await expect(page.locator(COUNTER)).toHaveText(`${total} / 15 coins`);
}
/** Waits until three different characters have each shown a bubble. */
async function threeBubbles(page) {
  const seen = new Set();
  await expect.poll(async () => {
    const who = await page.locator('.station-bubble').first().getAttribute('data-character', { timeout: 500 }).catch(() => null);
    if (who) seen.add(who);
    return seen.size;
  }, { timeout: 60_000, intervals: [100] }).toBe(3);
}
/** Calls a mutating endpoint with the current session and revision. */
async function api(page, name, body = {}) {
  const state = await (await page.request.get('/api/state')).json();
  return page.request.post(`/api/${name}`, { data: { sessionId: state.session?.id, revision: state.session?.revision, ...body } });
}

test('counter_starts_zero', async ({ page }) => {
  await fresh(page);
  await expect(page.locator(COUNTER)).toHaveText('0 / 15 coins');
  await go(page, 'momo', 'Momo');
  await expect(page.locator(COUNTER)).toHaveText('0 / 15 coins');
});

test('question_costs', async ({ page }) => {
  await fresh(page);
  await ask(page, 'momo', 'Momo', 2);
  await ask(page, 'pip', 'Pip', 4);
});

test('inspect_once', async ({ page }) => {
  await fresh(page);
  await ask(page, 'momo', 'Momo', 2);
  await ask(page, 'pip', 'Pip', 4);
  await go(page, 'momo', 'Momo');
  await page.locator('#inspect-button').click();
  await expect(page.locator(COUNTER)).toHaveText('9 / 15 coins');
  await expect(page.locator('.speech.reasoning')).toBeVisible();
  await expect(page.locator('#inspect-button')).toBeDisabled();
  await expect(page.locator('#panel [data-tool="inspect"]')).toHaveText('0 left');
});

test('talk_round', async ({ page }) => {
  test.setTimeout(90_000);
  await fresh(page);
  await ask(page, 'momo', 'Momo', 2);
  await ask(page, 'pip', 'Pip', 4);
  await ask(page, 'nori', 'Nori', 6);
  await ask(page, 'kiki', 'Kiki', 8);
  await page.locator('#continue-button').click();
  await threeBubbles(page);
  await expect(page.locator('#thread-log .thread-post')).toHaveCount(3);
  await expect(page.locator(COUNTER)).toHaveText('9 / 15 coins');
});

test('talk_from_start', async ({ page }) => {
  test.setTimeout(90_000);
  await fresh(page);
  await expect(page.locator('#continue-button')).toBeEnabled();
  await page.locator('#continue-button').click();
  await threeBubbles(page);
  await expect(page.locator('#thread-log .thread-post')).toHaveCount(3);
  await expect(page.locator(COUNTER)).toHaveText('1 / 15 coins');
});

test('budget_409', async ({ page }) => {
  await fresh(page);
  const ok = async (name, body) => expect((await api(page, name, body)).status()).toBe(200);
  await ok('interview', { character: 'momo', question: 'What happened with the bananas?' });
  await ok('interview', { character: 'pip', question: 'What did you see?' });
  await ok('interview', { character: 'nori', question: 'Where were you?' });
  await ok('interview', { character: 'kiki', question: 'Who did you talk to?' });
  await ok('inspect', { character: 'momo' });
  // Two rounds of three lines each: one coin each.
  for (let i = 0; i < 4; i++) await ok('continue');
  const state = await (await page.request.get('/api/state')).json();
  expect(state.session.economy.spent).toBe(15);
  const res = await api(page, 'interview', { character: 'pip', question: 'One more thing?' });
  expect(res.status()).toBe(409);
  expect((await res.json()).error).toContain('Not enough coins');
});

test('reload_keeps_thread', async ({ page }) => {
  await fresh(page);
  expect((await api(page, 'continue')).status()).toBe(200);
  await page.goto('/?case=banana-mystery');
  await page.locator('#begin-button').click();
  await expect(page.locator('#intro')).toHaveCount(0);
  await page.locator('#read-thread').click();
  await expect(page.locator('#thread-log .thread-post')).toHaveCount(1);
  await expect(page.locator('#continue-button')).toHaveText('Keep listening (2)');
});

test('tower_tools', async ({ page }) => {
  test.setTimeout(90_000);
  await fresh(page, 'tower-echo-bell');
  await expect(page.locator(COUNTER)).toHaveText('0 / 15 coins');
  await ask(page, 'juniper', 'Juniper', 2);
  await page.locator('#inspect-button').click();
  await expect(page.locator(COUNTER)).toHaveText('7 / 15 coins');
  await expect(page.locator('.speech.reasoning')).toBeVisible();
  await ask(page, 'wren', 'Wren', 9);
  await ask(page, 'basil', 'Basil', 11);
  await page.locator('#continue-button').click();
  await threeBubbles(page);
  await expect(page.locator('#thread-log .thread-post')).toHaveCount(3);
});

test('verdict_through_roles', async ({ page }) => {
  await fresh(page);
  await ask(page, 'momo', 'Momo', 2);
  await ask(page, 'pip', 'Pip', 4);
  await ask(page, 'nori', 'Nori', 6);
  await ask(page, 'kiki', 'Kiki', 8);
  const cast = castOf(await sessionIdOf(page), 'test-results/sessions-coins');
  const truth = truthOf(cast);
  await page.locator('nav [data-go="report"]').click();
  await expect(page.locator('fieldset.role-row')).toHaveCount(4);
  for (const id of ['momo', 'pip', 'nori', 'kiki']) await pickRole(page, id, truth[id]);
  await page.locator('#lock-in').click();
  await expect(page.locator('.verdict-summary')).toContainText('4 / 4');
  await expect(page.locator('.spend-summary')).toContainText('You spent 8 of 15 coins');
  await expect(page.locator('.spend-summary')).toContainText('4 questions');
});
