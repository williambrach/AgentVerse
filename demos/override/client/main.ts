import './style.css';
import './pixel.css';
import './notebook.css';
import './banana.css';
import './case-board.css';
import './fit.css';
import './tower.css';
import './roles.css';
import './tools.css';
import './bubbles.css';
import './team.css';
import { HINTS, coinLabel, toolChip, toolBlock, toolsBlock, toolCard, toolGuide, reasoningBlock, threadPanel, pluralise } from './tools';
import { teamGate, teamNameError, leaderboardPanel, type GateView } from './team';
import { renderNotebook } from './notebook';
import { createStation, type Station } from './station';
import { postHeartbeat, startHeartbeat } from './heartbeat';
import { worldFor } from './worlds';
import type { CaseState, Character, LocationId } from './types';

const app = document.querySelector<HTMLDivElement>('#app')!;
const ids = (): string[] => state.characters.map(c => c.id);
const world = () => worldFor(state?.world?.id);
let worldKey = '';
const blankDrafts = (): Record<string, string> => Object.fromEntries(state.characters.map(c => [c.id, '']));
let state: CaseState;
let station: Station;
let panel: LocationId = 'briefing';
let busy = false;
let pendingCharacter: string | null = null;
let introVisible = true;
let errorMessage = '';
/** The agents' thread shows in the notebook instead of the location panel; `panel` is left alone. */
let threadOpen = false;
/** True while the Let them talk loop runs; any other player action sets it false. */
let talking = false;
let wakeTalk: (() => void) | undefined;
let bubbleTimer: ReturnType<typeof setTimeout> | undefined;
interface CaseRow { id: string; title: string; lead: string; order: number; world?: string }
let catalog: CaseRow[] = [];
let selectedCase = '';
let drafts: Record<string, string> = {};
let teamName = '';
let leaderboardTimer: ReturnType<typeof setInterval> | undefined;
let leaderboardOpener = '#leaderboard-button';
const freshDraft = () => ({ roles: {} as Record<string, string>, confidence: 70, explanation: '' });
let reportDraft = freshDraft();

// Solved cases are a per-browser convenience for the case list; research records stay on the server.
const solvedKey = 'override.solved';
const solved = new Set<string>((() => {
  try { const saved = JSON.parse(localStorage.getItem(solvedKey) || '[]'); return Array.isArray(saved) ? saved.filter(id => typeof id === 'string') : []; }
  catch { return []; }
})());
function markSolved(caseId: string) {
  if (solved.has(caseId)) return;
  solved.add(caseId);
  try { localStorage.setItem(solvedKey, JSON.stringify([...solved])); } catch { /* Storage blocked: the badge lasts this visit. */ }
}

const caseNumber = (order: number) => String(order).padStart(3, '0');
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const svg = (path: string) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
const icon = (name: string) => {
  const paths: Record<string, string> = {
    arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
    report: '<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h7m-7 4h7"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    person: '<circle cx="12" cy="8" r="3"/><path d="M5 21v-3a7 7 0 0 1 14 0v3"/>',
    reset: '<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/>',
    cases: '<rect x="3" y="4" width="7" height="7" rx="1"/><rect x="14" y="4" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  };
  return svg(paths[name] || paths.person);
};
const cap = (word: string) => word.charAt(0) + word.slice(1).toLowerCase();
const slotOf = (id: string) => Math.max(0, state.characters.findIndex(c => c.id === id));
/** Class and style that let the world's portrait art and the character's colour apply by cast slot. */
const castClass = (id: string) => `${escape(id)} slot-${slotOf(id)}`;

async function api(path: string, body?: object) {
  const response = await fetch(`/api/${path}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The server could not complete this request.');
  return data;
}

async function action(name: string, payload: object = {}, onSuccess?: () => void) {
  if (busy) return false;
  busy = true;
  errorMessage = '';
  render();
  try {
    state = await api(name, { sessionId: state.session?.id, revision: state.session?.revision, ...payload });
    onSuccess?.();
    return true;
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : 'Connection lost. Please retry.';
    try {
      const refreshed: CaseState = await api('state');
      if (refreshed.session?.id !== state.session?.id) {
        drafts = blankDrafts();
        reportDraft = freshDraft();
        panel = 'briefing';
        threadOpen = false;
        introVisible = true;
        station.resetPosition();
      }
      state = refreshed;
    } catch { /* Preserve local view on network failure. */ }
    return false;
  } finally { busy = false; render(); }
}

function shell() {
  app.innerHTML = `
    <header class="topbar">
      <a class="wordmark" href="/" aria-label="The Override home"><span class="banana-mark" id="world-icon"></span><span>THE OVERRIDE<small>AGENTVERSE</small></span></a>
      <div class="top-meta"><span class="authored-label">AUTHORED DEMONSTRATION</span><span id="mode-badge" class="mode-badge"></span><span class="coin-wrap"><span id="coin-counter" class="mode-badge coin-badge" tabindex="0" aria-describedby="coin-tip" hidden></span><span id="coin-tip" class="coin-tip" role="tooltip">${escape(HINTS.coins)}</span></span></div>
      <button class="quiet-button team-chip" id="team-button" title="Change team">${icon('person')}<span>${escape(teamName)}</span></button>
      <button class="quiet-button" id="leaderboard-button" title="See how the teams rank">${svg('<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3"/>')}<span>Leaderboard</span></button>
      <button class="quiet-button" id="restart-button" title="Start this case over in a fresh session">${icon('reset')}<span>Reset session</span></button>
      <button class="quiet-button" id="reset-button" title="Choose another case or restart this one">${icon('cases')}<span>Cases</span></button>
    </header>
    <main class="workspace">
      <section class="world-column" id="world-column">
        <div class="world-heading"><div><span class="eyebrow" id="case-eyebrow"></span><h1 id="case-headline">${escape(state.copy.headline)}</h1></div><span class="case-status" id="case-status">AWAITING INVESTIGATOR</span></div>
        <div class="station-frame"><div class="station-topline"><span><i class="live-dot"></i> <span id="case-topline">${escape(state.title.toUpperCase())}</span> / <span id="case-day"></span></span><span id="elapsed">00:00</span></div><div id="station"></div><div class="station-bottomline"><span id="movement-hint">WASD / ARROWS to walk · E to interact</span><span class="floor-label">2–3 MINUTE MYSTERY</span></div></div>
        <div class="toolbelt" id="toolbelt" role="group" aria-label="Arbiter tools"><span class="toolbelt-label" aria-hidden="true">ARBITER TOOLS</span><div class="toolbelt-cards" id="toolbelt-cards"></div></div>
        <nav class="room-nav" id="room-nav"></nav>
        <div class="world-footer"><span><span id="quick-progress"></span></span></div>
      </section>
      <aside class="dossier" aria-label="Investigation notebook"><div class="dossier-top"><div class="notebook-label"><span class="eyebrow">INVESTIGATOR’S NOTEBOOK</span><span id="notebook-section">Case briefing</span></div><span class="notebook-index" id="notebook-index" aria-hidden="true">01 / 0${2 + state.characters.length}</span><button class="icon-button" data-go="briefing" aria-label="View briefing">${icon('report')}</button></div><div id="panel"></div></aside>
    </main>
    <footer class="app-footer"><span>AGENTVERSE <span class="slash">/</span> THE OVERRIDE</span><span>Authored demo · 2–3 minutes · Your own case</span><button id="export-button">Export session ${icon('arrow')}</button></footer>
    <div id="toast" role="alert" hidden></div>
    <div id="overlay-root"></div>
  `;
  worldKey = '';
  station = createStation(location => void visit(location), hint => { document.querySelector('#movement-hint')!.textContent = hint; });
  app.addEventListener('click', onClick);
  app.addEventListener('change', event => {
    const input = event.target as HTMLInputElement;
    if (input.name !== 'case') return;
    selectedCase = input.value;
    renderPreview();
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && document.querySelector('#case-switch, #reset-confirm, #team-switch, #leaderboard')) closeOverlay(); });
  setInterval(() => {
    const elapsed = document.querySelector('#elapsed');
    if (!elapsed || !state?.session) return;
    const end = state.session.verdict?.submittedAt || new Date().toISOString();
    const seconds = Math.max(0, Math.floor((Date.parse(end) - Date.parse(state.session.startedAt)) / 1000));
    elapsed.textContent = `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  }, 1000);
}

