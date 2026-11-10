/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/engines/forecasting.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Statistical ensemble forecast for the Prediction tab.
 * DEPENDS   engines/formula-engine.js
 * EXPOSES   runForecast() (global — classic script, shared scope)
 * LOAD      Classic <script>, order defined in js/manifest.json. Top-level code runs at load,
 *           so it may only call functions from files listed EARLIER in the manifest.
 * NOTE      Migrated verbatim from the single-file build; inline comments marked
 *           "REAL BUG FIXED" / "post-launch fix" document past defects — keep them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* ===================== FORECASTING ENGINE (Phase 4, spec sections 16-20) =====================
   Real statistical models only — no fabricated "ARIMA"/"XGBoost"/"LSTM" labels on numbers that
   were never actually computed by those methods. Deep learning / gradient-boosted models need a
   Python or WASM runtime this pure-JS build doesn't have; that's a disclosed follow-up phase.
   Every model function's ONLY input is the price series truncated to "now" — none of them can see
   beyond the point they're forecasting from, which is what the no-leakage test below verifies. */
const Forecasts = {
  naive(series, h){ return series[series.length-1]; }, // random-walk: tomorrow = today
  drift(series, h){
    const n = series.length;
    const avgStep = (series[n-1]-series[0])/(n-1);
    return series[n-1] + h*avgStep;
  },
  linreg(series, h, window=90){
    const s = series.slice(-window);
    const n = s.length;
    const xMean = (n-1)/2, yMean = s.reduce((a,b)=>a+b,0)/n;
    let num=0, den=0;
    for(let i=0;i<n;i++){ num += (i-xMean)*(s[i]-yMean); den += (i-xMean)*(i-xMean); }
    const slope = den===0 ? 0 : num/den;
    const intercept = yMean - slope*xMean;
    return intercept + slope*(n-1+h);
  },
  holt(series, h, alpha=0.3, beta=0.15){
    // Holt's linear trend exponential smoothing — level + trend, both updated recursively.
    let level = series[0], trend = series[1]-series[0];
    for(let i=1;i<series.length;i++){
      const prevLevel = level;
      level = alpha*series[i] + (1-alpha)*(level+trend);
      trend = beta*(level-prevLevel) + (1-beta)*trend;
    }
    return level + h*trend;
  }
};
const FORECAST_MODEL_LIST = [
  {key:'naive', label:'Naive (Random Walk)'},
  {key:'drift', label:'Drift (avg. historical trend)'},
  {key:'linreg', label:'Linear Regression (90D)'},
  {key:'holt', label:'Holt Exponential Smoothing'},
];

/* Walk-forward validation (spec section 19): for each historical origin, forecast is made using
   ONLY series[0..origin] and compared against the real value h steps later. No parameter is ever
   fit on data the model wouldn't have had at that point in time. */
function walkForwardBacktest(series, modelKey, horizon=20, maxOrigins=40){
  const minTrain = 60;
  const lastOrigin = series.length - horizon - 1;
  const firstOrigin = Math.max(minTrain, lastOrigin - maxOrigins);
  if(lastOrigin <= firstOrigin) return null;
  let absErrSum=0, sqErrSum=0, dirCorrect=0, dirN=0, n=0, pctErrs=[];
  for(let origin=firstOrigin; origin<=lastOrigin; origin++){
    const train = series.slice(0, origin+1); // truncated — cannot see origin+1..end
    const pred = Forecasts[modelKey](train, horizon);
    const actual = series[origin+horizon];
    if(pred==null || isNaN(pred)) continue;
    const err = actual - pred;
    absErrSum += Math.abs(err);
    sqErrSum += err*err;
    pctErrs.push((err/actual)*100);
    // A forecast equal to today's price (e.g. the naive random walk) makes no directional call at
    // all — counting it as "predicted down" used to give the naive model a fake 0%/100% hit rate.
    if(Math.abs(pred - series[origin]) > 1e-9){
      const actualDir = actual > series[origin];
      const predDir = pred > series[origin];
      if(actualDir === predDir) dirCorrect++;
      dirN++;
    }
    n++;
  }
  if(n===0) return null;
  return {
    mae: absErrSum/n, rmse: Math.sqrt(sqErrSum/n), directionalAccuracy: dirN ? (dirCorrect/dirN)*100 : null,
    n, pctErrStd: Formulas.stddev(pctErrs, true)
  };
}
/* Standard normal CDF via the Abramowitz-Stegun erf approximation (no external stats library). */
function normalCdf(x, mean=0, sd=1){
  if(sd<=0) return x>=mean ? 1 : 0;
  const z = (x-mean)/(sd*Math.SQRT2);
  const t = 1/(1+0.3275911*Math.abs(z));
  const y = 1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-0.284496736)*t+0.254829592)*t*Math.exp(-z*z);
  const erf = z>=0 ? y : -y;
  return 0.5*(1+erf);
}

let currentTechnicals = null; // shared with computeAndRenderTechnicals so the prediction panel can reuse real indicator values instead of recomputing or scripting them
