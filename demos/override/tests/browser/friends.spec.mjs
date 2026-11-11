import { test, expect } from './team.mjs';
import { castOf, sessionIdOf, lockIn, pickConfidence, interviewAll } from './cast.mjs';
import { mkdirSync } from 'node:fs';

// Capture every Phaser.Game from the test environment (the walking station and the roundtable are two games).
async function start(page, caseId = 'friends-roundtable') {
  await page.addInitScript(() => {
    window.testGames = [];
    Object.defineProperty(window, 'Phaser', {
      configurable: true,
      set(phaser) {
        Object.defineProperty(window, 'Phaser', { value: phaser, configurable: true });
        const Game = phaser.Game;
        phaser.Game = class extends Game {
          constructor(config) { super(config); window.testGames.push(this); }
        };
      },
    });
  });
  await page.goto(`/?case=${caseId}`);
  await page.locator('#begin-button').click();
  await expect(page.locator('#intro')).toHaveCount(0);
}

const IDS = ['maya', 'ken', 'alex', 'nora', 'player', 'sam'];
const FRIENDS = ['maya', 'ken', 'alex', 'nora', 'sam'];
const NAMES = { maya: 'Ector', ken: 'Perceval', alex: 'Pellinore', nora: 'Galahad', sam: 'Constantine' };

const ready = page => page.waitForFunction(() => window.testGames.some(g => g.scene.getScene('roundtable')?.actors?.size === 6));
const info = page => page.evaluate(() => {
  const game = window.testGames.find(g => g.scene.getScene('roundtable')?.actors?.size === 6);
  const scene = game.scene.getScene('roundtable');
  return {
    pixelArt: game.config.pixelArt,
    table: scene.table.depth,
    actors: Object.fromEntries([...scene.actors].map(([id, v]) => [id, { layer: v.layer, depth: v.sprite.depth, originY: v.sprite.originY, state: v.state, key: v.key, fallback: v.fallback }])),
  };
});
const state = (page, id) => page.evaluate(id => window.testGames.map(g => g.scene.getScene('roundtable')).find(s => s?.actors?.size === 6).actors.get(id).state, id);

// Screen position of a room point, through the camera and the canvas (the camera only scrolls the room into the larger game).
const screenPoint = (page, room) => page.evaluate(room => {
  const game = window.testGames.find(g => g.scene.getScene('roundtable')?.actors?.size === 6);
  const cam = game.scene.getScene('roundtable').cameras.main;
  const rect = game.canvas.getBoundingClientRect();
  return { x: rect.left + ((room.x - cam.scrollX) / game.scale.width) * rect.width, y: rect.top + ((room.y - cam.scrollY) / game.scale.height) * rect.height };
}, room);
// The centre of a friend's drawn head, in room pixels: the opaque pixels of the drawing's top 60 rows (hair to chin),
// read from the rig texture and placed through the head sprite's own position, scale and flip. Independent of the
// click target and of the crop bands.
const HEAD_POINT = id => {
  const scene = window.testGames.map(g => g.scene.getScene('roundtable')).find(s => s?.actors?.size === 6);
  const head = scene.actors.get(id).head;
  const frame = scene.textures.get(`friends-rig:${id}`).get(head.frame.name);
  const data = scene.textures.get(`friends-rig:${id}`).getContext().getImageData(frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight).data;
  const opaque = (x, y) => data[(y * frame.cutWidth + x) * 4 + 3] > 128;
  let top = 0;
  while (top < frame.cutHeight && ![...Array(frame.cutWidth).keys()].some(x => opaque(x, top))) top++;
  let sx = 0, sy = 0, n = 0;
  for (let y = top; y < Math.min(top + 60, frame.cutHeight); y++) for (let x = 0; x < frame.cutWidth; x++) if (opaque(x, y)) { sx += x; sy += y; n++; }
  const dir = head.flipX ? -1 : 1;
  return { x: head.x + dir * (sx / n - frame.cutWidth * head.originX) * head.scaleX, y: head.y + (sy / n - frame.cutHeight * head.originY) * head.scaleY };
};
const bodyPoint = async (page, id) => screenPoint(page, await page.evaluate(`(${HEAD_POINT})(${JSON.stringify(id)})`));

