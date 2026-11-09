import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COPY, fieldCopy, sectionOf } from '../server/admin/maker-copy.js';
import { renderForm, knowledgeLines, linesText } from '../server/admin/maker-form.js';
import { rawOf, fieldsOf } from '../server/content-paths.mjs';
import renaissance from '../server/cases/renaissance-traveler.mjs';

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
const sections = root => root.all(e => e.className === 'form-section');
const visible = root => sections(root).filter(s => !s.hidden).map(s => s.dataset.section);

// A small case with a character, a part and every section kind.
const authored = () => ({
  'title': 'The mini case',
  'copy.headline': 'H', 'copy.intro.lead': 'L1\nL2',
  'prompt.setting': 'a monkey', 'prompt.use': ['bananas'],
  'roles.villain.hint': 'the one',
  'characters.momo.name': 'Momo', 'characters.momo.introduction': 'Hi',
  'characters.pip.name': 'Pip',
  'talk.slips.pip.0.line': 'a slip line', 'talk.rehearsal.pip': ['r1', 'r2'],
  'parts.boss.label': 'The boss', 'parts.boss.knowledge': ['k1', 'k2'],
  'evidence.knife.text': 'a knife',
  'talk.topics.weather.label': 'Weather',
  'debrief.title': 'DT', 'answer.feedback.correct': 'yes',
  'weird.path': 'odd',
});
const fixture = (current = authored(), over = {}) => ({
  id: 'mini', title: 'Mini', version: 'v1', rev: 0, by: null, stale: false, corrupt: false, skipped: [], mode: 'rehearsal',
  structure: { characters: [{ id: 'momo', name: 'Momo' }, { id: 'pip', name: 'Pip' }], parts: [{ id: 'boss', role: 'villain' }], world: 'grove', placeholders: ['{boss}'] },
  authored: authored(), current, order: Object.keys(authored()), history: [], ...over,
});
const mk = (detail = fixture()) => {
  const root = new El('div', doc); const changes = [];
  const handle = renderForm(root, detail, { onChange: h => changes.push(h) });
  return { root, handle, changes };
};

test('knowledge_lines_roundtrip', () => {
  assert.deepEqual(knowledgeLines('a\n\nb '), ['a', 'b']);
  assert.equal(linesText(['a', 'b']), 'a\nb');
});

test('section_of', () => {
  const s = { characters: [{ id: 'momo', name: 'momo' }, { id: 'ottavio', name: 'Ottavio' }], parts: [{ id: 'carrier', label: 'The carrier' }] };
  assert.equal(sectionOf('characters.momo.name', s), 'Character: Momo');
  assert.equal(sectionOf('talk.slips.ottavio.0.line', s), 'Character: Ottavio');
  assert.equal(sectionOf('talk.rehearsal.ottavio', s), 'Character: Ottavio');
  assert.equal(sectionOf('parts.carrier.knowledge', s), 'Part: The carrier');
  assert.equal(sectionOf('ui.hud.notebook', s), 'UI · HUD');
  assert.equal(sectionOf('ui.dialogue.ask', s), 'UI · Conversation');
  assert.equal(sectionOf('ui.station.x', s), 'UI · Map labels');
  assert.equal(sectionOf('ui.zzz.x', s), 'UI · zzz');
  assert.equal(sectionOf('talk.glossary.0.text', s), 'Topics');
  assert.equal(sectionOf('partsKnowledge', s), 'Prompt');
  assert.equal(sectionOf('prompt.interview', s), 'Prompt rules');
  assert.equal(sectionOf('prompt.use', s), 'Prompt');
  assert.equal(sectionOf('worlds.grove.cast.one', s), 'World: grove');
  assert.equal(sectionOf('answer.feedback.other', s), 'Debrief');
  assert.equal(sectionOf('weird.path', s), 'Other');
});

test('no_field_dropped', () => {
  const raw = rawOf(renaissance);
  const list = fieldsOf(raw);
  const a = Object.fromEntries(list.map(f => [f.path, f.value]));
  const d = fixture({ ...a }, {
    authored: a, order: list.map(f => f.path),
    structure: { characters: raw.characters.map(c => ({ id: c.id, name: c.name })), parts: raw.parts.map(p => ({ id: p.id, role: p.role })), placeholders: [] },
  });
  const { root } = mk(d);
  const paths = root.all(e => e.tag === 'textarea').map(e => e.dataset.path);
  assert.equal(new Set(paths).size, paths.length);
  assert.deepEqual([...paths].sort(), list.map(f => f.path).sort());
  assert.equal(root.all(e => e.className === 'form-section' && e.dataset.section === 'other').length, 0);
  const topics = root.all(e => e.className === 'form-section' && e.dataset.section === 'topics')[0];
  assert.ok(topics.all(e => e.tag === 'textarea').some(a => a.dataset.path.startsWith('talk.glossary.')));
  assert.ok(list.length > 300);
});

