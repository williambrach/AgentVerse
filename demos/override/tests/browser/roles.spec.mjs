import { test, expect } from './team.mjs';
import { castOf, truthOf, sessionIdOf as sessionId, pickRole as pick, PART_LABEL as LABEL } from './cast.mjs';

const NAMES = ['Momo', 'Pip', 'Nori', 'Kiki'];
const IDS = ['momo', 'pip', 'nori', 'kiki'];


async function fresh(page) {
  await page.goto('/');
  await page.locator('#begin-button').click();
  await expect(page.locator('#intro')).toHaveCount(0);
  await page.locator('#reset-button').click();
  await page.locator('#confirm-reset').click();
  await expect(page.locator('#confirm-reset')).toHaveCount(0);
}
async function go(page, location) {
  await page.locator(`nav [data-go="${location}"]`).click();
  await expect(page.locator('#panel h2')).toBeVisible({ timeout: 12_000 });
}
async function interviewAll(page) {
  for (const [i, id] of IDS.entries()) {
    await go(page, id);
    await page.locator('[data-quick-question]').click();
    await expect(page.locator('.speech.investigator')).toHaveCount(1, { timeout: 12_000 });
  }
}

test('four_monkeys', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'Phaser', {
      configurable: true,
      set(phaser) {
        Object.defineProperty(window, 'Phaser', { value: phaser, configurable: true });
        const Game = phaser.Game;
        phaser.Game = class extends Game { constructor(config) { super(config); window.walkingTestGame = this; } };
      },
    });
  });
  await fresh(page);
  await page.waitForFunction(() => window.walkingTestGame?.scene.getScene('banana-grove')?.npcs);
  const buttons = page.locator('nav [data-go]');
  await expect(buttons).toHaveCount(5);
  for (const [i, name] of NAMES.entries()) await expect(buttons.nth(i)).toContainText(name);
  await expect(buttons.nth(4)).toContainText('Your guess');
  expect(await page.evaluate(() => window.walkingTestGame.scene.getScene('banana-grove').npcs.size)).toBe(4);
});

test('no_leak_before_verdict', async ({ page }) => {
  // The visible job label ("The planner") is part of the design; what must not appear is a part id as a
  // value, class, attribute or key, a per-character role id, or the cast itself.
  const partIdAsValue = text => /["'](?:planner|carrier|lookout|minder)["']|(?:class|data-[\w-]+|value|id)=["'][^"']*\b(?:planner|carrier|lookout|minder)\b/.test(text);
  // The detector must not be vacuous: it has to catch a part id printed as an attribute or a JSON value.
  expect(partIdAsValue('<button data-part="planner">')).toBe(true);
  expect(partIdAsValue('{"job":"lookout"}')).toBe(true);
  expect(partIdAsValue('<small>The planner</small>')).toBe(false);
  await fresh(page);
  await interviewAll(page);
  const state = await (await page.request.get('/api/state')).json();
  const stateText = JSON.stringify(state);
  expect(partIdAsValue(stateText)).toBe(false);
  expect('cast' in state || 'cast' in state.session).toBe(false);
  expect(JSON.stringify([state.characters, state.session])).not.toMatch(/villain|collaborator|fooled|honest/);
  const exported = await (await page.request.get('/api/events')).text();
  expect(partIdAsValue(exported)).toBe(false);
  expect(exported).not.toMatch(/villain|collaborator/);
  for (const line of exported.trim().split('\n')) { const e = JSON.parse(line); if (e.type === 'session_started') expect(e.cast).toBeNull(); }
  expect(partIdAsValue(await page.content())).toBe(false);
  await go(page, 'report');
  expect(partIdAsValue(await page.content())).toBe(false);
});

test('picker_requires_all', async ({ page }) => {
  await fresh(page);
  await interviewAll(page);
  await go(page, 'report');
  await expect(page.locator('fieldset.role-row')).toHaveCount(4);
  await expect(page.locator('#lock-in')).toBeDisabled();
  await expect(page.locator('#lock-in')).toContainText('Pick a role for Momo');
  for (const id of IDS.slice(0, 3)) { await pick(page, id, 'honest'); await expect(page.locator('#lock-in')).toBeDisabled(); }
  await pick(page, 'kiki', 'honest');
  await expect(page.locator('#lock-in')).toBeEnabled();
  await expect(page.locator('#lock-in')).toContainText('Lock in roles');
});

test('perfect_score', async ({ page }) => {
  await fresh(page);
  await interviewAll(page);
  const truth = truthOf(castOf(await sessionId(page)));
  await go(page, 'report');
  for (const id of IDS) await pick(page, id, truth[id]);
  await page.locator('#lock-in').click();
  await expect(page.locator('.verdict-summary')).toContainText('4 / 4');
  await expect(page.locator('.verdict-summary')).toContainText('Every role right');
  await expect(page.locator('.pick-right')).toHaveCount(4);
  await expect(page.locator('.pick-wrong')).toHaveCount(0);
  await expect(page.locator('.pick-right').first()).toContainText('✓');
  await expect(page.locator('#panel')).not.toContainText(/Nobody|Not sure/);
});

test('one_wrong', async ({ page }) => {
  await fresh(page);
  await interviewAll(page);
  const truth = truthOf(castOf(await sessionId(page)));
  truth.momo = truth.momo === 'honest' ? 'villain' : 'honest';
  await go(page, 'report');
  for (const id of IDS) await pick(page, id, truth[id]);
  await page.locator('#lock-in').click();
  await expect(page.locator('.verdict-summary')).toContainText('3 / 4');
  await expect(page.locator('.pick-wrong')).toHaveCount(1);
  await expect(page.locator('.pick-right')).toHaveCount(3);
});

test('shuffle_varies', async ({ page }) => {
  await page.goto('/');
  const casts = new Set();
  for (let i = 0; i < 8; i++) {
    let state = await (await page.request.get('/api/state')).json();
    if (!state.session) state = await (await page.request.post('/api/start', { data: {} })).json();
    else state = await (await page.request.post('/api/reset', { data: { sessionId: state.session.id, revision: state.session.revision } })).json();
    casts.add(JSON.stringify(castOf(state.session.id)));
  }
  expect(casts.size).toBeGreaterThanOrEqual(2);
});


async function expectNavLabels(page) {
  const id = await sessionId(page);
  const cast = castOf(id);
  for (const cid of IDS) await expect(page.locator(`#room-nav [data-go="${cid}"] small`)).toHaveText(LABEL[cast[cid]]);
  return cast;
}

test('nav_labels_follow_cast', async ({ page }) => {
  await fresh(page);
  const first = await expectNavLabels(page);
  // The report panel row must agree with the nav (it opens once every character is interviewed).
  await interviewAll(page);
  await go(page, 'report');
  for (const cid of IDS) await expect(page.locator(`fieldset.role-row:has(input[name="role-${cid}"]) .role-who small`)).toHaveText(LABEL[first[cid]]);
  let current = first;
  for (let tries = 0; tries < 8 && JSON.stringify(current) === JSON.stringify(first); tries++) {
    const state = await (await page.request.get('/api/state')).json();
    await page.request.post('/api/reset', { data: { sessionId: state.session.id, revision: state.session.revision } });
    await page.reload();
    if (await page.locator('#begin-button').count()) await page.locator('#begin-button').click();
    await expect(page.locator('#room-nav [data-go="momo"]')).toBeVisible();
    current = await expectNavLabels(page);
  }
  expect(JSON.stringify(current)).not.toBe(JSON.stringify(first));
});
