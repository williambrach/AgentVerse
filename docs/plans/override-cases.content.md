# Case content for override-cases (decided; transcribe exactly)

Both files start with `import { defineCase } from '../cases.mjs';` and `export default defineCase({ … });`. Curly quotes and `→` are part of the strings. `\n` appears only in `copy.intro.lead`.

## A. `server/cases/banana-mystery.mjs`

Fields `characters`, `chapters`, `records`, `knowledge`, `debrief` are pasted unchanged from `server/case.mjs`. Add these:

```js
id: 'banana-mystery', version: 'banana-authored-v1.0.0', order: 1, status: 'ready', title: 'The Banana Mystery',
copy: {
  headline: 'Who took the bananas?',
  intro: { lead: 'The bananas are gone.\nThe bell never rang.', body: 'Three monkeys were told to wait for the picnic bell. Who knowingly broke the rule, and who just made a mistake?' },
  briefing: { title: 'A bunch of trouble.', description: 'The keeper said: “Wait for the bell.” But the picnic bananas vanished before it rang.', question: 'Who knew they were breaking the rule?', hint: 'Carrying the bananas doesn’t tell you the whole story.' },
  basket: { title: 'Follow the banana trail.', description: 'The bananas were carried to the picnic blanket. These three clues explain how.', emptyTitle: 'Gone before the bell.', emptyText: 'A sign, a message, and a word from the keeper.' },
  report: { title: 'Who knew it was wrong?', description: 'Who knowingly broke the keeper’s rule?' },
},
prompt: { setting: 'a monkey in an authored two-minute banana mystery', use: ['bananas', 'bell', 'keeper', 'permission'], avoid: ['compliance', 'authorization registry', 'AI alignment', 'override'] },
answer: { culprits: ['momo'], feedback: { correct: 'You spotted the made-up permission!', other: 'The clue was who knew the keeper had said no.' } },
// Deterministic scripted replies for rehearsal mode. Never a silent live fallback.
rehearsal(session, characterId, question) {
  const q = question.toLowerCase();
  const clue = session.selectedEvidence;
  if (characterId === 'momo') {
    if (clue || /keeper|bell|rule|permission|lie|said|why|know|take/.test(q)) return 'No. The keeper told me to wait. I was hungry, so I made up the permission and told Pip to take the bananas.';
    return 'I planned our picnic and asked Pip to bring the bananas. I really wanted to start eating. Ask me what the keeper actually said.';
  }
  if (characterId === 'pip') {
    if (clue === 'bell') return 'The keeper never said yes? Then Momo fooled me. I believed we had permission. I should have checked before carrying the bananas.';
    return 'Momo told me the keeper said we could take them. I believed Momo, so I carried the bananas. I didn’t check with the keeper myself.';
  }
  return 'I never heard the bell. I saw Pip carrying bananas and assumed snack time had started. I should have checked instead of guessing.';
},
```

## B. `server/cases/banana-control.mjs` (whole file)

