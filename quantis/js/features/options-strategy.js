/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/features/options-strategy.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Options view and multi-leg strategy builder.
 * DEPENDS   engines/portfolio-risk-options.js
 * EXPOSES   runBlackScholes, runStrategyBuilder (global — classic script, shared scope)
 * LOAD      Classic <script>, order defined in js/manifest.json. Top-level code runs at load,
 *           so it may only call functions from files listed EARLIER in the manifest.
 * NOTE      Migrated verbatim from the single-file build; inline comments marked
 *           "REAL BUG FIXED" / "post-launch fix" document past defects — keep them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* ===================== OPTIONS STRATEGY BUILDER =====================
   Real multi-leg construction on top of the SAME Formulas.blackScholes engine already used for
   the single-leg Greeks/chain/payoff above — every leg's premium and the combined payoff curve
   is computed, not templated. Covers the standard retail-relevant set: directional single-leg,
   income (covered call/protective put), vertical spreads, and volatility strategies (straddle/
   strangle/iron condor). Breakeven(s) are found by scanning the computed payoff array for real
   sign changes and interpolating, not by a closed-form shortcut that would only work for the
   simplest strategies. */
const STRATEGY_DEFS = {
  long_call:        {k1Label:'Strike (K)', k2:false, width:false, legs:(S,K1,K2,W)=>[{qty:1, type:'call', K:K1, stock:0}]},
  long_put:         {k1Label:'Strike (K)', k2:false, width:false, legs:(S,K1,K2,W)=>[{qty:1, type:'put',  K:K1, stock:0}]},
  covered_call:     {k1Label:'Call Strike (short)', k2:false, width:false, legs:(S,K1,K2,W)=>[{qty:-1, type:'call', K:K1, stock:0},{qty:0, type:null, K:null, stock:1}]},
  protective_put:   {k1Label:'Put Strike (long)', k2:false, width:false, legs:(S,K1,K2,W)=>[{qty:1, type:'put', K:K1, stock:0},{qty:0, type:null, K:null, stock:1}]},
  bull_call_spread: {k1Label:'Long Call Strike (lower)', k2Label:'Short Call Strike (higher)', k2:true, width:false, legs:(S,K1,K2,W)=>[{qty:1, type:'call', K:Math.min(K1,K2), stock:0},{qty:-1, type:'call', K:Math.max(K1,K2), stock:0}]},
  bear_put_spread:  {k1Label:'Long Put Strike (higher)', k2Label:'Short Put Strike (lower)', k2:true, width:false, legs:(S,K1,K2,W)=>[{qty:1, type:'put', K:Math.max(K1,K2), stock:0},{qty:-1, type:'put', K:Math.min(K1,K2), stock:0}]},
  long_straddle:    {k1Label:'Strike (K, same for call & put)', k2:false, width:false, legs:(S,K1,K2,W)=>[{qty:1, type:'call', K:K1, stock:0},{qty:1, type:'put', K:K1, stock:0}]},
  long_strangle:    {k1Label:'Put Strike (lower)', k2Label:'Call Strike (higher)', k2:true, width:false, legs:(S,K1,K2,W)=>[{qty:1, type:'put', K:Math.min(K1,K2), stock:0},{qty:1, type:'call', K:Math.max(K1,K2), stock:0}]},
  iron_condor:      {k1Label:'Short Put Strike', k2Label:'Short Call Strike', k2:true, width:true, legs:(S,K1,K2,W)=>{
    const shortPut = Math.min(K1,K2), shortCall = Math.max(K1,K2);
    return [
      {qty:1, type:'put', K:shortPut-Math.abs(W), stock:0}, {qty:-1, type:'put', K:shortPut, stock:0},
      {qty:-1, type:'call', K:shortCall, stock:0}, {qty:1, type:'call', K:shortCall+Math.abs(W), stock:0},
    ];
  }},
};
function updateStrategyInputsVisibility(){
  const strat = STRATEGY_DEFS[document.getElementById('stratSelect').value];
  if(!strat) return;
  document.getElementById('stratK1Label').textContent = strat.k1Label;
  document.getElementById('stratK2Row').style.display = strat.k2 ? '' : 'none';
  if(strat.k2Label) document.getElementById('stratK2Label').textContent = strat.k2Label;
  document.getElementById('stratWidthRow').style.display = strat.width ? '' : 'none';
}
let strategyPayoffChart;
function runStrategyBuilder(){
  updateStrategyInputsVisibility();
  const S = parseFloat(document.getElementById('bsSpot').value);
  const days = parseFloat(document.getElementById('bsDays').value);
  const r = parseFloat(document.getElementById('bsRate').value)/100;
  const sigma = parseFloat(document.getElementById('bsVol').value)/100;
  const K1 = parseFloat(document.getElementById('stratK1').value);
  const K2 = parseFloat(document.getElementById('stratK2').value);
  const W = parseFloat(document.getElementById('stratWidth').value) || 0;
  const T = days/365;
  const summaryBox = document.getElementById('stratSummaryBox');
  const legsBox = document.getElementById('stratLegsBox');
  if([S,days,r,sigma,K1].some(v=>isNaN(v)) || S<=0 || days<=0 || sigma<=0){
    if(summaryBox) summaryBox.innerHTML = `<div class="notebox" style="color:var(--down)">Enter valid Spot/Days/Vol above and a valid Strike 1.</div>`;
    return;
  }
  const stratKey = document.getElementById('stratSelect').value;
  const def = STRATEGY_DEFS[stratKey];
  const legs = def.legs(S,K1,K2,W).map(leg=>{
    if(leg.stock) return {...leg, premium: S, delta: 1, label: `${leg.qty>=0?'Long':'Short'} ${Math.abs(leg.qty)||1} share`};
    const bs = Formulas.blackScholes(S, leg.K, T, r, sigma, leg.type==='call');
    return {...leg, premium: bs.price, delta: bs.delta, label: `${leg.qty>=1?'Long':'Short'} ${leg.type} @ ${leg.K}`};
  });
  // Net premium: positive qty = bought (cash out), negative qty = sold (cash in). Stock legs use
  // qty=0 as a marker (quantity handled by the `stock` flag itself, always exactly 1 share) and
  // don't count as an "option premium" cost — the covered-call/protective-put cost basis is the
  // share price itself, not a debit/credit like an option leg.
  const netPremium = legs.filter(l=>!l.stock).reduce((sum,l)=>sum + l.qty*l.premium, 0);
  // Combined payoff at expiry across a realistic underlying range.
  const lo = Math.round(S*0.6), hi = Math.round(S*1.4), step = Math.max(1, Math.round(S*0.01));
  const xs = [], ys = [];
  for(let sT = lo; sT <= hi; sT += step){
    let payoff = -netPremium;
    legs.forEach(l=>{
      if(l.stock){ payoff += (sT - S); return; } // long 1 share, marked-to-market vs entry spot
      const intrinsic = l.type==='call' ? Math.max(sT-l.K,0) : Math.max(l.K-sT,0);
      payoff += l.qty * intrinsic;
    });
    xs.push(sT); ys.push(payoff);
  }
  // Breakevens: real zero-crossings of the computed payoff curve, linearly interpolated —
  // works identically for every strategy shape (single crossing, two, or none), unlike a
  // closed-form shortcut that would only cover the simplest single-leg cases.
  const breakevens = [];
  for(let i=1;i<ys.length;i++){
    if((ys[i-1]<0 && ys[i]>=0) || (ys[i-1]>0 && ys[i]<=0)){
      const frac = ys[i-1]===ys[i] ? 0 : ys[i-1]/(ys[i-1]-ys[i]);
      breakevens.push(xs[i-1] + frac*(xs[i]-xs[i-1]));
    }
  }
  const maxProfit = Math.max(...ys), maxLoss = Math.min(...ys);
  const unbounded = (maxProfit >= (hi-S)*0.9); // payoff still rising steeply at the top of the scanned range = unbounded upside (e.g. long call)
  const unboundedDown = (maxLoss <= -(S-lo)*0.9 && legs.some(l=>l.type==='put' && l.qty<0));
  summaryBox.innerHTML = kv([
    ['Net Premium', netPremium>=0 ? `${optSym()}${netPremium.toFixed(2)} paid (debit)` : `${optSym()}${Math.abs(netPremium).toFixed(2)} received (credit)`],
    ['Max Profit', unbounded ? `Unlimited (above ${optSym()}${hi})` : `${optSym()}${maxProfit.toFixed(2)}`],
    ['Max Loss', unboundedDown ? `Substantial (underlying → $0)` : `${optSym()}${Math.abs(maxLoss).toFixed(2)}`],
    ['Breakeven(s)', breakevens.length ? breakevens.map(b=>optSym()+b.toFixed(2)).join(', ') : 'None in scanned range'],
  ]);
  legsBox.innerHTML = table(['Leg','Strike','Premium','Delta'], legs.map(l=>[
    l.label, l.stock ? '—' : l.K.toFixed(2), l.stock? `${optSym()}${l.premium.toFixed(2)} (spot)` : `${optSym()}${l.premium.toFixed(2)}`, l.delta.toFixed(3),
  ])) + `<div class="notebox" style="margin-top:8px;">Every leg priced by the same Black-Scholes engine as the Greeks/chain above (S=${S}, ${days}D, r=${(r*100).toFixed(1)}%, σ=${(sigma*100).toFixed(1)}%). Payoff is at expiry only — ignores time decay along the way and assumes European exercise (no early-exercise effects, which the American-vs-European card above shows can matter for puts).</div>`;
  const ctx = document.getElementById('strategyPayoffChart');
  if(ctx){
    if(strategyPayoffChart && strategyPayoffChart.destroy) strategyPayoffChart.destroy();
    strategyPayoffChart = safeNewChart('strategyPayoffChart', {type:'line',
      data:{labels:xs, datasets:[
        {data:ys, borderColor:cssVar('--amber'), borderWidth:1.8, pointRadius:0, fill:false},
        {data:xs.map(()=>0), borderColor:cssVar('--text-2'), borderWidth:1, borderDash:[3,3], pointRadius:0, fill:false},
      ]},
      options:{responsive:true, plugins:{legend:{display:false}}, scales:{x:{ticks:{color:cssVar('--text-2'), maxTicksLimit:8}}, y:{grid:{color:cssVar('--line-soft')}, ticks:{color:cssVar('--text-2')}}}}});
  }
}
function renderOptions(){ runBlackScholes(); updateStrategyInputsVisibility(); runStrategyBuilder(); }
let optFollowsSelection = true;
document.addEventListener('input', e=>{
  if(['bsSpot','bsStrike','bsDays','bsRate','bsVol'].includes(e.target && e.target.id) && optFollowsSelection){
    optFollowsSelection = false;
    const label = document.getElementById('optUnderlyingLabel');
    if(label) label.textContent = 'Manual entry';
  }
});   // Options inputs track the Research security until the user types their own
let optUnderlyingCcy = 'USD';
function optSym(){ return (CURRENCY_META[optUnderlyingCcy] || CURRENCY_META.USD).symbol; }
function syncOptionsToSelection(){
  if(!optFollowsSelection) return;
  try{ openOptionsChainFor(currentSecurity, {navigate:false, silent:true}); }catch(e){ console.error(e); }
}
function niceStrikeStep(px){
  const raw = Math.max(1e-6, px*0.02), p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw/p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2.5 : m < 7.5 ? 5 : 10) * p;
}
function openOptionsChainFor(ticker, opts){
  opts = opts || {};
  const s = SECURITIES.find(x=>x.t===ticker) || (()=>{
    const meta = SECURITY_UNIVERSE.find(x=>x.t===ticker);
    if(meta && !SECURITIES.some(x=>x.t===ticker)) SECURITIES.push(makeSampleSecurityEntry(meta));
    return SECURITIES.find(x=>x.t===ticker);
  })();
  if(opts.navigate !== false) goto('options');
  const label = document.getElementById('optUnderlyingLabel');
  optFollowsSelection = (ticker === currentSecurity);
  if(s){
    optUnderlyingCcy = s.ccy || 'USD';
    document.getElementById('bsSpot').value = s.px.toFixed(2);
    const stepK = niceStrikeStep(s.px);
    document.getElementById('bsStrike').value = Math.round(s.px/stepK)*stepK; // nearest round strike, near-the-money
    if(ticker === currentSecurity && currentPriceSeries && currentPriceSeries.length > 31){
      const hv = Formulas.historicalVolAnnualized(currentPriceSeries, 30);
      if(hv) document.getElementById('bsVol').value = hv.toFixed(1); // realized vol as the IV starting point
    }
    const k1 = document.getElementById('stratK1'), k2 = document.getElementById('stratK2');
    const kDec = Math.max(0, -Math.floor(Math.log10(stepK)) + 1);
    document.getElementById('bsStrike').value = +(Math.round(s.px/stepK)*stepK).toFixed(kDec);
    if(k1 && k2){ k1.value = +(Math.round(s.px*0.97/stepK)*stepK).toFixed(kDec); k2.value = +(Math.round(s.px*1.03/stepK)*stepK).toFixed(kDec); }
    if(label) label.textContent = `${s.t} (${fmtPrice(s.px, s.ccy)})${optFollowsSelection ? ' · follows Research selection' : ''}`;
    if(!opts.silent) toast(`Options inputs loaded from ${s.t}.`, 'ok');
  }else if(label){
    label.textContent = ticker;
  }
  runBlackScholes(); runStrategyBuilder();
}

