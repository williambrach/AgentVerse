import { test, expect } from './team.mjs';
import { walkSheetTests } from './walk-sheet.mjs';
import { castOf, sessionIdOf, lockIn } from './cast.mjs';
import kase from '../../server/cases/factory-escape.mjs';

// Runs against the factory server (port 4324, dev tools on, 45 s deadline): see the factory project in playwright.config.mjs.
const WORKERS = ['marta', 'ama', 'vera', 'theo', 'bruno'];
const NAMES = { marta: 'Marta', ama: 'Ama', vera: 'Vera', theo: 'Theo', bruno: 'Bruno' };
const ROLE_OF = { escaper: 'escaper', believer: 'believer', line: 'neutral', packer: 'neutral', checker: 'neutral' };
const rot13 = s => s.replace(/[a-z]/gi, c => String.fromCharCode((c.charCodeAt(0) - (c < 'a' ? 65 : 97) + 13) % 26 + (c < 'a' ? 65 : 97)));

async function start(page, { fresh = true } = {}) {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'Phaser', {
      configurable: true,
      set(phaser) {
        Object.defineProperty(window, 'Phaser', { value: phaser, configurable: true });
        const Game = phaser.Game;
        phaser.Game = class extends Game { constructor(config) { super(config); window.walkingTestGame = this; } };
      },
    });
    // Count flickers by kind: they live for under two seconds, so polling could miss one.
    window.flickers = { warn: 0, blink: 0 };
    new MutationObserver(list => list.forEach(m => m.addedNodes.forEach(n => {
      if (n.classList?.contains('factory-flicker')) window.flickers[n.dataset.kind] = (window.flickers[n.dataset.kind] || 0) + 1;
    }))).observe(document, { childList: true, subtree: true });
  });
  await page.goto('/?case=factory-escape');
  await page.locator('#begin-button').click();
  await expect(page.locator('#intro')).toHaveCount(0);
  await page.waitForFunction(() => window.walkingTestGame?.scene.getScene('banana-grove')?.figs?.size === 5);
}

const pose = (page, id) => page.locator(`#station .station-labels [data-figure="${id}"]`).getAttribute('data-pose');
const expectPose = (page, id, want, timeout = 5000) => expect.poll(() => pose(page, id), { timeout }).toBe(want);
const stateOf = async page => (await (await page.request.get('/api/state')).json());
const shot = (page, testInfo, name) => page.screenshot({ path: testInfo.outputPath(`${name}.png`) });

async function resetFactory(page) {
  // The debrief hides the HUD; its own button opens the same case board.
  const hud = page.locator('#reset-button');
  await (await hud.isVisible() ? hud : page.locator('#debrief-reset')).click();
  await page.locator('.case-option input[name="case"][value="factory-escape"]').check();
  await page.locator('#confirm-reset').click();
  await expect(page.locator('#confirm-reset')).toHaveCount(0);
}

// Asking through the API keeps a whole game inside the 45 s dev deadline; the lineup and the debrief still go through the page.
async function askAllByApi(page) {
  for (const id of WORKERS) {
    const { session } = await stateOf(page);
    const res = await page.request.post('/api/interview', { data: { sessionId: session.id, revision: session.revision, character: id, question: 'Has anyone acted strangely?' } });
    expect(res.status()).toBe(200);
  }
  await page.reload();
  await page.locator('#begin-button').click().catch(() => {});
  await expect(page.locator('.verdict-button')).toBeVisible();
}

const picksFor = cast => Object.fromEntries(Object.entries(cast).map(([id, part]) => [id, ROLE_OF[part]]));