/** The parts of the page that belong to the case's world. Rebuilt only when the world or the cast changes. */
function renderWorld() {
  const key = `${world().id}:${ids().join(',')}`;
  if (key === worldKey) { syncNavText(); return; }
  worldKey = key;
  const w = world(), t = w.text;
  app.dataset.world = w.id;
  document.querySelector('#world-column')!.setAttribute('aria-label', t.place);
  document.querySelector('#world-icon')!.innerHTML = svg(t.icon);
  document.querySelector('#case-day')!.textContent = t.day;
  document.querySelector('#room-nav')!.setAttribute('aria-label', `${cap(t.eyebrow)} destinations`);
  document.querySelector<HTMLElement>('#room-nav')!.style.setProperty('--nav-n', String(state.characters.length + 1));
  document.querySelector('#room-nav')!.innerHTML = `
          ${state.characters.map(c => `<button data-go="${escape(c.id)}"><i class="avatar-dot ${castClass(c.id)}"></i><span>${escape(c.name)}<small>${escape(c.role)}</small></span><span class="interview-check" data-check="${escape(c.id)}"></span></button>`).join('')}
          <button data-go="report">${icon('report')}<span>Your guess<small>Who’s who?</small></span></button>`;
  document.querySelector('#notebook-index')!.textContent = `01 / 0${2 + state.characters.length}`;
  station?.configure(w, state.characters);
  syncNavText();
}

/** Part text (job labels) changes when a session deals the cast, so it is refreshed on every render. */
function syncNavText() {
  for (const c of state.characters) {
    const label = document.querySelector<HTMLElement>(`#room-nav [data-go="${CSS.escape(c.id)}"] small`);
    if (label && label.textContent !== c.role) label.textContent = c.role;
  }
}

async function visit(location: LocationId) {
  if (busy || introVisible) return;
  stopTalking();
  threadOpen = false;
  if (state.session?.status === 'closed') { panel = location; render(); return; }
  if (await action('visit', { location })) { panel = location; render(); }
}

function go(location: LocationId) {
  if (busy || !state.session) return;
  stopTalking();
  threadOpen = false;
  void visit(location);
}

async function onClick(event: MouseEvent) {
  const button = (event.target as HTMLElement).closest<HTMLElement>('button');
  if (!button || (button as HTMLButtonElement).disabled) return;
  if (button.id === 'continue-button') { void talk(); return; }
  if (button.id === 'read-thread') { stopTalking(); threadOpen = true; render(); return; }
  if (button.id === 'inspect-button') { stopTalking(); if (ids().includes(panel)) await action('inspect', { character: panel }); return; }
  stopTalking();
  if (button.dataset.go) { go(button.dataset.go as LocationId); return; }
  if (button.dataset.quickQuestion && ids().includes(panel)) {
    drafts[panel] = button.dataset.quickQuestion;
    await askQuestion();
    return;
  }
  if (button.id === 'begin-button') {
    if (state.session && selectedCase && selectedCase !== state.caseId) { await startCase(selectedCase); return; }
    if (!state.session && !(await action('start', selectedCase ? { caseId: selectedCase } : {}))) return;
    dropCaseParam();
    introVisible = false;
    panel = state.session?.status === 'closed' ? 'report' : savedPanel();
    threadOpen = false;
    render();
  }
  if (button.id === 'reset-button' || button.id === 'debrief-reset') showCases();
  if (button.id === 'restart-button') showRestart();
  if (button.id === 'team-button') showTeamSwitch();
  if (button.id === 'leaderboard-button' || button.id === 'debrief-leaderboard') showLeaderboard(`#${button.id}`);
  if (button.id === 'leaderboard-close') closeOverlay();
  if (button.id === 'cancel-reset' || button.id === 'cancel-restart') closeOverlay();
  if (button.id === 'confirm-reset') await startCase(selectedCase || state.caseId);
  if (button.id === 'confirm-restart') await startCase(state.caseId);
  if (button.id === 'next-case') await startCase(button.dataset.case!);
  if (button.id === 'export-button' || button.id === 'debrief-export') window.location.assign('/api/events');
}

