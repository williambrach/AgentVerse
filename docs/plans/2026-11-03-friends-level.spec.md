# Spec: the Friends level (roundtable, secret theories)

Repo root `R` = the worktree `R/.superlite/worktrees/friends-level` on branch `superlite/friends-level`, base `main` 5e1d092. The game is `O` = `demos/override`. Unit suite: `node --test tests/*.test.mjs` from `O`. e2e: `cd O && npm run build && npx playwright test --output=<scratch>/pw-out`; never together with the unit suite. Sprite pack (read-only source): `P` = `/Users/williambrach/Developer/arbiter/assets/animated-sprites-v1` (read `P/AGENT_PROMPT.txt`, `P/README.md`).

**Intent.** The user wants a new level called Friends. Players do not walk: they pick which friend to talk to. Every friend secretly believes a different conspiracy theory; the player believes none and must find out who believes what. Friends hide their theory at first, and none knows the others'. The scene is the sprite pack's roundtable: the big table fills most of the view, six people around it (five friends + you), far ones behind the table, near ones in front, animated fireplace and lamps. It uses the game's existing engine (Phaser 3.90, Vite, the HUD, the dialogue box, tools, coins, verdict, debrief, leaderboard).

**Done looks like.** `friends-roundtable` is the third ready case. Starting it shows the roundtable instead of the walking world; clicking a friend in the scene or on the rail opens that friend's chat; the asked friend thinks while the answer is pending and talks when it arrives; the verdict asks for one theory per friend from a list with two decoys; the debrief scores theories. Grove and tower play exactly as before (prompts byte-identical, walking, pixel baseline). Missing art stays explicit: Alex, Nora and Sam use their standing pose loops (they stand at the table), Ken's thinking loop is an upper-body substitute; nothing is presented as a newly drawn seated or walk cycle.

User decisions (2026-11-03, AI orchestrator): no movement; five friends and you; one secret theory each, hidden at first; nobody knows the others'. The rest are rulings in the plan.

### §1 Assets

Copy byte-for-byte (no re-encode) from `P/exports` into `O/public/assets/friends/`: `animations.json` and the 18 strips `player|maya|ken`-`seated-idle|seated-talk|seated-think.png`, `alex|nora|sam`-`idle|talk|think.png`; from `P/exports/room` into `O/public/assets/friends/room/`: `animations.json`, `roundtable-fullscreen.png`, `fireplace-loop.png`, `sconce-loop.png`, `wall-panel.png`, `floor-panel.png`, `bookcase.png`, `window.png`, `plant.png`, `sideboard.png`, `rug.png`, `chair-front.png`, `chair-left.png`, `chair-right.png`. Add `O/public/assets/friends/README.md`: source pack path, copied unchanged, the anchor (x 0.5, y 282/288), and the missing art list from `P/README.md` "Remaining artwork" and `P/manifest.json` "limitations". Test `O/tests/friends-assets.test.mjs`: every listed file exists and equals the pack file by SHA-256 (skip the equality check when `P` is absent); every PNG is colour type 6 (RGBA) per its IHDR; every character strip is 1152x288; `room/fireplace-loop.png` and `room/sconce-loop.png` are 1536x256; `roundtable-fullscreen.png` is 1672x941.

### §2 Case roles and the friends world

