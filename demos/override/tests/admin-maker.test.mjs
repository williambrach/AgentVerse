import test from 'node:test';
import assert from 'node:assert/strict';
import { templateProblem, actorsOf, layoutOf, secretPart, rulePagesOf } from '../server/admin/maker.js';
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
  // The dealt part is an actor page after the people; a has it in the test chat. The shared facts keep their own page.
  const x = l.actors[1];
  assert.deepEqual([x.kind, x.id, x.partId, x.role, x.chatId, x.label, x.partKnowledge], ['part', 'x', 'x', 'local', 'a', null, null]);
  assert.deepEqual(x.debrief, ['parts.x.finding.explanation']);
  assert.deepEqual(l.groups, [{ key: 'prompt', title: 'Facts everyone knows', paths: ['partsKnowledge'] }]);
});

test('character_case_parts_get_actor_pages_with_their_facts_and_debrief', () => {
  const d = detail({
    'characters.a.name': 'A', 'characters.a.label': 'Clerk', 'characters.a.knowledge': ['own'], 'characters.a.secrets.boss': 'secret',
    'characters.b.name': 'B', 'characters.b.label': 'Cook', 'characters.b.knowledge': ['own b'],
    'roles.boss.label': 'Boss', 'parts.boss.knowledge': ['boss facts'], 'parts.boss.finding.classification': 'v',
    'parts.b.knowledge': ['b facts'], 'debrief.title': 'D', 'evidence.e.title': 'E',
  }, { characters: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], parts: [{ id: 'boss', role: 'boss' }, { id: 'b', role: 'local' }] });
  const l = layoutOf(d);
  // People first, then the parts; part "b" shares an id with character "b", so its page id differs.
  assert.deepEqual(l.actors.map(a => [a.kind, a.id, a.chatId]), [['character', 'a', 'a'], ['character', 'b', 'b'], ['part', 'boss', 'a'], ['part', 'part-b', 'b']]);
  assert.equal(l.actors[2].partKnowledge, 'parts.boss.knowledge');
  assert.deepEqual(l.actors[2].debrief, ['parts.boss.finding.classification']);
  assert.equal(l.actors[3].partKnowledge, 'parts.b.knowledge');
  // A secret stays with its character.
  assert.deepEqual(l.actors[0].extra, ['characters.a.secrets.boss']);
  assert.equal(secretPart('characters.a.secrets.boss'), 'boss');
  assert.equal(secretPart('characters.a.reveal'), null);
  // The monkey game's order after the rules: evidence, debrief, roles.
  assert.deepEqual(l.groups.map(g => g.key), ['evidence', 'debrief', 'roles']);
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
    ['debrief', ['debrief.title']], ['roles', ['roles.villain.label', 'roles.villain.hint']], ['character:momo', ['characters.momo.reveal']],
  ]);
  const inPrompt = ['parts.boss.label', 'parts.boss.knowledge'];
  const all = [...l.story, ...l.names, ...inPrompt, ...l.actors[0].debrief, ...l.actors[0].extra, ...l.groups.flatMap(g => g.paths)];
  assert.deepEqual(all.sort(), Object.keys(d.authored).sort());
});

test('rule_pages: parts with own rules leave the actor pages, one page per role, split when texts differ', () => {
  const authored = {
    'characters.a.name': 'A', 'characters.a.label': 'Clerk', 'characters.a.knowledge': ['own'], 'characters.a.secrets.t': 'secret',
    'characters.b.name': 'B', 'characters.b.label': 'Cook', 'characters.b.knowledge': ['own b'],
    'characters.c.name': 'C', 'characters.c.label': 'Smith', 'characters.c.knowledge': ['own c'],
    'roles.t.label': 'Time traveller', 'roles.l.label': 'Townsperson',
    'parts.t.rules': 'T [[knowledge]]', 'parts.t.finding.classification': 'tv',
    'parts.l1.rules': 'L [[knowledge]]', 'parts.l1.finding.classification': 'lv',
    'parts.l2.rules': 'L [[knowledge]]', 'parts.l2.finding.classification': 'lv',
  };
  const structure = { characters: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }], parts: [{ id: 't', role: 't' }, { id: 'l1', role: 'l' }, { id: 'l2', role: 'l' }] };
  const l = layoutOf(detail(authored, structure));
  assert.deepEqual(l.actors.map(a => a.kind), ['character', 'character', 'character']);
  assert.deepEqual(l.ruled.map(r => [r.key, r.role, r.partIds]), [['rules:t', 't', ['t']], ['rules:l1', 'l', ['l1', 'l2']]]);
  assert.deepEqual(l.ruled[1].fields, [{ name: 'rules', paths: ['parts.l1.rules', 'parts.l2.rules'] }, { name: 'finding.classification', paths: ['parts.l1.finding.classification', 'parts.l2.finding.classification'] }]);
  assert.equal(l.groups.some(g => g.key.startsWith('part:')), false);
  assert.deepEqual(l.actors[0].extra, ['characters.a.secrets.t']);
  const placed = [...l.names, ...l.actors.flatMap(a => [a.label, a.ownKnowledge, ...a.extra]).filter(Boolean), ...l.ruled.flatMap(r => r.fields.flatMap(f => f.paths)), ...l.groups.flatMap(g => g.paths)];
  assert.deepEqual(placed.sort(), Object.keys(authored).sort());
  // Two townsperson parts whose texts differ get a page each.
  const split = layoutOf({ ...detail(authored, structure), current: { ...authored, 'parts.l2.rules': 'L2 [[knowledge]]' } });
  assert.deepEqual(split.ruled.map(r => r.partIds), [['t'], ['l1'], ['l2']]);
  // A game where the parts carry the label keeps its part pages, rules or not.
  assert.deepEqual(rulePagesOf(detail({ 'characters.a.name': 'A', 'parts.t.rules': 'T [[knowledge]]' }, { characters: [{ id: 'a' }], parts: [{ id: 't', role: 't' }] })), []);
});
