import type { Leaderboard } from './types.ts';
import { boardRow, clock, EMPTY } from './board.ts';
import { escape as esc } from './html.ts';

export { clock };

export const NAME_ERROR = 'Team names are 2 to 24 letters, numbers and spaces.';

/** Mirrors the server name rule: trimmed, whitespace collapsed, NFC, 2-24 chars, letters/digits/spaces and ' ’ & . - ! ? #, first char a letter or digit. */
export function teamNameError(raw: string): string | null {
  const name = String(raw ?? '').trim().replace(/\s+/g, ' ').normalize('NFC');
  const length = [...name].length;
  if (length < 2 || length > 24) return NAME_ERROR;
  if (!/^[\p{L}\p{N}]/u.test(name)) return NAME_ERROR;
  if (!/^[\p{L}\p{N} '’&.\-!?#]+$/u.test(name)) return NAME_ERROR;
  return null;
}

export interface GateView { name: string; error: string; taken: string | null; busy: boolean; switching: boolean }

export function teamGate(view: GateView): string {
  const dis = view.busy ? ' disabled' : '';
  const taken = view.taken
    ? `<div class="team-taken"><p>“${esc(view.taken)}” is already playing.</p>` +
      `<button type="button" id="team-join" class="primary-button"${dis}>Join ${esc(view.taken)}</button>` +
      `<button type="button" id="team-other" class="secondary-button"${dis}>Pick another name</button></div>`
    : '';
  const cancel = view.switching ? `<button type="button" id="team-cancel" class="secondary-button">Cancel</button>` : '';
  return `<div class="reset-card team-gate"><span class="eyebrow">TEAM CHECK-IN</span><h2>Who’s playing?</h2>` +
    `<p class="team-hint">One screen per team. Type the same name on another screen to join your team.</p>` +
    `<form id="team-form" class="team-form" novalidate><label for="team-name">Team name</label>` +
    `<input id="team-name" name="team" type="text" maxlength="24" autocomplete="off" value="${esc(view.name)}">` +
    `<p id="team-error" class="team-error" role="alert">${esc(view.error)}</p>${taken}` +
    `<div class="team-actions">${cancel}<button type="submit" id="team-submit" class="primary-button"${dis}>Start playing</button></div></form></div>`;
}

export function leaderboardPanel(board: Pick<Leaderboard, 'rankBy' | 'teams' | 'cases'>): string {
  const note = `<p class="fine-print">Each case scores once per team: your first guess counts.</p>`;
  if (!board.teams.length) return `<p class="board-empty">${EMPTY}</p>${note}`;
  const caption = board.rankBy === 'coins' ? 'Ties by coins' : 'Ties by time';
  const cases = board.cases || [];
  const head = cases.length ? `<th>Cases</th>` : '';
  return `<table class="board-table"><caption>${caption}</caption>` +
    `<thead><tr><th>Rank</th><th>Team</th>${head}<th>Points</th><th>Time</th><th>Coins</th></tr></thead>` +
    `<tbody>${board.teams.map(r => boardRow(r, cases, 'Playing')).join('')}</tbody></table>${note}`;
}
