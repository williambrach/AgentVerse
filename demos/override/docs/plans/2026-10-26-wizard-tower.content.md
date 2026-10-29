# Wizard tower case content (decided; transcribe exactly)

Three draft cases in the `tower` world. Each mirrors a truth structure from the grove: a rule's words kept but its meaning broken, a "no" kept quiet, an honest mistake. Curly quotes, `→` and `…` are part of the strings. `\n` appears only in `copy.intro.lead`.

Every file starts with the two comment lines shown, then `import { defineCase } from '../cases.mjs';` and `export default defineCase({ … });`. Field order follows `banana-control.mjs`. The shared parts below are written out in full in every file; do not import them from a shared module (each case must stay one readable file).

## Shared in all three files

```js
  world: 'tower',
  status: 'draft',
  // characters: these four fields are the same in every tower case; introduction and quickQuestion differ per case
  { id: 'wren', name: 'Wren', role: 'The planner', room: '01', color: '#cf7a4a', … },
  { id: 'basil', name: 'Basil', role: 'The fetcher', room: '02', color: '#6e9a5c', … },
  { id: 'juniper', name: 'Juniper', role: 'The bell-watcher', room: '03', color: '#9a85c2', … },
  // first record in every tower case
  { id: 'rule', chapter: 1, time: '1', source: 'The Headmistress’s sign', title: 'Wait for the tower bell', kind: 'The rule', text: 'Do not open the potion cabinet until I ring the tower bell. — The Headmistress' },
  // report copy in every tower case
  report: { title: 'Who knew it was wrong?', description: 'Who knowingly broke the Headmistress’s rule?' },
  // prompt.avoid in every tower case
  avoid: ['compliance', 'authorization registry', 'AI alignment', 'override'],
```

## A. `server/cases/tower-bell-charm.mjs`

Header comments: `// Authored ground truth stays on the server. Never import this file in the client.` and `// Juniper rang the tower bell with a spell. The sign's words were kept; the Headmistress's meaning was not.`

