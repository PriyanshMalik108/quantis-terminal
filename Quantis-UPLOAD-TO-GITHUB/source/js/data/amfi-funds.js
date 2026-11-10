/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/data/amfi-funds.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Indian mutual funds (Kuvera list + mfapi.in NAV history).
 * DEPENDS   core/*
 * EXPOSES   fetchIndianMfNav (global — classic script, shared scope)
 * LOAD      Classic <script>, order defined in js/manifest.json. Top-level code runs at load,
 *           so it may only call functions from files listed EARLIER in the manifest.
 * NOTE      Migrated verbatim from the single-file build; inline comments marked
 *           "REAL BUG FIXED" / "post-launch fix" document past defects — keep them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* ===================== AMFI INDIA MUTUAL FUNDS (post-launch fix) =====================
   Root-caused the "Nippon India mutual fund not showing" report properly: Yahoo Finance's
   search index (used above for global search) does not meaningfully cover India's ~10,000+
   open-ended AMC mutual fund schemes — they aren't traded by ticker, they're priced by NAV
   (Net Asset Value), published once daily. The real, free, official, keyless source for this
   is AMFI India's own daily NAV file (the same body every Indian AMC reports to) — no login,
   no key, published every business day. This fetches and caches that file once, then searches
   it entirely client-side (parsing ~10,000 lines once is fast; no per-keystroke network cost).
   A scheme found this way is priced by its latest published NAV, not a live intraday feed —
   disclosed as such, since that's genuinely how Indian mutual funds are priced in reality;
   there's no such thing as an "intraday mutual fund price" anywhere, even on Bloomberg. */
// FIXED: this was 'https://www.amfiindia.com/spider/NAVAll.txt' — a URL that returns HTTP 404
// because it doesn't exist. AMFI moved/renamed this file to /spages/ (not /spider/) at some
// point, and every proxy failure logged throughout this conversation with "HTTP 404" was each
// provider correctly reaching AMFI and AMFI correctly saying that path is gone — not a proxy
// problem at all. Verified directly against the live file before changing this.
// FIXED: this was 'https://www.amfiindia.com/spider/NAVAll.txt' — a URL that returns HTTP 404
// because it doesn't exist. AMFI moved/renamed this file to /spages/ (not /spider/) at some
// point, and every proxy failure logged throughout this conversation with "HTTP 404" was each
// provider correctly reaching AMFI and AMFI correctly saying that path is gone — not a proxy
// problem at all. Verified directly against the live file before changing this.
/* India mutual funds — rebuilt on sources that answer browsers directly. AMFI's own NAVAll.txt
   blocks cross-origin requests, so search now uses Kuvera's public scheme directory (~6,000
   schemes with category and 1/3/5-year returns, one cached download), scheme details (ISIN,
   fund house, expense ratio, AUM, manager) come from Kuvera's scheme endpoint, and full daily NAV
   history (AMFI data) comes from mf.captnemo.in by ISIN — so funds now get a real chart too. */
