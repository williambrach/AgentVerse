// In-memory token counter: totals since creation, since round start, and a 60 s rolling rate.
const WINDOW_MS = 60_000;
const int = v => (Number.isInteger(v) && v > 0 ? v : 0);

export function createTokenCounter({ now = Date.now } = {}) {
  const total = { prompt: 0, completion: 0 };
  const round = { prompt: 0, completion: 0 };
  let calls = 0;
  let recent = [];
  const shape = t => ({ prompt: t.prompt, completion: t.completion, total: t.prompt + t.completion });
  const prune = at => { recent = recent.filter(r => r.at > at - WINDOW_MS); };
  return {
    add(e = {}) {
      const p = int(e?.promptTokens); const c = int(e?.completionTokens);
      calls += 1;
      total.prompt += p; total.completion += c; round.prompt += p; round.completion += c;
      if (p + c > 0) recent.push({ at: now(), n: p + c });
    },
    startRound() { round.prompt = 0; round.completion = 0; },
    stats() {
      const at = now(); prune(at);
      return { total: shape(total), round: shape(round), perMin: recent.reduce((s, r) => s + r.n, 0), calls };
    },
  };
}
