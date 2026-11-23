// Small helpers shared across the app.

export const uid = () =>
  (globalThis.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

const pad = (n) => String(n).padStart(2, '0');

export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = () => toISO(new Date());
export const thisMonth = () => todayISO().slice(0, 7);
export const thisYear = () => todayISO().slice(0, 4);

/** Parse 'YYYY-MM-DD' as a local date (not UTC). */
export const parseISO = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

export const addMonths = (ym, n) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

export const addDays = (iso, n) => {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
};

export const daysInMonth = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};

export const monthLabel = (ym, style = 'long') =>
  parseISO(ym + '-01').toLocaleDateString(undefined, { month: style, year: 'numeric' });

export const shortMonth = (ym) => parseISO(ym + '-01').toLocaleDateString(undefined, { month: 'short' });

export const dayLabel = (iso) => {
  const t = todayISO();
  if (iso === t) return 'Today';
  if (iso === addDays(t, -1)) return 'Yesterday';
  return parseISO(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
};

export const longDay = (iso) =>
  parseISO(iso).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const fmtCache = new Map();
export function money(n, currency = 'SAR', opts = {}) {
  const key = currency + JSON.stringify(opts);
  if (!fmtCache.has(key)) {
    try {
      fmtCache.set(key, new Intl.NumberFormat(undefined, {
        style: 'currency', currency, minimumFractionDigits: opts.compact ? 0 : 2,
        maximumFractionDigits: opts.compact ? 0 : 2, notation: opts.short ? 'compact' : 'standard',
      }));
    } catch {
      fmtCache.set(key, new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    }
  }
  return fmtCache.get(key).format(Number(n) || 0);
}

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export const pct = (part, whole) => (whole > 0 ? (part / whole) * 100 : 0);

export function debounce(fn, ms = 200) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/** Save a file. Inside claude.ai the page must ask the viewer through the `downloads` capability. */
export async function download(filename, text, type = 'application/json') {
  const rt = globalThis.claude;
  if (rt?.use) {
    const d = await rt.use('downloads').catch(() => null);
    if (d) {
      try { await d.save({ filename, data: text }); return true; } catch (e) { if (e?.code === 'declined') return false; throw e; }
    }
  }
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  return true;
}

export const lsGet = (k, fallback = null) => {
  try { const v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
};
export const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };
