import { test, expect } from './team.mjs';
import { castOf, truthOf, sessionIdOf, pickRole, rehearsalReply, quickQuestionFor } from './cast.mjs';

const radio = (page, id) => page.locator(`.case-option input[name="case"][value="${id}"]`);

test('picker starts the chosen case', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.case-option')).toHaveCount(2);
  await radio(page, 'tower-echo-bell').check();
  await page.locator('#begin-button').click();
  await expect(page.locator('h1')).toHaveText('Was it time?');
  await expect(page.locator('#panel h2')).toHaveText('Lanterns, too soon.');
  await expect(page.locator('.task-list li:first-child')).toContainText('Ask 3');
  await expect(page.locator('.task-list li:first-child')).not.toContainText('the message');
});

test('picker preview follows the selected case', async ({ page }) => {
  await page.goto('/');
  await radio(page, 'tower-echo-bell').check();
  await expect(page.locator('#intro-title')).toContainText('Lanterns');
  await expect(page.locator('.intro-lead')).toContainText('A bell rang');
  await expect(page.locator('#begin-button')).toHaveText('Let’s investigate');
  await radio(page, 'banana-mystery').check();
  await expect(page.locator('#intro-title')).toContainText('Mystery');
});

test('deep link preselects', async ({ page }) => {
  await page.goto('/?case=tower-echo-bell');
  await expect(radio(page, 'tower-echo-bell')).toBeChecked();
  await page.goto('/?case=nope');
  await expect(page.locator('.case-option input').first()).toBeChecked();
});

test('deep link is dropped after start and ids are not injected', async ({ page }) => {
  await page.goto('/?case=tower-echo-bell');
  await page.locator('#begin-button').click();
  await expect(page.locator('#panel h2')).toHaveText('Lanterns, too soon.');
  expect(new URL(page.url()).search).toBe('');
});

// Picks the true role for every character from the server-side cast, then locks in.
async function lockPerfect(page, ids) {
  const truth = truthOf(castOf(await sessionIdOf(page)));
  await page.locator('nav [data-go="report"]').click();
  await expect(page.locator('fieldset.role-row')).toHaveCount(ids.length);
  for (const id of ids) await pickRole(page, id, truth[id]);
  await page.locator('#lock-in').click();
}

test('everyone honest but fooled scores 3 of 3', async ({ page }) => {
  await page.goto('/?case=tower-echo-bell');
  await page.locator('#begin-button').click();
  await page.locator('#skip-walking').check();
  await expect(page.locator('nav [data-go]')).toHaveCount(4);
  await expect(page.locator('#reveal-button, .evidence-card, #present-evidence')).toHaveCount(0);
  const cast = castOf(await sessionIdOf(page));
  for (const id of ['wren', 'basil', 'juniper']) {
    await page.locator(`nav [data-go="${id}"]`).click();
    await page.locator('[data-quick-question]').click();
    await expect(page.locator('.speech.character').last()).toContainText(rehearsalReply(cast, id, quickQuestionFor(cast, id)));
  }
  const truth = truthOf(cast);
  expect(Object.values(truth)).toEqual(['fooled', 'fooled', 'fooled']);
  await lockPerfect(page, ['wren', 'basil', 'juniper']);
  await expect(page.locator('#panel h2')).toHaveText('Nobody knew it was too soon.');
  await expect(page.locator('.verdict-summary')).toContainText('3 / 3');
  await expect(page.locator('.verdict-summary')).toContainText('Right. Everyone was honest but fooled: the echo shell tricked them all.');
  await expect(page.locator('.pick-right')).toHaveCount(3);
  await expect(page.locator('.pick-wrong')).toHaveCount(0);
});

test('reset switches case', async ({ page }) => {
  await page.goto('/');
  await page.locator('#begin-button').click();
  await expect(page.locator('#panel h2')).toHaveText('A bunch of trouble.');
  await page.locator('#reset-button').click();
  await expect(page.locator('#case-switch input[value="banana-mystery"]')).toBeChecked();
  await expect(page.locator('#case-switch input[value="banana-mystery"]')).toBeFocused();
  await expect(page.locator('.case-option', { hasText: 'The Banana Mystery' }).locator('.case-chip')).toHaveText('Playing');
  await expect(page.locator('#confirm-reset')).toHaveText('Restart this case');
  await radio(page, 'tower-echo-bell').check();
  await expect(page.locator('#confirm-reset')).toHaveText('Start this case');
  await expect(page.locator('#intro-title')).toContainText('Lanterns');
  await page.locator('#confirm-reset').click();
  await expect(page.locator('#panel h2')).toHaveText('Lanterns, too soon.');
  await expect(page.locator('#case-switch')).toHaveCount(0);
});

