// Message log: filter bar, newest-first list, player panel. Text only via textContent.
const MESSAGE_KINDS = ['question', 'answer', 'failure'];
const MAX_DOM = 1000;
const MAX_KEEP = 5000;
const ARROWS = { question: '→', answer: '←', failure: '✕', chatter: '↔', inspect: '◎' };

export function matches(row, f = {}) {
  if (f.sessionId && row.sessionId !== f.sessionId) return false;
  if (f.caseId && row.caseId !== f.caseId) return false;
  if (f.character && row.character !== f.character) return false;
  if (f.kinds && !f.kinds.includes(row.kind)) return false;
  if (f.text && !String(row.text ?? '').toLowerCase().includes(String(f.text).toLowerCase())) return false;
  return true;
}

function nameOf(row, catalog) {
  const c = (catalog || []).find((x) => x.id === row.caseId);
  const ch = c && (c.characters || []).find((x) => x.id === row.character);
  return ch ? ch.name : row.character || '';
}

function verdictText(row, catalog) {
  const v = row.verdict;
  if (!v) return row.text ?? '';
  const who = v.suspect === 'none' ? 'Nobody' : v.suspect === 'uncertain' ? 'Uncertain'
    : nameOf({ ...row, character: v.suspect }, catalog);
  return `${who} · ${v.confidence} % · ${v.correct ? 'correct' : 'wrong'}`;
}

function coinsText(row) {
  return typeof row.cost === 'number' && row.cost > 0 ? `${row.cost} ${row.cost === 1 ? 'coin' : 'coins'}` : '';
}

export function describe(row, catalog) {
  const d = describeBase(row, catalog);
  const c = coinsText(row);
  if (c) d.meta = d.meta ? `${d.meta} · ${c}` : c;
  return d;
}

function describeBase(row, catalog) {
  const who = nameOf(row, catalog);
  const arrow = ARROWS[row.kind] || '·';
  if (row.kind === 'verdict') return { who, arrow, text: verdictText(row, catalog), meta: '' };
  if (row.kind === 'failure') return { who, arrow, text: row.text ?? '', meta: row.reason || '' };
  const parts = [];
  if (row.kind === 'answer') {
    if (typeof row.ms === 'number') parts.push(`${(row.ms / 1000).toFixed(1)} s`);
    if (row.endpoint) parts.push(row.endpoint);
    if (row.failedOver) parts.push('failover');
  } else if (row.kind === 'chatter' && row.endpoint) parts.push(row.endpoint);
  return { who, arrow, text: row.text ?? '', meta: parts.join(' · ') };
}

