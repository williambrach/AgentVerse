import { readFileSync } from 'node:fs';
import { expect } from '@playwright/test';

// Part id -> role id for the banana case (four parts).
export const PART_ROLE = { planner: 'villain', carrier: 'fooled', lookout: 'collaborator', minder: 'honest' };
export const PART_LABEL = { planner: 'The planner', carrier: 'The carrier', lookout: 'The lookout', minder: 'The bell-minder' };

// The cast is only in the server-side log: session_started.cast, written under the `live` env folder.
// The data folders are per run (playwright.config.mjs sets OVERRIDE_E2E_DATA); 'test-results/<name>' maps onto <run>/<name>.
export function castOf(sessionId, dataDir = 'test-results/sessions') {
  if (process.env.OVERRIDE_E2E_DATA) dataDir = `${process.env.OVERRIDE_E2E_DATA}/${dataDir.replace(/^test-results\//, '')}`;
  const lines = readFileSync(`${dataDir}/live/sessions/${sessionId}.jsonl`, 'utf8').trim().split('\n').map(l => JSON.parse(l));
  return lines.find(e => e.type === 'session_started').cast;
}
// The grove's parts carry the roles above.
export const truthOf = cast => Object.fromEntries(Object.entries(cast).map(([id, part]) => [id, PART_ROLE[part]]));
export const sessionIdOf = async page => (await (await page.request.get('/api/state')).json()).session.id;
// Confidence is a radio group (40, 70, 95); the input is visually hidden, so click its label.
export const pickConfidence = (page, value) => page.locator(`label.conf-chip:has(input[name="confidence"][value="${value}"])`).click();
export const pickRole = (page, id, role) => page.locator(`label.role-chip:has(input[name="role-${id}"][value="${role}"])`).click();

// Quick questions per part (content doc), and the scripted rehearsal replies, so a test can assert the exact answer.
export const QUICK = {
  planner: 'Did the keeper really say you could take the bananas?', carrier: 'Why did you take the bananas before the bell?',
  lookout: 'Who were you watching for?', minder: 'Did anyone ask you to join the picnic?',
};
export const NAMES = { momo: 'Momo', pip: 'Pip', nori: 'Nori', kiki: 'Kiki' };

const BANANA = {
  planner: [
    [/watch|path|lookout|whistle/, 'I asked {lookout} to keep watch for the keeper. I promised a banana.'],
    [/keeper|bell|rule|permission|lie|said|why|know|take/, 'No. The keeper told me to wait. I was hungry, so I made up the permission and told {carrier} to take the bananas.'],
    [/./s, 'I planned our picnic and asked {carrier} to bring the bananas. I really wanted to start eating. Ask me what the keeper actually said.'],
  ],
  carrier: [
    [/\b(lie|lied|lying|fooled|tricked)\b|never (said|gave|rang)|said no|didn.t say/, 'The keeper never said yes? Then {planner} fooled me. I believed we had permission. I should have checked before carrying the bananas.'],
    [/./s, '{planner} told me the keeper said we could take them. I believed {planner}, so I carried the bananas. I didn’t check with the keeper myself.'],
  ],
  lookout: [
    [/who|watch|keeper|rule|know|why|wait/, 'For the keeper. {planner} told me the keeper said to wait, and asked me to whistle if the keeper came. I knew it was wrong. I wanted a banana.'],
    [/./s, 'I sat by the path and watched. Nobody came by! Ask me who I was watching for.'],
  ],
  minder: [
    [/join|ask|picnic|banana|eat/, '{carrier} ran past shouting “{planner} says the keeper said yes!” I didn’t believe it. The keeper told me to wait, so I stayed by the bell.'],
    [/watch|path|lookout|see|saw/, 'I saw {lookout} by the path, looking up and down it like they were watching for someone.'],
    [/./s, 'I stayed by the bell like the keeper said. It never rang. I didn’t eat any bananas.'],
  ],
};

// The reply the scripted rehearsal gives `characterId` for `question`, with {partId} resolved to names through the cast.
export function rehearsalReply(cast, characterId, question) {
  const part = cast[characterId];
  const table = BANANA[part];
  const q = question.toLowerCase();
  const template = table.find(([re]) => re.test(q))[1];
  const holder = Object.fromEntries(Object.entries(cast).map(([id, p]) => [p, NAMES[id]]));
  return template.replace(/\{(\w+)\}/g, (_, p) => holder[p]);
}
export const quickQuestionFor = (cast, characterId) => QUICK[cast[characterId]];

/** Quick question on every cast member in rail order, waiting for each answer. Returns the ids asked. */
export async function interviewAll(page) {
  const buttons = page.locator('#room-nav [data-go]');
  const ids = (await buttons.evaluateAll(list => list.map(el => el.dataset.go))).filter(id => id !== 'report');
  for (const id of ids) {
    await page.locator(`#room-nav [data-go="${id}"]`).click();
    await page.locator('[data-quick-question]').click();
    await expect(page.locator('.speech.character.latest')).toBeVisible();
    await expect(page.locator('#interview-form .ask-button')).toBeEnabled();
  }
  return ids;
}

/** Open the verdict, pick a role for each id in `picks` ({ id: role }) and lock in. */
export async function lockIn(page, picks) {
  // Already on the lineup (a test may have checked its heading): the verdict button is covered then.
  if (await page.locator('#app').getAttribute('data-view') !== 'lineup') await page.locator('.verdict-button').click();
  await expect(page.locator('fieldset.role-row')).toHaveCount(Object.keys(picks).length);
  for (const [id, role] of Object.entries(picks)) await pickRole(page, id, role);
  await page.locator('#lock-in').click();
}
