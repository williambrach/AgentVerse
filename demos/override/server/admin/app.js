import { splitLines } from './ndjson.js';
import * as tiles from './tiles.js';
import * as logMod from './log.js';
import * as round from './round.js';
import { createBar } from './bar.js';
import { createSeries } from './series.js';
import { renderChart } from './charts.js';
import * as controls from './controls.js';
import { renderBoard } from './board.js';
import { renderWatch } from './watch.js';
import { mountSignIn } from './signin.js';
import { initPanels, setBadge } from './panels.js';

const DELAYS = [1000, 2000, 5000, 10000];
const STALE_MS = 5000;
const RANGES = [5, 15, 30, 60];
const RANGE_KEY = 'override.admin.range';
const MAX_POINTS = 150;

// One panel per chart. thresholds mirror tiles.THRESHOLDS; formats reuse tiles.format.
const CHARTS = [
  { id: 'online', title: 'Online', series: [['online', 'online']], fmt: (v) => String(Math.round(v)) },
  { id: 'questions', title: 'Questions / min', series: [['questionsPerMin', 'questions']], fmt: (v) => tiles.format('questionsPerMin', v) },
  { id: 'p95', title: 'Answer p95', series: [['answerP95Ms', 'p95']], fmt: (v) => tiles.format('answerP95Ms', v), thresholds: { warn: 8000, bad: 20000 } },
  { id: 'errors', title: 'LLM errors', series: [['llmErrorRate', 'errors']], fmt: (v) => tiles.format('llmErrorRate', v), thresholds: { warn: 0.05, bad: 0.2 } },
  { id: 'tokens', title: 'Tokens / min', series: [['tokensPerMin', 'tokens']], fmt: (v) => tiles.fmtTokens(v) },
  { id: 'reqs', title: 'Requests / s', series: [['reqPerSec', 'requests']], fmt: (v) => tiles.format('reqPerSec', v) },
  { id: 'queue', title: 'Queue + in flight', series: [['queue', 'queue'], ['inFlight', 'in flight']], fmt: (v) => String(Math.round(v * 10) / 10), thresholds: { warn: 10, bad: 50 } },
  { id: 'loop', title: 'Event loop p99', series: [['loopP99Ms', 'p99']], fmt: (v) => tiles.format('loopP99Ms', v), thresholds: { warn: 100, bad: 500 } },
  { id: 'rss', title: 'Memory', series: [['rssBytes', 'rss']], fmt: (v) => tiles.format('rssBytes', v) },
];

