import { readdirSync, statSync, statfsSync } from 'node:fs';

// Free bytes under dir, or null when it cannot be read.
export function diskFreeBytes(dir) {
  try { const s = statfsSync(dir); return Number(s.bavail) * Number(s.bsize); } catch { return null; }
}
import { resolve } from 'node:path';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { readJsonl } from './dataset.mjs';

const sessionIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHARE_MS = 60_000;
const FAIL_MS = 300_000;

// Sum a counter's series whose labels match `where` (label name -> predicate on the value).
function sumCounter(registry, name, where = {}) {
  const metric = registry.metrics.get(name);
  if (!metric) return 0;
  let total = 0;
  for (const entry of metric.series.values()) {
    if (typeof entry.value !== 'number') continue;
    if (Object.entries(where).every(([label, ok]) => ok(entry.values[metric.labelNames.indexOf(label)]))) total += entry.value;
  }
  return total;
}

function readCounters(registry) {
  const status = prefix => ({ status: v => String(v).startsWith(prefix) });
  return {
    reqs: sumCounter(registry, 'override_http_requests_total'),
    r4xx: sumCounter(registry, 'override_http_requests_total', status('4')),
    r5xx: sumCounter(registry, 'override_http_requests_total', status('5')),
    r429: sumCounter(registry, 'override_http_requests_total', { status: v => String(v) === '429' }),
    writeFailures: sumCounter(registry, 'override_log_write_failures_total'),
    credentials: sumCounter(registry, 'override_llm_failures_total', { reason: v => v === 'credentials_rejected' }),
  };
}

// The newest sample at or before the cutoff, else the oldest one kept.
function baselineFor(samples, cutoff) {
  let found = samples[0];
  for (const s of samples) if (s.at <= cutoff) found = s; else break;
  return found;
}

export function createTrafficSampler({ registry, dataDir, now }) {
  const loop = monitorEventLoopDelay({ resolution: 20 });
  loop.enable();
  let samples = [{ at: now(), ...readCounters(registry) }];
  return {
    sample() {
      const at = now();
      const current = { at, ...readCounters(registry) };
      const shareBase = baselineFor(samples, at - SHARE_MS);
      const failBase = baselineFor(samples, at - FAIL_MS);
      samples.push(current);
      const keep = Math.min(shareBase.at, failBase.at);
      samples = samples.filter(s => s.at >= keep);

      const delta = (key, base) => Math.max(0, current[key] - base[key]); // a counter reset must not go negative
      const reqs = delta('reqs', shareBase);
      const elapsed = (at - shareBase.at) / 1000;
      const share = key => (reqs > 0 ? Math.min(1, delta(key, shareBase) / reqs) : 0);

      const p99 = loop.percentile(99) / 1e6;
      loop.reset();
      return {
        reqPerSec: elapsed > 0 ? reqs / elapsed : 0,
        reqs,
        share4xx: share('r4xx'),
        share5xx: share('r5xx'),
        share429: share('r429'),
        loopP99Ms: Number.isFinite(p99) && p99 >= 0 && p99 < 1e9 ? p99 : 0,
        rssBytes: process.memoryUsage().rss,
        diskFreeBytes: diskFreeBytes(dataDir),
        writeFailures5m: delta('writeFailures', failBase),
        credentialsRejected5m: delta('credentials', failBase),
      };
    },
    close() { loop.disable(); },
  };
}

// The newest round_started record; no file or no record means the round is everything.
export function loadRound(systemFile) {
  let records;
  try { records = readJsonl(systemFile); } catch { return { label: null, startedAt: 0 }; }
  for (let i = records.length - 1; i >= 0; i--) {
    const r = records[i];
    if (r?.type === 'round_started') return { label: r.label ?? null, startedAt: Number(r.startedAt) || 0 };
  }
  return { label: null, startedAt: 0 };
}

const timeOf = e => (typeof e.timestamp === 'number' ? e.timestamp : Date.parse(e.timestamp));
const order = (a, b) => timeOf(a) - timeOf(b) || (a.sequence ?? 0) - (b.sequence ?? 0);

// Events at or after `since` (ms), from session files touched since then. Corrupt files are skipped, never repaired.
export function loadEvents(sessionsDir, since) {
  let names;
  try { names = readdirSync(sessionsDir); } catch { return []; }
  const out = [];
  for (const name of names) {
    if (!name.endsWith('.jsonl')) continue;
    const file = resolve(sessionsDir, name);
    try {
      if (statSync(file).mtimeMs < since) continue;
      for (const e of readJsonl(file)) if (timeOf(e) >= since) out.push(e);
    } catch { /* corrupt or unreadable: skip */ }
  }
  return out.sort(order);
}

// One game's events from disk, or null for a bad id, a missing or an unreadable file.
export function readSessionEvents(sessionsDir, id) {
  if (typeof id !== 'string' || !sessionIdPattern.test(id)) return null;
  const file = resolve(sessionsDir, `${id}.jsonl`);
  try { statSync(file); return readJsonl(file); } catch { return null; }
}
