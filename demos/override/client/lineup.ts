import type { Role } from './types';

export interface LineupMember { id: string; name: string; part: string; faceClass: string }
export interface LineupView {
  title: string; noun: string; time: string; spent: number; roles: Role[]; cast: LineupMember[];
  picks: Record<string, string>; confidence: number; explanation: string; busy: boolean; hint: string;
}

/** Left to right on the scale: from did nothing wrong to knowingly broke the rule. */
export const ROLE_ORDER = ['honest', 'fooled', 'collaborator', 'villain'];
const CONFIDENCE: [number, string][] = [[40, 'Guessing'], [70, 'Fairly sure'], [95, 'Certain']];

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

function ordered(roles: Role[]): Role[] {
  const rank = (id: string) => { const i = ROLE_ORDER.indexOf(id); return i < 0 ? ROLE_ORDER.length : i; };
  return roles.slice().sort((a, b) => rank(a.id) - rank(b.id));
}

function card(m: LineupMember, roles: Role[], picks: Record<string, string>) {
  const name = `role-${m.id}`;
  const chips = roles.map(r => `<label class="role-chip" data-role="${esc(r.id)}" title="${esc(r.label)}"><input type="radio" name="${esc(name)}" value="${esc(r.id)}" aria-label="${esc(r.label)}" ${picks[m.id] === r.id ? 'checked' : ''}><span class="role-dot"></span></label>`).join('');
  const labels = roles.map(r => `<span class="pick-name" data-role="${esc(r.id)}">${esc(r.label)}</span>`).join('');
  return `<fieldset class="role-row"><legend class="sr-only">Role for ${esc(m.name)}</legend>
    <div class="role-who"><i class="monkey-face ${esc(m.faceClass)}" aria-hidden="true"></i><b class="role-name">${esc(m.name)}</b><small class="role-part">${esc(m.part)}</small></div>
    <div class="pick-label" aria-hidden="true"><span class="pick-none">Not picked yet</span>${labels}</div>
    <div class="role-scale">${chips}</div>
    <div class="scale-ends" aria-hidden="true"><span>Honest</span><span>Villain</span></div></fieldset>`;
}

export function lineupPanel(v: LineupView): string {
  const roles = ordered(v.roles);
  const picked = v.cast.filter(m => v.picks[m.id]).length;
  const submit = v.busy ? 'Opening the answer…'
    : `Lock in verdict${v.hint && picked < v.cast.length ? `<small class="lock-count">${esc(picked)} of ${esc(v.cast.length)} picked</small>` : ''}`;
  const disabled = v.busy || v.hint;
  return `<form id="report-form" class="lineup-board">
  <header class="lineup-head">
    <div class="lineup-title"><span class="lineup-eyebrow">THE LINEUP · ${esc(v.title.toUpperCase())}</span><h1>Who played which part?</h1>
    <p>Pick a role for each ${esc(v.noun)}. Your team’s first verdict on this case is the one that counts.</p></div>
    <div class="lineup-stats"><div class="lineup-stat"><span>TIME</span><b data-elapsed>${esc(v.time)}</b></div><div class="lineup-stat"><span>COINS SPENT</span><b>${esc(v.spent)}</b></div></div>
  </header>
  <ul class="role-legend" aria-label="The four roles">${roles.map(r => `<li data-role="${esc(r.id)}"><span class="legend-swatch" aria-hidden="true"></span><b>${esc(r.label)}</b><span>${esc(r.hint)}</span></li>`).join('')}</ul>
  <div class="lineup-cards" style="--n:${v.cast.length}">${v.cast.map(m => card(m, roles, v.picks)).join('')}</div>
  <footer class="lineup-foot">
    <div class="lineup-controls">
      <div class="confidence" role="group" aria-label="How sure are you?"><span>How sure?</span>${CONFIDENCE.map(([n, label]) => `<label class="conf-chip"><input type="radio" name="confidence" value="${n}" ${v.confidence === n ? 'checked' : ''}><span>${label}</span></label>`).join('')}</div>
      <label class="sr-only" for="explanation">Why? Optional</label>
      <textarea id="explanation" rows="1" maxlength="500" placeholder="Why? (optional, one sentence)">${esc(v.explanation)}</textarea>
      <button class="lock-in" id="lock-in" type="submit" ${disabled ? 'disabled' : ''}>${submit}</button>
    </div>
    <button class="lineup-back" id="lineup-back" type="button">Back to the map</button>
  </footer>
</form>`;
}
