import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { Registry, bindCollectors, createGameMetrics, observeGameEvent, observeLlmEvent, observeWrite } from '../server/metrics.mjs';

// Fakes return the producers' e.g. values; SUPERLITE_REAL=1 swaps in the real router and sessions.
async function sources(t) {
  const dataDir = mkdtempSync(`${tmpdir()}/override-test-`);
  t.after(() => rmSync(dataDir, { recursive: true, force: true }));
  if (process.env.SUPERLITE_REAL === '1') {
    const [{ LlmRouter }, { Investigations }, { modelConfig }] = await Promise.all([import('../server/llm.mjs'), import('../server/session.mjs'), import('../server/interviews.mjs')]);
    const router = new LlmRouter({ endpoints: [{ name: 'a', baseUrl: 'https://a.test/v1', model: 'model-a', key: 'k', maxInFlight: 50, tokenParam: 'max_completion_tokens', timeoutMs: 25000, temperature: null }], maxInFlight: 200, deadlineMs: 60000, maxCompletionTokens: 2048, failover: { failures: 5, windowMs: 30000 }, fetcher: async () => { throw new Error('no network'); }, onSystem() {}, onTrace() {}, onEvent() {} });
    const investigations = new Investigations({ dataDir, config: modelConfig({}) });
    await investigations.mutate(undefined, 'start');
    return { router, investigations, dataDir };
  }
  return {
    dataDir,
    router: { snapshot: () => ({ active: 'a', pinned: false, inFlight: 0, queued: 0, maxInFlight: 200, endpoints: [{ name: 'a', model: 'model-a', apiBaseHost: 'a.test', inFlight: 0, maxInFlight: 50, queued: 0, lastSuccessAt: null, lastFailureAt: null, lastFailureReason: null, failures5m: 0 }] }) },
    investigations: { stats: () => ({ games: 2, waiting: 1, paused: false, byStage: { started: 1, clues: 0, interviewed: 0, verdict: 1 } }) },
  };
}

