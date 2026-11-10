#!/usr/bin/env python3
"""
ONE-TIME MIGRATION SCRIPT (kept for the record — you should not need to run it again).

Quantis was originally a single 1 MB HTML file. This script split it into the folder structure
documented in docs/ARCHITECTURE.md:

    index.html          markup only
    css/*.css           styles
    js/<layer>/*.js     one file per feature, in load order (see js/manifest.json)

How the split works
  * The single <script> block was cut at its own section banners
    ("/* ===================== NAME ===================== */"), which the original authors already
    used to separate features. Each banner → one file. Nothing inside a section was reordered.
  * All files are *classic* scripts (not ES modules) loaded in the original order, so every
    top-level `function`/`const` stays in the shared global scope exactly as before. This kept the
    migration behaviour-preserving: the same test suites pass before and after.
  * Each file gets a developer header (purpose, dependencies, what it exposes) from SECTIONS below.

Usage:  python3 tools/migrate_from_single_file.py <single-file.html> <project-root>
"""
import re, sys, os, json

SRC, ROOT = sys.argv[1], sys.argv[2]
html = open(SRC, encoding='utf-8').read()

# (banner substring, output path, purpose, depends on, exposes)
SECTIONS = [
 ('SAFE STORAGE WRAPPER', 'js/core/storage.js', 'localStorage wrapper that never throws (private mode, quota, sandboxed iframes) + in-memory/TTL cache primitives used by every data fetch.', 'nothing', 'safeStorage, MEM_CACHE helpers'),
 ('TOASTS + IN-APP PROMPT', 'js/core/feedback.js', 'Toast notifications and the in-app text prompt (askText) that replaces window.prompt.', 'core/storage.js', 'toast(msg,type), askText(title,hint,placeholder,validate)'),
 ('SAMPLE DATA (Phase 1', 'js/data/universe.js', 'Built-in security list (SECURITIES = priceable, SECURITY_UNIVERSE = searchable identities). Prices here are only seeds and are replaced by live quotes on load.', 'core/*', 'SECURITIES, SECURITY_UNIVERSE, makeSampleSecurityEntry'),
 ('COMPANY LOGOS', 'js/ui/logos.js', 'Company logo rendering (TradingView logo CDN with a lettered fallback).', 'data/universe.js', 'logoHtmlFor(ticker,size)'),
 ('KEYLESS LIVE DATA LAYER', 'js/data/live-data.js', 'LD — the keyless live-data layer: CNBC quotes & bars, TradingView scanner (fundamentals, peers, screening), CNBC search & news, BLS, DBnomics. All endpoints are CORS-open and need no key.', 'core/*', 'LD.{quote,quotes,bars,tvScan,fundamentals,sectorPeers,searchLive,news,...}'),
 ('CURRENCY SYSTEM', 'js/core/currency.js', 'Currency metadata and price formatting (symbols, decimals, GBp/GBX pence handling).', 'core/*', 'CURRENCY_META, fmtPrice(value,ccy)'),
 ('UNIVERSE ENRICHMENT', 'js/data/universe-enrichment.js', 'Builds the equity universe used by Screener/Compare and the research TABS definition.', 'data/universe.js', 'TABS, currentSecurity'),
 ('WATCHLIST & WORKSPACES', 'js/features/watchlist.js', 'Named watchlists ("workspaces") persisted to localStorage.', 'core/storage.js', 'activeWatchlist(), renderWorkspaceTabs()'),
 ('DEFENSIVE INFRASTRUCTURE', 'js/core/defensive.js', 'Global error handlers and runInit() — every init step is isolated so one failure cannot blank the app.', 'core/feedback.js', 'runInit(name, fn)'),
 ('HELPERS', 'js/core/helpers.js', 'Small HTML builders and escaping. escapeHtml is the single XSS choke point — use it for any text that came from an API or the user.', 'nothing', 'cssVar, kv, table, escapeHtml'),
 ('FINANCIAL FORMULA ENGINE', 'js/engines/formula-engine.js', 'Core quantitative formulas (returns, volatility, indicators, DCF, Black-Scholes, VaR...).', 'core/helpers.js', 'FE.* formula functions'),
 ('FORMULA TEST SUITE', 'js/engines/formula-tests.js', 'Known-answer tests for the formula engine (Tests view).', 'engines/formula-engine.js', 'runFormulaTests()'),
 ('FORECASTING ENGINE', 'js/engines/forecasting.js', 'Statistical ensemble forecast for the Prediction tab.', 'engines/formula-engine.js', 'runForecast()'),
 ('SHARED APP STATE', 'js/core/app-state.js', 'AppState — the computed results other features (AI, reports) read from.', 'nothing', 'AppState'),
 ('PORTFOLIO, RISK & OPTIONS ENGINE', 'js/engines/portfolio-risk-options.js', 'Portfolio maths, risk metrics and Black-Scholes/Greeks engine.', 'engines/formula-engine.js', 'risk/options engine functions'),
 ('NAV / VIEW SWITCHING', 'js/app/navigation.js', 'goto(view) — switches views and triggers each view\'s lazy render. Add new views here.', 'everything it calls is resolved at call time', 'goto(view)'),
 ('DASHBOARD', 'js/features/dashboard.js', 'Home dashboard: indices, breadth, regime, sectors, movers, AI market summary.', 'data/live-data.js', 'renderDashboard(), refreshDashWatch()'),
 ('RESEARCH: watchlist / header / tabs', 'js/features/research.js', 'Research workspace: watchlist, security header, tab bar and panel templates.', 'data/*, engines/*', 'renderWatchlist, renderTabs, renderPanels, selectSecurity'),
 ('CHART CONTROLS (real implementation', 'js/features/research-chart-legacy.js', 'Original Chart.js price chart + technicals computation. The visible chart is now modules/charts.js; this file still computes technicals and feeds currentPriceSeries.', 'engines/formula-engine.js', 'renderPriceChartCanvas, computeAndRenderTechnicals'),
 ('RISK ENGINE (Phase 5', 'js/engines/risk.js', 'Risk tab: VaR, CVaR, drawdown, Sharpe/Sortino, GARCH.', 'engines/*', 'computeAndRenderRisk'),
 ('QUANT TAB', 'js/features/quant-tab.js', 'Quant tab: return statistics, seasonality, Monte Carlo.', 'engines/*', 'renderQuant'),
 ('WORLD BANK OPEN DATA', 'js/data/public-sources.js', 'World Bank, CFTC, OpenFIGI, Finnhub recommendation trends, sanctions lists.', 'core/*', 'fetchWorldBank..., fetchCftc..., openFigiSearch...'),
 ('MACRO DASHBOARD', 'js/features/macro.js', 'Macro view.', 'data/*', 'renderMacroDashboard'),
 ('FACTORS TAB', 'js/features/factors-tab.js', 'Factor loadings tab.', 'engines/*', 'renderFactors'),
 ('NEWS TAB', 'js/features/news-tab.js', 'News & sentiment tab.', 'data/live-data.js', 'computeAndRenderNews'),
 ('CACHE LAYER (spec section 43)', 'js/core/cache.js', 'cachedFetch(key, ttl, fn) — memory + localStorage cache used by all providers.', 'core/storage.js', 'cachedFetch, fetchWithTimeout'),
 ('SHARED CORS-PROXY ATTEMPT CHAIN', 'js/data/proxy-chain.js', 'Optional user-configured CORS proxy (Settings) for sources that block browsers.', 'core/*', 'getCustomProxy, proxiedFetch'),
 ('CoinGecko (crypto) + Frankfurter', 'js/data/crypto-fx.js', 'CoinGecko crypto and ECB/Frankfurter FX history.', 'core/*', 'fetchCoinGeckoHistory, fetchFrankfurterHistory, COINGECKO_ID'),
 ('YAHOO FINANCE CHART API', 'js/data/price-history.js', 'Daily price history (name kept for compatibility; data now comes from CNBC via LD.bars).', 'data/live-data.js', 'fetchYahooHistory, yahooSymbolFor'),
 ('GLOBAL MARKET MOVERS', 'js/features/market-movers.js', 'Live batch quotes for movers.', 'data/live-data.js', ''),
 ('YAHOO FINANCE QUOTESUMMARY', 'js/data/fundamentals-yahoo.js', 'Legacy Yahoo fundamentals path (only used with a user CORS proxy).', 'data/proxy-chain.js', 'fetchYahooFundamentals'),
 ('GLOBAL LIVE SEARCH', 'js/data/global-search.js', 'CNBC symbol lookup used by the command palette.', 'data/live-data.js', ''),
 ('AMFI INDIA MUTUAL FUNDS', 'js/data/amfi-funds.js', 'Indian mutual funds (Kuvera list + mfapi.in NAV history).', 'core/*', 'fetchIndianMfNav'),
 ('BACKTEST ENGINE', 'js/features/backtest.js', 'Strategy backtester.', 'engines/*', 'runBacktestEngine'),
 ('OPTIONS STRATEGY BUILDER', 'js/features/options-strategy.js', 'Options view and multi-leg strategy builder.', 'engines/portfolio-risk-options.js', 'runBlackScholes, runStrategyBuilder'),
 ('FUNDAMENTALS PANEL', 'js/features/fundamentals-panel.js', 'Fundamentals tab rendering.', 'data/fundamentals-live.js', ''),
 ('LIVE FUNDAMENTALS (TradingView + CNBC', 'js/data/fundamentals-live.js', 'fetchLiveFundamentals / refreshFundamentals — key stats, statements, analyst data.', 'data/live-data.js', 'LIVE_FUNDAMENTALS, fetchLiveFundamentals, refreshFundamentals'),
 ('AI RESEARCH ASSISTANT', 'js/features/ai-assistant.js', 'Right-rail assistant. Grounded answers first; open questions go to modules/ai.js (free AI).', 'modules/ai.js (at call time)', 'sendAi, llmAnswer, groundedAnswer'),
 ('SCREENER =', 'js/features/screener.js', 'Screener + saved screens.', 'data/live-data.js', 'runScreen'),
 ('COMPARE =', 'js/features/compare.js', 'Comparison engine.', 'data/*', 'renderCompare'),
 ('PORTFOLIO (Phase 5)', 'js/features/portfolio.js', 'Editable portfolio, optimisation, stress testing.', 'engines/*', 'renderPortfolio'),
 ('ALERTS (post-launch fix)', 'js/features/alerts.js', 'Price alert engine (indicator & drawing alerts live in modules/alerts-pro.js).', 'data/live-data.js', 'renderAlerts, pollAlertsLive'),
 ('REPORTS =', 'js/features/reports-legacy.js', 'Original markdown report (superseded by modules/reports/*). Kept because the Export Center reuses buildReportMarkdown.', 'core/app-state.js', 'buildReportMarkdown'),
 ('EXPORT CENTER', 'js/features/export-center.js', 'Export Center + downloadBlob() used by every exporter.', 'core/*', 'downloadBlob'),
 ('DOCS =', 'js/features/docs.js', 'Methodology view.', '', 'renderDocs'),
 ('COMMAND PALETTE', 'js/features/command-palette.js', 'Ctrl+K palette and asset-class search filter.', 'data/*', ''),
 ('MOBILE NAVIGATION', 'js/app/mobile-nav.js', 'Bottom navigation + More sheet on phones.', '', 'toggleMoreSheet'),
 ('SETTINGS (user-supplied API keys', 'js/features/settings-cloud-sync.js', 'Settings (API keys) and optional Firebase cloud sync. Keys live in the user\'s browser only.', 'core/storage.js', 'saveSettings, getKey, cloudSyncPush'),
 ('LIVE MARKET PULSE', 'js/features/market-pulse.js', 'Live market pulse strip.', 'data/*', 'fetchLivePulse'),
 ('DATA SOURCES VIEW', 'js/features/data-sources-view.js', 'Data Sources view (provider status).', 'data/*', 'refreshSourceStatus'),
 ('THEME (post-launch fix)', 'js/app/theme.js', 'Dark/light theme palettes.', '', 'applyTheme'),
 ('INIT =', 'js/app/init.js', 'Application start-up: every step wrapped in runInit so failures are isolated. Runs LAST.', 'everything', ''),
]

