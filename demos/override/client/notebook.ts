const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let previousKey = '';
let previousMarkup = '';
let focus: { id: string; start?: number; end?: number } | null = null;
const animations = new Set<Animation>();

function animate(element: Element | null, frames: Keyframe[], duration = 380, delay = 0) {
  if (!element || reducedMotion.matches) return;
  const animation = element.animate(frames, { duration, delay, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
  animations.add(animation);
  animation.finished.catch(() => {}).finally(() => animations.delete(animation));
}

reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches) animations.forEach(animation => animation.cancel());
});

/** Animate changes once, while keeping the reader's position and unfinished input. */
export function renderNotebook(target: HTMLElement, markup: string, key: string, section: string, order: string[]) {
  if (key === previousKey && markup === previousMarkup) return false;
  const changedPage = key !== previousKey;
  const oldPage = target.querySelector<HTMLElement>('.notebook-page');
  const oldTranscript = target.querySelector<HTMLElement>('#transcript');
  const pageScroll = changedPage ? 0 : oldPage?.scrollTop || 0;
  const transcriptScroll = oldTranscript?.scrollTop || 0;
  const existing = new Set([...target.querySelectorAll<HTMLElement>('[data-motion-key]')].map(el => el.dataset.motionKey));
  const active = document.activeElement;
  if (changedPage) focus = null;
  else if (active instanceof HTMLElement && target.contains(active) && active.id) {
    focus = { id: active.id };
    if (active instanceof HTMLTextAreaElement) Object.assign(focus, { start: active.selectionStart, end: active.selectionEnd });
  } else if (active && active !== document.body && !target.contains(active)) focus = null;

  animations.forEach(animation => animation.cancel());
  target.innerHTML = `<div class="notebook-page">${markup}</div><div class="page-turn-shade" aria-hidden="true"></div>`;
  const page = target.querySelector<HTMLElement>('.notebook-page')!;
  const transcript = target.querySelector<HTMLElement>('#transcript');
  page.scrollTop = pageScroll;
  if (transcript) transcript.scrollTop = changedPage ? transcript.scrollHeight : transcriptScroll;
  if (focus) {
    const control = document.getElementById(focus.id);
    if (control && target.contains(control) && !control.matches(':disabled')) {
      control.focus({ preventScroll: true });
      if (control instanceof HTMLTextAreaElement && focus.start !== undefined) control.setSelectionRange(focus.start, focus.end ?? focus.start);
    }
  }

  const fresh = [...target.querySelectorAll<HTMLElement>('[data-motion-key]')].filter(el => !existing.has(el.dataset.motionKey));
  if (changedPage) {
    const oldSection = previousKey.split(':')[1];
    const direction = order.indexOf(section) >= order.indexOf(oldSection) ? 1 : -1;
    animate(page, [
      { opacity: .35, transform: `perspective(1200px) translateX(${direction * 24}px) rotateY(${direction * -9}deg)` },
      { opacity: 1, transform: 'perspective(1200px) translateX(0) rotateY(0deg)' },
    ], 440);
    animate(target.querySelector('.page-turn-shade'), [{ opacity: .55, transform: 'translateX(-70%)' }, { opacity: 0, transform: 'translateX(100%)' }], 480);
    animate(document.querySelector('#notebook-section'), [{ opacity: 0, transform: 'translateY(5px)' }, { opacity: 1, transform: 'translateY(0)' }], 300);
    // Only stagger visible records; long transcripts remain immediately readable.
    [...page.querySelectorAll('.briefing-note, .task-list li, .requirements button')].slice(0, 5).forEach((el, i) => {
      animate(el, [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0)' }], 340, 70 + i * 35);
    });
  } else {
    fresh.forEach((el, i) => {
      const speech = el.classList.contains('speech');
      animate(el, [
        { opacity: 0, transform: speech ? 'translateY(12px) scale(.97)' : 'translateY(20px) rotate(-1deg)' },
        { opacity: 1, transform: 'translateY(0) rotate(0deg) scale(1)' },
      ], speech ? 320 : 420, Math.min(i * 55, 180));
    });
    if (transcript && fresh.some(el => el.classList.contains('speech'))) {
      transcript.scrollTo({ top: transcript.scrollHeight, behavior: reducedMotion.matches ? 'instant' : 'smooth' });
    }
  }
  previousKey = key;
  previousMarkup = markup;
  return true;
}
