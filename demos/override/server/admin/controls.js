// Operator controls: router summary, per-endpoint actions, global cap, pause, session stats, system records.
// Text only (textContent); no document/window access at import time.

const toMs = (t) => (typeof t === 'number' ? t : Date.parse(t));
const defaultFmt = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function systemLine(rec, fmt) {
  const at = fmt(toMs(rec.timestamp));
  if (rec.type === 'llm_active') {
    return `${at} endpoint ${rec.from} → ${rec.active}, ${rec.pinned ? 'pinned' : 'unpinned'}${rec.by ? `, by ${rec.by}` : ''}${rec.reason ? `: ${rec.reason}` : ''}`;
  }
  if (rec.type === 'admin_action') {
    if (rec.action === 'cap') return `${at} cap ${rec.endpoint ?? 'all'} → ${rec.value}`;
    if (rec.action === 'pause') return `${at} ${rec.paused ? 'pause' : 'resume'} new games`;
    if (rec.action === 'probe') return `${at} probe ${rec.endpoint} ${rec.ok ? 'ok' : 'failed'}`;
    return `${at} ${rec.action}`;
  }
  if (rec.type === 'leaderboard_settings') return `${at} leaderboard ties by ${rec.rankBy}`;
  if (rec.type === 'team_hidden') return `${at} team ${String(rec.teamId).slice(0, 8)} ${rec.hidden ? 'hidden' : 'shown'}`;
  if (rec.type === 'round_started') return `${at} round "${rec.label}" started`;
  return `${at} ${rec.type}`;
}

const states = new WeakMap();