m = re.search(r'<script>\n(.*?)\n</script>\s*</body>', html, re.S)
script = m.group(1)
cut = script.index('/* =====================================================================================\n   QUANTIS ADVANCED CHARTS')
legacy, modules_and_init = script[:cut], script[cut:]
extra_init = modules_and_init[modules_and_init.index("runInit('AI settings block'"):]

# locate banners in order
pos = []
for key, path, *_ in SECTIONS:
    i = legacy.find('/* ===================== ' + key)
    if i < 0: sys.exit('banner not found: ' + key)
    pos.append(i)
assert pos == sorted(pos), 'banners out of order'
pre = legacy[:pos[0]]  # anything before the first banner goes to the storage file
files = {}
for k, (sec, p) in enumerate(zip(SECTIONS, pos)):
    end = pos[k+1] if k+1 < len(pos) else len(legacy)
    body = legacy[p:end]
    if k == 0: body = pre + body
    key, path, purpose, deps, exposes = sec
    if path in files: files[path][1] += body; continue
    files[path] = [sec, body]
order = []
for path, (sec, body) in files.items():
    key, path, purpose, deps, exposes = sec
    if path == 'js/app/init.js': body = body.rstrip() + '\n\n/* ---- v3/v4 module start-up (modules are loaded before this file) ---- */\n' + extra_init
    head = f"""/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · {path}
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   {purpose}
 * DEPENDS   {deps or '—'}
 * EXPOSES   {exposes or '—'} (global — classic script, shared scope)
 * LOAD      Classic <script>, order defined in js/manifest.json. Top-level code runs at load,
 *           so it may only call functions from files listed EARLIER in the manifest.
 * NOTE      Migrated verbatim from the single-file build; inline comments marked
 *           "REAL BUG FIXED" / "post-launch fix" document past defects — keep them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
"""
    full = os.path.join(ROOT, path); os.makedirs(os.path.dirname(full), exist_ok=True)
    open(full, 'w', encoding='utf-8').write(head + body.strip('\n') + '\n')
    order.append(path)

