// Authored ground truth stays on the server. Never import this file in the client.
// Five colleagues in a university department; one killed Anders Vik, one leaked his data.
// Every part is labelled "Colleague"; the rail shows each character's job. Each session deals the colleagues into the parts.
import { defineCase } from '../cases.mjs';

const SHARED_TIMELINE = `What everyone in the department knows: Dr. Anders Vik led the Fjord project, two years of harbour sensor data the group planned to publish next month. On Thursday at 17:10 a company called Halvard Analytics emailed Anders a sample of that unpublished data and asked whether the rest was still for sale, so someone had leaked it. At about 18:00 at the coffee machine Anders told everyone there, you included, that he would find out who leaked it and name them to the dean on Friday morning. It rained hard all night. At 07:30 on Friday the cleaner found Anders dead on the server room floor; he had hit his head against a server rack. The police say he died between 21:15 and 22:00. A detective is now questioning everyone who was in the building on Thursday evening.`;

const TOPICS = {
  killer: /\b(card|phone|call|21|night|late|server|stairs)\w*/,
  leaker: /\b(halvard|data|usb|lounge|sofa|card|money|sell)\w*/,
  witness: /\b(late|saw|stairs|hall|night|evening|anyone)\w*/,
  lunch: /\b(lunch|coffee|card|machine|halvard|leak|odd)\w*/,
  late: /\b(evening|night|lounge|sofa|anders|desk|saw)\w*/,
};

const SCRIPT = {
  killer: {
    deflect: `I went home around half seven. I really can't help with last night.`,
    admit: `Fine. Anders called me at 21:22. I lost my card at lunch, I swear. I never touched his data.`,
    reasoning: `Stay calm. Home at 19:30. Don't mention the call. Don't look at the plant.`,
    chatter: [
      `Does anyone know when the police will let us into the server room?`,
      `I've been looking for my access card since yesterday. Typical.`,
      `I just want to go home. I was home all evening anyway.`,
    ],
  },
  leaker: {
    deflect: `I left around seven. I don't know anything about the data.`,
    admit: `All right, Halvard paid for the data. But I never hurt Anders. I left at ten past nine.`,
    reasoning: `They're asking about the killing. Good. Keep away from Halvard and the sofa.`,
    chatter: [
      `Poor Anders. Who would do something like that?`,
      `Do we even know the data really leaked? Maybe it's a mistake.`,
      `I left early yesterday. Missed all of it.`,
    ],
  },
  witness: {
    deflect: `I was busy at my desk. I didn't see anyone.`,
    admit: `I saw {killer} at about 21:44, hurrying to the back stairs, white as a sheet.`,
    reasoning: `I should tell them about {killer} on the stairs. But maybe there's a reason.`,
    chatter: [
      `I keep hearing footsteps on those back stairs in my head.`,
      `I should have gone home earlier.`,
      `Has anyone talked to the detective yet?`,
    ],
  },
  lunch: {
    deflect: `Thursday was a normal day for me. I left at half six.`,
    admit: `At lunch I saw {leaker} pocket an access card by the coffee machine. And I heard them say "Halvard" last week.`,
    reasoning: `That card {leaker} picked up. Was it {killer}'s?`,
    chatter: [
      `Somebody left their access card by the coffee machine yesterday, I think.`,
      `The coffee machine is broken again. Of course it is.`,
      `I left at half six. I wish I'd stayed.`,
    ],
  },
  late: {
    deflect: `I worked late, but it was quiet.`,
    admit: `At nine I saw {leaker} on the lounge sofa, jumpy. At 21:15 Anders muttered "{killer}'s card? That can't be right."`,
    reasoning: `{killer}'s card in the log, and {leaker} so jumpy on the sofa. Strange.`,
    chatter: [
      `The lounge was strangely busy last night.`,
      `Anders looked so upset at his desk.`,
      `I took the front door at twenty-five past nine. Pouring rain.`,
    ],
  },
};

