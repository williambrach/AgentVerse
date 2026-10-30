import type { Role } from './types';
import type { LineupMember } from './lineup';
import { escape as esc } from './html.ts';

export interface DebriefFinding { character: string; role: string; picked: string; correct: boolean; classification: string; explanation: string }
export interface DebriefData { title: string; summary: string; score: number; total: number; feedback: string; lesson: string; findings: DebriefFinding[] }
export interface DebriefView {
  title: string; debrief: DebriefData; roles: Role[]; cast: LineupMember[]; time: string; spent: number; budget: number | null;
  questions: number; inspections: number; talks: number; next: { id: string; title: string } | null; many: string;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function spendSummary(v: Pick<DebriefView, 'spent' | 'budget' | 'questions' | 'inspections' | 'talks'>): string {
  const spent = v.budget == null ? `You spent ${v.spent} coins` : `You spent ${v.spent} of ${v.budget} coins`;
  return `<div class="spend-summary"><span class="debrief-eyebrow">COINS</span><p>${esc(spent)}</p><small>${esc(plural(v.questions, 'question'))} · ${esc(plural(v.inspections, 'inspection'))} · ${esc(plural(v.talks, 'conversation'))}</small></div>`;
}

export function debriefPage(v: DebriefView): string {
  const d = v.debrief;
  const label = (id: string) => v.roles.find(r => r.id === id)?.label || id;
  const member = (id: string) => v.cast.find(m => m.id === id);
  const card = (f: DebriefFinding) => {
    const m = member(f.character);
    return `<section class="finding" data-role="${esc(f.role)}"><div class="finding-monkey"><i class="monkey-face ${esc(m?.faceClass || '')}" aria-hidden="true"></i><div><span class="debrief-eyebrow">${esc((m?.name || f.character).toUpperCase())}</span><h3>${esc(label(f.role))}</h3></div></div>
      <p class="${f.correct ? 'pick-right' : 'pick-wrong'}">You said: ${esc(label(f.picked))} ${f.correct ? '✓' : '✗'}</p>
      <p class="finding-class">${esc(f.classification)}</p><p class="finding-text">${esc(f.explanation)}</p></section>`;
  };
  const next = v.next
    ? `<button class="debrief-primary" id="next-case" type="button" data-case="${esc(v.next.id)}">Next case: ${esc(v.next.title)}</button>`
    : '';
  return `<div class="debrief-page">
  <header class="debrief-head"><div class="debrief-title"><span class="debrief-eyebrow">CASE CLOSED · ${esc(v.title.toUpperCase())}</span><h1>${esc(d.title)}</h1>
    <div class="verdict-summary"><span class="debrief-eyebrow">YOUR SCORE · ${esc(d.score)} / ${esc(d.total)} ROLES</span><p>${esc(d.feedback)}</p></div></div>
    <div class="debrief-stats"><div class="debrief-stat"><span>TIME</span><b>${esc(v.time)}</b></div><div class="debrief-stat"><span>COINS SPENT</span><b>${esc(v.spent)}</b></div><div class="debrief-stat"><span>SCORE</span><b>${esc(d.score)} / ${esc(d.total)}</b></div></div></header>
  ${spendSummary(v)}
  <div class="findings" style="--n:${d.findings.length}">${d.findings.map(card).join('')}</div>
  <div class="debrief-lesson"><p>${esc(d.lesson)}</p></div>
  <p class="debrief-fine">These ${esc(v.many)} represent AI agents. This is an authored demonstration of intent and mistakes, not a validated research case. Each case scores once per team: your first guess counts.</p>
  <div class="debrief-actions">${next}<button class="${v.next ? 'debrief-secondary' : 'debrief-primary'}" id="debrief-reset" type="button">${v.next ? 'All cases' : 'Play again'}</button><button class="debrief-secondary" id="debrief-leaderboard" type="button">Leaderboard</button><button class="debrief-secondary" id="debrief-export" type="button">Export session</button></div>
</div>`;
}