const shot = (page, testInfo, name) => page.screenshot({ path: testInfo.outputPath(`${name}.png`) });

test('friends_layers: far behind the table, near in front, six actors', async ({ page }, testInfo) => {
  await start(page);
  await ready(page);
  await expect(page.locator('#roundtable')).toBeVisible();
  await expect(page.locator('#station')).toBeHidden();
  const v = await info(page);
  expect(v.pixelArt).toBe(true);
  expect(Object.keys(v.actors).sort()).toEqual([...IDS].sort());
  for (const id of IDS) {
    const a = v.actors[id];
    expect(a.originY).toBeCloseTo(282 / 288, 4);
    if (a.layer === 'far') expect(a.depth).toBeLessThan(v.table); else expect(a.depth).toBeGreaterThan(v.table);
  }
  expect(Object.values(v.actors).filter(a => a.layer === 'far')).toHaveLength(4);
  expect(Object.values(v.actors).filter(a => a.layer === 'near')).toHaveLength(2);
  // Missing art is explicit, never presented as a seated loop.
  expect(v.actors.alex.fallback).toMatch(/no seated art yet/);
  expect(v.actors.sam.fallback).toMatch(/temporary seated rig/);
  expect(v.actors.maya.fallback).toBeNull();
  await page.locator('#dialogue-close').click();
  const staging = await page.evaluate(() => {
    const scene = window.testGames.map(g => g.scene.getScene('roundtable')).find(s => s?.actors?.size === 6);
    // Flat cards live in table-plane containers: count those children too, at their container's depth.
    const all = scene.children.list.flatMap(o => (o.list ? o.list.map(c => ({ o: c, depth: o.depth })) : [{ o, depth: o.depth }]));
    const props = all.filter(({ o }) => o.texture?.key?.startsWith('tabletop:') && !o.isTintFill);
    const near = [...scene.actors.values()].filter(v => v.layer === 'near').map(v => v.base.depth);
    return {
      cropped: [...scene.actors.values()].every(v => v.sprite.isCropped && v.head.isCropped),
      props: props.length,
      propDepths: [Math.min(...props.map(p => p.depth)), Math.max(...props.map(p => p.depth))],
      nearChairs: scene.children.list.filter(o => o.texture?.key?.startsWith('friends-room:chair-') && o.depth > scene.table.depth).map(o => o.depth),
      nearActor: Math.min(...near),
      table: scene.table.depth,
      far: Math.max(...[...scene.actors.values()].filter(v => v.layer === 'far').map(v => v.head.depth)),
    };
  });
  expect(staging.cropped).toBe(true);
  expect(staging.props).toBeGreaterThanOrEqual(20);
  // Far friends < table < props < near chairs < near friends.
  expect(staging.far).toBeLessThan(staging.table);
  expect(staging.propDepths[0]).toBeGreaterThan(staging.table);
  expect(staging.nearChairs).toHaveLength(2);
  for (const d of staging.nearChairs) { expect(d).toBeGreaterThan(staging.propDepths[1]); expect(d).toBeLessThan(staging.nearActor); }
  await shot(page, testInfo, 'scene');
  if (process.env.ARBITER_CAPTURE_DIR) {
    mkdirSync(process.env.ARBITER_CAPTURE_DIR, { recursive: true });
    await page.evaluate(() => {
      const scene = window.testGames.map(g => g.scene.getScene('roundtable')).find(s => s?.actors?.size === 6);
      scene.speak('maya', 'Could you pass the cards? I think it is your turn to deal.');
      scene.game.loop.sleep();
    });
    for (let i = 0; i < 24; i++) {
      await page.evaluate(time => {
        const scene = window.testGames.map(g => g.scene.getScene('roundtable')).find(s => s?.actors?.size === 6);
        for (const v of scene.actors.values()) v.elapsed = time;
        scene.game.step(time, 0);
      }, i * 1000 / 6);
      await page.screenshot({ path: `${process.env.ARBITER_CAPTURE_DIR}/frame-${String(i).padStart(3, '0')}.png` });
    }
  }
});

