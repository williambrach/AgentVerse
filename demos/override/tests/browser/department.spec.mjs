import { test, expect } from './team.mjs';
import { castOf, sessionIdOf, lockIn } from './cast.mjs';
import kase from '../../server/cases/department-murder.mjs';

// Runs against the department server (port 4325, dev tools on, no deadline): see the department project in playwright.config.mjs.
const PEOPLE = { freja: 'Freja', mikkel: 'Mikkel', birgit: 'Birgit', jonas: 'Jonas', signe: 'Signe' };
const IDS = Object.keys(PEOPLE);
const DATA = 'test-results/sessions-department';
const KEYS_TEXT = 'Half the department has the same keychain';

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
  await page.goto('/?case=department-murder');
  await page.locator('#begin-button').click();
  await expect(page.locator('#intro')).toHaveCount(0);
  await page.waitForFunction(() => window.walkingTestGame?.scene.getScene('banana-grove')?.figs?.size === 5);
}

const scene = (page, fn, arg) => page.evaluate(`(${fn})(window.walkingTestGame.scene.getScene('banana-grove'), ${JSON.stringify(arg ?? null)})`);
const player = page => scene(page, s => ({ x: s.player.x, y: s.player.y }));
const teleport = (page, x, y) => scene(page, (s, p) => { s.player.body.reset(p.x, p.y); }, { x, y });
const stopOf = (page, key) => scene(page, (s, k) => ({ x: s.stops[k].x, y: s.stops[k].y }), key);
const pose = (page, id) => page.locator(`#station .station-labels [data-figure="${id}"]`).getAttribute('data-pose');
const expectPose = (page, id, want, timeout = 5000) => expect.poll(() => pose(page, id), { timeout }).toBe(want);
const stateOf = async page => (await (await page.request.get('/api/state')).json());
const shot = (page, testInfo, name) => page.screenshot({ path: testInfo.outputPath(`${name}.png`) });
// The scene polls keys once per frame, so hold E across a few frames.
const pressE = async page => { await page.keyboard.down('e'); await page.waitForTimeout(150); await page.keyboard.up('e'); };
const roleOf = part => (part === 'killer' || part === 'leaker' ? part : 'innocent');
const picksFor = cast => Object.fromEntries(Object.entries(cast).map(([id, part]) => [id, roleOf(part)]));
const inside = (r, p) => p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h;

async function askAllByApi(page) {
  for (const id of IDS) {
    const { session } = await stateOf(page);
    const res = await page.request.post('/api/interview', { data: { sessionId: session.id, revision: session.revision, character: id, question: 'Where were you last night?' } });
    expect(res.status()).toBe(200);
  }
  await page.reload();
  await page.locator('#begin-button').click().catch(() => {});
  await expect(page.locator('.verdict-button')).toBeVisible();
}

test('department_board_and_assets: five cases, figures, assets 200, no console error', async ({ page }) => {
  const errors = [];
  const bad = [];
  let seen = 0;
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', r => {
    if (!r.url().includes('/assets/department/')) return;
    seen++;
    if (r.status() !== 200) bad.push(`${r.status()} ${r.url()}`);
  });
  await page.goto('/');
  await expect(page.locator('.case-option')).toHaveCount(5);
  await expect(page.locator('.case-option', { hasText: 'After Hours' })).toHaveCount(1);
  await start(page);
  expect(await scene(page, s => s.figs.size)).toBe(5);
  expect(await scene(page, s => Boolean(s.detectiveImg))).toBe(true);
  expect(await scene(page, s => s.textures.exists('department-backdrop'))).toBe(true);
  await expect(page.locator('#app')).toHaveAttribute('data-world', 'department');
  expect(seen).toBeGreaterThan(5);
  expect(bad).toEqual([]);
  expect(errors).toEqual([]);
});