let amfiSchemes = null;
let amfiLoadPromise = null;
/* "2026-10-28T16:00:00.000-0400" → "28 Oct 2026, 16:00 (exchange time)" — the raw ISO string was hard to read. */
function fmtQuoteTime(t){
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(t||'')); if(!m) return String(t||'');
  const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m[2]-1];
  return `${+m[3]} ${mon} ${m[1]}, ${m[4]}:${m[5]} exchange time`;
}
async function loadAmfiSchemes(){
  if(amfiSchemes && amfiSchemes.length) return amfiSchemes;
  if(amfiLoadPromise) return amfiLoadPromise;
  amfiLoadPromise = (async ()=>{
    try{
      const res = await fetchWithTimeout('https://api.kuvera.in/mf/api/v4/fund_schemes/list.json', {mode:'cors'}, 20000);
      if(!res.ok) throw new Error('HTTP '+res.status);
      const tree = await res.json();
      const schemes = [];
      Object.entries(tree).forEach(([assetClass, cats])=>Object.entries(cats||{}).forEach(([cat, houses])=>Object.entries(houses||{}).forEach(([house, arr])=>(arr||[]).forEach(f=>{
        if(!f || !f.c || !f.n) return;
        schemes.push({code: f.c, name: f.n, category: cat, assetClass, amc: house.replace(/_MF$/,'').replace(/MUTUALFUND/,' Mutual Fund').replace(/_/g,' ').trim(),
          ret1y: f.r && typeof f.r['1']==='number' ? f.r['1'] : null, ret3y: f.r && typeof f.r['3']==='number' ? f.r['3'] : null, date: f.r && f.r.date || ''});
      }))));
      if(!schemes.length) throw new Error('empty scheme directory');
      amfiSchemes = schemes;
    }catch(e){
      amfiSchemes = []; amfiSchemes._error = e.message;
      amfiLoadPromise = null; // allow a retry on the next search
    }
    return amfiSchemes;
  })();
  return amfiLoadPromise;
}
function searchAmfiSchemes(query, limit){
  if(!amfiSchemes || !amfiSchemes.length) return [];
  const words = normalizeSearchText(query).split(' ').filter(Boolean);
  return amfiSchemes.filter(s=>{ const hay = normalizeSearchText(s.name+' '+s.amc+' '+s.category); return words.every(w=>hay.includes(w)); }).slice(0, limit||8);
}
async function fetchKuveraDetail(code){
  return cachedFetch('kuvera_'+code, 12*60*60*1000, async ()=>{
    const res = await fetchWithTimeout('https://api.kuvera.in/mf/api/v5/fund_schemes/'+encodeURIComponent(code)+'.json', {mode:'cors'}, 15000);
    if(!res.ok) throw new Error('Kuvera HTTP '+res.status);
    const j = await res.json(); const d = Array.isArray(j) ? j[0] : j;
    if(!d) throw new Error('scheme not found');
    return {...d, via:'Kuvera'};
  });
}
async function fetchIndianMfNav(sec){
  const detail = await fetchKuveraDetail(sec._kuvera);
  if(!detail.ISIN) throw new Error('no ISIN published for this scheme');
  const hist = await cachedFetch('mfnav_'+detail.ISIN, 6*60*60*1000, async ()=>{
    const res = await fetchWithTimeout('https://mf.captnemo.in/nav/'+encodeURIComponent(detail.ISIN), {mode:'cors'}, 20000);
    if(!res.ok) throw new Error('NAV history HTTP '+res.status);
    const j = await res.json();
    const pts = (j.historical_nav||[]).map(p=>Array.isArray(p) ? {d:p[0], v:+p[1]} : {d:p.date, v:+p.nav}).filter(p=>p.d && isFinite(p.v) && p.v>0)
      .sort((a,b)=>a.d<b.d?-1:1);
    if(pts.length < 5) throw new Error('too little NAV history');
    const labels = pts.map(p=>String(p.d).slice(0,10)), data = pts.map(p=>p.v);
    return {labels, data, ohlc:{open:data, high:data, low:data, close:data}, lastDate: labels[labels.length-1], lastClose: data[data.length-1], prevClose: data[data.length-2], via:'AMFI NAV history (mf.captnemo.in)'};
  });
  sec._isin = detail.ISIN;
  return {...hist, currency:'INR'};
}
// Admits an AMFI scheme into the normal SECURITIES/SECURITY_UNIVERSE flow so Research/Compare/
// Portfolio/Watchlist all work on it exactly like any other security — priced in INR at its
// latest published NAV, chg/chgPct left at 0 since AMFI's file is a single daily snapshot, not
// a time series (a real limitation, not a guess dressed up as a number).
function admitAmfiScheme(scheme){
  const t = 'MF:'+scheme.code;
  if(SECURITY_UNIVERSE.some(x=>x.t===t)) return t;
  SECURITY_UNIVERSE.push({t, n:scheme.name, ex:'AMFI (India)', ctry:'India', sector:scheme.category||'Mutual Fund', cls:'Mutual Fund', _kuvera: scheme.code});
  SECURITIES.push({t, n:scheme.name, ex:'AMFI (India)', ctry:'India', sector:scheme.category||'Mutual Fund', cls:'Mutual Fund', ccy:'INR',
    px:0, chg:0, chgPct:0, rsi:null, mcap:null, pe:null, roe:null, _kuvera: scheme.code});
  return t;
}

