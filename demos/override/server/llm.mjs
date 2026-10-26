import { randomUUID } from 'node:crypto';
import { InterviewProviderError } from './errors.mjs';

const TIMEOUT_TEXT = 'The interview service took too long to answer. Your question is saved; please retry.';
const MESSAGES = {
  timeout: TIMEOUT_TEXT,
  queue_timeout: TIMEOUT_TEXT,
  invalid_response: 'The interview service returned an unreadable response. Please retry.',
  connection_failed: 'Could not connect to the interview service. Check the server connection and retry.',
  empty_or_invalid_answer: 'The interview service returned an unusable answer. Please retry your question.',
  completion_limit: 'The model reached its response limit before finishing. Please retry or increase the server’s interview token limit.',
  content_filter: 'The interview service declined to answer. Please rephrase and retry.',
};
function failureMessage(code, status) {
  if (code === 'credentials_rejected') return `The interview service rejected the server’s API credentials (HTTP ${status}). Update the configured key and retry.`;
  if (code === 'rate_limited') return 'The interview service is busy or rate-limited (HTTP 429). Please retry shortly.';
  if (code === 'request_failed') return `The interview service returned HTTP ${status}. ${status >= 500 ? 'It may be temporarily unavailable; please retry.' : 'Check the configured endpoint and model.'}`;
  return MESSAGES[code];
}
// A queue wait or a budget retry says nothing about the endpoint's health.
const NOT_HEALTH = new Set(['queue_timeout', 'completion_limit']);
const SEMANTIC = new Set(['empty_or_invalid_answer', 'content_filter', 'completion_limit', 'invalid_response']);
const FIVE_MINUTES = 300_000;
const safe = (fn, label) => (...args) => { try { fn(...args); } catch (error) { console.error(`${label} failed: ${error.message}`); } };

export class LlmRouter {
  constructor({
    endpoints, maxInFlight = 200, deadlineMs = 60_000, maxCompletionTokens = 2048, failover = { failures: 5, windowMs: 30_000 },
    fetcher = fetch, now = Date.now, restore = null, onSystem = () => {}, onTrace = () => {}, onEvent = () => {},
  }) {
    this.eps = endpoints.map(e => ({
      ...e, baseUrl: e.baseUrl.replace(/\/$/, ''), host: new URL(e.baseUrl).host, maxInFlight: e.maxInFlight ?? 50,
      tokenParam: e.tokenParam || 'max_completion_tokens', timeoutMs: e.timeoutMs ?? 25_000, temperature: e.temperature ?? null,
      inFlight: 0, failureTimes: [], recent: [], lastSuccessAt: null, lastFailureAt: null, lastFailureReason: null, lastAlertAt: -Infinity,
    }));
    Object.assign(this, { maxInFlight, deadlineMs, maxCompletionTokens, failover, fetcher, now });
    this.onSystem = safe(onSystem, 'onSystem'); this.onTrace = safe(onTrace, 'onTrace'); this.onEvent = safe(onEvent, 'onEvent');
    this.activeIdx = 0; this.pinned = false;
    const restored = restore ? this.eps.findIndex(e => e.name === restore.active) : -1;
    if (restored >= 0) { this.activeIdx = restored; this.pinned = Boolean(restore.pinned); }
    this.inFlight = 0; this.queue = []; this.ops = 0; this.idleWaiters = [];
  }

  iso() { return new Date(this.now()).toISOString(); }
  index(name) {
    const i = this.eps.findIndex(e => e.name === name);
    if (i < 0) throw new Error(`Unknown endpoint ${name}.`);
    return i;
  }

