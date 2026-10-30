import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readJsonBody, safeEqual, integerEnv, sendJson } from '../server/http-util.mjs';

async function post(chunks, max = 16_384) {
  const server = createServer(async (req, res) => {
    try { sendJson(res, 200, await readJsonBody(req, max)); }
    catch (e) { sendJson(res, e.status ?? 500, { error: e.message }); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try {
    const { request } = await import('node:http');
    return await new Promise((resolve, reject) => {
      const req = request({ port: server.address().port, method: 'POST', headers: { 'content-type': 'application/json' } }, res => {
        const parts = [];
        res.on('data', c => parts.push(c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(Buffer.concat(parts).toString('utf8')) }));
      });
      req.on('error', reject);
      (async () => { for (const c of chunks) { req.write(c); await new Promise(r => setTimeout(r, 20)); } req.end(); })();
    });
  } finally { server.closeAllConnections(); server.close(); }
}

test('utf8_split_body: a 3-byte character split across writes parses', async () => {
  const bytes = Buffer.from('{"t":"€"}');
  const cut = bytes.indexOf(0xe2) + 1;
  const r = await post([bytes.subarray(0, cut), bytes.subarray(cut)]);
  assert.equal(r.status, 200);
  assert.equal(r.body.t, '€');
  assert.equal(r.headers['cache-control'], 'no-store');
  assert.match(r.headers['content-type'], /charset=utf-8/);
});

test('body_413: 16 385 bytes gives 413, 16 384 does not', async () => {
  const pad = n => Buffer.from(`{"a":"${'x'.repeat(n - 8)}"}`);
  assert.equal((await post([pad(16_385)])).status, 413);
  assert.equal((await post([pad(16_384)])).status, 200);
});

test('bad_json_400: invalid JSON and non-objects give 400, empty body is {}', async () => {
  for (const b of ['{nope', '[1]', 'null']) {
    const r = await post([Buffer.from(b)]);
    assert.equal(r.status, 400);
  }
  assert.deepEqual((await post([])).body, {});
});

test('safeEqual compares by value', () => {
  assert.equal(safeEqual('a', 'a'), true);
  assert.equal(safeEqual('a', 'ab'), false);
});

test('integerEnv', () => {
  assert.equal(integerEnv('', 7, 'X'), 7);
  assert.equal(integerEnv(undefined, 7, 'X'), 7);
  assert.equal(integerEnv('12', 7, 'X'), 12);
  assert.throws(() => integerEnv('x', 7, 'X'), { message: 'X must be an integer.' });
});
