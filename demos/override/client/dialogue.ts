import type { Character, Inspection, Turn, CaseCopy, EvidenceCard } from './types.ts';
// The .ts extension keeps `node --test` resolving this file.
import { noThoughtBlock, reasoningBlock } from './tools.ts';
import { escape as esc, heading } from './html.ts';
import { wordTokens } from './talk-ui.ts';
import { plain, t } from './text.ts';

const ARROW = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6"/></svg>';
const COIN = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><circle cx="12" cy="12" r="8"/></svg>';

export interface InterviewView {
  character: Character;
  turns: Turn[];
  /** Inspections already filtered to this character. */
  inspections: Inspection[];
  /** Inspect found no reasoning on the latest line. */
  noThought?: boolean;
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
  /** Talk cases only: topic chips, asked topics and the line being picked. */
  talk?: { topics: { id: string; label: string; question: string }[]; asked: string[]; pick: { line: string; a: number | null; b: number | null } | null };
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
  /** Plain text for the verdict step; defaults to the role-picking line. */
  verdict?: string;
  /** Plain text for the note under the button; defaults to the walking hint. */
  howTo?: string;
  /** Trusted markup replacing the stock `<ol class="task-list">`, for cases with their own steps (see `talkBriefingList`). */
  steps?: string;
}

/** The number in a price label such as `2 coins · 3 left`. */
const price = (label: string): string => label.match(/^\d+/)?.[0] ?? label;

/** The question line as in the design: `You asked: “…”`. */
const asked = (q: unknown): string => t('dialogue.asked', { question: q });

export function briefingPanel(v: BriefingView): string {
  const b = v.copy.briefing;
  return `${heading(t('dialogue.briefing.kicker'), esc(b.title), esc(b.description))}
    <div class="notebook-content briefing-content"><div class="briefing-note"><span class="eyebrow">${t('dialogue.briefing.question')}</span><p>${esc(b.question)}</p><small>${esc(b.hint)}</small></div>
    ${v.steps ?? `<ol class="task-list"><li><b>${t('dialogue.briefing.ask.title', { cast: v.cast, many: v.many })}</b><span>${t('dialogue.briefing.ask.body')}</span></li><li class="tool-step"><b>${t('dialogue.briefing.tools.title')}</b><span>${t('dialogue.briefing.tools.body')}</span>${v.guide}</li><li><b>${t('dialogue.briefing.verdict.title')}</b><span>${v.verdict !== undefined ? esc(v.verdict) : t('dialogue.briefing.verdict.body', { one: v.one })}</span></li></ol>`}
    <button class="primary-button" data-go="${esc(v.firstId)}">${t('dialogue.briefing.go', { name: v.firstName })} ${ARROW}</button>
    <div class="subtle-note">${v.howTo !== undefined ? esc(v.howTo) : t('dialogue.briefing.howTo', { article: v.oneWithArticle || plain('dialogue.briefing.article', { one: v.one }) })}</div></div>`;
}

/** One authored answer with its quote tools; the line under picking shows word buttons. */
function talkLine(v: InterviewView, id: string, text: string): string {
  const pick = v.talk?.pick;
  const sid = esc(id);
  if (!pick || pick.line !== id) {
    return `<p class="talk-line" data-line="${sid}">${esc(text)}</p><div class="line-tools"><button type="button" data-pick-line="${sid}">${t('dialogue.line.pick')}</button><button type="button" data-save-quote="${sid}">${t('dialogue.line.saveQuote')}</button></div>`;
  }
  const toks = wordTokens(text);
  let body = '', at = 0;
  const lo = pick.a === null || pick.b === null ? -1 : Math.min(pick.a, pick.b);
  const hi = pick.a === null || pick.b === null ? -1 : Math.max(pick.a, pick.b);
  for (const t of toks) {
    body += esc(text.slice(at, t.start)) + `<button type="button" class="word${t.i >= lo && t.i <= hi ? ' picked' : ''}" data-word="${t.i}" data-line="${sid}">${esc(t.word)}</button>`;
    at = t.end;
  }
  body += esc(text.slice(at));
  const ranged = lo >= 0;
  return `<p class="talk-line" data-line="${sid}">${body}</p><div class="line-tools"><button type="button" data-save-quote="${sid}">${ranged ? t('dialogue.line.saveExcerpt') : t('dialogue.line.saveWhole')}</button><button type="button" data-ask-about="${sid}"${ranged ? '' : ' disabled'}>${t('dialogue.line.mean')}</button><button type="button" data-pick-cancel>${t('dialogue.line.cancel')}</button></div>`;
}

const topicChips = (v: InterviewView): string => `<div class="topic-chips">${v.talk!.topics.map(t => {
  const done = v.talk!.asked.includes(t.id);
  return `<button type="button" data-topic="${esc(t.id)}"${done ? ' aria-pressed="true" disabled' : ''}${v.busy && !done ? ' disabled' : ''}>${done ? '✓ ' : ''}${esc(t.label)}</button>`;
}).join('')}</div>`;