test('sections_order', () => {
  const { handle } = mk();
  assert.deepEqual(handle.sections().map(s => s.title), [
    'Story', 'Prompt', 'Roles', 'Character: Momo', 'Character: Pip', 'Part: The boss', 'Evidence', 'Topics', 'Debrief', 'Other']);
  const game = fixture({}, { id: 'game', authored: {}, structure: { characters: [], parts: [], world: null, placeholders: [], areas: ['hud', 'tools'], worlds: ['grove', 'tower'] } });
  const ga = { 'worlds.tower.frame': 'f', 'worlds.grove.frame': 'g', 'prompt.thread': 't', 'prompt.interview': 'i', 'ui.tools.talk': 'Talk', 'ui.hud.notebook': 'Notes' };
  const g = mk({ ...game, authored: ga, current: ga, order: Object.keys(ga) });
  assert.deepEqual(g.handle.sections().map(s => s.title), ['UI · HUD', 'UI · Arbiter tools', 'Prompt rules', 'World: grove', 'World: tower']);
});

test('section_titles_follow_current_names', () => {
  const { root, handle } = mk(fixture({ ...authored(), 'characters.momo.name': 'Mimi', 'parts.boss.label': 'The chief' }));
  assert.ok(handle.sections().some(s => s.title === 'Character: Mimi'));
  assert.deepEqual(handle.sections().find(s => s.key === 'part:boss'), { key: 'part:boss', title: 'Part: The chief', role: 'villain' });
  type(root, 'characters.momo.name', 'Zed');
  assert.ok(handle.sections().some(s => s.title === 'Character: Zed'));
});

test('unclaimed_paths_go_to_other', () => {
  const { root, handle } = mk();
  assert.equal(handle.sections().at(-1).key, 'other');
  assert.ok(area(root, 'weird.path'));
  assert.equal(area(root, 'weird.path').parent.parent.dataset.section, 'other');
});

test('overlay_only_changed_paths', () => {
  const { root, handle, changes } = mk();
  assert.equal(handle.overlay(), null);
  type(root, 'copy.intro.lead', 'New lead');
  assert.deepEqual(handle.overlay(), { 'copy.intro.lead': 'New lead' });
  assert.equal(changes.length, 1);
  type(root, 'parts.boss.knowledge', 'k1\n\nk3 ');
  assert.deepEqual(handle.overlay()['parts.boss.knowledge'], ['k1', 'k3']);
  type(root, 'parts.boss.knowledge', 'k1\nk2');
  type(root, 'copy.intro.lead', 'L1\nL2');
  assert.equal(handle.overlay(), null);
});

test('differs_marker_and_reset', () => {
  const { root, handle, changes } = mk();
  const marker = () => area(root, 'copy.headline').parent.all(e => e.className === 'differs')[0];
  assert.equal(marker().hidden, true);
  type(root, 'copy.headline', 'X');
  assert.equal(marker().hidden, false);
  marker().all(e => e.tag === 'button')[0].click();
  assert.equal(area(root, 'copy.headline').value, 'H');
  assert.equal(handle.overlay(), null);
  assert.equal(changes.length, 2);
});

test('dirty_against_current', () => {
  const { root, handle } = mk(fixture({ ...authored(), 'copy.headline': 'Published' }));
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
});

test('dirty_sections_and_count', () => {
  const { root, handle } = mk();
  assert.deepEqual(handle.dirtySections(), []);
  type(root, 'copy.headline', 'Z');
  type(root, 'parts.boss.label', 'Q');
  assert.deepEqual(handle.dirtySections(), ['story', 'part:boss']);
  assert.equal(handle.dirtyCount(), 2);
  type(root, 'copy.headline', 'H');
  assert.equal(handle.dirtyCount(), 1);
});

test('set_error_returns_section_and_shows', () => {
  const { root, handle } = mk();
  const err = path => area(root, path).parent.all(e => e.className === 'field-error')[0];
  assert.equal(handle.setError('parts.boss.knowledge', 'bad'), 'part:boss');
  assert.equal(err('parts.boss.knowledge').textContent, 'bad');
  assert.equal(err('parts.boss.knowledge').hidden, false);
  assert.equal(handle.setError('nope', 'x'), null);
  assert.equal(err('parts.boss.knowledge').hidden, true);
});

