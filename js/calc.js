// Pure calculations over the store's data: balances, budgets, report aggregates.

import { store } from './store.js';
import { addMonths, addDays, todayISO, round2, monthLabel, parseISO } from './utils.js';

export const ACCOUNT_TYPES = {
  bank: { label: 'Bank account', plural: 'Bank accounts', icon: '🏦' },
  savings: { label: 'Savings', plural: 'Savings', icon: '🐷' },
  credit: { label: 'Credit card', plural: 'Credit cards', icon: '💳' },
  cash: { label: 'Cash / Wallet', plural: 'Cash & wallets', icon: '👛' },
  support: { label: 'Family support (paid for us)', plural: 'Family support', icon: '🤝' },
};

/** True for accounts that are someone else's money (e.g. Dad paying on our behalf). */
export const isSupport = (a) => a?.type === 'support';

export const DEFAULT_CATEGORIES = [
  ['groceries', 'Groceries', '🛒'],
  ['dining', 'Dining out & Coffee', '🍽️'],
  ['housing', 'Rent / Housing', '🏠'],
  ['utilities', 'Electricity & Water', '💡'],
  ['phone', 'Phone & Internet', '📱'],
  ['transport', 'Fuel & Transport', '⛽'],
  ['car', 'Car (service, insurance)', '🚗'],
  ['shopping', 'Shopping & Clothes', '🛍️'],
  ['home', 'Home & Furniture', '🛋️'],
  ['health', 'Health & Pharmacy', '💊'],
  ['personal', 'Personal care', '💇'],
  ['kids', 'Kids', '🧸'],
  ['education', 'Education', '📚'],
  ['entertainment', 'Entertainment', '🎬'],
  ['subscriptions', 'Subscriptions', '🔁'],
  ['travel', 'Travel', '✈️'],
  ['gifts', 'Gifts & Charity', '🎁'],
  ['family', 'Family support', '👨‍👩‍👧'],
  ['fees', 'Bank fees & Interest', '🧾'],
  ['other', 'Other', '📦'],
].map(([k, name, icon], i) => ({ id: 'cat-' + k, name, icon, kind: 'expense', order: i }))
  .concat([
    ['salary', 'Salary', '💼'],
    ['bonus', 'Bonus', '🎉'],
    ['refund', 'Refund / Cashback', '↩️'],
    ['other-income', 'Other income', '💰'],
  ].map(([k, name, icon], i) => ({ id: 'cat-' + k, name, icon, kind: 'income', order: 100 + i })));

export const visible = (list) => list.filter((x) => !x.archived);

export const accounts = () => store.all('accounts').sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
export const categories = (kind) => store.all('categories')
  .filter((c) => !kind || c.kind === kind)
  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
export const budgets = () => store.all('budgets').sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
export const transactions = () => store.all('transactions')
  .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));

// ── memoised per data version ───────────────────────────────────────────────
let memoV = -1;
let memo = {};
function cached(key, fn) {
  if (memoV !== store.version) { memo = {}; memoV = store.version; }
  if (!(key in memo)) memo[key] = fn();
  return memo[key];
}

// ── budget months (salary cycles) ───────────────────────────────────────────
// A budget month is keyed by the calendar month it starts in ('YYYY-MM').
// With cycleDay 25 the "2026-11" budget month runs 25 Nov → 24 Dec. If salaryStart is on,
// a Salary income that lands up to 7 days before (or 3 days after) the 25th starts it on that day.
export const cycleDay = () => Math.min(28, Math.max(1, Number(store.settings().cycleDay) || 1));
const salaryStartOn = () => store.settings().salaryStart !== false;

const salaryDates = () => cached('salaryDates', () => store.all('transactions')
  .filter((t) => t.type === 'income' && t.categoryId === 'cat-salary' && t.date).map((t) => t.date).sort());

export function periodStart(ym) {
  return cached('ps' + ym, () => {
    const d = cycleDay();
    const base = `${ym}-${String(d).padStart(2, '0')}`;
    if (d === 1 || !salaryStartOn()) return base;
    let lo = addDays(base, -7);
    if (lo < ym + '-01') lo = ym + '-01'; // never reach back into the previous calendar month
    const hi = addDays(base, 3);
    return salaryDates().find((x) => x >= lo && x <= hi) || base;
  });
}

export function periodRange(ym) {
  return { start: periodStart(ym), end: addDays(periodStart(addMonths(ym, 1)), -1) };
}

/** The budget month a date belongs to. */
export function periodOf(iso) {
  const ym = iso.slice(0, 7);
  return iso >= periodStart(ym) ? ym : addMonths(ym, -1);
}

export const currentPeriod = () => periodOf(todayISO());

const dayCount = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 864e5) + 1;
export const periodDays = (ym) => { const r = periodRange(ym); return dayCount(r.start, r.end); };
/** Days of the budget month already lived (all of it for a past month). */
export function periodElapsed(ym) {
  const r = periodRange(ym);
  const t = todayISO();
  if (t > r.end) return dayCount(r.start, r.end);
  if (t < r.start) return 0;
  return dayCount(r.start, t);
}

/** "November 2026" for calendar months, "25 Nov – 24 Dec 2026" for salary cycles. */
export function periodLabel(ym) {
  if (cycleDay() === 1 && periodStart(ym) === ym + '-01') return monthLabel(ym);
  const r = periodRange(ym);
  const f = (iso, year) => parseISO(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}) });
  return `${f(r.start)} – ${f(r.end, true)}`;
}

/** Does a date fall in a key: 'YYYY' (12 budget months), 'YYYY-MM' (budget month) or 'YYYY-MM-DD'. */
export function inKey(date, key) {
  if (!date) return false;
  if (key.length === 10) return date === key;
  if (key.length === 7) { const r = periodRange(key); return date >= r.start && date <= r.end; }
  return date >= periodStart(key + '-01') && date <= periodRange(key + '-12').end;
}

