// In-process admin monitor: composes injected round stats, windows, presence and sources.
const KINDS = {
  session_started: 'start', briefing_viewed: 'briefing', location_visited: 'visit',
  interview_question: 'question', interview_answer: 'answer',
  interview_failed: 'failure', verdict_submitted: 'verdict', debrief_viewed: 'debrief', session_reset: 'reset',
};
const SYSTEM_CAP = 20;
const QUESTION_CAP = 2000;

const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

function questionAt(ctx, id) {
  if (id == null || !ctx) return undefined;
  if (typeof ctx.questionAt === 'function') return ctx.questionAt(id);
  const q = ctx.questions;
  if (q && typeof q.get === 'function') return q.get(id);
  return undefined;
}

export function toRow(e, ctx = {}) {
  const kind = KINDS[e?.type]; // story_revealed / evidence_selected (old logs) have no row
  if (!kind) return null;
  const at = Date.parse(e.timestamp);
  const prov = e.provenance && typeof e.provenance === 'object' ? e.provenance : null;
  const row = {
    id: e.eventId ?? null, at: Number.isNaN(at) ? 0 : at, sessionId: e.sessionId ?? null,
    player: String(e.sessionId ?? '').slice(0, 4), caseId: e.caseId ?? null, kind,
    character: e.character ?? null, text: null, ms: null, endpoint: null, failedOver: false,
    reason: null, verdict: null, elapsedMs: isNum(e.elapsedMs) ? e.elapsedMs : null,
  };
  if (kind === 'visit') row.text = e.location ?? null;
  else if (kind === 'question') row.text = e.question ?? null;
  else if (kind === 'answer' || kind === 'failure') {
    row.text = kind === 'answer' ? (e.answer ?? null) : (e.question ?? null);
    row.endpoint = prov?.endpoint ?? (ctx?.mode === 'rehearsal' ? 'rehearsal' : null);
    row.failedOver = prov?.failedOver === true;
    if (kind === 'failure') row.reason = e.reason ?? null;
    else {
      const qAt = questionAt(ctx, e.questionEventId);
      if (isNum(qAt) && !Number.isNaN(at)) row.ms = Math.max(0, at - qAt);
      else if (isNum(prov?.durationMs)) row.ms = prov.durationMs;
    }
  } else if (kind === 'verdict') {
    const v = e.verdict ?? {};
    row.verdict = { score: isNum(v.score) ? v.score : null, total: isNum(v.total) ? v.total : null, confidence: v.confidence ?? null };
  }
  return row;
}

