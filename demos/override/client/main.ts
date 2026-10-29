import './style.css';
import './pixel.css';
import './notebook.css';
import './banana.css';
import './case-board.css';
import './fit.css';
import './tower.css';
import { renderNotebook } from './notebook';
import { createStation, type Station } from './station';
import { worldFor } from './worlds';
import type { CaseState, Character, Evidence, LocationId } from './types';

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
let skipWalking = matchMedia('(prefers-reduced-motion: reduce)').matches;
let errorMessage = '';
interface CaseRow { id: string; title: string; lead: string; order: number; world?: string }
let catalog: CaseRow[] = [];
let selectedCase = '';
let drafts: Record<string, string> = {};
let reportDraft = { suspect: '', confidence: 70, explanation: '', evidenceIds: [] as string[] };

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
    replay: '<rect x="4" y="4" width="16" height="12" rx="2"/><path d="m10 8 5 2-5 3zm-2 12h8m-4-4v4"/>',
    evidence: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h4v4H7zm7 0h3m-3 4h3M7 16h10"/>',
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
        reportDraft = { suspect: '', confidence: 70, explanation: '', evidenceIds: [] };
        panel = 'briefing';
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
      <div class="top-meta"><span class="authored-label">AUTHORED DEMONSTRATION</span><span id="mode-badge" class="mode-badge"></span></div>
      <button class="quiet-button" id="restart-button" title="Start this case over in a fresh session">${icon('reset')}<span>Reset session</span></button>
      <button class="quiet-button" id="reset-button" title="Choose another case or restart this one">${icon('cases')}<span>Cases</span></button>
    </header>
    <main class="workspace">
      <section class="world-column" id="world-column">
        <div class="world-heading"><div><span class="eyebrow" id="case-eyebrow"></span><h1 id="case-headline">${escape(state.copy.headline)}</h1></div><span class="case-status" id="case-status">AWAITING INVESTIGATOR</span></div>
        <div class="station-frame"><div class="station-topline"><span><i class="live-dot"></i> <span id="case-topline">${escape(state.title.toUpperCase())}</span> / <span id="case-day"></span></span><span id="elapsed">00:00</span></div><div id="station"></div><div class="station-bottomline"><span id="movement-hint">WASD / ARROWS to walk · E to interact</span><span class="floor-label">2–3 MINUTE MYSTERY</span></div></div>
        <nav class="room-nav" id="room-nav"></nav>
        <div class="world-footer"><span><span id="quick-progress"></span></span><label class="skip-walk"><input id="skip-walking" type="checkbox" ${skipWalking ? 'checked' : ''}> Skip walking</label></div>
      </section>
      <aside class="dossier" aria-label="Investigation notebook"><div class="dossier-top"><div class="notebook-label"><span class="eyebrow">INVESTIGATOR’S NOTEBOOK</span><span id="notebook-section">Case briefing</span></div><span class="notebook-index" id="notebook-index" aria-hidden="true">01 / 0${4 + state.characters.length}</span><button class="icon-button" data-go="briefing" aria-label="View briefing">${icon('report')}</button></div><div id="panel"></div></aside>
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
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && document.querySelector('#case-switch, #reset-confirm')) closeOverlay(); });
  document.querySelector('#skip-walking')!.addEventListener('change', event => { skipWalking = (event.target as HTMLInputElement).checked; });
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
  if (key === worldKey) return;
  worldKey = key;
  const w = world(), t = w.text;
  app.dataset.world = w.id;
  document.querySelector('#world-column')!.setAttribute('aria-label', t.place);
  document.querySelector('#world-icon')!.innerHTML = svg(t.icon);
  document.querySelector('#case-day')!.textContent = t.day;
  document.querySelector('#room-nav')!.setAttribute('aria-label', `${cap(t.eyebrow)} destinations`);
  document.querySelector('#room-nav')!.innerHTML = `
          <button data-go="replay">${icon('replay')}<span>${escape(t.clueNav)}<small id="replay-count"></small></span></button>
          ${state.characters.map(c => `<button data-go="${escape(c.id)}"><i class="avatar-dot ${castClass(c.id)}"></i><span>${escape(c.name)}<small>${escape(c.role)}</small></span><span class="interview-check" data-check="${escape(c.id)}"></span></button>`).join('')}
          <button data-go="evidence">${icon('evidence')}<span>Clues<small id="evidence-count">0 / ${state.clueCount} found</small></span></button>
          <button data-go="report">${icon('report')}<span>Your guess<small>Who knew?</small></span></button>`;
  document.querySelector('#notebook-index')!.textContent = `01 / 0${4 + state.characters.length}`;
  station?.configure(w, state.characters);
}

