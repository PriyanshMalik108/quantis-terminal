/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/features/backtest.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Strategy backtester.
 * DEPENDS   engines/*
 * EXPOSES   runBacktestEngine (global — classic script, shared scope)
 * LOAD      Classic <script>, order defined in js/manifest.json. Top-level code runs at load,
 *           so it may only call functions from files listed EARLIER in the manifest.
 * NOTE      Migrated verbatim from the single-file build; inline comments marked
 *           "REAL BUG FIXED" / "post-launch fix" document past defects — keep them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* ===================== BACKTEST ENGINE (real implementation — was hardcoded numbers) =====================
   The old view showed fixed CAGR/Sharpe/Win Rate/Max Drawdown text and a random equity curve
   with zero connection to the stated strategy, and the "Run Backtest" button had no onclick at
   all. Replaced with a real trade-by-trade simulation: walks the currently loaded security's
   actual price history day by day, applies the exact RSI/SMA entry rule and stop/target/RSI
   exit rule shown above it, and computes every metric from the resulting simulated trades. */
/* Strategy definitions — was ONE hardcoded rule (RSI mean-reversion) with no way to test
   anything else. Each strategy below is a real, distinct signal computed from the SAME
   truncated-to-now window the original rule used (series.slice(0, i+1) in the loop below),
   so none of them can see beyond the bar they're trading on — the same no-lookahead
   discipline already enforced and tested for the Forecast engine (walkForwardBacktest above).
   Every entry/exit function receives only past-and-current data. */
