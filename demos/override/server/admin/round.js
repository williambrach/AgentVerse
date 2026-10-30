// Round control, answer funnel and verdict tallies. Text via textContent only.
import { isNum, pad2, mmss } from './dom.js';
const STEPS = [
  ['started', 'Started'],
  ['asked', 'First question'],
  ['interviewed', 'Interviewed all'],
  ['verdict', 'Verdict'],
  ['debrief', 'Debrief'],
];
const num = isNum;
const pad = pad2;
const pct = (n, d) => (d > 0 && num(n) ? Math.round((n / d) * 100) : 0);

export function funnelRows(snap, catalog) {
  const f = (snap && snap.funnel) || {};
  return (catalog || []).map((c) => {
    const row = f[c.id] || {};
    const base = num(row.started) ? row.started : 0;
    return {
      caseId: c.id,
      title: c.title,
      steps: STEPS.map(([k, label]) => {
        const n = num(row[k]) ? row[k] : 0;
        return { label, n, pct: pct(n, base) };
      }),
    };
  });
}

const minutes = (ms) => (isNum(ms) ? mmss(ms) : '–');

// Mirrors ROLES in server/roles.mjs (ids and labels); this page runs in the
// browser and cannot import server modules.
const ROLE_LABELS = [
  ['villain', 'Villain'],
  ['collaborator', 'Collaborator'],
  ['fooled', 'Honest but fooled'],
  ['honest', 'Honest'],
];

export function tallyRows(snap, catalog) {
  const t = (snap && snap.tallies) || {};
  return (catalog || []).map((c) => {
    const row = t[c.id] || {};
    const verdicts = num(row.verdicts) ? row.verdicts : 0;
    const perfect = num(row.perfect) ? row.perfect : 0;
    const rolesRight = num(row.rolesRight) ? row.rolesRight : 0;
    const rolesTotal = num(row.rolesTotal) ? row.rolesTotal : 0;
    const by = row.byRole || {};
    const roles = ROLE_LABELS.map(([id, label]) => {
      const r = by[id] || {};
      const total = num(r.total) ? r.total : 0;
      const right = num(r.right) ? r.right : 0;
      return { id, label, right, total, pct: pct(right, total) };
    }).filter((r) => r.total > 0);
    return {
      caseId: c.id,
      title: c.title,
      verdicts,
      perfect,
      rolesPct: verdicts > 0 && rolesTotal > 0 ? pct(rolesRight, rolesTotal) : null,
      roles,
      medianMin: verdicts > 0 ? minutes(row.medianMsToVerdict) : '–',
      medianQuestions: verdicts > 0 && num(row.medianQuestions) ? row.medianQuestions : null,
      medianCoins: verdicts > 0 && num(row.medianCoins) ? row.medianCoins : null,
    };
  });
}

const el = (doc, tag, cls, parent, text) => {
  const e = doc.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
};

function bar(doc, parent, p, cls) {
  const track = el(doc, 'div', 'bar', parent);
  const fill = el(doc, 'div', `bar-fill ${cls || ''}`.trim(), track);
  fill.style.width = `${Math.max(0, Math.min(100, p))}%`;
  return fill;
}

export function renderFunnel(root, snap, catalog) {
  const doc = root.ownerDocument;
  root.textContent = '';
  for (const row of funnelRows(snap, catalog)) {
    const box = el(doc, 'div', 'case-box', root);
    el(doc, 'h3', 'case-title', box, row.title);
    for (const s of row.steps) {
      const line = el(doc, 'div', 'step', box);
      el(doc, 'span', 'step-l', line, s.label);
      bar(doc, line, s.pct);
      el(doc, 'span', 'step-n', line, `${s.n} · ${s.pct} %`);
    }
  }
}

export function renderTallies(root, snap, catalog) {
  const doc = root.ownerDocument;
  root.textContent = '';
  for (const row of tallyRows(snap, catalog)) {
    const box = el(doc, 'div', 'case-box', root);
    el(doc, 'h3', 'case-title', box, row.title);
    if (!row.verdicts) {
      el(doc, 'div', 'muted', box, 'No verdicts yet');
      continue;
    }
    const head = row.rolesPct === null ? '–' : `${row.rolesPct} %`;
    el(doc, 'div', 'tally-head', box, `${row.verdicts} verdicts · ${head} roles right · ${row.perfect} perfect`);
    el(doc, 'div', 'tally-sub muted', box, `median ${row.medianMin} min · ${row.medianQuestions === null ? '–' : row.medianQuestions} questions · median ${row.medianCoins === null ? '–' : row.medianCoins} coins`);
    for (const r of row.roles) {
      const line = el(doc, 'div', 'step', box);
      el(doc, 'span', 'step-l', line, r.label);
      bar(doc, line, r.pct, r.pct >= 50 ? 'good' : 'wrong');
      el(doc, 'span', 'step-n', line, `${r.right}/${r.total} · ${r.pct} %`);
    }
  }
}

export function createRoundControl(root, opts) {
  const doc = root.ownerDocument;
  root.textContent = '';
  const label = el(doc, 'span', 'round-label', root, 'No round started');
  const open = el(doc, 'button', 'round-open', root, 'Start round');
  open.type = 'button';
  const form = el(doc, 'div', 'round-form', root);
  form.hidden = true;
  const name = el(doc, 'input', 'round-name', form);
  name.placeholder = 'Round label (required)';
  const reason = el(doc, 'input', 'round-reason', form);
  reason.placeholder = 'Reason (optional)';
  const go = el(doc, 'button', 'round-go', form, 'Start');
  go.type = 'button';
  const cancel = el(doc, 'button', 'round-cancel', form, 'Cancel');
  cancel.type = 'button';
  const err = el(doc, 'div', 'round-error', form, '');

  open.addEventListener('click', () => { form.hidden = false; err.textContent = ''; });
  cancel.addEventListener('click', () => { form.hidden = true; err.textContent = ''; });
  go.addEventListener('click', async () => {
    const l = String(name.value || '').trim();
    if (!l) { err.textContent = 'A label is required'; return; }
    try {
      await opts.api('/admin/round', { label: l, reason: String(reason.value || '').trim() });
      form.hidden = true;
      err.textContent = '';
      name.value = '';
      reason.value = '';
    } catch (e) {
      err.textContent = String((e && e.message) || e || 'Failed');
    }
  });

  return {
    update(snap) {
      const r = snap && snap.round;
      let s = 'No round started';
      if (r && r.label) {
        const d = new Date(r.startedAt);
        const mins = Math.max(0, Math.floor((snap.at - r.startedAt) / 60000));
        s = `${r.label} · since ${pad(d.getHours())}:${pad(d.getMinutes())} (${mins} min)`;
      }
      if (label.textContent !== s) label.textContent = s;
    },
  };
}
