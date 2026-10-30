import test from 'node:test';
import assert from 'node:assert/strict';
import { runScenario, scenarios, acceptQueueLimit } from './loadtest.mjs';

// Every row of the spec's scenario table at reduced scale, against the real server and mock endpoints.
const reduced = { players: 30, rampMs: 500, deadlineMs: 3000, endpointTimeoutMs: 800, cap: 5 };

test('the scenario list covers the spec table', () => {
  assert.deepEqual(scenarios, ['healthy', 'primary_errors', 'primary_hangs', 'rate_limited', 'flaky_primary', 'silent_failure', 'small_backup', 'all_down', 'server_restart', 'burst_arrival']);
});

for (const name of scenarios) {
  test(`scenario ${name} passes at 30 players`, { timeout: 60_000 }, async () => {
    const result = await runScenario(name, reduced);
    assert.deepEqual(result.failures, [], JSON.stringify(result.stats));
    assert.equal(result.pass, true);
    assert.equal(result.stats.players, 30);
  });
}

test('primary_errors reports where traffic went', { timeout: 60_000 }, async () => {
  const { stats } = await runScenario('primary_errors', reduced);
  assert.equal(stats.activeAfter, 'b');
  assert.equal(stats.verdicts, 30);
  assert.equal(stats.requestsByEndpoint.c + stats.requestsByEndpoint.d, 0);
  assert.ok(stats.requestsByEndpoint.b >= 90);
});

test('healthy and server_restart allow no failed question and finish every game', { timeout: 60_000 }, async () => {
  for (const name of ['healthy', 'server_restart']) {
    const { stats, failures } = await runScenario(name, reduced);
    assert.deepEqual(failures, []);
    assert.equal(stats.failedQuestions, 0);
    assert.equal(stats.verdicts, 30);
  }
});

test('acceptQueueLimit is a positive integer or null and never throws', () => {
  const limit = acceptQueueLimit();
  assert.ok(limit === null || (Number.isInteger(limit) && limit > 0), String(limit));
});

test('rate_limited keeps endpoint a active, retries it once per question and never reaches b', { timeout: 60_000 }, async () => {
  const { stats, failures } = await runScenario('rate_limited', reduced);
  assert.deepEqual(failures, []);
  assert.equal(stats.activeAfter, 'a');
  assert.equal(stats.requestsByEndpoint.b, 0);
  assert.ok(stats.requestsByEndpoint.a >= 2 * stats.questions);
});
