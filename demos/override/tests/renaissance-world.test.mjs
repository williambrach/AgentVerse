import test from 'node:test';
import assert from 'node:assert/strict';
import { worldFor } from '../client/worlds.ts';
import { inWalk } from '../client/hall-layout.ts';
import { stopPropsOf, drawnOf, loopUrl } from '../client/factory-figures.ts';
import { walkLook } from '../client/figure-motion.ts';

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
  assert.equal(w.figures.walkFrames, 4);
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

test('well and bench are blocked', () => {
  assert.equal(inWalk(w.walk, { x: 20, y: 200 }), false);
  assert.equal(inWalk(w.walk, { x: 450, y: 215 }), false);
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

test('walk_frames_follow_distance: one frame per 9.5 world units, only the scout walks', () => {
  const scout = drawnOf(w.figures, 'scout');
  assert.deepEqual(scout, { idle: 4, talk: 1, walk: 4 });
  assert.deepEqual([0, 9.4, 9.5, 19, 28.5, 38, 47.5].map(d => walkLook(d, 'listening', scout).texture), [0, 0, 1, 2, 3, 0, 1].map(frame => ({ kind: 'walk', frame })));
  assert.deepEqual(drawnOf(w.figures, 'noble'), { idle: 4, talk: 2, walk: 0 });
  assert.deepEqual(drawnOf(worldFor('factory').figures, 'detective'), { idle: 0, talk: 0, walk: 0 });
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