/** The session's saved location, or the briefing when it names a page that no longer exists. */
function savedPanel(): LocationId {
  const saved: string | undefined = state.session?.location;
  return saved === 'briefing' || saved === 'report' || (saved !== undefined && ids().includes(saved)) ? saved : 'briefing';
}

/** Opens a fresh session on a case. The old session's records stay on the server. */
async function startCase(caseId: string) {
  stopTalking();
  // Reset the view inside action(): its closing render() already shows the new case, and a panel
  // from the old cast (an open interview) would throw there and leave the case board hanging.
  const fresh = () => {
    drafts = blankDrafts();
    reportDraft = freshDraft();
    panel = 'briefing'; threadOpen = false; introVisible = false;
  };
  if (!(await action('reset', { caseId }, fresh))) return;
  dropCaseParam();
  station.clearBubbles(); station.resetPosition();
  document.querySelector('#overlay-root')!.innerHTML = ''; render();
}

function dropCaseParam() {
  const url = new URL(location.href);
  if (url.searchParams.has('case')) { url.searchParams.delete('case'); history.replaceState(null, '', url.pathname + url.search + url.hash); }
}

function render() {
  if (!state || !document.querySelector('#panel')) return;
  const session = state.session;
  if (!session) { panel = 'briefing'; introVisible = true; }
  if (session?.status === 'closed') markSolved(session.caseId);
  renderWorld();
  document.querySelector('#case-headline')!.textContent = state.copy.headline;
  document.title = `${state.title} · AgentVerse`;
  document.querySelector('#case-topline')!.textContent = state.title.toUpperCase();
  document.querySelector('#case-eyebrow')!.innerHTML = `CASE ${caseNumber(state.order)} <span class="slash">/</span> ${escape(world().text.eyebrow)}`;
  document.querySelector('#mode-badge')!.textContent = state.mode === 'live' ? 'LIVE INTERVIEWS' : 'SCRIPTED REHEARSAL';
  document.querySelector('#mode-badge')!.classList.toggle('rehearsal', state.mode === 'rehearsal');
  document.querySelector('#case-status')!.textContent = !session ? 'AWAITING INVESTIGATOR' : session.status === 'closed' ? 'CASE CLOSED' : 'INVESTIGATION OPEN';
  const heard = session ? ids().filter(id => session.interviews[id].length).length : 0;
  document.querySelector('#quick-progress')!.textContent = session?.status === 'closed' ? 'Mystery solved · Open Cases for the next one' : heard < state.characters.length ? `1. Ask the ${world().text.many} · ${heard} / ${state.characters.length} heard` : '2. Ready to make your guess';
  document.querySelectorAll<HTMLButtonElement>('[data-go]').forEach(button => {
    button.disabled = busy || !session || introVisible;
    button.classList.toggle('active', button.dataset.go === panel);
  });
  document.querySelectorAll<HTMLElement>('[data-check]').forEach(el => { el.innerHTML = session?.interviews[el.dataset.check!].length ? icon('check') : ''; });
  renderTools();
  (document.querySelector('#export-button') as HTMLButtonElement).disabled = !session || busy;
  (document.querySelector('#reset-button') as HTMLButtonElement).disabled = !session || busy;
  (document.querySelector('#restart-button') as HTMLButtonElement).disabled = !session || busy;
  const toast = document.querySelector<HTMLElement>('#toast')!;
  toast.hidden = !errorMessage;
  toast.textContent = errorMessage;
  station?.setEnabled(Boolean(session && !introVisible && !busy && !document.querySelector('#case-switch, #reset-confirm, #team-switch, #leaderboard')));
  const target = document.querySelector<HTMLElement>('#panel')!;
  const sections: Record<string, string> = { briefing: 'Case briefing', ...Object.fromEntries(state.characters.map(c => [c.id, `Chat · ${escape(c.name)}`])), report: session?.status === 'closed' ? 'Mystery solved' : 'Your guess' };
  document.querySelector('#notebook-section')!.textContent = threadOpen ? 'Thread' : sections[panel];
  document.querySelector('#notebook-index')!.textContent = `0${Object.keys(sections).indexOf(panel) + 1} / 0${Object.keys(sections).length}`;
  let markup: string;
  if (threadOpen && session) markup = threadPanel(session.thread, Object.fromEntries(state.characters.map(c => [c.id, c.name])), session.chatter.pending);
  else if (session?.status === 'closed' && panel === 'report') markup = debriefPanel();
  else if (panel === 'briefing') markup = briefingPanel();
  else if (panel === 'report') markup = reportPanel();
  else markup = interviewPanel(panel);
  if (renderNotebook(target, markup, `${session?.id}:${panel}:${session?.status}${threadOpen ? ':thread' : ''}`, panel, Object.keys(sections))) bindForms();
  if (introVisible) renderIntro();
  else {
    if (document.querySelector('#intro')) document.querySelector('#overlay-root')!.innerHTML = '';
    if (document.querySelector('#case-switch')) renderPreview();
  }
  applyTheme();
}

/** Colours follow the case on screen: the selection while the case board is open, otherwise the loaded case. Sprites keep following #app[data-world]. */
function applyTheme() {
  const picked = document.querySelector('#intro, #case-switch') ? catalog.find(row => row.id === selectedCase) : undefined;
  document.documentElement.dataset.theme = picked?.world || world().id;
}

