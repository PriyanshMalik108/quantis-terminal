/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/data/universe-enrichment.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Builds the equity universe used by Screener/Compare and the research TABS definition.
 * DEPENDS   data/universe.js
 * EXPOSES   TABS, currentSecurity (global — classic script, shared scope)
 * LOAD      Classic <script>, order defined in js/manifest.json. Top-level code runs at load,
 *           so it may only call functions from files listed EARLIER in the manifest.
 * NOTE      Migrated verbatim from the single-file build; inline comments marked
 *           "REAL BUG FIXED" / "post-launch fix" document past defects — keep them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* ===================== UNIVERSE ENRICHMENT (post-launch fix) =====================
   Root-caused a third real bug: Screener and Compare only ever read from SECURITIES, which
   started with just 6 hardcoded tickers — so Screener returned near-nothing and Compare only
   offered 6 chips, no matter how big the searchable SECURITY_UNIVERSE was. selectSecurity()
   only grew SECURITIES by one entry when you personally visited a new ticker via search, so
   Screener/Compare never covered the other ~70+ tickers you hadn't clicked yet — from the
   user's side, indistinguishable from "screener/compare are broken." Fix: every entry in
   SECURITY_UNIVERSE gets the exact same deterministic seeded sample entry at load time that
   selectSecurity() would have generated on click — identical formula, so numbers never change
   between "pre-populated" and "visited via search" versions of the same ticker. Only cls:'Equity'
   entries get fake P/E/ROE/market-cap (those genuinely don't apply to an ETF, future, FX pair,
   or crypto asset — Screener's fundamental filters are equity-only by design, disclosed in the
   asset-class filter UI, not silently wrong). */
function makeSampleSecurityEntry(meta){
  const ccy = currencyFor(meta.ctry);
  let sample = seededPriceFor(meta.t, ccy);
  // FX pairs and crypto were sampling from generic equity-style price ranges via the country's
  // currency (found via testing: EURUSD showed ~240 instead of ~1.05) — real-world-plausible
  // ranges per asset type instead, so the sample number at least looks like the real thing.
  if(meta.cls === 'FX'){
    const seed = meta.t.split('').reduce((a,c)=>a+c.charCodeAt(0)*31,7);
    const rnd = seededRnd(seed);
    const isJpyPair = meta.t.includes('JPY');
    const isInrPair = meta.t.includes('INR');
    const [lo,hi] = isJpyPair ? [100,160] : isInrPair ? [78,90] : [0.6,1.6];
    const px = lo + rnd()*(hi-lo);
    const chgPct = (rnd()-0.5)*1.2;
    sample = {px: Math.round(px*10000)/10000, chgPct: Math.round(chgPct*100)/100, chg: Math.round(px*chgPct/100*10000)/10000};
  }else if(meta.cls === 'Crypto'){
    const seed = meta.t.split('').reduce((a,c)=>a+c.charCodeAt(0)*31,7);
    const rnd = seededRnd(seed);
    const CRYPTO_RANGES = {BTC:[40000,110000], ETH:[1800,5000], SOL:[60,260], BNB:[300,700], XRP:[0.4,2.5], ADA:[0.3,1.2], DOGE:[0.06,0.4], AVAX:[15,60], DOT:[3,12], LTC:[50,150]};
    const [lo,hi] = CRYPTO_RANGES[meta.t] || [1,100];
    const px = lo + rnd()*(hi-lo);
    const chgPct = (rnd()-0.5)*8;
    const rounded = px<10 ? Math.round(px*10000)/10000 : Math.round(px*100)/100;
    sample = {px: rounded, chgPct: Math.round(chgPct*100)/100, chg: Math.round(rounded*chgPct/100*100)/100};
  }else if(meta.cls === 'Index'){
    const seed = meta.t.split('').reduce((a,c)=>a+c.charCodeAt(0)*31,7);
    const rnd = seededRnd(seed);
    const INDEX_RANGES = {SPX:[4800,6200], DJI:[38000,44000], NDX:[16000,21000], RUT:[1900,2400],
      NIFTY50:[22000,26000], SENSEX:[72000,86000], FTSE100:[7500,8500], DAX:[17000,20000],
      CAC40:[7000,8200], NIKKEI225:[32000,42000], HANGSENG:[16000,20000], ASX200:[7400,8400],
      KOSPI:[2400,2900], STOXX50:[4400,5200], VIX:[11,28]};
    const [lo,hi] = INDEX_RANGES[meta.t] || [1000,5000];
    const px = lo + rnd()*(hi-lo);
    const chgPct = (rnd()-0.5)*2.2;
    const rounded = Math.round(px*100)/100;
    sample = {px: rounded, chgPct: Math.round(chgPct*100)/100, chg: Math.round(rounded*chgPct/100*100)/100};
  }
  const base = {t: meta.t, n: meta.n, ex: meta.ex, ctry: meta.ctry, sector: meta.sector, cls: meta.cls || 'Equity', ccy,
    px: sample.px, chg: sample.chg, chgPct: sample.chgPct, rsi: Math.round(30+((sample.px*11)%40))};
  if(base.cls === 'Equity'){
    base.mcap = Math.round(sample.px*10);
    base.pe = Math.round((15+((sample.px*7)%35))*10)/10;
    base.roe = Math.round((5+((sample.px*3)%40))*10)/10;
  }else{
    base.mcap = null; base.pe = null; base.roe = null; // not applicable — Screener treats these as unscreenable-by-fundamentals, not zero
  }
  return base;
}
SECURITY_UNIVERSE.forEach(meta=>{
  if(SECURITIES.some(s=>s.t===meta.t)) return; // the real 6 tickers keep their real, non-sample data
  SECURITIES.push(makeSampleSecurityEntry(meta));
});

/* Removed: a hardcoded SCORES array used to live here and feed the score chips regardless of
   which security was selected. It's replaced by computeScoreChipsFor() below, which derives
   every chip from the actually-selected security. */
const TABS = [
  {id:'overview', label:'Overview'},{id:'fundamentals', label:'Fundamentals'},{id:'analysis', label:'Analysis ✦'},{id:'technicals', label:'Technicals'},
  {id:'valuation', label:'Valuation'},{id:'quant', label:'Quant'},{id:'factors', label:'Factors'},
  {id:'risk', label:'Risk'},{id:'options', label:'Options'},{id:'prediction', label:'Prediction'},
  {id:'news', label:'News / Sentiment'},{id:'report', label:'Report'},
];
let currentSecurity = 'AAPL';
