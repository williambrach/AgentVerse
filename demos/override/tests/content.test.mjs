import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineCase } from '../server/cases.mjs';
import { createContentStore, ContentError, editablePaths } from '../server/content.mjs';
import { partCase, agentWorlds } from './fixtures/minimal-case.mjs';

const worlds = agentWorlds(3);
const make = (dir = mkdtempSync(join(tmpdir(), 'content-')), opts = {}) => {
  const kase = defineCase(partCase, { worlds });
  return { dir, kase, store: createContentStore({ cases: [kase], dataDir: dir, worlds, ...opts }) };
};
const fail = (fn, status, path) => assert.throws(fn, e => e instanceof ContentError && e.status === status && (path === undefined || e.path === path), `expected ${status} ${path}`);
const file = dir => join(dir, 'content', 'mini-parts.jsonl');

test('identity_when_unedited', () => {
  const { store, kase } = make();
  assert.equal(store.current('mini-parts'), kase);
  assert.equal(store.base('mini-parts'), kase);
  assert.equal(store.list()[0], kase);
  assert.deepEqual(store.info('mini-parts'), { id: 'mini-parts', title: 'Mini Parts', version: 'mini-parts-v1', status: 'ready', world: 'grove', rev: 0, by: null, editedAt: null, contentHash: kase.contentHash, baseContentHash: kase.contentHash, stale: false, corrupt: false });
});

test('content_folder_is_private', () => {
  const { dir } = make();
  assert.equal(statSync(join(dir, 'content')).mode & 0o777, 0o700);
});

test('merge_new_hash_and_text', () => {
  const { store, kase } = make();
  const r = store.publish('mini-parts', { 'copy.intro.lead': 'New lead', 'parts.boss.knowledge': ['one', 'two {helper}'] }, { by: 'alice', baseRev: 0 });
  assert.equal(r.rev, 1);
  assert.match(r.contentHash, /^[0-9a-f]{12}$/);
  assert.notEqual(r.contentHash, kase.contentHash);
  assert.deepEqual(r.fields, ['copy.intro.lead', 'parts.boss.knowledge']);
  const cur = store.current('mini-parts');
  assert.equal(cur.copy.intro.lead, 'New lead');
  assert.deepEqual(cur.parts[0].knowledge, ['one', 'two {helper}']);
  assert.equal(cur.parts[0].role, 'villain');
  assert.equal(cur.contentHash, r.contentHash);
  assert.equal(store.list()[0], cur);
  assert.equal(typeof cur.rehearsal, 'function');
  assert.equal(store.fields('mini-parts').authored['copy.intro.lead'], 'L1\nL2');
  assert.equal(store.fields('mini-parts').current['copy.intro.lead'], 'New lead');
  assert.deepEqual(Object.keys(store.fields('mini-parts').authored), editablePaths(kase));
  const info = store.info('mini-parts');
  assert.equal(info.rev, 1); assert.equal(info.by, 'alice'); assert.match(info.editedAt, /^\d{4}-/);
});

test('history_has_no_text', () => {
  const { store } = make();
  store.publish('mini-parts', { 'copy.headline': 'SECRETWORD' }, { by: 'a', baseRev: 0 });
  const h = store.history('mini-parts');
  assert.deepEqual(Object.keys(h[0]).sort(), ['by', 'contentHash', 'fields', 'rev', 'revertOf', 'timestamp']);
  assert.equal(JSON.stringify(h).includes('SECRETWORD'), false);
});

test('validation_names_path', () => {
  const { store } = make();
  const p = edits => () => store.preview('mini-parts', edits);
  fail(p({ 'parts.boss.role': 'honest' }), 400, 'parts.boss.role');
  fail(p({ 'nope': 'x' }), 400, 'nope');
  fail(p({ 'copy.headline': 5 }), 400, 'copy.headline');
  fail(p({ 'prompt.use': 'x' }), 400, 'prompt.use');
  fail(p({ 'prompt.use': ['']}), 400, 'prompt.use');
  fail(p({ 'prompt.avoid': Array(31).fill('x') }), 400, 'prompt.avoid');
  fail(p({ 'parts.boss.knowledge': [] }), 400, 'parts.boss.knowledge');
  fail(p({ 'parts.boss.knowledge': Array(21).fill('x') }), 400, 'parts.boss.knowledge');
  fail(p({ 'copy.headline': '' }), 400, 'copy.headline');
  fail(p({ 'debrief.summary': 'oops {ghost}' }), 400, 'debrief.summary');
  fail(p({ 'parts.helper.knowledge': ['ok', 'bad {ghost}'] }), 400, 'parts.helper.knowledge');
  fail(p({ 'parts.helper.finding.explanation': 'bad {ghost}' }), 400, 'parts.helper.finding.explanation');
  fail(p([]), 400);
  assert.throws(() => store.preview('mini-parts', { 'debrief.summary': 'oops {ghost}' }), /ghost/);
  fail(() => store.info('nope'), 404);
});

