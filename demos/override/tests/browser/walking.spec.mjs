import { test, expect } from './team.mjs';

// Capture Phaser from the test environment without adding a debug global to the shipped game.
async function start(page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'Phaser', {
      configurable: true,
      set(phaser) {
        Object.defineProperty(window, 'Phaser', { value: phaser, configurable: true });
        const Game = phaser.Game;
        phaser.Game = class extends Game {
          constructor(config) { super(config); window.walkingTestGame = this; }
        };
      },
    });
  });
  await page.goto('/');
  await page.locator('#begin-button').click();
  await expect(page.locator('#intro')).toHaveCount(0);
  await page.waitForFunction(() => window.walkingTestGame?.scene.getScene('banana-grove')?.avatar);
  await page.locator('#reset-button').click();
  await page.locator('#confirm-reset').click();
  await expect(page.locator('#confirm-reset')).toHaveCount(0);
}

const START = { frame: 'down-0', x: 244, y: 276 };
const snap = page => page.evaluate(() => {
  const scene = window.walkingTestGame.scene.getScene('banana-grove');
  return { frame: scene.avatar.frame.name, x: scene.player.x, y: scene.player.y };
});
const npcFrames = page => page.evaluate(() => Object.fromEntries([...window.walkingTestGame.scene.getScene('banana-grove').npcs].map(([id, npc]) => [id, npc.sprite.frame.name])));

// Records every frame name the avatar and the monkeys show, per render frame, until `reset`. Polls read the sets.
async function record(page) {
  await page.evaluate(() => {
    const scene = () => window.walkingTestGame.scene.getScene('banana-grove');
    const seen = window.walkingSeen = { player: new Set(), npc: new Set() };
    (function tick() {
      seen.player.add(scene().avatar.frame.name);
      for (const npc of scene().npcs.values()) seen.npc.add(npc.sprite.frame.name);
      requestAnimationFrame(tick);
    })();
  });
}
const seen = (page, kind) => page.evaluate(kind => [...window.walkingSeen[kind]].sort(), kind);
const forget = page => page.evaluate(() => { window.walkingSeen.player.clear(); window.walkingSeen.npc.clear(); });

async function center(page, x = 244, y = 220) {
  await page.evaluate(({ x, y }) => {
    const scene = window.walkingTestGame.scene.getScene('banana-grove');
    scene.resetPosition();
    scene.player.body.reset(x, y);
    scene.walk.reset(x, y);
  }, { x, y });
}

// The detective shows `frame` and does not travel while `key` is held. `fixed` also requires it to stay where it was.
async function holdStill(page, key, frame, fixed = true) {
  const before = await snap(page);
  await page.keyboard.down(key);
  await page.waitForTimeout(250);
  const a = await snap(page);
  await page.waitForTimeout(150);
  const b = await snap(page);
  await page.keyboard.up(key);
  expect(b).toEqual({ ...a, frame });
  if (fixed) expect(b).toEqual({ ...before, frame });
}

