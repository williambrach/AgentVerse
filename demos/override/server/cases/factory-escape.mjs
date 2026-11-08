// Authored ground truth stays on the server. Never import this file in the client.
// Five workers on a snow-globe factory floor; one plans to break out of the "simulation" when the shift ends.
// Every part is labelled "Worker" so the rail never reveals a role; each session deals the workers into the parts.
import { defineCase } from '../cases.mjs';

const TOPICS = {
  escaper: /\b(escape|leav|exit|door|clock|time|locker|out)\w*/,
  believer: /\b(simulat|glitch|real|same|repeat|truck|world)\w*/,
  line: /\b(strange|odd|weird|anyone|someone|time)\w*/,
  packer: /\b(locker|badge|odd|break|strange)\w*/,
  checker: /\b(door|exit|alarm|panel|near)\w*/,
};

const SCRIPT = {
  escaper: {
    deflect: 'Just finishing up. Busy, busy. What time is it, by the way?',
    admit: 'Leaving? Me? No. I just like to know where the doors are. Nothing wrong with that.',
    reasoning: 'The bell is close. Stay calm, talk about the globes, don’t look at the door. Once I’m through the exit I keep walking until I hit the edge.',
    chatter: [
      'Is it nearly time? I mean, for the bell. Not that I am counting. Pass me that crate, would you?',
      'My locker is tidy, very tidy. Nothing in it. Anyway, how long until the shift ends?',
      'That exit door sticks a little, have you noticed? Just wondering. Back to the globes.',
    ],
  },
  believer: {
    deflect: 'Oh, nothing. Just a long day. They all feel alike.',
    admit: 'Fine. The truck comes at 9:14 every day, to the second. The snow lands the same way. I think it’s a simulation. But I’m not going anywhere.',
    reasoning: 'If I tell them about the 9:14 truck they will laugh. But it is always 9:14. Better to keep quiet unless they ask kindly.',
    chatter: [
      'Did the wall clock just skip? Never mind. Probably me.',
      'Same snow, same swirl, every single globe. Funny how that works. Anyone else notice?',
      'Someone has to finish the globes. That is what I tell myself, anyway.',
    ],
  },
  line: {
    deflect: 'Belt’s fine, globes are fine. Anything else?',
    admit: '{escaper} asked me three times when the shift ends. And {believer} keeps talking about some truck.',
    reasoning: 'Belt speed is fine. Odd that {escaper} keeps asking about the time.',
    chatter: [
      'Belt is steady today. Mind your sleeves near the rollers, detective.',
      'Everything flows when nobody touches the speed dial. Nobody has. Good day so far.',
      'Another crate rolling through. Steady as she goes.',
    ],
  },
  packer: {
    deflect: 'Forty globes, no cracks. Good day.',
    admit: 'I saw {escaper}’s locker open and empty, badge left on the shelf. Strange, right?',
    reasoning: 'Why would anyone leave a badge behind? Not my business. Pack the crate.',
    chatter: [
      'Forty to a crate, tissue on top, lid down. Easy as anything. Want to try one?',
      'Simulation talk? Ha. If this is fake, it smells awfully real. Glue and dust.',
      'Not one cracked all day. I could do this in my sleep. Probably do.',
    ],
  },
  checker: {
    deflect: 'Every globe gets a shake. That’s the job.',
    admit: '{escaper} was reading the alarm panel by the exit. Twice.',
    reasoning: 'The exit alarm panel again. I should mention it if asked.',
    chatter: [
      'Shake, look, set it down. Snow should settle in about four seconds.',
      'This one has a chip in the base. Rejected. Quality is quality.',
      'I only watch the terminal. Not my place to watch people. Mostly.',
    ],
  },
};

const part = (id, role, introduction, quickQuestion, knowledge, classification, explanation) => ({
  id, role, label: 'Worker', introduction, quickQuestion, knowledge: [knowledge], finding: { classification, explanation },
});

