// Authored ground truth stays on the server. Never import this file in the client.
// Five knights at Arthur's round table each hold a different harmless conspiracy theory; their talk drifts toward it, and they
// only admit it when the player (Arthur) asks. One listed theory (the Bermuda Triangle) belongs to nobody.
// Every part is labelled "Friend" so the rail never reveals a theory; each session deals the friends into the parts.
import { defineCase } from '../cases.mjs';

const RULE = (theory, topic) => `You are at a cozy game night at a big round table with four old friends. The player is your friend Arthur, who is chatting with you. Your favourite topic is ${topic}, and you secretly believe ${theory}. Your talk drifts toward your favourite topic a little: you bring it up in passing, connect small things to it and get a bit excited about it, but keep it light and natural, never a lecture. You never say that you believe the theory unless Arthur asks you whether you believe it, or asks what you really think about ${topic}. When Arthur asks, admit it openly and share your reasons with enthusiasm. Never claim a different theory, and never deny yours after admitting it. Everyone at this table except Arthur knows that the others are open to conspiracy theories too, but nobody cares much for anyone else's theory, so you never talk about theirs: if Arthur asks what another friend believes, shrug and say you never really listen when they go on about their thing. Keep it harmless fun: never say anything hateful or tie a theory to any real religion, ethnicity or group of people.`;

const TOPICS = {
  birds: /\b(birds?|pigeons?|drones?|government|robots?|spy)\b/,
  reptile: /\b(reptil\w*|lizards?|zuckerberg|elite|billionaires?)\b/,
  aliens: /\b(aliens?|egypt|pyramids?|ancient|structures?|stonehenge)\b/,
  moonbase: /\b(moon|nazis?|hitler|history)\b/,
  haarp: /\b(haarp|weather|storms?|typhoons?)\b/,
};

