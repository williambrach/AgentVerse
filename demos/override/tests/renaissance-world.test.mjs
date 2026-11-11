import test from 'node:test';
import assert from 'node:assert/strict';
import { worldFor } from '../client/worlds.ts';
import { inWalk } from '../client/hall-layout.ts';
import { stopPropsOf, drawnOf, loopUrl } from '../client/factory-figures.ts';
import { walkLook, gestureFrameAt } from '../client/figure-motion.ts';
import { gestureFor } from '../client/factory-figures.ts';

const w = worldFor('renaissance');

test('renaissance pack fields', () => {
  assert.equal(w.id, 'renaissance');
  assert.equal(w.text.place, 'Castelvento');
  assert.equal(w.text.eyebrow, 'CASTELVENTO');
  assert.equal(w.text.day, 'JUNE 1489');
  assert.equal(w.text.investigator, 'traveller');
  assert.deepEqual(w.figures.sprites, { ottavio: 'wizard', matteo: 'inventor', beatrice: 'noble', bruno: 'guard', agnese: 'apothecary' });
  assert.equal(w.figures.detective, 'scout');
  assert.deepEqual(w.figures.frame, { w: 132, h: 188 });
  // The head column sits at the frame's centre, so a flipped figure turns on the spot.
  assert.deepEqual(w.figures.anchor, { x: 66, y: 185 });
  assert.equal(w.figures.anchor.x * 2, w.figures.frame.w);
  assert.equal(w.figures.scale, 1 / 3);
  assert.equal(w.figures.walkFrames, undefined);
  assert.equal(w.figures.walkSheet.url, '/assets/renaissance/characters/scout-walk.png');
  assert.deepEqual(w.figures.stopProps, { briefing: 'scroll', report: 'seal' });
  assert.deepEqual(w.backdrop, { url: '/assets/renaissance/town-square.png', width: 1536, height: 1024, scale: 1 / 3, x: -16, y: 0, fill: '#2a2018' });
  assert.equal(w.evidence, undefined);
});

test('slots_on_ground: every slot and stop is inWalk, clear of the HUD rail', () => {
  for (const p of [...w.slots, w.stops.briefing, w.stops.report]) {
    assert.ok(inWalk(w.walk, p), JSON.stringify(p));
    assert.ok(p.x >= 100, `HUD rail ${p.x}`);
  }
  assert.equal(w.slots.length, 5);
});

test('market obstacles are blocked: stalls, counters, crates, barrels, doorsteps and buildings', () => {
  const solid = {
    'produce counter': { x: 50, y: 165 }, 'cloth stall': { x: 100, y: 158 }, 'barrel and crate': { x: 10, y: 190 },
    'bread stall': { x: 445, y: 180 }, 'palazzo steps': { x: 222, y: 145 }, 'apothecary door': { x: 360, y: 150 },
    'clockmaker door': { x: 418, y: 152 }, 'side passage': { x: 305, y: 130 }, 'palazzo wall': { x: 190, y: 100 },
  };
  for (const [name, p] of Object.entries(solid)) assert.equal(inWalk(w.walk, p), false, name);
});

test('walk_connected: from the briefing stop the open plaza reaches within 18 of every character and stop', () => {
  const step = 2, seen = new Set(), key = p => `${p.x},${p.y}`;
  const start = { x: w.stops.briefing.x, y: w.stops.briefing.y };
  const queue = [start];
  seen.add(key(start));
  while (queue.length) {
    const p = queue.pop();
    for (const [dx, dy] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
      const q = { x: p.x + dx, y: p.y + dy };
      if (!seen.has(key(q)) && inWalk(w.walk, q)) { seen.add(key(q)); queue.push(q); }
    }
  }
  const cells = [...seen].map(k => k.split(',').map(Number));
  for (const t of [...w.slots, w.stops.report]) {
    // The interaction radius is 18 world units (station.ts); stand below the target, never on its feet collider.
    assert.ok(cells.some(([x, y]) => Math.hypot(x - t.x, y - t.y) < 18 && y > t.y), `unreachable ${JSON.stringify(t)}`);
  }
});

test('slots_spaced: at least 50 world units between any two characters', () => {
  for (let i = 0; i < w.slots.length; i++) for (let j = i + 1; j < w.slots.length; j++) {
    assert.ok(Math.hypot(w.slots[i].x - w.slots[j].x, w.slots[i].y - w.slots[j].y) >= 50, `${i} ${j}`);
  }
});

