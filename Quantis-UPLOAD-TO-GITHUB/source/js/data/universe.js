/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/data/universe.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Built-in security list (SECURITIES = priceable, SECURITY_UNIVERSE = searchable identities). Prices here are only seeds and are replaced by live quotes on load.
 * DEPENDS   core/*
 * EXPOSES   SECURITIES, SECURITY_UNIVERSE, makeSampleSecurityEntry (global — classic script, shared scope)
 * LOAD      Classic <script>, order defined in js/manifest.json. Top-level code runs at load,
 *           so it may only call functions from files listed EARLIER in the manifest.
 * NOTE      Migrated verbatim from the single-file build; inline comments marked
 *           "REAL BUG FIXED" / "post-launch fix" document past defects — keep them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* ===================== SAMPLE DATA (Phase 1 placeholder only, not live) ===================== */
const SECURITIES = [
  {t:'AAPL', n:'Apple Inc.', ex:'NASDAQ', ctry:'United States', sector:'Technology',cls:'Equity', px:227.14, chg:2.38, chgPct:1.06, mcap:3480, pe:34.2, roe:147, rsi:58.2, ccy:'USD'},
  {t:'MSFT', n:'Microsoft Corp.', ex:'NASDAQ', ctry:'United States', sector:'Technology',cls:'Equity', px:441.58, chg:-1.92, chgPct:-0.43, mcap:3280, pe:33.1, roe:38.2, rsi:47.6, ccy:'USD'},
  {t:'NVDA', n:'NVIDIA Corp.', ex:'NASDAQ', ctry:'United States', sector:'Semiconductors',cls:'Equity', px:132.77, chg:4.51, chgPct:3.52, mcap:3260, pe:52.4, roe:91.4, rsi:66.9, ccy:'USD'},
  {t:'RELIANCE', n:'Reliance Industries', ex:'NSE', ctry:'India', sector:'Conglomerate',cls:'Equity', px:2984.20, chg:-12.4, chgPct:-0.41, mcap:202, pe:24.6, roe:9.1, rsi:44.2, ccy:'INR'},
  {t:'TCS', n:'Tata Consultancy Services', ex:'NSE', ctry:'India', sector:'IT Services',cls:'Equity', px:4102.85, chg:18.6, chgPct:0.46, mcap:148, pe:29.8, roe:52.3, rsi:55.0, ccy:'INR'},
  {t:'AMZN', n:'Amazon.com Inc.', ex:'NASDAQ', ctry:'United States', sector:'E-Commerce',cls:'Equity', px:198.32, chg:1.05, chgPct:0.53, mcap:2070, pe:41.7, roe:24.6, rsi:52.1, ccy:'USD'},
];

/* ===================== GLOBAL SECURITY UNIVERSE (post-launch fix) =====================
   Root-caused a second real bug alongside the init-cascade one: the search palette only ever
   matched against the 6-item SECURITIES array above, so searching for ANY real ticker outside
   that tiny demo list ("TSLA", "GOOGL", literally almost anything) correctly found nothing —
   from the user's side, indistinguishable from "search is broken." Worse, selectSecurity() used
   `SECURITIES.find(x=>x.t===t) || SECURITIES[0]`, so even a successful click on an unmatched
   ticker silently substituted Apple's header data while every OTHER panel (fundamentals, DCF)
   correctly operated on the ticker you actually picked — a wrong-data bug, not just an empty one.
   Fix: a much larger identity-only lookup table (real, public tickers/names/exchanges/sectors —
   no fabricated price data) that the palette searches against, and selectSecurity() now creates
   a fully consistent sample entry for any recognized ticker instead of ever falling back wrong. */
