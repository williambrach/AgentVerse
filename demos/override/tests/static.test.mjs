import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync, brotliDecompressSync } from 'node:zlib';
import { loadStatic, serveStatic } from '../server/static.mjs';

const big = 'console.log("hello world");\n'.repeat(200);
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'static-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'index.html'), '<html>' + 'x'.repeat(2000) + '</html>');
  writeFileSync(join(dir, 'assets', 'index-CpDjbI4y.js'), big);
  writeFileSync(join(dir, 'assets', 'plain.css'), 'a{}');
  writeFileSync(join(dir, 'assets', 'font-CpDjbI4y.woff2'), Buffer.alloc(2048, 7));
  writeFileSync(join(dir, 'logo.png'), Buffer.from([1, 2, 3]));
  writeFileSync(join(dir, '.secret'), 'nope');
  mkdirSync(join(dir, '.hidden'));
  writeFileSync(join(dir, '.hidden', 'a.js'), 'x');
  return dir;
}
function call(files, method, url, headers = {}) {
  const out = { headers: {}, chunks: [] };
  const res = {
    writeHead(status, h) { out.status = status; Object.assign(out.headers, Object.fromEntries(Object.entries(h || {}).map(([k, v]) => [k.toLowerCase(), v]))); return res; },
    setHeader(k, v) { out.headers[k.toLowerCase()] = v; },
    end(body) { if (body) out.chunks.push(Buffer.from(body)); },
  };
  out.n = serveStatic(files, { method, url, headers }, res);
  out.body = Buffer.concat(out.chunks);
  return out;
}

test('loadStatic missing dir is an empty map', () => {
  assert.deepEqual(loadStatic('/missing-dir-xyz'), new Map());
});

test('brotli for hashed asset', () => {
  const files = loadStatic(fixture());
  const r = call(files, 'GET', '/assets/index-CpDjbI4y.js', { 'accept-encoding': 'gzip, br' });
  assert.equal(r.status, 200);
  assert.equal(r.headers['content-encoding'], 'br');
  assert.equal(r.headers['vary'], 'Accept-Encoding');
  assert.equal(r.headers['cache-control'], 'public, max-age=31536000, immutable');
  assert.match(r.headers['content-type'], /^text\/javascript/);
  assert.equal(r.n, r.body.length);
  assert.equal(brotliDecompressSync(r.body).toString(), big);
});

test('hashed font is typed, cached for good and not recompressed', () => {
  const r = call(loadStatic(fixture()), 'GET', '/assets/font-CpDjbI4y.woff2', { 'accept-encoding': 'gzip, br' });
  assert.equal(r.status, 200);
  assert.equal(r.headers['content-type'], 'font/woff2');
  assert.equal(r.headers['cache-control'], 'public, max-age=31536000, immutable');
  assert.equal(r.headers['content-encoding'], undefined);
  assert.equal(r.body.length, 2048);
});

test('gzip when only gzip accepted', () => {
  const r = call(loadStatic(fixture()), 'GET', '/assets/index-CpDjbI4y.js', { 'accept-encoding': 'gzip' });
  assert.equal(r.headers['content-encoding'], 'gzip');
  assert.equal(gunzipSync(r.body).toString(), big);
});

test('identity_without_accept', () => {
  const r = call(loadStatic(fixture()), 'GET', '/assets/index-CpDjbI4y.js');
  assert.equal(r.headers['content-encoding'], undefined);
  assert.equal(r.body.toString(), big);
  assert.equal(r.headers['vary'], 'Accept-Encoding');
});

test('root serves index.html with no-cache; other assets 1h', () => {
  const files = loadStatic(fixture());
  const r = call(files, 'GET', '/?x=1');
  assert.equal(r.status, 200);
  assert.equal(r.headers['cache-control'], 'no-cache');
  assert.match(r.headers['content-type'], /^text\/html/);
  assert.equal(call(files, 'GET', '/assets/plain.css').headers['cache-control'], 'public, max-age=3600');
  const png = call(files, 'GET', '/logo.png', { 'accept-encoding': 'br' });
  assert.equal(png.headers['content-encoding'], undefined);
  assert.equal(png.headers['content-type'], 'image/png');
});

test('not found returns -1 and writes nothing', () => {
  const files = loadStatic(fixture());
  const r = call(files, 'GET', '/nope');
  assert.equal(r.n, -1);
  assert.equal(r.status, undefined);
});

test('traversal_misses', () => {
  const files = loadStatic(fixture());
  for (const u of ['/../package.json', '/%2e%2e/package.json', '/assets/../../package.json', '/%zz']) {
    const r = call(files, 'GET', u);
    assert.equal(r.n, -1, u);
    assert.equal(r.status, undefined);
  }
});

test('head_no_body', () => {
  const r = call(loadStatic(fixture()), 'HEAD', '/assets/index-CpDjbI4y.js', { 'accept-encoding': 'br' });
  assert.equal(r.status, 200);
  assert.equal(r.n, 0);
  assert.equal(r.body.length, 0);
  assert.ok(Number(r.headers['content-length']) > 0);
});

test('dotfiles_skipped', () => {
  const files = loadStatic(fixture());
  assert.equal(call(files, 'GET', '/.secret').n, -1);
  assert.equal(call(files, 'GET', '/.hidden/a.js').n, -1);
});

test('non GET/HEAD misses', () => {
  assert.equal(call(loadStatic(fixture()), 'POST', '/').n, -1);
});

test('accept-encoding honours q=0 and wildcard', () => {
  const files = loadStatic(fixture());
  const url = '/assets/index-CpDjbI4y.js';
  assert.equal(call(files, 'GET', url, { 'accept-encoding': 'br;q=0, gzip' }).headers['content-encoding'], 'gzip');
  assert.equal(call(files, 'GET', url, { 'accept-encoding': 'br;q=0, gzip;q=0' }).headers['content-encoding'], undefined);
  assert.equal(call(files, 'GET', url, { 'accept-encoding': '*' }).headers['content-encoding'], 'br');
  assert.equal(call(files, 'GET', url, { 'accept-encoding': 'identity' }).headers['content-encoding'], undefined);
});
