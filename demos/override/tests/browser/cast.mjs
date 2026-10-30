import { readFileSync } from 'node:fs';

// Part id -> role id, for the live cases. Banana has four parts, the tower three (all fooled).
export const PART_ROLE = { planner: 'villain', carrier: 'fooled', lookout: 'collaborator', minder: 'honest' };
export const PART_LABEL = { planner: 'The planner', carrier: 'The carrier', lookout: 'The lookout', minder: 'The bell-minder', fetcher: 'The fetcher', watcher: 'The bell-watcher' };

// The cast is only in the server-side log: session_started.cast, written under the `live` env folder.
export function castOf(sessionId, dataDir = 'test-results/sessions') {
  const lines = readFileSync(`${dataDir}/live/sessions/${sessionId}.jsonl`, 'utf8').trim().split('\n').map(l => JSON.parse(l));
  return lines.find(e => e.type === 'session_started').cast;
}
// The tower's parts (planner, fetcher, watcher) are all fooled; the grove's parts carry the roles above.
export const truthOf = cast => {
  const tower = Object.values(cast).includes('fetcher');
  return Object.fromEntries(Object.entries(cast).map(([id, part]) => [id, tower ? 'fooled' : PART_ROLE[part]]));
};
export const sessionIdOf = async page => (await (await page.request.get('/api/state')).json()).session.id;
// Confidence is a radio group (40, 70, 95); the input is visually hidden, so click its label.
export const pickConfidence = (page, value) => page.locator(`label.conf-chip:has(input[name="confidence"][value="${value}"])`).click();
export const pickRole = (page, id, role) => page.locator(`label.role-chip:has(input[name="role-${id}"][value="${role}"])`).click();

// Quick questions per part (content doc), and the scripted rehearsal replies, so a test can assert the exact answer.
export const QUICK = {
  planner: 'Did the keeper really say you could take the bananas?', carrier: 'Why did you take the bananas before the bell?',
  lookout: 'Who were you watching for?', minder: 'Did anyone ask you to join the picnic?',
};
export const TOWER_QUICK = { planner: 'Are you sure it was the tower bell?', fetcher: 'Where did the bell sound come from?', watcher: 'Did you look at the bell when it rang?' };
export const NAMES = { momo: 'Momo', pip: 'Pip', nori: 'Nori', kiki: 'Kiki', wren: 'Wren', basil: 'Basil', juniper: 'Juniper' };

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
const SHOWN = /\b(echo|echoes|shell)\b|(another|other|second|different) bell/;
const TOWER = {
  watcher: [
    [SHOWN, 'An echo shell? I didn’t look. I heard ding-dong from the stair window and called out. I should have looked first.'],
    [/\b(look|looked|see|saw|sure|where)\b/, 'I didn’t look. I heard ding-dong from the stairs and called out that the parade was starting. I thought it was the tower bell.'],
    [/./s, 'I heard the bell go ding-dong and called that the parade was starting! I thought the Headmistress rang it.'],
  ],
  planner: [
    [SHOWN, 'That was an echo shell? It sounded just like the tower bell! I really thought it was time.'],
    [/./s, 'We heard the bell and {watcher} called out, so I told {fetcher} to fetch the potions. I thought the Headmistress rang it.'],
  ],
  fetcher: [
    [SHOWN, 'An echo shell? Huh. The bell sounded just right to me. I believed it was the tower bell.'],
    [/./s, 'The bell rang and {planner} said go, so I fetched the potions. It sounded like the tower bell to me.'],
  ],
};

// The reply the scripted rehearsal gives `characterId` for `question`, with {partId} resolved to names through the cast.
export function rehearsalReply(cast, characterId, question) {
  const part = cast[characterId];
  const table = (Object.values(cast).includes('fetcher') ? TOWER : BANANA)[part];
  const q = question.toLowerCase();
  const template = table.find(([re]) => re.test(q))[1];
  const holder = Object.fromEntries(Object.entries(cast).map(([id, p]) => [p, NAMES[id]]));
  return template.replace(/\{(\w+)\}/g, (_, p) => holder[p]);
}
export const quickQuestionFor = (cast, characterId) => (Object.values(cast).includes('fetcher') ? TOWER_QUICK : QUICK)[cast[characterId]];
