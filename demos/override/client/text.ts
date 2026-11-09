import { escape } from './html.ts';
import accuseText from './text/accuse.json' with { type: 'json' };
import boardText from './text/board.json' with { type: 'json' };
import debriefText from './text/debrief.json' with { type: 'json' };
import dialogueText from './text/dialogue.json' with { type: 'json' };
import hudText from './text/hud.json' with { type: 'json' };
import lineupText from './text/lineup.json' with { type: 'json' };
import mainText from './text/main.json' with { type: 'json' };
import notebookText from './text/notebook.json' with { type: 'json' };
import roundtableText from './text/roundtable.json' with { type: 'json' };
import splashText from './text/splash.json' with { type: 'json' };
import stationText from './text/station.json' with { type: 'json' };
import talkText from './text/talk.json' with { type: 'json' };
import teamText from './text/team.json' with { type: 'json' };
import toolsText from './text/tools.json' with { type: 'json' };
import worldsText from './text/worlds.json' with { type: 'json' };

/** UI text: the shipped defaults, then the admin's edits on top. Keys look like `hud.team`. */
const DEFAULTS: Record<string, string> = { ...accuseText, ...boardText, ...debriefText, ...dialogueText, ...hudText, ...lineupText, ...mainText, ...notebookText, ...roundtableText, ...splashText, ...stationText, ...talkText, ...teamText, ...toolsText, ...worldsText };
let overrides: Record<string, string> = {};

const raw = (key: string): string => overrides[key] ?? DEFAULTS[key] ?? key;

const fill = (template: string, vars: Record<string, unknown>, encode: (value: unknown) => string): string =>
  template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? encode(vars[name]) : whole));

/** HTML-safe text: the template and every variable are escaped, so the result goes straight into markup. */
export function t(key: string, vars: Record<string, unknown> = {}): string {
  return fill(escape(raw(key)), vars, escape);
}

/** Raw text for textContent, attributes you escape yourself, and data. */
export function plain(key: string, vars: Record<string, unknown> = {}): string {
  return fill(raw(key), vars, value => String(value ?? ''));
}

const form = (key: string, count: number): string => `${key}.${count === 1 ? 'one' : 'other'}`;

/** Plural, HTML-safe: `key.one` for 1, `key.other` otherwise; `{count}` is filled in. */
export function tn(key: string, count: number, vars: Record<string, unknown> = {}): string {
  return t(form(key, count), { count, ...vars });
}

/** Plural, raw. */
export function plainTn(key: string, count: number, vars: Record<string, unknown> = {}): string {
  return plain(form(key, count), { count, ...vars });
}

/** Replaces the admin's edits; non-string values are ignored. */
export function setText(next: Record<string, unknown>): void {
  overrides = {};
  for (const [key, value] of Object.entries(next ?? {})) if (typeof value === 'string') overrides[key] = value;
}

/** Fetches the admin's edits once at boot. Any failure or delay past `timeoutMs` keeps the defaults. */
export async function loadText(fetchFn: (url: string) => Promise<any> = (url) => fetch(url), timeoutMs = 1500): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const reply = await Promise.race([
      fetchFn('/api/text'),
      new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), timeoutMs); }),
    ]);
    if (!reply || !reply.ok) return;
    const body = await Promise.race([reply.json(), new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), timeoutMs); })]);
    if (body && typeof body.text === 'object' && body.text) setText(body.text);
  } catch { /* defaults stay */ } finally { if (timer) clearTimeout(timer); }
}