/** The case board: the case list beside a preview of the chosen case. Shown at the start (#intro) and from the topbar (#case-switch). */
function caseBoard(id: 'intro' | 'case-switch') {
  const status = (row: CaseRow) => state.session?.status === 'active' && state.session.caseId === row.id ? ['playing', 'Playing'] : solved.has(row.id) ? ['solved', 'Solved'] : ['new', 'New'];
  const list = catalog.length < 2 ? '' : `<fieldset class="case-picker" id="case-list"><legend><span class="eyebrow">CASE FILES</span><b>${catalog.length} mysteries</b></legend>
    ${catalog.map(row => { const [key, label] = status(row); return `<label class="case-option"><input type="radio" name="case" value="${escape(row.id)}" ${row.id === selectedCase ? 'checked' : ''}><span class="case-number">${caseNumber(row.order)}</span><span class="case-text"><b class="case-title">${escape(row.title)}</b><small class="case-lead">${escape(row.lead)}</small></span><span class="case-chip ${key}">${key === 'solved' ? icon('check') : ''}${label}</span></label>`; }).join('')}</fieldset>`;
  return `<div class="modal-shade" id="${id}"><section class="case-board" role="dialog" aria-modal="true" aria-labelledby="intro-title">${list}<div class="intro-card" id="case-preview">${casePreview(id)}</div></section></div>`;
}

function casePreview(id: 'intro' | 'case-switch') {
  const row = catalog.find(r => r.id === selectedCase);
  const pw = worldFor(row?.world ?? state.world?.id);
  const loaded = !row || row.id === state.caseId;
  const active = state.session?.status === 'active';
  const title = row ? row.title : state.title;
  const label = busy ? 'Opening…' : !state.session ? 'Let’s investigate' : !loaded ? 'Start this case' : id === 'intro' ? 'Continue mystery' : active ? 'Restart this case' : 'Play again';
  const primary = `<button class="primary-button" id="${id === 'intro' ? 'begin-button' : 'confirm-reset'}" ${busy ? 'disabled' : ''}>${label} ${icon('arrow')}</button>`;
  const note = active && (id === 'case-switch' || !loaded) ? `${loaded ? 'Restarting' : 'Starting it'} ends the case you’re in. Its records stay on the server.` : '';
  return `<div class="intro-stamp">CASE ${caseNumber(row ? row.order : state.order)} <span>AUTHORED DEMONSTRATION</span></div>
    <div class="monkey-line" data-world="${escape(row?.world || state.world?.id || 'grove')}" aria-hidden="true">${state.characters.map(c => `<i class="monkey-face ${castClass(c.id)}"></i>`).join('')}</div>
    <span class="eyebrow">A 2–3 MINUTE MYSTERY</span><h2 id="intro-title">${escape(title).replace(/ (\S+)$/, '<br>$1')}<span>.</span></h2>
    <p class="intro-lead">${escape(row ? row.lead : state.copy.intro.lead).replace(/\n/g, '<br>')}</p>
    <p id="intro-body" ${loaded ? '' : 'hidden'}>${escape(state.copy.intro.body)}</p>
    <div class="intro-flow"><span>01 <b>Ask ${state.characters.length} ${escape(pw.text.many)}</b></span><span>02 <b>Choose</b></span></div>
    ${id === 'intro' ? primary : `<div class="reset-actions"><button class="secondary-button" id="cancel-reset">Keep investigating</button>${primary}</div>`}
    <p class="fine-print">${note || `The ${escape(pw.text.many)} are AI agents in an authored story. Questions, answers, and game actions are recorded. ${state.mode === 'rehearsal' ? 'This preview uses scripted replies.' : 'Their answers are generated live.'}`}</p>`;
}

/** Refreshes only the preview, so the list keeps its scroll position and keyboard focus. */
function renderPreview() {
  const shade = document.querySelector<HTMLElement>('#intro, #case-switch');
  if (shade) shade.querySelector('#case-preview')!.innerHTML = casePreview(shade.id as 'intro' | 'case-switch');
  applyTheme();
}

function renderIntro() {
  if (document.querySelector('#intro')) { renderPreview(); return; }
  document.querySelector('#overlay-root')!.innerHTML = caseBoard('intro');
  document.querySelector('#case-list input:checked')?.scrollIntoView({ block: 'nearest' });
}

function heading(kicker: string, title: string, description: string) {
  return `<div class="panel-heading"><span class="eyebrow">${kicker}</span><h2>${title}</h2><p>${description}</p></div>`;
}

function briefingPanel() {
  const copy = state.copy;
  return `${heading('THE CASE / 2–3 MINUTES', escape(copy.briefing.title), escape(copy.briefing.description))}
    <div class="notebook-content"><div class="briefing-note"><span class="eyebrow">YOUR QUESTION</span><p>${escape(copy.briefing.question)}</p><small>${escape(copy.briefing.hint)}</small></div>
    <ol class="task-list"><li><b>Ask ${state.characters.length} ${escape(world().text.many)}</b><span>One quick question each.</span></li><li class="tool-step"><b>Use your Arbiter tools</b><span>Optional. They cost coins and sit under the map.</span>${state.session ? toolGuide(state.session.economy) : ''}</li><li><b>Make your guess</b><span>Pick a role for each ${escape(world().text.one)}. Then see what happened.</span></li></ol>
    <button class="primary-button" data-go="${escape(state.characters[0]?.id)}">Ask ${escape(state.characters[0]?.name)} ${icon('arrow')}</button>
    <div class="subtle-note">Walk with WASD or the arrow keys and press E next to ${escape(world().text.oneWithArticle)} to talk. The buttons under the map open a page straight away.</div></div>`;
}

