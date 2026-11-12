// Control bar: round status, start/end round, pause new games, endpoint switch, event reset.
// Text only (textContent); no document/window access at import time.
import { el as mk } from './dom.js';
import { createRoundControl } from './round.js';

const el = (doc, tag, cls, text, parent) => mk(doc, tag, cls, { text, parent });

export function createBar(root, opts) {
  const doc = root.ownerDocument;
  root.textContent = '';
  let snap = null;
  const askText = (m) => (opts.prompt ?? globalThis.prompt)?.(m) ?? null;
  const askYes = (m) => (opts.confirm ?? globalThis.confirm)?.(m) ?? false;

  const roundBox = el(doc, 'div', 'bar-round', undefined, root);
  const round = createRoundControl(roundBox, { api: opts.api, short: true });
  const actions = el(doc, 'div', 'bar-actions', undefined, root);
  const end = el(doc, 'button', 'bar-btn bar-end', 'End round', actions);
  const pause = el(doc, 'button', 'bar-btn bar-pause', 'Pause new games', actions);
  const endpointWrap = el(doc, 'span', 'bar-endpoint', undefined, actions);
  const select = el(doc, 'select', 'bar-select', undefined, endpointWrap);
  const reset = el(doc, 'button', 'bar-btn bar-reset', 'Reset event', actions);
  const msg = el(doc, 'div', 'bar-msg', '', root);
  msg.setAttribute?.('aria-live', 'polite');
  for (const b of [end, pause, reset]) b.type = 'button';

  const run = async (btn, fn) => {
    if (btn.disabled) return;
    btn.disabled = true;
    try { msg.textContent = await fn(); }
    catch (e) { msg.textContent = `Error: ${e?.message ?? e}`; }
    finally { btn.disabled = false; }
  };

  end.addEventListener('click', () => run(end, async () => {
    if (!askYes('End the round and freeze the final standings?')) return 'End cancelled';
    await opts.api('/admin/round/end', {});
    return 'Round ended';
  }));
  pause.addEventListener('click', () => run(pause, async () => {
    const paused = !snap?.sessions?.paused;
    await opts.api('/admin/sessions/pause', { paused });
    return paused ? 'New games paused' : 'New games resumed';
  }));
  reset.addEventListener('click', () => run(reset, async () => {
    const typed = askText('Type RESET to clear all teams and start a new round');
    if (typed !== 'RESET') return 'Reset cancelled';
    await opts.api('/admin/event/reset', { confirm: 'RESET' });
    return 'Event reset';
  }));
  select.addEventListener('change', () => run(select, async () => {
    const name = select.value;
    const r = snap?.router;
    if (!r || name === r.active) return '';
    const reason = askText(`Why move to ${name} and pin it?`);
    if (reason === null) { select.value = r.active; return 'Cancelled'; }
    await opts.api('/admin/llm/active', { endpoint: name, pinned: true, reason: String(reason) });
    return `Moved to ${name} and pinned`;
  }));

  return {
    update(s) {
      snap = s;
      round.update(s);
      const r = s?.round;
      const open = !!(r && r.label && r.endedAt == null);
      end.hidden = !open;
      pause.textContent = s?.sessions?.paused ? 'Resume new games' : 'Pause new games';
      const router = s?.router;
      endpointWrap.hidden = !router;
      if (router) {
        const names = (router.endpoints ?? []).map((e) => e.name);
        const have = Array.from(select.children ?? [], (o) => o.value);
        if (names.join('\n') !== have.join('\n')) {
          select.textContent = '';
          for (const n of names) {
            const o = el(doc, 'option', '', n, select);
            o.value = n;
          }
        }
        if (select.value !== router.active) select.value = router.active;
      }
    },
  };
}
