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
