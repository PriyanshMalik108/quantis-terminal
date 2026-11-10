/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/features/data-sources-view.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Data Sources view (provider status).
 * DEPENDS   data/*
 * EXPOSES   refreshSourceStatus (global — classic script, shared scope)
 * LOAD      Classic <script>, order defined in js/manifest.json. Top-level code runs at load,
 *           so it may only call functions from files listed EARLIER in the manifest.
 * NOTE      Migrated verbatim from the single-file build; inline comments marked
 *           "REAL BUG FIXED" / "post-launch fix" document past defects — keep them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* ===================== DATA SOURCES VIEW ===================== */
const PROVIDERS = [
  {name:'CNBC quote service', kind:'Live quotes, EPS, market cap, 52-week range for stocks, ETFs, indices, futures, FX, crypto, yields', key:false, cors:'Open — direct from the browser', test: async ()=>{ const q = await LD.quote('AAPL'); if(!q) throw new Error('no quote'); }},
  {name:'CNBC price history', kind:'Up to 10 years of daily OHLC bars', key:false, cors:'Open — direct', test: async ()=>{ await LD.bars('AAPL', 1); }},
  {name:'TradingView scanner', kind:'Fundamentals, statements, analyst consensus, earnings/dividend dates, screener, sector peers, ISIN search, logos', key:false, cors:'Open — direct', test: async ()=>{ const r = await LD.tvScan('america', {symbols:{tickers:['NASDAQ:AAPL']}, columns:['close']}); if(!r.rows.length) throw new Error('no rows'); }},
  {name:'CNBC news search', kind:'Company and market headlines', key:false, cors:'Open — direct', test: async ()=>{ await LD.news('markets'); }},
  {name:'U.S. Bureau of Labor Statistics', kind:'CPI, unemployment', key:false, cors:'Open — direct', test: async ()=>{ await LD.bls('LNS14000000'); }},
  {name:'DBnomics (BEA, Federal Reserve)', kind:'GDP growth, Fed funds rate', key:false, cors:'Open — direct', test: async ()=>{ await LD.dbnomics('FED/H15/RIFSPFF_N.B'); }},
  {name:'Frankfurter / ECB', kind:'FX rates and history', key:false, cors:'Open — direct', test: async ()=>{ const r=await fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR'); if(!r.ok) throw new Error('HTTP '+r.status); }},
  {name:'CoinGecko', kind:'Crypto prices, market cap, supply', key:false, cors:'Open (rate-limited)', test: async ()=>{ const r=await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd'); if(!r.ok) throw new Error('HTTP '+r.status); }},
  {name:'World Bank Open Data', kind:'Country macro indicators (190+ countries)', key:false, cors:'Open — direct', test: async ()=>{ await fetchWorldBankIndicatorLive('US', 'NY.GDP.MKTP.KD.ZG'); }},
  {name:'CFTC Commitments of Traders', kind:'Futures positioning', key:false, cors:'Open — direct', test: async ()=>{ await fetchCftcCotLive(CFTC_MARKETS[0].code); }},
  {name:'Kuvera + AMFI NAV archive', kind:'Indian mutual fund directory and full NAV history', key:false, cors:'Open — direct', test: async ()=>{ const r = await fetchWithTimeout('https://mf.captnemo.in/nav/INF879O01027', {mode:'cors'}, 15000); if(!r.ok) throw new Error('HTTP '+r.status); }},
  {name:'Wikipedia', kind:'Company profiles', key:false, cors:'Open — direct', test: async ()=>{ const r=await fetch('https://en.wikipedia.org/api/rest_v1/page/summary/Apple_Inc.'); if(!r.ok) throw new Error('HTTP '+r.status); }},
  {name:'Nager.Date', kind:'Public holidays for market hours', key:false, cors:'Open — direct', test: async ()=>{ const r=await fetch('https://date.nager.at/api/v3/PublicHolidays/'+new Date().getFullYear()+'/US'); if(!r.ok) throw new Error('HTTP '+r.status); }},
  {name:'Alternative.me', kind:'Crypto Fear & Greed index', key:false, cors:'Open — direct', test: async ()=>{ const r=await fetch('https://api.alternative.me/fng/?limit=1'); if(!r.ok) throw new Error('HTTP '+r.status); }},
  {name:'Finnhub', kind:'Insider transactions, monthly analyst-rating history (US)', key:true, cors:'Open — direct', test: async ()=>{ const k=getKey('finnhub'); if(!k) throw new Error('optional free key not set'); const r=await fetch('https://finnhub.io/api/v1/stock/recommendation?symbol=AAPL&token='+encodeURIComponent(k)); if(!r.ok) throw new Error('HTTP '+r.status); }},
  {name:'Trade.gov Consolidated Screening List', kind:'Sanctions / export-control name screening', key:true, cors:'Open — direct', test: async ()=>{ const k=getKey('csl'); if(!k) throw new Error('free key not set — needed only for sanctions screening'); const r = await fetch('https://data.trade.gov/consolidated_screening_list/v1/search?name=test&subscription-key='+encodeURIComponent(k)); if(!r.ok) throw new Error('HTTP '+r.status); }},
  {name:'Financial Modeling Prep', kind:'Alternative fundamentals source', key:true, cors:'Open — direct', test: async ()=>{ const k=getKey('fmp'); if(!k) throw new Error('optional key not set'); await fetchFmpFundamentalsLive('AAPL', k); }},
  {name:'Yahoo Finance / SEC EDGAR / FRED', kind:'Optional extra sources', key:false, cors:'Block browser requests — used only through your own proxy (Settings)', test: null},
];

async function refreshSourceStatus(){
  const rows = [];
  for(const p of PROVIDERS){
    let status = 'Requires key / proxy — not tested here';
    if(p.test){
      try{ await p.test(); status = '<span style="color:var(--up)">✓ Reachable now</span>'; }
      catch(e){ status = /key not set/.test(e.message) ? `<span style="color:var(--text-2)">○ ${escapeHtml(e.message.replace(/^optional /,'Optional — '))}</span>` : `<span style="color:var(--down)">✗ Unreachable (${escapeHtml(e.message)})</span>`; }
    }
    rows.push([p.name, p.kind, p.key?'Yes (user-supplied)':'No', p.cors, status]);
  }
  document.getElementById('providerTable').innerHTML = table(['Provider','Data','Key?','CORS','Live Status'], rows);
  refreshCacheInfo();
}
function refreshCacheInfo(){
  let cacheItems=[], keyItems=[];
  try{
    for(let i=0;i<safeStorage.length;i++){
      const k=safeStorage.key(i);
      if(!k) continue;
      if(k.startsWith('quantis_cache_')){
        try{ const v = JSON.parse(safeStorage.getItem(k)); cacheItems.push(`${k.replace('quantis_cache_','')} (via ${v.source||'?'}, cached ${new Date(v.ts).toLocaleTimeString()})`); }
        catch(e){ cacheItems.push(k); }
      } else if(k.startsWith('quantis_key_')){
        const v = safeStorage.getItem(k);
        if(v) keyItems.push(k.replace('quantis_key_',''));
      }
    }
  }catch(e){}
  document.getElementById('cacheInfo').innerHTML =
    (cacheItems.length ? `<b>Live data cache (${cacheItems.length}):</b><br>${cacheItems.join('<br>')}` : 'No live data cached yet in this browser — visit Research or Dashboard to populate it.')
    + '<br><br>' +
    (keyItems.length ? `<b>Saved settings:</b> ${keyItems.join(', ')}` : '');
}
function clearQuantisCache(){
  try{
    const toRemove = [];
    for(let i=0;i<safeStorage.length;i++){ const k=safeStorage.key(i); if(k && k.startsWith('quantis_')) toRemove.push(k); }
    toRemove.forEach(k=>safeStorage.removeItem(k));
  }catch(e){}
  refreshCacheInfo();
}
