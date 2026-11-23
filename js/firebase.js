// Shared backend: Firebase Auth (email + password) + Cloud Firestore with offline cache.
// Loaded only when CONFIG.firebase is filled in.

import { COLLECTIONS } from './store.js';

const V = '10.12.2';
const CDN = `https://www.gstatic.com/firebasejs/${V}`;

const clean = (doc) => JSON.parse(JSON.stringify(doc));

export async function createFirebaseBackend(config, householdId) {
  const [{ initializeApp }, authMod, fs] = await Promise.all([
    import(`${CDN}/firebase-app.js`),
    import(`${CDN}/firebase-auth.js`),
    import(`${CDN}/firebase-firestore.js`),
  ]);

  const { emulators, ...firebaseConfig } = config;
  const app = initializeApp(firebaseConfig);
  const auth = authMod.getAuth(app);
  // For local testing with `firebase emulators:start` (see README). Never set in production.
  const emu = emulators && { host: emulators.host || '127.0.0.1', ...emulators };
  if (emu) authMod.connectAuthEmulator(auth, `http://${emu.host}:${emu.auth || 9099}`, { disableWarnings: true });
  await authMod.setPersistence(auth, authMod.browserLocalPersistence);

  let db;
  try {
    db = fs.initializeFirestore(app, {
      localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
    });
  } catch {
    db = fs.getFirestore(app);
  }

  if (emu) fs.connectFirestoreEmulator(db, emu.host, emu.firestore || 8080);

  const colRef = (c) => fs.collection(db, 'households', householdId, c);
  const docRef = (c, id) => fs.doc(db, 'households', householdId, c, id);

  return {
    mode: 'cloud',
    user: null,

    /** Resolves with the signed-in user, or null if nobody is signed in. */
    currentUser() {
      return new Promise((resolve) => {
        const off = authMod.onAuthStateChanged(auth, (u) => { off(); this.user = u; resolve(u); });
      });
    },

    async signIn(email, password) {
      const cred = await authMod.signInWithEmailAndPassword(auth, email.trim(), password);
      this.user = cred.user;
      return cred.user;
    },

    async resetPassword(email) { await authMod.sendPasswordResetEmail(auth, email.trim()); },

    async signOut() { await authMod.signOut(auth); },

    async start(onData) {
      const state = {};
      COLLECTIONS.forEach((c) => (state[c] = {}));
      const loaded = new Set();
      this.onStatus = this.onStatus || (() => {});

      await new Promise((resolve, reject) => {
        this.unsubs = COLLECTIONS.map((c) =>
          fs.onSnapshot(colRef(c), { includeMetadataChanges: true }, (snap) => {
            const next = {};
            snap.forEach((d) => (next[d.id] = d.data()));
            state[c] = next;
            this.pending = snap.metadata.hasPendingWrites;
            this.fromCache = snap.metadata.fromCache;
            this.onStatus({ pending: this.pending, fromCache: this.fromCache });
            if (!loaded.has(c)) { loaded.add(c); if (loaded.size === COLLECTIONS.length) { onData({ ...state }); resolve(); return; } }
            if (loaded.size === COLLECTIONS.length) onData({ ...state });
          }, (err) => reject(err)),
        );
      });
    },

    async put(c, doc) { await fs.setDoc(docRef(c, doc.id), clean(doc)); },

    async putMany(items) {
      for (let i = 0; i < items.length; i += 400) {
        const batch = fs.writeBatch(db);
        items.slice(i, i + 400).forEach(({ col, doc }) => batch.set(docRef(col, doc.id), clean(doc)));
        await batch.commit();
      }
    },

    async del(c, id) { await fs.deleteDoc(docRef(c, id)); },
  };
}
