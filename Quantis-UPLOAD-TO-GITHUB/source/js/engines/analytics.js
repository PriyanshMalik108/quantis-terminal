/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/engines/analytics.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Pure maths used by the Security Explorer, report templates and Formula Lab.
 *           No DOM, no network — every function is deterministic and unit-tested in
 *           tests/test_engines.py (known textbook answers).
 *             QXM.series   — performance & risk statistics from a price/NAV series
 *             QXM.bond     — fixed-income pricing, yield, duration, convexity, cash-flow schedule
 *             QXM.option   — Black-Scholes-Merton price, Greeks, implied volatility, payoff
 *             QXM.future   — cost-of-carry fair value and implied carry
 * CONVENTIONS  rates & yields as decimals (0.065 = 6.5 %) unless a name ends in Pct.
 *              Time in years. Series {t:[ms or ISO], c:[price]} oldest → newest.
 * REFERENCES   CFA Program curriculum L1 (Quantitative Methods, Fixed Income, Derivatives),
 *              L2 (Fixed Income: term structure; Derivatives: valuation), L3 (Risk management).
 * ─────────────────────────────────────────────────────────────────────────────
 */
const QXM = (() => {
  const fin = v => typeof v==='number' && isFinite(v);
  /* ------------------------------ series statistics ------------------------------ */
  const series = {
    /** Returns object with horizon returns, CAGR, annualised volatility, max drawdown, Sharpe, Sortino, Calmar,
     *  best/worst period, % positive periods and rolling 1-year returns. periodsPerYear: 252 daily, 365 crypto. */
    stats(s, {periodsPerYear=252, rf=0} = {}){
      const t = s.t.map(x=>typeof x==='number' ? x : Date.parse(x)), c = s.c; const n = c.length; if(n < 3) return null;
      const last = c[n-1], tEnd = t[n-1];
      const at = days => { const target = tEnd - days*864e5; let i = n-1; while(i>0 && t[i] > target) i--; return t[i] <= target + 3*864e5 && i < n-1 ? c[i] : null; };
      const ret = d => { const p = at(d); return p ? (last/p-1)*100 : null; };
      const y0 = Date.UTC(new Date(tEnd).getUTCFullYear(),0,1); let yi = n-1; while(yi>0 && t[yi-1] >= y0) yi--;
      const r = []; for(let i=1;i<n;i++) r.push(c[i]/c[i-1]-1);
      const lr = r.slice(-periodsPerYear); const mean = lr.reduce((a,b)=>a+b,0)/lr.length;
      const sd = Math.sqrt(lr.reduce((a,b)=>a+(b-mean)**2,0)/Math.max(1,lr.length-1));
      const dn = lr.filter(x=>x<0); const dd = Math.sqrt(dn.reduce((a,b)=>a+b*b,0)/Math.max(1,lr.length));
      const years = (tEnd - t[0]) / (365.25*864e5);
      const cagr = years > 0.9 ? (Math.pow(last/c[0], 1/years)-1)*100 : null;
      const annRet = mean*periodsPerYear, annVol = sd*Math.sqrt(periodsPerYear);
      let peak = -Infinity, mdd = 0, mddPeakI = 0, mddTroughI = 0, pk = 0;
      for(let i=0;i<n;i++){ if(c[i]>peak){ peak=c[i]; pk=i; } const d = c[i]/peak-1; if(d<mdd){ mdd=d; mddPeakI=pk; mddTroughI=i; } }
      const roll = []; const step = Math.max(1, Math.round(periodsPerYear/12));
      for(let i=periodsPerYear;i<n;i+=step) roll.push(c[i]/c[i-periodsPerYear]-1);
      const sortedR = lr.slice().sort((a,b)=>a-b); const q = p => sortedR[Math.max(0, Math.min(sortedR.length-1, Math.floor(p*sortedR.length)))];
      return {last, start:c[0], firstDate:new Date(t[0]).toISOString().slice(0,10), lastDate:new Date(tEnd).toISOString().slice(0,10), years,
        r1w:ret(7), r1m:ret(30), r3m:ret(91), r6m:ret(182), r1y:ret(365), r3y:ret(1095), r5y:ret(1826), ytd: yi>0 ? (last/c[yi-1]-1)*100 : null, cagr,
        volPct: annVol*100, annRetPct: annRet*100, sharpe: annVol ? (annRet - rf)/annVol : null, sortino: dd ? (annRet - rf)/(dd*Math.sqrt(periodsPerYear)) : null,
        mddPct: mdd*100, mddFrom:new Date(t[mddPeakI]).toISOString().slice(0,10), mddTo:new Date(t[mddTroughI]).toISOString().slice(0,10),
        calmar: mdd ? (cagr ?? annRet*100)/Math.abs(mdd*100) : null, bestPct: Math.max(...lr)*100, worstPct: Math.min(...lr)*100,
        posPct: lr.filter(x=>x>0).length/lr.length*100, var95Pct: q(0.05)*100, cvar95Pct: (()=>{ const k = sortedR.slice(0, Math.max(1, Math.floor(0.05*sortedR.length))); return k.reduce((a,b)=>a+b,0)/k.length*100; })(),
        hi52: Math.max(...c.slice(-periodsPerYear)), lo52: Math.min(...c.slice(-periodsPerYear)),
        rolling1y: roll.length ? {min:Math.min(...roll)*100, max:Math.max(...roll)*100, median: roll.slice().sort((a,b)=>a-b)[Math.floor(roll.length/2)]*100, pctPositive: roll.filter(x=>x>0).length/roll.length*100, n:roll.length} : null};
    },
    sma(c, n){ return c.map((_,i)=> i<n-1 ? null : c.slice(i-n+1,i+1).reduce((a,b)=>a+b,0)/n); },
    drawdownSeries(c){ let p=-Infinity; return c.map(x=>{ p=Math.max(p,x); return (x/p-1)*100; }); },
    beta(a, b){ // two aligned price arrays → beta of a vs b
      const ra=[], rb=[]; for(let i=1;i<Math.min(a.length,b.length);i++){ ra.push(a[i]/a[i-1]-1); rb.push(b[i]/b[i-1]-1); }
      const ma = ra.reduce((x,y)=>x+y,0)/ra.length, mb = rb.reduce((x,y)=>x+y,0)/rb.length;
      let cov=0, vb=0; for(let i=0;i<ra.length;i++){ cov+=(ra[i]-ma)*(rb[i]-mb); vb+=(rb[i]-mb)**2; } return vb ? cov/vb : null;
    },
  };

  /* --------------------------------- fixed income --------------------------------- */
  // Plain-vanilla fixed-coupon bond, settlement on a coupon date unless accrued is passed.
  const bond = {
    /** cash flows: [{t (years), cf}] for face, annual coupon rate c, frequency f, years-to-maturity T */
    flows(c, f, T, face=100){ const n = Math.max(1, Math.round(T*f)); const out = []; for(let k=1;k<=n;k++){ const t = T - (n-k)/f; out.push({t, cf: face*c/f + (k===n?face:0)}); } return out; },
    price(y, c, f, T, face=100){ return bond.flows(c,f,T,face).reduce((a,x)=>a + x.cf/Math.pow(1+y/f, x.t*f), 0); },
    /** yield-to-maturity solving price(y)=P by Newton with bisection fallback (handles negative yields > −50 %) */
    ytm(P, c, f, T, face=100){ let lo=-0.5, hi=1.5; for(let i=0;i<200;i++){ const m=(lo+hi)/2; const pm = bond.price(m,c,f,T,face); if(Math.abs(pm-P)<1e-10) return m; if(pm>P) lo=m; else hi=m; } return (lo+hi)/2; },
    macaulay(y, c, f, T, face=100){ const P = bond.price(y,c,f,T,face); return bond.flows(c,f,T,face).reduce((a,x)=>a + x.t*x.cf/Math.pow(1+y/f,x.t*f), 0)/P; },
    modified(y, c, f, T, face=100){ return bond.macaulay(y,c,f,T,face)/(1+y/f); },
    convexity(y, c, f, T, face=100){ const P = bond.price(y,c,f,T,face); return bond.flows(c,f,T,face).reduce((a,x)=>a + x.cf*x.t*(x.t+1/f)/Math.pow(1+y/f, x.t*f+2), 0)/P; },
    dv01(y, c, f, T, face=100){ return (bond.price(y-0.0001,c,f,T,face) - bond.price(y+0.0001,c,f,T,face))/2; },
    currentYield(P, c, face=100){ return face*c/P; },
    /** price change for a parallel shift dy: duration+convexity approximation AND exact full revaluation */
    shock(y, c, f, T, dy, face=100){ const P = bond.price(y,c,f,T,face), D = bond.modified(y,c,f,T,face), C = bond.convexity(y,c,f,T,face);
      return {approxPct: (-D*dy + 0.5*C*dy*dy)*100, exactPct: (bond.price(y+dy,c,f,T,face)/P-1)*100}; },
  };

  /* ---------------------------------- options ---------------------------------- */
  const N = x => { const a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=0.3275911; const s = x<0?-1:1; const z = Math.abs(x)/Math.SQRT2; const t = 1/(1+p*z); const y = 1-(((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-z*z); return 0.5*(1+s*y); };
  const n = x => Math.exp(-x*x/2)/Math.sqrt(2*Math.PI);
  const option = {
    /** Black-Scholes-Merton with continuous dividend yield q. type 'call'|'put'. Greeks: theta per calendar day, vega & rho per 1 % point. */
    bsm(type, S, K, T, r, sigma, q=0){
      if(!(S>0&&K>0&&T>0&&sigma>0)) { const iv = Math.max(0, type==='call'?S-K:K-S); return {price:iv, delta: type==='call'?(S>K?1:0):(S<K?-1:0), gamma:0, theta:0, vega:0, rho:0, d1:null, d2:null}; }
      const d1 = (Math.log(S/K) + (r - q + sigma*sigma/2)*T)/(sigma*Math.sqrt(T)), d2 = d1 - sigma*Math.sqrt(T);
      const df = Math.exp(-r*T), dq = Math.exp(-q*T);
      const price = type==='call' ? S*dq*N(d1) - K*df*N(d2) : K*df*N(-d2) - S*dq*N(-d1);
      const delta = type==='call' ? dq*N(d1) : dq*(N(d1)-1);
      const gamma = dq*n(d1)/(S*sigma*Math.sqrt(T));
      const thetaY = type==='call' ? -S*dq*n(d1)*sigma/(2*Math.sqrt(T)) - r*K*df*N(d2) + q*S*dq*N(d1) : -S*dq*n(d1)*sigma/(2*Math.sqrt(T)) + r*K*df*N(-d2) - q*S*dq*N(-d1);
      const vega = S*dq*n(d1)*Math.sqrt(T)/100, rho = (type==='call' ? K*T*df*N(d2) : -K*T*df*N(-d2))/100;
      return {price, delta, gamma, theta: thetaY/365, vega, rho, d1, d2, probITM: type==='call'?N(d2):N(-d2)};
    },
    impliedVol(type, P, S, K, T, r, q=0){ let lo=1e-4, hi=5; for(let i=0;i<120;i++){ const m=(lo+hi)/2; if(option.bsm(type,S,K,T,r,m,q).price > P) hi=m; else lo=m; } return (lo+hi)/2; },
    payoff(type, K, premium, S, qty=1){ return qty*((type==='call' ? Math.max(0,S-K) : Math.max(0,K-S)) - premium); },
    parityGap(C, P, S, K, T, r, q=0){ return (C - P) - (S*Math.exp(-q*T) - K*Math.exp(-r*T)); },
  };
  const future = {
    fair(S, r, T, q=0, storage=0){ return S*Math.exp((r - q + storage)*T); },
    impliedCarry(F, S, T){ return T>0 && S>0 && F>0 ? Math.log(F/S)/T : null; },
  };
  return {series, bond, option, future, N, fin};
})();
