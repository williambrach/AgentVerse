import { test, expect } from './team.mjs';
import { walkSheetTests } from './walk-sheet.mjs';
import { castOf, sessionIdOf, interviewAll, lockIn, pickRole } from './cast.mjs';
import { mkdirSync } from 'node:fs';
import kase from '../../server/cases/renaissance-traveler.mjs';
import { modernWords } from '../../server/anachronism.mjs';

// Runs against the renaissance server (port 4326, rehearsal, dev tools on): see the renaissance project in playwright.config.mjs.
// Castelvento v2: typed questions, Inspect reasoning and Let them talk are on; the lineup marks exactly one traveller.
const IDS = kase.characters.map(c => c.id);
const DATA = 'test-results/sessions-renaissance';
const SHOTS = process.env.RENAISSANCE_SHOTS;
const shot = async (page, name) => { if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/${name}.png` }); } };

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
const travelerOf = async page => { const cast = castOf(await sessionIdOf(page), DATA); return Object.keys(cast).find(k => cast[k] === 'traveler'); };

test('renaissance_board_and_assets: five cases, figures, assets 200, no console error, tools on', async ({ page }) => {
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
  // Listed at its own order position (banana 1, department 2, renaissance 3, factory 4, friends 5), not last.
  expect(cases.cases.map(c => c.id).indexOf('renaissance-traveler')).toBe(2);
  await start(page);
  await expect(page.locator('#app')).toHaveAttribute('data-world', 'renaissance');
  expect(seen).toBeGreaterThan(5);
  const briefing = await page.locator('#panel').innerText();
  expect(briefing).toMatch(/exactly one/i);
  for (const stale of ['Save quote', 'costs points, not the game', 'quotes saved']) expect(briefing).not.toContain(stale);
  // Rail: the stock verdict button and no Quotes page; both tools are in the case.
  await expect(page.locator('.verdict-button')).not.toContainText('quotes');
  await expect(page.locator('[data-go="quotes"]')).toHaveCount(0);
  await expect(page.locator('#toolbelt-cards')).not.toContainText('Not in this case');
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

test('renaissance_chat: a typed question, no topic chips, only the traveller slips', async ({ page }) => {
  await start(page);
  const traveler = await travelerOf(page);
  for (const id of IDS) {
    await page.locator(`#room-nav [data-go="${id}"]`).click();
    await expect(page.locator('[data-topic]')).toHaveCount(0);
    await page.locator('#question').fill('How do you spend your evenings?');
    await page.keyboard.press('Enter');
    await expect(page.locator('.speech.character.latest')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#interview-form .ask-button')).toBeEnabled();
  }
  const lines = (await state(page)).session.interviews;
  for (const id of IDS) expect(modernWords(lines[id].at(-1).answer).length > 0, id).toBe(id === traveler);
  await expect(page.locator('.talk-line, .quote-button, [data-pick]')).toHaveCount(0);
  await shot(page, '02-chat');
});

