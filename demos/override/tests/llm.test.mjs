import test from 'node:test';
import assert from 'node:assert/strict';
import { LlmRouter } from '../server/llm.mjs';
import { InterviewProviderError } from '../server/errors.mjs';

const MSGS = [{ role: 'system', content: 'sys' }, { role: 'user', content: 'hi' }];
const ep = (name, extra = {}) => ({ name, baseUrl: `https://${name}.test/v1`, model: `model-${name}`, key: `secret-key-${name}`, keyEnv: `K_${name}`, maxInFlight: 50, tokenParam: 'max_completion_tokens', timeoutMs: 25000, temperature: null, ...extra });
const ok = (content = 'Momo told me.', extra = {}) => ({ ok: true, status: 200, json: async () => ({ model: 'served', choices: [{ finish_reason: 'stop', message: { content, ...extra.message } }], usage: { prompt_tokens: 812, completion_tokens: 9 }, ...extra.body }) });
const http = status => ({ ok: false, status, json: async () => ({ error: { message: 'secret-key-a body' } }) });
const length = () => ({ ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: 'length', message: { content: null } }], usage: { completion_tokens: 2048 } }) });
const hostOf = url => new URL(url).host.split('.')[0];

// Real fetch-like fake: handlers per endpoint name, aborts when the signal fires.
function fakeFetch(handlers) {
  const calls = [];
  const fetcher = async (url, init) => {
    const name = hostOf(url);
    const call = { name, url, init, body: JSON.parse(init.body) };
    calls.push(call);
    const h = handlers[name] ?? (() => ok());
    const abort = new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'TimeoutError')), { once: true }));
    return Promise.race([Promise.resolve(typeof h === 'function' ? h(call, calls) : h), abort]);
  };
  return { fetcher, calls };
}
const router = (names, handlers, opts = {}) => {
  const f = fakeFetch(handlers);
  const traces = []; const events = []; const system = [];
  const r = new LlmRouter({ endpoints: names.map(n => ep(n)), fetcher: f.fetcher, onTrace: t => traces.push(t), onEvent: e => events.push(e), onSystem: s => system.push(s), ...opts });
  return { r, calls: f.calls, traces, events, system };
};
const rejects = (promise, code) => assert.rejects(promise, e => e instanceof InterviewProviderError && e.code === code);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

test('complete returns content and provenance for a healthy endpoint', async () => {
  const { r, traces } = router(['a', 'b'], {});
  const out = await r.complete({ messages: MSGS, sessionId: 's1', questionEventId: 'q1' });
  assert.equal(out.content, 'Momo told me.');
  assert.deepEqual({ ...out.provenance, traceIds: out.provenance.traceIds.length, durationMs: 0, queueMs: 0 }, {
    endpoint: 'a', apiBaseHost: 'a.test', providerModel: 'model-a', attempts: 1, failedOver: false, pinned: false, queueMs: 0, durationMs: 0,
    promptTokens: 812, completionTokens: 9, reasoningTokens: null, samplingParams: { max_completion_tokens: 2048, temperature: null }, traceIds: 1, semanticRetry: false,
  });
  assert.equal(out.provenance.traceIds[0], traces[0].traceId);
});

test('request goes to the endpoint with its key, model, token parameter and temperature', async () => {
  const f = fakeFetch({});
  const r = new LlmRouter({ endpoints: [ep('a', { tokenParam: 'max_tokens', temperature: 0.7 })], fetcher: f.fetcher });
  await r.complete({ messages: MSGS });
  const c = f.calls[0];
  assert.equal(c.url, 'https://a.test/v1/chat/completions');
  assert.equal(c.init.headers.Authorization, 'Bearer secret-key-a');
  assert.deepEqual(c.body, { model: 'model-a', messages: MSGS, max_tokens: 2048, temperature: 0.7 });
});

