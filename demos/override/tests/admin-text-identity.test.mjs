import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cases } from '../server/cases/index.mjs';
import { publicView, identityCast, castCharacters } from '../server/cases.mjs';
import { buildMessages, buildThreadMessages } from '../server/interviews.mjs';
import { createContentStore } from '../server/content.mjs';

const sha12 = value => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 12);

// Byte identity with main: with no edits, prompts, publicView and the content hash are unchanged.
const PINS = {
  'banana-mystery': { contentHash: '8826bc512257', view: 'fdfbf725a8d6', interview: 'ec52730b9d9c', thread: '31c9a6381a76' },
  'friends-roundtable': { contentHash: '640561c63616', view: 'ea0305de1cb0', interview: '87b9a6b80d7c', thread: '205e4fc54de1' },
  'factory-escape': { contentHash: '3c549c8bb2f9', view: 'e6f5b8e91c13', interview: 'c879fd6e80e6', thread: '612f762dbdc3' },
  'department-murder': { contentHash: 'a73b50757e8f', view: '141114d8179a', interview: 'cd724c0169ea', thread: '6097f5e2149a' },
  // Castelvento v2.0.0 (talk mode dropped): re-pinned on purpose.
  'renaissance-traveler': { contentHash: 'b073ce3e7f96', view: '3e545220dd97', interview: '6d73e315d35c', thread: '2fe4c2378c00' },
};

test('all five cases are pinned', () => {
  assert.deepEqual(cases.map(c => c.id).sort(), Object.keys(PINS).sort());
});

for (const kase of cases) {
  test(`identity_pins ${kase.id}`, () => {
    const pin = PINS[kase.id];
    const cast = identityCast(kase);
    const first = kase.characters[0];
    const session = { cast, interviews: Object.fromEntries(kase.characters.map(c => [c.id, []])), thread: [] };
    const question = castCharacters(kase, cast)[0]?.quickQuestion ?? 'What happened?';
    assert.equal(kase.contentHash, pin.contentHash, 'contentHash');
    assert.equal(sha12(publicView(kase, cast)), pin.view, 'publicView');
    assert.equal(sha12(buildMessages(kase, session, first.id, question)), pin.interview, 'buildMessages');
    assert.equal(sha12(buildThreadMessages(kase, session, first.id)), pin.thread, 'buildThreadMessages');
  });
}

test('store_identity', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'text-id-data-'));
  const contentDir = mkdtempSync(join(tmpdir(), 'text-id-content-'));
  try {
    const store = createContentStore({ cases, dataDir, contentDir });
    for (const kase of cases) assert.equal(store.current(kase.id), store.base(kase.id), kase.id);
    assert.deepEqual(store.uiText(), {});
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(contentDir, { recursive: true, force: true });
  }
});
