import test from 'node:test';
import assert from 'node:assert/strict';
import { strollAt, STROLL_SPEED } from '../client/figure-motion.ts';
import { worldFor } from '../client/worlds.ts';
import { inWalk } from '../client/hall-layout.ts';

const home = { x: 100, y: 200 };
const route = [{ x: 128, y: 200 }, { x: 72, y: 200 }];

test('strollAt: no route or bad time stays home with the slot facing', () => {
  assert.deepEqual(strollAt(5000, .3, home, []), { x: 100, y: 200, walking: false, distance: 0, left: null });
  assert.deepEqual(strollAt(NaN, .3, home, route), { x: 100, y: 200, walking: false, distance: 0, left: null });
  assert.deepEqual(strollAt(-1, .3, home, route), { x: 100, y: 200, walking: false, distance: 0, left: null });
});

test('strollAt: rests at home for at least 6 s first', () => {
  for (const seed of [0, .2, .5, .9]) for (let ms = 0; ms < 6000; ms += 250) {
    const s = strollAt(ms, seed, home, route);
    assert.equal(s.walking, false);
    assert.deepEqual([s.x, s.y], [100, 200]);
  }
});

test('strollAt: walks out, lingers, walks back, and visits every point, facing the way it goes', () => {
  const seen = new Set();
  let walked = false, prev = null;
  for (let ms = 0; ms < 120000; ms += 50) {
    const s = strollAt(ms, .4, home, route);
    // Never off the segment between home and a route point.
    assert.equal(s.y, 200);
    assert.ok(s.x >= 72 && s.x <= 128, `${s.x}`);
    if (s.walking) {
      walked = true;
      assert.ok(s.distance >= 0 && s.distance <= 28.0001);
      if (prev?.walking && prev.left === s.left && Math.abs(s.x - prev.x) > 1e-9) assert.equal(s.left, s.x < prev.x, `faces travel at ${ms}`);
    } else if (s.x !== 100) {
      seen.add(s.x);
    }
    // Continuous: at 14 units/s a 50 ms tick moves under 1 unit.
    if (prev) assert.ok(Math.hypot(s.x - prev.x, s.y - prev.y) <= STROLL_SPEED * .05 + 1e-9, `jump at ${ms}`);
    prev = s;
  }
  assert.ok(walked);
  assert.deepEqual([...seen].sort((a, b) => a - b), [72, 128]);
});

test('strollAt: repeatable for a seed, different seeds keep different timing', () => {
  assert.deepEqual(strollAt(23456, .1, home, route), strollAt(23456, .1, home, route));
  const a = [], b = [];
  for (let ms = 0; ms < 60000; ms += 500) { a.push(strollAt(ms, .1, home, route).x); b.push(strollAt(ms, .7, home, route).x); }
  assert.notDeepEqual(a, b);
});

test('castelvento routes: every point on open ground, clear of the rail, props and other routes, and the approach below it open', () => {
  const w = worldFor('renaissance');
  const props = w.scenery.props.map(p => ({ x: p.x - p.foot.w / 2, y: p.y - p.foot.h, w: p.foot.w, h: p.foot.h }));
  const hits = (r, box) => r.x < box.x + box.w && r.x + r.w > box.x && r.y < box.y + box.h && r.y + r.h > box.y;
  // A figure's and the detective's feet are 12 x 8 units.
  const feet = p => ({ x: p.x - 6, y: p.y - 8, w: 12, h: 8 });
  const routes = w.slots.map(s => s.route ?? []);
  assert.ok(routes.every(r => r.length >= 1), 'every townsperson strolls');
  routes.forEach((route, i) => {
    const s = w.slots[i];
    for (const p of route) {
      // Sample the walk both ways along the segment.
      for (let k = 0; k <= 1.0001; k += .1) {
        const q = { x: s.x + (p.x - s.x) * k, y: s.y + (p.y - s.y) * k };
        assert.ok(inWalk(w.walk, q), `${i} ${JSON.stringify(q)}`);
        assert.ok(q.x >= 100, `rail ${i}`);
        for (const box of props) assert.ok(!hits(feet(q), box), `${i} walks through a prop at ${JSON.stringify(q)}`);
      }
      const approach = { x: p.x, y: p.y + 14 };
      assert.ok(inWalk(w.walk, approach), `${i} approach`);
      for (const box of props) assert.ok(!hits(feet(approach), box), `${i} approach blocked by a prop`);
    }
  });
  // No two townspeople ever come within 30 units, wherever along their routes.
  const spots = routes.map((route, i) => [w.slots[i], ...route]);
  for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) {
    for (const a of spots[i]) for (const b of spots[j]) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 30, `${i} ${j}`);
  }
});

test('castelvento facings are mixed: Ottavio and Agnese face each other', () => {
  const w = worldFor('renaissance');
  const flips = w.slots.map(s => s.flip === true);
  assert.ok(flips.includes(true) && flips.includes(false));
  assert.equal(flips[0], false, 'Ottavio faces right, toward Agnese');
  assert.equal(flips[4], true, 'Agnese faces left, toward Ottavio');
  assert.equal(w.figures.chill, true);
});
