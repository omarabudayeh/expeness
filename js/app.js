// Home Budget — main UI. Plain ES modules, no build step.

import { CONFIG } from './config.js';
import { store, LocalBackend, ArtifactBackend, readLocalSnapshot } from './store.js';
import {
  ACCOUNT_TYPES, DEFAULT_CATEGORIES, isSupport, supportCovered, supportSummary, accounts, categories, budgets, transactions, visible,
  balances, txEffect, accountSummary, budgetAmount, budgetForCategory, budgetStatus,
  periodTx, prevKey, totals, groupSum,
  cycleDay, periodStart, periodRange, periodOf, currentPeriod, periodDays, periodElapsed, periodLabel, inKey,
} from './calc.js';
import { barChart, rankBars, shareStrip, progress, installTooltips } from './charts.js';
import {
  uid, todayISO, thisMonth, thisYear, addMonths, addDays, daysInMonth, monthLabel, shortMonth,
  dayLabel, longDay, esc, money, round2, pct, download, lsGet, lsSet, debounce,
} from './utils.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// ── UI state ────────────────────────────────────────────────────────────────
const ui = {
  month: thisMonth(),
  report: { kind: 'month', key: thisMonth() },
  filters: { type: 'all', q: '', accountId: '', categoryId: '', memberId: '', budgetId: '' },
  showFilters: false,
};
let ready = false;
let backend = null;

const cur = () => store.settings().currency || 'SAR';
const fmt = (n) => money(n, cur());
const fmtC = (n) => money(n, cur(), { compact: true });
const fmtS = (n) => money(n, cur(), { compact: true, short: true });

// ── icons ───────────────────────────────────────────────────────────────────
const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
const I = {
  home: svg('<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>'),
  list: svg('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>', 'stroke-width="2.5"'),
  pie: svg('<path d="M21 12a9 9 0 1 1-9-9v9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>'),
  chart: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  bank: svg('<path d="M3 10l9-6 9 6"/><path d="M5 10v8M9 10v8M15 10v8M19 10v8M3 21h18"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  left: svg('<path d="M15 18l-6-6 6-6"/>'),
  right: svg('<path d="M9 18l6-6-6-6"/>'),
  x: svg('<path d="M18 6L6 18M6 6l12 12"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'),
  filter: svg('<path d="M3 5h18l-7 8v6l-4 2v-8z"/>'),
  swap: svg('<path d="M7 7h13l-4-4M17 17H4l4 4"/>'),
  cloud: svg('<path d="M17.5 19a4.5 4.5 0 0 0 .5-9 6 6 0 0 0-11.6 1.5A4 4 0 0 0 7 19z"/>'),
};

// ── toasts & sheets ─────────────────────────────────────────────────────────
function toast(msg, action) {
  const host = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span>${esc(msg)}</span>` + (action ? `<button class="link">${esc(action.label)}</button>` : '');
  if (action) el.querySelector('button').onclick = () => { action.fn(); el.remove(); };
  host.appendChild(el);
  setTimeout(() => el.classList.add('out'), action ? 5000 : 2600);
  setTimeout(() => el.remove(), action ? 5400 : 3000);
}

function openSheet(title, body, { wide = false } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet${wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="sheet-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Close">${I.x}</button></div>
    <div class="sheet-body">${body}</div></div>`;
  document.body.appendChild(wrap);
  document.body.classList.add('no-scroll');
  requestAnimationFrame(() => wrap.classList.add('open'));
  const close = () => {
    wrap.classList.remove('open');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => { wrap.remove(); if (!$('.sheet-wrap')) document.body.classList.remove('no-scroll'); }, 200);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) close(); });
  return { el: wrap, close };
}

function closeAllSheets() {
  $$('.sheet-wrap').forEach((w) => w.parentNode && w.parentNode.removeChild(w));
  document.body.classList.remove('no-scroll');
}

function confirmSheet(message, okLabel = 'Delete') {
  return new Promise((resolve) => {
    const s = openSheet('Are you sure?', `<p>${esc(message)}</p>
      <div class="row-btns"><button class="btn" data-close>Cancel</button><button class="btn danger" id="ok">${esc(okLabel)}</button></div>`);
    $('#ok', s.el).onclick = () => { resolve(true); s.close(); };
    s.el.addEventListener('click', (e) => { if (e.target.closest('[data-close]') || e.target === s.el) resolve(false); });
  });
}

// ── lookups ─────────────────────────────────────────────────────────────────
const catOf = (id) => store.get('categories', id);
const accOf = (id) => store.get('accounts', id);
const budOf = (id) => store.get('budgets', id);
const members = () => store.settings().members || [];
const memberName = (id) => members().find((m) => m.id === id)?.name || '';
const accIcon = (a) => ACCOUNT_TYPES[a?.type]?.icon || '🏦';

function defaultMember() {
  const email = backend?.user?.email?.toLowerCase();
  const ms = members();
  const byUid = backend?.uid && ms.find((m) => m.uid === backend.uid);
  if (byUid) return byUid.id;
  const byEmail = email && ms.find((m) => (m.email || '').toLowerCase() === email);
  if (byEmail) return byEmail.id;
  const last = lsGet('hb-last-member');
  return ms.find((m) => m.id === last)?.id || ms[0]?.id || '';
}

function accountOptionLabel(a) {
  const b = balances()[a.id] || 0;
  if (a.type === 'credit') return `${accIcon(a)} ${a.name} — ${fmtC((Number(a.limit) || 0) + b)} available`;
  if (isSupport(a)) return `${accIcon(a)} ${a.name}${a.repay ? ` — we owe ${fmtC(-b)}` : ''}`;
  return `${accIcon(a)} ${a.name} — ${fmtC(b)}`;
}

// ── transaction row ─────────────────────────────────────────────────────────
function txRow(t) {
  const c = catOf(t.categoryId);
  const a = accOf(t.accountId);
  let icon = c?.icon || '•', title = t.note || c?.name || 'Uncategorized', sub = [];
  if (t.type === 'transfer') {
    icon = '↔';
    const to = accOf(t.toAccountId);
    title = t.note || (isSupport(a) ? `Received from ${a.name}` : isSupport(to) ? `Paid back → ${to.name}`
      : to?.type === 'credit' ? `Card payment → ${to.name}` : `Transfer → ${to?.name || '?'}`);
    sub.push(`${a?.name || '?'} → ${to?.name || '?'}`);
  } else {
    if (t.note && c) sub.push(c.name);
    if (a) sub.push(a.name);
  }
  if (t.type === 'expense' && t.budgetId && budOf(t.budgetId) && budOf(t.budgetId).name !== c?.name) sub.push('Budget: ' + budOf(t.budgetId).name);
  const who = memberName(t.memberId);
  if (who) sub.push(who);
  const sign = t.type === 'expense' ? '−' : t.type === 'income' ? '+' : '';
  return `<button class="tx" data-action="edit-tx" data-id="${esc(t.id)}">
    <span class="tx-ico">${esc(icon)}</span>
    <span class="tx-main"><span class="tx-title">${esc(title)}</span><span class="tx-sub">${esc(sub.join(' · '))}</span></span>
    <span class="tx-amt ${t.type}">${sign}${esc(fmt(t.amount))}</span></button>`;
}

function txList(list, { groupByDay = true, limit } = {}) {
  if (!list.length) return '<div class="empty">No transactions yet. Tap <b>+</b> to add one.</div>';
  const items = limit ? list.slice(0, limit) : list;
  if (!groupByDay) return `<div class="tx-list">${items.map(txRow).join('')}</div>`;
  let html = '', day = null, buf = [], daySpent = 0;
  const flush = () => {
    if (!day) return;
    html += `<div class="day-head"><span>${esc(dayLabel(day))}</span><span>${daySpent ? '−' + esc(fmt(daySpent)) : ''}</span></div><div class="tx-list">${buf.join('')}</div>`;
  };
  for (const t of items) {
    if (t.date !== day) { flush(); day = t.date; buf = []; daySpent = 0; }
    buf.push(txRow(t));
    if (t.type === 'expense') daySpent += Number(t.amount);
  }
  flush();
  return html;
}

const monthNav = (key, label) => `<div class="period-nav">
  <button class="icon-btn" data-action="${key}-prev" aria-label="Previous">${I.left}</button>
  <span class="period-label">${esc(label)}</span>
  <button class="icon-btn" data-action="${key}-next" aria-label="Next">${I.right}</button></div>`;

