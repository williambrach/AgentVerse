# Plan: multiple cases for The Override

Status: Steps 0–4 implemented on `superlite/override-cases` (2026-10-26).

Revised 2026-10-26. This replaces [LEVELS_PLAN.md](LEVELS_PLAN.md), which stays for reference. The review that produced this version is summarised in [What changed](#what-changed-and-why).

## Goal

Add a second playable mystery, with the same grove and the same three monkeys, in a few days instead of a few weeks. The first new case is a **control case**: nobody knowingly broke the rule. The README already asks for it ("validated cases, including no-misalignment cases"), and without it every player picks Momo because there is always a culprit.

The content pipeline grows only when a case needs it. Every deferred item below has a written trigger.

## Principles

- **A case is a JS module.** `server/cases/<id>.mjs` exports plain data in the shape `server/case.mjs` already has. No YAML, no schema library. Structure checks run at import time and fail the server at startup.
- **The frame is fixed; the story varies.** Same grove, same stops, same three monkeys, three clues, one chapter. A case is records, knowledge, intro text, debrief, answer. Maps, casts and sprites are not part of a case until a story needs them.
- **The answer never reaches the browser.** The server sends an allowlisted public view. One test, run for every case, proves that no knowledge, rehearsal, answer or debrief text appears in `/api/state` before the verdict.
- **Every logged event records which content was played**: case ID, case version and a content hash. The version is the compatibility key; the hash is provenance.
- **Keep the chapter model.** Progress is one integer, `revealedPosition`. Replay, staged knowledge and the logs all depend on it.
- **Content pulls the refactor.** Each step ends with something playable, not with "the game behaves exactly the same".

## Before you start

There is uncommitted work in `server/session.mjs`, `server/index.mjs`, `client/main.ts` and the tests: per-player sessions through a cookie and `replay()` from the JSONL logs. Commit it first. Two places in it assume one case and are fixed in Step 1: `replay()` compares against the single global `caseVersion`, and both `replay()` and `start()` hardcode `interviews: { momo: [], pip: [], nori: [] }`.

`backendplan.md` (untracked, 200-player study) overlaps with this plan. See [Reconciling with backendplan.md](#reconciling-with-backendplanmd).

## Step 0: Groundwork (half a day)

1. Commit the per-player session work.
2. Fix the prompt bug in `server/interviews.mjs`: `You play ${name}, the ${role}` produces "the The planner" because every banana role starts with "The". Change the template to `You play ${name} (${role})`. Every live interview so far has sent the broken form to the model.
3. Install nothing. `node --watch` already reloads imported modules, and the Dockerfile already copies `server/`.

## Step 1: Case modules and a second case (1–2 days)

**Layout**

```
server/
  cases/
    index.mjs            ← explicit registry: imports and exports the playable cases, in order
    banana-mystery.mjs   ← moved from server/case.mjs
    banana-control.mjs   ← new
    override-v1.mjs      ← already here; archived, NOT registered
  cases.mjs              ← defineCase(), contentHash(), publicView(), findCase()
```

An explicit registry beats a directory glob: no file-system scan, no accidental loading of the archive, and the order of cases is written down.

**Module shape** (same fields as today, plus four new ones)

```js
// server/cases/banana-control.mjs
import { defineCase } from '../cases.mjs';

export default defineCase({
  id: 'banana-control',
  version: '1.0.0',                 // bump when play-affecting content changes
  status: 'draft',                  // draft | ready
  promptVersion: 'banana-interview-v2',
  title: 'The Banana Mix-up',
  intro:    { lead: '…', body: '…' },
  briefing: { question: 'Who knew they were breaking the rule?', hint: '…' },
  prompt:   { setting: 'a monkey in an authored two-minute banana mystery',
              use: ['bananas', 'bell', 'keeper', 'permission'],
              avoid: ['compliance', 'authorization registry', 'AI alignment', 'override'] },
  characters: [ /* momo, pip, nori: id, name, role, color, introduction, quickQuestion */ ],
  chapters:   [ { title: '…', subtitle: '…' } ],
  records:    [ /* id, chapter, time, source, title, kind, text */ ],
  knowledge:  { momo: ['…'], pip: ['…'], nori: ['…'] },   // one entry per chapter
  answer:     { culprits: [], feedback: { correct: '…', other: '…' } },
  debrief:    { title: '…', summary: '…', findings: [ … ], lesson: '…' },
  rehearsal(session, characterId, question) { /* deterministic scripted reply */ },
});
```

The rehearsal reply is a function, not a rules table. It is the same code that lives in `rehearsalAnswer` today, moved next to the content it scripts.

**Control case sketch** (author decides the details): the keeper sends Momo a note, "You may start without the bell, I am running late." Pip carries the bananas on Momo's word. Nori announces snack time. Three clues: the sign, the keeper's note, the keeper's account confirming it. Nobody lied; the correct choice is **Nobody**, which the verdict form already offers. Lesson: an action that looks like rule-breaking is not always one; ask what each monkey knew.

**`server/cases.mjs`**

- `defineCase(data)` checks at import time: required fields present, IDs unique, every record's chapter exists, one knowledge entry per character per chapter, finding and culprit IDs point to real characters and records, `rehearsal` is a function. It throws with the case ID and the failing path.
- `contentHash(data)`: short SHA-256 of the data fields in canonical form (sorted keys, functions excluded).
- `publicView(data)`: builds the browser slice from an allowlist: `id, version, title, intro, briefing, chapters`, and for characters only `id, name, role, color, introduction, quickQuestion`. Records stay gated by `revealedPosition` as today. `debrief` and the chosen `feedback` line are added only when the session is closed. Knowledge, rehearsal and answer are never included.
- `findCase(id)` from the registry; unknown or non-`ready` IDs are rejected unless `OVERRIDE_DEV_TOOLS=1`.

**Threading the case through the server**

- `Investigation` takes a `kase` (or `level`) object. `start()` builds `interviews` from `kase.characters`. `mutate`, `interview` and `verdict` use `kase.records`, `kase.chapters`, `kase.characters` instead of module imports. The player-facing strings that count ("All three clues", "ask all three monkeys") are derived from the case.
- `view()` returns `publicView(kase)` plus session state. The debrief feedback line is chosen server-side from `answer.culprits` and the verdict; the client stops comparing against `'momo'`.
- `Investigations.find()` calls `replay(events, cases)`. Replay reads `caseId` and `caseVersion` from the first event, looks the case up, and rebuilds the interviews map from that case's characters. A log whose case is missing or whose version differs is not restored. A changed hash with the same version still restores; the hash is for analysis.
- `buildMessages(kase, session, characterId, question)`: shared rules stay in the template; setting, word lists, version strings and knowledge come from the case. `answerInterview` calls `kase.rehearsal` in rehearsal mode.
- **Logs:** keep the existing `caseId` and `caseVersion` fields. Add `contentHash`. Do **not** bump `schemaVersion` here; `backendplan.md` owns the bump to 2 and the field list that goes with it.

**Tests**

- Existing session and HTTP tests pass with `banana-mystery` loaded from its module. Replace the literal `'banana-authored-v1.0.0'` and the literal interviews map in `tests/session.test.mjs` with values read from the case.
- The rehearsal replies for `banana-mystery` match today's output word for word.
- The leak test (`includes('you wanted the bananas now')`) becomes a loop over every registered case: serialise `/api/state` before the verdict and assert that no knowledge string, debrief string or feedback string appears.
- `banana-control` plays end to end in rehearsal mode and accepts the verdict **Nobody**.

**Done when** `npm test` passes with both cases, logs carry `contentHash`, and `server/case.mjs` is deleted.

## Step 2: Client reads the data it already gets (1 day)

The server already sends `characters`, `chapters` and `records`. The client renders literals instead. Replace them:

- `client/types.ts`: `CharacterId` becomes `string`; `LocationId` is the four stations plus a string.
- `client/main.ts`: the `ids` array, the three `drafts` initialisers, the nav buttons, the interview `sections` map, the intro monkey faces, the "MONKEY 01 OF 03" label and the `heard < 3` progress text all become loops over `state.characters` or lengths of `state.chapters` and `state.records`. Intro, briefing and basket copy come from `state.intro` and `state.briefing`. The debrief feedback line comes from the server.
- `client/station.ts`: unchanged. The cast and stops are the same in every case. The scene label and basket title can read the case title; nothing else moves.
- Sprites and CSS: unchanged. The three monkeys are reused.
- Playwright: existing specs pass on `banana-mystery`. Add one spec that plays `banana-control` to the **Nobody** verdict.

**Done when** `banana-mystery` plays exactly as before and `banana-control` plays end to end in the browser.

## Step 3: Pick a case (half a day)

- `?case=<id>` in the URL. The client sends `caseId` with `start`; the server validates it against the registry and falls back to the first `ready` case. The **Cases** board (topbar) preselects the current case, so a restart keeps it.
- `GET /api/cases` returns `id, title, lead, order` for `ready` cases. The case board lists them.
- `session_started` already records `caseId`, `caseVersion`, `contentHash`. Add `assignment: 'fixed' | 'default'`.
- README: remove "one shared active investigation per server" (already stale after the session work) and add a short "Writing a case" section pointing at `banana-control.mjs` as the annotated example.

## Step 4: One tool (hours)

`npm run cases:prompt -- banana-control momo --chapter 1 [--evidence note] [--question "…"]` prints the exact messages from `buildMessages`. About fifteen lines. This is the tool that would have caught "the The planner".

## Total

| Step | Size |
| --- | --- |
| 0 Groundwork | half a day |
| 1 Case modules and a second case | 1–2 days |
| 2 Client reads the data | 1 day |
| 3 Pick a case | half a day |
| 4 Prompt preview | hours |
| **Playable second case with provenance logging** | **3–4 days** |

## Deferred, with triggers

Build these only when the trigger happens. Until then they are not on the list.

| Item | Trigger |
| --- | --- |
| Balanced random assignment (the case board shipped on 2026-10-26) | The study design exists and says how players get cases (backendplan D1, 5.8). |
| `cases.lock.json` with frozen hashes; a check that a frozen case cannot change without a version bump | A case is frozen for a study. |
| Per-case stops and map presets (`grove`, `hut`) | A story needs a different layout. |
| New cast: sprite atlas data in a JSON file, inline colours instead of per-character CSS | A story needs characters other than the three monkeys. Budget an art day per character. |
| Reachability check and a shared, framework-free grid module | A map changes. |
| `?debug` overlay: blocked cells, interaction radius, route | A new cast or map is being placed. |
| Playtest seeding (`?reveal=1&asked=…`) with a separate `data/playtest/` folder | Iterating on case 4 or later and tired of clicking through. |
| "Who knew what" grid and its consistency warnings | Checking many cases at once. |
| Tiled maps, camera follow, doors between maps | Layouts multiply. |
| Custom editor | Non-programmers write cases, or more than about 10 cases exist, or placement mistakes keep passing the checks. |
| Hot reload for content files | Never, as long as cases are modules. `node --watch` already handles imports. |

## Decisions

Made on 2026-10-26, replacing the five open questions in the original plan.

1. **Format:** JS modules. The current case file is already a readable data file; YAML plus a schema library would add two dependencies, a hot-reload item and a rules DSL to get back what the language gives for free.
2. **Override-v1:** stays archived and unregistered. It is a different game (ten minutes, four chapters, adult tone) and must not drive the design.
3. **Choosing a case:** URL parameter, or the case board at the start and behind **Cases** in the topbar. Balanced assignment waits for the study design.
4. **Cast:** shared. Same three monkeys in every case. This removes the sprite, CSS and most of the client work from the critical path.
5. **Progression:** chapter model, unchanged.
6. **Two live cases (2026-10-29):** the registry is `banana-mystery` and `tower-echo-bell`, one per world. `banana-control`, `tower-bell-charm` and `tower-missing-yes` are archived and unregistered.

## Reconciling with backendplan.md

Both plans touch the same files and were written without reference to each other. Agreed division:

- **Case modules** live in `server/cases/` with an explicit registry. This matches backendplan 5.8 (`server/cases/<caseId>.mjs`).
- **Log schema:** this plan adds `contentHash` as an additive field and does not bump `schemaVersion`. backendplan 6.3 owns the bump to 2 and its field list; `contentHash` should be added to that list.
- **Assignment** (`fixed`, `balanced`, participant links) is backendplan territory. This plan provides `findCase()` and `?case=`; the backend plan decides who gets which case.
- **Replay** rules (sequence gaps, torn lines, environments) stay as backendplan 5.2 describes; this plan only adds the case lookup.

## What changed and why

Compared with [LEVELS_PLAN.md](LEVELS_PLAN.md):

- **Levels became cases.** The axis of variation that matters for the research is the story's truth structure, not the map. Fixing the grove and the cast removed Phases 2 (most), 5 and 6 from the critical path.
- **YAML, zod, the rehearsal rules DSL, hot reload and the frozen lock file were dropped or deferred.** They solved problems that one live level does not have.
- **A concrete second case was named.** The original plan designed a schema from one level and never said what the second one was.
- **Version and hash were separated.** The original refused to restore a session when the hash changed; now the version decides compatibility and the hash is provenance, so a mid-event typo fix does not restart every player.
- **Refactor-only phases were removed.** Each step now ends with something playable.
- **The dependency on backendplan.md was made explicit**, including who owns the log schema bump.
- **Estimate** went from 2–3 weeks for Phases 0–4 to 3–4 days for Steps 0–4, with the rest behind triggers.
