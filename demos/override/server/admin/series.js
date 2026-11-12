// Ring buffer of monitor snapshots, one time-ordered [at, value] list per chart key.
const fin = (n) => typeof n === 'number' && Number.isFinite(n);

const PUSH = {
  online: (s) => s.players && s.players.online,
  questionsPerMin: (s) => s.traffic && s.traffic.questionsPerMin,
  answerP95Ms: (s) => s.traffic && s.traffic.answerP95Ms,
  llmErrorRate: (s) => s.traffic && s.traffic.llmErrorRate,
  reqPerSec: (s) => s.traffic && s.traffic.reqPerSec,
  loopP99Ms: (s) => s.traffic && s.traffic.loopP99Ms,
  queue: (s) => s.traffic && s.traffic.queue,
  inFlight: (s) => s.traffic && s.traffic.inFlight,
  rssBytes: (s) => s.traffic && s.traffic.rssBytes,
  tokensPerMin: (s) => s.traffic && s.traffic.tokensPerMin,
};

// History rows are per-minute aggregates.
const SEED = {
  online: (r) => r.online,
  questionsPerMin: (r) => r.questions,
  answerP95Ms: (r) => r.p95Ms,
  llmErrorRate: (r) => (fin(r.questions) && r.questions > 0 && fin(r.failures) ? r.failures / r.questions : null),
  reqPerSec: (r) => (fin(r.reqs) ? r.reqs / 60 : null),
};

export function createSeries(opts = {}) {
  const capMs = fin(opts.capMs) ? opts.capMs : 6 * 3600_000;
  const data = {};
  for (const k of Object.keys(PUSH)) data[k] = [];
  let lastAt = -Infinity;
  let firstPushAt = Infinity;

  const trim = (arr, newest) => {
    let i = 0;
    while (i < arr.length && arr[i][0] < newest - capMs) i++;
    if (i) arr.splice(0, i);
  };

  return {
    push(snap) {
      if (!snap || !fin(snap.at) || snap.at <= lastAt) return;
      lastAt = snap.at;
      if (snap.at < firstPushAt) firstPushAt = snap.at;
      for (const [k, get] of Object.entries(PUSH)) {
        const v = get(snap);
        if (fin(v)) data[k].push([snap.at, v]);
        trim(data[k], snap.at);
      }
    },
    seed(history) {
      if (!Array.isArray(history)) return;
      const rows = history.filter((r) => r && fin(r.at) && r.at < firstPushAt).sort((a, b) => a.at - b.at);
      for (const [k, get] of Object.entries(SEED)) {
        const old = data[k];
        const seeded = [];
        let prev = -Infinity;
        for (const r of rows) {
          const v = get(r);
          if (fin(v) && r.at > prev) { seeded.push([r.at, v]); prev = r.at; }
        }
        // Seeded rows precede everything already pushed.
        data[k] = seeded.concat(old.filter((p) => p[0] > prev));
        if (data[k].length) trim(data[k], data[k][data[k].length - 1][0]);
      }
    },
    points(key, t0, t1, maxPoints) {
      const arr = (data[key] || []).filter((p) => p[0] >= t0 && p[0] <= t1);
      if (!fin(maxPoints) || maxPoints < 1 || arr.length <= maxPoints) return arr.map((p) => [p[0], p[1]]);
      const size = Math.ceil(arr.length / maxPoints);
      const out = [];
      for (let i = 0; i < arr.length; i += size) {
        let best = arr[i];
        for (let j = i; j < Math.min(arr.length, i + size); j++) if (arr[j][1] > best[1]) best = arr[j];
        out.push([best[0], best[1]]);
      }
      return out;
    },
    latest(key) {
      const arr = data[key];
      return arr && arr.length ? arr[arr.length - 1][1] : null;
    },
  };
}
