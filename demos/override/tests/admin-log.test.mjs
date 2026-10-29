import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as log from '../server/admin/log.js';

const catalog = [
  { id: 'banana-mystery', title: 'Banana', world: 'w', answer: ['pip'], characters: [{ id: 'pip', name: 'Pip' }, { id: 'momo', name: 'Momo' }] },
  { id: 'tower-echo-bell', title: 'Tower', world: 'w', answer: [], characters: [{ id: 'bell', name: 'Bell' }] },
];
const q = { id: 1, at: 1, sessionId: 's1', player: 's1', caseId: 'banana-mystery', kind: 'question', character: 'pip', text: 'Where were you?', ms: null, endpoint: null, failedOver: false, reason: null, verdict: null, elapsedMs: 65000 };

test('matches', () => {
  assert.equal(log.matches(q, { kinds: ['question', 'answer', 'failure'] }), true);
  assert.equal(log.matches(q, { text: 'WHERE' }), true);
  assert.equal(log.matches(q, { character: 'momo' }), false);
  assert.equal(log.matches(q, { sessionId: 's2' }), false);
  assert.equal(log.matches(q, { caseId: 'tower-echo-bell' }), false);
  assert.equal(log.matches(q, {}), true);
  assert.equal(log.matches({ ...q, kind: 'visit' }, { kinds: ['question'] }), false);
});

test('describe', () => {
  const a = { ...q, kind: 'answer', text: 'In the library.', ms: 2140, endpoint: 'a' };
  assert.deepEqual(log.describe(a, catalog), { who: 'Pip', arrow: '←', text: 'In the library.', meta: '2.1 s · a' });
  assert.deepEqual(log.describe({ ...q, kind: 'failure', text: null, reason: 'timeout' }, catalog), { who: 'Pip', arrow: '✕', text: '', meta: 'timeout' });
  assert.deepEqual(log.describe({ ...q, kind: 'failure', text: 'Where were you?', reason: 'timeout' }, catalog), { who: 'Pip', arrow: '✕', text: 'Where were you?', meta: 'timeout' });
  assert.equal(log.describe({ ...q, caseId: 'nope', character: 'zed' }, catalog).who, 'zed');
  assert.equal(log.describe(q, catalog).arrow, '→');
  const v = { ...q, kind: 'verdict', character: null, text: null, verdict: { suspect: 'none', confidence: 70, correct: true } };
  assert.equal(log.describe(v, catalog).text, 'Nobody · 70 % · correct');
  assert.ok(log.describe({ ...a, failedOver: true }, catalog).meta.endsWith(' · failover'));
});

// minimal fake DOM
class El {
  constructor(tag) { this.tag = tag; this.children = []; this.dataset = {}; this.listeners = {}; this._text = ''; this.className = ''; this.value = ''; this.hidden = false; this.style = {}; this.attrs = {}; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this._text = String(v); this.children = []; }
  append(...n) { for (const c of n) if (typeof c === 'string') this._text += c; else this.children.push(c); }
  appendChild(c) { this.children.push(c); return c; }
  prepend(c) { this.children.unshift(c); }
  replaceChildren(...n) { this._text = ''; this.children = []; this.append(...n); }
  remove() {}
  get lastChild() { return this.children.at(-1) ?? null; }
  removeChild(c) { this.children = this.children.filter((x) => x !== c); }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }
  fire(t, ev = {}) { return Promise.all((this.listeners[t] || []).map((f) => f({ target: this, preventDefault() {}, ...ev }))); }
  find(pred, out = []) { if (pred(this)) out.push(this); for (const c of this.children) c.find(pred, out); return out; }
}
const keys = [];
const doc = { createElement: (t) => new El(t), addEventListener: (t, f) => keys.push(f) };
const mk = () => { const r = new El('div'); r.ownerDocument = doc; return r; };
const byF = (root, f) => root.find((e) => e.dataset.filter === f)[0];
const rowsIn = (root) => root.find((e) => e.dataset.kind !== undefined);
const row = (i, extra = {}) => ({ ...q, id: i, kind: 'question', text: `msg ${i}`, ...extra });

test('encoding: attacker text stays text', () => {
  const root = mk(); const panel = mk();
  const l = log.createLog(root, { api: async () => ({}), panel });
  l.setCatalog(catalog);
  l.add([row(1, { text: '<img src=x onerror=window.__xss=1>' })]);
  const r = rowsIn(root);
  assert.equal(r.length, 1);
  assert.ok(r[0].textContent.includes('<img src=x onerror=window.__xss=1>'));
  assert.equal(r[0].innerHTML, undefined);
});

