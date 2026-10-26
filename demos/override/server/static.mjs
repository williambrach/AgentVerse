import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';

const mimeTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const compressible = new Set(['.html', '.js', '.css', '.svg']);
const hashed = /^\/assets\/.+-[A-Za-z0-9_-]{6,}\.(js|css)$/;

function walk(dir, prefix, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    if (entry.isDirectory()) walk(join(dir, entry.name), `${prefix}/${entry.name}`, out);
    else if (entry.isFile()) out.push([`${prefix}/${entry.name}`, join(dir, entry.name)]);
  }
}

// Compress once at load so requests only write bytes.
export function loadStatic(publicDir) {
  const files = new Map();
  const found = [];
  try { walk(publicDir, '', found); } catch { return files; }
  for (const [path, file] of found) {
    const ext = extname(path);
    const body = readFileSync(file);
    const entry = {
      type: mimeTypes[ext] || 'application/octet-stream',
      cache: ext === '.html' ? 'no-cache' : hashed.test(path) ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
      identity: body,
      vary: compressible.has(ext),
    };
    if (entry.vary && body.length > 1024) {
      entry.gzip = gzipSync(body, { level: 9 });
      entry.br = brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } });
    }
    files.set(path, entry);
  }
  return files;
}

// Parses Accept-Encoding with q-values: q=0 refuses a coding, '*' covers the unlisted ones.
export function acceptedEncodings(header) {
  const q = new Map();
  for (const part of String(header).toLowerCase().split(',')) {
    const [name, ...params] = part.trim().split(';');
    if (!name) continue;
    const m = params.map(p => p.trim()).find(p => p.startsWith('q='));
    const value = m ? Number(m.slice(2)) : 1;
    q.set(name.trim(), Number.isFinite(value) ? value : 0);
  }
  return coding => (q.has(coding) ? q.get(coding) : (q.get('*') ?? 0)) > 0;
}

// Returns -1 when the path is not a loaded file (nothing written), else body bytes written.
export function serveStatic(files, req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return -1;
  let path;
  try { path = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { return -1; }
  if (path === '/') path = '/index.html';
  const entry = files.get(path);
  if (!entry) return -1;
  const accept = String(req.headers?.['accept-encoding'] || '');
  const allowed = acceptedEncodings(accept);
  const encoding = entry.br && allowed('br') ? 'br' : entry.gzip && allowed('gzip') ? 'gzip' : null;
  const body = encoding === 'br' ? entry.br : encoding === 'gzip' ? entry.gzip : entry.identity;
  const headers = { 'Content-Type': entry.type, 'Cache-Control': entry.cache, 'Content-Length': body.length };
  if (entry.vary) headers.Vary = 'Accept-Encoding';
  if (encoding) headers['Content-Encoding'] = encoding;
  res.writeHead(200, headers);
  if (req.method === 'HEAD') { res.end(); return 0; }
  res.end(body);
  return body.length;
}
