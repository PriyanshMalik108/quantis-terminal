/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/engines/risk.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Risk tab: VaR, CVaR, drawdown, Sharpe/Sortino, GARCH.
 * DEPENDS   engines/*
 * EXPOSES   computeAndRenderRisk (global — classic script, shared scope)
 * LOAD      Classic <script>, order defined in js/manifest.json. Top-level code runs at load,
 *           so it may only call functions from files listed EARLIER in the manifest.
 * NOTE      Migrated verbatim from the single-file build; inline comments marked
 *           "REAL BUG FIXED" / "post-launch fix" document past defects — keep them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* ===================== RISK ENGINE (Phase 5, spec section 29) =====================
   Every figure below is computed from the actual currentPriceSeries return distribution
   via the Formula Engine — historical VaR/CVaR are real percentiles of realized returns,
   parametric VaR uses the real inverse-normal function, max drawdown walks the real price
   path, and stress scenarios scale by the security's own measured volatility rather than
   using fixed sample shock percentages. */
function computeAndRenderRisk(){
  const statusEl = document.getElementById('riskStatus');
  if(!statusEl || !currentPriceSeries || currentPriceSeries.length < 31) return;
  const s = currentPriceSeries;
  const returns = Formulas.dailyReturns(s, false); // simple returns for VaR in % terms
  const meanRet = returns.reduce((a,b)=>a+b,0)/returns.length;
  const sd = Formulas.stddev(returns, true);
  const varHist = Formulas.historicalVaR(returns, 0.95);
  const cvarHist = Formulas.historicalCVaR(returns, 0.95);
  const varParam = Formulas.parametricVaR(meanRet, sd, 0.95);
  const dd = Formulas.maxDrawdown(s);
  const sharpe = Formulas.sharpeRatio(returns, 0.04, 252);
  const sortino = Formulas.sortinoRatio(returns, 0.04, 252);

  document.getElementById('riskVarHist').textContent = (varHist*100).toFixed(2)+'%';
  document.getElementById('riskCvarHist').textContent = (cvarHist*100).toFixed(2)+'%';
  document.getElementById('riskMaxDd').textContent = dd.maxDrawdownPct.toFixed(1)+'%';
  document.getElementById('riskVarParam').textContent = (varParam*100).toFixed(2)+'%';
  document.getElementById('riskSharpe').textContent = sharpe!=null ? sharpe.toFixed(2) : '—';
  document.getElementById('riskSortino').textContent = sortino!=null ? sortino.toFixed(2) : '—';
  statusEl.innerHTML = `<b>Source:</b> computed from ${currentPriceSeriesIsLive?'<span class="badge fact">LIVE</span>':'<span class="badge assume">SAMPLE</span>'} daily returns (n=${returns.length}) via the Formula Engine — historical VaR/CVaR are real empirical percentiles, parametric VaR uses the real inverse-normal CDF, Sharpe/Sortino assume a 4% annual risk-free rate.`;

  const annualVol = sd * Math.sqrt(252);
  const stressRows = [
    ['Market crash (-6σ daily move)', (-6*sd*100).toFixed(1)+'%'],
    ['Severe stress (-4σ daily move)', (-4*sd*100).toFixed(1)+'%'],
    ['Elevated volatility (-2σ daily move)', (-2*sd*100).toFixed(1)+'%'],
    ['Annualized volatility (1σ, 1Y)', (annualVol*100).toFixed(1)+'%'],
  ];
  const stressEl = document.getElementById('stressTable');
  if(stressEl) stressEl.innerHTML = table(['Scenario','Est. 1-Day Impact'], stressRows);

  AppState.risk = {ticker: currentSecurity, varHist, cvarHist, varParam, maxDrawdownPct: dd.maxDrawdownPct, sharpe, sortino, annualVolPct: annualVol*100, isLive: currentPriceSeriesIsLive};
  renderGarchForecast(returns, annualVol);
  runMonteCarlo();
  computeAndRenderQuant();
  computeAndRenderFactors();
}
/* GARCH(1,1) forecast card — see Formulas.garch11 above for the estimation method. Shows the
   fitted parameters, current conditional volatility vs. the simple unconditional (historical
   average) volatility already shown elsewhere on this tab, and 1-day/20-day-ahead forecasts. */
function renderGarchForecast(returns, unconditionalAnnualVol){
  const box = document.getElementById('garchBox'), badge = document.getElementById('garchBadge');
  if(!box) return;
  const g = Formulas.garch11(returns, 500);
  if(!g){
    box.innerHTML = `<div class="notebox">Need at least 50 daily returns to fit GARCH(1,1) reliably (have ${returns.length}).</div>`;
    if(badge){ badge.textContent = 'N/A'; badge.className = 'badge assume'; }
    return;
  }
  const currentVolAnnual = Math.sqrt(Math.max(g.lastConditionalVar,0)*252)*100;
  const fc1 = Math.sqrt(Math.max(g.forecastVariance(1),0)*252)*100;
  const fc20 = Math.sqrt(Math.max(g.forecastVariance(20),0)*252)*100;
  const longRunAnnual = Math.sqrt(Math.max(g.longRunVar,0)*252)*100;
  const halfLife = g.persistence>0 && g.persistence<1 ? Math.log(0.5)/Math.log(g.persistence) : null;
  box.innerHTML = kv([
    ['Current conditional volatility (annualized)', currentVolAnnual.toFixed(1)+'%'],
    ['1-day-ahead forecast (annualized)', fc1.toFixed(1)+'%'],
    ['20-day-ahead forecast (annualized)', fc20.toFixed(1)+'%'],
    ['Long-run (unconditional) volatility', longRunAnnual.toFixed(1)+'%'],
    ['Simple historical volatility (for comparison)', (unconditionalAnnualVol*100).toFixed(1)+'%'],
    ['α (reaction to shocks) / β (persistence)', `${g.alpha.toFixed(2)} / ${g.beta.toFixed(2)}`],
    ['Persistence (α+β)', g.persistence.toFixed(3) + (g.persistence>0.98?' (very persistent — shocks decay slowly)':g.persistence<0.7?' (fast mean-reversion)':'')],
    ['Volatility shock half-life', halfLife!=null ? halfLife.toFixed(0)+' trading days' : '—'],
  ]) + `<div class="notebox" style="margin-top:8px;">Fit via variance-targeted maximum-likelihood grid search over α (0.01–0.30) and β (jointly &lt;0.99) on the last ${g.n} daily returns, omega pinned to the sample long-run variance (Engle 2002 variance-targeting). Log-likelihood: ${g.logLikelihood.toFixed(1)}. Unlike the simple historical volatility above (a flat average), this captures volatility clustering — if the series has been unusually calm or turbulent recently, the near-term forecast reflects that and geometrically reverts toward the long-run level.</div>`;
  if(badge){ badge.textContent = currentPriceSeriesIsLive?'LIVE fit':'SAMPLE-data fit'; badge.className = currentPriceSeriesIsLive?'badge fact':'badge assume'; }
}
