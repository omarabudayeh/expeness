// Pure calculations over the store's data: balances, budgets, report aggregates.

import { store } from './store.js';
import { addMonths, addDays, daysInMonth, todayISO, round2 } from './utils.js';

export const ACCOUNT_TYPES = {
  bank: { label: 'Bank account', plural: 'Bank accounts', icon: '🏦' },
  savings: { label: 'Savings', plural: 'Savings', icon: '🐷' },
  credit: { label: 'Credit card', plural: 'Credit cards', icon: '💳' },
  cash: { label: 'Cash / Wallet', plural: 'Cash & wallets', icon: '👛' },
};

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
  const out = { bank: 0, savings: 0, cash: 0, creditOwed: 0, creditLimit: 0, net: 0 };
  for (const a of visible(accounts())) {
    const b = bal[a.id] || 0;
    if (a.type === 'credit') { out.creditOwed += -b; out.creditLimit += Number(a.limit) || 0; }
    else out[a.type] = (out[a.type] || 0) + b;
    out.net += b;
  }
  out.creditAvailable = out.creditLimit - out.creditOwed;
  return out;
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

const inMonth = (t, ym) => (t.date || '').startsWith(ym);

export function budgetStatus(ym) {
  return cached('bs' + ym, () => {
    const spent = {};
    let unbudgeted = 0;
    for (const t of store.all('transactions')) {
      if (t.type !== 'expense' || !inMonth(t, ym)) continue;
      if (t.budgetId && store.get('budgets', t.budgetId)) spent[t.budgetId] = (spent[t.budgetId] || 0) + Number(t.amount);
      else unbudgeted += Number(t.amount);
    }
    const isCurrent = ym === todayISO().slice(0, 7);
    const daysLeft = isCurrent ? daysInMonth(ym) - Number(todayISO().slice(8)) + 1 : 0;
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
  return store.all('transactions').filter((t) => (t.date || '').startsWith(key));
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