  // Scans the whole queue so a question waiting on a full endpoint never blocks one bound for a free endpoint.
  pump() {
    for (let i = 0; i < this.queue.length;) {
      if (this.inFlight >= this.maxInFlight) return;
      const entry = this.queue[i];
      const idx = entry.target ?? this.activeIdx;
      const ep = this.eps[idx];
      if (ep.inFlight < ep.maxInFlight) { this.queue.splice(i, 1); ep.inFlight++; this.inFlight++; entry.grant(idx); } else i++;
    }
  }
  acquire(target, signal, head) {
    if (signal.aborted) return Promise.reject(new Error('queue_timeout'));
    return new Promise((resolve, reject) => {
      const entry = { target, grant: idx => { signal.removeEventListener('abort', onAbort); resolve(idx); } };
      const onAbort = () => { const i = this.queue.indexOf(entry); if (i >= 0) { this.queue.splice(i, 1); reject(new Error('queue_timeout')); } };
      signal.addEventListener('abort', onAbort, { once: true });
      if (head) this.queue.unshift(entry); else this.queue.push(entry);
      this.pump();
    });
  }
  release(idx) { this.eps[idx].inFlight--; this.inFlight--; this.pump(); }
  begin() { this.ops++; }
  end() { if (--this.ops === 0) for (const resolve of this.idleWaiters.splice(0)) resolve(); }
  idle() { return this.ops === 0 ? Promise.resolve() : new Promise(resolve => this.idleWaiters.push(resolve)); }

  changeActive(idx, { pinned, by, reason }) {
    const from = this.eps[this.activeIdx].name;
    const moved = idx !== this.activeIdx;
    this.activeIdx = idx; this.pinned = pinned;
    if (moved) for (const e of this.eps) e.recent = [];
    this.onSystem({ type: 'llm_active', timestamp: this.iso(), active: this.eps[idx].name, pinned, from, by, reason });
    if (moved) this.onEvent({ type: 'failover', from, to: this.eps[idx].name, reason: by === 'auto' ? 'auto' : 'operator' });
    this.pump();
  }
  setActive(name, { pinned = false, reason, by = 'operator' } = {}) {
    const idx = this.index(name);
    if (typeof reason !== 'string' || !reason.trim()) throw new Error('A reason is required.');
    this.changeActive(idx, { pinned: Boolean(pinned), by, reason: reason.trim() });
    return this.snapshot();
  }
  setCap({ endpoint = null, value } = {}) {
    if (!Number.isInteger(value) || value < 1 || value > 10_000) throw new Error('Cap must be an integer between 1 and 10000.');
    if (endpoint === null) this.maxInFlight = value; else this.eps[this.index(endpoint)].maxInFlight = value;
    this.pump();
    return this.snapshot();
  }

  snapshot() {
    const cutoff = this.now() - FIVE_MINUTES;
    return {
      active: this.eps[this.activeIdx].name, pinned: this.pinned, inFlight: this.inFlight, queued: this.queue.length, maxInFlight: this.maxInFlight,
      endpoints: this.eps.map((e, i) => ({
        name: e.name, model: e.model, apiBaseHost: e.host, inFlight: e.inFlight, maxInFlight: e.maxInFlight,
        queued: this.queue.filter(q => (q.target ?? this.activeIdx) === i).length,
        lastSuccessAt: e.lastSuccessAt, lastFailureAt: e.lastFailureAt, lastFailureReason: e.lastFailureReason,
        failures5m: e.failureTimes.filter(t => t > cutoff).length,
      })),
    };
  }

  recordFailure(idx, code, status) {
    const ep = this.eps[idx];
    ep.lastFailureAt = this.iso(); ep.lastFailureReason = code;
    if (code === 'credentials_rejected' && this.now() - ep.lastAlertAt >= 60_000) {
      ep.lastAlertAt = this.now();
      console.error(`LLM endpoint ${ep.name} rejected the configured credentials (HTTP ${status}).`);
    }
    if (NOT_HEALTH.has(code)) return;
    const t = this.now();
    ep.failureTimes = ep.failureTimes.filter(x => x > t - FIVE_MINUTES); ep.failureTimes.push(t);
    ep.recent = ep.recent.filter(x => x > t - this.failover.windowMs); ep.recent.push(t);
    if (idx === this.activeIdx && !this.pinned && idx < this.eps.length - 1 && ep.recent.length >= this.failover.failures) {
      this.changeActive(idx + 1, { pinned: false, by: 'auto', reason: `${ep.recent.length} failures in ${this.failover.windowMs} ms` });
    }
  }

