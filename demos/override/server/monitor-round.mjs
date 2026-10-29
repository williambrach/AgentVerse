// Per-round funnel, verdict tallies and player counts, fed one event at a time.
// Pure: no I/O, no clock. Events of unregistered cases are ignored.

function lowerMiddle(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length / 2) - 1];
}

export function createRoundStats(cases) {
  const byId = new Map(cases.map((c) => [c.id, c]));
  let sessions = new Map();
  let ended = new Set(); // reset sessions; late events from them are not new players
  const ENDED_MAX = 5000;

  function entry(e) {
    let s = sessions.get(e.sessionId);
    if (!s) {
      s = { caseId: e.caseId, clue: false, answered: new Set(), questions: 0, verdict: null, debrief: false };
      sessions.set(e.sessionId, s);
    }
    return s;
  }

  function observe(e) {
    if (!e || typeof e !== 'object') return;
    if (e.type === 'session_reset') {
      sessions.delete(e.sessionId);
      ended.delete(e.sessionId);
      ended.add(e.sessionId);
      if (ended.size > ENDED_MAX) ended.delete(ended.values().next().value);
      return;
    }
    if (!byId.has(e.caseId)) return;
    if (e.type === 'session_started') ended.delete(e.sessionId);
    else if (ended.has(e.sessionId)) return;
    const s = entry(e);
    switch (e.type) {
      case 'story_revealed': s.clue = true; break;
      case 'interview_question': s.questions += 1; break;
      case 'interview_answer': if ((byId.get(s.caseId).characters ?? []).some((c) => c.id === e.character)) s.answered.add(e.character); break;
      case 'verdict_submitted':
        if (!s.verdict && e.verdict && Number.isFinite(e.elapsedMs)) s.verdict = { suspect: e.verdict.suspect, ms: e.elapsedMs, questions: s.questions };
        break;
      case 'debrief_viewed': s.debrief = true; break;
      default: break;
    }
  }

  function clear() {
    sessions = new Map();
    ended = new Set();
  }

  function funnel() {
    const out = {};
    for (const c of cases) out[c.id] = { started: 0, clues: 0, interviewed: 0, verdict: 0, debrief: 0 };
    for (const s of sessions.values()) {
      const f = out[s.caseId];
      const chars = (byId.get(s.caseId).characters ?? []).map((c) => c.id);
      f.started += 1;
      if (s.clue) f.clues += 1;
      if (chars.length > 0 && chars.every((k) => s.answered.has(k))) f.interviewed += 1;
      if (s.verdict) f.verdict += 1;
      if (s.debrief) f.debrief += 1;
    }
    return out;
  }

  function tallies() {
    const out = {};
    for (const c of cases) out[c.id] = { verdicts: 0, correct: null, accused: {}, medianMsToVerdict: null, medianQuestions: null };
    const ms = {};
    const qs = {};
    const right = {};
    for (const s of sessions.values()) {
      if (!s.verdict) continue;
      const c = byId.get(s.caseId);
      const t = out[s.caseId];
      t.verdicts += 1;
      t.accused[s.verdict.suspect] = (t.accused[s.verdict.suspect] ?? 0) + 1;
      const culprits = c.answer?.culprits ?? [];
      const ok = culprits.length === 0 ? s.verdict.suspect === 'none' : culprits.includes(s.verdict.suspect);
      right[s.caseId] = (right[s.caseId] ?? 0) + (ok ? 1 : 0);
      (ms[s.caseId] ??= []).push(s.verdict.ms);
      (qs[s.caseId] ??= []).push(s.verdict.questions);
    }
    for (const id of Object.keys(out)) {
      const t = out[id];
      if (t.verdicts === 0) continue;
      t.correct = right[id] ?? 0;
      t.medianMsToVerdict = lowerMiddle(ms[id]);
      t.medianQuestions = lowerMiddle(qs[id]);
    }
    return out;
  }

  function players() {
    let finished = 0;
    for (const s of sessions.values()) if (s.verdict) finished += 1;
    return { round: sessions.size, finished };
  }

  return { observe, reset: clear, funnel, tallies, players };
}
