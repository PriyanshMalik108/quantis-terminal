# Architecture

## Runtime model
* **Static web app.** No application server, no database of ours. Everything runs in the browser and calls
  free, CORS-open data APIs directly. Optional: a tiny Cloudflare Worker key proxy (server/) and the user's own
  Firebase project for cloud sync.
* **Classic scripts, one global scope.** Files are plain `<script>` tags loaded in the order in
  `js/manifest.json`. Top-level `function`/`const` are visible to later files. Rule: top-level code in a file
  may only *call* functions from files listed earlier; code inside functions can use anything (resolved at
  call time). Start-up runs last (`js/app/init.js`, then `init-v4.js`), each step wrapped in `runInit()`.
* **Modules as namespaces.** v3/v4 features are IIFEs exposing one global object:

| Global | File | Responsibility |
|---|---|---|
| `LD` | data/live-data.js | CNBC quotes/bars, TradingView scanner, news, search |
| `QXS` | data/universal-search.js | one search across 12 asset kinds; option chains |
| `QXLI` | data/providers/line-items.js | exact statements via FMP / Alpha Vantage / Finnhub (user key or key proxy) |
| `QXFREE`, `QXSRC` | data/providers/free-sources.js | Wikidata, Wikipedia, CoinGecko, DefiLlama, Coinbase, mempool, ER-API; source catalogue |
| `QXCUSTOM` | data/providers/custom-api.js | user-defined API connectors |
| `QXM` | engines/analytics.js | series stats, bond maths, BSM/Greeks/IV, futures carry |
| `QXC` | modules/charts.js | professional chart widget |
| `QXA` | modules/analysis.js | financial-analyst engine (Analysis tab) |
| `QXP` | modules/peers.js | peer comparison |
| `QXFL` / `QXFLAB` | modules/formulas/library.js / features/formula-lab.js | formula catalogue + lab |
| `QXAL` | modules/alerts-pro.js | indicator & drawn-line alerts |
| `QXAI` | modules/ai.js | free-first AI provider chain + AI Lab |
| `QXCOL` → `QXRT` → `QXRV` → `QXRW`/`QXRO` | modules/reports/* | collect → template model → chart images → render/export |
| `QXREP` | modules/reports/report-ui.js | Report Studio + facade |
| `QXE` | features/explorer.js | Universal Search view |
| `QXH` | features/home.js | configurable Home (indices, hours, pulse, layout) |
| `QXPICK` | ui/picker.js | worldwide security search input used across views |
| `QXCOR` | features/correlation.js | correlation & relationship engine |
| `QXMG` | features/macro-global.js | country macro workspace (World Bank + markets) |
| `QXSCR` | features/screener-pro.js | advanced screener |
| `QXL` / motion | app/layout.js, app/motion.js | responsive drawers, table wrapping, cursor spotlight |
| `QXG`, `QXU` | modules/guide.js, ui.js | ⓘ guides; heatmap, sortable tables |

## Report pipeline
```
QXCOL.collect(kind, ref)  →  D  (one object per security: prices, stats, statements, peers, facts, gaps[])
QXRT.build(type, D, opt)  →  M  (neutral model: meta, cover{kpis,keyData,highlights,stance}, sections[blocks], charts{specs})
QXRV.render(M.charts, theme)  →  images {key:{png,jpg}}
QXRW.html / markdown / csv / json / xlsx      QXRO.pdf / docx / pptx
```
Adding a report type = one `build_*` function in templates.js + one entry in `TYPES`. Every renderer works
automatically because they only understand the block vocabulary (p, ul, kv, table, kpis, chart, callout, bars).

## Data honesty rules (enforced by code review + tests)
1. Never print an estimate in place of missing data — show "—" and add to `gaps[]`.
2. Every derived number names its formula (table note or methodology appendix).
3. Every text value from an API is escaped (`escapeHtml`) before it reaches the DOM.
