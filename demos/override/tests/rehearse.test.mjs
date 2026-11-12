import test from 'node:test';
import assert from 'node:assert/strict';
import { judge, realLlmEnv, rehearse } from '../scripts/rehearse.mjs';
import { pickRoles } from '../scripts/admin-demo.mjs';

test('pickRoles gives a counted role to exactly that many characters (Castelvento: one traveller)', () => {
  const view = { roles: [{ id: 'traveler', count: 1 }, { id: 'local' }], characters: ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id })) };
  for (let i = 0; i < 50; i++) {
    const picks = pickRoles(view);
    assert.equal(Object.keys(picks).length, 5);
    assert.equal(Object.values(picks).filter((r) => r === 'traveler').length, 1);
    assert.ok(Object.values(picks).every((r) => r === 'traveler' || r === 'local'));
  }
  const free = pickRoles({ characters: [{ id: 'x' }, { id: 'y' }] });
  assert.equal(Object.keys(free).length, 2);
});

const T = { adminP95: 300, lagP95: 1000, loopP99: 100, tickGapMax: 3000 };
const s = (p95) => ({ n: 10, p50: 1, p95, max: p95 });
const good = () => ({
  players: 2, admin: { 'GET /admin/health': s(20) }, adminErrors: {},
  stream: { events: 5, disconnects: 0, lag: s(10), tickGap: s(1001) }, loop: { p99: 20 },
  player: { server5xx: 0, connectionErrors: 0, finishedPlayers: 2 }, checks: [{ what: 'x', ok: true }],
});

test('judge passes a healthy run and names each broken threshold', () => {
  assert.deepEqual(judge(good(), T), []);
  const r = good();
  r.admin['GET /admin/health'] = s(900);
  r.adminErrors['GET /metrics'] = 2;
  r.stream.lag = s(5000);
  r.stream.disconnects = 1;
  r.loop.p99 = 400;
  r.player.server5xx = 3;
  r.player.finishedPlayers = 1;
  r.checks.push({ what: 'leaderboard lists 0 teams', ok: false });
  const f = judge(r, T);
  for (const want of [/health p95 900/, /metrics: 2 failed/, /stream lag p95 5000/, /dropped 1/, /event loop p99 400/, /3 player requests/, /1 of 2 teams never finished/, /leaderboard lists 0/]) {
    assert.ok(f.some((x) => want.test(x)), `missing ${want}: ${f.join(' | ')}`);
  }
});

test('realLlmEnv picks only LLM settings and needs an endpoint', () => {
  assert.equal(realLlmEnv({ OVERRIDE_LLM_MODEL: 'm' }), null);
  assert.deepEqual(realLlmEnv({ OVERRIDE_LLM_BASE_URL: 'u', OVERRIDE_LLM_API_KEY: 'k', OVERRIDE_SECRET: 's', HOME: '/x' }), { OVERRIDE_LLM_BASE_URL: 'u', OVERRIDE_LLM_API_KEY: 'k' });
  assert.deepEqual(realLlmEnv({ OVERRIDE_ENDPOINTS: 'f.json', OVERRIDE_ENDPOINT_A_KEY: 'k' }), { OVERRIDE_ENDPOINTS: 'f.json', OVERRIDE_ENDPOINT_A_KEY: 'k' });
});

test('a short mock rehearsal reports player, admin and stream numbers', { timeout: 60_000 }, async () => {
  const r = await rehearse({ players: 2, seconds: 8, rampMs: 500, thinkMs: [50, 150], probeMs: 500, burst: false, log: () => {} });
  assert.ok(r.player.routes['POST /api/start']?.n >= 2, 'both teams started');
  assert.ok(r.player.routes['POST /api/interview']?.n > 0, 'interviews were timed');
  for (const route of ['GET /admin/health', 'GET /admin/leaderboard', 'GET /metrics', 'POST /admin/round']) assert.ok(r.admin[route]?.n > 0, `${route} was probed`);
  assert.ok(r.stream.events > 0 && r.stream.ticks > 0, 'the stream delivered events and ticks');
  assert.equal(r.stream.disconnects, 0);
  assert.equal(r.player.server5xx, 0);
  assert.equal(r.commandCentre.online, 2);
  assert.ok(r.checks.find((c) => /leaderboard lists/.test(c.what))?.ok, 'leaderboard showed both teams before the round');
  assert.equal(typeof r.pass, 'boolean');
});
