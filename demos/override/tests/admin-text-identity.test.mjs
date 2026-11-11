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
  'banana-mystery': { contentHash: 'd891b333116d', view: '9e6f4a0017cd', interview: 'b4f9f9956f07', thread: '5a0eabb920bf' },
  'friends-roundtable': { contentHash: 'c097961cadff', view: '63c1d09788fb', interview: '7cc4d7ae777e', thread: 'fedf1bdc8af1' },
  'factory-escape': { contentHash: '2171e3404532', view: 'bd471bee0570', interview: '81b8d73d3192', thread: '0e8d0610e92b' },
  'department-murder': { contentHash: 'befbc6d328c9', view: 'a6feda05c2bb', interview: 'b75908cac04b', thread: '6fa820dbcc2e' },
  'renaissance-traveler': { contentHash: '6fb1496caf6b', view: 'b92f50daea09', interview: '16fca864fdaa', thread: '352155140bc1' },
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
