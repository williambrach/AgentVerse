import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const run = (...args) => spawnSync(process.execPath, ['scripts/case-prompt.mjs', ...args], { cwd, encoding: 'utf8' });

test('prints the system prompt for a case and character', () => {
  const r = run('banana-mystery', 'momo', '--chapter', '1');
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.startsWith('--- system'));
  assert.ok(r.stdout.includes('You play Momo (The planner), a monkey in an authored two-minute banana mystery (banana-authored-v1.0.0, banana-interview-v2).'));
  assert.ok(!r.stdout.includes('the The'));
});

test('rejects bad arguments with usage and exit 2', () => {
  const a = run('nope', 'momo');
  assert.equal(a.status, 2);
  assert.match(a.stderr, /usage:/);
  assert.match(a.stderr, /unknown case: nope/);
  const b = run('banana-mystery', 'momo', '--chapter', '9');
  assert.equal(b.status, 2);
  assert.match(b.stderr, /usage:/);
  const c = run('banana-mystery', 'zed');
  assert.equal(c.status, 2);
  assert.match(c.stderr, /unknown character: zed/);
  const d = run('banana-mystery', 'momo', '--evidence', 'nope');
  assert.equal(d.status, 2);
  assert.match(d.stderr, /usage:/);
});

test('attaches the presented evidence', () => {
  const r = run('banana-mystery', 'momo', '--evidence', 'bell');
  assert.equal(r.status, 0, r.stderr);
  const last = r.stdout.split('--- user').pop();
  assert.ok(last.includes('"id":"bell"'));
});