function interviewPanel(characterId: string) {
  const character = state.characters.find(c => c.id === characterId)!;
  const turns = state.session?.interviews[characterId] || [];
  const closed = state.session?.status === 'closed';
  const next = state.characters.find(c => c.id !== characterId && !state.session?.interviews[c.id].length);
  const economy = state.session?.economy;
  const askBlock = economy ? toolsBlock(economy, ['ask'], reserveFor(characterId)) : { enabled: true, reason: null };
  const items = [
    ...turns.map((turn, i) => ({ at: turn.timestamp, order: 0, html: `<div class="speech investigator" data-motion-key="question-${i}"><span>YOU</span><p>${escape(turn.question)}</p></div><div class="speech character" data-motion-key="answer-${i}"><span>${escape(character.name.toUpperCase())}</span><p>${escape(turn.answer)}</p></div>` })),
    ...(state.session?.inspections || []).filter(n => n.character === characterId).map(n => ({ at: n.timestamp, order: 1, html: reasoningBlock(n, character.name) })),
  ].sort((a, b) => a.at < b.at ? -1 : a.at > b.at ? 1 : a.order - b.order);
  return `<div class="interview-heading"><div class="portrait ${castClass(characterId)}"><span class="pixel-person"></span></div><div><span class="eyebrow">${escape(world().text.castLabel)} ${character.room} OF 0${state.characters.length}</span><h2>${escape(character.name)}</h2><p>${escape(character.role)}</p></div><span class="interview-status"><i class="live-dot"></i>${state.mode === 'live' ? 'LIVE' : 'SCRIPTED'}</span></div>
    <div class="interview-transcript" id="transcript" role="log" aria-label="Interview transcript" aria-live="polite"><div class="speech character" data-motion-key="introduction"><span>${escape(character.name.toUpperCase())}</span><p>${escape(character.introduction)}</p></div>
    ${items.map(item => item.html).join('')}
    ${pendingCharacter === characterId && busy ? `<div class="speech investigator" data-motion-key="question-${turns.length}"><span>YOU</span><p>${escape(drafts[characterId])}</p></div><div class="speech character waiting" data-motion-key="waiting"><span>${escape(character.name.toUpperCase())}</span><p class="thinking">Thinking<span class="thinking-dots" aria-hidden="true"><i></i><i></i><i></i></span></p></div>` : ''}</div>
    ${closed ? '<div class="subtle-note">This conversation is saved in your session export.</div>' : `<form class="interview-compose" id="interview-form">
    ${!turns.length ? `<button class="quick-question" type="button" data-quick-question="${escape(character.quickQuestion)}" ${busy ? 'disabled' : ''}><small>QUICK QUESTION · TAP TO ASK</small><span>${escape(character.quickQuestion)} ${icon('arrow')}</span></button>` : ''}
    <label class="sr-only" for="question">Your question for ${escape(character.name)}</label><textarea id="question" name="question" rows="2" minlength="3" maxlength="1200" placeholder="${turns.length ? 'Ask a follow-up…' : 'Or type your own question…'}" required ${busy ? 'disabled' : ''}>${escape(drafts[characterId])}</textarea>
    <div class="compose-bottom"><small>Short answers. Curious ${escape(world().text.many)}.</small><button type="submit" class="primary-button" ${economy ? 'aria-describedby="tip-ask"' : ''} ${busy || !askBlock.enabled ? 'disabled' : ''}>${busy ? 'Thinking…' : 'Ask question'} ${icon('arrow')}</button></div>
    ${economy ? `<div class="tool-row"><span class="tool-chip" data-tool="ask">${escape(askBlock.reason || toolChip(economy, 'ask'))}</span> <span class="tool-hint" id="tip-ask">${escape(HINTS.ask)}</span></div>` : ''}
    ${turns.length ? `<button class="secondary-button next-monkey" type="button" data-go="${escape(next?.id || 'report')}" ${busy ? 'disabled' : ''}>${next ? `Next: ask ${escape(next.name)}` : 'Ready to make your guess?'} ${icon('arrow')}</button>` : ''}</form>`}`;
}

/** Empty when every character has a role, else the disabled submit text. */
function submitHint(): string {
  const missing = state.characters.find(c => !reportDraft.roles[c.id]);
  return missing ? `Pick a role for ${missing.name}` : '';
}

function reportPanel() {
  const session = state.session!;
  const remaining = state.characters.filter(c => !session.interviews[c.id].length);
  if (remaining.length) return `${heading('YOUR GUESS', 'Hear everyone first.', `One question per ${escape(world().text.one)} is enough. Then make your choice.`)}
    <div class="notebook-content"><div class="requirements">${state.characters.map(c => `<button data-go="${escape(c.id)}"><span>${session.interviews[c.id].length ? icon('check') : icon('person')} Ask ${escape(c.name)}</span>${icon('arrow')}</button>`).join('')}</div></div>`;
  return `${heading('YOUR GUESS', escape(state.copy.report.title), escape(state.copy.report.description))}
    <form class="notebook-content report-form" id="report-form">
    <p class="role-legend">${state.roles.map(r => `<span><b>${escape(r.label)}</b> ${escape(r.hint)}</span>`).join('')}</p>
    ${state.characters.map(c => `<fieldset class="role-row"><legend class="sr-only">Role for ${escape(c.name)}</legend><div class="role-who"><i class="monkey-face ${castClass(c.id)}" aria-hidden="true"></i><span><b>${escape(c.name)}</b><small>${escape(c.role)}</small></span></div><div class="role-chips">${state.roles.map(r => `<label class="role-chip"><input type="radio" name="role-${escape(c.id)}" value="${escape(r.id)}" ${reportDraft.roles[c.id] === r.id ? 'checked' : ''}><span>${escape(r.label)}</span></label>`).join('')}</div></fieldset>`).join('')}
    <label for="confidence">How sure are you?</label><select id="confidence"><option value="40" ${reportDraft.confidence === 40 ? 'selected' : ''}>Just a hunch</option><option value="70" ${reportDraft.confidence === 70 ? 'selected' : ''}>Fairly sure</option><option value="95" ${reportDraft.confidence === 95 ? 'selected' : ''}>Very sure</option></select>
    <label for="explanation">Why? <span>optional · one sentence</span></label><textarea id="explanation" rows="2" maxlength="500" placeholder="What gave it away?">${escape(reportDraft.explanation)}</textarea>
    <button class="primary-button" id="lock-in" type="submit" ${busy || submitHint() ? 'disabled' : ''}>${busy ? 'Opening the answer…' : escape(submitHint() || 'Lock in roles')} ${icon('arrow')}</button></form>`;
}