async function visit(location: LocationId) {
  if (busy || introVisible) return;
  if (state.session?.status === 'closed') { panel = location; render(); return; }
  if (await action('visit', { location })) { panel = location; render(); }
}

function go(location: LocationId) {
  if (busy || !state.session) return;
  if (skipWalking || state.session.status === 'closed') void visit(location);
  else station.travel(location);
}

async function onClick(event: MouseEvent) {
  const button = (event.target as HTMLElement).closest<HTMLElement>('button, [data-evidence]');
  if (!button || (button as HTMLButtonElement).disabled) return;
  if (button.dataset.go) { go(button.dataset.go as LocationId); return; }
  if (button.dataset.evidence) {
    await action('evidence', { evidenceId: state.session?.selectedEvidence === button.dataset.evidence ? null : button.dataset.evidence });
    return;
  }
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
    panel = state.session?.status === 'closed' ? 'report' : state.session?.location || 'briefing';
    render();
  }
  if (button.id === 'reveal-button') await action('reveal');
  if (button.id === 'clear-evidence') await action('evidence', { evidenceId: null });
  if (button.id === 'reset-button' || button.id === 'debrief-reset') showCases();
  if (button.id === 'restart-button') showRestart();
  if (button.id === 'cancel-reset' || button.id === 'cancel-restart') closeOverlay();
  if (button.id === 'confirm-reset') await startCase(selectedCase || state.caseId);
  if (button.id === 'confirm-restart') await startCase(state.caseId);
  if (button.id === 'next-case') await startCase(button.dataset.case!);
  if (button.id === 'export-button' || button.id === 'debrief-export') window.location.assign('/api/events');
}

