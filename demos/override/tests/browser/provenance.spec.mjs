import { test, expect, joinTeam } from './team.mjs';

const LEAKS = [
  'you wanted the bananas now',
  'Momo made up the permission.',
  'You spotted the made-up permission!',
  'Do not claim the bell rang',
  'Nobody broke the rule.',
  'Right. Nobody broke the rule.',
  'Nobody knowingly broke the rule this time.',
  'Nobody knew it was too soon.',
  'Right. The rule was broken, but nobody knew it. The echo shell fooled everyone.',
  'The potions came out too soon, but by mistake. The echo shell sounds just like the tower bell.',
];

test('export carries case provenance', async ({ page }) => {
  await page.goto('/?case=tower-echo-bell');
  await page.locator('#begin-button').click();
  for (const id of ['wren', 'basil', 'juniper']) {
    await page.locator(`nav [data-go="${id}"]`).click();
    await page.locator('[data-quick-question]').click();
    await expect(page.locator('.speech.character')).not.toHaveCount(0);
  }
  await page.locator('nav [data-go="report"]').click();
  await page.locator('[name="suspect"][value="none"]').check();
  await page.getByRole('button', { name: 'See what happened' }).click();
  await expect(page.locator('#panel h2')).toHaveText('Nobody knew it was too soon.');

  const res = await page.request.get('/api/events');
  expect(res.ok()).toBe(true);
  const events = (await res.text()).split('\n').filter(Boolean).map(l => JSON.parse(l));
  expect(events.length).toBeGreaterThan(0);
  for (const e of events) {
    expect(e.caseId).toBe('tower-echo-bell');
    expect(e.caseVersion).toBe('tower-echo-bell-v2.0.0');
    expect(e.contentHash).toMatch(/^[0-9a-f]{12}$/);
  }
  expect(events.find(e => e.type === 'session_started').assignment).toBe('fixed');
  expect(events.some(e => e.type === 'story_revealed' || e.type === 'evidence_selected')).toBe(false);
  for (const e of events) expect([e.revealedPosition, e.selectedEvidence]).toEqual([null, null]);
});

test('state never leaks the answer', async ({ browser, baseURL }) => {
  const probe = await browser.newContext({ baseURL });
  const { cases } = await (await (await probe.newPage()).request.get('/api/cases')).json();
  await probe.close();
  expect(cases.length).toBeGreaterThan(0);
  for (const { id } of cases) {
    const ctx = await browser.newContext({ baseURL });
    const page = await ctx.newPage();
    await joinTeam(ctx);
    await page.goto('/');
    await page.locator(`.case-option input[name="case"][value="${id}"]`).check();
    await page.locator('#begin-button').click();
    const text = await (await page.request.get('/api/state')).text();
    expect(text.length).toBeGreaterThan(0);
    for (const phrase of LEAKS) expect(text, `${id}: ${phrase}`).not.toContain(phrase);
    await ctx.close();
  }
});

test('/api/cases is the allowlist', async ({ page }) => {
  await page.goto('/');
  const res = await page.request.get('/api/cases');
  expect(res.ok()).toBe(true);
  const { cases } = await res.json();
  expect(cases.length).toBeGreaterThan(0);
  for (const c of cases) expect(Object.keys(c).sort()).toEqual(['id', 'lead', 'order', 'title', 'world']);
});