test('counter and histogram render the documented text', () => {
  const r = new Registry();
  r.counter('x_total', 'X', ['route']).inc({ route: '/api/state' });
  const out = r.render();
  assert.match(out, /# TYPE x_total counter/);
  assert.match(out, /^x_total\{route="\/api\/state"\} 1$/m);
  const r2 = new Registry();
  r2.histogram('h', 'H', [], [0.1, 1]).observe({}, 0.3);
  const text = r2.render();
  for (const line of ['h_bucket{le="0.1"} 0', 'h_bucket{le="1"} 1', 'h_bucket{le="+Inf"} 1', 'h_sum 0.3', 'h_count 1']) assert.ok(text.includes(`${line}\n`), line);
});

test('label_escaping: quote, backslash and newline are escaped', () => {
  const r = new Registry();
  r.counter('e_total', 'help with \\ and\nnewline', ['v']).inc({ v: 'a"b\\c\nd' });
  const out = r.render();
  assert.ok(out.includes('e_total{v="a\\"b\\\\c\\nd"} 1'), out);
  assert.ok(out.includes('# HELP e_total help with \\\\ and\\nnewline'));
  assert.equal(out.split('\n').filter(l => l.startsWith('e_total')).length, 1, 'a newline must not split a sample');
});

test('numeric: counters reject bad increments, gauges skip non-finite values, large numbers stay parseable', () => {
  const r = new Registry();
  const c = r.counter('n_total', 'N', []);
  assert.throws(() => c.inc({}, -1));
  assert.throws(() => c.inc({}, NaN));
  c.inc({}, 1e21);
  let v = NaN;
  r.gauge('g', 'G', [], () => v);
  r.gauge('g2', 'G2', [], () => 1e-7);
  r.histogram('hh', 'H', [], [1]).observe({}, NaN);
  const out = r.render();
  assert.match(out, /^n_total 1e\+21$/m);
  assert.doesNotMatch(out, /^g /m);
  assert.match(out, /^g2 1e-7$/m);
  assert.doesNotMatch(out, /NaN/);
  v = Infinity;
  assert.doesNotMatch(r.render(), /^g /m);
});

test('an unlabelled counter renders 0 before use; duplicate names are refused', () => {
  const r = new Registry();
  r.counter('z_total', 'Z', []);
  assert.match(r.render(), /^z_total 0$/m);
  assert.throws(() => r.counter('z_total', 'Z', []), /already registered/);
  assert.throws(() => r.counter('bad name', 'Z', []), /Invalid/);
});

test('createGameMetrics and the observers update the documented series', () => {
  const r = new Registry();
  const m = createGameMetrics(r);
  assert.deepEqual(Object.keys(m).sort(), ['httpDuration', 'httpRequests', 'llmDuration', 'llmFailovers', 'llmFailures', 'llmSemanticRetries', 'logWriteDuration', 'logWriteFailures', 'sessionsCompleted', 'sessionsStarted', 'staticBytes']);
  observeLlmEvent(m, { type: 'failover', from: 'a', to: 'b', reason: 'auto' });
  observeLlmEvent(m, { type: 'attempt', endpoint: 'a', ok: false, reason: 'request_failed', durationMs: 30, semantic: false });
  observeLlmEvent(m, { type: 'attempt', endpoint: 'a', ok: false, reason: 'empty_or_invalid_answer', durationMs: 500, semantic: true });
  observeGameEvent(m, { type: 'session_started' });
  observeGameEvent(m, { type: 'verdict_submitted' });
  observeGameEvent(m, { type: 'story_revealed' });
  observeWrite(m, { kind: 'session', durationMs: 2, ok: true });
  observeWrite(m, { kind: 'trace', durationMs: 4, ok: false });
  const out = r.render();
  for (const line of [
    'override_llm_failovers_total{from="a",to="b",reason="auto"} 1',
    'override_llm_failures_total{endpoint="a",reason="request_failed"} 1',
    'override_llm_semantic_retries_total{reason="empty_or_invalid_answer"} 1',
    'override_llm_request_duration_seconds_count{endpoint="a"} 2',
    'override_sessions_started_total 1', 'override_sessions_completed_total 1',
    'override_log_write_failures_total{kind="trace"} 1',
    'override_log_write_duration_seconds_count{kind="session"} 1',
    'override_static_bytes_total 0',
  ]) assert.ok(out.includes(`${line}\n`), line);
});

test('collectors_from_sources and valid_exposition', async t => {
  const r = new Registry();
  createGameMetrics(r);
  bindCollectors(r, await sources(t));
  const out = r.render();
  if (process.env.SUPERLITE_REAL !== '1') {
    assert.ok(out.includes('override_llm_active_endpoint{endpoint="a"} 1\n'));
    assert.ok(out.includes('override_sessions_by_stage{stage="verdict"} 1\n'));
    assert.ok(out.includes('override_sessions_active 2\n'));
  }
  assert.ok(out.includes('override_llm_in_flight{endpoint="a"} 0\n'));
  assert.ok(out.includes('override_llm_pinned 0\n'));
  assert.match(out, /^override_disk_free_bytes [0-9.e+]+$/m);
  for (const name of ['event_loop_delay_p99_seconds', 'resident_memory_bytes', 'heap_used_bytes']) assert.match(out, new RegExp(`^override_process_${name} `, 'm'));
  const sample = /^[a-z_:][a-z0-9_:]*(\{.*\})? -?[0-9.e+Inf-]+$/;
  for (const line of out.trim().split('\n')) if (!line.startsWith('#')) assert.match(line, sample);
});

test('bindCollectors tolerates a missing router and sessions', async t => {
  const r = new Registry();
  bindCollectors(r, { router: null, investigations: null, dataDir: (await sources(t)).dataDir });
  const out = r.render();
  assert.doesNotMatch(out, /^override_llm_active_endpoint\{/m);
  assert.doesNotMatch(out, /^override_llm_in_flight\{/m);
  assert.doesNotMatch(out, /^override_llm_pinned /m);
  assert.match(out, /^override_process_heap_used_bytes /m);
});

test('a failing collector does not break the scrape', () => {
  const r = new Registry();
  r.gauge('bad', 'Bad', [], () => { throw new Error('boom'); });
  r.counter('ok_total', 'Ok', []).inc();
  assert.match(r.render(), /^ok_total 1$/m);
});