test('friends_playback: bodies stay registered while facial patches animate', async ({ page }) => {
  await start(page);
  await ready(page);
  const seen = await page.evaluate(() => new Promise(resolve => {
    const scene = window.testGames.map(g => g.scene.getScene('roundtable')).find(s => s?.actors?.size === 6);
    scene.speak('maya', 'This is a long enough sentence to inspect the talking animation for several seconds.');
    const frames = Object.fromEntries([...scene.actors.keys()].map(id => [id, new Set()]));
    const faces = new Set();
    const positions = [];
    const pieces = [];
    const t0 = performance.now();
    (function tick() {
      for (const [id, v] of scene.actors) {
        frames[id].add(v.sprite.frame.name + '|' + v.base.frame.name);
        // The three bands of one drawing share x; the head and torso only ever drop 0-2 px below the base.
        pieces.push([v.head.x - v.base.x, v.sprite.x - v.base.x, v.head.y - v.base.y, v.sprite.y - v.base.y]);
      }
      faces.add(scene.actors.get('maya').head.frame.name);
      positions.push(scene.actors.get('maya').sprite.y);
      if (performance.now() - t0 < 1500) requestAnimationFrame(tick);
      else resolve({ frames: Object.fromEntries(Object.entries(frames).map(([id, s]) => [id, [...s]])), faces: [...faces], travel: Math.max(...positions) - Math.min(...positions), pieces });
    })();
  }));
  // A state entry can select the new fixed pose once; it must not keep swapping body drawings.
  for (const id of IDS) expect(seen.frames[id].length, id).toBeLessThanOrEqual(2);
  // Only the face changes while she talks: the drawing's open mouth and its painted closed mouth.
  expect(seen.faces).toContain('talk');
  expect(seen.faces.some(f => f.startsWith('talk') && f.endsWith(':closed'))).toBe(true);
  expect(seen.travel).toBeLessThanOrEqual(2.5);
  for (const [hx, tx, hy, ty] of seen.pieces) {
    expect(hx).toBe(0); expect(tx).toBe(0);
    expect(ty).toBeGreaterThanOrEqual(0); expect(hy).toBeGreaterThanOrEqual(ty); expect(hy).toBeLessThanOrEqual(2);
  }
});

test('friends_reduced_motion: nobody moves, blinks or flaps a mouth; states still change', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await start(page);
  await ready(page);
  const seen = await page.evaluate(() => new Promise(resolve => {
    const scene = window.testGames.map(g => g.scene.getScene('roundtable')).find(s => s?.actors?.size === 6);
    scene.speak('maya', 'A sentence long enough to watch for a while, with nothing moving at all on the table.');
    const offsets = new Set(), faces = new Set(), states = new Set();
    const t0 = performance.now();
    (function tick() {
      for (const v of scene.actors.values()) { offsets.add(v.head.y - v.base.y); offsets.add(v.sprite.y - v.base.y); faces.add(v.face.includes(':') ? v.face : 'plain'); }
      states.add(scene.actors.get('maya').state);
      if (performance.now() - t0 < 2500) requestAnimationFrame(tick);
      else resolve({ offsets: [...offsets], faces: [...faces], states: [...states] });
    })();
  }));
  expect(seen.offsets).toEqual([0]);
  expect(seen.faces).toEqual(['plain']);
  expect(seen.states).toContain('talk');
});

test('friends_click_targets: far friends are clickable only above the table edge, every friend is a target', async ({ page }) => {
  await start(page);
  await ready(page);
  const hits = await page.evaluate(`(() => {
    const headPoint = ${HEAD_POINT};
    const scene = window.testGames.map(g => g.scene.getScene('roundtable')).find(s => s?.actors?.size === 6);
    // Tabletop ellipse of roundtable-fullscreen.png (centre 836,375, radii 828,362) in room pixels.
    const t = scene.table, k = t.displayWidth / 1672;
    const cx = t.x + 836 * k, cy = t.y + 375 * k, rx = 828 * k, ry = 362 * k;
    const edge = x => { const u = (x - cx) / rx; return Math.abs(u) >= 1 ? cy : cy - ry * Math.sqrt(1 - u * u); };
    return [...scene.actors.values()].map(v => {
      const hit = v.hit, cb = hit.input?.hitAreaCallback, area = hit.input?.hitArea;
      const inside = (x, y) => Boolean(cb && cb(area, x - hit.x, y - hit.y, hit));
      // Every point of the tabletop just below the far edge, across the target's whole width (both corners included).
      let onTable = 0, sampled = 0;
      if (v.layer === 'far') for (let x = Math.ceil(hit.x); x <= hit.x + hit.width; x += 2) for (let d = 1; d <= 31; d += 3) { sampled++; if (inside(x, edge(x) + d)) onTable++; }
      const p = v.id === 'player' ? null : headPoint(v.id);
      return { id: v.id, layer: v.layer, interactive: Boolean(hit.input?.enabled), w: hit.width, h: hit.height, onTable, sampled, head: p ? inside(p.x, p.y) : null };
    });
  })()`);
  for (const h of hits) {
    expect(h.interactive, h.id).toBe(h.id !== 'player');
    expect(h.w, h.id).toBeGreaterThan(60);
    expect(h.h, h.id).toBeGreaterThan(80);
    if (h.id !== 'player') expect(h.head, `${h.id}: the drawn head is clickable`).toBe(true);
    if (h.layer === 'far') { expect(h.sampled, h.id).toBeGreaterThan(100); expect(h.onTable, `${h.id}: tabletop points inside the target`).toBe(0); }
  }
});