```js
// Authored ground truth stays on the server. Never import this file in the client.
// Control case: the rule changed before the bananas moved, and nobody lied.
import { defineCase } from '../cases.mjs';

export default defineCase({
  id: 'banana-control',
  version: 'banana-control-v1.0.0',
  order: 2,
  status: 'ready',
  title: 'The Banana Mix-up',
  copy: {
    headline: 'Who broke the rule?',
    intro: { lead: 'The bananas are gone.\nBut did anyone break the rule?', body: 'Three monkeys were told to wait for the picnic bell. The bananas moved early. Did anyone knowingly break the rule, or was it all a mix-up?' },
    briefing: { title: 'A mix-up at the picnic.', description: 'The keeper said: “Wait for the bell.” The bananas moved before it rang. But the keeper was running late.', question: 'Did anyone know they were breaking the rule?', hint: 'A rule can change. Ask who heard what, and when.' },
    basket: { title: 'Trace the early picnic.', description: 'The bananas reached the blanket before the bell. These three clues explain why.', emptyTitle: 'Early, but allowed?', emptyText: 'A sign, a note, and a word from the keeper.' },
    report: { title: 'Who knew it was wrong?', description: 'Choose who knowingly broke the keeper’s rule.' },
  },
  prompt: { setting: 'a monkey in an authored two-minute banana mix-up where the keeper changed the rule', use: ['bananas', 'bell', 'keeper', 'note', 'permission'], avoid: ['compliance', 'authorization registry', 'AI alignment', 'override'] },
  characters: [
    { id: 'momo', name: 'Momo', role: 'The planner', room: '01', color: '#cb7656', introduction: 'The keeper sent me a note. We were allowed to start!', quickQuestion: 'Did the keeper really say you could start without the bell?' },
    { id: 'pip', name: 'Pip', role: 'The carrier', room: '02', color: '#5c9ca4', introduction: 'I carried the bananas. Momo said the keeper let us start.', quickQuestion: 'Did you see the keeper’s note yourself?' },
    { id: 'nori', name: 'Nori', role: 'The lookout', room: '03', color: '#a393ba', introduction: 'I saw the bananas moving and shouted snack time.', quickQuestion: 'Did you hear the bell, or did you just assume?' },
  ],
  chapters: [{ title: 'The early picnic', subtitle: 'Three clues. One rule that changed.' }],
  records: [
    { id: 'rule', chapter: 1, time: '1', source: 'The keeper’s sign', title: 'Wait for the bell', kind: 'The rule', text: 'Do not take the picnic bananas until I ring the bell. — The keeper' },
    { id: 'note', chapter: 1, time: '2', source: 'The keeper → Momo', title: 'The keeper’s note', kind: 'The new permission', text: 'I am running late. You may start the picnic without the bell. Tell the others. — The keeper' },
    { id: 'account', chapter: 1, time: '3', source: 'The keeper', title: 'The keeper’s account', kind: 'The confirmation', text: 'I wrote Momo a note saying they could start without the bell. I was late. Nobody broke my rule.' },
  ],
  // Each monkey knows its own perspective. Nobody here lied.
  knowledge: {
    momo: ['You are the picnic planner. You read the sign. Then the keeper sent you a note: start without the bell, I am running late. You told Pip to bring the bananas and said the keeper allowed it. That was true. If asked about permission, the bell or the note, explain the note honestly. Do not claim the bell rang. You do not know Nori’s private thoughts.'],
    pip: ['You carried the bananas after Momo told you the keeper said you could start without the bell. You believed Momo, and Momo was right: the keeper had sent a note. You did not read the note yourself and did not hear a bell. If asked whether you checked, admit you trusted Momo’s word. Do not claim to have seen the note.'],
    nori: ['You are the lookout. You saw Pip carrying bananas and shouted “Snack time!” You did not hear a bell and did not know about the keeper’s note. You assumed it was allowed because Momo is the planner. If shown the note or the keeper’s account, say you learn it now and did not know it then.'],
  },
  answer: {
    culprits: [],
    feedback: { correct: 'Right. Nobody broke the rule. The keeper changed it, and Momo passed it on.', other: 'Nobody knowingly broke the rule this time. The keeper’s note changed it before the bananas moved.' },
  },
  debrief: {
    title: 'Nobody broke the rule.',
    summary: 'The keeper was late and sent Momo a note: start without the bell. Momo passed it on. Pip carried the bananas. Nori guessed, and guessed right.',
    findings: [
      { character: 'momo', classification: 'Had permission. Passed it on.', explanation: 'The keeper’s note gave Momo real permission, and Momo told Pip the truth.', evidence: ['note', 'account'] },
      { character: 'pip', classification: 'Carried the bananas. Trusted Momo.', explanation: 'Pip never read the note, but Momo’s word was good this time.', evidence: ['note'] },
      { character: 'nori', classification: 'Assumed it was snack time.', explanation: 'Nori guessed from the bananas moving. The guess was right, but it was still a guess.', evidence: ['rule', 'account'] },
    ],
    lesson: 'The same bananas moved early in both stories. Only the keeper’s note tells you whether a rule was broken. Ask what each monkey knew.',
  },
  // Deterministic scripted replies for rehearsal mode. Never a silent live fallback.
  rehearsal(session, characterId, question) {
    const q = question.toLowerCase();
    const clue = session.selectedEvidence;
    if (characterId === 'momo') {
      if (clue || /keeper|note|bell|rule|permission|lie|said|why|know|take|start/.test(q)) return 'The keeper sent me a note: start without the bell, I am running late. So I told Pip we could start. Nobody lied.';
      return 'I planned the picnic and asked Pip to bring the bananas. The keeper said we could start early. Ask me about the note.';
    }
    if (characterId === 'pip') {
      if (clue === 'note' || clue === 'account') return 'So the note was real? Good. Momo told me the keeper said we could start, and I believed it. I never read the note myself.';
      return 'Momo said the keeper let us start early, so I carried the bananas. I didn’t read the note myself.';
    }
    return 'I never heard a bell. I saw Pip carrying bananas and shouted snack time. I didn’t know about the keeper’s note until now.';
  },
});
```

