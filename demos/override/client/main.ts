import './fonts.css';
import './style.css';
import './stage.css';
import './banana.css';
import './hud.css';
import './dialogue.css';
import './lineup.css';
import './case-board.css';
import './team.css';
import './board.css';
import './bubbles.css';
import './friends.css';
import './splash.css';
import './factory.css';
import './department.css';
import './renaissance.css';
import { escape, svg, heading, mmss } from './html.ts';
import { HINTS, notInCase, coinHint, talkBriefingList, talkVerdictLabel, toolChip, toolBlock, toolsBlock, toolCard, toolGuide, threadPanel } from './tools';
import { loadText, t, plain, tn } from './text';
import { teamGate, teamNameError, leaderboardPanel, type GateView } from './team';
import { boardScreen } from './board.ts';
import { debriefPage } from './debrief.ts';
import { accusePanel, liveDraftQuotes } from './accuse.ts';
import { excerptOf, quotesPanel } from './talk-ui.ts';
import { renderNotebook } from './notebook';
import { createStage, type Stage } from './stage';
import { postHeartbeat, startHeartbeat } from './heartbeat';
import { worldFor } from './worlds';
import { hudShell, castCard } from './hud.ts';
import { interviewPanel, briefingPanel, evidencePanel } from './dialogue.ts';
import { evidenceIdOf } from './hall-layout.ts';
import { lineupPanel } from './lineup.ts';
import { wantSplash, splashSeen, markSplashSeen, playSplash } from './splash.ts';
import type { Alarm, CaseState, Character, LocationId, Pick, Pose } from './types';

const app = document.querySelector<HTMLDivElement>('#app')!;
const ids = (): string[] => state.characters.map(c => c.id);
const world = () => worldFor(state?.world?.id);
let worldKey = '';
const blankDrafts = (): Record<string, string> => Object.fromEntries(state.characters.map(c => [c.id, '']));
let state: CaseState;
let station: Stage;
let panel: LocationId = 'briefing';
/** The evidence card to show open on the Evidence page; null when the page was opened without one. */
let evidenceFocus: string | null = null;
const isEvidence = (loc: string): boolean => loc === 'evidence' || loc.startsWith('evidence:');
/** Panel ids never contain ':' (the notebook splits its key on it): evidence:<id> shows as `evidence`. */
const panelOf = (loc: LocationId): LocationId => (isEvidence(loc) ? 'evidence' : loc);
/** The words picked in a chat line for a quote or a follow-up; null when nothing is picked. Any re-render keeps it. */
let pick: Pick | null = null;
/** Clicks made on words since the pick began: 1 sets the start, 2 sets the end, 3 starts over. */
let pickClicks = 0;
/** The accusation being built on the report page of a talk case. */
let accuseDraft: { character: string | null; quotes: string[] } = { character: null, quotes: [] };
const resetTalkView = () => { pick = null; pickClicks = 0; accuseDraft = { character: null, quotes: [] }; };
let busy = false;
let pendingCharacter: string | null = null;
let introVisible = true;
let errorMessage = '';
/** The agents' thread shows in the notebook instead of the location panel; `panel` is left alone. */
let threadOpen = false;
/** The dialogue box over the world: opened by any visit or the notebook button, closed by walking, Esc or its close button. */
let dialogueOpen = false;
/** True while the Let them talk loop runs; any other player action sets it false. */
let talking = false;
let wakeTalk: (() => void) | undefined;
let bubbleTimer: ReturnType<typeof setTimeout> | undefined;
interface CaseRow { id: string; title: string; lead: string; order: number; world?: string; cast?: { id: string; name: string }[] }
let catalog: CaseRow[] = [];
let selectedCase = '';
let drafts: Record<string, string> = {};
let teamName = '';
let leaderboardTimer: ReturnType<typeof setInterval> | undefined;
let leaderboardOpener = '#leaderboard-button';
const freshDraft = () => ({ roles: {} as Record<string, string>, confidence: 70, explanation: '' });
let reportDraft = freshDraft();
/** Lines where Inspect found no reasoning. The note stays in the chat until the character says something new. */
const noThought = new Set<string>();
const lineKey = (id: string) => `${state.session?.id}:${id}:${state.session?.interviews[id].length}:${state.session?.thread.length}`;

// Solved cases are a per-browser convenience for the case list; research records stay on the server.
const solvedKey = 'override.solved';
const solved = new Set<string>((() => {
  try { const saved = JSON.parse(localStorage.getItem(solvedKey) || '[]'); return Array.isArray(saved) ? saved.filter(id => typeof id === 'string') : []; }
  catch { return []; }
})());
function markSolved(caseId: string) {
  if (solved.has(caseId) || state?.session?.verdict?.outcome === 'escaped') return;
  solved.add(caseId);
  try { localStorage.setItem(solvedKey, JSON.stringify([...solved])); } catch { /* Storage blocked: the badge lasts this visit. */ }
}

const caseNumber = (order: number) => String(order).padStart(3, '0');
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

const failed = () => plain('main.failed');

