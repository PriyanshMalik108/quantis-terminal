/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/core/app-state.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   AppState — the computed results other features (AI, reports) read from.
 * DEPENDS   nothing
 * EXPOSES   AppState (global — classic script, shared scope)
 * LOAD      Classic <script>, order defined in js/manifest.json. Top-level code runs at load,
 *           so it may only call functions from files listed EARLIER in the manifest.
 * NOTE      Migrated verbatim from the single-file build; inline comments marked
 *           "REAL BUG FIXED" / "post-launch fix" document past defects — keep them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* ===================== SHARED APP STATE (Phase 6) =====================
   A single place every compute function (DCF, forecast, risk, portfolio, fundamentals) writes
   its real output to, so the AI assistant and report/export engines can read actual computed
   numbers instead of re-deriving or — worse — inventing them. Anything not yet computed for
   the current security stays null and is reported as "data unavailable", never guessed. */
const AppState = { technicals:null, dcf:null, forecast:null, risk:null, portfolio:null, fundamentals:null, options:null };

function runForecast(){
  const statusEl = document.getElementById('predStatus');
  const headlineEl = document.getElementById('predHeadline');
  const detailEl = document.getElementById('predDetail');
  const tableEl = document.getElementById('modelEnsembleTable');
  const driversEl = document.getElementById('predDrivers');
  if(!statusEl || !currentPriceSeries || currentPriceSeries.length < 110){
    if(statusEl) statusEl.innerHTML = 'Not enough price history loaded yet to backtest a 20-day-ahead forecast (need 110+ points) — showing nothing rather than a fabricated number.';
    if(headlineEl) headlineEl.textContent = '—';
    if(tableEl) tableEl.innerHTML = '';
    return;
  }
  const series = currentPriceSeries;
  const horizon = 20;
  const last = series[series.length-1];

  // Backtest every model, then predict "now" with every model.
  const results = FORECAST_MODEL_LIST.map(m=>{
    const bt = walkForwardBacktest(series, m.key, horizon, 40);
    const pred = Forecasts[m.key](series, horizon);
    const predPct = ((pred-last)/last)*100;
    return {...m, bt, pred, predPct};
  });

  // Performance-based ensemble weighting (spec section 16): weight ∝ 1/MAE from each model's OWN
  // walk-forward backtest — never from the point being predicted.
  const withBt = results.filter(r=>r.bt);
  let weights;
  if(withBt.length){
    const invMae = withBt.map(r=>1/Math.max(r.bt.mae,0.01));
    const sumInv = invMae.reduce((a,b)=>a+b,0);
    weights = {}; withBt.forEach((r,i)=>weights[r.key]=invMae[i]/sumInv);
  } else { weights = {}; results.forEach(r=>weights[r.key]=1/results.length); }

  const ensemblePred = results.reduce((sum,r)=> sum + (weights[r.key]||0)*r.pred, 0);
  const ensemblePredPct = ((ensemblePred-last)/last)*100;

  // Ensemble's own walk-forward backtest (using the SAME fixed weights derived above) gives the
  // residual distribution used for the confidence interval and P(positive)/P(negative) below.
  const minTrain=60, lastOrigin=series.length-horizon-1, firstOrigin=Math.max(minTrain,lastOrigin-40);
  let ensPctErrs = [], ensDirCorrect=0, ensN=0;
  if(lastOrigin>firstOrigin){
    for(let origin=firstOrigin; origin<=lastOrigin; origin++){
      const train = series.slice(0, origin+1);
      let p = 0;
      FORECAST_MODEL_LIST.forEach(m=>{ p += (weights[m.key]||0) * Forecasts[m.key](train, horizon); });
      const actual = series[origin+horizon];
      if(!p || isNaN(p)) continue;
      ensPctErrs.push(((actual-p)/actual)*100);
      if((actual>series[origin]) === (p>series[origin])) ensDirCorrect++;
      ensN++;
    }
  }
  const ensSd = ensN ? Formulas.stddev(ensPctErrs, true) : null;
  const ensDirAcc = ensN ? (ensDirCorrect/ensN*100) : null;

  const probPos = ensSd ? (1 - normalCdf(0, ensemblePredPct, ensSd))*100 : null;
  const rangeLow = ensSd ? ensemblePredPct - ensSd : null;
  const rangeHigh = ensSd ? ensemblePredPct + ensSd : null;
  const confidence = ensSd==null ? 'Unknown' : ensSd<4 ? 'Moderate-High' : ensSd<8 ? 'Moderate' : 'Low (wide historical error band)';

  headlineEl.textContent = (ensemblePredPct>=0?'+':'')+ensemblePredPct.toFixed(1)+'%';
  headlineEl.className = ensemblePredPct>=0 ? 'up' : 'down';
  headlineEl.style.fontFamily='var(--mono)'; headlineEl.style.fontSize='28px'; headlineEl.style.fontWeight='700';
  detailEl.innerHTML = ensSd!=null
    ? `Range (±1σ of backtested error): ${rangeLow.toFixed(1)}% to ${rangeHigh.toFixed(1)}% · P(positive) ${probPos.toFixed(0)}% · P(negative) ${(100-probPos).toFixed(0)}%<br>Confidence: <b>${confidence}</b> · Walk-forward validation: ${ensN} origins, ${horizon}D horizon, directional accuracy ${ensDirAcc.toFixed(0)}%`
    : `Insufficient history for a walk-forward confidence interval on this series yet.`;

  tableEl.innerHTML = table(['Model','Pred. (20D)','Backtest MAE','Dir. Acc.','Weight'],
    results.map(r=>[
      r.label,
      (r.predPct>=0?'+':'')+r.predPct.toFixed(1)+'%',
      r.bt ? r.bt.mae.toFixed(2) : '—',
      r.bt && r.bt.directionalAccuracy!=null ? r.bt.directionalAccuracy.toFixed(0)+'%' : 'n/a',
      ((weights[r.key]||0)*100).toFixed(0)+'%'
    ]).concat([['Ensemble', (ensemblePredPct>=0?'+':'')+ensemblePredPct.toFixed(1)+'%', ensSd? '—':'—', ensDirAcc!=null?ensDirAcc.toFixed(0)+'%':'—', '100%']])
  );

  statusEl.innerHTML = `<b>Source:</b> computed live from the ${currentPriceSeriesIsLive?'<span class="badge fact">LIVE</span>':'<span class="badge assume">SAMPLE</span>'} price series via real walk-forward-validated statistical models — see <a href="#" onclick="goto('tests');return false;" style="color:var(--amber)">Tests tab</a> for the no-lookahead-leakage proof. No gradient-boosted or deep-learning model runs in this pure-browser build (disclosed, not faked) — that needs a Python/WASM backend, planned for a later phase.`;

  // Drivers, derived from the SAME real indicators computed in the Technicals tab (not scripted).
  if(driversEl && currentTechnicals){
    const t = currentTechnicals;
    const rows = [];
    rows.push(['Momentum (RSI 14)', t.rsi14==null?'n/a': t.rsi14>60?'positive':t.rsi14<40?'negative':'neutral', t.rsi14!=null?t.rsi14.toFixed(1):'—']);
    rows.push(['Trend (20 vs 50 SMA)', (t.sma20!=null&&t.sma50!=null)?(t.sma20>t.sma50?'positive':'negative'):'n/a', (t.sma20!=null&&t.sma50!=null)?(t.sma20>t.sma50?'20D above 50D':'20D below 50D'):'—']);
    rows.push(['MACD vs Signal', (t.macd&&t.macd.macd!=null&&t.macd.signal!=null)?(t.macd.macd>t.macd.signal?'positive':'negative'):'n/a', (t.macd&&t.macd.macd!=null)?t.macd.macd.toFixed(2):'—']);
    rows.push(['Volatility (30D annualized)', t.histVol==null?'n/a': t.histVol>30?'elevated (risk-negative)':'contained', t.histVol!=null?t.histVol.toFixed(1)+'%':'—']);
    driversEl.innerHTML = rows.map(r=>`<div class="driver-row"><span>${r[0]}</span><span class="driver-tag ${r[1]==='positive'?'pos':r[1]==='negative'||r[1]==='elevated (risk-negative)'?'neg':''}">${r[2]}</span></div>`).join('');
  } else if(driversEl){
    driversEl.innerHTML = '<div class="notebox">Run the Technicals tab first to populate real drivers for this security.</div>';
  }
  AppState.forecast = {ticker: currentSecurity, ensemblePredPct, rangeLow, rangeHigh, probPos, confidence, ensDirAcc, horizon,
    models: results.map(r=>({label:r.label, predPct:r.predPct, mae: r.bt?r.bt.mae:null, dirAcc: r.bt?r.bt.directionalAccuracy:null, weight: weights[r.key]||0})),
    isLive: currentPriceSeriesIsLive};
}
