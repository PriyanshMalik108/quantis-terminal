/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/features/research.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Research workspace: watchlist, security header, tab bar and panel templates.
 * DEPENDS   data/*, engines/*
 * EXPOSES   renderWatchlist, renderTabs, renderPanels, selectSecurity (global — classic script, shared scope)
 * LOAD      Classic <script>, order defined in js/manifest.json. Top-level code runs at load,
 *           so it may only call functions from files listed EARLIER in the manifest.
 * NOTE      Migrated verbatim from the single-file build; inline comments marked
 *           "REAL BUG FIXED" / "post-launch fix" document past defects — keep them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* ===================== RESEARCH: watchlist / header / tabs ===================== */
function renderWatchlist(){
  const wl = document.getElementById('watchlist');
  const tickers = activeWatchlist();
  if(tickers.length === 0){
    wl.innerHTML = `<div style="padding:14px 12px;color:var(--text-2);font-size:11.5px;line-height:1.6;">This workspace's watchlist is empty. Tap the <b style="color:var(--text-1)">+</b> above to add a ticker.</div>`;
    return;
  }
  wl.innerHTML = tickers.map(t=>{
    const s = SECURITIES.find(x=>x.t===t);
    if(!s) return ''; // ticker removed from universe some other way — skip rather than crash
    return `
    <div class="wl-item ${s.t===currentSecurity?'active':''}" data-t="${s.t}">
      <div style="display:flex;align-items:center;gap:8px;">${logoHtmlFor(s.t,22)}<div><div class="wl-tick">${s.t}</div><div class="wl-sub">${s.ex}</div></div></div>
      <div style="display:flex;align-items:center;">
        <div class="wl-px"><div class="wl-price">${fmtPrice(s.px, s.ccy)}</div><div class="wl-chg ${s.chg>=0?'up':'down'}">${s.chg>=0?'+':''}${s.chgPct.toFixed(2)}%</div></div>
        <button class="wl-remove" data-remove="${s.t}" title="Remove from watchlist" aria-label="Remove ${s.t} from watchlist" onclick="event.stopPropagation();removeFromWatchlist('${s.t}')">×</button>
      </div>
    </div>`;
  }).join('');
  wl.querySelectorAll('.wl-item').forEach(el=>el.addEventListener('click',()=>selectSecurity(el.dataset.t)));
}
/* Add to watchlist: a search box that finds ANY security worldwide (not just the built-in list). */
function promptAddToWatchlist(){
  const ov = document.createElement('div'); ov.className = 'modalOverlay show';
  ov.innerHTML = `<div class="modalBox" style="width:460px"><h3>Add to watchlist</h3><p class="qxa-dim">Search by company name, ticker or ISIN — any exchange worldwide, plus ETFs, indices, crypto, currencies and commodities.</p><input id="wlPick" class="qx-input" placeholder="e.g. Taparia Tools, AAPL, INE002A01018"><div style="text-align:right;margin-top:12px"><button class="btn secondary small" type="button" id="wlPickClose">Close</button></div></div>`;
  document.body.appendChild(ov);
  const close = () => ov.remove();
  ov.addEventListener('click', e=>{ if(e.target===ov) close(); });
  ov.querySelector('#wlPickClose').onclick = close;
  const inp = ov.querySelector('#wlPick'); QXPICK.attach(inp, {onPick:t=>{ addToWatchlist(t); renderWatchlist(); try{ refreshDashWatch(); }catch(e){} close(); }});
  setTimeout(()=>inp.focus(), 30);
  inp.addEventListener('keydown', e=>{ if(e.key==='Escape') close(); });
}
/* Previously: renderScoreChips() rendered a single static SCORES array (Fundamental 78,
   Technical 61, Valuation 44, Quality 82...) that never changed no matter which security
   was selected — reported by a user as "scorecards not working." Root cause: it was called
   once at init and never recomputed. Fixed by deriving every value from the security actually
   selected: fundamentals/quality/valuation from the same seeded-sample fundamentals engine the
   Fundamentals tab already uses (deterministic per ticker, disclosed as SAMPLE, not live —
   see fundamentalsPanelHtml), and technical/momentum/risk from the REAL price series once it's
   loaded (Formulas.rsi/roc/historicalVolAnnualized on currentPriceSeries — live Stooq data when
   reachable, sample random walk otherwise, exactly like the Technicals tab). Any asset class or
   metric with no honest basis renders '—' rather than a fabricated number. */
