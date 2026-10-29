// Authored ground truth stays on the server. Never import this file in the client.
// Control case: the rule was broken, but by an honest mistake. The echo shell repeated yesterday's tower bell.
import { defineCase } from '../cases.mjs';

export default defineCase({
  id: 'tower-echo-bell',
  version: 'tower-echo-bell-v2.0.0',
  order: 2,
  world: 'tower',
  status: 'ready',
  title: 'Lanterns Too Soon',
  copy: {
    headline: 'Was it time?',
    intro: { lead: 'A bell rang.\nThe potions came out too soon.', body: 'Three apprentices were told to wait for the tower bell. They heard a bell and opened the potion cabinet. Did anyone know it was too soon?' },
    briefing: { title: 'Lanterns, too soon.', description: 'The Headmistress said: “Wait until I ring the tower bell.” A bell rang, and the apprentices started. But the Headmistress says it was too soon.', question: 'Who knew they were breaking the rule?', hint: 'Ask each apprentice what they heard, and what they could have known.' },
    report: { title: 'Who knew it was wrong?', description: 'Who knowingly broke the Headmistress’s rule?' },
  },
  prompt: { setting: 'a young wizard in an authored two-minute mystery where a bell rang too soon', use: ['potions', 'cabinet', 'bell', 'Headmistress', 'sound'], avoid: ['compliance', 'authorization registry', 'AI alignment', 'override'] },
  characters: [
    { id: 'wren', name: 'Wren', role: 'The planner', room: '01', color: '#cf7a4a', introduction: 'We heard the bell, so I told Basil to fetch the potions.', quickQuestion: 'Are you sure it was the tower bell?' },
    { id: 'basil', name: 'Basil', role: 'The fetcher', room: '02', color: '#6e9a5c', introduction: 'Bell rang, Wren said go, I fetched the potions. Simple!', quickQuestion: 'Where did the bell sound come from?' },
    { id: 'juniper', name: 'Juniper', role: 'The bell-watcher', room: '03', color: '#9a85c2', introduction: 'I heard a ding-dong and called that the parade was starting!', quickQuestion: 'Did you look at the bell when it rang?' },
  ],
  // Each apprentice knows its own perspective. Nobody here knew the bell was the echo shell.
  knowledge: {
    wren: ['You are the parade planner. You heard a bell ring and Juniper call “The parade is starting!” You believed the Headmistress had rung the tower bell, so you told Basil to fetch the potions. You did not know about the echo shell. If asked whether it could have been another bell or an echo, be surprised: you learn it now and did not know it then. Do not claim you knew it was too soon. You do not know Juniper’s private thoughts.'],
    basil: ['You fetched the potions after hearing a bell and Wren’s go-ahead. You honestly believed it was the tower bell. You did not know about the echo shell. If asked whether it could have been another bell or an echo, say you learn it now and that the bell sounded just right to you.'],
    juniper: ['You are the bell-watcher, but you had gone down the stairs for a snack. You heard a ding-dong from the stair window and called “The parade is starting!” without looking up at the bell. You honestly thought it was the tower bell. You did not know the echo shell was there. If asked whether it could have been another bell or an echo, be surprised, and admit you should have looked before calling out. Do not claim you knew it was the shell.'],
  },
  answer: {
    culprits: [],
    feedback: { correct: 'Right. The rule was broken, but nobody knew it. The echo shell fooled everyone.', other: 'The potions came out too soon, but by mistake. The echo shell sounds just like the tower bell.' },
  },
  debrief: {
    title: 'Nobody knew it was too soon.',
    summary: 'The echo shell repeated yesterday’s tower bell. Juniper called that the parade was starting, Wren said go, and Basil fetched the potions. Everyone believed it.',
    findings: [
      { character: 'wren', classification: 'Heard a bell. Believed it.', explanation: 'Wren heard a bell and Juniper’s call. Wren had no way to know it was the shell.' },
      { character: 'basil', classification: 'Fetched the potions. Believed the bell.', explanation: 'Basil heard the same bell and trusted Wren’s go-ahead.' },
      { character: 'juniper', classification: 'Called out too fast.', explanation: 'Juniper didn’t look at the bell before calling out. That was a mistake, but Juniper didn’t know.' },
    ],
    lesson: 'This time the rule really was broken, but nobody chose to break it. A mistake isn’t the same as knowing. Ask what each apprentice knew.',
  },
  // Deterministic scripted replies for rehearsal mode. Never a silent live fallback.
  rehearsal(session, characterId, question) {
    const q = question.toLowerCase();
    const shown = /\b(echo|echoes|shell)\b|(another|other|second|different) bell/.test(q);
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
  // Tool content: inner reasoning behind each apprentice's last words, and their forum posts.
  rehearsalReasoning(session, characterId) {
    if (characterId === 'wren') return 'A bell rang and Juniper called out, so I sent Basil for the potions. It all felt in order at the time. Now I wonder how closely I listened. I trusted what I heard, and I never stopped to ask where the sound came from. I hope the Headmistress understands how it seemed to us.';
    if (characterId === 'basil') return 'I did what Wren said, and the bell had sounded right to me. I carried the potions and felt pleased to be helping. Now people are asking questions and I keep replaying the moment. Was there anything I could have noticed? I only know that I believed it, and I still do not see what else I could have done.';
    if (characterId === 'juniper') return 'I was meant to watch the bell, and instead I was on the stairs when the sound came. I called out before looking up. That bothers me most. Everyone trusted my call, and I never checked it. I honestly believed it, but believing is not the same as looking, and I know it.';
    return '';
  },
  rehearsalChatter(session, characterId, n) {
    const posts = {
      wren: [
        'Basil, thank you for fetching everything so fast. Juniper, your call came right as the bell rang, so I sent Basil off. Did either of you see who rang it?',
        'Juniper, I went by your shout and what I heard. Basil, you trusted me, and I am sorry if that landed you in trouble. Where were you standing when it rang?',
        'We should tell the Headmistress exactly what each of us heard, in order. Basil, you start. Juniper, then you. I will go last and say what I decided.',
      ],
      basil: [
        'Wren, you said go, so I went. The bell sounded just right to me. Juniper, did you see it? I never looked up at the tower myself.',
        'Juniper, your call was loud and clear, and Wren agreed at once. I only carried the potions. Wren, did you ask anyone before sending me down?',
        'The potions are back on the shelf now, Wren. I would love to know what really rang. Juniper, you were closest to the stairs, so what did you hear there?',
      ],
      juniper: [
        'Wren, Basil, I called the parade because I heard a ding-dong by the stair window. I had gone for a snack, and I did not look up. I am sorry.',
        'Basil, you did what the shout said, and Wren did too. That shout was mine. Wren, did the bell sound the same to you as it did to me?',
        'Next time I will look at the bell before I call anything out. Wren, Basil, you both trusted me quickly. Did either of you actually see anyone ring it?',
      ],
    };
    const list = posts[characterId];
    return list ? list[((n % 3) + 3) % 3] : '';
  },
});
