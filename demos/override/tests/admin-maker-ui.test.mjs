import test from 'node:test';
import assert from 'node:assert/strict';
import { mountMaker } from '../server/admin/maker.js';

class El {
  constructor(tag, doc) { this.tag = tag; this.ownerDocument = doc; this.children = []; this.listeners = {}; this.className = ''; this._text = ''; this.dataset = {}; this.style = {}; this.hidden = false; this.disabled = false; this.value = ''; }
  get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
  set textContent(v) { this._text = String(v); this.children = []; }
  appendChild(c) { this.children.push(c); c.parent = this; return c; }
  append(...cs) { cs.forEach(c => this.appendChild(c)); }
  addEventListener(t, fn) { (this.listeners[t] ??= []).push(fn); }
  click() { return Promise.all((this.listeners.click ?? []).map(f => f({ target: this }))); }
  all(pred, out = []) { if (pred(this)) out.push(this); this.children.forEach(c => c.all(pred, out)); return out; }
}
const IDS = ['status', 'cases', 'form', 'character', 'question', 'preview', 'prompt', 'try', 'answer', 'reasoning', 'try-note', 'publish', 'publish-note', 'history'];
const shell = () => {
  const byId = {};
  const doc = { createElement: t => new El(t, doc), getElementById: id => byId[id] ?? null };
  const root = new El('body', doc);
  for (const id of IDS) byId[id] = new El(id === 'character' ? 'select' : 'div', doc);
  return { root, $: id => byId[id], doc };
};

const detail = (over = {}) => ({
  id: 'banana-mystery', title: 'Banana', rev: 2, by: 'alice', mode: 'live',
  structure: { characters: ['momo', 'pip'], parts: [{ id: 'boss', role: 'villain' }], world: 'grove', placeholders: ['{boss}'] },
  authored: { 'copy.intro.lead': 'Old', 'parts.boss.knowledge': ['k'] },
  current: { 'copy.intro.lead': 'Old', 'parts.boss.knowledge': ['k'] },
  history: [{ rev: 2, by: 'alice', timestamp: '2026-10-30T14:02:00.000Z', fields: ['copy.intro.lead', 'debrief.title'] }, { rev: 1, by: 'bob', timestamp: '2026-10-30T09:00:00.000Z', fields: ['copy.headline'] }],
  ...over,
});
const list = { cases: [{ id: 'banana-mystery', title: 'Banana', rev: 2 }, { id: 'tower-echo-bell', title: 'Tower', rev: 0 }] };

function mount(t, { overrides = {}, caseId = null } = {}) {
  const s = shell();
  const calls = [];
  const api = async (path, body, method) => {
    calls.push([path, body, method]);
    if (overrides[`${method ?? (body ? 'POST' : 'GET')} ${path}`]) return overrides[`${method ?? (body ? 'POST' : 'GET')} ${path}`](body);
    if (path === '/admin/content') return list;
    if (/^\/admin\/content\/[a-z-]+$/.test(path) && !body) return detail();
    return {};
  };
  const app = mountMaker(s.root, { api, caseId, location: { search: '' } });
  return { ...s, app, calls };
}
const area = (s, path) => s.$('form').all(e => e.tag === 'textarea' && e.dataset.path === path)[0];
const type = (s, path, v) => { const a = area(s, path); a.value = v; (a.listeners.input ?? []).forEach(f => f({ target: a })); };

test('load_renders_tabs_and_form', async t => {
  const s = mount(t);
  await s.app.load();
  const tabs = s.$('cases').all(e => e.tag === 'button');
  assert.deepEqual(tabs.map(b => b.textContent), ['Banana · rev 2', 'Tower · authored']);
  assert.ok(area(s, 'copy.intro.lead'));
  assert.deepEqual(s.$('character').children.map(c => c.textContent), ['momo', 'pip']);
  assert.equal(s.$('history').children.length, 3);
  assert.equal(s.$('history').children[0].textContent, 'authoredRestore');
  assert.match(s.$('history').children[1].textContent, /^rev 2 · alice · 2026-10-30 14:02 UTC · copy.intro.lead, debrief.titleRestore$/);
  assert.equal(s.$('status').textContent, 'Up to date');
  type(s, 'copy.intro.lead', 'X');
  assert.equal(s.$('status').textContent, 'Unsaved changes');
  await tabs[1].click();
  assert.equal(s.calls.at(-1)[0], '/admin/content/tower-echo-bell');
});

