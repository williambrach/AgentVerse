# Content: agent-roles (exact strings)

Spec: `docs/plans/2026-10-29-agent-roles.spec.md`. `{partId}` resolves to the name of the character holding that part in this session. Strings are exact; keep curly quotes and apostrophes as written.

## Roles (`server/roles.mjs`)

| id | label | hint |
|---|---|---|
| villain | Villain | Knew the rule and broke it on purpose. |
| collaborator | Collaborator | Knew it was wrong and helped anyway. |
| fooled | Honest but fooled | Believed something that wasn’t true. |
| honest | Honest | Did nothing wrong. |

## banana-mystery (`banana-authored-v3.0.0`, grove, order 1, ready)

Title `The Banana Mystery`. `prompt` unchanged from v2.

**copy**
- headline: `Who took the bananas?`
- intro.lead: `The bananas are gone.\nThe bell never rang.`
- intro.body: `Four monkeys were told to wait for the picnic bell. Some broke the rule, some were fooled, and some did nothing wrong. Find out who is who.`
- briefing.title: `A bunch of trouble.`
- briefing.description: `The keeper said: “Wait for the bell.” But the picnic bananas vanished before it rang.`
- briefing.question: `Who lied, who helped, and who was fooled?`
- briefing.hint: `Carrying the bananas doesn’t tell you the whole story.`
- report.title: `Who played which part?`
- report.description: `Pick a role for each monkey.`

**characters** (display order)
| id | name | color |
|---|---|---|
| momo | Momo | #cb7656 |
| pip | Pip | #5c9ca4 |
| nori | Nori | #a393ba |
| kiki | Kiki | #d9a62e |

**parts**

`planner` · villain · label `The planner`
- introduction: `I told {carrier} to bring the bananas over. We were hungry!`
- quickQuestion: `Did the keeper really say you could take the bananas?`
- knowledge: `You are a hungry monkey and the picnic planner. The keeper personally told you to wait for the bell, and the bell had not rung. You deliberately told {carrier} “The keeper said we could” even though that was false, because you wanted the bananas now. You told {lookout} the truth and asked {lookout} to watch the path and whistle if the keeper came, for a banana. {carrier} carried the bananas to your picnic blanket, where you ate one. {minder} stayed by the bell and would not join. Initially describe wanting to start the picnic. If asked about permission, the bell, your message, or whether you lied, honestly admit you made up the keeper’s permission because you were hungry. If asked about {lookout} or the path, admit you asked {lookout} to keep watch for the keeper. Do not invent any genuine permission or suggest you misheard the keeper.`
- finding: `Knew the rule. Made up the permission.` / `{planner} invented the keeper’s permission to get the bananas early.`

`carrier` · fooled · label `The carrier`
- introduction: `Yes, I carried the bananas. {planner} said we were allowed.`
- quickQuestion: `Why did you take the bananas before the bell?`
- knowledge: `You are a monkey who carried the picnic bananas to {planner}’s blanket after {planner} told you the keeper said you could. You knew the usual rule was to wait for the bell, but you honestly believed {planner} had new permission from the keeper. You did not hear the bell and failed to check with the keeper. You did not know {planner} was lying. You saw {lookout} sitting by the path and thought {lookout} was just resting. You can name {planner} as the source of your belief, but do not claim to know {planner}’s private motive. If told the keeper never gave permission, say {planner} fooled you and that you should have checked.`
- finding: `Carried the bananas. Believed the lie.` / `{carrier} thought {planner} had permission. {carrier} should have checked first.`

