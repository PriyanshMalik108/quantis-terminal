/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/features/factors-tab.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Factor loadings tab.
 * DEPENDS   engines/*
 * EXPOSES   renderFactors (global — classic script, shared scope)
 * LOAD      Classic <script>, order defined in js/manifest.json. Top-level code runs at load,
 *           so it may only call functions from files listed EARLIER in the manifest.
 * NOTE      Migrated verbatim from the single-file build; inline comments marked
 *           "REAL BUG FIXED" / "post-launch fix" document past defects — keep them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* ===================== FACTORS TAB (post-launch fix) =====================
   Same bug as Quant: 5 frozen hardcoded numbers regardless of ticker. Real Fama-French factor
   loadings need Kenneth French's data library (size/value/profitability/investment factor
   returns) — no free, keyless, CORS-friendly source for that exists. Rather than either leaving
   it frozen or fabricating a fake "live" computation, this generates a per-ticker deterministic
   sample (same seeding approach used elsewhere) so at least it's honestly ticker-specific,
   clearly labeled SAMPLE throughout — a real fix for "never changes", not a claim of accuracy
   this build can't back up. */
/* Factor loadings, estimated live. Kenneth French's factor library can't be fetched from a
   browser, so the standard practitioner substitute is used: long-short ETF return spreads as
   factor proxies, all from CNBC daily history —
     Market = S&P 500 (SPY)          Size  = small minus large (IWM − SPY)
     Value  = value minus growth (IWD − IWF)   Momentum = MTUM − SPY   Quality = QUAL − SPY
   The stock's daily returns are regressed on these over the last two years (OLS, Formula
   Engine), giving real betas, t-statistics, annualised alpha, R² and residual risk. Securities
   outside the US are regressed on their own home index (single-factor CAPM), since US style
   spreads don't describe them. */
const FACTOR_PROXIES = {MKT:'SPY', SMALL:'IWM', VALUE:'IWD', GROWTH:'IWF', MOM:'MTUM', QUAL:'QUAL'};
const HOME_INDEX_BY_COUNTRY = {'India':'.NSEI','United Kingdom':'.FTSE','Germany':'.GDAXI','France':'.FCHI','Netherlands':'.AEX','Switzerland':'.SSMI','Japan':'.N225',
  'South Korea':'.KS11','Hong Kong':'.HSI','China':'.HSI','Australia':'.AXJO','Canada':'.GSPTSE','Taiwan':'.TWII'};
