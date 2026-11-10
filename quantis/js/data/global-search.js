/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/data/global-search.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   CNBC symbol lookup used by the command palette.
 * DEPENDS   data/live-data.js
 * EXPOSES   — (global — classic script, shared scope)
 * LOAD      Classic <script>, order defined in js/manifest.json. Top-level code runs at load,
 *           so it may only call functions from files listed EARLIER in the manifest.
 * NOTE      Migrated verbatim from the single-file build; inline comments marked
 *           "REAL BUG FIXED" / "post-launch fix" document past defects — keep them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* ===================== GLOBAL LIVE SEARCH (post-launch fix) =====================
   Root-caused the deeper version of the "asset classes not found" report: no matter how many
   tickers get hand-curated into SECURITY_UNIVERSE, a fixed list can never be "every ETF in
   China, every mutual fund in Europe, every bond ETF in the US, on any exchange" — that's not
   a data-entry problem, it's an architecture problem. The real fix is Yahoo Finance's public
   search endpoint (the same one that powers Yahoo Finance's own search box), which indexes
   essentially every listed security worldwide across every asset type Yahoo covers — not a
   curated few hundred. This runs through the same proxy chain as everything else, same
   never-fabricate/always-disclose rule, and the curated SECURITY_UNIVERSE list stays as the
   *instant, no-network-round-trip* first result while this fills in behind it. */
const YAHOO_QUOTETYPE_TO_CLASS = {
  EQUITY:'Equity', ETF:'ETF', MUTUALFUND:'Mutual Fund', FUTURE:'Derivative',
  CRYPTOCURRENCY:'Crypto', CURRENCY:'FX', INDEX:'Index',
};
// Yahoo's search response gives an exchange *code* (e.g. "NSI","SHH","LSE") and a display name
// (e.g. "NSE","Shanghai","London") but not a clean country — this maps the common display names
// so results still show a real country, matching how the curated universe is presented.
const YAHOO_EXCH_TO_COUNTRY = {
  'NASDAQ':'United States','NYSE':'United States','NYSE Arca':'United States','NYSEArca':'United States','AMEX':'United States','Chicago':'United States','CBOT':'United States','CME':'United States','NYMEX':'United States','COMEX':'United States','PNK':'United States','OTC Markets':'United States',
  'NSE':'India','BSE':'India',
  'LSE':'United Kingdom','London':'United Kingdom',
  'XETRA':'Germany','Frankfurt':'Germany','Stuttgart':'Germany',
  'Paris':'France','Amsterdam':'Netherlands','Brussels':'Belgium',
  'SIX':'Switzerland','Swiss':'Switzerland',
  'Tokyo':'Japan','JPX':'Japan',
  'KRX':'South Korea','KSE':'South Korea',
  'HKSE':'China','Hong Kong':'China','Shanghai':'China','Shenzhen':'China','SSE':'China','SZSE':'China',
  'Taiwan':'Taiwan','TAI':'Taiwan',
  'ASX':'Australia',
  'Toronto':'Canada','TSX':'Canada','TSXV':'Canada',
  'Milan':'Italy','Madrid':'Spain','Lisbon':'Portugal',
  'Stockholm':'Sweden','Oslo':'Norway','Copenhagen':'Denmark','Helsinki':'Finland',
  'Singapore':'Singapore','SGX':'Singapore',
  'NSE (India)':'India','BSE (India)':'India',
  'CCC':'Global', // crypto pseudo-exchange
};
/* Worldwide search: CNBC's symbol lookup (keyless, CORS-open) — stocks, ETFs, funds, indices
   across US, India, Europe, Japan, Hong Kong, Korea, Australia, Canada and more. Yahoo's search
   API (used before) blocks browser requests. */
const CNBC_EXCHANGE_TO_TV = {'NASDAQ':'NASDAQ','NYSE':'NYSE','NYSE Arca':'AMEX','NYSE American':'AMEX','Cboe BZX':'CBOE','National Stock Exchange of India':'NSE','Bombay Stock Exchange':'BSE',
  'London Stock Exchange':'LSE','XETRA':'XETR','Tokyo Stock Exchange':'TSE','Hong Kong Stock Exchange':'HKEX','Swiss Exchange':'SIX','Korea Exchange':'KRX','Australian Securities Exchange':'ASX',
  'Toronto Stock Exchange':'TSX','Euronext Paris':'EURONEXT','Euronext Amsterdam':'EURONEXT'};
const CNBC_TYPE_TO_CLASS = {STOCK:'Equity', ETF:'ETF', FUND:'Mutual Fund', MUTUALFUND:'Mutual Fund', INDEX:'Index', CURRENCY:'FX', FOREX:'FX', CRYPTO:'Crypto', FUTURE:'Derivative', BOND:'Bond'};
const CNBC_COUNTRY = {US:'United States', IN:'India', GB:'United Kingdom', DE:'Germany', FR:'France', NL:'Netherlands', CH:'Switzerland', JP:'Japan', HK:'Hong Kong', KR:'South Korea', AU:'Australia', CA:'Canada', CN:'China', TW:'Taiwan', SG:'Singapore', BR:'Brazil', IT:'Italy', ES:'Spain', SE:'Sweden'};
async function searchYahooGlobalLive(query){
  const raw = await LD.searchLive(query);
  return raw.filter(r=>CNBC_TYPE_TO_CLASS[String(r.type).toUpperCase()] && !/-FF$|^0[A-Z0-9]{3}-GB$/.test(r.cnbc)) // skip Frankfurt/LSE-IOB duplicate lines
    .map(r=>{
      const base = r.cnbc.replace(/(\.T)?-[A-Z]{2}$/,'').replace(/^\./,'');
      const tvEx = CNBC_EXCHANGE_TO_TV[r.exchange];
      const ctry = CNBC_COUNTRY[r.country] || r.country || 'Global';
      return {t: base, n: r.name, ex: r.exchange || 'Unknown', ctry, sector: CNBC_TYPE_TO_CLASS[String(r.type).toUpperCase()], cls: CNBC_TYPE_TO_CLASS[String(r.type).toUpperCase()],
        _cnbc: r.cnbc, _tv: tvEx ? tvEx+':'+base : null, _liveOnly: true, _via: 'CNBC'};
    });
}
// Adds a live-search result into the app's normal universe so selectSecurity()/Compare/Portfolio/
// Screener all treat it exactly like a curated ticker from here on.
function admitGlobalSearchResult(r){
  // a search hit can share a bare ticker with a different listing already in the universe
  const clash = SECURITY_UNIVERSE.find(x=>x.t===r.t);
  if(clash && LD.cnbcSymbol(clash.t) === r._cnbc) { r.t = clash.t; return; }
  if(clash) r.t = r.t + '.' + (r._cnbc.split('-').pop() || 'X');
  if(SECURITY_UNIVERSE.some(x=>x.t===r.t)) return;
  const meta = {t:r.t, n:r.n, ex:r.ex, ctry:r.ctry, sector:r.sector, cls:r.cls, _cnbc:r._cnbc, _tv:r._tv};
  SECURITY_UNIVERSE.push(meta);
  if(!SECURITIES.some(s=>s.t===r.t)){ const e = makeSampleSecurityEntry(meta); e._cnbc = r._cnbc; e._tv = r._tv; e.px = 0; SECURITIES.push(e); }
}
