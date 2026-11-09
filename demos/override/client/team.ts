import type { Leaderboard } from './types.ts';
import { boardRow, clock, empty } from './board.ts';
import { escape as esc } from './html.ts';
import { plain, t } from './text.ts';

export { clock };

/** Read at use time so the admin's edit applies. */
export const nameError = (): string => plain('team.nameError');

/** Mirrors the server name rule: trimmed, whitespace collapsed, NFC, 2-24 chars, letters/digits/spaces and ' ’ & . - ! ? #, first char a letter or digit. */
export function teamNameError(raw: string): string | null {
  const name = String(raw ?? '').trim().replace(/\s+/g, ' ').normalize('NFC');
  const length = [...name].length;
  if (length < 2 || length > 24) return nameError();
  if (!/^[\p{L}\p{N}]/u.test(name)) return nameError();
  if (!/^[\p{L}\p{N} '’&.\-!?#]+$/u.test(name)) return nameError();
  return null;
}

export interface GateView { name: string; error: string; taken: string | null; busy: boolean; switching: boolean }

export function teamGate(view: GateView): string {
  const dis = view.busy ? ' disabled' : '';
  const taken = view.taken
    ? `<div class="team-taken"><p>${t('team.taken', { name: view.taken })}</p>` +
      `<button type="button" id="team-join" class="primary-button"${dis}>${t('team.join', { name: view.taken })}</button>` +
      `<button type="button" id="team-other" class="secondary-button"${dis}>${t('team.other')}</button></div>`
    : '';
  const cancel = view.switching ? `<button type="button" id="team-cancel" class="secondary-button">${t('team.cancel')}</button>` : '';
  return `<div class="reset-card team-gate"><span class="eyebrow">${t('team.eyebrow')}</span><h2>${t('team.title')}</h2>` +
    `<p class="team-hint">${t('team.hint')}</p>` +
    `<form id="team-form" class="team-form" novalidate><label for="team-name">${t('team.nameLabel')}</label>` +
    `<input id="team-name" name="team" type="text" maxlength="24" autocomplete="off" value="${esc(view.name)}">` +
    `<p id="team-error" class="team-error" role="alert">${esc(view.error)}</p>${taken}` +
    `<div class="team-actions">${cancel}<button type="submit" id="team-submit" class="primary-button"${dis}>${t('team.submit')}</button></div></form></div>`;
}

export function leaderboardPanel(board: Pick<Leaderboard, 'rankBy' | 'teams' | 'cases'>): string {
  const note = `<p class="fine-print">${t('team.note')}</p>`;
  if (!board.teams.length) return `<p class="board-empty">${empty()}</p>${note}`;
  const caption = board.rankBy === 'coins' ? t('team.ties.coins') : t('team.ties.time');
  const cases = board.cases || [];
  const head = cases.length ? `<th>${t('team.col.cases')}</th>` : '';
  return `<table class="board-table"><caption>${caption}</caption>` +
    `<thead><tr><th>${t('team.col.rank')}</th><th>${t('team.col.team')}</th>${head}<th>${t('team.col.points')}</th><th>${t('team.col.time')}</th><th>${t('team.col.coins')}</th></tr></thead>` +
    `<tbody>${board.teams.map(r => boardRow(r, cases, plain('team.playing'))).join('')}</tbody></table>${note}`;
}
