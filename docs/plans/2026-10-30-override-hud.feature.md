# Feature plan: Override game UI, in the style of the design

Spec: `docs/plans/2026-10-30-override-hud.spec.md`. Design: artifact "The Override · UI redesign".

## Goal

Make The Override look and play like the design: the world fills the screen and the interface floats over it. It is for event players at their own screens, and for the organiser running the room from a projector and a command centre.

## What changes

| Screen | Today | After |
|---|---|---|
| Game | Small map beside a notebook page | World fills the window, HUD over it |
| Cast | Buttons under the map | Left rail cards: portrait, part, asked tick |
| Arbiter tools | Toolbelt under the map | Same cards, in the rail |
| Conversation | Notebook column | Parchment box at the bottom, closed while walking |
| Verdict | Chips in the notebook | Full-screen lineup with a role scale |
| Debrief | Notebook page | Full-screen, same look as the lineup |
| Leaderboard | Small overlay | Overlay with case columns, plus a projector page |
| Admin | Plain page | Dark command centre, same controls, adds a failover banner |
| Case board, gate, reset | Light theme | Same dark and parchment tokens |

## Acceptance checks

- Open the game at 1280×720, 1440×900 and 1920×1080: no scrollbars, world edge to edge, nobody hidden under the rail or the top bar.
- Walk to a character with WASD and press E: the box opens. Walk away: it closes.
- Ask a question, follow up, and scroll back to the first answer in the box.
- Use Inspect reasoning and Let them talk from the rail; coins left go down by the right amount.
- Press Make your verdict after asking everyone: the lineup shows the cast, each with a four-stop scale. Lock in is off until all are picked.
- Lock in: the debrief shows the score and each true role.
- Play the tower case: same HUD, tower colours, three characters.
- Open `/?view=board` with two teams finishing: rows and case columns update on their own.
- Open `/admin`: dark command centre; start round, pause, probe and cap still work.
- Resize to a phone width: still playable by scrolling.

## Code map

**Entry and stand-up.** `demos/override`: `npm run build`, `node server/index.mjs` on :3001, serving `dist/` cached at startup. Empty key and model give rehearsal mode with no LLM. Admin is a separate listener on 127.0.0.1:3002 (needs `OVERRIDE_ADMIN_TOKEN`). `client/main.ts` is the single entry: `boot()` runs access, then team gate, `shell()`, `render()`.

**Touched client files.**

| File | Seam |
|---|---|
| `client/main.ts` (689 lines) | `shell()` markup, every panel, `render()`, overlays. Most work lands here |
| `client/station.ts` | Phaser config :504, `width`/`height` :35, ground :361-400, label layer :436, `say` :414 |
| `client/bubble-layout.ts` | `GAME_WIDTH` clamps bubbles to the world |
| `client/notebook.ts` | `renderNotebook` needs `#panel` and a bounded flex parent |
| `client/tools.ts`, `client/team.ts` | Markup pinned by `tests/tools-ui`, `tests/team-ui` |
| `client/*.css` | `style`, `pixel`, `fit`, `tower`, `notebook`, `roles`, `tools`, `team`, `case-board`, `bubbles`; `banana.css` holds all portrait sprites and must keep them |

**Server, additive only.** `server/leaderboard.mjs` `row()` and `standings()`, `reset()` called from `server/index.mjs:176,193`. `server/admin/*.{js,css,html}`.

**Tests that pin the UI.** `tests/browser/*.spec.mjs` (ids listed in the research; default viewport 1440×1000), `tests/browser/grove-look.spec.mjs` (`#station canvas` baseline, 50 px), unit `team-ui`, `tools-ui`, `recolor`, `worlds`, `admin-*`, `admin-page-files` (exact CSP, no `innerHTML`, no inline style).

**Must not change.** All `/api/*` request bodies and existing response fields; the `verdict` payload; `data-go`, `#question`, `#inspect-button`, `#continue-button`, `#read-thread`, `input[name="role-<id>"]`, `#lock-in`; `Station.configure/say/clearBubbles/setEnabled/resetPosition`; world coordinates and sprite sheets; the admin CSP and `/admin/*` routes.

**Conventions.** No UI component set: template strings in `main.ts`, `tools.ts`, `team.ts`, with `escape()` on all data, plain CSS files imported by `main.ts`. Node 22, TypeScript via Vite, `node --test` and Playwright. Build before e2e; isolate e2e with `--output`; never run unit and e2e at once.

## Prototype scope

Level L1. Rehearsal mode replaces the LLM, so no stubs are needed.

- **Keep:** the real client and server.
- **Build:** the wide stage, the HUD shell, the dialogue box, the verdict lineup, on both worlds, as one new `client/hud.css` layered over today's CSS.
- **Leave alone:** debrief, case board, leaderboard, admin. They will look out of place in the prototype.
- **Why this cut:** the risk is the stage and walking under a HUD. The rest is reskinning.

## Integration outline

1. Stage layout and wide stage in `station.ts`, new baseline.
2. Tokens, fonts and the CSS rewrite; old stylesheets deleted.
3. Panels move out of `main.ts` so tasks do not collide.
4. HUD shell, dialogue box, lineup, debrief, overlays: one task each.
5. Leaderboard cells and round label on the server, then the overlay and the big screen.
6. Admin restyle and failover banner.
7. Test updates beside each change, README and DEPLOY notes, seam check.

## Rulings

- Ruling: no rival Arbiter in this build - no code plays the cases, so its numbers would be invented on a projector - cost if wrong: a follow-up feature with a recorded benchmark run.
- Ruling: Inspect reasoning stays in the rail's ARBITER TOOLS group, overriding the design's placement - the toolbelt was added after the design because players missed the tools - cost if wrong: moving one card.
- Ruling: admin keeps `ui-monospace` - web fonts would need a CSP change - cost if wrong: a slightly different mono face.
