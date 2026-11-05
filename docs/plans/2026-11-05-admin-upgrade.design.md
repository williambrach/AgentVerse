# Design: admin upgrade

How the two admin pages look and behave. The spec (`2026-11-05-admin-upgrade.spec.md`) says what done is, and it wins on any conflict. Paths are relative to `demos/override/server/admin/`.

## §1 Tokens and shared classes (`app.css`)

Both pages load `app.css` first. Keep every existing variable name, because other CSS uses them, and keep `--bg: #0B151B` (pinned by a test). Never use `prefers-color-scheme`, web fonts, `@import` or `url(http…)`.

| Token | Value |
|---|---|
| `--sans` | `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif` |
| `--mono` | `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` |
| `--bg` | `#0B151B` |
| `--surface` | `#101D24` (cards) |
| `--surface-2` | `#16262F` (hover, inputs, raised) |
| `--border` | `#1F3540` |
| `--fg` | `#E8EEF0` |
| `--muted` | `#A9BEC6` |
| `--dim` | `#7F949C` |
| `--accent` | `#5CC8F5` (the only accent: links, focus, primary button, current nav) |
| `--accent-ink` | `#06141B` (text on accent) |
| `--ok` | `#8EE09A` |
| `--ok-bg` | `#8EE09A1A` |
| `--warn` | `#F4B740` |
| `--warn-bg` | `#F4B7401F` |
| `--bad` | `#EA6A55` |
| `--bad-bg` | `#EA6A551F` |
| `--radius` | `10px` |
| `--radius-sm` | `6px` |
| `--gap` | `16px` |
| `--shadow` | `0 1px 0 #ffffff08 inset, 0 8px 24px #0006` |
| `--fs-xs` | `11px` |
| `--fs-sm` | `12px` |
| `--fs` | `14px` |
| `--fs-lg` | `16px` |
| `--fs-xl` | `20px` |
| `--fs-num` | `28px` |

Old names stay as aliases:

| Old name | Now |
|---|---|
| `--panel` | `var(--surface)` |
| `--line` | `var(--border)` |
| `--hair` | `#132129` |
| `--edge` | `#2A4552` |
| `--gold` | `var(--warn)` |
| `--sky` | `var(--accent)` |

**Base rules**
- `body` is `var(--fs)/1.5 var(--sans)` on `--bg`.
- Monospace appears only for `.num`, `pre`, `code`, `kbd` and the log rows. `.num` also gets `font-variant-numeric: tabular-nums`.

**Shared classes, used by both pages:**
- **Header:** `header.top` is a sticky header with blur. Inside it, `h1` is `--fs-lg` 600, and `.top-links a` are the links.
- **Status pill:** `.status` is a pill with a leading dot, coloured by `[data-state]`: `connected` and `ok` give `--ok`; `reconnecting`, `stale` and `unsaved` give `--warn`; `offline` and `bad` give `--bad`. With no `data-state` it is muted.
- **Cards:**
  - `.card` has `--surface`, a 1 px `--border`, `--radius`, `--shadow` and 16 px padding.
  - `.card-head` is a flex row with space-between and a 12 px bottom margin.
  - `.card-title` is `--fs-sm` uppercase with letter-spacing .06em, in `--muted`.
- **Areas:** `.area` is a grid with `--gap`. `.area-title` is `--fs-xl` 600.
- **Controls:**
  - `button` defaults to `--surface-2` with a border, `--radius-sm` and 6×12 padding. Hover lightens it; `:focus-visible` gets a 2 px `--accent` outline.
  - `button.primary` has an `--accent` background and `--accent-ink` text.
  - `button.ghost` is transparent.
  - `input`, `select` and `textarea` use `--surface-2`, a border, `--radius-sm` and the `--sans` font.
- **Chips and badges:**
  - `.chip` is a pill button. `.chip.on` and `[aria-pressed=true]` give an accent border and text.
  - `.badge[data-tone=ok|warn|bad]` is a small pill on the matching `*-bg`.
  - `.dot` is an 8 px circle in `--warn`.
- **Collapsible panels:** `details.panel` is a `.card`. Its `summary` is a flex row with a rotating chevron and no marker. `summary .panel-title` matches `.card-title`.
- **Utilities:** `.muted` (`--muted`), `.dim` (`--dim`).
- **Failover banner:** `#watch` is a `--warn-bg` card with a `--warn` left border. It keeps today's children.

## §2 Command centre (`index.html`, `app.js`, `panels.js`, `centre.css`)

Markup. The ids are fixed, and the `#watch` and `#board-link` lines are byte-identical to today:

