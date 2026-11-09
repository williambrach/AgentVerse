import { test, expect } from '@playwright/test';

const ADMIN = 'admin-e2e';
const CASE = 'banana-mystery';

async function openMaker(page, token = ADMIN) {
  await page.goto(`/admin/maker.html?case=${CASE}`);
  await page.locator('#password').fill(token);
  await page.locator('#signin').click();
  await expect(page.locator('textarea[data-path="copy.intro.lead"]')).toBeVisible({ timeout: 5000 });
}
const nav = (page, key) => page.locator(`#sections .nav-item[data-section="${key}"]`);

test('editor_sidebar_sections', async ({ page }) => {
  await openMaker(page);
  const keys = await page.locator('#sections .nav-item').evaluateAll(els => els.map(e => e.dataset.section));
  expect(keys[0]).toBe('story');
  expect(keys[1]).toBe('prompt');
  expect(keys.at(-2)).toBe('debrief');
  expect(keys.at(-1)).toBe('history');
  expect(keys.filter(k => k.startsWith('part:')).length).toBeGreaterThanOrEqual(3);
  await expect(nav(page, 'story')).toHaveAttribute('aria-current', 'true');
  for (const key of keys.filter(k => k !== 'history')) {
    await nav(page, key).click();
    await expect(nav(page, key)).toHaveAttribute('aria-current', 'true');
    const shown = await page.locator('#form .form-section').evaluateAll(els => els.filter(e => !e.hidden && e.offsetParent !== null).map(e => e.dataset.section));
    expect(shown).toEqual([key]);
  }
  await nav(page, 'history').click();
  await expect(page.locator('#history-section')).toBeVisible();
  await expect(page.locator('#form')).toBeHidden();
  await nav(page, 'story').click();
  await expect(page.locator('#form')).toBeVisible();
  await expect(page.locator('#history-section')).toBeHidden();
});

test('editor_labels_and_hints', async ({ page }) => {
  await openMaker(page);
  const head = page.locator('.field').filter({ has: page.locator('textarea[data-path="copy.headline"]') });
  // The label holds its text node first, then a small path span (set by maker-form.js).
  const own = l => l.evaluate(n => n.firstChild.textContent);
  expect(await own(head.locator('.field-label'))).toBe('Headline');
  await expect(head.locator('.field-label .field-path')).toHaveText('copy.headline');
  await expect(head.locator('.field-label')).toHaveAttribute('title', 'copy.headline');
  expect((await head.locator('.field-hint').textContent()).trim().length).toBeGreaterThan(5);
  const lead = page.locator('.field').filter({ has: page.locator('textarea[data-path="copy.intro.lead"]') });
  expect(await own(lead.locator('.field-label'))).toBe('Intro lead');
  const labels = await page.locator('#form [data-section="story"] .field-label').evaluateAll(els => els.map(e => e.firstChild.textContent));
  expect(labels.every(l => !l.includes('.'))).toBe(true);
  await nav(page, 'prompt').click();
  await expect(page.locator('.placeholders:visible')).toContainText('Name tags: {');
});

test('editor_knowledge_autogrow', async ({ page }) => {
  await openMaker(page);
  await nav(page, 'part:planner').click();
  const area = page.locator('textarea[data-path="parts.planner.knowledge"]');
  await expect(area).toBeVisible();
  const fits = () => area.evaluate(e => e.scrollHeight <= e.clientHeight + 2);
  expect(await fits()).toBe(true);
  const before = (await area.boundingBox()).height;
  const more = Array.from({ length: 10 }, (_, i) => `extra line ${i + 1}`).join('\n');
  await area.fill(`${await area.inputValue()}\n${more}`);
  await expect.poll(async () => (await area.boundingBox()).height).toBeGreaterThan(before);
  expect(await fits()).toBe(true);
});