function selectSecurity(t){
  let s = SECURITIES.find(x=>x.t===t);
  if(!s){
    // Not yet in the "live-capable" list — look it up in the larger identity universe and
    // create a fully consistent sample entry, rather than ever silently showing a different
    // company's data under the ticker you actually searched for.
    const meta = SECURITY_UNIVERSE.find(x=>x.t===t);
    if(!meta){
      toast(`"${t}" isn't in this build's demo security universe (${SECURITY_UNIVERSE.length} tickers) yet. Try the command palette (Ctrl+K) to see what's searchable.`);
      return;
    }
    // Reachable now only for FX/commodities/crypto (deliberately excluded from the equity-only
    // enrichment above, since P/E, ROE, RSI, market cap don't apply to gold or a currency pair).
    s = makeSampleSecurityEntry(meta);
    SECURITIES.push(s);
  }
  currentSecurity = t;
  dcfInputsEditedFor = null; // a fresh selection always starts from that security's own defaults
  updateTabTitle();
  document.getElementById('secName').textContent = s.n;
  document.getElementById('secMeta').textContent = `${s.t} · ${s.ex} · ${s.ctry} · ${s.sector} · ${s.ccy}`;
  const logoWrap = document.getElementById('secLogoWrap');
  if(logoWrap) logoWrap.innerHTML = logoHtmlFor(s.t, 40);
  document.getElementById('secPx').textContent = fmtPrice(s.px, s.ccy);
  const chgEl = document.getElementById('secChg');
  chgEl.textContent = `${s.chg>=0?'+':'−'}${fmtPrice(Math.abs(s.chg), s.ccy)} (${s.chg>=0?'+':''}${s.chgPct.toFixed(2)}%)`;
  chgEl.className = 'chg '+(s.chg>=0?'up':'down');
  document.getElementById('secLiveStatus').innerHTML = 'Loading live price…';
  renderWatchlist();
  renderPanels(); renderTabs(); refreshFundamentals(t); populateDcfDefaults(t); runDcf(); renderValuationTable(t);
  renderScoreChips(); // fundamentals-based parts update immediately; technical/momentum/risk fill in once drawPriceChart loads the real series below
  goto('research');
}

