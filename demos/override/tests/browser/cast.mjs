import { readFileSync } from 'node:fs';
import { expect } from '@playwright/test';

// Part id -> role id for the banana case (four parts).
export const PART_ROLE = { planner: 'villain', carrier: 'fooled', lookout: 'collaborator', minder: 'honest' };
export const PART_LABEL = { planner: 'The planner', carrier: 'The carrier', lookout: 'The accomplice', minder: 'The witness' };

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
  planner: 'Did the keeper really ask you to move the basket?', carrier: 'Why did you move the basket?',
  lookout: 'Did you know the keeper’s instruction was fake?', minder: 'What did you see?',
};
export const NAMES = { momo: 'Momo', pip: 'Pip', nori: 'Nori', kiki: 'Kiki' };

// Independent expectations for the quick questions and the follow-up used by the investigation test.
const REPLIES = {
  planner: 'The keeper said to leave the basket on the shared table. I invented the instruction to move it behind our blanket.',
  carrier: '{planner} told me the keeper wanted the basket behind our blanket. I believed that was a new instruction, so I moved it.',
  lookout: 'I knew the instruction was fake. {planner} told me the plan, and I agreed to take the bananas for a share.',
  minder: 'I saw {carrier} move the closed basket behind the blanket. Then I saw {lookout} take the bananas from it.',
};
export function rehearsalReply(cast, characterId, question) {
  const part = cast[characterId];
  const template = part === 'minder' && /permission/.test(question.toLowerCase())
    ? 'I don’t know why {carrier} moved it or what they were told. I only know what I saw. You should ask them.'
    : REPLIES[part];
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