test('max_two_calls: A 500 and B 500 make exactly 2 fetches', async () => {
  const { r, calls } = router(['a', 'b', 'c'], { a: http(500), b: http(500) });
  await assert.rejects(r.complete({ messages: MSGS }), e => e.code === 'request_failed' && e.diagnostics.providerStatus === 500 && e.provenance.endpoint === 'b' && e.provenance.attempts === 2 && e.provenance.failedOver === true);
  assert.deepEqual(calls.map(c => c.name), ['a', 'b']);
});

test('A 500 then B 503 rejects with B diagnostics', async () => {
  const { r } = router(['a', 'b'], { a: http(500), b: http(503) });
  await assert.rejects(r.complete({ messages: MSGS }), e => e instanceof InterviewProviderError && e.code === 'request_failed' && e.diagnostics.providerStatus === 503 && /HTTP 503/.test(e.message));
});

test('A fails, B answers: failedOver provenance names B and no failover happens for one failure', async () => {
  const { r, events } = router(['a', 'b'], { a: http(500) });
  const out = await r.complete({ messages: MSGS });
  assert.equal(out.provenance.endpoint, 'b'); assert.equal(out.provenance.failedOver, true); assert.equal(out.provenance.attempts, 2);
  assert.equal(r.snapshot().active, 'a');
  assert.deepEqual(events.filter(e => e.type === 'attempt').map(e => [e.endpoint, e.ok, e.reason, e.semantic]), [['a', false, 'request_failed', false], ['b', true, null, false]]);
});

test('last endpoint failure has no retry', async () => {
  const { r, calls } = router(['a'], { a: http(500) });
  await rejects(r.complete({ messages: MSGS }), 'request_failed');
  assert.equal(calls.length, 1);
});

test('length_same_endpoint_double: A length then stop uses budgets [2048, 4096] on A', async () => {
  let n = 0;
  const { r, calls } = router(['a', 'b'], { a: () => (++n === 1 ? length() : ok('Done.')) });
  const out = await r.complete({ messages: MSGS });
  assert.deepEqual(calls.map(c => [c.name, c.body.max_completion_tokens]), [['a', 2048], ['a', 4096]]);
  assert.deepEqual(calls[0].body.messages, calls[1].body.messages);
  assert.equal(out.provenance.semanticRetry, true); assert.equal(out.provenance.failedOver, false);
});

test('repeated truncation is bounded at 8192 and rejects completion_limit', async () => {
  const { r, calls } = router(['a', 'b'], { a: length }, { maxCompletionTokens: 6000 });
  await rejects(r.complete({ messages: MSGS }), 'completion_limit');
  assert.deepEqual(calls.map(c => c.body.max_completion_tokens), [6000, 8192]);
  const at8192 = router(['a'], { a: length }, { maxCompletionTokens: 8192 });
  await rejects(at8192.r.complete({ messages: MSGS }), 'completion_limit');
  assert.equal(at8192.calls.length, 1);
});

test('completion_limit does not count toward failover', async () => {
  const { r } = router(['a', 'b'], { a: length }, { failover: { failures: 2, windowMs: 30000 } });
  for (let i = 0; i < 3; i++) await rejects(r.complete({ messages: MSGS }), 'completion_limit');
  assert.equal(r.snapshot().active, 'a');
});

test('failover_forward_only: 5 failures on A within 30 s move to B and a healthy A does not pull back', async () => {
  let aDown = true;
  const { r, events, system } = router(['a', 'b', 'c'], { a: () => (aDown ? http(500) : ok('from a')) });
  for (let i = 0; i < 5; i++) await r.complete({ messages: MSGS });
  const snap = r.snapshot();
  assert.equal(snap.active, 'b'); assert.equal(snap.pinned, false);
  assert.deepEqual(events.find(e => e.type === 'failover'), { type: 'failover', from: 'a', to: 'b', reason: 'auto' });
  assert.equal(system.length, 1);
  assert.deepEqual({ ...system[0], timestamp: typeof system[0].timestamp }, { type: 'llm_active', timestamp: 'string', active: 'b', pinned: false, from: 'a', by: 'auto', reason: '5 failures in 30000 ms' });
  aDown = false;
  for (let i = 0; i < 3; i++) assert.equal((await r.complete({ messages: MSGS })).provenance.endpoint, 'b');
  assert.equal(r.snapshot().active, 'b');
});

