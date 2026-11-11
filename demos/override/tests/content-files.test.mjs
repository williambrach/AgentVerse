import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cases } from '../server/cases/index.mjs';
import { createContentStore, ContentError } from '../server/content.mjs';
import { rawOf } from '../server/content-paths.mjs';

const uiDefaults = { 'tools.talk': 'Let them talk', 'tools.coins': '{n} coins' };
const banana = cases.find(c => c.id === 'banana-mystery');
const renaissance = cases.find(c => c.id === 'renaissance-traveler');
const first = banana.characters[0].id;
const make = (dirs = { data: mkdtempSync(join(tmpdir(), 'cf-data-')), content: mkdtempSync(join(tmpdir(), 'cf-content-')) }) => ({
  ...dirs, store: createContentStore({ cases, dataDir: dirs.data, contentDir: dirs.content, uiDefaults }),
});
const fail = (fn, status, path) => assert.throws(fn, e => e instanceof ContentError && e.status === status && (path === undefined || e.path === path), `expected ${status} ${path}`);
const caseFile = dirs => join(dirs.content, 'cases', 'banana-mystery.json');
const logFile = (dirs, id = 'banana-mystery') => join(dirs.data, 'content', `${id}.jsonl`);
const lines = file => readFileSync(file, 'utf8').trim().split('\n').map(l => JSON.parse(l));

test('publish_writes_tracked_file', () => {
  const d = make();
  assert.equal(existsSync(join(d.content, 'cases')), false, 'no folder before the first write');
  const edits = { [`characters.${first}.name`]: 'Mo', 'copy.headline': 'Zed' };
  d.store.publish('banana-mystery', edits, { by: 'admin', baseRev: 0 });
  const text = readFileSync(caseFile(d), 'utf8');
  assert.equal(text, `${JSON.stringify({ id: 'banana-mystery', version: banana.version, edits: { [`characters.${first}.name`]: 'Mo', 'copy.headline': 'Zed' } }, null, 2)}\n`);
  assert.deepEqual(readdirSync(join(d.content, 'cases')), ['banana-mystery.json'], 'no tmp file left');
  assert.equal(d.store.current('banana-mystery').characters[0].name, 'Mo');
});

test('restore_authored_deletes_file', () => {
  const d = make();
  d.store.publish('banana-mystery', { 'copy.headline': 'Zed' }, { by: 'a', baseRev: 0 });
  assert.ok(existsSync(caseFile(d)));
  d.store.revert('banana-mystery', 0, { by: 'a' });
  assert.equal(existsSync(caseFile(d)), false);
  assert.equal(d.store.current('banana-mystery'), banana);
});

test('boot_reads_file', () => {
  const d = make();
  d.store.publish('banana-mystery', { [`characters.${first}.name`]: 'Mo' }, { by: 'a', baseRev: 0 });
  const again = make(d).store;
  assert.equal(again.current('banana-mystery').characters[0].name, 'Mo');
  assert.equal(again.info('banana-mystery').rev, 1);
  assert.equal(lines(logFile(d)).length, 1, 'file equals the log: nothing appended');
  // A file with an empty log appends a revision by 'file'.
  const e = { data: mkdtempSync(join(tmpdir(), 'cf-data-')), content: d.content };
  const fromFile = make(e).store;
  assert.equal(fromFile.current('banana-mystery').characters[0].name, 'Mo');
  const [rec] = lines(logFile(e));
  assert.equal(rec.by, 'file'); assert.equal(rec.rev, 1); assert.deepEqual(rec.fields, [`characters.${first}.name`]);
  assert.equal(fromFile.info('banana-mystery').rev, 1);
  // Removing the file and restarting returns to authored and records it.
  rmFile(d);
  const gone = make(d).store;
  assert.equal(gone.current('banana-mystery'), banana);
  assert.equal(lines(logFile(d)).at(-1).edits, null);
  assert.equal(gone.info('banana-mystery').rev, 2);
  assert.equal(make(d).store.current('banana-mystery'), banana, 'stays authored on the next boot');
});
const rmFile = d => rmSync(caseFile(d));

test('legacy_import', () => {
  const dirs = { data: mkdtempSync(join(tmpdir(), 'cf-data-')), content: mkdtempSync(join(tmpdir(), 'cf-content-')) };
  mkdirSync(join(dirs.data, 'content'));
  const rec = { type: 'content_revision', caseId: 'banana-mystery', version: banana.version, rev: 1, timestamp: 't', by: 'old', edits: { 'copy.headline': 'Legacy' }, contentHash: 'x', fields: [] };
  writeFileSync(logFile(dirs), `${JSON.stringify(rec)}\n`);
  const store = make(dirs).store;
  assert.equal(store.current('banana-mystery').copy.headline, 'Legacy');
  assert.deepEqual(JSON.parse(readFileSync(caseFile(dirs), 'utf8')).edits, { 'copy.headline': 'Legacy' });
  assert.equal(lines(logFile(dirs)).length, 2);
  assert.equal(store.info('banana-mystery').rev, 2);
});

