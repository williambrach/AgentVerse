import http from 'node:http';
import { timingSafeEqual, createHash } from 'node:crypto';
import { accessSync, constants, statfsSync } from 'node:fs';

const MAX_BODY = 16 * 1024;
const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const digest = (s) => createHash('sha256').update(String(s)).digest();

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let tooBig = false;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { if (!tooBig) reject(new HttpError(413, 'Request body too large.')); tooBig = true; chunks.length = 0; return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (tooBig || !size) return resolve({});
      try {
        const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error();
        resolve(v);
      } catch { reject(new HttpError(400, 'Body must be a JSON object.')); }
    });
    req.on('error', reject);
  });
}

export function createAdmin({ token, router = null, investigations, registry, dataDir, probeMessages = [], allowedHosts = [], readSystem = () => [], onSystem = () => {} }) {
  if (typeof token !== 'string' || !token) throw new Error('An admin token is required.');
  const want = digest(token);
  const authed = (req) => {
    const m = /^bearer (.+)$/i.exec(req.headers.authorization || '');
    return !!m && timingSafeEqual(digest(m[1]), want);
  };
  // DNS-rebinding guard: only loopback host names (any port) plus explicit extras.
  const hostOk = (h) => { const n = String(h || '').toLowerCase().replace(/:\d+$/, ''); return ['127.0.0.1', 'localhost', '[::1]'].includes(n) || allowedHosts.includes(n); };
  const log = (action, details) => onSystem({ type: 'admin_action', timestamp: Date.now(), action, ...details });
  const needRouter = () => { if (!router) throw new HttpError(409, 'Live LLM mode is off.'); };
  const str = (v, what) => { if (typeof v !== 'string' || !v) throw new HttpError(400, `${what} is required.`); return v; };

  const health = () => {
    let dataWritable = false;
    let diskFreeBytes = null;
    try { accessSync(dataDir, constants.W_OK); dataWritable = true; } catch {}
    try { const s = statfsSync(dataDir); diskFreeBytes = Number(s.bavail) * Number(s.bsize); } catch {}
    return { ok: true, dataWritable, diskFreeBytes, router: router ? router.snapshot() : null, sessions: investigations.stats(), recentSystem: readSystem().slice(-20) };
  };

  const routes = {
    'GET /admin/health': () => health(),
    'POST /admin/llm/active': async (body) => {
      needRouter();
      try { return router.setActive(str(body.endpoint, 'Endpoint'), { pinned: !!body.pinned, reason: typeof body.reason === 'string' ? body.reason.slice(0, 200) : undefined, by: 'admin' }); }
      catch (e) { throw e instanceof HttpError ? e : new HttpError(400, e.message); }
    },
    'POST /admin/llm/probe': async (body) => {
      needRouter();
      const endpoint = str(body.endpoint, 'Endpoint');
      let result;
      try { result = await router.probe(endpoint, probeMessages); }
      catch (e) { throw new HttpError(400, e.message); }
      log('probe', { endpoint, ok: !!result?.ok });
      return result;
    },
    'POST /admin/llm/cap': async (body) => {
      needRouter();
      const { endpoint = null, value } = body;
      if (endpoint !== null && typeof endpoint !== 'string') throw new HttpError(400, 'Endpoint must be a name or null.');
      if (!Number.isInteger(value) || value < 1 || value > 1000) throw new HttpError(400, 'Cap must be an integer from 1 to 1000.');
      let snap;
      try { snap = router.setCap({ endpoint, value }); } catch (e) { throw new HttpError(400, e.message); }
      log('cap', { endpoint, value });
      return snap;
    },
    'POST /admin/sessions/pause': async (body) => {
      if (typeof body.paused !== 'boolean') throw new HttpError(400, 'paused must be true or false.');
      investigations.setPaused(body.paused);
      log('pause', { paused: body.paused });
      return { ok: true, paused: body.paused };
    },
  };

  return http.createServer(async (req, res) => {
    try {
      if (!hostOk(req.headers.host)) throw new HttpError(403, 'Forbidden host.');
      const path = (req.url || '').split('?')[0];
      if (req.method === 'GET' && path === '/admin') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': CSP });
        return res.end(PAGE);
      }
      const known = path === '/metrics' || path.startsWith('/admin/');
      if (!known) throw new HttpError(404, 'Not found.');
      if (!authed(req)) throw new HttpError(401, 'Unauthorized.');
      if (path === '/metrics') {
        if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed.');
        return send(res, 200, registry.render(), 'text/plain; version=0.0.4');
      }
      const paths = Object.keys(routes).map((k) => k.split(' ')[1]);
      const handler = routes[`${req.method} ${path}`];
      if (!handler) throw new HttpError(paths.includes(path) ? 405 : 404, paths.includes(path) ? 'Method not allowed.' : 'Not found.');
      const body = req.method === 'POST' ? await readBody(req) : {};
      send(res, 200, await handler(body));
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message });
      console.error('admin error:', e?.message);
      send(res, 500, { error: 'Internal error.' });
    }
  });
}