function alignedReturns(seriesList){
  // seriesList: [{labels, data}] -> date-aligned simple returns over the common dates
  const maps = seriesList.map(sr=>{ const m = new Map(); sr.labels.forEach((d,i)=>m.set(d, sr.data[i])); return m; });
  const common = seriesList[0].labels.filter(d=>maps.every(m=>m.has(d)));
  const rets = seriesList.map(()=>[]);
  for(let i=1;i<common.length;i++){
    maps.forEach((m,k)=>{ const a = m.get(common[i-1]), b = m.get(common[i]); rets[k].push(a ? b/a-1 : 0); });
  }
  return {dates: common.slice(1), rets};
}
let factorsToken = 0;
async function computeAndRenderFactors(){
  const el = document.getElementById('factorsContent');
  if(!el) return;
  const myToken = ++factorsToken;
  const t = currentSecurity;
  const sec = SECURITIES.find(x=>x.t===t) || {};
  el.innerHTML = `<div class="notebox">Estimating factor loadings for ${escapeHtml(t)} from live daily returns…</div>`;
  try{
    const stock = await fetchYahooHistory(t, yahooSymbolFor(t));
    const isUS = (sec.ctry||'United States') === 'United States' && !['Crypto','FX','Commodity','Index'].includes(sec.cls);
    const homeIdx = HOME_INDEX_BY_COUNTRY[sec.ctry];
    const window2y = 504;
    let names, seriesList;
    if(isUS){
      const etfs = await Promise.all(['MKT','SMALL','VALUE','GROWTH','MOM','QUAL'].map(k=>LD.bars(FACTOR_PROXIES[k], 3)));
      seriesList = [stock, ...etfs];
      names = ['Market (β)','Size (SMB)','Value (HML)','Momentum (UMD)','Quality (QMJ)'];
    } else {
      const idx = await LD.bars(homeIdx || '.SPX', 3);
      seriesList = [stock, idx];
      names = [`Market (β vs ${homeIdx ? escapeHtml(homeIdx.replace('.','')) : 'S&P 500'})`];
    }
    if(myToken !== factorsToken) return;
    const trimmed = seriesList.map(sr=>({labels: sr.labels.slice(-(window2y+80)), data: sr.data.slice(-(window2y+80))}));
    const {dates, rets} = alignedReturns(trimmed);
    const n = Math.min(window2y, dates.length);
    if(n < 120) throw new Error('not enough overlapping daily history ('+n+' days)');
    const tail = a => a.slice(-n);
    const y = tail(rets[0]);
    let X;
    if(isUS){
      const mkt = tail(rets[1]), small = tail(rets[2]), val = tail(rets[3]), gro = tail(rets[4]), mom = tail(rets[5]), qual = tail(rets[6]);
      X = y.map((_,i)=>[1, mkt[i], small[i]-mkt[i], val[i]-gro[i], mom[i]-mkt[i], qual[i]-mkt[i]]);
    } else {
      const mkt = tail(rets[1]);
      X = y.map((_,i)=>[1, mkt[i]]);
    }
    const fit = Formulas.ols(y, X);
    if(!fit) throw new Error('regression was singular for this window');
    const alphaAnn = fit.beta[0]*252*100;
    const residVol = Formulas.stddev(fit.resid, true)*Math.sqrt(252)*100;
    const rows = names.map((nm,i)=>{
      const b = fit.beta[i+1], se = fit.se[i+1], tstat = se>0 ? b/se : null;
      const sig = tstat!=null && Math.abs(tstat) >= 1.96;
      return [nm, `<b>${b.toFixed(2)}</b>`, tstat!=null ? tstat.toFixed(2) : '—', sig ? '<span class="up">significant (5%)</span>' : '<span style="color:var(--text-2)">not significant</span>'];
    });
    const barsHtml = names.map((nm,i)=>{ const b = fit.beta[i+1]; return bar(nm, Math.abs(b), i===0?2:1.5, b>=0?'var(--teal)':'var(--down)', (b>=0?'+':'')+b.toFixed(2)); }).join('');
    el.innerHTML = `<div class="grid grid-2">
      <div class="card"><h3>${isUS ? 'Style Factor Loadings' : 'Market Factor Loading'} <span class="badge fact">LIVE regression</span></h3>${barsHtml}${table(['Factor','Loading','t-stat','At 5%'], rows)}</div>
      <div class="card"><h3>Model Fit <span class="badge fact">LIVE</span></h3>${kv([
        ['Alpha (annualised)', `<span class="${alphaAnn>=0?'up':'down'}">${alphaAnn>=0?'+':''}${alphaAnn.toFixed(1)}%</span> (t = ${(fit.se[0]>0?fit.beta[0]/fit.se[0]:0).toFixed(2)})`],
        ['R²', fit.r2.toFixed(2)+` — ${(fit.r2*100).toFixed(0)}% of daily variance explained`],
        ['Residual (idiosyncratic) risk', residVol.toFixed(1)+'% annualised'],
        ['Window', `${n} trading days, ${dates[dates.length-n]} → ${dates[dates.length-1]}`],
      ])}</div></div>
      <div class="notebox" style="margin-top:10px;">${isUS
        ? 'OLS of daily returns on ETF-spread factor proxies (Market = SPY; Size = IWM − SPY; Value = IWD − IWF; Momentum = MTUM − SPY; Quality = QUAL − SPY), all live CNBC history. These proxies track the academic Fama-French/Carhart factors closely but are not identical to Kenneth French\'s published series. |t| ≥ 1.96 ⇒ significant at 5%.'
        : `Single-factor (CAPM) regression on the security's home market index using live CNBC history. US style spreads (size/value/momentum) don't describe ${escapeHtml(sec.ctry||'non-US')} securities, so they're deliberately not applied.`}</div>`;
    AppState.factors = {ticker:t, betas: fit.beta, r2: fit.r2, alphaAnn};
  }catch(e){
    if(myToken !== factorsToken) return;
    el.innerHTML = `<div class="notebox">Factor loadings need live daily history for ${escapeHtml(t)} and the factor ETFs, which couldn't be loaded right now (${escapeHtml(e.message)}). Nothing is estimated without data.</div>`;
  }
}
