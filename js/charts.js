// Tiny SVG/HTML chart helpers (no libraries). Bars carry data-tip for the hover/tap tooltip.

import { esc } from './utils.js';

/**
 * Vertical bar chart (single series).
 * points: [{ label, value, tip, highlight }]
 */
export function barChart(points, { height = 160, fmt = (v) => v, emptyText = 'No spending yet' } = {}) {
  const max = Math.max(0, ...points.map((p) => p.value));
  if (!points.length || max <= 0) return `<div class="empty small">${esc(emptyText)}</div>`;
  const n = points.length;
  const W = 360, H = height, top = 18, bottom = 22, left = 4, right = 4;
  const plotH = H - top - bottom;
  const slot = (W - left - right) / n;
  const bw = Math.max(3, Math.min(28, slot - 2));
  const nice = niceMax(max);
  const grid = [0.5, 1].map((f) => {
    const y = top + plotH - plotH * f;
    return `<line class="grid" x1="${left}" x2="${W - right}" y1="${y}" y2="${y}"/>` +
      `<text class="axis" x="${W - right}" y="${y - 4}" text-anchor="end">${esc(fmt(nice * f))}</text>`;
  }).join('');
  const labelEvery = n > 12 ? Math.ceil(n / 7) : 1;
  const bars = points.map((p, i) => {
    const h = p.value > 0 ? Math.max(2, (p.value / nice) * plotH) : 0;
    const x = left + i * slot + (slot - bw) / 2;
    const y = top + plotH - h;
    const r = Math.min(4, bw / 2, h);
    const path = h > 0
      ? `M${x},${top + plotH} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${top + plotH} Z`
      : '';
    const lbl = i % labelEvery === 0
      ? `<text class="axis" x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${esc(p.label)}</text>` : '';
    return `<g class="bar-g" data-tip="${esc(p.tip || `${p.label}: ${fmt(p.value)}`)}">` +
      `<rect class="hit" x="${left + i * slot}" y="${top}" width="${slot}" height="${plotH}"/>` +
      (path ? `<path class="bar${p.highlight ? ' hl' : ''}" d="${path}"/>` : '') + lbl + '</g>';
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">` +
    grid + `<line class="baseline" x1="${left}" x2="${W - right}" y1="${top + plotH}" y2="${top + plotH}"/>` + bars + '</svg>';
}

function niceMax(v) {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/**
 * Ranked horizontal bars: [{ icon, label, value, sub }]
 * Single hue — identity comes from the label, not color.
 */
export function rankBars(rows, { fmt, total, onClickAttr } = {}) {
  if (!rows.length) return '<div class="empty small">Nothing here yet</div>';
  const max = Math.max(...rows.map((r) => r.value));
  return '<div class="rank">' + rows.map((r) => {
    const share = total > 0 ? Math.round((r.value / total) * 100) : 0;
    return `<div class="rank-row" ${onClickAttr ? onClickAttr(r) : ''} data-tip="${esc(`${r.label}: ${fmt(r.value)} (${share}%)`)}">
      <div class="rank-top"><span class="rank-label">${r.icon ? `<span class="ico">${esc(r.icon)}</span>` : ''}${esc(r.label)}</span>
      <span class="rank-val">${esc(fmt(r.value))} <span class="muted">${share}%</span></span></div>
      <div class="rank-track"><div class="rank-fill" style="width:${max > 0 ? (r.value / max) * 100 : 0}%"></div></div>
      ${r.sub ? `<div class="muted tiny">${esc(r.sub)}</div>` : ''}
    </div>`;
  }).join('') + '</div>';
}

/** Two-to-few series share strip with legend (e.g. who spent). Uses categorical slots in order. */
export function shareStrip(rows, { fmt }) {
  const total = rows.reduce((a, r) => a + r.value, 0);
  if (total <= 0) return '<div class="empty small">Nothing here yet</div>';
  const segs = rows.map((r, i) =>
    `<div class="seg s${(i % 8) + 1}" style="flex:${r.value}" data-tip="${esc(`${r.label}: ${fmt(r.value)} (${Math.round((r.value / total) * 100)}%)`)}"></div>`).join('');
  const legend = rows.map((r, i) =>
    `<div class="legend-item"><span class="swatch s${(i % 8) + 1}"></span>${esc(r.label)} <b>${esc(fmt(r.value))}</b> <span class="muted">${Math.round((r.value / total) * 100)}%</span></div>`).join('');
  return `<div class="strip">${segs}</div><div class="legend">${legend}</div>`;
}

/** Progress bar with status (good / warning / critical). */
export function progress(ratio, { thin = false } = {}) {
  const r = Number.isFinite(ratio) ? ratio : 1.01;
  const state = r > 1 ? 'critical' : r >= 0.8 ? 'warning' : 'good';
  return `<div class="progress${thin ? ' thin' : ''}"><div class="progress-fill ${state}" style="width:${Math.min(100, r * 100)}%"></div></div>`;
}

/** One global tooltip for anything with data-tip (hover on desktop, tap on phones). */
export function installTooltips(root = document) {
  const tip = document.createElement('div');
  tip.className = 'tooltip';
  tip.setAttribute('role', 'status');
  document.body.appendChild(tip);
  let hideT;
  const show = (el, x, y) => {
    clearTimeout(hideT);
    tip.textContent = el.getAttribute('data-tip');
    tip.style.display = 'block';
    const r = tip.getBoundingClientRect();
    const nx = Math.min(window.innerWidth - r.width - 8, Math.max(8, x - r.width / 2));
    const ny = y - r.height - 12 < 8 ? y + 16 : y - r.height - 12;
    tip.style.left = nx + 'px';
    tip.style.top = ny + 'px';
  };
  const hide = () => { tip.style.display = 'none'; };
  root.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const el = e.target.closest?.('[data-tip]');
    if (el) show(el, e.clientX, e.clientY); else hide();
  });
  root.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    const el = e.target.closest?.('[data-tip]');
    if (el && !el.closest('[data-action]')) { show(el, e.clientX, e.clientY); hideT = setTimeout(hide, 2500); } else hide();
  });
  window.addEventListener('scroll', hide, { passive: true });
}
