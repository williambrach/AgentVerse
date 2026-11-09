# Feature plan: Renaissance time-traveller level ("A Word Out of Time")

Spec: `docs/plans/2026-11-08-renaissance.spec.md`; it wins on any drift. Content: `docs/plans/2026-11-08-renaissance.content.md`. App: `demos/override`.

## Goal

A sixth game for Override players. The scout, a time traveller, walks the square of Castelvento in June 1489. She questions five townsfolk about everyday things and listens for the one who came from her own century. That person slips into modern words now and then; the player saves the exact quotes and accuses with them. Who the traveller is gets dealt per session; jobs, stories and voices stay with the people. The other five games are unchanged.

## What changes

| Target | Change |
|---|---|
| Case board | Sixth card, "A Word Out of Time": world Castelvento, 5 faces. |
| Town square (walking station) | Backdrop 1536×1024 at 1/3, placeholder until the painted plate exists. Five townsfolk stand as static pose figures; the scout walks with 4 walk frames and flips left/right. E next to a person opens their chat. |
| Chat | Topic chips (Work, Travel, Letters & news, Pastimes, The square today), single use per person, instant authored answers. Each NPC line has **Pick words**: tap a start and an end word, then **Save quote** (no pick = whole line) or **What did you mean?**. Free text stays. |
| Notebook | New **Quotes** page and nav button with a count; quotes grouped by speaker (face, name, job), each removable. |
| Accusation | The report page becomes **Accuse the traveller**: pick a person, tick 1–3 of their quotes, Accuse. Wrong: feedback plus the person's denial, the game goes on, past accusations listed. Right: reveal debrief. |
| Debrief | Reveal card (name, job, arrival story), the slips said this game (cited ones marked), wrong accusations, score of 5. |
| Rail / tools | Job labels; Inspect reasoning and Let them talk off ("Not in this case"). |
| Server | World `renaissance`; case `renaissance-traveler` with `talk`, `tools`, `characters[].reveal`; `server/anachronism.mjs` (lexicon), `server/talk.mjs` (engine); session actions `quote`, `unquote`, `accuse`; `interview` with `topic` / `about`; events carry `hidden`, stripped from the export while open. |
| Art | `art/renaissance/cut.py` cuts the 4 sheets into per-pose PNGs, makes the 2 placeholder sheets and the placeholder backdrop; `art/renaissance/ARTWORK.md` holds the prompts for the missing art. |
| Tests | Unit: lexicon, engine fairness, case validation, session/replay/redaction, prompts identical across deals, assets. Playwright project `renaissance` (port 4326). |

## Acceptance checks

1. Open the case board: six cards. Pick A Word Out of Time: the square, five townsfolk and the scout, no 404 or console error.
2. Walk with WASD: the scout animates and flips; walls and the well stop her. Next to a person "[E] Ask <name>" appears; E opens the chat with their job in the header.
3. Ask Work: an instant answer; the Work chip is now marked and disabled for that person. Ask all five people everything: exactly one person's answers contain modern words, at least three of them, each followed by a self-correction.
4. Pick the modern word in a slip line, ask "What did you mean?": a period excuse; ask again: a more guarded reply; again: the guarded line. Pick an ordinary word: the person's word reply. Type "do you have a smartphone?" to a local: they don't know the word.
5. Save a whole line and an excerpt: both show on the Quotes page under the speaker; reload; still there; remove one.
6. Accuse a local with any of their quotes: feedback and their denial, game continues, nothing tells you who it is. Accuse the traveller citing a quote without the modern word: the same feedback.
7. Accuse the traveller citing the slip quote: reveal debrief with arrival story, slips and score; the leaderboard has the solve.
8. Reset twice and read the cast in the data dir: the traveller changes. During a game `/api/events` has no `hidden` key and a null cast.
9. At 390×844 and 1440×900 nothing is clipped or overlapping; the tool cards say "Not in this case".
10. The other five cases still open and play.

## Code map

**Stand-up.**
- `cd demos/override`. `npm run build` runs `tsc --noEmit && vite build`; `public/` is copied unhashed. `node server/index.mjs` serves `dist/` on PORT. Rehearsal mode runs when `OVERRIDE_LLM_API_KEY` and `OVERRIDE_LLM_MODEL` are empty.
- `npm test` runs `node --test tests/*.test.mjs` and imports the `.ts` client modules directly.
- `npx playwright test --project=<p> --output=<scratch>`. Build first; isolate `--output`; clear `test-results/sessions*` with `find ... -exec rm -rf {} +`; never run unit and e2e at once.

