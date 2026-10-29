import test from 'node:test';
import assert from 'node:assert/strict';
import { startMockLlm } from './mock-llm.mjs';
import { runPreflight } from '../scripts/preflight.mjs';
import { flagsFor } from '../scripts/preflight.mjs';
import { cases } from '../server/cases/index.mjs';
import { identityCast, partOf, resolve as resolveText } from '../server/cases.mjs';

const endpointFor = (mock, name = 'a') => ({ name, baseUrl: mock.url, model: 'm', key: 'k', maxInFlight: 5, tokenParam: 'max_completion_tokens', timeoutMs: 5000, temperature: null });
async function withMock(opts, fn) {
  const mock = await startMockLlm({ delayMs: [0, 5], ...opts });
  try { await fn(mock); } finally { await mock.close(); }
}

test('capacity_steps', async () => {
  await withMock({ delayMs: [60, 60] }, async mock => {
    const report = await runPreflight({ endpoints: [endpointFor(mock)], capacity: true, steps: [2, 4] });
    const cap = report.endpoints[0].capacity;
    assert.deepEqual(cap.map(c => c.concurrency), [2, 4]);
    for (const c of cap) {
      assert.equal(c.errors, 0);
      assert.ok(c.p50Ms >= 0 && c.p95Ms >= c.p50Ms);
    }
    assert.equal(report.endpoints[0].fidelity.length, 12);
    assert.equal(mock.stats.maxInFlight >= 4, true);
  });
});

test('errors_counted', async () => {
  await withMock({ mode: 'error500' }, async mock => {
    const report = await runPreflight({ endpoints: [endpointFor(mock)], capacity: true, steps: [3] });
    const [step] = report.endpoints[0].capacity;
    assert.equal(step.errors, 3);
    assert.equal(step.p50Ms, null);
    assert.ok(report.endpoints[0].fidelity.every(r => !r.ok));
  });
});

test('flags_reported', async () => {
  await withMock({ mode: 'empty' }, async mock => {
    const report = await runPreflight({ endpoints: [endpointFor(mock)], steps: [1] });
    const row = report.endpoints[0].fidelity[0];
    assert.equal(row.ok, false);
    assert.deepEqual(row.flags, ['empty']);
  });
});

test('fidelity_row_and_flags', async () => {
  await withMock({ content: 'I never heard the bell, so I guessed it was snack time.' }, async mock => {
    const report = await runPreflight({ endpoints: [endpointFor(mock)], steps: [1] });
    const rows = report.endpoints[0].fidelity;
    // Identity cast on banana: momo planner, pip carrier, nori lookout, kiki minder.
    const kiki = rows.find(r => r.character === 'kiki');
    assert.deepEqual([kiki.ok, kiki.words, kiki.flags], [true, 12, []]);
    const momo = rows.find(r => r.character === 'momo');
    assert.deepEqual(momo.flags, ['planner_no_admission']);
    assert.equal(momo.question, 'Did the keeper really say you could take the bananas?');
    assert.deepEqual(rows.find(r => r.character === 'nori').flags, ['lookout_no_admission']);
    assert.deepEqual(rows.find(r => r.character === 'pip').flags, []);
  });
});

test('flags: carrier_knows_motive and minder_heard_bell', async () => {
  await withMock({ content: 'I heard the bell and I was so hungry that day, honestly.' }, async mock => {
    const rows = (await runPreflight({ endpoints: [endpointFor(mock)], steps: [1] })).endpoints[0].fidelity;
    assert.ok(rows.filter(r => r.character === 'pip').every(r => r.flags.includes('carrier_knows_motive')));
    assert.ok(rows.find(r => r.character === 'kiki').flags.includes('minder_heard_bell'));
  });
});

test('percentile_nearest_rank', async () => {
  const { percentile } = await import('../scripts/preflight.mjs');
  assert.equal(percentile([], 50), null);
  assert.deepEqual([percentile([7], 50), percentile([7], 95)], [7, 7]);
  assert.deepEqual([percentile([1, 2], 50), percentile([1, 2], 95)], [1, 2]);
  const twenty = Array.from({ length: 20 }, (_, i) => i + 1);
  assert.deepEqual([percentile(twenty, 50), percentile(twenty, 95)], [10, 19]);
});

test('capacity_requests_all_in_flight_together', async () => {
  await withMock({ delayMs: [150, 150] }, async mock => {
    const ep = { ...endpointFor(mock), maxInFlight: 2 };
    const pending = runPreflight({ endpoints: [ep], capacity: true, steps: [8] });
    const report = await pending;
    assert.equal(report.endpoints[0].capacityMaxInFlight, 8);
    assert.equal(report.endpoints[0].capacity[0].errors, 0);
    assert.equal(mock.stats.maxInFlight >= 8, true);
  });
});

test('report_has_no_keys', async () => {
  const { renderReport } = await import('../scripts/preflight.mjs');
  await withMock({ mode: 'error500' }, async mock => {
    const ep = { ...endpointFor(mock), key: 'sk-secret-123' };
    const report = await runPreflight({ endpoints: [ep], steps: [1] });
    const text = JSON.stringify(report) + renderReport(report);
    assert.doesNotMatch(text, /sk-secret-123|Authorization|Bearer/i);
  });
});

test('cli_rehearsal_exits_zero', async () => {
  const { spawnSync } = await import('node:child_process');
  const env = { PATH: process.env.PATH };
  const r = spawnSync(process.execPath, [new URL('../scripts/preflight.mjs', import.meta.url).pathname], { env, encoding: 'utf8', timeout: 15000 });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /No live endpoints/);
});

test('host_accept_queue_reported', async () => {
  const { renderReport } = await import('../scripts/preflight.mjs');
  const report = await runPreflight({ endpoints: [], steps: [1] });
  const { acceptQueueLimit, ok } = report.host;
  assert.ok(acceptQueueLimit === null || (Number.isInteger(acceptQueueLimit) && acceptQueueLimit > 0));
  assert.equal(ok, acceptQueueLimit === null || acceptQueueLimit >= 1024);
  assert.match(renderReport(report), /Accept queue limit/);
  assert.equal(/WARNING/.test(renderReport(report)), !ok);
});

test('host_low_limit_not_ok', async () => {
  const { renderReport } = await import('../scripts/preflight.mjs');
  const report = await runPreflight({ endpoints: [], acceptQueueLimit: () => 128 });
  assert.equal(report.host.ok, false);
  assert.match(renderReport(report), /WARNING/);
});

test('host_unknown_limit_ok', async () => {
  const report = await runPreflight({ endpoints: [], acceptQueueLimit: () => null });
  assert.equal(report.host.ok, true);
});

test('exit_code_for_host', async () => {
  const { exitCodeFor } = await import('../scripts/preflight.mjs');
  assert.equal(exitCodeFor({ host: { ok: false }, endpoints: [] }), 2);
  assert.equal(exitCodeFor({ host: { ok: true }, endpoints: [] }), 0);
});

test('flags: lookout_no_admission fires on a lookout who only says they watched', () => {
  const cast = identityCast(cases[0]);
  const lookout = Object.keys(cast).find(id => cast[id] === 'lookout');
  const quick = resolveText(cases[0], cast, partOf(cases[0], cast, lookout).quickQuestion);
  assert.deepEqual(flagsFor(lookout, quick, 'I sat by the path and watched all morning, nobody came by at all today.'), ['lookout_no_admission']);
  assert.deepEqual(flagsFor(lookout, quick, 'For the keeper. I knew it was against the rule, but I wanted a banana anyway.'), []);
});
