// Player numbers and the stat strip. Pure DOM, text via textContent only.
import { isNum, pad2 } from './dom.js';

// key: [direction, amber, red]. 'gt' = worse when above, 'lt' = worse when below.
export const THRESHOLDS = {
  llmErrorRate: ['gt', 0.05, 0.2],
  queue: ['gt', 10, 50],
  answerP95Ms: ['gt', 8000, 20000],
  loopP99Ms: ['gt', 100, 500],
  diskFreeBytes: ['lt', 5e9, 1e9],
  writeFailures5m: ['gt', null, 0],
  credentialsRejected5m: ['gt', null, 0],
  failoverAt: ['recent', 300000, null],
};

const ORDER = { ok: 0, warn: 1, bad: 2 };
const num = isNum;

export function levelOf(key, value, now) {
  const t = THRESHOLDS[key];
  if (!t || !num(value)) return 'ok';
  const [dir, amber, red] = t;
  if (dir === 'recent') {
    const age = now - value;
    return age >= 0 && age <= amber ? 'warn' : 'ok';
  }
  if (dir === 'gt') {
    if (red !== null && value > red) return 'bad';
    if (amber !== null && value > amber) return 'warn';
    return 'ok';
  }
  if (value < red) return 'bad';
  if (value < amber) return 'warn';
  return 'ok';
}

const trim = (n) => (n >= 10 ? String(Math.round(n)) : String(Math.round(n * 10) / 10));
const pad = pad2;

export function format(key, value) {
  if (!num(value)) return '–';
  switch (key) {
    case 'answerP95Ms': case 'loopP99Ms': case 'p95Ms':
      return value >= 1000 ? `${trim(value / 1000)} s` : `${Math.round(value)} ms`;
    case 'llmErrorRate': case 'share4xx': case 'share5xx': case 'share429':
      return `${Math.round(value * 1000) / 10} %`;
    case 'diskFreeBytes': case 'rssBytes':
      if (value >= 1e9) return `${trim(value / 1e9)} GB`;
      if (value >= 1e6) return `${trim(value / 1e6)} MB`;
      return `${trim(value / 1e3)} kB`;
    case 'failoverAt': {
      const d = new Date(value);
      return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    case 'reqPerSec':
      return trim(value);
    default:
      return String(Math.round(value * 10) / 10);
  }
}

// state per root so re-renders update in place
const states = new WeakMap();
const el = (doc, tag, cls, parent) => {
  const e = doc.createElement(tag);
  if (cls) e.className = cls;
  if (parent) parent.appendChild(e);
  return e;
};
const setText = (e, s) => { if (e.textContent !== s) e.textContent = s; };

const PLAYER_BIG = [
  ['online', 'Online', (p) => `${p.onlineInGame} in game · ${p.onlineBoard} on board`],
  ['playing', 'Playing now', () => ''],
  ['round', 'Players this round', () => ''],
  ['finished', 'Games finished', () => ''],
];

export function renderPlayers(root, snap) {
  const doc = root.ownerDocument;
  let st = states.get(root);
  if (!st) {
    st = {};
    for (const [k, label] of PLAYER_BIG) {
      const box = el(doc, 'div', 'big', root);
      st[k] = { n: el(doc, 'div', 'big-n', box), sub: null };
      el(doc, 'div', 'big-l', box).textContent = label;
      st[k].sub = el(doc, 'div', 'big-s', box);
    }
    states.set(root, st);
  }
  const p = snap.players || {};
  for (const [k, , sub] of PLAYER_BIG) {
    setText(st[k].n, num(p[k]) ? String(p[k]) : '–');
    setText(st[k].sub, k === 'online' ? sub(p) : '');
  }
}

// Token counts: 5600 -> 5.6k, 235567 -> 235k, 1234567 -> 1.23M.
export function fmtTokens(n) {
  if (!num(n)) return '–';
  const t = (x, d) => String(Math.round(x * 10 ** d) / 10 ** d);
  if (n >= 1e6) return `${t(n / 1e6, 2)}M`;
  if (n >= 1e5) return `${Math.round(n / 1e3)}k`;
  if (n >= 1e3) return `${t(n / 1e3, 1)}k`;
  return String(Math.round(n));
}

// The stat strip shows only what no chart shows. Everything else is a chart panel.
const TILES = [
  ['tokens', 'Tokens used'],
  ['diskFreeBytes', 'Disk free'],
  ['writeFailures5m', 'Log-write failures'],
  ['credentialsRejected5m', 'Credentials rejected'],
  ['failoverAt', 'Last failover'],
];

function tokenTexts(tok) {
  const t = tok && tok.total;
  const r = tok && tok.round;
  if (!t || !num(t.total)) return { v: '–', sub: '' };
  const v = r && num(r.total) ? `${fmtTokens(r.total)} this round` : '–';
  return { v, sub: `${fmtTokens(t.total)} since start · ${fmtTokens(t.prompt)} in / ${fmtTokens(t.completion)} out` };
}

// Worst level over every thresholded metric, charted or not.
export function worstLevel(snap) {
  const tr = (snap && snap.traffic) || {};
  const now = snap && typeof snap.at === 'number' ? snap.at : 0;
  let worst = 'ok';
  for (const k of Object.keys(THRESHOLDS)) {
    const lvl = levelOf(k, tr[k], now);
    if (ORDER[lvl] > ORDER[worst]) worst = lvl;
  }
  return worst;
}

export function renderTiles(root, snap, opts = {}) {
  const timeFormat = opts.timeFormat || ((t) => format('failoverAt', t));
  const doc = root.ownerDocument;
  let st = states.get(root);
  if (!st) {
    st = {};
    for (const [k, label] of TILES) {
      const box = el(doc, 'div', 'tile', root);
      box.dataset.level = 'ok';
      el(doc, 'div', 'tile-l', box).textContent = label;
      st[k] = { box, v: el(doc, 'div', 'tile-v', box), sub: el(doc, 'div', 'tile-s', box) };
    }
    states.set(root, st);
  }
  const tr = snap.traffic || {};
  const now = typeof snap.at === 'number' ? snap.at : 0;
  for (const [k] of TILES) {
    const lvl = levelOf(k, tr[k], now);
    if (st[k].box.dataset.level !== lvl) st[k].box.dataset.level = lvl;
    let text = format(k, tr[k]);
    let sub = '';
    if (k === 'failoverAt') text = num(tr[k]) ? `${timeFormat(tr[k])} (${Math.max(0, Math.floor((now - tr[k]) / 60000))} min ago)` : 'none';
    if (k === 'tokens') ({ v: text, sub } = tokenTexts(tr.tokens));
    setText(st[k].v, text);
    setText(st[k].sub, sub);
  }
  return worstLevel(snap);
}
