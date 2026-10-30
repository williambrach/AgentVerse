import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Investigations, RequestError } from './session.mjs';
import { buildMessages, modelConfig } from './interviews.mjs';
import { economyRules } from './economy.mjs';
import { castCharacters, identityCast } from './cases.mjs';
import { cases } from './cases/index.mjs';
import { LlmRouter } from './llm.mjs';
import { appendJsonl, dataPaths, lastRecord, readJsonl, setWriteObserver } from './dataset.mjs';
import { WindowCounter, clientAddress, signToken, verifyToken } from './identity.mjs';
import { loadStatic, serveStatic } from './static.mjs';
import { Registry, bindCollectors, createGameMetrics, observeGameEvent, observeLlmEvent, observeWrite } from './metrics.mjs';
import { createTeams } from './teams.mjs';
import { createLeaderboard } from './leaderboard.mjs';
import { createAdmin } from './admin.mjs';
import { createContentStore } from './content.mjs';
import { integerEnv, readJsonBody, safeEqual, sendJson } from './http-util.mjs';
import { createMonitor } from './monitor.mjs';
import { createRoundStats } from './monitor-round.mjs';
import { createPresence, createWindows } from './monitor-window.mjs';
import { createTrafficSampler, loadEvents, loadRound, readSessionEvents } from './monitor-sources.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN_MS = 12 * 60 * 60_000;
const actions = ['start', 'reset', 'visit', 'interview', 'inspect', 'continue', 'verdict'];
const tabPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sessionIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function createApp({ investigations, accessCode = '', secret = randomBytes(32).toString('hex'), trustProxy = false, staticFiles = null, metrics = null, publicDir = resolve(root, 'dist'), onHeartbeat = null, teams = createTeams({ file: null }), leaderboard = null }) {
  const files = staticFiles || loadStatic(publicDir);
  // Only wrong codes count. Behind a proxy or a shared network, every player
  // arrives from one address, and correct sign-ins must not lock them out.
  const failures = new WindowCounter({ limit: 30, windowMs: 60_000 });
  const cookie = (req, name) => new RegExp(`(?:^|; )${name}=([^;]+)`).exec(req.headers.cookie || '')?.[1];
  const setCookie = (req, res, name, value) => {
    const secure = req.socket.encrypted || (trustProxy && req.headers['x-forwarded-proto'] === 'https');
    res.setHeader('Set-Cookie', `${name}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secure ? '; Secure' : ''}`);
  };
  // Creating teams is the costly act; joining one is free. Only creations count.
  const newTeams = new WindowCounter({ limit: 120, windowMs: 60_000 });
  const validToken = req => !accessCode || verifyToken(secret, cookie(req, 'override_access'), Date.now());
  const json = sendJson;

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
        route = ['health', 'access', 'cases', 'state', 'events', 'heartbeat', 'team', 'leaderboard', ...actions].includes(name) ? `/api/${name}` : '/api/other';
        if (url.pathname === '/api/health' && req.method === 'GET') return json(res, 200, { ok: true });
        if (req.method === 'POST') {
          if (req.headers['sec-fetch-site'] === 'cross-site') throw new RequestError(403, 'Cross-site requests are not allowed.');
          if (!req.headers['content-type']?.startsWith('application/json')) throw new RequestError(415, 'Send application/json.');
        }
        if (url.pathname === '/api/access' && req.method === 'GET') return json(res, 200, { authorized: Boolean(validToken(req)), protected: Boolean(accessCode) });
        const input = req.method === 'POST' ? await readJsonBody(req, 16_384) : {};
        if (url.pathname === '/api/access' && req.method === 'POST') {
          const ip = clientAddress(req, trustProxy);
          const now = Date.now();
          if (!failures.allowed(ip, now)) throw new RequestError(429, 'Too many attempts. Try again in one minute.');
          if (!safeEqual(typeof input.code === 'string' ? input.code : '', accessCode)) {
            failures.add(ip, now);
            throw new RequestError(401, 'That access code is not correct.');
          }
          setCookie(req, res, 'override_access', signToken(secret, now + TOKEN_MS));
          return json(res, 200, { authorized: true });
        }
        if (!validToken(req)) throw new RequestError(401, 'Enter the demo access code to continue.');
        // Each browser owns one investigation through its session cookie.
        // A known team cookie wins: the team owns the session. A stale one means no team.
        const team = teams.find(cookie(req, 'override_team'));
        const sessionId = team ? team.sessionId : cookie(req, 'override_session');
        if (url.pathname === '/api/team' && req.method === 'GET') return json(res, 200, { team: team ? { name: team.name } : null });
        if (url.pathname === '/api/team' && req.method === 'POST') {
          const ip = clientAddress(req, trustProxy);
          const now = Date.now();
          if (typeof input.name === 'string' && !teams.exists(input.name) && !newTeams.allowed(ip, now)) throw new RequestError(429, 'Too many new teams. Try again in a minute.');
          const joined = teams.join(input.name, { join: input.join === true });
          if (joined.taken) return json(res, 409, { error: `A team called ${joined.taken} is already playing. Join it, or pick another name.`, taken: joined.taken });
          if (joined.created) newTeams.add(ip, now);
          setCookie(req, res, 'override_team', joined.team.id);
          return json(res, 200, { team: { name: joined.team.name }, created: joined.created });
        }
        if (url.pathname === '/api/leaderboard' && req.method === 'GET') {
          const board = leaderboard ? leaderboard.standings({ includeHidden: false, you: team?.id ?? null }) : { rankBy: 'time', teams: [] };
          return json(res, 200, { rankBy: board.rankBy, startedAt: board.startedAt ?? 0, round: board.round ?? null, cases: board.cases ?? [], teams: board.teams.map(r => ({ rank: r.rank, name: r.name, points: r.points, played: r.played, timeMs: r.timeMs, coins: r.coins, you: r.you, cells: r.cells ?? [] })) });
        }
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
          const view = await investigations.mutate(sessionId, name, input, { team: team ? { id: team.id, name: team.name } : null });
          if (team) { if (view.session.id !== team.sessionId) teams.attach(team.id, view.session.id); }
          else if (view.session.id !== sessionId) setCookie(req, res, 'override_session', view.session.id);
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

const sleep = ms => new Promise(resolve => { setTimeout(resolve, ms).unref(); });

// OVERRIDE_MAKER_TOKENS: comma list of name:secret pairs; each maker can edit content and nothing else.
export function makerTokens(env) {
  const raw = String(env.OVERRIDE_MAKER_TOKENS ?? '').trim();
  if (!raw) return [];
  const out = [];
  for (const item of raw.split(',').map(x => x.trim()).filter(Boolean)) {
    const at = item.indexOf(':');
    const name = at < 0 ? item : item.slice(0, at);
    const secret = at < 0 ? '' : item.slice(at + 1);
    if (!/^[a-z0-9_-]{1,32}$/.test(name)) throw new Error('OVERRIDE_MAKER_TOKENS: maker names are 1 to 32 characters of a-z, 0-9, _ or -.');
    if (name === 'admin') throw new Error('OVERRIDE_MAKER_TOKENS: the name admin is reserved for the operator token.');
    if (!secret) throw new Error(`OVERRIDE_MAKER_TOKENS: maker ${name} has no secret.`);
    if (out.some(m => m.name === name)) throw new Error(`OVERRIDE_MAKER_TOKENS: maker ${name} is listed twice.`);
    if (secret === env.OVERRIDE_ADMIN_TOKEN || out.some(m => m.token === secret)) throw new Error(`OVERRIDE_MAKER_TOKENS: the secret for ${name} is not unique.`);
    out.push({ name, token: secret });
  }
  return out;
}

// OVERRIDE_ADMIN_HOSTS: extra Host names the admin listener accepts, for a tunnel.
export function adminHosts(env) {
  return String(env.OVERRIDE_ADMIN_HOSTS ?? '').split(',').map(h => h.trim().toLowerCase()).filter(Boolean);
}

// The admin page puts this in an href: only an http(s) origin and path survive, never javascript: or credentials.
export function boardUrlOf(base, port) {
  const raw = String(base ?? '').trim();
  if (raw) {
    let u;
    try { u = new URL(raw); } catch { throw new Error('OVERRIDE_PUBLIC_URL must be an http or https URL.'); }
    if ((u.protocol !== 'http:' && u.protocol !== 'https:') || u.username || u.password) throw new Error('OVERRIDE_PUBLIC_URL must be an http or https URL.');
    return `${u.origin}${u.pathname.replace(/\/+$/, '')}/?view=board`;
  }
  return `http://127.0.0.1:${port ?? 3001}/?view=board`;
}

export async function startServer(env = process.env, { publicDir = resolve(root, 'dist') } = {}) {
  const config = modelConfig(env);
  config.economy = economyRules(env);
  const envName = env.OVERRIDE_ENV || 'live';
  const dataDir = resolve(env.OVERRIDE_DATA_DIR || resolve(root, 'data'), envName);
  const paths = dataPaths(dataDir);
  const registry = new Registry();
  const metrics = createGameMetrics(registry);
  setWriteObserver(write => observeWrite(metrics, write));
  // The monitor exists only with an admin token; closures are late-bound and never let it break a game.
  let monitor = null;
  const feed = (method, arg) => { try { monitor?.[method](arg); } catch { /* monitor must not affect games */ } };
  const board = createLeaderboard(cases);
  // The last 20 system records, seeded once from disk and kept current by onSystem.
  const systemRing = readJsonl(paths.system).slice(-20);
  const onSystem = record => {
    appendJsonl(paths.system, record, 'system');
    systemRing.push(record);
    if (systemRing.length > 20) systemRing.shift();
    feed('observeSystem', record);
    if (record?.type === 'round_started') { try { board.reset(Number(record.startedAt) || 0, record.label); } catch { /* the board must not break a round */ } }
  };
  // Traces are admin-only. Probes and anything without a valid session go to one shared file.
  const onTrace = record => appendJsonl(join(paths.traces, !record.probe && sessionIdPattern.test(record.sessionId || '') ? `${record.sessionId}.jsonl` : 'probes.jsonl'), record, 'trace');
  const router = config.mode === 'live' ? new LlmRouter({
    endpoints: config.endpoints, maxInFlight: config.maxInFlight, deadlineMs: config.timeoutMs, maxCompletionTokens: config.maxCompletionTokens,
    failover: config.failover, restore: lastRecord(paths.system, r => r.type === 'llm_active'), onSystem, onTrace, onEvent: e => { observeLlmEvent(metrics, e); feed('observeLlm', e); },
  }) : null;
  const makers = makerTokens(env);
  const content = createContentStore({ cases, dataDir: paths.root });
  const investigations = new Investigations({
    dataDir, config, router, content, dev: devTools(env), meta: { env: envName, ...appVersion(env), endpointsHash: config.endpointsHash },
    onEvent: e => { observeGameEvent(metrics, e); feed('observeGame', e); try { board.observe(e); } catch { /* the board must not affect games */ } },
  });
  bindCollectors(registry, { router, investigations, dataDir });

  const round = loadRound(paths.system);
  const events = loadEvents(paths.sessions, round.startedAt);
  board.restore(readJsonl(paths.system));
  board.reset(round.startedAt, round.label);
  for (const e of events) board.observe(e);
  const teams = createTeams({ file: join(paths.root, 'teams.jsonl') });

  let sampler = null;
  let tickTimer = null;
  const host = env.HOST || '127.0.0.1';
  let server = null;
  let admin = null;
  // Release everything opened so far, so a failed start never leaves a listener or timer holding the process.
  const abort = error => { clearInterval(tickTimer); sampler?.close(); admin?.close(); server?.close(); server?.closeAllConnections(); throw error; };
  try {
  if (env.OVERRIDE_ADMIN_TOKEN) {
    sampler = createTrafficSampler({ registry, dataDir: paths.root, now: Date.now });
    let cached = null;
    let cachedAt = 0;
    const extras = () => {
      const at = Date.now();
      if (!cached || at - cachedAt >= 1000 || at < cachedAt) {
        cached = { router: router?.snapshot() ?? null, sessions: investigations.stats(), system: [...systemRing], leaderboard: board.standings({ includeHidden: true, you: null }) };
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
    monitor.load(events, round);
    tickTimer = setInterval(() => { try { monitor.tick(); } catch { /* ignore */ } }, 5000);
    tickTimer.unref();
  }

  let secret = env.OVERRIDE_SECRET;
  if (!secret) {
    secret = randomBytes(32).toString('hex');
    console.warn('OVERRIDE_SECRET is not set: sign-ins will not survive a restart.');
  }
  const trustProxy = ['1', 'true'].includes(String(env.OVERRIDE_TRUST_PROXY).toLowerCase());
  server = createApp({ investigations, accessCode: env.OVERRIDE_ACCESS_CODE || '', secret, trustProxy, staticFiles: loadStatic(publicDir), metrics, onHeartbeat: (tab, sid) => monitor?.heartbeat(tab, sid), teams, leaderboard: board });
  // Headers and bodies arrive fast; answers take up to 60 s. Keep-alive outlives a proxy's idle timeout.
  server.headersTimeout = 20_000;
  server.requestTimeout = 40_000;
  server.keepAliveTimeout = 75_000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(integerEnv(env.PORT, 3001, 'PORT'), host, 1024, resolve); });

  if (env.OVERRIDE_ADMIN_TOKEN) {
    {
      // The probe asks the first registered case's first character its quick question, with the identity cast.
      // It reads the current content at probe time, so a published edit reaches it.
      const probeMessages = () => {
        const probeCase = content.current(cases[0].id);
        const cast = identityCast(probeCase);
        const probeCharacter = probeCase.characters[0];
        const probeQuestion = castCharacters(probeCase, cast)[0].quickQuestion;
        return buildMessages(probeCase, { cast, interviews: Object.fromEntries(probeCase.characters.map(c => [c.id, []])) }, probeCharacter.id, probeQuestion);
      };
      admin = createAdmin({
        boardUrl: boardUrlOf(env.OVERRIDE_PUBLIC_URL, server.address()?.port),
        token: env.OVERRIDE_ADMIN_TOKEN, monitor, router, investigations, registry, dataDir,
        content, makers, allowedHosts: adminHosts(env), probeMessages,
        readSystem: () => [...systemRing], onSystem,
        leaderboard: {
          standings: () => board.standings({ includeHidden: true, you: null }),
          setRankBy: mode => { board.setRankBy(mode); onSystem({ type: 'leaderboard_settings', timestamp: Date.now(), rankBy: mode }); },
          setHidden: (teamId, hidden) => { board.setHidden(teamId, hidden); onSystem({ type: 'team_hidden', timestamp: Date.now(), teamId, hidden }); },
        },
      });
      await new Promise((resolve, reject) => { admin.once('error', reject); admin.listen(integerEnv(env.OVERRIDE_ADMIN_PORT, 3002, 'OVERRIDE_ADMIN_PORT'), '127.0.0.1', resolve); });
    }
  }
  } catch (error) { abort(error); }

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
