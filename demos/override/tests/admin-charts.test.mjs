import { test } from 'node:test';
import assert from 'node:assert/strict';
import { niceTicks, renderChart } from '../server/admin/charts.js';

class El {
  constructor(tag, doc) { this.tagName = tag; this.ownerDocument = doc; this.children = []; this.attrs = {}; this.dataset = {}; this.style = {}; this.className = ''; this._text = ''; this.handlers = {}; }
  appendChild(c) { this.children.push(c); c.parent = this; return c; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  addEventListener(n, f) { this.handlers[n] = f; }
  getBoundingClientRect() { return { left: 100, width: 200 }; }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
}
const doc = { createElement: (t) => new El(t, doc), createElementNS: (_n, t) => new El(t, doc) };
const root = () => doc.createElement('div');
const find = (el, pred, out = []) => { if (pred(el)) out.push(el); el.children.forEach((c) => find(c, pred, out)); return out; };
const cls = (el, c) => find(el, (e) => (e.className || e.attrs.class || '').split(' ').includes(c));
const spec = (over = {}) => ({ title: 'Questions / min', series: [{ key: 'q', label: 'questions', points: [[0, 1], [1000, 3]] }], range: [0, 1000], format: String, ...over });

test('niceTicks examples', () => {
  assert.deepEqual(niceTicks(0, 187), [0, 50, 100, 150, 200]);
  assert.deepEqual(niceTicks(0, 0), [0, 1]);
});

test('basic render and level', () => {
  const r = root();
  assert.equal(renderChart(r, spec()), 'ok');
  assert.equal(cls(r, 'chart-title')[0].textContent, 'Questions / min');
  assert.equal(cls(r, 'chart-value')[0].textContent, '3');
  assert.equal(renderChart(r, spec({ thresholds: { warn: 2, bad: 10 } })), 'warn');
  assert.equal(r.dataset.level, 'warn');
  assert.equal(renderChart(r, spec({ thresholds: { warn: 1, bad: 2 } })), 'bad');
  assert.equal(cls(r, 'chart-xlabel').length, 4);
});

test('test_updates_in_place', () => {
  const r = root();
  renderChart(r, spec());
  const svg = find(r, (e) => e.tagName === 'svg')[0];
  const line = cls(r, 'chart-line')[0];
  renderChart(r, spec({ series: [{ key: 'q', label: 'q', points: [[0, 5], [1000, 9]] }] }));
  assert.equal(find(r, (e) => e.tagName === 'svg').length, 1);
  assert.equal(find(r, (e) => e.tagName === 'svg')[0], svg);
  assert.equal(cls(r, 'chart-line')[0], line);
  assert.equal(cls(r, 'chart-value')[0].textContent, '9');
});

test('test_empty_series', () => {
  const r = root();
  renderChart(r, spec({ series: [{ key: 'q', label: 'q', points: [] }] }));
  assert.equal(cls(r, 'chart-value')[0].textContent, '–');
  renderChart(r, spec({ series: [] , range: [5, 5] }));
  for (const e of find(r, () => true)) for (const v of Object.values(e.attrs)) assert.ok(!/NaN|Infinity|undefined/.test(v), v);
  assert.equal(r.dataset.level, 'ok');
});

test('test_y_axis_starts_at_zero', () => {
  const r = root();
  renderChart(r, spec({ series: [{ key: 'q', label: 'q', points: [[0, 40], [1000, 60]] }] }));
  const labels = cls(r, 'chart-ylabel').map((e) => e.textContent);
  assert.equal(labels[0], '0');
  assert.deepEqual(niceTicks(0, 60)[0], 0);
});

test('test_threshold_lines', () => {
  const r = root();
  renderChart(r, spec({ thresholds: { warn: 2, bad: 100 } }));
  assert.equal(cls(r, 'chart-threshold-warn').length, 1);
  assert.equal(cls(r, 'chart-threshold-bad').length, 0);
  assert.equal(cls(r, 'chart-threshold-warn')[0].attrs['stroke-dasharray'], '3 2');
  renderChart(r, spec({ thresholds: { warn: null, bad: null } }));
  assert.equal(cls(r, 'chart-threshold').length, 0);
});

test('test_hover', () => {
  const r = root();
  renderChart(r, spec({ format: (v) => `${v} q` }));
  const svg = find(r, (e) => e.tagName === 'svg')[0];
  svg.handlers.pointermove({ clientX: 300 }); // right edge = t 1000
  const tip = cls(r, 'chart-tip')[0].textContent;
  assert.match(tip, /3 q/);
  assert.match(tip, /\d\d:\d\d:\d\d/);
  svg.handlers.pointerleave();
  assert.equal(cls(r, 'chart-tip')[0].style.display, 'none');
});

test('test_text_only', () => {
  const r = root();
  renderChart(r, spec({ title: '<b>x</b>' }));
  assert.equal(cls(r, 'chart-title')[0].textContent, '<b>x</b>');
  assert.equal(find(r, (e) => e.tagName === 'b').length, 0);
});

test('render keeps the caller classes and adds chart once', () => {
  const r = root();
  r.className = 'chart-cell';
  renderChart(r, spec());
  assert.deepEqual(r.className.split(' ').sort(), ['chart', 'chart-cell']);
  renderChart(r, spec());
  assert.equal(r.className.split(' ').filter((c) => c === 'chart').length, 1);
  assert.ok(r.className.split(' ').includes('chart-cell'));
});
