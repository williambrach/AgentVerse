// Player numbers, health tiles and sparklines. Pure DOM, text via textContent only.
const SVGNS = 'http://www.w3.org/2000/svg';

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
const num = (v) => typeof v === 'number' && Number.isFinite(v);

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
const pad = (n) => String(n).padStart(2, '0');

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

const TILES = [
  ['llmErrorRate', 'LLM errors, 5 min'],
  ['queue', 'Queue'],
  ['answerP95Ms', 'Answer p95'],
  ['loopP99Ms', 'Loop delay p99'],
  ['diskFreeBytes', 'Disk free'],
  ['writeFailures5m', 'Log-write failures'],
  ['failoverAt', 'Last failover'],
  ['credentialsRejected5m', 'Credentials rejected'],
  ['reqPerSec', 'Requests / s'],
  ['questionsPerMin', 'Questions / min'],
  ['inFlight', 'In flight'],
  ['rssBytes', 'Memory'],
];

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
      st[k] = { box, v: el(doc, 'div', 'tile-v', box) };
    }
    states.set(root, st);
  }
  const tr = snap.traffic || {};
  const now = typeof snap.at === 'number' ? snap.at : 0;
  let worst = 'ok';
  for (const [k] of TILES) {
    const lvl = levelOf(k, tr[k], now);
    if (st[k].box.dataset.level !== lvl) st[k].box.dataset.level = lvl;
    let text = format(k, tr[k]);
    if (k === 'failoverAt') text = num(tr[k]) ? `${timeFormat(tr[k])} (${Math.max(0, Math.floor((now - tr[k]) / 60000))} min ago)` : 'none';
    setText(st[k].v, text);
    if (ORDER[lvl] > ORDER[worst]) worst = lvl;
  }
  return worst;
}

const SPARKS = [
  ['online', 'Online (peak)'],
  ['questions', 'Questions / min'],
  ['failures', 'Failures / min'],
  ['p95Ms', 'Answer p95'],
  ['reqs', 'Requests / min'],
];
const SW = 120;
const SH = 28;

export function sparkPoints(values, w, h) {
  const vs = values.map((v) => (num(v) ? v : 0));
  if (!vs.length) return '';
  const max = Math.max(...vs);
  return vs.map((v, i) => {
    const x = vs.length === 1 ? 0 : (i / (vs.length - 1)) * w;
    const y = max > 0 ? h - (v / max) * h : h;
    return `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`;
  }).join(' ');
}

export function renderHistory(root, snap) {
  const doc = root.ownerDocument;
  let st = states.get(root);
  if (!st) {
    st = {};
    for (const [k, label] of SPARKS) {
      const box = el(doc, 'div', 'spark', root);
      el(doc, 'div', 'spark-l', box).textContent = label;
      const svg = doc.createElementNS(SVGNS, 'svg');
      svg.setAttribute('viewBox', `0 0 ${SW} ${SH}`);
      svg.setAttribute('class', 'spark-svg');
      svg.setAttribute('preserveAspectRatio', 'none');
      const line = doc.createElementNS(SVGNS, 'polyline');
      line.setAttribute('fill', 'none');
      line.setAttribute('class', 'spark-line');
      svg.appendChild(line);
      box.appendChild(svg);
      st[k] = { line, pts: null, v: el(doc, 'div', 'spark-v', box) };
    }
    states.set(root, st);
  }
  const h = Array.isArray(snap.history) ? snap.history : [];
  for (const [k] of SPARKS) {
    const pts = sparkPoints(h.map((r) => r[k]), SW, SH);
    if (st[k].pts !== pts) { st[k].pts = pts; st[k].line.setAttribute('points', pts); }
    setText(st[k].v, h.length ? format(k === 'p95Ms' ? 'answerP95Ms' : k === 'reqs' ? 'reqs' : k, h[h.length - 1][k]) : '–');
  }
}
