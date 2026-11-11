import test from 'node:test';
import assert from 'node:assert/strict';
import { cases } from '../server/cases/index.mjs';
import { ROLES } from '../server/roles.mjs';
import { rawOf, fieldsOf, getPath, setPath, editPathOf } from '../server/content-paths.mjs';

const byId = id => cases.find(c => c.id === id);
const LOCKED = new Set(['id', 'version', 'world', 'status', 'order', 'color', 'role', 'cipher', 'when', 'tools']);

// Count string leaves outside locked keys by an independent walk (lists count one per item).
const leaves = (v, key = null, schema = '') => {
  if (typeof v === 'string') return 1;
  if (typeof v === 'function') return 0;
  if (Array.isArray(v)) return v.reduce((n, x) => n + leaves(x, null, schema), 0);
  if (v && typeof v === 'object') {
    return Object.entries(v).reduce((n, [k, x]) => {
      const child = schema ? `${schema}.${k}` : k;
      return LOCKED.has(k) || child === 'deadline.escapeAt' || child === 'deadline.warnAt' ? n : n + leaves(x, k, child);
    }, 0);
  }
  return 0;
};
const fieldLeaves = fields => fields.reduce((n, f) => n + (f.kind === 'list' ? f.value.length : 1), 0);

test('walks_every_case', () => {
  assert.equal(cases.length, 5);
  for (const k of cases) {
    const raw = rawOf(k);
    const fields = fieldsOf(raw);
    // The two exclusions: part text every character overrides, and per-part knowledge of a talk case (one shared list instead).
    const parts = raw.parts.map(p => {
      const q = { ...p };
      for (const key of ['label', 'introduction', 'quickQuestion']) if (raw.characters.every(c => c[key] !== undefined)) delete q[key];
      if (raw.talk) delete q.knowledge;
      return q;
    });
    const shared = raw.talk ? raw.parts[0].knowledge.length : 0;
    assert.equal(fieldLeaves(fields), leaves({ ...raw, parts, world: undefined }) + shared, k.id);
    const paths = fields.map(f => f.path);
    assert.equal(new Set(paths).size, paths.length, `${k.id} paths unique`);
    for (const p of paths) assert.doesNotMatch(p, /(^|\.)(id|color|role|when|version)$/, p);
    for (const f of fields) assert.deepEqual(getPath(raw, f.path), f.value, `${k.id} ${f.path}`);
  }
});

test('roles_default_materialized', () => {
  const raw = rawOf(byId('banana-mystery'));
  assert.deepEqual(raw.roles, ROLES);
  assert.equal(fieldsOf(raw).find(f => f.path === 'roles.villain.label').value, 'Villain');
  assert.equal(raw.world, byId('banana-mystery').world.id);
  assert.equal(raw.contentHash, undefined);
  assert.equal(typeof raw.rehearsal, 'function');
  raw.roles[0].label = 'x'; // a copy: the frozen original and ROLES stay intact
  assert.equal(ROLES[0].label, 'Villain');
});

test('index_for_idless', () => {
  const raw = rawOf(byId('renaissance-traveler'));
  const f = Object.fromEntries(fieldsOf(raw).map(x => [x.path, x]));
  assert.equal(f['talk.glossary.0.text'].kind, 'text');
  const cid = raw.characters[0].id;
  assert.equal(f[`talk.slips.${cid}.0.line`].kind, 'text');
  assert.equal(f[`talk.rehearsal.${cid}`].kind, 'list');
  assert.ok(f[`talk.topics.${raw.talk.topics[0].id}.label`]);
});

test('legacy_paths_kept', () => {
  const raw = rawOf(byId('banana-mystery'));
  const paths = new Set(fieldsOf(raw).map(f => f.path));
  const pid = raw.parts[0].id;
  for (const p of ['copy.intro.lead', 'prompt.use', `parts.${pid}.finding.classification`, 'debrief.lesson', 'answer.feedback.other', `parts.${pid}.knowledge`]) assert.ok(paths.has(p), p);
  assert.equal(fieldsOf({ id: 'x', title: 'T', characters: [{ id: 'momo', name: 'Momo', color: '#c00' }], prompt: { use: ['a'] } }).length, 3);
  assert.deepEqual(fieldsOf({ id: 'x', title: 'T', characters: [{ id: 'momo', name: 'Momo', color: '#c00' }], prompt: { use: ['a'] } }).map(f => f.path), ['title', 'characters.momo.name', 'prompt.use']);
});