test('editor_unsaved_marker', async ({ page }) => {
  await openMaker(page);
  await expect(page.locator('#dirty-count')).toHaveText('');
  await page.locator('textarea[data-path="copy.intro.lead"]').fill('Changed lead');
  await expect(page.locator('#dirty-count')).toHaveText('1 unsaved change');
  await expect(page.locator('#status')).toHaveText('Unsaved changes');
  await expect(page.locator('#status')).toHaveAttribute('data-state', 'unsaved');
  await expect(nav(page, 'story').locator('.dot')).toHaveCount(1);
  const lead = page.locator('.field').filter({ has: page.locator('textarea[data-path="copy.intro.lead"]') });
  await expect(lead.locator('span.differs')).toBeVisible();
  await lead.locator('button.reset').click();
  await expect(page.locator('#dirty-count')).toHaveText('');
  await expect(nav(page, 'story').locator('.dot')).toHaveCount(0);
});

test('editor_differs_marker_visible', async ({ page }) => {
  await openMaker(page);
  const lead = page.locator('.field').filter({ has: page.locator('textarea[data-path="copy.intro.lead"]') });
  await expect(lead.locator('span.differs')).toBeHidden();
  await lead.locator('textarea').fill('Changed lead');
  await expect(lead.locator('span.differs')).toBeVisible();
  await expect(lead.locator('span.differs')).toHaveText(/edited/);
  await lead.locator('button.reset').click();
  await expect(lead.locator('span.differs')).toBeHidden();
});

test('chat_rehearsal_disabled', async ({ page }) => {
  await openMaker(page);
  await expect(page.locator('#question')).toBeDisabled();
  await expect(page.locator('#try')).toBeDisabled();
  await expect(page.locator('#try-note')).toHaveText('Rehearsal mode: replies are scripted. Start the server in live mode to try the model.');
  await page.locator('#preview').click();
  await expect(page.locator('#prompt-box')).toBeVisible();
  await expect(page.locator('#prompt')).toContainText('You play');
});

test('field_error_opens_section', async ({ page }) => {
  await page.route(`**/admin/content/${CASE}`, async route => {
    if (route.request().method() !== 'PUT') return route.fallback();
    await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Unknown name tag {zzz}', path: 'parts.minder.knowledge' }) });
  });
  await openMaker(page);
  await expect(nav(page, 'story')).toHaveAttribute('aria-current', 'true');
  await page.locator('#publish').click();
  await expect(nav(page, 'part:minder')).toHaveAttribute('aria-current', 'true');
  const err = page.locator('.field').filter({ has: page.locator('textarea[data-path="parts.minder.knowledge"]' ) }).locator('.field-error');
  await expect(err).toBeVisible();
  await expect(err).toHaveText('Unknown name tag {zzz}');
});

test('editor_case_dropdown', async ({ page, request }) => {
  const list = await (await request.get('/admin/content', { headers: { authorization: `Bearer ${ADMIN}` } })).json();
  const ids = list.cases.map(c => c.id);
  expect(ids.length).toBeGreaterThanOrEqual(2);
  await openMaker(page);
  const sel = page.locator('#case-select');
  expect(await sel.locator('option').evaluateAll(os => os.map(o => o.value))).toEqual(ids);
  await expect(sel).toHaveValue(CASE);
  const other = ids.find(i => i !== CASE);
  await page.locator('textarea[data-path="copy.intro.lead"]').fill('Unsaved edit');
  const messages = [];
  page.once('dialog', d => { messages.push(d.message()); d.dismiss(); });
  await sel.selectOption(other);
  await expect.poll(() => messages.length).toBe(1);
  expect(messages[0]).toBe('Discard unsaved changes?');
  await expect(sel).toHaveValue(CASE);
  await expect(page.locator('textarea[data-path="copy.intro.lead"]')).toHaveValue('Unsaved edit');
  page.once('dialog', d => d.accept());
  await sel.selectOption(other);
  await expect(sel).toHaveValue(other);
  await expect(page.locator('#dirty-count')).toHaveText('');
  await expect(nav(page, 'story')).toHaveAttribute('aria-current', 'true');
});