function el(doc, tag, className, text) {
  const e = doc.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function build(root, opts) {
  const doc = root.ownerDocument;
  const st = { snap: null, opts, rows: new Map(), busy: false };
  st.summary = el(doc, 'div', 'ctl-summary');
  st.endpoints = el(doc, 'div', 'ctl-endpoints');
  st.global = el(doc, 'div', 'ctl-global');
  st.capAll = el(doc, 'button', 'ctl-btn', 'Cap all');
  st.pause = el(doc, 'button', 'ctl-btn', 'Pause new games');
  st.global.append(st.capAll, st.pause);
  st.stats = el(doc, 'div', 'ctl-stats');
  st.statsHead = el(doc, 'span', 'ctl-stats-head');
  st.statsState = el(doc, 'span', 'ctl-stats-state');
  st.statsStage = el(doc, 'span', 'ctl-stats-stage');
  st.stats.append(st.statsHead, st.statsState, st.statsStage);
  st.result = el(doc, 'div', 'ctl-result');
  st.result.setAttribute?.('aria-live', 'polite');
  st.systemTitle = el(doc, 'h3', 'ctl-title', 'System records');
  st.system = el(doc, 'ul', 'ctl-system');
  root.append(st.summary, st.endpoints, st.global, st.stats, st.result, st.systemTitle, st.system);

  const ask = (msg) => (st.opts.prompt ?? globalThis.prompt)?.(msg) ?? null;
  const run = async (button, fn) => {
    if (button.disabled) return;
    button.disabled = true;
    try { st.result.textContent = await fn(); }
    catch (e) { st.result.textContent = `Error: ${e?.message ?? e}`; }
    finally { button.disabled = false; }
  };
  const capValue = (msg) => {
    const raw = ask(msg);
    if (raw === null) return null;
    const n = Number(String(raw).trim());
    if (!Number.isInteger(n) || n < 1 || n > 1000) throw new Error('Cap must be a whole number from 1 to 1000.');
    return n;
  };
  const api = (path, body) => st.opts.api(path, body);
  st.actions = {
    pin: (name, btn) => run(btn, async () => {
      const r = st.snap.router;
      const unpin = r.active === name && r.pinned;
      const reason = ask(unpin ? `Why unpin ${name}?` : `Why move to ${name} and pin it?`);
      if (reason === null) return 'Cancelled.';
      await api('/admin/llm/active', { endpoint: name, pinned: !unpin, reason: String(reason) });
      return unpin ? `Unpinned ${name}.` : `Moved to ${name} and pinned.`;
    }),
    probe: (name, btn) => run(btn, async () => {
      const r = await api('/admin/llm/probe', { endpoint: name });
      return r?.ok ? `Probe ${name}: ok${r.durationMs != null ? ` in ${r.durationMs} ms` : ''}.` : `Probe ${name} failed${r?.reason ? `: ${r.reason}` : ''}.`;
    }),
    cap: (name, btn) => run(btn, async () => {
      const value = capValue(name ? `New in-flight cap for ${name}?` : 'New in-flight cap for all endpoints?');
      if (value === null) return 'Cancelled.';
      await api('/admin/llm/cap', { endpoint: name, value });
      return `Cap ${name ?? 'all'} set to ${value}.`;
    }),
    pause: (btn) => run(btn, async () => {
      const paused = !st.snap.sessions?.paused;
      await api('/admin/sessions/pause', { paused });
      return paused ? 'New games paused.' : 'New games resumed.';
    }),
  };
  st.capAll.addEventListener('click', () => st.actions.cap(null, st.capAll));
  st.pause.addEventListener('click', () => st.actions.pause(st.pause));
  return st;
}

function endpointRow(st, doc, name) {
  const row = el(doc, 'div', 'ctl-endpoint');
  const head = el(doc, 'div', 'ctl-endpoint-head');
  const parts = { name: el(doc, 'strong', 'ctl-name'), model: el(doc, 'span', 'ctl-model'), host: el(doc, 'span', 'ctl-host') };
  head.append(parts.name, parts.model, parts.host);
  parts.load = el(doc, 'div', 'ctl-load');
  parts.fail = el(doc, 'div', 'ctl-fail');
  const buttons = el(doc, 'div', 'ctl-buttons');
  parts.pin = el(doc, 'button', 'ctl-btn', 'Move + pin');
  parts.probe = el(doc, 'button', 'ctl-btn', 'Probe');
  parts.cap = el(doc, 'button', 'ctl-btn', 'Cap');
  buttons.append(parts.pin, parts.probe, parts.cap);
  row.append(head, parts.load, parts.fail, buttons);
  parts.pin.addEventListener('click', () => st.actions.pin(name, parts.pin));
  parts.probe.addEventListener('click', () => st.actions.probe(name, parts.probe));
  parts.cap.addEventListener('click', () => st.actions.cap(name, parts.cap));
  parts.el = row;
  return parts;
}

export function renderControls(root, snap, opts) {
  let st = states.get(root);
  if (!st) { st = build(root, opts); states.set(root, st); }
  st.opts = opts; st.snap = snap;
  const doc = root.ownerDocument;
  const fmt = opts.fmt ?? defaultFmt;
  const r = snap.router;

  st.summary.textContent = r
    ? `Active ${r.active}${r.pinned ? ' (pinned)' : ''} · in flight ${r.inFlight}/${r.maxInFlight} · queued ${r.queued}`
    : 'Live LLM mode is off (rehearsal).';
  st.capAll.hidden = !r;

  const names = new Set((r?.endpoints ?? []).map(e => e.name));
  for (const [name, parts] of st.rows) if (!names.has(name)) { parts.el.remove(); st.rows.delete(name); }
  for (const e of r?.endpoints ?? []) {
    let p = st.rows.get(e.name);
    if (!p) { p = endpointRow(st, doc, e.name); st.rows.set(e.name, p); st.endpoints.appendChild(p.el); }
    const isActive = r.active === e.name;
    p.name.textContent = e.name + (isActive ? ' (active)' : '');
    p.model.textContent = e.model;
    p.host.textContent = e.apiBaseHost;
    p.load.textContent = `in flight ${e.inFlight}/${e.maxInFlight} · queued ${e.queued}`;
    p.fail.textContent = `failures 5m: ${e.failures5m}` + (e.lastFailureAt ? ` · last ${fmt(e.lastFailureAt)} ${e.lastFailureReason ?? ''}` : '');
    p.pin.textContent = isActive && r.pinned ? 'Unpin' : 'Move + pin';
  }

  const s = snap.sessions;
  st.pause.textContent = s?.paused ? 'Resume new games' : 'Pause new games';
  st.statsHead.textContent = s ? `In memory (last 30 min): ${s.games} games · ${s.waiting} waiting for an answer · ` : '';
  st.statsState.textContent = s ? (s.paused ? 'new games paused' : 'accepting new games') : '';
  st.statsState.className = s?.paused ? 'ctl-stats-state ctl-paused' : 'ctl-stats-state';
  st.statsStage.textContent = s?.byStage ? ` · by stage: started ${s.byStage.started ?? 0}, asked ${s.byStage.asked ?? 0}, interviewed ${s.byStage.interviewed ?? 0}, verdict ${s.byStage.verdict ?? 0}` : '';

  const recs = (snap.system ?? []).slice(-20).reverse();
  while (st.system.children.length > recs.length) st.system.removeChild(st.system.children.at(-1));
  recs.forEach((rec, i) => {
    let li = st.system.children[i];
    if (!li) li = st.system.appendChild(el(doc, 'li', 'ctl-record'));
    li.textContent = systemLine(rec, fmt);
  });
}
