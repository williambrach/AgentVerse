import test from 'node:test';
import assert from 'node:assert/strict';
import { runDemo } from '../scripts/admin-demo.mjs';

test('runDemo feeds the admin stream with rows from several sessions and closes cleanly', async () => {
  const demo = await runDemo({ players: 3, rampMs: 100, thinkMs: [20, 50], burstEvery: 0, port: 0, adminPort: 0, token: 't', seconds: 0 });
  try {
    let hello;
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const ctl = new AbortController();
      const res = await fetch(`${demo.adminUrl}/admin/stream`, { headers: { Authorization: 'Bearer t' }, signal: ctl.signal });
      const reader = res.body.getReader();
      let text = '';
      while (!text.includes('\n')) { const { value, done } = await reader.read(); if (done) break; text += Buffer.from(value).toString(); }
      ctl.abort();
      hello = JSON.parse(text.split('\n')[0]);
      const has = (k) => new Set(hello.recent.filter((r) => r.kind === k).map((r) => r.sessionId));
      if (has('question').size >= 3 && has('answer').size >= 3) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    const sessions = (k) => new Set(hello.recent.filter((r) => r.kind === k).map((r) => r.sessionId));
    assert.ok(sessions('question').size >= 3, 'questions from 3 sessions');
    assert.ok(sessions('answer').size >= 3, 'answers from 3 sessions');
  } finally { await demo.close(); }
  await assert.rejects(fetch(`${demo.url}/api/health`));
});

test('runDemo falls back to default think time on a malformed range instead of busy-looping', async () => {
  const demo = await runDemo({ players: 1, rampMs: 0, thinkMs: [NaN], burstEvery: 0, port: 0, adminPort: 0, token: 't' });
  await new Promise((r) => setTimeout(r, 300));
  await demo.close();
  await demo.close();
});
