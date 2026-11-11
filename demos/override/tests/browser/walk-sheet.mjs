// Shared browser checks for a player who walks a supplied sheet (factory F1, Castelvento R1).
// The department spec keeps its own, longer D1 test; these cover the same behaviour per level.
import { worldFor } from '../../client/worlds.ts';

const scene = (page, fn, arg) => page.evaluate(`(${fn})(window.walkingTestGame.scene.getScene('banana-grove'), ${JSON.stringify(arg ?? null)})`);
const teleport = (page, x, y) => scene(page, (s, p) => { s.player.body.reset(p.x, p.y); }, { x, y });
const look = page => scene(page, s => {
  const img = s.detectiveImg;
  return { key: img.texture.key, frame: String(img.frame.name), ox: img.originX, oy: img.originY, x: img.x, y: img.y, px: s.player.x, py: s.player.y, flip: img.flipX, depth: img.depth };
});
// Every rendered frame until the stride has walked `gameMs` of game time, or `wallMs` passes.
const sampleWalk = (page, gameMs, wallMs = 15_000) => page.evaluate(({ gameMs, wallMs }) => new Promise(done => {
  const s = window.walkingTestGame.scene.getScene('banana-grove'), out = [], end = performance.now() + wallMs;
  const tick = () => {
    const img = s.detectiveImg;
    out.push({ key: img.texture.key, frame: String(img.frame.name), oy: img.originY, ms: s.stride.ms, walking: s.stride.walking });
    if (s.stride.ms < gameMs && performance.now() < end) requestAnimationFrame(tick); else done(out);
  };
  requestAnimationFrame(tick);
}), { gameMs, wallMs });

/**
 * Registers the walk-sheet tests for one level.
 * `start(page)` opens the level; `open(page)` opens a conversation and resolves once the dialogue shows.
 */