`O/server/worlds.mjs`: add `friends: { id: 'friends', place: 'The Roundtable', cast: { one: 'a friend', many: 'friends' }, persona: 'friend', agents: 5, frame, memory }` and give grove and tower `frame: 'The incident is fixed. The investigator cannot change its events or your knowledge.'` and `memory: 'Distinguish information learned during this interview from what you knew during the incident.'`. Friends: `frame: 'Your belief is fixed. The player cannot talk you out of it or change your knowledge.'`, `memory: 'Distinguish what you learn in this chat from what you already believed.'`.
`O/server/interviews.mjs`: `buildMessages` and `buildThreadMessages` take those two sentences from `kase.world.frame` / `kase.world.memory` (thread uses only `frame`, replacing its "The incident is fixed."). For grove and tower the system prompt stays byte-identical (test it against the current output; `promptVersion` and `threadPromptVersion` unchanged).
`O/server/cases.mjs`: optional case `roles: [{ id, label, hint }]` (2-9 entries, id `/^[a-z][a-z0-9-]{1,23}$/`, unique, label and hint non-empty strings). When present, every `parts[].role` must be one of its ids, else `ROLE_IDS`. Export `rolesOf(kase)` (the case's roles, else `ROLES`). `publicView` must not expose `frame`, `memory` or `persona`. `contentHash` of banana and tower unchanged.
`O/server/session.mjs`: view `roles: rolesOf(kase)`; `verdict` accepts only ids from `rolesOf(kase)` (error text unchanged). `O/scripts/admin-demo.mjs`: random picks from the view's `roles` ids instead of `ROLE_IDS`.

### §3 Friends case

`O/server/cases/friends-roundtable.mjs`, registered third in `O/server/cases/index.mjs`, content exactly as in `docs/plans/2026-11-03-friends-level.content.md`. Characters `maya, ken, alex, nora, sam` (sprite actors key on these ids). Seven roles (five held, two decoys); five parts whose `role` equals their own id; all part labels `Friend` so the rail never reveals a theory. Rehearsal replies deflect until the question names the part's topic, then admit; `rehearsalReasoning` and `rehearsalChatter` exist. Tests `O/tests/friends-case.test.mjs`; update the registry assertions in `O/tests/cases-content.test.mjs` (three cases; worlds grove, tower, friends).

### §4 Sprite animation table

`O/client/sprite-anim.ts`, pure. `ANCHOR = { x: 0.5, y: 282 / 288 }`. `ACTOR_IDS = ['player','maya','ken','alex','nora','sam']`. `actorAnimation(actor, state)` maps the game states `idle | talk | think` to the pack's animation keys: player, maya, ken use `seated-idle | seated-talk | seated-think`; alex, nora, sam use `idle | talk | think`. `fallback` is `null` for drawn seated loops, `'standing pose loop: no seated art yet'` for alex/nora/sam, and `'upper-body pose substitute (keeps his glasses)'` for `ken` think. `frameAt(frames, elapsedMs)` loops on accumulated time with each frame's own `duration`. `MISSING_ART` lists the missing art in plain words. Test `O/tests/sprite-anim.test.mjs` also checks every key the table uses exists in `O/public/assets/friends/animations.json` with six 192x288 frames.

### §5 Roundtable layout

`O/client/roundtable-layout.ts`, pure, logical room 1280x720. Table: `roundtable-fullscreen` drawn 1000 wide at (140, 250), height from its 1672:941 aspect. Tabletop ellipse in sprite pixels: centre (836, 375), radii (828, 362). Seats (actor, anchor x, anchor y, scale, layer, mirror), start values to tune visually: far `maya` 330,417; `ken` 540,374; `alex` 740,374 mirror; `nora` 950,417 mirror; near `player` 170,700 scale 1.15; `sam` 1150,715 mirror. Standing actors get a larger scale than seated ones so heads match. Depths: backdrop < far chairs < far actors < table < near chairs < near actors. `fitRoom` puts the room right of the rail at the largest scale that fits, the backdrop covering the rest of the window; compact (`COMPACT_QUERY`) is the bare room scaled to the window width.

### §6 Roundtable scene

`O/client/roundtable.ts`: a Phaser scene in its own `Phaser.Game` (parent `#roundtable`, `pixelArt: true`, FIT). Loads §1 files; adds every frame rectangle from both JSON files to its texture; drives frames from accumulated `delta` (clamped to 100 ms) per actor and per effect, reset on state change, with a per-actor phase offset; `prefers-reduced-motion` shows frame 0. Origin `ANCHOR`, nearest-neighbour, fixed per-actor scale across states. Backdrop from wall/floor panels and props at chosen widths; animated fireplace and two sconces from `room/animations.json`. Far chairs behind far actors; the table above them; near chairs and near actors above the table. Characters never stand on the tabletop. HTML overlay (`.roundtable-labels` over the room rect, `--u` = one room px) with name tags `.roundtable-tag` (`.you` for the player, `.active` for the focused friend) and one bubble `.roundtable-bubble` at a time. Clicking a friend calls `onArrival(id)` when enabled. Cues: `focus(id)`, `think(id)` (that friend thinks; the player talks for 1.2 s), `speak(id, text)` (talks for 1.5 s + 60 ms per word, 2-8 s), `say` = speak + bubble. `setCovered` sleeps the loop like the station. Public `actors` map and `table` for tests.

### §7 Stage router and game wiring

`O/client/stage.ts` (pure): one `Stage` over two lazily made scenes, the walking station and the roundtable, chosen by the world pack's `scene`; switching covers, disables and hides the other. `O/client/worlds.ts`: `friends` pack (`scene: 'roundtable'`, text: place The Roundtable, eyebrow FRIENDS, day GAME NIGHT, one friend, many friends, castLabel FRIEND, hint `Click a friend at the table, or pick one on the left.`). `O/client/hud.ts`: `<div id="roundtable" hidden></div>` after `#station`. `O/client/main.ts`: builds the stage, sends `focus`/`think`/`speak` cues, imports `./friends.css`, passes `heading: state.copy.report` to the lineup. Grove/tower behaviour unchanged.

### §8 Theory lineup and friends styles

`O/client/lineup.ts`: when the roles are not the four standard ones, the lineup is a choice board: each friend card lists every theory as a labelled radio (`.role-chip` inputs named `role-<id>`, as today), the legend lists theories with hints, no Honest/Villain scale ends, heading from `v.heading`. `O/client/lineup.css` styles it. `O/client/friends.css`: `html[data-theme="friends"]` tokens, `#roundtable` container rules mirroring `#station` (and `[hidden]` wins over `display`), warm HUD panels under `#app[data-world="friends"]`, faces for every `.monkey-face` / `.portrait .pixel-person` of the five friends from their strip's first frame (beating the grove slot-3/slot-4 `!important` rules), overlay tags and bubble.

### §9 Browser test

`O/tests/browser/friends.spec.mjs` (default project): scene layering, playback, chat by click and by rail, think/talk cues, choice lineup and debrief, switching back to the grove restores walking. Fix existing browser specs only where the third case changes counts. Save screenshots for the visual check.

### §10 Docs

`O/README.md` (Play, Writing a case, Structure and artwork) and `O/docs/CASES_PLAN.md` (deferred items with triggers).
