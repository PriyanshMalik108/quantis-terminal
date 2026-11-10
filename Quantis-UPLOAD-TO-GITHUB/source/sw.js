/**
 * Quantis Terminal · sw.js — service worker (Progressive Web App)
 * ─────────────────────────────────────────────────────────────────────────────
 * STRATEGY
 *   • App shell (index.html, CSS, JS, icons): precached on install → the app opens offline.
 *   • CDN libraries (cdnjs / jsDelivr / Google Fonts): stale-while-revalidate (cache, refresh in background).
 *   • Market data GET requests (CNBC bars, CoinGecko, mfapi…): network-first with a cache fallback,
 *     so charts and the last-seen data still render offline and are labelled stale by the app.
 *   • POST requests (TradingView scanner, AI) are never cached.
 * UPDATING  Bump VERSION on every release — the old caches are deleted on activate.
 *           The production build (tools/build.mjs) rewrites SHELL to the hashed bundle names.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const VERSION = 'quantis-v4.0.0';
const SHELL = self.__QX_SHELL__ || ['./', './index.html', './manifest.webmanifest', './assets/icons/icon-192.png', './assets/icons/icon-512.png'];
const CDN = /^(https:\/\/(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com))\//;
const DATA = /^(https:\/\/(ts-api\.cnbc\.com|quote\.cnbc\.com|api\.coingecko\.com|api\.mfapi\.in|api\.frankfurter\.dev|s3-symbol-logo\.tradingview\.com|coin-images\.coingecko\.com))\//;
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION+'-shell').then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request; if(req.method !== 'GET') return;
  const url = req.url;
  if(new URL(url).origin === self.location.origin && /site-config\.js$/.test(new URL(url).pathname)){
    // owner-editable settings: always try the network first so edits made on GitHub apply immediately
    e.respondWith(fetch(req).then(res => { const copy = res.clone(); caches.open(VERSION+'-shell').then(c => c.put(req, copy)); return res; }).catch(() => caches.match(req)));
    return;
  }
  if(new URL(url).origin === self.location.origin){
    e.respondWith(caches.match(req, {ignoreSearch:true}).then(hit => hit || fetch(req).then(res => { const copy = res.clone(); caches.open(VERSION+'-shell').then(c => c.put(req, copy)); return res; }).catch(() => caches.match('./index.html'))));
    return;
  }
  if(CDN.test(url)){
    e.respondWith(caches.open(VERSION+'-cdn').then(async c => { const hit = await c.match(req); const net = fetch(req).then(res => { if(res.ok || res.type==='opaque') c.put(req, res.clone()); return res; }).catch(() => hit); return hit || net; }));
    return;
  }
  if(DATA.test(url)){
    e.respondWith(fetch(req).then(res => { if(res.ok){ const copy = res.clone(); caches.open(VERSION+'-data').then(c => c.put(req, copy)); } return res; }).catch(() => caches.open(VERSION+'-data').then(c => c.match(req)).then(hit => hit || Response.error())));
  }
});