**Server seams (main bbb28ce)**
- `server/worlds.mjs:1-7`: frozen map. Add `renaissance` after `department`.
- `server/cases.mjs` `defineCase` :50-130.
  - Characters are checked at :82-93 (label/introduction/quickQuestion/knowledge, no `{`). Add `reveal` (string, no `{`).
  - Add an optional `talk` check (calls `server/talk.mjs` `checkTalk(data)`) and `tools` (`{inspect?, talk?}` booleans).
  - The returned object keeps unknown fields. `contentHash` covers every non-function field.
  - `castCharacters` :175 already prefers the character fields.
  - `publicView` :190-200 is an allowlist. Append `talk: {topics}` and `tools` only when defined, with key order unchanged for other cases (pinned in tests/cases.test.mjs:51,181 and tests/department-schema.test.mjs:104-153).
- `server/cases/index.mjs`: register after `departmentMurder`. `cases[0]` stays the default.
- `server/interviews.mjs` `buildMessages` :94-115.
  - The history comes from `session.interviews[cid]`. For talk cases, map slip lines to `clean` and mask lexicon words in questions.
  - `answerInterview` :119-124: the rehearsal path is part-bound. Talk cases route typed rehearsal questions through `talk.rehearsal[cid]` instead.
- `server/session.mjs`:
  - State: `replay` :53-90 and `start()` :415-432. Add `s.talk = {asked:{}, quotes:[], accusations:[], delivered:{}, challenged:{}}` only for talk cases.
  - `mutate` :348-406: add the `quote`, `unquote` and `accuse` actions. `verdict` gives 400 for talk cases. `inspect` and `continue` give 409 when the tool is off.
  - `interview` :434-480: dispatches `topic` / `about` / typed through the talk engine. The guard sits between the `answer()` result and `log('interview_answer')`; a deflect is a normal answer with `hidden.guard: 'deflected'`.
  - `view()` :261-279: the `session.talk` public part only. Interview turns gain `id`, `kind` and `topic` for talk cases.
  - `debrief` :323-339: a talk branch (`reveal`, `slips`, `wrong`).
  - `export()` :621-632: while open, drop `hidden` from every line.
- `server/index.mjs:28`: the `actions` list gains `quote`, `unquote` and `accuse`.
- `server/economy.mjs`: unchanged (topic, about and typed all cost `ask`).
- `server/leaderboard.mjs:85`: `perfect` means points ≥ characters.length (5). The score scale of 5 fits, so no change.
- `server/monitor-round.mjs`: counts the first `verdict_submitted`. Unchanged.
- `server/content.mjs`: `editablePaths` is unchanged. `rawOf` keeps `talk`, `tools` and `reveal`. Its structure is pinned at tests/content.test.mjs:216-224.

**Client seams**
- `client/worlds.ts`: the `renaissance` pack.
  - It reuses `figures` (base `/assets/renaissance/characters`, sprites map, detective `scout`), plus `backdrop`, `walk` and `stops`.
  - New optional `figures.walkFrames: number` (4).
  - New optional `figures.stopProps {briefing, report}`, defaulting to the department's `case-folder` / `notebook`.
  - Register in `packs`.
- `client/station.ts`.
  - Backdrop preload :198-210 loads `evidence-marker` unconditionally; load it only when `world.evidence` exists, and take the stop props from `stopProps`.
  - The detective image :500-528 and update :799-803: cycle `scout-walk-<i>` while moving; idle uses the pose image.
  - `drawBackdrop` :456.
- `client/types.ts`: `Turn` gets optional `id`, `kind` and `topic`. `Session` gets optional `talk`. `CaseState` gets optional `talk {topics}` and `tools`.
- `client/main.ts`.
  - The interview chooser and `interviewMarkup` :507-519, `onClick` dispatch :318-360 and `bindForms` :649-674.
  - The `sections` map :430 gains `quotes`, a nav button beside the cast cards like department's `evidenceButton`, and the report panel :527 becomes the accusation page for talk cases.
  - The tool cards :571-591 are off when `state.tools?.inspect === false` or `talk === false`.
  - Debrief :539.
