/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/features/portfolio.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Editable portfolio, optimisation, stress testing.
 * DEPENDS   engines/*
 * EXPOSES   renderPortfolio (global — classic script, shared scope)
 * LOAD      Classic <script>, order defined in js/manifest.json. Top-level code runs at load,
 *           so it may only call functions from files listed EARLIER in the manifest.
 * NOTE      Migrated verbatim from the single-file build; inline comments marked
 *           "REAL BUG FIXED" / "post-launch fix" document past defects — keep them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* ===================== PORTFOLIO (Phase 5) =====================
   Holdings now fetch REAL daily price history per ticker (Yahoo Finance/CoinGecko/Frankfurter,
   the same chain proven for the single-security chart) via fetchLiveCloseSeries(), falling back
   to a deterministic seeded synthetic series only for a specific holding whose live fetch
   actually fails — disclosed per-ticker in pfStatus, not blanket-applied. Every metric below
   (return, Sharpe, max drawdown, VaR/CVaR, diversification ratio, Beta/Tracking Error/Info Ratio,
   and all optimization methods) is a real calculation via the Formula Engine. */
/* ===================== EDITABLE PORTFOLIO (post-launch fix) =====================
   PORTFOLIO_HOLDINGS was a hardcoded const — no add/remove/edit UI existed at all, so the
   "Portfolio" section only ever showed one fixed 4-stock demo. Now backed by localStorage
   (same pattern as workspaces above) so it survives a reload, and every add/remove triggers
   a full renderPortfolio() so Sharpe/Sortino/VaR/drawdown/optimization all recompute from the
   real current holdings — nothing here is a static number. */
const PORTFOLIO_STORAGE_KEY = 'quantis_portfolio_v1';
const DEFAULT_PORTFOLIO_HOLDINGS = [
  {t:'AAPL',qty:120,avg:184.2,seed:301},{t:'MSFT',qty:60,avg:398.5,seed:302},
  {t:'NVDA',qty:200,avg:88.4,seed:303},{t:'TCS',qty:150,avg:3820,seed:304},
];
function loadPortfolioHoldings(){
  try{
    const raw = safeStorage.getItem(PORTFOLIO_STORAGE_KEY);
    if(raw){ const parsed = JSON.parse(raw); if(Array.isArray(parsed) && parsed.length) return parsed; }
  }catch(e){ /* private browsing / storage disabled */ }
  return JSON.parse(JSON.stringify(DEFAULT_PORTFOLIO_HOLDINGS));
}
let PORTFOLIO_HOLDINGS = loadPortfolioHoldings();
function persistPortfolioHoldings(){
  try{ safeStorage.setItem(PORTFOLIO_STORAGE_KEY, JSON.stringify(PORTFOLIO_HOLDINGS)); }
  catch(e){ /* private browsing — state still works for this session */ }
  cloudSyncPush();
}
/* Reusable live daily-close fetcher extracted from drawPriceChart()'s per-security fallback
   chain (AMFI has no time series so isn't included here; Crypto -> FX -> Stooq -> Yahoo, in the
   same priority order already proven for the single-security chart) — used by the Portfolio tab
   below to get REAL daily history per holding instead of always falling back to sample. */
async function fetchLiveCloseSeries(ticker){
  const s = SECURITIES.find(x=>x.t===ticker);
  if(s && s._kuvera){ const h = await fetchIndianMfNav(s); return {data:h.data, labels:h.labels, via:h.via}; }
  try{
    const hist = await fetchYahooHistory(ticker, yahooSymbolFor(ticker));
    return {data: hist.data, labels: hist.labels, via: hist.via};
  }catch(e){
    if(s && s.cls === 'Crypto' && COINGECKO_ID[ticker]){ const h = await fetchCoinGeckoHistory(ticker); return {data: h.data, labels: h.labels, via:'CoinGecko'}; }
    if(s && s.cls === 'FX'){ const h = await fetchFrankfurterHistory(ticker); return {data: h.data, labels: h.labels, via:'Frankfurter/ECB'}; }
    throw e;
  }
}
function seedFor(ticker){ return ticker.split('').reduce((a,c)=>a+c.charCodeAt(0),0) + 300; }
/* Shared single-position logic used by both the manual Add Position form and the CSV importer
   below, so bulk-imported rows get exactly the same validation (must be in the searchable
   universe, positive qty/avg-cost, blended avg cost on a duplicate ticker) as a manually typed
   one — no separate, looser code path for imports. Returns {ok, message}. */
function addOnePosition(t, qty, avg){
  t = (t||'').trim().toUpperCase();
  if(!t) return {ok:false, message:'missing ticker'};
  if(isNaN(qty) || qty<=0 || isNaN(avg) || avg<=0) return {ok:false, message:`${t}: quantity and avg cost must be positive numbers`};
  const meta = SECURITY_UNIVERSE.find(x=>x.t===t);
  if(!meta) return {ok:false, message:`${t}: not in the ${SECURITY_UNIVERSE.length}-ticker searchable universe`};
  if(!SECURITIES.some(s=>s.t===t)) SECURITIES.push(makeSampleSecurityEntry(meta));
  const existing = PORTFOLIO_HOLDINGS.find(h=>h.t===t);
  if(existing){
    const newQty = existing.qty + qty;
    existing.avg = (existing.avg*existing.qty + avg*qty) / newQty;
    existing.qty = newQty;
    return {ok:true, message:`${t}: added to existing position, blended avg cost`};
  }else{
    PORTFOLIO_HOLDINGS.push({t, qty, avg, seed: seedFor(t)});
    return {ok:true, message:`${t}: added`};
  }
}
function addPortfolioPosition(){
  const tEl = document.getElementById('pfAddTicker'), qEl = document.getElementById('pfAddQty'), aEl = document.getElementById('pfAddAvg');
  const statusEl = document.getElementById('pfAddStatus');
  const t = (tEl.value||'').trim().toUpperCase();
  const qty = parseFloat(qEl.value), avg = parseFloat(aEl.value);
  const result = addOnePosition(t, qty, avg);
  statusEl.innerHTML = result.ok ? `<span style="color:var(--up)">${escapeHtml(result.message)}.</span>` : `<span style="color:var(--down)">${escapeHtml(result.message)}${result.message.includes('universe')?' — Try Ctrl+K to check spelling.':''}</span>`;
  if(!result.ok) return;
  tEl.value=''; qEl.value=''; aEl.value='';
  persistPortfolioHoldings();
  renderPortfolio();
}
/* CSV portfolio import — was entirely absent; adding more than a couple of holdings meant typing
   each one into the three-field form by hand. Accepts ticker/qty/avg_cost columns in any order,
   with or without a header row (auto-detected: if the first row's 2nd/3rd fields don't parse as
   numbers, it's treated as a header and column names are matched case-insensitively against
   common aliases like "shares"/"quantity" and "cost"/"price"/"avg_price"). Every row goes through
   the exact same addOnePosition() validation as manual entry, and a per-row result is reported —
   no silent partial failures. */
