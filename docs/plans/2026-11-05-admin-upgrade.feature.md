# Feature plan: admin upgrade

**Spec:** docs/plans/2026-11-05-admin-upgrade.spec.md (wins on any drift)
**Orchestrator:** AI (user, 2026-11-05)

## Goal

The operator runs live events from `/admin` and gives `/admin/maker.html` to game makers. Both pages get a clean dark dashboard look:

- **Command centre:** regrouped into four labelled areas.
- **Content editor:** becomes a sectioned editor with readable fields and a multi-turn test chat.

## What changes

**`/admin` (command centre, port 3002)**
- **Header:**
  - The title becomes "Command centre".
  - The connection status becomes a pill with a coloured dot.
  - Round, Start round, Big screen and Content editor links, and the token stay in the header.
- **Live now:**
  - The failover banner, the four player tiles and the sparklines.
  - A collapsible **Server health** card with the 11 health tiles. Its header shows the worst level when collapsed.
- **Players and log:**
  - The message log with its filters, which is the wide column.
  - The leaderboard beside it.
- **Results:** two cards side by side: Funnel (each case's steps) and Verdicts (each case's role tallies).
- **LLM ops:** endpoints, Move + pin, Probe, Cap, Cap all, Pause new games and the in-memory line.
- **System records:** a collapsible card, collapsed by default.
- Collapse state is kept in `localStorage` `override.admin.collapsed`.

**`/admin/maker.html` (content editor)**
- **Top bar:**
  - The title "Content editor", the case tabs and the status.
  - "n unsaved changes" and a primary **Publish** button, with its note.
  - The token.
- **Left sidebar:** Story, Prompt, one entry per part (part label and role chip), Debrief and History. An entry with unsaved edits shows a dot.
- **Editor column:**
  - Shows only the chosen section.
  - Each field has a plain label and a one-line hint. The raw key appears only as a tooltip.
  - Textareas grow with their text.
  - The Prompt section and every part section explain the name tags (`{planner}` and so on).
  - The per-field "edited / Authored" reset stays.
- **Test chat (right column):**
  - A character picker labelled "Momo · The planner (villain)".
  - A thread of questions and answers, with a collapsed Reasoning under each answer.
  - A question box and a Send button.
  - "Show prompt", which previews the system prompt for the next turn, and "New chat".
  - In rehearsal mode the chat is disabled and shows a note.
  - Each send posts `{edits, characterId, question, history}` to `/try` with the last 20 turns at most.

## Acceptance checks

Spec D1-D13. In try-out form:

1. Open `/admin/maker.html` and save the token. The sidebar shows Story, Prompt, one entry per part, Debrief and History. Click a part: only its fields show.
2. No field label contains a dot-separated key. Every field has a hint.
3. A long `knowledge` field shows all its text with no inner scrollbar. Adding lines grows it.
4. Edit a field in Story, then switch to Prompt. The Story entry shows a dot, and the top bar says "1 unsaved change".
5. Live mode: pick a character and ask 3 questions. 3 answers appear in one thread. The 3rd request carries 2 history turns and the unsaved edits.
6. "Show prompt" shows the system prompt. An answer with reasoning has a closed Reasoning disclosure.
7. Rehearsal mode: the chat input is disabled and shows the note. New chat, and switching character or case, empty the thread.
8. Publish, Restore, the 409 note and a field error work as before. The field error opens its section.
9. `/admin` shows Live now, Players and log, Results and LLM ops in order, with every existing control.
10. Collapse Server health and System records, then reload: both stay collapsed. A collapsed Server health shows a warn or bad badge when a tile is warn or bad.
11. Warn and bad tiles and the failover banner are coloured.
12. Both pages load `app.css` tokens. There are no web fonts and no external requests.
13. The unit suite and the Playwright default and admin projects pass.

## Code map

Paths are relative to `demos/override/`.

- **Stand-up:** `server/index.mjs` `startServer()`. The admin listener exists only with `OVERRIDE_ADMIN_TOKEN` (default port 3002). `createAdmin()` in `server/admin.mjs` loads top-level `server/admin/*.{html,js,css}` once at startup, so new files are served without changes but only after a restart.
  - **CSP:** `default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'`. There is no `font-src` or `img-src`, so system fonts are the only option.
  - **Demo backend:** `scripts/admin-demo.mjs` runs the real server in live mode over `scripts/mock-llm.mjs` endpoints with simulated players. Flags: `--players --port --admin-port`; the token comes from `OVERRIDE_ADMIN_TOKEN`.