# CSS
style = re.search(r'<style>\n(.*?)\n</style>', html, re.S).group(1)
v3 = style.index('/* ===================== QUANTIS v3')
ext = style.index('/* ---------- analysis tab ----------')
os.makedirs(os.path.join(ROOT, 'css'), exist_ok=True)
for name, txt, note in [('base.css', style[:v3], 'Original design system: tokens (:root vars), layout, components.'),
                        ('v3-typography-motion.css', style[v3:ext], 'Typography (Inter/JetBrains Mono), motion, skeletons, advanced chart widget.'),
                        ('modules.css', style[ext:], 'Analysis tab, AI Lab, reports, ⓘ guide drawer, heatmap.')]:
    open(os.path.join(ROOT, 'css', name), 'w', encoding='utf-8').write(f'/* Quantis · css/{name} — {note}\n   Colours come from the :root tokens in base.css (dark) and THEME_LIGHT in js/app/theme.js. */\n' + txt.strip() + '\n')

json.dump({'note': 'Load order of classic scripts. index.html and tools/build.mjs both read this file.', 'files': order}, open(os.path.join(ROOT, 'js/manifest.json'), 'w'), indent=1)
# markup
head = html[:html.index('<style>')]
body = html[html.index('</style>')+len('</style>'):m.start()]
open(os.path.join(ROOT, '_markup_head.html'), 'w').write(head)
open(os.path.join(ROOT, '_markup_body.html'), 'w').write(body)
print('wrote', len(order), 'js files')
