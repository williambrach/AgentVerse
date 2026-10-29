import { test, expect } from '@playwright/test';

// Runs in the `tower` project (port 4318, dev tools on, so the draft tower cases are listed).
// The tower PNGs are routed to 404 so the tests behave the same with or without real art.
const groveFiles = {
  'apprentices.png': 'monkeys.png', 'apprentice-idle.png': 'monkey-idle.png',
  'inspector-walk.png': 'detective-walk.png', 'tower-props.png': 'jungle-props.png',
};

// `page.art.bytes` null: every tower PNG is a 404. Otherwise each is served as the matching grove PNG.
async function start(page, caseId = 'tower-bell-charm') {
  const errors = [];
  const art = { bytes: null };
  page.art = art;
  page.on('pageerror', error => errors.push(String(error)));
  await page.route('**/assets/tower/*.png', route => {
    const file = art.bytes?.[new URL(route.request().url()).pathname.split('/').pop()];
    return file ? route.fulfill({ status: 200, contentType: 'image/png', body: file }) : route.fulfill({ status: 404, body: '' });
  });
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
  await page.goto(`/?case=${caseId}`);
  await page.locator('#begin-button').click();
  await expect(page.locator('#intro')).toHaveCount(0);
  return errors;
}

async function switchTo(page, id) {
  await page.locator('#reset-button').click();
  await page.locator(`.case-option input[name="case"][value="${id}"]`).check();
  await page.locator('#confirm-reset').click();
  await expect(page.locator('#case-switch')).toHaveCount(0);
}

const sceneState = page => page.evaluate(() => {
  const scene = window.walkingTestGame.scene.getScene('banana-grove');
  return scene?.player ? {
    worldId: scene.worldId,
    npcs: [...scene.npcs.keys()],
    artSources: { ...scene.artSources },
    label: window.walkingTestGame.canvas.getAttribute('aria-label'),
  } : null;
});

async function settled(page, worldId, ids) {
  await expect.poll(async () => {
    const s = await sceneState(page);
    return s && s.worldId === worldId && s.npcs.join() === ids.join();
  }).toBe(true);
}

test('a tower case shows the tower and its cast', async ({ page }) => {
  await start(page);
  await settled(page, 'tower', ['wren', 'basil', 'juniper']);
  for (const name of ['Wren', 'Basil', 'Juniper']) await expect(page.locator(`nav [data-go] >> text=${name}`)).toBeVisible();
  await expect(page.locator('#quick-progress')).toContainText('potion cabinet');
  expect((await sceneState(page)).label).toMatch(/^Wizard Tower with Wren, Basil, Juniper/);
});

test('missing art falls back to placeholders', async ({ page }) => {
  const errors = await start(page);
  await settled(page, 'tower', ['wren', 'basil', 'juniper']);
  expect((await sceneState(page)).artSources).toEqual({ cast: 'placeholder', idle: 'placeholder', walk: 'placeholder', props: 'placeholder' });
  expect(errors).toEqual([]);
});

test('switching to a grove case brings the monkeys back', async ({ page }) => {
  const errors = await start(page);
  await settled(page, 'tower', ['wren', 'basil', 'juniper']);
  await switchTo(page, 'banana-mystery');
  await settled(page, 'grove', ['momo', 'pip', 'nori']);
  for (const name of ['Momo', 'Pip', 'Nori']) await expect(page.locator(`nav [data-go] >> text=${name}`)).toBeVisible();
  await expect(page.locator('#case-eyebrow')).toContainText('GROVE');
  expect(errors).toEqual([]);
});

test('walking to an apprentice opens the interview', async ({ page }) => {
  await start(page);
  await settled(page, 'tower', ['wren', 'basil', 'juniper']);
  await page.locator('nav [data-go="basil"]').click();
  await expect(page.locator('#panel h2')).toHaveText('Basil', { timeout: 15_000 });
});

test('art that appears later replaces the placeholder', async ({ page }) => {
  await start(page);
  await settled(page, 'tower', ['wren', 'basil', 'juniper']);
  expect(Object.values((await sceneState(page)).artSources)).toEqual(['placeholder', 'placeholder', 'placeholder', 'placeholder']);
  page.art.bytes = {};
  for (const [tower, grove] of Object.entries(groveFiles)) page.art.bytes[tower] = await (await page.request.get(`/assets/banana/${grove}`)).body();
  await switchTo(page, 'banana-mystery');
  await settled(page, 'grove', ['momo', 'pip', 'nori']);
  await switchTo(page, 'tower-bell-charm');
  await settled(page, 'tower', ['wren', 'basil', 'juniper']);
  expect((await sceneState(page)).artSources).toEqual({ cast: 'file', idle: 'file', walk: 'file', props: 'file' });
});

