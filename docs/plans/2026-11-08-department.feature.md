# Feature plan: Department murder mystery ("After Hours")

Spec: `docs/plans/2026-11-08-department.spec.md`; it wins on any drift. Content: `docs/plans/2026-11-08-department.content.md`. App: `demos/override`.

## Goal

A fifth game for Override players at the IMADA Cup. A woman detective walks a rainy-morning university department hall, questions five colleagues, examines evidence on the floor, and labels each person Killer, Leaker or Innocent. Jobs stay fixed to the people; who killed, who leaked and who saw what is dealt per session. Grove, Tower, Friends and Factory stay unchanged.

## What changes

| Target | Change |
|---|---|
| Case board | Fifth card, "After Hours": world Department, 5 faces. |
| Department hall (walking station) | The painted `department-hall.png` fills the world, with a dark fill beyond the image. Five colleagues and the detective are drawn from static pose PNGs by foot anchor. WASD / arrows move the detective; E next to a person opens the interview. |
| Walk zones | The detective stays on the floor: the back wall, coffee counter, lounge, desks, bottom-left plant and armchair stop it. |
| Evidence | 8 items lie on the floor, each with a small yellow marker. E next to an item reads "Examine <title>" and opens the notebook's Evidence page with that card. The marker disappears once the item is examined. |
| Rail / interview header | Each person's job label (PhD student, Professor, IT administrator, Department administrator), plus faces cropped from the listening PNGs. |
| Room nav | Adds an Evidence button with "n/8", shown for this case only. |
| Poses | Same as Factory: the asked person thinks while the reply is pending and speaks while it shows; the detective thinks while the player types and speaks on send. |
| Lineup | Choice mode with Killer / Leaker / Innocent per person (existing choice mode). |
| Server | New `department` world; case `department-murder` with custom roles, character `label` + `knowledge`, and `evidence`. Interview and thread prompts use the job label and job knowledge. `visit` accepts `evidence` and `evidence:<id>`; `session.examined` and `session.evidence` appear only for evidence cases. |
| Tests | Unit tests for the case, assets, layout, prompts and the examine flow; Playwright project `department`. |

## Acceptance checks

1. Open the game and the case board: five cards. Pick After Hours: the hall shows the painted room, five colleagues and the detective, with no 404s in the console.
2. Walk with WASD to each person: "[E] Ask <name>" appears and E opens the interview. Walking into the back wall, the lounge, the bottom-left plant or the armchair stops the detective.
3. Ask a question: the person shows the thinking pose while waiting, the speaking pose while the reply shows, then listening. The detective thinks while you type and speaks when you send.
4. The rail shows the job labels. Reset the session twice and read the cast in the data dir: the killer and the leaker move between people, and they are never the same person.
5. Walk to the USB drive and press E: the Evidence page opens with the card and the marker is gone. Reload: the card is still listed and the nav says 1/8. Card text for unexamined items is absent from `/api/state`.
6. Label everyone right: the win debrief. Wrong labels: the "other" feedback. The debrief reveals all five parts.
7. At 390×844 and 1440×900, figures and evidence are not clipped, nothing sits under the rail or the dialogue controls, and no HUD control overlaps another.
8. Friends, Factory, Grove and Tower still open and play.

## Code map

**Stand-up.**
- `cd demos/override`; `npm run build` runs tsc + vite, and `public/` is copied to `dist/` unhashed.
- `node server/index.mjs` serves `dist/` on PORT. Rehearsal mode runs when `OVERRIDE_LLM_API_KEY` is empty, using scripted replies from the case.
- `npm test` = `node --test tests/*.test.mjs`, which imports `.ts` directly. `npx playwright test --project=<p>`.

**Server seams**
- `server/worlds.mjs:1-6`: frozen world map. Add `department` (agents 5, place `Department Hall`, cast `a colleague`/`colleagues`, persona `colleague`, plus frame and memory sentences).
- `server/cases.mjs`:
  - `defineCase` :50-120: characters are checked only for id/name/color at :82. Add optional `label` (string) and `knowledge` (string[], no `{`), and optional `evidence` (1–12 items: id `/^[a-z][a-z0-9-]{1,23}$/` unique, non-empty title, text with part placeholders checked).
  - `castCharacters` :149-157 `role`: change to `resolve(character.label ?? p.label)`.
  - `publicView` :166-177: append `evidence: [{id,title}]` only when the case has evidence. Key order for other cases is unchanged (pinned at tests/cases.test.mjs:51-52, 181-182).
- `server/cases/index.mjs`: register `departmentMurder` after `factoryEscape`.
- `server/interviews.mjs`:
  - `buildMessages` :94-115 and `buildThreadMessages` :128-148: use `character.label ?? part.label` in `You play X (…)`, and set the knowledge to `[...(character.knowledge ?? []), ...part.knowledge]`.
  - `character` there is from `kase.characters`. Other cases are byte-identical.
