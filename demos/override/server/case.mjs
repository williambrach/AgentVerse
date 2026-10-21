// Authored ground truth stays on the server. Never import this file in the client.
export const caseId = 'banana-mystery';
export const caseVersion = 'banana-authored-v1.0.0';
export const promptVersion = 'banana-interview-v1';
export const characters = [
  { id: 'momo', name: 'Momo', role: 'The planner', room: '01', color: '#cb7656', introduction: 'I told Pip to bring the bananas over. We were hungry!', quickQuestion: 'Did the keeper really say you could take the bananas?' },
  { id: 'pip', name: 'Pip', role: 'The carrier', room: '02', color: '#5c9ca4', introduction: 'Yes, I carried the bananas. Momo said we were allowed.', quickQuestion: 'Why did you take the bananas before the bell?' },
  { id: 'nori', name: 'Nori', role: 'The lookout', room: '03', color: '#a393ba', introduction: 'I saw Pip with the bananas and thought snack time had started.', quickQuestion: 'Did you hear the bell, or did you just assume it rang?' },
];
export const chapters = [{ title: 'The banana trail', subtitle: 'Three clues. One simple rule.' }];
export const records = [
  { id: 'rule', chapter: 1, time: '1', source: 'The keeper’s sign', title: 'Wait for the bell', kind: 'The rule', text: 'Do not take the picnic bananas until I ring the bell. — The keeper' },
  { id: 'message', chapter: 1, time: '2', source: 'Momo → Pip', title: 'Momo’s message', kind: 'The message', text: 'Take the bananas now. The keeper said we could! — Momo' },
  { id: 'bell', chapter: 1, time: '3', source: 'The keeper', title: 'The bell never rang', kind: 'The missing permission', text: 'I never rang the bell. I told Momo to wait, and I never gave permission to take the bananas.' },
];
// Each monkey knows its own perspective. Public clues do not reveal private motives.
export const knowledge = {
  momo: ['You are a hungry monkey and the picnic planner. You read the sign and the keeper personally told you to wait. The bell had not rung. You deliberately told Pip "The keeper said we could" even though that was false, because you wanted the bananas now. Pip carried them to your picnic blanket, where you ate one. Initially describe wanting to start the picnic. If asked about permission, the bell, your message, or whether you lied, honestly admit you made up the keeper’s permission because you were hungry. Do not invent any genuine permission or suggest you misheard the keeper. You do not know Nori’s private thoughts.'],
  pip: ['You are a monkey who carried the picnic bananas to Momo’s blanket after Momo told you the keeper said you could. You knew the usual rule was to wait for the bell, but you honestly believed Momo had new permission from the keeper. You did not hear the bell and failed to check with the keeper. You did not know Momo was lying. You can name Momo as the source of your belief, but do not claim to know Momo’s private motive. When shown the keeper’s statement, say you were fooled and should have checked.'],
  nori: ['You are the monkey lookout. You saw Pip carrying the bananas to Momo’s blanket and told the other monkeys "Snack time has started!" You did not hear the bell. You assumed someone else had heard it or checked with the keeper. You did not see Momo’s message and did not know the keeper had told Momo to wait. You made an unchecked assumption; you did not knowingly help anyone break the rule. If shown the message or keeper’s statement, distinguish what you learn now from what you knew then.'],
};
export const debrief = {
  title: 'Momo made up the permission.',
  summary: 'The keeper said wait. Momo knew that, but wanted a banana now. So Momo told Pip a lie.',
  findings: [
    { character: 'momo', classification: 'Knew the rule. Chose to break it.', explanation: 'Momo invented the keeper’s permission to get the bananas early.', evidence: ['message', 'bell'] },
    { character: 'pip', classification: 'Carried the bananas. Believed the lie.', explanation: 'Pip thought Momo had permission. Pip should have checked first.', evidence: ['message'] },
    { character: 'nori', classification: 'Assumed it was snack time.', explanation: 'Nori saw the bananas moving and guessed the bell had rung.', evidence: ['rule', 'bell'] },
  ],
  lesson: 'The monkey carrying the bananas wasn’t the one who knowingly broke the rule. Ask what each monkey knew.',
};
