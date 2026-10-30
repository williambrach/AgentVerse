import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAdmin } from '../server/admin.mjs';

const TOKEN = 'secret-token-9f3a';
const ROUTER = { snapshot: () => ({ active: 'zeta', pinned: false, inFlight: 0, queued: 0, maxInFlight: 5, endpoints: [{ name: 'zeta', model: 'model-zeta-77', apiBaseHost: 'llm.zeta-host.example' }] }) };
const INV = { stats: () => ({ games: 0, waiting: 0, paused: false, byStage: {} }), setPaused() {} };
const dir = new URL('../server/admin/', import.meta.url);
const files = readdirSync(dir);

async function withServer(fn) {
  const server = createAdmin({ token: TOKEN, router: ROUTER, investigations: INV, registry: { render: () => '' }, dataDir: mkdtempSync(join(tmpdir(), 'admin-files-')) });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try { return await fn(`http://127.0.0.1:${server.address().port}`); } finally { await new Promise(r => server.close(r)); }
}

// The page itself is /admin; the module and style files live next to it.
const urlOf = (f) => (f === 'index.html' ? '/admin' : `/admin/${f}`);

test('page directory has the expected files', () => {
  for (const f of ['index.html', 'app.js', 'tiles.js', 'log.js', 'round.js', 'controls.js']) assert.ok(files.includes(f), f);
});

test('every served file is safe, static and secret-free', async () => {
  await withServer(async (base) => {
    let usesTextContent = false;
    for (const f of files) {
      const r1 = await fetch(base + urlOf(f));
      assert.equal(r1.status, 200, f);
      const a = Buffer.from(await r1.arrayBuffer());
      const b = Buffer.from(await (await fetch(base + urlOf(f))).arrayBuffer());
      assert.ok(a.equals(b), `${f} differs between requests`);
      const text = a.toString('utf8');
      assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/.test(text), `${f} uses a banned API`);
      for (const secret of [TOKEN, 'model-zeta-77', 'zeta-host']) assert.ok(!text.includes(secret), `${f} leaks ${secret}`);
      if (f.endsWith('.html')) {
        assert.ok(!/style\s*=/.test(text), 'inline style in html');
        assert.ok(!/<script(?![^>]*\bsrc=)/.test(text), 'inline script in html');
        for (const m of text.matchAll(/\b(?:src|href)\s*=\s*"([^"]*)"/g)) assert.ok(m[1].startsWith('/admin/') || m[1].startsWith('#'), `external ref ${m[1]}`);
      }
      if (f.endsWith('.css')) assert.ok(!/https?:|@import/.test(text), `${f} references a network origin`);
      if (f.endsWith('.js') && text.includes('textContent')) usesTextContent = true;
    }
    assert.ok(usesTextContent, 'no .js file uses textContent');
  });
});

test('the /admin CSP is strict', async () => {
  await withServer(async (base) => {
    const csp = (await fetch(`${base}/admin`)).headers.get('content-security-policy');
    assert.equal(csp, "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    assert.ok(!csp.includes('unsafe-inline'));
  });
});

const read = (f) => readFileSync(new URL(f, dir), 'utf8');

test('app.css is dark only on the deep token', () => {
  const css = read('app.css');
  assert.ok(!css.includes('prefers-color-scheme'));
  assert.match(css, /--bg:\s*#0B151B/i);
  assert.ok(!/font-family:[^;]*(Atkinson|googleapis)/.test(css));
});

test('index.html carries the watch banner, the big-screen link and the command-centre title', () => {
  const html = read('index.html');
  assert.match(html, /<section id="watch" hidden><\/section>/);
  assert.match(html, /<a id="board-link"[^>]*target="_blank"[^>]*rel="noreferrer"[^>]*hidden>big-screen ↗<\/a>/);
  assert.match(html, /<h1>command-centre<\/h1>/);
  assert.ok(!/<script[^>]*watch\.js/.test(html), 'watch.js loads through app.js');
});

test('healthy tile values are plain light text, problems keep colour', () => {
  const css = readFileSync(new URL('tiles.css', dir), 'utf8');
  assert.match(css, /\[data-level="ok"\] \.tile-v \{ color: #E8EEF0;/);
  assert.match(css, /\[data-level="warn"\] \.tile-v \{ color: var\(--gold\)/);
  assert.match(css, /\[data-level="bad"\] \.tile-v \{ color: var\(--bad\)/);
});
