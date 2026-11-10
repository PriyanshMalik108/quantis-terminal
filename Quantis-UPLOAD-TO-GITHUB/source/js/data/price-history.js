/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/data/price-history.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Daily price history (name kept for compatibility; data now comes from CNBC via LD.bars).
 * DEPENDS   data/live-data.js
 * EXPOSES   fetchYahooHistory, yahooSymbolFor (global — classic script, shared scope)
 * LOAD      Classic <script>, order defined in js/manifest.json. Top-level code runs at load,
 *           so it may only call functions from files listed EARLIER in the manifest.
 * NOTE      Migrated verbatim from the single-file build; inline comments marked
 *           "REAL BUG FIXED" / "post-launch fix" document past defects — keep them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* ===================== YAHOO FINANCE CHART API (post-launch fix) =====================
   Root-caused the real reason every non-US security (Indian NSE/BSE names most of all)
   was permanently stuck on SAMPLE data: Stooq — the only equity provider wired above at the
   time — simply does not carry Indian, UK, European, Japanese, Korean, Hong Kong or Australian
   listings (confirmed against Stooq's own published exchange coverage), so nothing outside
   the 4 US tickers could ever go live no matter what. query1.finance.yahoo.com's public
   "chart" endpoint is free, keyless, and covers essentially every exchange below —
   critically, it reports the security's OWN trading currency (meta.currency) instead of
   guessing from country, so a price is only ever shown in whatever currency it actually
   trades in. Like SEC EDGAR, Yahoo does not grant browser CORS, so it reuses the exact same
   proxy chain and the exact same "disclose on failure, never fabricate" rule. (Originally
   additive alongside Stooq for the 4 US tickers Stooq covered — Stooq has since started
   requiring an API key and was removed entirely, so Yahoo is now the sole live equity source
   everywhere, US included.) */
const YAHOO_EXCHANGE_SUFFIX = {
  'NASDAQ':'', 'NYSE':'', 'NYSE Arca':'', 'Mutual Fund':'', // Yahoo carries mutual fund NAV tickers with no suffix
  'NSE':'.NS', 'BSE':'.BO',
  'LSE':'.L', 'XETRA':'.DE', 'Euronext Paris':'.PA', 'Euronext Amsterdam':'.AS', 'SIX':'.SW',
  'TSE':'.T', 'KRX':'.KS', 'HKEX':'.HK', 'ASX':'.AX',
};
// Tickers where plain "ticker+exchange suffix" isn't Yahoo's actual symbol — mainly futures
// (root symbol + "=F", not a dotted exchange suffix) and crypto (root + "-USD").
const YAHOO_SYMBOL_OVERRIDE = {
  'BRK.B':'BRK-B',
  '0700':'0700.HK', '9988':'9988.HK', 'TCEHY':'TCEHY',
  'GOLD':'GC=F', 'SILVER':'SI=F', 'WTI':'CL=F', 'BRENT':'BZ=F',
  'BTC':'BTC-USD', 'ETH':'ETH-USD', 'SOL':'SOL-USD', 'XRP':'XRP-USD', 'ADA':'ADA-USD',
  'DOGE':'DOGE-USD', 'BNB':'BNB-USD', 'AVAX':'AVAX-USD', 'DOT':'DOT-USD', 'LTC':'LTC-USD',
  'EURUSD':'EURUSD=X', 'USDINR':'USDINR=X', 'GBPUSD':'GBPUSD=X',
  'ES':'ES=F', 'NQ':'NQ=F', 'YM':'YM=F', 'RTY':'RTY=F', 'ZC':'ZC=F', 'ZW':'ZW=F', 'ZS':'ZS=F',
  'NG':'NG=F', 'HG':'HG=F', 'ZB':'ZB=F',
  'SPX':'^GSPC', 'DJI':'^DJI', 'NDX':'^NDX', 'RUT':'^RUT', 'NIFTY50':'^NSEI', 'SENSEX':'^BSESN',
  'FTSE100':'^FTSE', 'DAX':'^GDAXI', 'CAC40':'^FCHI', 'NIKKEI225':'^N225', 'HANGSENG':'^HSI',
  'ASX200':'^AXJO', 'KOSPI':'^KS11', 'STOXX50':'^STOXX50E', 'VIX':'^VIX',
};
function yahooSymbolFor(ticker){
  if(YAHOO_SYMBOL_OVERRIDE[ticker]) return YAHOO_SYMBOL_OVERRIDE[ticker];
  const meta = SECURITIES.find(x=>x.t===ticker) || SECURITY_UNIVERSE.find(x=>x.t===ticker);
  if(!meta) return null;
  const suffix = YAHOO_EXCHANGE_SUFFIX[meta.ex];
  if(suffix === undefined) return LD.cnbcSymbol(ticker) ? ticker : null; // callers only need "is this priceable"
  return ticker + suffix;
}
