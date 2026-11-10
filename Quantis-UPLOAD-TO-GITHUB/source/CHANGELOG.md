# Changelog
## 5.0.0 — 2026-11-10
* Home rebuilt: every card configurable (show/hide, width, order); World Indices (93 indices, 68 countries, country labels, add/remove, any-index search, 1D–1Y, sorting); breadth/sectors/movers/heatmap for 67 markets + Global; regime for 10 indices; Market Hours for 40 exchanges with countdowns, your-time sessions, lunch breaks, Sun–Thu weeks and holidays; Live Market Pulse with 27 selectable instruments; converter with 160+ currencies, swap and quick pairs; watchlist add from Home.
* Search everywhere: one picker (any exchange, index, ETF, crypto, FX, commodity, ISIN) in Compare, Correlation, Watchlist, AI Lab, Home.
* Compare: worldwide add, remove chips, 7 extra metrics, best-in-row highlighting, rebased performance chart (1M–5Y).
* Correlation rebuilt: basket add/remove + presets, period/frequency/method/returns/order, date-aligned returns (fixes misaligned days), click-through pair detail with rolling correlation, beta and R², insights, CSV.
* Macro: any of 217 economies — 16 World Bank indicators with sparklines, country markets strip (index, 10Y yield, FX), multi-country comparison chart and CSV.
* Screener rebuilt: 16 min/max metrics, all countries, exchange filter, presets, sort by any column, paging, CSV; fixes duplicated ETF cross-listings.
* Charts: touch lock (no accidental zoom/stretch while scrolling), stable chart height on phones, settings menu (grid, price line, watermark, candle colours, spacing, auto-refresh, reset), indicator templates (save/apply + built-ins), SVG toolbar icons.
* AI Lab: handles the free tier's rate limit with a visible countdown and automatic retry; premium tool cards; step-by-step manual and examples per tool; compare any two companies.
* Google sign-in ready: owner fills site-config.js once; all user settings sync to their private Firestore record; CSP updated for Google sign-in.
* Accuracy: fiscal years labelled by year-end (Reliance FY ending Mar 2026 = FY2026); 52-week range from intraday highs/lows; beta labelled 5Y.
* Premium interaction layer: gold buttons with pointer-following sheen, cursor spotlight on cards and tiles, refined segmented controls, smooth entrance motion (respects reduce-motion).
* Richer ⓘ guides: numbered steps, every control explained, pro tips, data sources.
* Removed all external curriculum references; Formula Lab depth levels are Foundation / Intermediate / Advanced.
## 4.1.0 — 2026-11-10
* Search: top search box now queries TradingView's worldwide listings (every exchange incl. BSE-only small caps such as Taparia Tools) alongside CNBC; tolerant matching (Ltd/Limited, punctuation, hyphens), ISIN lookup, no bonds/futures mixed into stock results; securities opened from search are remembered across visits.
* Layout: new css/v5-responsive.css + js/app/layout.js — watchlist and AI assistant become toggleable drawers on laptops/tablets/phones; whole Research page scrolls on phones; score tiles in a tidy grid; two-row phone top bar; More menu as a tile grid; tables scroll inside their card; chart menus stay on-screen; nav rail fits 768 px-tall laptops; grid cards no longer overflow (Portfolio, Options, Report Studio, Data Sources, Tests).
* Fixes: readable quote timestamps; long watchlist tickers no longer overlap prices; drawers close on view change / Esc / outside tap.
## 4.0.0 — 2026-11-10
* Multi-file project with developer notes on every file, docs/, build tool, tests.
* Universal Search across 12 asset kinds; detail pages for bonds/debentures, crypto, futures, options, FX, mutual funds, indices/commodities; live option chains with IV & Greeks.
* Report Studio: 16 report types, 8 themes + custom colours/fonts/page size, logos, KPI tiles, football field, cash bridge, radar, gauge; PDF, Word, PowerPoint, Excel, CSV, Markdown, HTML, JSON, print.
* Formula Lab: 110+ professional finance formulas, auto-fill from live company data.
* Exact statement line items + quarterly cash flows (FMP / Alpha Vantage / Finnhub key or server key proxy).
* Peer comparison (Analysis tab + reports); indicator & drawn-line alerts; custom API connectors; source catalogue with live probes.
* PWA: installable, offline app shell, cached market data.
* Security: CSP, SRI, security headers for 4 hosts, key-proxy worker, Firestore rules.
## 3.0.0 — 2026-11-10
* Advanced charts, Financial Analyst tab, AI Lab, company report, ⓘ guides, heatmap.
