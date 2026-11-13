import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import banana from '../server/cases/banana-mystery.mjs';
import { createContentStore } from '../server/content.mjs';
import { resolve, rolesOf } from '../server/cases.mjs';
import { Investigation } from '../server/session.mjs';
import { buildMessages, modelConfig } from '../server/interviews.mjs';
import { ROLES } from '../server/roles.mjs';

for (const tracked of [false, true]) {
  test(`banana v4 story and scoring, tracked content: ${tracked}`, async t => {
    const dir = mkdtempSync(join(tmpdir(), 'banana-story-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const store = createContentStore({ cases: [banana], dataDir: dir, contentDir: tracked
      ? fileURLToPath(new URL('../content', import.meta.url)) : join(dir, 'empty') });
    const kase = store.current(banana.id);
    assert.equal(store.info(banana.id).stale, false);
    assert.equal(store.info(banana.id).corrupt, false);
    assert.equal(kase.version, 'banana-authored-v4.0.0');
    assert.deepEqual(kase.parts, banana.parts, 'tracked content inherits the same story');
    if (tracked) assert.deepEqual(kase.characters.map(c => c.name), ['Tinky Winky', 'Dipsy', 'Laa-Laa', 'Po']);
    assert.equal(ROLES.find(r => r.id === 'fooled').hint, 'Believed something that wasn’t true.');
    assert.match(rolesOf(kase).find(r => r.id === 'fooled').hint, /unknowingly helped/);
    for (const shuffle of [ids => [...ids], ids => [...ids].reverse()]) {
      const inv = new Investigation({ dataDir: join(dir, tracked ? 'tracked' : 'authored'), config: modelConfig({}), kase, shuffle });
      const act = (action, input = {}) => inv.mutate(action, { sessionId: inv.session?.id, revision: inv.session?.revision, ...input });
      await act('start');
      const cast = inv.session.cast;
      const holder = part => kase.characters.find(c => cast[c.id] === part).id;
      const ask = async (part, question) => {
        const character = holder(part);
        const result = await act('interview', { character, question });
        return result.session.interviews[character].at(-1).answer;
      };
      assert.match(await ask('planner', 'Did the keeper ask you to move it?'), /invented the instruction/);
      assert.match(await ask('carrier', 'Why did you move it?'), /believed that was a new instruction/);
      assert.match(await ask('lookout', 'Did you know it was fake?'), /I knew the instruction was fake/);
      const witness = await ask('minder', 'What did you see?');
      assert.ok(witness.includes(kase.characters.find(c => c.id === holder('lookout')).name));
      assert.match(witness, /take the bananas/);
      const session = { cast, interviews: Object.fromEntries(kase.characters.map(c => [c.id, []])), thread: [] };
      const prompt = buildMessages(kase, session, holder('carrier'), 'Why?')[0].content;
      assert.match(prompt, /honestly believed this was a new instruction/);
      assert.doesNotMatch(prompt, /\{carrier\}|\{planner\}/);
      const roles = Object.fromEntries(kase.characters.map(c => [c.id, kase.parts.find(p => p.id === cast[c.id]).role]));
      const done = await act('verdict', { roles, confidence: 70 });
      assert.equal(done.session.verdict.score, 4);
      assert.match(resolve(kase, cast, kase.parts.find(p => p.id === 'carrier').finding.explanation), /did not know about the plan/);
    }
  });
}
