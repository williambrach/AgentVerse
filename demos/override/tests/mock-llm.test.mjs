import test from 'node:test';
import assert from 'node:assert/strict';
import { startMockLlm } from './mock-llm.mjs';

const post = (mock, body = { messages: [] }) => fetch(`${mock.url}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('ok mode returns a chat completion', async () => {
  const mock = await startMockLlm({ delayMs: [0, 0] });
  try {
    const res = await post(mock);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.model, 'mock-model');
    assert.equal(json.choices[0].message.content, 'I never heard the bell, so I guessed it was snack time.');
    assert.equal(json.choices[0].finish_reason, 'stop');
    assert.deepEqual(json.usage, { prompt_tokens: 120, completion_tokens: 12 });
    assert.match(mock.url, /^http:\/\/127\.0\.0\.1:\d+\/v1$/);
  } finally { await mock.close(); }
});

test('modes', async () => {
  const mock = await startMockLlm({ delayMs: [0, 0] });
  try {
    mock.setMode('error500'); assert.equal((await post(mock)).status, 500);
    mock.setMode('rate429'); assert.equal((await post(mock)).status, 429);
    mock.setMode('empty'); assert.equal((await (await post(mock)).json()).choices[0].message.content, '');
    mock.setMode('length');
    const l = (await (await post(mock)).json()).choices[0];
    assert.equal(l.finish_reason, 'length'); assert.equal(l.message.content, null);
    mock.setMode('flaky');
    const s = [(await post(mock)).status, (await post(mock)).status, (await post(mock)).status];
    assert.deepEqual(s, [500, 200, 500]);
    mock.setMode('ok', { content: 'hi' });
    assert.equal((await (await post(mock)).json()).choices[0].message.content, 'hi');
  } finally { await mock.close(); }
});

test('hang mode replies nothing until close', async () => {
  const mock = await startMockLlm({ mode: 'hang' });
  const p = post(mock).then(r => r.status, () => 'closed');
  const early = await Promise.race([p, new Promise(r => setTimeout(() => r('pending'), 100))]);
  assert.equal(early, 'pending');
  await mock.close();
  assert.equal(await p, 'closed');
});

test('max_concurrent: third concurrent request gets 429', async () => {
  const mock = await startMockLlm({ delayMs: [150, 150], maxConcurrent: 2 });
  try {
    const statuses = (await Promise.all([post(mock), post(mock), post(mock)])).map(r => r.status).sort();
    assert.deepEqual(statuses, [200, 200, 429]);
  } finally { await mock.close(); }
});

test('stats_track_peak', async () => {
  const mock = await startMockLlm({ delayMs: [80, 80] });
  try {
    await Promise.all([post(mock), post(mock), post(mock)]);
    assert.equal(mock.stats.requests, 3);
    assert.equal(mock.stats.maxInFlight, 3);
    assert.equal(mock.stats.inFlight, 0);
    assert.equal(mock.stats.byStatus[200], 3);
    mock.reset();
    assert.deepEqual(mock.stats, { requests: 0, inFlight: 0, maxInFlight: 0, byStatus: {} });
  } finally { await mock.close(); }
});

test('unknown path is 404', async () => {
  const mock = await startMockLlm({ delayMs: [0, 0] });
  try { assert.equal((await fetch(`${mock.url}/nope`)).status, 404); } finally { await mock.close(); }
});
