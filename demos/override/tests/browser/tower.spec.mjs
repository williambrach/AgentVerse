import { test, expect } from './team.mjs';
import { castOf, truthOf, sessionIdOf, pickRole, quickQuestionFor } from './cast.mjs';

// Runs in the `tower` project (port 4318, dev tools on; the tower case no longer needs them).
// The tower PNGs are routed to 404 so the tests behave the same with or without real art.
const groveFiles = {
  'apprentices.png': 'monkeys.png', 'apprentice-idle.png': 'monkey-idle.png',
  'inspector-walk.png': 'detective-walk.png', 'tower-props.png': 'jungle-props.png',
};

// `page.art.bytes` null: every tower PNG is a 404. Otherwise each is served as the matching grove PNG.
// `realArt` serves the committed tower PNGs as they are.
async function start(page, caseId = 'tower-echo-bell', { realArt = false } = {}) {
  const errors = [];
  const art = { bytes: null };
  page.art = art;
  page.on('pageerror', error => errors.push(String(error)));
  await page.route('**/assets/tower/*.png', route => {
    if (realArt) return route.continue();
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
  await expect(page.locator('#quick-progress')).toHaveText('0 of 3 asked · free');
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
  await settled(page, 'grove', ['momo', 'pip', 'nori', 'kiki']);
  for (const name of ['Momo', 'Pip', 'Nori', 'Kiki']) await expect(page.locator(`nav [data-go] >> text=${name}`)).toBeVisible();
  await expect(page.locator('#case-eyebrow')).toContainText('GROVE');
  expect(errors).toEqual([]);
});

test('walking to an apprentice opens the interview', async ({ page }) => {
  await start(page);
  await settled(page, 'tower', ['wren', 'basil', 'juniper']);
  await page.locator('nav [data-go="basil"]').click();
  await expect(page.locator('.dialogue .speaker-tag b')).toHaveText('BASIL', { timeout: 15_000 });
});

test('art that appears later replaces the placeholder', async ({ page }) => {
  await start(page);
  await settled(page, 'tower', ['wren', 'basil', 'juniper']);
  expect(Object.values((await sceneState(page)).artSources)).toEqual(['placeholder', 'placeholder', 'placeholder', 'placeholder']);
  page.art.bytes = {};
  for (const [tower, grove] of Object.entries(groveFiles)) page.art.bytes[tower] = await (await page.request.get(`/assets/banana/${grove}`)).body();
  await switchTo(page, 'banana-mystery');
  await settled(page, 'grove', ['momo', 'pip', 'nori', 'kiki']);
  await switchTo(page, 'tower-echo-bell');
  await settled(page, 'tower', ['wren', 'basil', 'juniper']);
  expect((await sceneState(page)).artSources).toEqual({ cast: 'file', idle: 'file', walk: 'file', props: 'file' });
});

test('one key press after round trips arrives once', async ({ page }) => {
  const errors = await start(page);
  await settled(page, 'tower', ['wren', 'basil', 'juniper']);
  await switchTo(page, 'banana-mystery');
  await settled(page, 'grove', ['momo', 'pip', 'nori', 'kiki']);
  await switchTo(page, 'tower-echo-bell');
  await settled(page, 'tower', ['wren', 'basil', 'juniper']);
  const visits = [];
  page.on('request', request => { if (request.url().endsWith('/api/visit')) visits.push(request.url()); });
  await page.evaluate(() => window.walkingTestGame.scene.getScene('banana-grove').player.body.reset(364, 156));
  await page.waitForTimeout(200);
  await page.keyboard.down('e');
  await page.waitForTimeout(100);
  await page.keyboard.up('e');
  await expect(page.locator('.dialogue .speaker-tag b')).toHaveText('BASIL');
  await page.waitForTimeout(600);
  expect(visits).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('configure twice during loading keeps the last world', async ({ page }) => {
  const errors = await start(page, 'banana-mystery');
  await settled(page, 'grove', ['momo', 'pip', 'nori', 'kiki']);
  await page.evaluate(() => {
    const scene = window.walkingTestGame.scene.getScene('banana-grove');
    const grove = scene.world;
    const tower = { ...grove, id: 'tower', art: { cast: '/assets/tower/apprentices.png', idle: '/assets/tower/apprentice-idle.png', walk: '/assets/tower/inspector-walk.png', props: '/assets/tower/tower-props.png' } };
    const cast = ids => ids.map((id, i) => ({ id, name: id, color: ['#cf7a4a', '#6e9a5c', '#9a85c2', '#c9a24a'][i] }));
    scene.configure(tower, cast(['wren', 'basil', 'juniper']));
    scene.configure(grove, cast(['momo', 'pip', 'nori', 'kiki']));
  });
  await settled(page, 'grove', ['momo', 'pip', 'nori', 'kiki']);
  await page.waitForTimeout(500);
  const state = await sceneState(page);
  expect(state.worldId).toBe('grove');
  expect(state.npcs).toEqual(['momo', 'pip', 'nori', 'kiki']);
  expect(errors).toEqual([]);
});

test('switching from an open interview or with the case board open', async ({ page }) => {
  const errors = await start(page);
  await settled(page, 'tower', ['wren', 'basil', 'juniper']);
  await page.locator('nav [data-go="juniper"]').click();
  // Juniper is not in the grove case: the switch must not render her interview against the new cast.
  await expect(page.locator('.dialogue .speaker-tag b')).toHaveText('JUNIPER');
  await switchTo(page, 'banana-mystery');
  await settled(page, 'grove', ['momo', 'pip', 'nori', 'kiki']);
  await expect(page.locator('#panel h2')).toHaveText('A bunch of trouble.');
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
  for (const id of ['momo', 'pip', 'nori', 'kiki']) await expect(page.locator(`nav [data-go="${id}"]`)).toHaveCount(1);
  await expect(page.locator('nav [data-go="wren"]')).toHaveCount(0);
  await switchTo(page, 'tower-echo-bell');
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

test('the tower has its own colours, the grove keeps its own, and the case board follows the pick', async ({ page }) => {
  // Both worlds share the same dark page now: what differs is the accent and sky tokens and the swatch in the world panel.
  const look = () => page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    return {
      theme: document.documentElement.dataset.theme,
      accent: root.getPropertyValue('--accent').trim().toUpperCase(),
      sky: root.getPropertyValue('--sky').trim().toUpperCase(),
      swatch: getComputedStyle(document.querySelector('.world-swatch')).backgroundColor,
      title: document.title,
    };
  });
  await start(page);
  await settled(page, 'tower', ['wren', 'basil', 'juniper']);
  expect(await look()).toEqual({ theme: 'tower', accent: '#B9A2EE', sky: '#DCD3F2', swatch: 'rgb(185, 162, 238)', title: 'Lanterns Too Soon · AgentVerse' });
  await page.locator('#reset-button').focus();
  await page.keyboard.press('Shift+Tab');
  // The focus ring is gold in every world.
  expect(await page.locator('#restart-button').evaluate(el => getComputedStyle(el).outlineColor)).toBe('rgb(244, 183, 64)');
  await switchTo(page, 'banana-mystery');
  await settled(page, 'grove', ['momo', 'pip', 'nori', 'kiki']);
  expect(await look()).toEqual({ theme: 'grove', accent: '#8CC56A', sky: '#BFE0EE', swatch: 'rgb(140, 197, 106)', title: 'The Banana Mystery · AgentVerse' });
  await page.locator('#reset-button').click();
  await page.locator('.case-option input[name="case"][value="tower-echo-bell"]').check();
  await expect.poll(async () => (await look()).theme).toBe('tower');
  await expect.poll(async () => (await look()).swatch).toBe('rgb(185, 162, 238)');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await look()).theme).toBe('grove');
  await expect.poll(async () => (await look()).swatch).toBe('rgb(140, 197, 106)');
  await expect(page.locator('#app')).toHaveAttribute('data-world', 'grove');
});

test('station labels are sharp HTML over the canvas that follow its size and world', async ({ page }) => {
  // The canvas fills the stage and the world (480 x 340) is fitted inside it, so the label layer must sit on the world's rect:
  // inside the canvas, in the world's proportions, with the font in step with the layout scale.
  const fit = () => page.evaluate(() => {
    const c = document.querySelector('#station canvas').getBoundingClientRect();
    const o = document.querySelector('#station .station-labels').getBoundingClientRect();
    const font = parseFloat(getComputedStyle(document.querySelector('#station .station-label')).fontSize);
    const inside = o.left >= c.left - 1 && o.top >= c.top - 1 && o.right <= c.right + 1 && o.bottom <= c.bottom + 1;
    return `${inside ? 'inside' : 'outside'} ratio ${(o.width / o.height).toFixed(2)} font ${Math.round(font / o.width * 480)} width ${Math.round(o.width)}`;
  });
  const widthOf = text => Number(/width (\d+)/.exec(text)[1]);
  await start(page);
  await settled(page, 'tower', ['wren', 'basil', 'juniper']);
  const labels = page.locator('#station .station-label');
  await expect(labels).toHaveText(['WREN', 'BASIL', 'JUNIPER', 'START HERE', 'YOUR GUESS']);
  await expect(page.locator('#station .station-prompt')).toHaveText('[E] Read the case');
  await expect.poll(fit).toMatch(/^inside ratio 1\.41 font 7 /);
  const wide = widthOf(await fit());
  await page.setViewportSize({ width: 1100, height: 760 });
  await expect.poll(async () => widthOf(await fit())).toBeLessThan(wide);
  await expect.poll(fit).toMatch(/^inside ratio 1\.41 font 7 /);
  await switchTo(page, 'banana-mystery');
  await expect(labels).toHaveText(['MOMO', 'PIP', 'NORI', 'KIKI', 'START HERE', 'YOUR GUESS']);
});

test('a tower session resumes from its cookie', async ({ page }) => {
  await start(page);
  await settled(page, 'tower', ['wren', 'basil', 'juniper']);
  const sessionId = await sessionIdOf(page);
  await page.reload();
  await page.locator('#begin-button').click();
  await expect(page.locator('#intro')).toHaveCount(0);
  await settled(page, 'tower', ['wren', 'basil', 'juniper']);
  for (const id of ['wren', 'basil', 'juniper']) await expect(page.locator(`nav [data-go="${id}"]`)).toHaveCount(1);
  // The same session came back: the notebook page counter this used to read is gone, so compare the session itself.
  expect(await sessionIdOf(page)).toBe(sessionId);
});

test('the real tower art keeps its proportions, uses the corrected walk atlas and sits on the grove chrome', async ({ page }) => {
  const errors = await start(page, 'tower-echo-bell', { realArt: true });
  await settled(page, 'tower', ['wren', 'basil', 'juniper']);
  const look = await page.evaluate(() => {
    const scene = window.walkingTestGame.scene.getScene('banana-grove');
    const walk = scene.textures.get(scene.avatar.texture.key);
    const top = name => walk.get(name).cutY;
    return {
      artSources: { ...scene.artSources },
      heights: Object.fromEntries([...scene.npcs].map(([id, npc]) => [id, npc.sprite.displayHeight])),
      avatar: scene.avatar.displayHeight,
      sheetHeight: scene.textures.get('tower-walk').getSourceImage().height,
      drawn: ['down-1', 'down-3', 'up-1', 'up-3', 'left-3', 'right-3'].map(top),
    };
  });
  expect(look.artSources).toEqual({ cast: 'file', idle: 'file', walk: 'file', props: 'file' });
  // One scale for the sheet: Juniper's hat makes her the tallest, the others keep their drawn size.
  expect(look.heights.juniper).toBeCloseTo(47, 0);
  expect(look.heights.wren).toBeLessThan(look.heights.juniper - 2);
  expect(look.heights.basil).toBeLessThan(look.heights.juniper - 2);
  expect(look.avatar).toBeGreaterThan(44);
  expect(look.avatar).toBeLessThanOrEqual(45);
  // All strides now come directly from the corrected PNG, without the rebuilt strip.
  for (const y of look.drawn) expect(y).toBeLessThan(look.sheetHeight);
  // The cast card's tile shows the tower's own portrait art, not a flat colour fill.
  const face = page.locator('.room-nav .cast-tile .monkey-face').first();
  await expect(face).toBeVisible();
  expect(await face.evaluate(el => getComputedStyle(el).backgroundImage)).toContain('/assets/tower/apprentices.png');
  expect(errors).toEqual([]);
});

test('the tower verdict goes through the role picker and every wizard is fooled', async ({ page }) => {
  await start(page);
  await settled(page, 'tower', ['wren', 'basil', 'juniper']);
  const cast = castOf(await sessionIdOf(page), 'test-results/sessions-tower');
  expect(Object.keys(cast)).toEqual(['wren', 'basil', 'juniper']);
  const truth = truthOf(cast);
  expect(Object.values(truth)).toEqual(['fooled', 'fooled', 'fooled']);
  for (const id of ['wren', 'basil', 'juniper']) {
    await page.locator(`nav [data-go="${id}"]`).click();
    await expect(page.locator('.dialogue .speaker-tag b')).toBeVisible({ timeout: 15_000 });
    await page.locator('[data-quick-question]').click();
    await expect(page.locator('.speech.investigator')).toHaveCount(1, { timeout: 12_000 });
    await expect(page.locator('.speech.investigator')).toContainText(quickQuestionFor(cast, id));
  }
  await page.locator('.verdict-button').click();
  await expect(page.locator('fieldset.role-row')).toHaveCount(3);
  for (const id of ['wren', 'basil', 'juniper']) await pickRole(page, id, truth[id]);
  await page.locator('#lock-in').click();
  await expect(page.locator('.verdict-summary')).toContainText('3 / 3');
  await expect(page.locator('.pick-right')).toHaveCount(3);
});