```html
<header class="top">
  <h1>Command centre</h1>
  <span id="status" class="status">offline</span>
  <nav class="top-links">
  <a id="board-link" target="_blank" rel="noreferrer" hidden>big-screen ↗</a>
  <a id="maker-link" href="/admin/maker.html">Content editor</a>
  </nav>
  <div id="round"></div>
  <form class="auth" id="auth">…#token #save unchanged…</form>
</header>
<main class="centre">
<section id="watch" hidden></section>
<section class="area" id="area-live"><h2 class="area-title">Live now</h2>
  <section id="players"></section>
  <section id="history"></section>
  <details class="panel" data-panel="health" open><summary><span class="panel-title">Server health</span><span id="health-badge" class="badge" hidden></span></summary><section id="tiles"></section></details>
</section>
<section class="area" id="area-players"><h2 class="area-title">Players and log</h2>
  <div class="cols"><section id="log" class="card"></section><div class="side"><section id="board" class="card"></section></div></div>
</section>
<section class="area" id="area-results"><h2 class="area-title">Results</h2>
  <div class="results"><section id="funnel" class="card"></section><section id="tallies" class="card"></section></div>
</section>
<section class="area" id="area-llm"><h2 class="area-title">LLM ops</h2><section id="controls" class="card"></section></section>
<details class="panel" data-panel="records"><summary><span class="panel-title">System records</span></summary><section id="system-records"></section></details>
</main>
<aside id="player-panel" hidden></aside>
```

**`app.js`**
- `setStatus(s)` also sets `#status` `data-state` to `s`, with spaces turned into `-`, so "bad token" becomes `bad-token`, which is styled like `bad`.
- On load it calls `initPanels(document, localStorage)`.
- Each render calls `setBadge($('health-badge'), worst)`, where `worst` is the value `renderTiles` returns.
- It passes `recordsRoot: $('system-records')` to `renderControls`.

**`panels.js`**
- **Storage:** the key `override.admin.collapsed` holds a JSON array of the names of collapsed panels. While the key is missing, the HTML defaults apply: health open, records closed. Every `toggle` event writes the full collapsed list. A bad JSON value is ignored.
- **`setBadge(el, level)`:**
  - `ok`, or anything that is not warn or bad: `hidden = true` and empty text.
  - `warn`: text "Warning", `data-tone=warn`.
  - `bad`: text "Problem", `data-tone=bad`.

**`centre.css`**
- `main.centre` is a single-column grid with 28 px gaps and a max width of 1600 px, centred.
- `#players` is a grid of 4 large tiles, and `#history` a grid of 5 sparklines.
- `.cols`: `#log` is `minmax(0,1fr)` and `.side` is 340 px. At 1440 px, `.board-name` stays over 100 px wide (a browser test checks it).
- `.results` is a 2-column grid.
- Below 860 px everything stacks to one column.

**Module CSS** (`tiles.css`, `log.css`, `board.css`, `round.css`, `controls.css`):
- Restyle onto the tokens and keep every class name.
- `tiles.css` keeps its ok, warn and bad literal values, which a test pins.
- `log.css` keeps `.log-player { … text-overflow: ellipsis }`.
- Large numbers use `.num` styling: mono, `--fs-num`.
- Funnel bars are 6 px rounded tracks in `--surface-2`, filled with `--accent`, `--ok` or `--bad`.
- Endpoint rows in `controls.css` are sub-cards.

**`controls.js`:** the opts gain an optional `recordsRoot`. When it is given, the records list `ul.ctl-system` goes there with no `h3` title; otherwise the behaviour is unchanged.

## §3 Content editor form (`maker-form.js`, `maker-copy.js`)

**Sections**, in this order:

| Key | Title | Fields |
|---|---|---|
| `story` | Story | `copy.*` |
| `prompt` | Prompt | `prompt.*` |
| `part:<id>` | the part's current label, else its id | `parts.<id>.*`, in `PART_FIELDS` order; the header carries a role badge |
| `debrief` | Debrief | `debrief.*`, `answer.*` |

Each section is a `section.form-section[data-section=<key>]` holding an `h2.section-title` (for a part: the title, then a `span.badge.role-badge`).

**Field structure:**
- `div.field` > `label.field-label`, whose text is the label and whose `title` is the path
- then `p.field-hint`
- then `textarea.field-input[data-path]`
- then `span.differs` with the text "edited" and `button.reset` "Authored"
- then `div.field-error`

`.differs` and the reset button behave as today.

**Name tags:** the Prompt section and every part section carry a `p.placeholders` that reads "Name tags: {planner} {carrier} {lookout} {minder}. Each becomes the name of the character dealt that part in a session."

**Auto-grow:** on every input and on `show`, set `style.height = 'auto'`, then set it to `scrollHeight + 2` px. Skip this when `scrollHeight` is not a number. The CSS also sets `field-sizing: content`.

**Labels** (`maker-copy.js` `fieldCopy(path)`). Before writing each hint, find where the field is used: `client/`, `server/interviews.mjs`, `server/cases.mjs`.

