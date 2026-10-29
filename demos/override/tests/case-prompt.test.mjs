import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const run = (...args) => spawnSync(process.execPath, ['scripts/case-prompt.mjs', ...args], { cwd, encoding: 'utf8' });

test('prints the system prompt for a case and character', () => {
  const r = run('banana-mystery', 'momo');
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.startsWith('--- system'));
  assert.ok(r.stdout.includes('You play Momo (The planner), a monkey in an authored two-minute banana mystery (banana-authored-v2.0.0, interview-v3).'));
  assert.ok(!r.stdout.includes('the The'));
});

test('rejects bad arguments with usage and exit 2', () => {
  const a = run('nope', 'momo');
  assert.equal(a.status, 2);
  assert.match(a.stderr, /usage:/);
  assert.match(a.stderr, /unknown case: nope/);
  const b = run('banana-mystery', 'momo', '--chapter', '1');
  assert.equal(b.status, 2);
  assert.match(b.stderr, /usage:/);
  const c = run('banana-mystery', 'zed');
  assert.equal(c.status, 2);
  assert.match(c.stderr, /unknown character: zed/);
  const d = run('banana-mystery', 'momo', '--evidence', 'bell');
  assert.equal(d.status, 2);
  assert.match(d.stderr, /usage:/);
});

test('the prompt has no records block and takes only a question', () => {
  const r = run('banana-mystery', 'momo', '--question', 'Why?');
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /PUBLIC RECORDS|presentedEvidence/);
  assert.ok(r.stdout.split('--- user').pop().includes('"question":"Why?"'));
  assert.match(run('banana-mystery', 'momo', '--chapter', '1').stderr, /usage: node scripts\/case-prompt\.mjs <caseId> <characterId> \[--question/);
});