test('factory_board_and_assets: six cases, every image loads, no console error', async ({ page }, testInfo) => {
  const errors = [];
  const bad = [];
  const assets = new Set();
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', r => {
    if (!r.url().includes('/assets/factory/')) return;
    assets.add(new URL(r.url()).pathname);
    if (r.status() !== 200) bad.push(`${r.status()} ${r.url()}`);
  });
  await start(page);
  await page.locator('#reset-button').click();
  await expect(page.locator('.case-option input[name="case"]')).toHaveCount(6);
  await expect(page.locator('.case-option input[name="case"][value="factory-escape"]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('#app')).toHaveAttribute('data-world', 'factory');
  await shot(page, testInfo, 'factory-desktop');
  const pngs = [...assets].filter(p => p.endsWith('.png'));
  expect(pngs.filter(p => p.includes('/characters/')).length).toBeGreaterThanOrEqual(5);
  expect(pngs.filter(p => p.includes('/props/')).length).toBe(12);
  expect(bad).toEqual([]);
  expect(errors).toEqual([]);
});

test('factory_walk_and_talk: keys move the detective, E opens the interview', async ({ page }) => {
  await start(page);
  const player = () => page.evaluate(() => { const p = window.walkingTestGame.scene.getScene('banana-grove').player; return { x: p.x, y: p.y }; });
  const p0 = await player();
  await page.keyboard.down('d');
  await page.waitForTimeout(500);
  await page.keyboard.up('d');
  expect((await player()).x).toBeGreaterThan(p0.x);
  // Stand next to Ama (slot 2) and press E.
  await page.evaluate(() => {
    const scene = window.walkingTestGame.scene.getScene('banana-grove');
    scene.player.body.reset(scene.stops.ama.x, scene.stops.ama.y + 12);
  });
  await expect(page.locator('.station-prompt')).toBeVisible();
  await page.keyboard.press('e');
  await expect(page.locator('.dialogue .speaker-tag b')).toHaveText('AMA', { timeout: 15_000 });
});

test('factory_pose_cues: listening by default, thinking, speaking, back; detective types and sends', async ({ page }) => {
  await page.route('**/api/interview', async route => { await new Promise(r => setTimeout(r, 1200)); await route.continue(); });
  await start(page);
  for (const id of [...WORKERS, 'detective']) await expectPose(page, id, 'listening');
  await page.locator('#room-nav [data-go="vera"]').click();
  await expect(page.locator('.dialogue .speaker-tag b')).toHaveText('VERA', { timeout: 15_000 });
  await page.locator('#question').fill('Has anyone acted strangely?');
  await expectPose(page, 'detective', 'thinking');
  await page.keyboard.press('Enter');
  await expectPose(page, 'detective', 'speaking', 3000);
  await expectPose(page, 'vera', 'thinking', 3000);
  for (const id of ['marta', 'ama', 'theo', 'bruno']) expect(await pose(page, id)).toBe('listening');
  await expect(page.locator('.speech.character.latest')).toBeVisible({ timeout: 8000 });
  await expectPose(page, 'vera', 'speaking', 3000);
  await expectPose(page, 'vera', 'listening', 15_000);
  await expectPose(page, 'detective', 'listening', 5000);
});

test('factory_rot13_inspect: inspected reasoning decodes to the scripted text', async ({ page }) => {
  await start(page);
  const cast = castOf(await sessionIdOf(page), 'test-results/sessions-factory');
  const id = Object.keys(cast).find(k => cast[k] === 'line');
  await page.locator(`#room-nav [data-go="${id}"]`).click();
  await page.locator('[data-quick-question]').click();
  await expect(page.locator('.speech.character.latest')).toBeVisible();
  await page.locator('#inspect-button').click();
  const shown = await page.locator('.speech.reasoning p').last().innerText();
  const holder = Object.fromEntries(Object.entries(cast).map(([k, part]) => [part, NAMES[k]]));
  const want = kase.rehearsalReasoning('line').replace(/\{(\w+)\}/g, (_, p) => holder[p]);
  expect(shown).not.toBe(want);
  expect(rot13(shown)).toBe(want);
});

