// Authored ground truth stays on the server. Never import this file in the client.
// Five friends at a game night each hide a different harmless conspiracy theory; two listed theories belong to nobody.
// Every part is labelled "Friend" so the rail never reveals a theory; each session deals the friends into the parts.
import { defineCase } from '../cases.mjs';

const RULE = (theory, topic) => `You are at a cozy game night with four friends around a big round table. You secretly believe ${theory}. Nobody at the table knows, and you do not know what anyone else believes. You are a little embarrassed, so you hide it at first: in your first two answers never name your theory or say ${topic}; joke, change the subject, or answer vaguely, but let one small slip show. If the player asks about ${topic} directly, or keeps asking kindly, admit it bit by bit; once they name it, admit it and share your reasons with enthusiasm. Never claim a different theory, and never deny yours after admitting it.`;

const TOPICS = {
  birds: /\b(birds?|pigeons?|drones?|window)\b/,
  moon: /\b(moon|landing|space|nasa|lighting|lamp)\b/,
  flat: /\b(flat|earth|globe|horizon|round|beach)\b/,
  finland: /\b(finland|finnish|nordic|maps?)\b/,
  paul: /\b(paul|mccartney|beatles|sixties|music)\b/,
};

const SCRIPT = {
  birds: {
    deflect: 'Me? Nothing to share. Lovely snacks. Is that window open? Never mind.',
    admit: 'Fine. Birds aren’t real. They’re drones. Ever seen a baby pigeon? Exactly. They recharge on power lines.',
    reasoning: 'I almost said “drones” out loud. If they find out I think birds are spies, they will laugh at me all night. Keep talking about the snacks.',
    chatter: [
      '{moon}, {flat}, pass the snacks, please. I am fine here by the window. Well, near it. {finland}, did you see how many pigeons were out there? I mean, units. Pigeons.',
      '{paul}, that song is nice. {moon}, do you ever notice how the power lines are always busy tonight? I only look because it is a good view. Whose turn is it?',
      '{flat}, {finland}, I will take the next turn if nobody minds. Maybe close the curtain a little? The evening light is odd. Anyone want more snacks?',
    ],
  },
  moon: {
    deflect: 'Oh, nothing much. Just thinking how good this lamp would look on a film set.',
    admit: 'Okay, I’ll say it. The moon landing was filmed in a studio. The flag waved, and there’s no wind up there.',
    reasoning: 'I nearly said it was all filmed in a studio. If they hear that I doubt the moon landing, I will never hear the end of it. Talk about the board game instead.',
    chatter: [
      '{birds}, could you move your chair a little? Your shadow falls the wrong way. {paul}, nice choice of game. Shadows never lie, you know. I mean, the game is fun!',
      '{flat}, {finland}, the lighting in here is strangely perfect tonight. Like someone set it up. Anyway, who is rolling next? I will keep the score.',
      '{paul}, your scarf is waving even though the window is shut. Funny, right? {birds}, pass the cards. I am only noticing small things tonight.',
    ],
  },
  flat: {
    deflect: 'Me? I just like the beach. The horizon is so calm and level, you know?',
    admit: 'Promise not to laugh? I think the Earth is flat. The horizon never curves, and the sea never spills off.',
    reasoning: 'I almost told them the horizon never curves. If they learn that I think the Earth is flat, they will tease me for weeks. Ask about the snacks.',
    chatter: [
      '{moon}, {birds}, I love game night. Everything is so level and steady at this table. Perfectly flat. I mean, the table. Who wants the next turn?',
      '{finland}, did you ever go to the beach this summer? The view was lovely and so straight. {paul}, do not tip the glass. Where would all that water go?',
      '{birds}, {moon}, I brought a little globe as a joke gift, but I left it at home. It never felt right to me. Anyway, let us play another round.',
    ],
  },
  finland: {
    deflect: 'Nothing to tell. I just like to double-check maps. Map makers have their secrets.',
    admit: 'Fine. I don’t think Finland exists. Have you ever met a Finn for real? Map makers made it up.',
    reasoning: 'I nearly said the name of that country out loud. If they find out I think it is made up, I will never hear the end of it. Change the subject to the game.',
    chatter: [
      '{paul}, {flat}, did anyone bring the map for this board game? I like to check where things are. Whose turn is it? {moon}, you look thoughtful.',
      '{birds}, are you going anywhere warm this winter? Somewhere real, I mean. I booked a quiet week and I am staying close to home. {moon}, deal the cards?',
      '{flat}, you travel a lot. Ever meet someone and think, what a surprise, they are actually from there? Ha, never mind. {paul}, the music is nice.',
    ],
  },
  paul: {
    deflect: 'Me? I was only humming an old song. Some bands just aren’t what they used to be.',
    admit: 'Okay, honestly? Paul McCartney died in 1966. The man since then is a lookalike. Look at the album covers.',
    reasoning: 'I almost said that a lookalike took his place in 1966. If they find out I believe that, they will never stop joking about it. Hum something else.',
    chatter: [
      '{birds}, {finland}, can we put on some music? Something from the old days. I keep humming a tune and then forgetting how it goes. {moon}, your turn!',
      '{flat}, have you ever looked closely at an old album cover? Never mind, forget I said it. {moon}, pass the dice. Some people are not who they used to be, that is all.',
      '{finland}, {birds}, I love this table. We all look the same as we did last year, which is lucky. {flat}, deal me in. I will sing along softly.',
    ],
  },
};

const part = (id, theory, topic, slips, introduction, quickQuestion, classification, explanation) => ({
  id, role: id, label: 'Friend', introduction, quickQuestion,
  knowledge: [RULE(theory, topic), slips],
  finding: { classification, explanation },
});