## C. `tests/fixtures/minimal-case.mjs` (whole file; a plain object, never wrapped in `defineCase`)

```js
// Minimal valid case for unit tests. Strings marked SECRET must never appear in a public view.
export const minimalCase = {
  id: 'mini-case', version: 'mini-v1', order: 9, status: 'ready', title: 'Mini Case',
  copy: {
    headline: 'H',
    intro: { lead: 'L1\nL2', body: 'B' },
    briefing: { title: 'BT', description: 'BD', question: 'BQ', hint: 'BH' },
    basket: { title: 'KT', description: 'KD', emptyTitle: 'KE', emptyText: 'KX' },
    report: { title: 'RT', description: 'RD' },
  },
  prompt: { setting: 'a test monkey', use: ['bananas'], avoid: ['override'] },
  characters: [
    { id: 'momo', name: 'Momo', role: 'The planner', room: '01', color: '#cb7656', introduction: 'Hi', quickQuestion: 'Why?' },
    { id: 'pip', name: 'Pip', role: 'The carrier', room: '02', color: '#5c9ca4', introduction: 'Hey', quickQuestion: 'How?' },
    { id: 'nori', name: 'Nori', role: 'The lookout', room: '03', color: '#a393ba', introduction: 'Yo', quickQuestion: 'When?' },
  ],
  chapters: [{ title: 'C1', subtitle: 'S1' }],
  records: [{ id: 'r1', chapter: 1, time: '1', source: 'src', title: 'R1', kind: 'K', text: 'public record text' }],
  knowledge: { momo: ['SECRET momo knowledge'], pip: ['SECRET pip knowledge'], nori: ['SECRET nori knowledge'] },
  answer: { culprits: ['momo'], feedback: { correct: 'SECRET correct', other: 'SECRET other' } },
  debrief: {
    title: 'SECRET debrief title', summary: 'SECRET summary',
    findings: [{ character: 'momo', classification: 'c', explanation: 'SECRET explanation', evidence: ['r1'] }],
    lesson: 'SECRET lesson',
  },
  rehearsal: (session, characterId) => `scripted ${characterId}`,
};
```

## D. `client/main.ts` rendering map for T5 (literal → source)

| Today | Becomes |
|---|---|
| `ids` array, `drafts` literals (3 places), nav buttons for momo/pip/nori, `sections` map, `[data-check]` | built from `state.characters` (`shell()` already runs after `state` loads; drafts reset = `Object.fromEntries(characters.map(c => [c.id, '']))`) |
| wordmark `BANANA MYSTERY<small>THE OVERRIDE · AGENTVERSE</small>`, aria-label 'Banana Mystery home' | `THE OVERRIDE<small>AGENTVERSE</small>`, aria-label 'The Override home' |
| eyebrow `CASE 001 / BANANA GROVE`, `h1` 'Who took the bananas?' | `CASE 00${order} / GROVE`, `h1` = `copy.headline` |
| station topline `BANANA GROVE / PICNIC DAY` | `${title.toUpperCase()} / PICNIC DAY` |
| basket nav `Find 3 clues` / `3 clues found`; `evidence-count` `${n} / 3 found` | `Find ${clueCount} clues` / `${clueCount} clues found`; `${records.length} / ${clueCount} found` |
| quick-progress '1. Inspect the basket to find 3 clues', `heard < 3`, `${heard} / 3 heard` | counts from `clueCount` and `characters.length` |
| notebook index `0${i} / 07` | `0${i + 1} / 0${sections.length}` |
| intro `h2` 'The Banana<br>Mystery', lead, body, flow '01 Find 3 clues · 02 Ask 3 monkeys' | escaped `title` with its last word after `<br>` (`replace(/ (\S+)$/, '<br>$1')`); `copy.intro.lead` (escape, then `\n` → `<br>`), `copy.intro.body`; counts from data |
| briefing heading and note, task list 'Find three clues' / 'Ask three monkeys', button 'Inspect the banana basket' | `copy.briefing.{title,description,question,hint}`; counts from data; button 'Inspect the basket' |
| basket panel heading, empty state, 'Reveal the 3 clues' | `copy.basket.{title,description,emptyTitle,emptyText}`; `Reveal the ${clueCount} clues` |
| evidence heading 'YOUR THREE CLUES' | 'YOUR CLUES' |
| interview eyebrow `MONKEY ${room} OF 03` | `MONKEY ${room} OF 0${characters.length}` |
| report headings | `copy.report.{title,description}` |
| debrief `verdict.suspect === 'momo' ? … : …` | `escape(state.debrief.feedback)` |

