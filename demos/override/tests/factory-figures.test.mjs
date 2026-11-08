import test from 'node:test';
import { readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { readPng } from './png.mjs';
import * as ff from '../client/factory-figures.ts';
import { worldFor } from '../client/worlds.ts';

const factory = worldFor('factory');
const art = factory.figures;
const ids = ['marta', 'ama', 'vera', 'theo', 'bruno'];

test('urls_and_box', () => {
  assert.equal(ff.poseUrl(art, 'worker-01', 'thinking'), '/assets/factory/characters/worker-01-thinking.png');
  assert.equal(ff.propUrl(art, 'exit-door'), '/assets/factory/props/exit-door.png');
  const b = ff.figureBox(art, { x: 100, y: 200 });
  assert.equal(b.left, 84); assert.equal(b.width, 32); assert.equal(b.height, 64);
  assert.equal(Number(b.top.toFixed(3)), 137.333);
});

test('pose_and_speak', () => {
  assert.equal(ff.poseFor({ thinking: 'ama', speaking: null, typing: false }, 'ama'), 'thinking');
  assert.equal(ff.poseFor({ thinking: null, speaking: 'ama', typing: true }, 'detective'), 'thinking');
  assert.equal(ff.poseFor({ thinking: null, speaking: 'ama', typing: false }, 'ama'), 'speaking');
  assert.equal(ff.poseFor({ thinking: null, speaking: 'ama', typing: false }, 'vera'), 'listening');
  assert.equal(ff.speakMs('one two three'), 2250);
  assert.equal(ff.speakMs('hi'), 2000);
  assert.equal(ff.speakMs(Array(100).fill('w').join(' ')), 8000);
});

test('five_distinct_sprites', () => {
  const sprites = ids.map(i => art.sprites[i]);
  assert.deepEqual(sprites, ['worker-01', 'worker-02', 'worker-03', 'worker-04', 'worker-05']);
  assert.equal(new Set(sprites).size, 5);
  assert.equal(factory.slots.length, 5);
  assert.equal(art.density, 3);
  assert.equal(art.labelLift, ff.figureBox(art, { x: 0, y: 0 }).height + 4);
});

// Visible (non-transparent) rectangle of a prop in world units, from its PNG.
function propBox(p) {
  const { data, width, height } = readPng(new URL(`../public${ff.propUrl(art, p.id)}`, import.meta.url).pathname);
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3] > 16) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const s = art.scale;
  return { left: p.x - width * s / 2 + x0 * s, top: p.y - height * s + y0 * s, width: (x1 - x0 + 1) * s, height: (y1 - y0 + 1) * s };
}
const hit = (a, b) => a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;

test('slots_clear', () => {
  const figs = factory.slots.map(s => ff.figureBox(art, s));
  const props = factory.floor.props.map(propBox);
  assert.ok(props.length === 12);
  figs.forEach((a, i) => {
    figs.slice(i + 1).forEach(b => assert.ok(!hit(a, b), 'figures overlap'));
    props.forEach(p => assert.ok(!hit(a, p), `figure ${i} overlaps a prop`));
  });
  for (const b of [...figs, ...props]) {
    assert.ok(b.left >= 4 && b.top >= 4 && b.left + b.width <= 476 && b.top + b.height <= 336, JSON.stringify(b));
  }
});

test('stops_clear', () => {
  const pts = { report: factory.stops.report, briefing: factory.stops.briefing };
  const props = factory.floor.props.map(propBox);
  const workers = factory.slots.map(s => ff.figureBox(art, s));
  const inField = box => box.left >= 4 && box.top >= 4 && box.left + box.width <= 476 && box.top + box.height <= 336;
  for (const [name, p] of Object.entries(pts)) {
    const marker = { left: p.x - 15, top: p.y - 4.5, width: 30, height: 9 };
    const det = ff.figureBox(art, p);
    workers.forEach((w, i) => {
      assert.ok(!hit(marker, w), `${name} marker under worker ${i}`);
      assert.ok(!hit(det, w), `${name} detective overlaps worker ${i}`);
    });
    props.forEach((pb, i) => {
      assert.ok(!hit(marker, pb), `${name} marker under prop ${factory.floor.props[i].id}`);
      assert.ok(!hit(det, pb), `${name} figure hidden by prop ${factory.floor.props[i].id}`);
    });
    assert.ok(inField(det), name);
    factory.slots.forEach((s, i) => {
      const d = Math.hypot(p.x - s.x, (p.y - art.labelLift) - (s.y - art.labelLift));
      assert.ok(d >= 36, `${name} label within ${d.toFixed(1)} of worker ${i} label`);
    });
  }
  for (const id of ['grove', 'tower']) assert.equal(worldFor(id).stops, undefined);
});

test('exit_on_floor', () => {
  const door = factory.floor.props.find(p => p.id === 'exit-door');
  assert.ok(door);
  assert.deepEqual(factory.floor.exit, { x: door.x, y: door.y });
});

test('other_worlds_untouched', () => {
  for (const id of ['grove', 'tower', 'friends']) assert.equal(worldFor(id).figures, undefined);
});

test('every_shipped_prop_placed_once_clear_of_workers_and_stops', () => {
  const shipped = readdirSync(new URL('../public/assets/factory/props/', import.meta.url)).filter(f => f.endsWith('.png')).map(f => f.slice(0, -4)).sort();
  assert.deepEqual(factory.floor.props.map(p => p.id).sort(), shipped);
  const workers = factory.slots.map(s => ff.figureBox(art, s));
  const stops = Object.values(factory.stops).flatMap(p => [{ left: p.x - 15, top: p.y - 4.5, width: 30, height: 9 }, ff.figureBox(art, p)]);
  factory.floor.props.forEach(p => {
    const b = propBox(p);
    [...workers, ...stops].forEach(o => assert.ok(!hit(b, o), `${p.id} overlaps a worker or a stop`));
    factory.slots.forEach(s => assert.ok(!hit(b, { left: s.x - 30, top: s.y - art.labelLift - 8, width: 60, height: 16 }), `${p.id} under a name label`));
  });
});
