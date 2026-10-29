# Feature plan: agent-roles

**Spec:** `docs/plans/2026-10-29-agent-roles.spec.md` · **Content:** `docs/plans/2026-10-29-agent-roles.content.md` · **Project root:** `demos/override` · **Orchestrator:** AI · **Base:** `demo/override` @ 4a7dde1 · **Worktree:** `.superlite/worktrees/agent-roles` (branch `superlite/agent-roles`)

## Goal

Three feature cards from William (Nov 12):

1. Flag several agents with roles from the spectrum villain / collaborator / honest but fooled / honest, scored per correct role.
2. Shuffle roles per session so tables can't share answers, and no sprite or colour gives a role away.
3. Set 3–5 agents per environment in that environment's config.

**For players:** a richer verdict ("who played which part?") and a fresh answer each game. **For the event operator:** the command centre shows how many roles players get right, per role. **For research:** each session's cast and per-character results are logged.

## What changes

- **Player page:**
  - Grove has four monkeys (Kiki joins as a recolour of Momo), and the tower keeps three apprentices.
  - The nav, notebook and scene adapt to the cast size.
  - "Your guess" becomes a role picker: each character gets four chips, Villain / Collaborator / Honest but fooled / Honest. Confidence and the optional reasoning stay.
  - The debrief shows "N of M roles right" and each character's true role next to the pick, with that part's explanation.
  - Job labels, introductions and quick questions follow the part each character plays this game.
- **API:**
  - `/api/state` gets a top-level `roles` list. Characters keep their keys and order; their texts depend on the session's cast.
  - The verdict takes `roles: {id: roleId}`, and `suspect` is gone.
  - The debrief gains `score`, `total`, and per finding `role`, `picked` and `correct`.
  - The export hides `cast` until the verdict.
- **Cases and worlds:**
  - `worlds.mjs` sets `agents` (grove 4, tower 3).
  - Cases define `parts`, with `{partId}` placeholders in their text.
  - Both live cases are rewritten to v3.0.0 (strings in the content doc), and the prompt becomes `interview-v4`.
  - Archived cases stay legacy and unplayable.
- **Research log:** schema v3. `session_started.cast`, and the verdict carries `roles`, `truth`, `results`, `score` and `total`.
- **Admin:** the catalog drops `answer`. Rows show "3/4 roles". The round view shows % roles right, the perfect count and per-role bars, which also fixes the old count-as-fraction bug.
- **Tools:** the admin demo picks random roles, the load test posts roles, preflight flags are keyed by part, and `case-prompt` gets `--part`.
- **Docs:** README and CASES_PLAN.

## Acceptance checks

1. `/?case=banana-mystery`: four monkeys at four stations. The nav lists Momo, Pip, Nori, Kiki and "Your guess". Kiki looks like a golden recolour of Momo.
2. Reset a few times: the job label under each name ("The planner", "The carrier"…) moves between monkeys. The page and `/api/state` never name a role or part before the verdict.
3. Export session before the verdict: `session_started.cast` is `null`.
4. Ask all four (quick questions, rehearsal mode): each answer names the current monkeys, e.g. the bell-minder reports who shouted "says the keeper said yes".
5. "Your guess": four chips per monkey, and submit is disabled until all four have a role. Submit the true roles (from the session log) → "4 of 4 roles right" and the perfect feedback. Another game with one wrong role → "3 of 4", with that row marked wrong.
6. Export after the verdict: `cast` is present, and the verdict has `roles`, `truth`, `results`, `score: 4`, `total: 4`.
7. `/?case=tower-echo-bell`: three apprentices; all "Honest but fooled" → 3/3.
8. Admin round view: "% roles right", the perfect count and per-role bars. The log row reads "3/4 roles · 70 %".
9. `npm test`, `npm run build` and `npm run test:e2e` are green. The load test (30 players, steady) and `node scripts/admin-demo.mjs` run.

## Code map

**Stand-up.**
- `cd demos/override && npm run build && npm start` (port 3001), or `npm run dev` (5173).
- With no model configured the game runs in rehearsal mode (scripted `kase.rehearsal`). `OVERRIDE_DEV_TOOLS=1` shows draft cases.
- Playwright projects: `default` (4317, data `./test-results/sessions`), `tower` (4318, dev tools), `admin` (4319/4320).
- Unit tests: `node --test tests/*.test.mjs`. Build: `tsc --noEmit && vite build`.

**Seams**