function clamp(v,lo,hi){ return Math.max(lo, Math.min(hi, v)); }
function computeScoreChipsFor(t){
  const s = SECURITIES.find(x=>x.t===t);
  let fundamentalScore=null, valuationScore=null, qualityScore=null;
  const L = (typeof LIVE_FUNDAMENTALS !== 'undefined') ? LIVE_FUNDAMENTALS[t] : null;
  if(s && s.cls === 'Equity' && L){
    // From live reported numbers only — '—' until they arrive (no seeded placeholders).
    const nm = L.profitMargin!=null ? L.profitMargin*100 : null, g = L.revenueGrowth!=null ? L.revenueGrowth*100 : null;
    if(nm!=null) fundamentalScore = clamp(Math.round(45 + nm*1.2 + (g!=null ? clamp(g,-20,30)*0.8 : 0)), 5, 95);
    const roe = L.roe!=null ? L.roe*100 : null;
    if(roe!=null) qualityScore = clamp(Math.round(30 + clamp(roe,-20,60)*1.1 - (L.debtToEquity!=null ? Math.min(20, L.debtToEquity*5) : 0) + (L.grossMargin!=null ? L.grossMargin*20 : 0)), 5, 95);
    if(L.pe!=null) valuationScore = L.pe>0 ? clamp(Math.round(100 - Math.min(90, L.pe*1.6)), 5, 95) : 10;
  }
  let technicalScore=null, momentumScore=null, riskScore=null;
  if(currentSecurity===t && currentPriceSeries && currentPriceSeries.length>=30){
    const rsi = Formulas.rsi(currentPriceSeries,14);
    const roc = Formulas.roc(currentPriceSeries,10);
    const vol = Formulas.historicalVolAnnualized(currentPriceSeries,30);
    if(rsi!=null) technicalScore = clamp(Math.round(rsi), 5, 95);
    if(roc!=null) momentumScore = clamp(Math.round(50+roc*3), 5, 95);
    if(vol!=null) riskScore = clamp(Math.round(100-vol*1.5), 5, 95); // vol is already in % (e.g. 25 = 25%); lower realized vol -> higher (safer) score
  }
  const parts = [['Fundamental',fundamentalScore],['Technical',technicalScore],['Valuation',valuationScore],
    ['Quality',qualityScore],['Momentum',momentumScore],['Risk',riskScore]];
  const known = parts.map(p=>p[1]).filter(v=>v!=null);
  const overall = known.length ? Math.round(known.reduce((a,b)=>a+b,0)/known.length) : null;
  return [...parts.map(([k,v])=>({k, v: v==null?'—':v})), {k:'Overall', v: overall==null?'—':overall}];
}
function renderScoreChips(){
  const el = document.getElementById('scoreChips');
  if(!el) return;
  const chips = computeScoreChipsFor(currentSecurity);
  el.innerHTML = chips.map(s=>`<div class="scorechip"><div class="lbl">${s.k}</div><div class="val" style="color:${typeof s.v==='number'?scoreColor(s.v):'var(--text-2)'}">${s.v}</div></div>`).join('');
  el.classList.remove('updated'); void el.offsetWidth; el.classList.add('updated'); // visual confirmation these actually changed, not frozen
}
function renderTabs(){
  const tb = document.getElementById('tabs');
  tb.innerHTML = TABS.map((t,i)=>`<button class="tabbtn ${i===0?'active':''}" data-tab="${t.id}">${t.label}</button>`).join('');
  tb.querySelectorAll('.tabbtn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      tb.querySelectorAll('.tabbtn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
      document.getElementById('panel-'+btn.dataset.tab).classList.add('active');
      if(btn.dataset.tab==='overview') setTimeout(drawPriceChart,10);
      if(btn.dataset.tab==='options') setTimeout(()=>{ syncOptionsToSelection(); runBlackScholes(); },10);
      btn.scrollIntoView({block:'nearest', inline:'nearest', behavior:'smooth'});
      if(btn.dataset.tab==='news') setTimeout(computeAndRenderNews,10);
      if(btn.dataset.tab==='analysis') setTimeout(()=>QXA.render(currentSecurity),10);
    });
  });
}
/* Event delegation on the panel container — renderPanels() rebuilds this HTML every time a
   security is selected, so per-render listeners would be silently lost on every switch. One
   delegated listener attached once at init survives every re-render. */