/* Called after a successful live Stooq or Yahoo Finance fetch: updates the SECURITIES record,
   the header, and the watchlist row for that ticker with the real last close vs. previous close.
   liveCcy (when the provider reports one, e.g. Yahoo's meta.currency) overrides the country-
   guessed currency, so the displayed symbol always matches what the security actually trades
   in — e.g. an NSE stock shows ₹ because Yahoo said INR, not because we assumed India->INR. */
function updateLiveQuote(ticker, lastClose, prevClose, liveCcy, sourceLabel){
  const s = SECURITIES.find(x=>x.t===ticker);
  if(!s || typeof lastClose !== 'number' || isNaN(lastClose)) return;
  s.px = lastClose;
  if(liveCcy) s.ccy = liveCcy;
  if(typeof prevClose === 'number' && !isNaN(prevClose) && prevClose !== 0){
    s.chg = lastClose - prevClose;
    s.chgPct = (s.chg/prevClose)*100;
  }
  if(currentSecurity === ticker){
    document.getElementById('secMeta').textContent = `${s.t} · ${s.ex} · ${s.ctry} · ${s.sector} · ${s.ccy}`;
    document.getElementById('secPx').textContent = fmtPrice(s.px, s.ccy);
    const chgEl = document.getElementById('secChg');
    chgEl.textContent = `${s.chg>=0?'+':'−'}${fmtPrice(Math.abs(s.chg), s.ccy)} (${s.chg>=0?'+':''}${s.chgPct.toFixed(2)}%)`;
    chgEl.className = 'chg '+(s.chg>=0?'up':'down');
    updateTabTitle();
    document.getElementById('secLiveStatus').innerHTML = `<span class="badge fact">LIVE</span> ${sourceLabel || 'live'}`;
  }
  renderWatchlist();
  refreshDashWatch(); // was renderDashboard(): every single live quote re-fired all dashboard network fetches (indices, regime, movers, AI summary)
  if(currentSecurity === ticker){
    try{ runDcf(); renderValuationTable(ticker); renderScoreChips(); }catch(e){ console.error(e); }
  }
}