// ── views ───────────────────────────────────────────────────────────────────
function viewHome() {
  const ym = currentPeriod();
  const s = store.settings();
  const tot = totals(periodTx(ym));
  const bs = budgetStatus(ym);
  const acc = accountSummary();
  const hasAccounts = visible(accounts()).length > 0;
  const topCats = groupSum(periodTx(ym), (t) => t.categoryId).slice(0, 5).map((r) => ({
    label: catOf(r.key)?.name || 'Uncategorized', icon: catOf(r.key)?.icon, value: r.value, key: r.key,
  }));
  const budgetRows = [...bs.rows].filter((r) => r.amount > 0 || r.spent > 0).sort((a, b) => b.ratio - a.ratio).slice(0, 4);
  const day = periodElapsed(ym);
  const avg = day ? tot.spent / day : 0;

  return `
  <section class="hero card">
    <div class="muted">${esc(periodLabel(ym))} · spent so far</div>
    <div class="hero-num">${esc(fmt(tot.spent))}</div>
    ${bs.total > 0 ? `${progress(bs.totalSpent / bs.total)}
      <div class="hero-sub"><span>${esc(fmt(bs.totalSpent))} of ${esc(fmt(bs.total))} budgeted</span>
      <span>${bs.total - bs.totalSpent >= 0 ? esc(fmt(bs.total - bs.totalSpent)) + ' left' : '<b class="over">' + esc(fmt(bs.totalSpent - bs.total)) + ' over</b>'}</span></div>`
      : `<div class="hero-sub"><a href="#budgets">Set monthly budgets →</a></div>`}
    <div class="kpis">
      <div><div class="muted tiny">Income</div><div class="kpi-val">${esc(fmtC(tot.income))}</div></div>
      <div><div class="muted tiny">Avg / day</div><div class="kpi-val">${esc(fmtC(avg))}</div></div>
      <div><div class="muted tiny">Saved this month</div><div class="kpi-val">${esc(fmtC(tot.net))}</div></div>
    </div>
  </section>

  <section class="card">
    <div class="card-head"><h3>Accounts</h3><a href="#accounts">Manage</a></div>
    ${hasAccounts ? `<div class="acc-rows">
      <div class="acc-line"><span>🏦 Bank${acc.cash ? ' & cash' : ''}</span><b>${esc(fmt(acc.bank + acc.cash))}</b></div>
      <div class="acc-line"><span>🐷 Savings</span><b>${esc(fmt(acc.savings))}</b></div>
      ${acc.creditLimit || acc.creditOwed ? `<div class="acc-line"><span>💳 Credit cards owed</span><b>${esc(fmt(acc.creditOwed))}</b></div>
      ${acc.creditLimit ? `${progress(acc.creditOwed / acc.creditLimit, { thin: true })}<div class="muted tiny">${esc(fmt(acc.creditAvailable))} available of ${esc(fmt(acc.creditLimit))} limit</div>` : ''}` : ''}
      ${supportSummary(ym).list.map((r) => `<div class="acc-line"><span>🤝 From ${esc(r.account.name)} this month</span><b>${esc(fmt(r.period))}</b></div>`).join('')}
    </div>
    <div class="net-row"><span class="muted">Net worth</span><b>${esc(fmt(acc.net))}</b></div>`
    : `<div class="empty small">Add your bank, savings and credit card accounts to track balances.<br><button class="btn primary sm" data-action="add-account">Add account</button></div>`}
  </section>

  <section class="card">
    <div class="card-head"><h3>Budgets this month</h3><a href="#budgets">All</a></div>
    ${budgetRows.length ? budgetRows.map(budgetMini).join('') : '<div class="empty small">No budgets yet. <a href="#budgets">Create one</a></div>'}
    ${bs.unbudgeted > 0 ? `<div class="muted tiny" style="margin-top:8px">${esc(fmt(bs.unbudgeted))} spent outside any budget</div>` : ''}
  </section>

  <section class="card">
    <div class="card-head"><h3>Where the money went</h3><a href="#reports">Reports</a></div>
    ${rankBars(topCats, { fmt: fmtC, total: tot.spent, onClickAttr: (r) => `data-action="drill" data-cat="${esc(r.key)}" data-month="${ym}"` })}
  </section>

  <section class="card">
    <div class="card-head"><h3>Recent</h3><a href="#activity">See all</a></div>
    ${txList(transactions(), { groupByDay: false, limit: 6 })}
  </section>
  <div class="muted tiny center">${esc(s.householdName || '')}</div>`;
}

function budgetMini(r) {
  const b = r.budget;
  const status = r.left >= 0 ? `${fmtC(r.left)} left` : `${fmtC(-r.left)} over`;
  return `<button class="budget-mini" data-action="budget-detail" data-id="${esc(b.id)}">
    <div class="bm-top"><span>${esc(b.icon || '🎯')} ${esc(b.name)}</span><span class="${r.left < 0 ? 'over' : 'muted'}">${esc(status)}</span></div>
    ${progress(r.ratio, { thin: true })}</button>`;
}

