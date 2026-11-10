# Developer guide

## Everyday tasks
| Task | Where |
|---|---|
| Add a new JS file | create it, add its path to `js/manifest.json` in the right position, run `python3 tools/sync_index.py` |
| Add a view | markup `<div class="view" id="view-NAME">` in index.html + nav item; lazy render in `goto()` (js/app/navigation.js) |
| Add a data source | `js/data/providers/free-sources.js` (fetcher via `cachedJson`) + catalogue entry with a `probe` |
| Add a formula | one object in `js/modules/formulas/cfa-library.js` (`in` = inputs, 4th item = auto-fill key from `QXFL.context`) |
| Add a report type | `js/modules/reports/templates.js`: write a builder, add to `TYPES` with the kinds it applies to |
| Add an asset kind | collector (reports/collectors.js) + detail renderer (features/explorer.js `RENDER`) + market in universal-search.js |
| Add an ⓘ guide | `G` object in js/modules/guide.js; keys `view:<id>`, `tab:<id>`, `card:<lowercase card title>` |
| Change colours | tokens in css/base.css (dark) and `THEME_LIGHT` in js/app/theme.js; report themes in reports/themes.js |
| Third-party library | add the CDN tag with an `integrity` hash (`tools/sri.sh <url>`), record it in config/sri.json, add the URL to the CSP in tools/build.mjs and config/headers/* |

## Conventions
* `cachedJson(key, ttl, fn)` for new fetches (returns the value unchanged). The older `cachedFetch` spreads
  objects and is kept for legacy callers.
* Every network call has a timeout (`fetchWithTimeout`) and degrades to a visible "unavailable" message.
* No `eval`, no `new Function`, no inline `<script>`. Inline `onclick` attributes are tolerated
  (`script-src-attr`), but new code should use `addEventListener`.
* All user/API text through `escapeHtml()`; in explorer.js wrap pre-built markup in `H()`.
* Comments marked `REAL BUG FIXED` / `post-launch fix` record past defects — keep them.

## Testing
`tests/harness.py` serves the project (or `dist/`) at `https://quantis.app.test/` and answers every external
API with a deterministic mock in `tests/mocks.py` (shapes captured from the real providers).
* `tests/smoke.py` — boots, visits every view, 32 formula self-tests, zero page errors.
* `tests/test_v4.py` — search across all kinds, detail pages, option chain, Formula Lab, alerts, custom APIs
  (incl. an XSS payload), line items, every report type and all export formats, PWA, mobile.
* `tests/interact.py`, `tests/interact2.py`, `tests/test_v3.py` — earlier regression suites.
Run against `dist/` too: `python3 tests/smoke.py dist`.