test('failures outside the window do not accumulate', async () => {
  let t = 1_000_000;
  const { r } = router(['a', 'b'], { a: http(500) }, { now: () => t });
  for (let i = 0; i < 8; i++) { t += 10_000; await r.complete({ messages: MSGS }); }
  assert.equal(r.snapshot().active, 'a');
});

test('pinned_never_advances', async () => {
  const { r } = router(['a', 'b'], { a: http(500) });
  r.setActive('a', { pinned: true, reason: 'keep A' });
  for (let i = 0; i < 8; i++) await r.complete({ messages: MSGS });
  assert.deepEqual([r.snapshot().active, r.snapshot().pinned], ['a', true]);
});

test('last_endpoint_stays: failures on the last endpoint never advance or wrap', async () => {
  const { r } = router(['a', 'b'], { a: http(500), b: http(500) });
  r.setActive('b', { reason: 'last' });
  for (let i = 0; i < 8; i++) await rejects(r.complete({ messages: MSGS }), 'request_failed');
  assert.equal(r.snapshot().active, 'b');
});

test('restore_active: restore {active:b, pinned:true} is applied, unknown names are ignored', async () => {
  const restored = router(['a', 'b'], {}, { restore: { active: 'b', pinned: true } });
  assert.deepEqual([restored.r.snapshot().active, restored.r.snapshot().pinned], ['b', true]);
  assert.equal((await restored.r.complete({ messages: MSGS })).provenance.pinned, true);
  const gone = router(['a', 'b'], {}, { restore: { active: 'zz', pinned: true } });
  assert.deepEqual([gone.r.snapshot().active, gone.r.snapshot().pinned], ['a', false]);
});

test('setActive validates and logs; setCap validates', () => {
  const { r, system, events } = router(['a', 'b'], {});
  assert.throws(() => r.setActive('zz', { reason: 'x' }), /^Error: Unknown endpoint zz\.$/);
  assert.throws(() => r.setActive('b', {}), /^Error: A reason is required\.$/);
  const snap = r.setActive('b', { pinned: true, reason: 'A slow' });
  assert.deepEqual([snap.active, snap.pinned], ['b', true]);
  assert.deepEqual({ ...system[0], timestamp: 0 }, { type: 'llm_active', timestamp: 0, active: 'b', pinned: true, from: 'a', by: 'operator', reason: 'A slow' });
  assert.equal(events[0].type, 'failover');
  assert.throws(() => r.setCap({ endpoint: 'b', value: 0 }), /Cap must be/);
  assert.throws(() => r.setCap({ endpoint: 'zz', value: 3 }), /Unknown endpoint zz/);
  assert.equal(r.setCap({ endpoint: 'b', value: 3 }).endpoints[1].maxInFlight, 3);
  assert.equal(r.setCap({ endpoint: null, value: 7 }).maxInFlight, 7);
});

test('cap_holds: B maxInFlight 2 with 6 concurrent questions never exceeds 2 concurrent fetches', async () => {
  let now = 0; let peak = 0;
  const f = fakeFetch({ b: async () => { now++; peak = Math.max(peak, now); await sleep(15); now--; return ok(); } });
  const r = new LlmRouter({ endpoints: [ep('a'), ep('b', { maxInFlight: 2 })], fetcher: f.fetcher });
  r.setActive('b', { reason: 'test' });
  const results = await Promise.all(Array.from({ length: 6 }, () => r.complete({ messages: MSGS })));
  assert.equal(results.length, 6); assert.equal(peak, 2);
  assert.equal(r.snapshot().inFlight, 0);
});