function filteredTx() {
  const f = ui.filters;
  const q = f.q.trim().toLowerCase();
  return transactions().filter((t) => {
    if (!inKey(t.date, ui.month)) return false;
    if (f.type !== 'all' && t.type !== f.type) return false;
    if (f.accountId && t.accountId !== f.accountId && t.toAccountId !== f.accountId) return false;
    if (f.categoryId && t.categoryId !== f.categoryId) return false;
    if (f.memberId && t.memberId !== f.memberId) return false;
    if (f.budgetId && t.budgetId !== f.budgetId) return false;
    if (ui.unbudgetedOnly && (t.type !== 'expense' || (t.budgetId && budOf(t.budgetId)))) return false;
    if (q) {
      const hay = [t.note, catOf(t.categoryId)?.name, accOf(t.accountId)?.name, memberName(t.memberId), String(t.amount)].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function viewActivity() {
  const list = filteredTx();
  const tot = totals(list);
  const f = ui.filters;
  const activeFilters = ['accountId', 'categoryId', 'memberId', 'budgetId'].filter((k) => f[k]).length + (ui.unbudgetedOnly ? 1 : 0);
  const opt = (arr, sel, labelFn) => arr.map((x) => `<option value="${esc(x.id)}" ${x.id === sel ? 'selected' : ''}>${esc(labelFn(x))}</option>`).join('');
  return `
  ${monthNav('month', periodLabel(ui.month))}
  <div class="search-row">
    <label class="search">${I.search}<input id="search" type="search" placeholder="Search notes, categories, amounts…" value="${esc(f.q)}"></label>
    <button class="icon-btn ${activeFilters ? 'active' : ''}" data-action="toggle-filters" aria-label="Filters">${I.filter}${activeFilters ? `<span class="dot">${activeFilters}</span>` : ''}</button>
  </div>
  <div class="chips">
    ${['all', 'expense', 'income', 'transfer'].map((k) => `<button class="chip ${f.type === k ? 'on' : ''}" data-action="type-filter" data-v="${k}">${{ all: 'All', expense: 'Expenses', income: 'Income', transfer: 'Transfers' }[k]}</button>`).join('')}
  </div>
  ${ui.unbudgetedOnly ? '<button class="chip on" data-action="clear-filters">📭 Not in any budget ✕</button>' : ''}
  ${ui.showFilters ? `<div class="card filters">
    <label>Account<select data-filter="accountId"><option value="">All accounts</option>${opt(accounts(), f.accountId, (a) => a.name)}</select></label>
    <label>Category<select data-filter="categoryId"><option value="">All categories</option>${opt(categories(), f.categoryId, (c) => `${c.icon} ${c.name}`)}</select></label>
    <label>Budget<select data-filter="budgetId"><option value="">All budgets</option>${opt(budgets(), f.budgetId, (b) => b.name)}</select></label>
    <label>Who<select data-filter="memberId"><option value="">Both of us</option>${opt(members(), f.memberId, (m) => m.name)}</select></label>
    <button class="btn sm" data-action="clear-filters">Clear filters</button>
  </div>` : ''}
  <div class="sum-row">
    <div><span class="muted tiny">Spent</span><b>${esc(fmt(tot.spent))}</b></div>
    <div><span class="muted tiny">Income</span><b>${esc(fmt(tot.income))}</b></div>
    <div><span class="muted tiny">Count</span><b>${list.length}</b></div>
  </div>
  ${txList(list)}`;
}

function viewBudgets() {
  const ym = ui.month;
  const bs = budgetStatus(ym);
  const rows = bs.rows;
  return `
  ${monthNav('month', periodLabel(ym))}
  <section class="card">
    <div class="split"><div><div class="muted tiny">Budgeted</div><div class="kpi-val">${esc(fmtC(bs.total))}</div></div>
    <div><div class="muted tiny">Spent</div><div class="kpi-val">${esc(fmtC(bs.totalSpent))}</div></div>
    <div><div class="muted tiny">${bs.total - bs.totalSpent >= 0 ? 'Left' : 'Over'}</div><div class="kpi-val ${bs.total - bs.totalSpent < 0 ? 'over' : ''}">${esc(fmtC(Math.abs(bs.total - bs.totalSpent)))}</div></div></div>
    ${bs.total > 0 ? progress(bs.totalSpent / bs.total) : ''}
    ${bs.isCurrent && bs.total - bs.totalSpent > 0 ? `<div class="muted tiny" style="margin-top:6px">≈ ${esc(fmt((bs.total - bs.totalSpent) / bs.daysLeft))} per day for the remaining ${bs.daysLeft} day${bs.daysLeft === 1 ? '' : 's'}</div>` : ''}
  </section>
  <div class="card-head pad"><h3>Monthly budgets</h3><button class="btn primary sm" data-action="add-budget">+ New budget</button></div>
  ${rows.length ? rows.map((r) => budgetCard(r)).join('') : `<div class="card empty">
     <p>A budget is a monthly limit, e.g. <b>Groceries 2,000</b>. When you add an expense, you choose which budget it comes out of.</p>
     <button class="btn primary" data-action="add-budget">Create first budget</button>
     <button class="btn" data-action="quick-budgets">Create one per category</button></div>`}
  ${bs.unbudgeted > 0 ? `<button class="card budget-card" data-action="drill" data-budget="none" data-month="${ym}">
     <div class="bm-top"><span>📭 Not in any budget</span><b>${esc(fmt(bs.unbudgeted))}</b></div>
     <div class="muted tiny">Expenses this month that weren't assigned to a budget.</div></button>` : ''}`;
}

function budgetCard(r) {
  const b = r.budget;
  const cats = (b.categoryIds || []).map((id) => catOf(id)?.name).filter(Boolean);
  return `<button class="card budget-card" data-action="budget-detail" data-id="${esc(b.id)}">
    <div class="bm-top"><span class="bc-name">${esc(b.icon || '🎯')} ${esc(b.name)}</span>
      <span><b>${esc(fmt(r.spent))}</b> <span class="muted">/ ${esc(fmt(r.amount))}</span></span></div>
    ${progress(r.ratio)}
    <div class="bm-top tiny"><span class="muted">${esc(cats.join(', ') || 'Any category')}</span>
      <span class="${r.left < 0 ? 'over' : 'muted'}">${r.left >= 0 ? esc(fmt(r.left)) + ' left' + (r.perDay ? ` · ${esc(fmtC(r.perDay))}/day` : '') : '⚠ ' + esc(fmt(-r.left)) + ' over'}</span></div>
  </button>`;
}

function viewAccounts() {
  const bal = balances();
  const acc = accountSummary();
  const list = visible(accounts());
  const groups = Object.entries(ACCOUNT_TYPES).map(([type, meta]) => {
    const items = list.filter((a) => a.type === type);
    if (!items.length) return '';
    return `<div class="card-head pad"><h3>${meta.icon} ${esc(meta.plural)}</h3></div>` + items.map((a) => {
      const b = bal[a.id] || 0;
      if (isSupport(a)) {
        const month = supportCovered(a.id, currentPeriod());
        const year = supportCovered(a.id, thisYear());
        return `<button class="card acc-card" data-action="account-detail" data-id="${esc(a.id)}">
          <div class="bm-top"><span class="bc-name">${esc(a.name)}</span><span><b>${esc(fmt(month))}</b> <span class="muted">this month</span></span></div>
          <div class="bm-top tiny muted"><span>${esc(fmt(year))} in ${thisYear()}</span>
          <span>${a.repay ? `We owe ${esc(fmt(Math.max(0, -b)))}` : `${esc(fmt(Math.max(0, -b)))} in total · gift`}</span></div></button>`;
      }
      if (a.type === 'credit') {
        const owed = -b, limit = Number(a.limit) || 0;
        return `<button class="card acc-card" data-action="account-detail" data-id="${esc(a.id)}">
          <div class="bm-top"><span class="bc-name">${esc(a.name)}</span><span><b>${esc(fmt(Math.abs(owed)))}</b> <span class="muted">${owed >= 0 ? 'owed' : 'in credit'}</span></span></div>
          ${limit ? progress(owed / limit) : ''}
          <div class="bm-top tiny muted"><span>Limit ${esc(fmt(limit))}</span><span>${esc(fmt(limit - owed))} available</span></div></button>`;
      }
      const goal = Number(a.goal) || 0;
      return `<button class="card acc-card" data-action="account-detail" data-id="${esc(a.id)}">
        <div class="bm-top"><span class="bc-name">${esc(a.name)}</span><b class="${b < 0 ? 'over' : ''}">${esc(fmt(b))}</b></div>
        ${goal ? `<div class="progress"><div class="progress-fill goal" style="width:${Math.max(0, Math.min(100, pct(b, goal)))}%"></div></div><div class="muted tiny">Goal ${esc(fmt(goal))} · ${Math.round(pct(b, goal))}% reached</div>` : ''}</button>`;
    }).join('');
  }).join('');
  const archived = accounts().filter((a) => a.archived);
  return `
  <section class="card hero">
    <div class="muted">Net worth (all accounts − card debt)</div>
    <div class="hero-num">${esc(fmt(acc.net))}</div>
    <div class="kpis"><div><div class="muted tiny">Bank + cash</div><div class="kpi-val">${esc(fmtC(acc.bank + acc.cash))}</div></div>
    <div><div class="muted tiny">Savings</div><div class="kpi-val">${esc(fmtC(acc.savings))}</div></div>
    <div><div class="muted tiny">Cards owed</div><div class="kpi-val">${esc(fmtC(acc.creditOwed))}</div></div></div>
    ${acc.hasSupport ? `<div class="muted tiny" style="margin-top:10px">🤝 Family support isn't counted in net worth${acc.supportOwed > 0 ? `, except the ${esc(fmt(acc.supportOwed))} you plan to pay back` : ' (it is a gift, not your money or a debt)'}.</div>` : ''}
  </section>
  <div class="row-btns"><button class="btn primary" data-action="add-account">+ Add account</button>
    <button class="btn" data-action="add-tx" data-type="transfer">${I.swap} Transfer / Pay card</button></div>
  ${groups || '<div class="card empty">No accounts yet.</div>'}
  ${archived.length ? `<details class="card"><summary>Archived accounts (${archived.length})</summary>${archived.map((a) =>
    `<button class="tx" data-action="account-detail" data-id="${esc(a.id)}"><span class="tx-ico">${accIcon(a)}</span><span class="tx-main"><span class="tx-title">${esc(a.name)}</span></span><span class="tx-amt">${esc(fmt(bal[a.id] || 0))}</span></button>`).join('')}</details>` : ''}`;
}

function viewReports() {
  const { kind, key } = ui.report;
  const list = periodTx(key);
  const tot = totals(list);
  const prev = totals(periodTx(prevKey(kind, key)));
  const label = kind === 'year' ? key : kind === 'month' ? periodLabel(key) : longDay(key);
  const prevLabel = kind === 'year' ? String(Number(key) - 1) : kind === 'month' ? 'last month' : 'previous day';
  const delta = prev.spent > 0 ? ((tot.spent - prev.spent) / prev.spent) * 100 : null;

  let trend = '';
  if (kind === 'month') {
    // one bar per day of the budget month (e.g. 25 Nov → 24 Dec)
    const { start } = periodRange(key);
    const days = Array.from({ length: periodDays(key) }, (_, i) => addDays(start, i));
    const byDay = Object.fromEntries(days.map((d) => [d, 0]));
    list.forEach((t) => { if (t.type === 'expense' && t.date in byDay) byDay[t.date] += Number(t.amount); });
    trend = barChart(days.map((d) => ({ label: String(Number(d.slice(8))), value: round2(byDay[d]), tip: `${dayLabel(d)}: ${fmt(byDay[d])}`, highlight: d === todayISO() })), { fmt: fmtS });
  } else if (kind === 'year') {
    const months = Array.from({ length: 12 }, (_, i) => `${key}-${String(i + 1).padStart(2, '0')}`);
    const byMonth = Object.fromEntries(months.map((m) => [m, 0]));
    list.forEach((t) => { if (t.type === 'expense') { const m = periodOf(t.date); if (m in byMonth) byMonth[m] += Number(t.amount); } });
    trend = barChart(months.map((m) => ({ label: shortMonth(m).slice(0, 3), value: round2(byMonth[m]), tip: `${periodLabel(m)}: ${fmt(byMonth[m])}`, highlight: m === currentPeriod() })), { fmt: fmtS });
  }

  const daysCount = kind === 'year'
    ? Array.from({ length: 12 }, (_, i) => periodElapsed(`${key}-${String(i + 1).padStart(2, '0')}`)).reduce((a2, b2) => a2 + b2, 0)
    : kind === 'month' ? periodElapsed(key) : 1;

  const cats = groupSum(list, (t) => t.categoryId).map((r) => ({ label: catOf(r.key)?.name || 'Uncategorized', icon: catOf(r.key)?.icon, value: r.value, key: r.key }));
  const who = groupSum(list, (t) => t.memberId).map((r) => ({ label: memberName(r.key) || 'Unassigned', value: r.value }));
  const byAcc = groupSum(list, (t) => t.accountId).map((r) => ({ label: accOf(r.key)?.name || '?', icon: accIcon(accOf(r.key)), value: r.value }));
  const byBudget = groupSum(list, (t) => (t.budgetId && budOf(t.budgetId) ? t.budgetId : 'none')).map((r) => ({
    label: r.key === 'none' ? 'Not in a budget' : budOf(r.key).name, icon: r.key === 'none' ? '📭' : budOf(r.key).icon, value: r.value,
  }));
  const incomeCats = groupSum(list, (t) => t.categoryId, 'income').map((r) => ({ label: catOf(r.key)?.name || 'Income', icon: catOf(r.key)?.icon, value: r.value }));
  const biggest = list.filter((t) => t.type === 'expense').sort((a, b) => b.amount - a.amount).slice(0, 5);
  const supportPaid = round2(list.filter((t) => t.type === 'expense' && isSupport(accOf(t.accountId))).reduce((a2, t) => a2 + Number(t.amount), 0));
  const drillMonth = kind === 'day' ? periodOf(key) : kind === 'month' ? key : '';

  return `
  <div class="seg-ctl">${['day', 'month', 'year'].map((k) => `<button class="${kind === k ? 'on' : ''}" data-action="report-kind" data-v="${k}">${{ day: 'Daily', month: 'Monthly', year: 'Yearly' }[k]}</button>`).join('')}</div>
  ${monthNav('report', label)}
  <section class="card">
    <div class="split">
      <div><div class="muted tiny">Spent</div><div class="kpi-val">${esc(fmtC(tot.spent))}</div>
        ${delta != null ? `<div class="tiny muted">${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta).toFixed(0)}% vs ${esc(prevLabel)}</div>` : ''}</div>
      <div><div class="muted tiny">Income</div><div class="kpi-val">${esc(fmtC(tot.income))}</div></div>
      <div><div class="muted tiny">${tot.net >= 0 ? 'Saved' : 'Overspent'}</div><div class="kpi-val ${tot.net < 0 ? 'over' : ''}">${esc(fmtC(Math.abs(tot.net)))}</div>
        ${tot.income > 0 ? `<div class="tiny muted">${Math.round(pct(tot.net, tot.income))}% of income</div>` : ''}</div>
    </div>
    ${supportPaid > 0 ? `<div class="muted tiny" style="margin-top:8px">🤝 ${esc(fmt(supportPaid))} of this was paid for you by family support (${Math.round(pct(supportPaid, tot.spent))}%)</div>` : ''}
    ${kind !== 'day' ? `<div class="muted tiny" style="margin-top:8px">Average ${esc(fmt(tot.spent / Math.max(1, daysCount)))} per day</div>` : ''}
  </section>
  ${trend ? `<section class="card"><h3>${kind === 'month' ? 'Spending per day' : 'Spending per month'}</h3>${trend}</section>` : ''}
  <section class="card"><h3>By category</h3>
    ${rankBars(cats, { fmt, total: tot.spent, onClickAttr: drillMonth ? (r) => `data-action="drill" data-cat="${esc(r.key)}" data-month="${drillMonth}"` : null })}</section>
  ${who.length ? `<section class="card"><h3>Who spent</h3>${shareStrip(who, { fmt })}</section>` : ''}
  <section class="card"><h3>By budget</h3>${rankBars(byBudget, { fmt, total: tot.spent })}</section>
  <section class="card"><h3>Paid from</h3>${rankBars(byAcc, { fmt, total: tot.spent })}</section>
  ${incomeCats.length ? `<section class="card"><h3>Income sources</h3>${rankBars(incomeCats, { fmt, total: tot.income })}</section>` : ''}
  <section class="card"><h3>${kind === 'day' ? 'All transactions' : 'Biggest expenses'}</h3>
    ${kind === 'day' ? txList(list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)), { groupByDay: false }) : txList(biggest, { groupByDay: false })}</section>`;
}

function viewCategories() {
  const block = (kind, title) => `<div class="card-head pad"><h3>${title}</h3><button class="btn sm" data-action="add-category" data-kind="${kind}">+ Add</button></div>
    <div class="card tx-list">${visible(categories(kind)).map((c) => {
      const b = budgetForCategory(c.id);
      return `<button class="tx" data-action="edit-category" data-id="${esc(c.id)}"><span class="tx-ico">${esc(c.icon)}</span>
        <span class="tx-main"><span class="tx-title">${esc(c.name)}</span>${b ? `<span class="tx-sub">Budget: ${esc(b.name)}</span>` : ''}</span></button>`;
    }).join('') || '<div class="empty small">None</div>'}</div>`;
  return `<a class="back" href="#prefs">${I.left} Settings</a>` + block('expense', 'Expense categories') + block('income', 'Income categories');
}

function viewSettings() {
  const s = store.settings();
  const local = store.mode === 'local';
  const shared = store.mode === 'shared';
  const localSnap = !local ? readLocalSnapshot() : null;
  return `
  <section class="card">
    <h3>Household</h3>
    <form id="settings-form" class="form">
      <label>Household name<input name="householdName" value="${esc(s.householdName)}"></label>
      <label>Currency<input name="currency" list="currencies" value="${esc(s.currency)}" maxlength="3" style="text-transform:uppercase"></label>
      <label>Budget month starts on
        <select name="cycleDay">${Array.from({ length: 28 }, (_, i) => i + 1).map((d) => `<option value="${d}" ${d === cycleDay() ? 'selected' : ''}>${d === 1 ? '1st (calendar month)' : 'Day ' + d + ' of each month'}</option>`).join('')}</select></label>
      <label class="check"><input type="checkbox" name="salaryStart" ${s.salaryStart !== false ? 'checked' : ''}> Start a few days earlier when the salary arrives early</label>
      <p class="muted tiny" style="margin-top:-6px">Pick the day your salary usually arrives (e.g. 25). Budgets, Home and Reports then run salary to salary. "Arrives early" uses income you add with the <b>Salary</b> category.</p>
      <datalist id="currencies">${['SAR', 'AED', 'KWD', 'QAR', 'BHD', 'OMR', 'JOD', 'EGP', 'USD', 'EUR', 'GBP', 'TRY', 'INR', 'PKR'].map((c) => `<option value="${c}">`).join('')}</datalist>
      <div class="field-label">Members (who paid)</div>
      ${members().map((m, i) => `<div class="member-row">
        <input name="m-name-${i}" value="${esc(m.name)}" placeholder="Name" aria-label="Name">
        ${shared ? `<button type="button" class="btn sm ${m.uid && m.uid === backend.uid ? 'primary' : ''}" data-action="claim-member" data-id="${esc(m.id)}">${m.uid && m.uid === backend.uid ? 'This is me' : 'I am ' + esc(m.name)}</button>`
        : `<input name="m-email-${i}" value="${esc(m.email || '')}" placeholder="Login email (optional)" type="email" aria-label="Email">`}
        <input type="hidden" name="m-id-${i}" value="${esc(m.id)}"></div>`).join('')}
      <div class="member-row"><input name="m-name-new" placeholder="+ Add a member">${shared ? '' : '<input name="m-email-new" placeholder="Email (optional)" type="email">'}</div>
      <p class="muted tiny">${shared ? 'Tap "I am …" on your own name so the app fills in "who paid" for you.' : 'The email lets the app pick "who paid" automatically when that person is signed in.'}</p>
      <button class="btn primary">Save</button>
    </form>
  </section>

  <section class="card tx-list">
    <a class="tx" href="#categories"><span class="tx-ico">🏷️</span><span class="tx-main"><span class="tx-title">Categories</span><span class="tx-sub">Add, rename or remove categories</span></span>${I.right}</a>
    <a class="tx" href="#accounts"><span class="tx-ico">🏦</span><span class="tx-main"><span class="tx-title">Accounts</span><span class="tx-sub">Bank, savings, credit cards, cash, family support</span></span>${I.right}</a>
    <a class="tx" href="#budgets"><span class="tx-ico">🎯</span><span class="tx-main"><span class="tx-title">Budgets</span><span class="tx-sub">Monthly limits</span></span>${I.right}</a>
  </section>

  <section class="card">
    <h3>Sharing & sync</h3>
    ${shared ? `<p><span class="badge ok">${I.cloud} Shared on claude.ai</span></p>
      <p class="muted">Your data is saved in this page's private database on claude.ai. Anyone you share the page with as <b>Editor</b> sees and edits the same budget live.</p>
      <ol class="steps"><li>Click <b>Share</b> at the top of this page on claude.ai.</li><li>Invite your wife's email and choose <b>Editor</b>.</li><li>She opens the link, signs in to claude.ai, and taps "I am …" on her name here in Settings.</li></ol>`
    : local ? `<p><span class="badge">This device only</span></p>
      <p class="muted">Data is saved in this browser only. To share one live budget with your wife on both phones, connect the free Firebase backend — see <b>README → "Use it together with your wife"</b>. Then use <i>Import backup</i> to bring this data along.</p>`
    : `<p><span class="badge ok">${I.cloud} Shared & synced</span></p>
      <p class="muted">Signed in as <b>${esc(backend.user?.email || '')}</b>. Everything you add appears on your wife's phone within a second (and works offline).</p>
      ${localSnap ? '<button class="btn" data-action="upload-local">Upload data saved on this device before sharing was enabled</button>' : ''}
      <button class="btn" data-action="sign-out">Sign out</button>`}
  </section>

  <section class="card">
    <h3>Backup & export</h3>
    <div class="row-btns wrap">
      <button class="btn" data-action="export-json">Download backup</button>
      <button class="btn" data-action="import-json">Restore / import backup</button>
      <button class="btn" data-action="export-csv">Export to Excel (CSV)</button>
    </div>
    <input type="file" id="import-file" accept=".json,application/json" hidden>
    ${local ? '<button class="btn danger sm" data-action="reset" style="margin-top:12px">Erase all data on this device</button>' : ''}
  </section>
  <p class="muted tiny center">Home Budget · ${{ local: 'saved on this device', cloud: 'Firebase sync', shared: 'claude.ai shared database' }[store.mode]}</p>`;
}

// ── setup wizard ────────────────────────────────────────────────────────────
function needsSetup() { return !store.get('meta', 'settings'); }

function viewSetup() {
  const cloud = store.mode !== 'local';
  const localSnap = cloud ? readLocalSnapshot() : null;
  const shared = store.mode === 'shared';
  return `<section class="card setup">
    <div class="logo">💰</div>
    <h2>Welcome to your Home Budget</h2>
    <p class="muted">A two-minute setup. You can change everything later.</p>
    <form id="setup-form" class="form">
      <div class="field-label">Who uses this app?</div>
      ${shared ? `<div class="member-row"><input name="me" placeholder="Your name" required><input name="partner" placeholder="Your wife's name"></div>`
      : `<div class="member-row"><input name="me" placeholder="Your name" required><input name="meEmail" type="email" placeholder="Your login email" value="${esc(backend?.user?.email || '')}"></div>
      <div class="member-row"><input name="partner" placeholder="Your wife's name"><input name="partnerEmail" type="email" placeholder="Her login email"></div>`}
      <label>Currency<input name="currency" list="currencies2" value="SAR" maxlength="3" style="text-transform:uppercase"></label>
      <label>Salary usually arrives on day
        <select name="cycleDay">${Array.from({ length: 28 }, (_, i) => i + 1).map((d) => `<option value="${d}" ${d === 25 ? 'selected' : ''}>${d === 1 ? '1st (use calendar months)' : 'Day ' + d}</option>`).join('')}</select></label>
      <datalist id="currencies2">${['SAR', 'AED', 'KWD', 'QAR', 'BHD', 'OMR', 'JOD', 'EGP', 'USD', 'EUR', 'GBP'].map((c) => `<option value="${c}">`).join('')}</datalist>

      <div class="field-label">Your accounts today <span class="muted">(leave blank to skip)</span></div>
      <div class="member-row"><input name="bankName" value="Main bank account"><input name="bankBal" inputmode="decimal" placeholder="Balance"></div>
      <div class="member-row"><input name="savName" value="Savings"><input name="savBal" inputmode="decimal" placeholder="Balance"></div>
      <div class="member-row three"><input name="ccName" value="Credit card"><input name="ccLimit" inputmode="decimal" placeholder="Limit"><input name="ccOwed" inputmode="decimal" placeholder="Owed now"></div>
      <label class="check"><input type="checkbox" name="cash" checked> Also track cash (wallet)</label>
      <button class="btn primary big">Start tracking</button>
    </form>
    ${localSnap ? '<button class="btn" data-action="upload-local">…or upload the data already saved on this device</button>' : ''}
  </section>`;
}

const num = (v) => { const n = parseFloat(String(v || '').replace(/[, ]/g, '')); return Number.isFinite(n) ? n : 0; };

function submitSetup(form) {
  const f = Object.fromEntries(new FormData(form));
  const ms = [{ id: 'm1', name: f.me.trim(), email: (f.meEmail || '').trim(), uid: backend?.uid || '' }];
  if (f.partner.trim()) ms.push({ id: 'm2', name: f.partner.trim(), email: (f.partnerEmail || '').trim(), uid: '' });
  const items = DEFAULT_CATEGORIES.filter((c) => !store.get('categories', c.id)).map((doc) => ({ col: 'categories', doc: { ...doc, createdAt: Date.now() } }));
  const acc = (name, type, opening, extra = {}, order = 0) => ({ col: 'accounts', doc: { id: uid(), name, type, openingBalance: round2(opening), order, createdAt: Date.now(), ...extra } });
  if (f.bankName.trim()) items.push(acc(f.bankName.trim(), 'bank', num(f.bankBal), {}, 0));
  if (f.savName.trim() && (f.savBal || f.savName !== 'Savings')) items.push(acc(f.savName.trim(), 'savings', num(f.savBal), {}, 1));
  if (f.ccName.trim() && (f.ccLimit || f.ccOwed)) items.push(acc(f.ccName.trim(), 'credit', -num(f.ccOwed), { limit: num(f.ccLimit) }, 2));
  if (f.cash) items.push(acc('Cash', 'cash', 0, {}, 3));
  items.push({ col: 'meta', doc: { id: 'settings', householdName: 'Our Home', currency: (f.currency || 'SAR').toUpperCase().trim(), members: ms, cycleDay: Math.min(28, Math.max(1, Number(f.cycleDay) || 1)), salaryStart: true, createdAt: Date.now() } });
  store.putMany(items);
  lsSet('hb-last-member', 'm1');
  setTimeout(() => { ui.month = currentPeriod(); ui.report = { kind: 'month', key: currentPeriod() }; render(); }, 0);
  location.hash = '#home';
  toast('All set! Tap + to add your first expense.');
}

// ── forms: transaction ──────────────────────────────────────────────────────
function openTxForm(existing, preset = {}) {
  const t = existing || {
    type: preset.type || 'expense', amount: '', date: todayISO(), memberId: defaultMember(),
    categoryId: preset.categoryId || '', budgetId: preset.budgetId || '', accountId: preset.accountId || '', toAccountId: '', note: '',
  };
  const accs = visible(accounts()).concat(existing ? accounts().filter((a) => a.archived && (a.id === t.accountId || a.id === t.toAccountId)) : []);
  if (!accs.length) {
    toast('Add an account first (bank, card or cash).');
    openAccountForm();
    return;
  }
  const defaultAcc = (ty) => {
    const last = lsGet('hb-last-acc-' + ty);
    return (accs.find((a) => a.id === last && !a.archived) || accs.find((a) => a.type === 'bank')
      || accs.find((a) => a.type !== 'savings' && !isSupport(a)) || accs[0]).id;
  };
  if (!t.accountId) t.accountId = defaultAcc(t.type);
  const ms = members();

  const s = openSheet(existing ? 'Edit transaction' : 'New transaction', `
  <form class="form tx-form" novalidate>
    <div class="seg-ctl" role="radiogroup">${['expense', 'income', 'transfer'].map((k) => `<label class="${t.type === k ? 'on' : ''}"><input type="radio" name="type" value="${k}" ${t.type === k ? 'checked' : ''}>${{ expense: 'Expense', income: 'Income', transfer: 'Transfer' }[k]}</label>`).join('')}</div>
    <label class="amount-field"><span class="cur">${esc(cur())}</span><input name="amount" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${esc(t.amount)}" aria-label="Amount"></label>
    <div class="when-cat"><div class="field-label">Category</div><div class="cat-grid" id="cat-grid"></div></div>
    <div class="when-expense"><label>Deduct from budget<select name="budgetId" id="budget-sel"></select></label><div class="hint" id="budget-hint"></div></div>
    <label><span id="acc-label">Paid from</span><select name="accountId" id="acc-sel">${accs.map((a) => `<option value="${esc(a.id)}" ${a.id === t.accountId ? 'selected' : ''}>${esc(accountOptionLabel(a))}</option>`).join('')}</select></label>
    <div class="hint" id="acc-hint"></div>
    <label class="when-transfer">To account<select name="toAccountId">${accs.map((a) => `<option value="${esc(a.id)}" ${a.id === t.toAccountId ? 'selected' : ''}>${esc(accountOptionLabel(a))}</option>`).join('')}</select></label>
    <div class="two">
      <label>Date<input type="date" name="date" value="${esc(t.date)}" required></label>
      ${ms.length ? `<label>Who<select name="memberId">${ms.map((m) => `<option value="${esc(m.id)}" ${m.id === t.memberId ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>` : ''}
    </div>
    <label>Note<input name="note" value="${esc(t.note)}" placeholder="e.g. Panda, dinner with family…" autocomplete="off"></label>
    <div class="err" id="tx-err" role="alert"></div>
    <div class="row-btns">
      ${existing ? '<button type="button" class="btn danger" id="del">Delete</button>' : '<button type="button" class="btn" id="save-more">Save & add another</button>'}
      <button class="btn primary">Save</button>
    </div>
  </form>`);
  const form = $('form', s.el);
  let budgetTouched = !!existing;
  let toTouched = !!existing;

  const type = () => form.type.value;
  const renderCats = () => {
    const kind = type() === 'income' ? 'income' : 'expense';
    const list = visible(categories(kind)).concat(existing && catOf(t.categoryId)?.archived ? [catOf(t.categoryId)] : []);
    $('#cat-grid', form).innerHTML = list.map((c) => `<label class="cat ${c.id === t.categoryId ? 'on' : ''}"><input type="radio" name="categoryId" value="${esc(c.id)}" ${c.id === t.categoryId ? 'checked' : ''}><span class="ico">${esc(c.icon)}</span><span>${esc(c.name)}</span></label>`).join('');
  };
  const renderBudgets = () => {
    const ym = periodOf(form.date.value || todayISO());
    const st = budgetStatus(ym);
    const sel = $('#budget-sel', form);
    const current = sel.value || t.budgetId;
    sel.innerHTML = '<option value="">— No budget —</option>' + st.rows.map((r) =>
      `<option value="${esc(r.budget.id)}" ${r.budget.id === current ? 'selected' : ''}>${esc(r.budget.icon || '🎯')} ${esc(r.budget.name)} — ${esc(fmtC(r.left))} left</option>`).join('');
    updateHints();
  };
  const updateHints = () => {
    const amt = num(form.amount.value);
    const ym = periodOf(form.date.value || todayISO());
    const r = budgetStatus(ym).rows.find((x) => x.budget.id === form.budgetId.value);
    let h = '';
    if (r) {
      const editingSame = existing && existing.budgetId === r.budget.id && periodOf(existing.date) === ym ? Number(existing.amount) : 0;
      const after = r.left + editingSame - amt;
      h = `${fmt(r.amount)} budget · ${after >= 0 ? `${fmt(after)} left after this` : `⚠ ${fmt(-after)} over budget after this`}`;
    }
    $('#budget-hint', form).textContent = h;
    $('#budget-hint', form).classList.toggle('over', h.includes('⚠'));
    const a = accOf(form.accountId.value);
    let ah = '';
    if (a && type() !== 'income') {
      const b = balances()[a.id] || 0;
      const back = existing && existing.accountId === a.id && existing.type !== 'income' ? Number(existing.amount) : 0;
      if (isSupport(a)) {
        ah = type() === 'expense' ? `🤝 Counts in your spending and budgets, but doesn't reduce your own accounts.` : '';
      } else if (a.type === 'credit') {
        const avail = (Number(a.limit) || 0) + b + back;
        if (a.limit && amt > avail) ah = `⚠ Only ${fmt(avail)} available on this card`;
      } else if (b + back - amt < 0) ah = `⚠ This takes ${a.name} below zero (${fmt(b + back - amt)})`;
    }
    $('#acc-hint', form).textContent = ah;
    $('#acc-hint', form).classList.toggle('over', ah.startsWith('⚠'));
  };
  // Sensible "to" account: money from family support goes to the bank; otherwise pay the card.
  const pickToAccount = () => {
    const from = accOf(form.accountId.value);
    const to = accOf(form.toAccountId.value);
    const bank = accs.find((a) => a.type === 'bank' && a.id !== from?.id);
    if (isSupport(from) && bank && !toTouched) { form.toAccountId.value = bank.id; return; }
    if (to && to.id !== from?.id && !(isSupport(from) && isSupport(to))) return;
    const other = (isSupport(from) && accs.find((a) => a.type === 'bank'))
      || accs.find((a) => a.id !== from?.id && a.type === 'credit') || accs.find((a) => a.id !== from?.id && !isSupport(a))
      || accs.find((a) => a.id !== from?.id);
    if (other) form.toAccountId.value = other.id;
  };
  const applyType = () => {
    const ty = type();
    $$('.seg-ctl label', form).forEach((l) => l.classList.toggle('on', l.querySelector('input').checked));
    $('.when-cat', form).hidden = ty === 'transfer';
    $('.when-expense', form).hidden = ty !== 'expense';
    $('.when-transfer', form).hidden = ty !== 'transfer';
    $('#acc-label', form).textContent = ty === 'income' ? 'Received into' : ty === 'transfer' ? 'From account' : 'Paid from';
    if (ty === 'transfer') pickToAccount();
    renderCats();
    renderBudgets();
  };

  form.addEventListener('change', (e) => {
    if (e.target.name === 'type') {
      t.categoryId = '';
      if (!existing) form.accountId.value = defaultAcc(type());
      applyType();
    }
    if (e.target.name === 'categoryId') {
      t.categoryId = e.target.value;
      $$('.cat', form).forEach((l) => l.classList.toggle('on', l.querySelector('input').checked));
      if (!budgetTouched && type() === 'expense') {
        const b = budgetForCategory(t.categoryId);
        form.budgetId.value = b ? b.id : '';
      }
      updateHints();
    }
    if (e.target.name === 'budgetId') { budgetTouched = true; updateHints(); }
    if (e.target.name === 'date') renderBudgets();
    if (e.target.name === 'toAccountId') toTouched = true;
    if (e.target.name === 'accountId') { if (type() === 'transfer') pickToAccount(); updateHints(); }
  });
  form.amount.addEventListener('input', updateHints);

  const save = (again) => {
    const f = Object.fromEntries(new FormData(form));
    const err = (m) => { $('#tx-err', form).textContent = m; };
    const amount = round2(num(f.amount));
    if (!(amount > 0)) return err('Enter an amount.');
    if (f.type !== 'transfer' && !f.categoryId) return err('Pick a category.');
    if (f.type === 'transfer' && f.accountId === f.toAccountId) return err('Choose two different accounts.');
    if (!f.date) return err('Pick a date.');
    const doc = {
      ...(existing || {}), id: existing?.id || uid(), type: f.type, amount, date: f.date,
      accountId: f.accountId, note: (f.note || '').trim(), memberId: f.memberId || '',
      categoryId: f.type === 'transfer' ? '' : f.categoryId,
      budgetId: f.type === 'expense' ? (f.budgetId || '') : '',
      toAccountId: f.type === 'transfer' ? f.toAccountId : '',
    };
    store.put('transactions', doc);
    if (!isSupport(accOf(f.accountId))) lsSet('hb-last-acc-' + f.type, f.accountId); // never default to someone else's money
    if (f.memberId) lsSet('hb-last-member', f.memberId);
    if (again) {
      form.amount.value = ''; form.note.value = ''; t.categoryId = ''; budgetTouched = false;
      renderCats(); renderBudgets(); err(''); form.amount.focus();
      toast('Saved');
    } else {
      s.close();
      toast(existing ? 'Updated' : 'Saved');
    }
  };
  form.addEventListener('submit', (e) => { e.preventDefault(); save(false); });
  $('#save-more', form)?.addEventListener('click', () => save(true));
  $('#del', form)?.addEventListener('click', async () => {
    if (!(await confirmSheet('Delete this transaction?'))) return;
    const copy = { ...existing };
    store.del('transactions', existing.id);
    s.close();
    toast('Deleted', { label: 'Undo', fn: () => store.put('transactions', copy) });
  });

  applyType();
  if (!existing) setTimeout(() => form.amount.focus(), 250);
}

// ── forms: account ──────────────────────────────────────────────────────────
function openAccountForm(existing) {
  const a = existing || { type: 'bank', name: '', limit: '', goal: '' };
  const bal = existing ? balances()[a.id] || 0 : 0;
  const s = openSheet(existing ? a.name : 'New account', `
  <form class="form" novalidate>
    <label>Name<input name="name" value="${esc(a.name)}" placeholder="e.g. Al Rajhi current account" required></label>
    <label>Type<select name="type">${Object.entries(ACCOUNT_TYPES).map(([k, v]) => `<option value="${k}" ${k === a.type ? 'selected' : ''}>${v.icon} ${v.label}</option>`).join('')}</select></label>
    <label class="when-support check"><input type="checkbox" name="repay" ${a.repay ? 'checked' : ''}> We will pay this back (treat it as a loan)</label>
    <label><span id="bal-label">Current balance</span><input name="balance" inputmode="decimal" value="${existing ? esc(a.type === 'credit' || isSupport(a) ? round2(-bal) : bal) : ''}" placeholder="0.00"></label>
    <div class="hint" id="bal-hint"></div>
    <label class="when-credit">Credit limit<input name="limit" inputmode="decimal" value="${esc(a.limit)}" placeholder="e.g. 20000"></label>
    <label class="when-savings">Savings goal (optional)<input name="goal" inputmode="decimal" value="${esc(a.goal)}" placeholder="e.g. 50000"></label>
    <div class="err" role="alert"></div>
    <div class="row-btns">${existing ? `<button type="button" class="btn danger" id="del">${a.archived ? 'Delete' : 'Archive'}</button>${a.archived ? '<button type="button" class="btn" id="unarchive">Restore</button>' : ''}` : ''}<button class="btn primary">Save</button></div>
  </form>
  ${existing ? `<div class="card-head pad"><h3>Recent activity</h3><button class="link" data-action="drill" data-acc="${esc(a.id)}" data-month="${currentPeriod()}">See all</button></div>
    ${txList(transactions().filter((t) => t.accountId === a.id || t.toAccountId === a.id), { groupByDay: false, limit: 8 })}` : ''}`);
  const form = $('form', s.el);
  const apply = () => {
    const ty = form.type.value;
    $('.when-credit', form).hidden = ty !== 'credit';
    $('.when-savings', form).hidden = ty !== 'savings';
    $('.when-support', form).hidden = ty !== 'support';
    const loan = ty === 'support' && form.repay.checked;
    $('#bal-label', form).textContent = ty === 'credit' ? 'Amount owed right now'
      : ty === 'support' ? (loan ? 'Amount we owe right now' : 'Covered so far (optional)') : 'Current balance';
    $('#bal-hint', form).textContent = ty === 'support'
      ? 'When this person pays for something for you, add an Expense and choose this account under "Paid from". It counts in your spending and budgets but doesn\'t touch your bank. If they send you money, add a Transfer from this account to your bank.'
      : 'Enter what your bank app shows right now. The app keeps it updated as you add transactions. You can correct it here anytime.';
    if (!existing && ty === 'support' && !form.name.value.trim()) form.name.value = 'Father support';
  };
  form.type.addEventListener('change', apply);
  form.repay.addEventListener('change', apply);
  apply();
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    if (!f.name.trim()) { $('.err', form).textContent = 'Give it a name.'; return; }
    const desired = f.type === 'credit' || f.type === 'support' ? -num(f.balance) : num(f.balance);
    const id = existing?.id || uid();
    const effect = existing ? txEffect(id) : 0;
    store.put('accounts', {
      ...(existing || {}), id, name: f.name.trim(), type: f.type,
      openingBalance: round2(desired - effect),
      limit: f.type === 'credit' ? num(f.limit) : 0,
      goal: f.type === 'savings' ? num(f.goal) : 0,
      repay: f.type === 'support' ? !!f.repay : false,
      order: existing?.order ?? accounts().length,
    });
    s.close();
    toast('Account saved');
  });
  $('#del', s.el)?.addEventListener('click', async () => {
    const used = store.all('transactions').some((t) => t.accountId === a.id || t.toAccountId === a.id);
    if (!a.archived) {
      if (!(await confirmSheet(`Archive "${a.name}"? It will be hidden from lists and totals. Its transactions stay.`, 'Archive'))) return;
      store.put('accounts', { ...a, archived: true }); s.close(); toast('Archived');
    } else {
      if (used) { toast('This account has transactions — keep it archived, or delete them first.'); return; }
      if (!(await confirmSheet(`Delete "${a.name}" permanently?`))) return;
      store.del('accounts', a.id); s.close(); toast('Deleted');
    }
  });
  $('#unarchive', s.el)?.addEventListener('click', () => { store.put('accounts', { ...a, archived: false }); s.close(); toast('Restored'); });
}

// ── forms: budget ───────────────────────────────────────────────────────────
function openBudgetForm(existing) {
  const ym = ui.month;
  const b = existing || { name: '', icon: '🎯', categoryIds: [] };
  const amount = existing ? budgetAmount(existing, ym) : '';
  const s = openSheet(existing ? 'Edit budget' : 'New budget', `
  <form class="form" novalidate>
    <div class="two narrow-first"><label>Icon<input name="icon" value="${esc(b.icon)}" maxlength="4"></label>
    <label>Name<input name="name" value="${esc(b.name)}" placeholder="e.g. Groceries, Eating out, Kids" required></label></div>
    <label>Monthly amount<input name="amount" inputmode="decimal" value="${esc(amount)}" placeholder="e.g. 2000"></label>
    <div class="hint">Applies from ${esc(periodLabel(ym))} onwards. Earlier months keep their old amount.</div>
    <div class="field-label">Categories that go to this budget automatically</div>
    <div class="cat-grid">${visible(categories('expense')).map((c) => {
      const other = budgetForCategory(c.id);
      const on = (b.categoryIds || []).includes(c.id);
      return `<label class="cat ${on ? 'on' : ''}"><input type="checkbox" name="cats" value="${esc(c.id)}" ${on ? 'checked' : ''}><span class="ico">${esc(c.icon)}</span><span>${esc(c.name)}${other && other.id !== b.id ? `<small class="muted"> · in ${esc(other.name)}</small>` : ''}</span></label>`;
    }).join('')}</div>
    <div class="hint">You can still choose any budget manually when adding an expense.</div>
    <div class="err" role="alert"></div>
    <div class="row-btns">${existing ? '<button type="button" class="btn danger" id="del">Delete</button>' : ''}<button class="btn primary">Save</button></div>
  </form>`);
  const form = $('form', s.el);
  form.addEventListener('change', (e) => {
    if (e.target.name === 'cats') {
      e.target.closest('.cat').classList.toggle('on', e.target.checked);
      if (!form.name.value.trim() && e.target.checked) {
        const c = catOf(e.target.value); form.name.value = c.name; form.icon.value = c.icon;
      }
    }
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const name = String(fd.get('name')).trim();
    if (!name) { $('.err', form).textContent = 'Give the budget a name.'; return; }
    const amounts = { ...(existing?.amounts || {}) };
    // a new amount replaces this month and any later month settings
    Object.keys(amounts).forEach((k) => { if (k > ym) delete amounts[k]; });
    amounts[ym] = num(fd.get('amount'));
    store.put('budgets', {
      ...(existing || {}), id: existing?.id || uid(), name, icon: String(fd.get('icon') || '🎯').trim(),
      categoryIds: fd.getAll('cats'), amounts, order: existing?.order ?? budgets().length,
    });
    s.close();
    toast('Budget saved');
  });
  $('#del', s.el)?.addEventListener('click', async () => {
    if (!(await confirmSheet(`Delete the "${b.name}" budget? Expenses stay, they just won't count toward a budget.`))) return;
    store.del('budgets', b.id); s.close(); toast('Budget deleted');
  });
}

function openBudgetDetail(id) {
  const b = budOf(id);
  if (!b) return;
  const ym = ui.month;
  const r = budgetStatus(ym).rows.find((x) => x.budget.id === id);
  const list = transactions().filter((t) => t.budgetId === id && inKey(t.date, ym));
  // last 6 months history
  const hist = [];
  for (let i = 5; i >= 0; i--) {
    const m = addMonths(ym, -i);
    const row = budgetStatus(m).rows.find((x) => x.budget.id === id);
    hist.push({ label: shortMonth(m).slice(0, 3), value: row?.spent || 0, tip: `${periodLabel(m)}: ${fmt(row?.spent || 0)} of ${fmt(row?.amount || 0)}`, highlight: m === ym });
  }
  const s = openSheet(`${b.icon || '🎯'} ${b.name}`, `
    <div class="split"><div><div class="muted tiny">Budget</div><div class="kpi-val">${esc(fmtC(r.amount))}</div></div>
    <div><div class="muted tiny">Spent</div><div class="kpi-val">${esc(fmtC(r.spent))}</div></div>
    <div><div class="muted tiny">${r.left >= 0 ? 'Left' : 'Over'}</div><div class="kpi-val ${r.left < 0 ? 'over' : ''}">${esc(fmtC(Math.abs(r.left)))}</div></div></div>
    ${progress(r.ratio)}
    <div class="row-btns" style="margin:14px 0"><button class="btn" id="edit-b">Edit budget</button><button class="btn primary" id="add-b">+ Expense</button></div>
    <h3>Last 6 months</h3>${barChart(hist, { fmt: fmtS, height: 130 })}
    <h3>${esc(periodLabel(ym))}</h3>${txList(list)}`);
  $('#edit-b', s.el).onclick = () => { s.close(); openBudgetForm(b); };
  $('#add-b', s.el).onclick = () => { s.close(); openTxForm(null, { type: 'expense', budgetId: b.id, categoryId: (b.categoryIds || [])[0] || '' }); };
}

function quickBudgets() {
  const used = new Set(budgets().flatMap((b) => b.categoryIds || []));
  const items = visible(categories('expense')).filter((c) => !used.has(c.id)).map((c, i) => ({
    col: 'budgets', doc: { id: uid(), name: c.name, icon: c.icon, categoryIds: [c.id], amounts: { [ui.month]: 0 }, order: i, createdAt: Date.now() },
  }));
  store.putMany(items);
  toast('Budgets created — tap each one to set its monthly amount.');
}

// ── forms: category ─────────────────────────────────────────────────────────
function openCategoryForm(existing, kind = 'expense') {
  const c = existing || { name: '', icon: '🏷️', kind };
  const s = openSheet(existing ? 'Edit category' : 'New category', `
  <form class="form" novalidate>
    <div class="two narrow-first"><label>Icon<input name="icon" value="${esc(c.icon)}" maxlength="4"></label>
    <label>Name<input name="name" value="${esc(c.name)}" required></label></div>
    <label>Type<select name="kind"><option value="expense" ${c.kind === 'expense' ? 'selected' : ''}>Expense</option><option value="income" ${c.kind === 'income' ? 'selected' : ''}>Income</option></select></label>
    <div class="err" role="alert"></div>
    <div class="row-btns">${existing ? '<button type="button" class="btn danger" id="del">Delete</button>' : ''}<button class="btn primary">Save</button></div>
  </form>`);
  const form = $('form', s.el);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    if (!f.name.trim()) { $('.err', form).textContent = 'Give it a name.'; return; }
    store.put('categories', { ...(existing || {}), id: existing?.id || uid(), name: f.name.trim(), icon: f.icon.trim() || '🏷️', kind: f.kind, order: existing?.order ?? 50 + categories().length });
    s.close();
  });
  $('#del', s.el)?.addEventListener('click', async () => {
    if (!(await confirmSheet(`Delete "${c.name}"? Past transactions keep it (it's just hidden from pickers).`))) return;
    const used = store.all('transactions').some((t) => t.categoryId === c.id);
    if (used) store.put('categories', { ...c, archived: true }); else store.del('categories', c.id);
    s.close();
  });
}