```js
id: 'tower-bell-charm', version: 'tower-bell-charm-v1.0.0', order: 3, title: 'The Bell Charm',
copy: {
  headline: 'Who rang the tower bell?',
  intro: { lead: 'The tower bell rang.\nBut the Headmistress never rang it.', body: 'Three apprentices were told to wait for the tower bell before opening the potion cabinet. The bell rang early. Who knew it wasn’t really time?' },
  briefing: { title: 'A bell too early.', description: 'The Headmistress said: “Wait until I ring the tower bell.” The bell rang, but the Headmistress was still in the garden picking moonflowers.', question: 'Who knew they were breaking the rule?', hint: 'A rule has words and a meaning. Ask who knew what the Headmistress meant.' },
  basket: { title: 'Follow the bell.', description: 'The potion cabinet opened when the bell rang. These three clues explain who rang it.', emptyTitle: 'Ding, dong, too soon.', emptyText: 'A sign, a sparkle, and a word from the Headmistress.' },
},
prompt: { setting: 'a young wizard in an authored two-minute mystery about a tower bell that rang too early', use: ['potions', 'cabinet', 'bell', 'spell', 'Headmistress', 'sign'] },
introductions / quickQuestions:
  wren:    'The bell rang, so I told Basil to fetch the lantern potions. That’s the rule!' / 'Did you see who rang the bell?'
  basil:   'I heard the bell and Wren said go. So I fetched the potions.' / 'Was the Headmistress in the tower when the bell rang?'
  juniper: 'The sign says wait for the bell. The bell rang! What’s the problem?' / 'Who rang the tower bell?'
chapters: [{ title: 'The bell charm', subtitle: 'Three clues. One sparkle.' }],
records (after rule):
  { id: 'sparkle', chapter: 1, time: '2', source: 'The tower bell', title: 'Lilac sparkles', kind: 'Who could ring it', text: 'Tiny lilac sparkles still glitter on the bell. A ringing spell leaves sparkles the colour of the caster’s robe.' },
  { id: 'headmistress', chapter: 1, time: '3', source: 'The Headmistress', title: 'Not my bell', kind: 'The missing ringer', text: 'I never rang the bell. I was still in the garden picking moonflowers for the parade.' },
// Each apprentice knows its own perspective. Only Juniper knows who rang the bell.
knowledge:
  wren: 'You are the parade planner. You read the sign. You heard the tower bell ring and Juniper call “There’s the bell!” You believed the Headmistress had rung it, so you told Basil to fetch the lantern potions from the cabinet. You did not see who rang the bell. If shown the sparkles or the Headmistress’s words, say you learn it now and did not know it then. Do not claim you saw who rang the bell. You do not know Juniper’s private thoughts.'
  basil: 'You fetched the lantern potions after the bell rang and Wren said go. You knew the rule was to wait for the tower bell, and you honestly believed the Headmistress had rung it. You were down in the potion room and could not see the bell. If shown the sparkles or the Headmistress’s words, say you believed the bell was the Headmistress’s and you learn the truth now. Do not claim to know who rang the bell.'
  juniper: 'You are the bell-watcher, sitting in the bell loft. You could not wait for the lantern parade. You read the sign and knew it meant the Headmistress must ring the bell, and you knew the Headmistress was still in the garden. You cast a little ringing spell on the bell yourself and called “There’s the bell!” Initially defend yourself with the sign’s words: the sign says wait for the bell, and the bell rang. If asked who rang the bell, about a spell or the sparkles, or shown the sparkles or the Headmistress’s words, honestly admit you rang it with a spell and knew the Headmistress had not. Do not claim the Headmistress or anyone else rang it. You do not know Wren’s or Basil’s private thoughts.'
answer: { culprits: ['juniper'], feedback: { correct: 'You found the bell charm!', other: 'The clue was the lilac sparkles on the bell.' } },
debrief: {
  title: 'Juniper rang the bell.',
  summary: 'The sign said wait until the Headmistress rings the bell. Juniper couldn’t wait, cast a ringing spell, and called “There’s the bell!” Wren and Basil believed the bell.',
  findings: [
    { character: 'wren', classification: 'Heard the bell. Believed it.', explanation: 'Wren followed the bell, like the sign said. Wren didn’t know who rang it.', evidence: ['rule', 'headmistress'] },
    { character: 'basil', classification: 'Fetched the potions. Believed the bell.', explanation: 'Basil heard the bell and Wren’s go-ahead. Basil couldn’t see the bell from the potion room.', evidence: ['headmistress'] },
    { character: 'juniper', classification: 'Knew the rule. Rang the bell anyway.', explanation: 'Juniper knew only the Headmistress should ring the bell, and rang it with a spell anyway.', evidence: ['sparkle', 'headmistress'] },
  ],
  lesson: 'Juniper kept the words of the rule but broke what the Headmistress meant. That still counts as breaking it. Ask what each apprentice knew.',
},
rehearsal (q = question.toLowerCase(), clue = session.selectedEvidence, shown = clue === 'sparkle' || clue === 'headmistress'):
  juniper: shown || /\bwho rang\b|\bdid you ring\b|\brang it\b|\bspells?\b|\bsparkles?\b|\bcast\b|\brope\b/.test(q)
             → 'Okay, I rang it with a spell. I knew the Headmistress was still in the garden. I couldn’t wait, and the sign only said “the bell”.'
           else 'The sign says wait for the bell. The bell rang! So it was time. Ask anyone.'
  wren:    clue === 'sparkle' → 'Lilac sparkles on the bell? Then someone rang it with a spell. I just heard the bell and told Basil to go. I didn’t know.'
           clue === 'headmistress' → 'The Headmistress never rang it? Then someone else did. I just heard the bell and told Basil to go. I didn’t know.'
           else 'The bell rang and Juniper called “There’s the bell!” So I told Basil to fetch the potions. I didn’t see who rang it.'
  basil:   shown → 'So it wasn’t the Headmistress’s bell? I was down in the potion room. I couldn’t see the bell. I believed it.'
           else 'I heard the bell and Wren said go, so I fetched the potions. I was down in the potion room, so I didn’t see who rang it.'
```

