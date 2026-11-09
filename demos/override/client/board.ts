import type { Board, BoardCase, BoardCell, LeaderboardRow } from './types.ts';
import { escape as esc, mmss } from './html.ts';
import { plain, plainTn, t, tn } from './text.ts';

/** Read at use time so the admin's edit applies. */
export const empty = (): string => t('board.empty');
const MAX_ROWS = 10;

export function clock(ms: number): string {
  return mmss(Math.floor((Number(ms) || 0) / 1000));
}

const pts = (n: number) => plainTn('board.pts', n);
const coinsText = (n: number) => plainTn('board.coinsCount', n);

function cell(c: BoardCase, cells: BoardCell[]): string {
  const hit = cells.find(x => x.caseId === c.id);
  const state = hit?.state || 'none';
  const text = state === 'playing' ? '…' : state === 'none' ? '' : state === 'zero' ? '0' : String(hit?.points ?? 0);
  const label = state === 'none' ? plain('board.cell.none') : state === 'playing' ? plain('board.cell.playing') : plain('board.cell.score', { text, total: c.total });
  return `<span class="cell ${esc(state)}" title="${esc(plain('board.cell.title', { title: c.title, label }))}"><span class="sr-only">${esc(plain('board.cell.title', { title: c.title, label }))}</span><span aria-hidden="true">${esc(text)}</span></span>`;
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
  const tie = b.rankBy === 'coins' ? plain('board.tie.coins') : plain('board.tie.time');
  const sub = b.round ? t('board.sub.round', { round: String(b.round).toUpperCase() }) : t('board.sub');
  const head = cases.length ? `<th scope="col">${cases.map((_, i) => `<span class="cell-num">${i + 1}</span>`).join('')}</th>` : '';
  const table = shown.length
    ? `<table class="board-table"><thead><tr><th scope="col">${t('board.col.rank')}</th><th scope="col">${t('board.col.team')}</th>${head}<th scope="col">${t('board.col.points')}</th><th scope="col">${t('board.col.time')}</th><th scope="col">${t('board.col.coins')}</th></tr></thead><tbody>${shown.map(r => boardRow({ ...r, you: false }, cases, plain('board.unranked'), true)).join('')}</tbody></table>`
    : `<p class="board-empty">${empty()}</p>`;
  const key = cases.map((c, i) => `<span class="legend-case"><b>${i + 1}</b>${esc(c.title)}</span>`).join('');
  return `<div class="board-screen">
  <header class="board-head"><div class="board-title"><h1>${t('board.title')}</h1><span class="board-sub">${sub}</span></div>
    <div class="board-counts"><div><b>${esc(b.teams.length)}</b><span>${t('board.teams')}</span></div><div><b>${esc(cases.length)}</b><span>${t('board.cases')}</span></div></div></header>
  <section class="board-standings" aria-label="${t('board.standings')}">${table}</section>
  <footer class="board-foot"><span class="legend-cases">${key}</span>
    <span class="legend-key"><i class="key perfect" aria-hidden="true"></i>${t('board.legend.perfect')}</span>
    <span class="legend-key"><i class="key partial" aria-hidden="true"></i>${t('board.legend.partial')}</span>
    <span class="legend-key"><i class="key playing" aria-hidden="true"></i>${t('board.legend.playing')}</span>
    ${more > 0 ? `<span class="board-more">${tn('board.more', more, { tie })}</span>` : ''}</footer>
</div>`;
}
