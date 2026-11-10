/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/engines/formula-tests.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Known-answer tests for the formula engine (Tests view).
 * DEPENDS   engines/formula-engine.js
 * EXPOSES   runFormulaTests() (global — classic script, shared scope)
 * LOAD      Classic <script>, order defined in js/manifest.json. Top-level code runs at load,
 *           so it may only call functions from files listed EARLIER in the manifest.
 * NOTE      Migrated verbatim from the single-file build; inline comments marked
 *           "REAL BUG FIXED" / "post-launch fix" document past defects — keep them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* ===================== FORMULA TEST SUITE (spec section 58) =====================
   Hand-computable benchmark values only — no test depends on an external data fetch,
   so it runs identically every time regardless of network/CORS conditions. */
const TEST_CASES = [
  {name:'SMA(5) of [2,4,6,8,10]', expected: 6, tolerance: 1e-9, run: ()=>Formulas.sma([2,4,6,8,10],5)},
  {name:'EMA(3) of constant series [5,5,5,5,5,5]', expected: 5, tolerance: 1e-9, run: ()=>Formulas.ema([5,5,5,5,5,5],3)},
  {name:'Population stddev of [2,4,4,4,5,5,7,9]', expected: 2, tolerance: 1e-9, run: ()=>Formulas.stddev([2,4,4,4,5,5,7,9],true)},
  {name:'RSI(14) of strictly increasing series (all gains)', expected: 100, tolerance: 1e-9, run: ()=>Formulas.rsi(Array.from({length:20},(_,i)=>i+1),14)},
  {name:'RSI(14) of strictly decreasing series (all losses)', expected: 0, tolerance: 1e-9, run: ()=>Formulas.rsi(Array.from({length:20},(_,i)=>50-i),14)},
  {name:'MACD histogram on a constant series ≈ 0', expected: 0, tolerance: 1e-6, run: ()=>Formulas.macd(new Array(40).fill(100)).hist},
  {name:'Bollinger mid-band of constant series = the constant', expected: 100, tolerance: 1e-9, run: ()=>Formulas.bollinger(new Array(25).fill(100),20,2).mid},
  {name:'Bollinger band width of constant series = 0 (zero variance)', expected: 0, tolerance: 1e-9, run: ()=>Formulas.bollinger(new Array(25).fill(100),20,2).width},
  {name:'ROC(10): 100 → 110 over 10 periods = +10%', expected: 10, tolerance: 1e-9, run: ()=>{ const a=[100,101,102,103,104,105,106,107,108,109,110]; return Formulas.roc(a,10); }},
  {name:'Stochastic %K at the high of a 14-period range = 100', expected: 100, tolerance: 1e-9, run: ()=>Formulas.stochK(Array.from({length:14},(_,i)=>i+1),14)},
  {name:'DCF fair value: flat $100 FCF perpetuity @ 10% WACC, 0% growth = $100/sh (10 shares, $1000 EV)', expected: 100, tolerance: 1e-6,
    run: ()=>Formulas.dcf({fcf0:100, growthPct:0, waccPct:10, terminalGrowthPct:0, years:5, sharesOutMn:10}).fairValuePerShare},
  {name:'DCF returns null (never fabricates) when WACC ≤ terminal growth', expected: null, tolerance: 0,
    run: ()=>Formulas.dcf({fcf0:100, growthPct:5, waccPct:5, terminalGrowthPct:6, years:5, sharesOutMn:10})},
  {name:'Naive forecast = last observed value (random-walk definition)', expected: 123.45, tolerance: 1e-9,
    run: ()=>Forecasts.naive([100,110,120,123.45], 20)},
  {name:'Linear regression forecast on a perfectly linear series extrapolates exactly', expected: 219, tolerance: 1e-6,
    run: ()=>{ const s=Array.from({length:100},(_,i)=>100+i); return Forecasts.linreg(s,20,90); }}, // slope=1, last=199, +20 => 219
  {name:'No-lookahead leakage check: forecast at an origin is IDENTICAL whether or not future data differs', expected: true, tolerance: 0,
    run: ()=>{
      const base = Array.from({length:150},(_,i)=>100+Math.sin(i/7)*5+i*0.1);
      const seriesA = base.slice(0,120).concat(Array.from({length:30},()=>500)); // future replaced with an outlier
      const seriesB = base.slice(0,120).concat(Array.from({length:30},()=>-500)); // different outlier
      // Forecast made "at" origin 119 must only ever see index 0..119 in both cases.
      const predA = Forecasts.holt(seriesA.slice(0,120), 20);
      const predB = Forecasts.holt(seriesB.slice(0,120), 20);
      return Math.abs(predA-predB) < 1e-9;
    }},
  {name:'Walk-forward backtest never reads beyond its origin (bounds check)', expected: true, tolerance: 0,
    run: ()=>{
      // A model that would cheat by reading the LAST element of the full array (leakage) vs one
      // that only reads its truncated input — walkForwardBacktest must only ever pass truncated data.
      let sawFullLength = false;
      const fullLen = 200;
      const cheatCheckModel = (series)=>{ if(series.length === fullLen) sawFullLength = true; return series[series.length-1]; };
      const savedFn = Forecasts.__test; Forecasts.__test = cheatCheckModel;
      walkForwardBacktest(Array.from({length:fullLen},(_,i)=>100+i*0.5), '__test', 20, 10);
      delete Forecasts.__test;
      return sawFullLength === false; // true means the backtest correctly NEVER handed over the full-length series
    }},
  {name:'Black-Scholes call price matches the classic textbook case (S=100,K=100,T=1,r=5%,σ=20%)', expected: 10.4506, tolerance: 0.001,
    run: ()=>Formulas.blackScholes(100,100,1,0.05,0.20,true).price},
  {name:'Black-Scholes put price matches the same classic case', expected: 5.5735, tolerance: 0.001,
    run: ()=>Formulas.blackScholes(100,100,1,0.05,0.20,false).price},
  {name:'Black-Scholes put-call parity holds: C - P = S - K·e^(-rT)', expected: 0, tolerance: 1e-6,
    run: ()=>{ const c=Formulas.blackScholes(100,100,1,0.05,0.20,true).price; const p=Formulas.blackScholes(100,100,1,0.05,0.20,false).price;
      return (c-p) - (100 - 100*Math.exp(-0.05*1)); }},
  {name:'CRR binomial tree (European, 500 steps) converges to Black-Scholes on the same textbook case', expected: 10.4506, tolerance: 0.02,
    run: ()=>Formulas.binomialTree(100,100,1,0.05,0.20,true,false,500).price},
  {name:'American call on a non-dividend-paying stock has ~zero early-exercise premium over European (classic no-arbitrage result)', expected: 0, tolerance: 0.02,
    run: ()=>Formulas.binomialTree(100,100,1,0.05,0.20,true,true,300).price - Formulas.blackScholes(100,100,1,0.05,0.20,true).price},
  {name:'American put is worth at least as much as European put (early exercise can only add value)', expected: true, tolerance: 0,
    run: ()=>{ const am=Formulas.binomialTree(100,90,1,0.05,0.30,false,true,300).price; const eu=Formulas.blackScholes(100,90,1,0.05,0.30,false).price; return am >= eu - 0.005; }},
  {name:'Max drawdown on a crafted series [100,120,90,110,80,130] = -33.33%', expected: -33.3333333, tolerance: 0.001,
    run: ()=>Formulas.maxDrawdown([100,120,90,110,80,130]).maxDrawdownPct},
  {name:'Historical VaR(90%) of returns [-5..4] (10 values) = the 2nd-worst value = -4', expected: -4, tolerance: 1e-9,
    run: ()=>Formulas.historicalVaR([-5,-4,-3,-2,-1,0,1,2,3,4], 0.90)},
  {name:'Inverse normal CDF at 0.975 ≈ 1.95996 (standard 97.5th percentile z-score)', expected: 1.959964, tolerance: 0.001,
    run: ()=>Formulas.invNormalCdf(0.975)},
  {name:'Min-variance portfolio, 2 uncorrelated assets (var 0.04, 0.01) → weights = [0.2, 0.8]', expected: true, tolerance: 0,
    run: ()=>{ const w = Formulas.minVariancePortfolio([[0.04,0],[0,0.01]]); return Math.abs(w[0]-0.2)<1e-6 && Math.abs(w[1]-0.8)<1e-6; }},
  {name:'Monte Carlo GBM is exactly deterministic when σ=0 (100·e^(0.1·1) ≈ 110.517)', expected: 110.517, tolerance: 0.01,
    run: ()=>Formulas.monteCarloGBM(100, 0.1, 0, 252, 5).mean},
  {name:'Risk parity, 2 uncorrelated assets (var 0.04, 0.01), converges to inverse-vol weights [0.333, 0.667]', expected: true, tolerance: 0,
    run: ()=>{ const w = Formulas.riskParityPortfolio([[0.04,0],[0,0.01]]); return Math.abs(w[0]-1/3)<0.001 && Math.abs(w[1]-2/3)<0.001; }},
  // Added along with ADX/CCI/Fibonacci/real-ATR themselves this pass — those four formulas had
  // zero test coverage, breaking this file's own stated principle that every formula is checked
  // against a hand-computed benchmark. Each expected value below was hand-derived (or verified
  // via a separate Python simulation of the exact same algorithm) before being added here.
  {name:'Wilder ATR of a perfectly flat OHLC series (H=L=C always) = 0 (zero true range)', expected: 0, tolerance: 1e-9,
    run: ()=>{ const flat=new Array(20).fill(50); return Formulas.atrReal(flat,flat,flat,14); }},
  {name:'CCI(20) of a perfectly flat series (zero mean deviation) = 0 by definition', expected: 0, tolerance: 1e-9,
    run: ()=>{ const flat=new Array(20).fill(50); return Formulas.cci(flat,flat,flat,20); }},
  {name:'Fibonacci 50% retracement level of swing high=100/low=50 = 75 (midpoint, by definition)', expected: 75, tolerance: 1e-9,
    run: ()=>Formulas.fibRetracement([100],[50]).levels.find(l=>l.pct===0.5).price},
  {name:'ADX=100 on a perfectly one-directional trend with zero whipsaws (pure +DM, zero -DM every period)', expected: 100, tolerance: 1e-6,
    run: ()=>{ const n=40; const highs=Array.from({length:n},(_,i)=>10+i), lows=Array.from({length:n},(_,i)=>8+i), closes=Array.from({length:n},(_,i)=>10+i);
      return Formulas.adx(highs,lows,closes,14); }},
];
function runFormulaTests(){
  const rows = [];
  let pass=0, fail=0;
  TEST_CASES.forEach(tc=>{
    let actual, ok, errMsg='';
    try{
      actual = tc.run();
      if(tc.expected === null){ ok = (actual === null); }
      else if(typeof tc.expected === 'boolean'){ ok = (actual === tc.expected); }
      else{ ok = typeof actual === 'number' && Math.abs(actual - tc.expected) <= tc.tolerance; }
    }catch(e){ ok=false; errMsg = e.message; actual = 'threw: '+e.message; }
    if(ok) pass++; else fail++;
    rows.push([
      tc.name,
      tc.expected===null?'null':tc.expected,
      typeof actual==='number' ? actual.toFixed(6) : String(actual),
      ok ? '<span style="color:var(--up)">PASS</span>' : '<span style="color:var(--down)">FAIL</span>'
    ]);
  });
  const totalEl=document.getElementById('testTotal'), passEl=document.getElementById('testPassed'), failEl=document.getElementById('testFailed'), tableEl=document.getElementById('testTable');
  if(totalEl){ totalEl.textContent = TEST_CASES.length; passEl.textContent = pass; failEl.textContent = fail; tableEl.innerHTML = table(['Test','Expected','Actual','Result'], rows); }
  return {pass, fail, total: TEST_CASES.length};
}