test('string_over_2000_chars_400', () => {
  const { store } = make();
  fail(() => store.preview('mini-parts', { 'copy.headline': 'x'.repeat(2001) }), 400, 'copy.headline');
  assert.equal(store.preview('mini-parts', { 'copy.headline': 'x'.repeat(2000) }).copy.headline.length, 2000);
  fail(() => store.preview('mini-parts', { 'prompt.use': ['x'.repeat(2001)] }), 400, 'prompt.use');
});

test('preview_is_not_persisted', () => {
  const { store, dir } = make();
  const c = store.preview('mini-parts', { 'copy.headline': 'Draft' });
  assert.equal(c.copy.headline, 'Draft');
  assert.equal(store.current('mini-parts').copy.headline, 'H');
  assert.throws(() => readFileSync(file(dir)));
});

test('publish_stale_base_rev_409', () => {
  const { store } = make();
  store.publish('mini-parts', { 'copy.headline': 'A' }, { by: 'a', baseRev: 0 });
  fail(() => store.publish('mini-parts', { 'copy.headline': 'B' }, { by: 'b', baseRev: 0 }), 409);
  assert.equal(store.current('mini-parts').copy.headline, 'A');
});

test('empty_overlay_is_null', () => {
  const { store, dir, kase } = make();
  assert.deepEqual(store.publish('mini-parts', {}, { by: 'a', baseRev: 0 }), { rev: 0, contentHash: kase.contentHash, fields: [] });
  assert.deepEqual(store.publish('mini-parts', { 'copy.headline': 'H' }, { by: 'a', baseRev: 0 }), { rev: 0, contentHash: kase.contentHash, fields: [] });
  assert.throws(() => readFileSync(file(dir)));
  store.publish('mini-parts', { 'copy.headline': 'A' }, { by: 'a', baseRev: 0 });
  const same = store.publish('mini-parts', { 'copy.headline': 'A' }, { by: 'a', baseRev: 1 });
  assert.equal(same.rev, 1); assert.deepEqual(same.fields, []);
  const back = store.publish('mini-parts', { 'copy.headline': 'H' }, { by: 'a', baseRev: 1 });
  assert.equal(back.rev, 2);
  assert.equal(back.contentHash, kase.contentHash);
  assert.equal(store.current('mini-parts'), kase);
  assert.equal(JSON.parse(readFileSync(file(dir), 'utf8').trim().split('\n')[1]).edits, null);
});

test('revert_restores_hash', () => {
  const { store, kase } = make();
  const a = store.publish('mini-parts', { 'copy.headline': 'A' }, { by: 'a', baseRev: 0 });
  store.publish('mini-parts', { 'copy.headline': 'B' }, { by: 'a', baseRev: 1 });
  const r = store.revert('mini-parts', 1, { by: 'bob' });
  assert.deepEqual(r, { rev: 3, contentHash: a.contentHash, fields: ['copy.headline'], revertOf: 1 });
  assert.equal(store.current('mini-parts').copy.headline, 'A');
  const z = store.revert('mini-parts', 0, { by: 'bob' });
  assert.equal(z.rev, 4); assert.equal(z.contentHash, kase.contentHash); assert.equal(z.revertOf, 0);
  assert.equal(store.current('mini-parts'), kase);
  fail(() => store.revert('mini-parts', 9, { by: 'x' }), 404);
  assert.equal(store.history('mini-parts').at(-1).revertOf, 0);
});

test('boot_replays_last_record', () => {
  const { store, dir } = make();
  store.publish('mini-parts', { 'copy.headline': 'A' }, { by: 'a', baseRev: 0 });
  const r2 = store.publish('mini-parts', { 'copy.headline': 'B C', 'prompt.use': ['x'] }, { by: 'a', baseRev: 1 });
  const again = make(dir).store;
  assert.equal(again.current('mini-parts').copy.headline, 'B C');
  assert.equal(again.info('mini-parts').rev, 2);
  assert.equal(again.info('mini-parts').contentHash, r2.contentHash);
  assert.equal(again.history('mini-parts').length, 2);
  assert.equal(again.publish('mini-parts', { 'copy.headline': 'D' }, { by: 'a', baseRev: 2 }).rev, 3);
});

test('stale_version_record_skipped', () => {
  const dir = mkdtempSync(join(tmpdir(), 'content-'));
  mkdirSync(join(dir, 'content'));
  writeFileSync(file(dir), `${JSON.stringify({ type: 'content_revision', caseId: 'mini-parts', version: 'mini-parts-v0', rev: 1, timestamp: 't', by: 'a', edits: { 'copy.headline': 'OLD' }, contentHash: 'x', fields: [] })}\n`);
  const { store, kase } = make(dir);
  assert.equal(store.current('mini-parts'), kase);
  const info = store.info('mini-parts');
  assert.equal(info.rev, 0); assert.equal(info.stale, false);
  assert.equal(store.history('mini-parts').length, 0);
});

