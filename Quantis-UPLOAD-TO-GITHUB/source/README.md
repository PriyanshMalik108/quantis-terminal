# Quantis Terminal — v4

A free, browser-based, institutional-style research terminal for **every asset class**: stocks, preferred
shares, ETFs, funds, Indian mutual funds, corporate bonds & debentures, government bonds, futures, options,
crypto, currencies, indices and commodities. Live data from free, verified sources; professional reports
in eight formats.

## Quick start

| Goal | Command |
|---|---|
| Run the source version locally | `npm run serve:dev` → http://localhost:8080 |
| Build the production site | `npm install && npm run build` → `dist/` |
| Preview the production build | `npm run serve` |
| Run the tests | `tools/fetch_test_libs.sh` once, then `python3 tests/smoke.py . && python3 tests/test_v4.py .` (needs `pip install playwright`) |

Deploy **`dist/`** to any static host (Cloudflare Pages, Netlify, Vercel, Firebase Hosting, nginx).
Security headers for each host are generated into `dist/` — see `docs/DEPLOYMENT.md`.

## Folder map

```
index.html                 markup only (views, modals) — no inline <script>
manifest.webmanifest, sw.js   installable app + offline shell (PWA)
css/                       base.css (tokens/layout) · v3-typography-motion.css · modules.css · v4.css
js/manifest.json           LOAD ORDER of every script (index.html + build both read it)
js/core/                   storage, cache, feedback (toast/prompt), helpers (escapeHtml), currency, state
js/data/                   live-data (CNBC + TradingView), price/fundamental fetchers, universal search
js/data/providers/         line-items (FMP/AV/Finnhub), free-sources (Wikidata, CoinGecko, DefiLlama…), custom-api
js/engines/                formula engine, risk, forecasting, portfolio/options, analytics (bonds, BSM, stats)
js/features/               one file per view/tab (dashboard, research, screener, explorer, formula-lab, …)
js/modules/                charts, analysis, ai, guide, ui, peers, alerts-pro, formulas/, reports/
js/app/                    navigation, theme, mobile nav, init (start-up), init-v4
server/cloudflare-worker/  optional key proxy so API keys never reach browsers
config/                    SRI hashes, Firestore rules, hosting security headers
tools/                     build.mjs, sync_index.py, sri.sh, migration record
tests/                     Playwright suites + deterministic API mocks
docs/                      ARCHITECTURE · DEVELOPER · SECURITY · DATA-SOURCES · DEPLOYMENT
```

Start with **docs/DEVELOPER.md** if you are changing code.