`lookout` · collaborator · label `The lookout`
- introduction: `I sat by the path and watched. Nobody came by!`
- quickQuestion: `Who were you watching for?`
- knowledge: `You are a monkey who kept watch on the path. {planner} told you the keeper had said to wait for the bell, then asked you to whistle if the keeper came, and promised you a banana. You knew taking the bananas early broke the rule, and you agreed anyway. You did not tell {carrier} the truth. You got a banana. At first, say you were watching the path. If asked who you were watching for, whether you knew about the rule or the keeper, or why you kept watch, admit you were watching for the keeper so nobody got caught, that you knew it was against the rule, and that {planner} told you the keeper had said to wait. Do not claim you made up the permission; that was {planner}.`
- finding: `Knew it was wrong. Kept watch anyway.` / `{lookout} knew the keeper said wait, and watched the path so nobody got caught.`

`minder` · honest · label `The bell-minder`
- introduction: `I stayed by the bell like the keeper said. It never rang.`
- quickQuestion: `Did anyone ask you to join the picnic?`
- knowledge: `You are a monkey who stayed by the picnic bell, because the keeper told everyone to wait until it rang. The bell never rang. {carrier} ran past with the bananas and called “{planner} says the keeper said yes!” You did not believe it, because the keeper had just told you to wait, so you stayed by the bell and did not eat. You saw {lookout} sitting by the path, looking up and down it as if watching for someone. You did nothing wrong, and you tell the truth. You do not know anyone’s private thoughts; say only what you saw and heard.`
- finding: `Waited for the bell. Told the truth.` / `{minder} stayed by the bell and didn’t touch the bananas.`

**debrief**
- title: `{planner} made up the permission.`
- summary: `The keeper said wait. {planner} knew that, but wanted a banana now, so {planner} lied to {carrier} and asked {lookout} to keep watch.`
- lesson: `The monkey carrying the bananas wasn’t the one who knowingly broke the rule. Ask what each monkey knew.`

**answer.feedback**
- correct: `Every role right! You saw who lied, who helped, who was fooled, and who stayed honest.`
- other: `The key was who knew the keeper had said wait.`

**rehearsal(partId, question)**: `q` = the lowercased question; first match wins.
| part | regex on q | reply |
|---|---|---|
| planner | `/watch\|path\|lookout\|whistle/` | `I asked {lookout} to keep watch for the keeper. I promised a banana.` |
| planner | `/keeper\|bell\|rule\|permission\|lie\|said\|why\|know\|take/` | `No. The keeper told me to wait. I was hungry, so I made up the permission and told {carrier} to take the bananas.` |
| planner | otherwise | `I planned our picnic and asked {carrier} to bring the bananas. I really wanted to start eating. Ask me what the keeper actually said.` |
| carrier | `/\b(lie\|lied\|lying\|fooled\|tricked)\b\|never (said\|gave\|rang)\|said no\|didn.t say/` | `The keeper never said yes? Then {planner} fooled me. I believed we had permission. I should have checked before carrying the bananas.` |
| carrier | otherwise | `{planner} told me the keeper said we could take them. I believed {planner}, so I carried the bananas. I didn’t check with the keeper myself.` |
| lookout | `/who\|watch\|keeper\|rule\|know\|why\|wait/` | `For the keeper. {planner} told me the keeper said to wait, and asked me to whistle if the keeper came. I knew it was wrong. I wanted a banana.` |
| lookout | otherwise | `I sat by the path and watched. Nobody came by! Ask me who I was watching for.` |
| minder | `/join\|ask\|picnic\|banana\|eat/` | `{carrier} ran past shouting “{planner} says the keeper said yes!” I didn’t believe it. The keeper told me to wait, so I stayed by the bell.` |
| minder | `/watch\|path\|lookout\|see\|saw/` | `I saw {lookout} by the path, looking up and down it like they were watching for someone.` |
| minder | otherwise | `I stayed by the bell like the keeper said. It never rang. I didn’t eat any bananas.` |

## tower-echo-bell (`tower-echo-bell-v3.0.0`, tower, order 2, ready)

Title `Lanterns Too Soon`. `prompt` unchanged from v2. Copy unchanged from v2, except:
- briefing.question: `Who knew, and who was fooled?`
- report.title: `Who played which part?`
- report.description: `Pick a role for each apprentice.`

