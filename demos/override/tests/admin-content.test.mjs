import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAdmin } from '../server/admin.mjs';
import { createContentStore } from '../server/content.mjs';
import { defineCase, identityCast, castCharacters, publicView } from '../server/cases.mjs';
import { buildMessages } from '../server/interviews.mjs';
import { InterviewProviderError } from '../server/errors.mjs';
import { partCase, agentWorlds } from './fixtures/minimal-case.mjs';

const T = 'adm';
const worlds = agentWorlds(3);

async function start({ router = null, store = true } = {}) {
  const kase = defineCase(partCase, { worlds });
  const content = store ? createContentStore({ cases: [kase], dataDir: mkdtempSync(join(tmpdir(), 'cont-')), worlds }) : null;
  const system = [];
  const srv = createAdmin({
    token: T, makers: [{ name: 'alice', token: 'mk' }], content, router,
    investigations: { stats: () => ({}) }, registry: { render: () => '' }, dataDir: '.', onSystem: (e) => system.push(e),
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const call = async (method, path, body, token = 'mk') => {
    const r = await fetch(base + path, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
    return { status: r.status, json: await r.json() };
  };
  return { srv, call, system, content, kase, close: () => { srv.close(); srv.closeAllConnections(); } };
}
const ID = 'mini-parts';

test('list_and_detail_shapes', async () => {
  const a = await start();
  const l = await a.call('GET', '/admin/content');
  assert.equal(l.json.cases[0].id, ID);
  const d = await a.call('GET', `/admin/content/${ID}`);
  assert.equal(d.status, 200);
  assert.equal(d.json.mode, 'rehearsal');
  assert.equal(d.json.rev, 0);
  assert.ok(d.json.structure.characters.length === 3);
  assert.equal(d.json.authored['copy.intro.lead'], a.kase.copy.intro.lead);
  assert.ok(Array.isArray(d.json.current['prompt.use']));
  assert.deepEqual(d.json.history, []);
  a.close();
});

test('publish_records_fields_not_text', async () => {
  const a = await start();
  const r = await a.call('PUT', `/admin/content/${ID}`, { edits: { 'copy.intro.lead': 'New lead' }, baseRev: 0 });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.fields, ['copy.intro.lead']);
  const rec = a.system.find((e) => e.action === 'content_published');
  assert.equal(rec.by, 'alice');
  assert.deepEqual(rec.fields, ['copy.intro.lead']);
  assert.equal(JSON.stringify(a.system).includes('New lead'), false);
  assert.equal('edits' in rec, false);
  // an unchanged publish logs nothing
  const same = await a.call('PUT', `/admin/content/${ID}`, { edits: { 'copy.intro.lead': 'New lead' }, baseRev: 1 });
  assert.equal(same.status, 200);
  assert.equal(a.system.filter((e) => e.action === 'content_published').length, 1);
  const rv = await a.call('POST', `/admin/content/${ID}/revert`, { rev: 0 });
  assert.equal(rv.status, 200);
  assert.deepEqual(a.system.at(-1), { ...a.system.at(-1), action: 'content_reverted', by: 'alice', caseId: ID, revertOf: 0 });
  a.close();
});

test('publish_stale_409', async () => {
  const a = await start();
  const body = { edits: { 'copy.intro.lead': 'X lead' }, baseRev: 0 };
  assert.equal((await a.call('PUT', `/admin/content/${ID}`, body)).status, 200);
  const r = await a.call('PUT', `/admin/content/${ID}`, body);
  assert.equal(r.status, 409);
  assert.equal(r.json.rev, 1);
  assert.equal(r.json.by, 'alice');
  assert.ok(r.json.error);
  a.close();
});

test('bad_path_400_with_path', async () => {
  const a = await start();
  const r = await a.call('PUT', `/admin/content/${ID}`, { edits: { 'parts.boss.role': 'honest' }, baseRev: 0 });
  assert.equal(r.status, 400);
  assert.equal(r.json.path, 'parts.boss.role');
  const p = await a.call('POST', `/admin/content/${ID}/preview`, { edits: { 'nope': 'x' }, characterId: 'momo' });
  assert.deepEqual([p.status, p.json.path], [400, 'nope']);
  assert.equal((await a.call('PUT', `/admin/content/${ID}`, { edits: [], baseRev: 0 })).json.error, 'edits must be an object.');
  assert.equal((await a.call('PUT', `/admin/content/${ID}`, { edits: {}, baseRev: -1 })).status, 400);
  assert.equal((await a.call('POST', `/admin/content/${ID}/preview`, { edits: {}, characterId: 'zzz' })).status, 400);
  a.close();
});

test('preview_equals_buildMessages', async () => {
  const a = await start();
  const history = [{ question: 'q1', answer: 'a1' }, { question: 'q2', answer: 'a2' }];
  const edits = { 'prompt.setting': 'a quite different monkey' };
  const r = await a.call('POST', `/admin/content/${ID}/preview`, { edits, characterId: 'pip', question: 'Why?', history });
  assert.equal(r.status, 200);
  const draft = a.content.preview(ID, edits);
  const cast = identityCast(draft);
  assert.deepEqual(r.json.messages, buildMessages(draft, { cast, interviews: { pip: history } }, 'pip', 'Why?'));
  assert.deepEqual(r.json.characters, castCharacters(draft, cast));
  assert.deepEqual(r.json.copy, publicView(draft, cast).copy);
  assert.equal(r.json.contentHash, draft.contentHash);
  const q = await a.call('POST', `/admin/content/${ID}/preview`, { edits: {}, characterId: 'momo' });
  assert.ok(q.json.messages.at(-1).content.includes(castCharacters(a.kase, identityCast(a.kase))[0].quickQuestion));
  a.close();
});

test('try_returns_answer_reasoning_provenance', async () => {
  const calls = [];
  const router = { complete: async (o) => { calls.push(o); return { content: 'Hi', reasoning: 'r', provenance: { endpoint: 'a' } }; } };
  const a = await start({ router });
  const r = await a.call('POST', `/admin/content/${ID}/try`, { edits: {}, characterId: 'momo', question: 'Hello?' });
  assert.deepEqual(r.json, { answer: 'Hi', reasoning: 'r', provenance: { endpoint: 'a' } });
  assert.equal(calls[0].tag, 'maker_try');
  assert.equal(calls[0].sessionId, null);
  assert.deepEqual(a.system.at(-1), { ...a.system.at(-1), action: 'content_try', by: 'alice', characterId: 'momo', ok: true });
  assert.equal((await a.call('GET', `/admin/content/${ID}`)).json.mode, 'live');
  a.close();
});

test('try_409_without_router', async () => {
  const a = await start();
  const r = await a.call('POST', `/admin/content/${ID}/try`, { edits: {}, characterId: 'momo', question: 'Hello?' });
  assert.deepEqual([r.status, r.json.error], [409, 'Live LLM mode is off.']);
  a.close();
});

test('try_502_on_provider_error', async () => {
  const router = { complete: async () => { throw new InterviewProviderError('provider_unavailable', 'Provider down.'); } };
  const a = await start({ router });
  const r = await a.call('POST', `/admin/content/${ID}/try`, { edits: {}, characterId: 'momo', question: 'Hello?' });
  assert.deepEqual([r.status, r.json.error], [502, 'Provider down.']);
  assert.equal(a.system.at(-1).ok, false);
  a.close();
});

test('content_body_limit', async () => {
  const a = await start();
  const pad = (n) => ({ edits: {}, baseRev: 0, pad: 'x'.repeat(n) });
  const over = JSON.stringify(pad(512 * 1024)); // already past the limit with the wrapper
  assert.equal((await a.call('PUT', `/admin/content/${ID}`, over)).status, 413);
  const base = JSON.stringify(pad(0)).length;
  assert.equal((await a.call('PUT', `/admin/content/${ID}`, JSON.stringify(pad(512 * 1024 - base)))).status, 200);
  assert.equal((await a.call('PUT', `/admin/content/${ID}`, JSON.stringify(pad(512 * 1024 - base + 1)))).status, 413);
  const small = JSON.stringify({ pad: 'x'.repeat(16 * 1024 + 1) });
  assert.equal((await a.call('POST', '/admin/sessions/pause', small, T)).status, 413);
  a.close();
});

test('u2028_in_edits_roundtrips', async () => {
  const a = await start();
  const lead = 'one two three ñ 猿';
  const r = await a.call('PUT', `/admin/content/${ID}`, { edits: { 'copy.intro.lead': lead }, baseRev: 0 });
  assert.equal(r.status, 200);
  const d = await a.call('GET', `/admin/content/${ID}`);
  assert.equal(d.json.current['copy.intro.lead'], lead);
  a.close();
});

test('methods_404_405_409', async () => {
  const a = await start();
  assert.equal((await a.call('DELETE', `/admin/content/${ID}`)).status, 405);
  assert.equal((await a.call('POST', '/admin/content', {})).status, 405);
  assert.equal((await a.call('GET', `/admin/content/${ID}/preview`)).status, 405);
  assert.equal((await a.call('PUT', `/admin/content/${ID}/revert`, {})).status, 405);
  const u = await a.call('GET', '/admin/content/no-such-case');
  assert.deepEqual([u.status, u.json.error], [404, 'Unknown case.']);
  assert.equal((await a.call('POST', `/admin/content/${ID}/revert`, { rev: 9 })).status, 404);
  assert.equal((await a.call('GET', '/admin/content', undefined, 'bad')).status, 401);
  a.close();
  const off = await start({ store: false });
  assert.deepEqual([(await off.call('GET', '/admin/content')).status, (await off.call('GET', '/admin/content')).json.error], [409, 'Content editing is off.']);
  off.close();
});

test('draft_inputs_validated', async () => {
  const a = await start();
  const p = (b) => a.call('POST', `/admin/content/${ID}/preview`, b);
  assert.equal((await p('[]')).status, 400);
  assert.equal((await p('null')).status, 400);
  assert.equal((await p({ edits: {}, characterId: 'nobody' })).status, 400);
  assert.equal((await p({ edits: {}, characterId: 'pip', question: 'x'.repeat(2001) })).status, 400);
  const h = (n) => Array.from({ length: n }, () => ({ question: 'q', answer: 'a' }));
  assert.equal((await p({ edits: {}, characterId: 'pip', history: h(21) })).status, 400);
  assert.equal((await p({ edits: {}, characterId: 'pip', history: h(20), question: 'x'.repeat(2000) })).status, 200);
  assert.equal((await a.call('PUT', `/admin/content/${ID}`, 'null')).status, 400);
  a.close();
});