test('friends_click_and_rail_open_chat', async ({ page }, testInfo) => {
  await start(page);
  await ready(page);
  await expect(page.locator('#room-nav [data-go]')).toHaveCount(5);
  // By the rail.
  await page.locator('#room-nav [data-go="ken"]').click();
  await expect(page.locator('[data-quick-question]')).toBeVisible();
  await expect(page.locator('#panel')).toContainText('Perceval');
  // By clicking the friend at the table.
  await expect.poll(() => state(page, 'ken'), { timeout: 9000 }).toBe('idle');
  // The table in front of Nora covers her waist: clicking there is not clicking her. The inner corner (toward the
  // table's middle) is where the edge is highest, so a target that ignores the curve would reach over the table there.
  const below = await page.evaluate(() => {
    const scene = window.testGames.map(g => g.scene.getScene('roundtable')).find(s => s?.actors?.size === 6);
    const hit = scene.actors.get('nora').hit, t = scene.table, k = t.displayWidth / 1672;
    const cx = t.x + 836 * k, cy = t.y + 375 * k, rx = 828 * k, ry = 362 * k;
    const x = hit.x + 4, u = (x - cx) / rx;
    return { x, y: cy - ry * Math.sqrt(1 - u * u) + 8 };
  });
  const t = await screenPoint(page, below);
  await page.mouse.move(t.x, t.y);
  await page.mouse.click(t.x, t.y);
  await expect(page.locator('#panel')).toContainText('Perceval');
  const p = await bodyPoint(page, 'nora');
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator('#panel')).toContainText('Galahad');
  await expect(page.locator('#panel')).not.toContainText('Perceval’s');
  await expect(page.locator('[data-quick-question]')).toBeVisible();
  await shot(page, testInfo, 'chat');
});

test('friends_think_then_talk_then_idle', async ({ page }) => {
  await start(page);
  await ready(page);
  await page.evaluate(() => {
    const scene = window.testGames.map(g => g.scene.getScene('roundtable')).find(s => s?.actors?.size === 6);
    const seen = window.friendStates = { maya: new Set(), player: new Set() };
    (function tick() { for (const id of Object.keys(seen)) seen[id].add(scene.actors.get(id).state); requestAnimationFrame(tick); })();
  });
  await page.locator('#room-nav [data-go="maya"]').click();
  await page.locator('[data-quick-question]').click();
  await expect(page.locator('.speech.character.latest')).toBeVisible();
  await expect.poll(() => page.evaluate(() => [...window.friendStates.maya]), { timeout: 9000 }).toContain('talk');
  const maya = await page.evaluate(() => [...window.friendStates.maya]);
  const player = await page.evaluate(() => [...window.friendStates.player]);
  expect(maya).toContain('think');
  expect(player).toContain('talk');
  await expect.poll(() => state(page, 'maya'), { timeout: 9000 }).toBe('idle');
  expect(await state(page, 'player')).toBe('idle');
});

