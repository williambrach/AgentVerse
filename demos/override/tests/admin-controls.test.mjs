import test from 'node:test';
import assert from 'node:assert/strict';
import { systemLine, renderControls } from '../server/admin/controls.js';

const fmt = () => '14:02';

test('systemLine examples', () => {
  assert.equal(systemLine({ type: 'llm_active', timestamp: '2026-10-29T14:02:00.000Z', active: 'b', pinned: true, from: 'a', by: 'admin', reason: 'a is slow' }, fmt), '14:02 endpoint a → b, pinned, by admin: a is slow');
  assert.equal(systemLine({ type: 'admin_action', timestamp: 1793030000000, action: 'cap', endpoint: null, value: 20 }, fmt), '14:02 cap all → 20');
  assert.equal(systemLine({ type: 'round_started', timestamp: 1793030000000, label: 'Session B' }, fmt), '14:02 round "Session B" started');
  assert.equal(systemLine({ type: 'admin_action', timestamp: 1, action: 'pause', paused: true }, fmt), '14:02 pause new games');
  assert.equal(systemLine({ type: 'admin_action', timestamp: 1, action: 'pause', paused: false }, fmt), '14:02 resume new games');
  assert.equal(systemLine({ type: 'admin_action', timestamp: 1, action: 'probe', endpoint: 'b', ok: false }, fmt), '14:02 probe b failed');
  assert.equal(systemLine({ type: 'x', timestamp: 1 }, fmt), '14:02 x');
});

// ---- tiny fake DOM
class El {
  constructor(tag, doc) { this.tag = tag; this.ownerDocument = doc; this.children = []; this.listeners = {}; this.className = ''; this._text = ''; this.dataset = {}; this.style = {}; this.hidden = false; this.disabled = false; }
  get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
  set textContent(v) { this._text = String(v); this.children = []; }
  appendChild(c) { this.children.push(c); c.parent = this; return c; }
  append(...cs) { cs.forEach(c => this.appendChild(c)); }
  removeChild(c) { this.children = this.children.filter(x => x !== c); }
  remove() { this.parent?.removeChild(this); }
  addEventListener(t, fn) { (this.listeners[t] ??= []).push(fn); }
  click() { return Promise.all((this.listeners.click ?? []).map(f => f({ target: this }))); }
  all(pred, out = []) { if (pred(this)) out.push(this); this.children.forEach(c => c.all(pred, out)); return out; }
  button(label) { return this.all(e => e.tag === 'button' && e.textContent === label); }
}
const doc = { createElement: (t) => new El(t, doc) };

const ep = (name, extra = {}) => ({ name, model: `m-${name}`, apiBaseHost: `${name}.test`, inFlight: 1, maxInFlight: 12, queued: 0, lastSuccessAt: 1, lastFailureAt: null, lastFailureReason: null, failures5m: 0, ...extra });
const snap = (over = {}) => ({
  router: { active: 'a', pinned: false, inFlight: 2, queued: 0, maxInFlight: 20, endpoints: [ep('a'), ep('b')] },
  sessions: { games: 5, waiting: 1, paused: false, byStage: { started: 1, clues: 1, interviewed: 1, verdict: 2 } },
  system: [{ type: 'round_started', timestamp: 1, label: 'first' }, { type: 'round_started', timestamp: 2, label: 'second' }],
  ...over,
});
const mk = () => {
  const calls = []; const root = new El('div', doc);
  const opts = { api: async (path, body) => { calls.push([path, body]); return { ok: true, endpoint: body.endpoint, durationMs: 5 }; }, prompt: () => 'because', fmt };
  return { root, calls, opts };
};

test('session stats line says what it is', async () => {
  const { root, opts } = mk();
  renderControls(root, snap(), opts);
  assert.match(root.textContent, /In memory \(last 30 min\): 5 games · 1 waiting for an answer · accepting new games · by stage: started 1, clues 1, interviewed 1, verdict 2/);
  renderControls(root, snap({ sessions: { games: 5, waiting: 1, paused: true, byStage: {} } }), opts);
  assert.match(root.textContent, /new games paused/);
  assert.equal(root.all(e => e.className.includes('ctl-paused')).length, 1);
});

test('rehearsal text and no endpoint rows', () => {
  const { root, opts } = mk();
  renderControls(root, snap({ router: null }), opts);
  assert.match(root.textContent, /Live LLM mode is off \(rehearsal\)\./);
  assert.equal(root.button('Probe').length, 0);
});

test('actions post the frozen protocol', async () => {
  const { root, calls, opts } = mk();
  renderControls(root, snap(), opts);
  await root.button('Move + pin')[1].click();
  assert.deepEqual(calls.at(-1), ['/admin/llm/active', { endpoint: 'b', pinned: true, reason: 'because' }]);
  await root.button('Probe')[0].click();
  assert.deepEqual(calls.at(-1), ['/admin/llm/probe', { endpoint: 'a' }]);
  opts.prompt = () => '7';
  await root.button('Cap')[1].click();
  assert.deepEqual(calls.at(-1), ['/admin/llm/cap', { endpoint: 'b', value: 7 }]);
  await root.button('Cap all')[0].click();
  assert.deepEqual(calls.at(-1), ['/admin/llm/cap', { endpoint: null, value: 7 }]);
  await root.button('Pause new games')[0].click();
  assert.deepEqual(calls.at(-1), ['/admin/sessions/pause', { paused: true }]);
});

test('invalid cap sends nothing; cancelled reason sends nothing', async () => {
  const { root, calls, opts } = mk();
  renderControls(root, snap(), opts);
  opts.prompt = () => 'abc';
  await root.button('Cap')[0].click();
  assert.match(root.textContent, /whole number/);
  opts.prompt = () => null;
  await root.button('Move + pin')[1].click();
  assert.equal(calls.length, 0);
});

test('rerender keeps the same button elements and shows unpin / resume', async () => {
  const { root, calls, opts } = mk();
  renderControls(root, snap(), opts);
  const probe = root.button('Probe')[0];
  renderControls(root, snap({ router: { active: 'b', pinned: true, inFlight: 0, queued: 0, maxInFlight: 20, endpoints: [ep('a'), ep('b')] }, sessions: { games: 0, waiting: 0, paused: true, byStage: {} } }), opts);
  assert.equal(root.button('Probe')[0], probe);
  assert.equal(root.button('Unpin').length, 1);
  await root.button('Resume new games')[0].click();
  assert.deepEqual(calls.at(-1), ['/admin/sessions/pause', { paused: false }]);
  await root.button('Unpin')[0].click();
  assert.deepEqual(calls.at(-1), ['/admin/llm/active', { endpoint: 'b', pinned: false, reason: 'because' }]);
});

test('errors land in the result line; system newest first; text only', async () => {
  const { root, opts } = mk();
  opts.api = async () => { throw new Error('<b>nope</b>'); };
  const s = snap();
  s.router.endpoints[0].lastFailureReason = '<img src=x>'; s.router.endpoints[0].lastFailureAt = 5;
  renderControls(root, s, opts);
  await root.button('Probe')[0].click();
  assert.match(root.textContent, /<b>nope<\/b>/);
  assert.match(root.textContent, /<img src=x>/);
  const t = root.textContent;
  assert.ok(t.indexOf('"second"') < t.indexOf('"first"'));
  assert.ok(!root.all(e => e.innerHTML !== undefined).length);
});
