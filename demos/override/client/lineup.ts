import type { Role } from './types';
import { escape as esc } from './html.ts';
import { t } from './text.ts';

export interface LineupMember { id: string; name: string; part: string; faceClass: string }
export interface LineupView {
  title: string; noun: string; time: string; spent: number; roles: Role[]; cast: LineupMember[];
  picks: Record<string, string>; confidence: number; explanation: string; busy: boolean; hint: string;
  /** Replaces the scale heading (choice mode). */
  heading?: { title: string; description: string };
}

/** Left to right on the scale: from did nothing wrong to knowingly broke the rule. */
export const ROLE_ORDER = ['honest', 'fooled', 'collaborator', 'villain'];
/** Read at use time so the admin's edits apply. */
const confidence = (): [number, string][] => [[40, t('lineup.conf.guessing')], [70, t('lineup.conf.fairly')], [95, t('lineup.conf.certain')]];

/** Choice mode: the case defines its own answers instead of the honest-to-villain scale. */
function isChoice(roles: Role[]): boolean {
  return roles.length !== ROLE_ORDER.length || roles.some(r => !ROLE_ORDER.includes(r.id));
}

function choiceCard(m: LineupMember, roles: Role[], picks: Record<string, string>) {
  const name = `role-${m.id}`;
  const chips = roles.map(r => `<label class="role-chip role-choice" data-role="${esc(r.id)}" title="${esc(r.hint)}"><input type="radio" name="${esc(name)}" value="${esc(r.id)}" aria-label="${esc(r.label)}" ${picks[m.id] === r.id ? 'checked' : ''}><span class="role-dot"></span><span class="choice-label">${esc(r.label)}</span></label>`).join('');
  return `<fieldset class="role-row role-row-choice"><legend class="sr-only">${t('lineup.theoryFor', { name: m.name })}</legend>
    <div class="role-who"><i class="monkey-face ${esc(m.faceClass)}" aria-hidden="true"></i><b class="role-name">${esc(m.name)}</b><small class="role-part">${esc(m.part)}</small></div>
    <div class="role-choices">${chips}</div></fieldset>`;
}

function ordered(roles: Role[]): Role[] {
  const rank = (id: string) => { const i = ROLE_ORDER.indexOf(id); return i < 0 ? ROLE_ORDER.length : i; };
  return roles.slice().sort((a, b) => rank(a.id) - rank(b.id));
}

function card(m: LineupMember, roles: Role[], picks: Record<string, string>) {
  const name = `role-${m.id}`;
  const chips = roles.map(r => `<label class="role-chip" data-role="${esc(r.id)}" title="${esc(r.label)}"><input type="radio" name="${esc(name)}" value="${esc(r.id)}" aria-label="${esc(r.label)}" ${picks[m.id] === r.id ? 'checked' : ''}><span class="role-dot"></span></label>`).join('');
  const labels = roles.map(r => `<span class="pick-name" data-role="${esc(r.id)}">${esc(r.label)}</span>`).join('');
  return `<fieldset class="role-row"><legend class="sr-only">${t('lineup.roleFor', { name: m.name })}</legend>
    <div class="role-who"><i class="monkey-face ${esc(m.faceClass)}" aria-hidden="true"></i><b class="role-name">${esc(m.name)}</b><small class="role-part">${esc(m.part)}</small></div>
    <div class="pick-label" aria-hidden="true"><span class="pick-none">${t('lineup.notPicked')}</span>${labels}</div>
    <div class="role-scale">${chips}</div>
    <div class="scale-ends" aria-hidden="true"><span>${t('lineup.honest')}</span><span>${t('lineup.villain')}</span></div></fieldset>`;
}

export function lineupPanel(v: LineupView): string {
  const choice = isChoice(v.roles);
  const roles = choice ? v.roles : ordered(v.roles);
  const picked = v.cast.filter(m => v.picks[m.id]).length;
  const submit = v.busy ? t('lineup.busy')
    : `${t('lineup.lock')}${v.hint && picked < v.cast.length ? `<small class="lock-count">${t('lineup.picked', { picked, total: v.cast.length })}</small>` : ''}`;
  const disabled = v.busy || v.hint;
  return `<form id="report-form" class="lineup-board${choice ? ' lineup-choice' : ''}">
  <header class="lineup-head">
    <div class="lineup-title"><span class="lineup-eyebrow">${t('lineup.kicker', { title: v.title.toUpperCase() })}</span>${choice && v.heading
      ? `<h1>${esc(v.heading.title)}</h1>\n    <p>${esc(v.heading.description)}</p>`
      : `<h1>${t('lineup.title')}</h1>\n    <p>${t('lineup.intro', { noun: v.noun })}</p>`}</div>
    <div class="lineup-stats"><div class="lineup-stat"><span>${t('lineup.stat.time')}</span><b data-elapsed>${esc(v.time)}</b></div><div class="lineup-stat"><span>${t('lineup.stat.coins')}</span><b>${esc(v.spent)}</b></div></div>
  </header>
  <ul class="role-legend" aria-label="${choice ? t('lineup.legend.theories') : t('lineup.legend.roles')}">${roles.map(r => `<li data-role="${esc(r.id)}"><span class="legend-swatch" aria-hidden="true"></span><b>${esc(r.label)}</b><span>${esc(r.hint)}</span></li>`).join('')}</ul>
  <div class="lineup-cards" style="--n:${v.cast.length}">${v.cast.map(m => (choice ? choiceCard : card)(m, roles, v.picks)).join('')}</div>
  <footer class="lineup-foot">
    <div class="lineup-controls">
      <div class="confidence" role="group" aria-label="${t('lineup.sure.aria')}"><span>${t('lineup.sure')}</span>${confidence().map(([n, label]) => `<label class="conf-chip"><input type="radio" name="confidence" value="${n}" ${v.confidence === n ? 'checked' : ''}><span>${label}</span></label>`).join('')}</div>
      <label class="sr-only" for="explanation">${t('lineup.why.label')}</label>
      <textarea id="explanation" rows="1" maxlength="500" placeholder="${t('lineup.why.placeholder')}">${esc(v.explanation)}</textarea>
      <button class="lock-in" id="lock-in" type="submit" ${disabled ? 'disabled' : ''}>${submit}</button>
    </div>
    <button class="lineup-back" id="lineup-back" type="button">${t('lineup.back')}</button>
  </footer>
</form>`;
}