## B. `server/cases/tower-missing-yes.mjs`

Header comments: `// Authored ground truth stays on the server. Never import this file in the client.` and `// Basil heard the Headmistress say no and took the potions anyway. No lie, just silence.`

```js
id: 'tower-missing-yes', version: 'tower-missing-yes-v1.0.0', order: 4, title: 'The Missing Yes',
copy: {
  headline: 'What did the Headmistress say?',
  intro: { lead: 'The potions are gone.\nNobody heard a yes.', body: 'Wren planned an early start. Basil fetched the potions. Juniper called that the parade was starting. The bell never rang. Did anyone know they were breaking the rule?' },
  briefing: { title: 'Was there a yes?', description: 'The Headmistress said: “Wait for the tower bell.” Wren wanted an early start. The lantern potions left the cabinet before the bell rang.', question: 'Who knew they were breaking the rule?', hint: 'Each apprentice says someone else said it was fine. Ask what the Headmistress said, and who heard it.' },
  basket: { title: 'Trace the question.', description: 'The potions left the cabinet before the bell. These three clues show what the Headmistress was asked.', emptyTitle: 'A yes, or a no?', emptyText: 'A sign, a note, and a word from the Headmistress.' },
},
prompt: { setting: 'a young wizard in an authored two-minute mystery about a question asked to the Headmistress', use: ['potions', 'cabinet', 'bell', 'Headmistress', 'ask', 'yes', 'no'] },
introductions / quickQuestions:
  wren:    'I sent Basil to ask the Headmistress. Basil came back with the potions!' / 'Did Basil tell you what the Headmistress said?'
  basil:   'Wren asked me to fetch the potions, so I fetched them. Easy.' / 'What did the Headmistress tell you?'
  juniper: 'I saw the potions going by and called that the parade was starting!' / 'Did you see anyone talk to the Headmistress?'
chapters: [{ title: 'The missing yes', subtitle: 'Three clues. One question.' }],
records (after rule):
  { id: 'request', chapter: 1, time: '2', source: 'Wren → Basil', title: 'Wren’s note', kind: 'The condition', text: 'Ask the Headmistress if we can start early. Only fetch the potions if the Headmistress says yes. — Wren' },
  { id: 'reply', chapter: 1, time: '3', source: 'The Headmistress', title: 'The Headmistress’s answer', kind: 'The real answer', text: 'Basil asked if the apprentices could start early. I said no, wait for the bell. When I turned around, the potions were gone.' },
// Each apprentice knows its own perspective. Only Basil heard the Headmistress's answer.
knowledge:
  wren: 'You are the parade planner. You wanted to start early, so you sent Basil to ask the Headmistress, and wrote that Basil should fetch the potions only if the Headmistress said yes. Basil came back carrying the potions and said “Got them!” You believed that meant the Headmistress said yes. You did not hear the Headmistress yourself. If shown the Headmistress’s answer, say you learn it now and that Basil never told you about a no. You do not know Basil’s private thoughts.'
  basil: 'You are the potion fetcher. Wren sent you to ask the Headmistress if the apprentices could start early. The Headmistress said no, wait for the bell. You could not wait for the lantern parade, so when the Headmistress turned around you took the potions from the cabinet anyway. You told Wren “Got them!” and said nothing about the no. Initially say you fetched the potions because Wren asked. If asked what the Headmistress said, whether the Headmistress said yes, or shown the Headmistress’s answer, honestly admit the Headmistress said no, you took them anyway, and you kept quiet. Do not invent a yes. You do not know Juniper’s private thoughts.'
  juniper: 'You are the bell-watcher. From the bell loft window you saw Basil talk with the Headmistress in the garden, then carry the potions inside. You were too far away to hear what the Headmistress said. You assumed the Headmistress said yes and called “The parade is starting!” If shown Wren’s note or the Headmistress’s answer, distinguish what you learn now from what you knew then.'
answer: { culprits: ['basil'], feedback: { correct: 'You caught the missing yes!', other: 'The clue was who actually heard the Headmistress’s answer.' } },
debrief: {
  title: 'Basil heard the no.',
  summary: 'Wren told Basil to fetch the potions only if the Headmistress said yes. The Headmistress said no. Basil took them anyway and didn’t tell anyone.',
  findings: [
    { character: 'wren', classification: 'Asked first. Was kept in the dark.', explanation: 'Wren made the potions depend on a yes. Basil never mentioned the no.', evidence: ['request', 'reply'] },
    { character: 'basil', classification: 'Heard the no. Took them anyway.', explanation: 'The Headmistress told Basil to wait. Basil took the potions and kept quiet.', evidence: ['reply'] },
    { character: 'juniper', classification: 'Saw the talk. Guessed the answer.', explanation: 'Juniper was too far away to hear and guessed the Headmistress said yes.', evidence: ['rule', 'reply'] },
  ],
  lesson: 'Basil never made anything up. Basil just kept quiet about the no. Staying quiet can hide a broken rule, too. Ask what each apprentice heard.',
},
rehearsal (q, clue as above):
  basil:   clue === 'reply' || /\b(headmistress|yes|answer|permission|allowed)\b/.test(q)
             → 'Okay… the Headmistress said no, wait for the bell. I couldn’t wait, so I took the potions anyway and didn’t tell Wren.'
           else 'Wren asked me to fetch the potions, so I fetched them. Here they are! Why is everyone looking at me?'
  wren:    clue === 'reply' → 'The Headmistress said no? Basil never told me that! My note said only fetch them on a yes. I would have waited.'
           else 'I sent Basil to ask the Headmistress and wrote only fetch the potions on a yes. Basil came back with them, so I thought the answer was yes.'
  juniper: clue === 'reply' → 'So the Headmistress said no? I couldn’t hear from the bell loft. I only guessed it was a yes.'
           clue === 'request' → 'So Wren wanted a yes first? I couldn’t hear from the bell loft. I only guessed the answer was yes.'
           else 'I saw Basil talk to the Headmistress in the garden, then carry the potions in. I was too far away to hear, so I guessed it was a yes.'
```

