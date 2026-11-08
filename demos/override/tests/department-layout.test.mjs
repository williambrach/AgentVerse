import test from 'node:test';
import assert from 'node:assert/strict';
import { worldFor } from '../client/worlds.ts';
import { inWalk, evidenceIdOf, evidenceKey } from '../client/hall-layout.ts';
import { figureBox } from '../client/factory-figures.ts';

const w = worldFor('department');
const art = w.figures;
const ids = ['freja', 'mikkel', 'birgit', 'jonas', 'signe'];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

test('inWalk_and_evidence_ids', () => {
  const walk = { bounds: { x: 40, y: 188, w: 396, h: 138 }, blocks: [{ x: 386, y: 272, w: 80, h: 70 }] };
  assert.equal(inWalk(walk, { x: 400, y: 300 }), false);
  assert.equal(inWalk(walk, { x: 100, y: 250 }), true);
  assert.equal(inWalk(walk, { x: 10, y: 250 }), false);
  assert.equal(evidenceIdOf('evidence:usb-drive'), 'usb-drive');
  assert.equal(evidenceIdOf('evidence'), null);
  assert.equal(evidenceIdOf('freja'), null);
  assert.equal(evidenceKey('keys'), 'evidence:keys');
});

test('layout_in_walk', () => {
  const pts = [...w.slots, ...Object.values(w.stops), ...w.evidence];
  assert.equal(w.slots.length, 5);
  assert.equal(w.evidence.length, 8);
  pts.forEach(p => assert.ok(inWalk(w.walk, p), `(${p.x},${p.y}) not on the floor`));
});

test('clearances', () => {
  const chars = w.slots, stops = Object.values(w.stops), ev = w.evidence;
  chars.forEach((a, i) => chars.slice(i + 1).forEach(b => assert.ok(dist(a, b) >= 40, `characters ${i} close`)));
  ev.forEach((e, i) => {
    chars.forEach((c, j) => assert.ok(dist(e, c) >= 28, `${e.id} near character ${ids[j]}`));
    stops.forEach(s => assert.ok(dist(e, s) >= 28, `${e.id} near a stop`));
    ev.slice(i + 1).forEach(o => assert.ok(dist(e, o) >= 28, `${e.id} near ${o.id}`));
  });
  for (const p of chars) {
    const b = figureBox(art, p);
    assert.ok(b.top >= 0, `head above the world at ${p.x}`);
    assert.ok(b.left >= 0 && b.left + b.width <= 480, 'figure outside x 0..480');
  }
  const tags = ids.map((id, i) => {
    const wd = id.length * 7 + 12, p = w.slots[i];
    return { left: p.x - wd / 2, top: p.y - art.labelLift - 7, width: wd, height: 14 };
  });
  tags.forEach((a, i) => tags.slice(i + 1).forEach((b, k) => {
    const hit = a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;
    assert.ok(!hit, `name tags ${ids[i]} and ${ids[i + 1 + k]} overlap`);
  }));
});

const box = (p, text) => { const wd = text.length * 7 + 12; return { left: p.x - wd / 2, top: p.y - art.labelLift - 7, width: wd, height: 14 }; };
const hit = (a, b) => a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;

test('stop_labels_clear', () => {
  const names = ids.map((id, i) => box(w.slots[i], id));
  const figs = w.slots.map(s => figureBox(art, s));
  const labels = [['START HERE', w.stops.briefing], ['YOUR GUESS', w.stops.report]].map(([t, p]) => ({ t, b: box(p, t) }));
  assert.ok(!hit(labels[0].b, labels[1].b), 'stop labels overlap');
  labels.forEach(({ t, b }) => {
    names.forEach((n, i) => assert.ok(!hit(b, n), `${t} over ${ids[i]} tag`));
    figs.forEach((f, i) => assert.ok(!hit(b, f), `${t} over ${ids[i]} figure`));
  });
});

test('evidence_reachable', () => {
  const free = p => inWalk(w.walk, p) && !w.walk.blocks.some(b => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h);
  for (const e of w.evidence) {
    let ok = false;
    for (let dx = -16; dx <= 16 && !ok; dx++) for (let dy = -16; dy <= 16 && !ok; dy++) if (Math.hypot(dx, dy) <= 16 && free({ x: e.x + dx, y: e.y + dy })) ok = true;
    assert.ok(ok, `${e.id} unreachable`);
  }
  assert.ok(!inWalk(w.walk, { x: 46, y: 192 }), 'counter/pot blocked');
});

test('backdrop_exact', () => {
  const b = w.backdrop;
  assert.equal(b.scale * art.density, 1);
  assert.ok(b.x <= 0 && b.x + b.width * b.scale >= 480 && b.height * b.scale >= 340);
  assert.deepEqual(art.sprites, { freja: 'phd-01', mikkel: 'phd-02', birgit: 'professor', jonas: 'it-admin', signe: 'department-admin' });
});