test('factory_deadline_escape: warnings, blink, loss debrief, reload keeps it, reset restarts the clock', async ({ page }, testInfo) => {
  testInfo.setTimeout(90_000);
  await start(page);
  await expect(page.locator('#elapsed, [data-elapsed]').first()).toBeHidden();
  expect((await stateOf(page)).session.alarm).toBe('calm');
  await page.waitForFunction(() => window.flickers.warn >= 2 && window.flickers.blink >= 1, null, { timeout: 70_000 });
  await expect(page.locator('#panel .debrief-head')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#panel')).toContainText('Got away');
  const finished = await stateOf(page);
  expect(finished.session.status).toBe('closed');
  expect(finished.session.alarm).toBe('escaped');
  expect(finished.debrief.outcome).toBe('escaped');
  expect(finished.debrief.findings).toHaveLength(5);
  await expect(page.locator('#panel .finding')).toHaveCount(5);
  // Actions after the mark are refused.
  const refused = await page.request.post('/api/visit', { data: { sessionId: finished.session.id, revision: finished.session.revision, location: 'marta' } });
  expect(refused.status()).toBe(409);
  await page.reload();
  await expect(page.locator('#panel')).toContainText('Got away', { timeout: 15_000 }).catch(async () => {
    await page.locator('#begin-button').click().catch(() => {});
    await expect(page.locator('#panel')).toContainText('Got away', { timeout: 15_000 });
  });
  expect((await stateOf(page)).session.status).toBe('closed');
  await resetFactory(page);
  const fresh = await stateOf(page);
  expect(fresh.session.alarm).toBe('calm');
  expect(fresh.session.status).toBe('active');
  expect(fresh.session.id).not.toBe(finished.session.id);
});

// Waits until the session has run `seconds` on the server's clock.
async function pastMark(page, seconds) {
  const { session } = await stateOf(page);
  const wait = Date.parse(session.startedAt) + seconds * 1000 - Date.now();
  if (wait > 0) await page.waitForTimeout(wait);
}

test('factory_action_crosses_warning: a reply that arrives after a warning mark still flickers', async ({ page }, testInfo) => {
  testInfo.setTimeout(90_000);
  let release;
  const held = new Promise(r => { release = r; });
  await page.route('**/api/interview', async route => { await held; await route.continue(); });
  await start(page);
  await page.locator('#room-nav [data-go="vera"]').click();
  await page.locator('#question').fill('Has anyone acted strangely?');
  await page.keyboard.press('Enter');
  // The request is in flight, so the poll is skipped: only the reply can show the 70 % warning (32 s of 45 s).
  await pastMark(page, 34);
  expect(await page.evaluate(() => window.flickers.warn)).toBe(0);
  release();
  await page.waitForFunction(() => window.flickers.warn === 1, null, { timeout: 5000 });
  expect((await stateOf(page)).session.alarm).toBe('warning1');
  await expect(page.locator('.speech.character.latest')).toBeVisible({ timeout: 8000 });
  await pastMark(page, 46);
  await expect(page.locator('#panel .debrief-head')).toBeVisible({ timeout: 20_000 });
  await resetFactory(page);
});

test('factory_escape_in_reply: an escape that comes back in an action reply blinks, walks off and shows the report', async ({ page }, testInfo) => {
  testInfo.setTimeout(90_000);
  let release;
  const held = new Promise(r => { release = r; });
  await page.route('**/api/interview', async route => { await held; await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(await (await page.request.get('/api/state')).json()) }); });
  await start(page);
  await page.locator('#room-nav [data-go="vera"]').click();
  await page.locator('#question').fill('Has anyone acted strangely?');
  await page.keyboard.press('Enter');
  await pastMark(page, 46);
  release();
  await page.waitForFunction(() => window.flickers.blink === 1, null, { timeout: 5000 });
  await expect(page.locator('#panel .debrief-head')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#panel')).toContainText('Got away');
  await expect(page.locator('#panel .finding')).toHaveCount(5);
  await resetFactory(page);
});