test('renaissance_inspect_and_talk: reasoning shows the traveller worry, the town talks', async ({ page }) => {
  await start(page);
  const traveler = await travelerOf(page);
  await page.locator(`#room-nav [data-go="${traveler}"]`).click();
  await page.locator('[data-quick-question]').click();
  await expect(page.locator('.speech.character.latest')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#inspect-button')).toBeEnabled();
  await page.locator('#inspect-button').click();
  await expect.poll(async () => (await state(page)).session.inspections.length).toBe(1);
  expect((await state(page)).session.inspections[0].reasoning).toMatch(/2026/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#continue-button')).toBeEnabled();
  await page.locator('#continue-button').click();
  await expect.poll(async () => (await state(page)).session.thread.length, { timeout: 15_000 }).toBeGreaterThan(0);
  await shot(page, '03-talk');
});

test('renaissance_lineup: two choices each, exactly one traveller, then the debrief', async ({ page }) => {
  await start(page);
  await interviewAll(page);
  const traveler = await travelerOf(page);
  await page.locator('.verdict-button').click();
  await expect(page.locator('#app')).toHaveAttribute('data-view', 'lineup');
  await expect(page.locator('#panel h1')).toHaveText(kase.copy.report.title, { timeout: 12_000 });
  await expect(page.locator('fieldset.role-row')).toHaveCount(5);
  await expect(page.locator('fieldset.role-row').first().locator('.role-chip input')).toHaveCount(2);
  // Everyone a townsperson: all picked, but the lock stays shut and says why.
  for (const id of IDS) await pickRole(page, id, 'local');
  await expect(page.locator('#lock-in')).toBeDisabled();
  await expect(page.locator('#lock-in .lock-count')).toHaveText('Mark exactly 1 as Time traveller');
  await pickRole(page, IDS[0], 'traveler');
  await pickRole(page, IDS[1], 'traveler');
  await expect(page.locator('#lock-in')).toBeDisabled();
  await pickRole(page, IDS[1], 'local');
  await pickRole(page, IDS[0], 'local');
  await shot(page, '04-lineup');
  await lockIn(page, Object.fromEntries(IDS.map(id => [id, id === traveler ? 'traveler' : 'local'])));
  await expect(page.locator('#panel .debrief-head')).toBeVisible();
  await expect(page.locator('.verdict-summary')).toContainText('5 / 5');
  await expect(page.locator('#panel')).toContainText(`The traveller was ${kase.characters.find(c => c.id === traveler).name}.`);
  await shot(page, '05-debrief');
});

test('renaissance_events: open game hides the traveller, the closed export has the cast', async ({ page }) => {
  await start(page);
  await interviewAll(page);
  const traveler = await travelerOf(page);
  const open = await (await page.request.get('/api/events')).text();
  expect(JSON.parse(open.split('\n')[0]).cast).toBeNull();
  const view = JSON.stringify(await state(page));
  for (const secret of ['"hidden"', 'YOUR SECRET', 'planetarium', 'secrets', `"${traveler}":"traveler"`]) expect(view).not.toContain(secret);
  await lockIn(page, Object.fromEntries(IDS.map(id => [id, id === traveler ? 'traveler' : 'local'])));
  expect((await state(page)).session.status).toBe('closed');
  const closed = await (await page.request.get('/api/events')).text();
  expect(JSON.parse(closed.split('\n')[0]).cast).not.toBeNull();
  const board = JSON.stringify(await (await page.request.get('/api/leaderboard')).json());
  expect(board).toContain('renaissance-traveler');
});

test('renaissance_phone: 390x844 has no horizontal scroll and a chat opens', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator(`[data-go="${IDS[0]}"]`).first().click();
  await page.locator('[data-quick-question]').click();
  await expect(page.locator('.speech.character.latest')).toBeVisible({ timeout: 15_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await shot(page, '06-phone-chat');
});

// The scout's drawn walk (art request R1).
walkSheetTests({
  test, expect, level: 'renaissance', start,
  at: { x: 160, y: 240, top: 122 },
  open: async page => {
    await page.locator(`[data-go="${IDS[0]}"]`).first().click();
    await expect(page.locator('[data-quick-question]')).toBeVisible({ timeout: 15_000 });
  },
});

// Prop activity areas, depth sorting and compact name tags (castelvento-scene).
const scene = (page, fn, arg) => page.evaluate(`(${fn})(window.walkingTestGame.scene.getScene('banana-grove'), ${JSON.stringify(arg ?? null)})`);
const teleport = (page, x, y) => scene(page, (s, p) => { s.player.body.reset(p.x, p.y); }, { x, y });
const pressE = async page => { await page.keyboard.down('e'); await page.waitForTimeout(150); await page.keyboard.up('e'); };
const tagOf = (page, id) => page.locator(`#station .station-labels [data-figure="${id}"]`);
/** A scenery prop as drawn: its ground point (x, y) and depth. */
const propOf = (page, id) => scene(page, (s, want) => {
  const img = s.children.list.find(o => o.texture?.key === 'renaissance-scenery' && o.frame?.name === want);
  return img ? { x: img.x, y: img.y, depth: img.depth } : null;
}, id);

test('scout_depth_sorts_with_props: behind a prop when north of its foot, in front when south', async ({ page }) => {
  await start(page);
  const barrel = await propOf(page, 'barrel');
  expect(barrel).not.toBeNull();
  expect(barrel.depth).toBe(barrel.y);
  const depthAt = async y => {
    await teleport(page, barrel.x - 45, y);
    await page.waitForTimeout(250);
    return scene(page, s => s.detectiveImg.depth);
  };
  expect(await depthAt(barrel.y - 12)).toBeLessThan(barrel.depth);
  expect(await depthAt(barrel.y + 12)).toBeGreaterThan(barrel.depth);
});

test('prop_footprint_blocks: walking into the crate stack stops the scout', async ({ page }) => {
  await start(page);
  const crate = await propOf(page, 'crate-stack');
  await teleport(page, crate.x - 45, crate.y - 3);
  await page.keyboard.down('d');
  await page.waitForTimeout(1500);
  await page.keyboard.up('d');
  const at = await scene(page, s => ({ x: s.player.x, y: s.player.y }));
  expect(at.x).toBeGreaterThan(crate.x - 45 + 5);
  expect(at.x).toBeLessThan(crate.x - 5);
});

test('every_npc_reachable_and_opens_dialogue: from the approach point E opens each chat and its tag turns strong', async ({ page }) => {
  await start(page);
  for (const id of IDS) {
    const foot = await scene(page, (s, who) => ({ x: s.figs.get(who).foot.x, y: s.figs.get(who).foot.y }), id);
    await teleport(page, foot.x, foot.y + 14);
    await page.waitForTimeout(200);
    const at = await scene(page, s => ({ x: s.player.x, y: s.player.y }));
    expect(Math.hypot(at.x - foot.x, at.y - foot.y - 14), `${id} approach is open ground`).toBeLessThan(3);
    await pressE(page);
    await expect(page.locator('#app')).toHaveAttribute('data-dialogue', 'open', { timeout: 15_000 });
    await expect(page.locator(`.hud-rail [data-go="${id}"]`)).toHaveClass(/active/);
    await expect(tagOf(page, id)).toHaveAttribute('data-emphasis', 'strong');
    await page.keyboard.press('Escape');
    await expect(page.locator('#app')).toHaveAttribute('data-dialogue', 'closed');
  }
});

test('accuse_button_opens_report: no report stop, the rail button opens it', async ({ page }) => {
  await start(page);
  expect(await scene(page, s => 'report' in s.stops)).toBe(false);
  await page.locator('.verdict-button').click();
  await expect(page.locator('#app')).toHaveAttribute('data-dialogue', 'open');
  await expect(page.locator('[data-go="report"]').first()).toHaveClass(/active/);
});

test('no_traveller_hint_in_labels: five tags, no stop tags, the same words for every deal', async ({ page }) => {
  await start(page);
  const tags = page.locator('#station .station-labels [data-figure]');
  const texts = await tags.evaluateAll(els => els.filter(e => e.dataset.figure !== 'detective').map(e => e.textContent));
  expect(texts.length).toBe(5);
  const joined = texts.join(' ');
  expect(joined).not.toMatch(/START HERE|YOUR GUESS|traveller|traveler|stranger|suspect/i);
  for (const id of IDS) await expect(tagOf(page, id)).toHaveAttribute('data-emphasis', /^(strong|subtle)$/);
  // Emphasis follows the scout, never the case: with the scout at the briefing stop no tag is strong by deal.
  const strong = await page.locator('#station .station-labels [data-emphasis="strong"]').count();
  expect(strong).toBeLessThanOrEqual(1);
});
