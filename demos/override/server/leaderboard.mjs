// Per-round team standings, fed one game-log event at a time.
// Pure: no I/O, no clock. Only a team's first verdict per case counts.

const MODES = ['time', 'coins'];

export function createLeaderboard(cases, { startedAt = 0, now = Date.now } = {}) {
  const CACHE_MS = 1000;
  let cache = null; // { at, rankBy, rows } sorted and ranked, hidden rows included
  const byId = new Map(cases.map((c) => [c.id, c]));
  let since = startedAt;
  let rankBy = 'time';
  let round = null;
  const hidden = new Set();
  let teams = new Map(); // teamId -> { name, cases: Map(caseId -> { firstStart, verdict }) }
  const live = new Map(); // sessionId -> its newest session { teamId, caseId, startMs, coins, frozen }
  const spent = (n) => Number.isFinite(n) && n >= 0;

  const points = verdict => (Number.isInteger(verdict.score) ? verdict.score : 0);

  function observe(e) {
    try {
      if (!e || typeof e !== 'object') return;
      const ms = Date.parse(e.timestamp);
      if (!Number.isFinite(ms) || ms < since) return;
      cache = null; // any accepted event may change the standings
      if (e.type === 'session_started') {
        const t = e.team;
        if (!t || typeof t.id !== 'string' || typeof t.name !== 'string' || typeof e.sessionId !== 'string' || !byId.has(e.caseId)) return;
        let team = teams.get(t.id);
        if (!team) { team = { name: t.name, cases: new Map() }; teams.set(t.id, team); }
        team.name = t.name;
        let c = team.cases.get(e.caseId);
        if (!c) { c = { firstStart: ms, verdict: null, sessions: [] }; team.cases.set(e.caseId, c); }
        c.firstStart = Math.min(c.firstStart, ms);
        const s = { teamId: t.id, caseId: e.caseId, startMs: ms, coins: 0, frozen: false };
        c.sessions.push(s);
        live.set(e.sessionId, s);
        return;
      }
      const s = live.get(e.sessionId);
      if (!s) return;
      if (!s.frozen && spent(e.spend?.total)) s.coins = e.spend.total;
      if (e.type !== 'verdict_submitted' || !e.verdict) return;
      if (!s.frozen && spent(e.coins?.spent)) s.coins = e.coins.spent;
      const c = teams.get(s.teamId)?.cases.get(s.caseId);
      if (!c || c.verdict) return;
      c.verdict = { ms, points: points(e.verdict) };
      s.frozen = true;
    } catch { /* a bad event never stops the feed */ }
  }

  function reset(at, label = null) {
    round = typeof label === 'string' && label ? label : null;
    since = Number.isFinite(at) ? at : Number.isFinite(Date.parse(at)) ? Date.parse(at) : since;
    teams = new Map();
    live.clear();
    cache = null;
  }

  function setRankBy(mode) {
    if (!MODES.includes(mode)) throw new Error(`rankBy must be one of ${MODES.join(', ')}.`);
    rankBy = mode;
    cache = null;
  }

  function setHidden(teamId, flag) {
    if (flag) hidden.add(teamId);
    else hidden.delete(teamId);
    cache = null;
  }

  function restore(records) {
    cache = null;
    for (const r of records ?? []) {
      if (r?.type === 'leaderboard_settings' && MODES.includes(r.rankBy)) rankBy = r.rankBy;
      else if (r?.type === 'team_hidden' && typeof r.teamId === 'string') setHidden(r.teamId, r.hidden === true);
    }
  }

  function cells(team) {
    return cases.map((k) => {
      const c = team.cases.get(k.id);
      if (!c) return { caseId: k.id, state: 'none', points: 0 };
      if (!c.verdict) return { caseId: k.id, state: 'playing', points: 0 };
      const p = c.verdict.points, total = k.characters?.length ?? 0;
      return { caseId: k.id, state: p <= 0 ? 'zero' : p >= total ? 'perfect' : 'partial', points: p };
    });
  }

  function row(teamId, team, you) {
    let pts = 0, played = 0, timeMs = 0, coins = 0;
    for (const c of team.cases.values()) {
      if (!c.verdict) continue;
      played += 1;
      pts += c.verdict.points;
      timeMs += Math.max(0, c.verdict.ms - c.firstStart);
      for (const s of c.sessions) if (s.startMs <= c.verdict.ms) coins += s.coins;
    }
    return { rank: null, teamId, name: team.name, points: pts, played, timeMs, coins, hidden: hidden.has(teamId), you: teamId === you, cells: cells(team) };
  }

  function sortedRows() {
    const t = now();
    if (cache && cache.rankBy === rankBy && t >= cache.at && t - cache.at < CACHE_MS) return cache.rows;
    const [m1, m2] = rankBy === 'time' ? ['timeMs', 'coins'] : ['coins', 'timeMs'];
    const rows = [...teams].map(([id, tm]) => row(id, tm, null));
    rows.sort((a, b) =>
      (b.played > 0) - (a.played > 0) || b.points - a.points || a[m1] - b[m1] || a[m2] - b[m2] || a.name.localeCompare(b.name));
    // Competition ranks in one pass: equal rows share a rank, the next rank skips.
    let prev = null, rank = 0, seen = 0;
    for (const r of rows) {
      if (r.played <= 0 || r.hidden) continue;
      seen += 1;
      if (!prev || prev.points !== r.points || prev[m1] !== r[m1] || prev[m2] !== r[m2]) rank = seen;
      r.rank = rank;
      prev = r;
    }
    cache = { at: t, rankBy, rows };
    return rows;
  }

  function standings({ includeHidden = false, you = null } = {}) {
    const rows = sortedRows().map((r) => ({ ...r, you: r.teamId === you }));
    return { rankBy, startedAt: since, round, cases: cases.map((k) => ({ id: k.id, title: k.title, order: k.order, total: k.characters?.length ?? 0 })), teams: includeHidden ? rows : rows.filter((r) => !r.hidden) };
  }

  return { observe, reset, setRankBy, setHidden, restore, standings };
}