test('global cap holds and slots are all released', async () => {
  let now = 0; let peak = 0;
  const f = fakeFetch({ a: async () => { now++; peak = Math.max(peak, now); await sleep(10); now--; return ok(); } });
  const r = new LlmRouter({ endpoints: [ep('a')], fetcher: f.fetcher, maxInFlight: 3 });
  await Promise.all(Array.from({ length: 9 }, () => r.complete({ messages: MSGS })));
  assert.equal(peak, 3); assert.deepEqual([r.snapshot().inFlight, r.snapshot().queued], [0, 0]);
});

test('retry waits for the backup semaphore', async () => {
  let bNow = 0; let bPeak = 0;
  const f = fakeFetch({ a: http(500), b: async () => { bNow++; bPeak = Math.max(bPeak, bNow); await sleep(15); bNow--; return ok(); } });
  const r = new LlmRouter({ endpoints: [ep('a'), ep('b', { maxInFlight: 1 })], fetcher: f.fetcher, failover: { failures: 100, windowMs: 1000 } });
  const outs = await Promise.all(Array.from({ length: 4 }, () => r.complete({ messages: MSGS })));
  assert.ok(outs.every(o => o.provenance.endpoint === 'b'));
  assert.equal(bPeak, 1);
});

test('queued_follow_failover: waiting questions go to the new active endpoint', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const { r, calls } = router(['a', 'b'], { a: () => gate.then(() => ok('late a')), b: () => ok() }, { maxInFlight: 1 });
  const first = r.complete({ messages: MSGS });
  const waiting = [r.complete({ messages: MSGS }), r.complete({ messages: MSGS })];
  await sleep(5);
  assert.deepEqual([r.snapshot().inFlight, r.snapshot().queued, r.snapshot().endpoints[0].queued], [1, 2, 2]);
  r.setActive('b', { reason: 'operator move' });
  assert.equal(r.snapshot().endpoints[1].queued, 2);
  release();
  const outs = await Promise.all([first, ...waiting]);
  assert.deepEqual(outs.map(o => o.provenance.endpoint), ['a', 'b', 'b']);
  assert.deepEqual(calls.map(c => c.name), ['a', 'b', 'b']);
});

test('retries re-enter the queue at the head', async () => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  const order = [];
  const { r } = router(['a', 'b'], { a: (c, calls) => { order.push('a'); return calls.filter(x => x.name === 'a').length === 1 ? gate.then(() => http(500)) : ok(); }, b: () => { order.push('b'); return ok(); } }, { maxInFlight: 1 });
  const q1 = r.complete({ messages: MSGS });
  const q2 = r.complete({ messages: MSGS });
  await sleep(5);
  release();
  const [o1, o2] = await Promise.all([q1, q2]);
  assert.deepEqual(order, ['a', 'b', 'a']);
  assert.equal(o1.provenance.endpoint, 'b'); assert.equal(o2.provenance.endpoint, 'a');
});

test('queue_timeout: deadline 50 ms while saturated rejects with queue_timeout and no fetch', async () => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  const { r, calls } = router(['a'], { a: () => gate.then(() => ok()) }, { maxInFlight: 1, deadlineMs: 500 });
  const holder = r.complete({ messages: MSGS });
  r.deadlineMs = 50;
  const started = Date.now();
  await assert.rejects(r.complete({ messages: MSGS }), e => e.code === 'queue_timeout' && /took too long/.test(e.message) && e.provenance.attempts === 0);
  assert.ok(Date.now() - started < 200);
  assert.equal(calls.length, 1);
  assert.equal(r.snapshot().queued, 0);
  release();
  assert.equal((await holder).content, 'Momo told me.');
  assert.equal(r.snapshot().inFlight, 0);
  await r.idle();
});

test('deadline_bounds_attempts: a hanging fetch rejects with timeout within deadline + 50 ms', async () => {
  const { r, calls } = router(['a', 'b'], { a: () => new Promise(() => {}) }, { deadlineMs: 80 });
  const started = Date.now();
  await rejects(r.complete({ messages: MSGS }), 'timeout');
  assert.ok(Date.now() - started < 130, `took ${Date.now() - started}`);
  assert.equal(calls.length, 1, 'no retry after the deadline');
  assert.equal(r.snapshot().inFlight, 0);
});