  // One HTTP call. Never throws: returns {ok, ...} so callers can trace every outcome.
  async call(idx, messages, budget, deadline) {
    const ep = this.eps[idx];
    const params = { [ep.tokenParam]: budget, temperature: ep.temperature };
    const body = { model: ep.model, messages, [ep.tokenParam]: budget, ...(ep.temperature === null ? {} : { temperature: ep.temperature }) };
    const remaining = Math.max(1, deadline.endsAt - this.now());
    const signal = AbortSignal.any([deadline.signal, AbortSignal.timeout(Math.min(ep.timeoutMs, remaining))]);
    const started = this.now();
    const out = { deadlineBound: remaining <= ep.timeoutMs, params, status: null, content: null, finishReason: null, usage: null, providerModel: null, code: null };
    try {
      const aborted = new Promise((_, reject) => {
        const fire = () => reject(Object.assign(new Error('aborted'), { name: 'TimeoutError' }));
        if (signal.aborted) fire(); else signal.addEventListener('abort', fire, { once: true });
      });
      const work = (async () => {
        const response = await this.fetcher(`${ep.baseUrl}/chat/completions`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ep.key}` }, body: JSON.stringify(body), signal,
        });
        out.status = response.status;
        out.data = response.ok ? await response.json() : null;
        return response;
      })();
      work.catch(() => {});
      const response = await Promise.race([work, aborted]);
      if (!response.ok) out.code = [401, 403].includes(response.status) ? 'credentials_rejected' : response.status === 429 ? 'rate_limited' : 'request_failed';
    } catch (error) {
      if (signal.aborted || ['TimeoutError', 'AbortError'].includes(error.name)) out.code = 'timeout';
      else out.code = error instanceof SyntaxError ? 'invalid_response' : 'connection_failed';
    }
    if (!out.code) {
      const data = out.data;
      const choice = data?.choices?.[0];
      const text = choice?.message?.content;
      out.finishReason = ['stop', 'length', 'content_filter', 'tool_calls'].includes(choice?.finish_reason) ? choice.finish_reason : null;
      out.usage = data?.usage && typeof data.usage === 'object' ? data.usage : null;
      out.providerModel = typeof data?.model === 'string' ? data.model : null;
      out.content = typeof text === 'string' ? text : null;
      if (out.finishReason === 'length') out.code = 'completion_limit';
      else if (out.finishReason === 'content_filter') out.code = 'content_filter';
      else if (typeof text !== 'string' || !text.trim() || text.length > 6000) out.code = 'empty_or_invalid_answer';
    }
    delete out.data;
    out.durationMs = this.now() - started;
    return out;
  }

  trace(base, idx, budget, messages, result, queueMs) {
    const ep = this.eps[idx];
    const record = {
      schemaVersion: 1, traceId: randomUUID(), ...base, timestamp: this.iso(), endpoint: ep.name, pinned: this.pinned,
      request: { apiBaseHost: ep.host, model: ep.model, messages, params: result.params },
      response: { status: result.status, content: result.content, finishReason: result.finishReason, usage: result.usage, providerModel: result.providerModel },
      providerStatus: result.status, queueMs, durationMs: result.durationMs, error: result.code,
    };
    this.onTrace(record);
    return record.traceId;
  }

  async complete({ messages, sessionId = null, questionEventId = null, onAttempt = () => {} }) {
    this.begin();
    const deadline = new AbortController();
    deadline.endsAt = this.now() + this.deadlineMs;
    const timer = setTimeout(() => deadline.abort(), this.deadlineMs);
    const track = { attempts: 0, traceIds: [], queueMs: 0, durationMs: 0, first: null, last: null, semanticRetry: false };
    try {
      return await this.run({ messages, sessionId, questionEventId, onAttempt: safe(onAttempt, 'onAttempt') }, { signal: deadline.signal, endsAt: deadline.endsAt }, track);
    } finally { clearTimeout(timer); this.end(); }
  }

  provenance(track, idx, result) {
    const ep = this.eps[idx];
    const u = result?.usage;
    return {
      endpoint: ep.name, apiBaseHost: ep.host, providerModel: ep.model, attempts: track.attempts, failedOver: track.first !== null && track.first !== idx,
      pinned: this.pinned, queueMs: track.queueMs, durationMs: track.durationMs,
      promptTokens: Number.isInteger(u?.prompt_tokens) ? u.prompt_tokens : null,
      completionTokens: Number.isInteger(u?.completion_tokens) ? u.completion_tokens : null,
      reasoningTokens: Number.isInteger(u?.completion_tokens_details?.reasoning_tokens) ? u.completion_tokens_details.reasoning_tokens : null,
      samplingParams: result?.params ?? { [ep.tokenParam]: null, temperature: ep.temperature }, traceIds: track.traceIds, semanticRetry: track.semanticRetry,
    };
  }
  fail(code, track, idx, result) {
    const status = result?.status ?? null;
    const httpFailure = ['credentials_rejected', 'rate_limited', 'request_failed'].includes(code);
    const diagnostics = status === null ? {} : httpFailure ? { providerStatus: status }
      : { providerStatus: status, finishReason: result.finishReason, completionTokens: Number.isInteger(result.usage?.completion_tokens) ? result.usage.completion_tokens : null };
    const error = new InterviewProviderError(code, failureMessage(code, status), diagnostics);
    error.provenance = this.provenance(track, idx, result);
    return error;
  }

  async run(req, deadline, track) {
    const initial = this.maxCompletionTokens;
    let budget = initial; let lastResult = null; let lastIdx = null;
    let queued = this.now();
    let pending = this.acquire(null, deadline.signal, false);
    for (let n = 1; n <= 2; n++) {
      let idx;
      try { idx = await pending; } catch { throw this.fail('queue_timeout', track, lastIdx ?? this.activeIdx, null); }
      const queueMs = this.now() - queued;
      track.queueMs += queueMs; track.attempts = n; track.first ??= idx;
      let result;
      let held = idx; // slot guard: any throw below must still free the slot
      try { result = await this.call(idx, req.messages, budget, deadline); } catch (error) { this.release(idx); throw error; }
      try {
        const semantic = SEMANTIC.has(result.code ?? '');
        track.durationMs += result.durationMs; lastResult = result; lastIdx = idx;
        track.traceIds.push(this.trace({ sessionId: req.sessionId, questionEventId: req.questionEventId, attempt: n }, idx, budget, req.messages, result, queueMs));
        const ep = this.eps[idx];
        req.onAttempt({
          attempt: n, endpoint: ep.name, providerStatus: result.status, finishReason: result.finishReason,
          completionTokens: Number.isInteger(result.usage?.completion_tokens) ? result.usage.completion_tokens : null, completionTokenLimit: budget, durationMs: result.durationMs,
        });
        this.onEvent({ type: 'attempt', endpoint: ep.name, ok: !result.code, reason: result.code, durationMs: result.durationMs, semantic, queueMs });
        if (!result.code) {
          ep.lastSuccessAt = this.iso();
          held = null; this.release(idx);
          return { content: result.content.trim(), provenance: this.provenance(track, idx, result) };
        }
        this.recordFailure(idx, result.code, result.status);
        let target = null;
        // A timeout bound by the question deadline leaves no time for a second call.
        if (n === 1 && !deadline.signal.aborted && !(result.code === 'timeout' && result.deadlineBound)) {
          if (result.code === 'completion_limit') {
            const doubled = Math.min(initial * 2, 8192);
            if (doubled !== budget) { target = idx; budget = doubled; }
          } else if (idx + 1 < this.eps.length) { target = idx + 1; budget = initial; }
        }
        if (target === null) { held = null; this.release(idx); break; }
        track.semanticRetry = semantic;
        // Queue the retry before freeing the slot, so it keeps its place at the head.
        queued = this.now();
        pending = this.acquire(target, deadline.signal, true);
        held = null; this.release(idx);
      } catch (error) { if (held !== null) this.release(held); throw error; }
    }
    throw this.fail(lastResult.code, track, lastIdx, lastResult);
  }

  async probe(name, messages) {
    const idx = this.index(name);
    const ep = this.eps[idx];
    this.begin();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ep.timeoutMs);
    try {
      const result = await this.call(idx, messages, this.maxCompletionTokens, { signal: controller.signal, endsAt: this.now() + ep.timeoutMs });
      this.trace({ sessionId: null, questionEventId: null, attempt: 1, probe: true }, idx, this.maxCompletionTokens, messages, result, 0);
      return { ok: !result.code, endpoint: ep.name, durationMs: result.durationMs, content: result.code ? null : result.content.trim(), reason: result.code };
    } finally { clearTimeout(timer); this.end(); }
  }
}
