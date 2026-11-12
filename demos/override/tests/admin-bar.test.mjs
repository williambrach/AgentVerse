import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBar } from '../server/admin/bar.js';

class El {
  constructor(tag, doc) { this.tag = tag; this.ownerDocument = doc; this.children = []; this.listeners = {}; this.className = ''; this._text = ''; this.hidden = false; this.disabled = false; this.style = {}; this.value = ''; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this._text = String(v); this.children = []; }
  appendChild(c) { this.children.push(c); return c; }
  addEventListener(t, f) { (this.listeners[t] ??= []).push(f); }
  fire(t) { return Promise.all((this.listeners[t] ?? []).map((f) => f({ target: this }))); }
  all(pred, out = []) { if (pred(this)) out.push(this); this.children.forEach((c) => c.all(pred, out)); return out; }
  cls(c) { return this.all((e) => e.className.split(' ').includes(c))[0]; }
  button(label) { return this.all((e) => e.tag === 'button' && e.textContent === label)[0]; }
}
const doc = { createElement: (t) => new El(t, doc) };
const snap = (over = {}) => ({ at: 120000, round: { label: 'R1', startedAt: 0, endedAt: null }, sessions: { paused: false }, router: { active: 'a', pinned: false, endpoints: [{ name: 'a' }, { name: 'b' }] }, ...over });
const mk = (o = {}) => {
  const calls = [];
  const root = new El('div', doc);
  const opts = { api: async (p, b) => { calls.push([p, b]); return {}; }, prompt: () => 'RESET', confirm: () => true, ...o };
  const bar = createBar(root, opts);
  bar.update(snap());
  return { root, calls, bar, opts };
};

test('shows round, buttons and endpoint', () => {
  const { root } = mk();
  assert.match(root.textContent, /R1 · 2 min/);
  assert.equal(root.button('End round').hidden, false);
  assert.ok(root.button('Pause new games'));
  assert.equal(root.cls('bar-select').value, 'a');
});

test('ended round hides End round, keeps Start round', () => {
  const { root, bar } = mk();
  bar.update(snap({ round: { label: 'R1', startedAt: 0, endedAt: 5 } }));
  assert.match(root.textContent, /R1 · ended, final standings/);
  assert.equal(root.button('End round').hidden, true);
  assert.equal(root.button('Start round').hidden, false);
});

test('test_reset_needs_typed_word', async () => {
  const asked = [];
  const { root, calls, opts } = mk({ prompt: (m) => { asked.push(m); return 'reset'; } });
  await root.button('Reset event').fire('click');
  assert.equal(calls.length, 0);
  assert.equal(root.cls('bar-msg').textContent, 'Reset cancelled');
  assert.equal(asked[0], 'Type RESET to clear all teams and start a new round');
  opts.prompt = () => 'RESET';
  await root.button('Reset event').fire('click');
  assert.deepEqual(calls, [['/admin/event/reset', { confirm: 'RESET' }]]);
});

test('test_end_round_confirms', async () => {
  const { root, calls, opts } = mk({ confirm: () => false });
  await root.button('End round').fire('click');
  assert.equal(calls.length, 0);
  opts.confirm = () => true;
  await root.button('End round').fire('click');
  assert.deepEqual(calls, [['/admin/round/end', {}]]);
});

test('test_pause_toggles', async () => {
  const { root, calls, bar } = mk();
  await root.button('Pause new games').fire('click');
  assert.deepEqual(calls.at(-1), ['/admin/sessions/pause', { paused: true }]);
  bar.update(snap({ sessions: { paused: true } }));
  await root.button('Resume new games').fire('click');
  assert.deepEqual(calls.at(-1), ['/admin/sessions/pause', { paused: false }]);
});

test('test_endpoint_switch', async () => {
  const { root, calls } = mk({ prompt: () => 'a is slow' });
  const sel = root.cls('bar-select');
  sel.value = 'b';
  await sel.fire('change');
  assert.deepEqual(calls, [['/admin/llm/active', { endpoint: 'b', pinned: true, reason: 'a is slow' }]]);
});

test('test_rehearsal_mode', () => {
  const { root, bar } = mk();
  bar.update(snap({ router: null }));
  assert.equal(root.cls('bar-endpoint').hidden, true);
});

test('test_error_shown', async () => {
  const { root } = mk({ api: async () => { throw new Error('boom'); } });
  await root.button('Pause new games').fire('click');
  assert.equal(root.cls('bar-msg').textContent, 'Error: boom');
});

test('module never uses innerHTML or import-time globals', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../server/admin/bar.js', import.meta.url), 'utf8');
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML/.test(src));
});

test('update works when select.children is a non-array collection (HTMLCollection)', () => {
  const root = new El('div', doc);
  const bar = createBar(root, { api: async () => ({}) });
  const select = root.cls('bar-select');
  let kids = [];
  Object.defineProperty(select, 'children', {
    get: () => ({ length: kids.length, [Symbol.iterator]: () => kids[Symbol.iterator](), item: (i) => kids[i] }),
    set: (v) => { kids = v; },
  });
  select.appendChild = (c) => { kids.push(c); return c; };
  assert.doesNotThrow(() => bar.update(snap()));
  assert.doesNotThrow(() => bar.update(snap()));
  assert.deepEqual(kids.map((o) => o.value), ['a', 'b']);
});
