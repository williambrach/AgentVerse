import test from 'node:test';
import assert from 'node:assert/strict';
import { templateProblem, actorsOf, layoutOf } from '../server/admin/maker.js';
import { checkTemplate } from '../server/interviews.mjs';
import { DEFAULT_TEMPLATES } from '../server/interviews.mjs';

const detail = (authored, structure) => ({ authored, current: authored, order: Object.keys(authored), structure });

test('template_check_agrees_with_the_server', () => {
  for (const kind of ['interview', 'thread']) {
    assert.equal(templateProblem(kind, DEFAULT_TEMPLATES[kind]), null);
    for (const tpl of ['no tokens', '[[knowledge]] [[knowledge]]', '[[knowledge]] [[setting]]', '[[knowledge]] [[others]]', '[[others]] [[name]]', '[[knowledge]] [[]]']) {
      assert.equal(templateProblem(kind, tpl) === null, checkTemplate(kind, tpl) === null, `${kind}: ${tpl}`);
    }
  }
});

test('part_pages_when_parts_carry_the_label', () => {
  const d = detail({
    'characters.momo.name': 'Momo', 'characters.pip.name': 'Pip',
    'parts.boss.label': 'The boss', 'parts.boss.knowledge': ['k'], 'parts.boss.introduction': 'Hi', 'parts.boss.quickQuestion': 'Q?',
    'parts.aide.label': 'The aide', 'parts.aide.knowledge': ['k2'],
  }, { characters: [{ id: 'momo', name: 'Momo' }, { id: 'pip', name: 'Pip' }], parts: [{ id: 'boss', role: 'villain' }, { id: 'aide', role: 'helper' }] });
  const [boss, aide] = actorsOf(d);
  // A name is never tied to a part: the page is the part, and momo only plays it in the test chat.
  assert.deepEqual(boss, {
    id: 'boss', kind: 'part', chatId: 'momo', partId: 'boss', role: 'villain', fallbackName: 'Momo', nameShown: null, label: 'parts.boss.label',
    introduction: 'parts.boss.introduction', quickQuestion: 'parts.boss.quickQuestion', ownKnowledge: null, partKnowledge: 'parts.boss.knowledge', debrief: [], extra: [],
  });
  assert.equal(aide.chatId, 'pip');
  assert.equal(aide.introduction, null);
  assert.deepEqual(layoutOf(d).names, ['characters.momo.name', 'characters.pip.name']);
});

test('character_pages_when_every_character_has_its_own_label', () => {
  const d = detail({
    'characters.a.name': 'A', 'characters.a.label': 'Clerk', 'characters.a.knowledge': ['own'], 'characters.a.introduction': 'Hello', 'characters.a.reveal': 'R',
    'partsKnowledge': ['shared'], 'parts.x.finding.explanation': 'why',
  }, { characters: [{ id: 'a', name: 'A' }], parts: [{ id: 'x', role: 'local' }] });
  const l = layoutOf(d);
  const [a] = l.actors;
  assert.equal(a.kind, 'character');
  assert.equal(a.role, null);
  assert.equal(a.label, 'characters.a.label');
  assert.equal(a.introduction, 'characters.a.introduction');
  assert.equal(a.ownKnowledge, 'characters.a.knowledge');
  assert.equal(a.partKnowledge, null);
  assert.deepEqual(a.extra, ['characters.a.reveal']);
  // The shared facts and the part keep their own pages.
  assert.deepEqual(l.groups, [
    { key: 'prompt', title: 'Facts everyone knows', paths: ['partsKnowledge'] },
    { key: 'part:x', title: 'Part: x', paths: ['parts.x.finding.explanation'], role: 'local' },
  ]);
});

test('layout_places_every_path_exactly_once', () => {
  const d = detail({
    title: 'T', 'copy.headline': 'H',
    'characters.momo.name': 'Momo', 'characters.momo.reveal': 'R', 'parts.boss.label': 'The boss', 'parts.boss.knowledge': ['k'],
    'parts.boss.finding.explanation': 'why', 'roles.villain.label': 'Villain', 'roles.villain.hint': 'h', 'debrief.title': 'D',
  }, { characters: [{ id: 'momo', name: 'Momo' }], parts: [{ id: 'boss', role: 'villain' }] });
  const l = layoutOf(d);
  assert.deepEqual(l.story, ['title', 'copy.headline']);
  assert.deepEqual(l.names, ['characters.momo.name']);
  assert.deepEqual(l.actors[0].debrief, ['parts.boss.finding.explanation']);
  assert.deepEqual(l.groups.map(g => [g.key, g.paths]), [
    ['character:momo', ['characters.momo.reveal']], ['roles', ['roles.villain.label', 'roles.villain.hint']], ['debrief', ['debrief.title']],
  ]);
  const inPrompt = ['parts.boss.label', 'parts.boss.knowledge'];
  const all = [...l.story, ...l.names, ...inPrompt, ...l.actors[0].debrief, ...l.actors[0].extra, ...l.groups.flatMap(g => g.paths)];
  assert.deepEqual(all.sort(), Object.keys(d.authored).sort());
});
