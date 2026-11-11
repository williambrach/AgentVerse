import { test, expect, joinTeam } from './team.mjs';
import { castOf, truthOf, sessionIdOf, pickRole } from './cast.mjs';

const LEAKS = [
  'you wanted the bananas now',
  'Momo made up the permission.',
  'You spotted the made-up permission!',
  'Do not claim the bell rang',
  'Nobody broke the rule.',
  'Right. Nobody broke the rule.',
  'Nobody knowingly broke the rule this time.',
  'Every role right! You saw who lied, who helped, who was fooled, and who stayed honest.',
  'The key was who knew the keeper had said wait.',
  'Knew the rule. Made up the permission.',
];

test('export carries case provenance', async ({ page }) => {
  await page.goto('/?case=banana-mystery');
  await page.locator('#begin-button').click();
  for (const id of ['momo', 'pip', 'nori', 'kiki']) {
    await page.locator(`nav [data-go="${id}"]`).click();
    await page.locator('[data-quick-question]').click();
    await expect(page.locator('.speech.character')).not.toHaveCount(0);
  }
  const sessionId = await sessionIdOf(page);
  const before = (await (await page.request.get('/api/events')).text()).split('\n').filter(Boolean).map(l => JSON.parse(l));
  expect(before.find(e => e.type === 'session_started').cast).toBeNull();
  const cast = castOf(sessionId);
  const truth = truthOf(cast);
  await page.locator('.verdict-button').click();
  for (const id of ['momo', 'pip', 'nori', 'kiki']) await pickRole(page, id, truth[id]);
  await page.locator('#lock-in').click();
  await expect(page.locator('#panel .debrief-head h1')).toHaveText(/ made up the permission\.$/);

  const res = await page.request.get('/api/events');
  expect(res.ok()).toBe(true);
  const events = (await res.text()).split('\n').filter(Boolean).map(l => JSON.parse(l));
  expect(events.length).toBeGreaterThan(0);
  const started = events.find(e => e.type === 'session_started');
  expect(started.cast).toEqual(cast);
  expect(Object.keys(cast)).toEqual(['momo', 'pip', 'nori', 'kiki']);
  expect(events.every(e => e.schemaVersion === 3)).toBe(true);
  expect(events.find(e => e.type === 'verdict_submitted').verdict).toMatchObject({ roles: truth, score: 4, total: 4, evidenceIds: [] });
  for (const e of events) {
    expect(e.caseId).toBe('banana-mystery');
    expect(e.caseVersion).toBe('banana-authored-v3.0.0');
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
  for (const c of cases) {
    expect(Object.keys(c).sort()).toEqual(['cast', 'id', 'lead', 'order', 'title', 'world']);
    // The case board preview draws faces and names only: each cast row carries no prompt, role or secret.
    expect(c.cast.length).toBeGreaterThan(0);
    for (const member of c.cast) expect(Object.keys(member).sort()).toEqual(['id', 'name']);
  }
});
