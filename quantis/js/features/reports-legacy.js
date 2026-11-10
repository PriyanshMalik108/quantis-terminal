/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/features/reports-legacy.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Original markdown report (superseded by modules/reports/*). Kept because the Export Center reuses buildReportMarkdown.
 * DEPENDS   core/app-state.js
 * EXPOSES   buildReportMarkdown (global — classic script, shared scope)
 * LOAD      Classic <script>, order defined in js/manifest.json. Top-level code runs at load,
 *           so it may only call functions from files listed EARLIER in the manifest.
 * NOTE      Migrated verbatim from the single-file build; inline comments marked
 *           "REAL BUG FIXED" / "post-launch fix" document past defects — keep them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* ===================== REPORTS ===================== */
function renderReportsSecSelect(){ document.getElementById('repSec').innerHTML = SECURITIES.map(s=>`<option>${s.t}</option>`).join(''); }

/* ===================== REPORT GENERATOR (Phase 6, spec sections 37/73) =====================
   Builds a real Markdown report from AppState — every figure traces to an actual computed
   value; anything not computed for the selected report ticker prints "data unavailable"
   rather than a placeholder number. This only reports on whatever ticker is CURRENTLY loaded
   in AppState (the app computes one security's full analysis at a time), so if you pick a
   different ticker in the dropdown than the one currently open in Research, it's disclosed. */
function buildReportMarkdown(ticker){
  const sec = SECURITIES.find(s=>s.t===ticker);
  const stale = ticker !== currentSecurity;
  const lines = [];
  lines.push(`# Research Report: ${sec?sec.n:ticker} (${ticker})`);
  lines.push(`\n_Generated ${new Date().toISOString()} by Quantis Terminal — not personalized investment advice._\n`);
  if(stale) lines.push(`> **Note:** AppState currently holds computed data for **${currentSecurity}**, not ${ticker}. Select ${ticker} in the Research tab first to populate its real figures below.\n`);

  lines.push(`## Executive Summary`);
  const summaryParts = [];
  if(!stale && AppState.dcf) summaryParts.push(`DCF implies ${fmtPct(AppState.dcf.upsidePct)} vs current price.`);
  if(!stale && AppState.technicals) summaryParts.push(`RSI(14) at ${fmtNum(AppState.technicals.rsi14,1)}, ${AppState.technicals.sma20>AppState.technicals.sma50?'short-term uptrend':'short-term downtrend'} structure.`);
  if(!stale && AppState.risk) summaryParts.push(`Annualized volatility ≈ ${fmtPct(AppState.risk.annualVolPct)}, Sharpe ${fmtNum(AppState.risk.sharpe)}.`);
  if(!stale && AppState.forecast) summaryParts.push(`${AppState.forecast.horizon}-day ensemble forecast: ${fmtPct(AppState.forecast.ensemblePredPct)} (confidence: ${AppState.forecast.confidence}).`);
  lines.push(summaryParts.length ? summaryParts.join(' ') : '_data unavailable — open Technicals/Valuation/Risk/Prediction tabs for this security first._');

  lines.push(`\n## Fundamentals`);
  const f = !stale ? AppState.fundamentals : null;
  lines.push(f ? (f.isLive
    ? `Source: SEC EDGAR (real filed 10-K XBRL). Revenue $${(f.revenue/1e6).toFixed(0)}mn, Net Income $${(f.netIncome/1e6).toFixed(0)}mn${f.roePct!=null?`, ROE ${fmtPct(f.roePct)}, Net Margin ${fmtPct(f.netMarginPct)}`:''}.`
    : `Source: SAMPLE (SEC EDGAR unreachable or ticker not mapped — see Data Sources).`) : '_data unavailable_');

  lines.push(`\n## Technical Analysis`);
  const t = !stale ? AppState.technicals : null;
  lines.push(t ? `RSI(14): ${fmtNum(t.rsi14,1)} · Stoch %K: ${fmtNum(t.stochK,1)} · Williams %R: ${fmtNum(t.willR,1)} · ROC(10): ${fmtPct(t.roc10)}\nMACD: ${t.macd&&t.macd.macd!=null?t.macd.macd.toFixed(2):'n/a'} vs signal ${t.macd&&t.macd.signal!=null?t.macd.signal.toFixed(2):'n/a'} · 20-SMA: ${fmtNum(t.sma20)} · 50-SMA: ${fmtNum(t.sma50)}\n30D annualized historical volatility: ${fmtPct(t.histVol)}` : '_data unavailable_');

  lines.push(`\n## Valuation (DCF)`);
  const d = !stale ? AppState.dcf : null;
  lines.push(d ? `Fair value (base case): ${fmtPrice(d.fairValueBase, d.ccy)} vs current ${fmtPrice(d.currentPrice, d.ccy)} (${fmtPct(d.upsidePct)})\nBear: ${fmtPrice(d.fairValueBear, d.ccy)} · Bull: ${fmtPrice(d.fairValueBull, d.ccy)}\nAssumptions: WACC ${d.inputs.wacc}%, 5Y growth ${d.inputs.growth}%, terminal growth ${d.inputs.terminal}%, FCF₀ ${d.inputs.fcf0}mn (local currency), ${d.inputs.shares}mn shares.` : '_data unavailable_');

  lines.push(`\n## Risk`);
  const r = !stale ? AppState.risk : null;
  lines.push(r ? `Historical VaR (1D, 95%): ${fmtPct(r.varHist*100)} · CVaR: ${fmtPct(r.cvarHist*100)} · Parametric VaR: ${fmtPct(r.varParam*100)}\nMax drawdown: ${fmtPct(r.maxDrawdownPct)} · Annualized vol: ${fmtPct(r.annualVolPct)} · Sharpe: ${fmtNum(r.sharpe)} · Sortino: ${fmtNum(r.sortino)}\nComputed from ${r.isLive?'live':'sample'} daily returns.` : '_data unavailable_');

  lines.push(`\n## Prediction`);
  const p = !stale ? AppState.forecast : null;
  lines.push(p ? `${p.horizon}-day ensemble: ${fmtPct(p.ensemblePredPct)}, range ${fmtPct(p.rangeLow)} to ${fmtPct(p.rangeHigh)} (±1σ backtested error)\nP(positive): ${p.probPos!=null?p.probPos.toFixed(0)+'%':'n/a'} · Confidence: ${p.confidence} · Walk-forward directional accuracy: ${p.ensDirAcc!=null?p.ensDirAcc.toFixed(0)+'%':'n/a'}\nModels: ${p.models.map(m=>`${m.label} ${fmtPct(m.predPct)} (weight ${(m.weight*100).toFixed(0)}%)`).join(', ')}` : '_data unavailable_');

  lines.push(`\n## Options`);
  const o = !stale ? AppState.options : null;
  lines.push(o ? `${o.strike}-strike, ${o.days}D to expiry, IV ${o.vol}%: Call $${fmtNum(o.callPrice)}, Put $${fmtNum(o.putPrice)}\nDelta ${fmtNum(o.delta,4)} · Gamma ${fmtNum(o.gamma,5)} · Theta ${fmtNum(o.theta,4)}/day · Vega ${fmtNum(o.vega,4)}` : '_data unavailable_');

  lines.push(`\n## Methodology & Data Sources`);
  lines.push(`Technicals/DCF/Risk/Options: Formula Engine, validated against a 25-case benchmark test suite (Tests tab). Prediction: walk-forward-backtested statistical ensemble (naive/drift/linear-regression/Holt), proven no-lookahead-leakage. Fundamentals: SEC EDGAR XBRL where live-reachable, sample otherwise. Prices: Yahoo Finance where live-reachable, sample otherwise. All "LIVE" vs "SAMPLE" labeling in-app reflects what actually happened on this run, not a claim.`);

  lines.push(`\n## Disclaimer`);
  lines.push(`This report is generated by an analytical/research tool. Forecasts are probabilistic estimates, not guarantees. Historical performance does not guarantee future results. This is not personalized investment advice.`);

  return lines.join('\n');
}
function generateReport(){
  const t = document.getElementById('repSec').value;
  const md = buildReportMarkdown(t);
  document.getElementById('reportPreview').innerHTML = `<div class="card" style="white-space:pre-wrap;font-family:var(--mono);font-size:11px;line-height:1.6;">${md.replace(/[&<>]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</div>`;
}
function downloadReportMarkdown(){
  const t = document.getElementById('repSec').value;
  const md = buildReportMarkdown(t);
  downloadBlob(`quantis-report-${t}.md`, md, 'text/markdown');
}
function printReportPDF(){
  const t = document.getElementById('repSec').value;
  const md = buildReportMarkdown(t);
  const html = md.replace(/[&<>]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))
    .replace(/^# (.*)$/gm,'<h1>$1</h1>').replace(/^## (.*)$/gm,'<h2>$1</h2>')
    .replace(/\n\n/g,'</p><p>').replace(/\n/g,'<br>');
  const w = window.open('', '_blank');
  if(!w){ toast('Pop-up blocked — allow pop-ups for this page to print the report.'); return; }
  w.document.write(`<html><head><title>Quantis Report — ${t}</title><style>body{font-family:Georgia,serif;max-width:720px;margin:40px auto;line-height:1.5;color:#111;} h1{font-size:22px;} h2{font-size:16px;margin-top:24px;border-bottom:1px solid #ccc;padding-bottom:4px;} p{font-size:13px;}</style></head><body><p>${html}</p></body></html>`);
  w.document.close();
  setTimeout(()=>w.print(), 300);
}
