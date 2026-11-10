/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/engines/portfolio-risk-options.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Portfolio maths, risk metrics and Black-Scholes/Greeks engine.
 * DEPENDS   engines/formula-engine.js
 * EXPOSES   risk/options engine functions (global — classic script, shared scope)
 * LOAD      Classic <script>, order defined in js/manifest.json. Top-level code runs at load,
 *           so it may only call functions from files listed EARLIER in the manifest.
 * NOTE      Migrated verbatim from the single-file build; inline comments marked
 *           "REAL BUG FIXED" / "post-launch fix" document past defects — keep them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* ===================== PORTFOLIO, RISK & OPTIONS ENGINE (Phase 5, spec sections 26-29) =====================
   Small self-contained matrix library — a full linear-algebra dependency isn't warranted for a
   4-6 asset portfolio (spec section 3: "every dependency must have a reason"), so inversion is a
   plain Gauss-Jordan elimination, which is exact and fast at this size. */
const Mat = {
  multiply(A,B){
    const r=A.length, c=B[0].length, inner=B.length;
    const out = Array.from({length:r},()=>new Array(c).fill(0));
    for(let i=0;i<r;i++) for(let j=0;j<c;j++){ let s=0; for(let k=0;k<inner;k++) s+=A[i][k]*B[k][j]; out[i][j]=s; }
    return out;
  },
  multiplyVec(A,v){ return A.map(row=>row.reduce((s,a,j)=>s+a*v[j],0)); },
  transpose(A){ return A[0].map((_,j)=>A.map(row=>row[j])); },
  inverse(A){
    const n = A.length;
    const M = A.map((row,i)=>[...row, ...Array.from({length:n},(_,j)=>i===j?1:0)]);
    for(let col=0; col<n; col++){
      let pivotRow = col;
      for(let r=col+1;r<n;r++) if(Math.abs(M[r][col]) > Math.abs(M[pivotRow][col])) pivotRow = r;
      if(Math.abs(M[pivotRow][col]) < 1e-12) throw new Error('Matrix is singular (assets are perfectly collinear) — cannot invert');
      [M[col], M[pivotRow]] = [M[pivotRow], M[col]];
      const pivot = M[col][col];
      for(let j=0;j<2*n;j++) M[col][j] /= pivot;
      for(let r=0;r<n;r++){
        if(r===col) continue;
        const factor = M[r][col];
        for(let j=0;j<2*n;j++) M[r][j] -= factor*M[col][j];
      }
    }
    return M.map(row=>row.slice(n));
  }
};

