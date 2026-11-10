# Deployment

1. `npm install && npm run build` → `dist/`
2. Upload **dist/** to your host:
   * **Cloudflare Pages / Netlify** — `_headers` in dist/ is applied automatically.
   * **Vercel** — `vercel.json` in dist/.
   * **Firebase Hosting** — `firebase.json` in dist/ (`firebase deploy --only hosting`), plus
     `firebase deploy --only firestore:rules` with config/firestore.rules if you enable Cloud Sync.
   * **nginx** — include `nginx.conf` from dist/ in your server block.
3. HTTPS is required (service worker, clipboard, notifications).
4. Optional key proxy: see header of `server/cloudflare-worker/key-proxy.js`, then set its URL in
   Settings → Key proxy URL (or pre-seed `localStorage.quantis_key_keyproxy` from your own landing page).
5. After each release the service worker version changes automatically (content hash), so users get the
   update on their next visit.
