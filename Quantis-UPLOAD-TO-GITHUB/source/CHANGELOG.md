# Changelog
## 4.1.0 — 2026-11-10
* Search: top search box now queries TradingView's worldwide listings (every exchange incl. BSE-only small caps such as Taparia Tools) alongside CNBC; tolerant matching (Ltd/Limited, punctuation, hyphens), ISIN lookup, no bonds/futures mixed into stock results; securities opened from search are remembered across visits.
* Layout: new css/v5-responsive.css + js/app/layout.js — watchlist and AI assistant become toggleable drawers on laptops/tablets/phones; whole Research page scrolls on phones; score tiles in a tidy grid; two-row phone top bar; More menu as a tile grid; tables scroll inside their card; chart menus stay on-screen; nav rail fits 768 px-tall laptops; grid cards no longer overflow (Portfolio, Options, Report Studio, Data Sources, Tests).
* Fixes: readable quote timestamps; long watchlist tickers no longer overlap prices; drawers close on view change / Esc / outside tap.
## 4.0.0 — 2026-11-10
* Multi-file project with developer notes on every file, docs/, build tool, tests.
* Universal Search across 12 asset kinds; detail pages for bonds/debentures, crypto, futures, options, FX, mutual funds, indices/commodities; live option chains with IV & Greeks.
* Report Studio: 16 report types, 8 themes + custom colours/fonts/page size, logos, KPI tiles, football field, cash bridge, radar, gauge; PDF, Word, PowerPoint, Excel, CSV, Markdown, HTML, JSON, print.
* Formula Lab: ~100 CFA L1–L3 formulas, auto-fill from live company data.
* Exact statement line items + quarterly cash flows (FMP / Alpha Vantage / Finnhub key or server key proxy).
* Peer comparison (Analysis tab + reports); indicator & drawn-line alerts; custom API connectors; source catalogue with live probes.
* PWA: installable, offline app shell, cached market data.
* Security: CSP, SRI, security headers for 4 hosts, key-proxy worker, Firestore rules.
## 3.0.0 — 2026-11-10
* Advanced charts, Financial Analyst tab, AI Lab, company report, ⓘ guides, heatmap.
