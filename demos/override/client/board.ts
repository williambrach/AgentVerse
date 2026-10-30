import type { Board, BoardCase, BoardCell, LeaderboardRow } from './types.ts';

const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

export const EMPTY = 'No team has finished a case yet.';
const MAX_ROWS = 10;

export function clock(ms: number): string {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

const pts = (n: number) => `${n} ${n === 1 ? 'pt' : 'pts'}`;
const coinsText = (n: number) => `${n} ${n === 1 ? 'coin' : 'coins'}`;

function cell(c: BoardCase, cells: BoardCell[]): string {
  const hit = cells.find(x => x.caseId === c.id);
  const state = hit?.state || 'none';
  const text = state === 'playing' ? '…' : state === 'none' ? '' : state === 'zero' ? '0' : String(hit?.points ?? 0);
  const label = state === 'none' ? 'not played' : state === 'playing' ? 'playing now' : `${text} of ${c.total}`;
  return `<span class="cell ${esc(state)}" title="${esc(`${c.title}: ${label}`)}"><span class="sr-only">${esc(`${c.title}: ${label}`)}</span><span aria-hidden="true">${esc(text)}</span></span>`;
}

/** One team row, shared by the overlay table and the projector screen. `bare` drops the units: the screen's column heads name them. */
export function boardRow(r: LeaderboardRow, cases: BoardCase[], unranked: string, bare = false): string {
  const cells = cases.length ? `<td class="board-cells">${cases.map(c => cell(c, r.cells || [])).join('')}</td>` : '';
  return `<tr class="board-row${r.you ? ' you' : ''}"><td class="board-rank">${r.rank == null ? esc(unranked) : esc(r.rank)}</td>` +
    `<td class="board-name">${esc(r.name)}</td>${cells}<td class="board-points">${esc(bare ? r.points : pts(r.points))}</td>` +
    `<td>${esc(clock(r.timeMs))}</td><td>${esc(bare ? r.coins : coinsText(r.coins))}</td></tr>`;
}

export function boardScreen(b: Board): string {
  const cases = b.cases || [];
  const shown = b.teams.slice(0, MAX_ROWS);
  const more = b.teams.length - shown.length;
  const tie = b.rankBy === 'coins' ? 'ties by coins' : 'ties by time';
  const sub = b.round ? `LEADERBOARD · ${esc(String(b.round).toUpperCase())}` : 'LEADERBOARD';
  const head = cases.length ? `<th scope="col">${cases.map((_, i) => `<span class="cell-num">${i + 1}</span>`).join('')}</th>` : '';
  const table = shown.length
    ? `<table class="board-table"><thead><tr><th scope="col">#</th><th scope="col">TEAM</th>${head}<th scope="col">POINTS</th><th scope="col">TIME</th><th scope="col">COINS</th></tr></thead><tbody>${shown.map(r => boardRow({ ...r, you: false }, cases, '—', true)).join('')}</tbody></table>`
    : `<p class="board-empty">${EMPTY}</p>`;
  const key = cases.map((c, i) => `<span class="legend-case"><b>${i + 1}</b>${esc(c.title)}</span>`).join('');
  return `<div class="board-screen">
  <header class="board-head"><div class="board-title"><h1>THE ARBITER</h1><span class="board-sub">${sub}</span></div>
    <div class="board-counts"><div><b>${esc(b.teams.length)}</b><span>TEAMS</span></div><div><b>${esc(cases.length)}</b><span>CASES</span></div></div></header>
  <section class="board-standings" aria-label="Standings">${table}</section>
  <footer class="board-foot"><span class="legend-cases">${key}</span>
    <span class="legend-key"><i class="key perfect" aria-hidden="true"></i>every role right</span>
    <span class="legend-key"><i class="key partial" aria-hidden="true"></i>some right</span>
    <span class="legend-key"><i class="key playing" aria-hidden="true"></i>playing now</span>
    ${more > 0 ? `<span class="board-more">+ ${more} more team${more === 1 ? '' : 's'} · ${tie}</span>` : ''}</footer>
</div>`;
}