let lastBacktestStats = null; // set by runBacktestEngine() below, consumed by the Position Sizing Calculator
const BACKTEST_STRATEGIES = {
  rsi_meanrev: {
    label: 'RSI Mean-Reversion', minWindow: 51,
    ruleHtml: (stopPct,targetPct)=> `IF &nbsp;RSI(14) &lt; 30 &nbsp;AND&nbsp; Price &gt; SMA(50) &nbsp;→&nbsp; BUY<br>EXIT &nbsp;RSI(14) &gt; 70 &nbsp;OR&nbsp; Stop -${stopPct}% &nbsp;OR&nbsp; Target +${targetPct}%`,
    entry(w){ const rsi=Formulas.rsi(w,14), sma50=Formulas.sma(w,50); if(rsi==null||sma50==null) return false; return rsi<30 && w[w.length-1]>sma50; },
    exit(w){ const rsi=Formulas.rsi(w,14); return rsi!=null && rsi>70; }
  },
  sma_cross: {
    label: 'SMA 20/50 Crossover', minWindow: 52,
    ruleHtml: (stopPct,targetPct)=> `IF &nbsp;SMA(20) crosses ABOVE SMA(50) &nbsp;→&nbsp; BUY<br>EXIT &nbsp;SMA(20) crosses BELOW SMA(50) &nbsp;OR&nbsp; Stop -${stopPct}% &nbsp;OR&nbsp; Target +${targetPct}%`,
    entry(w){ const p=w.slice(0,-1); const a=Formulas.sma(w,20),b=Formulas.sma(w,50),ap=Formulas.sma(p,20),bp=Formulas.sma(p,50); if([a,b,ap,bp].some(v=>v==null)) return false; return ap<=bp && a>b; },
    exit(w){ const p=w.slice(0,-1); const a=Formulas.sma(w,20),b=Formulas.sma(w,50),ap=Formulas.sma(p,20),bp=Formulas.sma(p,50); if([a,b,ap,bp].some(v=>v==null)) return false; return ap>=bp && a<b; }
  },
  macd_cross: {
    label: 'MACD Signal Cross', minWindow: 37,
    ruleHtml: (stopPct,targetPct)=> `IF &nbsp;MACD line crosses ABOVE signal line &nbsp;→&nbsp; BUY<br>EXIT &nbsp;MACD line crosses BELOW signal line &nbsp;OR&nbsp; Stop -${stopPct}% &nbsp;OR&nbsp; Target +${targetPct}%`,
    entry(w){ const m=Formulas.macd(w), mp=Formulas.macd(w.slice(0,-1)); if(!m||!mp||m.signal==null||mp.signal==null) return false; return mp.macd<=mp.signal && m.macd>m.signal; },
    exit(w){ const m=Formulas.macd(w), mp=Formulas.macd(w.slice(0,-1)); if(!m||!mp||m.signal==null||mp.signal==null) return false; return mp.macd>=mp.signal && m.macd<m.signal; }
  },
  bb_breakout: {
    label: 'Bollinger Band Breakout', minWindow: 22,
    ruleHtml: (stopPct,targetPct)=> `IF &nbsp;Price crosses ABOVE Upper Band(20,2σ) &nbsp;→&nbsp; BUY<br>EXIT &nbsp;Price crosses BELOW Middle Band (SMA 20) &nbsp;OR&nbsp; Stop -${stopPct}% &nbsp;OR&nbsp; Target +${targetPct}%`,
    entry(w){ const b=Formulas.bollinger(w,20,2), bp=Formulas.bollinger(w.slice(0,-1),20,2); if(!b||!bp) return false; return w[w.length-2]<=bp.upper && w[w.length-1]>b.upper; },
    exit(w){ const b=Formulas.bollinger(w,20,2); return b!=null && w[w.length-1]<b.mid; }
  }
};
let currentBacktestStrategy = 'rsi_meanrev';
document.getElementById('btStrategyChips').addEventListener('click', e=>{
  const chip = e.target.closest('.chip'); if(!chip) return;
  document.querySelectorAll('#btStrategyChips .chip').forEach(c=>c.classList.toggle('active', c===chip));
  currentBacktestStrategy = chip.dataset.strat;
  runBacktestEngine();
});
function runBacktestEngine(){
  const statusEl = document.getElementById('btStatus');
  const series = currentPriceSeries;
  const strat = BACKTEST_STRATEGIES[currentBacktestStrategy];
  if(!series || series.length < Math.max(60, strat.minWindow+10)){
    statusEl.innerHTML = `<span style="color:var(--down)">No price history loaded yet, or not enough of it for ${strat.label} (needs ${strat.minWindow}+ bars) — open Research and select a security first.</span>`;
    return;
  }
  const posSizePct = parseFloat(document.getElementById('btPosSize').value) || 10;
  const stopPct = parseFloat(document.getElementById('btStop').value) || 5;
  const targetPct = parseFloat(document.getElementById('btTarget').value) || 15;
  const slippageBps = parseFloat(document.getElementById('btSlippage').value) || 0;
  document.getElementById('btRuleDesc').innerHTML = strat.ruleHtml(stopPct, targetPct);

  const minWindow = strat.minWindow;
  let equity = 100, equityCurve = [equity], inPosition = false, entryPrice = 0, trades = [];
  for(let i=minWindow; i<series.length; i++){
    const window_ = series.slice(0, i+1); // ONLY data up to and including bar i — no lookahead
    const price = series[i];
    if(!inPosition){
      if(strat.entry(window_)){
        inPosition = true;
        entryPrice = price * (1 + slippageBps/10000); // slippage works against you on entry
      }
    } else {
      const changePct = (price-entryPrice)/entryPrice*100;
      const exitSignal = strat.exit(window_) || changePct <= -stopPct || changePct >= targetPct;
      if(exitSignal){
        const exitPrice = price * (1 - slippageBps/10000); // and on exit
        const tradeReturnPct = (exitPrice-entryPrice)/entryPrice*100;
        const positionFraction = posSizePct/100;
        equity *= (1 + positionFraction*(tradeReturnPct/100));
        trades.push({entryPrice, exitPrice, returnPct: tradeReturnPct});
        inPosition = false;
      }
    }
    equityCurve.push(equity);
  }
  // Close any still-open position at the final price so equity reflects a complete accounting.
  if(inPosition){
    const price = series[series.length-1];
    const tradeReturnPct = (price-entryPrice)/entryPrice*100;
    equity *= (1 + (posSizePct/100)*(tradeReturnPct/100));
    trades.push({entryPrice, exitPrice:price, returnPct: tradeReturnPct, openAtEnd:true});
    equityCurve.push(equity);
  }

  const years = (series.length-minWindow)/252;
  const cagr = years>0 ? (Math.pow(equity/100, 1/years)-1)*100 : 0;
  const equityReturns = Formulas.dailyReturns(equityCurve, false);
  // rf=0: idle cash in this simulation earns nothing, so subtracting a 4% risk-free rate from an
  // equity curve that is flat most of the time produced absurd values like -11.6. Also suppressed
  // below 2 trades, where a Sharpe ratio is statistically meaningless.
  const sharpe = trades.length >= 2 ? Formulas.sharpeRatio(equityReturns, 0, 252) : null;
  const wins = trades.filter(t=>t.returnPct>0).length;
  const winRate = trades.length ? (wins/trades.length*100) : null;
  const dd = Formulas.maxDrawdown(equityCurve);

  document.getElementById('btCagr').innerHTML = trades.length ? `<span class="${cagr>=0?'up':'down'}">${cagr>=0?'+':''}${cagr.toFixed(1)}%</span>` : '—';
  document.getElementById('btSharpe').textContent = sharpe!=null ? sharpe.toFixed(2) : '—';
  document.getElementById('btWinRate').innerHTML = winRate!=null ? winRate.toFixed(0)+'% <span style="font-size:11px;color:var(--text-2);font-weight:400;">('+trades.length+' trade'+(trades.length===1?'':'s')+')</span>' : '—';
  document.getElementById('btMaxDd').innerHTML = `<span class="down">${dd.maxDrawdownPct.toFixed(1)}%</span>`;

  if(backtestChart && backtestChart.destroy) backtestChart.destroy();
  backtestChart = safeNewChart('backtestChart', {type:'line',data:{labels:equityCurve.map((_,i)=>i),datasets:[{data:equityCurve,borderColor:cssVar('--teal'),borderWidth:1.6,pointRadius:0,tension:0.1,fill:true,backgroundColor:'rgba(45,212,191,0.06)'}]},
    options:{responsive:true,plugins:{legend:{display:false}},scales:{x:{display:false},y:{grid:{color:cssVar('--line-soft')},ticks:{color:cssVar('--text-2')}}}}});

  statusEl.innerHTML = `${strat.label} simulated on ${currentSecurity}'s ${currentPriceSeriesIsLive?'<span class="badge fact">LIVE</span>':'<span class="badge assume">SAMPLE</span>'} price history (${series.length} days). ${trades.length} trade(s) taken${trades.length?`, ${wins} win / ${trades.length-wins} loss`:''}.`;
  document.getElementById('btTradesNote').textContent = trades.length
    ? `Trade log: ${trades.slice(0,8).map(t=>`${t.returnPct>=0?'+':''}${t.returnPct.toFixed(1)}%`).join(', ')}${trades.length>8?` …and ${trades.length-8} more`:''}. This is one rule (${strat.label}) on one security's history — not statistically significant, and past performance never guarantees future results.`
    : `No trades triggered by this rule on this security's available history — that's a real (if uneventful) result, not an error.`;

  // Feeds the Position Sizing Calculator below — real win rate / avg win / avg loss from THIS
  // backtest run, so Kelly sizing can be based on an actual (if small-sample) track record
  // instead of only ever guessed manually.
  const winners = trades.filter(t=>t.returnPct>0), losers = trades.filter(t=>t.returnPct<=0);
  if(winners.length>=3 && losers.length>=3){
    lastBacktestStats = {
      winRate: wins/trades.length*100,
      avgWin: winners.reduce((s,t)=>s+t.returnPct,0)/winners.length,
      avgLoss: Math.abs(losers.reduce((s,t)=>s+t.returnPct,0)/losers.length),
      strategy: strat.label, ticker: currentSecurity, n: trades.length,
    };
    const btn = document.getElementById('psAutoFillBtn');
    if(btn) btn.style.display = 'inline-block';
  } else {
    lastBacktestStats = null;
    const btn = document.getElementById('psAutoFillBtn');
    if(btn) btn.style.display = 'none';
  }
}
/* NEW FEATURE: Position Sizing Calculator — real Kelly Criterion (Kelly 1956), the standard
   formula for what fraction of capital to risk per trade to maximize long-run growth, given a
   real win rate and win/loss ratio. Can autofill from the backtest just run above (a real, if
   small-sample, track record) or accept fully manual inputs for sizing any strategy, backtested
   here or not. Shown alongside a simpler, more conservative fixed-fractional-risk sizing so the
   two can be compared side by side — Kelly is a growth-optimal answer, not a "safe" one. */