test('text_stays_literal', () => {
  const { root, handle } = mk();
  type(root, 'copy.headline', '<img onerror=x>');
  assert.deepEqual(handle.overlay(), { 'copy.headline': '<img onerror=x>' });
  for (const f of ['maker-form.js', 'maker-copy.js', 'maker.js']) {
    const src = readFileSync(new URL(`../server/admin/${f}`, import.meta.url), 'utf8');
    assert.equal(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(src), false, f);
  }
});

test('set_detail_rebuilds_and_clears_errors', () => {
  const { root, handle } = mk();
  type(root, 'copy.headline', 'X');
  handle.setError('copy.headline', 'bad');
  handle.setDetail(fixture({ ...authored(), 'copy.headline': 'Y' }));
  assert.equal(area(root, 'copy.headline').value, 'Y');
  assert.equal(root.all(e => e.tag === 'textarea').length, Object.keys(authored()).length);
  assert.equal(root.all(e => e.className === 'field-error' && !e.hidden).length, 0);
});

test('search_filters', () => {
  const { root, handle } = mk();
  handle.setFilter('slip');
  const shown = root.all(e => e.className === 'field').filter(f => !f.hidden).map(f => f.all(e => e.tag === 'textarea')[0].dataset.path);
  assert.deepEqual(shown, ['talk.slips.pip.0.line']);
  assert.deepEqual(handle.sections().map(s => s.key), ['character:pip']);
  assert.deepEqual(visible(root), ['character:pip']);
  handle.setFilter('KNIFE'); // matches the value, not the path
  assert.deepEqual(visible(root), ['evidence']);
  handle.setFilter('Debrief verdict'); // label match is case-insensitive too
  assert.deepEqual(visible(root), []);
  handle.setFilter('');
  assert.equal(root.all(e => e.className === 'field' && e.hidden).length, 0);
  assert.equal(visible(root).length, 1);
});

test('templates_get_monospace_and_token_legend', () => {
  const ga = { 'prompt.interview': 'You are [[name]] [[knowledge]]', 'prompt.thread': 'T [[others]] [[knowledge]]' };
  const d = fixture(ga, { id: 'game', authored: ga, order: Object.keys(ga), structure: { characters: [], parts: [], placeholders: [], areas: [], worlds: [] } });
  const { root } = mk(d);
  assert.match(area(root, 'prompt.interview').className, /mono/);
  const legends = root.all(e => e.className === 'token-legend').map(e => e.textContent);
  assert.equal(legends.length, 2);
  assert.match(legends[0], /\[\[name\]\].*\[\[knowledge\]\]/);
  assert.equal(legends[0].includes('[[others]]'), false);
  assert.match(legends[1], /\[\[others\]\]/);
  assert.equal(area(root, 'prompt.interview').parent.all(e => e.className === 'token-legend').length, 1);
});

test('known_hints', () => {
  for (const [path, [label, hint]] of Object.entries(COPY)) {
    assert.ok(hint.length > 0, path);
    assert.equal(/\./.test(label), false, path);
  }
  for (const f of fieldsOf(rawOf(renaissance))) assert.equal(/\w\.\w/.test(fieldCopy(f.path).label), false, f.path);
  assert.equal(fieldCopy('ui.hud.notebook.title').label, 'Notebook title');
  assert.equal(fieldCopy('parts.planner.finding.classification').label, 'Debrief verdict');
  assert.equal(fieldCopy('talk.slips.ottavio.0.line').label, 'Line');
  assert.match(fieldCopy('prompt.use').hint, /One per line\.$/);
  assert.match(fieldCopy('worlds.grove.frame').hint, /\w/);
  assert.match(fieldCopy('prompt.thread').hint, /\[\[knowledge\]\]/);
  assert.match(fieldCopy('worlds.grove.cast.one').hint, /server messages/);
  assert.doesNotMatch(fieldCopy('worlds.grove.cast.many').hint, /prompt/i);
});

test('grow_skips_without_scrollHeight', () => {
  const { root } = mk();
  assert.doesNotThrow(() => type(root, 'copy.headline', 'x'));
  const a = area(root, 'copy.headline');
  a.scrollHeight = 120;
  type(root, 'copy.headline', 'xy');
  assert.equal(a.style.height, '122px');
});

test('renaissance_builds_fast', () => {
  const raw = rawOf(renaissance);
  const list = fieldsOf(raw);
  const a = Object.fromEntries(list.map(f => [f.path, f.value]));
  const d = fixture({ ...a }, { authored: a, order: list.map(f => f.path), structure: { characters: raw.characters.map(c => ({ id: c.id, name: c.name })), parts: [], placeholders: [] } });
  const t0 = performance.now();
  const { root, handle } = mk(d);
  for (let i = 0; i < 50; i++) type(root, 'copy.headline', `x${i}`);
  handle.setFilter('slip');
  assert.ok(performance.now() - t0 < 1500);
});
