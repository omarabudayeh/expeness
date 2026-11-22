// Data layer. The UI talks only to `store`; a backend decides where data lives:
//  - LocalBackend: this device only (localStorage).
//  - FirebaseBackend (js/firebase.js): shared, live-synced between you and your wife.

export const COLLECTIONS = ['accounts', 'categories', 'budgets', 'transactions', 'meta'];
const LOCAL_KEY = 'hb-expenses-data-v1';

const clean = (doc) => JSON.parse(JSON.stringify(doc)); // strips undefined (Firestore rejects it)

export class LocalBackend {
  constructor() { this.mode = 'local'; }

  async start(onData) {
    this.onData = onData;
    let raw = {};
    try { raw = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}'); } catch { raw = {}; }
    this.state = {};
    for (const c of COLLECTIONS) this.state[c] = raw[c] || {};
    onData(this.state);
  }

  persist() {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(this.state));
    } catch (e) {
      throw new Error('Could not save on this device (storage full or blocked).');
    }
    this.onData(this.state);
  }

  async put(col, doc) { this.state[col][doc.id] = clean(doc); this.persist(); }

  async putMany(items) {
    for (const { col, doc } of items) this.state[col][doc.id] = clean(doc);
    this.persist();
  }

  async del(col, id) { delete this.state[col][id]; this.persist(); }

  async wipe() {
    for (const c of COLLECTIONS) this.state[c] = {};
    this.persist();
  }
}

/** Read whatever is stored locally (used to offer a one-time upload to the cloud). */
export function readLocalSnapshot() {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}');
    const count = (raw.transactions ? Object.keys(raw.transactions).length : 0) +
      (raw.accounts ? Object.keys(raw.accounts).length : 0);
    return count ? raw : null;
  } catch { return null; }
}

class Store {
  constructor() {
    this.data = {};
    for (const c of COLLECTIONS) this.data[c] = {};
    this.version = 0;
    this.listeners = new Set();
    this.errorHandler = (e) => console.error(e);
  }

  async init(backend) {
    this.backend = backend;
    await backend.start((state) => {
      this.data = state;
      this.version++;
      this.listeners.forEach((fn) => fn());
    });
  }

  get mode() { return this.backend?.mode || 'local'; }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  onError(fn) { this.errorHandler = fn; }

  all(col) { return Object.values(this.data[col] || {}); }
  get(col, id) { return (this.data[col] || {})[id]; }

  // Writes are fire-and-forget for the UI: with Firestore, the promise only resolves once the
  // server confirms, but the change shows up instantly from the offline cache.
  put(col, doc) {
    const now = Date.now();
    const d = { ...doc, updatedAt: now, createdAt: doc.createdAt || now };
    if (this.backend.user?.email && !d.createdBy) d.createdBy = this.backend.user.email;
    return Promise.resolve(this.backend.put(col, d)).catch(this.errorHandler);
  }

  putMany(items) { return Promise.resolve(this.backend.putMany(items)).catch(this.errorHandler); }
  del(col, id) { return Promise.resolve(this.backend.del(col, id)).catch(this.errorHandler); }

  settings() {
    return {
      currency: 'SAR',
      members: [],
      householdName: 'Our Home',
      ...(this.get('meta', 'settings') || {}),
    };
  }

  saveSettings(patch) { return this.put('meta', { ...this.settings(), ...patch, id: 'settings' }); }

  exportJSON() {
    return JSON.stringify({ app: 'home-budget', version: 1, exportedAt: new Date().toISOString(), data: this.data }, null, 2);
  }

  async importJSON(text) {
    const parsed = JSON.parse(text);
    const data = parsed.data || parsed;
    const items = [];
    for (const c of COLLECTIONS) {
      for (const doc of Object.values(data[c] || {})) if (doc && doc.id) items.push({ col: c, doc });
    }
    if (!items.length) throw new Error('No data found in that file.');
    await this.backend.putMany(items);
    return items.length;
  }
}

export const store = new Store();