- **UI component set:** none. The pages are plain ES modules: the `dom.js` `el(doc, tag, cls, {text, parent})` helper plus base element rules and tokens in `app.css`. New shared look goes in `app.css`.
- **Command centre:**
  - `index.html`
  - `app.js`: stream at `/admin/stream`; `hello`/`event`/`tick` go to `render`.
  - `tiles.js` (`renderPlayers`, `renderTiles` returns the worst level, `renderHistory`), `log.js` (`createLog`), `board.js` (`renderBoard`), `round.js` (`renderFunnel`, `renderTallies`, `createRoundControl`), `controls.js` (`renderControls`, which also renders System records), `watch.js` (`renderWatch`)
  - CSS: `tiles.css`, `log.css`, `board.css`, `round.css`, `controls.css`
- **Editor:**
  - `maker.html`, `maker.js` (`mountMaker` returns `{load, select, preview, tryAsk, publish, restore}`), `maker-form.js` (`renderForm` returns `{setDetail, dirty, overlay, setError, clearErrors}`), `maker.css`.
  - Routes (frozen): `GET /admin/content`; `GET /admin/content/<id>` returns `{...info, mode, structure{characters[{id,name,color}], parts[{id,role}], placeholders}, authored, current, history}`.
  - `POST …/preview|try {edits, characterId, question?, history?[≤20 {question,answer}]}`. Try returns `{answer, reasoning|null, provenance}`, or 409 in rehearsal.
  - `PUT {edits, baseRev}`; 409 `{error, rev, by}`; 400 `{error, path}`; `POST …/revert {rev}`.
  - Try routes part i to character i (`identityCast`, `server/cases.mjs:171`).
- **Tests on these files:**
  - Unit (fake DOMs; only `appendChild`, `addEventListener`, `dataset`, `className`, `hidden`, `value`, `textContent`; `getElementById` only for the listed ids): `tests/admin-{tiles,board,log,round,controls,watch,maker-form,maker-ui,makers,content}.test.mjs`, `tests/admin.test.mjs`.
  - `admin.test.mjs` pins:
    - no `innerHTML`, inline `style=` or inline script
    - `src`/`href` start with `/admin/` or `#`
    - no `http` or `@import` in CSS
    - `--bg: #0B151B`, and no `prefers-color-scheme`
    - the `index.html` regexes (`<section id="watch" hidden></section>`, the board-link markup, the h1)
    - the tiles.css ok/warn/bad literals
  - Browser: `tests/browser/admin.spec.mjs` and `maker.spec.mjs` (Playwright project `admin`, rehearsal server, ports 4319/4320, admin token `admin-e2e`, maker token `maker-e2e`).
- **Frozen interfaces:**
  - every `/admin/*` route and body
  - the stream line kinds
  - the exported function names and signatures of every module above (new optional options are allowed)
  - the ids the browser specs use, kept unless the plan renames them with the test: `#token #save #status #players #log #round #board #player-panel #preview #prompt #publish #publish-note #history`, plus `textarea[data-path]`.

## Prototype scope

Level L1. Worktree `superlite/admin-upgrade-proto`.

- **Keep:**
  - the real server and admin listener
  - all of `server/admin/*`, which is rebuilt in place
  - the existing unit tests, updated where ids move
- **Stub:** the LLM, via `scripts/admin-demo.mjs` and its mock endpoints (live mode, fake players, no secrets).
  - Run: `OVERRIDE_ADMIN_TOKEN=proto node scripts/admin-demo.mjs --players 6 --port 3101 --admin-port 3102`
  - Reach: `http://127.0.0.1:3102/admin` and `/admin/maker.html`, with token `proto`.
- **Drop:** the game client.

Rulings:
- Ruling: the prototype builds the real admin modules, not throwaway copies. These pages are static modules over frozen routes, and the backend stub (mock LLM) already exists in `scripts/`, so nothing inside them needs stubbing. As a result the prototype is more than the usual quarter of the work. Cost if wrong: a redesign round redoes CSS, not routes.
- Ruling: the h1 becomes "Command centre". `admin.test.mjs` and `admin.spec.mjs` change with it. `--bg #0B151B` and the tiles.css level literals stay, so those pins hold.
- Ruling: History becomes a sidebar section of the editor, so `maker.spec` clicks History before Restore.
- Ruling: the hints on `copy.report.*` and `debrief.summary` say "Not shown to players yet." This is the pre-existing gap, made honest. No rendering change.
- Ruling: the chat's 3-turn check with "edited text changes the answer" (spec D5) runs at integration time against the user's live dev server. The real `.env` never goes into a worktree. In the prototype, the browser spec asserts the request body.

## Integration outline

Dedicated worktree `.superlite/worktrees/admin-upgrade`, branch `superlite/admin-upgrade` from `main`. One port task per module group, copied from the prototype:

1. tokens
2. centre shell
3. centre modules
4. editor form
5. editor chat
6. editor shell and styles
7. browser specs

After that:
- A seam check: the full unit suite and the Playwright `default` and `admin` projects, run one after another, never at once.
- A live check of D5 on the dev server.
- The review and the final review.

The prototype's browser acceptance spec becomes the integration target.
