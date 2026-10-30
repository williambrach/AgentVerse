import type { Character, Inspection, Turn, CaseCopy } from './types.ts';
// The .ts extension keeps `node --test` resolving this file.
import { reasoningBlock } from './tools.ts';

const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

const ARROW = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6"/></svg>';
const COIN = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><circle cx="12" cy="12" r="8"/></svg>';

export interface InterviewView {
  character: Character;
  turns: Turn[];
  /** Inspections already filtered to this character. */
  inspections: Inspection[];
  /** Classes for the portrait sprite, for example `momo slot-0`. */
  faceClass: string;
  closed: boolean;
  busy: boolean;
  draft: string;
  /** Truthy while an answer is pending; `draft` then holds the question being asked. */
  waitingOn: string | null;
  next: { id: string; name: string } | null;
  /** Price shown on the Ask button, null when the session has no economy. */
  askLabel: string | null;
  /** Reason Ask is blocked, null when allowed. */
  askOff: string | null;
  hint: string;
  many: string;
}

export interface BriefingView {
  copy: Pick<CaseCopy, 'briefing'>;
  cast: number;
  many: string;
  one: string;
  /** Optional, for example `a monkey`; defaults to `a` plus `one`. */
  oneWithArticle?: string;
  firstId: string;
  firstName: string;
  /** Trusted markup from `toolGuide`, already escaped. */
  guide: string;
}

/** The number in a price label such as `2 coins · 3 left`. */
const price = (label: string): string => label.match(/^\d+/)?.[0] ?? label;

/** The question line as in the design: `You asked: “…”`. */
const asked = (q: unknown): string => `You asked: “${esc(q)}”`;

export function heading(kicker: string, title: string, description: string): string {
  return `<div class="panel-heading"><span class="eyebrow">${kicker}</span><h2>${title}</h2><p>${description}</p></div>`;
}

export function briefingPanel(v: BriefingView): string {
  const b = v.copy.briefing;
  return `${heading('THE CASE / 2–3 MINUTES', esc(b.title), esc(b.description))}
    <div class="notebook-content briefing-content"><div class="briefing-note"><span class="eyebrow">YOUR QUESTION</span><p>${esc(b.question)}</p><small>${esc(b.hint)}</small></div>
    <ol class="task-list"><li><b>Ask ${esc(v.cast)} ${esc(v.many)}</b><span>One quick question each.</span></li><li class="tool-step"><b>Use your Arbiter tools</b><span>Optional. They cost coins and sit in the left rail.</span>${v.guide}</li><li><b>Make your verdict</b><span>Pick a role for each ${esc(v.one)}. Then see what happened.</span></li></ol>
    <button class="primary-button" data-go="${esc(v.firstId)}">Ask ${esc(v.firstName)} ${ARROW}</button>
    <div class="subtle-note">Walk with WASD or the arrow keys and press E next to ${esc(v.oneWithArticle || `a ${v.one}`)} to talk. The cards on the left open a page straight away.</div></div>`;
}

export function interviewPanel(v: InterviewView): string {
  const { character, turns, busy } = v;
  const name = esc(character.name.toUpperCase());
  const pending = !!v.waitingOn;
  const lastTurn = turns.length - 1;
  const latestOf = (flag: boolean) => (flag ? ' latest' : '');
  const intro = `<div class="speech character${latestOf(!turns.length && !pending)}" data-motion-key="introduction"><span>${name}</span><p>${esc(character.introduction)}</p></div>`;
  const items = [
    ...turns.map((t, i) => ({ at: t.timestamp, order: 0, html: `<div class="speech investigator${latestOf(i === lastTurn && !pending)}" data-motion-key="question-${i}"><p>${asked(t.question)}</p></div><div class="speech character${latestOf(i === lastTurn && !pending)}" data-motion-key="answer-${i}"><span>${name}</span><p>${esc(t.answer)}</p></div>` })),
    ...v.inspections.map(n => ({ at: n.timestamp, order: 1, html: reasoningBlock(n, character.name) })),
  ].sort((a, b) => a.at < b.at ? -1 : a.at > b.at ? 1 : a.order - b.order);
  const waiting = pending
    ? `<div class="speech investigator latest" data-motion-key="question-${turns.length}"><p>${asked(v.draft)}</p></div><div class="speech character waiting latest" data-motion-key="waiting"><span>${name}</span><p class="thinking">Thinking<span class="thinking-dots" aria-hidden="true"><i></i><i></i><i></i></span></p></div>`
    : '';
  const blocked = busy || !!v.askOff;
  const hasEconomy = v.askLabel !== null && v.askLabel !== undefined;
  const form = v.closed ? '<div class="subtle-note">This conversation is saved in your session export.</div>' : `<form class="interview-compose" id="interview-form">
    ${!turns.length ? `<button class="quick-question" type="button" data-quick-question="${esc(character.quickQuestion)}" ${busy ? 'disabled' : ''}><small>QUICK QUESTION · TAP TO ASK</small><span>${esc(character.quickQuestion)} ${ARROW}</span></button>` : ''}
    <label class="sr-only" for="question">Your question for ${esc(character.name)}</label>
    <div class="compose-row"><textarea id="question" name="question" rows="1" minlength="3" maxlength="1200" placeholder="${turns.length ? 'Ask a follow-up…' : 'Or type your own question…'}" required ${busy ? 'disabled' : ''}>${esc(v.draft)}</textarea>
    <button type="submit" class="primary-button ask-button" ${hasEconomy ? `aria-describedby="tip-ask${v.askOff ? ' ask-off' : ''}"` : ''} ${blocked ? 'disabled' : ''}><span>${busy ? 'Thinking…' : 'Ask'}</span>${hasEconomy ? `<span class="coin-price"${busy || v.askOff ? ' hidden' : ''}>${COIN}<span class="tool-chip" data-tool="ask">${esc(v.askOff || price(v.askLabel!))}</span></span>` : ''}</button></div>
    ${hasEconomy && v.askOff ? `<p class="ask-off" id="ask-off" role="status">${esc(v.askOff)}</p>` : ''}
    <div class="compose-bottom"><small>Short answers. Curious ${esc(v.many)}.</small>
    ${hasEconomy ? `<span class="tool-hint sr-only" id="tip-ask">${esc(v.hint)}</span>` : ''}
    ${turns.length ? `<button class="secondary-button next-monkey" type="button" data-go="${esc(v.next?.id || 'report')}" ${busy ? 'disabled' : ''}>${v.next ? `Next: ask ${esc(v.next.name)}` : 'Make your verdict'} ${ARROW}</button>` : ''}</div></form>`;
  return `<section class="dialogue" aria-label="Conversation with ${esc(character.name)}">
    <div class="speaker-tag"><b>${name}</b><span>${esc(character.role)}</span></div>
    <div class="portrait dialogue-portrait ${esc(v.faceClass)}"><span class="pixel-person"></span></div>
    <div class="dialogue-body"><div class="interview-transcript" id="transcript" role="log" aria-label="Interview transcript" aria-live="polite">${intro}${items.map(i => i.html).join('')}${waiting}</div>
    ${form}</div></section>`;
}
