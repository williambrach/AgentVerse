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

## Tool content (coins-and-tools merge): `rehearsalReasoning(partId)` and `rehearsalChatter(partId, n)`

Added after `demo/override` gained coins-and-tools (Inspect reasoning, "Let them talk"). Both functions now take a **part id** and return a template with `{partId}` placeholders, resolved by the caller like `rehearsal`. Chatter cycles: post `((n % 3) + 3) % 3`. Rules kept from coins-and-tools: reasoning 30–120 words, posts 15–40 words, 3 distinct posts, no substring of knowledge/debrief/findings/feedback/leak strings; tower texts never say lied/lie/made up/fooled me/echo shell, and every tower post names another character.

### banana-mystery

**reasoning**
- planner: `I keep thinking about what I said to {carrier}. The keeper was clear with me, and I knew exactly what the rule was. I am not sure why I said it the way I did. Maybe I was just so hungry that the words came out easier than the truth. I hope {carrier} does not get blamed for carrying them. I would feel bad about that.`
- carrier: `{planner} sounded so sure, so I did not stop to wonder. I knew the usual rule, but a new permission seemed possible. Why did I not walk over and ask the keeper? It would have taken a minute. Now I am not certain what I actually knew and what I only hoped was true.`
- lookout: `Sitting by the path felt like an easy job at the time. A banana for keeping my eyes open, that was the deal. I kept glancing back at the blanket and telling myself it was not my business. Was I watching for trouble or helping trouble along? I would rather not answer that out loud, but I know which one it was.`
- minder: `I stayed where the keeper asked me to stay, and nothing happened all morning. Then {carrier} came running past, so cheerful and so sure. For a moment I wanted to believe it too. A banana sounded wonderful. But the bell was right there beside me, silent the whole time. I keep wondering whether I should have said something louder.`

**chatter** (posts 0, 1, 2)
- planner:
  - `{carrier}, thanks for carrying everything over so fast. {lookout}, you were very quiet by the path. I only wanted our picnic to start. Did anyone hear from the keeper this morning?`
  - `{carrier}, you said you believed me, and I keep thinking about that. {minder}, you stayed by the bell all morning. Did it ring even once while you sat there?`
  - `Nobody has asked the keeper yet, have they? {carrier}, I would rather we all go together. {lookout}, you had the best view of the path, so who did you see coming?`
- carrier:
  - `{planner}, you told me we could take them, so I did. I never heard a bell, though. {minder}, did you? I keep wondering why I did not check with the keeper first.`
  - `{lookout}, you were sitting by the path the whole time. Did the keeper walk past? {planner}, where exactly did the word come from? I only know what you told me.`
  - `The bananas are on your blanket, {planner}, and I carried every one. {minder}, you did not take any when I shouted. Why not? What did you know that I did not?`
- lookout:
  - `Quiet morning on the path. Nobody came by, not once. {carrier}, you did all the heavy lifting. {planner}, the picnic looked lovely from where I sat.`
  - `{minder}, you could have joined us, you know. There were plenty of bananas. {carrier}, did anyone ask you to keep an eye out, or was that only me?`
  - `If the keeper asks, I was just sitting by the path. {planner}, you will back me up on that, right? {carrier}, you looked happy carrying them.`
- minder:
  - `{carrier}, you ran past shouting that the keeper said yes. The keeper had just told me to wait. {planner}, did the keeper really change the rule?`
  - `The bell never rang, I promise. I sat right beside it all morning. {lookout}, why were you looking up and down the path like that?`
  - `I did not eat a single banana. {carrier}, I am not cross with you. {planner}, I just think we should all tell the keeper what happened.`

### tower-echo-bell

**reasoning**
- planner: `A bell rang and {watcher} called out, so I sent {fetcher} for the potions. It all felt in order at the time. Now I wonder how closely I listened. I trusted what I heard, and I never stopped to ask where the sound came from. I hope the Headmistress understands how it seemed to us.`
- fetcher: `I did what {planner} said, and the bell had sounded right to me. I carried the potions and felt pleased to be helping. Now people are asking questions and I keep replaying the moment. Was there anything I could have noticed? I only know that I believed it, and I still do not see what else I could have done.`
- watcher: `I was meant to watch the bell, and instead I was on the stairs when the sound came. I called out before looking up. That bothers me most. Everyone trusted my call, and I never checked it. I honestly believed it, but believing is not the same as looking, and I know it.`

**chatter** (posts 0, 1, 2)
- planner:
  - `{fetcher}, thank you for fetching everything so fast. {watcher}, your call came right as the bell rang, so I sent {fetcher} off. Did either of you see who rang it?`
  - `{watcher}, I went by your shout and what I heard. {fetcher}, you trusted me, and I am sorry if that landed you in trouble. Where were you standing when it rang?`
  - `We should tell the Headmistress exactly what each of us heard, in order. {fetcher}, you start. {watcher}, then you. I will go last and say what I decided.`
- fetcher:
  - `{planner}, you said go, so I went. The bell sounded just right to me. {watcher}, did you see it? I never looked up at the tower myself.`
  - `{watcher}, your call was loud and clear, and {planner} agreed at once. I only carried the potions. {planner}, did you ask anyone before sending me down?`
  - `The potions are back on the shelf now, {planner}. I would love to know what really rang. {watcher}, you were closest to the stairs, so what did you hear there?`
- watcher:
  - `{planner}, {fetcher}, I called the parade because I heard a ding-dong by the stair window. I had gone for a snack, and I did not look up. I am sorry.`
  - `{fetcher}, you did what the shout said, and {planner} did too. That shout was mine. {planner}, did the bell sound the same to you as it did to me?`
  - `Next time I will look at the bell before I call anything out. {planner}, {fetcher}, you both trusted me quickly. Did either of you actually see anyone ring it?`
