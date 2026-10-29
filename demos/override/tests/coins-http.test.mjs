import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../server/index.mjs';
import { startMockLlm } from './mock-llm.mjs';

const json = { 'Content-Type': 'application/json' };

async function liveGame(t, extra = {}) {
  const mock = await startMockLlm({ reasoning: 'Mock reasoning', delayMs: [5, 10] });
  t.after(() => mock.close());
  const dir = mkdtempSync(join(tmpdir(), 'override-coins-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const endpoints = join(dir, 'endpoints.json');
  writeFileSync(endpoints, JSON.stringify([{ name: 'a', baseUrl: mock.url, model: 'mock-model', keyEnv: 'OVERRIDE_ENDPOINT_A_KEY' }]));
  const server = await startServer({
    PORT: '0', OVERRIDE_ADMIN_PORT: '0', OVERRIDE_DATA_DIR: join(dir, 'data'), OVERRIDE_ENV: 'test', OVERRIDE_SECRET: 'secret-one',
    OVERRIDE_ENDPOINTS: endpoints, OVERRIDE_ENDPOINT_A_KEY: 'sk-test-key', ...extra,
  });
  t.after(() => server.close());
  const start = await fetch(`${server.url}/api/start`, { method: 'POST', headers: json, body: '{}' });
  let view = await start.json();
  const cookie = start.headers.get('set-cookie').split(';')[0];
  const id = view.session.id;
  const post = async (action, body = {}) => {
    const res = await fetch(`${server.url}/api/${action}`, { method: 'POST', headers: { ...json, Cookie: cookie }, body: JSON.stringify({ sessionId: id, revision: view.session.revision, ...body }) });
    const out = await res.json();
    if (res.status === 200) view = out;
    return { status: res.status, body: out };
  };
  const state = async () => (await fetch(`${server.url}/api/state`, { headers: { Cookie: cookie } })).text();
  const file = kind => join(dir, 'data', 'test', kind, `${id}.jsonl`);
  return { post, state, file, mock };
}

test('live_reasoning_seam: reasoning stays out of state and traces until inspected', async t => {
  const g = await liveGame(t);
  assert.equal((await g.post('interview', { character: 'momo', question: 'Did the keeper say yes?' })).status, 200);
  assert.equal((await g.state()).includes('Mock reasoning'), false);
  const inspected = await g.post('inspect', { character: 'momo' });
  assert.equal(inspected.status, 200);
  assert.equal(inspected.body.session.inspections[0].reasoning, 'Mock reasoning');
  const trace = readFileSync(g.file('traces'), 'utf8');
  assert.equal(trace.includes('Mock reasoning'), false);
});

test('live_continue_seam: a live thread line carries provenance and prompt version', async t => {
  const g = await liveGame(t);
  const r = await g.post('continue');
  assert.equal(r.status, 200);
  assert.equal(r.body.session.thread[0].text, 'I never heard the bell, so I guessed it was snack time.');
  const line = readFileSync(g.file('sessions'), 'utf8').trim().split('\n').map(JSON.parse).find(e => e.type === 'chatter_line');
  assert.equal(line.provenance.endpoint, 'a');
  assert.equal(line.threadPromptVersion, 'thread-v3');
});

test('budget_env_seam: OVERRIDE_COIN_BUDGET reaches the wallet', async t => {
  // The default case has four monkeys: a budget of exactly 8 keeps every coin for one question each.
  const g = await liveGame(t, { OVERRIDE_COIN_BUDGET: '8' });
  const r = await g.post('continue');
  assert.equal(r.status, 409);
  assert.equal(r.body.error ?? r.body.message, 'Save coins: you need 8 to ask everyone once.');
});
