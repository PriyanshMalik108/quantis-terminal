/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/features/docs.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Methodology view.
 * DEPENDS   —
 * EXPOSES   renderDocs (global — classic script, shared scope)
 * LOAD      Classic <script>, order defined in js/manifest.json. Top-level code runs at load,
 *           so it may only call functions from files listed EARLIER in the manifest.
 * NOTE      Migrated verbatim from the single-file build; inline comments marked
 *           "REAL BUG FIXED" / "post-launch fix" document past defects — keep them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* ===================== DOCS ===================== */
const DOC_ENTRIES = [
  {name:'Sharpe Ratio', formula:'(Rp − Rf) / σp', use:'Risk-adjusted return per unit of total volatility.', lim:'Assumes returns are roughly normal and treats upside volatility as risk; unstable on short or autocorrelated samples.'},
  {name:'Sortino Ratio', formula:'(Rp − Rf) / σdownside', use:'Like Sharpe, but only penalizes downside volatility, not upside swings.', lim:'Depends on the chosen minimum-acceptable return; noisy when there are few downside observations.'},
  {name:'Value at Risk (VaR)', formula:'Percentile of loss distribution at confidence level', use:'Estimates potential loss over a horizon at a given confidence.', lim:'Says nothing about losses beyond the threshold; historical VaR assumes the past window is representative.'},
  {name:'Conditional VaR (CVaR / Expected Shortfall)', formula:'E[Loss | Loss > VaR]', use:'Average loss in the tail beyond VaR — captures severity, not just threshold.', lim:'Needs many tail observations to be stable; still backward-looking.'},
  {name:'Maximum Drawdown', formula:'min[(Vt − Vpeak) / Vpeak]', use:'Largest peak-to-trough decline over the observed history.', lim:'Single worst path only — highly dependent on the sample window and says nothing about frequency.'},
  {name:'CAPM', formula:'Ri = Rf + β(Rm − Rf)', use:'Expected return given systematic (market) risk.', lim:'Single-factor model; empirical betas and the market risk premium are unstable over time.'},
  {name:'Beta', formula:'Cov(Ri, Rm) / Var(Rm)', use:'Sensitivity of security returns to market returns.', lim:'Sensitive to the benchmark, return frequency and look-back window chosen.'},
  {name:'DCF (FCFF)', formula:'Σ FCFFt / (1+WACC)^t + Terminal Value', use:'Intrinsic value from projected free cash flows.', lim:'Extremely sensitive to WACC and terminal growth; terminal value often dominates the result.'},
  {name:'Black-Scholes (Call/Put)', formula:'C = S·N(d1) − K·e^(−rT)·N(d2)', use:'Theoretical European option price; d1/d2 from S, K, T, r, σ.', lim:'European exercise, constant volatility and rates, no dividends, log-normal prices — real markets show volatility smiles.'},
  {name:'Option Greeks', formula:'Δ=∂C/∂S, Γ=∂²C/∂S², Θ=∂C/∂T, ν=∂C/∂σ', use:'Sensitivity of option price to underlying, time, and volatility.', lim:'Local, first/second-order sensitivities — accurate only for small moves and short horizons.'},
  {name:'RSI', formula:'100 − [100 / (1 + RS)], RS = Avg Gain / Avg Loss', use:'Momentum oscillator identifying overbought/oversold.', lim:'Can stay overbought/oversold for long periods in strong trends; the 70/30 thresholds are conventions, not laws.'},
  {name:'MACD', formula:'EMA(12) − EMA(26), Signal = EMA9(MACD)', use:'Trend-following momentum via moving-average convergence/divergence.', lim:'Lagging by construction; whipsaws in sideways markets.'},
  {name:'Bollinger Bands', formula:'SMA(n) ± k·σ(n)', use:'Volatility bands around a moving average; price extremes vs. recent range.', lim:'Assumes a stable volatility regime; band touches are not signals on their own.'},
  {name:'Stochastic %K', formula:'100 × (C − Ln) / (Hn − Ln)', use:"Momentum: today's close relative to its n-period high/low range.", lim:'Very noisy on short look-backs; usually smoothed (%D) in practice.'},
  {name:"Williams %R", formula:'−100 × (Hn − C) / (Hn − Ln)', use:'Inverse-scaled cousin of Stochastic %K; overbought/oversold oscillator.', lim:'Same limitations as Stochastic %K — it is the same quantity on a different scale.'},
  {name:'Rate of Change (ROC)', formula:'100 × (Ct − Ct-n) / Ct-n', use:'Percentage price change over n periods — raw momentum.', lim:'Highly sensitive to the start point of the window.'},
  {name:'Average True Range (ATR)', formula:'Wilder-smoothed avg of True Range = max(H−L, |H−Cprev|, |L−Cprev|)', use:"Volatility measure independent of price direction; used for stop-sizing.", lim:'Non-directional and scale-dependent — compare across securities only as % of price.'},
  {name:'ADX (Average Directional Index)', formula:'Wilder-smoothed avg of DX = 100×|+DI−−DI|/(+DI+−DI)', use:'Trend STRENGTH regardless of direction; >25 = trending, ≤20 = range-bound.', lim:'Lagging; measures trend strength, not direction.'},
  {name:'CCI (Commodity Channel Index)', formula:'(TP − SMA(TP,n)) / (0.015 × Mean Deviation)', use:'Measures deviation of typical price from its statistical average.', lim:'Unbounded; the ±100 thresholds are conventions that vary by instrument.'},
  {name:'Fibonacci Retracement', formula:'High − (High − Low) × {23.6%, 38.2%, 50%, 61.8%, 78.6%}', use:'Common technical support/resistance levels within a swing range.', lim:'Levels are conventions with weak statistical evidence; depends entirely on which swing is chosen.'},
  {name:'Monte Carlo Simulation (GBM)', formula:'St+1 = St·exp[(μ−σ²/2)Δt + σ√Δt·Z]', use:'Simulates thousands of price paths under Geometric Brownian Motion to estimate risk/outcome distributions.', lim:'GBM assumes constant drift/volatility and no jumps or fat tails — it understates crash risk.'},
  {name:'Minimum-Variance Portfolio', formula:'min wᵀΣw, subject to Σw=1', use:'Portfolio weights minimizing total variance for a given asset covariance matrix.', lim:'Relies on an estimated covariance matrix; can produce concentrated or negative weights.'},
  {name:'Risk Parity Portfolio', formula:'wi ∝ 1/σi (equal risk contribution)', use:'Weights each asset so it contributes equally to total portfolio risk.', lim:'Ignores expected returns; low-volatility assets can end up dominating the allocation.'},
  {name:'Diversification Ratio', formula:'(Σ wi·σi) / σportfolio', use:'How much risk reduction diversification is providing vs. a weighted-average of standalone volatilities.', lim:'Depends on the stability of the correlations used; correlations rise in crises.'},
];
function renderDocs(){
  document.getElementById('docsGrid').innerHTML = DOC_ENTRIES.map(d=>`
    <div class="card"><h3>${d.name}</h3>
      <div class="notebox"><b>Formula:</b> ${d.formula}<br><b>Use case:</b> ${d.use}<br><b>Limitations:</b> ${d.lim || 'See the methodology notes next to each result in the app.'}</div>
    </div>`).join('');
}
