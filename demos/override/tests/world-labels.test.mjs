import test from 'node:test';
import assert from 'node:assert/strict';
import * as m from '../client/world-labels.ts';

const B = { w: 480, h: 340 };
test('emphasis_examples', () => {
  assert.equal(m.labelEmphasis('ottavio', { near: null, hovered: 'ottavio', active: null }), 'strong');
  assert.equal(m.labelEmphasis('bruno', { near: 'ottavio', hovered: null, active: null }), 'subtle');
});
test('layout_examples', () => {
  assert.deepEqual(m.layoutLabels([{ id: 'a', x: 100, y: 50, w: 40, h: 8 }, { id: 'b', x: 110, y: 52, w: 40, h: 8 }], B),
    { a: { x: 100, y: 50 }, b: { x: 110, y: 40 } });
  assert.deepEqual(m.layoutLabels([{ id: 'c', x: 5, y: 100, w: 40, h: 8 }], B), { c: { x: 22, y: 100 } });
  assert.deepEqual(m.layoutLabels([], B), {});
});
test('no_overlap_five', () => {
  const boxes = 'abcde'.split('').map(id => ({ id, x: 200, y: 200, w: 40, h: 8 }));
  const r = m.layoutLabels(boxes, B, 2);
  const ids = Object.keys(r);
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = r[ids[i]], b = r[ids[j]];
    assert.ok(Math.abs(a.y - b.y) >= 8 + 2 || Math.abs(a.x - b.x) >= 40 + 2, `${ids[i]} ${ids[j]}`);
    assert.ok(Number.isFinite(a.x) && Number.isFinite(a.y));
  }
});
test('top_edge_pushes_down', () => {
  const r = m.layoutLabels([{ id: 'a', x: 100, y: 8, w: 40, h: 8 }, { id: 'b', x: 100, y: 8, w: 40, h: 8 }], B, 2);
  assert.ok(r.b.y > r.a.y);
  assert.ok(r.b.y - r.a.y >= 10);
});
test('deterministic', () => {
  const boxes = 'abcd'.split('').map((id, i) => ({ id, x: 100 + i, y: 30, w: 40, h: 8 }));
  assert.deepEqual(m.layoutLabels(boxes, B), m.layoutLabels(boxes, B));
});
test('strong_when_active_or_near', () => {
  assert.equal(m.labelEmphasis('x', { near: 'x', hovered: null, active: null }), 'strong');
  assert.equal(m.labelEmphasis('x', { near: null, hovered: null, active: 'x' }), 'strong');
  assert.equal(m.labelEmphasis('x', { near: null, hovered: null, active: null }), 'subtle');
});
test('stays_in_bounds_and_nan_safe', () => {
  const boxes = 'abcdefghij'.split('').map(id => ({ id, x: 100, y: 330, w: 40, h: 30 }));
  const r = m.layoutLabels(boxes, B, 2);
  for (const id of Object.keys(r)) assert.ok(r[id].y >= 17 && r[id].y <= 340 - 17, id);
  const n = m.layoutLabels([{ id: 'n', x: NaN, y: Infinity, w: 40, h: 8 }], B);
  assert.ok(Number.isFinite(n.n.x) && Number.isFinite(n.n.y));
});
