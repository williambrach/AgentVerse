import type { Economy, Inspection, ThreadLine, Tool } from './types.ts';
import { escape as esc, svg as baseSvg } from './html.ts';
import { plain, plainTn, t, tn } from './text.ts';

/** Raw tooltip texts; read at use time so the admin's edits apply. */
export const HINTS: Record<'coins' | Tool, string> = {
  get coins() { return plain('tools.hint.coins'); },
  get ask() { return plain('tools.hint.ask'); },
  get inspect() { return plain('tools.hint.inspect'); },
  get continue() { return plain('tools.hint.continue'); },
};

/** The coin counter's tooltip; in a talk case only typed questions cost coins. */
export function coinHint(talk: boolean): string {
  return talk ? plain('tools.hint.coinsTalk') : HINTS.coins;
}

/** Why a tool card is off in a case that does not use that tool. */
/** The same text read at use time, so the admin's edit applies. */
export const notInCase = (): string => plain('tools.notInCase');

type ArbiterTool = 'inspect' | 'continue';

/** The Arbiter tools in toolbelt order. */
export const ARBITER_TOOLS: { tool: ArbiterTool; name: string; icon: string; does: string }[] = [
  { tool: 'inspect', get name() { return plain('tools.inspect'); }, icon: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5.5 5.5M8 10.5h5"/>', get does() { return plain('tools.inspect.does'); } },
  { tool: 'continue', get name() { return plain('tools.talk'); }, icon: '<path d="M3.5 5h11v8h-7l-4 3.5zM14.5 9h6v8.5l-3-2.5h-6v-2"/>', get does() { return plain('tools.talk.does'); } },
];

const svg = (path: string): string => baseSvg(path, 18, 1.6);
const toolOf = (tool: ArbiterTool) => ARBITER_TOOLS.find(t => t.tool === tool)!;

/** "1 question", "2 questions". */
export const pluralise = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

const plural = (n: number): string => plainTn('tools.coin', n);

export function coinLabel(e: Economy): string {
  return e.budget == null ? plural(e.spent) : plain('tools.coinsOf', { spent: e.spent, budget: e.budget });
}

function left(e: Economy, tool: Tool): number | null {
  if (tool === 'ask') return null;
  const c = e.charges[tool];
  return c.max - c.used;
}

export function toolChip(e: Economy, tool: Tool): string {
  const n = left(e, tool);
  if (n === 0) return plain('tools.none');
  const cost = plural(e.costs[tool]);
  return n == null ? cost : plain('tools.chipLeft', { cost, n });
}

/** Mirrors the server: charges first, then budget, then the reserve for asking everyone. Cost is the sum over `tools`. */
export function toolsBlock(e: Economy, tools: Tool[], reserve: number): { enabled: boolean; reason: string | null } {
  if (tools.some(t => left(e, t) === 0)) return { enabled: false, reason: plain('tools.none') };
  if (e.budget != null) {
    const remaining = e.budget - e.spent;
    const cost = tools.reduce((sum, t) => sum + e.costs[t], 0);
    if (cost > remaining) return { enabled: false, reason: plain('tools.notEnough') };
    if (remaining - cost < reserve) return { enabled: false, reason: plain('tools.saveCoins') };
  }
  return { enabled: true, reason: null };
}

export function toolBlock(e: Economy, tool: Tool, reserve: number): { enabled: boolean; reason: string | null } {
  return toolsBlock(e, [tool], reserve);
}

/** The briefing's list of Arbiter tools with their prices. */
export function toolGuide(e: Economy): string {
  const rows = ARBITER_TOOLS.map(t => `<li><span class="tool-icon">${svg(t.icon)}</span><span class="tool-text"><b>${esc(t.name)}</b><small>${esc(t.does)}</small></span>` +
    `<em>${esc(plural(e.costs[t.tool]))} · ${tn('tools.use', e.charges[t.tool].max)}</em></li>`).join('');
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
    (c.fresh ? `<span class="tool-new" aria-hidden="true">${t('tools.new')}</span>` : '') + (c.extra ?? '') +
    `<span class="tool-tipbox" id="tip-${c.tool}" role="tooltip">${esc(HINTS[c.tool])}</span></div>`;
}

export function reasoningBlock(i: Inspection, name: string): string {
  return `<article class="speech reasoning" data-motion-key="reasoning-${esc(i.sourceEventId)}">` +
    `<h4>${t('tools.reasoning', { name })}</h4><p>${esc(i.reasoning)}</p></article>`;
}

/** The reasoning card while a stream runs; tokens are written into `[data-stream="reasoning"]` by textContent. */
export function liveReasoningBlock(name: string, text: string): string {
  return `<article class="speech reasoning live" data-motion-key="reasoning-live">` +
    `<h4>${t('tools.reasoning.live', { name })}</h4><p data-stream="reasoning" aria-live="off">${esc(text)}</p></article>`;
}

/** Inspect's answer when the character's latest line has no reasoning. */
export function noThoughtBlock(name: string, line: number): string {
  return `<article class="speech reasoning no-thought" data-motion-key="no-thought-${line}">` +
    `<h4>${t('tools.reasoning', { name })}</h4><p>${t('tools.noThought', { name })}</p></article>`;
}

/**
 * `faces` maps a character id to its portrait classes (e.g. `maya slot-0`); a post whose speaker has one shows that head beside it, chat style.
 * `live` is the talk line still being typed: one extra post (patched in place by the stream) before the pending note.
 */
export function threadPanel(thread: ThreadLine[], names: Record<string, string>, pending: number, note = plain('tools.thread.note'), faces: Record<string, string> = {}, live?: { character: string; text: string }): string {
  const head = (id: string) => faces[id] ? `<span class="thread-face" aria-hidden="true"><i class="monkey-face ${esc(faces[id])}"></i></span>` : '';
  const posts = thread.map((l, n) =>
    `<li class="thread-post" data-motion-key="thread-${n + 1}">${head(l.character)}<h4 class="thread-author">#${n + 1} ${esc(names[l.character] ?? l.character)}</h4>` +
    `<p>${esc(l.text)}</p></li>`).join('');
  const typing = live ? `<li class="thread-post streaming" data-motion-key="thread-${thread.length + 1}" data-stream-bubble>${head(live.character)}<h4 class="thread-author">#${thread.length + 1} ${esc(names[live.character] ?? live.character)}</h4>` +
    `<p class="stream-line"><span data-stream="answer">${esc(live.text)}</span><i class="stream-caret" aria-hidden="true"></i></p></li>` : '';
  const wait = pending > 0 ? `<li class="thread-pending" aria-live="polite">${t('tools.thread.pending', { n: pending })}</li>` : '';
  return `<section class="thread-panel"><div class="panel-heading"><span class="eyebrow">${t('tools.thread.eyebrow')}</span><h2>${t('tools.thread.title')}</h2></div>` +
    `<div class="notebook-content"><ol id="thread-log" role="log" aria-live="polite">${posts}${typing}${wait}</ol>` +
    `<p class="fine">${esc(note)}</p></div></section>`;
}

/** The three briefing steps of a talk case; the stock steps (one question each, tools, roles) do not fit it. */
export function talkBriefingSteps(): { title: string; text: string }[] {
  return [
    { title: plain('tools.steps.ask.title'), text: plain('tools.steps.ask.text') },
    { title: plain('tools.steps.save.title'), text: plain('tools.steps.save.text') },
    { title: plain('tools.steps.accuse.title'), text: plain('tools.steps.accuse.text') },
  ];
}

/** The briefing's step list for a talk case, in the stock `task-list` markup. */
export function talkBriefingList(): string {
  return `<ol class="task-list">${talkBriefingSteps().map(s => `<li><b>${esc(s.title)}</b><span>${esc(s.text)}</span></li>`).join('')}</ol>`;
}

/** The rail verdict button of a talk case: its title and the saved-quote count line. */
export function talkVerdictLabel(quotes: number): { title: string; progress: string } {
  return { title: plain('tools.verdictTitle'), progress: plainTn('tools.quotes', quotes) };
}