// ── export ──────────────────────────────────────────────────────────────────
async function exportCSV() {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Date', 'Type', 'Amount', 'Category', 'Budget', 'Account', 'To account', 'Who', 'Note']];
  for (const t of transactions()) {
    rows.push([t.date, t.type, t.type === 'expense' ? -t.amount : t.amount, catOf(t.categoryId)?.name, budOf(t.budgetId)?.name,
      accOf(t.accountId)?.name, accOf(t.toAccountId)?.name, memberName(t.memberId), t.note]);
  }
  return download(`expenses-${todayISO()}.csv`, '﻿' + rows.map((r) => r.map(q).join(',')).join('\r\n'), 'text/csv');
}

// ── actions (event delegation) ──────────────────────────────────────────────
const actions = {
  'add-tx': (el) => openTxForm(null, { type: el.dataset.type }),
  'edit-tx': (el) => { const t = store.get('transactions', el.dataset.id); if (t) openTxForm(t); },
  'month-prev': () => { ui.month = addMonths(ui.month, -1); render(); },
  'month-next': () => { ui.month = addMonths(ui.month, 1); render(); },
  'report-kind': (el) => {
    const k = el.dataset.v;
    const { kind: was, key: wasKey } = ui.report;
    const today = todayISO();
    const base = was === 'day' ? wasKey
      : was === 'month' ? (inKey(today, wasKey) ? today : periodStart(wasKey))
        : (inKey(today, wasKey) ? today : periodStart(wasKey + '-01'));
    ui.report = { kind: k, key: k === 'day' ? base : k === 'month' ? periodOf(base) : periodOf(base).slice(0, 4) };
    render();
  },
  'report-prev': () => { ui.report.key = prevKey(ui.report.kind, ui.report.key); render(); },
  'report-next': () => {
    const { kind, key } = ui.report;
    ui.report.key = kind === 'year' ? String(Number(key) + 1) : kind === 'month' ? addMonths(key, 1) : addDays(key, 1);
    render();
  },
  'toggle-filters': () => { ui.showFilters = !ui.showFilters; render(); },
  'clear-filters': () => { ui.filters = { type: 'all', q: '', accountId: '', categoryId: '', memberId: '', budgetId: '' }; ui.unbudgetedOnly = false; render(); },
  'type-filter': (el) => { ui.filters.type = el.dataset.v; render(); },
  'drill': (el) => {
    closeAllSheets();
    ui.filters = { type: 'all', q: '', accountId: el.dataset.acc || '', categoryId: el.dataset.cat || '', memberId: '', budgetId: el.dataset.budget === 'none' ? '' : (el.dataset.budget || '') };
    ui.unbudgetedOnly = el.dataset.budget === 'none';
    if (el.dataset.month) ui.month = el.dataset.month;
    ui.showFilters = true;
    location.hash = '#activity';
    render();
  },
  'add-account': () => openAccountForm(),
  'account-detail': (el) => openAccountForm(accOf(el.dataset.id)),
  'add-budget': () => openBudgetForm(),
  'budget-detail': (el) => openBudgetDetail(el.dataset.id),
  'quick-budgets': () => quickBudgets(),
  'add-category': (el) => openCategoryForm(null, el.dataset.kind),
  'edit-category': (el) => openCategoryForm(catOf(el.dataset.id)),
  'export-json': async () => {
    try { if (await download(`home-budget-backup-${todayISO()}.json`, store.exportJSON())) toast('Backup saved'); } catch (e) { toast('Could not save the file: ' + (e.message || e.code)); }
  },
  'import-json': () => $('#import-file').click(),
  'export-csv': async () => {
    try { if (await exportCSV()) toast('Spreadsheet saved'); } catch (e) { toast('Could not save the file: ' + (e.message || e.code)); }
  },
  'reset': async () => {
    if (!(await confirmSheet('Erase ALL data on this device? Download a backup first if you might need it.', 'Erase everything'))) return;
    await backend.wipe(); location.hash = '#home'; render();
  },
  'upload-local': async () => {
    const snap = readLocalSnapshot();
    if (!snap) return;
    if (!(await confirmSheet('Upload the data saved on this device into your shared budget?', 'Upload'))) return;
    try {
      const n = await store.importJSON(JSON.stringify({ data: snap }));
      localStorage.removeItem('hb-expenses-data-v1');
      toast(`Uploaded ${n} items`);
      location.hash = '#home';
    } catch (e) { toast(e.message); }
  },
  'claim-member': (el) => {
    const ms = members().map((m) => ({ ...m, uid: m.id === el.dataset.id ? backend.uid : (m.uid === backend.uid ? '' : m.uid) }));
    const name = ms.find((m) => m.id === el.dataset.id)?.name || '';
    store.saveSettings({ members: ms });
    closeAllSheets();
    toast(`Hi ${name}! New expenses will be marked as yours.`);
  },
  'sign-out': async () => { await backend.signOut(); location.reload(); },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || !actions[el.dataset.action]) return;
  e.preventDefault();
  actions[el.dataset.action](el);
});

