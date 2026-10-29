import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Investigations, RequestError } from './session.mjs';
import { buildMessages, modelConfig } from './interviews.mjs';
import { cases } from './cases/index.mjs';
import { LlmRouter } from './llm.mjs';
import { appendJsonl, dataPaths, lastRecord, readJsonl, setWriteObserver } from './dataset.mjs';
import { WindowCounter, clientAddress, signToken, verifyToken } from './identity.mjs';
import { loadStatic, serveStatic } from './static.mjs';
import { Registry, bindCollectors, createGameMetrics, observeGameEvent, observeLlmEvent, observeWrite } from './metrics.mjs';
import { createAdmin } from './admin.mjs';
import { createMonitor } from './monitor.mjs';
import { createRoundStats } from './monitor-round.mjs';
import { createPresence, createWindows } from './monitor-window.mjs';
import { createTrafficSampler, loadEvents, loadRound, readSessionEvents } from './monitor-sources.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN_MS = 12 * 60 * 60_000;
const actions = ['start', 'reset', 'reveal', 'evidence', 'visit', 'interview', 'verdict'];
const tabPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sessionIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function createApp({ investigations, accessCode = '', secret = randomBytes(32).toString('hex'), trustProxy = false, staticFiles = null, metrics = null, publicDir = resolve(root, 'dist'), onHeartbeat = null }) {
  const files = staticFiles || loadStatic(publicDir);
  // Only wrong codes count. Behind a proxy or a shared network, every player
  // arrives from one address, and correct sign-ins must not lock them out.
  const failures = new WindowCounter({ limit: 30, windowMs: 60_000 });
  const cookie = (req, name) => new RegExp(`(?:^|; )${name}=([^;]+)`).exec(req.headers.cookie || '')?.[1];
  const setCookie = (req, res, name, value) => {
    const secure = req.socket.encrypted || (trustProxy && req.headers['x-forwarded-proto'] === 'https');
    res.setHeader('Set-Cookie', `${name}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secure ? '; Secure' : ''}`);
  };
  const validToken = req => !accessCode || verifyToken(secret, cookie(req, 'override_access'), Date.now());
  const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };

  return createServer(async (req, res) => {
    const started = performance.now();
    let route = 'static';
    if (metrics) res.on('finish', () => {
      metrics.httpRequests.inc({ route, status: res.statusCode });
      metrics.httpDuration.observe({ route }, (performance.now() - started) / 1000);
    });
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        const name = url.pathname.slice('/api/'.length);
        route = ['health', 'access', 'cases', 'state', 'events', 'heartbeat', ...actions].includes(name) ? `/api/${name}` : '/api/other';
        if (url.pathname === '/api/health' && req.method === 'GET') return json(res, 200, { ok: true });
        if (req.method === 'POST') {
          if (req.headers['sec-fetch-site'] === 'cross-site') throw new RequestError(403, 'Cross-site requests are not allowed.');
          if (!req.headers['content-type']?.startsWith('application/json')) throw new RequestError(415, 'Send application/json.');
        }
        if (url.pathname === '/api/access' && req.method === 'GET') return json(res, 200, { authorized: Boolean(validToken(req)), protected: Boolean(accessCode) });
        let input = {};
        if (req.method === 'POST') {
          let body = '';
          for await (const chunk of req) {
            body += chunk;
            if (Buffer.byteLength(body) > 16_384) throw new RequestError(413, 'Request is too large.');
          }
          try { input = JSON.parse(body || '{}'); } catch { throw new RequestError(400, 'Invalid JSON.'); }
          if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RequestError(400, 'Send a JSON object.');
        }
        if (url.pathname === '/api/access' && req.method === 'POST') {
          const ip = clientAddress(req, trustProxy);
          const now = Date.now();
          if (!failures.allowed(ip, now)) throw new RequestError(429, 'Too many attempts. Try again in one minute.');
          const supplied = Buffer.from(typeof input.code === 'string' ? input.code : '');
          const expected = Buffer.from(accessCode);
          if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
            failures.add(ip, now);
            throw new RequestError(401, 'That access code is not correct.');
          }
          setCookie(req, res, 'override_access', signToken(secret, now + TOKEN_MS));
          return json(res, 200, { authorized: true });
        }
        if (!validToken(req)) throw new RequestError(401, 'Enter the demo access code to continue.');
        // Each browser owns one investigation through its session cookie.
        const sessionId = cookie(req, 'override_session');
        if (url.pathname === '/api/heartbeat' && req.method === 'POST') {
          if (typeof input.tab !== 'string' || !tabPattern.test(input.tab)) throw new RequestError(400, 'Send a tab id.');
          try { onHeartbeat?.(input.tab, sessionIdPattern.test(sessionId || '') ? sessionId : null); } catch { /* never fails a player */ }
          res.writeHead(204, { 'Cache-Control': 'no-store' });
          return res.end();
        }
        if (url.pathname === '/api/cases' && req.method === 'GET') return json(res, 200, { cases: investigations.catalog() });
        if (url.pathname === '/api/state' && req.method === 'GET') return json(res, 200, investigations.view(sessionId));
        if (url.pathname === '/api/events' && req.method === 'GET') {
          const body = investigations.export(sessionId);
          res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store', 'Content-Disposition': `attachment; filename="override-${sessionId}.jsonl"` });
          return res.end(body);
        }
        if (req.method === 'POST') {
          if (!actions.includes(name)) throw new RequestError(404, 'Unknown endpoint.');
          const view = await investigations.mutate(sessionId, name, input);
          if (view.session.id !== sessionId) setCookie(req, res, 'override_session', view.session.id);
          return json(res, 200, view);
        }
        throw new RequestError(404, 'Unknown endpoint.');
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new RequestError(405, 'Method not allowed.');
      const sent = serveStatic(files, req, res);
      if (sent < 0) throw new RequestError(404, 'File not found. Run npm run build before npm start.');
      if (sent > 0) metrics?.staticBytes.inc({}, sent);
    } catch (error) {
      const status = error instanceof RequestError ? error.status : 500;
      if (status === 500) console.error('Request failed:', error.code || error.name);
      json(res, status, { error: status === 500 ? 'The server could not save this action. Check storage permissions and try again.' : error.message });
    }
  });
}