test('invalid_overlay_marks_stale', () => {
  const dir = mkdtempSync(join(tmpdir(), 'content-'));
  mkdirSync(join(dir, 'content'));
  const rec = { type: 'content_revision', caseId: 'mini-parts', version: 'mini-parts-v1', rev: 1, timestamp: 't', by: 'a', edits: { 'debrief.summary': 'no {ghost}' }, contentHash: 'x', fields: [] };
  writeFileSync(file(dir), `${JSON.stringify(rec)}\n`);
  const { store, kase } = make(dir);
  assert.equal(store.current('mini-parts'), kase);
  assert.equal(store.info('mini-parts').stale, true);
  const ok = store.publish('mini-parts', { 'copy.headline': 'Fix' }, { by: 'a', baseRev: store.info('mini-parts').rev });
  assert.equal(ok.rev, 2);
  assert.equal(store.info('mini-parts').stale, false);
});

test('boot_survives_garbage_and_partial_line', () => {
  const dir = mkdtempSync(join(tmpdir(), 'content-'));
  mkdirSync(join(dir, 'content'));
  const rec = { type: 'content_revision', caseId: 'mini-parts', version: 'mini-parts-v1', rev: 1, timestamp: 't', by: 'a', edits: { 'copy.headline': 'Kept' }, contentHash: 'x', fields: [] };
  writeFileSync(file(dir), `${JSON.stringify(rec)}\n{"type":"cont`);
  assert.equal(make(dir).store.current('mini-parts').copy.headline, 'Kept');
  writeFileSync(file(dir), 'not json\n{"a":1}\n');
  const info = make(dir).store.info('mini-parts');
  assert.equal(info.rev, 0); assert.equal(info.corrupt, true); assert.equal(info.stale, false);
});

test('corrupt_line_keeps_revisions_and_never_repeats_a_rev', () => {
  const { store, dir } = make();
  const r1 = store.publish('mini-parts', { 'copy.headline': 'A' }, { by: 'a', baseRev: 0 });
  store.publish('mini-parts', { 'copy.headline': 'B' }, { by: 'a', baseRev: 1 });
  appendFileSync(file(dir), 'garbage\n');
  // Trailing garbage with a newline: revs 1 and 2 survive and the next publish is rev 3, not a second rev 1.
  let again = make(dir).store;
  let info = again.info('mini-parts');
  assert.equal(info.rev, 2); assert.equal(info.corrupt, true); assert.equal(info.stale, false);
  assert.equal(again.current('mini-parts').copy.headline, 'B');
  assert.equal(again.history('mini-parts').length, 2);
  assert.equal(again.publish('mini-parts', { 'copy.headline': 'C' }, { by: 'a', baseRev: 2 }).rev, 3);
  // Garbage in the middle: the revision after it is kept too, and restore of rev 1 finds the real rev 1.
  again = make(dir).store;
  info = again.info('mini-parts');
  assert.equal(info.rev, 3); assert.equal(info.by, 'a'); assert.equal(info.corrupt, true);
  assert.equal(again.current('mini-parts').copy.headline, 'C');
  assert.deepEqual(again.history('mini-parts').map(h => h.rev), [1, 2, 3]);
  const back = again.revert('mini-parts', 1, { by: 'b' });
  assert.equal(back.rev, 4); assert.equal(back.contentHash, r1.contentHash);
  assert.equal(again.current('mini-parts').copy.headline, 'A');
  assert.equal(again.info('mini-parts').corrupt, true, 'the flag stays until the file is repaired');
  assert.equal(JSON.parse(readFileSync(file(dir), 'utf8').trim().split('\n').at(-1)).rev, 4);
});

test('corrupt_line_plus_partial_last_line_does_not_glue_the_next_append', () => {
  const { store, dir } = make();
  store.publish('mini-parts', { 'copy.headline': 'A' }, { by: 'a', baseRev: 0 });
  appendFileSync(file(dir), 'garbage\n{"type":"cont');
  const again = make(dir).store;
  assert.equal(again.info('mini-parts').rev, 1); assert.equal(again.info('mini-parts').corrupt, true);
  assert.equal(again.publish('mini-parts', { 'copy.headline': 'B' }, { by: 'a', baseRev: 1 }).rev, 2);
  const third = make(dir).store;
  assert.equal(third.info('mini-parts').rev, 2);
  assert.equal(third.current('mini-parts').copy.headline, 'B');
  assert.deepEqual(third.history('mini-parts').map(h => h.rev), [1, 2]);
});

test('structure_lists_locked_facts', () => {
  const { store } = make();
  assert.deepEqual(store.structure('mini-parts'), {
    characters: [{ id: 'momo', name: 'Momo', color: '#cb7656' }, { id: 'pip', name: 'Pip', color: '#5c9ca4' }, { id: 'nori', name: 'Nori', color: '#a393ba' }],
    parts: [{ id: 'boss', role: 'villain' }, { id: 'helper', role: 'fooled' }, { id: 'bystander', role: 'honest' }],
    world: { id: 'grove', place: 'Banana Grove', agents: 3 },
    placeholders: ['{boss}', '{helper}', '{bystander}'],
  });
});
