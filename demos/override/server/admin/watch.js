// The failover watch strip: visible for 5 minutes after the router switched endpoints. Text only.
const WINDOW_MS = 5 * 60_000;
const states = new WeakMap();

function el(doc, tag, cls, parent, text) {
  const e = doc.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent.appendChild(e);
  return e;
}

export function renderWatch(root, snapshot, now, opts = {}) {
  const tr = snapshot?.traffic ?? snapshot?.trends ?? {};
  const at = tr.failoverAt;
  const fresh = Number.isFinite(at) && Number.isFinite(now) && now - at <= WINDOW_MS;
  if (!fresh) { root.hidden = true; return; }
  const doc = root.ownerDocument;
  let st = states.get(root);
  if (!st) {
    st = {};
    st.title = el(doc, 'strong', 'watch-label', root, 'WATCH');
    st.when = el(doc, 'span', 'watch-when', root);
    st.active = el(doc, 'span', 'watch-active', root);
    st.probe = el(doc, 'button', 'ctl-btn', root, 'Probe');
    st.probe.addEventListener?.('click', () => {
      const name = st.endpoint;
      if (!name || !st.api) return;
      st.probe.disabled = true;
      Promise.resolve(st.api('/admin/llm/probe', { endpoint: name }))
        .then((r) => { st.probe.textContent = r?.ok ? 'Probe ok' : 'Probe failed'; })
        .catch(() => { st.probe.textContent = 'Probe failed'; })
        .finally(() => { st.probe.disabled = false; });
    });
    states.set(root, st);
  }
  st.api = opts.api ?? st.api;
  st.endpoint = typeof tr.active === 'string' ? tr.active : null;
  const mins = Math.max(0, Math.floor((now - at) / 60_000));
  st.when.textContent = `Failover ${new Date(at).toISOString().slice(11, 19)} UTC (${mins} min ago)`;
  st.active.textContent = `Active ${st.endpoint ?? 'unknown'}`;
  st.probe.hidden = !st.endpoint;
  root.hidden = false;
}
