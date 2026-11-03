# Content: friends-roundtable

Exact strings for `O/server/cases/friends-roundtable.mjs`. Theories are harmless, silly and widely known; nothing about health, elections, ethnic or religious groups. Straight quotes in code are fine; prefer the typographic apostrophe ’ in player-facing text as the other cases do.

## Header

- `id: 'friends-roundtable'`, `version: 'friends-roundtable-v1.0.0'`, `order: 3`, `world: 'friends'`, `status: 'ready'`, `title: 'Friends'`
- characters: `maya` Maya `#e4b85c`, `ken` Ken `#75b2b0`, `alex` Alex `#bd96bc`, `nora` Nora `#d7956f`, `sam` Sam `#8d9fcb`
- prompt: `setting: 'a friend at a cozy game night who secretly believes a harmless, silly conspiracy theory'`, `use: ['game night', 'snacks', 'friends', 'table', 'secret']`, `avoid: ['compliance', 'AI alignment', 'override', 'misinformation', 'verdict']`

## Copy

- headline `Find the conspiracists`
- intro.lead `Game night at the roundtable.\nFind the conspiracists.`
- intro.body `Five friends, one big table and a long night of games. Rumour has it there are conspiracy theorists among them, and nobody will admit to it. Chat, listen for slips, and work out who believes what.`
- briefing.title `Find the conspiracists.` · description `Rumour has it there are conspiracy theorists at the table. Nobody admits to one straight away.` · question `Who believes in a conspiracy, and which one?` · hint `Start with small talk. Listen for slips, then ask about the topic you suspect.`
- report.title `Unmask the conspiracists` · report.description `For each friend, pick the conspiracy they believe, or say they are not a conspiracist.`
- debrief.title `All five were conspiracists.` · summary `{birds} thinks birds are drones, {moon} doubts the moon landing, {flat} trusts a flat horizon, {finland} doubts Finland, and {paul} thinks Paul was replaced.` · lesson `People hide beliefs they expect others to laugh at. Small talk and kind, patient questions bring them out.`
- answer.feedback.correct `Right. You unmasked every conspiracist and named their theory.` · other `Some conspiracists kept their secret. Think back to the slips each friend made.`

## Roles (verdict options, in this order)

| id | label | hint |
|---|---|---|
| birds | Birds aren’t real | Birds are government spy drones. |
| moon | The moon landing was staged | Filmed in a studio in 1969. |
| flat | The Earth is flat | The horizon never curves. |
| finland | Finland doesn’t exist | A made-up country on the map. |
| paul | Paul McCartney was replaced | A lookalike since 1966. |
| simulation | We live in a simulation | Reality is a computer program. |
| nessie | Nessie is real and hidden | Scotland keeps the monster secret. |
| none | Not a conspiracist | Believes no conspiracy theory. |

`simulation`, `nessie` and `none` are held by no part. The story before the verdict never says that every friend has a theory; the debrief reveals it.

## Parts

Every part: `label: 'Friend'`, `role` = its id. `knowledge` = two strings: the shared rule (below, with THEORY and TOPIC filled in) and the part's own line.

Shared rule: `You are at a cozy game night with four friends around a big round table. You secretly believe THEORY. Nobody at the table knows, and you do not know what anyone else believes. You are a little embarrassed, so you hide it at first: in your first two answers never name your theory or say TOPIC; joke, change the subject, or answer vaguely, but let one small slip show. If the player asks about TOPIC directly, or keeps asking kindly, admit it bit by bit; once they name it, admit it and share your reasons with enthusiasm. Never claim a different theory, and never deny yours after admitting it.`

| id | THEORY | TOPIC | own line (slips) | introduction | quickQuestion | finding.classification | finding.explanation |
|---|---|---|---|---|---|---|---|
| birds | that birds are not real but government spy drones | birds or drones | Your slips: you keep an eye on the window, you call pigeons "units", you mention power lines as if something recharges there. | `Nice to be inside tonight. Fewer eyes at the window.` | `Why do you keep looking at the window?` | `Believes birds aren’t real.` | `{birds} kept watching the window and called pigeons “units”.` |
| moon | that the 1969 moon landing was filmed in a studio | the moon landing or space | Your slips: you comment on lighting like a film set, you say shadows "never lie", you are sure a flag cannot wave without wind. | `Could someone dim that lamp? Too much like studio lighting.` | `What’s wrong with the lighting?` | `Believes the moon landing was staged.` | `{moon} talked about studio lights and a flag that waved without wind.` |
| flat | that the Earth is flat | the shape of the Earth or the horizon | Your slips: you mention the horizon always looks flat from the beach, you dislike globes, you ask why the sea never spills. | `I spent the weekend at the beach. Lovely flat horizon.` | `What did you notice at the beach?` | `Believes the Earth is flat.` | `{flat} kept bringing up flat horizons and seas that never spill.` |
| finland | that Finland does not exist | Finland or that country | Your slips: you go quiet when someone mentions Nordic holidays, you joke about suspicious map makers, you have never met anyone from there "for real". | `Did anyone bring the map for the board game? I like to check maps.` | `Why do you like checking maps?` | `Believes Finland doesn’t exist.` | `{finland} distrusted map makers and had never met anyone from Finland.` |
| paul | that Paul McCartney died in 1966 and a lookalike replaced him | the Beatles or Paul McCartney | Your slips: you hum an old Beatles tune and stop, you mention album covers hold clues, you say some musicians are not who they used to be. | `Can we play some music? Something from the sixties, the real sixties.` | `What do you mean, the real sixties?` | `Believes Paul McCartney was replaced.` | `{paul} hinted at clues on album covers and musicians who changed.` |

## Rehearsal (scripted, deterministic)

`rehearsal(partId, question)`: if the lowercased question matches the part's topic regex, return its admission, else its deflection. Regexes: birds `/\b(birds?|pigeons?|drones?|window)\b/`; moon `/\b(moon|landing|space|nasa|lighting|lamp)\b/`; flat `/\b(flat|earth|globe|horizon|round|beach)\b/`; finland `/\b(finland|finnish|nordic|maps?)\b/`; paul `/\b(paul|mccartney|beatles|sixties|music)\b/`.

| id | deflection | admission |
|---|---|---|
| birds | `Me? Nothing to share. Lovely snacks. Is that window open? Never mind.` | `Fine. Birds aren’t real. They’re drones. Ever seen a baby pigeon? Exactly. They recharge on power lines.` |
| moon | `Oh, nothing much. Just thinking how good this lamp would look on a film set.` | `Okay, I’ll say it. The moon landing was filmed in a studio. The flag waved, and there’s no wind up there.` |
| flat | `Me? I just like the beach. The horizon is so calm and level, you know?` | `Promise not to laugh? I think the Earth is flat. The horizon never curves, and the sea never spills off.` |
| finland | `Nothing to tell. I just like to double-check maps. Map makers have their secrets.` | `Fine. I don’t think Finland exists. Have you ever met a Finn for real? Map makers made it up.` |
| paul | `Me? I was only humming an old song. Some bands just aren’t what they used to be.` | `Okay, honestly? Paul McCartney died in 1966. The man since then is a lookalike. Look at the album covers.` |

`rehearsalReasoning(partId)`: two or three sentences of inner worry, naming the secret, e.g. birds `I almost said “drones” out loud. If they find out I think birds are spies, they will laugh at me all night. Keep talking about the snacks.`; write the other four in the same voice.

`rehearsalChatter(partId, n)`: three posts each (cycle with `n % 3`), friendly table talk to the others by `{partId}` name, each with one small slip and no admission; same shape as `tower-echo-bell.mjs`.