| Path | Label |
|---|---|
| `copy.headline` | Headline |
| `copy.intro.lead` | Intro lead |
| `copy.intro.body` | Intro text |
| `copy.briefing.title` | Briefing title |
| `copy.briefing.description` | Briefing text |
| `copy.briefing.question` | Briefing question |
| `copy.briefing.hint` | Briefing hint |
| `copy.report.title` | Report title |
| `copy.report.description` | Report text |
| `prompt.setting` | Setting |
| `prompt.use` | Words to use |
| `prompt.avoid` | Words to avoid |
| `parts.*.label` | Part name |
| `parts.*.introduction` | Opening line |
| `parts.*.quickQuestion` | Suggested question |
| `parts.*.knowledge` | What this character knows |
| `parts.*.finding.classification` | Debrief verdict |
| `parts.*.finding.explanation` | Debrief explanation |
| `debrief.title` | Debrief title |
| `debrief.summary` | Debrief summary |
| `debrief.lesson` | Lesson |
| `answer.feedback.correct` | Feedback when all right |
| `answer.feedback.other` | Feedback otherwise |

The hints of `copy.report.*` and `debrief.summary` start with "Not shown to players yet." List fields (`prompt.use`, `prompt.avoid`, `*.knowledge`) end their hint with "One per line." An unknown path gets its last segment as the label and an empty hint.

## §4 Test chat (`maker-chat.js`)

It works on page ids: `#character` (select), `#thread`, `#question` (input), `#ask` (form), `#try` (the Send submit button), `#preview` ("Show prompt"), `#prompt-box` (hidden wrapper) > `#prompt` (pre), `#new-chat` and `#try-note`.

**Character options:** the value is the character id. The text is `Name · <part label> (<role>)` when part i exists, using the label from `current['parts.<id>.label']`. Otherwise the text is just `Name`.

**Thread:** each turn is a `div.turn` holding:
- `div.msg.q`, the question
- `div.msg.a`, the answer, which reads "<Name> is thinking…" while pending
- an optional `details.reasoning` > `summary` "Reasoning" + `pre`

An error replaces the pending text with `div.msg.err`, and that turn is not recorded.

**Rehearsal** (`detail.mode !== 'live'`):
- `#question` and `#try` are disabled.
- `#try-note` reads "Rehearsal mode: replies are scripted. Start the server in live mode to try the model."
- Show prompt still works.

**Request bodies:**
- Try: `{edits, characterId, question, history}`. `history` holds the last 20 turns as `{question, answer}`, and is omitted when there are none.
- Preview: the same, with `question` set only when the input is not empty.

## §5 Content editor page (`maker.html`, `maker.js`, `maker.css`)

```html
<header class="top">
  <h1>Content editor</h1>
  <nav class="top-links"><a id="back-link" href="/admin/">Command centre</a></nav>
  <nav id="cases" aria-label="Cases"></nav>
  <span id="status" class="status">offline</span>
  <span id="dirty-count" class="muted"></span>
  <span id="publish-note" class="muted"></span>
  <button id="publish" class="primary" type="button">Publish</button>
  <form class="auth" id="auth">…#token #save unchanged…</form>
</header>
<div class="maker">
  <nav id="sections" aria-label="Sections"></nav>
  <main id="editor"><div id="form"></div>
    <section id="history-section" class="form-section" data-section="history" hidden><h2 class="section-title">History</h2><ol id="history"></ol></section></main>
  <aside id="panel" class="card chat">
    <div class="card-head"><h2 class="card-title">Test chat</h2><button id="new-chat" type="button" class="ghost">New chat</button></div>
    <label for="character">Character</label><select id="character"></select>
    <div id="thread" aria-live="polite"></div>
    <p id="try-note" class="muted"></p>
    <form id="ask"><input id="question" type="text" autocomplete="off" placeholder="Ask a question…"><button id="try" type="submit" class="primary">Send</button></form>
    <button id="preview" type="button" class="ghost">Show prompt</button>
    <div id="prompt-box" hidden><pre id="prompt"></pre></div>
  </aside>
</div>
```

**Sidebar** (`#sections`):
- One `button.nav-item[data-section]` per form section, plus History. A part entry shows the title and a role badge.
- The chosen entry has `aria-current="true"`.
- An entry gets a `span.dot` when its key is in `form.dirtySections()`.
- Choosing History hides `#form` and shows `#history-section`.
- A case switch goes back to `story`.

**Top bar:**
- `#dirty-count` reads "1 unsaved change", "n unsaved changes", or nothing.
- `#status` keeps today's texts: "Up to date", "Unsaved changes" and the stale and corrupt flags. It sets `data-state` to `ok`, `unsaved` or `bad`.

**Field errors:** a Publish or chat error with a `path` selects the section that `setError` returns.

**`mountMaker`** still returns `{load, select, preview, tryAsk, publish, restore}`, where `preview` is `chat.showPrompt` and `tryAsk` is `chat.send`.

**Layout** (`maker.css`):
- Columns are 220 px | `minmax(0,1fr)` | 380 px. The sidebar and chat are sticky, at the window height minus the header, and scroll on their own.
- The editor column reads at most 860 px wide.
- Below 1100 px the chat drops under the editor; below 860 px all three stack.
- Chat bubbles: `.msg.q` aligns right on `--surface-2`, and `.msg.a` aligns left on `--surface` with a border.