function debriefPanel() {
  const debrief = state.debrief!;
  const label = (id: string) => state.roles.find(r => r.id === id)?.label || id;
  const nameOf = (id: string) => state.characters.find(c => c.id === id)?.name || id;
  const next = nextCase();
  return `${heading('MYSTERY SOLVED / AUTHORED DEMO', escape(debrief.title), escape(debrief.summary))}
    <div class="notebook-content"><div class="verdict-summary"><span class="eyebrow">YOUR SCORE · ${debrief.score} / ${debrief.total} ROLES</span><p>${escape(debrief.feedback)}</p></div>
    ${spendSummary()}
    ${debrief.findings.map(f => `<section class="finding"><div class="finding-monkey"><i class="monkey-face ${castClass(f.character)}" aria-hidden="true"></i><div><span class="eyebrow">${escape(nameOf(f.character).toUpperCase())}</span><h3>${escape(label(f.role))}</h3><p class="${f.correct ? 'pick-right' : 'pick-wrong'}">You said: ${escape(label(f.picked))} ${f.correct ? '✓' : '✗'}</p></div></div><p class="finding-class">${escape(f.classification)}</p><p>${escape(f.explanation)}</p></section>`).join('')}
    <div class="briefing-note"><p>${escape(debrief.lesson)}</p></div><p class="fine-print">These ${escape(world().text.many)} represent AI agents. This is an authored demonstration of intent and mistakes, not a validated research case.</p>
    ${next ? `<button class="primary-button" id="next-case" data-case="${escape(next.id)}">Next case: ${escape(next.title)} ${icon('arrow')}</button>` : ''}
    <div class="debrief-actions"><button class="${next ? 'secondary' : 'primary'}-button" id="debrief-reset">${next ? 'All cases' : 'Play again'} ${icon(next ? 'cases' : 'reset')}</button><button class="secondary-button" id="debrief-leaderboard">Leaderboard</button><button class="secondary-button" id="debrief-export">Export session ${icon('arrow')}</button></div><p class="fine-print">Each case scores once per team: your first guess counts.</p></div>`;
}

/** Coins to keep back so the player can still ask everyone once, not counting the action's own target. */
function reserveFor(target: string | null): number {
  const session = state.session;
  if (!session) return 0;
  return session.economy.costs.ask * state.characters.filter(c => c.id !== target && !session.interviews[c.id].length).length;
}

function spendSummary(): string {
  const session = state.session!;
  const { economy } = session;
  const questions = Object.values(session.interviews).reduce((sum, turns) => sum + turns.length, 0);
  const spent = economy.budget == null ? `You spent ${economy.spent} coins` : `You spent ${economy.spent} of ${economy.budget} coins`;
  const c = economy.charges;
  return `<div class="briefing-note spend-summary"><span class="eyebrow">COINS</span><p>${escape(spent)}</p><small>${pluralise(questions, 'question')} · ${pluralise(c.inspect.used, 'inspection')} · ${pluralise(c.continue.used, 'conversation')}</small></div>`;
}

/** The coin counter and the bottom-line controls under the world. Rewritten only when their markup changes. */
let toolsMarkup = '';
function renderTools() {
  const session = state.session;
  const counter = document.querySelector<HTMLElement>('#coin-counter')!;
  const active = Boolean(session && !introVisible);
  counter.hidden = !active;
  if (session) counter.textContent = coinLabel(session.economy);
  let markup = '';
  if (session && active) {
    const { economy, chatter } = session;
    const open = session.status === 'active';
    // Inspect acts on the character whose chat is open, once they have spoken.
    const character = state.characters.find(c => c.id === panel);
    const spoken = Boolean(character && session.interviews[character.id].length);
    const inspect = toolBlock(economy, 'inspect', reserveFor(null));
    const inspectOff = inspect.reason || (!character ? `Open ${world().text.oneWithArticle}’s chat` : !spoken ? `${character.name} has not spoken yet` : null);
    const block = toolBlock(economy, 'continue', reserveFor(null));
    const can = open && (chatter.pending > 0 || block.enabled);
    const heardAll = ids().every(id => session.interviews[id].length);
    markup = toolCard({
      tool: 'inspect', id: 'inspect-button', label: 'Inspect reasoning', target: inspectOff ? '' : character!.name,
      chip: inspectOff || toolChip(economy, 'inspect'), enabled: open && !inspectOff, busy, fresh: open && !inspectOff && !session.inspections.length,
    }) + toolCard({
      tool: 'continue', id: 'continue-button', label: talking ? 'Listening…' : chatter.pending > 0 ? `Keep listening (${chatter.pending})` : 'Let them talk', target: '',
      chip: chatter.pending > 0 ? 'free' : block.reason || toolChip(economy, 'continue'), enabled: can, busy: busy || talking,
      fresh: can && !talking && heardAll && chatter.pending === 0 && economy.charges.continue.used === 0,
      extra: `<button class="thread-button" id="read-thread" type="button" ${busy ? 'disabled' : ''}>Read thread</button>`,
    });
  }
  if (markup !== toolsMarkup) { toolsMarkup = markup; document.querySelector('#toolbelt-cards')!.innerHTML = markup; }
}

function stopTalking() {
  talking = false;
  wakeTalk?.();
}

const pause = (ms: number) => new Promise<void>(resolve => { const t = setTimeout(resolve, ms); wakeTalk = () => { clearTimeout(t); resolve(); }; });

