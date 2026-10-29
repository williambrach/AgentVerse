import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { modelConfig, loadEndpoints, buildMessages, answerInterview, InterviewProviderError } from '../server/interviews.mjs';
import { InterviewProviderError as FromErrors } from '../server/errors.mjs';
import { LlmRouter } from '../server/llm.mjs';
import { cases } from '../server/cases/index.mjs';

const kase = cases[0];

const session = (extra = {}) => ({ interviews: { momo: [], pip: [], nori: [] }, ...extra });
const ENDPOINTS = JSON.stringify([{ name: 'a', baseUrl: 'https://a.test/v1', model: 'ma', keyEnv: 'OVERRIDE_ENDPOINT_A_KEY' }]);
const live = { OVERRIDE_LLM_API_KEY: 'test-key', OVERRIDE_LLM_MODEL: 'reasoning-model' };

// Swappable producer: a fake router by default, the real LlmRouter (over a fake fetcher) when SUPERLITE_REAL=1.
function routerFor(config, fetcher) {
  if (process.env.SUPERLITE_REAL === '1') return new LlmRouter({ endpoints: config.endpoints, fetcher, maxCompletionTokens: config.maxCompletionTokens, deadlineMs: config.timeoutMs });
  return {
    requests: [],
    async complete(req) {
      this.requests.push(req);
      return { content: 'Momo told me the keeper said yes.', provenance: { endpoint: 'a', attempts: 1 } };
    },
  };
}
// Provider-boundary tests always use the real router: the behaviour under test lives there.
const realRouter = (config, fetcher) => new LlmRouter({ endpoints: config.endpoints, fetcher, maxCompletionTokens: config.maxCompletionTokens, deadlineMs: config.timeoutMs });
const okJson = (body, status = 200) => ({ ok: true, status, json: async () => body });

test('modelConfig defaults to rehearsal', () => {
  assert.deepEqual(modelConfig({}), {
    mode: 'rehearsal', endpoints: [], endpointsHash: null, model: null, promptVersion: 'interview-v3', maxCompletionTokens: 2048, timeoutMs: 60000,
    maxInFlight: 200, failover: { failures: 5, windowMs: 30000 },
  });
});

test('legacy variables form endpoint a', () => {
  const config = modelConfig({ OVERRIDE_LLM_API_KEY: 'k', OVERRIDE_LLM_MODEL: 'm' });
  assert.equal(config.mode, 'live'); assert.equal(config.model, 'm');
  assert.match(config.endpointsHash, /^[0-9a-f]{16}$/);
  assert.deepEqual(config.endpoints, [{ name: 'a', baseUrl: 'https://api.openai.com/v1', model: 'm', key: 'k', keyEnv: 'OVERRIDE_LLM_API_KEY', maxInFlight: 200, tokenParam: 'max_completion_tokens', timeoutMs: 60000, temperature: null }]);
  const tuned = modelConfig({ ...live, OVERRIDE_LLM_TIMEOUT_MS: '30000', OVERRIDE_LLM_MAX_IN_FLIGHT: '40', OVERRIDE_LLM_FAILOVER_FAILURES: '3', OVERRIDE_LLM_FAILOVER_WINDOW_MS: '10000', OVERRIDE_LLM_BASE_URL: 'https://inference.example/v1/' });
  assert.deepEqual([tuned.endpoints[0].timeoutMs, tuned.endpoints[0].maxInFlight, tuned.maxInFlight, tuned.failover, tuned.endpoints[0].baseUrl], [30000, 40, 40, { failures: 3, windowMs: 10000 }, 'https://inference.example/v1']);
});

test('loadEndpoints reads a file, applies defaults and resolves keys from the environment', () => {
  const read = path => { assert.equal(path, '/e.json'); return ENDPOINTS; };
  const { endpoints, hash } = loadEndpoints({ OVERRIDE_ENDPOINTS: '/e.json', OVERRIDE_ENDPOINT_A_KEY: 'ka' }, read);
  assert.deepEqual(endpoints, [{ name: 'a', baseUrl: 'https://a.test/v1', model: 'ma', key: 'ka', keyEnv: 'OVERRIDE_ENDPOINT_A_KEY', maxInFlight: 50, tokenParam: 'max_completion_tokens', timeoutMs: 25000, temperature: null }]);
  assert.match(hash, /^[0-9a-f]{16}$/);
});