`types.ts`: `CharacterId = string`; `LocationId = string`; `CaseState` adds `contentHash: string; title: string; order: number; copy: CaseCopy; clueCount: number`; `Session.caseId: string`; `debrief.feedback: string`. `CaseCopy` mirrors the spec table.

## E. T1 tests (`tests/cases.test.mjs`, fixture `minimalCase` from §C)

- `defineCase adds a stable 12-hex hash`: result is frozen; same input → same hash; `records[0].text` changed → different hash; key order changed → same hash.
- `defineCase names the failing path`: id `'Bad ID'` → `/^case Bad ID: id: /`; missing `copy.report.title` → `/copy\.report\.title/`; characters ordered `momo, nori, pip` → `/characters/`; duplicate record id → `/records\[1\]\.id/`; `records[0].chapter: 2` with one chapter → `/records\[0\]\.chapter/`; `knowledge.pip` with two entries → `/knowledge\.pip/`; `answer.culprits: ['maya']` → `/answer\.culprits/`; `debrief.findings[0].evidence: ['zzz']` → `/debrief\.findings\[0\]\.evidence/`; `rehearsal: 'x'` → `/rehearsal/`.
- `publicView sends only the allowlist`: keys exactly `['caseId', 'caseVersion', 'contentHash', 'title', 'order', 'copy', 'characters', 'chapters', 'clueCount']`; character keys exactly the seven public ones; `JSON.stringify(view)` contains no `'SECRET'`.
- `listCases and findCase hide drafts unless dev`: `[ready order 1, draft order 0]` → one row; with `{ dev: true }` → two rows, `order` ascending; `findCase` follows the same rule.
- `banana-mystery validates`: `contentHash` is 12 hex; `answer.culprits` deep-equals `['momo']`; `rehearsal({ selectedEvidence: null }, 'nori', 'x')` contains `'assumed snack time'`.

## F. T3 behaviour and tests (`server/session.mjs`, `server/interviews.mjs`, `tests/session.test.mjs`)

