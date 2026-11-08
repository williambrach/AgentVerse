import { escape } from './html.ts';

/** The sponsor intro: each logo in turn on a white stage, then the title card. It plays once per browser before the access code or the team check-in. */

export const SPLASH_KEY = 'override.splash';

export interface Sponsor { id: string; name: string; src: string; label?: string }

/** Shown in this order. Swap a logo by replacing its file in public/sponsors/. `label` sets a name beside a logo that is only a mark. */
export const SPONSORS: Sponsor[] = [
  { id: 'dfm', name: 'Danish Foundation Models', src: '/sponsors/dfm.png' },
  { id: 'sdu', name: 'University of Southern Denmark (SDU)', src: '/sponsors/sdu.svg' },
  { id: 'ucloud', name: 'UCloud', src: '/sponsors/ucloud.svg', label: 'UCloud' },
];

/** `?splash=1` replays it, `?splash=0` skips it, and the big screen (`?view=board`) never shows it. */
export function wantSplash(search: URLSearchParams, seen: boolean): boolean {
  if (search.get('view') === 'board') return false;
  if (search.has('splash')) return search.get('splash') !== '0';
  return !seen;
}

/** Blocked storage counts as not seen, so the intro still plays, and it plays again next visit. */
export function splashSeen(): boolean {
  try { return localStorage.getItem(SPLASH_KEY) === 'seen'; } catch { return false; }
}

export function markSplashSeen() {
  try { localStorage.setItem(SPLASH_KEY, 'seen'); } catch { /* Storage blocked: the intro plays again next visit. */ }
}

const two = (n: number) => String(n).padStart(2, '0');

export function splashMarkup(sponsors: Sponsor[] = SPONSORS): string {
  const logos = sponsors.map(s => {
    const label = s.label ? `<span class="splash-label" aria-hidden="true">${escape(s.label)}</span>` : '';
    return `<figure class="splash-logo" data-sponsor="${escape(s.id)}"><img src="${escape(s.src)}" alt="${escape(s.name)}" decoding="async">${label}</figure>`;
  }).join('');
  const pips = sponsors.map(() => '<i class="splash-pip"></i>').join('');
  return `<section class="splash" id="splash" data-step="logos" aria-label="Intro">` +
    `<div class="splash-stage"><div class="splash-card">` +
    `<span class="splash-tab">With support from</span>` +
    `<div class="splash-stamp"><span>ARBITER · IMADA CUP</span><span class="splash-count" aria-hidden="true"><b>01</b> / ${two(sponsors.length)}</span></div>` +
    `<div class="splash-slot">${logos}</div><div class="splash-pips" aria-hidden="true">${pips}</div></div></div>` +
    `<div class="splash-title"><span class="splash-event">IMADA Cup</span><h1>Arbiter<span class="splash-dot">.</span></h1>` +
    `<p class="splash-tagline">Agents talk. Some of them lie. You are the judge.</p>` +
    `<p class="splash-press"><span class="splash-key">Press any key to start</span><span class="splash-tap">Tap to start</span></p></div>` +
    `<button type="button" class="splash-skip" id="splash-skip">Skip intro</button></section>`;
}

/** Keys that never skip: modifiers, Tab (moving focus to the skip button) and browser shortcuts such as Cmd+R. */
export function skipsSplash(event: Pick<KeyboardEvent, 'key' | 'repeat' | 'ctrlKey' | 'metaKey' | 'altKey'>): boolean {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return false;
  if (/^F\d{1,2}$/.test(event.key)) return false; // F5 reload, F12 devtools: never swallow them
  return !['Shift', 'Control', 'Alt', 'Meta', 'Tab', 'CapsLock', 'Fn'].includes(event.key);
}

const wait = (ms: number) => new Promise<void>(done => setTimeout(done, ms));

/** Renders the intro into `host` and resolves when the player leaves the title card. Any key or click during the logos jumps to the title card. */
export async function playSplash(host: HTMLElement, { slideMs = 1900, guardMs = 350 } = {}): Promise<void> {
  host.innerHTML = splashMarkup();
  const root = host.querySelector<HTMLElement>('#splash')!;
  const figures = [...root.querySelectorAll<HTMLElement>('.splash-logo')];
  const pips = [...root.querySelectorAll<HTMLElement>('.splash-pip')];
  const count = root.querySelector<HTMLElement>('.splash-count b');
  // A logo that has not decoded would fade in blank; wait a moment for all of them, never longer.
  const decoded = Promise.race([Promise.all([...root.querySelectorAll('img')].map(img => img.decode().catch(() => undefined))), wait(1500)]);

  // Input is live from the first frame, so a key pressed while the logos decode still skips.
  return new Promise<void>(resolve => {
    let step: 'logos' | 'title' = 'logos';
    let readyAt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const showTitle = () => {
      if (step === 'title') return;
      clearTimeout(timer);
      step = 'title';
      readyAt = performance.now() + guardMs;
      figures.forEach(figure => figure.classList.remove('is-on'));
      root.dataset.step = 'title';
    };
    const show = (index: number) => {
      figures.forEach((figure, at) => figure.classList.toggle('is-on', at === index));
      pips.forEach((pip, at) => { pip.classList.toggle('is-on', at === index); pip.classList.toggle('is-done', at < index); });
      if (count) count.textContent = two(index + 1);
      root.dataset.sponsor = figures[index]?.dataset.sponsor ?? '';
      timer = setTimeout(() => { if (index + 1 < figures.length) show(index + 1); else showTitle(); }, slideMs);
    };
    const advance = () => {
      if (step === 'logos') { showTitle(); return; }
      if (performance.now() < readyAt) return;
      document.removeEventListener('keydown', onKey);
      root.removeEventListener('click', advance);
      resolve();
    };
    const onKey = (event: KeyboardEvent) => {
      if (!skipsSplash(event)) return;
      event.preventDefault();
      advance();
    };
    document.addEventListener('keydown', onKey);
    root.addEventListener('click', advance);
    void decoded.then(() => { if (step !== 'logos') return; if (figures.length) show(0); else showTitle(); });
  });
}