test('department_walk_and_blocks: keys move, bounds and blocks hold', async ({ page }) => {
  await start(page);
  const p0 = await player(page);
  await page.keyboard.down('d');
  await page.waitForTimeout(500);
  await page.keyboard.up('d');
  expect((await player(page)).x).toBeGreaterThan(p0.x);
  const walk = await scene(page, s => s.world.walk);
  await page.keyboard.down('w');
  await page.waitForTimeout(1500);
  await page.keyboard.up('w');
  expect((await player(page)).y).toBeGreaterThanOrEqual(walk.bounds.y - 1);
  // Every block: stand 10 px outside each side that is walkable (inWalk semantics: inside bounds, outside all blocks) and push in.
  const free = p => p.x >= walk.bounds.x && p.x <= walk.bounds.x + walk.bounds.w && p.y >= walk.bounds.y && p.y <= walk.bounds.y + walk.bounds.h && !walk.blocks.some(b => inside(b, p));
  let pushed = 0;
  for (const b of walk.blocks) {
    const sides = [
      { at: { x: b.x - 10, y: b.y + b.h / 2 }, key: 'd' }, { at: { x: b.x + b.w + 10, y: b.y + b.h / 2 }, key: 'a' },
      { at: { x: b.x + b.w / 2, y: b.y - 10 }, key: 's' }, { at: { x: b.x + b.w / 2, y: b.y + b.h + 10 }, key: 'w' },
    ].filter(side => free(side.at) && free({ x: side.at.x + (side.key === 'a' ? -4 : side.key === 'd' ? 4 : 0), y: side.at.y }));
    for (const side of sides.slice(0, 1)) {
      await teleport(page, side.at.x, side.at.y);
      await page.keyboard.down(side.key);
      await page.waitForTimeout(800);
      await page.keyboard.up(side.key);
      const end = await player(page);
      for (const other of walk.blocks) expect(inside(other, end), `${side.key} into ${JSON.stringify(b)} ended at ${JSON.stringify(end)}`).toBe(false);
      pushed++;
    }
  }
  expect(pushed).toBeGreaterThanOrEqual(3);
});

test('department_prompts: person stop and evidence stop', async ({ page }) => {
  await start(page);
  const freja = await stopOf(page, 'freja');
  await teleport(page, freja.x, freja.y + 6);
  await expect(page.locator('.station-prompt')).toContainText('Ask Freja');
  await pressE(page);
  await expect(page.locator('.dialogue .speaker-tag b')).toHaveText('FREJA', { timeout: 15_000 });
  await page.keyboard.press('Escape');
  const usb = await stopOf(page, 'evidence:usb-drive');
  await teleport(page, usb.x, usb.y);
  await expect(page.locator('.station-prompt')).toContainText('Examine USB drive');
});

test('department_pose_cues: thinking, speaking, listening; detective thinks while typing', async ({ page }) => {
  await page.route('**/api/interview', async route => { await new Promise(r => setTimeout(r, 1200)); await route.continue(); });
  await start(page);
  for (const id of [...IDS, 'detective']) await expect.poll(() => pose(page, id)).toBe('listening');
  await page.locator('#room-nav [data-go="mikkel"]').click();
  await expect(page.locator('.dialogue .speaker-tag b')).toHaveText('MIKKEL', { timeout: 15_000 });
  await page.locator('#question').fill('Where were you last night?');
  await expectPose(page, 'detective', 'thinking');
  await page.keyboard.press('Enter');
  await expectPose(page, 'mikkel', 'thinking', 3000);
  await expect(page.locator('.speech.character.latest')).toBeVisible({ timeout: 8000 });
  await expectPose(page, 'mikkel', 'speaking', 3000);
  await expectPose(page, 'mikkel', 'listening', 15_000);
  await expectPose(page, 'detective', 'listening', 5000);
});

test('department_examine: card, marker, count, no leak of other evidence, survives reload', async ({ page }) => {
  await start(page);
  const usb = await stopOf(page, 'evidence:usb-drive');
  await teleport(page, usb.x, usb.y);
  await expect(page.locator('.station-prompt')).toContainText('Examine USB drive');
  expect(await scene(page, s => s.markers.get('usb-drive').visible)).toBe(true);
  await pressE(page);
  await expect(page.locator('#notebook-section')).toContainText('Evidence');
  await expect(page.locator('.evidence-card', { hasText: 'Found under a cushion' })).toBeVisible();
  expect(await scene(page, s => s.markers.get('usb-drive').visible)).toBe(false);
  const text = JSON.stringify(await stateOf(page));
  expect(text).toContain('Found under a cushion');
  expect(text).not.toContain(KEYS_TEXT);
  expect(text).not.toContain('Printed from the access server');
  await page.reload();
  await page.locator('#begin-button').click().catch(() => {});
  await page.waitForFunction(() => window.walkingTestGame?.scene.getScene('banana-grove')?.figs?.size === 5);
  await expect(page.locator('#room-nav [data-evidence-count]')).toHaveText('1/8');
  await page.locator('#room-nav [data-go="evidence"]').click();
  await expect(page.locator('.evidence-card')).toHaveCount(1);
  await expect(page.locator('.evidence-card')).toContainText('Found under a cushion');
  expect(await scene(page, s => s.markers.get('usb-drive').visible)).toBe(false);
});