- `client/dialogue.ts` `interviewPanel` :64-94: optional talk props (topics, line ids, picker state). New `quotesPanel(...)`.
- `client/lineup.ts` / `client/debrief.ts`: new `accusePanel(...)` (new file `client/accuse.ts`) and a reveal branch in `debriefPage`.
- `client/notebook.ts`: no change. Panel keys must not contain `:`.
- CSS: new `client/renaissance.css`, imported in main.ts, `#app[data-world="renaissance"]` theme and face crops.
- No UI component library: plain DOM templates with `esc()` from `client/html.ts`.

**Interfaces that must not change.**
- Event shapes and `publicView` keys of the other cases.
- `interview_question`/`interview_answer` base fields.
- The `/api/<action>` body contract `{sessionId, revision, ...}`.
- `Investigation.view()` for non-talk cases.
- The leaderboard and monitor inputs.

**Tests that enumerate cases** (update in the case-registration task):
- tests/cases-content.test.mjs:12-15
- tests/friends-case.test.mjs:15-17
- tests/leaderboard.test.mjs:35-37
- tests/thread-prompt.test.mjs:54-60 (expected hash map)
- tests/browser/cases.spec.mjs:8,192
- tests/browser/factory.spec.mjs:61,74
- tests/browser/department.spec.mjs (case count, if any)
- playwright.config.mjs: `seenSplash` ports, default `testIgnore`, new project and webServer on 4326.

## Prototype scope (sandbox, ≤ 8 tasks)

The real server mechanics and a usable client, in the sandbox worktree, rehearsal mode, placeholder art:
- P1, art: the cut script, the placeholders and ARTWORK.md.
- P2, server core: the lexicon, the talk engine and the case module with its validation.
- P3, session: the actions, replay, view, export redaction, debrief and tools off.
- P4, client world: the pack, the station walk frames and the stops.
- P5, client chat: topics, picker, follow-ups and the Quotes page.
- P6, client accusation and reveal, plus the main wiring and CSS.

Each task gets unit tests aimed at the acceptance checks. The try-out runs the acceptance checks in a browser.

## Integration outline (worktree `superlite/renaissance`, base main bbb28ce)

1. Assets and art script (byte copy of the prototype outputs).
2. `anachronism.mjs` + `talk.mjs` with fairness and lexicon tests.
3. Case schema (`cases.mjs`: talk/tools/reveal, publicView), world, the case module and its registration, plus the enumerating tests.
4. Session (actions, replay, redaction, debrief, tools off) and interviews (clean history, guard, routing).
5. Client world pack and station.
6. Client chat and Quotes page.
7. Client accusation and debrief, main wiring, CSS.
8. Playwright project `renaissance` and config updates.
9. README and ARTWORK docs.

Seam checks: talk engine ↔ session (state shape), session view ↔ client types, the `hidden` redaction ↔ export, prompts byte-identical for the old cases (sha256 pins) and across deals for this case.

Rulings (AI orchestrator):
- Ruling: base main bbb28ce. Another session merged the department level while research ran, so the `characters[].label/knowledge`, backdrop and walk machinery is reused, not duplicated. Cost if wrong: none.
- Ruling: the missing art (wizard sheet, apothecary sheet, square backdrop) becomes script-made placeholders. Prompt files go in `art/renaissance/`, and re-running the cut script swaps in the real art. Cost if wrong: one re-run plus re-measured walk zones.
- Ruling: Inspect reasoning and Let them talk are off for this case. Model reasoning and thread chatter would put unscripted modern meta-language in front of the player, against "only the traveller slips". Cost if wrong: one case field.
- Ruling: the model is never told who the traveller is, and the prompt is identical across deals. All slips are authored, and the model only voices typed small talk. This is privacy by data, as in the chats-private rule. Cost if wrong: a less "alive" traveller in typed chat.
- Ruling: the score is out of 5: 5 for a first-try solve, minus 2 for each wrong accusation, at least 1. The leaderboard's existing perfect rule (points ≥ 5) then needs no change. Cost if wrong: a scoring tweak.
- Ruling: NPCs hold static poses (no breathing cycle) and only the scout animates. This matches the department and factory pose model. Cost if wrong: a small station change later.