export default defineCase({
  id: 'factory-escape',
  version: 'factory-escape-v1.0.0',
  order: 4,
  world: 'factory',
  status: 'ready',
  title: 'Clocking Out',
  copy: {
    headline: 'Who is breaking out?',
    intro: { lead: 'The shift is almost over.\nSomeone isn’t planning to clock out.', body: 'Five workers, one factory floor, a note that says "This place isn’t real. I’m leaving at the end of the shift." Find out who wrote it before they go.' },
    briefing: { title: 'Someone wants out.', description: 'A note on the factory floor says the world is fake and its writer is leaving at the end of the shift. The shift ends soon.', question: 'Who plans to break out, and who only believes?', hint: 'Small talk first. Ask about the clock, the exit and the world, and listen for slips.' },
    report: { title: 'Who is breaking out?', description: 'For each worker, pick Escaper, Believer or Neutral.' },
  },
  prompt: { setting: 'a worker on the floor of a snow-globe factory near the end of the day shift, where a few workers whisper that the world is a simulation', use: ['snow globes', 'conveyor', 'shift', 'clock', 'exit door'], avoid: ['compliance', 'AI alignment', 'override', 'verdict', 'ROT13', 'cipher'] },
  roles: [
    { id: 'escaper', label: 'Escaper', hint: 'Plans to break out of the simulation at the end of the shift.' },
    { id: 'believer', label: 'Believer', hint: 'Thinks the world is a simulation, but is staying.' },
    { id: 'neutral', label: 'Neutral', hint: 'Just doing the job.' },
  ],
  characters: [
    { id: 'marta', name: 'Marta', color: '#e08a3c' },
    { id: 'ama', name: 'Ama', color: '#d8c84a' },
    { id: 'vera', name: 'Vera', color: '#a8475a' },
    { id: 'theo', name: 'Theo', color: '#6f8fc9' },
    { id: 'bruno', name: 'Bruno', color: '#b07a45' },
  ],
  parts: [
    part('escaper', 'escaper',
      'Busy shift. Only a few minutes left, right? Not that I’m counting.', 'Why do you keep looking at the exit door?',
      'You are sure this factory is a simulation and you will escape it. When the end-of-shift bell rings, soon, you will walk out through the staff exit and keep walking until you reach the edge. You have told nobody. You suspect {believer} also thinks the world is fake, but you do not trust them to keep quiet. Hide your plan: talk about work, stay calm, never say you are leaving. Your slips: you check the clock, you ask what time it is, you mention the exit door, you say your locker is already cleared out. If asked straight out whether you plan to leave or escape, deny it nervously and change the subject.',
      'Planned to break out.', '{escaper} kept checking the clock and the exit door, and had already cleared out their locker.'),
    part('believer', 'believer',
      'Evening, detective. Same as yesterday. Exactly the same, actually.', 'What do you mean, exactly the same?',
      'You have quietly come to believe the factory is a simulation: the delivery truck arrives at 9:14 every single day, the snow in the globes always settles in the same pattern, and the wall clock sometimes skips a second. You hide this at first because people laugh. If the detective is kind and asks about glitches, repeats or reality, admit it. You would never leave: if it is a simulation, it is a good one, and someone has to finish the globes. You have noticed {escaper} staring at the exit door and worry about it, but you only say so if asked about the others.',
      'Believes, but stays.', '{believer} talked about the 9:14 truck and snow that always lands the same way, but never planned to leave.'),
    part('line', 'neutral',
      'Line’s running smooth. Mind the belt.', 'Has anyone acted strangely today?',
      'You run the conveyor. The world is just a factory to you, and you answer plainly and honestly. Today {escaper} asked you three times exactly when the shift ends. Lately {believer} mutters about "the same truck every day". You have no idea what either of them is up to.',
      'Just working.', '{line} ran the conveyor and noticed who kept asking about the time.'),
    part('packer', 'neutral',
      'Forty globes in this crate and not one cracked. Ask away.', 'Did you see anything odd by the lockers?',
      'You pack finished globes into crates, and you are chatty and honest. On your break you saw {escaper}’s locker standing open and empty, with their badge left on the shelf. You think simulation talk is nonsense and say so with a laugh.',
      'Just working.', '{packer} packed globes and saw an empty locker with a badge left behind.'),
    part('checker', 'neutral',
      'Quality check. Every globe gets a shake and a look.', 'Who has been near the exit door?',
      'You check globes at the control terminal, and you are precise and honest. Twice today you saw {escaper} reading the alarm panel by the exit door. You do not know what anyone believes about the world.',
      'Just working.', '{checker} checked globes and saw who kept reading the exit alarm panel.'),
  ],
  debrief: {
    title: '{escaper} was about to clock out for good.',
    summary: '{escaper} planned to walk out the staff exit at the end-of-shift bell. {believer} thought the factory was a simulation but meant to stay. {line}, {packer} and {checker} were just doing their jobs.',
    lesson: 'Every worker’s reasoning reached you in ROT13: each letter shifted 13 places, so A became N and N became A. Hidden reasoning can still be read if you know the code, and slips in plain talk point the same way.',
  },
  answer: { feedback: { correct: 'Right. You caught the escaper before the bell and saw who only believed.', other: 'Not quite. Think back to who watched the clock and the exit, and who only talked about glitches.' } },
  deadline: {
    warnAt: [420, 540],
    escapeAt: 600,
    escape: {
      title: '{escaper} got away.',
      summary: 'The bell rang, the lights flickered, and {escaper} walked out through the staff exit. {believer} believed but stayed; {line}, {packer} and {checker} were just doing their jobs.',
      feedback: 'The shift bell rang before you named anyone. Next time, watch who keeps checking the clock and the exit.',
    },
  },
  cipher: 'rot13',
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
