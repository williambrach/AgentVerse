import http from 'node:http';
import { accessSync, constants, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { extname, join } from 'node:path';
import { RequestError } from './session.mjs';
import { readJsonBody, safeEqual, sendJson } from './http-util.mjs';
import { diskFreeBytes } from './monitor-sources.mjs';

const MAX_BODY = 16 * 1024;
const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const MAX_STREAMS = 5;
const MAX_BUFFERED = 1_000_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const send = (res, status, body, type) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!type) return sendJson(res, status, body);
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
};

// Reads the page files once; a missing directory just means no page.
function loadPage(dir) {
  const files = new Map();
  try {
    const d = typeof dir === 'string' ? dir : fileURLToPath(dir);
    for (const name of readdirSync(d)) {
      const type = TYPES[extname(name)];
      if (!type || name.includes('/')) continue;
      try { files.set(name === 'index.html' ? '/admin' : `/admin/${name}`, { type, body: readFileSync(join(d, name)) }); } catch {}
    }
  } catch {}
  return files;
}

export function createAdmin({ token, monitor = null, tickMs = 1000, pageDir = new URL('./admin/', import.meta.url), router = null, content = null, makers = [], investigations, registry, dataDir, probeMessages = [], allowedHosts = [], readSystem = () => [], onSystem = () => {}, leaderboard = null, boardUrl = '' }) {
  if (typeof token !== 'string' || !token) throw new Error('An admin token is required.');
  const actor = (req) => {
    const m = /^bearer (.+)$/i.exec(req.headers.authorization || '');
    if (!m) return null;
    let found = safeEqual(m[1], token) ? { by: 'admin', scope: 'all' } : null;
    for (const mk of makers) if (safeEqual(m[1], mk.token) && !found) found = { by: mk.name, scope: 'content' };
    return found;
  };
  // DNS-rebinding guard: only loopback host names (any port) plus explicit extras.
  const hostOk = (h) => { const n = String(h || '').toLowerCase().replace(/:\d+$/, ''); return ['127.0.0.1', 'localhost', '[::1]'].includes(n) || allowedHosts.includes(n); };
  const log = (action, details) => onSystem({ type: 'admin_action', timestamp: Date.now(), action, ...details });
  const needRouter = () => { if (!router) throw new RequestError(409, 'Live LLM mode is off.'); };
  const str = (v, what) => { if (typeof v !== 'string' || !v) throw new RequestError(400, `${what} is required.`); return v; };

  const pageFiles = loadPage(pageDir);
  let streams = 0;
  const active = new Set();
  const needMonitor = () => { if (!monitor) throw new RequestError(409, 'The monitor is off.'); };

  const needBoard = () => { if (!leaderboard) throw new RequestError(409, 'The leaderboard is off.'); };

  const stream = (req, res) => {
    needMonitor();
    if (streams >= MAX_STREAMS) throw new RequestError(503, 'Too many admin streams.');
    streams++;
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    let done = false;
    let unsub = () => {};
    let timer = null;
    function cleanup() {
      if (done) return;
      done = true; streams--; active.delete(cleanup);
      clearInterval(timer); unsub();
      if (!res.destroyed) res.destroy();
    }
    active.add(cleanup);
    // Takes a thunk so a throwing monitor drops this client, not the listener.
    const write = (make) => {
      if (done) return;
      if (res.writableLength > MAX_BUFFERED) return cleanup();
      try { res.write(JSON.stringify(make()).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029') + '\n'); } catch { cleanup(); }
    };
    req.on('close', cleanup);
    res.on('close', cleanup);
    res.on('error', cleanup);
    write(() => ({ type: 'hello', catalog: monitor.catalog(), snapshot: monitor.snapshot(), recent: monitor.recent() }));
    if (done) return;
    try { unsub = monitor.subscribe((row) => write(() => ({ type: 'event', row }))); } catch { return cleanup(); }
    timer = setInterval(() => write(() => ({ type: 'tick', snapshot: monitor.snapshot() })), tickMs);
  };

  const health = () => {
    let dataWritable = false;
    try { accessSync(dataDir, constants.W_OK); dataWritable = true; } catch {}
    return { ok: true, dataWritable, diskFreeBytes: diskFreeBytes(dataDir), router: router ? router.snapshot() : null, sessions: investigations.stats(), recentSystem: readSystem().slice(-20) };
  };

  const routes = {
    'GET /admin/health': () => health(),
    'POST /admin/llm/active': async (body) => {
      needRouter();
      try { return router.setActive(str(body.endpoint, 'Endpoint'), { pinned: !!body.pinned, reason: typeof body.reason === 'string' ? body.reason.slice(0, 200) : undefined, by: 'admin' }); }
      catch (e) { throw e instanceof RequestError ? e : new RequestError(400, e.message); }
    },
    'POST /admin/llm/probe': async (body) => {
      needRouter();
      const endpoint = str(body.endpoint, 'Endpoint');
      let result;
      try { result = await router.probe(endpoint, typeof probeMessages === 'function' ? probeMessages() : probeMessages); }
      catch (e) { throw new RequestError(400, e.message); }
      log('probe', { endpoint, ok: !!result?.ok });
      return result;
    },
    'POST /admin/llm/cap': async (body) => {
      needRouter();
      const { endpoint = null, value } = body;
      if (endpoint !== null && typeof endpoint !== 'string') throw new RequestError(400, 'Endpoint must be a name or null.');
      if (!Number.isInteger(value) || value < 1 || value > 1000) throw new RequestError(400, 'Cap must be an integer from 1 to 1000.');
      let snap;
      try { snap = router.setCap({ endpoint, value }); } catch (e) { throw new RequestError(400, e.message); }
      log('cap', { endpoint, value });
      return snap;
    },
    'POST /admin/round': async (body) => {
      needMonitor();
      const label = typeof body.label === 'string' ? body.label.trim() : '';
      if (!label || label.length > 60) throw new RequestError(400, 'Label is required (1-60 characters).');
      const reason = typeof body.reason === 'string' ? body.reason.slice(0, 200) : '';
      const { startedAt } = monitor.startRound({ label, reason });
      onSystem({ type: 'round_started', timestamp: Date.now(), label, reason, startedAt });
      return { label, startedAt };
    },
    'GET /admin/links': () => ({ board: boardUrl }),
    'GET /admin/leaderboard': () => { needBoard(); return leaderboard.standings(); },
    'POST /admin/leaderboard': async (body) => {
      needBoard();
      if (body.rankBy !== 'time' && body.rankBy !== 'coins') throw new RequestError(400, 'rankBy must be time or coins.');
      leaderboard.setRankBy(body.rankBy);
      return leaderboard.standings();
    },
    'POST /admin/teams/hidden': async (body) => {
      needBoard();
      if (typeof body.teamId !== 'string' || !UUID.test(body.teamId)) throw new RequestError(400, 'teamId must be a team id.');
      if (typeof body.hidden !== 'boolean') throw new RequestError(400, 'hidden must be true or false.');
      leaderboard.setHidden(body.teamId, body.hidden);
      return leaderboard.standings();
    },
    'POST /admin/sessions/pause': async (body) => {
      if (typeof body.paused !== 'boolean') throw new RequestError(400, 'paused must be true or false.');
      investigations.setPaused(body.paused);
      log('pause', { paused: body.paused });
      return { ok: true, paused: body.paused };
    },
  };

  const server = http.createServer(async (req, res) => {
    try {
      if (!hostOk(req.headers.host)) throw new RequestError(403, 'Forbidden host.');
      const path = (req.url || '').split('?')[0];
      const file = req.method === 'GET' ? pageFiles.get(path) : undefined;
      if (file) {
        const h = { 'Content-Type': file.type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
        if (file.type.startsWith('text/html')) h['Content-Security-Policy'] = CSP;
        res.writeHead(200, h);
        return res.end(file.body);
      }
      const known = path === '/metrics' || path.startsWith('/admin/');
      if (!known) throw new RequestError(404, 'Not found.');
      const who = actor(req);
      if (!who) throw new RequestError(401, 'Unauthorized.');
      if (who.scope === 'content' && !(path === '/admin/content' || path.startsWith('/admin/content/'))) throw new RequestError(403, 'Maker tokens can only edit content.');
      if (path === '/metrics') {
        if (req.method !== 'GET') throw new RequestError(405, 'Method not allowed.');
        return send(res, 200, registry.render(), 'text/plain; version=0.0.4');
      }
      if (path === '/admin/stream') {
        if (req.method !== 'GET') throw new RequestError(405, 'Method not allowed.');
        return stream(req, res);
      }
      const sid = req.method === 'GET' ? /^\/admin\/sessions\/([^/]+)$/.exec(path)?.[1] : undefined;
      if (sid && sid !== 'pause') {
        needMonitor();
        const rows = UUID.test(sid) ? monitor.session(sid) : null;
        if (!rows) throw new RequestError(404, 'No such session.');
        return send(res, 200, { sessionId: sid, rows, coins: monitor.sessionCoins?.(sid) ?? { spent: 0, budget: null } });
      }
      const paths = Object.keys(routes).map((k) => k.split(' ')[1]);
      const handler = routes[`${req.method} ${path}`];
      if (!handler) throw new RequestError(paths.includes(path) ? 405 : 404, paths.includes(path) ? 'Method not allowed.' : 'Not found.');
      const body = req.method === 'POST' ? await readJsonBody(req, MAX_BODY) : {};
      send(res, 200, await handler(body));
    } catch (e) {
      if (res.headersSent) return res.destroy();
      if (e instanceof RequestError) return send(res, e.status, { error: e.message });
      console.error('admin error:', e?.message);
      send(res, 500, { error: 'Internal error.' });
    }
  });
  server.on('close', () => { for (const c of [...active]) c(); });
  return server;
}