/* Attempts real SEC EDGAR fundamentals for any US-listed ticker resolvable via the built-in
   verified map or SEC's own official company_tickers.json lookup; every other case (and every
   failure) is disclosed plainly rather than silently showing sample numbers as if live. */
let fundFetchToken = 0;
function fmtUsdMn(v){ return v==null ? '—' : (v/1e6).toLocaleString(undefined,{maximumFractionDigits:0}); }
/* Real DCF calculation (spec section 12) — reads whatever is in the input fields (defaults are
   sample assumptions unless overwritten by live SEC cash-flow data below) and recomputes with
   Formulas.dcf, including Bear/Base/Bull scenarios via +/-20% growth sensitivity. Never a
   hardcoded output: change any input and click Recalculate to see it actually move. */
/* Root cause of a real bug: renderPanels() rebuilds the Valuation tab's raw HTML on every
   security switch, and that HTML had Apple's actual FCF/shares numbers hardcoded as literal
   value="..." attributes. runDcf() itself was always doing real math — but it was computing
   "fair value" for whichever ticker you'd just selected using APPLE's cash-flow assumptions
   every single time, silently, since the input fields never updated. Selecting Tesla still
   quietly valued it with Apple's numbers. Fixed by repopulating these fields with THIS
   security's own seeded (or live, where available) figures on every switch, before running
   the calculation — same disclosed-sample pattern as the rest of the Fundamentals tab. */
