// A part may carry its own rules: whoever is dealt it gets them instead of the case's rules, and its knowledge is optional.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineCase, identityCast } from '../server/cases.mjs';
import { systemPrompt } from '../server/interviews.mjs';
import { fieldsOf, rawOf } from '../server/content-paths.mjs';
import { createContentStore, ContentError } from '../server/content.mjs';
import { partCase, agentWorlds } from './fixtures/minimal-case.mjs';

const worlds = agentWorlds(3);
const BOSS_RULES = 'BOSS RULES for [[name]]: you misled {helper}.\n[[knowledge]]\nEND BOSS';
const withRules = (all = false) => {
  const d = structuredClone({ ...partCase, rehearsal: undefined });
  d.rehearsal = partCase.rehearsal;
  d.parts[0] = { ...d.parts[0], rules: BOSS_RULES };
  delete d.parts[0].knowledge;
  if (all) d.parts.slice(1).forEach(p => { p.rules = `OWN RULES ${p.id}\n[[knowledge]]`; });
  return d;
};
const prompt = (kase, cid) => systemPrompt(kase, { cast: identityCast(kase), interviews: {} }, cid);

test('part_rules_replace_the_case_rules_for_whoever_gets_the_part', () => {
  const kase = defineCase(withRules(), { worlds });
  const boss = prompt(kase, 'momo'); // momo holds boss in the identity cast
  assert.match(boss, /^BOSS RULES for Momo: you misled Pip\.\n/);
  assert.match(boss, /END BOSS$/);
  assert.equal(boss.includes('YOUR KNOWLEDGE'), false, 'the case rules are not used');
  // Other parts keep the case's rules and their knowledge.
  const helper = prompt(kase, 'pip');
  assert.match(helper, /YOUR KNOWLEDGE/);
  assert.match(helper, /SECRET helper knowledge/);
  assert.equal(helper.includes('BOSS RULES'), false);
});

test('part_rules_are_checked_and_knowledge_is_optional_only_with_them', () => {
  assert.doesNotThrow(() => defineCase(withRules(), { worlds }));
  const bad = rules => () => { const d = withRules(); d.parts[0].rules = rules; defineCase(d, { worlds }); };
  assert.throws(bad('no knowledge token'), /parts\[0\]\.rules: The template needs \[\[knowledge\]\] exactly once/);
  assert.throws(bad('[[knowledge]] [[setting]]'), /parts\[0\]\.rules: Unknown token \[\[setting\]\]/);
  assert.throws(bad('[[knowledge]] {ghost}'), /parts\[0\]\.rules: unknown placeholder \{ghost\}/);
  assert.throws(bad(''), /parts\[0\]\.rules: must be a non-empty string/);
  const noBoth = structuredClone({ ...partCase, rehearsal: undefined });
  noBoth.rehearsal = partCase.rehearsal;
  delete noBoth.parts[0].knowledge;
  assert.throws(() => defineCase(noBoth, { worlds }), /parts\[0\]\.knowledge: must be a non-empty array/);
  // Knowledge next to rules is still checked.
  const both = withRules();
  both.parts[0].knowledge = ['ok', ''];
  assert.throws(() => defineCase(both, { worlds }), /parts\[0\]\.knowledge\[1\]/);
});

test('editor_paths: part rules are editable; the case rules hide only when every part has its own', () => {
  const some = fieldsOf(rawOf(defineCase(withRules(), { worlds }))).map(f => f.path);
  assert.ok(some.includes('parts.boss.rules'));
  assert.ok(some.includes('rules'), 'two parts still use the case rules');
  assert.equal(some.includes('parts.boss.knowledge'), false);
  const all = fieldsOf(rawOf(defineCase(withRules(true), { worlds }))).map(f => f.path);
  assert.equal(all.includes('rules'), false);
  assert.ok(['boss', 'helper', 'bystander'].every(id => all.includes(`parts.${id}.rules`)));
});

test('content_store: part rules publish and get the rules size limit', t => {
  const dir = mkdtempSync(join(tmpdir(), 'part-rules-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const store = createContentStore({ cases: [defineCase(withRules(), { worlds })], dataDir: dir, contentDir: join(dir, 'tracked'), worlds });
  const long = n => `${'x'.repeat(n - '[[knowledge]]'.length)}[[knowledge]]`;
  store.publish('mini-parts', { 'parts.boss.rules': long(12000) }, { by: 'a', baseRev: 0 });
  assert.equal(store.current('mini-parts').parts[0].rules.length, 12000);
  assert.throws(() => store.preview('mini-parts', { 'parts.boss.rules': long(12001) }), e => e instanceof ContentError && e.path === 'parts.boss.rules');
  assert.throws(() => store.preview('mini-parts', { 'parts.boss.rules': 'no token' }), e => e instanceof ContentError && e.path === 'parts.boss.rules');
});
