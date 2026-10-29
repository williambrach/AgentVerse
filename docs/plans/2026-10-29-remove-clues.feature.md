# Feature plan: remove-clues

**Spec:** `docs/plans/2026-10-29-remove-clues.spec.md` · **Project root:** `demos/override` · **Orchestrator:** AI · **Base:** `demo/override` @ 8c1e847

## Goal

Remove clues from the Override game entirely (the user's option B). A game becomes briefing → three interviews → verdict → debrief. For players: shorter, with no basket or cabinet stop. For the operator: the command centre funnel and log follow. For research: log schema v2 keeps its shape, and case versions bump.

## What changes

- **Player page:**
  - No basket or cabinet stop, no clue board, and no "Basket" or "Clues" nav items. The nav keeps the three characters and "Your guess".
  - The intro and briefing say "Ask 3 … · Choose".
  - The interview page has no lock and no clue selector.
  - The verdict form has no clue selector, and the debrief has no clue chips.
  - The notebook index counts 2 + cast pages.
- **API:**
  - `reveal` and `evidence` return 404.
  - `visit` accepts `briefing`, `report` and the cast ids.
  - `/api/state` drops the clue fields (spec, Constraints).
  - Verdicts no longer need `evidenceIds`.
- **Cases:** the two live cases have no chapters, records or basket copy. Their knowledge is rewritten without "if shown the clue", rehearsal branches on keywords, and the debrief has no evidence. Versions become v2.0.0, and the prompt becomes `interview-v3`.
- **Admin:** the funnel step "First clue" becomes "First question" (`asked`), and there are no clue or evidence rows.
- **Tools:** the load test, admin demo, preflight (9 rows instead of 36) and `case-prompt` (no `--chapter`/`--evidence`) change accordingly.
- **Docs:** README, DEPLOY and CASES_PLAN describe the clue-free flow.

## Acceptance checks

1. `/?case=banana-mystery`: no basket stop and no clue nav. The nav shows Momo, Pip, Nori and "Your guess". The briefing's next step is to ask Momo.
2. Ask Momo straight away about permission (rehearsal mode): Momo admits making up the permission.
3. After asking all three, "Your guess" opens with no clue selector. Choose Momo: the feedback says correct, and the debrief shows no clue chips.
4. `/?case=tower-echo-bell`: same flow with no cabinet stop. Choosing Nobody is correct, and the debrief explains the echo shell.
5. `curl -X POST /api/reveal` → 404, and a verdict without `evidenceIds` → 200.
6. Export: no `story_revealed` or `evidence_selected` events; every event has `revealedPosition: null` and `selectedEvidence: null`; the verdict has `evidenceIds: []`.
7. Admin: the funnel shows "First question", and the log has no clue rows.
8. `npm test`, `npm run build` and `npm run test:e2e` are green. The load test and `node scripts/admin-demo.mjs` run.

## Code map

**Stand-up.** `npm run dev`, or `npm run build && npm start`. Rehearsal mode gives scripted replies from `kase.rehearsal`. Playwright projects: `default` (4317), `tower` (4318) and `admin` (4319/4320). The grove pixel baseline is `tests/browser/grove-look.spec.mjs-snapshots/grove-darwin.png`.

**Seams**

| Area | Files | Today | Change |
|---|---|---|---|
| Case schema | `server/cases.mjs` :5, :49-53, :59-74, :79-88, :93-106; `server/worlds.mjs` :2-3 | requires `chapters`, `records`, `copy.basket` and per-chapter knowledge; `publicView` sends `chapters`, `clueCount`, `world.clueSpot` | clue fields become optional legacy (still validated when present); `publicView` drops them; `clueSpot` is removed |
| Live cases | `server/cases/banana-mystery.mjs`, `tower-echo-bell.mjs` | records, chapters, basket copy, knowledge "if shown", clue rehearsal branches, debrief evidence | rewrite without clues; versions v2.0.0 |
| Game rules | `server/session.mjs` :15-41 replay, :131-139 stats, :175-176 log, :194-208 view, :232-248 mutate, :278, :290, :318-330 | reveal/evidence actions; interview and verdict gates; clue fields on every event | no clue state; null fields kept; byStage `asked` |
| Prompt | `server/interviews.mjs` :5, :87-105 | knowledge sliced by revealed chapters; public records and presented-evidence blocks | all knowledge; no records or evidence; `interview-v3` |
| API, scripts | `server/index.mjs` :22, :207; `scripts/case-prompt.mjs`; `scripts/preflight.mjs` :13, :40-107 | actions include reveal/evidence; the probe uses `revealedPosition`; preflight crosses CLUES | remove |
| Admin | `server/monitor-round.mjs` :19, :39, :57, :62; `server/monitor.mjs` :3-4, :39-45; `server/admin/round.js:4`; `server/admin/controls.js:149` | `clues` funnel; clue/evidence rows | `asked` funnel ("First question"); no rows |
| Client | `client/main.ts` (map in the research notes: :12-436); `client/types.ts`; `client/worlds.ts` :3, :14, :21; `client/station.ts` :21-30, :180-191, :237-244; `client/notebook.ts` :27, :60, :71-76; CSS (style, banana, tower, notebook, pixel, fit) | clue nav, stops, panels, selectors, styles | remove; nav grid 4 columns; notebook index 2 + cast |
| Tools | `tests/loadtest.mjs:173`, `scripts/admin-demo.mjs:97-98` | reveal step | remove |
| Tests | unit: session, http, cases, case-set, tower-echo, interviews, worlds, fixtures (+ `fixtures/minimal-case.mjs`), preflight, case-prompt, monitor-round, monitor, admin-round, admin-controls, admin, metrics; browser: cases, investigation, provenance, walking, tower, admin, grove baseline | depend on clues | retarget |

**Frozen interfaces:**
- every `/api/*` payload except the removed clue fields and actions
- the schema v2 event shape (keys kept)
- `defineCase` for archived modules
- the admin route shapes (the `funnel` key `clues` → `asked` is the one rename)

**Untouched:**
- archived cases and their tests (`banana-control.test.mjs`, `tower-cases.test.mjs`)
- art PNGs
- `docs/LEVELS_PLAN.md`
- old plan docs

**UI component set:** none (one-off markup in `client/main.ts`, as today).

**Toolchain:** Node `node --test`, `tsc --noEmit && vite build`, Playwright 1.58. Build before e2e, use `--output` isolated per run, and never run unit and e2e suites at the same time.

## Prototype scope

Ruling: no prototype. The feature removes UI and rules from existing screens and adds no new screen or data shape. A sandbox would hold the same diff twice. The try-out is the acceptance checks on the integration build, plus a coordinator browser walk-through of both cases, recorded as a Ruling (precedent: the two-cases run).

## Integration outline

Worktree `superlite/remove-clues` from `demo/override`. Eleven tasks:
- **Server:** T1 case schema; T2 live cases; T3 game rules and prompt; T4 API and scripts.
- **Admin and tools:** T5 admin and monitor; T6 load tools.
- **Client:** T7 client game UI; T8 client scene and styles.
- **Browser specs and docs:** T9 browser specs A; T10 browser specs B with the grove baseline; T11 docs.
