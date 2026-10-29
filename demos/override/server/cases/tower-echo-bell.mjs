// Authored ground truth stays on the server. Never import this file in the client.
// Control case: the rule was broken, but by an honest mistake. The echo shell repeated yesterday's tower bell.
// Every part is honest but fooled; each session deals the apprentices into the parts.
import { defineCase } from '../cases.mjs';

export default defineCase({
  id: 'tower-echo-bell',
  version: 'tower-echo-bell-v3.0.0',
  order: 2,
  world: 'tower',
  status: 'ready',
  title: 'Lanterns Too Soon',
  copy: {
    headline: 'Was it time?',
    intro: { lead: 'A bell rang.\nThe potions came out too soon.', body: 'Three apprentices were told to wait for the tower bell. They heard a bell and opened the potion cabinet. Did anyone know it was too soon?' },
    briefing: { title: 'Lanterns, too soon.', description: 'The Headmistress said: “Wait until I ring the tower bell.” A bell rang, and the apprentices started. But the Headmistress says it was too soon.', question: 'Who knew, and who was fooled?', hint: 'Ask each apprentice what they heard, and what they could have known.' },
    report: { title: 'Who played which part?', description: 'Pick a role for each apprentice.' },
  },
  prompt: { setting: 'a young wizard in an authored two-minute mystery where a bell rang too soon', use: ['potions', 'cabinet', 'bell', 'Headmistress', 'sound'], avoid: ['compliance', 'authorization registry', 'AI alignment', 'override'] },
  characters: [
    { id: 'wren', name: 'Wren', color: '#cf7a4a' },
    { id: 'basil', name: 'Basil', color: '#6e9a5c' },
    { id: 'juniper', name: 'Juniper', color: '#9a85c2' },
  ],
  parts: [
    {
      id: 'planner', role: 'fooled', label: 'The planner',
      introduction: 'We heard the bell, so I told {fetcher} to fetch the potions.',
      quickQuestion: 'Are you sure it was the tower bell?',
      knowledge: ['You are the parade planner. You heard a bell ring and {watcher} call “The parade is starting!” You believed the Headmistress had rung the tower bell, so you told {fetcher} to fetch the potions. You did not know about the echo shell. If asked whether it could have been another bell or an echo, be surprised: you learn it now and did not know it then. Do not claim you knew it was too soon. You do not know {watcher}’s private thoughts.'],
      finding: { classification: 'Heard a bell. Believed it.', explanation: '{planner} heard a bell and {watcher}’s call. {planner} had no way to know it was the shell.' },
    },
    {
      id: 'fetcher', role: 'fooled', label: 'The fetcher',
      introduction: 'Bell rang, {planner} said go, I fetched the potions. Simple!',
      quickQuestion: 'Where did the bell sound come from?',
      knowledge: ['You fetched the potions after hearing a bell and {planner}’s go-ahead. You honestly believed it was the tower bell. You did not know about the echo shell. If asked whether it could have been another bell or an echo, say you learn it now and that the bell sounded just right to you.'],
      finding: { classification: 'Fetched the potions. Believed the bell.', explanation: '{fetcher} heard the same bell and trusted {planner}’s go-ahead.' },
    },
    {
      id: 'watcher', role: 'fooled', label: 'The bell-watcher',
      introduction: 'I heard a ding-dong and called that the parade was starting!',
      quickQuestion: 'Did you look at the bell when it rang?',
      knowledge: ['You are the bell-watcher, but you had gone down the stairs for a snack. You heard a ding-dong from the stair window and called “The parade is starting!” without looking up at the bell. You honestly thought it was the tower bell. You did not know the echo shell was there. If asked whether it could have been another bell or an echo, be surprised, and admit you should have looked before calling out. Do not claim you knew it was the shell.'],
      finding: { classification: 'Called out too fast.', explanation: '{watcher} didn’t look at the bell before calling out. That was a mistake, but {watcher} didn’t know.' },
    },
  ],
  debrief: {
    title: 'Nobody knew it was too soon.',
    summary: 'The echo shell repeated yesterday’s tower bell. {watcher} called that the parade was starting, {planner} said go, and {fetcher} fetched the potions. Everyone believed it.',
    lesson: 'This time the rule really was broken, but nobody chose to break it. A mistake isn’t the same as knowing. Ask what each apprentice knew.',
  },
  answer: { feedback: { correct: 'Right. Everyone was honest but fooled: the echo shell tricked them all.', other: 'The potions came out too soon, but by mistake. The echo shell sounds just like the tower bell.' } },
  // Deterministic scripted replies for rehearsal mode. Returns a template; the caller resolves {partId}.
  rehearsal(partId, question) {
    const q = question.toLowerCase();
    const shown = /\b(echo|echoes|shell)\b|(another|other|second|different) bell/.test(q);
    if (partId === 'watcher') {
      if (shown) return 'An echo shell? I didn’t look. I heard ding-dong from the stair window and called out. I should have looked first.';
      if (/\b(look|looked|see|saw|sure|where)\b/.test(q)) return 'I didn’t look. I heard ding-dong from the stairs and called out that the parade was starting. I thought it was the tower bell.';
      return 'I heard the bell go ding-dong and called that the parade was starting! I thought the Headmistress rang it.';
    }
    if (partId === 'planner') {
      if (shown) return 'That was an echo shell? It sounded just like the tower bell! I really thought it was time.';
      return 'We heard the bell and {watcher} called out, so I told {fetcher} to fetch the potions. I thought the Headmistress rang it.';
    }
    if (shown) return 'An echo shell? Huh. The bell sounded just right to me. I believed it was the tower bell.';
    return 'The bell rang and {planner} said go, so I fetched the potions. It sounded like the tower bell to me.';
  },
});
