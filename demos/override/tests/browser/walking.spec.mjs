import { test, expect } from '@playwright/test';

// Capture Phaser from the test environment without adding a debug global to
// the shipped game. Assertions inspect the actual rendered sprite and body.
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

async function samples(page, duration = 650) {
  return page.evaluate(duration => new Promise(resolve => {
    const values = [];
    const begin = performance.now();
    function sample() {
      const scene = window.walkingTestGame.scene.getScene('banana-grove');
      values.push({ frame: scene.avatar.frame.name, x: scene.player.x, y: scene.player.y });
      if (performance.now() - begin >= duration) resolve(values);
      else requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  }), duration);
}

async function center(page, x = 244, y = 220) {
  await page.evaluate(({ x, y }) => {
    const scene = window.walkingTestGame.scene.getScene('banana-grove');
    scene.resetPosition();
    scene.player.body.reset(x, y);
    scene.walk.reset(x, y);
  }, { x, y });
}

test('WASD and arrows animate all four directions and return to a facing idle pose', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await start(page);
  for (const [key, direction] of [['w', 'up'], ['a', 'left'], ['s', 'down'], ['d', 'right'],
    ['ArrowUp', 'up'], ['ArrowLeft', 'left'], ['ArrowDown', 'down'], ['ArrowRight', 'right']]) {
    await center(page);
    await page.keyboard.down(key);
    const moving = await samples(page);
    await page.keyboard.up(key);
    const frames = new Set(moving.map(value => value.frame));
    for (let pose = 0; pose < 4; pose++) expect(frames.has(`${direction}-${pose}`), key).toBe(true);
    const idle = (await samples(page, 150)).slice(-3);
    expect(new Set(idle.map(value => value.frame))).toEqual(new Set([`${direction}-0`]));
    expect(idle.at(-1).x).toBeCloseTo(idle[0].x, 2);
    expect(idle.at(-1).y).toBeCloseTo(idle[0].y, 2);
  }
  expect(errors).toEqual([]);
});

test('destination and ground clicks keep a continuous walk cycle and stop on arrival', async ({ page }) => {
  await start(page);
  await page.locator('#skip-walking').uncheck();
  await page.locator('nav [data-go="momo"]').click();
  const moving = await samples(page, 1400);
  for (let pose = 0; pose < 4; pose++) expect(moving.some(value => value.frame === `up-${pose}`)).toBe(true);
  await expect(page.locator('#panel h2')).toHaveText('Momo');
  expect((await samples(page, 150)).at(-1).frame).toBe('left-0');

  const canvas = page.locator('#station canvas');
  const bounds = await canvas.boundingBox();
  await canvas.click({ position: { x: bounds.width * 300 / 480, y: bounds.height * 204 / 340 } });
  const groundWalk = await samples(page, 2800);
  expect(groundWalk.some(value => /-[13]$/.test(value.frame))).toBe(true);
  const arrival = groundWalk.at(-1);
  expect(arrival.x).toBeCloseTo(300, -1);
  expect(arrival.y).toBeCloseTo(204, -1);
  expect(arrival.frame).toMatch(/-0$/);
});

test('blocked movement, typing, dialogs and reset leave the detective standing', async ({ page }) => {
  await start(page);
  await center(page, 438, 220);
  await page.keyboard.down('d');
  const blocked = (await samples(page, 350)).slice(-5);
  await page.keyboard.up('d');
  expect(new Set(blocked.map(value => value.frame))).toEqual(new Set(['right-0']));

  await center(page);
  await page.locator('#reset-button').click();
  await page.keyboard.down('w');
  const paused = await samples(page, 250);
  await page.keyboard.up('w');
  expect(new Set(paused.map(value => value.frame))).toEqual(new Set(['down-0']));
  expect(paused.at(-1).y).toBeCloseTo(paused[0].y, 2);
  await page.locator('#confirm-reset').click();
  const reset = (await samples(page, 150)).at(-1);
  expect(reset).toEqual({ frame: 'down-0', x: 244, y: 276 });

  await page.locator('#skip-walking').check();
  await page.locator('nav [data-go="pip"]').click();
  await page.locator('#question').focus();
  await page.keyboard.down('w');
  const typing = await samples(page, 200);
  await page.keyboard.up('w');
  expect(new Set(typing.map(value => value.frame))).toEqual(new Set(['down-0']));
  expect(typing.at(-1).y).toBeCloseTo(typing[0].y, 2);
});

test('reduced motion retains direction changes without stepping', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await start(page);
  await center(page);
  await page.keyboard.down('d');
  const moving = await samples(page, 500);
  await page.keyboard.up('d');
  expect(moving.at(-1).x - moving[0].x).toBeGreaterThan(30);
  expect(new Set(moving.map(value => value.frame))).toEqual(new Set(['right-0']));
});

test('walk frames advance when rendering runs faster than physics', async ({ page }) => {
  await start(page);
  await center(page);
  // Reproduce a 120 Hz display with 60 Hz physics using 60 Hz rendering and
  // 30 Hz physics: alternate render frames have no new body position.
  await page.evaluate(() => window.walkingTestGame.scene.getScene('banana-grove').physics.world.setFPS(30));
  await page.keyboard.down('d');
  const moving = await samples(page, 700);
  await page.keyboard.up('d');
  expect(moving.at(-1).x - moving[0].x).toBeGreaterThan(50);
  expect(moving.some((value, i) => i && value.x === moving[i - 1].x)).toBe(true);
  for (let pose = 0; pose < 4; pose++) expect(moving.some(value => value.frame === `right-${pose}`)).toBe(true);
  const idle = (await samples(page, 150)).at(-1);
  expect(idle.frame).toBe('right-0');
});

