import test from 'node:test';
import assert from 'node:assert/strict';
import { fitRoom, seats, table, onTabletop, tabletop, tablePoint, farEdge, chairs, TILT, ROOM, DEPTH } from '../client/roundtable-layout.ts';

test('known_fits', () => {
  assert.deepEqual(fitRoom(1440, 900, 252, false), { width: 1552, height: 970, offsetX: 272, offsetY: 125, scale: 0.928125 });
  assert.deepEqual(fitRoom(1920, 1080, 252, false), { width: 1473, height: 829, offsetX: 193, offsetY: 55, scale: 1.303125 });
  assert.deepEqual(fitRoom(2560, 900, 252, false), { width: 2048, height: 720, offsetX: 485, offsetY: 0, scale: 1.25 });
  assert.deepEqual(fitRoom(800, 600, 252, true), { width: 1280, height: 720, offsetX: 0, offsetY: 0, scale: 0.625 });
});

test('fit_room_right_of_rail', () => {
  for (const [w, h] of [[1440, 900], [1920, 1080], [2560, 900], [1000, 1200], [1366, 768]]) {
    const l = fitRoom(w, h, 252, false);
    assert.ok(l.offsetX * l.scale >= 252 - 1, `${w}x${h}`);
    assert.ok(l.offsetX + ROOM.width <= l.width + 1 && l.offsetY + ROOM.height <= l.height + 1);
  }
});

test('seat_order_and_layers', () => {
  assert.deepEqual(seats().map(s => s.actor), ['maya', 'ken', 'alex', 'nora', 'player', 'sam']);
  assert.deepEqual(seats().filter(s => s.layer === 'near').map(s => s.actor), ['player', 'sam']);
});

test('table_dominates', () => {
  const t = table();
  assert.deepEqual(t, { x: 140, y: 250, width: 1000, height: 1000 * 941 / 1672, depth: 30 });
  assert.ok(t.width >= 0.7 * ROOM.width);
  assert.ok(Math.abs(t.width / t.height / (1672 / 941) - 1) < 0.001);
});

// Tabletop ellipse in room pixels (sprite centre 836,375 radii 828,362 in a 1672x941 image).
const ellipse = () => { const t = table(), k = t.width / 1672; return { cx: t.x + 836 * k, cy: t.y + 375 * k, rx: 828 * k, ry: 362 * k }; };

test('far_seats_behind_table', () => {
  const e = ellipse();
  for (const s of seats().filter(s => s.layer === 'far')) {
    assert.ok(s.depth < DEPTH.table, s.actor);
    const dx = (s.x - e.cx) / e.rx;
    const top = dx * dx >= 1 ? e.cy : e.cy - e.ry * Math.sqrt(1 - dx * dx);
    assert.ok(s.y > top, `${s.actor} anchor below ellipse top`);
    assert.ok(s.y - (282 - 18) * s.scale >= 90, `${s.actor} head top`);
  }
});

test('near_seats_in_front_not_on_top', () => {
  for (const s of seats().filter(s => s.layer === 'near')) {
    assert.ok(s.depth > DEPTH.table, s.actor);
    assert.equal(onTabletop(s.x, s.y), false, s.actor);
  }
});

test('on_tabletop', () => {
  assert.equal(onTabletop(640, 474), true);
  assert.equal(onTabletop(170, 700), false);
  assert.equal(onTabletop(0, 0), false);
});

test('depth_order', () => {
  assert.ok(DEPTH.backdrop < DEPTH.farChair && DEPTH.farChair < DEPTH.far && DEPTH.far < DEPTH.table && DEPTH.table < DEPTH.nearChair && DEPTH.nearChair < DEPTH.near);
  assert.deepEqual(ROOM, { width: 1280, height: 720 });
});

test('fit_room_degenerate_windows_stay_finite', () => {
  for (const args of [[0, 0, 252, false], [100, 600, 252, false], [252, 600, 252, false], [0, 500, 0, true], [NaN, 700, 252, false], [800, 600, -5, false]]) {
    const l = fitRoom(...args);
    for (const k of ['width', 'height', 'offsetX', 'offsetY', 'scale']) assert.ok(Number.isFinite(l[k]) && l[k] >= 0, `${args} ${k}`);
    assert.ok(l.scale > 0, `${args}`);
  }
});

test('table plane: points map onto the tabletop, the far edge is its top', () => {
  const e = tabletop();
  assert.ok(Math.abs(TILT - 362 / 828) < 1e-9);
  assert.deepEqual(tablePoint(0, 0), { x: e.cx, y: e.cy });
  for (const [u, v] of [[0.5, 0.5], [-0.7, 0.14], [0.17, -0.64], [0, -0.99]]) { const p = tablePoint(u, v); assert.ok(onTabletop(p.x, p.y), `${u},${v}`); }
  assert.ok(Math.abs(farEdge(e.cx) - (e.cy - e.ry)) < 1e-9);
  for (const x of [300, 640, 900]) { assert.ok(onTabletop(x, farEdge(x) + 1)); assert.ok(!onTabletop(x, farEdge(x) - 1)); }
  assert.equal(farEdge(e.cx - e.rx - 50), e.cy);
});

test('chairs: far ones behind their friend and the table, near ones under the near friend', () => {
  const byActor = Object.fromEntries(seats().map(s => [s.actor, s]));
  const list = chairs();
  assert.deepEqual(list.map(c => c.actor).sort(), seats().map(s => s.actor).sort());
  for (const c of list) {
    const s = byActor[c.actor];
    if (s.layer === 'far') {
      assert.equal(c.image, 'chair-front');
      assert.ok(c.depth < s.depth && c.depth < DEPTH.table, c.actor);
      assert.ok(Math.abs(c.x - s.x) <= 20, `${c.actor} chair centred under the friend`);
      // The back rises above the table's far edge, so it shows at the shoulders.
      const top = c.y - c.width * 236 / 170;
      assert.ok(top < farEdge(c.x) - 30, `${c.actor} chair back visible`);
      // Its seat and legs stay hidden: the bottom, at both of its sides, is behind the tabletop.
      for (const x of [c.x - c.width / 2, c.x, c.x + c.width / 2]) assert.ok(c.y > farEdge(x) && onTabletop(x, c.y - 1), `${c.actor} chair bottom shows at x ${x}`);
    } else {
      assert.ok(c.depth > DEPTH.table && c.depth < s.depth, c.actor);
      assert.equal(c.image, c.actor === 'player' ? 'chair-left' : 'chair-right');
      // Each near chair is scaled like its sitter, so the rig's legs (the player's legs at Sam's scale) still fit the seat.
      assert.ok(Math.abs(c.width / s.scale - 190 / byActor.player.scale) <= 1, `${c.actor} chair scale`);
    }
  }
});

test('near friends sit on the same floor line', () => {
  const near = seats().filter(s => s.layer === 'near');
  assert.equal(new Set(near.map(s => s.y)).size, 1);
});
