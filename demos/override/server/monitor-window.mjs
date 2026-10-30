// Rolling windows and presence for the admin monitor. Pure: time comes from the injected now(); no timers.
const MINUTE = 60000;
const FIVE_MINUTES = 5 * MINUTE;
const HISTORY_MINUTES = 60;
const LATENCY_CAP = 5000;

const p95 = values => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(0.95 * sorted.length) - 1];
};

export function createWindows({ now }) {
  const questions = []; // timestamps, last 60 s
  const answers = []; // {at, ms}, last 5 min
  const failures = []; // timestamps, last 5 min
  const buckets = new Map(); // minute -> bucket, insertion order is time order
  let qHead = 0;
  const closedP95 = new Map(); // minute -> p95, only for buckets that can no longer change

  const bucket = () => {
    const at = Math.floor(now() / MINUTE) * MINUTE;
    let b = buckets.get(at);
    if (!b) {
      b = { at, online: 0, questions: 0, failures: 0, latencies: [], reqs: 0 };
      buckets.set(at, b);
      for (const key of buckets.keys()) {
        if (key > at - HISTORY_MINUTES * MINUTE) break;
        buckets.delete(key);
      }
    }
    return b;
  };
  const trim = () => {
    const t = now();
    while (qHead < questions.length && questions[qHead] <= t - MINUTE) qHead += 1;
    if (qHead > 1024) { questions.splice(0, qHead); qHead = 0; }
    while (answers.length && answers[0].at <= t - FIVE_MINUTES) answers.shift();
    while (failures.length && failures[0] <= t - FIVE_MINUTES) failures.shift();
  };

  return {
    question() { questions.push(now()); bucket().questions += 1; trim(); },
    answer(ms) {
      if (!Number.isFinite(ms)) return;
      answers.push({ at: now(), ms });
      const b = bucket();
      if (b.latencies.length < LATENCY_CAP) b.latencies.push(ms);
      trim();
    },
    failure() { failures.push(now()); bucket().failures += 1; trim(); },
    sample(s) {
      const b = bucket();
      b.online = Math.max(b.online, Number(s?.online) || 0);
      b.reqs += Number(s?.reqs) || 0;
    },
    stats() {
      trim();
      const total = answers.length + failures.length;
      return {
        questionsPerMin: questions.length - qHead,
        answerP95Ms: p95(answers.map(a => a.ms)),
        llmErrorRate: total ? failures.length / total : 0,
      };
    },
    history() {
      const floor = Math.floor(now() / MINUTE) * MINUTE - (HISTORY_MINUTES - 1) * MINUTE;
      const open = Math.floor(now() / MINUTE) * MINUTE;
      for (const key of closedP95.keys()) if (!buckets.has(key)) closedP95.delete(key);
      return [...buckets.values()]
        .filter(b => b.at >= floor)
        .map(b => {
          let p;
          if (b.at < open && closedP95.has(b.at)) p = closedP95.get(b.at);
          else { p = p95(b.latencies); if (b.at < open) closedP95.set(b.at, p); }
          return { at: b.at, online: b.online, questions: b.questions, failures: b.failures, p95Ms: p, reqs: b.reqs };
        });
    },
  };
}

export function createPresence({ now, windowMs = 75000, max = 5000 }) {
  const tabs = new Map(); // tab -> {at, sessionId}; oldest beat first
  const expire = () => {
    const t = now();
    for (const [tab, v] of tabs) {
      if (t - v.at < windowMs) break;
      tabs.delete(tab);
    }
  };
  return {
    beat(tab, sessionId) {
      tabs.delete(tab);
      tabs.set(tab, { at: now(), sessionId: sessionId || null });
      while (tabs.size > max) tabs.delete(tabs.keys().next().value);
    },
    counts() {
      expire();
      let inGame = 0;
      for (const v of tabs.values()) if (v.sessionId) inGame += 1;
      return { online: tabs.size, onlineInGame: inGame, onlineBoard: tabs.size - inGame };
    },
  };
}