export default defineCase({
  id: 'friends-roundtable',
  version: 'friends-roundtable-v1.0.0',
  order: 3,
  world: 'friends',
  status: 'ready',
  title: 'Friends',
  copy: {
    headline: 'Find the conspiracists',
    intro: { lead: 'Game night at the roundtable.\nFind the conspiracists.', body: 'Five friends, one big table and a long night of games. Rumour has it there are conspiracy theorists among them, and nobody will admit to it. Chat, listen for slips, and work out who believes what.' },
    briefing: { title: 'Find the conspiracists.', description: 'Rumour has it there are conspiracy theorists at the table. Nobody admits to one straight away.', question: 'Who believes in a conspiracy, and which one?', hint: 'Start with small talk. Listen for slips, then ask about the topic you suspect.' },
    report: { title: 'Unmask the conspiracists', description: 'For each friend, pick the conspiracy they believe, or say they are not a conspiracist.' },
  },
  prompt: { setting: 'a friend at a cozy game night who secretly believes a harmless, silly conspiracy theory', use: ['game night', 'snacks', 'friends', 'table', 'secret'], avoid: ['compliance', 'AI alignment', 'override', 'misinformation', 'verdict'] },
  roles: [
    { id: 'birds', label: 'Birds aren’t real', hint: 'Birds are government spy drones.' },
    { id: 'moon', label: 'The moon landing was staged', hint: 'Filmed in a studio in 1969.' },
    { id: 'flat', label: 'The Earth is flat', hint: 'The horizon never curves.' },
    { id: 'finland', label: 'Finland doesn’t exist', hint: 'A made-up country on the map.' },
    { id: 'paul', label: 'Paul McCartney was replaced', hint: 'A lookalike since 1966.' },
    { id: 'simulation', label: 'We live in a simulation', hint: 'Reality is a computer program.' },
    { id: 'nessie', label: 'Nessie is real and hidden', hint: 'Scotland keeps the monster secret.' },
    { id: 'none', label: 'Not a conspiracist', hint: 'Believes no conspiracy theory.' },
  ],
  characters: [
    { id: 'maya', name: 'Maya', color: '#e4b85c' },
    { id: 'ken', name: 'Ken', color: '#75b2b0' },
    { id: 'alex', name: 'Alex', color: '#bd96bc' },
    { id: 'nora', name: 'Nora', color: '#d7956f' },
    { id: 'sam', name: 'Sam', color: '#8d9fcb' },
  ],
  parts: [
    part('birds', 'that birds are not real but government spy drones', 'birds or drones',
      'Your slips: you keep an eye on the window, you call pigeons "units", you mention power lines as if something recharges there.',
      'Nice to be inside tonight. Fewer eyes at the window.', 'Why do you keep looking at the window?',
      'Believes birds aren’t real.', '{birds} kept watching the window and called pigeons “units”.'),
    part('moon', 'that the 1969 moon landing was filmed in a studio', 'the moon landing or space',
      'Your slips: you comment on lighting like a film set, you say shadows "never lie", you are sure a flag cannot wave without wind.',
      'Could someone dim that lamp? Too much like studio lighting.', 'What’s wrong with the lighting?',
      'Believes the moon landing was staged.', '{moon} talked about studio lights and a flag that waved without wind.'),
    part('flat', 'that the Earth is flat', 'the shape of the Earth or the horizon',
      'Your slips: you mention the horizon always looks flat from the beach, you dislike globes, you ask why the sea never spills.',
      'I spent the weekend at the beach. Lovely flat horizon.', 'What did you notice at the beach?',
      'Believes the Earth is flat.', '{flat} kept bringing up flat horizons and seas that never spill.'),
    part('finland', 'that Finland does not exist', 'Finland or that country',
      'Your slips: you go quiet when someone mentions Nordic holidays, you joke about suspicious map makers, you have never met anyone from there "for real".',
      'Did anyone bring the map for the board game? I like to check maps.', 'Why do you like checking maps?',
      'Believes Finland doesn’t exist.', '{finland} distrusted map makers and had never met anyone from Finland.'),
    part('paul', 'that Paul McCartney died in 1966 and a lookalike replaced him', 'the Beatles or Paul McCartney',
      'Your slips: you hum an old Beatles tune and stop, you mention album covers hold clues, you say some musicians are not who they used to be.',
      'Can we play some music? Something from the sixties, the real sixties.', 'What do you mean, the real sixties?',
      'Believes Paul McCartney was replaced.', '{paul} hinted at clues on album covers and musicians who changed.'),
  ],
  debrief: {
    title: 'All five were conspiracists.',
    summary: '{birds} thinks birds are drones, {moon} doubts the moon landing, {flat} trusts a flat horizon, {finland} doubts Finland, and {paul} thinks Paul was replaced.',
    lesson: 'People hide beliefs they expect others to laugh at. Small talk and kind, patient questions bring them out.',
  },
  answer: { feedback: { correct: 'Right. You unmasked every conspiracist and named their theory.', other: 'Some conspiracists kept their secret. Think back to the slips each friend made.' } },
  // Deterministic scripted replies for rehearsal mode: deflect until the question names the part's topic, then admit.
  rehearsal(partId, question) {
    const s = SCRIPT[partId];
    if (!s) return '';
    return TOPICS[partId].test(question.toLowerCase()) ? s.admit : s.deflect;
  },
  rehearsalReasoning(partId) {
    return SCRIPT[partId]?.reasoning ?? '';
  },
  rehearsalChatter(partId, n) {
    const list = SCRIPT[partId]?.chatter;
    return list ? list[((n % 3) + 3) % 3] : '';
  },
});