function start() {
  const $ = (id) => document.getElementById(id);
  try { initPanels(document, window.localStorage); } catch { initPanels(document, null); }
  const statusEl = $('status');
  const baseTitle = document.title;
  let catalog = [];
  let lastSnap = null;
  let lastTick = 0;
  let status = 'offline';
  let attempt = 0;
  let timer = null;
  let ctl = null;
  let stopped = false;

  const setStatus = (s) => {
    status = s;
    statusEl.textContent = s;
    statusEl.dataset.state = s.replace(/ /g, '-');
  };
  let signin = null;

  async function api(path, body) {
    const init = { headers: {} };
    if (body !== undefined) {
      init.method = 'POST';
      init.headers['content-type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const res = await fetch(path, init);
    let j = {};
    try { j = await res.json(); } catch { /* empty body */ }
    if (res.status === 401) { stopped = true; setStatus('signed out'); signin?.show(); }
    if (!res.ok) throw new Error(j.error || 'HTTP ' + res.status);
    return j;
  }

  const log = logMod.createLog($('log'), { api, panel: $('player-panel') });
  const bar = createBar($('bar'), { api });
  const series = createSeries();

  let rangeMin = 15;
  try { const r = Number(window.localStorage.getItem(RANGE_KEY)); if (RANGES.includes(r)) rangeMin = r; } catch { /* storage blocked */ }
  const chartRoots = new Map();
  const rangeBtns = [];
  const chartsEl = $('charts');
  const rangeEl = $('range');
  for (const c of CHARTS) {
    const d = document.createElement('div');
    d.className = 'chart-cell';
    chartsEl.appendChild(d);
    chartRoots.set(c.id, d);
  }
  const markRange = () => rangeBtns.forEach(([m, b]) => b.setAttribute('aria-pressed', String(m === rangeMin)));
  for (const m of RANGES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = `${m} min`;
    b.addEventListener('click', () => {
      rangeMin = m;
      try { window.localStorage.setItem(RANGE_KEY, String(m)); } catch { /* storage blocked */ }
      markRange();
      if (lastSnap) renderCharts(lastSnap);
    });
    rangeEl.appendChild(b);
    rangeBtns.push([m, b]);
  }
  markRange();

  function renderCharts(snap) {
    const t1 = typeof snap.at === 'number' ? snap.at : Date.now();
    const t0 = t1 - rangeMin * 60000;
    for (const c of CHARTS) {
      renderChart(chartRoots.get(c.id), {
        title: c.title,
        series: c.series.map(([key, label]) => ({ key, label, points: series.points(key, t0, t1, MAX_POINTS) })),
        range: [t0, t1],
        format: c.fmt,
        thresholds: c.thresholds,
        now: t1,
      });
    }
  }

  // One failing renderer must not stop the others or the stream reader; report each name once.
  const reported = new Set();
  const guard = (name, fn) => {
    try { return fn(); } catch (e) {
      if (!reported.has(name)) { reported.add(name); console.error(`admin: ${name} failed`, e); }
      return undefined;
    }
  };

  function render(snap) {
    lastSnap = snap;
    guard('series', () => series.push(snap));
    guard('players', () => tiles.renderPlayers($('players'), snap));
    const worst = guard('tiles', () => tiles.renderTiles($('tiles'), snap));
    guard('title', () => {
      document.title = (worst === 'bad' ? '⚠ ' : '') + baseTitle;
      setBadge($('health-badge'), worst);
    });
    guard('charts', () => renderCharts(snap));
    guard('board', () => renderBoard($('board'), snap, { api }));
    guard('watch', () => { if ($('watch')) renderWatch($('watch'), snap, typeof snap.at === 'number' ? snap.at : Date.now(), { api }); });
    guard('funnel', () => round.renderFunnel($('funnel'), snap, catalog));
    guard('tallies', () => round.renderTallies($('tallies'), snap, catalog));
    guard('controls', () => controls.renderControls($('controls'), snap, { api, recordsRoot: $('system-records') }));
    guard('bar', () => bar.update(snap));
  }

  // Where the game records are on the server's disk. Asked once per connection.
  async function showDataPath() {
    const line = $('data-path');
    if (!line) return;
    try {
      const h = await api('/admin/health');
      if (typeof h.dataDir !== 'string' || !h.dataDir) return;
      line.textContent = `Game records are saved in ${h.dataDir} (sessions/ and traces/)${h.dataWritable ? '' : ' — NOT WRITABLE'}`;
      line.hidden = false;
    } catch { /* the tiles already show the server state */ }
  }

  function handle(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'hello') {
      catalog = msg.catalog || [];
      guard('log', () => { log.setCatalog(catalog); log.add(msg.recent || []); });
      lastTick = Date.now();
      guard('series', () => series.seed(msg.snapshot && msg.snapshot.history));
      render(msg.snapshot);
      showDataPath();
    } else if (msg.type === 'event') {
      if (msg.row) guard('log', () => log.add([msg.row]));
    } else if (msg.type === 'tick') {
      lastTick = Date.now();
      if (status === 'stale') setStatus('connected');
      render(msg.snapshot);
    }
  }

  function retry() {
    if (stopped) return;
    setStatus('reconnecting');
    const delay = DELAYS[Math.min(attempt, DELAYS.length - 1)];
    attempt += 1;
    clearTimeout(timer);
    timer = setTimeout(connect, delay);
  }

  async function connect() {
    clearTimeout(timer);
    if (ctl) ctl.abort();
    const mine = new AbortController();
    ctl = mine;
    stopped = false;
    try {
      const res = await fetch('/admin/stream', { signal: mine.signal });
      if (res.status === 401) {
        stopped = true;
        setStatus('signed out');
        signin?.show();
        return;
      }
      if (!res.ok || !res.body) throw new Error('HTTP ' + res.status);
      setStatus('connected');
      attempt = 0;
      lastTick = Date.now();
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let rest = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const out = splitLines(rest, dec.decode(value, { stream: true }));
        rest = out.rest;
        for (const m of out.lines) handle(m);
      }
    } catch {
      if (mine.signal.aborted) return;
    }
    if (ctl === mine && !stopped) retry();
  }

  setInterval(() => {
    if (status === 'connected' && Date.now() - lastTick > STALE_MS) setStatus('stale');
  }, 1000);

  const connected = async () => {
    attempt = 0;
    connect();
    loadLinks();
  };
  async function loadLinks() {
    const link = $('board-link');
    if (!link) return;
    try {
      const { board } = await api('/admin/links');
      if (typeof board === 'string' && /^https?:\/\//.test(board)) { link.href = board; link.hidden = false; }
    } catch { /* the link is optional */ }
  }
  mountSignIn(document, { onSignedIn: connected }).then((s) => { signin = s; });
}

if (typeof document !== 'undefined') start();
