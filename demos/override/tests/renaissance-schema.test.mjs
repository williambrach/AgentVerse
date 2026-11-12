import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cases } from '../server/cases/index.mjs';
import { rolesOf, publicView, castCharacters, identityCast } from '../server/cases.mjs';
import { buildMessages, buildThreadMessages, modelConfig } from '../server/interviews.mjs';
import { Investigations } from '../server/session.mjs';

// Pins computed from the code at commit bbb28ce, before the renaissance level.
const BASE = {
  "banana-mystery": {
    "view": "fdfbf725a8d69352",
    "chars": "73ebc57d6d79cd93",
    "roles": "6ea8e1ad0448ab4b",
    "msgs": "8f71cef53a2560e4",
    "thread": "54afee9951ded86d",
    "contentHash": "8826bc512257"
  },
  "friends-roundtable": {
    "view": "ea0305de1cb08a7b",
    "chars": "a649ab932c68ee4f",
    "roles": "da52c5588cfffe9a",
    "msgs": "58042191891073e5",
    "thread": "771d486ccb15296f",
    "contentHash": "640561c63616"
  },
  "factory-escape": {
    "view": "e6f5b8e91c1310a3",
    "chars": "f92df788e9ae6d4c",
    "roles": "8205567f12253456",
    "msgs": "e3bd2695f2b55e70",
    "thread": "48e261ec2459b232",
    "contentHash": "3c549c8bb2f9"
  },
  "department-murder": {
    "view": "141114d8179a3ea6",
    "chars": "196ccddd8630cea0",
    "roles": "5c1d3fa48ec1ca9b",
    "msgs": "b257df91d7f0a624",
    "thread": "977a937992b0acfc",
    "contentHash": "a73b50757e8f"
  }
};

test('other_cases_byte_identical_to_base', () => {
  const h = x => createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex').slice(0, 16);
  for (const [id, want] of Object.entries(BASE)) {
    const k = cases.find(c => c.id === id);
    const cast = identityCast(k);
    const first = k.characters[0].id;
    const s = { cast, interviews: Object.fromEntries(k.characters.map(c => [c.id, []])), thread: [] };
    const got = {
      view: h(publicView(k, cast)), chars: h(castCharacters(k, cast)), roles: h(rolesOf(k)),
      msgs: h(buildMessages(k, s, first, 'Hello').map(m => m.content).join('\n')),
      thread: h(buildThreadMessages(k, s, first).map(m => m.content).join('\n')), contentHash: k.contentHash,
    };
    assert.deepEqual(got, want, id);
  }
});

