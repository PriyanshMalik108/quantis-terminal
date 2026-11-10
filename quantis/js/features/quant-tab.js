/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/features/quant-tab.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Quant tab: return statistics, seasonality, Monte Carlo.
 * DEPENDS   engines/*
 * EXPOSES   renderQuant (global — classic script, shared scope)
 * LOAD      Classic <script>, order defined in js/manifest.json. Top-level code runs at load,
 *           so it may only call functions from files listed EARLIER in the manifest.
 * NOTE      Migrated verbatim from the single-file build; inline comments marked
 *           "REAL BUG FIXED" / "post-launch fix" document past defects — keep them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* ===================== QUANT TAB (post-launch fix) =====================
   Root-caused a real bug matching the "hardcoded, whole dashboard not working" report exactly:
   this panel was 7 literal hardcoded numbers (Mean Daily Return 0.06%, Std Dev 1.32%, etc.)
   that never changed for any ticker, ever — not sample-labeled-and-varying, just frozen. Mean
   return, std dev, skewness, kurtosis, and lag-1 autocorrelation are now computed for real from
   the same currentPriceSeries used by Risk/Technicals — genuinely real when the price series is
   live, genuinely computed-from-sample-data when it isn't (labeled accordingly either way).
   The four formal hypothesis tests (ADF, Jarque-Bera, Ljung-Box, ARCH) need more than summary
   statistics to implement correctly (critical value tables, iterative estimation) — rather than
   fake test statistics, that section stays honestly labeled SAMPLE instead of pretending. */
function computeAndRenderQuant(){
  const s = currentPriceSeries;
  const el1 = document.getElementById('quantReturnStats');
  const el2 = document.getElementById('quantTests');
  const statusEl = document.getElementById('quantStatus');
  if(!el1 || !s || s.length < 10) return;
  const returns = Formulas.dailyReturns(s, false);
  const mean = returns.reduce((a,b)=>a+b,0)/returns.length;
  const sd = Formulas.stddev(returns, true);
  const skew = Formulas.skewness(returns);
  const kurt = Formulas.kurtosis(returns);
  const ac1 = Formulas.autocorrelation(returns, 1);
  el1.innerHTML = kv([
    ['Mean Daily Return', (mean*100).toFixed(3)+'%'],
    ['Std Dev (daily)', (sd*100).toFixed(2)+'%'],
    ['Skewness', skew!=null?skew.toFixed(2):'—'],
    ['Excess Kurtosis', kurt!=null?kurt.toFixed(2):'—'],
    ['Autocorrelation (lag 1)', ac1!=null?ac1.toFixed(2):'—'],
  ]);
  el2.innerHTML = renderQuantTests(returns);
  if(statusEl) statusEl.innerHTML = `<b>Source:</b> Mean/Std Dev/Skewness/Kurtosis/Autocorrelation computed live from the ${currentPriceSeriesIsLive?'real':'sample'} price series (${s.length} observations) via <code>Formulas</code> — not looked up or frozen.`;
  renderSeasonality();
}
/* NEW FEATURE: Seasonality Analysis — "does this stock tend to do better in certain months?" is
   a real, commonly-asked research question with no answer anywhere in this app before. Pure
   computation on the same daily-return series already used above; the ONLY reason this needs a
   dedicated guard is that sample price data uses plain integer day-indices as labels (0,1,2...),
   not real calendar dates — so seasonality is honestly reported as unavailable for sample data
   rather than computing nonsense "January returns" from fake dates. Real average return AND
   real hit-rate (% of periods positive) per calendar month, both real statistics, not a single
   cherry-picked number. */
function renderSeasonality(){
  const box = document.getElementById('seasonalityBox');
  const badge = document.getElementById('seasonalityBadge');
  if(!box) return;
  if(!currentPriceSeriesIsLive || !currentPriceRaw || !currentPriceRaw.labels){
    box.innerHTML = `<div class="notebox">Needs a live price series with real calendar dates — sample data uses placeholder day-indices, not real dates, so monthly seasonality can't be honestly computed from it. Load a live security to see this.</div>`;
    if(badge){ badge.textContent='N/A — sample data'; badge.className='badge assume'; }
    return;
  }
  const labels = currentPriceRaw.labels, data = currentPriceRaw.data;
  if(labels.length < 60){
    box.innerHTML = `<div class="notebox">Need at least a few months of history for month-level seasonality to mean anything (have ${labels.length} days).</div>`;
    return;
  }
  const monthReturns = Array.from({length:12}, ()=>[]);
  for(let i=1;i<data.length;i++){
    const d = new Date(labels[i]);
    if(isNaN(d.getTime())) continue;
    const ret = (data[i]-data[i-1])/data[i-1];
    monthReturns[d.getMonth()].push(ret);
  }
  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const rows = MONTH_NAMES.map((name,i)=>{
    const rets = monthReturns[i];
    if(rets.length < 5) return [name, '—', '—', `${rets.length} obs`];
    const meanDaily = rets.reduce((a,b)=>a+b,0)/rets.length;
    const hitRate = rets.filter(r=>r>0).length/rets.length*100;
    const annualizedApprox = meanDaily*21*100; // ~21 trading days/month, expressed as an average monthly % for readability
    return [name, `<span class="${annualizedApprox>=0?'up':'down'}">${annualizedApprox>=0?'+':''}${annualizedApprox.toFixed(2)}%</span>`, hitRate.toFixed(0)+'%', `${rets.length} days`];
  });
  const years = ((new Date(labels[labels.length-1])) - (new Date(labels[0]))) / (365.25*24*3600*1000);
  box.innerHTML = table(['Month','Avg Monthly Return','Hit Rate (days positive)','Sample Size'], rows)
    + `<div class="notebox" style="margin-top:8px;">Computed from ~${years.toFixed(1)} years of real daily price history (${labels[0]} to ${labels[labels.length-1]}). "Avg Monthly Return" is the average daily return in that calendar month × ~21 trading days, not a compounded monthly figure. With only a handful of years of history, these are noisy small-sample statistics, not a reliable trading signal — treat this as a research starting point, not a prediction.</div>`;
  if(badge){ badge.textContent='LIVE'; badge.className='badge fact'; }
}
/* Crypto Fear & Greed Index — free, keyless, CORS-open public API (alternative.me), a
   genuinely real and widely-referenced sentiment gauge. Cached briefly since the index itself
   only updates once a day. */
async function fetchFearGreedLive(){
  const {res, via} = await fetchViaProxyChain('https://api.alternative.me/fng/?limit=1');
  const json = await res.json();
  const d = json?.data?.[0];
  if(!d) throw new Error('Unexpected response shape from alternative.me');
  return {value: parseInt(d.value,10), classification: d.value_classification, timestamp: parseInt(d.timestamp,10)*1000, via};
}
async function fetchFearGreed(){ return cachedFetch('fear_greed_v1', 30*60*1000, fetchFearGreedLive); }