async function npcSamples(page, duration) {
  return page.evaluate(duration => new Promise(resolve => {
    const values = [];
    const begin = performance.now();
    function sample() {
      const scene = window.walkingTestGame.scene.getScene('banana-grove');
      values.push({
        player: { x: scene.player.x, y: scene.player.y },
        npcs: [...scene.npcs].map(([id, npc]) => ({ id, frame: npc.sprite.frame.name, x: npc.sprite.x, y: npc.sprite.y })),
      });
      if (performance.now() - begin >= duration) resolve(values);
      else requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  }), duration);
}

test('all four monkeys blink and gesture independently without leaving their positions', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await start(page);
  const frames = await npcSamples(page, 5900);
  for (const [index, id] of ['momo', 'pip', 'nori', 'kiki'].entries()) {
    const states = frames.map(value => value.npcs[index]);
    expect(new Set(states.map(value => value.frame))).toEqual(new Set([`${id}-0`, `${id}-1`, `${id}-2`, `${id}-3`]));
    expect(new Set(states.map(value => `${value.x},${value.y}`)).size).toBe(1);
  }
  expect(frames.some(value => new Set(value.npcs.map(npc => npc.frame.slice(-1))).size > 1)).toBe(true);
  expect(errors).toEqual([]);
});

test('monkeys react on approach and remain solid and clickable during their gestures', async ({ page }) => {
  await start(page);
  await page.locator('#skip-walking').check();
  await page.locator('#skip-walking').uncheck();
  // Return focus to the game; keyboard movement pauses while an input is focused.
  await page.locator('#station canvas').click({ position: { x: 10, y: 10 } });
  await center(page, 116, 204);
  await page.evaluate(() => window.walkingTestGame.scene.getScene('banana-grove').npcs.get('momo').reset());
  await page.keyboard.down('w');
  const greeting = await npcSamples(page, 350);
  await page.screenshot({ path: 'test-results/monkey-greeting.png', fullPage: true });
  const blocked = await npcSamples(page, 550);
  await page.keyboard.up('w');
  // The periodic idle gesture starts after 2.3 seconds. These early frames
  // must come from the approach reaction instead.
  expect(greeting.some(value => value.npcs[0].frame === 'momo-2')).toBe(true);
  expect(greeting.some(value => value.npcs[0].frame === 'momo-3')).toBe(true);
  expect(blocked.at(-1).player.y).toBeCloseTo(152, 0);
  const canvas = page.locator('#station canvas');
  const bounds = await canvas.boundingBox();
  await canvas.click({ position: { x: bounds.width * 116 / 480, y: bounds.height * 120 / 340 } });
  await expect(page.locator('#panel h2')).toHaveText('Momo');
});

test('NPC animations respect preference changes and pause for a modal', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await start(page);
  const still = await npcSamples(page, 500);
  expect(still.every(value => value.npcs.every(npc => npc.frame === `${npc.id}-0`))).toBe(true);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const resumed = await npcSamples(page, 800);
  expect(resumed.some(value => value.npcs.some(npc => npc.frame !== `${npc.id}-0`))).toBe(true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reduced = await npcSamples(page, 350);
  expect(reduced.every(value => value.npcs.every(npc => npc.frame === `${npc.id}-0`))).toBe(true);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.locator('#reset-button').click();
  const paused = await npcSamples(page, 350);
  expect(paused.every(value => value.npcs.every(npc => npc.frame === `${npc.id}-0`))).toBe(true);
  await page.locator('#cancel-reset').click();
});

test('Kiki has a stop that is reachable and walkable like the others', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await start(page);
  await page.locator('#skip-walking').uncheck();
  await expect(page.locator('nav [data-go="kiki"]')).toHaveCount(1);
  expect(await page.evaluate(() => [...window.walkingTestGame.scene.getScene('banana-grove').npcs.keys()])).toEqual(['momo', 'pip', 'nori', 'kiki']);
  // Slots 0-2 keep their coordinates; Kiki's slot is (84, 212). Sprites are drawn 12 px above the slot.
  expect(await page.evaluate(() => [...window.walkingTestGame.scene.getScene('banana-grove').npcs.values()].map(n => [Math.round(n.sprite.x), Math.round(n.sprite.y)])))
    .toEqual([[116, 144], [364, 144], [364, 256], [84, 200]]);
  await page.locator('nav [data-go="kiki"]').click();
  const moving = await samples(page, 1600);
  expect(moving.some(value => /-[13]$/.test(value.frame))).toBe(true);
  await expect(page.locator('#panel h2')).toHaveText('Kiki', { timeout: 12_000 });
  const last = (await samples(page, 150)).at(-1);
  expect(Math.hypot(last.x - 84, last.y - 212)).toBeLessThan(60);
  expect(last.frame).toMatch(/-0$/);
  expect(errors).toEqual([]);
});