function mmss(ms) {
  const s = Math.max(0, Math.floor((ms || 0) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function clock(at, tz) {
  const d = new Date(at);
  const utc = tz === 'utc';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(utc ? d.getUTCHours() : d.getHours())}:${p(utc ? d.getUTCMinutes() : d.getMinutes())}:${p(utc ? d.getUTCSeconds() : d.getSeconds())}`;
}

export function createLog(root, { api, panel }) {
  const doc = root.ownerDocument;
  const el = (tag, cls, text) => {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  let catalog = [];
  let all = [];
  let frozen = false;
  let pending = 0;
  const f = { caseId: '', character: '', allKinds: false, text: '', sessionId: '' };

  const bar = el('div', 'log-bar');
  const caseSel = el('select', 'log-case'); caseSel.dataset.filter = 'case';
  const charSel = el('select', 'log-character'); charSel.dataset.filter = 'character';
  const msgChip = el('button', 'log-chip', 'Messages'); msgChip.dataset.filter = 'kind'; msgChip.dataset.value = 'messages';
  const allChip = el('button', 'log-chip', 'All events'); allChip.dataset.filter = 'kind'; allChip.dataset.value = 'all';
  const textIn = el('input', 'log-text'); textIn.dataset.filter = 'text';
  const playerChip = el('span', 'log-player-chip'); playerChip.hidden = true; playerChip.dataset.filter = 'player';
  const playerName = el('span', '');
  const playerX = el('button', 'log-player-x', '×'); playerX.dataset.action = 'clear-player';
  playerChip.append(playerName, playerX);
  const freezeBtn = el('button', 'log-freeze', 'Following'); freezeBtn.dataset.action = 'freeze';
  const newBtn = el('button', 'log-new', ''); newBtn.dataset.action = 'new'; newBtn.hidden = true;
  const list = el('div', 'log-list');
  bar.append(caseSel, charSel, msgChip, allChip, textIn, playerChip, freezeBtn, newBtn);
  root.append(bar, list);

  const filter = () => ({
    sessionId: f.sessionId, caseId: f.caseId, character: f.character, text: f.text,
    kinds: f.allKinds ? null : MESSAGE_KINDS,
  });

  function option(value, label) {
    const o = el('option', '', label); o.value = value; return o;
  }
  function fillCases() {
    caseSel.replaceChildren(option('', 'All cases'), ...catalog.map((c) => option(c.id, c.title || c.id)));
    caseSel.value = f.caseId;
    fillChars();
  }
  function fillChars() {
    const c = catalog.find((x) => x.id === f.caseId);
    charSel.replaceChildren(option('', 'Everyone'), ...(c ? c.characters : []).map((x) => option(x.id, x.name)));
    charSel.value = f.character;
  }
  function chips() {
    msgChip.className = f.allKinds ? 'log-chip' : 'log-chip on';
    allChip.className = f.allKinds ? 'log-chip on' : 'log-chip';
  }
  function rowEl(row) {
    const d = describe(row, catalog);
    const e = el('div', `log-row log-${row.kind}`);
    e.dataset.kind = row.kind;
    const player = el('span', 'log-player', row.player || ''); player.dataset.player = row.sessionId;
    player.addEventListener('click', () => openPanel(row.sessionId));
    e.append(el('span', 'log-time', clock(row.at)), player, el('span', 'log-who', d.who),
      el('span', 'log-arrow', d.arrow), el('span', 'log-text-cell', d.text), el('span', 'log-meta', d.meta));
    return e;
  }
  function trim() {
    while (list.children.length > MAX_DOM) list.removeChild(list.lastChild);
  }
  function rerender() {
    const fl = filter();
    const out = [];
    for (let i = all.length - 1; i >= 0 && out.length < MAX_DOM; i--) if (matches(all[i], fl)) out.push(rowEl(all[i]));
    list.replaceChildren(...out);
  }
  function updateNew() {
    newBtn.hidden = pending === 0;
    newBtn.textContent = pending ? `${pending} new` : '';
  }
  function unfreeze() {
    frozen = false; pending = 0;
    freezeBtn.textContent = 'Following';
    updateNew(); rerender();
  }

  let openSeq = 0;
  async function openPanel(id) {
    const seq = ++openSeq;
    f.sessionId = id;
    playerName.textContent = id.slice(0, 4);
    playerChip.hidden = false;
    rerender();
    panel.hidden = false;
    const head = el('div', 'panel-head');
    const close = el('button', 'panel-close', 'Close'); close.dataset.action = 'close-panel';
    close.addEventListener('click', closePanel);
    head.append(el('h3', '', `Player ${id.slice(0, 4)}`), close);
    panel.replaceChildren(head, el('p', 'panel-loading', 'Loading…'));
    let data;
    try {
      data = await api(`/admin/sessions/${encodeURIComponent(id)}`);
    } catch (err) {
      if (seq !== openSeq) return;
      panel.replaceChildren(head, el('p', 'panel-error', String((err && err.message) || err)));
      return;
    }
    if (seq !== openSeq) return;
    const rows = (data && data.rows) || [];
    const v = rows.filter((r) => r.kind === 'verdict').pop();
    const vline = el('p', 'panel-verdict', v ? `Verdict: ${verdictText(v, catalog)}` : 'Verdict: none yet');
    const tl = el('ol', 'panel-timeline');
    for (const r of rows) {
      const d = describe(r, catalog);
      const li = el('li', `panel-${r.kind}`);
      li.append(el('span', 'log-time', mmss(r.elapsedMs)), el('span', 'log-kind', r.kind),
        el('span', 'log-who', d.who), el('span', 'log-arrow', d.arrow),
        el('span', 'log-text-cell', d.text), el('span', 'log-meta', d.meta));
      tl.append(li);
    }
    const co = data && data.coins;
    const coinsLine = el('p', 'panel-coins', co && typeof co.spent === 'number'
      ? (typeof co.budget === 'number' ? `Coins: ${co.spent} / ${co.budget}` : `Coins: ${co.spent}`) : 'Coins: 0');
    panel.replaceChildren(head, vline, coinsLine, tl);
  }
  function closePanel() { openSeq++; panel.hidden = true; panel.replaceChildren(); }
  if (doc.addEventListener) doc.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePanel(); });

  caseSel.addEventListener('change', () => { f.caseId = caseSel.value; f.character = ''; fillChars(); rerender(); });
  charSel.addEventListener('change', () => { f.character = charSel.value; rerender(); });
  msgChip.addEventListener('click', () => { f.allKinds = false; chips(); rerender(); });
  allChip.addEventListener('click', () => { f.allKinds = true; chips(); rerender(); });
  textIn.addEventListener('input', () => { f.text = textIn.value; rerender(); });
  playerX.addEventListener('click', () => { f.sessionId = ''; playerChip.hidden = true; rerender(); });
  freezeBtn.addEventListener('click', () => {
    if (frozen) unfreeze(); else { frozen = true; freezeBtn.textContent = 'Frozen'; }
  });
  newBtn.addEventListener('click', unfreeze);
  chips();

  return {
    setCatalog(c) { catalog = c || []; fillCases(); rerender(); },
    add(rows) {
      const fl = filter();
      for (const r of rows) {
        all.push(r);
        if (!matches(r, fl)) continue;
        if (frozen) { pending++; continue; }
        list.prepend(rowEl(r));
      }
      if (all.length > MAX_KEEP) all = all.slice(-MAX_KEEP);
      trim();
      updateNew();
    },
  };
}