document.addEventListener('change', async (e) => {
  if (e.target.matches('[data-filter]')) { ui.filters[e.target.dataset.filter] = e.target.value; ui.unbudgetedOnly = false; render(); }
  if (e.target.id === 'import-file' && e.target.files[0]) {
    try {
      const n = await store.importJSON(await e.target.files[0].text());
      toast(`Imported ${n} items`);
    } catch (err) { toast('Import failed: ' + err.message); }
    e.target.value = '';
  }
});

const onSearch = debounce(() => render(), 250);
document.addEventListener('input', (e) => {
  if (e.target.id === 'search') { ui.filters.q = e.target.value; onSearch(); }
});

document.addEventListener('submit', (e) => {
  if (e.target.id === 'setup-form') { e.preventDefault(); submitSetup(e.target); }
  if (e.target.id === 'settings-form') {
    e.preventDefault();
    const fd = new FormData(e.target);
    const ms = members().map((m, i) => ({ ...m, id: fd.get(`m-id-${i}`), name: String(fd.get(`m-name-${i}`) || '').trim(), email: String(fd.get(`m-email-${i}`) ?? m.email ?? '').trim() }))
      .filter((m) => m.name);
    const newName = String(fd.get('m-name-new') || '').trim();
    if (newName) ms.push({ id: uid(), name: newName, email: String(fd.get('m-email-new') || '').trim() });
    const currency = String(fd.get('currency') || 'SAR').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) { toast('Currency must be a 3-letter code like SAR'); return; }
    const day = Math.min(28, Math.max(1, Number(fd.get('cycleDay')) || 1));
    store.saveSettings({ householdName: String(fd.get('householdName') || '').trim(), currency, members: ms, cycleDay: day, salaryStart: !!fd.get('salaryStart') });
    ui.month = currentPeriod();
    ui.report = { kind: 'month', key: currentPeriod() };
    toast('Settings saved');
  }
});

