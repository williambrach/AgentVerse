const KEY = 'override.admin.collapsed';

function readCollapsed(storage) {
  try {
    const raw = storage && storage.getItem(KEY);
    if (raw == null) return null;
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : null;
  } catch {
    return null;
  }
}

export function initPanels(root, storage) {
  const panels = Array.from(root.querySelectorAll('details[data-panel]'));
  const saved = readCollapsed(storage);
  if (saved) for (const p of panels) p.open = !saved.includes(p.dataset.panel);
  for (const p of panels) {
    p.addEventListener('toggle', () => {
      const closed = panels.filter((q) => !q.open).map((q) => q.dataset.panel);
      try { if (storage) storage.setItem(KEY, JSON.stringify(closed)); } catch { /* storage may be full or blocked */ }
    });
  }
}

export function setBadge(el, level) {
  if (level === 'warn' || level === 'bad') {
    el.hidden = false;
    el.textContent = level === 'warn' ? 'Warning' : 'Problem';
    el.dataset.tone = level;
  } else {
    el.hidden = true;
    el.textContent = '';
    delete el.dataset.tone;
  }
}
