import { test, expect } from '@playwright/test';

const radio = (page, id) => page.locator(`.case-option input[name="case"][value="${id}"]`);

test('picker starts the chosen case', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.case-option')).toHaveCount(2);
  await radio(page, 'tower-echo-bell').check();
  await page.locator('#begin-button').click();
  await expect(page.locator('h1')).toHaveText('Was it time?');
  await expect(page.locator('#panel h2')).toHaveText('Lanterns, too soon.');
  await expect(page.locator('.task-list li:first-child')).toContainText('Read all 3 clues');
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

test('honest mistake to Nobody', async ({ page }) => {
  await page.goto('/?case=tower-echo-bell');
  await page.locator('#begin-button').click();
  await page.locator('#skip-walking').check();
  await page.locator('nav [data-go="replay"]').click();
  await page.locator('#reveal-button').click();
  await expect(page.locator('.evidence-card')).toHaveCount(3);
  const asks = [['wren', 'I thought the Headmistress rang it'], ['basil', 'sounded like the tower bell'], ['juniper', 'I didn’t look']];
  for (const [id, text] of asks) {
    await page.locator(`nav [data-go="${id}"]`).click();
    await page.locator('[data-quick-question]').click();
    await expect(page.locator('.speech.character').last()).toContainText(text);
  }
  await page.locator('nav [data-go="report"]').click();
  await page.locator('[name="suspect"][value="none"]').check();
  await page.getByRole('button', { name: 'See what happened' }).click();
  await expect(page.locator('#panel h2')).toHaveText('Nobody knew it was too soon.');
  await expect(page.locator('.verdict-summary')).toContainText('Right. The rule was broken, but nobody knew it.');
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
  await page.locator('nav [data-go="replay"]').click();
  await page.locator('#reveal-button').click();
  for (const id of ['wren', 'basil', 'juniper']) {
    await page.locator(`nav [data-go="${id}"]`).click();
    await page.locator('[data-quick-question]').click();
    await expect(page.locator('.speech.investigator')).toHaveCount(1);
  }
  await page.locator('nav [data-go="report"]').click();
  await page.locator('[name="suspect"][value="none"]').check();
  await page.getByRole('button', { name: 'See what happened' }).click();
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
  await page.route(/\/api\/(state|start|reveal|visit|interview)$/, async route => {
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