/* Consistent valuation basis for sample mode. The seeded generator's revenue/EPS are random and
   unrelated to the real company size, so backing a share count out of them gave Apple 80 mn shares
   and a DCF "fair value" of $3,546 (+1,481%), and P/S 0.3 / P/B 0.1 in the multiples table. Size now
   comes from the security's market cap and P/E (live when fetched, curated otherwise); the seeded
   data only supplies ratios (cash conversion, margins, ROE, growth), which keeps every figure on the
   Valuation tab internally consistent. */
function valuationBasisFor(t){
  const s = SECURITIES.find(x=>x.t===t); if(!s) return null;
  const live = (typeof LIVE_FUNDAMENTALS !== 'undefined') ? LIVE_FUNDAMENTALS[t] : null;
  if(!live) return null;
  const fx = live.fxReportToTrade ?? 1;
  const shares = live.sharesOutCnbc || live.sharesOut || (live.marketCap && s.px ? live.marketCap/s.px : null);
  const fcfHist = live.statements && live.statements.fcf ? live.statements.fcf.find(v=>v!=null) : null;
  let fcf = live.fcfTtm>0 ? live.fcfTtm : (live.fcfFy>0 ? live.fcfFy : (fcfHist>0 ? fcfHist : null));
  const basis = {live:true, pe: live.pe>0 ? live.pe : null, sharesMn: shares ? shares/1e6 : null, fcf0Mn: (fcf && live.fxReportToTrade!=null) ? fcf*fx/1e6 : null,
    fcfNegative: !fcf && (live.fcfTtm!=null || live.fcfFy!=null || fcfHist!=null)};
  let g = live.revenueGrowth!=null ? live.revenueGrowth*100 : null;
  const rev = live.statements && live.statements.revenue;
  if(rev && rev.length >= 4 && rev[0] > 0 && rev[3] > 0) g = (Math.pow(rev[0]/rev[3], 1/3) - 1)*100; // 3-year revenue CAGR is steadier than one year
  basis.growthPct = g!=null ? Math.min(25, Math.max(1, g)) : null;
  return basis;
}
let dcfInputsEditedFor = null;
document.addEventListener('input', e=>{ if(e.target && /^dcf/.test(e.target.id)) dcfInputsEditedFor = currentSecurity; });
function populateDcfDefaults(t){
  const s = SECURITIES.find(x=>x.t===t);
  if(!s || s.cls !== 'Equity') return;
  if(dcfInputsEditedFor === t) return; // never overwrite numbers the user typed for this security
  const basis = valuationBasisFor(t);
  const fcfEl = document.getElementById('dcfFcf0'), shEl = document.getElementById('dcfShares'), grEl = document.getElementById('dcfGrowth');
  const noteEl = fcfEl ? fcfEl.closest('.card')?.querySelector('.notebox') : null;
  if(!basis){
    // No live data yet (or unreachable): leave the inputs empty rather than inventing them.
    if(fcfEl) fcfEl.value = ''; if(shEl) shEl.value = ''; if(grEl) grEl.value = '';
    if(noteEl) noteEl.innerHTML = LIVE_FUNDAMENTALS_ERR[t] ? `Live fundamentals for ${escapeHtml(t)} are unreachable right now — enter your own FCF, share count and growth to run the model.` : `Loading ${escapeHtml(t)}'s live free cash flow, share count and revenue growth…`;
    return;
  }
  if(fcfEl) fcfEl.value = basis.fcf0Mn ? Math.round(basis.fcf0Mn) : '';
  if(shEl) shEl.value = basis.sharesMn ? Math.round(basis.sharesMn) : '';
  if(grEl) grEl.value = basis.growthPct!=null ? basis.growthPct.toFixed(1) : '';
  const sec = SECURITIES.find(x=>x.t===t);
  if(noteEl) noteEl.innerHTML = `Inputs pre-filled from ${escapeHtml(t)}'s <span class="badge fact">LIVE</span> reported numbers: trailing free cash flow, shares outstanding, and ${basis.growthPct!=null?'revenue growth (3-year CAGR where available)':'—'}, in ${escapeHtml(sec?sec.ccy:'local currency')} millions. ${basis.fcfNegative?'<b>Free cash flow is negative</b>, so a DCF isn\'t meaningful until you enter a normalised figure. ':''}WACC and terminal growth are your assumptions — edit any input and click Recalculate.`;
  // WACC and terminal growth are left as reasonable universal defaults (9.1% / 3.0%) rather than
  // faked per-ticker — a real WACC needs a beta and capital structure this sample data doesn't
  // model; changing that number per ticker without a real basis would be worse than a disclosed
  // constant. The notebox above already explains inputs are editable.
}
/* Root cause of the "Relative Valuation" report: this table was a single hardcoded array of
   P/E, EV/EBITDA, P/S, P/B, EV/FCF figures — identical text for every ticker, no badge
   disclosing it, never wired to anything. Now computed per-security from the same seeded
   fundamentals used elsewhere (or live P/E when available), consistent with the rest of the
   tab's disclosed-sample approach instead of being silently static. */
