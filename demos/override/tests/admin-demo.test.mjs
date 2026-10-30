import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { until } from './helpers/until.mjs';
import { runDemo } from '../scripts/admin-demo.mjs';

test('runDemo feeds the admin stream with rows from several sessions and closes cleanly', async () => {
  const demo = await runDemo({ players: 3, rampMs: 100, thinkMs: [20, 50], burstEvery: 0, port: 0, adminPort: 0, token: 't', seconds: 0, publicDir: mkdtempSync(join(tmpdir(), 'demo-public-')) });
  try {
    let hello;
    await until(async function threeSessionsAsked() {
      const ctl = new AbortController();
      const cap = setTimeout(() => ctl.abort(), 2000); // one attempt never outlives the poll
      let text = '';
      try {
        const res = await fetch(`${demo.adminUrl}/admin/stream`, { headers: { Authorization: 'Bearer t' }, signal: ctl.signal });
        const reader = res.body.getReader();
        while (!text.includes('\n')) { const { value, done } = await reader.read(); if (done) break; text += Buffer.from(value).toString(); }
      } finally { clearTimeout(cap); ctl.abort(); }
      hello = JSON.parse(text.split('\n')[0]);
      const has = (k) => new Set(hello.recent.filter((r) => r.kind === k).map((r) => r.sessionId));
      return has('question').size >= 3 && has('answer').size >= 3;
    }, { timeoutMs: 5000, stepMs: 50 });
    const sessions = (k) => new Set(hello.recent.filter((r) => r.kind === k).map((r) => r.sessionId));
    assert.ok(sessions('question').size >= 3, 'questions from 3 sessions');
    assert.ok(sessions('answer').size >= 3, 'answers from 3 sessions');
  } finally { await demo.close(); }
  await assert.rejects(fetch(`${demo.url}/api/health`));
});

test('runDemo falls back to default think time on a malformed range instead of busy-looping', async () => {
  const demo = await runDemo({ players: 1, rampMs: 0, thinkMs: [NaN], burstEvery: 0, port: 0, adminPort: 0, token: 't', publicDir: mkdtempSync(join(tmpdir(), 'demo-public-')) });
  try {
    await until(async function healthy() { return (await fetch(`${demo.url}/api/health`, { signal: AbortSignal.timeout(2000) })).status === 200; });
  } finally { await demo.close(); }
  await demo.close();
});

// F-T7-1: a player still in its ramp sleep, woken by close(), armed its 30 s heartbeat interval after
// close() had cleared the timers. That ref'd interval kept the test process alive forever at 0% CPU.
test('runDemo closed during the ramp leaves no timer holding the process', async () => {
  const timeouts = () => process.getActiveResourcesInfo().filter((t) => t === 'Timeout').length;
  const before = timeouts();
  const demo = await runDemo({ players: 3, rampMs: 60_000, thinkMs: [20, 50], burstEvery: 0, port: 0, adminPort: 0, token: 't', publicDir: mkdtempSync(join(tmpdir(), 'demo-public-')) });
  await demo.close();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(timeouts(), before, 'no ref\'d timer survives close()');
});