async function drawPriceChart(){
  const myToken = ++priceFetchToken;
  const t = currentSecurity;
  setDataQuality(`<b>Source:</b> fetching live history…`);
  const sec = SECURITIES.find(x=>x.t===t);
  const isNseDeriv = sec && sec.cls === 'Derivative' && sec.ex === 'NSE';
  let hist = null, provider = '';
  const errs = [];
  try{
    if(sec && sec._kuvera){ hist = await fetchIndianMfNav(sec); provider = hist.via; }
    else { hist = await fetchYahooHistory(t, yahooSymbolFor(t)); provider = hist.via || 'CNBC'; }
  }catch(e){ errs.push(e.message); }
  if(!hist && sec && sec.cls === 'Crypto' && COINGECKO_ID[t]){ try{ hist = await fetchCoinGeckoHistory(t); provider = 'CoinGecko'; }catch(e){ errs.push('CoinGecko: '+e.message); } }
  if(!hist && sec && sec.cls === 'FX'){ try{ hist = await fetchFrankfurterHistory(t); provider = 'Frankfurter/ECB'; }catch(e){ errs.push('Frankfurter: '+e.message); } }
  if(myToken !== priceFetchToken) return;
  if(!hist){
    const smp = sampleSeriesFor(t);
    renderPriceChartCanvas(smp.labels, smp.data, false, smp.ohlc);
    try{ QXC.onResearchData(t, null); }catch(e){ console.error(e); }
    setDataQuality(`<b>Source:</b> SAMPLE (fallback)<br><b>Provider status:</b> <span style="color:var(--down)">${escapeHtml(errs.join(' · ') || 'no live source')}</span><br>Live data needs an internet connection that can reach cnbc.com.`);
    document.getElementById('secLiveStatus').innerHTML = `<span class="badge assume">SAMPLE</span> live data unreachable for ${escapeHtml(t)} right now`;
    return;
  }
  renderPriceChartCanvas(hist.labels, hist.data, true, hist.ohlc);
  try{ hist._t = t; window.QX_LAST_HIST = hist; QXC.onResearchData(t, hist); }catch(e){ console.error(e); }
  const ccy = (sec && sec.ccy) || hist.currency || 'USD';
  const providerLabel = provider === 'CNBC' ? 'CNBC market data (keyless, direct)' : provider;
  setDataQuality(`<b>Source:</b> ${escapeHtml(providerLabel)}${hist.cnbcSymbol ? ` · symbol <code>${escapeHtml(hist.cnbcSymbol)}</code>` : ''}`
    + `<br><b>History:</b> ${hist.data.length.toLocaleString()} daily closes, ${hist.labels[0]} → ${hist.lastDate}`
    + `<br><b>Freshness:</b> ${escapeHtml(hist.cacheStatus || 'live fetch')}${hist.cachedAt ? ' · '+hist.cachedAt : ''}`
    + `<br><b>Adjusted:</b> ${provider === 'CNBC' ? 'split-adjusted' : 'as published'}`
    + (isNseDeriv ? `<br><b>Note:</b> no free feed carries NSE futures/options history, so the chart shows the underlying cash ${escapeHtml(sec.n.replace(/ (Futures|Options).*$/,''))}; the live futures price and basis are shown below.` : ''));
  updateLiveQuote(t, hist.lastClose, hist.prevClose, ccy, provider === 'CNBC' ? 'CNBC (last close)' : provider);
  refreshHeaderQuote(t, myToken);
}
/* Intraday header refresh: the history above ends at the last daily close, so the header is then
   upgraded to CNBC's live quote (and, for NSE futures, the real front-month futures price from
   TradingView plus its basis to the underlying). */
async function refreshHeaderQuote(t, token){
  const sec = SECURITIES.find(x=>x.t===t); if(!sec || sec._kuvera) return;
  const cn = LD.cnbcSymbol(t);
  try{
    if(cn){
      const q = await LD.quote(cn);
      if(token !== priceFetchToken || !q) return;
      const ccy = q.currency || sec.ccy;
      if(sec.cls === 'Derivative' && sec.ex === 'NSE'){
        await renderNseFuturesBasis(sec, q, token);
      } else {
        updateLiveQuote(t, q.last, q.prev, ccy, `${q.via||'CNBC'} live quote${q.time && !q.via ? ' · '+escapeHtml(fmtQuoteTime(q.time)) : ''}`);
      }
    }
  }catch(e){ /* the last-close header from the chart stays in place */ }
}
async function renderNseFuturesBasis(sec, underlyingQuote, token){
  const tvSym = LD.tvSymbol(sec.t);
  if(!tvSym || !/1!$/.test(tvSym)){ updateLiveQuote(sec.t, underlyingQuote.last, underlyingQuote.prev, 'INR', 'CNBC live quote (underlying)'); return; }
  const {rows} = await LD.tvScan('india', {symbols:{tickers:[tvSym]}, columns:['close','change','description']});
  if(token !== priceFetchToken) return;
  const fut = rows[0];
  if(!fut || !fut.close){ updateLiveQuote(sec.t, underlyingQuote.last, underlyingQuote.prev, 'INR', 'CNBC live quote (underlying)'); return; }
  const prev = fut.change!=null ? fut.close/(1+fut.change/100) : null;
  updateLiveQuote(sec.t, fut.close, prev, 'INR', 'TradingView — front-month futures');
  const basis = fut.close - underlyingQuote.last, basisPct = basis/underlyingQuote.last*100;
  const box = document.getElementById('dataQualityBox');
  if(box) box.innerHTML += `<br><b>Futures vs spot:</b> ${fmtPrice(fut.close,'INR')} vs ${fmtPrice(underlyingQuote.last,'INR')} → basis ${basis>=0?'+':''}${basis.toFixed(2)} (${basisPct>=0?'+':''}${basisPct.toFixed(2)}%) <span class="badge fact">LIVE</span>`;
}