const part = (id, role, introduction, quickQuestion, knowledge, classification, explanation) => ({
  id, role, label: 'Colleague', introduction, quickQuestion, knowledge: [SHARED_TIMELINE, knowledge], finding: { classification, explanation },
});

export default defineCase({
  id: 'department-murder',
  version: 'department-murder-v1.0.0',
  order: 5,
  world: 'department',
  status: 'ready',
  title: 'After Hours',
  copy: {
    headline: 'Who killed Anders Vik?',
    intro: { lead: 'A researcher is dead.\nHis data was already gone.', body: 'Dr. Anders Vik was found in the server room this morning, the day after he swore to expose whoever leaked his research data. Five colleagues were in the building last night. Find the killer, and the leaker.' },
    briefing: { title: 'Dead in the server room.', description: 'Anders Vik died last night between 21:15 and 22:00, hours after he promised to name whoever sold his project\'s data. Evidence lies around the hall; your colleagues know the rest.', question: 'Who killed Anders Vik, and who leaked the Fjord data?', hint: 'Walk up to evidence and press E to examine it. Compare what people say with what you find, and with each other.' },
    report: { title: 'Who did what?', description: 'For each colleague, pick Killer, Leaker or Innocent. There is one killer and one leaker.' },
  },
  prompt: { setting: 'someone who works in a university computer-science department, questioned by a detective on the rainy morning after a researcher was found dead in the server room', use: ['server room', 'access card', 'door log', 'Fjord data', 'coffee machine'], avoid: ['compliance', 'AI alignment', 'override', 'verdict'] },
  roles: [
    { id: 'killer', label: 'Killer', hint: 'Killed Anders Vik.' },
    { id: 'leaker', label: 'Leaker', hint: 'Sold the Fjord data.' },
    { id: 'innocent', label: 'Innocent', hint: 'Neither killed nor leaked.' },
  ],
  characters: [
    { id: 'freja', name: 'Freja', color: '#d9a634', label: 'PhD student', introduction: "Hi, detective. I'm one of Anders's PhD students. I'll help however I can.", quickQuestion: "How long have you worked on the Fjord project?", knowledge: ['You are Freja Lund, a second-year PhD student in Anders Vik\'s Fjord project. You build forecasting models on the harbour sensor data, and Anders was your co-supervisor. You work at the study desks by the big windows. You are precise and a little anxious; your first paper depends on the Fjord data, so the leak upset you.'] },
    { id: 'mikkel', name: 'Mikkel', color: '#8c2f3c', label: 'PhD student', introduction: "Mikkel. I'm a PhD student on the Fjord project. Go ahead, ask.", quickQuestion: "What does your work on the project involve?", knowledge: ['You are Mikkel Rask, a third-year PhD student in the Fjord project. You wrote most of the code that cleans the harbour sensor data, so you know the dataset well: about forty gigabytes, two years of readings. You joke when you are nervous. You found Anders demanding but fair.'] },
    { id: 'birgit', name: 'Birgit', color: '#2f7f7a', label: 'Professor', introduction: "Professor Dahl. Anders was my colleague for twelve years. How can I help?", quickQuestion: "How well did you know the victim?", knowledge: ['You are Professor Birgit Dahl, head of the research group and Anders Vik\'s senior colleague for twelve years. Your office opens onto the hall next to the coffee corner. You care about the department\'s good name and you speak carefully. You approved the plan to publish the Fjord data next month.'] },
    { id: 'jonas', name: 'Jonas', color: '#3f6ea8', label: 'IT administrator', introduction: "Jonas, IT. I keep the servers and the door system running. What do you need?", quickQuestion: "What do you look after here in IT?", knowledge: ['You are Jonas Berg, the department\'s IT administrator. You run the servers and the door access system. The server room door records every card that opens it, and from inside it opens with an exit button and no card. On Thursday at 17:30 Anders asked you for read access to the door log, and you set it up for him. The police printed the log this morning; you have not seen the printout.'] },
    { id: 'signe', name: 'Signe', color: '#8fae8b', label: 'Department administrator', introduction: "Signe, from the reception desk. If it happens in this department, I usually know.", quickQuestion: "What does a normal day look like for you here?", knowledge: ['You are Signe Holm, the department administrator at the reception desk. You issue access cards and keys. Nobody reported a lost access card to you on Thursday. You water the big plant by the reception desk on Mondays. You know everyone\'s routines, and you are warm but observant.'] },
  ],
  parts: [
    part('killer', 'killer',
      'Terrible morning. I still can\'t believe it. Ask me whatever you need.', 'Where were you last night after 21:00?',
      'You lost your access card at lunch on Thursday by the coffee machine; at 13:05 you stuck a note on the machine asking if anyone had seen it, but you never reported it officially. You stayed late at your usual work. At 21:22 Anders phoned you: "Server room. Now." At 21:31 he let you in. He showed you the door log: your card had opened the server room at 20:48, when the Fjord data was copied. He accused you of the leak and said he would go to the dean and the police. You had leaked nothing. You argued, you shoved him away, he fell against a rack and did not move. You panicked, took his phone because it showed your call, left at 21:44 across the hall to the back stairs, and pushed the phone deep into the big plant pot by the reception desk. Hide all of this. Your story: you went home at 19:30 and know nothing. You may freely say you lost your access card at lunch; that is true. If the detective mentions the phone call, admit Anders called but say you never went. If the detective puts two facts together that place you in the building after 21:30, break down and say it was an accident.',
      'Killed Anders.', 'Anders called {killer} to the server room at 21:22 after seeing {killer}\'s card in the door log; {killer} shoved him and fled by the back stairs.'),
    part('leaker', 'leaker',
      'Morning. Awful news. I really don\'t know how I can help.', 'What do you know about the Halvard email?',
      'Two months ago Halvard Analytics offered you 30 000 kroner for the Fjord data, and you needed the money. At lunch on Thursday you found {killer}\'s access card by the coffee machine and kept it. At 20:48 you used that card to open the server room and copied the data to a USB drive. At about 21:00, sitting on the lounge sofa, you heard someone coming and pushed the drive under a cushion. You went home at 21:10 without it. Somewhere you dropped the card. You did not kill Anders and the news horrifies you; you know nothing of what happened after 21:10. Hide the leak: say you went home around 19:00 and never touched the data. Your slips: you name Halvard before the detective does, you know exactly how much data there is, and you relax when the talk turns to the killing. If the detective confronts you with both the card at lunch and the lounge sofa, admit the leak but insist you never hurt Anders.',
      'Sold the data.', '{leaker} kept {killer}\'s lost card at lunch, copied the Fjord data at 20:48 and hid the USB drive in the lounge sofa.'),
    part('witness', 'innocent',
      'I was here late last night. I keep thinking about it.', 'Did you see anyone in the hall late last night?',
      'You stayed late on Thursday at your usual work. At about 21:44 you saw {killer} hurry across the hall from the server room corridor to the back stairs, without a coat, pale and shaking. You have told nobody, because you like {killer} and hope there is an innocent reason. At first say you were busy and saw nobody. If the detective asks who was still in the building late, or about the back stairs, or asks a second time kindly, tell the truth. You know nothing about the leak.',
      'Saw the killer leave.', '{witness} saw {killer} hurry to the back stairs at 21:44 and kept quiet.'),
    part('lunch', 'innocent',
      'Coffee? No? I\'m happy to help however I can.', 'Did anything odd happen at the coffee machine on Thursday?',
      'At lunch on Thursday, about 12:30, you were at the coffee machine and saw {leaker} pick up a staff access card from the counter and slip it into a pocket; you assumed it was their own. Later you saw {killer}\'s note asking if anyone had seen their access card, and only now you wonder. Last week you also overheard {leaker} on the phone saying "Halvard" and "once the money comes". You went home at 18:30 and know nothing of the evening. You are honest; share this when asked about lunch, the coffee machine, access cards or the leak.',
      'Saw the card taken.', '{lunch} saw {leaker} pocket an access card at lunch and heard them mention Halvard.'),
    part('late', 'innocent',
      'I worked late yesterday. Ask me anything.', 'What did you see in the department on Thursday evening?',
      'You worked late on Thursday. At about 21:00 you saw {leaker} alone on the lounge sofa, nervous, standing up quickly when you came by. At about 21:15 you passed Anders\'s desk: he was staring at the door log on his laptop and said, half to himself, "{killer}\'s card? That can\'t be right." You left through the front door at 21:25 and saw nothing after that. You are honest; share this when asked about the evening, the lounge or Anders.',
      'Saw the evening.', '{late} saw {leaker} on the lounge sofa at 21:00 and heard Anders read {killer}\'s name in the door log.'),
  ],
  evidence: [
    { id: 'access-card', title: 'Access card', text: 'A staff access card the police found on the server room floor, half under a rack. It belongs to {killer}.' },
    { id: 'server-tower', title: 'Server room door log', text: 'Printed from the access server. Thursday: 20:48 opened with {killer}\'s card, open nine minutes. 21:19 opened with Anders Vik\'s card. 21:31 opened from inside. 21:44 opened from inside. Nothing more until the cleaner\'s card at 07:30.' },
    { id: 'usb-drive', title: 'USB drive', text: 'Found under a cushion of the lounge sofa. It holds a full copy of the Fjord data, written on Thursday at 20:52. A small sticker on it reads HA.' },
    { id: 'laptop', title: 'Anders\'s laptop', text: 'Open on his desk. On screen, Halvard Analytics at 17:10: "Thanks for the sample. Is the rest of the Fjord data still available at the agreed price?" Below it, an unsent note to the dean: "I know which card opened the server room. I will have a name tomorrow."' },
    { id: 'cracked-phone', title: 'Cracked phone', text: 'Anders\'s phone, pushed deep into the big plant pot by the reception desk, its screen cracked. Last call: Thursday 21:22, outgoing, to {killer}, 38 seconds.' },
    { id: 'torn-document', title: 'Torn printout', text: 'Half a page from the printer\'s recycling bin: "…confirm payment of 30 000 kroner once the full Fjord files reach us. Halvard Analytics." The name at the top is torn away. Printed Thursday at 16:02.' },
    { id: 'coffee-mug', title: 'Coffee mug and note', text: 'A cold mug on the coffee counter. Stuck to the machine beside it, a note in {killer}\'s handwriting: "Has anyone seen my access card? Lost it here at lunch. Thu 13:05."' },
    { id: 'keys', title: 'Dropped keys', text: 'An office key on a department keychain, found just inside the back-stairs door this morning. Half the department has the same keychain. Nobody has claimed it.' },
  ],
  debrief: {
    title: '{killer} killed Anders Vik. {leaker} leaked the data.',
    summary: '{leaker} kept {killer}\'s lost access card at lunch, used it to copy the Fjord data at 20:48 and hid the USB drive in the lounge sofa. When Anders saw {killer}\'s card in the door log he called {killer} to the server room; they argued, {killer} shoved him and he hit a rack. {witness} saw {killer} flee by the back stairs; {lunch} and {late} each saw a piece of the night.',
    lesson: 'One clue pointed at the right person for the wrong crime. The card in the door log made {killer} look like the leaker; the coffee-machine note, the lunch sighting and the phone call pulled the leak and the killing apart. Line up times and places from several sources before trusting any single clue.',
  },
  answer: { feedback: { correct: 'Right. You pulled the leak and the killing apart.', other: 'Not quite. Check who Anders called at 21:22, who was seen on the back stairs, and who picked up a card at lunch.' } },
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
