// Leaderboard section: rank toggle, per-team hide/show. Text only (textContent); built once, updated in place.
const num = (v) => typeof v === 'number' && Number.isFinite(v);

function minutes(ms) {
  if (!num(ms)) return '–';
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function boardRows(snap) {
  const teams = (snap && snap.leaderboard && snap.leaderboard.teams) || [];
  return teams.map((t) => ({
    teamId: t.teamId,
    name: t.name,
    rank: num(t.rank) ? String(t.rank) : '–',
    points: `${t.points} ${t.points === 1 ? 'pt' : 'pts'}`,
    played: t.played,
    time: minutes(t.timeMs),
    coins: String(t.coins),
    hidden: !!t.hidden,
  }));
}

const states = new WeakMap();

function el(doc, tag, className, text) {
  const e = doc.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function build(root, opts) {
  const doc = root.ownerDocument;
  const st = { opts, rows: new Map(), busy: false };
  const head = el(doc, 'div', 'board-head');
  head.append(el(doc, 'h3', 'board-title', 'Leaderboard'), el(doc, 'span', 'board-ties', 'Ties by'));
  st.modes = {};
  for (const [mode, label] of [['time', 'Time'], ['coins', 'Coins']]) {
    const b = el(doc, 'button', 'board-mode', label);
    b.dataset.rankBy = mode;
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => act('/admin/leaderboard', { rankBy: mode }));
    st.modes[mode] = b;
    head.append(b);
  }
  st.list = el(doc, 'div', 'board-list');
  st.empty = el(doc, 'p', 'board-empty', 'No team has finished a case this round.');
  st.note = el(doc, 'p', 'board-note', "Points for each correct guess; a team's first guess per case counts. New round empties the board.");
  st.error = el(doc, 'p', 'board-error');
  root.append(head, st.list, st.empty, st.error, st.note);

  async function act(path, body) {
    if (st.busy) return;
    st.busy = true;
    try {
      const board = await st.opts.api(path, body);
      st.error.textContent = '';
      if (board && Array.isArray(board.teams)) paint(st, { leaderboard: board });
    } catch (e) {
      st.error.textContent = `Error: ${e?.message ?? e}`;
    } finally { st.busy = false; }
  }
  st.act = act;
  return st;
}

function rowEl(st, doc, id) {
  const e = el(doc, 'div', 'board-row');
  e.dataset.team = id;
  const p = {
    el: e,
    rank: el(doc, 'span', 'board-rank'),
    name: el(doc, 'span', 'board-name'),
    points: el(doc, 'span', 'board-points'),
    played: el(doc, 'span', 'board-played'),
    time: el(doc, 'span', 'board-time'),
    coins: el(doc, 'span', 'board-coins'),
    toggle: el(doc, 'button', 'board-toggle', 'Hide'),
  };
  p.hidden = false;
  p.toggle.dataset.action = 'hide';
  p.toggle.addEventListener('click', () => st.act('/admin/teams/hidden', { teamId: id, hidden: !p.hidden }));
  e.append(p.rank, p.name, p.points, p.played, p.time, p.coins, p.toggle);
  return p;
}

function paint(st, snap) {
  const doc = st.list.ownerDocument;
  const lb = snap && snap.leaderboard;
  const rankBy = lb && lb.rankBy;
  for (const [mode, b] of Object.entries(st.modes)) b.setAttribute('aria-pressed', mode === rankBy ? 'true' : 'false');
  const rows = boardRows(snap);
  const ids = new Set(rows.map((r) => r.teamId));
  for (const [id, p] of st.rows) if (!ids.has(id)) { p.el.remove(); st.rows.delete(id); }
  rows.forEach((r, i) => {
    let p = st.rows.get(r.teamId);
    if (!p) { p = rowEl(st, doc, r.teamId); st.rows.set(r.teamId, p); }
    if (st.list.children[i] !== p.el) st.list.insertBefore(p.el, st.list.children[i] || null);
    p.rank.textContent = r.rank;
    p.name.textContent = r.name;
    p.points.textContent = r.points;
    p.played.textContent = `${r.played} played`;
    p.time.textContent = r.time;
    p.coins.textContent = `${r.coins} coins`;
    p.hidden = r.hidden;
    p.el.className = r.hidden ? 'board-row hidden-team' : 'board-row';
    p.toggle.dataset.action = r.hidden ? 'show' : 'hide';
    p.toggle.textContent = r.hidden ? 'Show' : 'Hide';
  });
  st.empty.hidden = rows.length > 0;
}

export function renderBoard(root, snap, opts) {
  let st = states.get(root);
  if (!st) { st = build(root, opts); states.set(root, st); }
  st.opts = opts;
  paint(st, snap);
}