function appVersion(env) {
  if (env.OVERRIDE_APP_COMMIT) return { appCommit: env.OVERRIDE_APP_COMMIT, appDirty: null };
  try {
    const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return { appCommit: git('rev-parse', 'HEAD'), appDirty: git('status', '--porcelain').length > 0 };
  } catch { return { appCommit: 'unknown', appDirty: null }; }
}

// Dev tools expose draft cases to the catalog and to start/reset. Never in production.
function devTools(env) {
  const wanted = env.OVERRIDE_DEV_TOOLS === '1';
  if (wanted && env.NODE_ENV === 'production') { console.log('Dev tools are off in production.'); return false; }
  return wanted;
}

const portOf = (value, fallback) => (value === undefined || value === '' ? fallback : Number(value));
const sleep = ms => new Promise(resolve => { setTimeout(resolve, ms).unref(); });

export async function startServer(env = process.env, { publicDir = resolve(root, 'dist') } = {}) {
  const config = modelConfig(env);
  const envName = env.OVERRIDE_ENV || 'live';
  const dataDir = resolve(env.OVERRIDE_DATA_DIR || resolve(root, 'data'), envName);
  const paths = dataPaths(dataDir);
  const registry = new Registry();
  const metrics = createGameMetrics(registry);
  setWriteObserver(write => observeWrite(metrics, write));
  // The monitor exists only with an admin token; closures are late-bound and never let it break a game.
  let monitor = null;
  const feed = (method, arg) => { try { monitor?.[method](arg); } catch { /* monitor must not affect games */ } };
  const onSystem = record => { appendJsonl(paths.system, record, 'system'); feed('observeSystem', record); };
  // Traces are admin-only. Probes and anything without a valid session go to one shared file.
  const onTrace = record => appendJsonl(join(paths.traces, !record.probe && sessionIdPattern.test(record.sessionId || '') ? `${record.sessionId}.jsonl` : 'probes.jsonl'), record, 'trace');
  const router = config.mode === 'live' ? new LlmRouter({
    endpoints: config.endpoints, maxInFlight: config.maxInFlight, deadlineMs: config.timeoutMs, maxCompletionTokens: config.maxCompletionTokens,
    failover: config.failover, restore: lastRecord(paths.system, r => r.type === 'llm_active'), onSystem, onTrace, onEvent: e => { observeLlmEvent(metrics, e); feed('observeLlm', e); },
  }) : null;
  const investigations = new Investigations({
    dataDir, config, router, dev: devTools(env), meta: { env: envName, ...appVersion(env), endpointsHash: config.endpointsHash },
    onEvent: e => { observeGameEvent(metrics, e); feed('observeGame', e); },
  });
  bindCollectors(registry, { router, investigations, dataDir });

  let sampler = null;
  let tickTimer = null;
  if (env.OVERRIDE_ADMIN_TOKEN) {
    sampler = createTrafficSampler({ registry, dataDir: paths.root, now: Date.now });
    let cached = null;
    let cachedAt = 0;
    const extras = () => {
      const at = Date.now();
      if (!cached || at - cachedAt >= 1000 || at < cachedAt) {
        cached = { router: router?.snapshot() ?? null, sessions: investigations.stats(), system: readJsonl(paths.system).slice(-20) };
        cachedAt = at;
      }
      return cached;
    };
    monitor = createMonitor({
      cases, roundStats: createRoundStats(cases), windows: createWindows({ now: Date.now }),
      presence: createPresence({ now: Date.now, windowMs: 75_000, max: 5000 }),
      sample: () => sampler.sample(), extras, readSession: id => readSessionEvents(paths.sessions, id),
      now: Date.now, mode: config.mode === 'live' ? 'live' : 'rehearsal', ringSize: 1000,
    });
    const round = loadRound(paths.system);
    monitor.load(loadEvents(paths.sessions, round.startedAt), round);
    tickTimer = setInterval(() => { try { monitor.tick(); } catch { /* ignore */ } }, 5000);
    tickTimer.unref();
  }

  let secret = env.OVERRIDE_SECRET;
  if (!secret) {
    secret = randomBytes(32).toString('hex');
    console.warn('OVERRIDE_SECRET is not set: sign-ins will not survive a restart.');
  }
  const trustProxy = ['1', 'true'].includes(String(env.OVERRIDE_TRUST_PROXY).toLowerCase());
  const server = createApp({ investigations, accessCode: env.OVERRIDE_ACCESS_CODE || '', secret, trustProxy, staticFiles: loadStatic(publicDir), metrics, onHeartbeat: (tab, sid) => monitor?.heartbeat(tab, sid) });
  // Headers and bodies arrive fast; answers take up to 60 s. Keep-alive outlives a proxy's idle timeout.
  server.headersTimeout = 20_000;
  server.requestTimeout = 40_000;
  server.keepAliveTimeout = 75_000;
  const host = env.HOST || '127.0.0.1';
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(portOf(env.PORT, 3001), host, 1024, resolve); });

  let admin = null;
  if (env.OVERRIDE_ADMIN_TOKEN) {
    // The probe asks the first registered case's first character its quick question.
    const probeCase = cases[0];
    const probeCharacter = probeCase.characters[0];
    admin = createAdmin({
      token: env.OVERRIDE_ADMIN_TOKEN, monitor, router, investigations, registry, dataDir,
      probeMessages: buildMessages(probeCase, { revealedPosition: 1, selectedEvidence: null, interviews: Object.fromEntries(probeCase.characters.map(c => [c.id, []])) }, probeCharacter.id, probeCharacter.quickQuestion),
      readSystem: () => readJsonl(paths.system).slice(-20), onSystem,
    });
    try {
      await new Promise((resolve, reject) => { admin.once('error', reject); admin.listen(portOf(env.OVERRIDE_ADMIN_PORT, 3002), '127.0.0.1', resolve); });
    } catch (error) { clearInterval(tickTimer); sampler?.close(); server.close(); throw error; }
  }

  let closing = null;
  // Stop taking connections, let pending answers finish (up to the 60 s deadline plus margin), then drop what is left.
  const close = () => closing ||= (async () => {
    const closed = new Promise(resolve => server.close(resolve));
    server.closeIdleConnections();
    clearInterval(tickTimer);
    sampler?.close();
    admin?.close();
    admin?.closeAllConnections();
    await Promise.race([investigations.idle(), sleep(65_000)]);
    const sweep = setInterval(() => server.closeIdleConnections(), 25);
    await Promise.race([closed, sleep(5000)]);
    clearInterval(sweep);
    server.closeAllConnections();
  })();

  return {
    url: `http://${host}:${server.address().port}`,
    adminUrl: admin ? `http://127.0.0.1:${admin.address().port}` : null,
    server, admin, router, investigations, close,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const running = await startServer(process.env);
  console.log(`The Banana Mystery: ${running.url} · ${running.investigations.config.mode} interviews${running.adminUrl ? ` · admin ${running.adminUrl}` : ''}`);
  const stop = () => running.close().then(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