test('a fetcher that ignores abort is still bounded', async () => {
  const r = new LlmRouter({ endpoints: [ep('a')], fetcher: () => new Promise(() => {}), deadlineMs: 60 });
  const started = Date.now();
  await rejects(r.complete({ messages: MSGS }), 'timeout');
  assert.ok(Date.now() - started < 110);
});

test('endpoint timeout is per attempt: hanging A times out at its timeoutMs and B answers', async () => {
  const f = fakeFetch({ a: () => new Promise(() => {}) });
  const r = new LlmRouter({ endpoints: [ep('a', { timeoutMs: 30 }), ep('b')], fetcher: f.fetcher });
  const out = await r.complete({ messages: MSGS });
  assert.deepEqual([out.provenance.endpoint, out.provenance.attempts], ['b', 2]);
});

test('no_keys_in_trace: traces and errors never contain keys, headers or reasoning', async () => {
  const secret = 'Private deliberation';
  const { r, traces } = router(['a', 'b'], { a: http(401), b: () => ok('fine', { message: { reasoning_content: secret } }) });
  const out = await r.complete({ messages: MSGS, sessionId: 's1', questionEventId: 'q1' });
  const blob = JSON.stringify([traces, out.provenance]);
  assert.equal(out.reasoning, secret);
  assert.ok(!blob.includes('secret-key') && !blob.includes('Bearer') && !blob.includes('Authorization') && !blob.includes(secret));
  assert.equal(traces.length, 2);
  assert.deepEqual(traces.map(t => [t.attempt, t.endpoint, t.error, t.providerStatus, t.sessionId, t.questionEventId]), [[1, 'a', 'credentials_rejected', 401, 's1', 'q1'], [2, 'b', null, 200, 's1', 'q1']]);
  assert.deepEqual(traces[0].request.messages, MSGS);
  assert.equal(traces[1].response.content, 'fine'); assert.equal(traces[1].schemaVersion, 1);
});

test('reasoning_returned, reasoning_field_fallback and null when absent', async () => {
  const msg = m => () => ({ ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: 'fine', ...m } }] }) });
  for (const [m, want] of [[{ reasoning_content: 'R1' }, 'R1'], [{ reasoning: 'R2' }, 'R2'], [{ reasoning_content: '  ', reasoning: 'R3' }, 'R3'], [{}, null]]) {
    const { r } = router(['a'], { a: msg(m) });
    const out = await r.complete({ messages: MSGS });
    assert.equal(out.content, 'fine'); assert.equal(out.reasoning, want);
  }
});

test('reasoning_capped: 5000 chars become 4000 plus an ellipsis', async () => {
  const { r } = router(['a'], { a: () => ok('fine', { message: { reasoning_content: 'x'.repeat(5000) } }) });
  const out = await r.complete({ messages: MSGS });
  assert.equal(out.reasoning, 'x'.repeat(4000) + '…');
});

test('reasoning_after_semantic_retry: the final attempt reasoning is returned', async () => {
  const bad = () => ({ ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: '', reasoning_content: 'first' } }] }) });
  const { r, traces } = router(['a', 'b'], { a: bad, b: () => ok('fine', { message: { reasoning_content: 'second' } }) });
  const out = await r.complete({ messages: MSGS });
  assert.equal(out.reasoning, 'second');
  assert.ok(!JSON.stringify([traces, out.provenance]).match(/first|second/));
});

test('reasoning_only_failure: null content plus reasoning is empty_or_invalid_answer and reasoning is not traced', async () => {
  const secret = 'Hidden chain of thought';
  const { r, traces } = router(['a'], { a: () => ({ ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: null, reasoning_content: secret } }] }) }) });
  await rejects(r.complete({ messages: MSGS }), 'empty_or_invalid_answer');
  assert.ok(!JSON.stringify(traces).includes(secret));
  assert.equal(traces[0].error, 'empty_or_invalid_answer');
});

