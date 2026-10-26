import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendJsonl, dataPaths, lastRecord, readJsonl, setWriteObserver } from '../server/dataset.mjs';

function tmp(t) {
  const dir = mkdtempSync(join(tmpdir(), 'override-test-'));
  t.after(() => { setWriteObserver(null); rmSync(dir, { recursive: true, force: true }); });
  return dir;
}

test('dataPaths creates private directories and names the files', t => {
  const root = join(tmp(t), 'live');
  const p = dataPaths(root);
  assert.deepEqual(p, { root, sessions: join(root, 'sessions'), traces: join(root, 'traces'), system: join(root, 'system.jsonl') });
  assert.equal(statSync(p.sessions).mode & 0o777, 0o700);
  assert.ok(existsSync(p.traces));
});

test('torn_tail: repair cuts a partial last line, a missing file is empty', t => {
  const file = join(tmp(t), 'a.jsonl');
  assert.deepEqual(readJsonl(file), []);
  writeFileSync(file, '{"a":1}\n{"b"');
  assert.deepEqual(readJsonl(file), [{ a: 1 }]);
  assert.equal(readFileSync(file, 'utf8'), '{"a":1}\n{"b"', 'no repair, no change');
  assert.deepEqual(readJsonl(file, { repair: true }), [{ a: 1 }]);
  assert.equal(readFileSync(file, 'utf8'), '{"a":1}\n');
  appendJsonl(file, { c: 2 }, 'session');
  assert.deepEqual(readJsonl(file), [{ a: 1 }, { c: 2 }]);
});

test('a torn first line leaves an empty file; a complete line without newline is kept and terminated', t => {
  const file = join(tmp(t), 'a.jsonl');
  writeFileSync(file, '{"a"');
  assert.deepEqual(readJsonl(file, { repair: true }), []);
  assert.equal(readFileSync(file, 'utf8'), '');
  writeFileSync(file, '{"a":1}');
  assert.deepEqual(readJsonl(file, { repair: true }), [{ a: 1 }]);
  assert.equal(readFileSync(file, 'utf8'), '{"a":1}\n');
});

test('a corrupt line that is not the last throws', t => {
  const file = join(tmp(t), 'a.jsonl');
  writeFileSync(file, '{"a":1}\nnope\n{"b":2}\n');
  assert.throws(() => readJsonl(file, { repair: true }), /Corrupt/);
});

test('lastRecord finds the newest match or null', t => {
  const file = join(tmp(t), 'system.jsonl');
  assert.equal(lastRecord(file, () => true), null);
  appendJsonl(file, { type: 'llm_active', active: 'a' }, 'system');
  appendJsonl(file, { type: 'other' }, 'system');
  appendJsonl(file, { type: 'llm_active', active: 'b', pinned: true }, 'system');
  appendJsonl(file, { type: 'other' }, 'system');
  assert.deepEqual(lastRecord(file, r => r.type === 'llm_active'), { type: 'llm_active', active: 'b', pinned: true });
  assert.equal(lastRecord(file, r => r.type === 'none'), null);
});

test('write_observer: reports kind, duration and ok; rethrows when the directory is gone', t => {
  const dir = tmp(t);
  const seen = [];
  setWriteObserver(w => seen.push(w));
  appendJsonl(join(dir, 'a.jsonl'), { a: 1 }, 'trace');
  assert.equal(seen[0].kind, 'trace');
  assert.equal(seen[0].ok, true);
  assert.ok(seen[0].durationMs >= 0);
  assert.equal(statSync(join(dir, 'a.jsonl')).mode & 0o777, 0o600);
  assert.throws(() => appendJsonl(join(dir, 'gone', 'a.jsonl'), { a: 1 }, 'session'), /ENOENT/);
  assert.deepEqual([seen[1].kind, seen[1].ok], ['session', false]);
  setWriteObserver(() => { throw new Error('observer bug'); });
  appendJsonl(join(dir, 'a.jsonl'), { a: 2 }, 'system');
  assert.equal(readJsonl(join(dir, 'a.jsonl')).length, 2);
});
