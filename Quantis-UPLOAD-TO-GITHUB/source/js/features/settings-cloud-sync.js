/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/features/settings-cloud-sync.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Settings (API keys) and optional Firebase cloud sync. Keys live in the user's browser only.
 * DEPENDS   core/storage.js
 * EXPOSES   saveSettings, getKey, cloudSyncPush (global — classic script, shared scope)
 * LOAD      Classic <script>, order defined in js/manifest.json. Top-level code runs at load,
 *           so it may only call functions from files listed EARLIER in the manifest.
 * NOTE      Migrated verbatim from the single-file build; inline comments marked
 *           "REAL BUG FIXED" / "post-launch fix" document past defects — keep them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* ===================== SETTINGS (user-supplied API keys, localStorage only) ===================== */
/* ===================== CLOUD SYNC — Google Sign-In + Firestore =====================
   A static single-file HTML app has no server of its own, so there is no shared "Quantis
   account" to sign into — what actually makes "sign in and save my data across devices" work
   is the USER'S OWN free Firebase project (Google's real backend-as-a-service, same free Spark
   tier production apps use — no credit card, generous limits). This app can't provision that
   project on the user's behalf (that requires their Google account and console access, which
   this app never touches), so it's configured once via a pasted config object in Settings, then
   works exactly like an ordinary "Sign in with Google" button from then on.
   Design choices, stated plainly rather than left implicit:
     - Only 6 app-data keys sync (workspaces, portfolio, alerts, custom screens, notes, theme).
       API keys NEVER sync — they stay in this browser's local storage only, so a compromised or
       shared Firestore project can't leak them.
     - Sync model is deliberately simple, not a CRDT/merge engine: on sign-in, if a cloud copy
       already exists it fully REPLACES local data (cloud wins); if not, local data is pushed up
       once as the initial cloud copy. Two devices editing offline at the same time and both
       reconnecting will have the LATER reconnect's local data win, not a field-level merge. This
       is disclosed in the UI, not hidden — good enough for "my own data on ≤2-3 personal
       devices", not a substitute for real multi-user collaboration. */
const CLOUD_SYNC_KEYS = ['quantis_workspaces_v1','quantis_custom_screens_v1','quantis_portfolio_v1','quantis_position_notes_v1','quantis_alerts_v1','quantis_theme_v1','qx_alerts_pro_v1','quantis_custom_apis_v1','qxr_theme_v2','qxr_by','qxr_firm'];
const FIREBASE_CONFIG_STORAGE_KEY = 'quantis_firebase_config';
let firebaseApp = null, firestoreDb = null, cloudSyncUser = null, cloudSyncPushTimer = null;

