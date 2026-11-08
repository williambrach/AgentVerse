import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import dept from '../server/cases/department-murder.mjs';
import { cases } from '../server/cases/index.mjs';
import { resolve, publicView, identityCast, castCharacters } from '../server/cases.mjs';

const ids = dept.parts.map(p => p.id);
const perms = a => a.length < 2 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map(r => [x, ...r]));
const casts = perms(ids).map(p => Object.fromEntries(dept.characters.map((c, i) => [c.id, p[i]])));

test('department_shape', () => {
  assert.equal(dept.id, 'department-murder');
  assert.equal(dept.version, 'department-murder-v1.0.0');
  assert.equal(dept.order, 5);
  assert.equal(dept.world.id, 'department');
  assert.equal(cases.at(-1), dept);
  assert.deepEqual(dept.parts.map(p => p.id), ['killer', 'leaker', 'witness', 'lunch', 'late']);
  assert.deepEqual(dept.parts.map(p => p.role), ['killer', 'leaker', 'innocent', 'innocent', 'innocent']);
  assert.ok(dept.parts.every(p => p.label === 'Colleague'));
  assert.deepEqual(dept.characters.map(c => [c.id, c.name, c.color, c.label]), [
    ['freja', 'Freja', '#d9a634', 'PhD student'], ['mikkel', 'Mikkel', '#8c2f3c', 'PhD student'], ['birgit', 'Birgit', '#2f7f7a', 'Professor'],
    ['jonas', 'Jonas', '#3f6ea8', 'IT administrator'], ['signe', 'Signe', '#8fae8b', 'Department administrator'],
  ]);
  assert.ok(dept.characters.every(c => c.knowledge.length === 1));
  assert.deepEqual(dept.evidence.map(e => e.id), ['access-card', 'server-tower', 'usb-drive', 'laptop', 'cracked-phone', 'torn-document', 'coffee-mug', 'keys']);
  assert.equal(dept.copy.intro.lead, 'A researcher is dead.\nHis data was already gone.');
});

test('shared_timeline_first_in_every_part', () => {
  const first = dept.parts[0].knowledge[0];
  assert.match(first, /^What everyone in the department knows: /);
  for (const p of dept.parts) { assert.equal(p.knowledge.length, 2); assert.equal(p.knowledge[0], first); }
});

test('all_deals_resolve: 120 casts, no placeholder left, killer is not the leaker', () => {
  assert.equal(casts.length, 120);
  const texts = k => [k.debrief.title, k.debrief.summary, k.debrief.lesson, ...k.parts.flatMap(p => [...p.knowledge, p.finding.explanation]), ...k.evidence.map(e => e.text)];
  for (const cast of casts) {
    const holder = part => Object.keys(cast).find(id => cast[id] === part);
    assert.notEqual(holder('killer'), holder('leaker'));
    for (const t of texts(dept)) assert.ok(!/\{[a-z]+\}/.test(resolve(dept, cast, t)), t.slice(0, 40));
    for (const p of dept.parts) for (let n = 0; n < 3; n++) {
      assert.ok(!/\{[a-z]+\}/.test(resolve(dept, cast, dept.rehearsal(p.id, 'card'))));
      assert.ok(!/\{[a-z]+\}/.test(resolve(dept, cast, dept.rehearsalReasoning(p.id))));
      assert.ok(!/\{[a-z]+\}/.test(resolve(dept, cast, dept.rehearsalChatter(p.id, n))));
    }
    assert.match(resolve(dept, cast, dept.evidence[0].text), new RegExp(`belongs to ${dept.characters.find(c => c.id === holder('killer')).name}\\.`));
  }
});

test('job_text_has_no_role_words', () => {
  for (const c of dept.characters) for (const line of [...c.knowledge, c.label]) {
    assert.doesNotMatch(line, /\b(killer|leaker|murderer|innocent|witness)\b/i, c.id);
    assert.doesNotMatch(line, /\{[a-z]+\}/, c.id);
  }
});

test('public_view_lists_evidence_without_text', () => {
  const v = publicView(dept, identityCast(dept));
  assert.deepEqual(v.evidence.map(e => e.id), dept.evidence.map(e => e.id));
  assert.ok(v.evidence.every(e => !('text' in e)));
  assert.equal(JSON.stringify(v).includes('Halvard Analytics at 17:10'), false);
});

test('rehearsal_deflects_then_admits', () => {
  assert.match(dept.rehearsal('killer', 'How are you?'), /half seven/);
  assert.match(dept.rehearsal('killer', 'Whose phone call?'), /21:22/);
  assert.match(dept.rehearsal('leaker', 'Tell me about Halvard'), /paid for the data/);
  assert.match(dept.rehearsal('witness', 'Who was on the stairs?'), /{killer}/);
  assert.match(dept.rehearsal('lunch', 'Lunch?'), /pocket/);
  assert.match(dept.rehearsal('late', 'Did you see Anders?'), /lounge sofa/);
  assert.match(dept.rehearsalReasoning('killer'), /plant/);
  assert.equal(dept.rehearsal('nobody', 'x'), '');
  for (const p of dept.parts) for (let n = -3; n < 6; n++) assert.ok(dept.rehearsalChatter(p.id, n).length > 10);
});

test('public_cast_is_the_same_in_every_deal', () => {
  // The rail, greeting and quick question must never hint at the dealt part.
  const base = castCharacters(dept, identityCast(dept));
  for (const cast of casts) assert.deepEqual(castCharacters(dept, cast), base);
  assert.ok(dept.characters.every(c => c.label && c.introduction && c.quickQuestion));
});

test('quick_questions_never_unlock_a_rehearsal_admission', () => {
  for (const c of dept.characters) {
    for (const part of ids) assert.equal(dept.rehearsal(part, c.quickQuestion), dept.rehearsal(part, 'zzz'), `${c.id} quick question unlocks ${part}`);
  }
});

test('editor_hides_part_fields_the_characters_override', async () => {
  const { createContentStore, editablePaths } = await import('../server/content.mjs');
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const paths = editablePaths(dept);
  for (const f of ['label', 'introduction', 'quickQuestion']) assert.equal(paths.some(p => p.endsWith(`.${f}`) && p.startsWith('parts.')), false, f);
  assert.ok(paths.includes('parts.killer.knowledge'));
  const store = createContentStore({ cases, dataDir: mkdtempSync(join(tmpdir(), 'dept-editor-')) });
  assert.throws(() => store.publish('department-murder', { 'parts.killer.label': 'Prime suspect' }, { by: 'test', baseRev: 0 }));
  // Cases without character overrides still offer every part field.
  const banana = cases.find(c => c.id === 'banana-mystery');
  assert.ok(editablePaths(banana).includes(`parts.${banana.parts[0].id}.label`));
});

test('content_overlay_keeps_label_knowledge_evidence', async () => {
  const { createContentStore } = await import('../server/content.mjs');
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const store = createContentStore({ cases, dataDir: mkdtempSync(join(tmpdir(), 'dept-overlay-')) });
  store.publish('department-murder', { 'copy.headline': 'Who did it?' }, { by: 'test', baseRev: 0 });
  const cur = store.current('department-murder');
  assert.equal(cur.copy.headline, 'Who did it?');
  assert.deepEqual(cur.characters.map(c => [c.label, c.knowledge]), dept.characters.map(c => [c.label, c.knowledge]));
  assert.deepEqual(cur.evidence, dept.evidence);
});