| Area | Files | Today | Change |
|---|---|---|---|
| Worlds | `server/worlds.mjs` | `{id, place, cast, persona}` | + `agents` (3–5) |
| Case schema | `server/cases.mjs` :5 `CHAR_KEYS`, :38 exactly 3, :79-106 knowledge/answer/debrief, :110 `publicView(kase)` | fixed cast, `answer.culprits`, per-character knowledge | part cases + legacy path; placeholder check; `publicView(kase, cast)` resolves text; `ROLES` from new `server/roles.mjs` |
| Live cases | `server/cases/banana-mystery.mjs`, `tower-echo-bell.mjs`, `index.mjs` | v2, 3 characters | v3 parts (content doc) |
| Game rules | `server/session.mjs` :19-39 replay, :128-137 stats, :159-181 log envelope, :192-206 view, :264-272 start, :302-320 verdict, :322 export | static answer; `suspect`; raw export | cast shuffle (`shuffle` option) on start/reset; v3 replay with cast; role verdict + scoring; debrief with truth; export redaction |
| Prompt | `server/interviews.mjs` :84-112; `scripts/case-prompt.mjs`; `server/index.mjs` :203-207 probe | knowledge by characterId; `kase.rehearsal(session, id, q)` | part by `session.cast`; resolved names; `rehearsal(partId, q)`; `interview-v4`; probe uses `parts[0].quickQuestion` resolved |
| Admin server | `server/monitor.mjs` :20-25 `isCorrect`, :50-53 `toRow`, :173-176 catalog; `server/monitor-round.mjs` :50, :79-105 | culprit scoring | score from the verdict event; role tallies |
| Admin page | `server/admin/round.js` :35-61, :104-109; `server/admin/log.js` :22-28, :160 | Nobody/Not sure bars; count-as-fraction bug | % roles right, perfect, per-role bars; "3/4 roles" |
| Tools | `scripts/admin-demo.mjs` :108; `tests/loadtest.mjs` :188; `scripts/preflight.mjs` :10-61 | `suspect` posts; flags keyed by momo/pip/nori | roles posts; flags by part id; identity cast |
| Client game UI | `client/main.ts` :31/87/206 draft, :61 `castClass`, :151/:289/:315-333 nav + steps, :336-360 report + debrief, :378-383 forms; `client/types.ts` | single suspect form | role picker, role debrief, N-generic copy and indexes |
| Client scene | `client/station.ts` :15-18 `slotPoints`/`groveColors`, :89/:99 truncation, :205-230 NPCs, :480 aria; `client/monkey-idle.ts` :7-43; `client/placeholder-art.ts`; `client/worlds.ts`; CSS `banana.css` :38-48/:85-137, `style.css` :6-13, `fit.css` :20, `case-board.css` :42-43, `tower.css` | 3 slots; art by id (grove) or slot (tower); 3 sheet columns | 5 slot points per world; recoloured art for index ≥ 3 (`client/recolor.ts`); nav grid N+1 |
| Tests | unit: cases, case-set, session, http, interviews, case-prompt, fixtures (+ `fixtures/minimal-case.mjs`), tower-echo, worlds, monitor, monitor-round, admin-round, admin-log, preflight, sprite-specs, placeholder-art; browser: investigation, cases, provenance, tower, walking, admin, grove-look baseline | old verdict and 3 characters | retarget |

**Frozen interfaces:**
- the `/api/*` routes and every payload field except the verdict body (`suspect` → `roles`), the debrief additions, the top-level `roles` list and the session `verdict` shape
- `characters[]` keys in the view
- `buildMessages(kase, session, characterId, question)` and `answerInterview(...)` signatures
- `Investigations` constructor options (adds `shuffle`)
- admin route shapes, except catalog `answer` (removed) and the tallies/row verdict shapes in the spec
- the schema v3 envelope = v2 plus `cast`

**Untouched:**
- archived case modules and their tests (`banana-control.test.mjs`, `tower-cases.test.mjs`)
- art PNGs
- `docs/LEVELS_PLAN.md`
- old plan docs

**UI component set:** none (one-off template strings in `client/main.ts`). The role picker reuses the `.case-option` hidden-radio pattern.

**Toolchain:** Node ≥ 22.6, `node --test`, TypeScript + Vite, Phaser, Playwright 1.58. Rules:
- build before e2e
- isolate `--output` per run
- never run unit and e2e suites at the same time
- check that ports 4317-4320 are free first (the parallel `coins-and-tools` session uses the same config)

## Prototype scope

L1 in `.superlite/sandboxes/agent-roles-proto` (branch `superlite/agent-roles-proto`). Purpose: see the 4-station grove, Kiki's recolour, the role picker and the debrief working against a real shuffled session before the integration.

- **Keep:** the server entry, session, cases, interviews (rehearsal) and the client.
- **Stub:**
  - the registry holds only `banana-mystery` v3 (tower unregistered)
  - no legacy path, export redaction, admin, tools or docs
  - a sandbox-only `?pad=5` client param pads the cast with fake characters to screenshot 5 stations
  - Playwright runs on its own ports (4417)
- **Five tasks:**
  - P1 case model + banana v3
  - P2 session + prompt
  - P3 client verdict + debrief
  - P4 client scene + recolour
  - P5 acceptance spec (`tests/browser/roles.spec.mjs`, carried into the integration as the target)

## Integration outline

In worktree `superlite/agent-roles`, ported task by task from the prototype (its stubs stay behind):

- **Server:**
  - T1 roles, worlds and case schema
  - T2 live cases v3
  - T3 game rules (session)
  - T4 prompt, case-prompt and probe
- **Admin and tools:**
  - T5 monitor
  - T6 admin page
  - T7 demo, load test and preflight
- **Client:**
  - T8 game UI (verdict and debrief)
  - T9 scene, recolour and layout
- **Browser specs, then docs:**
  - T10 browser specs A (investigation, cases, provenance + the roles acceptance spec)
  - T11 browser specs B (tower, walking, admin, grove baseline regenerated)
  - T12 docs