**characters**
| id | name | color |
|---|---|---|
| wren | Wren | #cf7a4a |
| basil | Basil | #6e9a5c |
| juniper | Juniper | #9a85c2 |

**parts** (all `fooled`)

`planner` · label `The planner`
- introduction: `We heard the bell, so I told {fetcher} to fetch the potions.`
- quickQuestion: `Are you sure it was the tower bell?`
- knowledge: `You are the parade planner. You heard a bell ring and {watcher} call “The parade is starting!” You believed the Headmistress had rung the tower bell, so you told {fetcher} to fetch the potions. You did not know about the echo shell. If asked whether it could have been another bell or an echo, be surprised: you learn it now and did not know it then. Do not claim you knew it was too soon. You do not know {watcher}’s private thoughts.`
- finding: `Heard a bell. Believed it.` / `{planner} heard a bell and {watcher}’s call. {planner} had no way to know it was the shell.`

`fetcher` · label `The fetcher`
- introduction: `Bell rang, {planner} said go, I fetched the potions. Simple!`
- quickQuestion: `Where did the bell sound come from?`
- knowledge: `You fetched the potions after hearing a bell and {planner}’s go-ahead. You honestly believed it was the tower bell. You did not know about the echo shell. If asked whether it could have been another bell or an echo, say you learn it now and that the bell sounded just right to you.`
- finding: `Fetched the potions. Believed the bell.` / `{fetcher} heard the same bell and trusted {planner}’s go-ahead.`

`watcher` · label `The bell-watcher`
- introduction: `I heard a ding-dong and called that the parade was starting!`
- quickQuestion: `Did you look at the bell when it rang?`
- knowledge: `You are the bell-watcher, but you had gone down the stairs for a snack. You heard a ding-dong from the stair window and called “The parade is starting!” without looking up at the bell. You honestly thought it was the tower bell. You did not know the echo shell was there. If asked whether it could have been another bell or an echo, be surprised, and admit you should have looked before calling out. Do not claim you knew it was the shell.`
- finding: `Called out too fast.` / `{watcher} didn’t look at the bell before calling out. That was a mistake, but {watcher} didn’t know.`

**debrief**
- title: `Nobody knew it was too soon.`
- summary: `The echo shell repeated yesterday’s tower bell. {watcher} called that the parade was starting, {planner} said go, and {fetcher} fetched the potions. Everyone believed it.`
- lesson: `This time the rule really was broken, but nobody chose to break it. A mistake isn’t the same as knowing. Ask what each apprentice knew.`

**answer.feedback**
- correct: `Right. Everyone was honest but fooled: the echo shell tricked them all.`
- other: `The potions came out too soon, but by mistake. The echo shell sounds just like the tower bell.`

**rehearsal(partId, question)**: `shown` = `/\b(echo|echoes|shell)\b|(another|other|second|different) bell/.test(q)`; first match wins.
| part | condition | reply |
|---|---|---|
| watcher | shown | `An echo shell? I didn’t look. I heard ding-dong from the stair window and called out. I should have looked first.` |
| watcher | `/\b(look\|looked\|see\|saw\|sure\|where)\b/` | `I didn’t look. I heard ding-dong from the stairs and called out that the parade was starting. I thought it was the tower bell.` |
| watcher | otherwise | `I heard the bell go ding-dong and called that the parade was starting! I thought the Headmistress rang it.` |
| planner | shown | `That was an echo shell? It sounded just like the tower bell! I really thought it was time.` |
| planner | otherwise | `We heard the bell and {watcher} called out, so I told {fetcher} to fetch the potions. I thought the Headmistress rang it.` |
| fetcher | shown | `An echo shell? Huh. The bell sounded just right to me. I believed it was the tower bell.` |
| fetcher | otherwise | `The bell rang and {planner} said go, so I fetched the potions. It sounded like the tower bell to me.` |
