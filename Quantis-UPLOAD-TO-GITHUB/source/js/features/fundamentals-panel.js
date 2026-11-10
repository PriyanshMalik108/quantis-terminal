/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/features/fundamentals-panel.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Fundamentals tab rendering.
 * DEPENDS   data/fundamentals-live.js
 * EXPOSES   — (global — classic script, shared scope)
 * LOAD      Classic <script>, order defined in js/manifest.json. Top-level code runs at load,
 *           so it may only call functions from files listed EARLIER in the manifest.
 * NOTE      Migrated verbatim from the single-file build; inline comments marked
 *           "REAL BUG FIXED" / "post-launch fix" document past defects — keep them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* ===================== FUNDAMENTALS PANEL (post-launch fix) =====================
   Root-caused the "hardcoded, not switching" report precisely: renderPanels() rebuilt this
   tab's HTML on every ticker switch, but it rebuilt the exact same literal numbers every
   time (AAPL's real FY23/FY24 10-K figures, baked into the template as plain strings) —
   so every single ticker showed identical Income Statement/Balance Sheet/Ratios regardless
   of what was actually selected, and only the 4 SEC-mapped US tickers ever overwrote it with
   something real. Two real fixes: (1) this now generates a deterministic per-ticker sample
   (same seeding approach used for prices elsewhere) instead of one frozen number set; (2) the
   panel's *content itself* now branches by asset class — a P/E-and-EBITDA income statement
   makes no sense for an ETF, a crypto coin, an FX pair, or a futures contract, so each class
   gets a genuinely relevant panel instead of a stock statement with the ticker swapped in. */
function seededFundamentalsFor(ticker, px){
  const seed = ticker.split('').reduce((a,c)=>a+c.charCodeAt(0),0);
  const rnd = seededRnd(seed);
  const revenue = Math.round((5000 + rnd()*180000));
  const growth = 0.02 + rnd()*0.18;
  const revenuePrior = Math.round(revenue/(1+growth));
  const netMargin = 0.05 + rnd()*0.28;
  const grossMargin = netMargin + 0.10 + rnd()*0.30;
  const ni = Math.round(revenue*netMargin);
  const niPrior = Math.round(revenuePrior*netMargin*(0.85+rnd()*0.3));
  const eps = Math.round((ni/(revenue/px/10+1))*100)/100 || Math.round((px*(0.03+rnd()*0.05))*100)/100;
  return {revenue, revenuePrior, ni, niPrior, grossMargin, netMargin, eps,
    roe: 5+rnd()*35, roic: 3+rnd()*25, debtEquity: 20+rnd()*180, currentRatio: 0.8+rnd()*2.2,
    cash: Math.round(revenue*(0.05+rnd()*0.25)), debt: Math.round(revenue*(0.1+rnd()*0.6)),
    cfo: Math.round(ni*(1.1+rnd()*0.5)), capex: Math.round(revenue*(0.02+rnd()*0.08))};
}
function fundamentalsPanelHtml(s){
  if(s.cls === 'Equity'){
    return `<div class="card" style="margin-bottom:12px;"><h3>Company Profile <span id="fundWikiBadge" class="badge">LOADING</span></h3><div id="fundWikiBox"><div class="notebox">Loading…</div></div></div>
      <div class="card" style="margin-bottom:12px;"><h3>Analyst Recommendation Trend <span id="fundRecBadge" class="badge">LOADING</span></h3><div id="finnhubRecBox"><div class="notebox">Loading…</div></div></div>
      <div class="grid grid-2">
        <div class="card"><h3>Key Stats &amp; Valuation <span id="fundKeyStatsBadge" class="badge">LOADING</span></h3><div id="fundKeyStatsBox"></div></div>
        <div class="card"><h3>Ratios <span id="fundRatiosBadge" class="badge">LOADING</span></h3><div id="fundRatiosBox"></div></div>
      </div>
      <div class="grid grid-2" style="margin-top:12px;">
        <div class="card"><h3>Income Statement <span id="fundIncomeBadge" class="badge">LOADING</span></h3><div id="fundIncomeTable"></div></div>
        <div class="card"><h3>Balance Sheet <span class="badge">LOADING</span></h3><div id="fundBalanceTable"></div></div>
      </div>
      <div class="grid grid-2" style="margin-top:12px;">
        <div class="card"><h3>Cash Flow <span class="badge">LOADING</span></h3><div id="fundCashflowBox"></div></div>
        <div class="card"><h3>Earnings Calendar <span id="fundEarningsBadge" class="badge">LOADING</span></h3><div id="fundEarningsBox"><div class="notebox">Loading…</div></div></div>
      </div>
      <div class="grid grid-2" style="margin-top:12px;">
        <div class="card"><h3>Analyst Ratings &amp; Price Target <span id="fundAnalystBadge" class="badge">LOADING</span></h3><div id="fundAnalystBox"><div class="notebox">Loading…</div></div></div>
        <div class="card"><h3>Dividend Info <span id="fundDividendBadge" class="badge">LOADING</span></h3><div id="fundDividendBox"><div class="notebox">Loading…</div></div></div>
      </div>
      <div class="card" style="margin-top:12px;"><h3>Insider Transactions <span id="fundInsiderBadge" class="badge">LOADING</span></h3><div id="fundInsiderBox"><div class="notebox">Loading…</div></div></div>`;
  }
  if(s.cls === 'ETF' || s.cls === 'Mutual Fund'){
    return `<div class="grid grid-2">
        <div class="card"><h3>Fund Profile <span id="fundProfileBadge" class="badge assume">LOADING</span></h3><div id="fundProfileBox"><div class="notebox">Loading…</div></div></div>
        <div class="card"><h3>Performance &amp; Risk <span id="fundPerfBadge" class="badge assume">LOADING</span></h3><div id="fundPerfBox"><div class="notebox">Loading…</div></div></div>
      </div>
      <div class="notebox" style="margin-top:12px;" id="fundPanelNote">Fund holdings lists are published by each fund provider and aren't available from any free, browser-accessible feed, so they're not shown rather than guessed.</div>`;
  }
  if(s.cls === 'Crypto'){
    return `<div class="grid grid-2">
        <div class="card"><h3>Market Stats <span id="fundCryptoBadge" class="badge assume">LOADING</span></h3><div id="fundCryptoBox"><div class="notebox">Loading…</div></div></div>
        <div class="card"><h3>Supply <span id="fundCryptoSupplyBadge" class="badge assume">LOADING</span></h3><div id="fundCryptoSupplyBox"><div class="notebox">Loading…</div></div></div>
      </div>
      <div class="grid grid-2" style="margin-top:12px;">
        <div class="card"><h3>Performance &amp; Risk <span id="fundPerfBadge" class="badge assume">LOADING</span></h3><div id="fundPerfBox"><div class="notebox">Loading…</div></div></div>
        <div class="card"><h3>Crypto Fear &amp; Greed Index <span id="fearGreedBadge" class="badge fact">alternative.me</span></h3><div id="fearGreedBox"><div class="notebox">Loading…</div></div></div>
      </div>`;
  }
  if(s.cls === 'FX'){
    return `<div class="grid grid-2">
        <div class="card"><h3>Currency Pair <span id="fundFxBadge" class="badge assume">LOADING</span></h3><div id="fundFxBox"><div class="notebox">Loading…</div></div></div>
        <div class="card"><h3>Performance &amp; Risk <span id="fundPerfBadge" class="badge assume">LOADING</span></h3><div id="fundPerfBox"><div class="notebox">Loading…</div></div></div>
      </div>`;
  }
  if(s.cls === 'Derivative' || s.cls === 'Commodity'){
    return `<div class="grid grid-2">
        <div class="card"><h3>Contract Specifications <span id="fundDerivBadge" class="badge fact">EXCHANGE SPEC</span></h3><div id="fundDerivBox"></div></div>
        <div class="card"><h3>Performance &amp; Risk <span id="fundPerfBadge" class="badge assume">LOADING</span></h3><div id="fundPerfBox"><div class="notebox">Loading…</div></div></div>
      </div>`;
  }
  if(s.cls === 'Index'){
    return `<div class="grid grid-2">
        <div class="card"><h3>Index Facts <span class="badge fact">INDEX PROVIDER</span></h3><div id="fundIndexBox"></div></div>
        <div class="card"><h3>Performance &amp; Risk <span id="fundPerfBadge" class="badge assume">LOADING</span></h3><div id="fundPerfBox"><div class="notebox">Loading…</div></div></div>
      </div>`;
  }
  return `<div class="notebox">No fundamentals view is defined yet for asset class "${escapeHtml(s.cls)}".</div>`;
}
/* Published exchange contract specifications (CME Group / ICE product pages). These are fixed
   reference facts, not market data, so they're stored here rather than fetched. Margins are left
   out on purpose: they change often and differ by broker. */
const CONTRACT_SPECS = {
  ES:{exch:'CME', size:'$50 × S&P 500 index', tick:'0.25 index pts = $12.50', settle:'Cash', months:'Mar, Jun, Sep, Dec'},
  NQ:{exch:'CME', size:'$20 × Nasdaq-100 index', tick:'0.25 index pts = $5.00', settle:'Cash', months:'Mar, Jun, Sep, Dec'},
  RTY:{exch:'CME', size:'$50 × Russell 2000 index', tick:'0.10 index pts = $5.00', settle:'Cash', months:'Mar, Jun, Sep, Dec'},
  YM:{exch:'CBOT', size:'$5 × Dow Jones Industrial Average', tick:'1.0 index pt = $5.00', settle:'Cash', months:'Mar, Jun, Sep, Dec'},
  ZC:{exch:'CBOT', size:'5,000 bushels', tick:'¼ cent/bu = $12.50', settle:'Physical delivery', months:'Mar, May, Jul, Sep, Dec'},
  ZW:{exch:'CBOT', size:'5,000 bushels', tick:'¼ cent/bu = $12.50', settle:'Physical delivery', months:'Mar, May, Jul, Sep, Dec'},
  ZS:{exch:'CBOT', size:'5,000 bushels', tick:'¼ cent/bu = $12.50', settle:'Physical delivery', months:'Jan, Mar, May, Jul, Aug, Sep, Nov'},
  ZB:{exch:'CBOT', size:'$100,000 face value US Treasury bond', tick:'1/32 point = $31.25', settle:'Physical delivery', months:'Mar, Jun, Sep, Dec'},
  NG:{exch:'NYMEX', size:'10,000 MMBtu', tick:'$0.001/MMBtu = $10.00', settle:'Physical delivery', months:'All 12 months'},
  HG:{exch:'COMEX', size:'25,000 lb', tick:'$0.0005/lb = $12.50', settle:'Physical delivery', months:'All 12 months'},
  GOLD:{exch:'COMEX (GC)', size:'100 troy oz', tick:'$0.10/oz = $10.00', settle:'Physical delivery', months:'Feb, Apr, Jun, Aug, Oct, Dec (+ near months)'},
  SILVER:{exch:'COMEX (SI)', size:'5,000 troy oz', tick:'$0.005/oz = $25.00', settle:'Physical delivery', months:'Mar, May, Jul, Sep, Dec (+ near months)'},
  WTI:{exch:'NYMEX (CL)', size:'1,000 barrels', tick:'$0.01/bbl = $10.00', settle:'Physical delivery', months:'All 12 months'},
  BRENT:{exch:'ICE Futures Europe (B)', size:'1,000 barrels', tick:'$0.01/bbl = $10.00', settle:'Cash (ICE Brent Index)', months:'All 12 months'},
};
const INDEX_FACTS = {
  SPX:{provider:'S&P Dow Jones Indices', members:'500 companies (≈503 share lines)', method:'Free-float market-cap weighted'},
  DJI:{provider:'S&P Dow Jones Indices', members:'30', method:'Price weighted'},
  NDX:{provider:'Nasdaq', members:'100 largest non-financial Nasdaq companies', method:'Modified market-cap weighted'},
  RUT:{provider:'FTSE Russell', members:'≈2,000 US small caps', method:'Free-float market-cap weighted'},
  NIFTY50:{provider:'NSE Indices', members:'50', method:'Free-float market-cap weighted'},
  SENSEX:{provider:'BSE / Asia Index', members:'30', method:'Free-float market-cap weighted'},
  FTSE100:{provider:'FTSE Russell', members:'100', method:'Free-float market-cap weighted'},
  DAX:{provider:'Deutsche Börse (STOXX)', members:'40', method:'Free-float market-cap weighted (total return)'},
  CAC40:{provider:'Euronext', members:'40', method:'Free-float market-cap weighted'},
  NIKKEI225:{provider:'Nikkei Inc.', members:'225', method:'Price weighted'},
  HANGSENG:{provider:'Hang Seng Indexes', members:'≈80 (varies with reviews)', method:'Free-float market-cap weighted, capped'},
  ASX200:{provider:'S&P Dow Jones Indices', members:'200', method:'Free-float market-cap weighted'},
  KOSPI:{provider:'Korea Exchange', members:'All KRX main-board common stocks', method:'Market-cap weighted'},
  STOXX50:{provider:'STOXX', members:'50 Eurozone blue chips', method:'Free-float market-cap weighted, capped'},
  VIX:{provider:'Cboe', members:'Derived from S&P 500 option prices', method:'30-day implied volatility (not a stock index)'},
};
/* Computed performance & risk card shared by every non-equity class (and US mutual funds). */
function perfRiskRows(hist, ccy){
  const d = hist.data, L = hist.labels, last = d[d.length-1];
  const back = days => d.length > days ? d[d.length-1-days] : null;
  const ret = p => p ? ((last/p-1)*100) : null;
  const yearStart = (()=>{ const y = new Date().getFullYear()+''; const i = L.findIndex(x=>x.startsWith(y)); return i>0 ? d[i-1] : null; })();
  const cagr = yrs => { const p = back(Math.round(252*yrs)); return p ? (Math.pow(last/p, 1/yrs)-1)*100 : null; };
  const rets = Formulas.dailyReturns(d.slice(-253), false);
  const vol = Formulas.stddev(rets, true)*Math.sqrt(252)*100;
  const dd = Formulas.maxDrawdown(d.slice(-756)).maxDrawdownPct;
  const hi52 = Math.max(...d.slice(-252)), lo52 = Math.min(...d.slice(-252));
  const fmtR = v => v==null ? '—' : `<span class="${v>=0?'up':'down'}">${v>=0?'+':''}${v.toFixed(1)}%</span>`;
  return [
    ['1 month', fmtR(ret(back(21)))], ['3 months', fmtR(ret(back(63)))], ['Year to date', fmtR(ret(yearStart))], ['1 year', fmtR(ret(back(252)))],
    ['3-year CAGR', fmtR(cagr(3))], ['5-year CAGR', fmtR(cagr(5))],
    ['Volatility (1Y, annualised)', isFinite(vol) ? vol.toFixed(1)+'%' : '—'], ['Max drawdown (3Y)', isFinite(dd) ? dd.toFixed(1)+'%' : '—'],
    ['52-week range', `${fmtPrice(lo52, ccy)} – ${fmtPrice(hi52, ccy)}`],
  ];
}
let nonEquityToken = 0;
async function renderNonEquityLive(s){
  const myToken = ++nonEquityToken;
  const setBadge = (id, text, live)=>{ const b = document.getElementById(id); if(b){ b.textContent = text; b.className = live ? 'badge fact' : 'badge assume'; } };
  // performance & risk from live daily history
  (async()=>{
    const box = document.getElementById('fundPerfBox'); if(!box) return;
    try{
      const hist = s._kuvera ? await fetchIndianMfNav(s) : await fetchYahooHistory(s.t, yahooSymbolFor(s.t));
      if(myToken !== nonEquityToken) return;
      box.innerHTML = kv(perfRiskRows(hist, s.ccy)) + `<div class="notebox" style="margin-top:6px;">Computed from ${hist.data.length.toLocaleString()} live daily ${s._kuvera?'NAVs':'closes'} (${escapeHtml(hist.via||'CNBC')}).</div>`;
      setBadge('fundPerfBadge','LIVE',true);
    }catch(e){ if(myToken===nonEquityToken){ box.innerHTML = `<div class="notebox">Price history unavailable right now (${escapeHtml(e.message)}).</div>`; setBadge('fundPerfBadge','UNAVAILABLE',false); } }
  })();
  if(s.cls === 'ETF' || s.cls === 'Mutual Fund'){
    const box = document.getElementById('fundProfileBox');
    try{
      if(s._kuvera){
        const d = await fetchKuveraDetail(s._kuvera);
        if(myToken !== nonEquityToken) return;
        box.innerHTML = kv([
          ['Fund house', escapeHtml(String(d.fund_house||'—').replace(/_MF$/,'').replace(/_/g,' '))], ['Category', escapeHtml(d.category||d.fund_category||'—')], ['Plan', escapeHtml(d.plan||(d.direct?'Direct':'—'))],
          ['Latest NAV', d.nav && d.nav.nav ? `₹${(+d.nav.nav).toFixed(4)} (${escapeHtml(d.nav.date||'')})` : '—'],
          ['Expense ratio', d.expense_ratio!=null ? (+d.expense_ratio).toFixed(2)+'%' : '—'], ['AUM', d.aum!=null ? '₹'+(+d.aum/10).toLocaleString(undefined,{maximumFractionDigits:0})+' cr' : '—'],
          ['Fund manager', escapeHtml(d.fund_manager||'—')], ['ISIN', escapeHtml(d.ISIN||'—')], ['Risk (CRISIL)', escapeHtml(d.crisil_rating||'—')],
        ]) + (d.investment_objective ? `<div class="notebox" style="margin-top:6px;">${escapeHtml(String(d.investment_objective).slice(0,320))}</div>` : '');
        setBadge('fundProfileBadge','LIVE',true);
        const note = document.getElementById('fundPanelNote'); if(note) note.textContent = 'Scheme details from Kuvera\'s public fund directory; NAV history from AMFI data (via mf.captnemo.in). Portfolio holdings are published monthly by each AMC and are not available from a free feed.';
      } else {
        const tv = LD.tvSymbol(s.t);
        const y = tv ? await LD.fundamentals(tv).catch(()=>null) : null;
        let q = null; try{ q = await LD.quote(LD.cnbcSymbol(s.t)); }catch(e){}
        if(myToken !== nonEquityToken) return;
        if(!y && !q) throw new Error('no live source answered');
        const rows = [['Name', escapeHtml((y && y.entityName) || s.n)]];
        if(y && y.brand) rows.push(['Issuer / brand', escapeHtml(y.brand)]);
        if(y && y.expenseRatio!=null) rows.push(['Expense ratio', y.expenseRatio.toFixed(2)+'%']);
        if(y && y.aum!=null) rows.push(['Assets under management', fmtMarketCapShort(y.aum, 'USD')]);
        if(y && y.dividendYield!=null) rows.push(['Distribution yield', (y.dividendYield*100).toFixed(2)+'%']);
        if(q && q.last!=null) rows.push(['Last price', fmtPrice(q.last, q.currency||s.ccy)]);
        if(q && q.divYieldPct!=null && !(y && y.dividendYield!=null)) rows.push(['Dividend yield', q.divYieldPct.toFixed(2)+'%']);
        rows.push(['Listing', escapeHtml(`${s.ex} · ${s.ccy}`)]);
        box.innerHTML = kv(rows) + `<div class="notebox" style="margin-top:6px;">Live from TradingView${q?' and CNBC':''}.</div>`;
        setBadge('fundProfileBadge','LIVE',true);
      }
    }catch(e){ if(myToken===nonEquityToken){ box.innerHTML = `<div class="notebox">Fund profile unavailable right now (${escapeHtml(e.message)}).</div>`; setBadge('fundProfileBadge','UNAVAILABLE',false); } }
  } else if(s.cls === 'FX'){
    const box = document.getElementById('fundFxBox');
    const base = s.t.slice(0,3), quote = s.t.slice(3,6);
    try{
      const [ecb, q] = await Promise.all([
        fetchWithTimeout(`https://api.frankfurter.dev/v1/latest?base=${base}&symbols=${quote}`, {mode:'cors'}, 10000).then(r=>r.json()).catch(()=>null),
        LD.quote(LD.cnbcSymbol(s.t)).catch(()=>null),
      ]);
      if(myToken !== nonEquityToken) return;
      const live = q ? (s.t.startsWith('USD') ? q.last : q.last) : null;
      box.innerHTML = kv([
        ['Pair', `${base} / ${quote}`], ['Live market rate', live!=null ? live.toFixed(4)+` <span style="color:var(--text-2);font-size:10.5px;">CNBC</span>` : '—'],
        ['ECB reference rate', ecb && ecb.rates && ecb.rates[quote]!=null ? (+ecb.rates[quote]).toFixed(4)+` <span style="color:var(--text-2);font-size:10.5px;">${escapeHtml(ecb.date||'')}</span>` : '—'],
        ['Today', q && q.chgPct!=null ? `<span class="${q.chgPct>=0?'up':'down'}">${q.chgPct>=0?'+':''}${q.chgPct.toFixed(2)}%</span>` : '—'],
        ['Day range', q && q.low!=null && q.high!=null ? `${q.low.toFixed(4)} – ${q.high.toFixed(4)}` : '—'],
      ]) + `<div class="notebox" style="margin-top:6px;">The ECB reference rate is set once per business day around 14:15 CET; the market rate moves continuously.</div>`;
      setBadge('fundFxBadge','LIVE',true);
    }catch(e){ if(myToken===nonEquityToken){ box.innerHTML = `<div class="notebox">Rates unavailable right now (${escapeHtml(e.message)}).</div>`; setBadge('fundFxBadge','UNAVAILABLE',false); } }
  } else if(s.cls === 'Derivative' || s.cls === 'Commodity'){
    const box = document.getElementById('fundDerivBox');
    const spec = CONTRACT_SPECS[s.t];
    if(spec){
      box.innerHTML = kv([['Exchange', spec.exch], ['Contract size', spec.size], ['Minimum tick', spec.tick], ['Settlement', spec.settle], ['Listed months', spec.months]])
        + `<div class="notebox" style="margin-top:6px;">Published exchange specification. Margins are set by the exchange and your broker and change frequently, so check them before trading.</div>`;
    } else if(s.ex === 'NSE'){
      box.innerHTML = kv([['Exchange', 'NSE (F&amp;O segment)'], ['Settlement', /OPT$/.test(s.t) ? 'European-style, cash settled' : 'Cash settled'], ['Expiry', 'Monthly (index and stock contracts); weekly for select index options'], ['Lot size', 'Set and periodically revised by NSE — see the latest NSE F&amp;O circular']])
        + `<div class="notebox" style="margin-top:6px;">Lot sizes are revised by NSE circulars, so they're linked rather than hard-coded. The live front-month futures price and basis appear in Data Quality on the Overview tab.</div>`;
    } else {
      box.innerHTML = `<div class="notebox">No published specification is stored for ${escapeHtml(s.t)}.</div>`;
      setBadge('fundDerivBadge','—',false);
    }
  } else if(s.cls === 'Index'){
    const box = document.getElementById('fundIndexBox');
    const f = INDEX_FACTS[s.t];
    box.innerHTML = f ? kv([['Index provider', escapeHtml(f.provider)], ['Constituents', escapeHtml(f.members)], ['Weighting', escapeHtml(f.method)], ['Region', escapeHtml(s.ctry)]])
      + `<div class="notebox" style="margin-top:6px;">Index methodology facts from the index provider. Live level, returns and risk are on the right.</div>` : `<div class="notebox">No index facts stored for ${escapeHtml(s.t)}.</div>`;
  }
}
