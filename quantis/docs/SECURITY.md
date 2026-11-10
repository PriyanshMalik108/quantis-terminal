# Security

## What is and is not possible for a website
**Anything a browser runs can be read by the person using it.** Minification, bundling and obfuscation raise
the effort but cannot make front-end source code secret, and no tool can. What we do instead:

1. **No secrets in the code.** The app ships with zero API keys. Users' own keys stay in their browser
   (localStorage) and are sent only to that provider. For a public site where *you* pay for data, deploy the
   **key proxy** (`server/cloudflare-worker/key-proxy.js`): keys are Worker secrets, the browser sends
   `__KEY__` placeholders, the worker validates origin + upstream host, rate-limits and injects the key.
2. **Production build** (`npm run build`): one minified bundle, comments stripped, content-hashed names,
   no source maps published. `config/headers/nginx.conf` also denies `/tools`, `/tests`, `/server`, `*.map`.
3. **Content-Security-Policy** (meta in dist/index.html + HTTP header via config/headers/*):
   scripts only from self, cdnjs, jsDelivr, gstatic (Firebase); no `eval`; `object-src 'none'`;
   `frame-ancestors 'none'` (no click-jacking); `form-action 'none'`; `upgrade-insecure-requests`.
4. **Subresource Integrity** on every CDN script (config/sri.json) — a tampered CDN file will not execute.
5. **XSS discipline:** all API / user text passes through `escapeHtml`; custom API connectors render as text;
   tests inject an `<img onerror>` payload and assert it is escaped.
6. **Other headers:** HSTS (2 years, preload), nosniff, Referrer-Policy, Permissions-Policy (camera, mic,
   geolocation, payment off), COOP same-origin.
7. **Database:** there is no shared database. Optional Cloud Sync writes to the *user's own* Firebase
   project; `config/firestore.rules` lets each signed-in user read/write only `users/{their uid}`.
   API keys are never synced.
8. **Supply chain:** pinned library versions; dev dependencies only (terser, clean-css, html-minifier-terser).

## Operational checklist
- [ ] Serve `dist/` only (never the repo root) over HTTPS.
- [ ] Apply the host's header file from `dist/` (`_headers` / `vercel.json` / `firebase.json` / `nginx.conf`).
- [ ] If you provide data keys, deploy the key proxy and set `ALLOWED_ORIGINS` to your domain.
- [ ] Re-run `tools/sri.sh` when upgrading a library and update config/sri.json + index.html.
- [ ] Keep `npm audit` clean for the build tools.
