import { splitLines } from './ndjson.js';
import * as tiles from './tiles.js';
import * as logMod from './log.js';
import * as round from './round.js';
import * as controls from './controls.js';
import { renderBoard } from './board.js';
import { renderWatch } from './watch.js';

const DELAYS = [1000, 2000, 5000, 10000];
const STALE_MS = 5000;

function start() {
  const $ = (id) => document.getElementById(id);
  const statusEl = $('status');
  const tokenEl = $('token');
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
  };
  const token = () => sessionStorage.getItem('adminToken') || '';
  tokenEl.value = token();

  async function api(path, body) {
    const init = { headers: { authorization: 'Bearer ' + token() } };
    if (body !== undefined) {
      init.method = 'POST';
      init.headers['content-type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const res = await fetch(path, init);
    let j = {};
    try { j = await res.json(); } catch { /* empty body */ }
    if (!res.ok) throw new Error(j.error || 'HTTP ' + res.status);
    return j;
  }

  const log = logMod.createLog($('log'), { api, panel: $('player-panel') });
  const roundCtl = round.createRoundControl($('round'), { api });

  function render(snap) {
    lastSnap = snap;
    tiles.renderPlayers($('players'), snap);
    const worst = tiles.renderTiles($('tiles'), snap);
    document.title = (worst === 'bad' ? '⚠ ' : '') + baseTitle;
    tiles.renderHistory($('history'), snap);
    renderBoard($('board'), snap, { api });
    if ($('watch')) renderWatch($('watch'), snap, typeof snap.at === 'number' ? snap.at : Date.now(), { api });
    round.renderFunnel($('funnel'), snap, catalog);
    round.renderTallies($('tallies'), snap, catalog);
    controls.renderControls($('controls'), snap, { api });
    roundCtl.update(snap);
  }

  function handle(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'hello') {
      catalog = msg.catalog || [];
      log.setCatalog(catalog);
      log.add(msg.recent || []);
      lastTick = Date.now();
      render(msg.snapshot);
    } else if (msg.type === 'event') {
      if (msg.row) log.add([msg.row]);
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
      const res = await fetch('/admin/stream', {
        headers: { authorization: 'Bearer ' + token() },
        signal: mine.signal,
      });
      if (res.status === 401) {
        stopped = true;
        setStatus('bad token');
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

  $('auth').addEventListener('submit', (e) => {
    e.preventDefault();
    sessionStorage.setItem('adminToken', tokenEl.value.trim());
    attempt = 0;
    connect();
    loadLinks();
  });
  async function loadLinks() {
    const link = $('board-link');
    if (!link) return;
    try {
      const { board } = await api('/admin/links');
      if (typeof board === 'string' && /^https?:\/\//.test(board)) { link.href = board; link.hidden = false; }
    } catch { /* the link is optional */ }
  }
  if (token()) { connect(); loadLinks(); }
}

if (typeof document !== 'undefined') start();