function fillPositionSizingFromBacktest(){
  if(!lastBacktestStats) return;
  document.getElementById('psWinRate').value = lastBacktestStats.winRate.toFixed(1);
  document.getElementById('psAvgWin').value = lastBacktestStats.avgWin.toFixed(1);
  document.getElementById('psAvgLoss').value = lastBacktestStats.avgLoss.toFixed(1);
  runPositionSizing();
}
function runPositionSizing(){
  const box = document.getElementById('psResult');
  const accountSize = parseFloat(document.getElementById('psAccountSize').value);
  const winRatePct = parseFloat(document.getElementById('psWinRate').value);
  const avgWinPct = parseFloat(document.getElementById('psAvgWin').value);
  const avgLossPct = parseFloat(document.getElementById('psAvgLoss').value);
  if([accountSize,winRatePct,avgWinPct,avgLossPct].some(v=>isNaN(v)) || accountSize<=0){
    box.innerHTML = `<div class="notebox" style="color:var(--down)">Enter a positive account size, and win rate/avg win/avg loss (run a backtest above and click Autofill, or enter your own numbers).</div>`;
    return;
  }
  const kelly = Formulas.kellyCriterion(winRatePct/100, avgWinPct, avgLossPct);
  const sourceNote = lastBacktestStats && Math.abs(lastBacktestStats.winRate-winRatePct)<0.05
    ? `Autofilled from the ${lastBacktestStats.strategy} backtest just run on ${lastBacktestStats.ticker} (${lastBacktestStats.n} trades — a small sample; treat with appropriate skepticism).`
    : `Manually entered win rate / avg win / avg loss.`;
  if(!kelly || !kelly.hasEdge){
    box.innerHTML = `<div class="notebox" style="color:var(--down)">Kelly Criterion says risk <b>0%</b> — with a ${winRatePct}% win rate and ${avgWinPct}%/${avgLossPct}% avg win/loss, this edge is non-positive (expected value ≤ 0). Sizing any position larger than 0 isn't growth-optimal here, mechanically, regardless of conviction. ${sourceNote}</div>`;
    return;
  }
  const fullKellyDollar = accountSize*kelly.fullKelly;
  const halfKellyDollar = accountSize*kelly.halfKelly;
  box.innerHTML = kv([
    ['Full Kelly', `${(kelly.fullKelly*100).toFixed(1)}% of capital → $${fullKellyDollar.toLocaleString(undefined,{maximumFractionDigits:0})}`],
    ['Half Kelly (common practitioner convention)', `${(kelly.halfKelly*100).toFixed(1)}% of capital → $${halfKellyDollar.toLocaleString(undefined,{maximumFractionDigits:0})}`],
    ['Fixed 1% Risk (for comparison)', `$${(accountSize*0.01).toLocaleString(undefined,{maximumFractionDigits:0})} risked per trade (a common simple alternative to Kelly)`],
  ]) + `<div class="notebox" style="margin-top:8px;">${sourceNote} Full Kelly maximizes long-run geometric growth <i>in theory</i>, assuming your win-rate/avg-win/avg-loss inputs are exactly right and stay constant — in practice they're estimated from limited data and drift over time, which is why half-Kelly (or less) is the common real-world convention. This is a mechanical formula output, not investment advice.</div>`;
}
/* Real Black-Scholes-driven option chain, Greeks, and payoff diagram — every number here
   traces back to Formulas.blackScholes, driven by the inputs in the Options view. No random
   or hardcoded values remain (the old chain used Math.random() for "OI" cosmetically only,
   which is retained since open interest genuinely can't be derived from a pricing model —
   it's disclosed as illustrative in the table header). */