Object.assign(Formulas, {
  dailyReturns(series, log=true){
    const out=[];
    for(let i=1;i<series.length;i++) out.push(log ? Math.log(series[i]/series[i-1]) : (series[i]-series[i-1])/series[i-1]);
    return out;
  },
  sharpeRatio(returns, rfAnnual=0.04, periodsPerYear=252){
    const mean = returns.reduce((a,b)=>a+b,0)/returns.length;
    const sd = this.stddev(returns, true);
    if(sd===0) return null;
    const rfPeriod = rfAnnual/periodsPerYear;
    return ((mean-rfPeriod)/sd) * Math.sqrt(periodsPerYear);
  },
  sortinoRatio(returns, rfAnnual=0.04, periodsPerYear=252){
    const rfPeriod = rfAnnual/periodsPerYear;
    const mean = returns.reduce((a,b)=>a+b,0)/returns.length;
    const downside = returns.filter(r=>r<rfPeriod).map(r=>Math.pow(r-rfPeriod,2));
    if(!downside.length) return null;
    const downsideDev = Math.sqrt(downside.reduce((a,b)=>a+b,0)/returns.length);
    if(downsideDev===0) return null;
    return ((mean-rfPeriod)/downsideDev) * Math.sqrt(periodsPerYear);
  },
  historicalVaR(returns, confidence=0.95){
    // Empirical percentile of the loss distribution. A tiny epsilon guards against floating-point
    // artifacts like 1-0.90 evaluating to 0.09999999999999998 in JS, which would otherwise floor
    // to the wrong index right at common confidence boundaries (verified by test suite).
    const sorted = [...returns].sort((a,b)=>a-b);
    const idx = Math.floor((1-confidence)*sorted.length + 1e-9);
    return sorted[Math.max(0,Math.min(sorted.length-1,idx))]; // a return (negative = loss)
  },
  historicalCVaR(returns, confidence=0.95){
    const sorted = [...returns].sort((a,b)=>a-b);
    const cutoffIdx = Math.max(1, Math.floor((1-confidence)*sorted.length + 1e-9));
    const tail = sorted.slice(0, cutoffIdx);
    if(!tail.length) return sorted[0];
    return tail.reduce((a,b)=>a+b,0)/tail.length; // average of the worst (1-confidence) outcomes
  },
  invNormalCdf(p){
    // Acklam's rational approximation of the inverse standard normal CDF (no external stats lib).
    if(p<=0) return -Infinity; if(p>=1) return Infinity;
    const a=[-3.969683028665376e+01,2.209460984245205e+02,-2.759285104469687e+02,1.383577518672690e+02,-3.066479806614716e+01,2.506628277459239e+00];
    const b=[-5.447609879822406e+01,1.615858368580409e+02,-1.556989798598866e+02,6.680131188771972e+01,-1.328068155288572e+01];
    const c=[-7.784894002430293e-03,-3.223964580411365e-01,-2.400758277161838e+00,-2.549732539343734e+00,4.374664141464968e+00,2.938163982698783e+00];
    const d=[7.784695709041462e-03,3.224671290700398e-01,2.445134137142996e+00,3.754408661907416e+00];
    const plow=0.02425, phigh=1-plow;
    let q,r;
    if(p<plow){ q=Math.sqrt(-2*Math.log(p)); return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
    if(p>phigh){ q=Math.sqrt(-2*Math.log(1-p)); return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
    q=p-0.5; r=q*q;
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
  },
  parametricVaR(meanReturn, sd, confidence=0.95){
    const z = this.invNormalCdf(1-confidence); // negative number
    return meanReturn + z*sd;
  },
  maxDrawdown(series){
    let peak = series[0], maxDd = 0, peakIdx=0, troughIdx=0, worstPeakIdx=0, worstTroughIdx=0;
    for(let i=0;i<series.length;i++){
      if(series[i] > peak){ peak = series[i]; peakIdx = i; }
      const dd = (series[i]-peak)/peak;
      if(dd < maxDd){ maxDd = dd; worstPeakIdx=peakIdx; worstTroughIdx=i; }
    }
    return {maxDrawdownPct: maxDd*100, peakIdx: worstPeakIdx, troughIdx: worstTroughIdx};
  },
  /* Black-Scholes-Merton, European options, no dividend yield. Returns price + all 5 core Greeks.
     T in years, r and sigma as decimals (0.05 = 5%). */
  blackScholes(S, K, T, r, sigma, isCall=true){
    if(T<=0 || sigma<=0 || S<=0 || K<=0) return null;
    const d1 = (Math.log(S/K) + (r + sigma*sigma/2)*T) / (sigma*Math.sqrt(T));
    const d2 = d1 - sigma*Math.sqrt(T);
    const Nd1 = normalCdf(d1), Nd2 = normalCdf(d2);
    const Nnd1 = normalCdf(-d1), Nnd2 = normalCdf(-d2);
    const pdf = (x)=> Math.exp(-x*x/2)/Math.sqrt(2*Math.PI);
    const price = isCall ? S*Nd1 - K*Math.exp(-r*T)*Nd2 : K*Math.exp(-r*T)*Nnd2 - S*Nnd1;
    const delta = isCall ? Nd1 : Nd1-1;
    const gamma = pdf(d1)/(S*sigma*Math.sqrt(T));
    const vega = S*pdf(d1)*Math.sqrt(T)/100; // per 1 vol point (1%)
    const theta = isCall
      ? (-(S*pdf(d1)*sigma)/(2*Math.sqrt(T)) - r*K*Math.exp(-r*T)*Nd2)/365
      : (-(S*pdf(d1)*sigma)/(2*Math.sqrt(T)) + r*K*Math.exp(-r*T)*Nnd2)/365;
    const rho = isCall ? (K*T*Math.exp(-r*T)*Nd2)/100 : (-K*T*Math.exp(-r*T)*Nnd2)/100;
    return {price, delta, gamma, theta, vega, rho, d1, d2};
  },
  /* Cox-Ross-Rubinstein binomial tree — was entirely absent, so American-style early exercise
     (the actual mechanics of most real-world listed equity options, which can be exercised any
     time before expiry, unlike the European-only Black-Scholes above which assumes exercise
     only at expiry) had no pricer at all. Standard CRR parameterization: up/down factors from
     volatility and the risk-neutral probability from the risk-free rate, backward induction
     comparing continuation value against immediate-exercise value at every node — that
     node-by-node max() is the entire mechanism that makes early exercise "real" here rather
     than assumed away. steps=200 balances accuracy against staying instant in a browser tab.
     dividendYield (continuous, decimal) is optional and defaults to 0, same convention as the
     risk-free rate elsewhere in this engine. */
  binomialTree(S, K, T, r, sigma, isCall=true, isAmerican=true, steps=200, dividendYield=0){
    if(T<=0 || sigma<=0 || S<=0 || K<=0 || steps<1) return null;
    const dt = T/steps;
    const u = Math.exp(sigma*Math.sqrt(dt));
    const d = 1/u;
    const disc = Math.exp(-r*dt);
    const p = (Math.exp((r-dividendYield)*dt) - d) / (u - d);
    if(p < 0 || p > 1) return null; // arbitrage-inconsistent inputs for this step size — refuse rather than return a wrong number
    // Terminal payoffs across the final layer of the tree
    let values = new Array(steps+1);
    for(let i=0;i<=steps;i++){
      const ST = S*Math.pow(u, steps-i)*Math.pow(d, i);
      values[i] = isCall ? Math.max(ST-K,0) : Math.max(K-ST,0);
    }
    // Backward induction: at each earlier node, value = discounted expected continuation value,
    // and — for American options only — the max() against immediate exercise at that node is
    // exactly what allows early exercise to be worth more than waiting (e.g. deep ITM puts, or
    // calls on a dividend-paying stock right before an ex-date).
    for(let step=steps-1; step>=0; step--){
      const next = new Array(step+1);
      for(let i=0;i<=step;i++){
        const continuation = disc*(p*values[i] + (1-p)*values[i+1]);
        if(isAmerican){
          const ST = S*Math.pow(u, step-i)*Math.pow(d, i);
          const exercise = isCall ? Math.max(ST-K,0) : Math.max(K-ST,0);
          next[i] = Math.max(continuation, exercise);
        } else {
          next[i] = continuation;
        }
      }
      values = next;
    }
    return {price: values[0], steps, u, d, p};
  },
  /* Monte Carlo GBM simulation — real random draws (Box-Muller from Math.random), not staged
     percentiles. muAnnual/sigmaAnnual as decimals, horizon in trading days. */
  monteCarloGBM(s0, muAnnual, sigmaAnnual, horizonDays, nPaths=2000){
    const dt = 1/252;
    const finals = new Array(nPaths);
    for(let p=0;p<nPaths;p++){
      let s = s0;
      for(let t=0;t<horizonDays;t++){
        const u1 = Math.random(), u2 = Math.random();
        const z = Math.sqrt(-2*Math.log(u1)) * Math.cos(2*Math.PI*u2); // Box-Muller
        s = s * Math.exp((muAnnual - 0.5*sigmaAnnual*sigmaAnnual)*dt + sigmaAnnual*Math.sqrt(dt)*z);
      }
      finals[p] = s;
    }
    finals.sort((a,b)=>a-b);
    const pct = (p)=> finals[Math.max(0,Math.min(nPaths-1, Math.floor(p*nPaths)))];
    return {finals, p5:pct(0.05), p25:pct(0.25), p50:pct(0.50), p75:pct(0.75), p95:pct(0.95), mean: finals.reduce((a,b)=>a+b,0)/nPaths};
  },
  // GARCH(1,1) volatility forecast — was entirely absent; the Risk tab only ever showed
  // unconditional (long-run average) historical volatility, with no time-varying/conditional
  // model of clustering. Uses variance-targeting (Engle 2002: omega is pinned to the sample
  // long-run variance, reducing estimation to a 2-parameter grid search over alpha/beta instead
  // of an unstable 3-parameter numerical optimizer) with an exact Gaussian log-likelihood —
  // real MLE-style estimation, not a heuristic. Fits on at most the last `maxObs` returns (a
  // recent window is standard practice for GARCH — ancient volatility regimes are less relevant
  // to tomorrow's conditional variance, and it keeps the grid search fast).
  garch11(returns, maxObs=500){
    const r = returns.length > maxObs ? returns.slice(returns.length-maxObs) : returns;
    const n = r.length;
    if(n < 50) return null;
    const mean = r.reduce((a,b)=>a+b,0)/n;
    const dev = r.map(x=>x-mean);
    const longRunVar = dev.reduce((s,x)=>s+x*x,0)/n;
    if(longRunVar <= 0) return null;
    let best = null;
    for(let ai=1; ai<=30; ai++){ // alpha: 0.01 .. 0.30
      const alpha = ai/100;
      for(let bi=1; bi<=98-ai; bi++){ // beta: 0.01 .. (0.98-alpha), keeps alpha+beta<0.99 stationary
        const beta = bi/100;
        const omega = longRunVar*(1-alpha-beta);
        if(omega <= 0) continue;
        let sigma2 = longRunVar, ll = 0;
        for(let t=1; t<n; t++){
          sigma2 = omega + alpha*dev[t-1]*dev[t-1] + beta*sigma2;
          if(sigma2 <= 0){ ll = -Infinity; break; }
          ll += -0.5*(Math.log(2*Math.PI*sigma2) + (dev[t]*dev[t])/sigma2);
        }
        if(ll > (best?best.ll:-Infinity)) best = {alpha, beta, omega, ll};
      }
    }
    if(!best) return null;
    // Re-run the recursion once more with the winning parameters to get the actual fitted
    // conditional-variance path (needed for "current" vol and the h-step-ahead forecast).
    let sigma2 = longRunVar;
    for(let t=1; t<n; t++) sigma2 = best.omega + best.alpha*dev[t-1]*dev[t-1] + best.beta*sigma2;
    const persistence = best.alpha + best.beta;
    // Standard GARCH(1,1) h-step-ahead variance forecast: reverts geometrically toward the
    // long-run variance at rate (alpha+beta)^h.
    const forecastVariance = h => longRunVar + Math.pow(persistence, h)*(sigma2 - longRunVar);
    return {alpha: best.alpha, beta: best.beta, omega: best.omega, longRunVar, lastConditionalVar: sigma2, persistence, n, forecastVariance, logLikelihood: best.ll};
  },
  /* Kelly Criterion — the standard formula (Kelly 1956) for the fraction of capital to risk per
     trade that maximizes long-run geometric growth, given a strategy's real win rate and
     win/loss ratio: f* = W - (1-W)/R, where W = win probability, R = avg win size / avg loss
     size. Full Kelly is famously aggressive/volatile in practice (a single misestimated
     parameter can swing it wildly), so half-Kelly is included too — a common, more conservative
     practitioner convention, not this app's own invention. Returns null (rather than a nonsense
     negative/huge number) when the edge itself is non-positive or inputs are degenerate. */
  kellyCriterion(winRate, avgWinPct, avgLossPct){
    if(winRate<=0 || winRate>=1 || avgWinPct<=0 || avgLossPct<=0) return null;
    const R = avgWinPct/avgLossPct;
    const f = winRate - (1-winRate)/R;
    if(f<=0) return {fullKelly:0, halfKelly:0, hasEdge:false}; // negative/zero edge — Kelly says risk nothing
    return {fullKelly: Math.min(f,1), halfKelly: Math.min(f,1)/2, hasEdge:true};
  },
  covarianceMatrix(returnsMatrix){ // returnsMatrix: array of asset return arrays, all same length
    const n = returnsMatrix.length, T = returnsMatrix[0].length;
    const means = returnsMatrix.map(r=>r.reduce((a,b)=>a+b,0)/T);
    const cov = Array.from({length:n},()=>new Array(n).fill(0));
    for(let i=0;i<n;i++) for(let j=0;j<n;j++){
      let s=0; for(let t=0;t<T;t++) s += (returnsMatrix[i][t]-means[i])*(returnsMatrix[j][t]-means[j]);
      cov[i][j] = s/(T-1);
    }
    return cov;
  },
  // Pearson correlation matrix, derived from the covariance matrix above (rho_ij = cov_ij /
  // (sd_i * sd_j)) — used by the Correlation & Relationship Engine tab, which previously drew
  // an entirely random seeded matrix with no real computation behind it at all.
  correlationMatrix(returnsMatrix){
    const cov = this.covarianceMatrix(returnsMatrix);
    const n = cov.length;
    const sd = cov.map((row,i)=>Math.sqrt(Math.max(row[i],0)));
    return cov.map((row,i)=>row.map((c,j)=> (sd[i]>0 && sd[j]>0) ? c/(sd[i]*sd[j]) : (i===j?1:0)));
  },
  minVariancePortfolio(cov){
    const n = cov.length;
    const inv = Mat.inverse(cov);
    const ones = new Array(n).fill(1);
    const invOnes = Mat.multiplyVec(inv, ones);
    const denom = ones.reduce((s,_,i)=>s+invOnes[i],0);
    return invOnes.map(v=>v/denom);
  },
  // Projects an arbitrary vector onto the probability simplex {w : sum(w)=1, w>=0} — the standard
  // O(n log n) algorithm (Wang & Carreira-Perpiñán 2013 / Duchi et al. 2008: sort descending,
  // find the largest index where the running mean stays feasible, then shift-and-clip).
  // This is the actual mechanism that makes long-only constrained optimization below possible
  // without a full QP solver.
  projectToSimplex(v){
    const n = v.length;
    const u = [...v].sort((a,b)=>b-a);
    const css = []; let running = 0;
    for(let i=0;i<n;i++){ running += u[i]; css.push(running); }
    let rho = 0;
    for(let i=n-1;i>=0;i--){ if(u[i] + (1-css[i])/(i+1) > 0){ rho = i; break; } }
    const theta = (css[rho]-1)/(rho+1);
    return v.map(vi=>Math.max(vi-theta, 0));
  },
  maxSharpePortfolio(cov, expReturns, rfAnnual=0.04){
    const n = cov.length;
    const excess = expReturns.map(r=>r-rfAnnual);
    const inv = Mat.inverse(cov);
    const raw = Mat.multiplyVec(inv, excess);
    // Unconstrained tangency weights, used only as the long/short reference point the notebox
    // below compares against — the actual long-only answer is longOnlyMaxSharpePortfolio().
    const clipped = raw.map(w=>Math.max(0,w));
    const sum = clipped.reduce((a,b)=>a+b,0);
    return sum>0 ? clipped.map(w=>w/sum) : new Array(n).fill(1/n);
  },
  // True long-only tangency portfolio via projected gradient ASCENT on the Sharpe ratio, with
  // each step projected back onto the long-only simplex — this is the "constrained QP" the
  // previous clip-and-renormalize heuristic said it needed and didn't have. Analytic gradient:
  // S(w) = (w·μ - rf) / σ(w), σ=sqrt(w'Σw)  =>  ∇S = μ/σ - (w·μ-rf)·(Σw)/σ³
  longOnlyMaxSharpePortfolio(cov, expReturns, rfAnnual=0.04, iters=800){
    const n = cov.length;
    let w = new Array(n).fill(1/n);
    const lr = 0.5;
    for(let it=0; it<iters; it++){
      const Sw = Mat.multiplyVec(cov, w);
      const variance = w.reduce((s,wi,i)=>s+wi*Sw[i],0);
      const sigma = Math.sqrt(Math.max(variance,1e-12));
      const ret = w.reduce((s,wi,i)=>s+wi*expReturns[i],0);
      const excess = ret-rfAnnual;
      const grad = expReturns.map((mu,i)=> mu/sigma - excess*Sw[i]/(sigma**3));
      const step = it < iters/2 ? lr : lr*0.2; // coarse then fine, avoids overshoot near the optimum
      w = this.projectToSimplex(w.map((wi,i)=>wi + step*grad[i]/n));
    }
    return w;
  },
  // Minimum-variance portfolio subject to a target annualized return (long-only): projected
  // gradient descent on variance + a quadratic penalty for missing the return target, each step
  // projected onto the simplex. Since the target may sit outside the feasible long-only frontier
  // (e.g. above the single best asset's return), the achieved return is reported alongside the
  // requested one rather than silently substituting a different number.
  targetReturnPortfolio(cov, expReturns, targetReturnAnnual, iters=1500){
    const n = cov.length;
    let w = new Array(n).fill(1/n);
    const lr = 0.4, lambda = 40;
    for(let it=0; it<iters; it++){
      const Sw = Mat.multiplyVec(cov, w);
      const ret = w.reduce((s,wi,i)=>s+wi*expReturns[i],0);
      const shortfall = targetReturnAnnual - ret; // >0 means under target
      const grad = Sw.map((swi,i)=> 2*swi - (shortfall>0 ? 2*lambda*shortfall*expReturns[i] : 0));
      w = this.projectToSimplex(w.map((wi,i)=>wi - lr*grad[i]/n));
    }
    return w;
  },
  // Maximum-return portfolio subject to a target annualized volatility (long-only): projected
  // gradient ascent on return with a quadratic penalty for straying from the target volatility.
  targetVolatilityPortfolio(cov, expReturns, targetVolAnnual, iters=1500){
    const n = cov.length;
    let w = new Array(n).fill(1/n);
    const lr = 0.4, lambda = 60;
    for(let it=0; it<iters; it++){
      const Sw = Mat.multiplyVec(cov, w);
      const variance = w.reduce((s,wi,i)=>s+wi*Sw[i],0);
      const sigma = Math.sqrt(Math.max(variance,1e-12));
      const diff = sigma - targetVolAnnual;
      const grad = expReturns.map((mu,i)=> -mu + 2*lambda*diff*(Sw[i]/sigma));
      w = this.projectToSimplex(w.map((wi,i)=>wi - lr*grad[i]/n));
    }
    return w;
  },
  riskParityPortfolio(cov, iterations=300, damp=0.5){
    // Damped multiplicative update — an undamped update (exponent 1) provably oscillates in a
    // period-2 cycle for this kind of fixed-point iteration and never converges (caught by
    // tracing the iteration during development); damp=0.5 converges reliably and was verified
    // against the closed-form 2-asset inverse-volatility solution.
    const n = cov.length;
    let w = new Array(n).fill(1/n);
    for(let it=0; it<iterations; it++){
      const sigmaP = Math.sqrt(w.reduce((s,wi,i)=>s+wi*cov[i].reduce((s2,cij,j)=>s2+cij*w[j],0),0));
      const marginalContrib = cov.map((row,i)=>row.reduce((s,cij,j)=>s+cij*w[j],0));
      const riskContrib = w.map((wi,i)=>wi*marginalContrib[i]/sigmaP);
      const target = sigmaP/n;
      w = w.map((wi,i)=> wi * Math.pow(target/(riskContrib[i]||1e-9), damp) );
      const sum = w.reduce((a,b)=>a+b,0);
      w = w.map(wi=>wi/sum);
    }
    return w;
  },
  portfolioStats(weights, expReturns, cov, rfAnnual=0.04){
    const ret = weights.reduce((s,w,i)=>s+w*expReturns[i],0);
    const variance = weights.reduce((s,wi,i)=>s+wi*cov[i].reduce((s2,cij,j)=>s2+cij*weights[j],0),0);
    const vol = Math.sqrt(variance);
    const sharpe = vol>0 ? (ret-rfAnnual)/vol : null;
    return {ret, vol, sharpe};
  }
});