// ── claude.ai shared database (when the app is published as a claude.ai page) ──
// Layout, chosen to stay small and merge-safe when both of you edit at once:
//   app/accounts, app/categories, app/budgets, app/meta  → { items: { <id>: doc } }
//   months/<YYYY-MM>                                     → { items: { <txId>: tx } }
// Writes merge one item at a time, so two people saving at once never overwrite each other.
// A deleted item is stored as null and skipped when reading.
const APP_DOCS = ['accounts', 'categories', 'budgets', 'meta'];

export class ArtifactBackend {
  constructor(db, userApi) {
    this.mode = 'shared';
    this.db = db;
    this.userApi = userApi;
    this.chains = new Map();
    this.onStatus = () => {};
  }

  async start(onData) {
    this.uid = (await this.userApi?.id?.()) || null;
    this.canWrite = await this.userApi?.can?.('data.write');
    const state = {};
    COLLECTIONS.forEach((c) => (state[c] = {}));
    this.state = state;
    const items = (snapDoc) => {
      const out = {};
      const raw = snapDoc.data()?.items || {};
      for (const [id, v] of Object.entries(raw)) if (v) out[id] = v;
      return out;
    };
    let gotApp = false, gotMonths = false, settled = false;
    const emit = () => { if (gotApp && gotMonths) onData({ ...state }); };

    await new Promise((resolve, reject) => {
      const done = (err) => { if (settled) return; settled = true; clearTimeout(timer); err ? reject(err) : resolve(); };
      const timer = setTimeout(() => { this.onStatus({ slow: true }); done(); }, 10000);
      this.unsubs = [
        this.db.collection('app').onSnapshot((snap) => {
          for (const c of APP_DOCS) state[c] = {};
          snap.docs.forEach((d) => { if (APP_DOCS.includes(d.id)) state[d.id] = items(d); });
          gotApp = true;
          emit();
          if (gotMonths) done();
        }, (e) => { this.onStatus({ error: e }); done(e); }),
        this.db.collection('months').onSnapshot((snap) => {
          const tx = {};
          snap.docs.forEach((d) => Object.assign(tx, items(d)));
          state.transactions = tx;
          gotMonths = true;
          emit();
          if (gotApp) done();
        }, (e) => { this.onStatus({ error: e }); done(e); }),
      ];
    });
  }

  pathFor(col, doc) {
    return col === 'transactions' ? 'months/' + String(doc.date || '').slice(0, 7) : 'app/' + col;
  }

  /** Merge { items: patch } into one document, one write at a time per document. */
  mergeItems(path, patch) {
    const prev = this.chains.get(path) || Promise.resolve();
    const next = prev.catch(() => {}).then(async () => {
      const ref = this.db.doc(path);
      try {
        await ref.update({ items: patch });
      } catch (e) {
        if (e?.code !== 'invalid_argument') throw e;
        const snap = await ref.get(); // update needs an existing document: create it on first use
        if (snap.exists) throw Object.assign(new Error('You can view this budget but not change it. Ask the owner to share it with you as Editor.'), { code: 'read_only' });
        await ref.set({ items: patch });
      }
    });
    this.chains.set(path, next);
    return next;
  }

  async put(col, doc) {
    const old = this.state?.[col]?.[doc.id];
    const path = this.pathFor(col, doc);
    if (col === 'transactions' && old && this.pathFor(col, old) !== path) {
      await this.mergeItems(this.pathFor(col, old), { [doc.id]: null }); // the date moved to another month
    }
    await this.mergeItems(path, { [doc.id]: clean(doc) });
  }

  async putMany(items) {
    const groups = new Map();
    for (const { col, doc } of items) {
      const path = this.pathFor(col, doc);
      if (!groups.has(path)) groups.set(path, {});
      groups.get(path)[doc.id] = clean(doc);
    }
    for (const [path, patch] of groups) await this.mergeItems(path, patch);
  }

  async del(col, id) {
    const old = this.state?.[col]?.[id];
    if (!old) return;
    await this.mergeItems(this.pathFor(col, old), { [id]: null });
  }
}
