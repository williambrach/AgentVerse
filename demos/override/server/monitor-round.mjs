// Per-round funnel, verdict tallies and player counts, fed one event at a time.
// Pure: no I/O, no clock. Events of unregistered cases are ignored.

function lowerMiddle(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length / 2) - 1];
}

const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Per-role counts of one verdict, or null for a verdict without role results (schema v2): it counts in the funnel only. */
function roleTally(v) {
  if (!isMap(v.roles) || !isMap(v.truth) || !isMap(v.results)) return null;
  const byRole = {};
  let right = 0;
  let total = 0;
  for (const [id, role] of Object.entries(v.truth)) {
    if (typeof role !== 'string') continue;
    const ok = v.results[id] === true;
    const r = (byRole[role] ??= { right: 0, total: 0 });
    r.total += 1;
    total += 1;
    if (ok) { r.right += 1; right += 1; }
  }
  const score = Number.isFinite(v.score) ? v.score : right;
  const all = Number.isFinite(v.total) ? v.total : total;
  return { byRole, right, total, perfect: all > 0 && score === all };
}

export function createRoundStats(cases) {
  const byId = new Map(cases.map((c) => [c.id, c]));
  let sessions = new Map();
  let ended = new Set(); // reset sessions; late events from them are not new players
  const ENDED_MAX = 5000;
  let resetsInRound = 0; // reset games that started this round; their stats stay
  let archived = 0;

  function entry(e) {
    let s = sessions.get(e.sessionId);
    if (!s) {
      s = { caseId: e.caseId, asked: false, answered: new Set(), questions: 0, verdict: null, debrief: false };
      sessions.set(e.sessionId, s);
    }
    return s;
  }

  function observe(e) {
    if (!e || typeof e !== 'object') return;
    if (e.type === 'session_reset') {
      if (sessions.has(e.sessionId) && !ended.has(e.sessionId)) resetsInRound += 1;
      ended.delete(e.sessionId);
      ended.add(e.sessionId);
      if (ended.size > ENDED_MAX) ended.delete(ended.values().next().value);
      return;
    }
    if (!byId.has(e.caseId)) return;
    if (e.type === 'session_started') {
      if (ended.has(e.sessionId) && sessions.has(e.sessionId)) {
        sessions.set(`${e.sessionId}#reset${archived++}`, sessions.get(e.sessionId));
        sessions.delete(e.sessionId);
      }
      ended.delete(e.sessionId);
    }
    else if (ended.has(e.sessionId)) return;
    const s = entry(e);
    switch (e.type) {
      case 'interview_question': s.questions += 1; s.asked = true; break;
      case 'interview_answer': if ((byId.get(s.caseId).characters ?? []).some((c) => c.id === e.character)) s.answered.add(e.character); break;
      case 'verdict_submitted':
        if (!s.verdict && e.verdict && Number.isFinite(e.elapsedMs)) s.verdict = { roles: roleTally(e.verdict), ms: e.elapsedMs, questions: s.questions };
        break;
      case 'debrief_viewed': s.debrief = true; break;
      default: break;
    }
  }

  function clear() {
    sessions = new Map();
    ended = new Set();
    resetsInRound = 0;
    archived = 0;
  }

  function funnel() {
    const out = {};
    for (const c of cases) out[c.id] = { started: 0, asked: 0, interviewed: 0, verdict: 0, debrief: 0 };
    for (const s of sessions.values()) {
      const f = out[s.caseId];
      const chars = (byId.get(s.caseId).characters ?? []).map((c) => c.id);
      f.started += 1;
      if (s.asked) f.asked += 1;
      if (chars.length > 0 && chars.every((k) => s.answered.has(k))) f.interviewed += 1;
      if (s.verdict) f.verdict += 1;
      if (s.debrief) f.debrief += 1;
    }
    return out;
  }

  function tallies() {
    const out = {};
    for (const c of cases) out[c.id] = { verdicts: 0, perfect: 0, rolesRight: 0, rolesTotal: 0, byRole: {}, medianMsToVerdict: null, medianQuestions: null };
    const ms = {};
    const qs = {};
    for (const s of sessions.values()) {
      const roles = s.verdict?.roles;
      if (!roles) continue;
      const t = out[s.caseId];
      t.verdicts += 1;
      if (roles.perfect) t.perfect += 1;
      t.rolesRight += roles.right;
      t.rolesTotal += roles.total;
      for (const [role, n] of Object.entries(roles.byRole)) {
        const b = (t.byRole[role] ??= { right: 0, total: 0 });
        b.right += n.right;
        b.total += n.total;
      }
      (ms[s.caseId] ??= []).push(s.verdict.ms);
      (qs[s.caseId] ??= []).push(s.verdict.questions);
    }
    for (const id of Object.keys(ms)) {
      out[id].medianMsToVerdict = lowerMiddle(ms[id]);
      out[id].medianQuestions = lowerMiddle(qs[id]);
    }
    return out;
  }

  function players() {
    let finished = 0;
    for (const s of sessions.values()) if (s.verdict) finished += 1;
    return { round: Math.max(0, sessions.size - resetsInRound), finished };
  }

  return { observe, reset: clear, funnel, tallies, players };
}