function parseFirebaseConfigInput(raw){
  let text = raw.trim();
  // Tolerate the full snippet Firebase's console shows ("const firebaseConfig = {...};"), not
  // just the bare object — copy-pasting the whole block is the natural thing to do and forcing
  // users to hand-trim it first is a needless papercut.
  const braceStart = text.indexOf('{'), braceEnd = text.lastIndexOf('}');
  if(braceStart === -1 || braceEnd === -1 || braceEnd < braceStart) throw new Error('Could not find a { ... } object in what you pasted.');
  text = text.slice(braceStart, braceEnd+1);
  // Firebase's console shows a JS object literal (unquoted keys: apiKey: "...", not "apiKey":
  // "..."), which is NOT valid JSON. Rather than eval/Function (running arbitrary pasted text
  // as code, even though it's the user's own paste), quote bare identifier keys with a regex so
  // JSON.parse can handle it — safer, and handles the real-world paste format either way.
  const asJson = text.replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)\s*:/g, '$1"$2":').replace(/,(\s*[}\]])/g, '$1');
  let cfg;
  try{ cfg = JSON.parse(asJson); }
  catch(e){ throw new Error('Could not parse that as a Firebase config object — make sure you copied the whole {...} block from the Firebase console.'); }
  if(!cfg.apiKey || !cfg.authDomain || !cfg.projectId) throw new Error('Missing apiKey/authDomain/projectId — this doesn\'t look like a complete Firebase web config.');
  return cfg;
}
let firebaseSdkPromise = null;
function loadFirebaseSdk(){
  if(typeof firebase !== 'undefined' && firebase.firestore) return Promise.resolve();
  if(firebaseSdkPromise) return firebaseSdkPromise;
  const base = 'https://www.gstatic.com/firebasejs/10.13.0/';
  const one = name => new Promise((res, rej)=>{
    const el = document.createElement('script');
    el.src = base + name; el.async = false;
    el.onload = res; el.onerror = ()=>rej(new Error('Could not load '+name+' (network or content blocker)'));
    document.head.appendChild(el);
  });
  firebaseSdkPromise = one('firebase-app-compat.js').then(()=>Promise.all([one('firebase-auth-compat.js'), one('firebase-firestore-compat.js')]))
    .catch(e=>{ firebaseSdkPromise = null; throw e; });
  return firebaseSdkPromise;
}
async function initFirebaseIfConfigured(){
  let raw;
  try{ raw = safeStorage.getItem(FIREBASE_CONFIG_STORAGE_KEY); }catch(e){ return; }
  if(!raw) return;
  try{ await loadFirebaseSdk(); }
  catch(e){ console.warn('[Quantis] cloud sync unavailable:', e.message); return; } // everything else in the app still works
  if(firebaseApp) return; // already initialised (initializeApp twice throws "app already exists")
  try{
    const cfg = JSON.parse(raw);
    firebaseApp = firebase.apps && firebase.apps.length ? firebase.app() : firebase.initializeApp(cfg);
    firestoreDb = firebase.firestore();
    document.getElementById('cloudSyncSetupBox').style.display = 'none';
    firebase.auth().onAuthStateChanged(onCloudAuthStateChanged);
  }catch(e){
    console.error('Firebase init failed:', e);
  }
}
function connectFirebase(){
  const status = document.getElementById('settingsStatus');
  try{
    const cfg = parseFirebaseConfigInput(document.getElementById('firebaseConfigInput').value);
    safeStorage.setItem(FIREBASE_CONFIG_STORAGE_KEY, JSON.stringify(cfg));
    status.style.display='block'; status.classList.remove('pop-in'); void status.offsetWidth; status.classList.add('pop-in');
    status.innerHTML = 'Firebase project connected. You can now use "Sign in with Google" above.';
    initFirebaseIfConfigured();
  }catch(e){
    status.style.display='block'; status.classList.remove('pop-in'); void status.offsetWidth; status.classList.add('pop-in');
    status.innerHTML = `<span style="color:var(--down)">${escapeHtml(e.message)}</span>`;
  }
}
function disconnectFirebase(){
  // `firebase?.auth` threw a ReferenceError when the SDK was never loaded (undeclared global)
  if(cloudSyncUser && typeof firebase !== 'undefined' && firebase.auth) firebase.auth().signOut().catch(()=>{});
  try{ safeStorage.removeItem(FIREBASE_CONFIG_STORAGE_KEY); }catch(e){}
  location.reload(); // simplest fully-correct way to reset the Firebase SDK's internal state
}
function signInWithGoogle(){
  if(!firebaseApp && safeStorage.getItem(FIREBASE_CONFIG_STORAGE_KEY)){ toast('Cloud sync is still loading — try again in a moment.', 'warn'); initFirebaseIfConfigured(); return; }
  if(!firebaseApp){ toast('Connect a Firebase project first (paste your config above and click Connect).'); return; }
  const provider = new firebase.auth.GoogleAuthProvider();
  firebase.auth().signInWithPopup(provider).catch(e=>{
    document.getElementById('cloudSyncStatusLine').innerHTML = `<span style="color:var(--down)">Sign-in failed: ${escapeHtml(e.message)}</span>`;
  });
}
function signOutOfCloud(){ if(typeof firebase !== 'undefined' && firebase.auth) firebase.auth().signOut(); }
async function onCloudAuthStateChanged(user){
  cloudSyncUser = user;
  const badge = document.getElementById('cloudSyncBadge');
  const label = document.getElementById('cloudSyncLabel');
  const setupBox = document.getElementById('cloudSyncSetupBox');
  const signedInBox = document.getElementById('cloudSyncSignedInBox');
  const signInPrompt = document.getElementById('cloudSyncSignInPrompt');
  if(setupBox) setupBox.style.display = 'none'; // stays hidden once ANY project is connected, signed in or not — re-shown only via "Forget this Firebase project"
  if(!user){
    if(badge){ badge.textContent = 'SIGNED OUT'; badge.className = 'badge assume'; }
    if(label) label.textContent = 'Sign in';
    if(signedInBox) signedInBox.style.display = 'none';
    if(signInPrompt) signInPrompt.style.display = 'block';
    return;
  }
  if(badge){ badge.textContent = 'SYNCED'; badge.className = 'badge fact'; }
  if(label) label.textContent = (user.displayName||user.email||'Synced').split(' ')[0];
  if(signedInBox) signedInBox.style.display = 'block';
  if(signInPrompt) signInPrompt.style.display = 'none';
  const photo = document.getElementById('cloudUserPhoto');
  if(photo){ if(user.photoURL){ photo.src = user.photoURL; photo.style.display='block'; } else photo.style.display='none'; }
  const nameEl = document.getElementById('cloudUserName'); if(nameEl) nameEl.textContent = user.displayName || 'Signed in';
  const emailEl = document.getElementById('cloudUserEmail'); if(emailEl) emailEl.textContent = user.email || '';
  await cloudSyncPull();
}
async function cloudSyncPull(){
  const line = document.getElementById('cloudSyncStatusLine');
  if(!cloudSyncUser || !firestoreDb) return;
  try{
    const doc = await firestoreDb.collection('users').doc(cloudSyncUser.uid).get();
    if(doc.exists){
      const data = doc.data();
      // Only reload when the cloud copy actually differs from what's already local. Previously every
      // page load with a signed-in user pulled, wrote, and reloaded unconditionally — and since Firebase
      // restores the session on load, that re-triggered this handler: an infinite reload loop.
      let changed = false;
      CLOUD_SYNC_KEYS.forEach(k=>{ if(data[k] != null && safeStorage.getItem(k) !== data[k]){ safeStorage.setItem(k, data[k]); changed = true; } });
      if(changed){
        if(line) line.innerHTML = 'Found newer cloud data — reloading to apply it…';
        setTimeout(()=>location.reload(), 600);
      } else if(line){
        line.innerHTML = 'In sync with your cloud copy.';
      }
    } else {
      if(line) line.innerHTML = 'No cloud data yet for this account — uploading what\'s on this device now as your first synced copy.';
      await cloudSyncPushNow();
      if(line) line.innerHTML = 'Uploaded. This device\'s data is now your cloud copy — sign in on another device to pull it there.';
    }
  }catch(e){
    if(line) line.innerHTML = `<span style="color:var(--down)">Cloud sync error: ${escapeHtml(e.message)}. Check that Firestore is enabled and its rules allow a signed-in user to read/write <code>users/{their own uid}</code>.</span>`;
  }
}
async function cloudSyncPushNow(){
  if(!cloudSyncUser || !firestoreDb) return;
  const payload = {};
  CLOUD_SYNC_KEYS.forEach(k=>{ try{ const v = safeStorage.getItem(k); if(v!=null) payload[k] = v; }catch(e){} });
  payload.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
  await firestoreDb.collection('users').doc(cloudSyncUser.uid).set(payload, {merge:true});
}
// Debounced — called after every local save of a synced key, so a burst of edits (e.g. adding
// 5 tickers to a watchlist in a row) produces one Firestore write, not five.
function cloudSyncPush(){
  if(!cloudSyncUser || !firestoreDb) return;
  clearTimeout(cloudSyncPushTimer);
  cloudSyncPushTimer = setTimeout(()=>{
    cloudSyncPushNow().then(()=>{
      const line = document.getElementById('cloudSyncStatusLine');
      if(line) line.innerHTML = 'Synced ' + new Date().toLocaleTimeString() + '.';
    }).catch(e=>console.error('Cloud sync push failed:', e));
  }, 800);
}
function loadSettingsIntoForm(){
  try{
    document.getElementById('keyAlphaVantage').value = safeStorage.getItem('quantis_key_alphavantage') || '';
    document.getElementById('keyTwelveData').value = safeStorage.getItem('quantis_key_twelvedata') || '';
    document.getElementById('keyFmp').value = safeStorage.getItem('quantis_key_fmp') || '';
    document.getElementById('keyFred').value = safeStorage.getItem('quantis_key_fred') || '';
    document.getElementById('keyFinnhub').value = safeStorage.getItem('quantis_key_finnhub') || '';
    const cgk = document.getElementById('keyCoingecko'); if(cgk) cgk.value = safeStorage.getItem('quantis_key_coingecko') || '';
    const kp = document.getElementById('keyKeyproxy'); if(kp) kp.value = safeStorage.getItem('quantis_key_keyproxy') || '';
    document.getElementById('keyOpenFigi').value = safeStorage.getItem('quantis_key_openfigi') || '';
    document.getElementById('keyCsl').value = safeStorage.getItem('quantis_key_csl') || '';
    document.getElementById('keyCustomProxy').value = safeStorage.getItem('quantis_key_customproxy') || '';
    document.getElementById('keyAnthropic').value = safeStorage.getItem('quantis_key_anthropic') || '';
    document.getElementById('keyOpenai').value = safeStorage.getItem('quantis_key_openai') || '';
    document.getElementById('keyGroq').value = safeStorage.getItem('quantis_key_groq') || '';
    try{ QXAI.loadSettings(); }catch(e){}
  }catch(e){ /* localStorage unavailable — keys simply won't persist across reloads */ }
  updateCustomProxyPreview();
}
function updateCustomProxyPreview(){
  const box = document.getElementById('customProxyPreview');
  if(!box) return;
  const raw = document.getElementById('keyCustomProxy').value.trim();
  if(!raw){ box.style.display='none'; return; }
  // Preview using a TEMPORARY copy of the normalization logic against the unsaved input value,
  // so you see exactly what will actually be used BEFORE clicking Save — no more finding out
  // something was malformed only after a failed search.
  let base = raw.replace(/[?&]url=?.*$/i, '').replace(/\/+$/, '');
  const valid = /^https?:\/\//i.test(base);
  box.style.display='block';
  if(!valid){
    box.innerHTML = `<span style="color:var(--down)">This doesn't look like a full URL yet (needs to start with https://) — nothing will be used until it does.</span>`;
  } else {
    box.innerHTML = `Will actually be requested as: <code>${base}/?url=&lt;target&gt;</code> — this is rebuilt automatically regardless of whether you paste a trailing slash or <code>?url=</code> yourself.`;
  }
}
function saveSettings(){
  const status = document.getElementById('settingsStatus');
  try{
    safeStorage.setItem('quantis_key_alphavantage', document.getElementById('keyAlphaVantage').value.trim());
    safeStorage.setItem('quantis_key_twelvedata', document.getElementById('keyTwelveData').value.trim());
    safeStorage.setItem('quantis_key_fmp', document.getElementById('keyFmp').value.trim());
    safeStorage.setItem('quantis_key_fred', document.getElementById('keyFred').value.trim());
    safeStorage.setItem('quantis_key_finnhub', document.getElementById('keyFinnhub').value.trim());
    const cgk = document.getElementById('keyCoingecko'); if(cgk) safeStorage.setItem('quantis_key_coingecko', cgk.value.trim());
    const kp = document.getElementById('keyKeyproxy'); if(kp){ const v = kp.value.trim(); if(v && !/^https:\/\//i.test(v)) throw new Error('Key proxy URL must start with https://'); safeStorage.setItem('quantis_key_keyproxy', v); }
    safeStorage.setItem('quantis_key_openfigi', document.getElementById('keyOpenFigi').value.trim());
    safeStorage.setItem('quantis_key_csl', document.getElementById('keyCsl').value.trim());
    safeStorage.setItem('quantis_key_customproxy', document.getElementById('keyCustomProxy').value.trim());
    safeStorage.setItem('quantis_key_anthropic', document.getElementById('keyAnthropic').value.trim());
    safeStorage.setItem('quantis_key_openai', document.getElementById('keyOpenai').value.trim());
    safeStorage.setItem('quantis_key_groq', document.getElementById('keyGroq').value.trim());
    try{ QXAI.saveSettingsAi(); }catch(e){}
    const aiKeySet = document.getElementById('keyAnthropic').value.trim() || document.getElementById('keyOpenai').value.trim() || document.getElementById('keyGroq').value.trim();
    status.style.display='block'; status.classList.remove('pop-in'); void status.offsetWidth; status.classList.add('pop-in');
    status.innerHTML = 'Saved to this browser\'s local storage only, sent to no one but the provider itself.'
      + (' AI: ' + (QXAI.chain().length ? QXAI.PROVIDERS[QXAI.chain()[0]].label : 'off (rule-based answers only)') + '.')
      + ' Equity data will try your custom proxy first (if set), then a public fallback proxy, then sample data.';
    updateCustomProxyPreview();
    priceFetchToken++; // force a re-fetch with the new proxy setting
    if(document.getElementById('view-research').classList.contains('active')) drawPriceChart();
  }catch(e){
    status.style.display='block'; status.classList.remove('pop-in'); void status.offsetWidth; status.classList.add('pop-in');
    status.innerHTML = 'Could not save — localStorage unavailable in this environment.';
  }
}
/* Generates and downloads a ready-to-deploy Cloudflare Worker that adds CORS headers
   to Stooq/Alpha Vantage/Twelve Data/FRED responses. Free tier, no account cost, ~60s setup. */
function downloadProxyWorker(){
  const workerCode = `// QUANTIS CORS PROXY WORKER
// Deploy free on Cloudflare Workers (workers.cloudflare.com) — free tier, no credit card needed for this usage level.
// Setup (~60 seconds):
//   1. Sign in at https://dash.cloudflare.com (free account)
//   2. Workers & Pages -> Create -> Create Worker
//   3. Paste this entire file over the default code, click Deploy
//   4. Copy the worker URL Cloudflare gives you, e.g. https://your-worker.your-subdomain.workers.dev
//   5. In Quantis Settings, paste it into "Your own CORS proxy URL" as: https://your-worker.your-subdomain.workers.dev/?url=
//
// This worker only forwards GET requests to an allowlist of free financial data hosts and adds
// Access-Control-Allow-Origin so your browser will accept the response. It stores no data and needs no API key
// of its own — any key (e.g. Alpha Vantage) stays in the querystring you already built client-side.

const ALLOWED_HOSTS = [
  'stooq.com', 'www.stooq.com',
  'query1.finance.yahoo.com', 'query2.finance.yahoo.com',
  'www.alphavantage.co',
  'api.twelvedata.com',
  'api.stlouisfed.org',
  'data.sec.gov', 'www.sec.gov',
  'www.amfiindia.com', 'portal.amfiindia.com',
  // every other host the app routes through the proxy chain (news, filings, macro, sentiment)
  'feeds.finance.yahoo.com', 'news.google.com', 'api.stocktwits.com', 'en.wikipedia.org',
  'date.nager.at', 'api.alternative.me', 'api.worldbank.org', 'publicreporting.cftc.gov',
  'finnhub.io', 'data.trade.gov', 'financialmodelingprep.com', 'api.coingecko.com', 'api.frankfurter.dev'
];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*'
};
export default {
  async fetch(request) {
    // Handle CORS preflight explicitly.
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    const reqUrl = new URL(request.url);
    const target = reqUrl.searchParams.get('url');
    if (!target) {
      // BUG FIXED: every error response below previously had NO CORS headers at all. A browser
      // treats a cross-origin response with no Access-Control-Allow-Origin header as a CORS
      // failure and refuses to expose ANYTHING about it to JavaScript — not the status code, not
      // the body — so fetch() throws a generic, uninformative "Failed to fetch" no matter what
      // the real problem was (wrong URL, host not allowlisted, upstream down, etc). This is why
      // a 403 "host not in allowlist" was showing up in the app as an opaque network failure
      // instead of a readable error. Every response path now includes CORS_HEADERS so real
      // errors are actually visible to the app instead of being swallowed by the browser.
      return new Response('Usage: ?url=<encoded target URL>', { status: 400, headers: CORS_HEADERS });
    }
    let targetUrl;
    try { targetUrl = new URL(target); } catch (e) {
      return new Response('Invalid target URL', { status: 400, headers: CORS_HEADERS });
    }
    if (!ALLOWED_HOSTS.includes(targetUrl.hostname)) {
      return new Response('Host not in allowlist: ' + targetUrl.hostname, { status: 403, headers: CORS_HEADERS });
    }
    let upstream;
    try {
      upstream = await fetch(targetUrl.toString(), {
        // SEC EDGAR requires a descriptive User-Agent with a real contact email — edit the line
        // below with your own info before relying on this for SEC data (see sec.gov/os/accessing-edgar-data).
        headers: Object.assign(
          { 'User-Agent': 'QuantisProxy/1.0 (contact: your-email@example.com)' },
          // forward the one auth header the app sends through the proxy (Trade.gov screening key)
          request.headers.get('subscription-key') ? { 'subscription-key': request.headers.get('subscription-key') } : {}
        )
      });
    } catch (e) {
      return new Response('Upstream fetch failed: ' + e.message, { status: 502, headers: CORS_HEADERS });
    }
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') || 'text/plain',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Cache-Control': 'public, max-age=60'
      }
    });
  }
};
`;
  const blob = new Blob([workerCode], {type:'text/javascript'});
  try{
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'quantis-proxy-worker.js';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }catch(e){
    toast('Download failed in this browser/environment: '+e.message+'. Try a different browser, or disable any content blocker for this page.');
    return;
  }
  const status = document.getElementById('settingsStatus');
  status.style.display='block'; status.classList.remove('pop-in'); void status.offsetWidth; status.classList.add('pop-in');
  status.innerHTML = 'Downloaded quantis-proxy-worker.js — setup steps are commented at the top of the file. Deploy it on Cloudflare Workers (free), then paste the resulting URL (ending in <code>/?url=</code>) into the field above and Save.';
}
/* downloadTextFile / downloadAmfiWorkflow / downloadSecFactsWorkflow — everything the app needs
   (proxy worker, both GitHub Actions mirror workflows) is generated FROM this single HTML file
   on demand, the same way downloadProxyWorker() already worked. That keeps the actual deliverable
   to exactly one file — nothing to keep track of across separate attachments — while still
   letting you get the auxiliary files GitHub itself requires to live at specific repo paths
   (.github/workflows/*.yml) in order to run at all; that's a GitHub structural requirement, not
   something that can be avoided by putting the YAML inside the HTML file instead. */
function downloadTextFile(filename, content, mime){
  try{
    const blob = new Blob([content], {type: mime||'text/plain'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }catch(e){
    toast('Download failed in this browser/environment: '+e.message+'. Try a different browser, or disable any content blocker for this page.');
  }
}
function notifySettings(html){
  const status = document.getElementById('settingsStatus');
  status.style.display='block'; status.classList.remove('pop-in'); void status.offsetWidth; status.classList.add('pop-in');
  status.innerHTML = html;
}
function downloadAmfiWorkflow(){
  const yml = `name: Update AMFI mutual fund NAV mirror

# Fetches AMFI India's official daily NAV file server-side (GitHub's runners have no CORS
# restriction — CORS is a browser-only concept) and commits it into the repo at
# data/amfi-nav.txt. Because that file then gets served from the SAME origin as the rest
# of the site (your GitHub Pages domain), the app can read it with a plain same-origin
# fetch() — no proxy, no CORS, nothing that can be rate-limited or go down.
#
# Runs once a day automatically. You can also trigger it manually any time from the
# Actions tab ("Run workflow") if you want fresh data right now instead of waiting.

on:
  schedule:
    - cron: '30 1 * * *'   # ~07:00 IST daily (AMFI publishes NAVs on business days)
  workflow_dispatch: {}     # lets you click "Run workflow" manually in the GitHub UI

permissions:
  contents: write

jobs:
  update-nav:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Download AMFI NAV file
        run: |
          mkdir -p data
          curl -fsSL --retry 3 --retry-delay 5 \\
            -A "Mozilla/5.0 (compatible; QuantisTerminal/1.0; +https://github.com)" \\
            "https://www.amfiindia.com/spages/NAVAll.txt" \\
            -o data/amfi-nav.txt
          if ! grep -q ';' data/amfi-nav.txt || [ "$(wc -l < data/amfi-nav.txt)" -lt 1000 ]; then
            echo "::error::Downloaded file doesn't look like a valid AMFI NAV file — aborting commit."
            exit 1
          fi

      - name: Commit if changed
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          if ! git diff --quiet -- data/amfi-nav.txt; then
            git add data/amfi-nav.txt
            git commit -m "chore: refresh AMFI mutual fund NAV mirror [automated]"
            git push
          else
            echo "No change in NAV data — nothing to commit."
          fi
`;
  downloadTextFile('update-amfi-nav.yml', yml, 'text/yaml');
  notifySettings('Downloaded update-amfi-nav.yml — in your GitHub repo, create it at exactly <code>.github/workflows/update-amfi-nav.yml</code>, then Actions tab → run it once manually.');
}
function downloadSecFactsWorkflow(){
  const yml = `name: Update SEC EDGAR fundamentals mirror

# SEC's companyfacts API has no CORS headers for browsers, so a page on GitHub Pages can't
# fetch it directly, and public CORS proxies are unreliable. GitHub Actions runners aren't
# browsers — no CORS applies — so this job fetches real filed financials for every ticker
# below server-side, once a day, and commits them into data/sec/*.json. The app then reads
# those back from ITS OWN origin, so fundamentals for these ~50 companies work with zero
# dependency on any proxy or Cloudflare Worker at all.

on:
  schedule:
    - cron: '0 3 * * *'   # once daily — SEC filings don't change intraday
  workflow_dispatch: {}    # click "Run workflow" in the Actions tab to fetch immediately

permissions:
  contents: write

jobs:
  update-sec-facts:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Download SEC companyfacts for every mapped ticker
        run: |
          mkdir -p data/sec
          # IMPORTANT: SEC requires a descriptive User-Agent with a real contact email on every
          # request (see sec.gov/os/accessing-edgar-data) or it will start rejecting requests.
          # Edit CONTACT_EMAIL below to your own address before relying on this long-term.
          CONTACT_EMAIL="your-email@example.com"
          UA="QuantisTerminalMirror/1.0 (contact: $CONTACT_EMAIL)"

          declare -A CIKS=(
            [AAPL]=0000320193 [MSFT]=0000789019 [NVDA]=0001045810 [AMZN]=0001018724
            [GOOGL]=0001652044 [AVGO]=0001730168 [META]=0001326801 [TSLA]=0001318605
            [BRK.B]=0001067983 [LLY]=0000059478 [WMT]=0000104169 [JPM]=0000019617 [V]=0001403161
            [ORCL]=0001341439 [XOM]=0000034088 [JNJ]=0000200406 [MA]=0001141391 [NFLX]=0001065280
            [COST]=0000909832 [BAC]=0000070858 [PG]=0000080424 [HD]=0000354950 [GE]=0000040545
            [KO]=0000021344 [CVX]=0000093410 [ABNB]=0001559720 [PDD]=0001737806 [ADBE]=0000796343
            [UBER]=0001543151 [CSCO]=0000858877 [INTC]=0000050863 [IBM]=0000051143 [DIS]=0001744489
            [BA]=0000012927 [GS]=0000886982 [MS]=0000895421 [C]=0000831001 [WFC]=0000072971
            [CAT]=0000018230 [GM]=0001467858 [F]=0000037996 [PFE]=0000078003 [PEP]=0000077476
            [T]=0000732717 [VZ]=0000732712 [NKE]=0000320187 [SBUX]=0000829224 [QCOM]=0000804328
            [TXN]=0000097476 [UNH]=0000731766 [PYPL]=0001633917 [BABA]=0001577552
          )

          FAILED=0
          for TICKER in "\${!CIKS[@]}"; do
            CIK="\${CIKS[$TICKER]}"
            echo "Fetching $TICKER (CIK $CIK)..."
            if curl -fsSL --retry 3 --retry-delay 5 -A "$UA" \\
                 "https://data.sec.gov/api/xbrl/companyfacts/CIK\${CIK}.json" \\
                 -o "data/sec/\${TICKER}.json"; then
              if ! grep -q '"entityName"' "data/sec/\${TICKER}.json"; then
                echo "::warning::\${TICKER}.json doesn't look valid — removing"
                rm -f "data/sec/\${TICKER}.json"
                FAILED=$((FAILED+1))
              fi
            else
              echo "::warning::Failed to fetch $TICKER"
              FAILED=$((FAILED+1))
            fi
            sleep 0.5
          done
          echo "Done. $FAILED ticker(s) failed (non-fatal — those just keep using proxy/sample fallback)."

      - name: Commit if changed
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          if ! git diff --quiet -- data/sec/; then
            git add data/sec/
            git commit -m "chore: refresh SEC EDGAR fundamentals mirror [automated]"
            git push
          else
            echo "No change in SEC data — nothing to commit."
          fi
`;
  downloadTextFile('update-sec-facts.yml', yml, 'text/yaml');
  notifySettings('Downloaded update-sec-facts.yml — in your GitHub repo, create it at exactly <code>.github/workflows/update-sec-facts.yml</code>, then Actions tab → run it once manually.');
}
document.getElementById('csvImport').addEventListener('change', e=>{
  const file = e.target.files[0];
  const status = document.getElementById('settingsStatus');
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    try{
      const lines = reader.result.trim().split('\n');
      const header = lines[0].toLowerCase();
      if(!header.includes('date') || !header.includes('close')) throw new Error('Expected columns: Date, Open, High, Low, Close, Volume');
      const rows = lines.slice(1).map(l=>l.split(','));
      const opens = rows.map(r=>parseFloat(r[1]));
      const highs = rows.map(r=>parseFloat(r[2]));
      const lows = rows.map(r=>parseFloat(r[3]));
      const closes = rows.map(r=>parseFloat(r[4])).filter(v=>!isNaN(v));
      const dates = rows.map(r=>r[0]);
      if(closes.length < 2) throw new Error('No valid rows found');
      priceFetchToken++; // invalidate any in-flight live fetch
      // Was truncating even a user's own uploaded file to 180 rows for no reason — if someone
      // uploads 10 years of their own CSV data, use all of it.
      const ohlc = {open:opens, high:highs, low:lows, close:closes};
      renderPriceChartCanvas(dates, closes, true, ohlc);
      setDataQuality(`<b>Source:</b> Local file upload (${escapeHtml(file.name)})<br><b>Freshness:</b> through ${escapeHtml(dates[dates.length-1])}<br><b>Adjusted:</b> as provided<br><b>Provider status:</b> <span style="color:var(--up)">OK — offline/local mode</span>`);
      status.style.display='block'; status.classList.remove('pop-in'); void status.offsetWidth; status.classList.add('pop-in'); status.innerHTML = `Loaded ${closes.length} rows from ${escapeHtml(file.name)} into the active chart.`;
      document.getElementById('settingsOverlay').classList.remove('show');
      goto('research');
    }catch(err){
      status.style.display='block'; status.classList.remove('pop-in'); void status.offsetWidth; status.classList.add('pop-in'); status.innerHTML = 'Import failed: '+escapeHtml(err.message);
    }
  };
  reader.readAsText(file);
});
