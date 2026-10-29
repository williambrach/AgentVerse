import type { Economy, Inspection, ThreadLine, Tool } from './types.ts';

const esc = (s: unknown): string => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

export const HINTS: Record<'coins' | Tool, string> = {
  coins: 'Every question and tool costs coins.',
  ask: 'Ask one question; only this character hears it.',
  inspect: 'See how this character reasoned about their last line. Rare.',
  continue: 'The three talk among themselves for 3 lines; they never see your questions.',
};

/** "1 question", "2 questions". */
export const pluralise = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

const plural = (n: number): string => pluralise(n, 'coin');

export function coinLabel(e: Economy): string {
  return e.budget == null ? plural(e.spent) : `${e.spent} / ${e.budget} coins`;
}

function left(e: Economy, tool: Tool): number | null {
  if (tool === 'ask') return null;
  const c = e.charges[tool];
  return c.max - c.used;
}

export function toolChip(e: Economy, tool: Tool): string {
  const n = left(e, tool);
  if (n === 0) return '0 left';
  const cost = plural(e.costs[tool]);
  return n == null ? cost : `${cost} · ${n} left`;
}

/** Mirrors the server: charges first, then budget, then the reserve for asking everyone. Cost is the sum over `tools`. */
export function toolsBlock(e: Economy, tools: Tool[], reserve: number): { enabled: boolean; reason: string | null } {
  if (tools.some(t => left(e, t) === 0)) return { enabled: false, reason: '0 left' };
  if (e.budget != null) {
    const remaining = e.budget - e.spent;
    const cost = tools.reduce((sum, t) => sum + e.costs[t], 0);
    if (cost > remaining) return { enabled: false, reason: 'Not enough coins' };
    if (remaining - cost < reserve) return { enabled: false, reason: 'Save coins to ask everyone' };
  }
  return { enabled: true, reason: null };
}

export function toolBlock(e: Economy, tool: Tool, reserve: number): { enabled: boolean; reason: string | null } {
  return toolsBlock(e, [tool], reserve);
}

export function reasoningBlock(i: Inspection, name: string): string {
  return `<article class="speech reasoning" data-motion-key="reasoning-${esc(i.sourceEventId)}">` +
    `<h4>${esc(name)}’s reasoning</h4><p>${esc(i.reasoning)}</p></article>`;
}

export function threadPanel(thread: ThreadLine[], names: Record<string, string>, pending: number): string {
  const posts = thread.map((l, n) =>
    `<li class="thread-post" data-motion-key="thread-${n + 1}"><h4 class="thread-author">#${n + 1} ${esc(names[l.character] ?? l.character)}</h4>` +
    `<p>${esc(l.text)}</p></li>`).join('');
  const wait = pending > 0 ? `<li class="thread-pending" aria-live="polite">${esc(pending)} more coming…</li>` : '';
  return `<section class="thread-panel"><div class="panel-heading"><span class="eyebrow">THE THREE TALK</span><h2>The agents’ thread</h2></div>` +
    `<div class="notebook-content"><ol id="thread-log" role="log" aria-live="polite">${posts}${wait}</ol>` +
    `<p class="fine">They see each other’s earlier lines, never your questions.</p></div></section>`;
}