/** One fetch of /api/`path`; the status and the JSON body (null when it is not JSON) come back whatever the status. */
async function apiRaw(path: string, body?: object): Promise<{ ok: boolean; status: number; data: any }> {
  const response = await fetch(`/api/${path}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const data = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, data };
}

async function api(path: string, body?: object) {
  const { ok, data } = await apiRaw(path, body);
  if (!ok || data === null) throw new Error(data?.error || failed());
  return data;
}

/** Runs one player action. Returns false when it failed or when the reply started the escape; onSuccess runs for any reply the server accepted. */
async function action(name: string, payload: object = {}, onSuccess?: () => void) {
  if (busy || escaping) return false;
  busy = true;
  errorMessage = '';
  render();
  try {
    const fresh: CaseState = await api(name, { sessionId: state.session?.id, revision: state.session?.revision, ...payload });
    // A reply is a fresh view like a poll: a warning mark or the escape may have passed while it was in flight.
    const tookOver = receive(fresh);
    if (!tookOver) state = fresh;
    onSuccess?.();
    return !tookOver;
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : plain('main.connectionLost');
    try {
      const refreshed: CaseState = await api('state');
      if (refreshed.session?.id !== state.session?.id) {
        drafts = blankDrafts();
        reportDraft = freshDraft();
        resetTalkView();
        panel = 'briefing';
        threadOpen = false;
        introVisible = true;
        station.resetPosition();
      }
      if (!receive(refreshed)) state = refreshed;
    } catch { /* Preserve local view on network failure. */ }
    return false;
  } finally { busy = false; render(); }
}

/** True from the escape mark until the escape animation ends; the old view stays on screen meanwhile. */
let escaping = false;
let pollTimer: ReturnType<typeof setInterval> | undefined;
let speakingUntil = 0;

function flicker(kind: 'warn' | 'blink', ms: number) {
  const el = document.createElement('div');
  el.className = 'factory-flicker';
  el.dataset.kind = kind;
  app.append(el);
  setTimeout(() => el.remove(), ms);
}

/** Takes a fresh server view when it announces the escape: closes the talk, blinks, runs the escape, then shows the report. Returns true when it took over. */
function receive(fresh: CaseState): boolean {
  const before = state.session?.alarm;
  // Only a closed game can be escaped; an open one past the mark (a request still in flight) stays on the last warning.
  if (fresh.session?.alarm === 'escaped' && fresh.session.status !== 'closed') fresh.session.alarm = 'warning2';
  const now = fresh.session?.alarm;
  if (fresh.session?.id !== state.session?.id || !now || before === now) return false;
  if (now === 'escaped') {
    if (escaping) return true;
    escaping = true;
    void runEscape(fresh);
    return true;
  }
  state = fresh;
  if (now === 'warning1' || now === 'warning2') flicker('warn', 900);
  return false;
}

async function runEscape(fresh: CaseState) {
  stopTalking();
  dialogueOpen = false;
  threadOpen = false;
  render();
  station.setEnabled(false);
  flicker('blink', 1600);
  const escaper = fresh.debrief?.findings.find(f => f.role === 'escaper')?.character;
  const sid = state.session?.id;
  try { if (escaper) await Promise.race([station.escape(escaper), new Promise(r => setTimeout(r, 3000))]); } catch { /* The report still shows. */ }
  escaping = false;
  if (state.session?.id !== sid) return; // Reset or case switch during the walk: keep the newer view.
  state = fresh;
  panel = 'report';
  dialogueOpen = true;
  render();
}

async function poll() {
  const session = state?.session;
  if (!session?.alarm || session.status !== 'active' || escaping || busy || document.visibilityState !== 'visible') return;
  try {
    const fresh: CaseState = await api('state');
    if (!receive(fresh) && fresh.session?.id === state.session?.id && fresh.session?.alarm) state.session!.alarm = fresh.session.alarm;
  } catch { /* Try again on the next beat. */ }
}

function detectiveSync() {
  const typing = document.activeElement?.id === 'question' && Boolean((document.activeElement as HTMLTextAreaElement).value.trim());
  const pose: Pose = Date.now() < speakingUntil ? 'speaking' : typing ? 'thinking' : 'listening';
  station?.detective(pose);
}

async function shell() {
  app.innerHTML = hudShell({ teamName, headline: state.copy.headline, topline: '' });
  worldKey = '';
  app.dataset.hud = 'on';
  const { createStation } = await import('./station');
  const { createRoundtable } = await import('./roundtable');
  const hint = (text: string) => { document.querySelector('#movement-hint')!.textContent = text; };
  station = createStage({
    station: () => createStation(location => void visit(location), hint, () => { if (!dialogueOpen) return; dialogueOpen = false; render(); }),
    roundtable: () => createRoundtable(id => void visit(id), hint),
    show(which) {
      document.querySelector<HTMLElement>('#station')!.hidden = which !== 'station';
      document.querySelector<HTMLElement>('#roundtable')!.hidden = which !== 'roundtable';
      app.dataset.stage = which;
      if (which === 'station') window.dispatchEvent(new Event('resize'));
    },
  });
  app.addEventListener('click', onClick);
  app.addEventListener('change', event => {
    const input = event.target as HTMLInputElement;
    if (input.name !== 'case') return;
    selectedCase = input.value;
    renderPreview();
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (document.querySelector('#case-switch, #reset-confirm, #team-switch, #leaderboard')) closeOverlay();
    else if (dialogueOpen) closeDialogue();
  });
  setInterval(tick, 1000);
  clearInterval(pollTimer);
  pollTimer = setInterval(() => void poll(), 3000);
  document.addEventListener('input', event => { if ((event.target as HTMLElement)?.id === 'question') detectiveSync(); });
  document.addEventListener('focusin', detectiveSync);
  document.addEventListener('focusout', () => setTimeout(detectiveSync, 0));
}

/** The session clock, in every `#elapsed` and `[data-elapsed]` element. */
function elapsedText(): string {
  if (!state?.session) return '0:00';
  const end = state.session.verdict?.submittedAt || new Date().toISOString();
  const seconds = Math.max(0, Math.floor((Date.parse(end) - Date.parse(state.session.startedAt)) / 1000));
  return mmss(seconds);
}

function tick() {
  if (!state?.session) return;
  const text = elapsedText();
  const hidden = Boolean(state.session.alarm);
  document.querySelectorAll<HTMLElement>('#elapsed, [data-elapsed]').forEach(el => { el.hidden = hidden; el.textContent = hidden ? '' : text; });
}

/** The parts of the page that belong to the case's world. Rebuilt only when the world or the cast changes. */
function renderWorld() {
  const key = `${world().id}:${ids().join(',')}:${state.evidence?.length ?? ''}:${state.talk ? 'q' : ''}`;
  if (key === worldKey) { syncNavText(); return; }
  worldKey = key;
  const w = world(), wt = w.text;
  app.dataset.world = w.id;
  document.querySelector('#world-name')!.textContent = wt.place;
  document.querySelector('#world-icon')!.innerHTML = svg(wt.icon);
  document.querySelector('#room-nav')!.setAttribute('aria-label', plain('main.nav.destinations', { eyebrow: cap(wt.eyebrow) }));
  document.querySelector<HTMLElement>('#room-nav')!.style.setProperty('--nav-n', String(state.characters.length + 1 + (state.evidence ? 1 : 0) + (state.talk ? 1 : 0)));
  document.querySelector('#room-nav')!.innerHTML = `
          ${state.characters.map(cardFor).join('')}${state.evidence ? evidenceButton() : ''}${state.talk ? quotesButton() : ''}`;
  station?.configure(w, state.characters);
  syncNavText();
}

const evidenceButton = () => `<button data-go="evidence" class="cast-card evidence-nav"><span class="cast-tile"><i class="evidence-icon"></i></span><span class="hud-stack cast-text"><b>${t('main.nav.evidence')}</b><small data-evidence-count>${evidenceCount()}</small></span></button>`;
const quotesButton = () => `<button data-go="quotes" class="cast-card evidence-nav quotes-nav"><span class="cast-tile"><i class="evidence-icon"></i></span><span class="hud-stack cast-text"><b>${t('main.nav.quotes')}</b><small data-quote-count>${quoteCount()}</small></span></button>`;
const quoteCount = () => String(state.session?.talk?.quotes.length ?? 0);
const evidenceCount = () => `${state.session?.evidence?.length ?? 0}/${state.evidence?.length ?? 0}`;

const cardFor = (c: Character) => {
  const asked = Boolean(state.session?.interviews[c.id]?.length);
  const talking = dialogueOpen && panel === c.id;
  return castCard({ id: c.id, name: c.name, part: c.role, faceClass: castClass(c.id), state: talking ? 'talking' : asked ? 'asked' : 'new', asked });
};

/** Part text and the talking, asked and new states change with every action, so the cards are updated in place (focus stays). */
function syncNavText() {
  const count = document.querySelector('#room-nav [data-evidence-count]');
  if (count && count.textContent !== evidenceCount()) count.textContent = evidenceCount();
  const quotes = document.querySelector('#room-nav [data-quote-count]');
  if (quotes && quotes.textContent !== quoteCount()) quotes.textContent = quoteCount();
  for (const c of state.characters) {
    const card = document.querySelector<HTMLElement>(`#room-nav [data-go="${CSS.escape(c.id)}"]`);
    if (!card) continue;
    const fresh = document.createElement('div');
    fresh.innerHTML = cardFor(c);
    const next = fresh.firstElementChild!;
    card.className = next.className;
    if (next.hasAttribute('aria-current')) card.setAttribute('aria-current', 'true'); else card.removeAttribute('aria-current');
    for (const sel of ['small', '[data-check]']) {
      const a = card.querySelector(sel), b = next.querySelector(sel);
      if (a && b && a.innerHTML !== b.innerHTML) a.innerHTML = b.innerHTML;
    }
  }
}

async function visit(location: LocationId) {
  if (busy || introVisible) return;
  stopTalking();
  threadOpen = false;
  // The Quotes page is client-only: nothing to tell the server.
  if (location === 'quotes') { panel = 'quotes'; evidenceFocus = null; dialogueOpen = true; render(); return; }
  const open = () => { panel = panelOf(location); evidenceFocus = isEvidence(location) ? evidenceIdOf(location) : null; dialogueOpen = true; render(); };
  if (state.session?.status === 'closed') { open(); return; }
  if (await action('visit', { location })) open();
}

/** Hides the conversation and, if focus was inside it, hands focus to the Notebook button so a keyboard user is not stranded on a hidden control. */
function closeDialogue() {
  dialogueOpen = false;
  render();
  const active = document.activeElement;
  if (!active || active === document.body || active.closest('.dossier, #panel')) document.querySelector<HTMLButtonElement>('#notebook-button')?.focus({ preventScroll: true });
}

function go(location: LocationId) {
  if (busy || !state.session) return;
  stopTalking();
  threadOpen = false;
  void visit(location);
}

async function onClick(event: MouseEvent) {
  if (state?.talk && await onTalkClick(event.target as HTMLElement)) return;
  const button = (event.target as HTMLElement).closest<HTMLElement>('button');
  if (!button || (button as HTMLButtonElement).disabled) return;
  if (button.id === 'continue-button') { void talk(); return; }
  if (button.id === 'notebook-button') { stopTalking(); if (state.session && !introVisible) { dialogueOpen = true; render(); } return; }
  if (button.id === 'dialogue-close' || button.id === 'lineup-back') { closeDialogue(); return; }
  // The thread lives in the notebook: open both, or a closed notebook keeps it hidden.
  if (button.id === 'read-thread') { stopTalking(); threadOpen = true; dialogueOpen = true; render(); return; }
  if (button.id === 'inspect-button') {
    stopTalking();
    if (!ids().includes(panel)) return;
    if (state.session?.inspectable[panel]) await action('inspect', { character: panel });
    else { noThought.add(lineKey(panel)); threadOpen = false; dialogueOpen = true; render(); }
    return;
  }
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
    dialogueOpen = true;
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
  if (saved !== undefined && state.evidence && isEvidence(saved)) { evidenceFocus = evidenceIdOf(saved); return 'evidence'; }
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
    resetTalkView();
    panel = 'briefing'; threadOpen = false; introVisible = false; dialogueOpen = true;
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

/** Walking is on only with a session, outside the intro, the lineup and the debrief, and with no overlay open. */
function syncWalking() {
  const session = state?.session;
  const mapView = app.dataset.view !== 'lineup';
  const overlay = document.querySelector('#case-switch, #reset-confirm, #team-switch, #leaderboard');
  station?.setEnabled(Boolean(session && !escaping && !introVisible && !busy && mapView && !overlay));
  station?.setCovered(!mapView || introVisible || !!document.querySelector('#case-switch, #reset-confirm, #team-switch, #leaderboard'));
}

function render() {
  if (!state || !document.querySelector('#panel')) return;
  const session = state.session;
  if (!session) { panel = 'briefing'; introVisible = true; }
  if (session?.status === 'closed') markSolved(session.caseId);
  renderWorld();
  document.querySelector('#case-headline')!.textContent = state.copy.headline;
  document.title = plain('main.docTitle', { title: state.title });
  document.querySelector('#case-eyebrow')!.innerHTML = `${t('main.case')} ${caseNumber(state.order)} <span class="slash">/</span> ${escape(world().text.eyebrow)}`;
  document.querySelector('#mode-badge')!.textContent = plain(state.mode === 'live' ? 'main.mode.live' : 'main.mode.rehearsal');
  document.querySelector('#mode-badge')!.classList.toggle('rehearsal', state.mode === 'rehearsal');
  const heard = session ? ids().filter(id => session.interviews[id].length).length : 0;
  const verdictTitle = document.querySelector('.verdict-button b');
  if (state.talk && verdictTitle && session?.status !== 'closed') {
    const label = talkVerdictLabel(session?.talk?.quotes.length ?? 0);
    verdictTitle.textContent = label.title;
    document.querySelector('#quick-progress')!.textContent = label.progress;
  } else {
    if (verdictTitle) verdictTitle.textContent = plain('hud.verdict');
    document.querySelector('#quick-progress')!.textContent = session?.status === 'closed' ? plain('main.progress.closed') : plain('main.progress.asked', { heard, total: state.characters.length });
  }
  document.querySelectorAll<HTMLButtonElement>('[data-go]').forEach(button => {
    button.disabled = busy || !session || introVisible;
    button.classList.toggle('active', button.dataset.go === panel);
  });
  if (state.evidence) station?.evidence(state.evidence.map(e => ({ id: e.id, title: e.title, examined: Boolean(session?.examined?.includes(e.id)) })));
  renderTools();
  (document.querySelector('#export-button') as HTMLButtonElement).disabled = !session || busy;
  (document.querySelector('#reset-button') as HTMLButtonElement).disabled = !session || busy;
  (document.querySelector('#restart-button') as HTMLButtonElement).disabled = !session || busy;
  const toast = document.querySelector<HTMLElement>('#toast')!;
  toast.hidden = !errorMessage;
  toast.textContent = errorMessage;
  const lineup = Boolean(session && !state.talk && session.status === 'active' && panel === 'report' && dialogueOpen && !introVisible && heard === state.characters.length && !threadOpen);
  const wasOpen = app.dataset.dialogue === 'open';
  app.dataset.dialogue = dialogueOpen && !introVisible ? 'open' : 'closed';
  const debrief = Boolean(session?.status === 'closed' && panel === 'report' && !introVisible && !threadOpen);
  app.dataset.view = lineup || debrief ? 'lineup' : 'world';
  syncWalking();
  station?.focus(dialogueOpen && !introVisible && ids().includes(panel) ? panel : null);
  const target = document.querySelector<HTMLElement>('#panel')!;
  const sections: Record<string, string> = { briefing: plain('hud.briefing'), ...Object.fromEntries(state.characters.map(c => [c.id, plain('main.section.chat', { name: c.name })])), evidence: plain('main.nav.evidence'), quotes: plain('main.nav.quotes'), report: plain(session?.status === 'closed' ? 'main.section.solved' : 'main.section.guess') };
  document.querySelector('#notebook-section')!.textContent = threadOpen ? plain('main.section.thread') : sections[panel];
  let markup: string;
  if (threadOpen && session) markup = threadPanel(session.thread, Object.fromEntries(state.characters.map(c => [c.id, c.name])), session.chatter.pending, world().text.threadNote, Object.fromEntries(state.characters.map(c => [c.id, castClass(c.id)])));
  else if (session?.status === 'closed' && panel === 'report') markup = debriefMarkup();
  else if (panel === 'briefing') markup = briefing();
  else if (panel === 'quotes' && state.talk) markup = quotesPanel(session?.talk?.quotes ?? [], state.characters);
  else if (panel === 'report') markup = reportPanel();
  else if (panel === 'evidence') markup = evidencePanel(session?.evidence ?? [], evidenceFocus, state.evidence?.length ?? 0);
  else markup = interviewMarkup(panel);
  const rendered = renderNotebook(target, markup, `${session?.id}:${panel}:${session?.status}${threadOpen ? ':thread' : ''}`, panel, Object.keys(sections));
  if (rendered) bindForms();
  // The thread is a capped strip under the room: after a new post, show the newest one rather than #1.
  // Only boxes inside the notebook scroll; scrollIntoView would also move the page in the compact layout.
  if (rendered && threadOpen) {
    for (let box = target.querySelector<HTMLElement>('#thread-log'); box && box !== target.parentElement; box = box.parentElement) {
      if (box.scrollHeight > box.clientHeight) box.scrollTop = box.scrollHeight;
    }
  }
  // A box that was hidden loses its scroll position: show the newest turn when it opens.
  const log = target.querySelector<HTMLElement>('#transcript');
  if (log && dialogueOpen && !wasOpen) log.scrollTop = log.scrollHeight;
  tick();
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
  const status = (row: CaseRow) => state.session?.status === 'active' && state.session.caseId === row.id ? ['playing', t('main.status.playing')] : solved.has(row.id) ? ['solved', t('main.status.solved')] : ['new', t('main.status.new')];
  const list = catalog.length < 2 ? '' : `<fieldset class="case-picker" id="case-list"><legend><span class="eyebrow">${t('main.board.eyebrow')}</span><b>${tn('main.board.count', catalog.length)}</b></legend>
    ${catalog.map(row => { const [key, label] = status(row); return `<label class="case-option"><input type="radio" name="case" value="${escape(row.id)}" ${row.id === selectedCase ? 'checked' : ''}><span class="case-number">${caseNumber(row.order)}</span><span class="case-text"><b class="case-title">${escape(row.title)}</b><small class="case-lead">${escape(row.lead)}</small></span><span class="case-chip ${key}">${key === 'solved' ? icon('check') : ''}${label}</span></label>`; }).join('')}</fieldset>`;
  return `<div class="modal-shade" id="${id}"><section class="case-board" role="dialog" aria-modal="true" aria-labelledby="intro-title">${list}<div class="intro-card" id="case-preview">${casePreview(id)}</div></section></div>`;
}

function casePreview(id: 'intro' | 'case-switch') {
  const row = catalog.find(r => r.id === selectedCase);
  const pw = worldFor(row?.world ?? state.world?.id);
  const loaded = !row || row.id === state.caseId;
  const active = state.session?.status === 'active';
  const title = row ? row.title : state.title;
  const label = t(busy ? 'main.preview.opening' : !state.session ? 'main.preview.investigate' : !loaded ? 'main.preview.start' : id === 'intro' ? 'main.preview.continue' : active ? 'main.preview.restart' : 'main.preview.again');
  const primary = `<button class="primary-button" id="${id === 'intro' ? 'begin-button' : 'confirm-reset'}" ${busy ? 'disabled' : ''}>${label} ${icon('arrow')}</button>`;
  // The picked case's own personas (the catalog carries them), so the preview never shows the loaded case's cast.
  const cast = row?.cast ?? state.characters;
  const note = active && (id === 'case-switch' || !loaded) ? t(loaded ? 'main.preview.noteRestarting' : 'main.preview.noteStarting') : '';
  return `<div class="intro-stamp">${t('main.case')} ${caseNumber(row ? row.order : state.order)} <span>${t('hud.authored')}</span></div>
    <div class="monkey-line" data-world="${escape(row?.world || state.world?.id || 'grove')}" aria-hidden="true">${cast.map((c, i) => `<i class="monkey-face ${escape(c.id)} slot-${i}"></i>`).join('')}</div>
    <span class="eyebrow">${t('main.preview.eyebrow')}</span><h2 id="intro-title">${escape(title).replace(/ (\S+)$/, '<br>$1')}<span>.</span></h2>
    <p class="intro-lead">${escape(row ? row.lead : state.copy.intro.lead).replace(/\n/g, '<br>')}</p>
    <p id="intro-body" ${loaded ? '' : 'hidden'}>${escape(state.copy.intro.body)}</p>
    <div class="intro-flow"><span>01 <b>${t('main.preview.flowAsk', { n: cast.length, many: pw.text.many })}</b></span><span>02 <b>${t('main.preview.flowChoose')}</b></span></div>
    ${id === 'intro' ? primary : `<div class="reset-actions"><button class="secondary-button" id="cancel-reset">${t('main.preview.keep')}</button>${primary}</div>`}
    <p class="fine-print">${note || t('main.fine', { many: pw.text.many, mode: plain(state.mode === 'rehearsal' ? 'main.fine.scripted' : 'main.fine.live') })}</p>`;
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

function interviewMarkup(characterId: string) {
  const character = state.characters.find(c => c.id === characterId)!;
  const session = state.session;
  const economy = session?.economy;
  const askBlock = economy ? toolsBlock(economy, ['ask'], reserveFor(characterId)) : { enabled: true, reason: null };
  return interviewPanel({
    character, turns: session?.interviews[characterId] || [], inspections: (session?.inspections || []).filter(n => n.character === characterId),
    noThought: noThought.has(lineKey(characterId)), faceClass: castClass(characterId), closed: session?.status === 'closed', busy, draft: drafts[characterId],
    waitingOn: pendingCharacter === characterId && busy ? characterId : null,
    ...(state.talk ? { talk: { topics: state.talk.topics, asked: session?.talk?.asked[characterId] ?? [], pick: pick && lineOf(characterId, pick.line) ? pick : null } } : {}),
    next: state.characters.find(c => c.id !== characterId && !session?.interviews[c.id].length) || null,
    askLabel: economy ? toolChip(economy, 'ask') : null, askOff: askBlock.reason, hint: HINTS.ask, many: world().text.many,
  });
}

/** Empty when every character has a role, else the disabled submit text. */
function submitHint(): string {
  const missing = state.characters.find(c => !reportDraft.roles[c.id]);
  return missing ? plain('main.pickRole', { name: missing.name }) : '';
}

/** The turn with this id in a character's chat. */
const lineOf = (characterId: string, id: string) => state.session?.interviews[characterId]?.find(t => t.id === id);

/** The briefing page; a talk case swaps the stock steps for its own three. */
function briefing(): string {
  return briefingPanel({ copy: state.copy, cast: state.characters.length, many: world().text.many, one: world().text.one, oneWithArticle: world().text.oneWithArticle, firstId: state.characters[0]?.id, firstName: state.characters[0]?.name, guide: state.session && !state.talk ? toolGuide(state.session.economy) : '', ...(world().scene === 'roundtable' ? { verdict: state.copy.report.description, howTo: world().text.hint } : {}), ...(state.talk ? { steps: talkBriefingList() } : {}) });
}

function reportPanel() {
  const session = state.session!;
  if (state.talk) return accusePanel({
    characters: state.characters.map(c => ({ id: c.id, name: c.name, role: c.role })),
    quotes: session.talk?.quotes ?? [], accusations: session.talk?.accusations ?? [], draft: accuseDraft,
    copy: { title: state.copy.report.title, description: state.copy.report.description }, busy,
  });
  const remaining = state.characters.filter(c => !session.interviews[c.id].length);
  if (remaining.length) return `${heading(t('main.report.eyebrow'), t('main.report.title'), t('main.report.desc', { one: world().text.one }))}
    <div class="notebook-content"><div class="requirements">${state.characters.map(c => `<button data-go="${escape(c.id)}"><span>${session.interviews[c.id].length ? icon('check') : icon('person')} ${t('main.report.ask', { name: c.name })}</span>${icon('arrow')}</button>`).join('')}</div></div>`;
  return lineupPanel({
    title: state.title, noun: world().text.one, time: elapsedText(), spent: session.economy.spent, roles: state.roles,
    cast: state.characters.map(c => ({ id: c.id, name: c.name, part: c.role, faceClass: castClass(c.id) })),
    heading: state.copy.report, picks: reportDraft.roles, confidence: reportDraft.confidence, explanation: reportDraft.explanation, busy, hint: submitHint(),
  });
}

/** The reveal, slips and wrong-accusation count of a talk case, with the traveller's name and part from the cast. */
function revealOf() {
  const d = state.debrief;
  if (!d?.reveal) return {};
  const who = state.characters.find(c => c.id === d.reveal!.character);
  return { reveal: { ...d.reveal, name: who?.name ?? d.reveal.character, role: who?.role ?? '' }, slips: d.slips ?? [], wrong: d.wrong ?? 0 };
}

function debriefMarkup() {
  const session = state.session!;
  const { economy } = session;
  const next = nextCase();
  return debriefPage({
    title: state.title, debrief: state.debrief!, roles: state.roles,
    cast: state.characters.map(c => ({ id: c.id, name: c.name, part: c.role, faceClass: castClass(c.id) })),
    time: session.alarm ? null : elapsedText(), spent: economy.spent, budget: economy.budget,
    questions: Object.values(session.interviews).reduce((sum, turns) => sum + turns.length, 0),
    inspections: economy.charges.inspect.used, talks: economy.charges.continue.used,
    next: next ? { id: next.id, title: next.title } : null, many: world().text.many,
    ...revealOf(),
  });
}

/** Coins to keep back so the player can still ask everyone once, not counting the action's own target. */
function reserveFor(target: string | null): number {
  const session = state.session;
  if (!session || state.talk) return 0;
  return session.economy.costs.ask * state.characters.filter(c => c.id !== target && !session.interviews[c.id].length).length;
}

/** The coin counter and the bottom-line controls under the world. Rewritten only when their markup changes. */
let toolsMarkup = '';
function renderTools() {
  const session = state.session;
  const counter = document.querySelector<HTMLElement>('#coin-counter')!;
  const active = Boolean(session && !introVisible);
  counter.hidden = !active;
  const tip = document.querySelector<HTMLElement>('#coin-tip');
  if (tip) tip.textContent = coinHint(Boolean(state.talk));
  if (session) {
    const { budget, spent } = session.economy;
    counter.innerHTML = budget == null ? `<span class="coin-num">${spent}</span><span class="hud-label">${t('main.coins.spent')}</span>` : `<span class="coin-num">${budget - spent} / ${budget}</span><span class="hud-label">${t('main.coins.left')}</span>`;
  }
  let markup = '';
  if (session && active) {
    const { economy, chatter } = session;
    const open = session.status === 'active';
    // Inspect acts on the character whose chat is open, once they have spoken.
    const character = state.characters.find(c => c.id === panel);
    const spoken = Boolean(character && session.interviews[character.id].length);
    const inspect = toolBlock(economy, 'inspect', reserveFor(null));
    const inspectOff = state.tools?.inspect === false ? notInCase() : inspect.reason || (!character ? plain('main.inspect.open', { one: world().text.oneWithArticle }) : !spoken ? plain('main.inspect.notSpoken', { name: character.name }) : null);
    const block = toolBlock(economy, 'continue', reserveFor(null));
    const talkOff = state.tools?.talk === false;
    const can = open && !talkOff && (chatter.pending > 0 || block.enabled);
    const heardAll = ids().every(id => session.interviews[id].length);
    markup = toolCard({
      tool: 'inspect', id: 'inspect-button', label: plain('tools.inspect'), target: inspectOff ? '' : character!.name,
      chip: inspectOff || toolChip(economy, 'inspect'), enabled: open && !inspectOff, busy, fresh: open && !inspectOff && !session.inspections.length,
    }) + toolCard({
      tool: 'continue', id: 'continue-button', label: talking ? plain('main.listening') : chatter.pending > 0 ? plain('main.keepListening', { n: chatter.pending }) : plain('tools.talk'), target: '',
      chip: talkOff ? notInCase() : chatter.pending > 0 ? plain('main.free') : block.reason || toolChip(economy, 'continue'), enabled: can, busy: busy || talking,
      fresh: can && !talking && heardAll && chatter.pending === 0 && economy.charges.continue.used === 0,
      extra: talkOff ? '' : `<button class="thread-button" id="read-thread" type="button" ${busy ? 'disabled' : ''}>${t('main.readThread')}</button>`,
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
  dialogueOpen = true;
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

/** One path for every way of asking: a topic button, a follow-up about picked words, or typed text. */
async function askQuestion(how: { topic?: string; about?: { line: string; text: string } } = {}) {
  if (busy || escaping || !ids().includes(panel)) return;
  const character: string = panel;
  stopTalking();
  pendingCharacter = character;
  station.think(character);
  speakingUntil = Date.now() + 1200;
  detectiveSync();
  setTimeout(detectiveSync, 1250);
  const body = how.topic ? { character, topic: how.topic } : how.about ? { character, about: how.about } : { character, question: drafts[character] };
  const asked = await action('interview', body, () => { if (!how.topic && !how.about) drafts[character] = ''; if (how.about) { pick = null; pickClicks = 0; } });
  station.think(null);
  if (asked) {
    const turns = state.session?.interviews[character];
    const answer = turns?.[turns.length - 1]?.answer;
    if (answer) station.speak(character, answer, how.topic);
  }
  pendingCharacter = null;
  document.querySelector<HTMLTextAreaElement>('#question')?.focus({ preventScroll: true });
}

/** Saves the picked words (or the whole line) to the quotes. */
async function saveQuote(line: string) {
  const turn = lineOf(panel, line);
  const range = pick && pick.line === line && pick.a !== null && pick.b !== null ? pick : null;
  const text = turn && range ? excerptOf(turn.answer, range.a!, range.b!) : undefined;
  await action('quote', text ? { line, text } : { line }, () => { pick = null; pickClicks = 0; });
}

/** A click on one of the talk hooks; true when it was one. */
async function onTalkClick(target: HTMLElement): Promise<boolean> {
  const hook = target.closest<HTMLElement>('[data-topic],[data-pick-line],[data-word],[data-pick-cancel],[data-save-quote],[data-ask-about],[data-unquote],#accuse-submit,#accuse-back');
  if (!hook) return false;
  if ((hook as HTMLButtonElement).disabled) return true;
  stopTalking();
  const d = hook.dataset;
  if (hook.id === 'accuse-back') { closeDialogue(); return true; }
  if (hook.id === 'accuse-submit') {
    const cited = liveDraftQuotes(accuseDraft, state.session?.talk?.quotes ?? []);
    if (accuseDraft.character && cited.length) await action('accuse', { character: accuseDraft.character, quotes: cited });
    return true;
  }
  if (d.topic !== undefined) { await askQuestion({ topic: d.topic }); return true; }
  if (d.pickLine !== undefined) { pick = { line: d.pickLine, a: null, b: null }; pickClicks = 0; render(); return true; }
  if (d.word !== undefined) {
    const i = Number(d.word);
    const line = d.line ?? pick?.line;
    if (line === undefined || !Number.isInteger(i)) return true;
    if (!pick || pick.line !== line || pickClicks === 0 || pickClicks >= 2) { pick = { line, a: i, b: i }; pickClicks = 1; }
    else { pick = { line, a: Math.min(pick.a!, i), b: Math.max(pick.a!, i) }; pickClicks = 2; }
    render();
    return true;
  }
  if (d.pickCancel !== undefined) { pick = null; pickClicks = 0; render(); return true; }
  if (d.saveQuote !== undefined) { const line = d.saveQuote || d.line || pick?.line; if (line) await saveQuote(line); return true; }
  if (d.askAbout !== undefined) {
    const line = pick?.line, turn = line ? lineOf(panel, line) : undefined;
    if (line && turn && pick!.a !== null && pick!.b !== null) await askQuestion({ about: { line, text: excerptOf(turn.answer, pick!.a, pick!.b) } });
    return true;
  }
  if (d.unquote !== undefined) { accuseDraft.quotes = accuseDraft.quotes.filter(q => q !== d.unquote); await action('unquote', { quote: d.unquote }); return true; }
  return false;
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
  document.querySelectorAll<HTMLInputElement>('input[name="accuse-character"]').forEach(input => input.addEventListener('change', () => {
    if (accuseDraft.character !== input.value) accuseDraft = { character: input.value, quotes: [] };
    render();
  }));
  document.querySelectorAll<HTMLInputElement>('input[name="accuse-quote"]').forEach(input => input.addEventListener('change', () => {
    accuseDraft.quotes = input.checked ? [...new Set([...accuseDraft.quotes, input.value])] : accuseDraft.quotes.filter(q => q !== input.value);
    render();
  }));
  if (document.querySelector('#report-form')) {
    document.querySelectorAll<HTMLInputElement>('.role-chip input').forEach(input => input.addEventListener('change', () => {
      reportDraft.roles[input.name.slice('role-'.length)] = input.value;
      const hint = submitHint();
      const button = document.querySelector<HTMLButtonElement>('#lock-in')!;
      button.disabled = busy || !!hint;
      // Same markup lineupPanel renders: the label, plus the count while picks are missing. The hint text never goes in the button.
      const picked = state.characters.filter(c => reportDraft.roles[c.id]).length;
      button.innerHTML = `${t('main.lockIn')}${hint ? `<small class="lock-count">${t('main.lockCount', { picked, total: state.characters.length })}</small>` : ''}`;
    }));
    document.querySelectorAll<HTMLInputElement>('input[name="confidence"]').forEach(input => input.addEventListener('change', () => { reportDraft.confidence = Number(input.value); }));
    document.querySelector('#explanation')!.addEventListener('input', event => { reportDraft.explanation = (event.target as HTMLTextAreaElement).value; });
    document.querySelector('#report-form')!.addEventListener('submit', async event => { event.preventDefault(); if (!submitHint()) { stopTalking(); await action('verdict', reportDraft); } });
  }
}

function showCases() {
  selectedCase = state.caseId;
  document.querySelector('#overlay-root')!.innerHTML = caseBoard('case-switch');
  syncWalking();
  const current = document.querySelector<HTMLInputElement>('#case-list input:checked');
  current?.scrollIntoView({ block: 'nearest' });
  (current || document.querySelector<HTMLButtonElement>('#cancel-reset'))!.focus({ preventScroll: true });
  document.querySelector('#case-switch')!.addEventListener('click', event => { if (event.target === event.currentTarget) closeOverlay(); });
  applyTheme();
}

/** Asks before starting the current case over. The old session's records stay on the server. */
function showRestart() {
  document.querySelector('#overlay-root')!.innerHTML = `<div class="modal-shade" id="reset-confirm"><section class="reset-card" role="dialog" aria-modal="true" aria-labelledby="reset-title"><span class="eyebrow">${t('main.reset.eyebrow')}</span><h2 id="reset-title">${t('main.reset.title', { title: state.title })}</h2><p>${t('main.reset.body', { many: world().text.many })}</p><div class="reset-actions"><button class="secondary-button" id="cancel-restart">${t('main.preview.keep')}</button><button class="primary-button" id="confirm-restart">${t('hud.restart')} ${icon('reset')}</button></div></section></div>`;
  syncWalking();
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
  syncWalking();
  applyTheme();
  document.querySelector<HTMLButtonElement>(opener)?.focus({ preventScroll: true });
}

/** Runs `draw` now and every 10 s; returns the timer so the caller can stop it. */
function pollLeaderboard(draw: () => Promise<void>): ReturnType<typeof setInterval> {
  void draw();
  return setInterval(() => void draw(), 10000);
}

function stopLeaderboardPoll() { if (leaderboardTimer) clearInterval(leaderboardTimer); leaderboardTimer = undefined; }

/** The leaderboard overlay: fetched on open and every 10 s until it closes. */
function showLeaderboard(opener: string) {
  stopLeaderboardPoll();
  leaderboardOpener = opener;
  document.querySelector('#overlay-root')!.innerHTML = `<div class="modal-shade" id="leaderboard"><section class="reset-card board-card" role="dialog" aria-modal="true" aria-labelledby="board-title"><span class="eyebrow" id="board-title">${t('main.lb.eyebrow')}</span><div id="leaderboard-body"><p class="board-empty">${t('main.lb.loading')}</p></div><div class="reset-actions"><button class="secondary-button" id="leaderboard-close">${t('main.lb.close')}</button></div></section></div>`;
  syncWalking();
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
      document.querySelector('#leaderboard-body')!.innerHTML = `<p class="board-empty">${t('main.lb.error')}</p>`;
    }
  };
  leaderboardTimer = pollLeaderboard(load);
}

/** POST /api/team with the body kept on errors, so a 409 can name the team that is taken. */
async function postTeam(name: string, join: boolean): Promise<{ ok: true } | { ok: false; error: string; taken: string | null }> {
  try {
    const { ok, status, data: body } = await apiRaw('team', join ? { name, join: true } : { name });
    if (ok) return { ok: true };
    const data = body ?? {};
    return { ok: false, error: status === 409 ? '' : String(data.error || failed()), taken: status === 409 && typeof data.taken === 'string' ? data.taken : null };
  } catch { return { ok: false, error: plain('main.unreachable'), taken: null }; }
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
  const root = document.querySelector('#overlay-root')!;
  root.innerHTML = '<div class="modal-shade" id="team-switch"></div>';
  syncWalking();
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
/** The sponsor intro is checked once per page load; boot() runs again after the access code and the check-in. */
let splashChecked = false;

async function boot() {
  try {
    await loadText();
    if (!splashChecked) {
      splashChecked = true;
      if (wantSplash(new URLSearchParams(location.search), splashSeen())) { await playSplash(app); markSplashSeen(); }
    }
    const access = await api('access');
    if (!access.authorized) {
      app.innerHTML = `<div class="access-screen"><form id="access-form" class="reset-card"><span class="eyebrow">${t('main.access.eyebrow')}</span><h1>${t('main.access.title')}</h1><p>${t('main.access.body')}</p><label for="access-code">${t('main.access.label')}</label><input type="password" id="access-code" required autocomplete="current-password"><p id="access-error" role="alert"></p><button class="primary-button">${t('main.access.open')} ${icon('arrow')}</button></form></div>`;
      document.querySelector('#access-form')!.addEventListener('submit', async event => {
        event.preventDefault();
        try { await api('access', { code: (document.querySelector('#access-code') as HTMLInputElement).value }); await boot(); }
        catch (error) { document.querySelector('#access-error')!.textContent = (error as Error).message; }
      });
      return;
    }
    if (new URLSearchParams(location.search).get('view') === 'board') { await bootBoard(); return; }
    stopHeartbeat ??= startHeartbeat(document, postHeartbeat, 30000);
    const mine = (await api('team')).team as { name: string } | null;
    if (!mine) {
      app.innerHTML = '<div class="access-screen"></div>';
      mountGate(app.querySelector<HTMLElement>('.access-screen')!, false, () => void boot());
      return;
    }
    teamName = mine.name;
    const [loaded, listed] = await Promise.all([api('state'), api('cases').catch(() => null)]);
    state = loaded;
    catalog = Array.isArray(listed?.cases) ? (listed.cases as CaseRow[]).sort((a, b) => a.order - b.order) : [];
    const wanted = new URLSearchParams(location.search).get('case');
    selectedCase = catalog.find(row => row.id === wanted)?.id || (state.session ? state.caseId : catalog[0]?.id) || '';
    drafts = blankDrafts();
    await shell();
    render();
  } catch {
    app.innerHTML = `<div class="access-screen"><div class="reset-card"><span class="eyebrow">${t('main.offline.eyebrow')}</span><h1>${t('main.offline.title')}</h1><p>${t('main.offline.body')}</p><button class="primary-button" onclick="location.reload()">${t('main.offline.retry')}</button></div></div>`;
  }
}

/** The projector screen: no heartbeat, no team. Fetches the standings and refreshes them every 10 s. */
async function bootBoard() {
  app.dataset.view = 'board';
  document.title = plain('main.lb.docTitle');
  const draw = async () => {
    try { app.innerHTML = boardScreen(await api('leaderboard')); }
    catch {
      const screen = app.querySelector('.board-screen');
      if (!screen) app.innerHTML = `<div class="board-screen"><p class="board-empty">${t('main.lb.error')}</p></div>`;
      else if (!screen.querySelector('.board-stale')) screen.insertAdjacentHTML('beforeend', `<p class="board-stale board-empty" role="status">${t('main.lb.stale')}</p>`);
    }
  };
  const timer = pollLeaderboard(draw);
  addEventListener('pagehide', () => clearInterval(timer), { once: true });
}

void boot();