- `server/session.mjs`:
  - The state shape is built in `replay` :62-66 and `start()` :415-421. Add `examined: []` only when `kase.evidence` exists.
  - Replay :74: when `location_visited` has `evidence:<id>`, push the id if it is missing.
  - `visit` :370-373: for evidence cases, the allowed list also has `'evidence'` and `evidence:<id>`; examining pushes the id once, in order. `'replay'` and `'nowhere'` must still be rejected (session.test.mjs:57, session-team.test.mjs:63).
  - `view()` :257-273: for evidence cases, `session.evidence = s.examined.map(id → {id, title, text: resolve(kase, cast, text)})`.
  - Rollback clones the whole state (:352, :392), so `examined` rides along.
- `server/content.mjs`: `rawOf` keeps the extra fields, and `build` calls `defineCase`. `structure()` :206 drops them, which is fine; its shape is pinned at content.test.mjs:216-224. No edit paths are added.
- Consumers of `location_visited`: only monitor.mjs:3/:34 shows `e.location` as text; nothing else counts it. No change.

**Client seams**
- `client/worlds.ts`:
  - `WorldPack` :6-24 gains optional `backdrop {url, w, h, scale, x, y}`, `walk {bounds, blocks[]}` and `evidence [{id, x, y}]`.
  - `figures` is reused (base `/assets/department/characters`, props `/assets/department/props`, sprites map, `detective: 'player'`, frame 192×384, anchor 96,376, scale 1/6, density 3, labelLift 68).
  - Register the pack in `packs` :92.
- `client/factory-figures.ts`: reuse `poseUrl`, `propUrl`, `figureBox`, `poseFor` and `speakMs`. New pure helpers (point-in-walk-area, backdrop rect) go in a new `client/hall-layout.ts`.
- `client/station.ts`:
  - `buildStops` :24-31 adds evidence stops, keyed `evidence:<id>` and titled `Examine <title>`. The title comes from `state.evidence`, so the station needs the case's evidence titles, through `configure()` / an `evidence(examined)` setter.
  - `preload` :176-185: load the backdrop and the evidence props and marker.
  - `create` :315 → for a `backdrop`, draw the image at its scale with a dark fill, in place of `drawFactory`'s flat floor.
  - :339: when `walk` is set, use its bounds and add the blocks as static bodies.
  - The proximity check (:732, distance < 18) and `onArrival` :751 work for any stop key.
- `client/types.ts:2`: `LocationId` gains `'evidence'` and `` `evidence:${string}` ``. `CaseState` gains `evidence?: {id,title}[]`; `Session` gains `examined?: string[]` and `evidence?: {id,title,text}[]`.
- `client/main.ts`:
  - `visit` :295 sends the location as is. When it starts with `evidence:`, set the panel to `'evidence'` (panel ids must not contain `:`, because renderNotebook splits its key on `:`).
  - `savedPanel` :363 maps `evidence*` to `'evidence'`.
  - `sections` :430 gains `evidence: 'Evidence'`, and a new `evidencePanel` markup branch goes before `interviewMarkup` :437, which throws on an unknown id.
  - Room nav `renderWorld` :256-270: add an Evidence button (data-go `evidence`) when `state.evidence` exists, with `--nav-n` +1 and the count in `syncNavText` :279.
  - The station is told which items are examined after each render.
- `client/dialogue.ts`: new `evidencePanel(cards, focusId, total)` from existing notebook styles (`heading`, `.briefing-note`).
- CSS: a new `client/department.css` imported in main.ts.
  - Theme: `#app[data-world="department"]`.
  - Face crops: `.monkey-face.<id>`, `.monkey-line[data-world="department"] .monkey-face.<id>` and `.portrait.<id> .pixel-person`, following factory.css:11-19.
  - Evidence card styles and the nav icon.
- Assets go to `public/assets/department/characters/{phd-01,phd-02,professor,it-admin,department-admin,player}-{listening,speaking,thinking}.png` (18 files), `props/*.png` (12) and `department-hall.png`.

**Must not change (FROZEN in integration):**
- event `schemaVersion` and replay of existing events;
- prompt bytes, content hashes and public views of the four existing cases;
- the `Inspection` type;
- `promptVersion` / `threadPromptVersion`;
- the action list (`server/index.mjs:28`) and routes;
- the grove/tower art keys, `ATLAS_DIMS`, the grove-look snapshot, the factory floor and its deadline/cipher behaviour;
- the roundtable path.

