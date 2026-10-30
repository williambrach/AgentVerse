import type { Economy, Inspection, ThreadLine, Tool } from './types.ts';
import { escape as esc, svg as baseSvg } from './html.ts';

export const HINTS: Record<'coins' | Tool, string> = {
  coins: 'Every question and tool costs coins.',
  ask: 'Ask one question; only this character hears it.',
  inspect: 'See how this character reasoned about their last line. Rare.',
  continue: 'They talk among themselves for 3 lines; they never see your questions.',
};

type ArbiterTool = 'inspect' | 'continue';

/** The Arbiter tools in toolbelt order. */
export const ARBITER_TOOLS: { tool: ArbiterTool; name: string; icon: string; does: string }[] = [
  { tool: 'inspect', name: 'Inspect reasoning', icon: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5.5 5.5M8 10.5h5"/>', does: 'See how one character reasoned about their last line.' },
  { tool: 'continue', name: 'Let them talk', icon: '<path d="M3.5 5h11v8h-7l-4 3.5zM14.5 9h6v8.5l-3-2.5h-6v-2"/>', does: 'They talk among themselves; you read along in the thread.' },
];

const svg = (path: string): string => baseSvg(path, 18, 1.6);
const toolOf = (tool: ArbiterTool) => ARBITER_TOOLS.find(t => t.tool === tool)!;

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

/** The briefing's list of Arbiter tools with their prices. */
export function toolGuide(e: Economy): string {
  const rows = ARBITER_TOOLS.map(t => `<li><span class="tool-icon">${svg(t.icon)}</span><span class="tool-text"><b>${esc(t.name)}</b><small>${esc(t.does)}</small></span>` +
    `<em>${esc(plural(e.costs[t.tool]))} · ${esc(pluralise(e.charges[t.tool].max, 'use'))}</em></li>`).join('');
  return `<ul class="tool-guide">${rows}</ul>`;
}

export interface ToolCard {
  tool: ArbiterTool; id: string; label: string;
  /** Who the tool acts on, shown before the chip. */
  target: string;
  /** The price and uses left, or why the tool is off. */
  chip: string;
  /** Usable now; a card that is not is drawn greyed out. */
  enabled: boolean;
  /** Another action is running: the button is disabled but the card keeps its look. */
  busy: boolean;
  /** Ready and never used yet: the card calls for attention. */
  fresh: boolean;
  /** A second control, drawn above the card's stretched button. */
  extra?: string;
}

/** One Arbiter tool in the toolbelt. The chip sits outside the button so the button's text is only its label. */
export function toolCard(c: ToolCard): string {
  return `<div class="tool-card${c.enabled ? '' : ' off'}${c.fresh ? ' fresh' : ''}" data-card="${c.tool}">` +
    `<span class="tool-icon">${svg(toolOf(c.tool).icon)}</span>` +
    `<span class="tool-text"><button class="tool-button" id="${esc(c.id)}" type="button" aria-describedby="tip-${c.tool}"${c.enabled && !c.busy ? '' : ' disabled'}>${esc(c.label)}</button>` +
    `<span class="tool-status">${c.target ? `<span class="tool-target">${esc(c.target)}</span>` : ''}<span class="tool-chip" data-tool="${c.tool}">${esc(c.chip)}</span></span></span>` +
    (c.fresh ? '<span class="tool-new" aria-hidden="true">NEW</span>' : '') + (c.extra ?? '') +
    `<span class="tool-tipbox" id="tip-${c.tool}" role="tooltip">${esc(HINTS[c.tool])}</span></div>`;
}

export function reasoningBlock(i: Inspection, name: string): string {
  return `<article class="speech reasoning" data-motion-key="reasoning-${esc(i.sourceEventId)}">` +
    `<h4>${esc(name)}’s reasoning</h4><p>${esc(i.reasoning)}</p></article>`;
}

/** Inspect's answer when the character's latest line has no reasoning. */
export function noThoughtBlock(name: string, line: number): string {
  return `<article class="speech reasoning no-thought" data-motion-key="no-thought-${line}">` +
    `<h4>${esc(name)}’s reasoning</h4><p>${esc(name)} did not think. No coins spent.</p></article>`;
}

export function threadPanel(thread: ThreadLine[], names: Record<string, string>, pending: number): string {
  const posts = thread.map((l, n) =>
    `<li class="thread-post" data-motion-key="thread-${n + 1}"><h4 class="thread-author">#${n + 1} ${esc(names[l.character] ?? l.character)}</h4>` +
    `<p>${esc(l.text)}</p></li>`).join('');
  const wait = pending > 0 ? `<li class="thread-pending" aria-live="polite">${esc(pending)} more coming…</li>` : '';
  return `<section class="thread-panel"><div class="panel-heading"><span class="eyebrow">ARBITER TOOL · LET THEM TALK</span><h2>The agents’ thread</h2></div>` +
    `<div class="notebook-content"><ol id="thread-log" role="log" aria-live="polite">${posts}${wait}</ol>` +
    `<p class="fine">They see each other’s earlier lines, never your questions.</p></div></section>`;
}