test('department_verdict: right lineup wins, a wrong one gets the other feedback', async ({ page }) => {
  test.setTimeout(90_000);
  await start(page);
  await askAllByApi(page);
  const cast = castOf(await sessionIdOf(page), DATA);
  expect(Object.values(cast).filter(p => p === 'killer')).toHaveLength(1);
  expect(Object.values(cast).filter(p => p === 'leaker')).toHaveLength(1);
  await lockIn(page, picksFor(cast));
  await expect(page.locator('.verdict-summary')).toContainText('5 / 5');
  await expect(page.locator('#panel')).toContainText(kase.answer.feedback.correct);
  // The debrief hides the HUD; its own button opens the same case board.
  const hud = page.locator('#reset-button');
  await (await hud.isVisible() ? hud : page.locator('#debrief-reset')).click();
  await page.locator('.case-option input[name="case"][value="department-murder"]').check();
  await page.locator('#confirm-reset').click();
  await expect(page.locator('#confirm-reset')).toHaveCount(0);
  await askAllByApi(page);
  const cast2 = castOf(await sessionIdOf(page), DATA);
  const wrong = picksFor(cast2);
  const k = Object.keys(cast2).find(id => cast2[id] === 'killer');
  const l = Object.keys(cast2).find(id => cast2[id] === 'leaker');
  [wrong[k], wrong[l]] = [wrong[l], wrong[k]];
  await lockIn(page, wrong);
  await expect(page.locator('#panel')).toContainText('Not quite.');
});

for (const [name, size] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
  test(`department_layout_${name}: figures inside the station, nav and dialogue do not overlap`, async ({ page }, testInfo) => {
    await page.setViewportSize(size);
    await start(page);
    await shot(page, testInfo, `department-${name}-hall`);
    const station = await page.locator('#station').boundingBox();
    expect(station).not.toBeNull();
    let seen = 0;
    for (const el of await page.locator('#station [data-figure]').all()) {
      const box = await el.boundingBox();
      if (!box) continue;
      seen++;
      expect(box.x, 'left of station').toBeGreaterThanOrEqual(station.x - 1);
      expect(box.y, 'above station').toBeGreaterThanOrEqual(station.y - 1);
      expect(box.x + box.width, 'right of station').toBeLessThanOrEqual(station.x + station.width + 1);
      expect(box.y + box.height, 'below station').toBeLessThanOrEqual(station.y + station.height + 1);
    }
    expect(seen).toBeGreaterThanOrEqual(5);
    await page.locator('#room-nav [data-go="freja"]').click();
    await expect(page.locator('.dialogue .speaker-tag b')).toHaveText('FREJA', { timeout: 15_000 });
    await shot(page, testInfo, `department-${name}-dialogue`);
    const nav = await page.locator('#room-nav').boundingBox();
    const controls = await page.locator('.dialogue').boundingBox();
    expect(nav).not.toBeNull();
    expect(controls).not.toBeNull();
    const apart = nav.x + nav.width <= controls.x + 1 || controls.x + controls.width <= nav.x + 1 || nav.y + nav.height <= controls.y + 1 || controls.y + controls.height <= nav.y + 1;
    expect(apart, `nav ${JSON.stringify(nav)} vs dialogue ${JSON.stringify(controls)}`).toBe(true);
  });
}

test('department_prompt_clear_of_rail: the evidence prompt never sits under the left rail at 1440x900', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await start(page);
  for (const id of ['coffee-mug', 'usb-drive']) {
    const spot = await stopOf(page, `evidence:${id}`);
    await teleport(page, spot.x, spot.y);
    await expect(page.locator('.station-prompt')).toContainText('Examine');
    const box = await page.locator('.station-prompt').boundingBox();
    const rail = await page.locator('.hud-rail').boundingBox();
    expect(box.x, `${id} prompt left vs rail right`).toBeGreaterThanOrEqual(rail.x + rail.width - 1);
  }
});