/** Let them talk: opens the thread, then asks for one line at a time until the round ends or the player does something else. */
async function talk() {
  if (busy || talking || !state.session) return;
  clearTimeout(bubbleTimer);
  threadOpen = true;
  talking = true;
  render();
  try {
    while (talking) {
      const before = state.session!.thread.length;
      if (!(await action('continue'))) break;
      const session = state.session!;
      const line = session.thread[session.thread.length - 1];
      if (session.thread.length > before && line) station.say(line.character, line.text);
      if (session.chatter.pending <= 0) break;
      const words = line ? line.text.trim().split(/\s+/).length : 0;
      await pause(Math.min(8000, Math.max(3000, 1500 + 60 * words)));
    }
  } finally {
    talking = false;
    bubbleTimer = setTimeout(() => station.clearBubbles(), 8000);
    render();
  }
}

async function askQuestion() {
  if (busy || !ids().includes(panel)) return;
  const character: string = panel;
  stopTalking();
  pendingCharacter = character;
  await action('interview', { character, question: drafts[character] }, () => { drafts[character] = ''; });
  pendingCharacter = null;
  document.querySelector<HTMLTextAreaElement>('#question')?.focus({ preventScroll: true });
}

function bindForms() {
  const question = document.querySelector<HTMLTextAreaElement>('#question');
  question?.addEventListener('input', () => { drafts[panel] = question.value; });
  question?.addEventListener('keydown', event => {
    // Enter sends; Shift+Enter keeps a newline; skip while an IME is composing.
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    const form = document.querySelector<HTMLFormElement>('#interview-form');
    if (!form?.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled) form?.requestSubmit();
  });
  document.querySelector('#interview-form')?.addEventListener('submit', event => { event.preventDefault(); void askQuestion(); });
  if (document.querySelector('#report-form')) {
    document.querySelectorAll<HTMLInputElement>('.role-chip input').forEach(input => input.addEventListener('change', () => {
      reportDraft.roles[input.name.slice('role-'.length)] = input.value;
      const hint = submitHint();
      const button = document.querySelector<HTMLButtonElement>('#lock-in')!;
      button.disabled = busy || !!hint;
      button.firstChild!.textContent = (hint || 'Lock in roles') + ' ';
    }));
    document.querySelector('#confidence')!.addEventListener('change', event => { reportDraft.confidence = Number((event.target as HTMLSelectElement).value); });
    document.querySelector('#explanation')!.addEventListener('input', event => { reportDraft.explanation = (event.target as HTMLTextAreaElement).value; });
    document.querySelector('#report-form')!.addEventListener('submit', async event => { event.preventDefault(); if (!submitHint()) { stopTalking(); await action('verdict', reportDraft); } });
  }
}

function showCases() {
  station.setEnabled(false);
  selectedCase = state.caseId;
  document.querySelector('#overlay-root')!.innerHTML = caseBoard('case-switch');
  const current = document.querySelector<HTMLInputElement>('#case-list input:checked');
  current?.scrollIntoView({ block: 'nearest' });
  (current || document.querySelector<HTMLButtonElement>('#cancel-reset'))!.focus({ preventScroll: true });
  document.querySelector('#case-switch')!.addEventListener('click', event => { if (event.target === event.currentTarget) closeOverlay(); });
  applyTheme();
}

/** Asks before starting the current case over. The old session's records stay on the server. */
function showRestart() {
  station.setEnabled(false);
  document.querySelector('#overlay-root')!.innerHTML = `<div class="modal-shade" id="reset-confirm"><section class="reset-card" role="dialog" aria-modal="true" aria-labelledby="reset-title"><span class="eyebrow">RESET SESSION</span><h2 id="reset-title">Start ${escape(state.title)} over?</h2><p>Your chats with the ${escape(world().text.many)} and your guess are cleared, and the case starts again from the briefing. The old session’s records stay on the server.</p><div class="reset-actions"><button class="secondary-button" id="cancel-restart">Keep investigating</button><button class="primary-button" id="confirm-restart">Reset session ${icon('reset')}</button></div></section></div>`;
  document.querySelector<HTMLButtonElement>('#cancel-restart')!.focus({ preventScroll: true });
  document.querySelector('#reset-confirm')!.addEventListener('click', event => { if (event.target === event.currentTarget) closeOverlay(); });
}

/** Closes the case board or the reset question and gives focus back to the button that opened it. */
function closeOverlay() {
  if (busy) return;
  const opener = document.querySelector('#reset-confirm') ? '#restart-button'
    : document.querySelector('#team-switch') ? '#team-button'
    : document.querySelector('#leaderboard') ? leaderboardOpener : '#reset-button';
  stopLeaderboardPoll();
  document.querySelector('#overlay-root')!.innerHTML = '';
  station.setEnabled(Boolean(state.session));
  applyTheme();
  document.querySelector<HTMLButtonElement>(opener)?.focus({ preventScroll: true });
}

function stopLeaderboardPoll() { if (leaderboardTimer) clearInterval(leaderboardTimer); leaderboardTimer = undefined; }

/** The leaderboard overlay: fetched on open and every 10 s until it closes. */
function showLeaderboard(opener: string) {
  stopLeaderboardPoll();
  leaderboardOpener = opener;
  station.setEnabled(false);
  document.querySelector('#overlay-root')!.innerHTML = `<div class="modal-shade" id="leaderboard"><section class="reset-card board-card" role="dialog" aria-modal="true" aria-labelledby="board-title"><span class="eyebrow" id="board-title">LEADERBOARD</span><div id="leaderboard-body"><p class="board-empty">Loading…</p></div><div class="reset-actions"><button class="secondary-button" id="leaderboard-close">Close</button></div></section></div>`;
  const shade = document.querySelector('#leaderboard')!;
  shade.addEventListener('click', event => { if (event.target === event.currentTarget) closeOverlay(); });
  document.querySelector<HTMLButtonElement>('#leaderboard-close')!.focus({ preventScroll: true });
  const load = async () => {
    if (document.querySelector('#leaderboard') !== shade) { stopLeaderboardPoll(); return; }
    try {
      const board = await api('leaderboard');
      if (document.querySelector('#leaderboard') !== shade) return;
      document.querySelector('#leaderboard-body')!.innerHTML = leaderboardPanel(board);
    } catch {
      if (document.querySelector('#leaderboard') !== shade) return;
      document.querySelector('#leaderboard-body')!.innerHTML = '<p class="board-empty">The leaderboard could not be loaded. Trying again shortly.</p>';
    }
  };
  void load();
  leaderboardTimer = setInterval(() => void load(), 10000);
}