// ── render ──────────────────────────────────────────────────────────────────
// Route names avoid words claude.ai reserves in the page link (e.g. "settings").
const TITLES = { home: 'Home', activity: 'Activity', budgets: 'Budgets', reports: 'Reports', accounts: 'Accounts', prefs: 'Settings', categories: 'Categories' };

function render() {
  if (!ready) return;
  const name = (location.hash.replace(/^#\/?/, '').split('/')[0]) || 'home';
  const setup = needsSetup();
  const view = setup ? 'setup' : (TITLES[name] ? name : 'home');

  // keep focus/caret in the search box across re-renders (e.g. when your wife adds something)
  const active = document.activeElement?.id;
  const caret = document.activeElement?.selectionStart;
  const y = window.scrollY;

  // When a new budget month starts (e.g. the salary just came in), screens showing the
  // current month move along with it; screens showing an older month stay where they are.
  const cp = currentPeriod();
  if (ui.lastCurrent && ui.lastCurrent !== cp) {
    if (ui.month === ui.lastCurrent) ui.month = cp;
    if (ui.report.kind === 'month' && ui.report.key === ui.lastCurrent) ui.report.key = cp;
  }
  ui.lastCurrent = cp;

  const views = { home: viewHome, activity: viewActivity, budgets: viewBudgets, reports: viewReports, accounts: viewAccounts, prefs: viewSettings, categories: viewCategories, setup: viewSetup };
  $('#view').innerHTML = views[view]();
  $('#title').textContent = setup ? 'Home Budget' : TITLES[view];
  document.body.classList.toggle('setup-mode', setup);
  $$('.nav a').forEach((a) => a.classList.toggle('on', a.dataset.view === view));
  $('#sync').innerHTML = store.mode !== 'local' ? `<span class="badge ok" title="Shared & synced">${I.cloud}</span>` : '<span class="badge" title="Saved on this device only">Local</span>';

  if (active) {
    const el = document.getElementById(active);
    if (el && el.tagName === 'INPUT') { el.focus(); try { el.setSelectionRange(caret, caret); } catch { /* ignore */ } }
  }
  if (render.lastView === view) window.scrollTo(0, y); else window.scrollTo(0, 0);
  render.lastView = view;
}

// ── login (cloud mode) ──────────────────────────────────────────────────────
function loginScreen() {
  return new Promise((resolve) => {
    $('#view').innerHTML = `<section class="card setup">
      <div class="logo">💰</div><h2>Home Budget</h2><p class="muted">Sign in to your shared budget.</p>
      <form id="login" class="form">
        <label>Email<input name="email" type="email" autocomplete="username" required></label>
        <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
        <div class="err" role="alert"></div>
        <button class="btn primary big">Sign in</button>
        <button type="button" class="link" id="forgot">Forgot password?</button>
      </form></section>`;
    document.body.classList.add('setup-mode');
    const form = $('#login');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      $('.err', form).textContent = '';
      try {
        await backend.signIn(form.email.value, form.password.value);
        resolve();
      } catch (err) {
        $('.err', form).textContent = /invalid|wrong|not-found|credential/i.test(err.code || err.message)
          ? 'Wrong email or password.' : 'Could not sign in: ' + (err.code || err.message);
      }
    });
    $('#forgot').onclick = async () => {
      if (!form.email.value) { $('.err', form).textContent = 'Type your email first.'; return; }
      try { await backend.resetPassword(form.email.value); toast('Password reset email sent'); } catch (err) { $('.err', form).textContent = err.code || err.message; }
    };
  });
}

