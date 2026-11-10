/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/engines/formula-engine.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Core quantitative formulas (returns, volatility, indicators, DCF, Black-Scholes, VaR...).
 * DEPENDS   core/helpers.js
 * EXPOSES   FE.* formula functions (global — classic script, shared scope)
 * LOAD      Classic <script>, order defined in js/manifest.json. Top-level code runs at load,
 *           so it may only call functions from files listed EARLIER in the manifest.
 * NOTE      Migrated verbatim from the single-file build; inline comments marked
 *           "REAL BUG FIXED" / "post-launch fix" document past defects — keep them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* ===================== FINANCIAL FORMULA ENGINE (Phase 3, spec sections 9/12/13/57/58) =====================
   Every function here is a pure, self-contained calculation with no hidden data dependency —
   given the same input array/params it always returns the same, checkable output. Each one is
   validated against a hand-computable benchmark in runFormulaTests() below. */
const Formulas = {
  sma(arr, n){
    if(arr.length < n) return null;
    const slice = arr.slice(-n);
    return slice.reduce((a,b)=>a+b,0) / n;
  },
  ema(arr, n){
    if(arr.length < n) return null;
    const k = 2/(n+1);
    let emaVal = arr.slice(0,n).reduce((a,b)=>a+b,0)/n; // seed with SMA of first n
    for(let i=n;i<arr.length;i++){ emaVal = arr[i]*k + emaVal*(1-k); }
    return emaVal;
  },
  emaSeries(arr, n){
    // Returns the full EMA series (same length convention as MACD needs), seeded with SMA(n).
    if(arr.length < n) return [];
    const k = 2/(n+1);
    const out = new Array(arr.length).fill(null);
    let emaVal = arr.slice(0,n).reduce((a,b)=>a+b,0)/n;
    out[n-1] = emaVal;
    for(let i=n;i<arr.length;i++){ emaVal = arr[i]*k + emaVal*(1-k); out[i] = emaVal; }
    return out;
  },
  stddev(arr, population=true){
    const n = arr.length;
    if(n === 0) return null;
    const mean = arr.reduce((a,b)=>a+b,0)/n;
    const variance = arr.reduce((a,b)=>a+(b-mean)*(b-mean),0) / (population ? n : (n-1));
    return Math.sqrt(variance);
  },
  skewness(arr){
    const n = arr.length; if(n < 3) return null;
    const mean = arr.reduce((a,b)=>a+b,0)/n;
    const sd = this.stddev(arr, true);
    if(!sd) return null;
    const m3 = arr.reduce((a,b)=>a+Math.pow(b-mean,3),0)/n;
    return m3/Math.pow(sd,3);
  },
  kurtosis(arr){ // excess kurtosis (normal distribution = 0)
    const n = arr.length; if(n < 4) return null;
    const mean = arr.reduce((a,b)=>a+b,0)/n;
    const sd = this.stddev(arr, true);
    if(!sd) return null;
    const m4 = arr.reduce((a,b)=>a+Math.pow(b-mean,4),0)/n;
    return m4/Math.pow(sd,4) - 3;
  },
  autocorrelation(arr, lag=1){
    const n = arr.length; if(n <= lag) return null;
    const mean = arr.reduce((a,b)=>a+b,0)/n;
    let num = 0, den = 0;
    for(let i=0;i<n;i++) den += (arr[i]-mean)*(arr[i]-mean);
    for(let i=0;i<n-lag;i++) num += (arr[i]-mean)*(arr[i+lag]-mean);
    return den ? num/den : null;
  },
  rsi(arr, n=14){
    if(arr.length < n+1) return null;
    const slice = arr.slice(-(n+1));
    let gains=0, losses=0;
    for(let i=1;i<slice.length;i++){
      const diff = slice[i]-slice[i-1];
      if(diff >= 0) gains += diff; else losses -= diff;
    }
    const avgGain = gains/n, avgLoss = losses/n;
    if(avgLoss === 0) return 100;
    if(avgGain === 0) return 0;
    const rs = avgGain/avgLoss;
    return 100 - (100/(1+rs));
  },
  macd(arr, fast=12, slow=26, signalN=9){
    if(arr.length < slow+signalN) return null;
    const emaFastSeries = this.emaSeries(arr, fast);
    const emaSlowSeries = this.emaSeries(arr, slow);
    const macdLine = [];
    for(let i=0;i<arr.length;i++){
      if(emaFastSeries[i]!=null && emaSlowSeries[i]!=null) macdLine.push(emaFastSeries[i]-emaSlowSeries[i]);
    }
    if(macdLine.length < signalN) return {macd: macdLine[macdLine.length-1], signal: null, hist: null};
    const signal = this.ema(macdLine, signalN);
    const macdVal = macdLine[macdLine.length-1];
    return {macd: macdVal, signal, hist: macdVal-signal};
  },
  bollinger(arr, n=20, k=2){
    if(arr.length < n) return null;
    const mid = this.sma(arr, n);
    const sd = this.stddev(arr.slice(-n), true);
    return {mid, upper: mid+k*sd, lower: mid-k*sd, width: (2*k*sd)/mid};
  },
  roc(arr, n=10){
    if(arr.length < n+1) return null;
    const past = arr[arr.length-1-n], now = arr[arr.length-1];
    return ((now-past)/past)*100;
  },
  stochK(arr, n=14){
    if(arr.length < n) return null;
    const slice = arr.slice(-n);
    const hi = Math.max(...slice), lo = Math.min(...slice), cur = arr[arr.length-1];
    if(hi===lo) return 50;
    return ((cur-lo)/(hi-lo))*100;
  },
  williamsR(arr, n=14){
    const k = this.stochK(arr, n);
    return k==null ? null : k - 100;
  },
  atrApprox(arr, n=14){
    // Approximation from closes only — used as a fallback when real high/low isn't passed in.
    if(arr.length < n+1) return null;
    const slice = arr.slice(-(n+1));
    let sum=0;
    for(let i=1;i<slice.length;i++) sum += Math.abs(slice[i]-slice[i-1]);
    return sum/n;
  },
  /* Real Wilder's ATR from actual high/low/close — added because the price feeds (Stooq/Yahoo)
     do carry real OHLC (see currentPriceRaw.ohlc), it just wasn't being used for ATR/ADX/CCI
     before; those all fell back to close-only approximations or didn't exist. */
  atrReal(highs, lows, closes, n=14){
    if(!highs || highs.length < n+1) return null;
    const trs = [];
    for(let i=1;i<highs.length;i++){
      const tr = Math.max(highs[i]-lows[i], Math.abs(highs[i]-closes[i-1]), Math.abs(lows[i]-closes[i-1]));
      trs.push(tr);
    }
    if(trs.length < n) return null;
    const slice = trs.slice(-n);
    return slice.reduce((a,b)=>a+b,0)/n;
  },
  /* ADX (Average Directional Index, Wilder) — trend STRENGTH regardless of direction; a
     TradingView/screener staple that wasn't present at all before. */
  adx(highs, lows, closes, n=14){
    if(!highs || highs.length < n*2) return null;
    const plusDM=[], minusDM=[], tr=[];
    for(let i=1;i<highs.length;i++){
      const upMove = highs[i]-highs[i-1], downMove = lows[i-1]-lows[i];
      plusDM.push((upMove>downMove && upMove>0) ? upMove : 0);
      minusDM.push((downMove>upMove && downMove>0) ? downMove : 0);
      tr.push(Math.max(highs[i]-lows[i], Math.abs(highs[i]-closes[i-1]), Math.abs(lows[i]-closes[i-1])));
    }
    const smooth = arr => { let s=arr.slice(0,n).reduce((a,b)=>a+b,0); const out=[s]; for(let i=n;i<arr.length;i++){ s = s - s/n + arr[i]; out.push(s); } return out; };
    const trS = smooth(tr), plusS = smooth(plusDM), minusS = smooth(minusDM);
    const dx = [];
    for(let i=0;i<trS.length;i++){
      if(trS[i]===0){ dx.push(0); continue; }
      const plusDI = 100*plusS[i]/trS[i], minusDI = 100*minusS[i]/trS[i];
      dx.push(100*Math.abs(plusDI-minusDI)/(plusDI+minusDI || 1));
    }
    if(dx.length < n) return null;
    const adxSlice = dx.slice(-n);
    return adxSlice.reduce((a,b)=>a+b,0)/n;
  },
  /* CCI (Commodity Channel Index) — real typical-price calculation, another common
     TradingView-style oscillator that wasn't present before. */
  cci(highs, lows, closes, n=20){
    if(!highs || highs.length < n) return null;
    const tp = highs.map((h,i)=>(h+lows[i]+closes[i])/3);
    const slice = tp.slice(-n);
    const sma = slice.reduce((a,b)=>a+b,0)/n;
    const meanDev = slice.reduce((a,b)=>a+Math.abs(b-sma),0)/n;
    if(meanDev===0) return 0;
    return (tp[tp.length-1]-sma)/(0.015*meanDev);
  },
  /* Fibonacci retracement — real swing high/low over whatever window is passed in (the full
     loaded history by default), not hardcoded percentages of nothing. */
  fibRetracement(highs, lows){
    if(!highs || !highs.length) return null;
    const swingHigh = Math.max(...highs), swingLow = Math.min(...lows);
    const range = swingHigh - swingLow;
    const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1].map(r => ({ pct:r, price: swingHigh - range*r }));
    return { swingHigh, swingLow, levels };
  },
  historicalVolAnnualized(arr, n=30){
    if(arr.length < n+1) return null;
    const slice = arr.slice(-(n+1));
    const rets = [];
    for(let i=1;i<slice.length;i++) rets.push(Math.log(slice[i]/slice[i-1]));
    const sd = this.stddev(rets, true);
    return sd * Math.sqrt(252) * 100; // annualized %, 252 trading days
  },
  /* DCF (FCFF simplification): explicit n-year growth stage + Gordon-growth terminal value,
     both discounted at WACC. Returns fair value per share. All inputs are plain numbers
     (percentages as e.g. 8.4 for 8.4%), matching the spec's absolute-valuation section (12). */
  dcf({fcf0, growthPct, waccPct, terminalGrowthPct, years=5, sharesOutMn}){
    const g = growthPct/100, w = waccPct/100, tg = terminalGrowthPct/100;
    if(w <= tg) return null; // WACC must exceed terminal growth or the model diverges — never fabricate a number here
    let pvSum = 0, fcf = fcf0;
    for(let t=1;t<=years;t++){
      fcf = t===1 ? fcf0*(1+g) : fcf*(1+g);
      pvSum += fcf / Math.pow(1+w, t);
    }
    const terminalValue = (fcf*(1+tg)) / (w-tg);
    const pvTerminal = terminalValue / Math.pow(1+w, years);
    const enterpriseValue = pvSum + pvTerminal;
    return {enterpriseValue, fairValuePerShare: enterpriseValue / sharesOutMn};
  },

  /* ===== Formal hypothesis tests (ADF, Jarque-Bera, Ljung-Box, ARCH-LM) =====
     Previously not implemented — the Quant tab explicitly disclosed these as "SAMPLE — not
     computed" because they need more than summary statistics: OLS regression and a chi-square
     reference distribution, neither of which existed anywhere else in this build. Both are now
     implemented directly (small, dependency-free OLS via normal equations + a Wilson-Hilferty
     chi-square-to-normal approximation for p-values), rather than pulled from a library. */

  // Ordinary least squares: y = X*beta + e, X already includes an intercept column of 1s if wanted.
  // Returns {beta, se, resid} — se is the standard error of each coefficient (needed for ADF's t-stat).
  ols(y, X){
    const n = y.length, k = X[0].length;
    // X'X (k x k) and X'y (k)
    const XtX = Array.from({length:k},()=>new Array(k).fill(0));
    const Xty = new Array(k).fill(0);
    for(let i=0;i<n;i++){
      for(let a=0;a<k;a++){
        Xty[a] += X[i][a]*y[i];
        for(let b=0;b<k;b++) XtX[a][b] += X[i][a]*X[i][b];
      }
    }
    // Solve (X'X) beta = X'y via Gaussian elimination with partial pivoting
    const A = XtX.map((row,i)=>[...row, Xty[i]]);
    for(let col=0; col<k; col++){
      let piv = col;
      for(let r=col+1;r<k;r++) if(Math.abs(A[r][col])>Math.abs(A[piv][col])) piv=r;
      if(Math.abs(A[piv][col]) < 1e-12) return null; // singular — not enough independent variation
      [A[col],A[piv]] = [A[piv],A[col]];
      for(let r=0;r<k;r++){
        if(r===col) continue;
        const f = A[r][col]/A[col][col];
        for(let c=col;c<=k;c++) A[r][c] -= f*A[col][c];
      }
    }
    const beta = A.map((row,i)=>row[k]/row[i]);
    const resid = y.map((yi,i)=> yi - X[i].reduce((s,xij,j)=>s+xij*beta[j],0));
    const rss = resid.reduce((s,e)=>s+e*e,0);
    const dof = Math.max(1, n-k);
    const sigma2 = rss/dof;
    // Need (X'X)^-1 diagonal for standard errors — invert via Gauss-Jordan on the original XtX
    const M = XtX.map((row,i)=>[...row, ...Array.from({length:k},(_,j)=>i===j?1:0)]);
    for(let col=0; col<k; col++){
      let piv = col;
      for(let r=col+1;r<k;r++) if(Math.abs(M[r][col])>Math.abs(M[piv][col])) piv=r;
      if(Math.abs(M[piv][col]) < 1e-12) return null;
      [M[col],M[piv]] = [M[piv],M[col]];
      const pv = M[col][col];
      for(let c=0;c<2*k;c++) M[col][c] /= pv;
      for(let r=0;r<k;r++){
        if(r===col) continue;
        const f = M[r][col];
        for(let c=0;c<2*k;c++) M[r][c] -= f*M[col][c];
      }
    }
    const inv = M.map(row=>row.slice(k));
    const se = inv.map((row,i)=>Math.sqrt(Math.max(0,sigma2*row[i])));
    // R^2, needed by the ARCH-LM test below
    const yMean = y.reduce((a,b)=>a+b,0)/n;
    const tss = y.reduce((s,yi)=>s+(yi-yMean)**2,0);
    const r2 = tss>0 ? 1 - rss/tss : 0;
    return {beta, se, resid, r2, n, k};
  },

  // Wilson-Hilferty approximation: converts a chi-square variate to an approximate standard
  // normal, letting the existing normalCdf() supply a p-value without a chi-square CDF/gamma
  // function implementation of its own. Accurate to ~2-3 significant figures for df>=1, which is
  // enough for a "reject / fail to reject at 5%" reading (not for a published academic p-value).
  chiSquarePValue(stat, df){
    if(stat<=0 || df<=0) return 1;
    const z = (Math.pow(stat/df, 1/3) - (1 - 2/(9*df))) / Math.sqrt(2/(9*df));
    return 1 - normalCdf(z);
  },

  // Augmented Dickey-Fuller (constant, no trend, 1 lag): Δy_t = α + βy_{t-1} + γΔy_{t-1} + ε_t.
  // Null hypothesis: β=0 (series has a unit root / is non-stationary). Test stat = β̂/SE(β̂),
  // compared against MacKinnon's standard asymptotic critical values for this specification
  // (not a normal distribution — ADF has its own non-standard reference distribution).
  adfTest(series){
    const n = series.length;
    if(n < 20) return null;
    const dy = []; for(let i=1;i<n;i++) dy.push(series[i]-series[i-1]);
    // rows from i=1..dy.length-1 (need one lag of dy, so drop the first diff)
    const y = [], X = [];
    for(let i=1;i<dy.length;i++){
      y.push(dy[i]);
      X.push([1, series[i], dy[i-1]]); // [intercept, y_{t-1}, Δy_{t-1}]
    }
    const fit = this.ols(y, X);
    if(!fit) return null;
    const tstat = fit.beta[1]/fit.se[1];
    const cv = {'1%':-3.43, '5%':-2.86, '10%':-2.57}; // MacKinnon asymptotic, constant/no-trend case
    const stationary5pct = tstat < cv['5%'];
    return {tstat, criticalValues: cv, stationary5pct, n: fit.n};
  },

  // Jarque-Bera normality test: JB = n/6 * (S^2 + K^2/4), S=skewness, K=excess kurtosis, ~chi-sq(2)
  // under the null of normality. Chi-square(2) has a closed-form CDF, used directly (exact, no
  // Wilson-Hilferty approximation needed here).
  jarqueBeraTest(returns){
    const n = returns.length;
    if(n < 8) return null;
    const skew = this.skewness(returns), kurt = this.kurtosis(returns);
    if(skew==null || kurt==null) return null;
    const jb = (n/6)*(skew**2 + (kurt**2)/4);
    const pValue = Math.exp(-jb/2); // exact chi-square(2) survival function
    return {jb, pValue, normal5pct: pValue > 0.05};
  },

  // Ljung-Box test for autocorrelation up to lag h: Q = n(n+2) * sum_{k=1..h} r_k^2/(n-k), ~chi-sq(h)
  // under the null of no autocorrelation. Reuses the existing autocorrelation() function per lag.
  ljungBoxTest(returns, h=10){
    const n = returns.length;
    if(n < h+5) return null;
    let sum = 0;
    for(let k=1;k<=h;k++){
      const rk = this.autocorrelation(returns, k);
      if(rk==null) return null;
      sum += (rk*rk)/(n-k);
    }
    const q = n*(n+2)*sum;
    const pValue = this.chiSquarePValue(q, h);
    return {q, h, pValue, noAutocorr5pct: pValue > 0.05};
  },

  // ARCH-LM test for volatility clustering (ARCH effects): regress squared returns on q lags of
  // squared returns; test stat = n*R^2 ~ chi-sq(q) under the null of no ARCH effect.
  archTest(returns, q=5){
    const n = returns.length;
    if(n < q+15) return null;
    const sq = returns.map(r=>r*r);
    const y = [], X = [];
    for(let i=q;i<sq.length;i++){
      y.push(sq[i]);
      X.push([1, ...Array.from({length:q},(_,j)=>sq[i-1-j])]);
    }
    const fit = this.ols(y, X);
    if(!fit) return null;
    const stat = fit.n * fit.r2;
    const pValue = this.chiSquarePValue(stat, q);
    return {stat, q, pValue, noArchEffect5pct: pValue > 0.05};
  }
};
