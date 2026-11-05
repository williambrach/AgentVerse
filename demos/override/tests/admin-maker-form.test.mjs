import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fieldCopy, sectionOf } from '../server/admin/maker-copy.js';
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
  assert.equal(root.all(e => e.className === 'form-section').length, 6);
  assert.match(root.all(e => e.className === 'form-section' && e.dataset.section === 'part:boss')[0].textContent, /The boss/);
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

test('set_detail_rebuilds_and_clears_errors', () => {
  const { root, handle } = mk();
  type(root, 'copy.headline', 'X');
  handle.setError('copy.headline', 'bad');
  handle.setDetail(fixture({ ...authored(), 'copy.headline': 'Y' }));
  assert.equal(area(root, 'copy.headline').value, 'Y');
  assert.equal(root.all(e => e.tag === 'textarea').length, Object.keys(authored()).length);
  assert.equal(root.all(e => e.className === 'field-error' && !e.hidden).length, 0);
  assert.equal(handle.dirty(), false);
  assert.deepEqual(handle.overlay(), { 'copy.headline': 'Y' });
});

const sections = root => root.all(e => e.className === 'form-section');

test('labels_have_no_dotted_key', () => {
  const { root } = mk();
  const labels = root.all(e => e.className === 'field-label');
  assert.equal(labels.length, Object.keys(authored()).length);
  for (const l of labels) assert.equal(/\w\.\w/.test(l.textContent), false, l.textContent);
  assert.ok(labels.every(l => l.title.includes('.')));
});

test('every_field_has_hint', () => {
  const { root } = mk();
  const hints = root.all(e => e.className === 'field-hint');
  assert.equal(hints.length, Object.keys(authored()).length);
  assert.ok(hints.every(h => h.textContent.length > 0));
  assert.equal(fieldCopy('parts.planner.finding.classification').label, 'Debrief verdict');
  assert.deepEqual(fieldCopy('zzz.weird'), { label: 'weird', hint: '' });
  assert.match(fieldCopy('copy.report.title').hint, /^Not shown to players yet\./);
  assert.match(fieldCopy('debrief.summary').hint, /^Not shown to players yet\./);
  assert.match(fieldCopy('prompt.use').hint, /One per line\.$/);
  assert.match(fieldCopy('parts.x.knowledge').hint, /One per line\.$/);
});

test('section_of', () => {
  assert.equal(sectionOf('parts.carrier.knowledge'), 'part:carrier');
  assert.equal(sectionOf('answer.feedback.other'), 'debrief');
  assert.equal(sectionOf('copy.headline'), 'story');
  assert.equal(sectionOf('prompt.use'), 'prompt');
});

test('sections_list_and_show', () => {
  const { root, handle } = mk();
  assert.deepEqual(handle.sections().map(s => s.key), ['story', 'prompt', 'part:boss', 'part:helper', 'part:bystander', 'debrief']);
  assert.deepEqual(handle.sections()[2], { key: 'part:boss', title: 'The boss', role: 'villain' });
  assert.equal(sections(root).filter(s => !s.hidden).length, 1);
  handle.show('prompt');
  const vis = sections(root).filter(s => !s.hidden);
  assert.equal(vis.length, 1);
  assert.equal(vis[0].dataset.section, 'prompt');
});

test('dirty_sections_and_count', () => {
  const { root, handle } = mk();
  assert.deepEqual(handle.dirtySections(), []);
  assert.equal(handle.dirtyCount(), 0);
  type(root, 'copy.headline', 'Z');
  assert.deepEqual(handle.dirtySections(), ['story']);
  assert.equal(handle.dirtyCount(), 1);
  type(root, 'parts.helper.label', 'Q');
  assert.deepEqual(handle.dirtySections(), ['story', 'part:helper']);
  assert.equal(handle.dirtyCount(), 2);
  type(root, 'copy.headline', 'H');
  assert.equal(handle.dirtyCount(), 1);
});

test('dirty_ignores_authored_difference', () => {
  const { handle } = mk(fixture({ ...authored(), 'copy.headline': 'Published' }));
  assert.equal(handle.dirtyCount(), 0);
});

test('set_error_returns_section', () => {
  const { handle } = mk();
  assert.equal(handle.setError('parts.boss.knowledge', 'x'), 'part:boss');
  assert.equal(handle.setError('nope', 'x'), null);
});

test('name_tag_legend', () => {
  const { root } = mk();
  const tags = root.all(e => e.className === 'placeholders');
  assert.equal(tags.length, 4);
  assert.match(root.textContent, /\{boss\} \{helper\}/);
  assert.match(tags[0].textContent, /^Name tags: \{boss\} \{helper\}\. Each becomes/);
});

test('grow_skips_without_scrollHeight', () => {
  const { root } = mk();
  assert.doesNotThrow(() => type(root, 'copy.headline', 'x'));
  const a = area(root, 'copy.headline');
  a.scrollHeight = 120;
  type(root, 'copy.headline', 'xy');
  assert.equal(a.style.height, '122px');
});
