import { test, expect } from '@playwright/test';

const radio = (page, id) => page.locator(`.case-option input[name="case"][value="${id}"]`);

test('picker starts the chosen case', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.case-option')).toHaveCount(2);
  await radio(page, 'banana-control').check();
  await page.locator('#begin-button').click();
  await expect(page.locator('h1')).toHaveText('Who broke the rule?');
  await expect(page.locator('#panel h2')).toHaveText('A mix-up at the picnic.');
  await expect(page.locator('.task-list li:first-child')).toContainText('Read all 3 clues');
  await expect(page.locator('.task-list li:first-child')).not.toContainText('the message');
});

test('picker preview follows the selected case', async ({ page }) => {
  await page.goto('/');
  await radio(page, 'banana-control').check();
  await expect(page.locator('#intro-title')).toContainText('Mix-up');
  await expect(page.locator('.intro-lead')).toContainText('did anyone break the rule');
  await radio(page, 'banana-mystery').check();
  await expect(page.locator('#intro-title')).toContainText('Mystery');
});

test('deep link preselects', async ({ page }) => {
  await page.goto('/?case=banana-control');
  await expect(radio(page, 'banana-control')).toBeChecked();
  await page.goto('/?case=nope');
  await expect(page.locator('.case-option input').first()).toBeChecked();
});

test('deep link is dropped after start and ids are not injected', async ({ page }) => {
  await page.goto('/?case=banana-control');
  await page.locator('#begin-button').click();
  await expect(page.locator('#panel h2')).toHaveText('A mix-up at the picnic.');
  expect(new URL(page.url()).search).toBe('');
});

test('control case to Nobody', async ({ page }) => {
  await page.goto('/?case=banana-control');
  await page.locator('#begin-button').click();
  await page.locator('#skip-walking').check();
  await page.locator('nav [data-go="replay"]').click();
  await page.locator('#reveal-button').click();
  await expect(page.locator('.evidence-card')).toHaveCount(3);
  const asks = [['momo', 'sent me a note'], ['pip', 'Momo said the keeper'], ['nori', 'shouted snack time']];
  for (const [id, text] of asks) {
    await page.locator(`nav [data-go="${id}"]`).click();
    await page.locator('[data-quick-question]').click();
    await expect(page.locator('.speech.character').last()).toContainText(text);
  }
  await page.locator('nav [data-go="report"]').click();
  await page.locator('[name="suspect"][value="none"]').check();
  await page.getByRole('button', { name: 'See what happened' }).click();
  await expect(page.locator('#panel h2')).toHaveText('Nobody broke the rule.');
  await expect(page.locator('.verdict-summary')).toContainText('Right. Nobody broke the rule.');
});

test('reset switches case', async ({ page }) => {
  await page.goto('/');
  await page.locator('#begin-button').click();
  await expect(page.locator('#panel h2')).toHaveText('A bunch of trouble.');
  await page.locator('#reset-button').click();
  await expect(page.locator('#reset-case')).toHaveValue('banana-mystery');
  await page.locator('#reset-case').selectOption('banana-control');
  await page.locator('#confirm-reset').click();
  await expect(page.locator('#panel h2')).toHaveText('A mix-up at the picnic.');
});

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