export function createMonitor(opts) {
  const {
    cases = [], roundStats, windows, presence, sample = () => ({}), extras = () => ({}),
    readSession = () => null, now = Date.now, mode = 'live', ringSize = 1000,
  } = opts;
  const ring = [];
  const subscribers = new Set();
  const questions = new Map(); // eventId -> at, for answer latency
  const system = [];
  let round = { label: null, startedAt: 0 };
  let last = {};
  let failoverAt = null;
  const ctx = { cases, mode, questions };

  const remember = (e, row) => {
    if (row.kind !== 'question' || e.eventId == null) return;
    questions.set(e.eventId, row.at);
    if (questions.size > QUESTION_CAP) questions.delete(questions.keys().next().value);
  };
  const push = (row) => { ring.push(row); if (ring.length > ringSize) ring.splice(0, ring.length - ringSize); };

  function observeGame(e) {
    try {
      const row = toRow(e, ctx);
      if (!row) return;
      remember(e, row);
      push(row);
      try { if (row.at >= round.startedAt) roundStats.observe(e); } catch { /* isolated */ }
      try {
        if (row.kind === 'question') windows.question();
        else if (row.kind === 'failure') windows.failure();
        else if (row.kind === 'answer' && isNum(row.ms)) windows.answer(row.ms);
      } catch { /* isolated */ }
      for (const fn of [...subscribers]) {
        try { fn(row); } catch { subscribers.delete(fn); }
      }
    } catch { /* never throws into a game */ }
  }

  // Provider attempts in per-second buckets [sec, total, failed], oldest first; at most 300 kept.
  const ATTEMPT_WINDOW_S = 300;
  const attempts = [];
  function attemptRate() {
    try {
      const min = Math.floor(now() / 1000) - ATTEMPT_WINDOW_S;
      let total = 0, failed = 0;
      for (const b of attempts) if (b[0] > min) { total += b[1]; failed += b[2]; }
      return total > 0 ? failed / total : 0;
    } catch { return 0; }
  }
  function observeLlm(e) {
    try {
      if (e?.type === 'failover') failoverAt = now();
      else if (e?.type === 'attempt') {
        const sec = Math.floor(now() / 1000);
        let b = attempts[attempts.length - 1];
        if (!b || b[0] !== sec) {
          b = [sec, 0, 0];
          attempts.push(b);
          while (attempts.length && attempts[0][0] <= sec - ATTEMPT_WINDOW_S) attempts.shift();
        }
        b[1]++;
        if (e.ok === false) b[2]++;
      }
    } catch { /* ignore */ }
  }
  function observeSystem(r) {
    try { system.push(r); if (system.length > SYSTEM_CAP) system.shift(); } catch { /* ignore */ }
  }
  function heartbeat(tab, sessionId) { try { presence.beat(tab, sessionId ?? null); } catch { /* ignore */ } }
  function tick() {
    try {
      const s = sample() ?? {};
      last = s;
      windows.sample({ online: presence.counts().online, reqs: isNum(s.reqs) ? s.reqs : 0 });
    } catch { /* a bad sample never stops the timer */ }
  }
  function load(events, r) {
    round = { label: r?.label ?? null, startedAt: isNum(r?.startedAt) ? r.startedAt : 0 };
    roundStats.reset();
    for (const e of events ?? []) {
      try {
        const row = toRow(e, ctx);
        if (!row) continue;
        remember(e, row);
        push(row);
        if (row.at >= round.startedAt) roundStats.observe(e);
      } catch { /* skip bad event */ }
    }
  }

  function snapshot() {
    const x = extras() ?? {};
    const w = windows.stats();
    const r = x.router ?? null;
    const p = presence.counts();
    const rs = roundStats.players();
    const n = (v) => (isNum(v) ? v : 0);
    return {
      at: now(), mode, round: { ...round },
      players: { online: p.online, onlineInGame: p.onlineInGame, onlineBoard: p.onlineBoard, playing: n(x.sessions?.games), round: rs.round, finished: rs.finished },
      traffic: {
        reqPerSec: n(last.reqPerSec), share4xx: n(last.share4xx), share5xx: n(last.share5xx), share429: n(last.share429),
        questionsPerMin: w.questionsPerMin, answerP95Ms: w.answerP95Ms, llmErrorRate: attemptRate(),
        queue: n(r?.queued), inFlight: n(r?.inFlight), cap: n(r?.maxInFlight), active: r?.active ?? null, pinned: r?.pinned === true,
        loopP99Ms: n(last.loopP99Ms), rssBytes: n(last.rssBytes), diskFreeBytes: isNum(last.diskFreeBytes) ? last.diskFreeBytes : null,
        writeFailures5m: n(last.writeFailures5m), failoverAt, credentialsRejected5m: n(last.credentialsRejected5m),
      },
      history: windows.history(), funnel: roundStats.funnel(), tallies: roundStats.tallies(), router: r,
      sessions: x.sessions ?? null, system: (Array.isArray(x.system) ? x.system : system).slice(-SYSTEM_CAP),
    };
  }

  return {
    snapshot,
    recent: (limit = 500) => (limit > 0 ? ring.slice(-limit) : []),
    catalog: () => cases.map((c) => ({
      id: c.id, title: c.title, world: c.world?.id ?? c.world,
      characters: (c.characters ?? []).map((ch) => ({ id: ch.id, name: ch.name })),
    })),
    subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); },
    startRound({ label } = {}) {
      roundStats.reset();
      round = { label: String(label ?? '').trim() || null, startedAt: now() };
      return { ...round };
    },
    session(id) {
      const events = readSession(id);
      if (!events) return null;
      const qs = new Map();
      for (const e of events) if (e.type === 'interview_question') qs.set(e.eventId, Date.parse(e.timestamp));
      const c = { cases, mode, questions: qs };
      return events.map((e) => toRow(e, c)).filter(Boolean);
    },
    observeGame, observeLlm, observeSystem, heartbeat, tick, load,
  };
}