function runBlackScholes(){
  const S = parseFloat(document.getElementById('bsSpot').value);
  const K = parseFloat(document.getElementById('bsStrike').value);
  const days = parseFloat(document.getElementById('bsDays').value);
  const r = parseFloat(document.getElementById('bsRate').value)/100;
  const sigma = parseFloat(document.getElementById('bsVol').value)/100;
  const T = days/365;
  const rowEl = document.getElementById('bsGreeksRow');
  if([S,K,days,r,sigma].some(v=>isNaN(v)) || S<=0 || K<=0 || days<=0 || sigma<=0){
    if(rowEl) rowEl.innerHTML = `<div class="card" style="grid-column:1/-1;"><span style="color:var(--down)">Enter valid positive numbers for Spot, Strike, Days, and Vol.</span></div>`;
    return;
  }
  const call = Formulas.blackScholes(S,K,T,r,sigma,true);
  const put = Formulas.blackScholes(S,K,T,r,sigma,false);
  if(rowEl){
    rowEl.innerHTML = [
      ['Call Price', optSym()+call.price.toFixed(2)],
      ['Put Price', optSym()+put.price.toFixed(2)],
      ['Delta (call)', call.delta.toFixed(4)],
      ['Gamma', call.gamma.toFixed(5)],
      ['Vega (per 1% vol)', call.vega.toFixed(4)],
    ].map(([lbl,val])=>`<div class="card"><h3>${lbl}</h3><div style="font-family:var(--mono);font-size:18px;font-weight:700;">${val}</div></div>`).join('');
  }
  const greeksMirror = document.getElementById('optPanelGreeks');
  if(greeksMirror){
    greeksMirror.innerHTML = kv([
      ['Delta (call)', call.delta.toFixed(4)],
      ['Gamma', call.gamma.toFixed(5)],
      ['Theta (call, $/day)', call.theta.toFixed(4)],
      ['Vega (per 1% vol)', call.vega.toFixed(4)],
      ['Rho (call, per 1% rate)', call.rho.toFixed(4)],
    ]);
  }
  // Option chain: same S/T/r/sigma, strikes spaced around spot — every column is a real B-S output
  // except Open Interest, which is genuinely unobservable from a pricing model and stays illustrative.
  const step = niceStrikeStep(S);
  const sDec = Math.max(0, -Math.floor(Math.log10(step)) + (String(step).includes('.5')||String(step).includes('.25') ? 1 : 0));
  const strikes = Array.from({length:7},(_,i)=> +(Math.round(S/step)*step + (i-3)*step).toFixed(sDec)).filter(k=>k>0);
  const chainRows = strikes.map(k=>{
    const c = Formulas.blackScholes(S,k,T,r,sigma,true);
    const pp = Formulas.blackScholes(S,k,T,r,sigma,false);
    const atm = Math.abs(k-S) <= step/2;
    return [atm ? `<b style="color:var(--amber)">${k} ATM</b>` : k, optSym()+c.price.toFixed(2), optSym()+pp.price.toFixed(2), c.delta.toFixed(3), pp.delta.toFixed(3), c.gamma.toFixed(4), c.theta.toFixed(3)];
  });
  const chainEl = document.getElementById('optChain');
  // Open interest used to be Math.random() (changing on every recalculation); a pricing model can't
  // know open interest, so the column now shows the real B-S put price/delta for each strike instead.
  if(chainEl) chainEl.innerHTML = table(['Strike','Call','Put','Call Δ','Put Δ','Gamma','Call Θ/day'], chainRows);

  // Payoff diagram at expiry for a long call at the chosen strike, net of the real computed premium.
  const premium = call.price;
  const labels=[], payoff=[];
  for(let sT = Math.round(S*0.75); sT <= Math.round(S*1.25); sT += Math.max(1,Math.round(S*0.03))){
    labels.push(sT); payoff.push(Math.max(sT-K,0)-premium);
  }
  ['payoffChart','optPayoffMini'].forEach(id=>{
    const ctx = document.getElementById(id); if(!ctx) return;
    if(id==='payoffChart' && payoffChart && payoffChart.destroy) payoffChart.destroy();
    if(id==='optPayoffMini' && optPayoffMini && optPayoffMini.destroy) optPayoffMini.destroy();
    const chart = safeNewChart(id, {type:'line',data:{labels,datasets:[{data:payoff,borderColor:cssVar('--amber'),borderWidth:1.8,pointRadius:0,fill:false}]},
      options:{responsive:true,plugins:{legend:{display:false}},scales:{x:{ticks:{color:cssVar('--text-2')}},y:{grid:{color:cssVar('--line-soft')},ticks:{color:cssVar('--text-2')}}}}});
    if(id==='payoffChart') payoffChart = chart; else optPayoffMini = chart;
  });
  const statusEl = document.getElementById('optPanelStatus');
  if(statusEl) statusEl.innerHTML = `Long ${K}-strike call, ${days}D to expiry, premium ${optSym()}${premium.toFixed(2)} — breakeven at ${optSym()}${(K+premium).toFixed(2)}. All values above are live Black-Scholes output (see Tests tab for validation against the classic textbook case), not hardcoded.`;
  AppState.options = {ticker: currentSecurity, spot:S, strike:K, days, rate:r*100, vol:sigma*100, callPrice: call.price, putPrice: put.price, delta: call.delta, gamma: call.gamma, theta: call.theta, vega: call.vega, breakeven: K+premium};
  renderAmericanComparison(S,K,T,r,sigma,call,put);
}
/* American-vs-European comparison — was entirely absent (every price on this tab was Black-
   Scholes only, which strictly assumes exercise can only happen at expiry). Most real-world
   listed equity options are American-style, and the early-exercise premium is a genuine
   pricing difference, not a rounding error, especially for puts and for calls near an ex-
   dividend date. Uses the CRR binomial tree above with isAmerican=true vs isAmerican=false —
   same inputs, same tree, only the early-exercise comparison at each node differs, so any
   price gap shown here is coming purely from that mechanism. */