export function interviewPanel(v: InterviewView): string {
  const { character, turns, busy } = v;
  const name = esc(character.name.toUpperCase());
  const pending = !!v.waitingOn;
  const lastTurn = turns.length - 1;
  const latestOf = (flag: boolean) => (flag ? ' latest' : '');
  const intro = `<div class="speech character${latestOf(!turns.length && !pending)}" data-motion-key="introduction"><span>${name}</span><p>${esc(character.introduction)}</p></div>`;
  const items = [
    ...turns.map((t, i) => ({ at: t.timestamp, order: 0, html: `<div class="speech investigator${latestOf(i === lastTurn && !pending)}" data-motion-key="question-${i}"><p>${asked(t.question)}</p></div><div class="speech character${latestOf(i === lastTurn && !pending)}" data-motion-key="answer-${i}"><span>${name}</span>${v.talk && (t as { id?: string }).id ? talkLine(v, (t as { id: string }).id, t.answer) : `<p>${esc(t.answer)}</p>`}</div>` })),
    ...v.inspections.map(n => ({ at: n.timestamp, order: 1, html: reasoningBlock(n, character.name) })),
  ].sort((a, b) => a.at < b.at ? -1 : a.at > b.at ? 1 : a.order - b.order);
  const waiting = pending
    ? `<div class="speech investigator latest" data-motion-key="question-${turns.length}"><p>${asked(v.draft)}</p></div><div class="speech character waiting latest" data-motion-key="waiting"><span>${name}</span><p class="thinking">${t('dialogue.thinking')}<span class="thinking-dots" aria-hidden="true"><i></i><i></i><i></i></span></p></div>`
    : '';
  const blocked = busy || !!v.askOff;
  const hasEconomy = v.askLabel !== null && v.askLabel !== undefined;
  const form = v.closed ? `<div class="subtle-note">${t('dialogue.saved')}</div>` : `<form class="interview-compose" id="interview-form">
    ${v.talk ? topicChips(v) : !turns.length ? `<button class="quick-question" type="button" data-quick-question="${esc(character.quickQuestion)}" ${busy ? 'disabled' : ''}><small>${t('dialogue.quick')}</small><span>${esc(character.quickQuestion)} ${ARROW}</span></button>` : ''}
    <label class="sr-only" for="question">${t('dialogue.questionFor', { name: character.name })}</label>
    <div class="compose-row"><textarea id="question" name="question" rows="1" minlength="3" maxlength="1200" placeholder="${turns.length ? t('dialogue.placeholder.followUp') : t('dialogue.placeholder.first')}" required ${busy ? 'disabled' : ''}>${esc(v.draft)}</textarea>
    <button type="submit" class="primary-button ask-button" ${hasEconomy ? `aria-describedby="tip-ask${v.askOff ? ' ask-off' : ''}"` : ''} ${blocked ? 'disabled' : ''}><span>${busy ? t('dialogue.thinkingButton') : t('dialogue.ask')}</span>${hasEconomy ? `<span class="coin-price"${busy || v.askOff ? ' hidden' : ''}>${COIN}<span class="tool-chip" data-tool="ask">${esc(v.askOff || price(v.askLabel!))}</span></span>` : ''}</button></div>
    ${hasEconomy && v.askOff ? `<p class="ask-off" id="ask-off" role="status">${esc(v.askOff)}</p>` : ''}
    <div class="compose-bottom"><small>${t('dialogue.curious', { many: v.many })}</small>
    ${hasEconomy ? `<span class="tool-hint sr-only" id="tip-ask">${esc(v.hint)}</span>` : ''}
    ${turns.length ? `<button class="secondary-button next-monkey" type="button" data-go="${esc(v.next?.id || 'report')}" ${busy ? 'disabled' : ''}>${v.next ? t('dialogue.next', { name: v.next.name }) : t('dialogue.verdict')} ${ARROW}</button>` : ''}</div></form>`;
  return `<section class="dialogue" aria-label="${t('dialogue.aria.conversation', { name: character.name })}">
    <div class="speaker-tag"><b>${name}</b><span>${esc(character.role)}</span></div>
    <div class="portrait dialogue-portrait ${esc(v.faceClass)}"><span class="pixel-person"></span></div>
    <div class="dialogue-body"><div class="interview-transcript" id="transcript" role="log" aria-label="${t('dialogue.aria.transcript')}" aria-live="polite">${intro}${items.map(i => i.html).join('')}${v.noThought ? noThoughtBlock(character.name, turns.length) : ''}${waiting}</div>
    ${form}</div></section>`;
}

/** The Evidence page: examined cards, newest first; the card just examined (or opened from the hall) is open. */
export function evidencePanel(cards: EvidenceCard[], focusId: string | null, total: number): string {
  const body = cards.length
    ? `<div class="evidence-list">${[...cards].reverse().map(c => `<article class="evidence-card${c.id === focusId ? ' focus open' : ''}" data-evidence="${esc(c.id)}"${c.id === focusId ? ' aria-current="true"' : ''}><img class="evidence-prop" src="/assets/department/props/${encodeURIComponent(c.id)}.png" width="48" height="48" alt=""><div><h3>${esc(c.title)}</h3><p>${esc(c.text)}</p></div></article>`).join('')}</div>`
    : `<div class="subtle-note evidence-empty">${t('dialogue.evidence.empty')}</div>`;
  return `${heading(t('dialogue.evidence.kicker'), t('dialogue.evidence.title'), t('dialogue.evidence.count', { shown: cards.length, total }))}<div class="notebook-content evidence-content">${body}</div>`;
}
