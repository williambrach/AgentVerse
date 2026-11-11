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
// Games have no budget: the counter shows the coins spent, "2" over the label COINS SPENT.
async function coinsSpent(page, spent) {
  await expect(page.locator(`${COUNTER} .coin-num`)).toHaveText(String(spent));
  await expect(page.locator(`${COUNTER} .hud-label`)).toHaveText('COINS SPENT');
}
// A character page names its speaker in the dialogue box.
async function go(page, location, name) {
  await page.locator(`nav [data-go="${location}"]`).click();
  await expect(page.locator('.dialogue .speaker-tag b')).toHaveText(name.toUpperCase(), { timeout: 12_000 });
}
async function ask(page, id, name, total) {
  await go(page, id, name);
  await page.locator('[data-quick-question]').click();
  await coinsSpent(page, total);
}
/** Waits until three different characters have each shown a bubble. */
// One round of talk is one line from every character (four monkeys), each seen in a bubble.
async function everyoneSpeaks(page, count = 4) {
  const seen = new Set();
  await expect.poll(async () => {
    const who = await page.locator('.station-bubble').first().getAttribute('data-character', { timeout: 500 }).catch(() => null);
    if (who) seen.add(who);
    return seen.size;
  }, { timeout: 60_000, intervals: [100] }).toBe(count);
}
/** Calls a mutating endpoint with the current session and revision. */
async function api(page, name, body = {}) {
  const state = await (await page.request.get('/api/state')).json();
  return page.request.post(`/api/${name}`, { data: { sessionId: state.session?.id, revision: state.session?.revision, ...body } });
}

test('counter_starts_zero', async ({ page }) => {
  await fresh(page);
  await coinsSpent(page, 0);
  await go(page, 'momo', 'Momo');
  await coinsSpent(page, 0);
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
  await coinsSpent(page, 9);
  await expect(page.locator('.speech.reasoning')).toBeVisible();
  await expect(page.locator('#inspect-button')).toBeDisabled();
  await expect(page.locator('#toolbelt [data-tool="inspect"]')).toHaveText('0 left');
});

test('inspect_stays_open_and_says_the_character_did_not_think', async ({ page }) => {
  await fresh(page);
  // Rehearsal always has reasoning, so the first live-style answer is rewritten to have none.
  let first = true;
  await page.route('**/api/interview', async route => {
    const response = await route.fetch();
    const json = await response.json();
    if (first) json.session.inspectable.momo = false;
    first = false;
    await route.fulfill({ response, json });
  });
  await ask(page, 'momo', 'Momo', 2);
  await expect(page.locator('#inspect-button')).toBeEnabled();
  await expect(page.locator('#toolbelt [data-tool="inspect"]')).toHaveText('5 coins · 1 left');
  await expect(page.locator('[data-card="inspect"]')).not.toHaveClass(/off/);
  await page.locator('#inspect-button').click();
  await expect(page.locator('.speech.no-thought p')).toHaveText('Momo did not think. No coins spent.');
  await coinsSpent(page, 2);
  await expect(page.locator('#inspect-button')).toBeEnabled();
  await expect(page.locator('#toolbelt [data-tool="inspect"]')).toHaveText('5 coins · 1 left');
  await expect(page.locator('#toast')).toBeHidden();
  // A new line replaces the note, and the charge was not used up.
  await page.locator('#question').fill('Are you sure?');
  await page.keyboard.press('Enter');
  await coinsSpent(page, 4);
  await expect(page.locator('.speech.no-thought')).toHaveCount(0);
  await page.locator('#inspect-button').click();
  await coinsSpent(page, 9);
  await expect(page.locator('.speech.reasoning').first()).toBeVisible();
  await expect(page.locator('#toolbelt [data-tool="inspect"]')).toHaveText('0 left');
});

