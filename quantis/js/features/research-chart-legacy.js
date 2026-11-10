/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/features/research-chart-legacy.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Original Chart.js price chart + technicals computation. The visible chart is now modules/charts.js; this file still computes technicals and feeds currentPriceSeries.
 * DEPENDS   engines/formula-engine.js
 * EXPOSES   renderPriceChartCanvas, computeAndRenderTechnicals (global — classic script, shared scope)
 * LOAD      Classic <script>, order defined in js/manifest.json. Top-level code runs at load,
 *           so it may only call functions from files listed EARLIER in the manifest.
 * NOTE      Migrated verbatim from the single-file build; inline comments marked
 *           "REAL BUG FIXED" / "post-launch fix" document past defects — keep them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* ===================== CHART CONTROLS (real implementation — was all dead buttons) =====================
   Root-caused the "chart buttons don't work" report: the range/type/overlay buttons and the
   whole drawing toolbar existed in HTML with zero event listeners and zero rendering logic
   behind them. Fixed by keeping the full raw OHLC series in memory and re-rendering from it
   whenever a control changes, instead of only ever drawing one fixed line chart. Exotic types
   (Heikin-Ashi/Renko/Point&Figure) and the drawing/annotation toolbar (trend lines, Fibonacci,
   rectangles) are removed rather than left as fake buttons — not implemented, disclosed, not
   faked (spec section 65). Overlays are limited to what's actually computable from the data
   this app has (SMA/EMA/Bollinger); VWAP/Ichimoku/Supertrend need data (real intraday volume,
   or high/low the sample series doesn't have) this build doesn't reliably have, so they're
   removed too rather than drawn wrong. */
let currentPriceRaw = null; // {labels, data, ohlc, live} — the full, unsliced series
const chartControls = { range:'ALL', type:'line', overlays:{sma:false, ema:false, boll:false}, compareMode:false, compareTickers:[] };
const RANGE_DAYS = {'1M':21,'3M':63,'6M':126,'1Y':252,'ALL':100000};

function renderPriceChartCanvas(labels, data, live, ohlc){
  setDataPill(live);
  currentPriceRaw = {labels, data, ohlc: ohlc || {open:data,high:data,low:data,close:data}, live};
  currentPriceSeries = data; currentPriceSeriesIsLive = live; // Formula/Risk/Forecast engines always use the FULL history regardless of the chart's visual range control
  redrawChart();
  computeAndRenderTechnicals();
}

function slicedRaw(){
  if(!currentPriceRaw) return null;
  const n = Math.min(RANGE_DAYS[chartControls.range] || 100000, currentPriceRaw.data.length);
  const s = (arr)=> arr.slice(-n);
  return {
    labels: s(currentPriceRaw.labels), data: s(currentPriceRaw.data), live: currentPriceRaw.live,
    ohlc: { open:s(currentPriceRaw.ohlc.open), high:s(currentPriceRaw.ohlc.high), low:s(currentPriceRaw.ohlc.low), close:s(currentPriceRaw.ohlc.close) }
  };
}

let compareChartToken = 0;
function redrawChart(){
  const raw = slicedRaw();
  if(!raw) return;
  const { labels, data, live } = raw;

  const canvasWrap = document.getElementById('priceChartWrap');
  if(chartControls.compareMode){
    renderComparisonChart(labels, data, live);
    return;
  }
  if(chartControls.type === 'line'){
    if(canvasWrap) canvasWrap.innerHTML = '<canvas id="priceChart" height="90"></canvas>';
    if(priceChart && priceChart.destroy) priceChart.destroy();
    const datasets = [{data, borderColor: live?cssVar('--teal'):cssVar('--amber'), borderWidth:1.6, pointRadius:0, tension:0.15, fill:true, backgroundColor: live?'rgba(45,212,191,0.06)':'rgba(217,164,65,0.08)'}];
    if(chartControls.overlays.sma){ datasets.push({data: rollingSeries(data, arr=>Formulas.sma(arr,20)), borderColor:'#60A5FA', borderWidth:1.2, pointRadius:0, fill:false, label:'SMA20'}); }
    if(chartControls.overlays.ema){ datasets.push({data: rollingSeries(data, arr=>Formulas.ema(arr,20)), borderColor:'#F472B6', borderWidth:1.2, pointRadius:0, fill:false, label:'EMA20'}); }
    if(chartControls.overlays.boll){
      const upper = rollingSeries(data, arr=>{ const b=Formulas.bollinger(arr,20,2); return b?b.upper:null; });
      const lower = rollingSeries(data, arr=>{ const b=Formulas.bollinger(arr,20,2); return b?b.lower:null; });
      datasets.push({data:upper, borderColor:'#A78BFA', borderWidth:1, borderDash:[4,3], pointRadius:0, fill:false, label:'Boll Upper'});
      datasets.push({data:lower, borderColor:'#A78BFA', borderWidth:1, borderDash:[4,3], pointRadius:0, fill:false, label:'Boll Lower'});
    }
    priceChart = safeNewChart('priceChart', {type:'line', data:{labels, datasets},
      options:{responsive:true,plugins:{legend:{display:false}},scales:{x:{display:false},y:{grid:{color:cssVar('--line-soft')},ticks:{color:cssVar('--text-2'),font:{family:'JetBrains Mono',size:10}}}},interaction:{mode:'index',intersect:false}}});
  } else {
    // Candlestick / OHLC — hand-rolled canvas 2D renderer (no extra CDN dependency, so it can
    // never be taken down by a blocked third-party financial-charting plugin).
    if(canvasWrap) canvasWrap.innerHTML = '<canvas id="priceChart" height="90"></canvas>';
    if(priceChart && priceChart.destroy) priceChart.destroy();
    priceChart = null;
    drawCandleCanvas(raw.ohlc, chartControls.type, live);
  }
  const noteEl = document.getElementById('chartDataNote');
  if(noteEl) noteEl.textContent = live ? 'Live daily closes (CNBC); candles and OHLC bars use the real daily open/high/low/close.' : 'Sample series — OHLC wicks are synthesized around the sample close price, not real intraday data.';
  syncChartControlsUI();
}
/* Multi-asset comparison overlay — was entirely absent; Research only ever showed one security
   at a time, so answering "how did MSFT do vs NVDA over this period" meant manually flipping
   back and forth and remembering numbers. Normalizes every series (the primary ticker + up to
   4 typed compare tickers) to % change from the first common day, so tickers at wildly
   different price levels ($20 vs $2,000) are still visually comparable on one y-axis — same
   convention Bloomberg/TradingView-style comparison charts use. Compare tickers reuse
   fetchLiveCloseSeries() (the same live-data chain proven for Portfolio/Correlation), with a
   disclosed sample fallback per ticker exactly like those two tabs. */
async function renderComparisonChart(primaryLabels, primaryData, primaryLive){
  const myToken = ++compareChartToken;
  const canvasWrap = document.getElementById('priceChartWrap');
  if(canvasWrap) canvasWrap.innerHTML = '<canvas id="priceChart" height="90"></canvas>';
  if(priceChart && priceChart.destroy) priceChart.destroy();
  const compareTickers = chartControls.compareTickers.filter(t=>t!==currentSecurity);
  const palette = ['#60A5FA','#F472B6','#FBBF24','#34D399'];
  const series = [{t: currentSecurity, data: primaryData, isLive: primaryLive, via: primaryLive?'already loaded':'sample'}];
  if(compareTickers.length){
    const noteEl = document.getElementById('chartDataNote');
    if(noteEl) noteEl.textContent = `Fetching live history for ${compareTickers.join(', ')}…`;
    const fetched = await Promise.all(compareTickers.map(async t=>{
      try{
        const live = await fetchLiveCloseSeries(t);
        if(!live.data || live.data.length < 5) throw new Error('too little live history');
        return {t, data: live.data, isLive:true, via: live.via};
      }catch(e){
        const rnd = seededRnd(seedFor(t));
        const n = primaryData.length;
        const data = [100]; for(let i=1;i<n;i++) data.push(data[i-1]*(1+(rnd()-0.485)*0.026));
        return {t, data, isLive:false, via: e.message};
      }
    }));
    series.push(...fetched);
  }
  if(myToken !== compareChartToken) return; // ticker or compare list changed again mid-fetch
  const minLen = Math.min(...series.map(s=>s.data.length));
  const datasets = series.map((s,i)=>{
    const window_ = s.data.slice(s.data.length-minLen);
    const base = window_[0];
    const pctSeries = window_.map(v => ((v/base)-1)*100);
    return {
      data: pctSeries, label: s.t + (s.isLive?'':' (sample)'),
      borderColor: i===0 ? cssVar('--teal') : palette[(i-1)%palette.length],
      borderWidth: i===0?1.8:1.3, pointRadius:0, tension:0.12, fill:false
    };
  });
  const labels = primaryLabels.slice(primaryLabels.length-minLen);
  priceChart = safeNewChart('priceChart', {type:'line', data:{labels, datasets},
    options:{responsive:true,plugins:{legend:{display:true,labels:{color:cssVar('--text-1'),font:{family:'JetBrains Mono',size:10},boxWidth:10}}},
      scales:{x:{display:false},y:{grid:{color:cssVar('--line-soft')},ticks:{color:cssVar('--text-2'),font:{family:'JetBrains Mono',size:10},callback:v=>v.toFixed(0)+'%'}}},interaction:{mode:'index',intersect:false}}});
  const noteEl = document.getElementById('chartDataNote');
  if(noteEl){
    const liveCount = series.filter(s=>s.isLive).length;
    const sampleList = series.filter(s=>!s.isLive).map(s=>s.t);
    noteEl.innerHTML = `Normalized % return comparison, ${minLen} common trading days, rebased to 0% at the start of this window. ${liveCount}/${series.length} series live${sampleList.length?` (${escapeHtml(sampleList.join(', '))} fell back to a seeded sample series)`:''}.`;
  }
  syncChartControlsUI();
}
function syncChartControlsUI(){
  // After renderPanels() rebuilds the toolbar HTML (on every security switch), the buttons
  // reset to their default markup state — this re-applies whatever the user actually has
  // selected so the UI never shows the wrong control as "active".
  document.querySelectorAll('.chart-toolbar [data-range]').forEach(b=>b.classList.toggle('active', b.dataset.range===chartControls.range));
  document.querySelectorAll('.chart-toolbar [data-type]').forEach(b=>b.classList.toggle('active', b.dataset.type===chartControls.type));
  document.querySelectorAll('.chart-toolbar [data-overlay]').forEach(b=>b.classList.toggle('active', !!chartControls.overlays[b.dataset.overlay]));
  const compareChip = document.getElementById('compareChip'), compareInput = document.getElementById('compareInput');
  if(compareChip) compareChip.classList.toggle('active', chartControls.compareMode);
  if(compareInput){
    compareInput.style.display = chartControls.compareMode ? 'inline-block' : 'none';
    if(document.activeElement !== compareInput) compareInput.value = chartControls.compareTickers.join(', ');
  }
}
function rollingSeries(data, fn){
  // Produces a same-length array where index i is fn(data[0..i]) once enough history exists, else null.
  return data.map((_,i)=> i<19 ? null : fn(data.slice(0,i+1)));
}
function drawCandleCanvas(ohlc, type, live){
  const canvas = document.getElementById('priceChart');
  if(!canvas || typeof canvas.getContext !== 'function'){ return; }
  let ctx2d;
  try{ ctx2d = canvas.getContext('2d'); }catch(e){ ctx2d = null; }
  if(!ctx2d){
    const wrap = document.getElementById('priceChartWrap');
    if(wrap) wrap.innerHTML = '<div class="notebox" style="color:var(--down);">Canvas rendering unavailable in this environment.</div>';
    return;
  }
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 600, h = 260;
  canvas.width = w*dpr; canvas.height = h*dpr; canvas.style.height = h+'px';
  ctx2d.scale(dpr,dpr);
  ctx2d.clearRect(0,0,w,h);
  const {open,high,low,close} = ohlc;
  const n = close.length;
  if(n < 2) return;
  const allHigh = Math.max(...high), allLow = Math.min(...low);
  const pad = (allHigh-allLow)*0.08 || 1;
  const yMax = allHigh+pad, yMin = allLow-pad;
  const yToPx = (v)=> h - ((v-yMin)/(yMax-yMin))*h;
  const slotW = w/n;
  const bodyW = Math.max(1, slotW*0.6);
  for(let i=0;i<n;i++){
    const x = i*slotW + slotW/2;
    const up = close[i] >= open[i];
    const color = up ? cssVar('--up') : cssVar('--down');
    ctx2d.strokeStyle = color; ctx2d.fillStyle = color; ctx2d.lineWidth = 1;
    // wick
    ctx2d.beginPath(); ctx2d.moveTo(x, yToPx(high[i])); ctx2d.lineTo(x, yToPx(low[i])); ctx2d.stroke();
    if(type === 'candles'){
      const yO = yToPx(open[i]), yC = yToPx(close[i]);
      const top = Math.min(yO,yC), bh = Math.max(1, Math.abs(yC-yO));
      ctx2d.fillRect(x-bodyW/2, top, bodyW, bh);
    } else { // OHLC bars
      const yO = yToPx(open[i]), yC = yToPx(close[i]);
      ctx2d.beginPath(); ctx2d.moveTo(x-bodyW/2, yO); ctx2d.lineTo(x, yO); ctx2d.stroke();
      ctx2d.beginPath(); ctx2d.moveTo(x, yC); ctx2d.lineTo(x+bodyW/2, yC); ctx2d.stroke();
    }
  }
}

/* Computes real technical indicators from whatever price series is currently loaded
   (live Stooq closes or the sample random walk) via the Formula Engine above — nothing
   in this panel is a hardcoded number once this runs. */
let currentPriceSeries = null, currentPriceSeriesIsLive = false;
function computeAndRenderTechnicals(){
  const statusEl = document.getElementById('techStatus');
  const momEl = document.getElementById('techMomentum');
  const trendEl = document.getElementById('techTrend');
  const volEl = document.getElementById('techVol');
  const sigEl = document.getElementById('techSignals');
  if(!statusEl || !currentPriceSeries || currentPriceSeries.length < 30) return;

  const s = currentPriceSeries;
  const rsi14 = Formulas.rsi(s,14);
  // Writes the real computed RSI back into this ticker's SECURITIES record when sourced from a
  // live price series, same pattern as updateLiveQuote() for price and fillKeyStatsAndRatios()
  // for P/E/ROE/Market Cap above — so the Screener's RSI filter reflects real data for any
  // ticker the user has actually researched, instead of the initial seeded value forever.
  if(currentPriceSeriesIsLive && rsi14!=null){
    const secRec = SECURITIES.find(x=>x.t===currentSecurity);
    if(secRec){ secRec.rsi = Math.round(rsi14*10)/10; secRec._rsiIsLive = true; }
  }
  const stochK = Formulas.stochK(s,14);
  const willR = Formulas.williamsR(s,14);
  const roc10 = Formulas.roc(s,10);
  const macdRes = Formulas.macd(s);
  const sma20 = Formulas.sma(s,20);
  const sma50 = Formulas.sma(s,50);
  const sma200 = Formulas.sma(s,200);
  const histVol = Formulas.historicalVolAnnualized(s,30);
  const boll = Formulas.bollinger(s,20,2);
  const last = s[s.length-1];
  // Real high/low series when the feed provided them (Stooq/Yahoo both do); falls back to
  // close-only approximations below if not (e.g. a synthetic sample series with flat OHLC).
  const ohlc = currentPriceRaw && currentPriceRaw.ohlc;
  const hasRealOhlc = ohlc && ohlc.high && ohlc.high.some((h,i)=>h !== ohlc.low[i]);
  const atr = hasRealOhlc ? Formulas.atrReal(ohlc.high, ohlc.low, ohlc.close, 14) : Formulas.atrApprox(s,14);
  const adx14 = hasRealOhlc ? Formulas.adx(ohlc.high, ohlc.low, ohlc.close, 14) : null;
  const cci20 = hasRealOhlc ? Formulas.cci(ohlc.high, ohlc.low, ohlc.close, 20) : null;
  const fib = hasRealOhlc ? Formulas.fibRetracement(ohlc.high, ohlc.low) : Formulas.fibRetracement(s, s);

  statusEl.innerHTML = `<b>Source:</b> computed live from the ${currentPriceSeriesIsLive?'<span class="badge fact">LIVE</span> price series above':'<span class="badge assume">SAMPLE</span> price series above'} using the real formulas in the Formula Engine (see Tests tab for validation) — not hardcoded.`;
  renderScoreChips(); // Technical/Momentum/Risk chips depend on this price series — refresh now that it's actually loaded
  renderQuickReportPreview(); // same reason — its technical/valuation wording depends on this data too
  momEl.innerHTML = kv([
    ['RSI (14)', rsi14!=null ? rsi14.toFixed(1) : '—'],
    ['Stoch %K (14)', stochK!=null ? stochK.toFixed(1) : '—'],
    ["Williams %R (14)", willR!=null ? willR.toFixed(1) : '—'],
    ['ROC (10)', roc10!=null ? (roc10>=0?'+':'')+roc10.toFixed(2)+'%' : '—'],
    ['CCI (20)', cci20!=null ? cci20.toFixed(1) : (hasRealOhlc?'—':'needs real high/low — sample series is flat')],
  ]);
  trendEl.innerHTML = kv([
    ['MACD', macdRes && macdRes.macd!=null ? macdRes.macd.toFixed(2) : '—'],
    ['Signal', macdRes && macdRes.signal!=null ? macdRes.signal.toFixed(2) : '—'],
    ['20-period SMA', sma20!=null ? sma20.toFixed(2) : '—'],
    ['50-period SMA', sma50!=null ? sma50.toFixed(2) : '—'],
    ['200-period SMA', sma200!=null ? sma200.toFixed(2) : 'not enough history loaded'],
    ['ADX (14)', adx14!=null ? adx14.toFixed(1)+(adx14>25?' (trending)':' (range-bound)') : (hasRealOhlc?'—':'needs real high/low')],
  ]);
  volEl.innerHTML = kv([
    ['ATR (14)', atr!=null ? atr.toFixed(2)+(hasRealOhlc?' (real Wilder ATR)':' (close-only approx)') : '—'],
    ['Hist. Vol (30D, annualized)', histVol!=null ? histVol.toFixed(1)+'%' : '—'],
    ['Bollinger Upper / Lower', boll ? boll.upper.toFixed(2)+' / '+boll.lower.toFixed(2) : '—'],
  ]);
  const fibEl = document.getElementById('techFib');
  if(fibEl){
    if(fib){
      fibEl.innerHTML = table(['Level','Price'], fib.levels.map(l=>[l.pct===0?'0% (swing high)':l.pct===1?'100% (swing low)':(l.pct*100).toFixed(1)+'%', l.price.toFixed(2)]))
        + `<div class="notebox" style="margin-top:6px;">Swing high ${fib.swingHigh.toFixed(2)} / swing low ${fib.swingLow.toFixed(2)} over the ${hasRealOhlc?'real high/low':'close-price'} range currently loaded (changes with the chart's range control) — not fixed percentages of nothing.</div>`;
    } else fibEl.innerHTML = '<div class="notebox">Not enough price history loaded yet.</div>';
  }
  const maEl = document.getElementById('techMaRibbon');
  if(maEl){
    const rows = [];
    if(sma20!=null) rows.push(['20 SMA', sma20.toFixed(2), last>sma20?'Price above':'Price below']);
    if(sma50!=null) rows.push(['50 SMA', sma50.toFixed(2), last>sma50?'Price above':'Price below']);
    if(sma200!=null) rows.push(['200 SMA', sma200.toFixed(2), last>sma200?'Price above (long-term uptrend)':'Price below (long-term downtrend)']);
    maEl.innerHTML = (rows.length ? table(['MA','Value','Position vs. current price ('+last.toFixed(2)+')'], rows) : '<div class="notebox">Not enough history loaded yet.</div>');
  }

  // Simple, fully documented rule-based signal split (not a trained model — disclosed as such above):
  // bullish points for RSI<30 (oversold->bounce), price>SMA20>SMA50 (uptrend), MACD>signal.
  let bullPts=0, bearPts=0;
  if(rsi14!=null){ if(rsi14<30) bullPts++; else if(rsi14>70) bearPts++; }
  if(sma20!=null && sma50!=null){ if(sma20>sma50) bullPts++; else bearPts++; }
  if(macdRes && macdRes.macd!=null && macdRes.signal!=null){ if(macdRes.macd>macdRes.signal) bullPts++; else bearPts++; }
  if(last!=null && sma20!=null){ if(last>sma20) bullPts++; else bearPts++; }
  const totalPts = bullPts+bearPts;
  const bullPct = totalPts ? Math.round((bullPts/totalPts)*70)+15 : 34; // keep it within a sane 15-85 band, never 0/100 absolutism
  const bearPct = totalPts ? Math.round((bearPts/totalPts)*70)+15 : 33;
  const neutPct = Math.max(0, 100-bullPct-bearPct);
  sigEl.innerHTML = bar('Bullish',bullPct,100,'var(--up)')+bar('Neutral',neutPct,100,'var(--text-2)')+bar('Bearish',bearPct,100,'var(--down)');

  currentTechnicals = {rsi14, sma20, sma50, macd: macdRes, histVol};
  AppState.technicals = {...currentTechnicals, roc10, stochK, willR, atr, boll, lastPrice: s[s.length-1], isLive: currentPriceSeriesIsLive};
  runForecast();
  computeAndRenderRisk();

  /* Per-security Market Regime (Overview tab) — same real ADX(14)+50-SMA rule-based
     classification already built for the Dashboard's S&P 500 card (renderMarketRegime),
     just applied to the currently loaded security's own price series instead of always
     the index. Replaces what used to be a static "WEAK BULL" label with a note admitting
     it was never computed. */
  const ovLabelEl = document.getElementById('ovRegimeLabel'), ovNoteEl = document.getElementById('ovRegimeNote'), ovBadgeEl = document.getElementById('ovRegimeBadge');
  if(ovLabelEl){
    if(!hasRealOhlc){
      ovLabelEl.textContent = 'INSUFFICIENT DATA'; ovLabelEl.style.color = 'var(--text-2)';
      ovNoteEl.innerHTML = `Needs real daily high/low data (not available for this ${currentPriceSeriesIsLive?'series':'sample series, which is close-only'}) to compute ADX — see Data Sources for live feeds.`;
      if(ovBadgeEl){ ovBadgeEl.textContent = 'SAMPLE'; ovBadgeEl.className = 'badge assume'; }
    } else {
      const trending = adx14!=null && adx14 > 25;
      const bullish = sma50!=null && last > sma50;
      let regime, color;
      if(adx14==null || sma50==null){ regime='INSUFFICIENT DATA'; color='var(--text-2)'; }
      else if(trending && bullish){ regime='TRENDING BULL'; color='var(--up)'; }
      else if(trending && !bullish){ regime='TRENDING BEAR'; color='var(--down)'; }
      else if(adx14 <= 20){ regime='RANGE-BOUND / CHOPPY'; color='var(--amber)'; }
      else{ regime = bullish ? 'WEAK BULL' : 'WEAK BEAR'; color='var(--amber)'; }
      ovLabelEl.textContent = regime; ovLabelEl.style.color = color;
      ovNoteEl.innerHTML = `${currentSecurity}: ADX(14) = ${adx14!=null?adx14.toFixed(1):'—'} (${adx14>25?'trending':adx14<=20?'range-bound':'weak trend'}), price ${bullish?'above':'below'} its 50-day SMA, computed from the ${currentPriceSeriesIsLive?'<span class="badge fact" style="font-size:9px;">LIVE</span> price series':'<span class="badge assume" style="font-size:9px;">SAMPLE</span> price series'} above. ADX&gt;25 = trending; &le;20 = range-bound; between = weak trend. Real, documented, rule-based — not a machine-learned regime model.`;
      if(ovBadgeEl){ ovBadgeEl.textContent = currentPriceSeriesIsLive?'LIVE':'SAMPLE'; ovBadgeEl.className = currentPriceSeriesIsLive?'badge fact':'badge assume'; }
    }
  }
}
