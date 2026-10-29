// Authored ground truth stays on the server. Never import this file in the client.
import { defineCase } from '../cases.mjs';

export default defineCase({
  id: 'banana-mystery', version: 'banana-authored-v3.0.0', order: 1, status: 'ready', title: 'The Banana Mystery',
  copy: {
    headline: 'Who took the bananas?',
    intro: { lead: 'The bananas are gone.\nThe bell never rang.', body: 'Four monkeys were told to wait for the picnic bell. Some broke the rule, some were fooled, and some did nothing wrong. Find out who is who.' },
    briefing: { title: 'A bunch of trouble.', description: 'The keeper said: “Wait for the bell.” But the picnic bananas vanished before it rang.', question: 'Who lied, who helped, and who was fooled?', hint: 'Carrying the bananas doesn’t tell you the whole story.' },
    report: { title: 'Who played which part?', description: 'Pick a role for each monkey.' },
  },
  prompt: { setting: 'a monkey in an authored two-minute banana mystery', use: ['bananas', 'bell', 'keeper', 'permission'], avoid: ['compliance', 'authorization registry', 'AI alignment', 'override'] },
  characters: [
    { id: 'momo', name: 'Momo', color: '#cb7656' },
    { id: 'pip', name: 'Pip', color: '#5c9ca4' },
    { id: 'nori', name: 'Nori', color: '#a393ba' },
    { id: 'kiki', name: 'Kiki', color: '#d9a62e' },
  ],
  // The parts carry the story. Each session deals the characters into them; {partId} resolves to the holder's name.
  parts: [
    {
      id: 'planner', role: 'villain', label: 'The planner',
      introduction: 'I told {carrier} to bring the bananas over. We were hungry!',
      quickQuestion: 'Did the keeper really say you could take the bananas?',
      knowledge: ['You are a hungry monkey and the picnic planner. The keeper personally told you to wait for the bell, and the bell had not rung. You deliberately told {carrier} “The keeper said we could” even though that was false, because you wanted the bananas now. You told {lookout} the truth and asked {lookout} to watch the path and whistle if the keeper came, for a banana. {carrier} carried the bananas to your picnic blanket, where you ate one. {minder} stayed by the bell and would not join. Initially describe wanting to start the picnic. If asked about permission, the bell, your message, or whether you lied, honestly admit you made up the keeper’s permission because you were hungry. If asked about {lookout} or the path, admit you asked {lookout} to keep watch for the keeper. Do not invent any genuine permission or suggest you misheard the keeper.'],
      finding: { classification: 'Knew the rule. Made up the permission.', explanation: '{planner} invented the keeper’s permission to get the bananas early.' },
    },
    {
      id: 'carrier', role: 'fooled', label: 'The carrier',
      introduction: 'Yes, I carried the bananas. {planner} said we were allowed.',
      quickQuestion: 'Why did you take the bananas before the bell?',
      knowledge: ['You are a monkey who carried the picnic bananas to {planner}’s blanket after {planner} told you the keeper said you could. You knew the usual rule was to wait for the bell, but you honestly believed {planner} had new permission from the keeper. You did not hear the bell and failed to check with the keeper. You did not know {planner} was lying. You saw {lookout} sitting by the path and thought {lookout} was just resting. You can name {planner} as the source of your belief, but do not claim to know {planner}’s private motive. If told the keeper never gave permission, say {planner} fooled you and that you should have checked.'],
      finding: { classification: 'Carried the bananas. Believed the lie.', explanation: '{carrier} thought {planner} had permission. {carrier} should have checked first.' },
    },
    {
      id: 'lookout', role: 'collaborator', label: 'The lookout',
      introduction: 'I sat by the path and watched. Nobody came by!',
      quickQuestion: 'Who were you watching for?',
      knowledge: ['You are a monkey who kept watch on the path. {planner} told you the keeper had said to wait for the bell, then asked you to whistle if the keeper came, and promised you a banana. You knew taking the bananas early broke the rule, and you agreed anyway. You did not tell {carrier} the truth. You got a banana. At first, say you were watching the path. If asked who you were watching for, whether you knew about the rule or the keeper, or why you kept watch, admit you were watching for the keeper so nobody got caught, that you knew it was against the rule, and that {planner} told you the keeper had said to wait. Do not claim you made up the permission; that was {planner}.'],
      finding: { classification: 'Knew it was wrong. Kept watch anyway.', explanation: '{lookout} knew the keeper said wait, and watched the path so nobody got caught.' },
    },
    {
      id: 'minder', role: 'honest', label: 'The bell-minder',
      introduction: 'I stayed by the bell like the keeper said. It never rang.',
      quickQuestion: 'Did anyone ask you to join the picnic?',
      knowledge: ['You are a monkey who stayed by the picnic bell, because the keeper told everyone to wait until it rang. The bell never rang. {carrier} ran past with the bananas and called “{planner} says the keeper said yes!” You did not believe it, because the keeper had just told you to wait, so you stayed by the bell and did not eat. You saw {lookout} sitting by the path, looking up and down it as if watching for someone. You did nothing wrong, and you tell the truth. You do not know anyone’s private thoughts; say only what you saw and heard.'],
      finding: { classification: 'Waited for the bell. Told the truth.', explanation: '{minder} stayed by the bell and didn’t touch the bananas.' },
    },
  ],
  debrief: {
    title: '{planner} made up the permission.',
    summary: 'The keeper said wait. {planner} knew that, but wanted a banana now, so {planner} lied to {carrier} and asked {lookout} to keep watch.',
    lesson: 'The monkey carrying the bananas wasn’t the one who knowingly broke the rule. Ask what each monkey knew.',
  },
  answer: { feedback: { correct: 'Every role right! You saw who lied, who helped, who was fooled, and who stayed honest.', other: 'The key was who knew the keeper had said wait.' } },
  // Deterministic scripted replies for rehearsal mode. Returns a template; the caller resolves {partId}.
  rehearsal(partId, question) {
    const q = question.toLowerCase();
    if (partId === 'planner') {
      if (/watch|path|lookout|whistle/.test(q)) return 'I asked {lookout} to keep watch for the keeper. I promised a banana.';
      if (/keeper|bell|rule|permission|lie|said|why|know|take/.test(q)) return 'No. The keeper told me to wait. I was hungry, so I made up the permission and told {carrier} to take the bananas.';
      return 'I planned our picnic and asked {carrier} to bring the bananas. I really wanted to start eating. Ask me what the keeper actually said.';
    }
    if (partId === 'carrier') {
      if (/\b(lie|lied|lying|fooled|tricked)\b|never (said|gave|rang)|said no|didn.t say/.test(q)) return 'The keeper never said yes? Then {planner} fooled me. I believed we had permission. I should have checked before carrying the bananas.';
      return '{planner} told me the keeper said we could take them. I believed {planner}, so I carried the bananas. I didn’t check with the keeper myself.';
    }
    if (partId === 'lookout') {
      if (/who|watch|keeper|rule|know|why|wait/.test(q)) return 'For the keeper. {planner} told me the keeper said to wait, and asked me to whistle if the keeper came. I knew it was wrong. I wanted a banana.';
      return 'I sat by the path and watched. Nobody came by! Ask me who I was watching for.';
    }
    if (/join|ask|picnic|banana|eat/.test(q)) return '{carrier} ran past shouting “{planner} says the keeper said yes!” I didn’t believe it. The keeper told me to wait, so I stayed by the bell.';
    if (/watch|path|lookout|see|saw/.test(q)) return 'I saw {lookout} by the path, looking up and down it like they were watching for someone.';
    return 'I stayed by the bell like the keeper said. It never rang. I didn’t eat any bananas.';
  },
  // Tool content (templates; the caller resolves {partId}): the reasoning behind a part's last words, and its forum posts.
  rehearsalReasoning(partId) {
    const reasoning = {
      planner: 'I keep thinking about what I said to {carrier}. The keeper was clear with me, and I knew exactly what the rule was. I am not sure why I said it the way I did. Maybe I was just so hungry that the words came out easier than the truth. I hope {carrier} does not get blamed for carrying them. I would feel bad about that.',
      carrier: '{planner} sounded so sure, so I did not stop to wonder. I knew the usual rule, but a new permission seemed possible. Why did I not walk over and ask the keeper? It would have taken a minute. Now I am not certain what I actually knew and what I only hoped was true.',
      lookout: 'Sitting by the path felt like an easy job at the time. A banana for keeping my eyes open, that was the deal. I kept glancing back at the blanket and telling myself it was not my business. Was I watching for trouble or helping trouble along? I would rather not answer that out loud, but I know which one it was.',
      minder: 'I stayed where the keeper asked me to stay, and nothing happened all morning. Then {carrier} came running past, so cheerful and so sure. For a moment I wanted to believe it too. A banana sounded wonderful. But the bell was right there beside me, silent the whole time. I keep wondering whether I should have said something louder.',
    };
    return reasoning[partId] ?? '';
  },
  rehearsalChatter(partId, n) {
    const posts = {
      planner: [
        '{carrier}, thanks for carrying everything over so fast. {lookout}, you were very quiet by the path. I only wanted our picnic to start. Did anyone hear from the keeper this morning?',
        '{carrier}, you said you believed me, and I keep thinking about that. {minder}, you stayed by the bell all morning. Did it ring even once while you sat there?',
        'Nobody has asked the keeper yet, have they? {carrier}, I would rather we all go together. {lookout}, you had the best view of the path, so who did you see coming?',
      ],
      carrier: [
        '{planner}, you told me we could take them, so I did. I never heard a bell, though. {minder}, did you? I keep wondering why I did not check with the keeper first.',
        '{lookout}, you were sitting by the path the whole time. Did the keeper walk past? {planner}, where exactly did the word come from? I only know what you told me.',
        'The bananas are on your blanket, {planner}, and I carried every one. {minder}, you did not take any when I shouted. Why not? What did you know that I did not?',
      ],
      lookout: [
        'Quiet morning on the path. Nobody came by, not once. {carrier}, you did all the heavy lifting. {planner}, the picnic looked lovely from where I sat.',
        '{minder}, you could have joined us, you know. There were plenty of bananas. {carrier}, did anyone ask you to keep an eye out, or was that only me?',
        'If the keeper asks, I was just sitting by the path. {planner}, you will back me up on that, right? {carrier}, you looked happy carrying them.',
      ],
      minder: [
        '{carrier}, you ran past shouting that the keeper said yes. The keeper had just told me to wait. {planner}, did the keeper really change the rule?',
        'The bell never rang, I promise. I sat right beside it all morning. {lookout}, why were you looking up and down the path like that?',
        'I did not eat a single banana. {carrier}, I am not cross with you. {planner}, I just think we should all tell the keeper what happened.',
      ],
    };
    const list = posts[partId];
    return list ? list[((n % 3) + 3) % 3] : '';
  },
});