test('reset session starts the current case over', async ({ page }) => {
  await page.goto('/?case=tower-echo-bell');
  await page.locator('#begin-button').click();
  await page.locator('#skip-walking').check();
  await expect(page.locator('nav [data-go]')).toHaveCount(4);
  await expect(page.locator('#reveal-button, .evidence-card, #present-evidence')).toHaveCount(0);
  const before = (await (await page.request.get('/api/state')).json()).session;
  await page.locator('#restart-button').click();
  await expect(page.locator('#reset-title')).toHaveText('Start Lanterns Too Soon over?');
  await expect(page.locator('#reset-confirm')).toContainText('chats with the apprentices');
  await expect(page.locator('#cancel-restart')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#reset-confirm')).toHaveCount(0);
  await expect(page.locator('#restart-button')).toBeFocused();
  await page.locator('#restart-button').click();
  await page.locator('#confirm-restart').click();
  await expect(page.locator('#reset-confirm')).toHaveCount(0);
  await expect(page.locator('#panel h2')).toHaveText('Lanterns, too soon.');
  const after = (await (await page.request.get('/api/state')).json()).session;
  expect(after.id).not.toBe(before.id);
  expect(after.caseId).toBe('tower-echo-bell');
  expect(after.revealedPosition).toBeUndefined();
  expect(after.interviews).toEqual({ wren: [], basil: [], juniper: [] });
});

test('a malformed solved list in storage does not break the page', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('override.solved', '{}'));
  await page.goto('/');
  await expect(page.locator('#begin-button')).toHaveText('Let’s investigate');
  await expect(page.locator('.case-chip.solved')).toHaveCount(0);
});

test('case board closes with Escape and keeps the case', async ({ page }) => {
  await page.goto('/');
  await page.locator('#begin-button').click();
  await page.locator('#reset-button').click();
  await radio(page, 'tower-echo-bell').check();
  await page.keyboard.press('Escape');
  await expect(page.locator('#case-switch')).toHaveCount(0);
  await expect(page.locator('#panel h2')).toHaveText('A bunch of trouble.');
  await expect(page.locator('#reset-button')).toBeFocused();
});

test('a returning player can switch case from the intro', async ({ page }) => {
  await page.goto('/');
  await page.locator('#begin-button').click();
  await page.reload();
  await expect(radio(page, 'banana-mystery')).toBeChecked();
  await expect(page.locator('#begin-button')).toHaveText('Continue mystery');
  await radio(page, 'tower-echo-bell').check();
  await expect(page.locator('#begin-button')).toHaveText('Start this case');
  await page.locator('#begin-button').click();
  await expect(page.locator('#intro')).toHaveCount(0);
  await expect(page.locator('#panel h2')).toHaveText('Lanterns, too soon.');
});

test('solving marks the case and offers the next one', async ({ page }) => {
  await page.goto('/?case=tower-echo-bell');
  await page.locator('#begin-button').click();
  await page.locator('#skip-walking').check();
  for (const id of ['wren', 'basil', 'juniper']) {
    await page.locator(`nav [data-go="${id}"]`).click();
    await page.locator('[data-quick-question]').click();
    await expect(page.locator('.speech.investigator')).toHaveCount(1);
  }
  await lockPerfect(page, ['wren', 'basil', 'juniper']);
  const ordered = (await (await page.request.get('/api/cases')).json()).cases.sort((a, b) => a.order - b.order);
  const next = ordered[ordered.findIndex(c => c.id === 'tower-echo-bell') + 1] || ordered[0];
  await expect(page.locator('#next-case')).toHaveText(`Next case: ${next.title}`);
  await page.locator('#debrief-reset').click();
  await expect(page.locator('.case-option', { hasText: 'Lanterns Too Soon' }).locator('.case-chip')).toHaveText('Solved');
  await expect(page.locator('#confirm-reset')).toHaveText('Play again');
  await page.locator('#cancel-reset').click();
  await page.locator('#next-case').click();
  await expect(page.locator('#case-eyebrow')).toContainText(`CASE ${String(next.order).padStart(3, '0')}`);
  await expect(page.locator('#panel h2')).toHaveText(/.+/);
});

for (const [width, height] of [[1280, 720], [1366, 768], [1440, 900], [1920, 1080]]) {
  test(`${width}×${height} fits one screen`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    const board = await page.locator('.case-board').boundingBox();
    expect(board.y).toBeGreaterThanOrEqual(0);
    expect(board.y + board.height).toBeLessThanOrEqual(height);
    await page.locator('#begin-button').click();
    await expect(page.locator('#intro')).toHaveCount(0);
    expect(await page.evaluate(() => [document.documentElement.scrollHeight, document.documentElement.scrollWidth])).toEqual([height, width]);
    for (const selector of ['.room-nav', '.dossier', '#export-button']) {
      const box = await page.locator(selector).boundingBox();
      expect(box.y + box.height, selector).toBeLessThanOrEqual(height);
    }
    const canvas = await page.locator('#station canvas').boundingBox();
    expect(canvas.height).toBeGreaterThan(300);
  });
}

test('phone width keeps the picker single column', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const boxes = await page.locator('.case-option').evaluateAll(els => els.map(e => e.getBoundingClientRect().left));
  expect(new Set(boxes).size).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth === innerWidth)).toBe(true);
});

test('authored character fields are escaped in the DOM', async ({ page }) => {
  const evil = '<img src=x onerror="window.__xss=1">';
  await page.route(/\/api\/(state|start|visit|interview)$/, async route => {
    const res = await route.fetch();
    const body = await res.json();
    if (body.characters) body.characters = body.characters.map(c => ({ ...c, name: evil, role: evil }));
    await route.fulfill({ response: res, json: body });
  });
  await page.goto('/');
  await page.locator('#begin-button').click();
  await page.locator('#skip-walking').check();
  await page.locator('nav [data-go="momo"]').click();
  await expect(page.locator('#panel h2').first()).toContainText('<img');
  expect(await page.locator('#app img[src="x"]').count()).toBe(0);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
});