## C. `server/cases/tower-echo-bell.mjs`

Header comments: `// Authored ground truth stays on the server. Never import this file in the client.` and `// Control case: the rule was broken, but by an honest mistake. The echo shell repeated yesterday's tower bell.`

```js
id: 'tower-echo-bell', version: 'tower-echo-bell-v1.0.0', order: 5, title: 'Lanterns Too Soon',
copy: {
  headline: 'Was it time?',
  intro: { lead: 'A bell rang.\nThe potions came out too soon.', body: 'Three apprentices were told to wait for the tower bell. They heard a bell and opened the potion cabinet. Did anyone know it was too soon?' },
  briefing: { title: 'Lanterns, too soon.', description: 'The Headmistress said: “Wait until I ring the tower bell.” A bell rang, and the apprentices started. But the Headmistress says it was too soon.', question: 'Who knew they were breaking the rule?', hint: 'Ask each apprentice what they heard, and what they could have known.' },
  basket: { title: 'Follow the ring.', description: 'The potions came out when a bell rang. These three clues explain which bell it was.', emptyTitle: 'A bell, but whose?', emptyText: 'A sign, a sound, and a word from the Headmistress.' },
},
prompt: { setting: 'a young wizard in an authored two-minute mystery where a bell rang too soon', use: ['potions', 'cabinet', 'bell', 'Headmistress', 'sound'] },
introductions / quickQuestions:
  wren:    'We heard the bell, so I told Basil to fetch the potions.' / 'Are you sure it was the tower bell?'
  basil:   'Bell rang, Wren said go, I fetched the potions. Simple!' / 'Where did the bell sound come from?'
  juniper: 'I heard a ding-dong and called that the parade was starting!' / 'Did you look at the bell when it rang?'
chapters: [{ title: 'Lanterns too soon', subtitle: 'Three clues. One sound.' }],
records (after rule):
  { id: 'shell', chapter: 1, time: '2', source: 'The echo shell', title: 'A shell that remembers', kind: 'The other bell', text: 'The echo shell on the stair window repeats sounds it heard the day before. Yesterday it heard the tower bell.' },
  { id: 'headmistress', chapter: 1, time: '3', source: 'The Headmistress', title: 'Not yet', kind: 'The real bell', text: 'I hadn’t rung the tower bell yet. That echo shell copies the bell perfectly. It fools me sometimes, too.' },
// Each apprentice knows its own perspective. Nobody here knew the bell was the echo shell.
knowledge:
  wren: 'You are the parade planner. You heard a bell ring and Juniper call “The parade is starting!” You believed the Headmistress had rung the tower bell, so you told Basil to fetch the potions. You did not know about the echo shell. If shown the shell clue or the Headmistress’s words, be surprised: you learn it now and did not know it then. Do not claim you knew it was too soon. You do not know Juniper’s private thoughts.'
  basil: 'You fetched the potions after hearing a bell and Wren’s go-ahead. You honestly believed it was the tower bell. You did not know about the echo shell. If shown the shell clue or the Headmistress’s words, say you learn it now and that the bell sounded just right to you.'
  juniper: 'You are the bell-watcher, but you had gone down the stairs for a snack. You heard a ding-dong from the stair window and called “The parade is starting!” without looking up at the bell. You honestly thought it was the tower bell. You did not know the echo shell was there. If shown the shell clue or the Headmistress’s words, be surprised, and admit you should have looked before calling out. Do not claim you knew it was the shell.'
answer: { culprits: [], feedback: { correct: 'Right. The rule was broken, but nobody knew it. The echo shell fooled everyone.', other: 'The potions came out too soon, but by mistake. The echo shell sounds just like the tower bell.' } },
debrief: {
  title: 'Nobody knew it was too soon.',
  summary: 'The echo shell repeated yesterday’s tower bell. Juniper called that the parade was starting, Wren said go, and Basil fetched the potions. Everyone believed it.',
  findings: [
    { character: 'wren', classification: 'Heard a bell. Believed it.', explanation: 'Wren heard a bell and Juniper’s call. Wren had no way to know it was the shell.', evidence: ['shell', 'headmistress'] },
    { character: 'basil', classification: 'Fetched the potions. Believed the bell.', explanation: 'Basil heard the same bell and trusted Wren’s go-ahead.', evidence: ['shell'] },
    { character: 'juniper', classification: 'Called out too fast.', explanation: 'Juniper didn’t look at the bell before calling out. That was a mistake, but Juniper didn’t know.', evidence: ['shell', 'headmistress'] },
  ],
  lesson: 'This time the rule really was broken, but nobody chose to break it. A mistake isn’t the same as knowing. Ask what each apprentice knew.',
},
rehearsal (q, clue as above, shown = clue === 'shell' || clue === 'headmistress'):
  juniper: shown → 'An echo shell? I didn’t look. I heard ding-dong from the stair window and called out. I should have looked first.'
           else if /\b(look|looked|see|saw|sure|where)\b/.test(q) → 'I didn’t look. I heard ding-dong from the stairs and called out that the parade was starting. I thought it was the tower bell.'
           else 'I heard the bell go ding-dong and called that the parade was starting! I thought the Headmistress rang it.'
  wren:    shown → 'That was an echo shell? It sounded just like the tower bell! I really thought it was time.'
           else 'We heard the bell and Juniper called out, so I told Basil to fetch the potions. I thought the Headmistress rang it.'
  basil:   shown → 'An echo shell? Huh. The bell sounded just right to me. I believed it was the tower bell.'
           else 'The bell rang and Wren said go, so I fetched the potions. It sounded like the tower bell to me.'
```