test('toolbelt', async ({ page }) => {
  await fresh(page);
  await expect(page.locator('.task-list .tool-guide li')).toHaveCount(2);
  await expect(page.locator('.task-list .tool-guide')).toContainText('5 coins · 1 use');
  await expect(page.locator('#toolbelt')).toContainText('ARBITER TOOLS');
  await expect(page.locator('#inspect-button')).toBeDisabled();
  await expect(page.locator('#toolbelt [data-tool="inspect"]')).toHaveText('Open a monkey’s chat');
  await go(page, 'momo', 'Momo');
  // The Ask price is the bare number on the button; nothing blocks it yet.
  await expect(page.locator('.tool-chip[data-tool="ask"]')).toHaveText('2');
  await expect(page.locator('p.ask-off')).toHaveCount(0);
  await expect(page.locator('#toolbelt [data-tool="inspect"]')).toHaveText('Momo has not spoken yet');
  await page.locator('[data-quick-question]').click();
  await expect(page.locator('#inspect-button')).toBeEnabled();
  await expect(page.locator('#toolbelt .tool-target')).toHaveText('Momo');
  await expect(page.locator('[data-card="inspect"]')).toHaveClass(/fresh/);
  await expect(page.locator('[data-card="continue"]')).not.toHaveClass(/fresh/);
  // The whole card is the button.
  await page.locator('[data-card="inspect"]').click();
  await expect(page.locator('.speech.reasoning')).toBeVisible();
  await expect(page.locator('[data-card="inspect"]')).not.toHaveClass(/fresh/);
  await ask(page, 'pip', 'Pip', 9);
  await ask(page, 'nori', 'Nori', 11);
  await ask(page, 'kiki', 'Kiki', 13);
  await expect(page.locator('[data-card="continue"]')).toHaveClass(/fresh/);
});

test('talk_round', async ({ page }) => {
  test.setTimeout(90_000);
  await fresh(page);
  await ask(page, 'momo', 'Momo', 2);
  await ask(page, 'pip', 'Pip', 4);
  await ask(page, 'nori', 'Nori', 6);
  await ask(page, 'kiki', 'Kiki', 8);
  await page.locator('#continue-button').click();
  await everyoneSpeaks(page);
  await expect(page.locator('#thread-log .thread-post')).toHaveCount(4);
  await coinsSpent(page, 9);
});

test('talk_from_start', async ({ page }) => {
  test.setTimeout(90_000);
  await fresh(page);
  await expect(page.locator('#continue-button')).toBeEnabled();
  await page.locator('#continue-button').click();
  await everyoneSpeaks(page);
  await expect(page.locator('#thread-log .thread-post')).toHaveCount(4);
  await coinsSpent(page, 1);
});

test('reload_keeps_thread', async ({ page }) => {
  await fresh(page);
  expect((await api(page, 'continue')).status()).toBe(200);
  await page.goto('/?case=banana-mystery');
  await page.locator('#begin-button').click();
  await expect(page.locator('#intro')).toHaveCount(0);
  await page.locator('#read-thread').click();
  await expect(page.locator('#thread-log .thread-post')).toHaveCount(1);
  // Four monkeys: one line heard, three still to come.
  await expect(page.locator('#continue-button')).toHaveText('Keep listening (3)');
});

test('verdict_through_roles', async ({ page }) => {
  await fresh(page);
  await ask(page, 'momo', 'Momo', 2);
  await ask(page, 'pip', 'Pip', 4);
  await ask(page, 'nori', 'Nori', 6);
  await ask(page, 'kiki', 'Kiki', 8);
  const cast = castOf(await sessionIdOf(page), 'test-results/sessions-coins');
  const truth = truthOf(cast);
  await page.locator('.verdict-button').click();
  await expect(page.locator('fieldset.role-row')).toHaveCount(4);
  for (const id of ['momo', 'pip', 'nori', 'kiki']) await pickRole(page, id, truth[id]);
  await page.locator('#lock-in').click();
  await expect(page.locator('.verdict-summary')).toContainText('4 / 4');
  await expect(page.locator('.spend-summary')).toContainText('You spent 8 coins');
  await expect(page.locator('.spend-summary')).toContainText('4 questions');
});
