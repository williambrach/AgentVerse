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
  'banana-mystery': { contentHash: 'd891b333116d', view: '9e6f4a0017cd', interview: 'b4f9f9956f07', thread: '835c9ba2c84e' },
  'tower-echo-bell': { contentHash: '6508e9784a90', view: 'ab9e04857871', interview: '6d4248453224', thread: 'abed47a153ef' },
  'friends-roundtable': { contentHash: 'abe99bc0d29a', view: '1b9a94ac1357', interview: 'b4a9a828e288', thread: '03d197f681b4' },
  'factory-escape': { contentHash: '660d1ebbc219', view: 'a8b347d0ca93', interview: '81b8d73d3192', thread: '6d49737e1e55' },
  'department-murder': { contentHash: 'a1c1119d0782', view: 'e1a59a6ddce1', interview: 'b75908cac04b', thread: '63c24a81d17d' },
  'renaissance-traveler': { contentHash: '522bc25859cb', view: '8ebf9aa827bf', interview: '16fca864fdaa', thread: '1faf5496261f' },
};

test('all six cases are pinned', () => {
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