test('semantic failures retry on the next endpoint and flag semanticRetry', async () => {
  for (const [bad, code] of [[() => ok(''), 'empty_or_invalid_answer'], [() => ok('x'.repeat(6001)), 'empty_or_invalid_answer'], [() => ({ ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: 'content_filter', message: { content: 'x' } }] }) }), 'content_filter']]) {
    const { r, events } = router(['a', 'b'], { a: bad });
    const out = await r.complete({ messages: MSGS });
    assert.equal(out.provenance.endpoint, 'b'); assert.equal(out.provenance.semanticRetry, true);
    assert.equal(events[0].reason, code); assert.equal(events[0].semantic, true);
  }
  const one = router(['a'], { a: () => ({ ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: 'content_filter', message: { content: null } }] }) }) });
  await assert.rejects(one.r.complete({ messages: MSGS }), e => e.code === 'content_filter' && /declined/.test(e.message));
});

test('provider failures keep distinct, safe diagnoses', async () => {
  const cases = [
    ['timeout', () => { throw new DOMException('internal timeout', 'TimeoutError'); }],
    ['connection_failed', () => { throw new TypeError('fetch failed sensitive'); }],
    ['invalid_response', () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad JSON sensitive'); } })],
    ['credentials_rejected', http(403)], ['rate_limited', http(429)], ['request_failed', http(404)],
  ];
  for (const [code, h] of cases) {
    const { r } = router(['a'], { a: h });
    await assert.rejects(r.complete({ messages: MSGS }), e => e instanceof InterviewProviderError && e.code === code && !/sensitive|secret-key/.test(e.message));
  }
  const { r } = router(['a'], { a: http(429) });
  await assert.rejects(r.complete({ messages: MSGS }), /HTTP 429/);
});

test('credentials_rejected logs at most once per endpoint per minute without the key', async t => {
  const logs = [];
  t.mock.method(console, 'error', (...args) => logs.push(args.join(' ')));
  const { r } = router(['a'], { a: http(401) });
  for (let i = 0; i < 3; i++) await rejects(r.complete({ messages: MSGS }), 'credentials_rejected');
  assert.equal(logs.length, 1); assert.ok(!logs[0].includes('secret-key'));
});

test('ontrace_throw_isolated: a throwing onTrace/onEvent/onSystem/onAttempt does not break the question', async t => {
  t.mock.method(console, 'error', () => {});
  const boom = () => { throw new Error('boom'); };
  const f = fakeFetch({});
  const r = new LlmRouter({ endpoints: [ep('a')], fetcher: f.fetcher, onTrace: boom, onEvent: boom, onSystem: boom });
  const out = await r.complete({ messages: MSGS, onAttempt: boom });
  assert.equal(out.content, 'Momo told me.');
  assert.doesNotThrow(() => r.setActive('a', { reason: 'x' }));
});

test('onAttempt receives per-attempt facts', async () => {
  const seen = [];
  let n = 0;
  const { r } = router(['a'], { a: () => (++n === 1 ? length() : ok()) });
  await r.complete({ messages: MSGS, onAttempt: a => seen.push(a) });
  assert.deepEqual(seen.map(a => [a.attempt, a.endpoint, a.providerStatus, a.finishReason, a.completionTokens, a.completionTokenLimit, typeof a.durationMs]),
    [[1, 'a', 200, 'length', 2048, 2048, 'number'], [2, 'a', 200, 'stop', 9, 4096, 'number']]);
});

test('snapshot shape and counters', async () => {
  const { r } = router(['a', 'b'], { a: http(500) });
  assert.deepEqual(r.snapshot(), { active: 'a', pinned: false, inFlight: 0, queued: 0, maxInFlight: 200, endpoints: [
    { name: 'a', model: 'model-a', apiBaseHost: 'a.test', inFlight: 0, maxInFlight: 50, queued: 0, lastSuccessAt: null, lastFailureAt: null, lastFailureReason: null, failures5m: 0 },
    { name: 'b', model: 'model-b', apiBaseHost: 'b.test', inFlight: 0, maxInFlight: 50, queued: 0, lastSuccessAt: null, lastFailureAt: null, lastFailureReason: null, failures5m: 0 },
  ] });
  await r.complete({ messages: MSGS });
  const s = r.snapshot();
  assert.equal(s.endpoints[0].failures5m, 1); assert.equal(s.endpoints[0].lastFailureReason, 'request_failed');
  assert.ok(s.endpoints[1].lastSuccessAt);
});

test('probe returns a result without consuming failover counters or the queue', async () => {
  const { r, traces } = router(['a', 'b'], { b: () => ok('ready'), a: http(500) });
  assert.deepEqual({ ...(await r.probe('b', MSGS)), durationMs: 0 }, { ok: true, endpoint: 'b', durationMs: 0, content: 'ready', reason: null });
  const bad = await r.probe('a', MSGS);
  assert.deepEqual([bad.ok, bad.content, bad.reason], [false, null, 'request_failed']);
  assert.equal(r.snapshot().endpoints[0].failures5m, 0);
  assert.ok(traces.every(t => t.sessionId === null && t.probe === true));
  await assert.rejects(async () => r.probe('zz', MSGS), /Unknown endpoint zz/);
});

test('abort in queue leaves no lost entries: 20 saturated questions with a short deadline all settle and slots return', async () => {
  const { r } = router(['a'], { a: async () => { await sleep(20); return ok(); } }, { maxInFlight: 2, deadlineMs: 70 });
  const settled = await Promise.allSettled(Array.from({ length: 20 }, () => r.complete({ messages: MSGS })));
  assert.equal(settled.length, 20);
  assert.ok(settled.some(s => s.status === 'fulfilled') && settled.some(s => s.status === 'rejected'));
  assert.ok(settled.filter(s => s.status === 'rejected').every(s => ['queue_timeout', 'timeout'].includes(s.reason.code)));
  await r.idle();
  assert.deepEqual([r.snapshot().inFlight, r.snapshot().queued, r.snapshot().endpoints[0].inFlight], [0, 0, 0]);
});

test('idle resolves when no questions are pending', async () => {
  const { r } = router(['a'], { a: async () => { await sleep(10); return ok(); } });
  await r.idle();
  const p = r.complete({ messages: MSGS });
  let done = false; const idle = r.idle().then(() => { done = true; });
  await sleep(1); assert.equal(done, false);
  await p; await idle; assert.equal(done, true);
});

test('an internal throw after a fetch still frees the slot', async () => {
  const { r } = router(['a'], { a: () => ok() });
  r.trace = () => { throw new Error('boom'); };
  await assert.rejects(r.complete({ messages: MSGS }), /boom/);
  assert.equal(r.snapshot().inFlight, 0);
  assert.equal(r.snapshot().endpoints[0].inFlight, 0);
  await r.idle();
});

test('effort_sent_only_when_set', async () => {
  const f = fakeFetch({});
  await new LlmRouter({ endpoints: [ep('a', { reasoningEffort: 'low' })], fetcher: f.fetcher }).complete({ messages: MSGS });
  assert.equal(f.calls[0].body.reasoning_effort, 'low');
  const g = fakeFetch({});
  const out = await new LlmRouter({ endpoints: [ep('a')], fetcher: g.fetcher }).complete({ messages: MSGS });
  assert.ok(!('reasoning_effort' in g.calls[0].body));
  assert.ok(!('reasoning_effort' in out.provenance.samplingParams));
  let n = 0;
  const h = fakeFetch({ a: () => (++n === 1 ? length() : ok('Done.')) });
  const o2 = await new LlmRouter({ endpoints: [ep('a', { reasoningEffort: 'low' })], fetcher: h.fetcher }).complete({ messages: MSGS });
  assert.deepEqual(h.calls.map(c => c.body.reasoning_effort), ['low', 'low']);
  assert.equal(o2.provenance.samplingParams.reasoning_effort, 'low');
});

const limited = retryAfter => ({ ok: false, status: 429, headers: { get: name => (name.toLowerCase() === 'retry-after' ? retryAfter : null) }, json: async () => ({}) });
const sleeper = () => { const waits = []; return { waits, sleep: async ms => { waits.push(ms); } }; };

test('rate_limit_backoff_same_endpoint: 429 then 200 retries the same endpoint after one sleep', async () => {
  const s = sleeper();
  let n = 0;
  const { r, calls } = router(['a', 'b'], { a: () => (++n === 1 ? http(429) : ok('from a')) }, { sleep: s.sleep });
  const out = await r.complete({ messages: MSGS });
  assert.deepEqual(calls.map(c => c.name), ['a', 'a']);
  assert.equal(out.provenance.endpoint, 'a');
  assert.equal(s.waits.length, 1);
  assert.ok(s.waits[0] >= 500 && s.waits[0] <= 1500, `jitter ${s.waits[0]}`);
});

test('rate limit honours Retry-After, capped at 5 s', async () => {
  for (const [header, expected] of [['2', 2000], ['120', 5000]]) {
    const s = sleeper();
    let n = 0;
    const { r } = router(['a', 'b'], { a: () => (++n === 1 ? limited(header) : ok()) }, { sleep: s.sleep });
    await r.complete({ messages: MSGS });
    assert.deepEqual(s.waits, [expected]);
  }
});

test('rate limit with no time left for the wait moves to the next endpoint', async () => {
  const s = sleeper();
  const { r, calls } = router(['a', 'b'], { a: http(429) }, { sleep: s.sleep, deadlineMs: 400 });
  const out = await r.complete({ messages: MSGS });
  assert.deepEqual(calls.map(c => c.name), ['a', 'b']);
  assert.equal(out.provenance.endpoint, 'b');
  assert.deepEqual(s.waits, []);
});

test('429_does_not_failover: three 429s keep the active endpoint, three 500s flip it', async () => {
  const s = sleeper();
  const limitedRun = router(['a', 'b'], { a: http(429), b: http(429) }, { sleep: s.sleep, failover: { failures: 3, windowMs: 30000 } });
  for (let i = 0; i < 3; i++) await rejects(limitedRun.r.complete({ messages: MSGS }), 'rate_limited');
  assert.equal(limitedRun.r.snapshot().active, 'a');
  assert.ok(limitedRun.r.snapshot().endpoints[0].failures5m >= 3);
  assert.equal(limitedRun.r.snapshot().endpoints[0].lastFailureReason, 'rate_limited');
  const failing = router(['a', 'b'], { a: http(500) }, { sleep: s.sleep, failover: { failures: 3, windowMs: 30000 } });
  for (let i = 0; i < 3; i++) await failing.r.complete({ messages: MSGS });
  assert.equal(failing.r.snapshot().active, 'b');
});

test('429_twice_hops_to_next_endpoint: 429, 429, then the next endpoint answers; active stays', async () => {
  const s = sleeper();
  const { r, calls } = router(['a', 'b'], { a: http(429), b: () => ok('from b') }, { sleep: s.sleep });
  const out = await r.complete({ messages: MSGS });
  assert.deepEqual(calls.map(c => c.name), ['a', 'a', 'b']);
  assert.equal(s.waits.length, 1);
  assert.equal(out.provenance.endpoint, 'b');
  assert.equal(out.provenance.attempts, 3);
  assert.equal(r.snapshot().active, 'a');
});

test('429_on_last_endpoint_does_not_wrap: a 429 pair on the last endpoint fails with no hop', async () => {
  const s = sleeper();
  const { r, calls } = router(['a'], { a: http(429) }, { sleep: s.sleep });
  await rejects(r.complete({ messages: MSGS }), 'rate_limited');
  assert.deepEqual(calls.map(c => c.name), ['a', 'a']);
  const chain = router(['a', 'b', 'c'], { a: http(429), b: http(429), c: () => ok('from c') }, { sleep: s.sleep });
  await rejects(chain.r.complete({ messages: MSGS }), 'rate_limited');
  assert.deepEqual(chain.calls.map(c => c.name), ['a', 'a', 'b']);
});