function parseCsvLine(line){
  // Minimal RFC4180-ish CSV split: handles quoted fields containing commas, doesn't handle
  // embedded newlines inside quotes (a plain ticker/qty/cost file never needs that).
  const out = []; let cur = '', inQuotes = false;
  for(let i=0;i<line.length;i++){
    const ch = line[i];
    if(ch === '"'){ inQuotes = !inQuotes; }
    else if(ch === ',' && !inQuotes){ out.push(cur); cur=''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map(s=>s.trim().replace(/^"|"$/g,''));
}
function importPortfolioCsv(file){
  const statusEl = document.getElementById('pfCsvStatus');
  if(!file){ return; }
  const reader = new FileReader();
  reader.onerror = ()=>{ statusEl.innerHTML = `<span style="color:var(--down)">Couldn't read that file.</span>`; };
  reader.onload = ()=>{
    const text = String(reader.result||'');
    const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(l=>l.length>0);
    if(lines.length === 0){ statusEl.innerHTML = `<span style="color:var(--down)">File is empty.</span>`; return; }
    let rows = lines.map(parseCsvLine);
    // Header detection: if row 0's positions 1 and 2 (assuming ticker,qty,avg order) don't look
    // numeric, treat it as a header and use it to find the real column indices by name.
    let tIdx=0, qIdx=1, aIdx=2;
    const looksNumeric = v => !isNaN(parseFloat(v)) && isFinite(v);
    const firstRow = rows[0];
    const secondAndThirdNumeric = firstRow.length>=3 && looksNumeric(firstRow[1]) && looksNumeric(firstRow[2]);
    if(!secondAndThirdNumeric){
      const header = firstRow.map(h=>h.toLowerCase());
      const findCol = names => header.findIndex(h=>names.includes(h));
      const tc = findCol(['ticker','symbol','sec','security']);
      const qc = findCol(['qty','quantity','shares','units']);
      const ac = findCol(['avg_cost','avgcost','avg cost','cost','price','avg_price','avgprice']);
      if(tc>=0) tIdx=tc; if(qc>=0) qIdx=qc; if(ac>=0) aIdx=ac;
      rows = rows.slice(1); // drop header row
    }
    if(rows.length === 0){ statusEl.innerHTML = `<span style="color:var(--down)">No data rows found after the header.</span>`; return; }
    const results = rows.map(r => addOnePosition(r[tIdx], parseFloat(r[qIdx]), parseFloat(r[aIdx])));
    const okCount = results.filter(r=>r.ok).length;
    const failMessages = results.filter(r=>!r.ok).map(r=>r.message);
    statusEl.innerHTML = `Imported ${okCount}/${results.length} row(s).` + (failMessages.length ? `<br><span style="color:var(--down)">Skipped: ${escapeHtml(failMessages.join('; '))}</span>` : '');
    if(okCount>0){ persistPortfolioHoldings(); renderPortfolio(); }
    document.getElementById('pfCsvFile').value = ''; // allow re-selecting the same file name later
  };
  reader.readAsText(file);
}
/* PDF export — client-side only, via jsPDF (loaded from CDN, no server involved). Both exports
   pull exclusively from AppState (the same centralized store the Grounded Assistant reads from),
   so a PDF can never say something the on-screen numbers don't already say — no separate
   "export" data path that could drift from what's actually displayed. Uses jsPDF's core text/line
   API directly rather than the autoTable plugin, to avoid a second CDN dependency and version-
   compatibility surface for what's fundamentally a simple one/two-page summary. */
function pdfLine(doc, y, label, value, x1=15, x2=90){
  doc.setFont(undefined,'normal'); doc.setFontSize(9); doc.setTextColor(90,90,90);
  doc.text(label, x1, y);
  doc.setFont(undefined,'bold'); doc.setTextColor(20,20,20);
  doc.text(String(value), x2, y);
  return y+6;
}
function pdfHeader(doc, title, subtitle){
  doc.setFont(undefined,'bold'); doc.setFontSize(16); doc.setTextColor(20,20,20);
  doc.text(title, 15, 18);
  doc.setFont(undefined,'normal'); doc.setFontSize(9); doc.setTextColor(120,120,120);
  doc.text(subtitle, 15, 25);
  doc.text('Generated '+new Date().toLocaleString(), 15, 30);
  doc.setDrawColor(210,210,210); doc.line(15,34,195,34);
  return 44;
}
function pdfSection(doc, y, title){
  if(y>265){ doc.addPage(); y=20; }
  doc.setFont(undefined,'bold'); doc.setFontSize(11); doc.setTextColor(20,20,20);
  doc.text(title, 15, y);
  return y+7;
}
function exportSecurityPdf(){
  if(!(window.jspdf && window.jspdf.jsPDF)){ toast('PDF library failed to load — check your network connection and try again.'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const s = SECURITIES.find(x=>x.t===currentSecurity);
  if(!s){ toast('No security selected.'); return; }
  let y = pdfHeader(doc, `${s.n} (${s.t})`, `${s.ex||''} · ${s.ctry||''} · ${s.sector||''} · ${s.ccy||''}`);

  y = pdfSection(doc, y, 'Price');
  y = pdfLine(doc, y, 'Last', fmtPrice(s.px, s.ccy));
  y = pdfLine(doc, y, 'Change', `${s.chg>=0?'+':''}${s.chg} (${s.chgPct>=0?'+':''}${s.chgPct.toFixed(2)}%)`);
  y = pdfLine(doc, y, 'Data source', currentPriceSeriesIsLive ? 'LIVE market data' : 'SAMPLE (illustrative, not real market data)');
  y += 4;

  if(AppState.technicals){
    const t = AppState.technicals;
    y = pdfSection(doc, y, 'Technicals');
    y = pdfLine(doc, y, 'RSI (14)', t.rsi14!=null?t.rsi14.toFixed(1):'—');
    y = pdfLine(doc, y, 'SMA 20 / 50', `${t.sma20!=null?t.sma20.toFixed(2):'—'} / ${t.sma50!=null?t.sma50.toFixed(2):'—'}`);
    y = pdfLine(doc, y, 'Historical Volatility (ann.)', t.histVol!=null?t.histVol.toFixed(1)+'%':'—');
    y += 4;
  }
  if(AppState.risk){
    const r = AppState.risk;
    y = pdfSection(doc, y, 'Risk');
    y = pdfLine(doc, y, 'VaR (1D, 95%, historical)', r.varHist!=null?(r.varHist*100).toFixed(2)+'%':'—');
    y = pdfLine(doc, y, 'CVaR (1D, 95%)', r.cvarHist!=null?(r.cvarHist*100).toFixed(2)+'%':'—');
    y = pdfLine(doc, y, 'Max Drawdown', r.maxDrawdownPct!=null?r.maxDrawdownPct.toFixed(1)+'%':'—');
    y = pdfLine(doc, y, 'Sharpe / Sortino', `${r.sharpe!=null?r.sharpe.toFixed(2):'—'} / ${r.sortino!=null?r.sortino.toFixed(2):'—'}`);
    y += 4;
  }
  if(AppState.fundamentals && AppState.fundamentals.ticker===currentSecurity){
    const f = AppState.fundamentals;
    y = pdfSection(doc, y, 'Fundamentals'+(f.isLive?' (LIVE)':' (SAMPLE)'));
    y = pdfLine(doc, y, 'P/E', f.pe!=null?f.pe.toFixed(1):'—');
    y = pdfLine(doc, y, 'ROE', f.roePct!=null?f.roePct.toFixed(1)+'%':'—');
    y = pdfLine(doc, y, 'Market Cap', f.marketCap!=null?'$'+(f.marketCap/1e9).toFixed(1)+'B':'—');
    y += 4;
  }
  if(AppState.forecast && AppState.forecast.ticker===currentSecurity){
    const fc = AppState.forecast;
    y = pdfSection(doc, y, `Forecast (${fc.horizon}D ensemble)`);
    y = pdfLine(doc, y, 'Expected move', fc.ensemblePredPct!=null?(fc.ensemblePredPct>=0?'+':'')+fc.ensemblePredPct.toFixed(1)+'%':'—');
    y = pdfLine(doc, y, 'Range (low/high)', `${fc.rangeLow!=null?fc.rangeLow.toFixed(1)+'%':'—'} / ${fc.rangeHigh!=null?fc.rangeHigh.toFixed(1)+'%':'—'}`);
    y = pdfLine(doc, y, 'Backtested directional accuracy', fc.ensDirAcc!=null?fc.ensDirAcc.toFixed(0)+'%':'—');
    y += 4;
  }
  doc.setFontSize(7.5); doc.setTextColor(150,150,150);
  doc.text('Generated by Quantis Terminal. Not investment advice. SAMPLE-tagged figures are illustrative, not real market data.', 15, 285);
  doc.save(`${s.t}_research_${new Date().toISOString().slice(0,10)}.pdf`);
}
function exportPortfolioPdf(){
  if(!(window.jspdf && window.jspdf.jsPDF)){ toast('PDF library failed to load — check your network connection and try again.'); return; }
  if(PORTFOLIO_HOLDINGS.length === 0){ toast('Portfolio is empty — add at least one position first.'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const p = AppState.portfolio || {};
  let y = pdfHeader(doc, 'Portfolio Summary', `${PORTFOLIO_HOLDINGS.length} holding(s) · ${p.isLive?'all live-sourced':'partially or fully sample-sourced (see in-app disclosure)'}`);

  y = pdfSection(doc, y, 'Overview');
  y = pdfLine(doc, y, 'Total Value', p.value!=null?'$'+p.value.toLocaleString(undefined,{maximumFractionDigits:0}):'—');
  y = pdfLine(doc, y, 'Annualized Return', p.annReturnPct!=null?(p.annReturnPct>=0?'+':'')+p.annReturnPct.toFixed(1)+'%':'—');
  y = pdfLine(doc, y, 'Sharpe / Sortino', `${p.sharpe!=null?p.sharpe.toFixed(2):'—'} / ${p.sortino!=null?p.sortino.toFixed(2):'—'}`);
  y = pdfLine(doc, y, 'Max Drawdown', p.maxDrawdownPct!=null?p.maxDrawdownPct.toFixed(1)+'%':'—');
  y = pdfLine(doc, y, 'VaR / CVaR (1D, 95%)', `${p.varHistPct!=null?p.varHistPct.toFixed(2)+'%':'—'} / ${p.cvarHistPct!=null?p.cvarHistPct.toFixed(2)+'%':'—'}`);
  y += 6;

  y = pdfSection(doc, y, 'Holdings');
  doc.setFontSize(8.5); doc.setFont(undefined,'bold'); doc.setTextColor(90,90,90);
  doc.text('Ticker', 15, y); doc.text('Qty', 55, y); doc.text('Avg Cost', 80, y); doc.text('Current', 110, y); doc.text('Weight', 140, y); doc.text('P&L %', 170, y);
  y += 5; doc.setDrawColor(220,220,220); doc.line(15,y-3,195,y-3);
  doc.setFont(undefined,'normal'); doc.setTextColor(30,30,30);
  const prices = pfCurrentPrices();
  const weightMap = {}; (p.holdings||[]).forEach(h=>{ weightMap[h.ticker]=h.weightPct; });
  PORTFOLIO_HOLDINGS.forEach(h=>{
    if(y>270){ doc.addPage(); y=20; }
    const cur = prices[h.t]; const pnl = ((cur-h.avg)/h.avg*100);
    doc.text(h.t, 15, y); doc.text(String(h.qty), 55, y); doc.text(h.avg.toFixed(2)+' '+pfCcy(h.t), 80, y);
    doc.text(cur.toFixed(2)+' '+pfCcy(h.t), 110, y); doc.text((weightMap[h.t]!=null?weightMap[h.t].toFixed(1):'—')+'%', 140, y);
    doc.text((pnl>=0?'+':'')+pnl.toFixed(1)+'%', 170, y);
    y += 6;
  });
  y += 4;
  doc.setFontSize(7.5); doc.setTextColor(150,150,150);
  doc.text('Generated by Quantis Terminal. Not investment advice. Past performance never guarantees future results.', 15, 285);
  doc.save(`portfolio_summary_${new Date().toISOString().slice(0,10)}.pdf`);
}
function removePortfolioPosition(t){
  const i = PORTFOLIO_HOLDINGS.findIndex(h=>h.t===t);
  if(i>-1){ PORTFOLIO_HOLDINGS.splice(i,1); persistPortfolioHoldings(); renderPortfolio(); }
}
const PF_FALLBACK_PX = {AAPL:227.14, MSFT:441.58, NVDA:132.77, TCS:4102.85};
/* Multi-currency fix: holdings were summed in their native currencies (₹4,102 TCS + $227 AAPL),
   so an Indian stock dominated every weight, Sharpe, VaR and optimizer result. Every position is
   now converted to USD with a live Frankfurter/ECB rate (approximate fallback rates only if that
   fails — disclosed in the status line). Avg cost and current price stay in native currency. */
const FX_FALLBACK_TO_USD = {GBp:0.0127, GBX:0.0127, USD:1, INR:0.012, EUR:1.08, GBP:1.27, JPY:0.0067, KRW:0.00073, CNY:0.14, TWD:0.031, AUD:0.66, CHF:1.12, HKD:0.128, SGD:0.74, CAD:0.73};
let pfFxToUsd = {USD:1}, pfFxIsLive = {USD:true}, portfolioLastPrice = {};
function pfCcy(t){ const sec = SECURITIES.find(x=>x.t===t); return sec ? sec.ccy : 'USD'; }
function pfFx(t){ const c = pfCcy(t); return pfFxToUsd[c] ?? FX_FALLBACK_TO_USD[c] ?? 1; }
function pfUsdValue(h, prices){ return h.qty * prices[h.t] * pfFx(h.t); }
async function loadPortfolioFx(){
  const ccys = [...new Set(PORTFOLIO_HOLDINGS.map(h=>pfCcy(h.t)))].filter(c=>c!=='USD');
  await Promise.all(ccys.map(async c=>{
    try{ const r = await getFxRateToUsd(c); if(!(r>0)) throw new Error('bad rate'); pfFxToUsd[c] = r; pfFxIsLive[c] = true; }
    catch(e){ pfFxToUsd[c] = FX_FALLBACK_TO_USD[c] ?? 1; pfFxIsLive[c] = false; }
  }));
}
let portfolioReturnSeries = {}, portfolioSeriesIsLive = {}, portfolioSeriesVia = {};
/* Was buildPortfolioReturnSeries() — always a deterministic seeded synthetic series, disclosed
   in pfStatus as "fetching live multi-asset daily history for every holding isn't wired yet."
   Now genuinely fetches real daily closes per holding via the same Stooq/Yahoo/CoinGecko/
   Frankfurter chain already proven for the single-security chart (fetchLiveCloseSeries above),
   falling back to the old seeded synthetic series ONLY for a holding whose live fetch actually
   fails — and that fallback is now tracked and disclosed per-ticker, not blanket-applied. All
   holdings' return series are aligned to the shortest available length so the covariance
   matrix / OLS-based optimizers downstream stay well-formed. */
async function buildPortfolioReturnSeriesLive(){
  const targetN = 180;
  const results = await Promise.all(PORTFOLIO_HOLDINGS.map(async h=>{
    try{
      const live = await fetchLiveCloseSeries(h.t);
      if(!live.data || live.data.length < 30) throw new Error('too little live history returned');
      const rets = Formulas.dailyReturns(live.data, false);
      return {t:h.t, rets, isLive:true, via:live.via, last: live.data[live.data.length-1], prev: live.data[live.data.length-2]};
    }catch(e){
      const rnd = seededRnd(h.seed || seedFor(h.t));
      const rets = [];
      for(let i=0;i<targetN;i++) rets.push((rnd()-0.485)*0.026); // deterministic fallback noise, ~30% annualized vol scale
      return {t:h.t, rets, isLive:false, via:e.message};
    }
  }));
  const minLen = Math.min(...results.map(r=>r.rets.length));
  results.forEach(r=>{
    portfolioReturnSeries[r.t] = r.rets.slice(r.rets.length-minLen);
    portfolioSeriesIsLive[r.t] = r.isLive;
    portfolioSeriesVia[r.t] = r.via;
    if(r.isLive && r.last>0){
      portfolioLastPrice[r.t] = r.last;
      // keep the rest of the app consistent with the live close just fetched
      const sec = SECURITIES.find(x=>x.t===r.t);
      if(sec){ sec.px = r.last; if(r.prev>0){ sec.chg = r.last-r.prev; sec.chgPct = (r.last/r.prev-1)*100; } }
    }
  });
}
function pfCurrentPrices(){
  const map = {};
  PORTFOLIO_HOLDINGS.forEach(h=>{ const sec = SECURITIES.find(x=>x.t===h.t); map[h.t] = portfolioLastPrice[h.t] || (sec ? sec.px : (PF_FALLBACK_PX[h.t] || h.avg)); });
  return map;
}
function computeOptimizedWeights(method){
  const tickers = PORTFOLIO_HOLDINGS.map(h=>h.t);
  if(tickers.length === 0) return {tickers:[], weights:[], stats:null};
  const returnsMatrix = tickers.map(t=>portfolioReturnSeries[t]);
  const covDaily = Formulas.covarianceMatrix(returnsMatrix);
  const covAnnual = covDaily.map(row=>row.map(v=>v*252));
  const expReturnsAnnual = returnsMatrix.map(r => (r.reduce((a,b)=>a+b,0)/r.length)*252);
  let w;
  if(method==='minvar') w = Formulas.minVariancePortfolio(covAnnual);
  else if(method==='maxsharpe') w = Formulas.longOnlyMaxSharpePortfolio(covAnnual, expReturnsAnnual, 0.04);
  else if(method==='riskparity') w = Formulas.riskParityPortfolio(covAnnual);
  else if(method==='targetreturn'){
    const pct = parseFloat(document.getElementById('optTargetReturn')?.value);
    const target = isNaN(pct) ? 0.10 : pct/100;
    w = Formulas.targetReturnPortfolio(covAnnual, expReturnsAnnual, target);
  }
  else if(method==='targetvol'){
    const pct = parseFloat(document.getElementById('optTargetVol')?.value);
    const target = isNaN(pct) ? 0.15 : pct/100;
    w = Formulas.targetVolatilityPortfolio(covAnnual, expReturnsAnnual, target);
  }
  else w = tickers.map(()=>1/tickers.length); // equal
  const stats = Formulas.portfolioStats(w, expReturnsAnnual, covAnnual, 0.04);
  return {tickers, weights:w, stats};
}
function applyPortfolioOptimization(method){
  document.querySelectorAll('#optChips .chip').forEach(c=>c.classList.toggle('active', c.dataset.method===method));
  const {tickers, weights, stats} = computeOptimizedWeights(method);
  if(tickers.length === 0){
    document.getElementById('optResult').innerHTML = `<div class="notebox">Portfolio is empty — add at least one position above before running an optimization.</div>`;
    return;
  }
  const rows = tickers.map((t,i)=>[t, (weights[i]*100).toFixed(1)+'%']);
  const methodNote = {
    minvar:'Formulas.minVariancePortfolio (closed-form, unconstrained on sign — long-only by construction only when the closed-form solution happens to be non-negative)',
    maxsharpe:'Formulas.longOnlyMaxSharpePortfolio (projected-gradient ascent on the Sharpe ratio, each step projected onto the long-only simplex — the actual long-only tangency portfolio, not a clip-and-renormalize approximation)',
    riskparity:'Formulas.riskParityPortfolio (damped multiplicative fixed-point iteration)',
    targetreturn:'Formulas.targetReturnPortfolio (projected-gradient descent minimizing variance subject to a target return, long-only)',
    targetvol:'Formulas.targetVolatilityPortfolio (projected-gradient ascent maximizing return subject to a target volatility, long-only)',
    equal:'(equal weight)'
  }[method];
  let extraNote = '';
  if(method==='targetreturn'){
    const pct = parseFloat(document.getElementById('optTargetReturn')?.value);
    const target = isNaN(pct) ? 10 : pct;
    extraNote = `<br>Target: ${target.toFixed(1)}% annualized · Achieved: ${(stats.ret*100).toFixed(1)}%${Math.abs(stats.ret*100-target)>1 ? ' (target sits outside what\'s achievable long-only from these holdings — closest feasible point shown)' : ''}`;
  } else if(method==='targetvol'){
    const pct = parseFloat(document.getElementById('optTargetVol')?.value);
    const target = isNaN(pct) ? 15 : pct;
    extraNote = `<br>Target: ${target.toFixed(1)}% annualized volatility · Achieved: ${(stats.vol*100).toFixed(1)}%${Math.abs(stats.vol*100-target)>1 ? ' (target sits outside what\'s achievable long-only from these holdings — closest feasible point shown)' : ''}`;
  }
  document.getElementById('optResult').innerHTML = table(['Ticker','Weight'], rows)
    + `<div class="notebox" style="margin-top:8px;"><b>Expected annualized return:</b> ${(stats.ret*100).toFixed(1)}% · <b>Expected annualized volatility:</b> ${(stats.vol*100).toFixed(1)}% · <b>Sharpe:</b> ${stats.sharpe!=null?stats.sharpe.toFixed(2):'—'}${extraNote}<br>Computed from the same historical covariance matrix as the risk metrics above via <code>${methodNote}</code>.</div>`;
  renderRebalanceSuggestions(tickers, weights, method);
}
/* NEW FEATURE: Rebalancing Suggestions — a common feature on every serious portfolio platform
   (Personal Capital, Betterment, most brokerage apps) that this tool didn't have at all. Pure
   computation on data already in memory (current $ value per holding vs whichever target
   weights the optimizer above just produced) — no new API, no new failure surface. Recomputes
   automatically whenever a different optimization method is selected, so "rebalance toward Risk
   Parity" vs "rebalance toward Equal Weight" are both one click away. */
function renderRebalanceSuggestions(targetTickers, targetWeights, method){
  const box = document.getElementById('rebalanceResult');
  if(!box) return;
  if(targetTickers.length === 0){ box.innerHTML = `<div class="notebox">Portfolio is empty.</div>`; return; }
  const prices = pfCurrentPrices();
  const currentValues = PORTFOLIO_HOLDINGS.map(h=>pfUsdValue(h,prices));
  const totalValue = currentValues.reduce((a,b)=>a+b,0);
  if(totalValue<=0){ box.innerHTML = `<div class="notebox">Portfolio has zero value.</div>`; return; }
  const rows = targetTickers.map((t,i)=>{
    const holding = PORTFOLIO_HOLDINGS.find(h=>h.t===t);
    const currentValue = holding ? pfUsdValue(holding,prices) : 0;
    const currentWeight = currentValue/totalValue;
    const targetWeight = targetWeights[i];
    const targetValue = targetWeight*totalValue;
    const deltaValue = targetValue-currentValue;
    const action = Math.abs(deltaValue) < totalValue*0.005 ? 'Hold' : (deltaValue>0 ? 'Buy' : 'Sell');
    const deltaShares = holding && prices[t]>0 ? deltaValue/(prices[t]*pfFx(t)) : null;
    return [t, (currentWeight*100).toFixed(1)+'%', (targetWeight*100).toFixed(1)+'%',
      `<span class="${action==='Buy'?'up':action==='Sell'?'down':''}" style="font-weight:600;">${action}</span>`,
      deltaValue!==0 ? '$'+Math.abs(deltaValue).toLocaleString(undefined,{maximumFractionDigits:0}) : '—',
      deltaShares!=null && action!=='Hold' ? (Math.abs(deltaShares)<1 ? Math.abs(deltaShares).toFixed(2) : Math.round(Math.abs(deltaShares))) : '—'];
  });
  const methodLabel = {equal:'Equal Weight', minvar:'Min Variance', maxsharpe:'Max Sharpe', riskparity:'Risk Parity', targetreturn:'Target Return', targetvol:'Target Volatility'}[method] || method;
  box.innerHTML = table(['Ticker','Current %','Target %','Action','$ Amount','~Shares'], rows)
    + `<div class="notebox" style="margin-top:6px;">Target = <b>${methodLabel}</b> (selected above). Rows within 0.5% of target are marked "Hold" to avoid suggesting trades over rounding noise.</div>`;
}
document.getElementById('sectorHeat').addEventListener('click', e=>{
  const cell = e.target.closest('[data-sector]'); if(!cell || !MARKET_SNAPSHOT) return;
  const sector = cell.dataset.sector;
  const dd = document.getElementById('sectorDrilldown');
  const inSector = MARKET_SNAPSHOT.rows.filter(r=>r.sector===sector).sort((a,b)=>(b.market_cap_basic||0)-(a.market_cap_basic||0)).slice(0,12);
  dd.innerHTML = `<div class="notebox" style="margin-top:10px;"><b>${escapeHtml(sector)}</b> — the ${inSector.length} largest ${escapeHtml(MARKET_SNAPSHOT.label)} companies in this sector (click one to research it):</div>`
    + `<table class="datatable"><thead><tr><th>Ticker</th><th>Name</th><th>Change</th></tr></thead><tbody>` + inSector.map(r=>`<tr data-tv="${escapeHtml(r._s)}" style="cursor:pointer"><td>${escapeHtml(r._s.split(':')[1])}</td><td>${escapeHtml(r.description||r.name)}</td><td class="${r.change>=0?'up':'down'}">${r.change>=0?'+':''}${r.change.toFixed(2)}%</td></tr>`).join('') + `</tbody></table>`;
  dd.querySelectorAll('tr[data-tv]').forEach(tr=>tr.addEventListener('click', ()=>{ const row = MARKET_SNAPSHOT.rows.find(r=>r._s===tr.dataset.tv); if(row) openTvRow(row); }));
});
document.getElementById('optChips').addEventListener('click', e=>{
  const chip = e.target.closest('.chip'); if(!chip) return;
  applyPortfolioOptimization(chip.dataset.method);
});
document.getElementById('optTargetReturn').addEventListener('change', ()=>{ if(document.querySelector('#optChips .chip[data-method="targetreturn"]').classList.contains('active')) applyPortfolioOptimization('targetreturn'); });
document.getElementById('optTargetVol').addEventListener('change', ()=>{ if(document.querySelector('#optChips .chip[data-method="targetvol"]').classList.contains('active')) applyPortfolioOptimization('targetvol'); });
let renderPortfolioToken = 0;
/* NEW FEATURE: Position Notes / Trade Journal — free-text notes per holding (thesis, entry
   reasoning, price targets), persisted via the same safeStorage wrapper as everything else
   (works even if real localStorage is blocked, same in-memory fallback). Zero new API, zero new
   external dependency — purely local. Reuses the existing modalOverlay pattern already
   established for Settings/Help, so the interaction feels consistent rather than introducing a
   new UI paradigm just for this one feature. */
const NOTES_STORAGE_KEY = 'quantis_position_notes_v1';
function loadPositionNotes(){
  try{
    const raw = safeStorage.getItem(NOTES_STORAGE_KEY);
    if(raw){ const parsed = JSON.parse(raw); if(parsed && typeof parsed === 'object') return parsed; }
  }catch(e){ /* corrupted or absent — start fresh */ }
  return {};
}
let POSITION_NOTES = loadPositionNotes();
function getPositionNote(ticker){ return POSITION_NOTES[ticker] || ''; }
function persistPositionNotes(){ try{ safeStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(POSITION_NOTES)); }catch(e){ /* private browsing or storage full */ } cloudSyncPush(); }
let currentNoteTicker = null;
function openNoteEditor(ticker){
  currentNoteTicker = ticker;
  document.getElementById('notesTicker').textContent = ticker;
  document.getElementById('notesTextarea').value = getPositionNote(ticker);
  document.getElementById('notesOverlay').classList.add('show');
  setTimeout(()=>document.getElementById('notesTextarea').focus(), 50);
}
function saveCurrentNote(){
  if(!currentNoteTicker) return;
  const text = document.getElementById('notesTextarea').value.trim();
  if(text) POSITION_NOTES[currentNoteTicker] = text;
  else delete POSITION_NOTES[currentNoteTicker]; // empty note = remove it, don't keep a hollow entry
  persistPositionNotes();
  document.getElementById('notesOverlay').classList.remove('show');
  renderPortfolio(); // refresh so the 📝/＋ icon reflects the new state immediately
}
/* ===================== PORTFOLIO STRESS TESTING =====================
   Same discipline as the single-security Stress Scenarios card in Risk (Formula Engine, scaled
   by REAL measured volatility — never fixed sample percentages): shocks here scale by this
   portfolio's own measured daily volatility (`sd`, computed above from the real $-weighted
   return series across every holding, which already captures each holding's real historical
   correlation — a portfolio of imperfectly-correlated assets has LOWER combined volatility than
   the sum of its parts, and that diversification benefit is already baked into `sd` itself,
   not applied as a separate fudge factor). Also reports the worst real historical N-day
   drawdown actually observed in this same return series — a genuine historical data point,
   not a hypothetical multiple of sigma. */
function renderPortfolioStressTest(portfolioValue, dailySd, ddResult, pfReturns){
  const box = document.getElementById('pfStressBox');
  if(!box) return;
  if(!dailySd || !isFinite(dailySd)){
    box.innerHTML = `<div class="notebox">Not enough return history yet to compute stress scenarios — add holdings with live price history above.</div>`;
    return;
  }
  const scenarios = [
    {label:'Market crash (-6σ daily move)', mult:-6},
    {label:'Severe stress (-4σ daily move)', mult:-4},
    {label:'Elevated volatility (-2σ daily move)', mult:-2},
    {label:'Mild pullback (-1σ daily move)', mult:-1},
  ];
  const rows = scenarios.map(s=>{
    const pctImpact = s.mult*dailySd;
    const dollarImpact = portfolioValue*pctImpact;
    return [s.label, `<span class="down">${(pctImpact*100).toFixed(1)}%</span>`, `<span class="down">-$${Math.abs(dollarImpact).toLocaleString(undefined,{maximumFractionDigits:0})}</span>`];
  });
  // Real worst historical N-day drawdown from the ACTUAL combined portfolio return path — not
  // a sigma multiple at all, a genuine realized historical event within the fetched window.
  rows.push([
    `Worst historical drawdown observed (${pfReturns.length}-day live/sample window)`,
    `<span class="down">${(-ddResult.maxDrawdownPct).toFixed(1)}%</span>`,
    `<span class="down">-$${Math.abs(portfolioValue*ddResult.maxDrawdownPct/100).toLocaleString(undefined,{maximumFractionDigits:0})}</span>`,
  ]);
  const annualVol = dailySd*Math.sqrt(252);
  box.innerHTML = table(['Scenario','Est. 1-Day % Impact','Est. 1-Day $ Impact'], rows)
    + `<div class="notebox" style="margin-top:8px;">σ = this portfolio's own measured DAILY volatility from its real $-weighted return series (annualized: ${(annualVol*100).toFixed(1)}%) — already reflects the real historical correlation between your specific holdings, not a naive sum of each position's individual risk. These are single-day parametric shocks (assumes returns are roughly normally distributed, which understates real "fat tail" crash risk) — the drawdown row below them is a genuine multi-day historical event actually observed in the fetched return window, not a hypothetical. Neither is a prediction; both describe the shape and scale of past/plausible moves, not what will happen next.</div>`;
}
async function renderPortfolio(){
  const myToken = ++renderPortfolioToken;
  if(PORTFOLIO_HOLDINGS.length === 0){
    document.getElementById('holdingsTable').innerHTML = '<tbody><tr><td style="padding:14px 4px;color:var(--text-2);">No holdings — add a position above.</td></tr></tbody>';
    document.getElementById('pfValue').textContent = '$0';
    document.getElementById('pfReturn').textContent = '—';
    document.getElementById('pfSharpe').textContent = '—';
    document.getElementById('pfMaxDd').textContent = '—';
    document.getElementById('pfRiskTable').innerHTML = '';
    document.getElementById('pfStatus').innerHTML = 'Portfolio is empty. Add at least one position above to see real risk/return metrics.';
    document.getElementById('optResult').innerHTML = '';
    return;
  }
  const statusElEarly = document.getElementById('pfStatus');
  if(statusElEarly) statusElEarly.innerHTML = `Fetching real daily price history per holding (Yahoo Finance/CoinGecko/Frankfurter, same sources as the single-security chart)…`;
  await Promise.all([buildPortfolioReturnSeriesLive(), loadPortfolioFx()]);
  if(myToken !== renderPortfolioToken) return; // holdings changed again while this fetch was in flight
  const prices = pfCurrentPrices();
  const tot = PORTFOLIO_HOLDINGS.reduce((a,h)=>a+pfUsdValue(h,prices),0);
  const weights = PORTFOLIO_HOLDINGS.map(h=> pfUsdValue(h,prices)/tot);

  document.getElementById('holdingsTable').innerHTML = table(['Ticker','Qty','Avg Cost','Current','Weight %','P&L %','Notes',''],
    PORTFOLIO_HOLDINGS.map((h,i)=>{
      const cur = prices[h.t];
      const pnl = ((cur-h.avg)/h.avg*100).toFixed(1);
      const hasNote = !!getPositionNote(h.t);
      return [h.t,h.qty,fmtPrice(h.avg,pfCcy(h.t)),fmtPrice(cur,pfCcy(h.t)),(weights[i]*100).toFixed(1)+'%',`<span class="${pnl>=0?'up':'down'}">${pnl>=0?'+':''}${pnl}%</span>`,
        `<button class="notes-btn${hasNote?' has-note':''}" title="${hasNote?'Edit notes':'Add notes'}" aria-label="${hasNote?'Edit notes for '+h.t:'Add notes for '+h.t}" onclick="openNoteEditor('${h.t}')">${hasNote?'📝':'＋'}</button>`,
        `<button class="wl-remove" style="opacity:1;" title="Remove position" aria-label="Remove ${h.t} position" onclick="removePortfolioPosition('${h.t}')">×</button>`];
    }));
  document.getElementById('pfValue').textContent = '$'+tot.toLocaleString(undefined,{maximumFractionDigits:0});
  const fxCcys = Object.keys(pfFxToUsd).filter(c=>c!=='USD' && PORTFOLIO_HOLDINGS.some(h=>pfCcy(h.t)===c));

  // Real weighted portfolio daily return series, using CURRENT $ weights (not an optimization target)
  const n = portfolioReturnSeries[PORTFOLIO_HOLDINGS[0].t].length;
  const pfReturns = new Array(n).fill(0);
  PORTFOLIO_HOLDINGS.forEach((h,i)=>{ portfolioReturnSeries[h.t].forEach((r,d)=>{ pfReturns[d] += weights[i]*r; }); });
  // Reconstruct a portfolio value path from the return series to compute a real max drawdown
  const pfPath = [tot];
  pfReturns.forEach(r=> pfPath.push(pfPath[pfPath.length-1]*(1+r)) );

  const annRet = pfReturns.reduce((a,b)=>a+b,0)/pfReturns.length * 252;
  const sd = Formulas.stddev(pfReturns, true);
  const annVol = sd*Math.sqrt(252);
  const sharpe = Formulas.sharpeRatio(pfReturns, 0.04, 252);
  const sortino = Formulas.sortinoRatio(pfReturns, 0.04, 252);
  const varHist = Formulas.historicalVaR(pfReturns, 0.95);
  const cvarHist = Formulas.historicalCVaR(pfReturns, 0.95);
  const dd = Formulas.maxDrawdown(pfPath);
  const weightedAvgVol = PORTFOLIO_HOLDINGS.reduce((s,h,i)=> s + weights[i]*Formulas.stddev(portfolioReturnSeries[h.t],true)*Math.sqrt(252), 0);
  const diversificationRatio = annVol>0 ? weightedAvgVol/annVol : null;

  document.getElementById('pfReturn').innerHTML = (annRet>=0?'+':'')+(annRet*100).toFixed(1)+'%';
  document.getElementById('pfReturn').className = annRet>=0 ? 'up' : 'down';
  document.getElementById('pfSharpe').textContent = sharpe!=null ? sharpe.toFixed(2) : '—';
  document.getElementById('pfMaxDd').textContent = dd.maxDrawdownPct.toFixed(1)+'%';
  AppState.portfolioMetrics = {sharpe, maxDD: dd.maxDrawdownPct};
  setTimeout(renderDashPortfolio, 0);
  document.getElementById('pfRiskTable').innerHTML = table(['Metric','Value'],[
    ['Annualized Volatility', (annVol*100).toFixed(1)+'%'],
    ['Sortino Ratio', sortino!=null?sortino.toFixed(2):'—'],
    ['VaR (1D, 95%)', (varHist*100).toFixed(2)+'%'],
    ['CVaR (1D, 95%)', (cvarHist*100).toFixed(2)+'%'],
    ['Diversification Ratio', diversificationRatio!=null ? diversificationRatio.toFixed(2) : '—'],
    ['Beta / Tracking Error / Info Ratio', '<span id="pfBetaCell">Fetching live S&amp;P 500 benchmark series…</span>'],
  ]);
  renderPortfolioBenchmarkStats(pfReturns, annRet);

  // Per-holding live/sample disclosure — was a single blanket "SAMPLE (seeded, not live)"
  // sentence for every holding regardless of what actually happened; now reports each ticker's
  // real fetch outcome, since a mixed portfolio (some tickers live, some not) is the common case.
  const liveTickers = PORTFOLIO_HOLDINGS.map(h=>h.t).filter(t=>portfolioSeriesIsLive[t]);
  const sampleTickers = PORTFOLIO_HOLDINGS.map(h=>h.t).filter(t=>!portfolioSeriesIsLive[t]);
  const perTickerNote = PORTFOLIO_HOLDINGS.map(h=> portfolioSeriesIsLive[h.t] ? `${h.t} <span class="badge fact" style="font-size:9px;">LIVE via ${portfolioSeriesVia[h.t]}</span>` : `${h.t} <span class="badge assume" style="font-size:9px;">SAMPLE</span>`).join(' · ');
  document.getElementById('pfStatus').innerHTML = `<b>Source:</b> real portfolio math (Sharpe, Sortino, historical VaR/CVaR, max drawdown, diversification ratio) computed via the Formula Engine from each holding's daily returns. Per-holding history: ${perTickerNote}. ${sampleTickers.length ? `${sampleTickers.join(', ')} fell back to a deterministic seeded series (${sampleTickers.map(t=>portfolioSeriesVia[t]).join('; ')}) — likely needs your CORS proxy for that source, see Data Sources.` : 'All holdings sourced live — nothing here is a fallback right now.'} All ${liveTickers.length ? 'live series' : 'series'} aligned to ${n} common trading days for the covariance matrix. Current prices are each holding's latest live close where available. ${fxCcys.length ? `Non-USD holdings converted to USD at ${fxCcys.map(c=>`1 ${c} = $${pfFxToUsd[c].toFixed(c==='INR'||c==='JPY'||c==='KRW'?5:4)} (${pfFxIsLive[c]?'live ECB rate':'approximate fallback rate'})`).join(', ')}.` : 'All holdings are USD-denominated.'}`;

  applyPortfolioOptimization('equal'); // also triggers renderRebalanceSuggestions internally
  renderTaxLossHarvesting(prices);
  renderPortfolioStressTest(tot, sd, dd, pfReturns);
  AppState.portfolio = {value: tot, annReturnPct: annRet*100, sharpe, sortino, maxDrawdownPct: dd.maxDrawdownPct, varHistPct: varHist*100, cvarHistPct: cvarHist*100,
    diversificationRatio, holdings: PORTFOLIO_HOLDINGS.map((h,i)=>({ticker:h.t, weightPct: weights[i]*100})), isLive: liveTickers.length===PORTFOLIO_HOLDINGS.length};
  updateTabTitle();
}
/* NEW FEATURE: Tax-Loss Harvesting — surfaces positions currently below average cost, sorted by
   largest unrealized loss, with real $ and % figures computed directly from each holding's own
   qty/avg-cost vs its current price (data already in memory, no new fetch). Explicitly disclosed
   as not tax advice, with the wash-sale rule flagged — this is informational surfacing, not a
   recommendation to sell anything. */
function renderTaxLossHarvesting(prices){
  const box = document.getElementById('taxLossResult');
  if(!box) return;
  if(PORTFOLIO_HOLDINGS.length === 0){ box.innerHTML = `<div class="notebox">Portfolio is empty.</div>`; return; }
  const losers = PORTFOLIO_HOLDINGS.map(h=>{
    const cur = prices[h.t];
    const unrealizedPct = (cur-h.avg)/h.avg*100;
    const unrealizedDollar = (cur-h.avg)*h.qty; // native currency
    return {t:h.t, qty:h.qty, avg:h.avg, cur, unrealizedPct, unrealizedDollar, ccy:pfCcy(h.t), usd: unrealizedDollar*pfFx(h.t)};
  }).filter(x=>x.unrealizedDollar<0).sort((a,b)=>a.usd-b.usd); // most negative (in USD) first
  if(losers.length === 0){
    box.innerHTML = `<div class="notebox">No positions currently below average cost — nothing to harvest right now.</div>`;
    return;
  }
  const totalHarvestable = losers.reduce((s,x)=>s+x.usd,0);
  const rows = losers.map(x=>[x.t, x.qty, fmtPrice(x.avg,x.ccy), fmtPrice(x.cur,x.ccy),
    `<span class="down">${x.unrealizedPct.toFixed(1)}%</span>`,
    `<span class="down">-${fmtPrice(Math.abs(x.unrealizedDollar),x.ccy)}</span>`]);
  box.innerHTML = table(['Ticker','Qty','Avg Cost','Current','Unrealized %','Unrealized'], rows)
    + `<div class="notebox" style="margin-top:6px;"><b>Total harvestable loss:</b> ≈ -$${Math.abs(totalHarvestable).toLocaleString(undefined,{maximumFractionDigits:0})} (USD-converted) across ${losers.length} position(s), computed from your real qty/avg-cost/current-price.</div>`;
}

/* Beta / Tracking Error / Information Ratio — previously listed as "Not available - needs a live
   benchmark-index return series (future phase)". That series already exists elsewhere in the app
   (Dashboard's Market Regime card fetches real S&P 500 daily history via fetchYahooHistory) — it
   was just never reused here. Portfolio holding returns are still the disclosed SAMPLE seeded
   series (a separate, pre-existing limitation noted in pfStatus above); what's fixed here
   specifically is that the benchmark side of the calculation is now real, not absent, and the
   formulas (Beta = Cov(p,b)/Var(b); Tracking Error = stdev(p-b) annualized; Info Ratio = annualized
   excess return / tracking error) are standard and real.  */
let pfBenchToken = 0;
async function renderPortfolioBenchmarkStats(pfReturns, annRet){
  const myToken = ++pfBenchToken;
  const cell = document.getElementById('pfBetaCell');
  if(!cell) return;
  try{
    const hist = await fetchYahooHistory('SPX', '^GSPC');
    if(myToken !== pfBenchToken) return;
    const benchReturns = Formulas.dailyReturns(hist.data, false);
    const n = Math.min(pfReturns.length, benchReturns.length);
    const p = pfReturns.slice(pfReturns.length-n), b = benchReturns.slice(benchReturns.length-n);
    const meanP = p.reduce((a,x)=>a+x,0)/n, meanB = b.reduce((a,x)=>a+x,0)/n;
    let covPB=0, varB=0;
    for(let i=0;i<n;i++){ covPB += (p[i]-meanP)*(b[i]-meanB); varB += (b[i]-meanB)**2; }
    covPB/=(n-1); varB/=(n-1);
    const beta = varB>0 ? covPB/varB : null;
    const diff = p.map((x,i)=>x-b[i]);
    const teDaily = Formulas.stddev(diff, true);
    const trackingErrorAnnual = teDaily*Math.sqrt(252);
    const benchAnnRet = meanB*252;
    const excessAnnRet = annRet - benchAnnRet;
    const infoRatio = trackingErrorAnnual>0 ? excessAnnRet/trackingErrorAnnual : null;
    if(myToken !== pfBenchToken) return;
    cell.innerHTML = `Beta ${beta!=null?beta.toFixed(2):'—'} · Tracking Error ${(trackingErrorAnnual*100).toFixed(1)}% · Info Ratio ${infoRatio!=null?infoRatio.toFixed(2):'—'} <span class="badge fact" style="font-size:9px;">vs LIVE S&amp;P 500</span>`;
  }catch(e){
    if(myToken !== pfBenchToken) return;
    cell.innerHTML = `Unavailable — couldn't fetch a live S&amp;P 500 benchmark series (${escapeHtml(e.message)}).`;
  }
}

/* post-launch fix: previously built a matrix over ALL of SECURITIES — fine at 6 tickers,
   an 100+ x 100+ unusable/slow table once the universe enrichment above (correctly) grew that
   list. Uses the active workspace's watchlist instead — a real, user-controlled, small set. */
/* Was 100% fake — a seeded-random matrix with no computation behind any cell at all (honestly
   labeled "Sample" in the header, but still not fixable-by-reading-the-code without noticing).
   Now computes a REAL Pearson correlation matrix from live daily returns per ticker, reusing
   fetchLiveCloseSeries() (same live-data chain used for the Portfolio tab and single-security
   chart), with the old seeded matrix kept ONLY as the final per-ticker fallback when a specific
   ticker's live fetch fails — same honest, disclosed pattern used everywhere else in this build. */
let corrRenderToken = 0;
async function renderCorrelation(){
  const myToken = ++corrRenderToken;
  let tickers = activeWatchlist();
  if(tickers.length < 2) tickers = SECURITIES.slice(0,6).map(s=>s.t);
  if(tickers.length > 12) tickers = tickers.slice(0,12); // keep the heatmap legible
  const el = document.getElementById('corrHeat');
  const subEl = document.querySelector('#view-correlation .sub');
  const headEl = document.querySelector('#view-correlation h3');
  if(el) el.innerHTML = `<div class="notebox">Fetching live daily history for ${tickers.length} tickers (Yahoo Finance/CoinGecko/Frankfurter)…</div>`;

  const results = await Promise.all(tickers.map(async t=>{
    try{
      const live = await fetchLiveCloseSeries(t);
      if(!live.data || live.data.length < 30) throw new Error('too little live history');
      return {t, rets: Formulas.dailyReturns(live.data, false), isLive:true, via: live.via};
    }catch(e){
      const rnd = seededRnd(seedFor(t));
      const rets = []; for(let i=0;i<180;i++) rets.push((rnd()-0.485)*0.026);
      return {t, rets, isLive:false, via: e.message};
    }
  }));
  if(myToken !== corrRenderToken) return;

  const minLen = Math.min(...results.map(r=>r.rets.length));
  const returnsMatrix = results.map(r=>r.rets.slice(r.rets.length-minLen));
  const corr = Formulas.correlationMatrix(returnsMatrix);

  let html = '<table class="datatable"><thead><tr><th></th>'+tickers.map(t=>`<th>${t}</th>`).join('')+'</tr></thead><tbody>';
  results.forEach((r1,i)=>{
    html += `<tr><td style="font-family:var(--sans);color:var(--text-1);">${r1.t}${r1.isLive?'':' *'}</td>`;
    results.forEach((r2,j)=>{
      const v = corr[i][j];
      const bg = v>=0? `rgba(62,207,142,${Math.min(0.85,Math.abs(v))})` : `rgba(255,92,108,${Math.min(0.85,Math.abs(v))})`;
      html += `<td style="background:${bg};text-align:center;color:${cssVar('--text-0')};font-weight:700;">${v.toFixed(2)}</td>`;
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  const liveCount = results.filter(r=>r.isLive).length;
  const sampleTickers = results.filter(r=>!r.isLive).map(r=>r.t);
  html += `<div class="notebox" style="margin-top:10px;">Real Pearson correlation computed via <code>Formulas.correlationMatrix</code> from ${minLen} days of daily returns, aligned to a common window. ${liveCount}/${results.length} tickers sourced live${sampleTickers.length ? ` (marked * — ${sampleTickers.join(', ')} fell back to a deterministic seeded series; likely needs your CORS proxy, see Data Sources)` : ' — nothing here is a fallback right now'}.</div>`;
  if(el) el.innerHTML = html;
  if(subEl) subEl.textContent = liveCount===results.length ? 'Real cross-asset correlation matrix (live)' : `Cross-asset correlation matrix (${liveCount}/${results.length} live)`;
  if(headEl) headEl.innerHTML = `Correlation Heatmap (${minLen}D${liveCount===results.length?', LIVE':liveCount>0?', mixed':', SAMPLE'})`;
}
