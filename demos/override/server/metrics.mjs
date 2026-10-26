import { statfsSync } from 'node:fs';
import { monitorEventLoopDelay } from 'node:perf_hooks';

// A small Prometheus text encoder (no prom-client: the server has no runtime dependencies).
const namePattern = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/;
const escapeLabel = value => String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
const escapeHelp = text => String(text).replace(/\\/g, '\\\\').replace(/\n/g, '\\n');
const number = v => (v === Infinity ? '+Inf' : v === -Infinity ? '-Inf' : String(v));

class Metric {
  constructor(name, help, labelNames, type) {
    if (!namePattern.test(name)) throw new Error(`Invalid metric name ${name}.`);
    for (const label of labelNames) if (!namePattern.test(label) || label.startsWith('__')) throw new Error(`Invalid label name ${label}.`);
    this.name = name; this.help = help; this.labelNames = labelNames; this.type = type;
    this.series = new Map();
  }

  // Label values are stored in labelNames order; an unset label is an empty string.
  entry(labels = {}) {
    const values = this.labelNames.map(n => String(labels[n] ?? ''));
    const key = JSON.stringify(values);
    let entry = this.series.get(key);
    if (!entry) { entry = { values, value: 0 }; this.series.set(key, entry); }
    return entry;
  }

  text(extra = [], values = []) {
    const pairs = [...this.labelNames.map((n, i) => [n, values[i]]), ...extra];
    return pairs.length ? `{${pairs.map(([n, v]) => `${n}="${escapeLabel(v)}"`).join(',')}}` : '';
  }

  header() { return [`# HELP ${this.name} ${escapeHelp(this.help)}`, `# TYPE ${this.name} ${this.type}`]; }
}

class Counter extends Metric {
  constructor(name, help, labelNames) { super(name, help, labelNames, 'counter'); if (!labelNames.length) this.entry(); }
  inc(labels = {}, n = 1) {
    if (!Number.isFinite(n) || n < 0) throw new Error('A counter only increases by a finite amount.');
    this.entry(labels).value += n;
  }
  lines() { return [...this.series.values()].map(e => `${this.name}${this.text([], e.values)} ${number(e.value)}`); }
}

class Gauge extends Metric {
  constructor(name, help, labelNames, collect) { super(name, help, labelNames, 'gauge'); this.collect = collect; }
  set(labels, value) { this.entry(labels).value = value; }
  // `collect` returns a number, an array of {labels, value}, or nothing.
  lines() {
    let samples = [...this.series.values()].map(e => ({ values: e.values, value: e.value }));
    if (this.collect) {
      let got;
      try { got = this.collect(); } catch { got = null; }
      if (typeof got === 'number') samples = [{ values: this.labelNames.map(() => ''), value: got }];
      else if (Array.isArray(got)) samples = got.map(s => ({ values: this.labelNames.map(n => String(s.labels?.[n] ?? '')), value: s.value }));
    }
    return samples.filter(s => Number.isFinite(s.value)).map(s => `${this.name}${this.text([], s.values)} ${number(s.value)}`);
  }
}

class Histogram extends Metric {
  constructor(name, help, labelNames, buckets) {
    super(name, help, labelNames, 'histogram');
    this.buckets = [...buckets].sort((a, b) => a - b);
  }
  observe(labels = {}, value) {
    if (!Number.isFinite(value)) return;
    const entry = this.entry(labels);
    if (typeof entry.value !== 'object') entry.value = { counts: this.buckets.map(() => 0), sum: 0, count: 0 };
    const h = entry.value;
    this.buckets.forEach((b, i) => { if (value <= b) h.counts[i]++; });
    h.sum += value; h.count++;
  }
  lines() {
    const out = [];
    for (const e of this.series.values()) {
      if (typeof e.value !== 'object') continue;
      const h = e.value;
      this.buckets.forEach((b, i) => out.push(`${this.name}_bucket${this.text([['le', number(b)]], e.values)} ${h.counts[i]}`));
      out.push(`${this.name}_bucket${this.text([['le', '+Inf']], e.values)} ${h.count}`);
      out.push(`${this.name}_sum${this.text([], e.values)} ${number(h.sum)}`);
      out.push(`${this.name}_count${this.text([], e.values)} ${h.count}`);
    }
    return out;
  }
}

export class Registry {
  constructor() { this.metrics = new Map(); }
  add(metric) {
    if (this.metrics.has(metric.name)) throw new Error(`Metric ${metric.name} is already registered.`);
    this.metrics.set(metric.name, metric);
    return metric;
  }
  counter(name, help, labelNames = []) { return this.add(new Counter(name, help, labelNames)); }
  gauge(name, help, labelNames = [], collect = null) { return this.add(new Gauge(name, help, labelNames, collect)); }
  histogram(name, help, labelNames = [], buckets = [0.1, 1, 10]) { return this.add(new Histogram(name, help, labelNames, buckets)); }
  render() {
    const out = [];
    for (const m of this.metrics.values()) out.push(...m.header(), ...m.lines());
    return `${out.join('\n')}\n`;
  }
}

const httpBuckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const llmBuckets = [0.5, 1, 2, 5, 10, 20, 30, 45, 60, 90];
const writeBuckets = [0.0005, 0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1];

export function createGameMetrics(r) {
  return {
    httpRequests: r.counter('override_http_requests_total', 'HTTP requests by route and status.', ['route', 'status']),
    httpDuration: r.histogram('override_http_request_duration_seconds', 'HTTP request duration by route.', ['route'], httpBuckets),
    sessionsStarted: r.counter('override_sessions_started_total', 'Games started.', []),
    sessionsCompleted: r.counter('override_sessions_completed_total', 'Games that reached a verdict.', []),
    llmDuration: r.histogram('override_llm_request_duration_seconds', 'LLM attempt duration by endpoint.', ['endpoint'], llmBuckets),
    llmFailures: r.counter('override_llm_failures_total', 'Failed LLM attempts by endpoint and reason.', ['endpoint', 'reason']),
    llmSemanticRetries: r.counter('override_llm_semantic_retries_total', 'Retries after an unusable answer, by reason.', ['reason']),
    llmFailovers: r.counter('override_llm_failovers_total', 'Active endpoint changes.', ['from', 'to', 'reason']),
    logWriteDuration: r.histogram('override_log_write_duration_seconds', 'Log append duration by file kind.', ['kind'], writeBuckets),
    logWriteFailures: r.counter('override_log_write_failures_total', 'Failed log appends by file kind.', ['kind']),
    staticBytes: r.counter('override_static_bytes_total', 'Static bytes sent.', []),
  };
}

export function observeLlmEvent(m, event) {
  if (event.type === 'attempt') {
    m.llmDuration.observe({ endpoint: event.endpoint }, (event.durationMs ?? 0) / 1000);
    if (!event.ok) m.llmFailures.inc({ endpoint: event.endpoint, reason: event.reason ?? 'unknown' });
    if (event.semantic) m.llmSemanticRetries.inc({ reason: event.reason ?? 'retry' });
  } else if (event.type === 'failover') {
    m.llmFailovers.inc({ from: event.from, to: event.to, reason: event.reason });
  }
}

export function observeGameEvent(m, event) {
  if (event.type === 'session_started') m.sessionsStarted.inc();
  else if (event.type === 'verdict_submitted') m.sessionsCompleted.inc();
}

export function observeWrite(m, { kind, durationMs, ok }) {
  m.logWriteDuration.observe({ kind }, durationMs / 1000);
  if (!ok) m.logWriteFailures.inc({ kind });
}

const monitors = new WeakMap();

// Gauges read live state at scrape time. A missing router (rehearsal mode) just has no LLM samples.
export function bindCollectors(registry, { router = null, investigations = null, dataDir = null } = {}) {
  const endpoints = field => () => router?.snapshot().endpoints.map(e => ({ labels: { endpoint: e.name }, value: e[field] }));
  registry.gauge('override_sessions_active', 'Games held in memory.', [], () => investigations?.stats().games);
  registry.gauge('override_sessions_by_stage', 'Games by stage.', ['stage'], () => {
    const stages = investigations?.stats().byStage;
    return stages && Object.entries(stages).map(([stage, value]) => ({ labels: { stage }, value }));
  });
  registry.gauge('override_llm_in_flight', 'LLM calls in flight by endpoint.', ['endpoint'], endpoints('inFlight'));
  registry.gauge('override_llm_queue_length', 'Questions waiting for an endpoint slot.', ['endpoint'], endpoints('queued'));
  registry.gauge('override_llm_active_endpoint', 'The endpoint new questions go to.', ['endpoint'], () => {
    const s = router?.snapshot();
    return s && [{ labels: { endpoint: s.active }, value: 1 }];
  });
  registry.gauge('override_llm_pinned', '1 when the operator pinned the active endpoint.', [], () => {
    const s = router?.snapshot();
    return s && (s.pinned ? 1 : 0);
  });
  registry.gauge('override_disk_free_bytes', 'Free disk space under the data directory.', [], () => {
    if (!dataDir) return null;
    const fs = statfsSync(dataDir);
    return fs.bavail * fs.bsize;
  });
  let monitor = monitors.get(registry);
  if (!monitor) { monitor = monitorEventLoopDelay({ resolution: 20 }); monitor.enable(); monitors.set(registry, monitor); }
  registry.gauge('override_process_event_loop_delay_p99_seconds', 'Event loop delay p99 since the last scrape.', [], () => {
    const p99 = monitor.percentile(99) / 1e9;
    monitor.reset();
    return p99 < 1e6 ? p99 : 0;
  });
  registry.gauge('override_process_resident_memory_bytes', 'Resident memory.', [], () => process.memoryUsage().rss);
  registry.gauge('override_process_heap_used_bytes', 'Heap in use.', [], () => process.memoryUsage().heapUsed);
}
