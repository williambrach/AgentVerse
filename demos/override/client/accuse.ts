import { escape as esc } from './html.ts';
import { t } from './text.ts';

export interface AccuseCharacter { id: string; name: string; role: string }
export interface AccuseQuote { id: string; line: string; character: string; text: string; at: string }
export interface AccuseRecord { id: string; character: string; quotes: string[]; at: string; feedback: string; denial: string }
export interface AccuseView {
  characters: AccuseCharacter[]; quotes: AccuseQuote[]; accusations: AccuseRecord[];
  draft: { character: string | null; quotes: string[] }; copy: { title: string; description: string }; busy: boolean;
}

export const MAX_ACCUSE_QUOTES = 3;

/** The draft's quote ids that are still saved and belong to the drafted person; a removed quote drops out. */
export function liveDraftQuotes(draft: { character: string | null; quotes: string[] }, quotes: AccuseQuote[]): string[] {
  return draft.quotes.filter(id => quotes.some(q => q.id === id && q.character === draft.character));
}

export function accusePanel(v: AccuseView): string {
  const nameOf = (id: string) => v.characters.find(c => c.id === id)?.name || id;
  const who = v.draft.character;
  const picked = new Set(liveDraftQuotes(v.draft, v.quotes));
  const mine = who ? v.quotes.filter(q => q.character === who) : [];
  const full = picked.size >= MAX_ACCUSE_QUOTES;
  const suspects = v.characters.map(c => `<label class="accuse-suspect"><input type="radio" name="accuse-character" value="${esc(c.id)}"${who === c.id ? ' checked' : ''}><span class="monkey-face ${esc(c.id)}" aria-hidden="true"></span><span><b>${esc(c.name)}</b><small>${esc(c.role)}</small></span></label>`).join('');
  const list = !who ? '' : mine.length
    ? `<ul class="accuse-quotes">${mine.map(q => {
      const on = picked.has(q.id);
      return `<li><label class="accuse-quote"><input type="checkbox" name="accuse-quote" value="${esc(q.id)}"${on ? ' checked' : ''}${!on && full ? ' disabled' : ''}><span>“${esc(q.text)}”</span></label></li>`;
    }).join('')}</ul>`
    : `<p class="accuse-empty">${t('accuse.empty', { name: nameOf(who) })}</p>`;
  const ready = !!who && picked.size >= 1 && picked.size <= MAX_ACCUSE_QUOTES && !v.busy;
  const last = v.accusations[v.accusations.length - 1];
  const earlier = v.accusations.slice(0, -1);
  const feedback = last
    ? `<div class="accuse-feedback" data-accusation="${esc(last.id)}"><p><b>${esc(nameOf(last.character))}:</b> “${esc(last.denial)}”</p><p>${esc(last.feedback)}</p>${earlier.length ? `<small>${t('accuse.earlier', { names: earlier.map(a => nameOf(a.character)).join(', ') })}</small>` : ''}</div>`
    : '';
  return `<div class="accuse-panel"><div class="panel-heading"><h2>${esc(v.copy.title)}</h2><p>${esc(v.copy.description)}</p></div>
  <div class="accuse-suspects">${suspects}</div>${list}${feedback}
  <div class="accuse-actions"><button type="button" id="accuse-submit"${ready ? '' : ' disabled'}>${t('accuse.submit')}</button><button type="button" id="accuse-back">${t('accuse.back')}</button></div></div>`;
}