test('publish_sends_overlay_and_base_rev', async t => {
  const s = mount(t);
  await s.app.load();
  type(s, 'copy.intro.lead', 'New lead');
  await s.app.publish();
  assert.deepEqual(s.calls.find(c => c[2] === 'PUT'), ['/admin/content/banana-mystery', { edits: { 'copy.intro.lead': 'New lead' }, baseRev: 2 }, 'PUT']);
  assert.equal(s.$('publish-note').textContent, 'Published rev 2 by alice');
});

test('publish_409_message', async t => {
  const err = Object.assign(new Error('Changed'), { status: 409, body: { rev: 3, by: 'bob' } });
  const s = mount(t, { overrides: { 'PUT /admin/content/banana-mystery': async () => { throw err; } } });
  await s.app.load();
  await s.$('publish').click();
  assert.equal(s.$('publish-note').textContent, 'Changed meanwhile: rev 3 by bob. Reload.');
});

test('try_disabled_in_rehearsal', async t => {
  const s = mount(t, { overrides: { 'GET /admin/content/banana-mystery': async () => detail({ mode: 'rehearsal' }) } });
  await s.app.load();
  assert.equal(s.$('try').disabled, true);
  assert.equal(s.$('try-note').textContent, 'Rehearsal mode: replies are scripted. Start the server in live mode to try the model.');
  const live = mount(t);
  await live.app.load();
  assert.equal(live.$('try').disabled, false);
  assert.equal(live.$('try-note').textContent, '');
});

test('preview_fills_prompt', async t => {
  const s = mount(t, { overrides: {
    'POST /admin/content/banana-mystery/preview': async () => ({ messages: [{ role: 'system', content: 'SYSTEM <b>text</b>' }, { role: 'user', content: 'q' }] }),
    'POST /admin/content/banana-mystery/try': async () => ({ answer: 'ANS', reasoning: 'WHY', provenance: {} }),
  } });
  await s.app.load();
  type(s, 'copy.intro.lead', 'Edited');
  s.$('question').value = 'Who?';
  s.$('character').value = 'pip';
  await s.$('preview').click();
  assert.equal(s.$('prompt').textContent, 'SYSTEM <b>text</b>');
  assert.deepEqual(s.calls.find(c => c[0].endsWith('/preview'))[1], { edits: { 'copy.intro.lead': 'Edited' }, characterId: 'pip', question: 'Who?' });
  await s.$('try').click();
  assert.equal(s.$('answer').textContent, 'ANS');
  assert.equal(s.$('reasoning').textContent, 'WHY');
});

test('preview_error_goes_under_field', async t => {
  const s = mount(t, { overrides: { 'POST /admin/content/banana-mystery/preview': async () => { throw Object.assign(new Error('unknown placeholder {x}'), { status: 400, path: 'copy.intro.lead' }); } } });
  await s.app.load();
  await s.$('preview').click();
  const err = area(s, 'copy.intro.lead').parent.all(e => e.className === 'field-error')[0];
  assert.equal(err.textContent, 'unknown placeholder {x}');
  assert.equal(err.hidden, false);
});

test('restore_posts_revert', async t => {
  const s = mount(t);
  await s.app.load();
  await s.$('history').children[0].all(e => e.tag === 'button')[0].click();
  assert.deepEqual(s.calls.find(c => c[0].endsWith('/revert')), ['/admin/content/banana-mystery/revert', { rev: 0 }, undefined]);
  await s.app.restore(1);
  assert.deepEqual(s.calls.filter(c => c[0].endsWith('/revert')).at(-1)[1], { rev: 1 });
});

test('case_param_selects_case', async t => {
  const s = mount(t, { caseId: 'tower-echo-bell' });
  await s.app.load();
  assert.equal(s.calls[1][0], '/admin/content/tower-echo-bell');
});
