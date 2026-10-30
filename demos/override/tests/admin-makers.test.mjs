import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAdmin } from '../server/admin.mjs';

const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const SNAP = { active: 'a', pinned: false, inFlight: 0, queued: 0, maxInFlight: 200, endpoints: [] };

async function boot(over = {}) {
  const calls = [];
  const pageDir = mkdtempSync(join(tmpdir(), 'mk-page-'));
  writeFileSync(join(pageDir, 'index.html'), '<html></html>');
  writeFileSync(join(pageDir, 'maker.html'), '<html>maker</html>');
  writeFileSync(join(pageDir, 'x.js'), 'void 0;');
  const router = { snapshot: () => SNAP, async probe(name, msgs) { calls.push(['probe', name, msgs]); return { ok: true }; } };
  const srv = createAdmin({
    token: 'admin-t', makers: [{ name: 'ada', token: 'ada-t' }, { name: 'bob', token: 'bob-t' }],
    content: { list: () => [] }, pageDir, router, dataDir: pageDir,
    investigations: { stats: () => ({}) }, registry: { render: () => 'x 1\n' },
    monitor: { catalog: () => ({}), snapshot: () => ({}), recent: () => [], subscribe: () => () => {} },
    ...over,
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const req = (path, { method = 'GET', token, body } = {}) => fetch(base + path, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { req, calls, close: () => { srv.close(); srv.closeAllConnections(); } };
}

test('maker_scope', async () => {
  const a = await boot();
  const r = await a.req('/admin/content', { token: 'ada-t' });
  assert.ok(r.status !== 401 && r.status !== 403, `status ${r.status}`);
  for (const p of ['/admin/health', '/metrics', '/admin/stream']) {
    const m = await a.req(p, { token: 'bob-t' });
    assert.equal(m.status, 403, p);
    if (p === '/admin/health') assert.deepEqual(await m.json(), { error: 'Maker tokens can only edit content.' });
  }
  assert.equal((await a.req('/admin/health', { token: 'ada-t-x' })).status, 401);
  assert.equal((await a.req('/admin/content', { token: 'wrong' })).status, 401);
  assert.equal((await a.req('/admin/content')).status, 401);
  assert.equal((await a.req('/admin/health', { token: 'admin-t' })).status, 200);
  assert.equal((await a.req('/metrics', { token: 'admin-t' })).status, 200);
  assert.ok((await a.req('/admin/content', { token: 'admin-t' })).status !== 401);
  a.close();
});

test('csp_on_every_html_page', async () => {
  const a = await boot();
  assert.equal((await a.req('/admin')).headers.get('content-security-policy'), CSP);
  assert.equal((await a.req('/admin/maker.html')).headers.get('content-security-policy'), CSP);
  assert.equal((await a.req('/admin/x.js')).headers.get('content-security-policy'), null);
  a.close();
});

test('probe_thunk_called_per_probe', async () => {
  let n = 0;
  const a = await boot({ probeMessages: () => { n++; return [{ role: 'user', content: 'a' }, { role: 'user', content: `b${n}` }]; } });
  await a.req('/admin/llm/probe', { method: 'POST', token: 'admin-t', body: { endpoint: 'a' } });
  await a.req('/admin/llm/probe', { method: 'POST', token: 'admin-t', body: { endpoint: 'a' } });
  assert.equal(a.calls.length, 2);
  assert.equal(a.calls[0][2].length, 2);
  assert.equal(a.calls[0][2][1].content, 'b1');
  assert.equal(a.calls[1][2][1].content, 'b2');
  a.close();
});