// Static page: no data is embedded; all state comes from the polled API and is written with textContent.
const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Override admin</title>
<style>
body{font:14px system-ui,sans-serif;margin:16px;background:#111;color:#eee}
table{border-collapse:collapse;margin:8px 0}td,th{border:1px solid #444;padding:4px 8px;text-align:left}
button,input{font:inherit;margin:2px}.bad{color:#f66}.ok{color:#6c6}pre{white-space:pre-wrap}
</style></head><body>
<h1>Override admin</h1>
<div><label>Token <input id="token" type="password" autocomplete="off"></label> <button id="save">Use token</button> <span id="status"></span></div>
<h2>Router</h2><div id="routerSummary"></div>
<table id="endpoints"></table>
<div><label>Global cap <input id="capValue" type="number" min="1" max="1000" value="50"></label>
<button id="capAll">Set global cap</button></div>
<h2>Sessions</h2><table id="sessions"></table>
<button id="pause">Pause</button> <button id="resume">Resume</button>
<h2>System</h2><table id="system"></table>
<pre id="result"></pre>
<script>
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var tokenInput = $('token');
  tokenInput.value = sessionStorage.getItem('adminToken') || '';
  function cell(tr, text, tag) { var c = document.createElement(tag || 'td'); c.textContent = text == null ? '' : String(text); tr.appendChild(c); return c; }
  function btn(tr, label, fn) { var td = document.createElement('td'); var b = document.createElement('button'); b.textContent = label; b.addEventListener('click', fn); td.appendChild(b); tr.appendChild(td); }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function api(path, body) {
    var opt = { headers: { Authorization: 'Bearer ' + tokenInput.value } };
    if (body !== undefined) { opt.method = 'POST'; opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    return fetch(path, opt).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || r.status); return j; }); });
  }
  function act(path, body) {
    api(path, body).then(function (j) { $('result').textContent = JSON.stringify(j, null, 2); poll(); })
      .catch(function (e) { $('result').textContent = 'Error: ' + e.message; });
  }
  $('save').addEventListener('click', function () { sessionStorage.setItem('adminToken', tokenInput.value); poll(); });
  $('pause').addEventListener('click', function () { act('/admin/sessions/pause', { paused: true }); });
  $('resume').addEventListener('click', function () { act('/admin/sessions/pause', { paused: false }); });
  $('capAll').addEventListener('click', function () { act('/admin/llm/cap', { endpoint: null, value: Number($('capValue').value) }); });
  function render(h) {
    var st = $('status'); st.textContent = h.ok ? 'connected' : 'error'; st.className = h.ok ? 'ok' : 'bad';
    var r = h.router, rs = $('routerSummary'), t = $('endpoints'); clear(t);
    if (!r) { rs.textContent = 'Live LLM mode is off (rehearsal).'; }
    else {
      rs.textContent = 'Active: ' + r.active + (r.pinned ? ' (pinned)' : '') + ' | in flight ' + r.inFlight + '/' + r.maxInFlight + ' | queued ' + r.queued;
      var hd = document.createElement('tr');
      ['Name','Model','Host','In flight','Cap','Queued','Failures 5m','Last failure','Actions'].forEach(function (x) { cell(hd, x, 'th'); }); t.appendChild(hd);
      r.endpoints.forEach(function (e) {
        var tr = document.createElement('tr');
        cell(tr, e.name); cell(tr, e.model); cell(tr, e.apiBaseHost); cell(tr, e.inFlight); cell(tr, e.maxInFlight);
        cell(tr, e.queued); cell(tr, e.failures5m); cell(tr, e.lastFailureReason);
        btn(tr, 'Move + pin', function () { var why = prompt('Reason for moving to ' + e.name + '?'); if (why) act('/admin/llm/active', { endpoint: e.name, pinned: true, reason: why }); });
        btn(tr, 'Unpin', function () { var why = prompt('Reason for unpinning on ' + e.name + '?'); if (why) act('/admin/llm/active', { endpoint: e.name, pinned: false, reason: why }); });
        btn(tr, 'Probe', function () { act('/admin/llm/probe', { endpoint: e.name }); });
        btn(tr, 'Cap', function () { var v = Number(prompt('Cap for ' + e.name + ' (1-1000)?', String(e.maxInFlight))); if (v) act('/admin/llm/cap', { endpoint: e.name, value: v }); });
        t.appendChild(tr);
      });
    }
    var s = h.sessions, ss = $('sessions'); clear(ss);
    var row = function (k, v) { var tr = document.createElement('tr'); cell(tr, k); cell(tr, v); ss.appendChild(tr); };
    row('games', s.games); row('waiting', s.waiting); row('paused', s.paused);
    Object.keys(s.byStage || {}).forEach(function (k) { row('stage ' + k, s.byStage[k]); });
    var sy = $('system'); clear(sy);
    (h.recentSystem || []).slice().reverse().forEach(function (rec) { var tr = document.createElement('tr'); cell(tr, JSON.stringify(rec)); sy.appendChild(tr); });
  }
  function poll() {
    if (!tokenInput.value) return;
    api('/admin/health').then(render).catch(function (e) { var st = $('status'); st.textContent = 'Error: ' + e.message; st.className = 'bad'; });
  }
  setInterval(poll, 1000); poll();
})();
</script></body></html>`;
