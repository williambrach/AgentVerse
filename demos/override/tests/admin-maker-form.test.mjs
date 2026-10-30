import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderForm, knowledgeLines, linesText } from '../server/admin/maker-form.js';

class El {
  constructor(tag, doc) { this.tag = tag; this.ownerDocument = doc; this.children = []; this.listeners = {}; this.className = ''; this._text = ''; this.dataset = {}; this.style = {}; this.hidden = false; this.disabled = false; this.value = ''; }
  get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
  set textContent(v) { this._text = String(v); this.children = []; }
  appendChild(c) { this.children.push(c); c.parent = this; return c; }
  append(...cs) { cs.forEach(c => this.appendChild(c)); }
  addEventListener(t, fn) { (this.listeners[t] ??= []).push(fn); }
  fire(t) { (this.listeners[t] ?? []).forEach(f => f({ target: this })); }
  click() { this.fire('click'); }
  all(pred, out = []) { if (pred(this)) out.push(this); this.children.forEach(c => c.all(pred, out)); return out; }
}
const doc = { createElement: t => new El(t, doc) };
const area = (root, path) => root.all(e => e.tag === 'textarea' && e.dataset.path === path)[0];
const type = (root, path, v) => { const a = area(root, path); a.value = v; a.fire('input'); };

const partFields = id => ({
  [`parts.${id}.label`]: `The ${id}`, [`parts.${id}.introduction`]: `Hi ${id}`, [`parts.${id}.quickQuestion`]: `What ${id}?`,
  [`parts.${id}.knowledge`]: [`k1 ${id}`, `k2 ${id}`], [`parts.${id}.finding.classification`]: `c-${id}`, [`parts.${id}.finding.explanation`]: `e-${id}`,
});
const authored = () => ({
  'prompt.setting': 'a monkey', 'prompt.use': ['bananas'], 'prompt.avoid': ['override'],
  ...partFields('boss'), ...partFields('helper'), ...partFields('bystander'),
  'copy.headline': 'H', 'copy.intro.lead': 'L1\nL2', 'copy.intro.body': 'B',
  'copy.briefing.title': 'BT', 'copy.report.title': 'RT',
  'debrief.title': 'DT', 'debrief.summary': 'DS {boss}', 'answer.feedback.correct': 'yes',
});
const fixture = (current = authored()) => ({
  id: 'mini-parts', title: 'Mini', version: 'v1', status: 'ready', world: 'grove', rev: 0, by: null, editedAt: null,
  contentHash: 'abc', baseContentHash: 'abc', stale: false, mode: 'rehearsal',
  structure: { characters: ['momo', 'pip', 'nori'], parts: [{ id: 'boss', role: 'villain' }, { id: 'helper', role: 'fooled' }, { id: 'bystander', role: 'honest' }], world: 'grove', placeholders: ['{boss}', '{helper}'] },
  authored: authored(), current, history: [],
});
const mk = (detail = fixture()) => {
  const root = new El('div', doc); const changes = [];
  const handle = renderForm(root, detail, { onChange: h => changes.push(h) });
  return { root, handle, changes };
};

test('renders_every_editable_path', () => {
  const { root, handle } = mk();
  const paths = root.all(e => e.tag === 'textarea').map(e => e.dataset.path).sort();
  assert.deepEqual(paths, Object.keys(authored()).sort());
  assert.equal(root.all(e => e.tag === 'fieldset').length, 3);
  assert.match(root.all(e => e.tag === 'legend')[0].textContent, /The boss · villain/);
  assert.equal(area(root, 'parts.boss.knowledge').value, 'k1 boss\nk2 boss');
  assert.deepEqual(handle.values()['prompt.use'], ['bananas']);
  assert.match(root.textContent, /\{boss\} \{helper\}/);
});

test('knowledge_lines_roundtrip', () => {
  assert.deepEqual(knowledgeLines('a\n\nb '), ['a', 'b']);
  assert.equal(linesText(['a', 'b']), 'a\nb');
});

test('overlay_only_changed_paths', () => {
  const { root, handle, changes } = mk();
  assert.equal(handle.overlay(), null);
  type(root, 'copy.intro.lead', 'New lead');
  assert.deepEqual(handle.overlay(), { 'copy.intro.lead': 'New lead' });
  assert.equal(changes.length, 1);
  type(root, 'parts.boss.knowledge', 'k1 boss\n\nk3 ');
  assert.deepEqual(handle.overlay()['parts.boss.knowledge'], ['k1 boss', 'k3']);
  type(root, 'parts.boss.knowledge', 'k1 boss\nk2 boss');
  type(root, 'copy.intro.lead', 'L1\nL2');
  assert.equal(handle.overlay(), null);
});

test('differs_marker_and_reset', () => {
  const { root, handle, changes } = mk();
  const marker = () => area(root, 'copy.headline').parent.all(e => e.className === 'differs')[0];
  assert.equal(marker().hidden, true);
  type(root, 'copy.headline', 'X');
  assert.equal(marker().hidden, false);
  assert.equal(marker().textContent.startsWith('edited'), true);
  marker().all(e => e.tag === 'button')[0].click();
  assert.equal(area(root, 'copy.headline').value, 'H');
  assert.equal(marker().hidden, true);
  assert.equal(handle.overlay(), null);
  assert.equal(changes.length, 2);
});

test('dirty_against_current', () => {
  const current = { ...authored(), 'copy.headline': 'Published' };
  const { root, handle } = mk(fixture(current));
  assert.equal(area(root, 'copy.headline').value, 'Published');
  assert.deepEqual(handle.overlay(), { 'copy.headline': 'Published' });
  assert.equal(handle.dirty(), false);
  type(root, 'copy.headline', 'Other');
  assert.equal(handle.dirty(), true);
  type(root, 'copy.headline', 'Published');
  assert.equal(handle.dirty(), false);
  type(root, 'copy.headline', 'H');
  assert.equal(handle.dirty(), true);
  handle.setDetail(fixture({ ...authored() }));
  assert.equal(handle.dirty(), false);
  assert.equal(area(root, 'copy.headline').value, 'H');
});

test('set_error_shows_under_field', () => {
  const { root, handle } = mk();
  const err = path => area(root, path).parent.all(e => e.className === 'field-error')[0];
  assert.equal(err('parts.boss.knowledge').hidden, true);
  handle.setError('parts.boss.knowledge', 'unknown placeholder {x}');
  assert.equal(err('parts.boss.knowledge').textContent, 'unknown placeholder {x}');
  assert.equal(err('parts.boss.knowledge').hidden, false);
  handle.setError('copy.headline', 'bad');
  assert.equal(err('parts.boss.knowledge').hidden, true);
  assert.equal(err('copy.headline').hidden, false);
  handle.clearErrors();
  assert.equal(err('copy.headline').hidden, true);
});

test('text_stays_literal', () => {
  const { root, handle } = mk();
  type(root, 'copy.headline', '<img onerror=x>');
  assert.equal(handle.values()['copy.headline'], '<img onerror=x>');
  assert.deepEqual(handle.overlay(), { 'copy.headline': '<img onerror=x>' });
  const src = readFileSync(new URL('../server/admin/maker-form.js', import.meta.url), 'utf8');
  assert.equal(/innerHTML|outerHTML|insertAdjacentHTML/.test(src), false);
});