for (const [name, url, ready] of [['centre', '/admin', '#status'], ['editor', `/admin/maker.html?case=${CASE}`, '#status']]) {
  test(`theme_toggle_persists_${name}`, async ({ page }) => {
    await page.goto(url);
    const theme = () => page.evaluate(() => document.documentElement.dataset.theme ?? null);
    expect([null, 'dark']).toContain(await theme());
    await expect(page.locator('#theme-toggle')).toHaveAttribute('aria-pressed', 'false');
    await page.locator('#theme-toggle').click();
    expect(await theme()).toBe('light');
    expect(await page.evaluate(() => localStorage.getItem('override.admin.theme'))).toBe('light');
    await expect(page.locator('#theme-toggle')).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    expect(await theme()).toBe('light');
    await expect(page.locator(ready)).toBeVisible();
    await page.locator('#theme-toggle').click();
    expect(await theme()).toBe('dark');
  });
}

test('centre_areas_order', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.locator('.area-title').first()).toBeVisible();
  expect(await page.locator('.area-title').allTextContents()).toEqual(['Live now', 'Players and log', 'Results', 'LLM ops']);
});

test('centre_collapse_persists', async ({ page }) => {
  await page.goto('/admin');
  const health = page.locator('details.panel[data-panel="health"]');
  await expect(health).toHaveAttribute('open', '');
  await health.locator('summary').click();
  await expect(health).not.toHaveAttribute('open', '');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('override.admin.collapsed'))).toContain('health');
  await page.reload();
  await expect(page.locator('details.panel[data-panel="health"]')).not.toHaveAttribute('open', '');
  await page.locator('details.panel[data-panel="health"] summary').click();
  await expect(page.locator('details.panel[data-panel="health"]')).toHaveAttribute('open', '');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('override.admin.collapsed'))).not.toContain('health');
  await page.reload();
  await expect(page.locator('details.panel[data-panel="health"]')).toHaveAttribute('open', '');
});

// Live mode over the mock LLM (project admin-live).
const MOCK = 'snack time';
async function ask(page, text, n) {
  await page.locator('#question').fill(text);
  await page.locator('#try').click();
  await expect(page.locator('#thread .msg.a')).toHaveCount(n);
  await expect(page.locator('#thread .msg.a').nth(n - 1)).toContainText(MOCK, { timeout: 15_000 });
}

test('chat_three_turns_history @live', async ({ page }) => {
  const bodies = [];
  page.on('request', r => { if (r.method() === 'POST' && /\/admin\/content\/[^/]+\/try$/.test(r.url())) bodies.push(r.postDataJSON()); });
  await openMaker(page, ADMIN);
  await page.locator('textarea[data-path="copy.intro.lead"]').fill('Live edit');
  await expect(page.locator('#question')).toBeEnabled();
  await ask(page, 'First?', 1);
  await ask(page, 'Second?', 2);
  await ask(page, 'Third?', 3);
  expect(await page.locator('#thread .turn').count()).toBe(3);
  expect(bodies).toHaveLength(3);
  expect(bodies[0].history).toBeUndefined();
  expect(bodies[2].history).toHaveLength(2);
  expect(bodies[2].history[0].question).toBe('First?');
  expect(bodies[2].edits['copy.intro.lead']).toBe('Live edit');
  expect(bodies[2].question).toBe('Third?');
});

test('chat_show_prompt_new_chat @live', async ({ page }) => {
  await openMaker(page, ADMIN);
  await expect(page.locator('#question')).toBeEnabled();
  await expect(page.locator('#try-note')).toHaveText('');
  await ask(page, 'Who rang the bell?', 1);
  await page.locator('#preview').click();
  await expect(page.locator('#prompt-box')).toBeVisible();
  await expect(page.locator('#prompt')).toContainText('You play');
  await page.locator('#new-chat').click();
  await expect(page.locator('#thread .turn')).toHaveCount(0);
  await expect(page.locator('#question')).toBeEnabled();
});
