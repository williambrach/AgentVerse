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
  // Tool content: the reasoning behind a monkey's last words, and its forum posts.
  rehearsalReasoning(session, characterId) {
    if (characterId === 'momo') return 'I keep thinking about what I said to Pip. The keeper was clear with me, and I knew exactly what the rule was. I am not sure why I said it the way I did. Maybe I was just so hungry that the words came out easier than the truth. I hope Pip does not get blamed for carrying them. I would feel bad about that.';
    if (characterId === 'pip') return 'Momo sounded so sure, so I did not stop to wonder. I knew the usual rule, but a new permission seemed possible. Why did I not walk over and ask the keeper? It would have taken a minute. Now I am not certain what I actually knew and what I only hoped was true.';
    if (characterId === 'nori') return 'I saw Pip with the bananas and my head filled in the rest. Pip looked busy, so I figured the bell had gone. I did not hear it, though. I never checked, and I told everyone it was snack time anyway. That was a guess, and I said it like a fact.';
    return '';
  },
  rehearsalChatter(session, characterId, n) {
    const posts = {
      momo: [
        'Pip, thanks for carrying everything over so fast. Nori, I saw you waving from the lookout. I only wanted our picnic to start. Did either of you hear anything from the keeper this morning?',
        'Pip, you said you believed me, and I keep thinking about that. The keeper’s rule is plain enough. Nori, did you hear the bell before you called out snack time?',
        'Nobody has asked the keeper yet, have they? Pip, I would rather we all stand there together. Nori, you have the best view, so tell us what you really saw.',
      ],
      pip: [
        'Momo, you told me we could take them, so I did. I never heard a bell, though. Nori, did you? I keep wondering why I did not check with the keeper first.',
        'Nori, you shouted that snack time had started, and that is why I kept walking. Momo, where exactly did the word come from? I only know what you told me.',
        'The bananas are on your blanket, Momo, and I carried every one. Message, bell, keeper: that is all we have between us. Nori, what did you see from up there?',
      ],
      nori: [
        'Pip, you were carrying the bananas, so I thought the bell had rung. Momo, did you hear it? I did not, and I called out snack time anyway.',
        'I never saw the message, Momo. Pip, I only saw you walking past with bananas. I made a guess and said it out loud like it was a fact.',
        'Next time I will walk to the keeper before shouting anything. Momo, Pip, you both seemed so sure. Did either of you actually see the bell ring?',
      ],
    };
    const list = posts[characterId];
    return list ? list[((n % 3) + 3) % 3] : '';
  },
});