document.getElementById('tabcontent').addEventListener('click', e=>{
  const rangeBtn = e.target.closest('[data-range]');
  if(rangeBtn){
    chartControls.range = rangeBtn.dataset.range;
    document.querySelectorAll('.chart-toolbar [data-range]').forEach(b=>b.classList.toggle('active', b===rangeBtn));
    redrawChart();
    return;
  }
  const typeBtn = e.target.closest('[data-type]');
  if(typeBtn){
    chartControls.type = typeBtn.dataset.type;
    document.querySelectorAll('.chart-toolbar [data-type]').forEach(b=>b.classList.toggle('active', b===typeBtn));
    redrawChart();
    return;
  }
  const overlayChip = e.target.closest('[data-overlay]');
  if(overlayChip){
    const key = overlayChip.dataset.overlay;
    chartControls.overlays[key] = !chartControls.overlays[key];
    overlayChip.classList.toggle('active', chartControls.overlays[key]);
    if(chartControls.type !== 'line'){ chartControls.type = 'line'; document.querySelectorAll('.chart-toolbar [data-type]').forEach(b=>b.classList.toggle('active', b.dataset.type==='line')); }
    redrawChart();
    return;
  }
  const compareChip = e.target.closest('#compareChip');
  if(compareChip){
    chartControls.compareMode = !chartControls.compareMode;
    compareChip.classList.toggle('active', chartControls.compareMode);
    const input = document.getElementById('compareInput');
    if(input){
      input.style.display = chartControls.compareMode ? 'inline-block' : 'none';
      if(chartControls.compareMode) input.focus();
    }
    if(chartControls.type !== 'line' && chartControls.compareMode){ chartControls.type = 'line'; document.querySelectorAll('.chart-toolbar [data-type]').forEach(b=>b.classList.toggle('active', b.dataset.type==='line')); }
    redrawChart();
    return;
  }
});
document.getElementById('tabcontent').addEventListener('keydown', e=>{
  if(e.target.id === 'compareInput' && e.key === 'Enter'){
    chartControls.compareTickers = e.target.value.split(',').map(t=>t.trim().toUpperCase()).filter(Boolean).slice(0,4);
    redrawChart();
  }
});
document.getElementById('tabcontent').addEventListener('blur', e=>{
  if(e.target.id === 'compareInput'){
    chartControls.compareTickers = e.target.value.split(',').map(t=>t.trim().toUpperCase()).filter(Boolean).slice(0,4);
    redrawChart();
  }
}, true);
function renderPanels(){
  const c = document.getElementById('tabcontent');
  c.innerHTML = `
    <div class="panel active" id="panel-overview">
      <div class="chart-card" style="margin-bottom:12px;">
        <div id="qxResearchChart"></div>
        <div class="chart-toolbar" style="display:none">
          ${['1M','3M','6M','1Y','ALL'].map(r=>`<button data-range="${r}" class="${r==='ALL'?'active':''}">${r}</button>`).join('')}
          <div class="toolsep"></div>
          ${[['line','Line'],['candles','Candlestick'],['ohlc','OHLC Bars']].map(([v,l])=>`<button data-type="${v}" class="${v==='line'?'active':''}">${l}</button>`).join('')}
          <div class="toolsep"></div>
          ${[['sma','SMA 20'],['ema','EMA 20'],['boll','Bollinger']].map(([v,l])=>`<div class="chip" data-overlay="${v}">${l}</div>`).join('')}
          <div class="toolsep"></div>
          <div class="chip" id="compareChip">+ Compare</div>
          <input id="compareInput" placeholder="MSFT, GOOGL, ^GSPC" style="display:none;width:150px;background:var(--bg-2);border:1px solid var(--line);color:var(--text-0);padding:4px 7px;border-radius:4px;font-size:11px;font-family:var(--mono);outline:none;">
        </div>
        <div id="priceChartWrap" style="display:none"><canvas id="priceChart" height="90"></canvas></div>
        <div class="notebox" id="chartDataNote" style="margin-top:8px;">—</div>
      </div>
      <div class="grid grid-3">
        <div class="card"><h3>Key Stats <span id="ovKeyStatsBadge" class="badge assume">SAMPLE</span></h3><div id="ovKeyStatsBox">${kv([['Market Cap','—'],['P/E (TTM)','—'],['EPS (TTM)','—'],['Dividend Yld','—'],['52W Range','—'],['Beta (5Y)','—']])}</div>
          <div id="ov52wGauge" style="margin-top:10px;"></div>
        </div>
        <div class="card"><h3>Data Quality</h3><div class="notebox" id="dataQualityBox"><b>Source:</b> checking…<br><b>Freshness:</b> —<br><b>Adjusted:</b> —<br><b>Provider status:</b> —</div></div>
        <div class="card"><h3>Market Regime <span id="ovRegimeBadge" class="badge assume">SAMPLE</span></h3><div style="text-align:center;padding:10px 0;"><div id="ovRegimeLabel" style="font-family:var(--mono);font-size:20px;font-weight:700;color:var(--text-2);">Loading…</div><div class="notebox" id="ovRegimeNote" style="margin-top:10px;text-align:left;">Computing from this security's own real ADX(14) + 50-day trend position…</div></div></div>
      </div>
    </div>

    <div class="panel" id="panel-analysis"><div class="notebox">Open this tab to run the automatic financial analysis.</div></div>

    <div class="panel" id="panel-fundamentals">
      <div class="notebox" id="fundLiveStatus" style="margin-bottom:10px;">Checking for live data…</div>
      <div id="fundContent"></div>
    </div>

    <div class="panel" id="panel-technicals">
      <div class="notebox" id="techStatus" style="margin-bottom:10px;">Computing indicators from the active price series…</div>
      <div class="grid grid-3">
        <div class="card"><h3>Momentum</h3><div id="techMomentum">${kv([['RSI (14)','—'],['Stoch %K','—'],['Williams %R','—'],['ROC (10)','—'],['CCI (20)','—']])}</div></div>
        <div class="card"><h3>Trend</h3><div id="techTrend">${kv([['MACD','—'],['Signal','—'],['20 DMA','—'],['50 DMA','—'],['200 DMA','—'],['ADX (14)','—']])}</div></div>
        <div class="card"><h3>Volatility</h3><div id="techVol">${kv([['ATR (14, approx)','—'],['Hist. Vol (30D, ann.)','—'],['Bollinger Upper/Lower','—']])}</div></div>
      </div>
      <div class="grid grid-2" style="margin-top:12px;">
        <div class="card"><h3>Fibonacci Retracement <span class="badge fact">computed from real swing high/low</span></h3><div id="techFib"></div></div>
        <div class="card"><h3>Moving Average Ribbon</h3><div id="techMaRibbon"></div></div>
      </div>
      <div class="card" style="margin-top:12px;"><h3>Signal Probabilities <span class="badge model">MODEL — rule-based, not ML</span></h3><div id="techSignals">${bar('Bullish',33,100,'var(--up)')}${bar('Neutral',34,100,'var(--text-2)')}${bar('Bearish',33,100,'var(--down)')}</div><div class="notebox" style="margin-top:8px;">Derived from real RSI/trend position via simple documented rules (see Docs) — not a trained model. Still illustrative of direction, not a recommendation.</div></div>
    </div>

    <div class="panel" id="panel-valuation">
      <div class="grid grid-2">
        <div class="card"><h3>Relative Valuation</h3>${table(['Multiple','Company','Sector Avg'],[['P/E','34.2','29.8'],['EV/EBITDA','24.1','20.5'],['P/S','8.9','7.2'],['P/B','48.6','12.4'],['EV/FCF','30.1','25.6']])}</div>
        <div class="card">
          <h3>DCF Calculator <span class="badge fact">REAL FORMULA</span></h3>
          <div class="notebox" style="margin-bottom:8px;">Inputs below default to sample assumptions (editable) — the calculation itself is a real, tested formula (see Tests tab), not a hardcoded result. If real SEC EDGAR cash-flow data is reachable for this ticker (see Fundamentals tab), FCF₀ and Shares Outstanding auto-populate from it.</div>
          <div class="grid grid-2" style="gap:8px;">
            <div class="formrow"><label>FCF₀ ($mn)</label><input id="dcfFcf0" value="108807"></div>
            <div class="formrow"><label>Shares Out. (mn)</label><input id="dcfShares" value="15334"></div>
            <div class="formrow"><label>5Y FCF Growth (%)</label><input id="dcfGrowth" value="8.4"></div>
            <div class="formrow"><label>WACC (%)</label><input id="dcfWacc" value="9.1"></div>
            <div class="formrow"><label>Terminal Growth (%)</label><input id="dcfTerminal" value="3.0"></div>
            <div class="formrow"><label>&nbsp;</label><button class="btn small" onclick="runDcf()">Recalculate</button></div>
          </div>
          <div id="dcfResult" class="notebox" style="margin-top:8px;"></div>
        </div>
      </div>
      <div class="card" style="margin-top:12px;"><h3>Scenario Valuation</h3><div id="dcfScenarios">${bar('Bear',178,260,'var(--down)')}${bar('Base',214,260,'var(--amber)')}${bar('Bull',256,260,'var(--up)')}</div></div>
    </div>

    <div class="panel" id="panel-quant">
      <div class="notebox" id="quantStatus" style="margin-bottom:10px;">Computing statistics from the active price series…</div>
      <div class="grid grid-2">
        <div class="card"><h3>Return Statistics <span class="badge fact">REAL, from price series</span></h3><div id="quantReturnStats"></div></div>
        <div class="card"><h3>Statistical Tests</h3><div id="quantTests"></div></div>
      </div>
      <div class="card" style="margin-top:12px;"><h3>Seasonality Analysis <span id="seasonalityBadge" class="badge assume">SAMPLE</span></h3><div id="seasonalityBox"><div class="notebox">Loading…</div></div></div>
    </div>

    <div class="panel" id="panel-factors">
      <div id="factorsContent"></div>
    </div>

    <div class="panel" id="panel-risk">
      <div class="notebox" id="riskStatus" style="margin-bottom:10px;">Computing risk metrics from the active price series…</div>
      <div class="grid grid-3">
        <div class="card"><h3>Historical VaR (1D, 95%)</h3><div id="riskVarHist" style="font-family:var(--mono);font-size:26px;font-weight:700;" class="down">—</div></div>
        <div class="card"><h3>Historical CVaR (1D, 95%)</h3><div id="riskCvarHist" style="font-family:var(--mono);font-size:26px;font-weight:700;" class="down">—</div></div>
        <div class="card"><h3>Max Drawdown</h3><div id="riskMaxDd" style="font-family:var(--mono);font-size:26px;font-weight:700;" class="down">—</div></div>
      </div>
      <div class="grid grid-3" style="margin-top:12px;">
        <div class="card"><h3>Parametric VaR (1D, 95%)</h3><div id="riskVarParam" style="font-family:var(--mono);font-size:20px;font-weight:700;" class="down">—</div></div>
        <div class="card"><h3>Sharpe Ratio</h3><div id="riskSharpe" style="font-family:var(--mono);font-size:20px;font-weight:700;">—</div></div>
        <div class="card"><h3>Sortino Ratio</h3><div id="riskSortino" style="font-family:var(--mono);font-size:20px;font-weight:700;">—</div></div>
      </div>
      <div class="card" style="margin-top:12px;">
        <h3>Monte Carlo Simulation <span class="badge fact">REAL GBM, 2000 PATHS</span> <button class="btn small secondary" onclick="runMonteCarlo()">Re-run</button></h3>
        <div class="grid grid-2">
          <div>
            <table class="datatable" id="mcPercentiles"></table>
            <div class="notebox" style="margin-top:8px;" id="mcNote">—</div>
          </div>
          <div class="chart-box-md"><canvas id="mcHistogram"></canvas></div>
        </div>
      </div>
      <div class="card" style="margin-top:12px;"><h3>Stress Scenarios <span class="badge fact">computed from real σ</span></h3><div id="stressTable"></div><div class="notebox" style="margin-top:6px;">Each shock applies a multiple of the security's own annualized historical volatility (from the price series above) — not fixed sample percentages.</div></div>
      <div class="card" style="margin-top:12px;"><h3>GARCH(1,1) Volatility Forecast <span class="badge fact" id="garchBadge">REAL — MLE via variance-targeted grid search</span></h3>
        <div id="garchBox"><div class="notebox">Computing…</div></div>
      </div>
    </div>

    <div class="panel" id="panel-options">
      <div class="notebox" id="optPanelStatus" style="margin-bottom:10px;">Black-Scholes Greeks computed live from the inputs in the Options view (left nav) — adjust S/K/T/r/σ there to see these move.</div>
      <div class="grid grid-2">
        <div class="card"><h3>Greeks (from Options view inputs) <span class="badge fact">REAL FORMULA</span></h3><div id="optPanelGreeks">${kv([['Delta','—'],['Gamma','—'],['Theta','—'],['Vega','—'],['Rho','—']])}</div></div>
        <div class="card"><h3>Payoff Diagram</h3><div class="chart-box-sm"><canvas id="optPayoffMini"></canvas></div></div>
      </div>
    </div>

    <div class="panel" id="panel-prediction">
      <div class="notebox" id="predStatus" style="margin-bottom:10px;">Computing forecast from the active price series…</div>
      <div class="grid grid-2">
        <div class="card"><h3>20-Day Forecast <span class="badge fact" id="predBadge">MODEL OUTPUT</span></h3>
          <div style="font-family:var(--mono);font-size:28px;font-weight:700;" id="predHeadline">—</div>
          <div class="notebox" style="margin-top:6px;" id="predDetail">—</div>
        </div>
        <div class="card"><h3>Model Ensemble <span class="badge fact">REAL, BACKTESTED</span></h3><div id="modelEnsembleTable">—</div></div>
      </div>
      <div class="card" style="margin-top:12px;"><h3>Prediction Drivers <span class="badge fact">computed, not scripted</span></h3>
        <div id="predDrivers">—</div>
        <div class="notebox" style="margin-top:10px;">Forecasts are probabilistic research output from real statistical models (see Tests tab for validation), not guaranteed outcomes, and are not personalized investment advice.</div>
      </div>
    </div>

    <div class="panel" id="panel-news">
      <div id="newsContent"></div>
    </div>

    <div class="panel" id="panel-report">
      <div class="card"><h3>Quick Report Preview <span class="badge assume">auto-generated from the scores above, not written by a person</span></h3>
        <div class="notebox" id="quickReportPreview">Loading…</div>
        <button class="btn secondary" style="margin-top:10px;" onclick="goto('reports')">Open Report Generator</button>
      </div>
    </div>
  `;
  renderQuickReportPreview();
}
/* Was previously a single hardcoded paragraph of canned prose, identical for every security —
   labeled "(sample)" but effectively fake regardless of the label. Now genuinely built from the
   same computeScoreChipsFor() numbers already driving the score chips elsewhere on the page, so
   it actually reflects whichever security is selected instead of being decorative text. */