test('set_unknown_throws', () => {
  const raw = rawOf(byId('banana-mystery'));
  assert.throws(() => setPath(raw, 'characters.zz.name', 'x'), { message: 'Unknown field characters.zz.name.' });
  assert.throws(() => setPath(raw, 'characters.zz.name', 'x'), Error);
  assert.throws(() => setPath(raw, `characters.${raw.characters[0].id}.id`, 'x'), /Unknown field/);
  assert.throws(() => setPath(raw, 'deadline.escapeAt', 'x'), /Unknown field/);
  const cid = raw.characters[0].id;
  setPath(raw, `characters.${cid}.name`, 'Neo');
  assert.equal(raw.characters[0].name, 'Neo');
  setPath(raw, 'prompt.use', ['q']);
  assert.deepEqual(getPath(raw, 'prompt.use'), ['q']);
  const pid = raw.parts[1].id;
  setPath(raw, `parts.${pid}.finding.classification`, 'Z');
  assert.equal(raw.parts[1].finding.classification, 'Z');
});

test('edit_path_maps_define_case_paths', () => {
  const raw = rawOf(byId('department-murder'));
  assert.equal(editPathOf(raw, 'characters[0].name'), `characters.${raw.characters[0].id}.name`);
  assert.equal(editPathOf(raw, 'parts[1].knowledge[0]'), `parts.${raw.parts[1].id}.knowledge`);
  assert.equal(editPathOf(raw, 'evidence[0].text'), `evidence.${raw.evidence[0].id}.text`);
  assert.equal(editPathOf(raw, 'roles[1].hint'), `roles.${raw.roles[1].id}.hint`);
  assert.equal(editPathOf(raw, 'prompt.use[1]'), 'prompt.use');
  assert.equal(editPathOf(raw, 'copy.intro.lead'), 'copy.intro.lead');
  assert.equal(editPathOf(raw, 'nope[9]'), null);
  assert.equal(editPathOf(raw, 'characters[99].name'), null);
  assert.equal(editPathOf(raw, 'parts'), null);
  assert.equal(editPathOf(raw, 'characters[0].id'), null);
});

test('dot_index_error', () => {
  const raw = rawOf(byId('renaissance-traveler'));
  const cid = raw.characters[0].id;
  assert.equal(editPathOf(raw, `talk.slips.${cid}.0.line`), `talk.slips.${cid}.0.line`);
  assert.equal(editPathOf(raw, `talk.rehearsal.${cid}`), `talk.rehearsal.${cid}`);
  assert.equal(editPathOf(raw, 'talk.glossary.0.text'), 'talk.glossary.0.text');
  assert.equal(editPathOf(raw, 'talk.topics.0.label'), `talk.topics.${raw.talk.topics[0].id}.label`);
});

test('hidden_part_fields: a part field every character overrides is not a field', () => {
  const dept = fieldsOf(rawOf(byId('department-murder'))).map(f => f.path);
  assert.ok(!dept.includes('parts.killer.label'));
  assert.ok(dept.includes('parts.killer.knowledge'));
  const banana = fieldsOf(rawOf(byId('banana-mystery'))).map(f => f.path);
  assert.ok(banana.some(p => /^parts\.[^.]+\.label$/.test(p)));
});

test('talk_shared_knowledge: talk cases offer only partsKnowledge', () => {
  const raw = rawOf(byId('renaissance-traveler'));
  const fields = fieldsOf(raw);
  assert.equal(fields.filter(f => /^parts\.[^.]+\.knowledge$/.test(f.path)).length, 0);
  assert.equal(fields.find(f => f.path === 'partsKnowledge').kind, 'list');
  assert.deepEqual(getPath(raw, 'partsKnowledge'), raw.parts[0].knowledge);
  assert.equal(editPathOf(raw, 'parts[2].knowledge[0]'), 'partsKnowledge');
  setPath(raw, 'partsKnowledge', ['x']);
  assert.ok(raw.parts.every(p => p.knowledge.length === 1 && p.knowledge[0] === 'x'));
  assert.notEqual(raw.parts[0].knowledge, raw.parts[1].knowledge);
});

test('dotted_and_numeric_ids_fall_back_to_index_paths', () => {
  const raw = { parts: [{ id: 'a.b', label: 'x', knowledge: ['k'] }, { id: '0', label: 'y', knowledge: ['k'] }, { id: 'c', label: 'z', knowledge: ['k'] }] };
  const paths = fieldsOf(raw).map(f => f.path);
  assert.deepEqual(paths.filter(p => p.endsWith('.label')), ['parts.0.label', 'parts.1.label', 'parts.c.label']);
  setPath(raw, 'parts.0.label', 'new');
  setPath(raw, 'parts.1.label', 'new2');
  assert.deepEqual(raw.parts.map(p => p.label), ['new', 'new2', 'z']);
});

test('no_prompts_fields', async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { cases } = await import('../server/cases/index.mjs');
  const { createContentStore } = await import('../server/content.mjs');
  const store = createContentStore({ cases, dataDir: mkdtempSync(join(tmpdir(), 'np-d-')), contentDir: mkdtempSync(join(tmpdir(), 'np-c-')), uiDefaults: {} });
  const id = cases[0].id;
  store.publish('game', { 'prompt.interview': store.fields('game').authored['prompt.interview'] + ' x' }, { by: 'a', baseRev: 0 });
  const f = store.fields(id);
  assert.deepEqual(Object.keys(f.current), Object.keys(f.authored));
});