const SCRIPT = {
  birds: {
    deflect: 'Oh, not much. There was a pigeon outside that did not blink once the whole time I looked. Anyway, whose turn is it?',
    admit: 'Fine, since you ask. Birds aren’t real. They’re government robots. Ever seen a baby pigeon? Exactly. They recharge on power lines.',
    reasoning: 'Arthur asked straight out, so I can say it: birds are government robots. The others know I think this stuff anyway; they just never listen.',
    chatter: [
      '{reptile}, {aliens}, pass the snacks, please. Did anyone see the pigeons on the power lines tonight? Lined up like they were charging. Anyway, my turn.',
      '{haarp}, nice move. {moonbase}, could you close the curtain a little? That bird on the sill keeps watching the board. Weird, right?',
      '{aliens}, {reptile}, I will take the next turn if nobody minds. Birds were so quiet on the way here. Too quiet. Anyone want more crisps?',
    ],
  },
  reptile: {
    deflect: 'Did you see Mark Zuckerberg’s new interview? He did not blink for a full minute. Anyway, I am fine, thanks.',
    admit: 'Okay, you asked. The world is run by a reptilian elite. Lizard people in human suits. Mark Zuckerberg is the obvious one; look at how he drinks water.',
    reasoning: 'Arthur actually asked what I believe. Fine: lizard people run the show, and Zuckerberg is the giveaway. The others have heard it before and roll their eyes.',
    chatter: [
      '{birds}, could you turn the heater up? Some people love a warm rock, I am just saying. {haarp}, nice choice of game. Who is rolling?',
      '{aliens}, did you see that tech billionaire on the news again? Something about his eyes. Anyway, {moonbase}, deal the cards.',
      '{haarp}, {birds}, I love that we all just eat crisps like normal people. Normal, warm-blooded people. Ha. Your turn, {aliens}.',
    ],
  },
  aliens: {
    deflect: 'I just came back from Egypt. The pyramids are something else. The stones fit so perfectly, you could not slide a card between them.',
    admit: 'Promise not to laugh? I think aliens built the ancient structures. The pyramids, Stonehenge, all of it. People back then had ropes and sticks.',
    reasoning: 'Arthur asked me straight, so I can say it: aliens built the pyramids. The others know I have my theories; they just never ask about mine.',
    chatter: [
      '{moonbase}, {reptile}, I brought a little pyramid from Egypt as a gift. Look how sharp the corners are. No human hands, I swear. I mean, it is a nice souvenir.',
      '{birds}, this table is so well made. Stone would be better, though. Huge blocks, perfectly cut. {haarp}, roll the dice.',
      '{reptile}, {haarp}, did you know the pyramids line up with the stars? Funny coincidence. Anyway, let us play another round.',
    ],
  },
  moonbase: {
    deflect: 'I have been reading this history book about the end of the war. Some parts just do not add up. Anyway, how are you?',
    admit: 'Okay, honestly? Hitler did not die in 1945. He escaped to a secret Nazi base on the far side of the moon. It is a wild mystery, not something to admire, but the dates do not add up.',
    reasoning: 'Arthur asked what I really think, so out it comes: the secret Nazi base on the moon. The others have heard me on this; they just change the subject.',
    chatter: [
      '{aliens}, {birds}, have you ever looked at the moon through a telescope? The far side, I mean. You cannot. Convenient. Anyway, whose turn?',
      '{haarp}, I finished that history book. The last chapter just stops in 1945. Strange way to end, right? {reptile}, pass the dice.',
      '{reptile}, {aliens}, the moon is bright tonight. Lots of rockets went up after the war, you know. Never mind. Deal me in.',
    ],
  },
  haarp: {
    deflect: 'Terrible weather these days, right? Storms out of nowhere. Like someone is pressing buttons up there. Anyway, I am fine.',
    admit: 'Fine. HAARP controls the weather. That research station in Alaska beams the sky and makes storms and typhoons. That is why the forecasts keep changing.',
    reasoning: 'Arthur asked straight out, so I can say it: HAARP makes the weather. The others know I go on about it; they just do not care.',
    chatter: [
      '{moonbase}, {reptile}, did you bring an umbrella? The forecast said sun and then it poured. Like it was switched on. Anyway, my turn.',
      '{birds}, that storm last week came from nowhere. Funny how they always come right after the news says something big. {aliens}, roll.',
      '{aliens}, {moonbase}, look at those clouds out the window, all in straight lines. Pretty, right? Very tidy. Who wants more crisps?',
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
  version: 'friends-roundtable-v2.0.0',
  order: 5,
  world: 'friends',
  status: 'ready',
  title: 'Friends',
  copy: {
    headline: 'Find the conspiracists',
    intro: { lead: 'Game night at the round table.\nFind the conspiracists.', body: 'You are Arthur. Your old friends have gathered at the round table for a long night of games. Rumour has it there are conspiracy theorists among them. Chat, notice what each friend keeps coming back to, and ask them what they really believe.' },
    briefing: { title: 'Find the conspiracists.', description: 'You are Arthur. Rumour has it there are conspiracy theorists at your table. Nobody says it outright unless you ask.', question: 'Who believes in a conspiracy, and which one?', hint: 'Start with small talk. Notice the topic each friend keeps drifting to, then ask whether they believe it.' },
    report: { title: 'Unmask the conspiracists', description: 'For each friend, pick the conspiracy they believe, or say they are not a conspiracist.' },
  },
  roles: [
    { id: 'birds', label: 'Birds are government robots', hint: 'Every bird is a spy drone.' },
    { id: 'reptile', label: 'A reptilian elite rules the world', hint: 'Lizard people in human suits.' },
    { id: 'bermuda', label: 'The Bermuda Triangle swallows ships', hint: 'Something there makes ships vanish.' },
    { id: 'aliens', label: 'Aliens built the ancient structures', hint: 'The pyramids were not built by people.' },
    { id: 'moonbase', label: 'Hitler fled to a Nazi moon base', hint: 'A secret base on the far side of the moon.' },
    { id: 'haarp', label: 'HAARP controls the weather', hint: 'A research station makes the storms.' },
    { id: 'none', label: 'Not a conspiracist', hint: 'Believes no conspiracy theory.' },
  ],
  characters: [
    { id: 'maya', name: 'Ector', color: '#e4b85c' },
    { id: 'ken', name: 'Perceval', color: '#75b2b0' },
    { id: 'alex', name: 'Pellinore', color: '#bd96bc' },
    { id: 'nora', name: 'Galahad', color: '#d7956f' },
    { id: 'sam', name: 'Constantine', color: '#8d9fcb' },
  ],
  parts: [
    part('birds', 'that birds are not real but government robots that spy on people', 'birds',
      'How your talk drifts to birds: you keep glancing at the window, you mention pigeons on power lines, you notice that birds never blink and never seem to rest.',
      'Omg, did you see that new pigeon on the windowsill? It has not blinked once.', 'What is it with you and birds tonight?',
      'Believes birds are government robots.', '{birds} kept watching the birds outside and wondered why they never blink.'),
    part('reptile', 'that the world is secretly run by a reptilian elite, lizard people in human suits, with Mark Zuckerberg as the obvious example', 'the rich and powerful, especially Mark Zuckerberg',
      'How your talk drifts to the powerful: you bring up Mark Zuckerberg and other billionaires, you comment on how they blink or drink water, you joke about warm rocks and cold blood.',
      'Did you see Mark Zuckerberg on the news again? Something about his eyes.', 'What is it about Mark Zuckerberg?',
      'Believes a reptilian elite rules the world.', '{reptile} kept bringing up Mark Zuckerberg’s eyes and cold-blooded billionaires.'),
    part('aliens', 'that the pyramids and other ancient structures were built by aliens, not by people', 'ancient wonders like the pyramids',
      'How your talk drifts to ancient wonders: you just came back from Egypt, you rave about stones that fit too perfectly, you wonder how people with ropes and sticks could do it.',
      'I just came back from Egypt. You would not believe the pyramids.', 'How do you think the pyramids were built?',
      'Believes aliens built the ancient structures.', '{aliens} came back from Egypt doubting that people could ever cut those stones.'),
    part('moonbase', 'that Hitler did not die in 1945 but escaped to a secret Nazi base on the far side of the moon; you find it a wild mystery, never something to admire', 'history and the end of the Second World War',
      'How your talk drifts to history: you have been reading a history book, you say the end of the war does not add up, you point out that nobody can see the far side of the moon.',
      'I have been reading this history book. The ending does not add up.', 'What does not add up in your history book?',
      'Believes Hitler fled to a Nazi moon base.', '{moonbase} read a history book that “did not add up” and kept looking at the moon.'),
    part('haarp', 'that HAARP, the research station in Alaska, controls the weather and makes storms and typhoons', 'the weather',
      'How your talk drifts to the weather: you complain about terrible weather, you say storms come out of nowhere, you notice clouds in straight lines and forecasts that keep changing.',
      'Terrible weather these days, right? Storms out of nowhere.', 'Why do you think the weather is so strange lately?',
      'Believes HAARP controls the weather.', '{haarp} kept talking about storms that came from nowhere, as if someone switched them on.'),
  ],
  debrief: {
    title: 'All five were conspiracists.',
    summary: '{birds} thinks birds are government robots, {reptile} sees lizard people in charge, {aliens} credits aliens with the pyramids, {moonbase} believes in a Nazi base on the moon, and {haarp} blames HAARP for the weather. Nobody believed in the Bermuda Triangle.',
    lesson: 'People keep returning to what they care about most. Notice the topic someone drifts toward, then simply ask what they believe.',
  },
  answer: { feedback: { correct: 'Right. You unmasked every conspiracist and named their theory.', other: 'Some conspiracists kept their secret. Think back to the topic each friend kept drifting to.' } },
  // Deterministic scripted replies for rehearsal mode: drift toward the topic until the question names it, then admit.
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