test('legacy_import_once_then_removable', () => {
  const dirs = { data: mkdtempSync(join(tmpdir(), 'cf-data-')), content: mkdtempSync(join(tmpdir(), 'cf-content-')) };
  mkdirSync(join(dirs.data, 'content'));
  const rec = { type: 'content_revision', caseId: 'banana-mystery', version: banana.version, rev: 1, timestamp: 't', by: 'old', edits: { 'copy.headline': 'Legacy' }, contentHash: 'x', fields: [] };
  writeFileSync(logFile(dirs), `${JSON.stringify(rec)}\n`);
  make(dirs);
  const ls = lines(logFile(dirs));
  assert.equal(ls.at(-1).tracked, true);
  rmSync(caseFile(dirs));
  const store = make(dirs).store;
  assert.equal(store.current('banana-mystery'), banana);
  assert.equal(existsSync(caseFile(dirs)), false);
});

test('matching_file_marks_legacy_log_tracked', () => {
  const dirs = { data: mkdtempSync(join(tmpdir(), 'cf-data-')), content: mkdtempSync(join(tmpdir(), 'cf-content-')) };
  mkdirSync(join(dirs.data, 'content'));
  mkdirSync(join(dirs.content, 'cases'), { recursive: true });
  const edits = { 'copy.headline': 'Legacy' };
  const rec = { type: 'content_revision', caseId: 'banana-mystery', version: banana.version, rev: 1, timestamp: 't', by: 'old', edits, contentHash: 'x', fields: [] };
  writeFileSync(logFile(dirs), `${JSON.stringify(rec)}\n`);
  const seed = make(dirs).store; // imports and writes the tracked file
  rmSync(logFile(dirs));
  writeFileSync(logFile(dirs), `${JSON.stringify(rec)}\n`);
  assert.deepEqual(JSON.parse(readFileSync(caseFile(dirs), 'utf8')).edits, edits);
  make(dirs);
  const ls = lines(logFile(dirs));
  assert.equal(ls.length, 2);
  assert.equal(ls[1].tracked, true);
  rmFile(dirs);
  const store = make(dirs).store;
  assert.equal(store.current('banana-mystery'), banana);
  assert.equal(existsSync(caseFile(dirs)), false);
  const n = lines(logFile(dirs)).length;
  make(dirs);
  assert.equal(lines(logFile(dirs)).length, n);
  assert.ok(seed);
});

test('version_mismatch_stale', () => {
  const d = make();
  mkdirSync(join(d.content, 'cases'), { recursive: true });
  const bytes = `${JSON.stringify({ id: 'banana-mystery', version: 'banana-v0', edits: { 'copy.headline': 'Old' } }, null, 2)}\n`;
  writeFileSync(caseFile(d), bytes);
  const store = make(d).store;
  assert.equal(store.current('banana-mystery'), banana);
  assert.equal(store.info('banana-mystery').stale, true);
  assert.equal(readFileSync(caseFile(d), 'utf8'), bytes);
  assert.equal(existsSync(logFile(d)), false, 'nothing logged for a stale file');
  store.publish('banana-mystery', { 'copy.headline': 'New' }, { by: 'a', baseRev: 0 });
  assert.equal(JSON.parse(readFileSync(caseFile(d), 'utf8')).version, banana.version);
  assert.equal(store.info('banana-mystery').stale, false);
});

test('identity_unedited', () => {
  const { store } = make();
  for (const c of cases) { assert.equal(store.current(c.id), c); assert.equal(store.base(c.id), c); }
  assert.deepEqual(store.list(), cases);
  assert.deepEqual(store.uiText(), {});
});

test('locked_400', () => {
  const { store } = make();
  fail(() => store.publish('banana-mystery', { [`characters.${first}.id`]: 'zz' }, { by: 'a', baseRev: 0 }), 400, `characters.${first}.id`);
  fail(() => store.publish('banana-mystery', { 'characters.zz.name': 'x' }, { by: 'a', baseRev: 0 }), 400, 'characters.zz.name');
  assert.throws(() => store.publish('banana-mystery', { 'nope': 'x' }, { by: 'a', baseRev: 0 }), { message: 'Unknown field nope.' });
});

