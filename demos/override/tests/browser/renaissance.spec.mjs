import { test, expect, joinTeam } from './team.mjs';
import { walkSheetTests } from './walk-sheet.mjs';
import { castOf, sessionIdOf } from './cast.mjs';
import { mkdirSync, readFileSync } from 'node:fs';
import kase from '../../server/cases/renaissance-traveler.mjs';
import { modernWords } from '../../server/anachronism.mjs';

// Runs against the renaissance server (port 4326, rehearsal, dev tools on): see the renaissance project in playwright.config.mjs.
const IDS = kase.characters.map(c => c.id);
const TOPICS = kase.talk.topics.map(t => t.id);
const DATA = 'test-results/sessions-renaissance';
const SHOTS = process.env.RENAISSANCE_SHOTS;
const shot = async (page, name) => { if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/${name}.png` }); } };
const terms = Object.values(kase.talk.slips).flat().flatMap(s => [s.term, ...(s.aliases ?? [])]);
const slipOf = (id, answer) => kase.talk.slips[id]?.find(s => s.line === answer);

async function start(page) {
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
  await page.goto('/?case=renaissance-traveler');
  await page.locator('#begin-button').click();
  await expect(page.locator('#intro')).toHaveCount(0);
  await page.waitForFunction(() => window.walkingTestGame?.scene.getScene('banana-grove')?.figs?.size === 5);
}

const state = async page => (await page.request.get('/api/state')).json();
/** A game action over the API with the current revision; returns the response. */
async function act(page, action, input = {}) {
  const s = (await state(page)).session;
  return page.request.post(`/api/${action}`, { data: { sessionId: s.id, revision: s.revision, ...input } });
}
const mustAct = async (page, action, input) => { const res = await act(page, action, input); expect(res.status(), `${action} ${JSON.stringify(input)}`).toBe(200); return res.json(); };

/** Starts a session over the API and asks every topic of every person. Returns the cast, the traveller and all answers. */
async function playedThrough(page) {
  await page.goto('/?case=renaissance-traveler');
  await page.locator('#begin-button').click();
  await expect(page.locator('#intro')).toHaveCount(0);
  const cast = castOf(await sessionIdOf(page), DATA);
  const traveler = Object.keys(cast).find(k => cast[k] === 'traveler');
  for (const id of IDS) for (const topic of TOPICS) await mustAct(page, 'interview', { character: id, topic });
  const st = await state(page);
  return { cast, traveler, local: IDS.find(id => id !== traveler), lines: st.session.interviews };
}
const slipTurnOf = ({ traveler, lines }) => lines[traveler].find(t => slipOf(traveler, t.answer));
const quoteWhole = async (page, line) => mustAct(page, 'quote', { line });
const solve = async (page, g) => {
  const slip = slipTurnOf(g);
  await quoteWhole(page, slip.id);
  const q = (await state(page)).session.talk.quotes.find(x => x.line === slip.id);
  return mustAct(page, 'accuse', { character: g.traveler, quotes: [q.id] });
};

test('renaissance_board_and_assets: five cases, figures, assets 200, no console error, talk briefing', async ({ page }) => {
  const errors = [];
  const bad = [];
  let seen = 0;
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', r => {
    if (!r.url().includes('/assets/renaissance/')) return;
    seen++;
    if (r.status() !== 200) bad.push(`${r.status()} ${r.url()}`);
  });
  await page.goto('/');
  await expect(page.locator('.case-option')).toHaveCount(5);
  const cases = await (await page.request.get('/api/cases')).json();
  expect(cases.cases.at(-1).id).toBe('renaissance-traveler');
  await start(page);
  await expect(page.locator('#app')).toHaveAttribute('data-world', 'renaissance');
  expect(await page.evaluate(() => window.walkingTestGame.scene.getScene('banana-grove').figs.size)).toBe(5);
  expect(seen).toBeGreaterThan(5);
  // Briefing: the three talk steps, none of the stock ones.
  const briefing = await page.locator('#panel').innerText();
  expect(await page.locator('#panel .task-list li').count()).toBe(3);
  expect(briefing).toMatch(/everyday/i);
  expect(briefing).toMatch(/Save quote/);
  expect(briefing).toMatch(/costs points, not the game/);
  for (const stale of ['Ask 5', 'quick question', 'Use your Arbiter tools', 'Make your verdict', 'Pick a role']) expect(briefing.toLowerCase()).not.toContain(stale.toLowerCase());
  // Rail: the accuse button and the quote count; tool cards are off.
  await expect(page.locator('.verdict-button')).toContainText('Accuse the traveller');
  await expect(page.locator('.verdict-button')).toContainText('0 quotes saved');
  await expect(page.locator('#toolbelt-cards')).toContainText('Not in this case');
  await expect(page.locator('#inspect-button')).toBeDisabled();
  await expect(page.locator('#continue-button')).toBeDisabled();
  await shot(page, '01-square');
  expect(bad).toEqual([]);
  expect(errors).toEqual([]);
});

test('renaissance_walk: D moves the scout', async ({ page }) => {
  await start(page);
  const pos = () => page.evaluate(() => { const s = window.walkingTestGame.scene.getScene('banana-grove'); return { x: s.player.x, y: s.player.y }; });
  const p0 = await pos();
  await page.keyboard.down('d');
  await page.waitForTimeout(500);
  await page.keyboard.up('d');
  expect((await pos()).x).toBeGreaterThan(p0.x + 5);
});

test('renaissance_topics: five chips answer once and are then disabled', async ({ page }) => {
  await start(page);
  const id = IDS[0];
  await page.locator(`[data-go="${id}"]`).first().click();
  for (let i = 0; i < TOPICS.length; i++) {
    await page.locator(`[data-topic="${TOPICS[i]}"]`).click();
    await expect.poll(async () => (await state(page)).session.interviews[id].length).toBe(i + 1);
  }
  await expect(page.locator('[data-topic]:disabled')).toHaveCount(5);
  await expect(page.locator('.talk-line')).toHaveCount(5);
  await shot(page, '02-chat');
});

test('renaissance_slips: only the traveller slips, at least three times', async ({ page }) => {
  const g = await playedThrough(page);
  const count = id => g.lines[id].filter(t => modernWords(t.answer, terms).length).length;
  expect(count(g.traveler)).toBeGreaterThanOrEqual(3);
  for (const id of IDS.filter(x => x !== g.traveler)) expect(count(id), id).toBe(0);
});

test('renaissance_followups: Pick words + What did you mean, typed question, puzzled local', async ({ page }) => {
  await start(page);
  const cast = castOf(await sessionIdOf(page), DATA);
  const traveler = Object.keys(cast).find(k => cast[k] === 'traveler');
  const local = IDS.find(id => id !== traveler);
  for (const id of [traveler, local]) for (const topic of TOPICS) await mustAct(page, 'interview', { character: id, topic });
  let st = await state(page);
  const slipTurn = st.session.interviews[traveler].find(t => slipOf(traveler, t.answer));
  const slip = slipOf(traveler, slipTurn.answer);
  // The player selects the whole slip term ("jet lag", "by car"), not just the lexicon word inside it.
  const term = slip.term;
  const termWords = term.split(/[\s-]+/);
  await page.reload();
  await page.locator('#begin-button').click().catch(() => {});
  await page.locator(`[data-go="${traveler}"]`).first().click();
  await page.locator(`[data-pick-line="${slipTurn.id}"]`).click();
  const words = await page.locator(`.word[data-line="${slipTurn.id}"]`).allInnerTexts();
  const i0 = words.findIndex((w, i) => termWords.every((tw, k) => (words[i + k] ?? '').toLowerCase().startsWith(tw.toLowerCase())));
  expect(i0).toBeGreaterThanOrEqual(0);
  const tok = i => page.locator(`.word[data-line="${slipTurn.id}"][data-word="${i}"]`);
  await tok(i0).click();
  if (termWords.length > 1) await tok(i0 + termWords.length - 1).click();
  await shot(page, '03-picking');
  const n0 = st.session.interviews[traveler].length;
  await page.locator(`[data-ask-about="${slipTurn.id}"]`).click();
  await expect.poll(async () => (await state(page)).session.interviews[traveler].length).toBe(n0 + 1);
  st = await state(page);
  expect(st.session.interviews[traveler].at(-1).answer).toBe(slip.followUps[0]);
  // A typed question that names the term gets the second follow-up.
  await page.locator('#question').fill(`Why did you say ${term}?`);
  await page.locator('#question').press('Enter');
  await expect.poll(async () => (await state(page)).session.interviews[traveler].length).toBe(n0 + 2);
  st = await state(page);
  expect(st.session.interviews[traveler].at(-1).answer).toBe(slip.followUps[1]);
  // A local asked about a modern word they never said is puzzled.
  await page.locator(`[data-go="${local}"]`).first().click();
  await page.locator('#question').fill('Do you have a smartphone?');
  await page.locator('#question').press('Enter');
  await expect.poll(async () => (await state(page)).session.interviews[local].length).toBe(TOPICS.length + 1);
  st = await state(page);
  expect(st.session.interviews[local].at(-1).answer).toBe(kase.talk.replies[local].puzzled);
});

test('renaissance_quotes: whole line and excerpt, fake excerpt 400, Quotes page, reload', async ({ page }) => {
  await start(page);
  const g = { ...(await (async () => {
    const cast = castOf(await sessionIdOf(page), DATA);
    const traveler = Object.keys(cast).find(k => cast[k] === 'traveler');
    for (const id of [traveler, IDS.find(x => x !== traveler)]) for (const topic of TOPICS) await mustAct(page, 'interview', { character: id, topic });
    return { traveler, local: IDS.find(x => x !== traveler), lines: (await state(page)).session.interviews };
  })()) };
  await page.reload();
  await page.locator('#begin-button').click().catch(() => {});
  // Whole local line through the UI.
  await page.locator(`[data-go="${g.local}"]`).first().click();
  await page.locator(`[data-save-quote="${g.lines[g.local][0].id}"]`).first().click();
  await expect.poll(async () => (await state(page)).session.talk.quotes.length).toBe(1);
  await expect(page.locator('.verdict-button')).toContainText('1 quote saved');
  // An excerpt of the traveller's slip line.
  const slipTurn = slipTurnOf(g);
  await page.locator(`[data-go="${g.traveler}"]`).first().click();
  await page.locator(`[data-pick-line="${slipTurn.id}"]`).click();
  await page.locator(`.word[data-line="${slipTurn.id}"][data-word="0"]`).click();
  await page.locator(`.word[data-line="${slipTurn.id}"][data-word="2"]`).click();
  await page.locator(`[data-save-quote="${slipTurn.id}"]`).first().click();
  await expect.poll(async () => (await state(page)).session.talk.quotes.length).toBe(2);
  const quotes = (await state(page)).session.talk.quotes;
  const excerpt = quotes.find(q => q.character === g.traveler);
  expect(excerpt.text.length).toBeLessThan(slipTurn.answer.length);
  expect(slipTurn.answer).toContain(excerpt.text);
  const fake = await act(page, 'quote', { line: g.lines[g.local][0].id, text: 'not in the line at all' });
  expect(fake.status()).toBe(400);
  await page.locator('[data-go="quotes"]').first().click();
  await expect(page.locator('[data-unquote]')).toHaveCount(2);
  await shot(page, '04-quotes');
  await page.reload();
  await page.locator('#begin-button').click().catch(() => {});
  expect((await state(page)).session.talk.quotes).toHaveLength(2);
  await expect(page.locator('.verdict-button')).toContainText('2 quotes saved');
});

test('renaissance_accusations: wrong and unsupported give feedback, the game stays open; the right one solves', async ({ page }) => {
  await start(page);
  const cast = castOf(await sessionIdOf(page), DATA);
  const traveler = Object.keys(cast).find(k => cast[k] === 'traveler');
  const local = IDS.find(x => x !== traveler);
  for (const id of [traveler, local]) for (const topic of TOPICS) await mustAct(page, 'interview', { character: id, topic });
  const lines = (await state(page)).session.interviews;
  const slipTurn = lines[traveler].find(t => slipOf(traveler, t.answer));
  const plainTurn = lines[traveler].find(t => !modernWords(t.answer, terms).length);
  await quoteWhole(page, lines[local][0].id);
  await quoteWhole(page, plainTurn.id);
  await quoteWhole(page, slipTurn.id);
  await page.reload();
  await page.locator('#begin-button').click().catch(() => {});
  const quotes = (await state(page)).session.talk.quotes;
  const accuse = async (who, ids) => {
    await page.locator('.verdict-button').click();
    await page.locator(`input[name="accuse-character"][value="${who}"]`).check();
    for (const q of ids) await page.locator(`input[name="accuse-quote"][value="${q}"]`).check();
    await page.locator('#accuse-submit').click();
  };
  const idOf = line => quotes.find(q => q.line === line).id;
  await accuse(local, [idOf(lines[local][0].id)]);
  await expect(page.locator('.accuse-feedback')).toContainText(kase.talk.replies[local].denial.slice(0, 20));
  expect((await state(page)).session.status).toBe('active');
  // The world stays visible on the accuse page: the dossier does not reach the top, and the top band is not a panel.
  const covered = await page.evaluate(() => {
    const d = document.querySelector('.dossier').getBoundingClientRect();
    const hit = document.elementFromPoint(innerWidth / 2, innerHeight * 0.2);
    return { top: d.top, height: innerHeight, inDossier: Boolean(hit?.closest('.dossier')), hit: hit?.tagName + '.' + hit?.className };
  });
  expect(covered.inDossier, JSON.stringify(covered)).toBe(false);
  expect(covered.top).toBeGreaterThan(covered.height * 0.3);
  await shot(page, '05-accuse-feedback');
  await accuse(traveler, [idOf(plainTurn.id)]);
  await expect.poll(async () => (await state(page)).session.talk.accusations.length).toBe(2);
  let st = await state(page);
  expect(st.session.status).toBe('active');
  expect(st.session.talk.accusations[1].feedback).toBe(st.session.talk.accusations[0].feedback);
  await accuse(traveler, [idOf(slipTurn.id)]);
  await expect.poll(async () => (await state(page)).session.status).toBe('closed');
  st = await state(page);
  expect(st.debrief.reveal.character).toBe(traveler);
  expect(st.debrief.wrong).toBe(2);
  expect(st.debrief.score).toBe(1);
  await expect(page.locator('#app')).toHaveAttribute('data-view', 'lineup');
  await shot(page, '06-reveal');
});

test('renaissance_events: open game hides the traveller, the closed export has it', async ({ page }) => {
  const g = await playedThrough(page);
  const open = await (await page.request.get('/api/events')).text();
  expect(open).not.toContain('"hidden"');
  expect(JSON.parse(open.split('\n')[0]).cast).toBeNull();
  const st0 = await state(page);
  const view = JSON.stringify(st0);
  // The view has a public `world.cast` (the words for a townsperson); the deal itself must not be in it.
  expect(st0.cast).toBeUndefined();
  expect(st0.session.cast).toBeUndefined();
  for (const secret of ['"hidden"', '"delivered"', `"${g.traveler}":"traveler"`]) expect(view).not.toContain(secret);
  await solve(page, g);
  expect((await state(page)).session.status).toBe('closed');
  const closed = await (await page.request.get('/api/events')).text();
  expect(closed).toContain('"hidden"');
  expect(JSON.parse(closed.split('\n')[0]).cast).not.toBeNull();
  const board = JSON.stringify(await (await page.request.get('/api/leaderboard')).json());
  expect(board).toContain('renaissance-traveler');
});

test('renaissance_phone: 390x844 has no horizontal scroll and a chat opens', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator(`[data-go="${IDS[0]}"]`).first().click();
  await page.locator('[data-topic]').first().click();
  await expect(page.locator('.talk-line')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await shot(page, '07-phone-chat');
});

// The scout's drawn walk (art request R1).
walkSheetTests({
  test, expect, level: 'renaissance', start,
  at: { x: 160, y: 240, top: 122 },
  open: async page => {
    await page.locator(`[data-go="${IDS[0]}"]`).first().click();
    await expect(page.locator('[data-topic]').first()).toBeVisible({ timeout: 15_000 });
  },
});