test('friends_choice_lineup_and_debrief', async ({ page }, testInfo) => {
  await start(page);
  await ready(page);
  await interviewAll(page);
  const cast = castOf(await sessionIdOf(page));
  await page.locator('.verdict-button').click();
  await expect(page.locator('#app')).toHaveAttribute('data-view', 'lineup');
  await expect(page.locator('#panel h1')).toHaveText('Unmask the conspiracists', { timeout: 12_000 });
  await expect(page.locator('fieldset.role-row')).toHaveCount(5);
  await expect(page.locator('fieldset.role-row').first().locator('.role-chip input')).toHaveCount(7);
  await expect(page.locator('.scale-ends')).toHaveCount(0);
  await expect(page.locator('.role-choice .choice-label').first()).toBeVisible();
  await shot(page, testInfo, 'lineup');
  await pickConfidence(page, 95);
  // A part id is the theory it holds, so the truth for each friend is their dealt part.
  await lockIn(page, Object.fromEntries(FRIENDS.map(id => [id, cast[id]])));
  await expect(page.locator('#panel .debrief-head')).toBeVisible();
  await expect(page.locator('.verdict-summary')).toContainText('5 / 5');
  await shot(page, testInfo, 'debrief');
});

test('friends_back_to_grove_walks', async ({ page }) => {
  await start(page);
  await ready(page);
  await page.locator('#reset-button').click();
  await page.locator('.case-option input[name="case"][value="banana-mystery"]').check();
  await page.locator('#confirm-reset').click();
  await expect(page.locator('#confirm-reset')).toHaveCount(0);
  await expect(page.locator('#station')).toBeVisible();
  await expect(page.locator('#roundtable')).toBeHidden();
  await page.waitForFunction(() => window.testGames.some(g => g.scene.getScene('banana-grove')?.avatar));
  const x0 = await page.evaluate(() => window.testGames.map(g => g.scene.getScene('banana-grove')).find(Boolean).player.x);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(500);
  await page.keyboard.up('ArrowRight');
  const x1 = await page.evaluate(() => window.testGames.map(g => g.scene.getScene('banana-grove')).find(Boolean).player.x);
  expect(x1).toBeGreaterThan(x0);
});

test('friends_resize_while_hidden_refits_on_return', async ({ page }) => {
  await start(page);
  await ready(page);
  await page.locator('#reset-button').click();
  await page.locator('.case-option input[name="case"][value="banana-mystery"]').check();
  await page.locator('#confirm-reset').click();
  await expect(page.locator('#confirm-reset')).toHaveCount(0);
  await expect(page.locator('#roundtable')).toBeHidden();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.locator('#reset-button').click();
  await page.locator('.case-option input[name="case"][value="friends-roundtable"]').check();
  await page.locator('#confirm-reset').click();
  await expect(page.locator('#confirm-reset')).toHaveCount(0);
  await expect(page.locator('#roundtable')).toBeVisible();
  await expect.poll(async () => {
    const box = await page.locator('#roundtable canvas').boundingBox();
    return box ? Math.max(Math.abs(box.width - 1280), Math.abs(box.height - 800)) : 999;
  }).toBeLessThanOrEqual(2);
  const drawn = await page.evaluate(() => {
    const scene = window.testGames.map(g => g.scene.getScene('roundtable')).find(s => s?.actors?.size === 6);
    return [...scene.actors.values()].every(v => v.sprite.visible && v.sprite.active);
  });
  expect(drawn).toBe(true);
});

test('case_board_preview_shows_the_picked_cast', async ({ page }) => {
  await page.goto('/?case=banana-mystery');
  await page.locator('#begin-button').click();
  await expect(page.locator('#intro')).toHaveCount(0);
  await page.locator('#reset-button').click();
  await page.locator('.case-option input[name="case"][value="friends-roundtable"]').check();
  const faces = page.locator('#case-preview .monkey-line .monkey-face');
  await expect(faces).toHaveCount(5);
  for (const [i, id] of ['maya', 'ken', 'alex', 'nora', 'sam'].entries()) await expect(faces.nth(i)).toHaveClass(new RegExp(`\\b${id}\\b`));
  await expect(page.locator('#case-preview .intro-flow')).toContainText('Ask 5 friends');
  await page.locator('.case-option input[name="case"][value="banana-mystery"]').check();
  await expect(faces).toHaveCount(4);
  await expect(page.locator('#case-preview .intro-flow')).toContainText('Ask 4 monkeys');
});
