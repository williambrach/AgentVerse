import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { Registry, createGameMetrics } from '../server/metrics.mjs';
import * as sources from '../server/monitor-sources.mjs';

// monitor-sources has no producer to fake: it reads the real registry and files.
const dir = t => { const d = mkdtempSync(`${tmpdir()}/override-ms-`); t.after(() => rmSync(d, { recursive: true, force: true })); return d; };
function setup(t) {
  const registry = new Registry();
  const m = createGameMetrics(registry);
  let clock = 0;
  const sampler = sources.createTrafficSampler({ registry, dataDir: dir(t), now: () => clock });
  t.after(() => sampler.close());
  return { m, sampler, at: v => { clock = v; } };
}

test('request rate and shares over the window', t => {
  const { m, sampler, at } = setup(t);
  assert.equal(sampler.sample().reqPerSec, 0);
  for (let i = 0; i < 30; i++) m.httpRequests.inc({ route: '/api/state', status: 200 });
  for (let i = 0; i < 10; i++) m.httpRequests.inc({ route: '/api/start', status: 429 });
  at(10_000);
  const s = sampler.sample();
  assert.deepEqual({ r: s.reqPerSec, n: s.reqs, a: s.share4xx, b: s.share5xx, c: s.share429 }, { r: 4, n: 40, a: 0.25, b: 0, c: 0.25 });
  assert.ok(Number.isFinite(s.loopP99Ms) && s.loopP99Ms >= 0);
  assert.ok(s.rssBytes > 0);
  assert.ok(s.diskFreeBytes === null || typeof s.diskFreeBytes === 'number');
});

test('write failures and rejected credentials age out after five minutes', t => {
  const { m, sampler, at } = setup(t);
  m.logWriteFailures.inc({ kind: 'session' });
  m.llmFailures.inc({ endpoint: 'a', reason: 'credentials_rejected' });
  m.llmFailures.inc({ endpoint: 'a', reason: 'timeout' });
  const s = sampler.sample();
  assert.equal(s.writeFailures5m, 1);
  assert.equal(s.credentialsRejected5m, 1);
  at(301_000);
  const later = sampler.sample();
  assert.equal(later.writeFailures5m, 0);
  assert.equal(later.credentialsRejected5m, 0);
});

test('loadRound reads the last round_started', t => {
  const d = dir(t);
  assert.deepEqual(sources.loadRound(resolve(d, 'none.jsonl')), { label: null, startedAt: 0 });
  const f = resolve(d, 'system.jsonl');
  const rec = (label, startedAt) => JSON.stringify({ type: 'round_started', label, startedAt });
  writeFileSync(f, `${rec('A', 1)}\n{"type":"other"}\n${rec('B', 1793030000000)}\n{"type":"other"}\n`);
  assert.deepEqual(sources.loadRound(f), { label: 'B', startedAt: 1793030000000 });
});

const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ev = (sessionId, ms, sequence) => JSON.stringify({ sessionId, type: 'x', sequence, timestamp: new Date(ms).toISOString() });

test('loadEvents merges files in time then sequence order and skips corrupt ones', t => {
  const d = dir(t);
  const since = 1793030000000;
  writeFileSync(resolve(d, `${uuid(1)}.jsonl`), `${ev(uuid(1), since + 2, 2)}\n${ev(uuid(1), since - 1, 1)}\n`);
  writeFileSync(resolve(d, `${uuid(2)}.jsonl`), `${ev(uuid(2), since + 1, 5)}\n`);
  const bad = resolve(d, `${uuid(3)}.jsonl`);
  writeFileSync(bad, `${ev(uuid(3), since + 3, 1)}\nnot json\n${ev(uuid(3), since + 4, 2)}\n`);
  const old = resolve(d, `${uuid(4)}.jsonl`);
  writeFileSync(old, `${ev(uuid(4), since + 9, 1)}\n`);
  utimesSync(old, 1, 1);
  const got = sources.loadEvents(d, since);
  assert.deepEqual(got.map(e => Date.parse(e.timestamp) - since), [1, 2]);
  assert.equal(sources.loadEvents(resolve(d, 'missing'), since).length, 0);
  assert.match(readFileText(bad), /not json/);
});

import { readFileSync } from 'node:fs';
const readFileText = f => readFileSync(f, 'utf8');

test('readSessionEvents validates the id and returns null when unknown', t => {
  const d = dir(t);
  mkdirSync(d, { recursive: true });
  writeFileSync(resolve(d, `${uuid(1)}.jsonl`), `${ev(uuid(1), 5, 1)}\n`);
  assert.equal(sources.readSessionEvents(d, 'abc'), null);
  assert.equal(sources.readSessionEvents(d, '../../etc/passwd'), null);
  assert.equal(sources.readSessionEvents(d, uuid(9)), null);
  assert.equal(sources.readSessionEvents(d, uuid(1)).length, 1);
});

test('a counter reset never yields negative rates or shares', t => {
  const { m, sampler, at } = setup(t);
  for (let i = 0; i < 5; i++) m.httpRequests.inc({ route: '/x', status: 500 });
  m.logWriteFailures.inc({ kind: 'session' });
  at(1000);
  sampler.sample();
  m.httpRequests.series.clear();
  m.logWriteFailures.series.clear();
  at(2000);
  const s = sampler.sample();
  assert.ok(s.reqPerSec >= 0 && s.reqs >= 0 && s.share5xx >= 0 && s.share5xx <= 1 && s.writeFailures5m >= 0);
});
