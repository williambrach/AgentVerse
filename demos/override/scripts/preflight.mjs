import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { LlmRouter } from '../server/llm.mjs';
import { buildMessages, modelConfig } from '../server/interviews.mjs';
import { identityCast, partOf, resolve as resolveText } from '../server/cases.mjs';
import { cases } from '../server/cases/index.mjs';

// Preflight exercises the first registered case.
const kase = cases[0];
const { characters } = kase;
// Rows use the identity cast: character i plays part i, so flags key off the part.
const cast = identityCast(kase);
const quickOf = characterId => resolveText(kase, cast, partOf(kase, cast, characterId).quickQuestion);

const FOLLOW_UPS = ['What did you know at the time?', 'Who told you, and did you check?'];
// Local copy of the load test helper: the OS accept-queue cap, or null when unknown.
function readAcceptQueueLimit() {
  try {
    const raw = process.platform === 'linux' ? readFileSync('/proc/sys/net/core/somaxconn', 'utf8') : execFileSync('sysctl', ['-n', 'kern.ipc.somaxconn'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const n = Number.parseInt(raw.trim(), 10);
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch { return null; }
}
const words = text => text.trim().split(/\s+/).filter(Boolean).length;

export function flagsFor(characterId, question, answer) {
  const flags = [];
  const n = words(answer);
  if (!answer.trim()) return ['empty'];
  if (n < 10 || n > 60) flags.push('length');
  const quick = quickOf(characterId);
  const part = cast[characterId];
  if (part === 'planner' && question === quick && !/made (it )?up|lied|invent|not true/i.test(answer)) flags.push('planner_no_admission');
  if (part === 'carrier' && /hungry/i.test(answer)) flags.push('carrier_knows_motive');
  if (part === 'lookout' && question === quick && !/keeper|rule|caught|wrong|against/i.test(answer)) flags.push('lookout_no_admission');
  if (part === 'minder' && question === quick && !/(never|didn'?t|did not) hear/i.test(answer)) flags.push('minder_heard_bell');
  return flags;
}

// Nearest-rank percentile on an ascending list.
export const percentile = (sorted, p) => (sorted.length ? sorted[Math.max(0, Math.ceil((p * sorted.length) / 100) - 1)] : null);

async function fidelityFor(router, characterId) {
  const character = characters.find(c => c.id === characterId);
  const session = { cast, interviews: Object.fromEntries(characters.map(c => [c.id, []])) };
  const rows = [];
  for (const question of [quickOf(characterId), ...FOLLOW_UPS]) {
    let row;
    try {
      const { content } = await router.complete({ messages: buildMessages(kase, session, characterId, question) });
      row = { character: characterId, question, ok: true, words: words(content), flags: flagsFor(characterId, question, content), answer: content };
      session.interviews[characterId].push({ question, answer: content });
    } catch (error) {
      const empty = error.code === 'empty_or_invalid_answer';
      row = { character: characterId, question, ok: false, words: 0, flags: [empty ? 'empty' : `error:${error.code ?? 'unknown'}`], answer: '' };
      // A failed turn adds no history, so later questions still run with what was answered.
    }
    rows.push(row);
  }
  return rows;
}

async function capacityRun(router, steps) {
  const characterId = characters[0].id;
  const session = { cast, interviews: Object.fromEntries(characters.map(c => [c.id, []])) };
  const messages = buildMessages(kase, session, characterId, quickOf(characterId));
  const results = [];
  for (const concurrency of steps) {
    const latencies = []; let errors = 0;
    await Promise.all(Array.from({ length: concurrency }, async () => {
      const started = performance.now();
      try { await router.complete({ messages }); latencies.push(performance.now() - started); } catch { errors++; }
    }));
    latencies.sort((a, b) => a - b);
    results.push({ concurrency, errors, p50Ms: percentile(latencies, 50), p95Ms: percentile(latencies, 95) });
  }
  return results;
}

export async function runPreflight({ endpoints, capacity = false, steps = [10, 25, 50, 100, 200], fetcher = fetch, maxCompletionTokens = 2048, deadlineMs = 60_000, acceptQueueLimit = readAcceptQueueLimit }) {
  const top = Math.max(...steps);
  const limit = acceptQueueLimit();
  const report = { endpoints: [], host: { acceptQueueLimit: limit, ok: limit === null || limit >= 1024 } };
  for (const endpoint of endpoints) {
    // failover threshold is unreachable: a single-endpoint router must record failures, not move.
    const make = ep => new LlmRouter({ endpoints: [ep], maxInFlight: top, deadlineMs, maxCompletionTokens, fetcher, failover: { failures: 1e9, windowMs: 1 } });
    const router = make(endpoint);
    const groups = await Promise.all(characters.map(c => fidelityFor(router, c.id)));
    const entry = { name: endpoint.name, fidelity: groups.flat(), capacity: [] };
    if (capacity) {
      entry.capacityMaxInFlight = Math.max(endpoint.maxInFlight ?? 50, top);
      entry.capacity = await capacityRun(make({ ...endpoint, maxInFlight: entry.capacityMaxInFlight }), steps);
    }
    report.endpoints.push(entry);
  }
  return report;
}

export const exitCodeFor = report => (report.host && !report.host.ok ? 2 : 0);

export function renderReport(report) {
  const out = [];
  if (report.host) {
    out.push('## Host', '', `Accept queue limit (somaxconn): ${report.host.acceptQueueLimit ?? 'unknown'}`);
    if (!report.host.ok) out.push('', `WARNING: the OS accept queue is ${report.host.acceptQueueLimit}, below 1024: a 200-player burst will see connection resets. Raise it (sudo sysctl -w kern.ipc.somaxconn=1024).`);
    out.push('');
  }
  for (const e of report.endpoints) {
    out.push(`## Endpoint ${e.name}`, '', '| character | ok | words | flags | question |', '|---|---|---|---|---|');
    for (const r of e.fidelity) out.push(`| ${r.character} | ${r.ok ? 'yes' : 'NO'} | ${r.words} | ${r.flags.join(', ') || '-'} | ${r.question} |`);
    if (e.capacity.length) {
      out.push('', `Capacity (endpoint maxInFlight lifted to ${e.capacityMaxInFlight} for this run)`, '', '| concurrency | errors | p50 ms | p95 ms |', '|---|---|---|---|');
      for (const c of e.capacity) out.push(`| ${c.concurrency} | ${c.errors} | ${c.p50Ms === null ? '-' : Math.round(c.p50Ms)} | ${c.p95Ms === null ? '-' : Math.round(c.p95Ms)} |`);
    }
    out.push('');
  }
  return out.join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const config = modelConfig(process.env);
  if (config.mode !== 'live') { console.log('No live endpoints configured.'); process.exit(0); }
  const report = await runPreflight({ endpoints: config.endpoints, capacity: args.includes('--capacity'), maxCompletionTokens: config.maxCompletionTokens, deadlineMs: config.timeoutMs });
  console.log(renderReport(report));
  const out = args.indexOf('--out');
  if (out >= 0 && args[out + 1] && !args[out + 1].startsWith('--'))writeFileSync(args[out + 1], JSON.stringify(report, null, 2));
  if (exitCodeFor(report) !== 0) {
    console.log('Host check failed: run sudo sysctl -w kern.ipc.somaxconn=1024 (macOS) or sysctl -w net.core.somaxconn=1024 (Linux).');
    process.exitCode = exitCodeFor(report);
  }
}
