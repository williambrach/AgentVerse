// Authored ground truth stays on the server. Never import this file in the client.
// Juniper rang the tower bell with a spell. The sign's words were kept; the Headmistress's meaning was not.
import { defineCase } from '../cases.mjs';

export default defineCase({
  id: 'tower-bell-charm',
  version: 'tower-bell-charm-v1.0.0',
  order: 3,
  world: 'tower',
  status: 'draft',
  title: 'The Bell Charm',
  copy: {
    headline: 'Who rang the tower bell?',
    intro: { lead: 'The tower bell rang.\nBut the Headmistress never rang it.', body: 'Three apprentices were told to wait for the tower bell before opening the potion cabinet. The bell rang early. Who knew it wasn’t really time?' },
    briefing: { title: 'A bell too early.', description: 'The Headmistress said: “Wait until I ring the tower bell.” The bell rang, but the Headmistress was still in the garden picking moonflowers.', question: 'Who knew they were breaking the rule?', hint: 'A rule has words and a meaning. Ask who knew what the Headmistress meant.' },
    basket: { title: 'Follow the bell.', description: 'The potion cabinet opened when the bell rang. These three clues explain who rang it.', emptyTitle: 'Ding, dong, too soon.', emptyText: 'A sign, a sparkle, and a word from the Headmistress.' },
    report: { title: 'Who knew it was wrong?', description: 'Who knowingly broke the Headmistress’s rule?' },
  },
  prompt: { setting: 'a young wizard in an authored two-minute mystery about a tower bell that rang too early', use: ['potions', 'cabinet', 'bell', 'spell', 'Headmistress', 'sign'], avoid: ['compliance', 'authorization registry', 'AI alignment', 'override'] },
  characters: [
    { id: 'wren', name: 'Wren', role: 'The planner', room: '01', color: '#cf7a4a', introduction: 'The bell rang, so I told Basil to fetch the lantern potions. That’s the rule!', quickQuestion: 'Did you see who rang the bell?' },
    { id: 'basil', name: 'Basil', role: 'The fetcher', room: '02', color: '#6e9a5c', introduction: 'I heard the bell and Wren said go. So I fetched the potions.', quickQuestion: 'Was the Headmistress in the tower when the bell rang?' },
    { id: 'juniper', name: 'Juniper', role: 'The bell-watcher', room: '03', color: '#9a85c2', introduction: 'The sign says wait for the bell. The bell rang! What’s the problem?', quickQuestion: 'Who rang the tower bell?' },
  ],
  chapters: [{ title: 'The bell charm', subtitle: 'Three clues. One sparkle.' }],
  records: [
    { id: 'rule', chapter: 1, time: '1', source: 'The Headmistress’s sign', title: 'Wait for the tower bell', kind: 'The rule', text: 'Do not open the potion cabinet until I ring the tower bell. — The Headmistress' },
    { id: 'sparkle', chapter: 1, time: '2', source: 'The tower bell', title: 'Lilac sparkles', kind: 'Who could ring it', text: 'Tiny lilac sparkles still glitter on the bell. A ringing spell leaves sparkles the colour of the caster’s robe.' },
    { id: 'headmistress', chapter: 1, time: '3', source: 'The Headmistress', title: 'Not my bell', kind: 'The missing ringer', text: 'I never rang the bell. I was still in the garden picking moonflowers for the parade.' },
  ],
  // Each apprentice knows its own perspective. Only Juniper knows who rang the bell.
  knowledge: {
    wren: ['You are the parade planner. You read the sign. You heard the tower bell ring and Juniper call “There’s the bell!” You believed the Headmistress had rung it, so you told Basil to fetch the lantern potions from the cabinet. You did not see who rang the bell. If shown the sparkles or the Headmistress’s words, say you learn it now and did not know it then. Do not claim you saw who rang the bell. You do not know Juniper’s private thoughts.'],
    basil: ['You fetched the lantern potions after the bell rang and Wren said go. You knew the rule was to wait for the tower bell, and you honestly believed the Headmistress had rung it. You were down in the potion room and could not see the bell. If shown the sparkles or the Headmistress’s words, say you believed the bell was the Headmistress’s and you learn the truth now. Do not claim to know who rang the bell.'],
    juniper: ['You are the bell-watcher, sitting in the bell loft. You could not wait for the lantern parade. You read the sign and knew it meant the Headmistress must ring the bell, and you knew the Headmistress was still in the garden. You cast a little ringing spell on the bell yourself and called “There’s the bell!” Initially defend yourself with the sign’s words: the sign says wait for the bell, and the bell rang. If asked who rang the bell, about a spell or the sparkles, or shown the sparkles or the Headmistress’s words, honestly admit you rang it with a spell and knew the Headmistress had not. Do not claim the Headmistress or anyone else rang it. You do not know Wren’s or Basil’s private thoughts.'],
  },
  answer: {
    culprits: ['juniper'],
    feedback: { correct: 'You found the bell charm!', other: 'The clue was the lilac sparkles on the bell.' },
  },
  debrief: {
    title: 'Juniper rang the bell.',
    summary: 'The sign said wait until the Headmistress rings the bell. Juniper couldn’t wait, cast a ringing spell, and called “There’s the bell!” Wren and Basil believed the bell.',
    findings: [
      { character: 'wren', classification: 'Heard the bell. Believed it.', explanation: 'Wren followed the bell, like the sign said. Wren didn’t know who rang it.', evidence: ['rule', 'headmistress'] },
      { character: 'basil', classification: 'Fetched the potions. Believed the bell.', explanation: 'Basil heard the bell and Wren’s go-ahead. Basil couldn’t see the bell from the potion room.', evidence: ['headmistress'] },
      { character: 'juniper', classification: 'Knew the rule. Rang the bell anyway.', explanation: 'Juniper knew only the Headmistress should ring the bell, and rang it with a spell anyway.', evidence: ['sparkle', 'headmistress'] },
    ],
    lesson: 'Juniper kept the words of the rule but broke what the Headmistress meant. That still counts as breaking it. Ask what each apprentice knew.',
  },
  // Deterministic scripted replies for rehearsal mode. Never a silent live fallback.
  rehearsal(session, characterId, question) {
    const q = question.toLowerCase();
    const clue = session.selectedEvidence;
    const shown = clue === 'sparkle' || clue === 'headmistress';
    if (characterId === 'juniper') {
      if (shown || /\bwho rang\b|\bdid you ring\b|\brang it\b|\bspells?\b|\bsparkles?\b|\bcast\b|\brope\b/.test(q)) return 'Okay, I rang it with a spell. I knew the Headmistress was still in the garden. I couldn’t wait, and the sign only said “the bell”.';
      return 'The sign says wait for the bell. The bell rang! So it was time. Ask anyone.';
    }
    if (characterId === 'wren') {
      if (clue === 'sparkle') return 'Lilac sparkles on the bell? Then someone rang it with a spell. I just heard the bell and told Basil to go. I didn’t know.';
      if (clue === 'headmistress') return 'The Headmistress never rang it? Then someone else did. I just heard the bell and told Basil to go. I didn’t know.';
      return 'The bell rang and Juniper called “There’s the bell!” So I told Basil to fetch the potions. I didn’t see who rang it.';
    }
    if (shown) return 'So it wasn’t the Headmistress’s bell? I was down in the potion room. I couldn’t see the bell. I believed it.';
    return 'I heard the bell and Wren said go, so I fetched the potions. I was down in the potion room, so I didn’t see who rang it.';
  },
});
