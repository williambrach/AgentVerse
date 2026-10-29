import type { Leaderboard, LeaderboardRow } from './types.ts';

const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

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

export function clock(ms: number): string {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
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

const pts = (n: number) => `${n} ${n === 1 ? 'pt' : 'pts'}`;
const coinsText = (n: number) => `${n} ${n === 1 ? 'coin' : 'coins'}`;

function row(r: LeaderboardRow): string {
  return `<tr class="board-row${r.you ? ' you' : ''}"><td class="board-rank">${r.rank == null ? 'Playing' : esc(r.rank)}</td>` +
    `<td class="board-name">${esc(r.name)}</td><td>${esc(pts(r.points))}</td>` +
    `<td>${esc(clock(r.timeMs))}</td><td>${esc(coinsText(r.coins))}</td></tr>`;
}

export function leaderboardPanel(board: Pick<Leaderboard, 'rankBy' | 'teams'>): string {
  const note = `<p class="fine-print">Each case scores once per team: your first guess counts.</p>`;
  if (!board.teams.length) return `<p class="board-empty">No team has finished a case yet.</p>${note}`;
  const caption = board.rankBy === 'coins' ? 'Ties by coins' : 'Ties by time';
  return `<table class="board-table"><caption>${caption}</caption>` +
    `<thead><tr><th>Rank</th><th>Team</th><th>Points</th><th>Time</th><th>Coins</th></tr></thead>` +
    `<tbody>${board.teams.map(row).join('')}</tbody></table>${note}`;
}