test('one key press after round trips arrives once', async ({ page }) => {
  const errors = await start(page);
  await settled(page, 'tower', ['wren', 'basil', 'juniper']);
  await switchTo(page, 'banana-mystery');
  await settled(page, 'grove', ['momo', 'pip', 'nori']);
  await switchTo(page, 'tower-bell-charm');
  await settled(page, 'tower', ['wren', 'basil', 'juniper']);
  const visits = [];
  page.on('request', request => { if (request.url().endsWith('/api/visit')) visits.push(request.url()); });
  await page.evaluate(() => window.walkingTestGame.scene.getScene('banana-grove').player.body.reset(364, 156));
  await page.waitForTimeout(200);
  await page.keyboard.down('e');
  await page.waitForTimeout(100);
  await page.keyboard.up('e');
  await expect(page.locator('#panel h2')).toHaveText('Basil');
  await page.waitForTimeout(600);
  expect(visits).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('configure twice during loading keeps the last world', async ({ page }) => {
  const errors = await start(page, 'banana-mystery');
  await settled(page, 'grove', ['momo', 'pip', 'nori']);
  await page.evaluate(() => {
    const scene = window.walkingTestGame.scene.getScene('banana-grove');
    const grove = scene.world;
    const tower = { ...grove, id: 'tower', art: { cast: '/assets/tower/apprentices.png', idle: '/assets/tower/apprentice-idle.png', walk: '/assets/tower/inspector-walk.png', props: '/assets/tower/tower-props.png' } };
    const cast = ids => ids.map((id, i) => ({ id, name: id, color: ['#cf7a4a', '#6e9a5c', '#9a85c2'][i] }));
    scene.configure(tower, cast(['wren', 'basil', 'juniper']));
    scene.configure(grove, cast(['momo', 'pip', 'nori']));
  });
  await settled(page, 'grove', ['momo', 'pip', 'nori']);
  await page.waitForTimeout(500);
  const state = await sceneState(page);
  expect(state.worldId).toBe('grove');
  expect(state.npcs).toEqual(['momo', 'pip', 'nori']);
  expect(errors).toEqual([]);
});

test('switching mid-walk or with the case board open', async ({ page }) => {
  const errors = await start(page);
  await settled(page, 'tower', ['wren', 'basil', 'juniper']);
  await page.locator('nav [data-go="juniper"]').click();
  await page.waitForTimeout(300);
  await switchTo(page, 'banana-mystery');
  await settled(page, 'grove', ['momo', 'pip', 'nori']);
  await expect.poll(() => page.evaluate(() => {
    const { x, y } = window.walkingTestGame.scene.getScene('banana-grove').player;
    return [Math.round(x), Math.round(y)];
  })).toEqual([244, 276]);
  expect(errors).toEqual([]);
});

test('nav follows the world on every switch', async ({ page }) => {
  await start(page);
  await settled(page, 'tower', ['wren', 'basil', 'juniper']);
  await expect(page.locator('#app')).toHaveAttribute('data-world', 'tower');
  await expect(page.locator('nav [data-go="momo"]')).toHaveCount(0);
  for (const id of ['wren', 'basil', 'juniper']) await expect(page.locator(`nav [data-go="${id}"]`)).toHaveCount(1);
  await switchTo(page, 'banana-mystery');
  await expect(page.locator('#app')).toHaveAttribute('data-world', 'grove');
  for (const id of ['momo', 'pip', 'nori']) await expect(page.locator(`nav [data-go="${id}"]`)).toHaveCount(1);
  await expect(page.locator('nav [data-go="wren"]')).toHaveCount(0);
  await switchTo(page, 'tower-bell-charm');
  await expect(page.locator('#app')).toHaveAttribute('data-world', 'tower');
  await expect(page.locator('nav [data-go="momo"]')).toHaveCount(0);
  await switchTo(page, 'banana-mystery');
  await expect(page.locator('#app')).toHaveAttribute('data-world', 'grove');
  await expect(page.locator('nav [data-go="nori"]')).toHaveCount(1);
});

test('case board preview shows the selected world', async ({ page }) => {
  await start(page);
  await page.locator('#reset-button').click();
  await page.locator('.case-option input[name="case"][value="banana-mystery"]').check();
  const face = page.locator('#case-switch .monkey-line[data-world="grove"] .monkey-face').first();
  await expect(face).toBeVisible();
  expect(await face.evaluate(el => getComputedStyle(el).backgroundImage)).toContain('monkeys.png');
});

test('a tower session resumes from its cookie', async ({ page }) => {
  await start(page);
  await settled(page, 'tower', ['wren', 'basil', 'juniper']);
  await page.reload();
  await page.locator('#begin-button').click();
  await expect(page.locator('#intro')).toHaveCount(0);
  await settled(page, 'tower', ['wren', 'basil', 'juniper']);
  for (const id of ['wren', 'basil', 'juniper']) await expect(page.locator(`nav [data-go="${id}"]`)).toHaveCount(1);
  await expect(page.locator('#notebook-index')).toContainText('/ 07');
});