function renderQuickReportPreview(){
  const el = document.getElementById('quickReportPreview');
  if(!el) return;
  const s = SECURITIES.find(x=>x.t===currentSecurity);
  const name = s ? s.n : currentSecurity;
  const chips = computeScoreChipsFor(currentSecurity);
  const get = k => { const c = chips.find(x=>x.k===k); return (c && typeof c.v === 'number') ? c.v : null; };
  const overall = get('Overall'), fundamental = get('Fundamental'), technical = get('Technical'), valuation = get('Valuation');
  const describe = (v, hiWord, loWord) => v==null ? null : (v>=60 ? hiWord : v<=40 ? loWord : 'mixed/neutral');
  const parts = [];
  if(overall!=null) parts.push(`Overall score ${overall}/100`);
  const fBit = describe(fundamental,'fundamentals look strong','fundamentals look weak');
  if(fBit) parts.push(fBit);
  const tBit = describe(technical,'technical momentum is bullish','technical momentum is bearish');
  if(tBit) parts.push(tBit);
  const vBit = describe(valuation,'valuation looks reasonable','valuation looks stretched');
  if(vBit) parts.push(vBit);
  el.textContent = parts.length
    ? `${name}: ${parts.join(', ')}. Based on the scores computed above for this security — not a written analyst view.`
    : `${name}: not enough live data loaded yet to generate score-based scoring — open Research and select this security first, or check Fundamentals/Technicals for what's available.`;
}

