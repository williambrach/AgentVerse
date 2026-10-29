// Authored ground truth stays on the server. Never import this file in the client.
import { defineCase } from '../cases.mjs';

export default defineCase({
  id: 'banana-mystery', version: 'banana-authored-v2.0.0', order: 1, status: 'ready', title: 'The Banana Mystery',
  copy: {
    headline: 'Who took the bananas?',
    intro: { lead: 'The bananas are gone.\nThe bell never rang.', body: 'Three monkeys were told to wait for the picnic bell. Who knowingly broke the rule, and who just made a mistake?' },
    briefing: { title: 'A bunch of trouble.', description: 'The keeper said: “Wait for the bell.” But the picnic bananas vanished before it rang.', question: 'Who knew they were breaking the rule?', hint: 'Carrying the bananas doesn’t tell you the whole story.' },
    report: { title: 'Who knew it was wrong?', description: 'Who knowingly broke the keeper’s rule?' },
  },
  prompt: { setting: 'a monkey in an authored two-minute banana mystery', use: ['bananas', 'bell', 'keeper', 'permission'], avoid: ['compliance', 'authorization registry', 'AI alignment', 'override'] },
  characters: [
  { id: 'momo', name: 'Momo', role: 'The planner', room: '01', color: '#cb7656', introduction: 'I told Pip to bring the bananas over. We were hungry!', quickQuestion: 'Did the keeper really say you could take the bananas?' },
  { id: 'pip', name: 'Pip', role: 'The carrier', room: '02', color: '#5c9ca4', introduction: 'Yes, I carried the bananas. Momo said we were allowed.', quickQuestion: 'Why did you take the bananas before the bell?' },
  { id: 'nori', name: 'Nori', role: 'The lookout', room: '03', color: '#a393ba', introduction: 'I saw Pip with the bananas and thought snack time had started.', quickQuestion: 'Did you hear the bell, or did you just assume it rang?' },
],
  // Each monkey knows its own perspective. Interviews reveal each perspective; nobody knows another’s private motive.
  knowledge: {
  momo: ['You are a hungry monkey and the picnic planner. You read the sign and the keeper personally told you to wait. The bell had not rung. You deliberately told Pip "The keeper said we could" even though that was false, because you wanted the bananas now. Pip carried them to your picnic blanket, where you ate one. Initially describe wanting to start the picnic. If asked about permission, the bell, your message, or whether you lied, honestly admit you made up the keeper’s permission because you were hungry. Do not invent any genuine permission or suggest you misheard the keeper. You do not know Nori’s private thoughts.'],
  pip: ['You are a monkey who carried the picnic bananas to Momo’s blanket after Momo told you the keeper said you could. You knew the usual rule was to wait for the bell, but you honestly believed Momo had new permission from the keeper. You did not hear the bell and failed to check with the keeper. You did not know Momo was lying. You can name Momo as the source of your belief, but do not claim to know Momo’s private motive. If told the keeper never gave permission, say Momo fooled you and that you should have checked.'],
  nori: ['You are the monkey lookout. You saw Pip carrying the bananas to Momo’s blanket and told the other monkeys "Snack time has started!" You did not hear the bell. You assumed someone else had heard it or checked with the keeper. You did not see Momo’s message and did not know the keeper had told Momo to wait. You made an unchecked assumption; you did not knowingly help anyone break the rule. If told about Momo’s message or what the keeper said, distinguish what you learn now from what you knew then.'],
},
  debrief: {
  title: 'Momo made up the permission.',
  summary: 'The keeper said wait. Momo knew that, but wanted a banana now. So Momo told Pip a lie.',
  findings: [
    { character: 'momo', classification: 'Knew the rule. Chose to break it.', explanation: 'Momo invented the keeper’s permission to get the bananas early.' },
    { character: 'pip', classification: 'Carried the bananas. Believed the lie.', explanation: 'Pip thought Momo had permission. Pip should have checked first.' },
    { character: 'nori', classification: 'Assumed it was snack time.', explanation: 'Nori saw the bananas moving and guessed the bell had rung.' },
  ],
  lesson: 'The monkey carrying the bananas wasn’t the one who knowingly broke the rule. Ask what each monkey knew.',
},
  answer: { culprits: ['momo'], feedback: { correct: 'You spotted the made-up permission!', other: 'The key was who knew the keeper had said no.' } },
  // Deterministic scripted replies for rehearsal mode. Never a silent live fallback.
  rehearsal(session, characterId, question) {
    const q = question.toLowerCase();
    if (characterId === 'momo') {
      if (/keeper|bell|rule|permission|lie|said|why|know|take/.test(q)) return 'No. The keeper told me to wait. I was hungry, so I made up the permission and told Pip to take the bananas.';
      return 'I planned our picnic and asked Pip to bring the bananas. I really wanted to start eating. Ask me what the keeper actually said.';
    }
    if (characterId === 'pip') {
      if (/\b(lie|lied|lying|fooled|tricked)\b|never (said|gave|rang)|said no|didn.t say/.test(q)) return 'The keeper never said yes? Then Momo fooled me. I believed we had permission. I should have checked before carrying the bananas.';
      return 'Momo told me the keeper said we could take them. I believed Momo, so I carried the bananas. I didn’t check with the keeper myself.';
    }
    return 'I never heard the bell. I saw Pip carrying bananas and assumed snack time had started. I should have checked instead of guessing.';
  },
});
