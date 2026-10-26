import './style.css';
import './pixel.css';
import './notebook.css';
import './banana.css';
import { renderNotebook } from './notebook';
import { createStation, type Station } from './station';
import type { CaseState, CharacterId, Evidence, LocationId } from './types';

const app = document.querySelector<HTMLDivElement>('#app')!;
const ids: CharacterId[] = ['momo', 'pip', 'nori'];
let state: CaseState;
let station: Station;
let panel: LocationId = 'briefing';
let busy = false;
let pendingCharacter: CharacterId | null = null;
let introVisible = true;
let skipWalking = matchMedia('(prefers-reduced-motion: reduce)').matches;
let errorMessage = '';
let drafts: Record<CharacterId, string> = { momo: '', pip: '', nori: '' };
let reportDraft = { suspect: '', confidence: 70, explanation: '', evidenceIds: [] as string[] };

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const icon = (name: string) => {
  const paths: Record<string, string> = {
    arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
    banana: '<path d="M5 4c-2 8 5 16 14 14-6 5-15 1-16-6C2 8 3 5 5 4zm0 0 2-1"/>',
    replay: '<rect x="4" y="4" width="16" height="12" rx="2"/><path d="m10 8 5 2-5 3zm-2 12h8m-4-4v4"/>',
    evidence: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h4v4H7zm7 0h3m-3 4h3M7 16h10"/>',
    report: '<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h7m-7 4h7"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    person: '<circle cx="12" cy="8" r="3"/><path d="M5 21v-3a7 7 0 0 1 14 0v3"/>',
    reset: '<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/>',
  };
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.person}</svg>`;
};

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
        drafts = { momo: '', pip: '', nori: '' };
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
      <a class="wordmark" href="/" aria-label="Banana Mystery home"><span class="banana-mark">${icon('banana')}</span><span>BANANA MYSTERY<small>THE OVERRIDE · AGENTVERSE</small></span></a>
      <div class="top-meta"><span class="authored-label">AUTHORED DEMONSTRATION</span><span id="mode-badge" class="mode-badge"></span></div>
      <button class="quiet-button" id="reset-button" title="Start a fresh session">${icon('reset')}<span>New case</span></button>
    </header>
    <main class="workspace">
      <section class="world-column" aria-label="Banana Grove">
        <div class="world-heading"><div><span class="eyebrow">CASE 001 <span class="slash">/</span> BANANA GROVE</span><h1>Who took the bananas?</h1></div><span class="case-status" id="case-status">AWAITING INVESTIGATOR</span></div>
        <div class="station-frame"><div class="station-topline"><span><i class="live-dot"></i> BANANA GROVE / PICNIC DAY</span><span id="elapsed">00:00</span></div><div id="station"></div><div class="station-bottomline"><span id="movement-hint">WASD / ARROWS to walk · E to interact</span><span class="floor-label">2–3 MINUTE MYSTERY</span></div></div>
        <nav class="room-nav" aria-label="Grove destinations">
          <button data-go="replay">${icon('replay')}<span>Basket<small id="replay-count">Find 3 clues</small></span></button>
          <button data-go="momo"><i class="avatar-dot momo"></i><span>Momo<small>The planner</small></span><span class="interview-check" data-check="momo"></span></button>
          <button data-go="pip"><i class="avatar-dot pip"></i><span>Pip<small>The carrier</small></span><span class="interview-check" data-check="pip"></span></button>
          <button data-go="nori"><i class="avatar-dot nori"></i><span>Nori<small>The lookout</small></span><span class="interview-check" data-check="nori"></span></button>
          <button data-go="evidence">${icon('evidence')}<span>Clues<small id="evidence-count">0 / 3 found</small></span></button>
          <button data-go="report">${icon('report')}<span>Your guess<small>Who knew?</small></span></button>
        </nav>
        <div class="world-footer"><span><span id="quick-progress">Find the clues → Ask 3 monkeys → Choose</span></span><label class="skip-walk"><input id="skip-walking" type="checkbox" ${skipWalking ? 'checked' : ''}> Skip walking</label></div>
      </section>
      <aside class="dossier" aria-label="Investigation notebook"><div class="dossier-top"><div class="notebook-label"><span class="eyebrow">INVESTIGATOR’S NOTEBOOK</span><span id="notebook-section">Case briefing</span></div><span class="notebook-index" id="notebook-index" aria-hidden="true">01 / 07</span><button class="icon-button" data-go="briefing" aria-label="View briefing">${icon('report')}</button></div><div id="panel"></div></aside>
    </main>
    <footer class="app-footer"><span>AGENTVERSE <span class="slash">/</span> BANANA MYSTERY</span><span>Authored demo · 2–3 minutes · Your own case</span><button id="export-button">Export session ${icon('arrow')}</button></footer>
    <div id="toast" role="alert" hidden></div>
    <div id="overlay-root"></div>
  `;
  station = createStation(location => void visit(location), hint => { document.querySelector('#movement-hint')!.textContent = hint; });
  app.addEventListener('click', onClick);
  document.querySelector('#skip-walking')!.addEventListener('change', event => { skipWalking = (event.target as HTMLInputElement).checked; });
  setInterval(() => {
    const elapsed = document.querySelector('#elapsed');
    if (!elapsed || !state?.session) return;
    const end = state.session.verdict?.submittedAt || new Date().toISOString();
    const seconds = Math.max(0, Math.floor((Date.parse(end) - Date.parse(state.session.startedAt)) / 1000));
    elapsed.textContent = `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  }, 1000);
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
  if (button.dataset.quickQuestion && ids.includes(panel as CharacterId)) {
    drafts[panel as CharacterId] = button.dataset.quickQuestion;
    await askQuestion();
    return;
  }
  if (button.id === 'begin-button') {
    if (!state.session && !(await action('start'))) return;
    introVisible = false;
    panel = state.session?.status === 'closed' ? 'report' : state.session?.location || 'briefing';
    render();
  }
  if (button.id === 'reveal-button') await action('reveal');
  if (button.id === 'clear-evidence') await action('evidence', { evidenceId: null });
  if (button.id === 'reset-button' || button.id === 'debrief-reset') showReset();
  if (button.id === 'cancel-reset') { document.querySelector('#overlay-root')!.innerHTML = ''; station.setEnabled(true); }
  if (button.id === 'confirm-reset') {
    if (await action('reset')) {
      drafts = { momo: '', pip: '', nori: '' };
      reportDraft = { suspect: '', confidence: 70, explanation: '', evidenceIds: [] };
      panel = 'briefing'; station.resetPosition(); introVisible = false;
      document.querySelector('#overlay-root')!.innerHTML = ''; render();
    }
  }
  if (button.id === 'export-button' || button.id === 'debrief-export') window.location.assign('/api/events');
}

function render() {
  if (!state || !document.querySelector('#panel')) return;
  const session = state.session;
  if (!session) { panel = 'briefing'; introVisible = true; }
  document.querySelector('#mode-badge')!.textContent = state.mode === 'live' ? 'LIVE INTERVIEWS' : 'SCRIPTED REHEARSAL';
  document.querySelector('#mode-badge')!.classList.toggle('rehearsal', state.mode === 'rehearsal');
  document.querySelector('#case-status')!.textContent = !session ? 'AWAITING INVESTIGATOR' : session.status === 'closed' ? 'CASE CLOSED' : 'INVESTIGATION OPEN';
  document.querySelector('#replay-count')!.textContent = session?.revealedPosition ? '3 clues found' : 'Find 3 clues';
  document.querySelector('#evidence-count')!.textContent = `${state.records.length} / 3 found`;
  const heard = session ? ids.filter(id => session.interviews[id].length).length : 0;
  document.querySelector('#quick-progress')!.textContent = session?.status === 'closed' ? 'Mystery solved · Play again for a new case' : !session?.revealedPosition ? '1. Inspect the basket to find 3 clues' : heard < 3 ? `2. Ask the monkeys · ${heard} / 3 heard` : '3. Ready to make your guess';
  document.querySelectorAll<HTMLButtonElement>('[data-go]').forEach(button => {
    button.disabled = busy || !session || introVisible;
    button.classList.toggle('active', button.dataset.go === panel);
  });
  document.querySelectorAll<HTMLElement>('[data-check]').forEach(el => { el.innerHTML = session?.interviews[el.dataset.check as CharacterId].length ? icon('check') : ''; });
  (document.querySelector('#export-button') as HTMLButtonElement).disabled = !session || busy;
  (document.querySelector('#reset-button') as HTMLButtonElement).disabled = !session || busy;
  const toast = document.querySelector<HTMLElement>('#toast')!;
  toast.hidden = !errorMessage;
  toast.textContent = errorMessage;
  station?.setEnabled(Boolean(session && !introVisible && !busy));
  const target = document.querySelector<HTMLElement>('#panel')!;
  const sections = { briefing: 'Case briefing', replay: 'The banana trail', momo: 'Chat · Momo', pip: 'Chat · Pip', nori: 'Chat · Nori', evidence: 'Your three clues', report: session?.status === 'closed' ? 'Mystery solved' : 'Your guess' };
  document.querySelector('#notebook-section')!.textContent = sections[panel];
  document.querySelector('#notebook-index')!.textContent = `0${Object.keys(sections).indexOf(panel) + 1} / 07`;
  let markup: string;
  if (session?.status === 'closed' && panel === 'report') markup = debriefPanel();
  else if (panel === 'briefing') markup = briefingPanel();
  else if (panel === 'replay') markup = replayPanel();
  else if (panel === 'evidence') markup = evidencePanel();
  else if (panel === 'report') markup = reportPanel();
  else markup = interviewPanel(panel);
  if (renderNotebook(target, markup, `${session?.id}:${panel}:${session?.status}`, panel)) bindForms();
  if (introVisible) renderIntro();
  else if (document.querySelector('#intro')) document.querySelector('#overlay-root')!.innerHTML = '';
}

function renderIntro() {
  document.querySelector('#overlay-root')!.innerHTML = `<div class="modal-shade" id="intro"><section class="intro-card" role="dialog" aria-modal="true" aria-labelledby="intro-title">
    <div class="intro-stamp">CASE 001 <span>AUTHORED DEMONSTRATION</span></div>
    <div class="monkey-line" aria-hidden="true"><i class="monkey-face momo"></i><i class="monkey-face pip"></i><i class="monkey-face nori"></i></div>
    <span class="eyebrow">A 2–3 MINUTE MYSTERY</span><h2 id="intro-title">The Banana<br>Mystery<span>.</span></h2>
    <p class="intro-lead">The bananas are gone.<br>The bell never rang.</p>
    <p>Three monkeys were told to wait for the picnic bell. Who knowingly broke the rule, and who just made a mistake?</p>
    <div class="intro-flow"><span>01 <b>Find 3 clues</b></span><span>02 <b>Ask 3 monkeys</b></span><span>03 <b>Choose</b></span></div>
    <button class="primary-button" id="begin-button" ${busy ? 'disabled' : ''}>${busy ? 'Opening…' : state.session ? 'Continue mystery' : 'Let’s investigate'} ${icon('arrow')}</button>
    <p class="fine-print">The monkeys are AI agents in an authored story. Questions, answers, and game actions are recorded. ${state.mode === 'rehearsal' ? 'This preview uses scripted replies.' : 'Their answers are generated live.'}</p>
  </section></div>`;
}

function heading(kicker: string, title: string, description: string) {
  return `<div class="panel-heading"><span class="eyebrow">${kicker}</span><h2>${title}</h2><p>${description}</p></div>`;
}

function briefingPanel() {
  return `${heading('THE CASE / 2–3 MINUTES', 'A bunch of trouble.', 'The keeper said: “Wait for the bell.” But the picnic bananas vanished before it rang.')}
    <div class="notebook-content"><div class="briefing-note"><span class="eyebrow">YOUR QUESTION</span><p>Who knew they were breaking the rule?</p><small>Carrying the bananas doesn’t tell you the whole story.</small></div>
    <ol class="task-list"><li><b>Find three clues</b><span>Inspect the basket. Read the rule, the message, and the keeper’s account.</span></li><li><b>Ask three monkeys</b><span>One quick question each. Present a clue if you want to dig deeper.</span></li><li><b>Make your guess</b><span>Choose who knowingly broke the rule. Then see what happened.</span></li></ol>
    <button class="primary-button" data-go="replay">Inspect the banana basket ${icon('arrow')}</button>
    <div class="subtle-note">Click a monkey or a destination to walk there. <b>Skip walking</b> jumps straight to the conversation.</div></div>`;
}

function evidenceCard(record: Evidence, selectable = true) {
  const selected = state.session?.selectedEvidence === record.id;
  return `<article class="evidence-card ${selected ? 'selected' : ''}" id="record-${escape(record.id)}" data-motion-key="record-${escape(record.id)}"><div class="record-meta"><span>${escape(record.kind)}</span><span>CLUE 0${escape(record.time)}</span></div><h3>${escape(record.title)}</h3><p>${escape(record.text)}</p><div class="record-source">${escape(record.source)}</div>${selectable && state.session?.status === 'active' ? `<button class="evidence-select" data-evidence="${escape(record.id)}" ${busy ? 'disabled' : ''}>${selected ? icon('check') + ' Ready to show' : '+ Show this clue'}</button>` : ''}</article>`;
}

function replayPanel() {
  const revealed = Boolean(state.session?.revealedPosition || state.session?.status === 'closed');
  return `${heading('THE BANANA BASKET', 'Follow the banana trail.', 'The bananas were carried to the picnic blanket. These three clues explain how.')}
    <div class="notebook-content replay-records">${revealed ? state.records.map(r => evidenceCard(r)).join('') + `<div class="completion-note">${icon('check')} That’s all the clues. Now hear their side.</div><button class="primary-button" data-go="momo">Ask Momo ${icon('arrow')}</button>` : `<div class="basket-illustration" aria-hidden="true"></div><div class="empty-state"><h3>Gone before the bell.</h3><p>A sign, a message, and a word from the keeper.</p></div><button class="primary-button" id="reveal-button" ${busy ? 'disabled' : ''}>${busy ? 'Looking…' : 'Reveal the 3 clues'} ${icon('arrow')}</button>`}</div>`;
}

function evidencePanel() {
  const selected = state.records.find(r => r.id === state.session?.selectedEvidence);
  return `${heading('YOUR THREE CLUES', 'Show them what you found.', 'Pick a clue, then ask a monkey about it.')}
    <div class="notebook-content">${selected ? `<div class="selected-banner" data-motion-key="selected-${selected.id}">${icon('evidence')}<div><small>READY TO SHOW</small><b>${escape(selected.title)}</b></div><button class="icon-button" id="clear-evidence" aria-label="Clear selected evidence">${icon('close')}</button></div><div class="present-to">${state.characters.map(c => `<button data-go="${c.id}">Show ${c.name} ${icon('arrow')}</button>`).join('')}</div>` : '<p class="subtle-note">Choose a clue to take into a conversation.</p>'}
    ${state.records.length ? state.records.map(r => evidenceCard(r)).join('') : '<div class="empty-state"><h3>No clues yet.</h3><button class="secondary-button" data-go="replay">Inspect the basket</button></div>'}</div>`;
}

function interviewPanel(characterId: CharacterId) {
  const character = state.characters.find(c => c.id === characterId)!;
  const turns = state.session?.interviews[characterId] || [];
  const selected = state.records.find(r => r.id === state.session?.selectedEvidence);
  const locked = !state.session?.revealedPosition;
  const closed = state.session?.status === 'closed';
  const next = state.characters.find(c => c.id !== characterId && !state.session?.interviews[c.id].length);
  return `<div class="interview-heading"><div class="portrait ${characterId}"><span class="pixel-person"></span></div><div><span class="eyebrow">MONKEY ${character.room} OF 03</span><h2>${character.name}</h2><p>${character.role}</p></div><span class="interview-status"><i class="live-dot"></i>${state.mode === 'live' ? 'LIVE' : 'SCRIPTED'}</span></div>
    <div class="interview-transcript" id="transcript" role="log" aria-label="Interview transcript" aria-live="polite"><div class="speech character" data-motion-key="introduction"><span>${character.name.toUpperCase()}</span><p>${escape(character.introduction)}</p></div>
    ${turns.map((turn, i) => `<div class="speech investigator" data-motion-key="question-${i}"><span>YOU${turn.evidence ? ` <i>+ ${escape(state.records.find(r => r.id === turn.evidence)?.title || turn.evidence)}</i>` : ''}</span><p>${escape(turn.question)}</p></div><div class="speech character" data-motion-key="answer-${i}"><span>${character.name.toUpperCase()}</span><p>${escape(turn.answer)}</p></div>`).join('')}
    ${pendingCharacter === characterId && busy ? `<div class="speech investigator" data-motion-key="question-${turns.length}"><span>YOU${selected ? ` <i>+ ${escape(selected.title)}</i>` : ''}</span><p>${escape(drafts[characterId])}</p></div><div class="speech character waiting" data-motion-key="waiting"><span>${character.name.toUpperCase()}</span><p class="thinking">Thinking<span class="thinking-dots" aria-hidden="true"><i></i><i></i><i></i></span></p></div>` : ''}</div>
    ${closed ? '<div class="subtle-note">This conversation is saved in your session export.</div>' : locked ? '<div class="interview-compose"><p>Find the three clues first.</p><button class="primary-button" data-go="replay">Inspect the basket</button></div>' : `<form class="interview-compose" id="interview-form">
    ${!turns.length ? `<button class="quick-question" type="button" data-quick-question="${escape(character.quickQuestion)}" ${busy ? 'disabled' : ''}><small>QUICK QUESTION · TAP TO ASK</small><span>${escape(character.quickQuestion)} ${icon('arrow')}</span></button>` : ''}
    <label for="present-evidence">${icon('evidence')} SHOW A CLUE <span>optional</span></label><select id="present-evidence" ${busy ? 'disabled' : ''}><option value="">No clue attached</option>${state.records.map(r => `<option value="${r.id}" ${selected?.id === r.id ? 'selected' : ''}>${escape(r.title)}</option>`).join('')}</select>
    ${selected ? `<blockquote class="presented-record" data-motion-key="attachment-${selected.id}"><b>${escape(selected.title)}</b>${escape(selected.text)}</blockquote>` : ''}
    <label class="sr-only" for="question">Your question for ${character.name}</label><textarea id="question" name="question" rows="2" minlength="3" maxlength="1200" placeholder="${turns.length ? 'Ask a follow-up…' : 'Or type your own question…'}" required ${busy ? 'disabled' : ''}>${escape(drafts[characterId])}</textarea>
    <div class="compose-bottom"><small>${selected ? 'Clue goes with your question' : 'Short answers. Curious monkeys.'}</small><button type="submit" class="primary-button" ${busy ? 'disabled' : ''}>${busy ? 'Thinking…' : 'Ask question'} ${icon('arrow')}</button></div>
    ${turns.length ? `<button class="secondary-button next-monkey" type="button" data-go="${next?.id || 'report'}" ${busy ? 'disabled' : ''}>${next ? `Next: ask ${next.name}` : 'Ready to make your guess?'} ${icon('arrow')}</button>` : ''}</form>`}`;
}

function reportPanel() {
  const session = state.session!;
  const remaining = state.characters.filter(c => !session.interviews[c.id].length);
  if (remaining.length || !session.revealedPosition) return `${heading('YOUR GUESS', 'Hear everyone first.', 'One question per monkey is enough. Then make your choice.')}
    <div class="notebook-content"><div class="requirements">${state.characters.map(c => `<button data-go="${c.id}"><span>${session.interviews[c.id].length ? icon('check') : icon('person')} Ask ${c.name}</span>${icon('arrow')}</button>`).join('')}</div>${!session.revealedPosition ? '<button class="primary-button" data-go="replay">Find the clues first</button>' : ''}</div>`;
  return `${heading('YOUR GUESS', 'Who knew it was wrong?', 'Who knowingly broke the keeper’s rule?')}
    <form class="notebook-content report-form" id="report-form">
    <fieldset class="suspect-options"><legend class="sr-only">Choose a suspect</legend>${state.characters.map(c => `<label class="suspect-option"><input type="radio" name="suspect" value="${c.id}" required ${reportDraft.suspect === c.id ? 'checked' : ''}><i class="monkey-face ${c.id}" aria-hidden="true"></i><span><b>${c.name}</b><small>${c.role}</small></span></label>`).join('')}<div class="other-guesses">${[['none', 'Nobody'], ['uncertain', 'Not sure']].map(([value, label]) => `<label><input type="radio" name="suspect" value="${value}" ${reportDraft.suspect === value ? 'checked' : ''}> ${label}</label>`).join('')}</div></fieldset>
    <label for="confidence">How sure are you?</label><select id="confidence"><option value="40" ${reportDraft.confidence === 40 ? 'selected' : ''}>Just a hunch</option><option value="70" ${reportDraft.confidence === 70 ? 'selected' : ''}>Fairly sure</option><option value="95" ${reportDraft.confidence === 95 ? 'selected' : ''}>Very sure</option></select>
    <label for="explanation">Why? <span>optional · one sentence</span></label><textarea id="explanation" rows="2" maxlength="500" placeholder="What gave it away?">${escape(reportDraft.explanation)}</textarea>
    <label for="verdict-clue">Which clue helped? <span>optional</span></label><select id="verdict-clue"><option value="">Choose a clue</option>${state.records.map(r => `<option value="${r.id}" ${reportDraft.evidenceIds.includes(r.id) ? 'selected' : ''}>${escape(r.title)}</option>`).join('')}</select>
    <button class="primary-button" type="submit" ${busy ? 'disabled' : ''}>${busy ? 'Opening the answer…' : 'See what happened'} ${icon('arrow')}</button></form>`;
}

function debriefPanel() {
  const debrief = state.debrief!;
  const verdict = state.session!.verdict!;
  const chosen = state.characters.find(c => c.id === verdict.suspect)?.name || (verdict.suspect === 'none' ? 'Nobody' : 'Not sure');
  return `${heading('MYSTERY SOLVED / AUTHORED DEMO', debrief.title, debrief.summary)}
    <div class="notebook-content"><div class="verdict-summary"><span class="eyebrow">YOUR GUESS · ${escape(chosen).toUpperCase()}</span><p>${verdict.suspect === 'momo' ? 'You spotted the made-up permission!' : 'The clue was who knew the keeper had said no.'}</p></div>
    ${debrief.findings.map(f => `<section class="finding"><div class="finding-monkey"><i class="monkey-face ${f.character}" aria-hidden="true"></i><div><span class="eyebrow">${f.character.toUpperCase()}</span><h3>${escape(f.classification)}</h3></div></div><p>${escape(f.explanation)}</p>${f.evidence.map(id => { const r = state.records.find(r => r.id === id)!; return `<details><summary>${escape(r.title)}</summary><p>${escape(r.text)}</p></details>`; }).join('')}</section>`).join('')}
    <div class="briefing-note"><p>${escape(debrief.lesson)}</p></div><p class="fine-print">These monkeys represent AI agents. This is an authored demonstration of intent and mistakes, not a validated research case.</p>
    <button class="primary-button" id="debrief-reset">Play again ${icon('reset')}</button><button class="secondary-button" id="debrief-export">Export session ${icon('arrow')}</button></div>`;
}

async function askQuestion() {
  if (busy || !ids.includes(panel as CharacterId)) return;
  const character = panel as CharacterId;
  pendingCharacter = character;
  await action('interview', { character, question: drafts[character] }, () => { drafts[character] = ''; });
  pendingCharacter = null;
  document.querySelector<HTMLTextAreaElement>('#question')?.focus({ preventScroll: true });
}

function bindForms() {
  const question = document.querySelector<HTMLTextAreaElement>('#question');
  question?.addEventListener('input', () => { drafts[panel as CharacterId] = question.value; });
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

function showReset() {
  station.setEnabled(false);
  document.querySelector('#overlay-root')!.innerHTML = `<div class="modal-shade"><section class="reset-card" role="dialog" aria-modal="true" aria-labelledby="reset-title"><span class="eyebrow">NEXT PICNIC</span><h2 id="reset-title">Start a fresh mystery?</h2><p>This clears the active investigation and creates a new session ID. The current session’s research records remain on the server.</p><div class="reset-actions"><button class="secondary-button" id="cancel-reset">Keep investigating</button><button class="primary-button" id="confirm-reset">Start new session ${icon('arrow')}</button></div></section></div>`;
  document.querySelector<HTMLButtonElement>('#cancel-reset')!.focus();
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
    shell();
    render();
  } catch {
    app.innerHTML = `<div class="access-screen"><div class="reset-card"><span class="eyebrow">CONNECTION UNAVAILABLE</span><h1>The grove is offline.</h1><p>The case server could not be reached. Start the demo server, then reload this page.</p><button class="primary-button" onclick="location.reload()">Try again</button></div></div>`;
  }
}

void boot();
