import { escape as esc } from './html.ts';

export interface WordToken { i: number; word: string; start: number; end: number }
export interface Quote { id: string; line?: string; character: string; text: string; at?: string }
export interface QuoteCharacter { id: string; name: string; role: string }

/** Words are runs of letters, digits, apostrophes and hyphens. */
export function wordTokens(text: string): WordToken[] {
  const out: WordToken[] = [];
  for (const m of String(text ?? '').matchAll(/[\p{L}\p{N}'’-]+/gu)) out.push({ i: out.length, word: m[0], start: m.index!, end: m.index! + m[0].length });
  return out;
}

/** The text from the first picked word to the last, original separators kept. */
export function excerptOf(text: string, a: number, b: number): string {
  const toks = wordTokens(text);
  if (!toks.length) return '';
  const lo = Math.max(0, Math.min(a, b)), hi = Math.min(toks.length - 1, Math.max(a, b));
  if (lo > hi) return '';
  return text.slice(toks[lo]!.start, toks[hi]!.end);
}

export function quotesPanel(quotes: Quote[], characters: QuoteCharacter[]): string {
  const head = '<div class="panel-heading"><span class="eyebrow">YOUR NOTEBOOK</span><h2>Quotes</h2></div>';
  if (!quotes.length) return `${head}<div class="notebook-content quotes-content"><div class="subtle-note quotes-empty">No quotes yet. Press Save quote under a line to keep it here.</div></div>`;
  const groups = characters.map(c => {
    const mine = quotes.filter(q => q.character === c.id);
    if (!mine.length) return '';
    return `<section class="quote-group" data-character="${esc(c.id)}"><h3 class="quote-head"><span class="monkey-face ${esc(c.id)}" aria-hidden="true"></span><b class="quote-name">${esc(c.name)}</b> <span class="role">${esc(c.role)}</span></h3><ul class="quote-list">${mine.map(q => `<li><blockquote>“${esc(q.text)}”</blockquote><button type="button" class="quote-remove" data-unquote="${esc(q.id)}">Remove</button></li>`).join('')}</ul></section>`;
  }).join('');
  return `${head}<div class="notebook-content quotes-content">${groups}</div>`;
}