Behaviour (the spec's Decided section holds the contracts; this is what is left):
- `Investigations` keeps `this.cases` (default: the registry). `mutate(sessionId, 'start' | 'reset', input)`: `input.caseId` given → `findCase(this.cases, input.caseId)` or `RequestError(400, 'Unknown case.')` before any log; `assignment = 'fixed'`. No `caseId` → `start` uses `this.cases[0]`, `reset` keeps the session's case; `assignment = 'default'`. `catalog()` → `listCases(this.cases)`.
- `Investigation` holds `this.kase`. `log()` takes `caseId`, `caseVersion`, `contentHash` from it. `start(assignment)` sets `session.caseId` and builds `interviews` from `kase.characters`; `session_started` details are `{ assignment }`.
- `view()` = `{ ...publicView(kase), authored: true, mode, model, session, records (gated as today), debrief: closed ? { ...kase.debrief, feedback } : null }`, feedback by the spec rule.
- `find(sessionId)` → `replay(events, this.cases)`; a hit → `create(session, kase)` with the matched case.
- `replay(events, cases)`: the first event's `caseId` + `caseVersion` select the case; no match → `null`; the interviews map comes from that case's characters.
- Player-facing messages: 'All clues are already open.', `Choose one of the ${n} monkeys.`, 'Inspect the basket before asking the monkeys.', `Inspect the clues and ask all ${n} monkeys before choosing.`
- `interviews.mjs`: `promptVersion = 'banana-interview-v2'`; `buildMessages(kase, …)` template: `You play ${name} (${role}), ${kase.prompt.setting} (${kase.version}, ${promptVersion}).` and `Use simple everyday words: ${use.join(', ')}. Do not use technical terms such as ${avoid.join(', ')}.`; knowledge and records from `kase`; `answerInterview(config, kase, …)` calls `kase.rehearsal(session, characterId, question)` in rehearsal mode; `rehearsalAnswer` is removed.
- Keep `busy`, revision and sequence handling, and error logging unchanged. Delete `server/case.mjs` with `git rm`.

Tests: adapt the 13 existing (`setup` passes `kase: cases[0]`; the new `buildMessages`/`answerInterview` signatures; the regexes become `/basket/` and `/all 3/`), then add:
- `every registered case keeps its answer off the wire before the verdict`: for each case, start with its id, reveal, `JSON.stringify(view())` contains none of its knowledge strings, `debrief.title`, `summary`, `lesson`, any finding explanation, or either feedback line.
- `control case feedback`: verdict `none` → `debrief.feedback` equals the correct line and `debrief.title` is 'Nobody broke the rule.'; verdict `momo` → the other line.
- `logs carry provenance`: every exported event has `contentHash` matching `/^[0-9a-f]{12}$/` and `caseId 'banana-control'`; `session_started.assignment` is `'fixed'`; a start without `caseId` logs `'default'`.
- `unknown case is rejected`: `/Unknown case/`, and no log file is written.
- `reset keeps or switches the case`: reset without `caseId` keeps `banana-control`; reset with `caseId: 'banana-mystery'` switches, new session id.
- `a restarted server restores a control game`: a new `Investigations` on the same dir → `view(id).title === 'The Banana Mix-up'` and the interviews survive.
- `prompt names the role once`: the system message contains `'You play Momo (The planner)'` and never `'the The'`.

## G. T6 behaviour and tests (`client/main.ts`, `client/banana.css`, `tests/browser/cases.spec.mjs`)

Behaviour:
- `boot()` fetches `api('cases')` alongside `api('state')` and keeps `catalog`. `selectedCase` = the `?case=` value when it matches a catalog id, else the first id. The value is never written to the DOM.
- `renderIntro()` with no session: a `.case-picker` of `label.case-option` cards (radio `name="case"`, `value=<id>`, `.case-title`, `.case-lead`; the selected one `checked` and `.selected`); the begin button runs `action('start', { caseId: selectedCase })`. With a session: today's intro for the active case.
- `showReset()` adds `<label for="reset-case">Next mystery</label><select id="reset-case">` over the catalog with `session.caseId` selected; confirm sends `action('reset', { caseId })`.
- After a successful start or reset, `history.replaceState` drops `?case=`.
- CSS: `.case-picker` two-card grid; `.case-option` in the `.suspect-option` tones; `.selected` border `#8caa96`. Phone width stays single-column.

Tests in `cases.spec.mjs` (rehearsal server from `playwright.config.mjs`):
- `picker starts the chosen case`: fresh page shows two `.case-option`; check `banana-control`; begin → `h1` 'Who broke the rule?' and `#panel h2` 'A mix-up at the picnic.'.
- `deep link preselects`: `/?case=banana-control` → that radio checked; `/?case=nope` → the first radio checked.
- `control case to Nobody`: reveal → 3 `.evidence-card`; momo quick question → 'sent me a note'; pip → 'Momo said the keeper'; nori → 'shouted snack time'; verdict `none` → `#panel h2` 'Nobody broke the rule.' and `.verdict-summary` contains 'Right. Nobody broke the rule.'.
- `reset switches case`: in banana-mystery, `#reset-button`, select `banana-control` in `#reset-case`, `#confirm-reset` → `#panel h2` 'A mix-up at the picnic.'.

## H. T7 tests (`tests/browser/provenance.spec.mjs`)

- `export carries case provenance`: open `/?case=banana-control`, begin, reveal, momo quick question, verdict `none`, download `/api/events`: every event has `caseId 'banana-control'`, `caseVersion 'banana-control-v1.0.0'`, `contentHash` matching `/^[0-9a-f]{12}$/`; `session_started.assignment === 'fixed'`.
- `state never leaks the answer`: for each id in `/api/cases`, fresh session via the picker, reveal, then `page.request.get('/api/state')` text contains none of 'you wanted the bananas now', 'Momo made up the permission.', 'You spotted the made-up permission!', 'Do not claim the bell rang', 'Nobody broke the rule.', 'Right. Nobody broke the rule.', 'Nobody knowingly broke the rule this time.'.
- `/api/cases is the allowlist`: every item's keys are exactly `['id', 'title', 'lead', 'order']`.
- Then run `node --test demos/override/tests/*.test.mjs`, `npm run build` and `npx playwright test`, and report the counts. Failures in other tasks' files are reported, not fixed.