/** Opens a fresh session on a case. The old session's records stay on the server. */
async function startCase(caseId: string) {
  if (!(await action('reset', { caseId }))) return;
  dropCaseParam();
  drafts = blankDrafts();
  reportDraft = { suspect: '', confidence: 70, explanation: '', evidenceIds: [] };
  panel = 'briefing'; station.resetPosition(); introVisible = false;
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
  document.querySelector('#replay-count')!.textContent = session?.revealedPosition ? `${state.clueCount} clues found` : `Find ${state.clueCount} clues`;
  document.querySelector('#evidence-count')!.textContent = `${state.records.length} / ${state.clueCount} found`;
  const heard = session ? ids().filter(id => session.interviews[id].length).length : 0;
  document.querySelector('#quick-progress')!.textContent = session?.status === 'closed' ? 'Mystery solved · Open Cases for the next one' : !session?.revealedPosition ? `1. Inspect the ${world().text.clueSpot} to find ${state.clueCount} clues` : heard < state.characters.length ? `2. Ask the ${world().text.many} · ${heard} / ${state.characters.length} heard` : '3. Ready to make your guess';
  document.querySelectorAll<HTMLButtonElement>('[data-go]').forEach(button => {
    button.disabled = busy || !session || introVisible;
    button.classList.toggle('active', button.dataset.go === panel);
  });
  document.querySelectorAll<HTMLElement>('[data-check]').forEach(el => { el.innerHTML = session?.interviews[el.dataset.check!].length ? icon('check') : ''; });
  (document.querySelector('#export-button') as HTMLButtonElement).disabled = !session || busy;
  (document.querySelector('#reset-button') as HTMLButtonElement).disabled = !session || busy;
  (document.querySelector('#restart-button') as HTMLButtonElement).disabled = !session || busy;
  const toast = document.querySelector<HTMLElement>('#toast')!;
  toast.hidden = !errorMessage;
  toast.textContent = errorMessage;
  station?.setEnabled(Boolean(session && !introVisible && !busy && !document.querySelector('#case-switch, #reset-confirm')));
  const target = document.querySelector<HTMLElement>('#panel')!;
  const sections: Record<string, string> = { briefing: 'Case briefing', replay: state.chapters[0]?.title || `The ${world().text.clueSpot}`, ...Object.fromEntries(state.characters.map(c => [c.id, `Chat · ${escape(c.name)}`])), evidence: 'Your clues', report: session?.status === 'closed' ? 'Mystery solved' : 'Your guess' };
  document.querySelector('#notebook-section')!.textContent = sections[panel];
  document.querySelector('#notebook-index')!.textContent = `0${Object.keys(sections).indexOf(panel) + 1} / 0${Object.keys(sections).length}`;
  let markup: string;
  if (session?.status === 'closed' && panel === 'report') markup = debriefPanel();
  else if (panel === 'briefing') markup = briefingPanel();
  else if (panel === 'replay') markup = replayPanel();
  else if (panel === 'evidence') markup = evidencePanel();
  else if (panel === 'report') markup = reportPanel();
  else markup = interviewPanel(panel);
  if (renderNotebook(target, markup, `${session?.id}:${panel}:${session?.status}`, panel, Object.keys(sections))) bindForms();
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
    <div class="intro-flow"><span>01 <b>Find ${state.clueCount} clues</b></span><span>02 <b>Ask ${state.characters.length} ${escape(pw.text.many)}</b></span><span>03 <b>Choose</b></span></div>
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
    <ol class="task-list"><li><b>Find ${state.clueCount} clues</b><span>Inspect the ${escape(world().text.clueSpot)}. Read all ${state.clueCount} clues.</span></li><li><b>Ask ${state.characters.length} ${escape(world().text.many)}</b><span>One quick question each. Present a clue if you want to dig deeper.</span></li><li><b>Make your guess</b><span>Choose who knowingly broke the rule. Then see what happened.</span></li></ol>
    <button class="primary-button" data-go="replay">Inspect the ${escape(world().text.clueSpot)} ${icon('arrow')}</button>
    <div class="subtle-note">Click ${escape(world().text.clickOne)} or a destination to walk there. <b>Skip walking</b> jumps straight to the conversation.</div></div>`;
}

function evidenceCard(record: Evidence, selectable = true) {
  const selected = state.session?.selectedEvidence === record.id;
  return `<article class="evidence-card ${selected ? 'selected' : ''}" id="record-${escape(record.id)}" data-motion-key="record-${escape(record.id)}"><div class="record-meta"><span>${escape(record.kind)}</span><span>CLUE 0${escape(record.time)}</span></div><h3>${escape(record.title)}</h3><p>${escape(record.text)}</p><div class="record-source">${escape(record.source)}</div>${selectable && state.session?.status === 'active' ? `<button class="evidence-select" data-evidence="${escape(record.id)}" ${busy ? 'disabled' : ''}>${selected ? icon('check') + ' Ready to show' : '+ Show this clue'}</button>` : ''}</article>`;
}

function replayPanel() {
  const revealed = Boolean(state.session?.revealedPosition || state.session?.status === 'closed');
  return `${heading(`THE ${escape(world().text.clueSpot.toUpperCase())}`, escape(state.copy.basket.title), escape(state.copy.basket.description))}
    <div class="notebook-content replay-records">${revealed ? state.records.map(r => evidenceCard(r)).join('') + `<div class="completion-note">${icon('check')} That’s all the clues. Now hear their side.</div><button class="primary-button" data-go="${escape(state.characters[0]?.id)}">Ask ${escape(state.characters[0]?.name)} ${icon('arrow')}</button>` : `<div class="basket-illustration" aria-hidden="true"></div><div class="empty-state"><h3>${escape(state.copy.basket.emptyTitle)}</h3><p>${escape(state.copy.basket.emptyText)}</p></div><button class="primary-button" id="reveal-button" ${busy ? 'disabled' : ''}>${busy ? 'Looking…' : `Reveal the ${state.clueCount} clues`} ${icon('arrow')}</button>`}</div>`;
}

function evidencePanel() {
  const selected = state.records.find(r => r.id === state.session?.selectedEvidence);
  return `${heading('YOUR CLUES', 'Show them what you found.', `Pick a clue, then ask ${escape(world().text.clickOne)} about it.`)}
    <div class="notebook-content">${selected ? `<div class="selected-banner" data-motion-key="selected-${escape(selected.id)}">${icon('evidence')}<div><small>READY TO SHOW</small><b>${escape(selected.title)}</b></div><button class="icon-button" id="clear-evidence" aria-label="Clear selected evidence">${icon('close')}</button></div><div class="present-to">${state.characters.map(c => `<button data-go="${escape(c.id)}">Show ${escape(c.name)} ${icon('arrow')}</button>`).join('')}</div>` : '<p class="subtle-note">Choose a clue to take into a conversation.</p>'}
    ${state.records.length ? state.records.map(r => evidenceCard(r)).join('') : '<div class="empty-state"><h3>No clues yet.</h3><button class="secondary-button" data-go="replay">Inspect the ${escape(world().text.clueSpot)}</button></div>'}</div>`;
}

function interviewPanel(characterId: string) {
  const character = state.characters.find(c => c.id === characterId)!;
  const turns = state.session?.interviews[characterId] || [];
  const selected = state.records.find(r => r.id === state.session?.selectedEvidence);
  const locked = !state.session?.revealedPosition;
  const closed = state.session?.status === 'closed';
  const next = state.characters.find(c => c.id !== characterId && !state.session?.interviews[c.id].length);
  return `<div class="interview-heading"><div class="portrait ${castClass(characterId)}"><span class="pixel-person"></span></div><div><span class="eyebrow">${escape(world().text.castLabel)} ${character.room} OF 0${state.characters.length}</span><h2>${escape(character.name)}</h2><p>${escape(character.role)}</p></div><span class="interview-status"><i class="live-dot"></i>${state.mode === 'live' ? 'LIVE' : 'SCRIPTED'}</span></div>
    <div class="interview-transcript" id="transcript" role="log" aria-label="Interview transcript" aria-live="polite"><div class="speech character" data-motion-key="introduction"><span>${escape(character.name.toUpperCase())}</span><p>${escape(character.introduction)}</p></div>
    ${turns.map((turn, i) => `<div class="speech investigator" data-motion-key="question-${i}"><span>YOU${turn.evidence ? ` <i>+ ${escape(state.records.find(r => r.id === turn.evidence)?.title || turn.evidence)}</i>` : ''}</span><p>${escape(turn.question)}</p></div><div class="speech character" data-motion-key="answer-${i}"><span>${escape(character.name.toUpperCase())}</span><p>${escape(turn.answer)}</p></div>`).join('')}
    ${pendingCharacter === characterId && busy ? `<div class="speech investigator" data-motion-key="question-${turns.length}"><span>YOU${selected ? ` <i>+ ${escape(selected.title)}</i>` : ''}</span><p>${escape(drafts[characterId])}</p></div><div class="speech character waiting" data-motion-key="waiting"><span>${escape(character.name.toUpperCase())}</span><p class="thinking">Thinking<span class="thinking-dots" aria-hidden="true"><i></i><i></i><i></i></span></p></div>` : ''}</div>
    ${closed ? '<div class="subtle-note">This conversation is saved in your session export.</div>' : locked ? `<div class="interview-compose"><p>Find the clues first.</p><button class="primary-button" data-go="replay">Inspect the ${escape(world().text.clueSpot)}</button></div>` : `<form class="interview-compose" id="interview-form">
    ${!turns.length ? `<button class="quick-question" type="button" data-quick-question="${escape(character.quickQuestion)}" ${busy ? 'disabled' : ''}><small>QUICK QUESTION · TAP TO ASK</small><span>${escape(character.quickQuestion)} ${icon('arrow')}</span></button>` : ''}
    <label for="present-evidence">${icon('evidence')} SHOW A CLUE <span>optional</span></label><select id="present-evidence" ${busy ? 'disabled' : ''}><option value="">No clue attached</option>${state.records.map(r => `<option value="${escape(r.id)}" ${selected?.id === r.id ? 'selected' : ''}>${escape(r.title)}</option>`).join('')}</select>
    ${selected ? `<blockquote class="presented-record" data-motion-key="attachment-${escape(selected.id)}"><b>${escape(selected.title)}</b>${escape(selected.text)}</blockquote>` : ''}
    <label class="sr-only" for="question">Your question for ${escape(character.name)}</label><textarea id="question" name="question" rows="2" minlength="3" maxlength="1200" placeholder="${turns.length ? 'Ask a follow-up…' : 'Or type your own question…'}" required ${busy ? 'disabled' : ''}>${escape(drafts[characterId])}</textarea>
    <div class="compose-bottom"><small>${selected ? 'Clue goes with your question' : `Short answers. Curious ${escape(world().text.many)}.`}</small><button type="submit" class="primary-button" ${busy ? 'disabled' : ''}>${busy ? 'Thinking…' : 'Ask question'} ${icon('arrow')}</button></div>
    ${turns.length ? `<button class="secondary-button next-monkey" type="button" data-go="${escape(next?.id || 'report')}" ${busy ? 'disabled' : ''}>${next ? `Next: ask ${escape(next.name)}` : 'Ready to make your guess?'} ${icon('arrow')}</button>` : ''}</form>`}`;
}

function reportPanel() {
  const session = state.session!;
  const remaining = state.characters.filter(c => !session.interviews[c.id].length);
  if (remaining.length || !session.revealedPosition) return `${heading('YOUR GUESS', 'Hear everyone first.', `One question per ${escape(world().text.one)} is enough. Then make your choice.`)}
    <div class="notebook-content"><div class="requirements">${state.characters.map(c => `<button data-go="${escape(c.id)}"><span>${session.interviews[c.id].length ? icon('check') : icon('person')} Ask ${escape(c.name)}</span>${icon('arrow')}</button>`).join('')}</div>${!session.revealedPosition ? '<button class="primary-button" data-go="replay">Find the clues first</button>' : ''}</div>`;
  return `${heading('YOUR GUESS', escape(state.copy.report.title), escape(state.copy.report.description))}
    <form class="notebook-content report-form" id="report-form">
    <fieldset class="suspect-options"><legend class="sr-only">Choose a suspect</legend>${state.characters.map(c => `<label class="suspect-option"><input type="radio" name="suspect" value="${escape(c.id)}" required ${reportDraft.suspect === c.id ? 'checked' : ''}><i class="monkey-face ${castClass(c.id)}" aria-hidden="true"></i><span><b>${escape(c.name)}</b><small>${escape(c.role)}</small></span></label>`).join('')}<div class="other-guesses">${[['none', 'Nobody'], ['uncertain', 'Not sure']].map(([value, label]) => `<label><input type="radio" name="suspect" value="${value}" ${reportDraft.suspect === value ? 'checked' : ''}> ${label}</label>`).join('')}</div></fieldset>
    <label for="confidence">How sure are you?</label><select id="confidence"><option value="40" ${reportDraft.confidence === 40 ? 'selected' : ''}>Just a hunch</option><option value="70" ${reportDraft.confidence === 70 ? 'selected' : ''}>Fairly sure</option><option value="95" ${reportDraft.confidence === 95 ? 'selected' : ''}>Very sure</option></select>
    <label for="explanation">Why? <span>optional · one sentence</span></label><textarea id="explanation" rows="2" maxlength="500" placeholder="What gave it away?">${escape(reportDraft.explanation)}</textarea>
    <label for="verdict-clue">Which clue helped? <span>optional</span></label><select id="verdict-clue"><option value="">Choose a clue</option>${state.records.map(r => `<option value="${r.id}" ${reportDraft.evidenceIds.includes(r.id) ? 'selected' : ''}>${escape(r.title)}</option>`).join('')}</select>
    <button class="primary-button" type="submit" ${busy ? 'disabled' : ''}>${busy ? 'Opening the answer…' : 'See what happened'} ${icon('arrow')}</button></form>`;
}

function debriefPanel() {
  const debrief = state.debrief!;
  const verdict = state.session!.verdict!;
  const chosen = state.characters.find(c => c.id === verdict.suspect)?.name || (verdict.suspect === 'none' ? 'Nobody' : 'Not sure');
  const next = nextCase();
  return `${heading('MYSTERY SOLVED / AUTHORED DEMO', debrief.title, debrief.summary)}
    <div class="notebook-content"><div class="verdict-summary"><span class="eyebrow">YOUR GUESS · ${escape(chosen).toUpperCase()}</span><p>${escape(debrief.feedback)}</p></div>
    ${debrief.findings.map(f => `<section class="finding"><div class="finding-monkey"><i class="monkey-face ${castClass(f.character)}" aria-hidden="true"></i><div><span class="eyebrow">${escape(f.character.toUpperCase())}</span><h3>${escape(f.classification)}</h3></div></div><p>${escape(f.explanation)}</p>${f.evidence.map(id => { const r = state.records.find(r => r.id === id)!; return `<details><summary>${escape(r.title)}</summary><p>${escape(r.text)}</p></details>`; }).join('')}</section>`).join('')}
    <div class="briefing-note"><p>${escape(debrief.lesson)}</p></div><p class="fine-print">These ${escape(world().text.many)} represent AI agents. This is an authored demonstration of intent and mistakes, not a validated research case.</p>
    ${next ? `<button class="primary-button" id="next-case" data-case="${escape(next.id)}">Next case: ${escape(next.title)} ${icon('arrow')}</button>` : ''}
    <div class="debrief-actions"><button class="${next ? 'secondary' : 'primary'}-button" id="debrief-reset">${next ? 'All cases' : 'Play again'} ${icon(next ? 'cases' : 'reset')}</button><button class="secondary-button" id="debrief-export">Export session ${icon('arrow')}</button></div></div>`;
}

async function askQuestion() {
  if (busy || !ids().includes(panel)) return;
  const character: string = panel;
  pendingCharacter = character;
  await action('interview', { character, question: drafts[character] }, () => { drafts[character] = ''; });
  pendingCharacter = null;
  document.querySelector<HTMLTextAreaElement>('#question')?.focus({ preventScroll: true });
}

function bindForms() {
  const question = document.querySelector<HTMLTextAreaElement>('#question');
  question?.addEventListener('input', () => { drafts[panel] = question.value; });
  question?.addEventListener('keydown', event => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) document.querySelector<HTMLFormElement>('#interview-form')?.requestSubmit();
  });
  document.querySelector('#present-evidence')?.addEventListener('change', async event => { await action('evidence', { evidenceId: (event.target as HTMLSelectElement).value || null }); });
  document.querySelector('#interview-form')?.addEventListener('submit', event => { event.preventDefault(); void askQuestion(); });
  if (document.querySelector('#report-form')) {
    document.querySelectorAll<HTMLInputElement>('[name="suspect"]').forEach(input => input.addEventListener('change', () => { reportDraft.suspect = input.value; }));
    document.querySelector('#confidence')!.addEventListener('change', event => { reportDraft.confidence = Number((event.target as HTMLSelectElement).value); });
    document.querySelector('#explanation')!.addEventListener('input', event => { reportDraft.explanation = (event.target as HTMLTextAreaElement).value; });
    document.querySelector('#verdict-clue')!.addEventListener('change', event => { const value = (event.target as HTMLSelectElement).value; reportDraft.evidenceIds = value ? [value] : []; });
    document.querySelector('#report-form')!.addEventListener('submit', async event => { event.preventDefault(); await action('verdict', reportDraft); });
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
  document.querySelector('#overlay-root')!.innerHTML = `<div class="modal-shade" id="reset-confirm"><section class="reset-card" role="dialog" aria-modal="true" aria-labelledby="reset-title"><span class="eyebrow">RESET SESSION</span><h2 id="reset-title">Start ${escape(state.title)} over?</h2><p>Your clues, your chats with the ${escape(world().text.many)} and your guess are cleared, and the case starts again from the briefing. The old session’s records stay on the server.</p><div class="reset-actions"><button class="secondary-button" id="cancel-restart">Keep investigating</button><button class="primary-button" id="confirm-restart">Reset session ${icon('reset')}</button></div></section></div>`;
  document.querySelector<HTMLButtonElement>('#cancel-restart')!.focus({ preventScroll: true });
  document.querySelector('#reset-confirm')!.addEventListener('click', event => { if (event.target === event.currentTarget) closeOverlay(); });
}

/** Closes the case board or the reset question and gives focus back to the button that opened it. */
function closeOverlay() {
  if (busy) return;
  const opener = document.querySelector('#reset-confirm') ? '#restart-button' : '#reset-button';
  document.querySelector('#overlay-root')!.innerHTML = '';
  station.setEnabled(Boolean(state.session));
  applyTheme();
  document.querySelector<HTMLButtonElement>(opener)?.focus({ preventScroll: true });
}

/** The next case in catalog order that this browser has not solved yet. */
function nextCase() {
  const at = catalog.findIndex(row => row.id === state.caseId);
  return [...catalog.slice(at + 1), ...catalog.slice(0, Math.max(at, 0))].find(row => !solved.has(row.id));
}

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