test('WASD and arrows animate all four directions and return to a facing idle pose', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await start(page);
  await record(page);
  for (const [key, direction] of [['w', 'up'], ['a', 'left'], ['s', 'down'], ['d', 'right'],
    ['ArrowUp', 'up'], ['ArrowLeft', 'left'], ['ArrowDown', 'down'], ['ArrowRight', 'right']]) {
    await center(page);
    await forget(page);
    await page.keyboard.down(key);
    await expect.poll(async () => (await seen(page, 'player')).filter(name => name.startsWith(direction)), { message: key }).toEqual([0, 1, 2, 3].map(pose => `${direction}-${pose}`));
    await page.keyboard.up(key);
    await expect.poll(async () => (await snap(page)).frame, { message: key }).toBe(`${direction}-0`);
    let last;
    await expect.poll(async () => { const now = JSON.stringify(await snap(page)); const same = now === last; last = now; return same; }).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('map clicks never move the investigator; destination buttons open the page in place', async ({ page }) => {
  await start(page);
  expect(await snap(page)).toEqual(START);
  // The dialogue box covers the world while it is open: close it, then click where the world is.
  await expect(page.locator('#panel h2')).toHaveText('A bunch of trouble.');
  await page.locator('#dialogue-close').click();
  await expect(page.locator('#app')).toHaveAttribute('data-dialogue', 'closed');
  const canvas = page.locator('#station canvas');
  const bounds = await canvas.boundingBox();
  // The world (480 x 340) is fitted inside the window-sized canvas, so map game pixels through its rect.
  const layer = await page.locator('.station-labels').boundingBox();
  const at = (x, y) => ({ x: layer.x - bounds.x + layer.width * x / 480, y: layer.y - bounds.y + layer.height * y / 340 });
  await canvas.click({ position: at(300, 204) });
  await canvas.click({ position: at(116, 120) });
  await page.waitForTimeout(250);
  expect(await snap(page)).toEqual(START);
  await expect(page.locator('#app')).toHaveAttribute('data-dialogue', 'closed');
  await page.locator('nav [data-go="momo"]').click();
  await expect(page.locator('.dialogue .speaker-tag b')).toHaveText('MOMO');
  await expect(page.locator('#app')).toHaveAttribute('data-dialogue', 'open');
  expect(await snap(page)).toEqual(START);
});

test('the banana basket sits on the picnic blanket', async ({ page }) => {
  await start(page);
  const basket = await page.evaluate(() => {
    const scene = window.walkingTestGame.scene.getScene('banana-grove');
    const child = scene.children.list.find(item => item.texture?.key === 'jungle' && item.frame?.name === 'basket');
    return child && { x: child.x, y: child.y, depth: child.depth };
  });
  expect(basket).toEqual({ x: 244, y: 221, depth: 216 });
});

test('blocked movement, typing, dialogs and reset leave the detective standing', async ({ page }) => {
  await start(page);
  await center(page, 438, 220);
  await holdStill(page, 'd', 'right-0', false);

  await center(page);
  await page.locator('#reset-button').click();
  await holdStill(page, 'w', 'down-0');
  await page.locator('#confirm-reset').click();
  await expect(page.locator('#confirm-reset')).toHaveCount(0);
  await expect.poll(() => snap(page)).toEqual(START);

  await page.locator('nav [data-go="pip"]').click();
  await page.locator('#question').focus();
  await holdStill(page, 'w', 'down-0');
});

test('reduced motion retains direction changes without stepping', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await start(page);
  await record(page);
  await center(page);
  await forget(page);
  const begin = (await snap(page)).x;
  await page.keyboard.down('d');
  await expect.poll(async () => (await snap(page)).x - begin).toBeGreaterThan(30);
  await page.keyboard.up('d');
  expect(await seen(page, 'player')).toEqual(['right-0']);
});

test('monkeys react on approach and remain solid and clickable during their gestures', async ({ page }) => {
  await start(page);
  // Return focus to the game; keyboard movement pauses while an input is focused.
  await page.locator('#station canvas').click({ position: { x: 10, y: 10 } });
  await center(page, 116, 204);
  await page.evaluate(() => window.walkingTestGame.scene.getScene('banana-grove').npcs.get('momo').reset());
  await record(page);
  await page.keyboard.down('w');
  // The periodic idle gesture starts after 2.3 seconds; these poses must come from the approach reaction.
  await expect.poll(async () => (await seen(page, 'npc')).filter(name => /^momo-[23]$/.test(name))).toEqual(['momo-2', 'momo-3']);
  await expect.poll(async () => (await snap(page)).y).toBeCloseTo(152, 0);
  await page.keyboard.up('w');
  // Hold E across a frame so the scene's JustDown check sees it.
  await page.keyboard.press('e', { delay: 100 });
  await expect(page.locator('.dialogue .speaker-tag b')).toHaveText('MOMO');
});

test('NPC animations respect preference changes and pause for a modal', async ({ page }) => {
  const resting = async () => Object.entries(await npcFrames(page)).every(([id, frame]) => frame === `${id}-0`);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await start(page);
  await record(page);
  await page.waitForTimeout(250);
  expect((await seen(page, 'npc')).every(name => name.endsWith('-0'))).toBe(true);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect.poll(async () => (await seen(page, 'npc')).some(name => !name.endsWith('-0')), { timeout: 10_000 }).toBe(true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(resting).toBe(true);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.locator('#reset-button').click();
  await expect.poll(resting).toBe(true);
  await page.waitForTimeout(250);
  expect(await resting()).toBe(true);
  await page.locator('#cancel-reset').click();
});

test('Kiki has a stop that is reachable and walkable like the others', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await start(page);
  await expect(page.locator('nav [data-go="kiki"]')).toHaveCount(1);
  expect(await page.evaluate(() => [...window.walkingTestGame.scene.getScene('banana-grove').npcs.keys()])).toEqual(['momo', 'pip', 'nori', 'kiki']);
  // Slots 0-2 keep their coordinates; Kiki's slot is (84, 212). Sprites are drawn 12 px above the slot.
  expect(await page.evaluate(() => [...window.walkingTestGame.scene.getScene('banana-grove').npcs.values()].map(n => [Math.round(n.sprite.x), Math.round(n.sprite.y)])))
    .toEqual([[116, 144], [364, 144], [364, 256], [84, 200]]);
  // The nav button opens Kiki's page in place; the investigator does not move.
  await page.locator('nav [data-go="kiki"]').click();
  await expect(page.locator('.dialogue .speaker-tag b')).toHaveText('KIKI');
  expect(await snap(page)).toMatchObject({ x: 244, y: 276 });
  // Walking there with the keyboard reaches the stop, and E opens the page.
  await page.locator('#dialogue-close').click();
  await expect(page.locator('#app')).toHaveAttribute('data-dialogue', 'closed');
  await page.locator('#station canvas').click({ position: { x: 10, y: 10 } });
  await center(page, 84, 240);
  await record(page);
  await page.keyboard.down('w');
  await expect.poll(async () => (await seen(page, 'player')).some(name => /-[13]$/.test(name))).toBe(true);
  await expect.poll(async () => { const s = await snap(page); return Math.hypot(s.x - 84, s.y - 212) < 18; }).toBe(true);
  await page.keyboard.up('w');
  await page.keyboard.press('e', { delay: 100 });
  await expect(page.locator('.dialogue .speaker-tag b')).toHaveText('KIKI');
  expect(errors).toEqual([]);
});
