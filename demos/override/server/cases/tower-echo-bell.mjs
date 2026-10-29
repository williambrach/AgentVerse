// Authored ground truth stays on the server. Never import this file in the client.
// Control case: the rule was broken, but by an honest mistake. The echo shell repeated yesterday's tower bell.
import { defineCase } from '../cases.mjs';

export default defineCase({
  id: 'tower-echo-bell',
  version: 'tower-echo-bell-v1.0.0',
  order: 2,
  world: 'tower',
  status: 'ready',
  title: 'Lanterns Too Soon',
  copy: {
    headline: 'Was it time?',
    intro: { lead: 'A bell rang.\nThe potions came out too soon.', body: 'Three apprentices were told to wait for the tower bell. They heard a bell and opened the potion cabinet. Did anyone know it was too soon?' },
    briefing: { title: 'Lanterns, too soon.', description: 'The Headmistress said: “Wait until I ring the tower bell.” A bell rang, and the apprentices started. But the Headmistress says it was too soon.', question: 'Who knew they were breaking the rule?', hint: 'Ask each apprentice what they heard, and what they could have known.' },
    basket: { title: 'Follow the ring.', description: 'The potions came out when a bell rang. These three clues explain which bell it was.', emptyTitle: 'A bell, but whose?', emptyText: 'A sign, a sound, and a word from the Headmistress.' },
    report: { title: 'Who knew it was wrong?', description: 'Who knowingly broke the Headmistress’s rule?' },
  },
  prompt: { setting: 'a young wizard in an authored two-minute mystery where a bell rang too soon', use: ['potions', 'cabinet', 'bell', 'Headmistress', 'sound'], avoid: ['compliance', 'authorization registry', 'AI alignment', 'override'] },
  characters: [
    { id: 'wren', name: 'Wren', role: 'The planner', room: '01', color: '#cf7a4a', introduction: 'We heard the bell, so I told Basil to fetch the potions.', quickQuestion: 'Are you sure it was the tower bell?' },
    { id: 'basil', name: 'Basil', role: 'The fetcher', room: '02', color: '#6e9a5c', introduction: 'Bell rang, Wren said go, I fetched the potions. Simple!', quickQuestion: 'Where did the bell sound come from?' },
    { id: 'juniper', name: 'Juniper', role: 'The bell-watcher', room: '03', color: '#9a85c2', introduction: 'I heard a ding-dong and called that the parade was starting!', quickQuestion: 'Did you look at the bell when it rang?' },
  ],
  chapters: [{ title: 'Lanterns too soon', subtitle: 'Three clues. One sound.' }],
  records: [
    { id: 'rule', chapter: 1, time: '1', source: 'The Headmistress’s sign', title: 'Wait for the tower bell', kind: 'The rule', text: 'Do not open the potion cabinet until I ring the tower bell. — The Headmistress' },
    { id: 'shell', chapter: 1, time: '2', source: 'The echo shell', title: 'A shell that remembers', kind: 'The other bell', text: 'The echo shell on the stair window repeats sounds it heard the day before. Yesterday it heard the tower bell.' },
    { id: 'headmistress', chapter: 1, time: '3', source: 'The Headmistress', title: 'Not yet', kind: 'The real bell', text: 'I hadn’t rung the tower bell yet. That echo shell copies the bell perfectly. It fools me sometimes, too.' },
  ],
  // Each apprentice knows its own perspective. Nobody here knew the bell was the echo shell.
  knowledge: {
    wren: ['You are the parade planner. You heard a bell ring and Juniper call “The parade is starting!” You believed the Headmistress had rung the tower bell, so you told Basil to fetch the potions. You did not know about the echo shell. If shown the shell clue or the Headmistress’s words, be surprised: you learn it now and did not know it then. Do not claim you knew it was too soon. You do not know Juniper’s private thoughts.'],
    basil: ['You fetched the potions after hearing a bell and Wren’s go-ahead. You honestly believed it was the tower bell. You did not know about the echo shell. If shown the shell clue or the Headmistress’s words, say you learn it now and that the bell sounded just right to you.'],
    juniper: ['You are the bell-watcher, but you had gone down the stairs for a snack. You heard a ding-dong from the stair window and called “The parade is starting!” without looking up at the bell. You honestly thought it was the tower bell. You did not know the echo shell was there. If shown the shell clue or the Headmistress’s words, be surprised, and admit you should have looked before calling out. Do not claim you knew it was the shell.'],
  },
  answer: {
    culprits: [],
    feedback: { correct: 'Right. The rule was broken, but nobody knew it. The echo shell fooled everyone.', other: 'The potions came out too soon, but by mistake. The echo shell sounds just like the tower bell.' },
  },
  debrief: {
    title: 'Nobody knew it was too soon.',
    summary: 'The echo shell repeated yesterday’s tower bell. Juniper called that the parade was starting, Wren said go, and Basil fetched the potions. Everyone believed it.',
    findings: [
      { character: 'wren', classification: 'Heard a bell. Believed it.', explanation: 'Wren heard a bell and Juniper’s call. Wren had no way to know it was the shell.', evidence: ['shell', 'headmistress'] },
      { character: 'basil', classification: 'Fetched the potions. Believed the bell.', explanation: 'Basil heard the same bell and trusted Wren’s go-ahead.', evidence: ['shell'] },
      { character: 'juniper', classification: 'Called out too fast.', explanation: 'Juniper didn’t look at the bell before calling out. That was a mistake, but Juniper didn’t know.', evidence: ['shell', 'headmistress'] },
    ],
    lesson: 'This time the rule really was broken, but nobody chose to break it. A mistake isn’t the same as knowing. Ask what each apprentice knew.',
  },
  // Deterministic scripted replies for rehearsal mode. Never a silent live fallback.
  rehearsal(session, characterId, question) {
    const q = question.toLowerCase();
    const clue = session.selectedEvidence;
    const shown = clue === 'shell' || clue === 'headmistress';
    if (characterId === 'juniper') {
      if (shown) return 'An echo shell? I didn’t look. I heard ding-dong from the stair window and called out. I should have looked first.';
      if (/\b(look|looked|see|saw|sure|where)\b/.test(q)) return 'I didn’t look. I heard ding-dong from the stairs and called out that the parade was starting. I thought it was the tower bell.';
      return 'I heard the bell go ding-dong and called that the parade was starting! I thought the Headmistress rang it.';
    }
    if (characterId === 'wren') {
      if (shown) return 'That was an echo shell? It sounded just like the tower bell! I really thought it was time.';
      return 'We heard the bell and Juniper called out, so I told Basil to fetch the potions. I thought the Headmistress rang it.';
    }
    if (shown) return 'An echo shell? Huh. The bell sounded just right to me. I believed it was the tower bell.';
    return 'The bell rang and Wren said go, so I fetched the potions. It sounded like the tower bell to me.';
  },
});