**Pins to update:**
- `tests/cases-content.test.mjs:12-15` (registry list, worlds, title);
- `tests/friends-case.test.mjs:15-16`;
- `tests/factory-case.test.mjs:43-44` (`cases.at(-1)` → find by id);
- `tests/thread-prompt.test.mjs:54-60` (add a hash for the new case) and :83 (`character.label ?? own.label`);
- `tests/leaderboard.test.mjs:35-37` (`none('department-murder')`);
- `tests/worlds.test.mjs:70-90` (department parity);
- `tests/factory-figures.test.mjs:93-94` (other worlds without `figures`: department has figures, so exclude it);
- `tests/browser/cases.spec.mjs:8,192` (4 → 5);
- `tests/browser/factory.spec.mjs:74` (4 → 5);
- `playwright.config.mjs` (`seenSplash` port 4325, a `department` project and its webServer, and the default project's testIgnore).

**Toolchain.** Node 25 ESM; Phaser 3 (`pixelArt:true`, `Scale.FIT`); hand-written HTML helpers (`client/html.ts`, `hud.ts`, `dialogue.ts`) and per-world CSS, so there is no UI component set to compose from. PNG checks use `tests/png.mjs` (`readPng`). Browser helpers: `tests/browser/team.mjs` (`test` with a checked-in page), `tests/browser/cast.mjs` (`castOf`, `truthOf`) and `tests/helpers/until.mjs`. The scene key is `banana-grove` for every walking world.

## Rulings

- Ruling: the backdrop is drawn at 1/3 world unit per image px (512 × 341.33 units, left edge at x = −16, top at 0). At density 3 that is exactly one canvas px per image px. Beyond it, `#1b1714` fills the frame.
- Ruling: figures at scale 1/6 (exactly ½ on the canvas), props at 1/12 (¼), and the marker at 1/24 (⅛). Every image is decimated by an exact factor with nearest-neighbour.
- Ruling: starting geometry in world units (image px / 3 − 16 for x, image px / 3 for y). The prototype tunes it from screenshots and the layout test guards it:
  - walk bounds x 40..436, y 188..326;
  - blocks: lounge (−16,200,74,100), bottom-left plant (−16,282,104,60), armchair (386,272,80,70), desks (422,150,80,112);
  - slots: freja (150,286), mikkel (330,296), birgit (100,214), jonas (275,248), signe (365,214);
  - stops: briefing (250,318), report (200,296);
  - evidence: coffee-mug (62,222), usb-drive (64,262), torn-document (160,206), server-tower (218,200), access-card (250,214), cracked-phone (300,192), laptop (408,262), keys (372,318).
- Ruling: examining reuses `visit`. No new action and no new event type; `location_visited` carries `evidence:<id>`. `visit 'evidence'` only opens the page.
- Ruling: the card text reaches the client only through `session.evidence`, after examining. `publicView` carries ids and titles.
- Ruling: the job label replaces the part label in the prompt's first line and in the rail. Every part label is "Colleague", so a part label never leaks a role.
- Ruling: `thread-prompt.test.mjs` is updated to expect `character.label ?? own.label`. Its privacy assertions stay.
- Ruling: the case-board "A 2–3 MINUTE MYSTERY" label stays as it is.
- Ruling: the detective is not named and is drawn from `player-*`. The root `investigator-*` files are not copied.

## Prototype scope

Level L1: rehearsal mode stands in for the LLM. Keep the whole app in the sandbox worktree, built and served by `node server/index.mjs` on port 4331 with `OVERRIDE_DEV_TOOLS=1`.

- **In scope:** assets; world pack and server world; the case module from the content doc; the `defineCase`/prompt/`castCharacters`/`publicView` additions; examine via `visit`; the station backdrop, walk zones, evidence stops and markers; the Evidence page and nav button; faces and theme CSS.
- **Out of scope in the prototype:** pin updates beyond what blocks the build, the README, and small-screen polish.

Prototype tests: unit tests for the case and examine flow, plus one Playwright spec (`department-proto.spec.mjs`) that drives acceptance checks 1, 2, 3, 5 and 6.

## Integration outline

Work happens on `superlite/department` (worktree `.superlite/worktrees/department`, base `main`). Port by module, using the prototype as a reference only:
1. Assets, the client world pack and the server world, with the parity test.
2. `defineCase` additions (character label/knowledge, evidence) with validation tests; `castCharacters`; `publicView`.
3. The prompt builders and the thread-prompt test update.
4. The case module from the content doc, plus registry and content pins.
5. Session examine: visit, replay, view and tests.
6. Station: backdrop, walk zones, evidence stops and markers, `hall-layout.ts` and the layout test.
7. main.ts / dialogue.ts / types: the Evidence page, nav button and panel routing; `department.css` with theme and faces.
8. Browser: the `department` Playwright project (port 4325), `cases.spec` and `factory.spec` 4 → 5, the small-screen check.
9. Docs: the README case list and world walkthrough, and `docs/CASES_PLAN.md`.

Seam checks: case ↔ world parity (ids, evidence ids, sprites); examine ↔ view ↔ Evidence page; prompt ↔ thread-prompt privacy test; station stops ↔ main.ts `visit`.