function renderAmericanComparison(S,K,T,r,sigma,bsCall,bsPut){
  const box = document.getElementById('americanCompareBox');
  if(!box) return;
  const amCall = Formulas.binomialTree(S,K,T,r,sigma,true,true,200);
  const amPut = Formulas.binomialTree(S,K,T,r,sigma,false,true,200);
  const euCallTree = Formulas.binomialTree(S,K,T,r,sigma,true,false,200);
  const euPutTree = Formulas.binomialTree(S,K,T,r,sigma,false,false,200);
  if(!amCall || !amPut){
    box.innerHTML = `<div class="notebox">Inputs produce an arbitrage-inconsistent binomial step (risk-neutral probability outside [0,1]) — try a smaller Days-to-Expiry or a more typical rate/vol combination.</div>`;
    return;
  }
  const callPremium = amCall.price - bsCall.price;
  const putPremium = amPut.price - bsPut.price;
  box.innerHTML = table(['','European (Black-Scholes)','European (Binomial, 200 steps)','American (Binomial, 200 steps)','Early-Exercise Premium'],[
    ['Call', optSym()+bsCall.price.toFixed(2), optSym()+euCallTree.price.toFixed(2), optSym()+amCall.price.toFixed(2), (callPremium>0.005?'+'+optSym()+callPremium.toFixed(2):optSym()+'0.00 (none — expected for a non-dividend-paying call)')],
    ['Put', optSym()+bsPut.price.toFixed(2), optSym()+euPutTree.price.toFixed(2), optSym()+amPut.price.toFixed(2), (putPremium>0.005?'+'+optSym()+putPremium.toFixed(2):optSym()+'0.00')],
  ]) + `<div class="notebox" style="margin-top:8px;">"European (Binomial)" convergence-checks the tree against Black-Scholes — the two should be within a few cents at 200 steps, confirming the tree itself is correctly built. The American column is the same tree with one added rule: at every node, take whichever is worth more, holding or exercising immediately. A non-dividend-paying American call is famously never optimal to exercise early (so its premium is ~$0, as shown) — American puts and dividend-paying calls generally do carry a real premium, which is what the last column measures. No dividend yield is modeled here (assumes 0%); a dividend-paying underlying would show a larger call premium too.</div>`;
}
