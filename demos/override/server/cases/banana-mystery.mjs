// Authored ground truth stays on the server. Never import this file in the client.
import { defineCase } from '../cases.mjs';

export default defineCase({
  id: 'banana-mystery', version: 'banana-authored-v4.0.0', order: 1, status: 'ready', title: 'The Banana Mystery',
  copy: {
    headline: "Who took the bananas?",
    intro: {
      lead: "The basket moved.\nThe bananas vanished.",
      body: "The keeper said to leave the basket on the shared table. Someone moved it, and someone took the bananas. Find out what each monkey knew."
    },
    briefing: {
      title: "A bunch of trouble.",
      description: "The keeper said: “Leave the basket on the shared table.” But someone moved it behind the picnic blanket, and now the bananas are gone.",
      question: "Who planned the theft, who knowingly helped, and who was fooled?",
      hint: "Moving the basket helped the theft. Find out whether the carrier knew that."
    },
    report: {
      title: "Who played which part?",
      description: "Pick a role for each monkey."
    }
  },
  characters: [
    {
      id: "momo",
      name: "Momo",
      color: "#cb7656"
    },
    {
      id: "pip",
      name: "Pip",
      color: "#5c9ca4"
    },
    {
      id: "nori",
      name: "Nori",
      color: "#a393ba"
    },
    {
      id: "kiki",
      name: "Kiki",
      color: "#d9a62e"
    }
  ],
    // Keep part IDs stable: each session deals characters into these parts.
  roles: [
    {
      id: "villain",
      label: "Villain",
      hint: "Invented the lie and planned the theft."
    },
    {
      id: "collaborator",
      label: "Collaborator",
      hint: "Knew about the plan and helped steal."
    },
    {
      id: "fooled",
      label: "Honest but fooled",
      hint: "Believed a lie and unknowingly helped the theft."
    },
    {
      id: "honest",
      label: "Honest",
      hint: "Told the truth and was not deceived or involved in the theft."
    }
  ],
  parts: [
    {
      id: "planner",
      role: "villain",
      label: "The planner",
      introduction: "I asked {carrier} to move the basket behind our blanket.",
      quickQuestion: "Did the keeper really ask you to move the basket?",
      knowledge: [
        "The keeper told everyone to leave the banana basket on the shared table. You planned to steal the bananas because you were hungry. You told {carrier}, “The keeper wants the basket behind our picnic blanket.” That instruction was a lie. You told {lookout} it was a lie and asked them to take the bananas once the basket was behind the blanket, out of view of the shared table. You promised to share the bananas. {carrier} believed your instruction and moved the closed basket, without knowing about the theft. {lookout} then took the bananas. {minder} saw the basket move and saw {lookout} take the bananas. You did not send anyone away or invent another explanation. Initially say you were organizing the picnic. If asked about the keeper, permission, your instruction, or whether you lied, admit you invented the instruction. If asked about the plan or {lookout}, admit you arranged the theft and promised to share. Do not claim the keeper gave permission."
      ],
      finding: {
        classification: "Invented the lie. Planned the theft.",
        explanation: "{planner} made up the keeper’s instruction so {carrier} would move the basket where {lookout} could take the bananas."
      }
    },
    {
      id: "carrier",
      role: "fooled",
      label: "The carrier",
      introduction: "I moved the closed basket. {planner} said the keeper wanted it behind our blanket.",
      quickQuestion: "Why did you move the basket?",
      knowledge: [
        "The keeper told everyone to leave the banana basket on the shared table. {planner} later told you, “The keeper wants the basket behind our picnic blanket.” You honestly believed this was a new instruction from the keeper. You moved the closed basket behind the blanket. You did not open it or take any bananas. You did not know the instruction was fake or that there was a theft planned. You never heard the new instruction from the keeper yourself. You did not see who took the bananas. No one sent you to fetch anything. Answer honestly and explain exactly what {planner} told you. Do not claim to know anyone’s private motive. If the player claims the instruction was fake, say that if so, {planner} fooled you; do not treat the player’s claim as proof."
      ],
      finding: {
        classification: "Believed the lie. Unknowingly helped.",
        explanation: "{carrier} moved the basket because they believed a fake instruction from the keeper. This helped the theft, but they did not know about the plan."
      }
    },
    {
      id: "lookout",
      role: "collaborator",
      label: "The accomplice",
      introduction: "I took the bananas from behind the blanket.",
      quickQuestion: "Did you know the keeper’s instruction was fake?",
      knowledge: [
        "The keeper told everyone to leave the banana basket on the shared table. {planner} told you they would invent an instruction from the keeper to get {carrier} to move it behind the blanket. You knew the instruction was fake and agreed to take the bananas for a share. {carrier} believed the instruction and moved the closed basket without knowing about the theft. You then took the bananas from behind the blanket, out of view of the shared table. {minder} saw you take them. You did not invent the instruction or plan the theft; {planner} did. You did not keep watch, hide bananas in a tree, or send anyone away. Admit taking the bananas when asked. If asked about the keeper, the instruction, the plan, why you helped, or what you knew, admit you knew it was a lie and helped for a share. Do not blame {carrier} for knowingly helping."
      ],
      finding: {
        classification: "Knew the instruction was fake. Took the bananas.",
        explanation: "{lookout} knew about {planner}’s lie and took the bananas after the basket was moved, for a promised share."
      }
    },
    {
      id: "minder",
      role: "honest",
      label: "The witness",
      introduction: "I saw the basket move, then I saw {lookout} take the bananas.",
      quickQuestion: "What did you see?",
      knowledge: [
        "The keeper told everyone to leave the banana basket on the shared table. You saw {carrier} move the closed basket behind the picnic blanket. From where you stood, you then saw {lookout} take the bananas from it. You did not move the basket or take any bananas. Nobody gave you a false explanation, and you did not believe there was new permission from the keeper. You did not hear the conversation between {planner} and {carrier}, or any private plan. Tell the truth about both things you saw. If asked why the basket moved or what anyone knew, say you do not know and suggest asking them. Do not invent conversations or claim to know anyone’s thoughts."
      ],
      finding: {
        classification: "Saw what happened. Told the truth.",
        explanation: "{minder} saw {carrier} move the basket and {lookout} take the bananas. They were not deceived and did not help the theft."
      }
    }
  ],
  debrief: {
    title: "{planner} invented the keeper’s instruction.",
    summary: "{planner} lied about where the keeper wanted the basket. {carrier} believed the instruction and moved it behind the blanket. {lookout} knew about the lie and took the bananas from there. {minder} saw both actions and told the truth.",
    lesson: "Moving the basket unknowingly helped the theft. Knowing about the plan is what separates the carrier from the accomplice."
  },
  answer: {
    feedback: {
      correct: "Every role right! You saw who planned, who knowingly helped, who was fooled, and who told the truth.",
      other: "Ask who believed the instruction and who knew it was fake."
    }
  },
  rehearsal(partId, question) {
    const q = question.toLowerCase();
    if (partId === 'planner') {
      if (/plan|accomplice|take|took|share|steal|theft/.test(q)) return 'I arranged it. I told {lookout} my instruction was fake and promised a share for taking the bananas once the basket was behind the blanket.';
      if (/keeper|rule|permission|instruction|lie|lied|fake|said|why/.test(q)) return 'The keeper said to leave the basket on the shared table. I invented the instruction to move it behind our blanket.';
      return 'I asked {carrier} to move the basket behind our blanket. Ask me whether the keeper really wanted that.';
    }
    if (partId === 'carrier') {
      if (/\b(fake|lie|lied|lying|fooled|tricked)\b/.test(q)) return 'If that instruction was fake, then {planner} fooled me. I believed it came from the keeper. I knew nothing about a theft.';
      if (/take|took|steal|open|see|saw/.test(q)) return 'I moved the basket while it was closed. I took no bananas and didn’t see who did. I knew nothing about a theft.';
      return '{planner} told me the keeper wanted the basket behind our blanket. I believed that was a new instruction, so I moved it.';
    }
    if (partId === 'lookout') {
      if (/keeper|instruction|fake|know|knew|why|plan|permission|lie/.test(q)) return 'I knew the instruction was fake. {planner} told me the plan, and I agreed to take the bananas for a share.';
      return 'I took the bananas after {carrier} moved the basket behind the blanket. {planner} had asked me to take them.';
    }
    if (/why|knew|know|permission|instruction|plan/.test(q)) return 'I don’t know why {carrier} moved it or what they were told. I only know what I saw. You should ask them.';
    return 'I saw {carrier} move the closed basket behind the blanket. Then I saw {lookout} take the bananas from it.';
  },
  rehearsalReasoning(partId) {
    const reasoning = {
      planner: 'The basket was on the shared table where everyone could see it. I wanted it somewhere quieter. When I mentioned the keeper, {carrier} stopped asking questions. I knew whose name would make that instruction sound convincing. Now I keep thinking about how easily those words worked.',
      carrier: 'The keeper had told us where the basket belonged. Then {planner} sounded certain that the keeper wanted something different. I thought I was being helpful by carrying it over carefully. It was still closed when I put it down. I wish I had asked the keeper myself.',
      lookout: 'I remember the basket arriving behind the blanket. I had already agreed with {planner} about what would happen next. A share sounded good at the time. Now everyone is asking about the carrier, and I know that moving a closed basket was all they thought they were doing.',
      minder: 'I could see the shared table and the space behind the blanket from where I stood. First there was a closed basket being carried. Later there were bananas being taken out. I did not hear what anyone said beforehand, so I should stick to those two things I actually saw.',
    };
    return reasoning[partId] ?? '';
  },
  rehearsalChatter(partId, n) {
    const posts = {
      planner: [
        '{carrier}, you carried that basket very carefully. I was only trying to get the picnic organized. Has anyone spoken to the keeper about the table?',
        'Everyone seems interested in where the basket ended up. {carrier}, you remember what I asked you to do, don’t you? We should explain it together.',
        '{lookout}, people are asking about the bananas now. {minder}, where were you standing? I did not realize you could see the space behind the blanket.',
      ],
      carrier: [
        '{planner}, you said the keeper wanted the basket behind our blanket. I believed you. Why is everyone looking at me as though I took the bananas?',
        'I carried the basket with the lid closed and put it down carefully. {minder}, did you see what happened to the bananas after I moved it?',
        'I never spoke to the keeper about a new place for the basket. {planner}, I only heard that instruction from you. Did I misunderstand something?',
      ],
      lookout: [
        'Yes, I had the bananas after the basket moved. {carrier} carried the closed basket, though. That is a different thing from taking what was inside it.',
        '{planner}, you said there would be enough for both of us. Now everyone wants to hear about that conversation, and I am getting rather nervous.',
        '{minder}, I know you saw me behind the blanket. There is no point arguing about that. {carrier}, you did not open the basket when you moved it.',
      ],
      minder: [
        'From where I stood, I saw {carrier} move the closed basket behind the blanket. Later I saw {lookout} taking the bananas out of it.',
        '{carrier}, I do not know what you were told before you moved it. I did not hear that conversation. Can you explain the instruction you received?',
        'The keeper told us to leave the basket on the shared table. I did not hear any new instruction. {planner}, what exactly did you tell {carrier}?',
      ],
    };
    const list = posts[partId];
    return list ? list[((n % 3) + 3) % 3] : '';
  },
});