test('apothecary_beside_her_door: Agnese stands left of the doorway (x 350..372), not in it', () => {
  const agnese = w.slots[4];
  const half = 13; // her figure is about 26 world units wide at 1/3
  assert.ok(agnese.x + half < 350, `${agnese.x}`);
  assert.ok(agnese.x > 300 && agnese.y < 190);
});

test('vial_gesture: only the apothecary, only for her work, played in, held for the line, played out', () => {
  assert.deepEqual(gestureFor(w.figures, 'apothecary', 'work'), { name: 'vial', frames: 8, hold: 3, frameMs: 220, topics: ['work'] });
  assert.equal(gestureFor(w.figures, 'apothecary', 'square'), undefined);
  assert.equal(gestureFor(w.figures, 'apothecary', undefined), undefined);
  for (const s of ['wizard', 'inventor', 'noble', 'guard', 'scout']) assert.equal(gestureFor(w.figures, s, 'work'), undefined);
  const g = gestureFor(w.figures, 'apothecary', 'work');
  const at = t => gestureFrameAt(g, t, 3000);
  assert.deepEqual([0, 219, 220, 659, 660, 2999, 3000, 3219, 3220, 3659, 3879, 3880].map(at), [0, 0, 1, 2, 3, 3, 4, 4, 5, 6, 7, null]);
  assert.equal(gestureFrameAt(g, -1, 3000), null);
  // A line shorter than the take-out still shows the inspect frame once.
  assert.deepEqual([660, 661, 880].map(t => gestureFrameAt(g, t, 100)), [4, 4, 5]);
  // The vial is never a talk or idle loop: she talks in one idle stance.
  assert.deepEqual(drawnOf(w.figures, 'apothecary'), { idle: 4, talk: 1, walk: 0 });
});

test('stop_props_default: department keeps case-folder and notebook and its layout', () => {
  const d = worldFor('department');
  assert.deepEqual(stopPropsOf(d.figures), { briefing: 'case-folder', report: 'notebook' });
  assert.equal(d.figures.walkFrames, undefined);
  assert.deepEqual(d.stops, { report: { x: 216, y: 296 }, briefing: { x: 240, y: 320 } });
  assert.equal(d.backdrop.url, '/assets/department/department-hall.png');
  assert.ok(d.evidence.length > 0);
  assert.deepEqual(stopPropsOf(w.figures), { briefing: 'scroll', report: 'seal' });
});

test('walk_sheet_by_time: the scout walks the R1 sheet, 8 frames at 100 ms of walking time; only the scout walks', () => {
  const scout = drawnOf(w.figures, 'scout');
  assert.deepEqual(scout, { idle: 4, talk: 1, walk: 8 });
  const clock = ms => ({ ms, frameMs: w.figures.walkSheet.frameMs });
  assert.deepEqual([0, 99, 100, 350, 799, 800].map(ms => walkLook(0, 'listening', scout, clock(ms)).texture), [0, 0, 1, 3, 7, 0].map(frame => ({ kind: 'walk', frame })));
  assert.deepEqual(drawnOf(w.figures, 'noble'), { idle: 4, talk: 2, walk: 0 });
  assert.deepEqual(drawnOf(worldFor('factory').figures, 'detective'), { idle: 0, talk: 0, walk: 8 });
  assert.deepEqual(drawnOf(worldFor('factory').figures, 'worker-01'), { idle: 0, talk: 0, walk: 0 });
  assert.equal(loopUrl(w.figures, 'noble', 'talk', 1), '/assets/renaissance/characters/noble-talk-1.png');
});

test('name_tags_do_not_overlap: 7 world px per character plus 10, at labelLift', () => {
  const names = ['MAESTRO OTTAVIO', 'SER MATTEO', 'MADONNA BEATRICE', 'SERGEANT BRUNO', 'MONNA AGNESE'];
  const tags = names.map((n, i) => ({ n, x: w.slots[i].x, y: w.slots[i].y - w.figures.labelLift, w: n.length * 7 + 10 }));
  tags.push({ n: 'START HERE', x: w.stops.briefing.x, y: w.stops.briefing.y - w.figures.labelLift, w: 80 });
  tags.push({ n: 'YOUR GUESS', x: w.stops.report.x, y: w.stops.report.y - w.figures.labelLift, w: 80 });
  const H = 16;
  for (let i = 0; i < tags.length; i++) for (let j = i + 1; j < tags.length; j++) {
    const a = tags[i], b = tags[j];
    const hit = Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < H;
    assert.ok(!hit, `${a.n} overlaps ${b.n}`);
  }
  assert.ok(w.slots[4].x >= 100);
});