let priceChart, backtestChart, payoffChart, optPayoffMini;
let priceFetchToken = 0; // guards against stale async responses overwriting a newer selection

function sampleSeriesFor(ticker){
  // Deterministic per-ticker sample path rescaled so its last close equals the price shown in the
  // header — previously every fallback chart started near 195 regardless of security, and the four
  // former Stooq tickers all shared seed 42 (identical charts for AAPL/MSFT/NVDA/AMZN).
  const seed = ticker.split('').reduce((a,c)=>a+c.charCodeAt(0)*7,13);
  const base = sampleSeries(seed);
  const sec = SECURITIES.find(x=>x.t===ticker);
  const target = sec && sec.px ? sec.px : base.data[base.data.length-1];
  const k = target / base.data[base.data.length-1];
  const r = v => Math.round(v*k*10000)/10000;
  return {labels: base.labels, data: base.data.map(r), ohlc:{open:base.ohlc.open.map(r), high:base.ohlc.high.map(r), low:base.ohlc.low.map(r), close:base.data.map(r)}};
}
function sampleSeries(seed){
  const rnd = seededRnd(seed); let px=195, data=[], labels=[], opens=[], highs=[], lows=[];
  for(let i=0;i<180;i++){
    const open = px;
    px += (rnd()-0.47)*3.4;
    const close = Math.round(px*100)/100;
    const spread = Math.abs(close-open)*0.6 + close*0.003; // plausible synthetic wick, clearly disclosed as sample
    data.push(close); labels.push(i);
    opens.push(Math.round(open*100)/100);
    highs.push(Math.round((Math.max(open,close)+spread)*100)/100);
    lows.push(Math.round((Math.min(open,close)-spread)*100)/100);
  }
  return {labels, data, ohlc:{open:opens, high:highs, low:lows, close:data}};
}