export function walkSheetTests({ test, expect, level, start, open, at, shot = (page, testInfo, name) => page.screenshot({ path: testInfo.outputPath(`${name}.png`) }) }) {
  const art = worldFor(level).figures;
  const sheet = art.walkSheet;
  const SHEET = `factory-${art.detective}-walk-sheet`;
  const originY = i => (sheet.pivot.y - (sheet.offsets?.[i] ?? 0)) / sheet.cell.h;
  // `at`: open floor to walk right from, and the top edge of the walkable floor.
  const spot = () => ({ x: at.x, y: at.y });

  test(`${level}_walk_sheet: frames 1..8 by walking time with per-frame registration, still pose on release, flip, wall and dialogue`, async ({ page }, testInfo) => {
    await start(page);
    expect(await scene(page, (s, k) => s.textures.get(k).getFrameNames().sort(), SHEET)).toEqual(['0', '1', '2', '3', '4', '5', '6', '7']);
    expect((await look(page)).key).not.toBe(SHEET);
    const p = spot();
    await teleport(page, p.x, p.y);
    await page.waitForTimeout(150);
    await page.keyboard.down('d');
    const samples = await sampleWalk(page, 950);
    const walking = await look(page);
    await shot(page, testInfo, `${level}-walk-sheet-walking`);
    await page.keyboard.up('d');
    const onSheet = samples.filter(s => s.key === SHEET);
    expect(onSheet.length).toBeGreaterThan(20);
    expect(onSheet[0].frame).toBe('0');
    const runs = onSheet.map(s => s.frame).filter((f, i, all) => i === 0 || all[i - 1] !== f);
    for (let i = 1; i < runs.length; i++) expect(Number(runs[i]), `run ${i}`).toBe((Number(runs[i - 1]) + 1) % 8);
    expect(runs.length).toBeGreaterThanOrEqual(9);
    // Each frame carries its own vertical registration; the horizontal origin never moves.
    for (const s of onSheet) expect(s.oy, `frame ${s.frame}`).toBeCloseTo(originY(Number(s.frame)), 5);
    expect(walking.key).toBe(SHEET);
    expect(walking.ox).toBe(.5);
    expect(Math.abs(walking.x - walking.px)).toBeLessThanOrEqual(2.5);
    expect(walking.y).toBe(walking.py);
    // Depth follows the feet, as for the still poses.
    expect(walking.depth).toBe(walking.py);
    expect(walking.flip).toBe(false);
    await expect.poll(async () => (await look(page)).key, { timeout: 1000 }).not.toBe(SHEET);
    const stopped = await look(page);
    expect([stopped.x, stopped.y]).toEqual([stopped.px, stopped.py]);
    await shot(page, testInfo, `${level}-walk-sheet-stopped`);
    // Left: the same frames, mirrored, from frame 1.
    await page.keyboard.down('a');
    const left = await sampleWalk(page, 250);
    const leftLook = await look(page);
    await page.keyboard.up('a');
    expect(left.find(s => s.key === SHEET)?.frame).toBe('0');
    expect(leftLook.flip).toBe(true);
    // Held against the top edge: no travel, so the walk stops.
    await teleport(page, p.x + 40, at.top + 1);
    await page.keyboard.down('w');
    await page.waitForTimeout(700);
    const atWall = await look(page);
    await page.keyboard.up('w');
    expect(atWall.key).not.toBe(SHEET);
    // Dialogue: the conversation pose replaces the walk, and held keys do not walk while typing.
    await teleport(page, p.x, p.y);
    await page.keyboard.down('d');
    await expect.poll(async () => (await look(page)).key, { timeout: 1000 }).toBe(SHEET);
    await page.keyboard.up('d');
    // In the conversation the figure wears a still or talk texture, never a walk frame. Walking away is how a
    // player leaves a conversation, so keys only stop moving the figure while a text box has focus.
    await open(page);
    const still = `factory-${art.detective}-`;
    await expect.poll(async () => (await look(page)).key, { timeout: 1000 }).not.toBe(SHEET);
    await page.locator('#question').focus();
    const before = await look(page);
    await page.keyboard.down('d');
    const held = await sampleWalk(page, 1e9, 400);
    const after = await look(page);
    await page.keyboard.up('d');
    expect(before.key.startsWith(still) && !before.key.includes('walk'), before.key).toBe(true);
    expect(held.every(s => s.key !== SHEET && !s.walking)).toBe(true);
    expect([after.px, after.py]).toEqual([before.px, before.py]);
  });

  for (const [name, size] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
    test(`${level}_walk_sheet_${name}: the walking figure draws inside the station`, async ({ page }, testInfo) => {
      await page.setViewportSize(size);
      await start(page);
      const p = spot();
      await teleport(page, p.x + 40, p.y);
      await page.keyboard.down('d');
      await expect.poll(async () => (await look(page)).key, { timeout: 1000 }).toBe(SHEET);
      await page.waitForTimeout(350);
      await shot(page, testInfo, `${level}-walk-${name}`);
      const inStation = await scene(page, s => {
        const b = s.detectiveImg.getBounds(), w = Number(s.sys.game.config.width), h = Number(s.sys.game.config.height);
        return b.x >= 0 && b.y >= 0 && b.right <= w && b.bottom <= h;
      });
      await page.keyboard.up('d');
      expect(inStation).toBe(true);
    });
  }

  test(`${level}_walk_sheet_missing: a sheet that fails to load leaves the still pose, never a missing texture`, async ({ page }) => {
    await page.route(`**${sheet.url}`, route => route.fulfill({ status: 404, body: '' }));
    await start(page);
    expect(await scene(page, (s, k) => s.textures.exists(k), SHEET)).toBe(false);
    const p = spot();
    await teleport(page, p.x, p.y);
    await page.keyboard.down('d');
    const samples = await sampleWalk(page, 600);
    await page.keyboard.up('d');
    expect(samples.some(s => s.walking)).toBe(true);
    expect(samples.every(s => s.key !== SHEET && s.key !== '__MISSING')).toBe(true);
  });
}