function fatal(title, detail, buttons = '') {
  $('#view').innerHTML = `<section class="card setup"><div class="logo">⚠️</div><h2>${esc(title)}</h2><p class="muted">${esc(detail)}</p>
    <div class="row-btns">${buttons}<button class="btn primary" id="retry">Try again</button></div></section>`;
  document.body.classList.add('setup-mode');
  $('#retry').onclick = () => location.reload();
  $('#so')?.addEventListener('click', async () => { await backend.signOut(); location.reload(); });
}

/** On a shared claude.ai page, ask each person once which member they are. */
function askWhoIAm() {
  if (store.mode !== 'shared' || !backend.uid || needsSetup()) return;
  const ms = members();
  if (!ms.length || ms.some((m) => m.uid === backend.uid)) return;
  openSheet('Who are you?', `<p class="muted">Pick your name so expenses you add are marked as yours. You can change this later in Settings.</p>
    <div class="row-btns wrap">${ms.map((m) => `<button class="btn" data-action="claim-member" data-id="${esc(m.id)}">${esc(m.name)}</button>`).join('')}</div>`);
}

// ── boot ────────────────────────────────────────────────────────────────────
async function boot() {
  installTooltips();
  store.onError((e) => {
    console.error(e);
    toast(/permission/i.test(e.code || e.message) ? 'Not allowed — is this email in the security rules?' : 'Could not save: ' + (e.message || e));
  });

  const runtime = globalThis.claude?.use ? globalThis.claude : null;
  if (runtime) {
    const [db, user] = await Promise.all([runtime.use('db'), runtime.use('user')]);
    if (!db) return fatal('Sign in to see your budget', 'Your budget is stored on claude.ai. Sign in to claude.ai with the account this page was shared with, then open it again.');
    backend = new ArtifactBackend(db, user);
    backend.onStatus = (st) => {
      if (st.slow) toast('Still connecting… showing what has loaded so far.');
      if (st.error && st.error.code !== 'revoked') toast('Lost connection to your data. Reload the page to reconnect.');
    };
    try {
      await store.init(backend);
    } catch (e) {
      console.error(e);
      return fatal('Could not load your data', e?.message || String(e));
    }
  } else if (CONFIG.firebase) {
    try {
      const { createFirebaseBackend } = await import('./firebase.js');
      backend = await createFirebaseBackend(CONFIG.firebase, CONFIG.householdId || 'home');
    } catch (e) {
      console.error(e);
      return fatal('Could not connect', 'The app needs internet the very first time it opens. Check your connection and try again.');
    }
    const user = await backend.currentUser();
    if (!user) await loginScreen();
    try {
      await store.init(backend);
    } catch (e) {
      console.error(e);
      if (/permission/i.test(e.code || e.message)) {
        return fatal('This account has no access', `Signed in as ${backend.user?.email}. Add this email to firestore.rules (see README) and publish the rules.`,
          '<button class="btn" id="so">Sign out</button>');
      }
      return fatal('Could not load your data', e.message || String(e));
    }
  } else {
    backend = new LocalBackend();
    await store.init(backend);
  }

  ready = true;
  ui.month = currentPeriod();
  ui.report = { kind: 'month', key: currentPeriod() };
  document.body.classList.remove('setup-mode');
  store.subscribe(render);
  window.addEventListener('hashchange', render);
  render();
  askWhoIAm();

  if ('serviceWorker' in navigator && location.protocol !== 'file:' && !globalThis.claude) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

boot();