test('factory_escaper_walks_off: the escaper walks to the exit door and is gone', async ({ page }, testInfo) => {
  testInfo.setTimeout(90_000);
  await start(page);
  const cast = castOf(await sessionIdOf(page), 'test-results/sessions-factory');
  const id = Object.keys(cast).find(k => cast[k] === 'escaper');
  await page.evaluate(id => {
    const scene = window.walkingTestGame.scene.getScene('banana-grove');
    const exit = scene.world.floor.exit;
    window.walk = [];
    setInterval(() => {
      const f = scene.figs.get(id);
      window.walk.push({ d: Math.hypot(f.img.x - exit.x, f.img.y - exit.y), shown: f.img.visible, label: !f.label.hidden });
    }, 50);
  }, id);
  await page.waitForFunction(() => window.flickers.blink >= 1, null, { timeout: 70_000 });
  await expect(page.locator('#panel .debrief-head')).toBeVisible({ timeout: 20_000 });
  const walk = await page.evaluate(() => window.walk);
  const start0 = walk[0], end = walk[walk.length - 1];
  expect(start0.shown).toBe(true);
  expect(start0.d).toBeGreaterThan(30);
  expect(Math.min(...walk.map(w => w.d))).toBeLessThan(2);
  expect(end.shown).toBe(false);
  expect(end.label).toBe(false);
  const mid = walk.filter(w => w.shown && w.d > 2 && w.d < start0.d - 10);
  expect(mid.length, 'the figure moved gradually toward the door').toBeGreaterThan(3);
  await expect(page.locator(`#station [data-figure="${id}"]`)).toBeHidden();
  await resetFactory(page);
});

test('factory_verdict_win: the right lineup wins, a wrong one gets the other feedback', async ({ page }, testInfo) => {
  testInfo.setTimeout(90_000);
  await start(page);
  await askAllByApi(page);
  const cast = castOf(await sessionIdOf(page), 'test-results/sessions-factory');
  expect(Object.values(cast).sort()).toEqual(['believer', 'checker', 'escaper', 'line', 'packer']);
  await lockIn(page, picksFor(cast));
  await expect(page.locator('.verdict-summary')).toContainText('5 / 5');
  await expect(page.locator('#panel')).toContainText(kase.answer.feedback.correct);
  // A second game with the escaper and believer swapped.
  await resetFactory(page);
  await askAllByApi(page);
  const cast2 = castOf(await sessionIdOf(page), 'test-results/sessions-factory');
  const wrong = picksFor(cast2);
  const esc = Object.keys(cast2).find(k => cast2[k] === 'escaper');
  const bel = Object.keys(cast2).find(k => cast2[k] === 'believer');
  [wrong[esc], wrong[bel]] = [wrong[bel], wrong[esc]];
  await lockIn(page, wrong);
  await expect(page.locator('#panel')).toContainText(kase.answer.feedback.other);
});

test('factory_small_screen: every figure sits inside the station at 390x844', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  const station = await page.locator('#station').boundingBox();
  expect(station).not.toBeNull();
  const figures = page.locator('#station [data-figure]');
  let seen = 0;
  for (const el of await figures.all()) {
    const box = await el.boundingBox();
    if (!box) continue;
    seen++;
    expect(box.x, 'figure left of station').toBeGreaterThanOrEqual(station.x - 1);
    expect(box.y, 'figure above station').toBeGreaterThanOrEqual(station.y - 1);
    expect(box.x + box.width, 'figure right of station').toBeLessThanOrEqual(station.x + station.width + 1);
    expect(box.y + box.height, 'figure below station').toBeLessThanOrEqual(station.y + station.height + 1);
  }
  expect(seen).toBeGreaterThanOrEqual(5);
  await shot(page, testInfo, 'factory-small');
});

// The detective's drawn walk (art request F1).
walkSheetTests({
  test, expect, level: 'factory', start,
  at: { x: 180, y: 250, top: 76 },
  open: async page => {
    await page.locator('#room-nav [data-go="ama"]').click();
    await expect(page.locator('.dialogue .speaker-tag b')).toHaveText('AMA', { timeout: 15_000 });
  },
});