test('define_error_maps', () => {
  const { store } = make();
  const cid = renaissance.characters[0].id;
  const slip = renaissance.talk.slips[cid][0];
  const raw = rawOf(renaissance);
  assert.ok(raw.talk.slips[cid][0].line.includes(slip.term));
  fail(() => store.preview('renaissance-traveler', { [`talk.slips.${cid}.0.line`]: 'Nothing relevant here at all' }), 400, `talk.slips.${cid}.0.line`);
  fail(() => store.preview('banana-mystery', { 'parts.zz.knowledge': ['x'] }), 400, 'parts.zz.knowledge');
});

test('game_rebuilds_cases', () => {
  const d = make();
  const tpl = d.store.fields('game').authored['prompt.interview'].replace(/^/, 'Custom rule. ');
  const r = d.store.publish('game', { 'prompt.interview': tpl, 'ui.tools.talk': 'Chat' }, { by: 'admin', baseRev: 0 });
  assert.equal(r.rev, 1);
  const cur = d.store.current('banana-mystery');
  assert.equal(cur.prompts.interview, tpl);
  assert.match(cur.prompts.interviewVersion, /^interview-v5\+[0-9a-f]{8}$/);
  assert.equal(d.store.base('banana-mystery').prompts, undefined);
  assert.equal(cur.contentHash, banana.contentHash, 'prompts are not hashed');
  assert.equal(d.store.list()[0], cur);
  assert.deepEqual(d.store.uiText(), { 'tools.talk': 'Chat' });
  assert.deepEqual(JSON.parse(readFileSync(join(d.content, 'game.json'), 'utf8')), { id: 'game', edits: { 'prompt.interview': tpl, 'ui.tools.talk': 'Chat' } });
  // A case edit composes with the game edit.
  d.store.publish('banana-mystery', { 'copy.headline': 'Both' }, { by: 'a', baseRev: 0 });
  assert.equal(d.store.current('banana-mystery').prompts.interview, tpl);
  // Boot restores both.
  const again = make(d).store;
  assert.equal(again.current('banana-mystery').prompts.interview, tpl);
  assert.equal(again.current('banana-mystery').copy.headline, 'Both');
  assert.deepEqual(again.uiText(), { 'tools.talk': 'Chat' });
  // Reverting the game doc returns the other cases to authored.
  d.store.revert('game', 0, { by: 'a' });
  assert.equal(d.store.current('factory-escape'), cases.find(c => c.id === 'factory-escape'));
  assert.equal(existsSync(join(d.content, 'game.json')), false);
  assert.deepEqual(d.store.uiText(), {});
});

test('game_validation', () => {
  const { store } = make();
  fail(() => store.publish('game', { 'ui.nope': 'x' }, { by: 'a', baseRev: 0 }), 400, 'ui.nope');
  fail(() => store.publish('game', { 'prompt.interview': 'no slot' }, { by: 'a', baseRev: 0 }), 400, 'prompt.interview');
  fail(() => store.publish('game', { 'ui.tools.coins': '{foo}' }, { by: 'a', baseRev: 0 }), 400, 'ui.tools.coins');
  fail(() => store.preview('game', {}), 409);
  fail(() => store.publish('game', { 'ui.tools.talk': 'x' }, { by: 'a', baseRev: 3 }), 409);
  const info = store.info('game');
  assert.deepEqual([info.id, info.title, info.version, info.rev, info.by, info.stale, info.corrupt, info.skipped], ['game', 'Game text', null, 0, null, false, false, []]);
  assert.deepEqual(Object.keys(store.structure('game')), ['characters', 'parts', 'world', 'placeholders', 'areas', 'worlds']);
  assert.deepEqual(store.structure('game').areas, ['tools']);
  const f = store.fields('game');
  assert.deepEqual(f.order, Object.keys(f.authored));
  assert.equal(f.authored['ui.tools.talk'], 'Let them talk');
});

test('game_skipped', () => {
  const d = make();
  writeFileSync(join(d.content, 'game.json'), `${JSON.stringify({ id: 'game', edits: { 'ui.nope': 'x', 'ui.tools.talk': 'Chat' } })}\n`);
  const store = make(d).store;
  assert.deepEqual(store.info('game').skipped, ['ui.nope']);
  assert.deepEqual(store.uiText(), { 'tools.talk': 'Chat' });
});

test('fields_has_order', () => {
  const { store } = make();
  const f = store.fields('banana-mystery');
  assert.equal(f.order[0], 'title');
  assert.equal(f.authored.title, banana.title);
  assert.deepEqual(f.current, f.authored);
});