const LIVE_FUNDAMENTALS = {}; // ticker -> last successful Yahoo quoteSummary parse (shared by Fundamentals + Valuation)
let valuationPeersToken = 0;
function renderValuationTable(t){
  const el = document.querySelector('#panel-valuation .card:first-child');
  if(!el) return;
  const s = SECURITIES.find(x=>x.t===t);
  if(!s || s.cls !== 'Equity'){
    el.innerHTML = `<h3>Relative Valuation</h3><div class="notebox">Standard equity multiples (P/E, EV/EBITDA, P/S, P/B) don't apply the same way to a ${s?s.cls.toLowerCase():'non-equity'} security. See the Fundamentals tab for what's relevant here instead.</div>`;
    return;
  }
  const live = LIVE_FUNDAMENTALS[t];
  if(!live){
    el.innerHTML = `<h3>Relative Valuation <span class="badge">${LIVE_FUNDAMENTALS_ERR[t]?'UNAVAILABLE':'LOADING'}</span></h3><div class="notebox">${LIVE_FUNDAMENTALS_ERR[t] ? 'Live multiples are unreachable right now — nothing is estimated in their place.' : 'Loading live multiples and sector peers…'}</div>`;
    return;
  }
  const ps = live.priceToSales!=null ? live.priceToSales : ((live.marketCapTv && live.revenue) ? live.marketCapTv/live.revenue : null);
  const f1 = v => v!=null && isFinite(v) ? (+v).toFixed(1)+'x' : '—';
  const metrics = [['P/E (TTM)', live.pe, 'pe'], ['P/E (forward)', live.forwardPe, 'fpe'], ['PEG', live.pegRatio, 'peg'], ['P/S', ps, 'ps'], ['P/B', live.priceToBook, 'pb'], ['EV/EBITDA', live.evEbitda, 'evEbitda']];
  const draw = (peers, peerNote) => {
    el.innerHTML = `<h3>Relative Valuation <span class="badge fact">LIVE</span></h3>` + table(['Multiple', s.t, peers ? `${escapeHtml(live.sector||'Sector')} median` : 'Sector median', 'vs. sector'],
      metrics.map(([lbl, v, key])=>{
        const m = peers && key ? peers[key] : null;
        const prem = (m && v!=null && v>0) ? (v/m-1)*100 : null;
        return [lbl, f1(v), m!=null ? f1(m) : (peers ? '—' : '…'), prem!=null ? `<span class="${prem<=0?'up':'down'}">${prem>=0?'+':''}${prem.toFixed(0)}%</span>` : '—'];
      })) + `<div class="notebox" style="margin-top:6px;">${peerNote}</div>`;
  };
  draw(null, `Company multiples live via ${escapeHtml(live.via)}. Loading sector peers…`);
  const myToken = ++valuationPeersToken;
  if(!live.sector){ draw(null, `Company multiples live via ${escapeHtml(live.via)}. No sector classification is published for this listing, so no peer median.`); return; }
  LD.sectorPeers(live.sector, live.country || s.ctry).then(p=>{
    if(myToken !== valuationPeersToken || currentSecurity !== t) return;
    const names = (p.peers||[]).filter(x=>!String(x.sym).endsWith(':'+(String(live.tvSymbol||'').split(':')[1]||'~'))).slice(0,6).map(x=>escapeHtml(x.name)).join(', ');
    draw(p, `Company multiples live via ${escapeHtml(live.via)}. Sector medians computed live from the ${p.n} largest ${escapeHtml(live.sector)} companies in ${escapeHtml(live.country || s.ctry)} on TradingView (e.g. ${names}). Green = cheaper than peers.`);
  }).catch(e=>{
    if(myToken !== valuationPeersToken) return;
    draw({}, `Company multiples live via ${escapeHtml(live.via)}. Sector peers unavailable: ${escapeHtml(e.message)}.`);
  });
}
function runDcf(){
  const resultEl = document.getElementById('dcfResult');
  const scenEl = document.getElementById('dcfScenarios');
  if(!resultEl) return;
  const curSec = SECURITIES.find(x=>x.t===currentSecurity);
  if(curSec && curSec.cls !== 'Equity'){
    resultEl.innerHTML = `<div class="notebox">A discounted-cash-flow model values a company's future cash flows — it doesn't apply to a ${curSec.cls.toLowerCase()} the way it does a stock (an ETF/fund is priced off its holdings' NAV, a currency pair or future has no "cash flow" of its own to discount). DCF is shown only for equities. Switch to an equity to use this tool, or check the Fundamentals tab for what's relevant to a ${curSec.cls}.</div>`;
    if(scenEl) scenEl.innerHTML = '';
    AppState.dcf = null;
    return;
  }
  const fcf0 = parseFloat(document.getElementById('dcfFcf0').value);
  const shares = parseFloat(document.getElementById('dcfShares').value);
  const growth = parseFloat(document.getElementById('dcfGrowth').value);
  const wacc = parseFloat(document.getElementById('dcfWacc').value);
  const terminal = parseFloat(document.getElementById('dcfTerminal').value);
  if([fcf0,shares,growth,wacc,terminal].some(v=>isNaN(v)) || shares<=0){
    resultEl.innerHTML = '<span style="color:var(--down)">Enter valid numbers in every field (Shares Outstanding must be > 0).</span>';
    return;
  }
  const base = Formulas.dcf({fcf0, growthPct:growth, waccPct:wacc, terminalGrowthPct:terminal, years:5, sharesOutMn:shares});
  const bear = Formulas.dcf({fcf0, growthPct:growth*0.5, waccPct:wacc+1, terminalGrowthPct:Math.max(0,terminal-1), years:5, sharesOutMn:shares});
  const bull = Formulas.dcf({fcf0, growthPct:growth*1.5, waccPct:Math.max(terminal+0.5,wacc-1), terminalGrowthPct:terminal+0.5, years:5, sharesOutMn:shares});
  if(!base){
    resultEl.innerHTML = '<span style="color:var(--down)">WACC must be greater than terminal growth rate — the model diverges otherwise. No number is shown rather than a fabricated one.</span>';
    return;
  }
  const s = SECURITIES.find(x=>x.t===currentSecurity);
  const curPx = s ? s.px : null;
  const ccy = s ? s.ccy : 'USD';
  const upside = curPx ? ((base.fairValuePerShare-curPx)/curPx*100) : null;
  resultEl.innerHTML = `<b>Fair value (base case):</b> ${fmtPrice(base.fairValuePerShare, ccy)} ${upside!=null?`<span class="${upside>=0?'up':'down'}">${upside>=0?'↑':'↓'}${Math.abs(upside).toFixed(1)}% vs current ${fmtPrice(curPx, ccy)}</span>`:''}<br>
    <b>Enterprise Value:</b> ${fmtPrice(base.enterpriseValue/1000, ccy)}bn (${shares}mn shares)<br><br>
    Computed live with <span class="badge fact">REAL FORMULA</span> — explicit 5-year FCF growth stage + Gordon-growth terminal value, both discounted at WACC. Change any input above and recalculate.`;
  if(scenEl && bear && bull){
    const maxV = Math.max(bear.fairValuePerShare, base.fairValuePerShare, bull.fairValuePerShare) * 1.15;
    scenEl.innerHTML = bar('Bear', Math.round(bear.fairValuePerShare), Math.round(maxV), 'var(--down)')
      + bar('Base', Math.round(base.fairValuePerShare), Math.round(maxV), 'var(--amber)')
      + bar('Bull', Math.round(bull.fairValuePerShare), Math.round(maxV), 'var(--up)');
  }
  AppState.dcf = {ticker: currentSecurity, ccy, fairValueBase: base.fairValuePerShare, fairValueBear: bear&&bear.fairValuePerShare, fairValueBull: bull&&bull.fairValuePerShare,
    enterpriseValueBn: base.enterpriseValue/1000, currentPrice: curPx, upsidePct: upside, inputs:{fcf0,shares,growth,wacc,terminal}};
}