test('OVERRIDE_ENDPOINTS replaces the legacy variables in modelConfig', t => {
  const dir = mkdtempSync(join(tmpdir(), 'override-endpoints-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'e.json'), ENDPOINTS);
  const config = modelConfig({ OVERRIDE_ENDPOINTS: join(dir, 'e.json'), OVERRIDE_ENDPOINT_A_KEY: 'ka', OVERRIDE_LLM_API_KEY: 'ignored' });
  assert.deepEqual([config.mode, config.model, config.endpoints.map(e => e.name), config.timeoutMs], ['live', 'ma', ['a'], 60000]);
  assert.match(config.endpointsHash, /^[0-9a-f]{16}$/);
});

test('missing_key_names_variable: an unset keyEnv names the variable and no key', () => {
  const file = JSON.stringify([{ name: 'a', baseUrl: 'https://a.test/v1', model: 'ma', keyEnv: 'X_KEY' }]);
  assert.throws(() => loadEndpoints({ OVERRIDE_ENDPOINTS: '/e', OTHER: 'super-secret-value' }, () => file), error => /X_KEY/.test(error.message) && !error.message.includes('super-secret-value'));
});

test('duplicate_names_rejected', () => {
  const entry = { name: 'a', baseUrl: 'https://a.test/v1', model: 'ma', keyEnv: 'K' };
  assert.throws(() => loadEndpoints({ OVERRIDE_ENDPOINTS: '/e', K: 'k' }, () => JSON.stringify([entry, { ...entry, model: 'mb' }])), /used twice/);
});

test('public_http_rejected: only HTTPS or localhost HTTP', () => {
  const file = baseUrl => () => JSON.stringify([{ name: 'a', baseUrl, model: 'ma', keyEnv: 'K' }]);
  assert.throws(() => loadEndpoints({ OVERRIDE_ENDPOINTS: '/e', K: 'k' }, file('http://public.example/v1')), /HTTPS/);
  assert.equal(loadEndpoints({ OVERRIDE_ENDPOINTS: '/e', K: 'k' }, file('http://localhost:9000/v1')).endpoints[0].baseUrl, 'http://localhost:9000/v1');
  assert.throws(() => modelConfig({ OVERRIDE_LLM_BASE_URL: 'http://public.example/v1' }), /HTTPS/);
});

test('hash_ignores_keys but follows routing', () => {
  const read = () => ENDPOINTS;
  const one = loadEndpoints({ OVERRIDE_ENDPOINTS: '/e', OVERRIDE_ENDPOINT_A_KEY: 'key-one' }, read).hash;
  const two = loadEndpoints({ OVERRIDE_ENDPOINTS: '/e', OVERRIDE_ENDPOINT_A_KEY: 'key-two' }, read).hash;
  const moved = loadEndpoints({ OVERRIDE_ENDPOINTS: '/e', OVERRIDE_ENDPOINT_A_KEY: 'key-one' }, () => ENDPOINTS.replace('"ma"', '"mb"')).hash;
  assert.equal(one, two); assert.notEqual(one, moved);
});

test('endpoint fields are validated', () => {
  const bad = patch => () => loadEndpoints({ OVERRIDE_ENDPOINTS: '/e', K: 'k' }, () => JSON.stringify([{ name: 'a', baseUrl: 'https://a.test/v1', model: 'ma', keyEnv: 'K', ...patch }]));
  assert.throws(bad({ maxInFlight: 0 }), /maxInFlight must be an integer between 1 and 1000/);
  assert.throws(bad({ timeoutMs: 5 }), /timeoutMs must be an integer between 1000 and 120000/);
  assert.throws(bad({ tokenParam: 'n' }), /tokenParam/);
  assert.throws(bad({ temperature: 9 }), /temperature/);
  assert.throws(bad({ name: 'bad name!' }), /name/);
  assert.throws(() => loadEndpoints({ OVERRIDE_ENDPOINTS: '/e' }, () => '[]'), /non-empty/);
  assert.throws(() => loadEndpoints({ OVERRIDE_ENDPOINTS: '/e' }, () => 'not json'), /could not be read/);
  assert.equal(bad({ temperature: 0.7, tokenParam: 'max_tokens' })().endpoints[0].temperature, 0.7);
});

test('legacy_errors_kept: both, token range, timeout range', () => {
  assert.throws(() => modelConfig({ OVERRIDE_LLM_API_KEY: 'test-key' }), /both/);
  assert.throws(() => modelConfig({ OVERRIDE_LLM_MAX_COMPLETION_TOKENS: '0' }), /between 256 and 8192/);
  assert.throws(() => modelConfig({ OVERRIDE_LLM_TIMEOUT_MS: 'NaN' }), /between 1000 and 120000/);
  assert.throws(() => modelConfig({ OVERRIDE_LLM_MAX_IN_FLIGHT: '0' }), /OVERRIDE_LLM_MAX_IN_FLIGHT/);
});

test('InterviewProviderError is shared with errors.mjs', () => {
  assert.equal(InterviewProviderError, FromErrors);
  assert.equal(new InterviewProviderError('x', 'm').provenance, null);
});

test('rehearsal answers carry no provenance and need no router', async () => {
  const out = await answerInterview(modelConfig({}), kase, session(), 'nori', 'Did you hear the bell?', null);
  assert.deepEqual(out, { answer: 'I never heard the bell. I saw Pip carrying bananas and assumed snack time had started. I should have checked instead of guessing.', provenance: null });
});

test('answer_passes_context: the router gets the built messages, ids and onAttempt', async () => {
  const config = modelConfig(live);
  const s = session();
  const router = routerFor(config, async () => okJson({ choices: [{ finish_reason: 'stop', message: { content: 'Momo told me the keeper said yes.' } }] }));
  const onAttempt = () => {};
  const seen = [];
  const spy = { complete: async req => { seen.push(req); return router.complete(req); } };
  const out = await answerInterview(config, kase, s, 'pip', 'Who authorized this?', spy, { sessionId: 's1', questionEventId: 'q1', onAttempt });
  assert.deepEqual(seen[0].messages, buildMessages(kase, s, 'pip', 'Who authorized this?'));
  assert.deepEqual([seen[0].sessionId, seen[0].questionEventId, seen[0].onAttempt], ['s1', 'q1', onAttempt]);
  assert.equal(out.answer, 'Momo told me the keeper said yes.');
  assert.ok(out.provenance.endpoint === 'a');
});

test('custom OpenAI-compatible endpoint keeps credentials server-side and validates responses', async () => {
  const config = modelConfig({ ...live, OVERRIDE_LLM_API_KEY: 'test-key', OVERRIDE_LLM_MODEL: 'custom-model', OVERRIDE_LLM_BASE_URL: 'https://inference.example/v1/' });
  const s = session();
  let request;
  const good = realRouter(config, async (url, init) => { request = { url, ...init }; return okJson({ choices: [{ message: { content: 'Momo told me the keeper said yes.' } }] }); });
  const { answer, provenance } = await answerInterview(config, kase, s, 'pip', 'Who authorized this?', good);
  assert.match(answer, /Momo/);
  assert.equal(request.url, 'https://inference.example/v1/chat/completions');
  assert.equal(request.headers.Authorization, 'Bearer test-key');
  assert.equal(JSON.parse(request.body).model, 'custom-model');
  assert.equal(JSON.stringify(provenance).includes('test-key'), false);
  await assert.rejects(answerInterview(config, kase, s, 'pip', 'Who authorized this?', realRouter(config, async () => okJson({ choices: [] }))), /unusable/);
  await assert.rejects(answerInterview(config, kase, s, 'pip', 'Who authorized this?', realRouter(config, async () => ({ ok: false, status: 429 }))), /HTTP 429/);
  assert.equal(config.maxCompletionTokens, 2048);
  assert.equal(config.timeoutMs, 60000);
});

test('reasoning-only token exhaustion retries once on the same endpoint without exposing reasoning', async () => {
  const requests = [];
  const traces = [];
  const config = modelConfig({ ...live, OVERRIDE_LLM_MODEL: 'reasoning-model' });
  const fetcher = async (url, init) => {
    requests.push({ body: JSON.parse(init.body), signal: init.signal });
    const first = requests.length === 1;
    return okJson({ choices: [{ finish_reason: first ? 'length' : 'stop', message: { content: first ? null : 'I knew the keeper said wait.', reasoning_content: 'Private deliberation must not enter the transcript or log.' } }], usage: { completion_tokens: first ? 2048 : 450 } });
  };
  const router = new LlmRouter({ endpoints: config.endpoints, fetcher, onTrace: t => traces.push(t) });
  const attempts = [];
  const out = await answerInterview(config, kase, session(), 'momo', 'What did you know?', router, { sessionId: 's', questionEventId: 'q', onAttempt: a => attempts.push(a) });
  assert.deepEqual(requests.map(r => r.body.max_completion_tokens), [2048, 4096]);
  assert.deepEqual(requests[0].body.messages, requests[1].body.messages);
  assert.deepEqual(attempts.map(a => [a.finishReason, a.completionTokenLimit]), [['length', 2048], ['stop', 4096]]);
  assert.equal(out.answer, 'I knew the keeper said wait.');
  assert.equal(out.provenance.semanticRetry, true);
  const blob = JSON.stringify([out, traces, attempts]);
  assert.equal(blob.includes('Private deliberation'), false);
  assert.equal(blob.includes('test-key'), false);
});

test('repeated truncation is bounded and never accepts an incomplete visible answer', async () => {
  const config = modelConfig({ ...live, OVERRIDE_LLM_MAX_COMPLETION_TOKENS: '6000' });
  const limits = [];
  const router = realRouter(config, async (url, init) => { limits.push(JSON.parse(init.body).max_completion_tokens); return okJson({ choices: [{ finish_reason: 'length', message: { content: 'I knew that the' } }] }); });
  await assert.rejects(answerInterview(config, kase, session(), 'momo', 'Why continue?', router), error => error instanceof InterviewProviderError && error.code === 'completion_limit');
  assert.deepEqual(limits, [6000, 8192]);
});

test('provider errors remain specific and safe', async () => {
  const config = modelConfig(live);
  for (const [status, reason, message] of [[401, 'credentials_rejected', /credentials/], [429, 'rate_limited', /rate-limited/], [503, 'request_failed', /HTTP 503/]]) {
    let attempts = 0;
    const router = realRouter(config, async () => { attempts++; return { ok: false, status, json: async () => ({ error: { message: 'Untrusted provider body containing test-key' } }) }; });
    await assert.rejects(answerInterview(config, kase, session(), 'pip', 'Who authorized this?', router), error => error.code === reason && error.diagnostics.providerStatus === status && message.test(error.message) && !error.message.includes('test-key'));
    assert.equal(attempts, 1, 'a single endpoint has nowhere to retry');
  }
});

test('timeouts, connection failures, and malformed provider JSON receive distinct diagnoses', async () => {
  const config = modelConfig(live);
  const failures = [
    ['timeout', async () => { throw new DOMException('internal timeout', 'TimeoutError'); }],
    ['connection_failed', async () => { throw new TypeError('fetch failed'); }],
    ['invalid_response', async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad JSON with sensitive provider body'); } })],
  ];
  for (const [code, fetcher] of failures) {
    await assert.rejects(answerInterview(config, kase, session(), 'pip', 'Who authorized this?', realRouter(config, fetcher)), error => error instanceof InterviewProviderError && error.code === code && !error.message.includes('sensitive'));
  }
});

test('buildMessages keeps character knowledge, and history separate', () => {
  const s = session({ interviews: { momo: [{ question: 'Q1', answer: 'A1' }], pip: [], nori: [] } });
  const messages = buildMessages(kase, s, 'momo', 'Q2');
  assert.deepEqual(messages.map(m => m.role), ['system', 'user', 'assistant', 'user']);
  assert.match(messages[0].content, /You play Momo/);
  assert.equal(JSON.parse(messages[3].content).question, 'Q2');
  assert.deepEqual(JSON.parse(messages[3].content), { question: 'Q2' });
  assert.ok(messages[0].content.includes(kase.knowledge.momo[0]));
  assert.doesNotMatch(messages[0].content, /PUBLIC RECORDS|presentedEvidence/);
  assert.ok(!buildMessages(kase, s, 'pip', 'Q2').some(m => m.content === 'A1'));
});
