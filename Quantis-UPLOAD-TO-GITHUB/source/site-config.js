/**
 * Quantis Terminal · site-config.js — SITE OWNER SETTINGS (edit this file directly on GitHub)
 * ─────────────────────────────────────────────────────────────────────────────
 * Google sign-in: paste your Firebase project's web config below (Firebase console →
 * Project settings → Your apps → Web app → "Config"). Once filled in, every visitor sees a
 * "Sign in" button; signing in with Google keeps their watchlists, portfolio, alerts, screens,
 * Home layout and preferences in their own private record, on any device.
 *
 * Is it safe to publish this? Yes. A Firebase web config is an identifier, not a password —
 * Google designs it to be public. Security comes from (1) Firebase Authentication and
 * (2) the Firestore rules in source/config/firestore.rules, which let each signed-in person read
 * and write ONLY their own record. Never put API keys for paid data providers here.
 *
 * Step-by-step guide: source/docs/GOOGLE-SIGN-IN.md
 * ─────────────────────────────────────────────────────────────────────────────
 */
window.QX_SITE_CONFIG = {
  firebase: null,
  // Example (replace null above with your own values):
  // firebase: { apiKey: "AIza…", authDomain: "your-project.firebaseapp.com", projectId: "your-project",
  //             storageBucket: "your-project.appspot.com", messagingSenderId: "1234567890", appId: "1:1234567890:web:abc123" },
};
