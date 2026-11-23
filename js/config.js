// ─────────────────────────────────────────────────────────────────────────────
//  SHARING SETUP  (see README.md → "Use it together with your wife")
//
//  Leave `firebase` as null  → the app stores data on THIS device only.
//  Paste your Firebase web config → you and your wife share the same data live.
//
//  The Firebase web config is NOT a secret (it only identifies the project).
//  Your data is protected by the login + the security rules in firestore.rules.
// ─────────────────────────────────────────────────────────────────────────────

export const CONFIG = {
  firebase: {
    apiKey: 'AIzaSyClKdUkQk0_UcKas4gQpfPzVOISP4ro9Zs',
    authDomain: 'expensesiya.firebaseapp.com',
    projectId: 'expensesiya',
    storageBucket: 'expensesiya.firebasestorage.app',
    messagingSenderId: '54520676427',
    appId: '1:54520676427:web:dce8f12a019d20aa4acdce',
  },
  // Example — replace with the values from Firebase console → Project settings → Your apps:
  // firebase: {
  //   apiKey: 'AIza...',
  //   authDomain: 'our-budget-12345.firebaseapp.com',
  //   projectId: 'our-budget-12345',
  //   storageBucket: 'our-budget-12345.appspot.com',
  //   messagingSenderId: '1234567890',
  //   appId: '1:1234567890:web:abc123',
  // },

  // All of your data lives under households/<householdId> in Firestore.
  householdId: 'home',
};
