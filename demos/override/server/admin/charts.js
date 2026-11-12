// SVG time-series panel. Text is always set through textContent; SVG is built with createElementNS.
const NS = 'http://www.w3.org/2000/svg';
const W = 100;
const H = 40;
const state = new WeakMap();
const fin = (n) => typeof n === 'number' && Number.isFinite(n);
const pad = (n) => String(n).padStart(2, '0');

export function niceTicks(min, max, count = 4) {
  if (!fin(min) || !fin(max)) return [0, 1];
  if (max <= min) return [min, min + 1];
  const raw = (max - min) / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const f = raw / mag;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag;
  const out = [];
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  for (let v = start; v <= end + step / 1e6; v += step) out.push(Math.round(v / step * 1e6) / 1e6 * step);
  return out.map((v) => Number(v.toPrecision(12)));
}

const hhmm = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const hhmmss = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };

function mk(doc, tag, cls, parent) {
  const e = doc.createElement(tag);
  if (cls) e.className = cls;
  if (parent) parent.appendChild(e);
  return e;
}
function mkNS(doc, tag, parent) {
  const e = doc.createElementNS(NS, tag);
  if (parent) parent.appendChild(e);
  return e;
}

function build(root) {
  const doc = root.ownerDocument || globalThis.document;
  if (root.classList && typeof root.classList.add === 'function') root.classList.add('chart');
  else if (!String(root.className || '').split(/\s+/).includes('chart')) root.className = `${root.className || ''} chart`.trim();
  const head = mk(doc, 'div', 'chart-head', root);
  const st = { doc };
  st.title = mk(doc, 'span', 'chart-title', head);
  st.value = mk(doc, 'span', 'chart-value', head);
  const body = mk(doc, 'div', 'chart-body', root);
  st.yAxis = mk(doc, 'div', 'chart-yaxis', body);
  const plot = mk(doc, 'div', 'chart-plot', body);
  st.svg = mkNS(doc, 'svg', plot);
  st.svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  st.svg.setAttribute('preserveAspectRatio', 'none');
  st.svg.setAttribute('class', 'chart-svg');
  st.grid = mkNS(doc, 'g', st.svg);
  st.area = mkNS(doc, 'path', st.svg);
  st.area.setAttribute('class', 'chart-area');
  st.lineG = mkNS(doc, 'g', st.svg);
  st.lines = [];
  st.cursor = mkNS(doc, 'line', st.svg);
  st.cursor.setAttribute('class', 'chart-cursor');
  st.cursor.setAttribute('visibility', 'hidden');
  st.tip = mk(doc, 'div', 'chart-tip', plot);
  st.tip.style.display = 'none';
  st.xAxis = mk(doc, 'div', 'chart-xaxis', root);
  st.spec = null;
  const move = (ev) => {
    const s = st.spec;
    if (!s || !s.series.length) return;
    const r = st.svg.getBoundingClientRect ? st.svg.getBoundingClientRect() : { left: 0, width: 1 };
    const frac = r.width > 0 ? Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)) : 0;
    const t = s.range[0] + frac * (s.range[1] - s.range[0]);
    const lines = [];
    let nearestT = null;
    for (const se of s.series) {
      let best = null;
      for (const p of se.points) if (!best || Math.abs(p[0] - t) < Math.abs(best[0] - t)) best = p;
      if (!best) continue;
      if (nearestT === null) nearestT = best[0];
      lines.push(`${se.label}: ${s.format(best[1])}`);
    }
    if (nearestT === null) return;
    st.tip.textContent = `${hhmmss(nearestT)}  ${lines.join('  ')}`;
    st.tip.style.display = 'block';
    st.tip.style.left = `${frac * 100}%`;
    const x = ((nearestT - s.range[0]) / (s.range[1] - s.range[0] || 1)) * W;
    st.cursor.setAttribute('x1', fin(x) ? x : 0);
    st.cursor.setAttribute('x2', fin(x) ? x : 0);
    st.cursor.setAttribute('y1', 0);
    st.cursor.setAttribute('y2', H);
    st.cursor.setAttribute('visibility', 'visible');
  };
  const leave = () => { st.tip.style.display = 'none'; st.cursor.setAttribute('visibility', 'hidden'); };
  if (st.svg.addEventListener) {
    st.svg.addEventListener('pointermove', move);
    st.svg.addEventListener('pointerleave', leave);
  }
  st.move = move;
  st.leave = leave;
  return st;
}

