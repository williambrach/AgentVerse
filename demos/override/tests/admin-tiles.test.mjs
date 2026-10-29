import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as tiles from '../server/admin/tiles.js';

// Minimal fake DOM, enough for the render functions.
class El {
  constructor(tag, doc) { this.tagName = tag; this.ownerDocument = doc; this.children = []; this.attrs = {}; this.dataset = {}; this.style = {}; this.className = ''; this._text = ''; doc.created++; }
  appendChild(c) { this.children.push(c); c.parent = this; return c; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
}
function makeDoc() {
  const doc = { created: 0 };
  doc.createElement = (t) => new El(t, doc);
  doc.createElementNS = (_ns, t) => new El(t, doc);
  doc.root = () => doc.createElement('div');
  return doc;
}
const find = (el, pred, out = []) => { if (pred(el)) out.push(el); el.children.forEach((c) => find(c, pred, out)); return out; };

const snap = (over = {}) => ({
  at: 0, mode: 'live', round: { label: null, startedAt: 0 },
  players: { online: 100, onlineInGame: 60, onlineBoard: 40, playing: 55, round: 90, finished: 30 },
  ...over,
  traffic: { reqPerSec: 12, share4xx: 0, share5xx: 0, share429: 0, questionsPerMin: 40, answerP95Ms: 3210, llmErrorRate: 0.004, queue: 0, inFlight: 1, cap: 8, active: 'a', pinned: null, loopP99Ms: 20, rssBytes: 180e6, diskFreeBytes: 52e9, writeFailures5m: 0, failoverAt: null, credentialsRejected5m: 0, ...(over.traffic || {}) },
  history: over.history || [],
});

test('levelOf examples and boundaries', () => {
  const L = tiles.levelOf;
  assert.equal(L('llmErrorRate', 0.25, 0), 'bad');
  assert.equal(L('queue', 11, 0), 'warn');
  assert.equal(L('diskFreeBytes', 4e9, 0), 'warn');
  assert.equal(L('llmErrorRate', 0.05, 0), 'ok');
  assert.equal(L('llmErrorRate', 0.0501, 0), 'warn');
  assert.equal(L('llmErrorRate', 0.2, 0), 'warn');
  assert.equal(L('llmErrorRate', 0.2001, 0), 'bad');
  assert.equal(L('queue', 50, 0), 'warn');
  assert.equal(L('queue', 51, 0), 'bad');
  assert.equal(L('answerP95Ms', null, 0), 'ok');
  assert.equal(L('failoverAt', 1e6 - 60_000, 1e6), 'warn');
  assert.equal(L('failoverAt', 1e6 - 301_000, 1e6), 'ok');
  assert.equal(L('failoverAt', null, 1e6), 'ok');
  assert.equal(L('writeFailures5m', 1, 0), 'bad');
  assert.equal(L('writeFailures5m', 0, 0), 'ok');
  assert.equal(L('diskFreeBytes', 5e9, 0), 'ok');
  assert.equal(L('diskFreeBytes', 0.9e9, 0), 'bad');
  assert.equal(L('answerP95Ms', 8000, 0), 'ok');
  assert.equal(L('answerP95Ms', 8001, 0), 'warn');
  assert.equal(L('loopP99Ms', 501, 0), 'bad');
  assert.equal(L('credentialsRejected5m', 2, 0), 'bad');
  assert.equal(L('unknownKey', 5, 0), 'ok');
  assert.equal(L('queue', NaN, 0), 'ok');
});

test('format', () => {
  const F = tiles.format;
  assert.equal(F('answerP95Ms', 3210), '3.2 s');
  assert.equal(F('answerP95Ms', 450), '450 ms');
  assert.equal(F('llmErrorRate', 0.004), '0.4 %');
  assert.equal(F('llmErrorRate', 0), '0 %');
  assert.equal(F('diskFreeBytes', 52e9), '52 GB');
  assert.equal(F('diskFreeBytes', 4.5e9), '4.5 GB');
  assert.equal(F('rssBytes', 180e6), '180 MB');
  assert.equal(F('queue', 7), '7');
  assert.equal(F('answerP95Ms', null), '–');
  assert.equal(F('queue', undefined), '–');
  assert.equal(F('rssBytes', NaN), '–');
});

test('renderTiles returns worst level and sets data-level in place', () => {
  const doc = makeDoc(); const root = doc.root();
  assert.equal(tiles.renderTiles(root, snap()), 'ok');
  const n = doc.created;
  const tilesEls = find(root, (e) => e.dataset.level !== undefined);
  assert.ok(tilesEls.length >= 8);
  assert.equal(tiles.renderTiles(root, snap({ traffic: { queue: 11 } })), 'warn');
  assert.equal(tiles.renderTiles(root, snap({ traffic: { queue: 11, writeFailures5m: 2 } })), 'bad');
  assert.equal(doc.created, n, 'no nodes rebuilt');
  assert.ok(find(root, (e) => e.textContent === '52 GB').length >= 1);
});

test('renderPlayers shows the numbers', () => {
  const doc = makeDoc(); const root = doc.root();
  tiles.renderPlayers(root, snap());
  const t = root.textContent;
  for (const s of ['100', '60', '40', '55', '90', '30']) assert.ok(t.includes(s), s);
  const n = doc.created;
  tiles.renderPlayers(root, snap({ players: { online: 5, onlineInGame: 3, onlineBoard: 2, playing: 1, round: 7, finished: 0 } }));
  assert.equal(doc.created, n);
  assert.ok(root.textContent.includes('7'));
});

test('sparkPoints numeric edges', () => {
  assert.equal(tiles.sparkPoints([], 100, 20), '');
  assert.equal(tiles.sparkPoints([0, 0], 100, 20), '0,20 100,20');
  assert.equal(tiles.sparkPoints([5], 100, 20), '0,0');
  assert.equal(tiles.sparkPoints([0, 10, null], 100, 20), '0,20 50,0 100,20');
});

test('renderHistory draws five sparklines with SVG, last value as text', () => {
  const doc = makeDoc(); const root = doc.root();
  const history = [{ at: 1, online: 1, questions: 2, failures: 0, p95Ms: 1000, reqs: 5 }, { at: 2, online: 4, questions: 6, failures: 1, p95Ms: null, reqs: 9 }];
  tiles.renderHistory(root, snap({ history }));
  assert.equal(find(root, (e) => e.tagName === 'svg').length, 5);
  assert.equal(find(root, (e) => e.tagName === 'polyline').length, 5);
  const n = doc.created;
  tiles.renderHistory(root, snap({ history: history.concat([{ at: 3, online: 7, questions: 1, failures: 0, p95Ms: 2500, reqs: 3 }]) }));
  assert.equal(doc.created, n);
  assert.ok(root.textContent.includes('2.5 s'));
  tiles.renderHistory(root, snap({ history: [] }));
  assert.ok(root.textContent.includes('–'));
});

test('module never uses innerHTML', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../server/admin/tiles.js', import.meta.url), 'utf8');
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|setAttribute\('style'/.test(src));
});

test('labels, failover text and units', () => {
  const doc = makeDoc(); const root = doc.root(); const h = doc.root(); const p = doc.root();
  tiles.renderPlayers(p, snap());
  assert.ok(p.textContent.includes('Games finished'));
  tiles.renderHistory(h, snap());
  for (const l of ['Online (peak)', 'Questions / min', 'Failures / min', 'Answer p95', 'Requests / min']) assert.ok(h.textContent.includes(l), l);
  tiles.renderTiles(root, snap());
  assert.ok(root.textContent.includes('none'));
  tiles.renderTiles(root, snap({ at: 1_000_000, traffic: { failoverAt: 1_000_000 - 130_000 } }), { timeFormat: () => '09:15' });
  assert.ok(root.textContent.includes('09:15 (2 min ago)'));
});