test('state: filters survive new rows, cap at 1000, frozen counts', async () => {
  const root = mk(); const panel = mk();
  const l = log.createLog(root, { api: async () => ({}), panel });
  l.setCatalog(catalog);
  byF(root, 'text').value = 'msg 5';
  await byF(root, 'text').fire('input');
  l.add([row(1), row(5), row(50)]);
  assert.equal(rowsIn(root).length, 2);
  assert.equal(byF(root, 'text').value, 'msg 5');
  l.add([row(2)]);
  assert.equal(rowsIn(root).length, 2);
  byF(root, 'text').value = '';
  await byF(root, 'text').fire('input');
  const rs = Array.from({ length: 1200 }, (_, i) => row(100 + i));
  l.add(rs);
  assert.equal(rowsIn(root).length, 1000);
  // newest first
  assert.ok(rowsIn(root)[0].textContent.includes('msg 1299'));
  const freeze = root.find((e) => e.dataset.action === 'freeze')[0];
  await freeze.fire('click');
  const n = root.find((e) => e.dataset.action === 'new')[0];
  l.add([row(9001), row(9002)]);
  assert.equal(rowsIn(root).length, 1000);
  assert.ok(!rowsIn(root)[0].textContent.includes('msg 9002'));
  assert.ok(n.textContent.startsWith('2 new'));
  await n.fire('click');
  assert.ok(rowsIn(root)[0].textContent.includes('msg 9002'));
});

test('player click opens panel with timeline and verdict; errors shown', async () => {
  const root = mk(); const panel = mk();
  const calls = [];
  let fail = false;
  const api = async (p) => { calls.push(p); if (fail) throw new Error('boom'); return { sessionId: 's1', rows: [q, { ...q, id: 2, kind: 'verdict', verdict: { suspect: 'pip', confidence: 80, correct: false }, elapsedMs: 90000 }] }; };
  const l = log.createLog(root, { api, panel });
  l.setCatalog(catalog);
  l.add([row(1)]);
  const p = root.find((e) => e.dataset.player === 's1')[0];
  await p.fire('click');
  assert.deepEqual(calls, ['/admin/sessions/s1']);
  assert.ok(panel.textContent.includes('Verdict'));
  assert.ok(panel.textContent.includes('01:05'));
  fail = true;
  await p.fire('click');
  assert.ok(panel.textContent.includes('boom'));
});

test('clock is wall-clock HH:MM:SS from at', () => {
  assert.equal(log.clock(Date.UTC(2026, 0, 1, 9, 5, 7), 'utc'), '09:05:07');
});

test('list rows show clock, not elapsed', () => {
  const root = mk();
  const l = log.createLog(root, { api: async () => ({}), panel: mk() });
  l.add([row(1, { at: 0, elapsedMs: 65000 })]);
  assert.ok(!rowsIn(root)[0].textContent.includes('01:05'));
});

test('panel keeps heading and close on error; Escape closes', async () => {
  const root = mk(); const panel = mk();
  const l = log.createLog(root, { api: async () => { throw new Error('No such session.'); }, panel });
  l.add([row(1)]);
  await root.find((e) => e.dataset.player === 's1')[0].fire('click');
  assert.ok(panel.textContent.includes('No such session.'));
  assert.ok(panel.textContent.includes('Player s1'));
  assert.equal(panel.find((e) => e.dataset.action === 'close-panel').length, 1);
  keys.forEach((f) => f({ key: 'Escape' }));
  assert.equal(panel.hidden, true);
});

test('stale panel response does not overwrite a newer player or a closed panel', async () => {
  const root = mk(); const panel = mk();
  const waits = {};
  const api = (p) => new Promise((res) => { waits[p] = res; });
  const l = log.createLog(root, { api, panel });
  l.setCatalog(catalog);
  l.add([row(1, { sessionId: 'aaaa1', player: 'a' }), row(2, { sessionId: 'bbbb2', player: 'b' })]);
  const pa = root.find((e) => e.dataset.player === 'aaaa1')[0];
  const pb = root.find((e) => e.dataset.player === 'bbbb2')[0];
  const first = pa.fire('click');
  const second = pb.fire('click');
  waits['/admin/sessions/bbbb2']({ rows: [{ ...q, text: 'NEWER' }] });
  await second;
  waits['/admin/sessions/aaaa1']({ rows: [{ ...q, text: 'OLDER' }] });
  await first;
  assert.ok(panel.textContent.includes('NEWER'));
  assert.ok(!panel.textContent.includes('OLDER'));
});

test('describe appends coins', () => {
  const base = { sessionId: 's', caseId: 'banana-mystery', character: 'pip', kind: 'chatter', text: 'hi', endpoint: null };
  assert.equal(log.describe({ ...base, cost: 1 }, []).meta, '1 coin');
  assert.equal(log.describe({ ...base, cost: 3 }, []).meta, '3 coins');
  assert.equal(log.describe({ ...base, cost: 0 }, []).meta, '');
  assert.equal(log.describe({ ...base, kind: 'answer', ms: 2100, endpoint: 'a', cost: 2 }, []).meta, '2.1 s · a · 2 coins');
  assert.equal(log.describe({ ...base }, []).meta, '');
});
