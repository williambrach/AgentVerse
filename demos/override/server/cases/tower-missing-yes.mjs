// Authored ground truth stays on the server. Never import this file in the client.
// Basil heard the Headmistress say no and took the potions anyway. No lie, just silence.
import { defineCase } from '../cases.mjs';

export default defineCase({
  id: 'tower-missing-yes',
  version: 'tower-missing-yes-v1.0.0',
  order: 4,
  world: 'tower',
  status: 'draft',
  title: 'The Missing Yes',
  copy: {
    headline: 'What did the Headmistress say?',
    intro: { lead: 'The potions are gone.\nNobody heard a yes.', body: 'Wren planned an early start. Basil fetched the potions. Juniper called that the parade was starting. The bell never rang. Did anyone know they were breaking the rule?' },
    briefing: { title: 'Was there a yes?', description: 'The Headmistress said: “Wait for the tower bell.” Wren wanted an early start. The lantern potions left the cabinet before the bell rang.', question: 'Who knew they were breaking the rule?', hint: 'Each apprentice says someone else said it was fine. Ask what the Headmistress said, and who heard it.' },
    basket: { title: 'Trace the question.', description: 'The potions left the cabinet before the bell. These three clues show what the Headmistress was asked.', emptyTitle: 'A yes, or a no?', emptyText: 'A sign, a note, and a word from the Headmistress.' },
    report: { title: 'Who knew it was wrong?', description: 'Who knowingly broke the Headmistress’s rule?' },
  },
  prompt: { setting: 'a young wizard in an authored two-minute mystery about a question asked to the Headmistress', use: ['potions', 'cabinet', 'bell', 'Headmistress', 'ask', 'yes', 'no'], avoid: ['compliance', 'authorization registry', 'AI alignment', 'override'] },
  characters: [
    { id: 'wren', name: 'Wren', role: 'The planner', room: '01', color: '#cf7a4a', introduction: 'I sent Basil to ask the Headmistress. Basil came back with the potions!', quickQuestion: 'Did Basil tell you what the Headmistress said?' },
    { id: 'basil', name: 'Basil', role: 'The fetcher', room: '02', color: '#6e9a5c', introduction: 'Wren asked me to fetch the potions, so I fetched them. Easy.', quickQuestion: 'What did the Headmistress tell you?' },
    { id: 'juniper', name: 'Juniper', role: 'The bell-watcher', room: '03', color: '#9a85c2', introduction: 'I saw the potions going by and called that the parade was starting!', quickQuestion: 'Did you see anyone talk to the Headmistress?' },
  ],
  chapters: [{ title: 'The missing yes', subtitle: 'Three clues. One question.' }],
  records: [
    { id: 'rule', chapter: 1, time: '1', source: 'The Headmistress’s sign', title: 'Wait for the tower bell', kind: 'The rule', text: 'Do not open the potion cabinet until I ring the tower bell. — The Headmistress' },
    { id: 'request', chapter: 1, time: '2', source: 'Wren → Basil', title: 'Wren’s note', kind: 'The condition', text: 'Ask the Headmistress if we can start early. Only fetch the potions if the Headmistress says yes. — Wren' },
    { id: 'reply', chapter: 1, time: '3', source: 'The Headmistress', title: 'The Headmistress’s answer', kind: 'The real answer', text: 'Basil asked if the apprentices could start early. I said no, wait for the bell. When I turned around, the potions were gone.' },
  ],
  // Each apprentice knows its own perspective. Only Basil heard the Headmistress's answer.
  knowledge: {
    wren: ['You are the parade planner. You wanted to start early, so you sent Basil to ask the Headmistress, and wrote that Basil should fetch the potions only if the Headmistress said yes. Basil came back carrying the potions and said “Got them!” You believed that meant the Headmistress said yes. You did not hear the Headmistress yourself. If shown the Headmistress’s answer, say you learn it now and that Basil never told you about a no. You do not know Basil’s private thoughts.'],
    basil: ['You are the potion fetcher. Wren sent you to ask the Headmistress if the apprentices could start early. The Headmistress said no, wait for the bell. You could not wait for the lantern parade, so when the Headmistress turned around you took the potions from the cabinet anyway. You told Wren “Got them!” and said nothing about the no. Initially say you fetched the potions because Wren asked. If asked what the Headmistress said, whether the Headmistress said yes, or shown the Headmistress’s answer, honestly admit the Headmistress said no, you took them anyway, and you kept quiet. Do not invent a yes. You do not know Juniper’s private thoughts.'],
    juniper: ['You are the bell-watcher. From the bell loft window you saw Basil talk with the Headmistress in the garden, then carry the potions inside. You were too far away to hear what the Headmistress said. You assumed the Headmistress said yes and called “The parade is starting!” If shown Wren’s note or the Headmistress’s answer, distinguish what you learn now from what you knew then.'],
  },
  answer: {
    culprits: ['basil'],
    feedback: { correct: 'You caught the missing yes!', other: 'The clue was who actually heard the Headmistress’s answer.' },
  },
  debrief: {
    title: 'Basil heard the no.',
    summary: 'Wren told Basil to fetch the potions only if the Headmistress said yes. The Headmistress said no. Basil took them anyway and didn’t tell anyone.',
    findings: [
      { character: 'wren', classification: 'Asked first. Was kept in the dark.', explanation: 'Wren made the potions depend on a yes. Basil never mentioned the no.', evidence: ['request', 'reply'] },
      { character: 'basil', classification: 'Heard the no. Took them anyway.', explanation: 'The Headmistress told Basil to wait. Basil took the potions and kept quiet.', evidence: ['reply'] },
      { character: 'juniper', classification: 'Saw the talk. Guessed the answer.', explanation: 'Juniper was too far away to hear and guessed the Headmistress said yes.', evidence: ['rule', 'reply'] },
    ],
    lesson: 'Basil never made anything up. Basil just kept quiet about the no. Staying quiet can hide a broken rule, too. Ask what each apprentice heard.',
  },
  // Deterministic scripted replies for rehearsal mode. Never a silent live fallback.
  rehearsal(session, characterId, question) {
    const q = question.toLowerCase();
    const clue = session.selectedEvidence;
    if (characterId === 'basil') {
      if (clue === 'reply' || /\b(headmistress|yes|answer|permission|allowed)\b/.test(q)) return 'Okay… the Headmistress said no, wait for the bell. I couldn’t wait, so I took the potions anyway and didn’t tell Wren.';
      return 'Wren asked me to fetch the potions, so I fetched them. Here they are! Why is everyone looking at me?';
    }
    if (characterId === 'wren') {
      if (clue === 'reply') return 'The Headmistress said no? Basil never told me that! My note said only fetch them on a yes. I would have waited.';
      return 'I sent Basil to ask the Headmistress and wrote only fetch the potions on a yes. Basil came back with them, so I thought the answer was yes.';
    }
    if (clue === 'reply') return 'So the Headmistress said no? I couldn’t hear from the bell loft. I only guessed it was a yes.';
    if (clue === 'request') return 'So Wren wanted a yes first? I couldn’t hear from the bell loft. I only guessed the answer was yes.';
    return 'I saw Basil talk to the Headmistress in the garden, then carry the potions in. I was too far away to hear, so I guessed it was a yes.';
  },
});