/** Map accountId → current balance. Credit cards are negative when money is owed. */
export function balances() {
  return cached('balances', () => {
    const bal = {};
    for (const a of store.all('accounts')) bal[a.id] = Number(a.openingBalance) || 0;
    for (const t of store.all('transactions')) {
      const amt = Number(t.amount) || 0;
      if (t.type === 'expense') bal[t.accountId] = (bal[t.accountId] || 0) - amt;
      else if (t.type === 'income') bal[t.accountId] = (bal[t.accountId] || 0) + amt;
      else if (t.type === 'transfer') {
        bal[t.accountId] = (bal[t.accountId] || 0) - amt;
        bal[t.toAccountId] = (bal[t.toAccountId] || 0) + amt;
      }
    }
    for (const k in bal) bal[k] = round2(bal[k]);
    return bal;
  });
}

/** How much the transactions moved an account (used to back-solve the opening balance). */
export function txEffect(accountId) {
  const opening = Number(store.get('accounts', accountId)?.openingBalance) || 0;
  return round2((balances()[accountId] || 0) - opening);
}

export function accountSummary() {
  const bal = balances();
  const out = { bank: 0, savings: 0, cash: 0, creditOwed: 0, creditLimit: 0, net: 0, supportOwed: 0, hasSupport: false };
  for (const a of visible(accounts())) {
    const b = bal[a.id] || 0;
    if (a.type === 'support') {
      // A gift isn't our money and isn't a debt, so it stays out of net worth; a loan is a debt.
      out.hasSupport = true;
      if (a.repay) { out.supportOwed += -b; out.net += b; }
      continue;
    }
    if (a.type === 'credit') { out.creditOwed += -b; out.creditLimit += Number(a.limit) || 0; }
    else out[a.type] = (out[a.type] || 0) + b;
    out.net += b;
  }
  out.creditAvailable = out.creditLimit - out.creditOwed;
  return out;
}

/** What a support account paid for us (expenses + money sent to us), optionally within a period key. */
export function supportCovered(accountId, key = '') {
  let sum = 0;
  for (const t of store.all('transactions')) {
    if (t.accountId !== accountId || !inKey(t.date, key)) continue;
    if (t.type === 'expense' || t.type === 'transfer') sum += Number(t.amount) || 0;
  }
  return round2(sum);
}

export function supportSummary(key) {
  const list = visible(accounts()).filter(isSupport).map((a) => ({ account: a, period: supportCovered(a.id, key) }));
  return { list, period: round2(list.reduce((s, r) => s + r.period, 0)) };
}

// ── budgets ─────────────────────────────────────────────────────────────────
/** Budget amounts are stored per month they were set; a month uses the latest setting on/before it. */
export function budgetAmount(b, ym) {
  const amounts = b.amounts || {};
  const keys = Object.keys(amounts).sort();
  if (!keys.length) return Number(b.amount) || 0;
  let chosen = keys[0];
  for (const k of keys) if (k <= ym) chosen = k;
  return Number(amounts[chosen]) || 0;
}

export function budgetForCategory(categoryId) {
  return visible(budgets()).find((b) => (b.categoryIds || []).includes(categoryId));
}


export function budgetStatus(ym) {
  return cached('bs' + ym, () => {
    const spent = {};
    let unbudgeted = 0;
    for (const t of store.all('transactions')) {
      if (t.type !== 'expense' || !inKey(t.date, ym)) continue;
      if (t.budgetId && store.get('budgets', t.budgetId)) spent[t.budgetId] = (spent[t.budgetId] || 0) + Number(t.amount);
      else unbudgeted += Number(t.amount);
    }
    const isCurrent = ym === currentPeriod();
    const daysLeft = isCurrent ? periodDays(ym) - periodElapsed(ym) + 1 : 0;
    const rows = visible(budgets()).map((b) => {
      const amount = budgetAmount(b, ym);
      const s = round2(spent[b.id] || 0);
      const left = round2(amount - s);
      return {
        budget: b, amount, spent: s, left,
        ratio: amount > 0 ? s / amount : (s > 0 ? Infinity : 0),
        perDay: isCurrent && daysLeft > 0 && left > 0 ? left / daysLeft : 0,
      };
    });
    const total = rows.reduce((a, r) => a + r.amount, 0);
    const totalSpent = rows.reduce((a, r) => a + r.spent, 0);
    return { rows, total, totalSpent: round2(totalSpent), unbudgeted: round2(unbudgeted), daysLeft, isCurrent };
  });
}

// ── reports ─────────────────────────────────────────────────────────────────
/** period: { kind: 'day'|'month'|'year', key: 'YYYY-MM-DD'|'YYYY-MM'|'YYYY' } */
export function periodTx(key) {
  return store.all('transactions').filter((t) => inKey(t.date, key));
}

export function prevKey(kind, key) {
  if (kind === 'year') return String(Number(key) - 1);
  if (kind === 'month') return addMonths(key, -1);
  return addDays(key, -1);
}

export function totals(list) {
  let spent = 0, income = 0;
  for (const t of list) {
    if (t.type === 'expense') spent += Number(t.amount);
    else if (t.type === 'income') income += Number(t.amount);
  }
  return { spent: round2(spent), income: round2(income), net: round2(income - spent) };
}

export function groupSum(list, keyFn, type = 'expense') {
  const m = new Map();
  for (const t of list) {
    if (t.type !== type) continue;
    const k = keyFn(t) ?? '—';
    m.set(k, (m.get(k) || 0) + Number(t.amount));
  }
  return [...m.entries()].map(([key, value]) => ({ key, value: round2(value) })).sort((a, b) => b.value - a.value);
}
