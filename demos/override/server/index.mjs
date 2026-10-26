import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Investigations, RequestError } from './session.mjs';
import { modelConfig } from './interviews.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mimeTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

export function createApp({ investigations, accessCode = '', publicDir = resolve(root, 'dist') }) {
  const tokens = new Map();
  const attempts = new Map();
  const cookie = (req, name) => new RegExp(`(?:^|; )${name}=([^;]+)`).exec(req.headers.cookie || '')?.[1];
  const setCookie = (req, res, name, value) => {
    const secure = req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https';
    res.setHeader('Set-Cookie', `${name}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secure ? '; Secure' : ''}`);
  };
  const validToken = req => {
    if (!accessCode) return true;
    const token = cookie(req, 'override_access');
    return token && tokens.get(token) > Date.now();
  };
  const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };

  return createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) {
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
          // Only wrong codes count. Behind a proxy or a shared network, every
          // player arrives from one address, and correct sign-ins must not lock them out.
          const ip = req.socket.remoteAddress;
          const now = Date.now();
          for (const [key, value] of attempts) if (value.until < now) attempts.delete(key);
          const failures = attempts.get(ip) || { count: 0, until: now + 60_000 };
          if (failures.count >= 30) throw new RequestError(429, 'Too many attempts. Try again in one minute.');
          const supplied = Buffer.from(typeof input.code === 'string' ? input.code : '');
          const expected = Buffer.from(accessCode);
          if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
            failures.count += 1;
            attempts.set(ip, failures);
            throw new RequestError(401, 'That access code is not correct.');
          }
          for (const [token, expiry] of tokens) if (expiry < now) tokens.delete(token);
          const token = randomBytes(32).toString('hex');
          tokens.set(token, now + 12 * 60 * 60_000);
          setCookie(req, res, 'override_access', token);
          return json(res, 200, { authorized: true });
        }
        if (!validToken(req)) throw new RequestError(401, 'Enter the demo access code to continue.');
        // Each browser owns one investigation through its session cookie.
        const sessionId = cookie(req, 'override_session');
        if (url.pathname === '/api/state' && req.method === 'GET') return json(res, 200, investigations.view(sessionId));
        if (url.pathname === '/api/events' && req.method === 'GET') {
          const body = investigations.export(sessionId);
          res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store', 'Content-Disposition': `attachment; filename="override-${sessionId}.jsonl"` });
          return res.end(body);
        }
        if (req.method === 'POST') {
          const action = url.pathname.slice('/api/'.length);
          if (!['start', 'reset', 'reveal', 'evidence', 'visit', 'interview', 'verdict'].includes(action)) throw new RequestError(404, 'Unknown endpoint.');
          const view = await investigations.mutate(sessionId, action, input);
          if (view.session.id !== sessionId) setCookie(req, res, 'override_session', view.session.id);
          return json(res, 200, view);
        }
        throw new RequestError(404, 'Unknown endpoint.');
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new RequestError(405, 'Method not allowed.');
      const path = resolve(publicDir, `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`);
      if (!path.startsWith(`${resolve(publicDir)}${sep}`)) throw new RequestError(404, 'Not found.');
      try {
        if (!(await stat(path)).isFile()) throw new Error('not a file');
        const body = await readFile(path);
        res.writeHead(200, { 'Content-Type': mimeTypes[extname(path)] || 'application/octet-stream', 'Cache-Control': extname(path) === '.html' ? 'no-cache' : 'public, max-age=3600' });
        res.end(req.method === 'HEAD' ? undefined : body);
      } catch { throw new RequestError(404, 'File not found. Run npm run build before npm start.'); }
    } catch (error) {
      const status = error instanceof RequestError ? error.status : 500;
      if (status === 500) console.error('Request failed:', error.code || error.name);
      json(res, status, { error: status === 500 ? 'The server could not save this action. Check storage permissions and try again.' : error.message });
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = modelConfig();
  const investigations = new Investigations({ dataDir: process.env.OVERRIDE_DATA_DIR || resolve(root, 'data'), config });
  const port = Number(process.env.PORT || 3001);
  const host = process.env.HOST || '127.0.0.1';
  const server = createApp({ investigations, accessCode: process.env.OVERRIDE_ACCESS_CODE || '' });
  server.requestTimeout = 40_000;
  server.listen(port, host, () => console.log(`The Banana Mystery: http://${host}:${port} · ${config.mode} interviews${config.model ? ` (${config.model})` : ''}`));
}
