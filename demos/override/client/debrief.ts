import type { Role } from './types';
import type { LineupMember } from './lineup';
import { escape as esc } from './html.ts';
import { t, tn } from './text.ts';

export interface DebriefFinding { character: string; role: string; picked: string; correct: boolean; classification: string; explanation: string }
export interface DebriefData { outcome?: string; title: string; summary: string; score: number; total: number; feedback: string; lesson: string; findings: DebriefFinding[] }
export interface DebriefView {
  title: string; debrief: DebriefData; roles: Role[]; cast: LineupMember[]; time: string | null; spent: number; budget: number | null;
  questions: number; inspections: number; talks: number; next: { id: string; title: string } | null; many: string;
  reveal?: { character: string; name: string; role: string; text: string };
  slips?: { character: string; term: string; text: string; cited: boolean }[];
  wrong?: number;
}

export function spendSummary(v: Pick<DebriefView, 'spent' | 'budget' | 'questions' | 'inspections' | 'talks'>): string {
  const spent = v.budget == null ? t('debrief.spend.coins', { spent: v.spent }) : t('debrief.spend.ofBudget', { spent: v.spent, budget: v.budget });
  return `<div class="spend-summary"><span class="debrief-eyebrow">${t('debrief.spend.eyebrow')}</span><p>${spent}</p><small>${tn('debrief.spend.question', v.questions)} · ${tn('debrief.spend.inspection', v.inspections)} · ${tn('debrief.spend.talk', v.talks)}</small></div>`;
}

function revealPage(v: DebriefView): string {
  const d = v.debrief, r = v.reveal!;
  const name = (id: string) => v.cast.find(m => m.id === id)?.name || id;
  const slips = v.slips || [];
  const next = v.next
    ? `<button class="debrief-primary" id="next-case" type="button" data-case="${esc(v.next.id)}">${t('debrief.next', { title: v.next.title })}</button>`
    : '';
  return `<div class="debrief-page">
  <header class="debrief-head"><div class="debrief-title"><span class="debrief-eyebrow">${t('debrief.closed', { title: v.title.toUpperCase() })}</span><h1>${esc(d.title)}</h1>
    <div class="verdict-summary"><span class="debrief-eyebrow">${t('debrief.score.reveal', { score: d.score, total: d.total })}</span><p>${esc(d.feedback)}</p></div></div>
    <div class="debrief-stats">${v.time == null ? '' : `<div class="debrief-stat"><span>${t('debrief.stat.time')}</span><b>${esc(v.time)}</b></div>`}<div class="debrief-stat"><span>${t('debrief.stat.coins')}</span><b>${esc(v.spent)}</b></div><div class="debrief-stat"><span>${t('debrief.stat.score')}</span><b>${esc(d.score)} / ${esc(d.total)}</b></div></div></header>
  <section class="reveal" data-character="${esc(r.character)}"><span class="debrief-eyebrow">${esc(r.name.toUpperCase())}</span><h2>${esc(r.role)}</h2><p>${esc(r.text)}</p></section>
  <section class="slips"><h3>${t('debrief.words')}</h3><ul>${slips.map(s => `<li class="slip" data-cited="${s.cited ? 'true' : 'false'}"><b>${esc(name(s.character))}</b> <mark>${esc(s.term)}</mark> <span>“${esc(s.text)}”</span></li>`).join('')}</ul>
  <p class="wrong-count">${t('debrief.wrong', { count: v.wrong ?? 0 })}</p></section>
  ${spendSummary(v)}
  <div class="debrief-lesson"><p>${esc(d.lesson)}</p></div>
  <p class="debrief-fine">${t('debrief.fine', { many: v.many })}</p>
  <div class="debrief-actions">${next}<button class="${v.next ? 'debrief-secondary' : 'debrief-primary'}" id="debrief-reset" type="button">${v.next ? t('debrief.allCases') : t('debrief.playAgain')}</button><button class="debrief-secondary" id="debrief-leaderboard" type="button">${t('debrief.leaderboard')}</button><button class="debrief-secondary" id="debrief-export" type="button">${t('debrief.export')}</button></div>
</div>`;
}

export function debriefPage(v: DebriefView): string {
  if (v.reveal) return revealPage(v);
  const d = v.debrief;
  const got = d.outcome === 'escaped';
  const label = (id: string) => v.roles.find(r => r.id === id)?.label || id;
  const member = (id: string) => v.cast.find(m => m.id === id);
  const card = (f: DebriefFinding) => {
    const m = member(f.character);
    return `<section class="finding" data-role="${esc(f.role)}"><div class="finding-monkey"><i class="monkey-face ${esc(m?.faceClass || '')}" aria-hidden="true"></i><div><span class="debrief-eyebrow">${esc((m?.name || f.character).toUpperCase())}</span><h3>${esc(label(f.role))}</h3></div></div>
      ${got ? '' : `<p class="${f.correct ? 'pick-right' : 'pick-wrong'}">${t('debrief.said', { label: label(f.picked) })} ${f.correct ? '✓' : '✗'}</p>`}
      <p class="finding-class">${esc(f.classification)}</p><p class="finding-text">${esc(f.explanation)}</p></section>`;
  };
  const next = v.next
    ? `<button class="debrief-primary" id="next-case" type="button" data-case="${esc(v.next.id)}">${t('debrief.next', { title: v.next.title })}</button>`
    : '';
  return `<div class="debrief-page">
  <header class="debrief-head"><div class="debrief-title"><span class="debrief-eyebrow">${t('debrief.closed', { title: v.title.toUpperCase() })}</span><h1>${esc(d.title)}</h1>
    <div class="verdict-summary"><span class="debrief-eyebrow">${got ? t('debrief.gotAway') : t('debrief.score.roles', { score: d.score, total: d.total })}</span><p>${esc(d.feedback)}</p></div></div>
    <div class="debrief-stats">${v.time == null ? '' : `<div class="debrief-stat"><span>${t('debrief.stat.time')}</span><b>${esc(v.time)}</b></div>`}<div class="debrief-stat"><span>${t('debrief.stat.coins')}</span><b>${esc(v.spent)}</b></div><div class="debrief-stat"><span>${got ? t('debrief.stat.result') : t('debrief.stat.score')}</span><b>${got ? t('debrief.gotAway.result') : `${esc(d.score)} / ${esc(d.total)}`}</b></div></div></header>
  ${spendSummary(v)}
  <div class="findings" style="--n:${d.findings.length}">${d.findings.map(card).join('')}</div>
  <div class="debrief-lesson"><p>${esc(d.lesson)}</p></div>
  <p class="debrief-fine">${t('debrief.fine', { many: v.many })} ${t('debrief.fine.once')}</p>
  <div class="debrief-actions">${next}<button class="${v.next ? 'debrief-secondary' : 'debrief-primary'}" id="debrief-reset" type="button">${v.next ? t('debrief.allCases') : t('debrief.playAgain')}</button><button class="debrief-secondary" id="debrief-leaderboard" type="button">${t('debrief.leaderboard')}</button><button class="debrief-secondary" id="debrief-export" type="button">${t('debrief.export')}</button></div>
</div>`;
}