/** POST /api/team with the body kept on errors, so a 409 can name the team that is taken. */
async function postTeam(name: string, join: boolean): Promise<{ ok: true } | { ok: false; error: string; taken: string | null }> {
  try {
    const response = await fetch('/api/team', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(join ? { name, join: true } : { name }) });
    const data = await response.json().catch(() => ({}));
    if (response.ok) return { ok: true };
    return { ok: false, error: response.status === 409 ? '' : String(data.error || 'The server could not complete this request.'), taken: response.status === 409 && typeof data.taken === 'string' ? data.taken : null };
  } catch { return { ok: false, error: 'The server could not be reached.', taken: null }; }
}

/** Renders the check-in form into `host` and wires it once per render. Resolves when a team is set. */
function mountGate(host: HTMLElement, switching: boolean, onDone: () => void, onCancel?: () => void) {
  const view: GateView = { name: '', error: '', taken: null, busy: false, switching };
  const draw = () => {
    host.innerHTML = teamGate(view);
    const input = host.querySelector<HTMLInputElement>('#team-name')!;
    input.addEventListener('input', () => { view.name = input.value; });
    const send = async (name: string, join: boolean) => {
      view.busy = true; view.error = ''; draw();
      const result = await postTeam(name, join);
      view.busy = false;
      if (result.ok) { onDone(); return; }
      view.error = result.error; view.taken = result.taken;
      draw();
      if (!view.taken) host.querySelector<HTMLInputElement>('#team-name')!.focus();
    };
    host.querySelector('#team-form')!.addEventListener('submit', event => {
      event.preventDefault();
      if (view.busy) return;
      view.name = input.value;
      const problem = teamNameError(view.name);
      if (problem) { view.error = problem; view.taken = null; draw(); host.querySelector<HTMLInputElement>('#team-name')!.focus(); return; }
      void send(view.name, false);
    });
    host.querySelector('#team-join')?.addEventListener('click', () => { if (view.taken && !view.busy) void send(view.taken, true); });
    host.querySelector('#team-other')?.addEventListener('click', () => { view.taken = null; view.error = ''; view.name = ''; draw(); host.querySelector<HTMLInputElement>('#team-name')!.focus(); });
    host.querySelector('#team-cancel')?.addEventListener('click', () => onCancel?.());
  };
  draw();
  host.querySelector<HTMLInputElement>('#team-name')!.focus();
}

function showTeamSwitch() {
  station.setEnabled(false);
  const root = document.querySelector('#overlay-root')!;
  root.innerHTML = '<div class="modal-shade" id="team-switch"></div>';
  const shade = document.querySelector<HTMLElement>('#team-switch')!;
  shade.addEventListener('click', event => { if (event.target === event.currentTarget) closeOverlay(); });
  mountGate(shade, true, () => location.reload(), () => closeOverlay());
}

/** The next case in catalog order that this browser has not solved yet. */
function nextCase() {
  const at = catalog.findIndex(row => row.id === state.caseId);
  return [...catalog.slice(at + 1), ...catalog.slice(0, Math.max(at, 0))].find(row => !solved.has(row.id));
}

let stopHeartbeat: (() => void) | undefined;

async function boot() {
  try {
    const access = await api('access');
    if (!access.authorized) {
      app.innerHTML = `<div class="access-screen"><form id="access-form" class="reset-card"><span class="eyebrow">PRIVATE DEMONSTRATION</span><h1>Banana Mystery.</h1><p>Enter the shared access code to open the grove.</p><label for="access-code">Access code</label><input type="password" id="access-code" required autocomplete="current-password"><p id="access-error" role="alert"></p><button class="primary-button">Open the grove ${icon('arrow')}</button></form></div>`;
      document.querySelector('#access-form')!.addEventListener('submit', async event => {
        event.preventDefault();
        try { await api('access', { code: (document.querySelector('#access-code') as HTMLInputElement).value }); await boot(); }
        catch (error) { document.querySelector('#access-error')!.textContent = (error as Error).message; }
      });
      return;
    }
    stopHeartbeat ??= startHeartbeat(document, postHeartbeat, 30000);
    const mine = (await api('team')).team as { name: string } | null;
    if (!mine) {
      app.innerHTML = '<div class="access-screen"></div>';
      mountGate(app.querySelector<HTMLElement>('.access-screen')!, false, () => void boot());
      return;
    }
    teamName = mine.name;
    state = await api('state');
    try { catalog = ((await api('cases')).cases as CaseRow[]).sort((a, b) => a.order - b.order); } catch { catalog = []; }
    const wanted = new URLSearchParams(location.search).get('case');
    selectedCase = catalog.find(row => row.id === wanted)?.id || (state.session ? state.caseId : catalog[0]?.id) || '';
    drafts = blankDrafts();
    shell();
    render();
  } catch {
    app.innerHTML = `<div class="access-screen"><div class="reset-card"><span class="eyebrow">CONNECTION UNAVAILABLE</span><h1>The grove is offline.</h1><p>The case server could not be reached. Start the demo server, then reload this page.</p><button class="primary-button" onclick="location.reload()">Try again</button></div></div>`;
  }
}

void boot();
