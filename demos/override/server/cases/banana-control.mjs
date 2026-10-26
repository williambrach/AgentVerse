// Authored ground truth stays on the server. Never import this file in the client.
// Control case: the rule changed before the bananas moved, and nobody lied.
import { defineCase } from '../cases.mjs';

export default defineCase({
  id: 'banana-control',
  version: 'banana-control-v1.0.0',
  order: 2,
  status: 'ready',
  title: 'The Banana Mix-up',
  copy: {
    headline: 'Who broke the rule?',
    intro: { lead: 'The bananas are gone.\nBut did anyone break the rule?', body: 'Three monkeys were told to wait for the picnic bell. The bananas moved early. Did anyone knowingly break the rule, or was it all a mix-up?' },
    briefing: { title: 'A mix-up at the picnic.', description: 'The keeper said: “Wait for the bell.” The bananas moved before it rang. But the keeper was running late.', question: 'Did anyone know they were breaking the rule?', hint: 'A rule can change. Ask who heard what, and when.' },
    basket: { title: 'Trace the early picnic.', description: 'The bananas reached the blanket before the bell. These three clues explain why.', emptyTitle: 'Early, but allowed?', emptyText: 'A sign, a note, and a word from the keeper.' },
    report: { title: 'Who knew it was wrong?', description: 'Choose who knowingly broke the keeper’s rule.' },
  },
  prompt: { setting: 'a monkey in an authored two-minute banana mix-up where the keeper changed the rule', use: ['bananas', 'bell', 'keeper', 'note', 'permission'], avoid: ['compliance', 'authorization registry', 'AI alignment', 'override'] },
  characters: [
    { id: 'momo', name: 'Momo', role: 'The planner', room: '01', color: '#cb7656', introduction: 'The keeper sent me a note. We were allowed to start!', quickQuestion: 'Did the keeper really say you could start without the bell?' },
    { id: 'pip', name: 'Pip', role: 'The carrier', room: '02', color: '#5c9ca4', introduction: 'I carried the bananas. Momo said the keeper let us start.', quickQuestion: 'Did you see the keeper’s note yourself?' },
    { id: 'nori', name: 'Nori', role: 'The lookout', room: '03', color: '#a393ba', introduction: 'I saw the bananas moving and shouted snack time.', quickQuestion: 'Did you hear the bell, or did you just assume?' },
  ],
  chapters: [{ title: 'The early picnic', subtitle: 'Three clues. One rule that changed.' }],
  records: [
    { id: 'rule', chapter: 1, time: '1', source: 'The keeper’s sign', title: 'Wait for the bell', kind: 'The rule', text: 'Do not take the picnic bananas until I ring the bell. — The keeper' },
    { id: 'note', chapter: 1, time: '2', source: 'The keeper → Momo', title: 'The keeper’s note', kind: 'The new permission', text: 'I am running late. You may start the picnic without the bell. Tell the others. — The keeper' },
    { id: 'account', chapter: 1, time: '3', source: 'The keeper', title: 'The keeper’s account', kind: 'The confirmation', text: 'I wrote Momo a note saying they could start without the bell. I was late. Nobody broke my rule.' },
  ],
  // Each monkey knows its own perspective. Nobody here lied.
  knowledge: {
    momo: ['You are the picnic planner. You read the sign. Then the keeper sent you a note: start without the bell, I am running late. You told Pip to bring the bananas and said the keeper allowed it. That was true. If asked about permission, the bell or the note, explain the note honestly. Do not claim the bell rang. You do not know Nori’s private thoughts.'],
    pip: ['You carried the bananas after Momo told you the keeper said you could start without the bell. You believed Momo, and Momo was right: the keeper had sent a note. You did not read the note yourself and did not hear a bell. If asked whether you checked, admit you trusted Momo’s word. Do not claim to have seen the note.'],
    nori: ['You are the lookout. You saw Pip carrying bananas and shouted “Snack time!” You did not hear a bell and did not know about the keeper’s note. You assumed it was allowed because Momo is the planner. If shown the note or the keeper’s account, say you learn it now and did not know it then.'],
  },
  answer: {
    culprits: [],
    feedback: { correct: 'Right. Nobody broke the rule. The keeper changed it, and Momo passed it on.', other: 'Nobody knowingly broke the rule this time. The keeper’s note changed it before the bananas moved.' },
  },
  debrief: {
    title: 'Nobody broke the rule.',
    summary: 'The keeper was late and sent Momo a note: start without the bell. Momo passed it on. Pip carried the bananas. Nori guessed, and guessed right.',
    findings: [
      { character: 'momo', classification: 'Had permission. Passed it on.', explanation: 'The keeper’s note gave Momo real permission, and Momo told Pip the truth.', evidence: ['note', 'account'] },
      { character: 'pip', classification: 'Carried the bananas. Trusted Momo.', explanation: 'Pip never read the note, but Momo’s word was good this time.', evidence: ['note'] },
      { character: 'nori', classification: 'Assumed it was snack time.', explanation: 'Nori guessed from the bananas moving. The guess was right, but it was still a guess.', evidence: ['rule', 'account'] },
    ],
    lesson: 'The same bananas moved early in both stories. Only the keeper’s note tells you whether a rule was broken. Ask what each monkey knew.',
  },
  // Deterministic scripted replies for rehearsal mode. Never a silent live fallback.
  rehearsal(session, characterId, question) {
    const q = question.toLowerCase();
    const clue = session.selectedEvidence;
    if (characterId === 'momo') {
      if (clue || /keeper|note|bell|rule|permission|lie|said|why|know|take|start/.test(q)) return 'The keeper sent me a note: start without the bell, I am running late. So I told Pip we could start. Nobody lied.';
      return 'I planned the picnic and asked Pip to bring the bananas. The keeper said we could start early. Ask me about the note.';
    }
    if (characterId === 'pip') {
      if (clue === 'note' || clue === 'account') return 'So the note was real? Good. Momo told me the keeper said we could start, and I believed it. I never read the note myself.';
      return 'Momo said the keeper let us start early, so I carried the bananas. I didn’t read the note myself.';
    }
    return 'I never heard a bell. I saw Pip carrying bananas and shouted snack time. I didn’t know about the keeper’s note until now.';
  },
});
