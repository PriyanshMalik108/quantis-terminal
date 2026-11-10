# Google sign-in (save every user's work securely)

When this is set up, a **Sign in** button in the top bar lets anyone sign in with their Google
account. Their watchlists, portfolio, alerts, saved screens, Home layout, chart templates and
preferences are stored in *their own* private record and come back on any device.

It works on GitHub Pages — no server needed. Time: about 10 minutes, free (Firebase Spark plan).

## 1. Create the Firebase project
1. Go to https://console.firebase.google.com → **Add project** → name it (e.g. `quantis-terminal`) → Create.
2. **Build → Authentication → Get started → Sign-in method → Google → Enable** → choose a support email → Save.
3. **Authentication → Settings → Authorized domains → Add domain** → `priyanshmalik108.github.io`
   (and your own domain later).
4. **Build → Firestore Database → Create database → Production mode** → pick a region near your users (e.g. `asia-south1` Mumbai).
5. **Firestore → Rules** → replace everything with the contents of `config/firestore.rules` → **Publish**.
   These rules let each signed-in person read and write only `users/{their own id}` and deny everything else.

## 2. Connect the website
1. **Project settings (gear) → General → Your apps → Web (</>)** → register an app (no hosting needed).
2. Copy the `firebaseConfig = { … }` object.
3. In your GitHub repository open **`site-config.js`** — it sits next to `index.html` (in your repo: `Quantis-UPLOAD-TO-GITHUB/site-config.js`) → ✏️ Edit →
   replace `firebase: null,` with `firebase: { …the values you copied… },` → **Commit**.
4. Wait a minute, reload the site — the top-right button now says **Sign in**.

## Security notes
* The Firebase web config is an *identifier*, designed by Google to be public. Protection comes from
  Google sign-in plus the Firestore rules above.
* Data-provider API keys (FMP, Alpha Vantage, Finnhub, Groq…) are **never** synced — they stay in the browser that entered them.
* Content-Security-Policy already allows only Google's sign-in domains (`*.firebaseapp.com`, `accounts.google.com`, `apis.google.com`).
* To delete a user's data: Firestore → `users` → their document → delete. Users can also sign out at any time.
* Optional hardening: Firebase **App Check** (reCAPTCHA v3) blocks scripted abuse of your project.