export function renderChart(root, spec) {
  let st = state.get(root);
  if (!st) { st = build(root); state.set(root, st); }
  const series = (spec.series || []).map((s) => ({ ...s, points: (s.points || []).filter((p) => fin(p[0]) && fin(p[1])) }));
  const range = Array.isArray(spec.range) && fin(spec.range[0]) && fin(spec.range[1]) && spec.range[1] > spec.range[0] ? spec.range : [0, 1];
  const format = typeof spec.format === 'function' ? spec.format : String;
  st.spec = { ...spec, series, range, format };
  st.title.textContent = String(spec.title ?? '');

  const first = series[0] ? series[0].points : [];
  const latest = first.length ? first[first.length - 1][1] : null;
  let level = 'ok';
  const th = spec.thresholds || {};
  if (latest !== null) {
    if (fin(th.bad) && latest > th.bad) level = 'bad';
    else if (fin(th.warn) && latest > th.warn) level = 'warn';
  }
  st.value.textContent = latest === null ? '–' : String(format(latest));
  root.dataset.level = level;

  let max = 0;
  for (const s of series) for (const p of s.points) if (p[1] > max) max = p[1];
  const ticks = niceTicks(0, max);
  const top = ticks[ticks.length - 1] || 1;
  const X = (t) => ((t - range[0]) / (range[1] - range[0])) * W;
  const Y = (v) => H - (v / top) * H;

  st.grid.textContent = '';
  st.yAxis.textContent = '';
  for (const v of ticks) {
    const ln = mkNS(st.doc, 'line', st.grid);
    ln.setAttribute('class', 'chart-grid');
    ln.setAttribute('x1', 0); ln.setAttribute('x2', W);
    ln.setAttribute('y1', Y(v)); ln.setAttribute('y2', Y(v));
    const lab = mk(st.doc, 'span', 'chart-ylabel', st.yAxis);
    lab.style.top = `${(1 - v / top) * 100}%`;
    lab.textContent = String(format(v));
  }
  for (const key of ['warn', 'bad']) {
    const v = th[key];
    if (!fin(v) || v < 0 || v > top) continue;
    const ln = mkNS(st.doc, 'line', st.grid);
    ln.setAttribute('class', `chart-threshold chart-threshold-${key}`);
    ln.setAttribute('stroke-dasharray', '3 2');
    ln.setAttribute('x1', 0); ln.setAttribute('x2', W);
    ln.setAttribute('y1', Y(v)); ln.setAttribute('y2', Y(v));
  }

  const d = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(2)} ${Y(p[1]).toFixed(2)}`).join(' ');
  while (st.lines.length < series.length) {
    st.lines.push(mkNS(st.doc, 'path', st.lineG));
  }
  st.lines.forEach((p, i) => {
    const s = series[i];
    p.setAttribute('class', `chart-line chart-line-${i}`);
    p.setAttribute('fill', 'none');
    p.setAttribute('d', s && s.points.length ? d(s.points) : '');
  });
  if (first.length) {
    st.area.setAttribute('d', `${d(first)} L${X(first[first.length - 1][0]).toFixed(2)} ${H} L${X(first[0][0]).toFixed(2)} ${H} Z`);
  } else {
    st.area.setAttribute('d', '');
  }

  st.xAxis.textContent = '';
  for (let i = 0; i < 4; i++) {
    const lab = mk(st.doc, 'span', 'chart-xlabel', st.xAxis);
    lab.textContent = hhmm(range[0] + ((range[1] - range[0]) * i) / 3);
  }
  return level;
}
