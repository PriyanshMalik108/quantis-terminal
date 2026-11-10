/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/data/fundamentals-live.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   fetchLiveFundamentals / refreshFundamentals — key stats, statements, analyst data.
 * DEPENDS   data/live-data.js
 * EXPOSES   LIVE_FUNDAMENTALS, fetchLiveFundamentals, refreshFundamentals (global — classic script, shared scope)
 * LOAD      Classic <script>, order defined in js/manifest.json. Top-level code runs at load,
 *           so it may only call functions from files listed EARLIER in the manifest.
 * NOTE      Migrated verbatim from the single-file build; inline comments marked
 *           "REAL BUG FIXED" / "post-launch fix" document past defects — keep them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* ===================== LIVE FUNDAMENTALS (TradingView + CNBC, keyless) =====================
   TradingView supplies ratios, statements history, analyst consensus, earnings and dividend
   dates; CNBC supplies EPS, market cap, 52-week range and share count in the stock's own trading
   currency. Both answer browser requests directly — no key, no proxy. */
const LIVE_FUNDAMENTALS_ERR = {};
function reviveFundDates(y){
  const d = v => v==null ? null : (v instanceof Date ? v : new Date(v));
  if(y.earnings){ y.earnings.nextDate = d(y.earnings.nextDate); y.earnings.dateRange = (y.earnings.dateRange||[y.earnings.nextDate,y.earnings.nextDate]).map(d); }
  if(y.dividend && y.dividend.exDivDate) y.dividend.exDivDate = d(y.dividend.exDivDate);
  return y;
}
async function fetchLiveFundamentals(ticker){
  const tv = LD.tvSymbol(ticker);
  if(!tv) throw new Error('no TradingView listing mapped for '+ticker);
  const y = reviveFundDates(JSON.parse(JSON.stringify(await LD.fundamentals(tv))));
  let q = null;
  try{ const cn = LD.cnbcSymbol(ticker); if(cn) q = await LD.quote(cn); }catch(e){ /* TradingView alone is still complete */ }
  y.marketCapTv = y.marketCap;
  if(q){
    if(q.currency) y.currency = q.currency;
    if(q.mktcap){ y.marketCap = q.mktcap; y.marketCapCurrency = q.currency || y.currency; }
    if(q.eps!=null) y.eps = q.eps;
    if(q.hi52!=null) y.fiftyTwoWkHigh = q.hi52;
    if(q.lo52!=null) y.fiftyTwoWkLow = q.lo52;
    if(y.dividendYield==null && q.divYieldPct!=null) y.dividendYield = q.divYieldPct/100;
    if(y.beta==null && q.beta!=null) y.beta = q.beta;
    if(q.sharesOut) y.sharesOutCnbc = q.sharesOut;
  }
  const pence = y.currency === 'GBp' || y.currency === 'GBX';
  if(pence && y.marketCapCurrency && /^GB[pX]$/.test(y.marketCapCurrency)) y.marketCapCurrency = 'GBP'; // CNBC states London market caps in pounds
  if(!y.marketCapCurrency) y.marketCapCurrency = y.fundamentalCurrency || y.currency;
  // Reporting → trading currency factor (1 for most stocks; 100 for London pence quotes; the live
  // ECB rate for ADRs such as TSM, which reports in TWD but trades in USD).
  y.fxReportToTrade = 1;
  if(y.fundamentalCurrency && y.currency && y.fundamentalCurrency !== y.currency){
    try{ y.fxReportToTrade = (await getFxRateToUsd(y.fundamentalCurrency)) / (await getFxRateToUsd(y.currency)); }
    catch(e){ y.fxReportToTrade = null; }
  }
  if(pence && y.fundamentalCurrency === 'GBP'){
    // TradingView quotes analyst targets and dividends per share in pounds; the share price is in pence.
    if(y.analyst){ ['targetMean','targetHigh','targetLow'].forEach(k=>{ if(y.analyst[k]!=null) y.analyst[k] *= 100; }); }
    if(y.dividend && y.dividend.rate!=null) y.dividend.rate *= 100;
  }
  y.via = q ? 'TradingView + CNBC' : 'TradingView';
  return y;
}
function fmtMarketCapShort(v, ccy){ // global copy — the original lives inside refreshFundamentals() and wasn't reachable from the ETF/overview cards
  if(v==null || !isFinite(v)) return '—';
  const sym = (CURRENCY_META[ccy] || CURRENCY_META.USD).symbol;
  if(v>=1e12) return sym+(v/1e12).toFixed(2)+'T';
  if(v>=1e9) return sym+(v/1e9).toFixed(2)+'B';
  if(v>=1e6) return sym+(v/1e6).toFixed(1)+'M';
  return sym+v.toLocaleString();
}
function fmtAmtCcy(v, ccy){
  if(v==null || !isFinite(v)) return '—';
  const sym = (CURRENCY_META[ccy] || {symbol: (ccy||'')+' '}).symbol;
  const a = Math.abs(v), sg = v<0 ? '−' : '';
  return sg + sym + (a>=1e12 ? (a/1e12).toFixed(2)+'T' : a>=1e9 ? (a/1e9).toFixed(2)+'B' : a>=1e6 ? (a/1e6).toFixed(1)+'M' : a.toLocaleString(undefined,{maximumFractionDigits:0}));
}
function setCardBadge(innerId, text, live){
  const el = document.getElementById(innerId); if(!el) return;
  const b = el.closest('.card')?.querySelector('h3 .badge'); if(!b) return;
  b.textContent = text; b.className = 'badge ' + (live ? 'fact' : 'assume');
}
function renderTvStatements(y){
  const st = y.statements; if(!st || !st.years || !st.years.length) return false;
  const ccy = st.currency || y.fundamentalCurrency || y.currency;
  const n = Math.min(5, st.years.length);
  const idx = [...Array(n).keys()].reverse(); // oldest → newest, left to right
  const yrs = idx.map(i=>'FY'+st.years[i]);
  const row = (label, arr, f) => [label, ...idx.map(i => (arr && arr[i]!=null && isFinite(arr[i])) ? (f ? f(arr[i]) : fmtAmtCcy(arr[i], ccy)) : '—')];
  const keep = r => r.slice(1).some(v=>v!=='—');
  const incomeEl = document.getElementById('fundIncomeTable');
  if(incomeEl){
    const rev = st.revenue||[];
    const growth = (rev[0] && rev[1]) ? (rev[0]/rev[1]-1)*100 : null;
    const margin = (st.netIncome && st.netIncome[0]!=null && rev[0]) ? st.netIncome[0]/rev[0]*100 : null;
    incomeEl.innerHTML = table(['Metric', ...yrs], [row('Revenue', st.revenue), row('Gross Profit', st.grossProfit), row('EBITDA', st.ebitda),
        row('Net Income', st.netIncome), row('EPS (diluted)', st.eps, v=>v.toFixed(2))].filter(keep))
      + `<div class="notebox" style="margin-top:6px;">Reported annual figures in ${escapeHtml(ccy)}.${growth!=null?` Latest revenue growth ${growth>=0?'+':''}${growth.toFixed(1)}% YoY.`:''}${margin!=null?` Net margin ${margin.toFixed(1)}%.`:''}</div>`;
    setCardBadge('fundIncomeTable', 'LIVE', true);
  }
  const balEl = document.getElementById('fundBalanceTable');
  if(balEl){
    const hist = [row('Total Assets', st.totalAssets), row('Total Debt', st.totalDebt)].filter(keep);
    const latest = [['Total Equity (latest qtr)', fmtAmtCcy(y.totalEquity, ccy)], ['Total Liabilities (latest qtr)', fmtAmtCcy(y.totalLiabilities, ccy)],
      ['Cash & Short-term Investments', fmtAmtCcy(y.cash, ccy)], ['Debt / Equity', y.debtToEquity!=null ? y.debtToEquity.toFixed(2)+'×' : '—'],
      ['Current Ratio', y.currentRatio!=null ? y.currentRatio.toFixed(2)+'×' : '—']];
    balEl.innerHTML = (hist.length ? table(['Metric', ...yrs], hist) : '') + kv(latest);
    setCardBadge('fundBalanceTable', 'LIVE', true);
  }
  const cfEl = document.getElementById('fundCashflowBox');
  if(cfEl){
    const fcfHist = [row('Free Cash Flow', st.fcf)].filter(keep);
    const fcfMargin = (y.fcfTtm!=null && y.revenue) ? y.fcfTtm/y.revenue*100 : null;
    cfEl.innerHTML = (fcfHist.length ? table(['Metric', ...yrs], fcfHist) : '') + kv([
      ['Operating Cash Flow (last FY)', fmtAmtCcy(y.opCashFlowFy, ccy)],
      ['Capital Expenditure (last FY)', y.capexFy!=null ? fmtAmtCcy(Math.abs(y.capexFy), ccy) : '—'],
      ['Free Cash Flow (TTM)', fmtAmtCcy(y.fcfTtm, ccy)],
      ['FCF Margin (TTM)', fcfMargin!=null ? fcfMargin.toFixed(1)+'%' : '—'],
    ]);
    setCardBadge('fundCashflowBox', 'LIVE', true);
  }
  return true;
}
function renderStatementsUnavailable(ticker, why){
  ['fundIncomeTable','fundBalanceTable','fundCashflowBox'].forEach(id=>{
    const el = document.getElementById(id); if(!el) return;
    el.innerHTML = `<div class="notebox">No reported statements available for ${escapeHtml(ticker)}${why?` — ${escapeHtml(why)}`:''}.</div>`;
    setCardBadge(id, 'UNAVAILABLE', false);
  });
}
function renderTvRecommendation(analyst, ticker){
  const box = document.getElementById('finnhubRecBox'); if(!box) return;
  if(getKey('finnhub')) return; // the Finnhub monthly trend is shown instead
  const badge = document.getElementById('fundRecBadge');
  if(!analyst || !analyst.counts){
    box.innerHTML = `<div class="notebox">No sell-side analyst coverage is published for ${escapeHtml(ticker)}.</div>`;
    if(badge){ badge.textContent = 'NO COVERAGE'; badge.className = 'badge assume'; }
    return;
  }
  const c = analyst.counts, tot = c.strongBuy + c.buy + c.hold + c.underperform + c.sell;
  const seg = (n, color, label) => `<div style="flex:${Math.max(n,0.001)};background:${color};height:16px;" title="${label}: ${n}"></div>`;
  box.innerHTML = `<div style="display:flex;border-radius:4px;overflow:hidden;margin-bottom:8px;">${seg(c.strongBuy,'#1f9d63','Strong Buy')}${seg(c.buy,'#3ECF8E','Buy')}${seg(c.hold,'#B08A3E','Hold')}${seg(c.underperform,'#FF5C6C','Underperform')}${seg(c.sell,'#a3222f','Sell')}</div>`
    + kv([['Strong Buy', String(c.strongBuy)], ['Buy / Outperform', String(c.buy)], ['Hold', String(c.hold)], ['Underperform', String(c.underperform)], ['Sell', String(c.sell)],
         ['Consensus', `${(analyst.recKey||'').replace('_',' ').toUpperCase()} (${analyst.recMean.toFixed(2)} on a 1 = strong buy … 5 = sell scale)`]])
    + `<div class="notebox" style="margin-top:6px;">Current consensus of ${tot} analysts via TradingView. Add a free Finnhub key in Settings for the month-by-month history.</div>`;
  if(badge){ badge.textContent = 'LIVE'; badge.className = 'badge fact'; }
}
function renderFundamentalsSampleContent(s){
  if(s.cls === 'Equity'){
    ['fundKeyStatsBox','fundRatiosBox','fundIncomeTable','fundBalanceTable','fundCashflowBox'].forEach(id=>{
      const el = document.getElementById(id); if(el) el.innerHTML = '<div class="notebox">Loading live data…</div>';
    });
    return;
    const f = seededFundamentalsFor(s.t, s.px);
    const peProxy = (s.pe!=null && s.pe>0) ? s.pe : (8 + (f.roe/100)*30);
    const ksEl = document.getElementById('fundKeyStatsBox');
    if(ksEl) ksEl.innerHTML = kv([['P/E (trailing, approx)', peProxy.toFixed(1)+'x'],['EPS', f.eps.toFixed(2)+' '+s.ccy],
      ['Market Cap (approx)', s.ccy+' '+Math.round(f.revenue*(1.5+f.netMargin*3)).toLocaleString()+'mn'],
      ['Dividend Yield (approx)', (f.netMargin*8).toFixed(2)+'%'], ['52-Week Range', 'not available in sample mode']]);
    const incomeEl = document.getElementById('fundIncomeTable');
    if(incomeEl) incomeEl.innerHTML = table(['Metric','FY-1','FY'],[
      ['Revenue ('+s.ccy+' mn)', f.revenuePrior.toLocaleString(), f.revenue.toLocaleString()],
      ['Gross Profit', Math.round(f.revenue*f.grossMargin).toLocaleString(), Math.round(f.revenuePrior*f.grossMargin).toLocaleString()],
      ['Net Income', f.niPrior.toLocaleString(), f.ni.toLocaleString()],
      ['EPS', (f.eps*0.9).toFixed(2), f.eps.toFixed(2)],
    ]);
    const balEl = document.getElementById('fundBalanceTable');
    if(balEl) balEl.innerHTML = table(['Metric', s.ccy+' mn'],[['Cash', f.cash.toLocaleString()],['Total Debt', f.debt.toLocaleString()],['Total Equity', Math.round(f.ni/((f.roe||10)/100)).toLocaleString()]]);
    const ratiosEl = document.getElementById('fundRatiosBox');
    if(ratiosEl) ratiosEl.innerHTML = bar('ROE',f.roe,60,'var(--amber)',f.roe.toFixed(1)+'%')+bar('ROIC',f.roic,40,'var(--amber)',f.roic.toFixed(1)+'%')+bar('Gross Margin',Math.round(f.grossMargin*100),100,'var(--amber)')+bar('Net Margin',Math.round(f.netMargin*100),100,'var(--amber)')+bar('Debt/Equity',f.debtEquity,250,'var(--amber)',f.debtEquity.toFixed(0)+'%')+bar('Current Ratio',f.currentRatio,3,'var(--amber)',f.currentRatio.toFixed(2)+'×');
    const cfEl = document.getElementById('fundCashflowBox');
    if(cfEl) cfEl.innerHTML = kv([['CFO', f.cfo.toLocaleString()+' '+s.ccy+'mn'],['CapEx', f.capex.toLocaleString()+' '+s.ccy+'mn'],['FCF (approx)', (f.cfo-f.capex).toLocaleString()+' '+s.ccy+'mn']]);
  }else if(s.cls === 'Crypto'){
    renderFearGreedIndex('fearGreedBox', 'fearGreedBadge');
    renderNonEquityLive(s);
  }else{
    renderNonEquityLive(s);
  }
}
async function refreshFundamentals(ticker){
  const myToken = ++fundFetchToken;
  const statusEl = document.getElementById('fundLiveStatus');
  const contentEl = document.getElementById('fundContent');
  if(!statusEl || !contentEl) return; // panel not currently rendered
  const s = SECURITIES.find(x=>x.t===ticker);
  if(!s) return;

  contentEl.innerHTML = fundamentalsPanelHtml(s);
  renderFundamentalsSampleContent(s);
  if(s.cls === 'Equity') renderCompanyProfile(s.n); // independent Wikipedia fetch, doesn't block or wait on anything below
  if(s.cls === 'Equity') renderFinnhubRecommendations(s.t); // independent Finnhub fetch, optional key — no-ops with a clear message if no key is set
  // Reset the Overview tab's Key Stats card to a neutral loading state too, same reasoning as
  // fundamentalsPanelHtml() just above resetting fundAnalystBox/fundDividendBox — otherwise a
  // ticker switch could briefly show the PREVIOUS ticker's real numbers under the new ticker's
  // name until this fetch resolves.
  const ovBox = document.getElementById('ovKeyStatsBox'), ovBadge = document.getElementById('ovKeyStatsBadge'), ovGauge = document.getElementById('ov52wGauge');
  if(ovBox){ ovBox.innerHTML = kv([['Market Cap','—'],['P/E (TTM)','—'],['EPS (TTM)','—'],['Dividend Yld','—'],['52W Range','—'],['Beta (5Y)','—']]); }
  if(ovBadge){ ovBadge.textContent='SAMPLE'; ovBadge.className='badge assume'; }
  if(ovGauge){ ovGauge.innerHTML = ''; }

  if(s.cls !== 'Equity') renderOverviewKeyStatsGeneric(s, myToken);
  if(s._kuvera){
    statusEl.innerHTML = `<b>Source:</b> <span class="badge fact">LIVE</span> Kuvera public fund directory (scheme details) + AMFI NAV history via mf.captnemo.in — both keyless.`;
    return;
  }
  if(s.cls === 'Crypto' && COINGECKO_ID[ticker]){
    // Completes what was previously flagged in fundamentalsPanelHtml's own comment as "a
    // reasonable follow-up, not yet done here" — CoinGecko's real market_data was already used
    // for price elsewhere, just never wired into this specific panel, which was showing
    // seeded-random placeholder numbers instead.
    try{
      const cg = await fetchCoinGeckoProfile(ticker);
      if(myToken !== fundFetchToken) return;
      const el1 = document.getElementById('fundCryptoBox');
      if(el1) el1.innerHTML = kv([
        ['Market Cap', cg.marketCap!=null?'$'+Math.round(cg.marketCap).toLocaleString():'—'],
        ['Market Cap Rank', cg.rank!=null?'#'+cg.rank:'—'],
        ['All-Time High', cg.athUsd!=null?'$'+cg.athUsd.toLocaleString():'—'],
        ['ATH Date', cg.athDate?new Date(cg.athDate).toISOString().slice(0,10):'—'],
      ]);
      const el2 = document.getElementById('fundCryptoSupplyBox');
      if(el2) el2.innerHTML = kv([
        ['Circulating Supply', cg.circulating!=null?Math.round(cg.circulating).toLocaleString():'—'],
        ['Total Supply', cg.total!=null?Math.round(cg.total).toLocaleString():'—'],
        ['Max Supply', cg.max!=null?Math.round(cg.max).toLocaleString():'Uncapped'],
      ]);
      const headerBadge = document.getElementById('fundCryptoBadge'), supplyBadge = document.getElementById('fundCryptoSupplyBadge');
      if(headerBadge){ headerBadge.textContent='LIVE'; headerBadge.className='badge fact'; }
      if(supplyBadge){ supplyBadge.textContent='LIVE'; supplyBadge.className='badge fact'; }
      statusEl.innerHTML = `<b>Source:</b> <span class="badge fact">LIVE</span> via CoinGecko (free, keyless, direct — no proxy needed) — real market cap, supply, and all-time-high data for ${s.n}.`;
    }catch(err){
      if(myToken !== fundFetchToken) return;
      statusEl.innerHTML = `<b>Source:</b> SAMPLE (fallback) — <span style="color:var(--down)">CoinGecko unreachable: ${escapeHtml(err.message)}</span>`;
    }
    return;
  }
  if(s.cls !== 'Equity'){
    statusEl.innerHTML = `<b>Asset class:</b> ${escapeHtml(s.cls)} — profile and live performance/risk below (company-style statements only apply to stocks); equity-style Income Statement/Balance Sheet only applies to stocks. See the panel below for what's actually relevant to a ${s.cls.toLowerCase()}.`;
    return;
  }

  /* Previously this whole function stopped dead here for any ticker outside SEC_CIK (i.e.
     everything except AAPL/MSFT/NVDA/AMZN) and just left sample data up with no live attempt
     ever made — the root cause of "fundamentals is only sample, never real" for the vast
     majority of tickers, especially every non-US company. Now Yahoo's quoteSummary is tried
     for ANY equity first (same global exchange coverage as the price chart), and SEC EDGAR is
     layered on top for any US-listed ticker resolvable via the built-in map or SEC's own
     official company_tickers.json lookup, since it gives real filed 10-K figures Yahoo's
     summary doesn't carry. */
  const statusParts = [];
  let anyLive = false;

  const ksEl = document.getElementById('fundKeyStatsBox');
  const ksBadge = document.getElementById('fundKeyStatsBadge');
  const ratiosBox = document.getElementById('fundRatiosBox');
  const ratiosBadge = document.getElementById('fundRatiosBadge');

/* FIXED REAL BUG: the Research Overview's "Key Stats" card was 100% static, hardcoded HTML
   (literally "$3.48T", "P/E 34.2", etc. baked into the page) that NEVER updated regardless of
   which security was selected or whether live data loaded — select MSFT or TSLA and it would
   still silently show Apple's old numbers with no SAMPLE/LIVE badge to warn you, breaking this
   app's own core "never show stale data as if current" rule. Wired to real data here (same
   fetch as everything else in this function, zero extra cost) with honest "—" placeholders
   before any data has loaded, instead of fabricated-looking numbers. Also adds a genuine 52-week
   high/low proximity gauge — a standard feature on every serious terminal (Bloomberg,
   TradingView) that existed nowhere in this app before, the 52-week figures were only ever
   shown as plain text buried in the Fundamentals tab. */
function fmtMarketCapShort(v, ccy){
  if(v==null) return '—';
  const sym = (CURRENCY_META[ccy] || CURRENCY_META.USD).symbol; // was hard-coded '$' — a ₹ market cap printed as dollars
  if(v>=1e12) return sym+(v/1e12).toFixed(2)+'T';
  if(v>=1e9) return sym+(v/1e9).toFixed(2)+'B';
  if(v>=1e6) return sym+(v/1e6).toFixed(1)+'M';
  return sym+v.toLocaleString();
}
async function renderOverviewKeyStatsGeneric(s, myToken){
  const box = document.getElementById('ovKeyStatsBox'), badge = document.getElementById('ovKeyStatsBadge');
  if(!box) return;
  try{
    let rows = [];
    if(s._kuvera){
      const h = await fetchIndianMfNav(s);
      if(myToken !== fundFetchToken) return;
      const d = h.data, n = d.length, back = k => n > k ? (d[n-1]/d[n-1-k]-1)*100 : null, fmtR = v => v==null ? '—' : `<span class="${v>=0?'up':'down'}">${v>=0?'+':''}${v.toFixed(1)}%</span>`;
      rows = [['Latest NAV', fmtPrice(d[n-1], 'INR')], ['NAV date', escapeHtml(h.lastDate||'—')], ['1-month return', fmtR(back(21))], ['1-year return', fmtR(back(252))], ['3-year return (total)', fmtR(back(756))]];
    } else {
      const cn = LD.cnbcSymbol(s.t); const q = cn ? await LD.quote(cn) : null;
      if(myToken !== fundFetchToken) return;
      if(!q) throw new Error('no quote');
      const ccy = q.currency || s.ccy, fp = v => v!=null ? fmtPrice(v, ccy) : '—';
      rows = [['Last', fp(q.last)], ['Previous close', fp(q.prev)], ['Day range', q.low!=null && q.high!=null ? `${fp(q.low)} – ${fp(q.high)}` : '—'],
        ['52-week range', q.lo52!=null && q.hi52!=null ? `${fp(q.lo52)} – ${fp(q.hi52)}` : '—']];
      if(q.volume) rows.push(['Volume', q.volume.toLocaleString()]);
      if(s.cls === 'ETF'){
        const tv = LD.tvSymbol(s.t); const y = tv ? await LD.fundamentals(tv).catch(()=>null) : null;
        if(myToken !== fundFetchToken) return;
        if(y && y.expenseRatio!=null) rows.push(['Expense ratio', y.expenseRatio.toFixed(2)+'%']);
        if(y && y.aum!=null) rows.push(['AUM', fmtMarketCapShort(y.aum, 'USD')]);
        if(y && y.dividendYield!=null) rows.push(['Distribution yield', (y.dividendYield*100).toFixed(2)+'%']);
      }
      if(s.cls === 'Crypto' && typeof COINGECKO_ID !== 'undefined' && COINGECKO_ID[s.t]){
        try{ const cg = await fetchCoinGeckoProfile(s.t); if(myToken !== fundFetchToken) return; if(cg.marketCap!=null) rows.push(['Market cap', fmtMarketCapShort(cg.marketCap, 'USD')]); if(cg.rank!=null) rows.push(['Market-cap rank', '#'+cg.rank]); }catch(e){}
      }
      const gauge = document.getElementById('ov52wGauge');
      if(gauge && q.lo52!=null && q.hi52!=null && q.hi52 > q.lo52){
        const pct = Math.max(0, Math.min(100, (q.last-q.lo52)/(q.hi52-q.lo52)*100));
        gauge.innerHTML = `<div style="font-size:10.5px;color:var(--text-2);margin-bottom:4px;display:flex;justify-content:space-between;"><span>52W Low</span><span>52W High</span></div><div style="position:relative;height:8px;background:var(--bg-2);border-radius:4px;"><div style="position:absolute;left:0;top:0;height:100%;width:${pct}%;background:linear-gradient(90deg,var(--down),var(--amber),var(--up));border-radius:4px;opacity:0.35;"></div><div style="position:absolute;left:${pct}%;top:-3px;width:3px;height:14px;background:var(--text-0);border-radius:2px;transform:translateX(-50%);"></div></div><div style="font-size:10.5px;color:var(--text-2);margin-top:4px;text-align:center;">${pct.toFixed(0)}% of the way from the 52-week low to high</div>`;
      }
    }
    box.innerHTML = kv(rows);
    if(badge){ badge.textContent = 'LIVE'; badge.className = 'badge fact'; }
  }catch(e){
    if(myToken !== fundFetchToken) return;
    box.innerHTML = `<div class="notebox">Live statistics unavailable right now.</div>`;
    if(badge){ badge.textContent = 'UNAVAILABLE'; badge.className = 'badge assume'; }
  }
}
function renderOverviewKeyStats(y, currentPrice, currency){
  const box = document.getElementById('ovKeyStatsBox'), badge = document.getElementById('ovKeyStatsBadge'), gaugeEl = document.getElementById('ov52wGauge');
  if(!box) return;
  box.innerHTML = kv([
    ['Market Cap', fmtMarketCapShort(y.marketCap, y.marketCapCurrency || y.currency)],
    ['P/E (TTM)', y.pe!=null ? y.pe.toFixed(1) : '—'],
    ['EPS (TTM)', y.eps!=null ? fmtPrice(y.eps, currency) : '—'],
    ['Dividend Yld', y.dividendYield!=null ? (y.dividendYield*100).toFixed(2)+'%' : '—'],
    ['52W Range', (y.fiftyTwoWkLow!=null && y.fiftyTwoWkHigh!=null) ? `${fmtPrice(y.fiftyTwoWkLow,currency)} – ${fmtPrice(y.fiftyTwoWkHigh,currency)}` : '—'],
    ['Beta (5Y)', y.beta!=null ? y.beta.toFixed(2) : '—'],
  ]);
  if(badge){ badge.textContent='LIVE'; badge.className='badge fact'; }
  if(gaugeEl){
    if(y.fiftyTwoWkLow!=null && y.fiftyTwoWkHigh!=null && currentPrice && y.fiftyTwoWkHigh>y.fiftyTwoWkLow){
      const pct = Math.max(0,Math.min(100, ((currentPrice-y.fiftyTwoWkLow)/(y.fiftyTwoWkHigh-y.fiftyTwoWkLow))*100));
      const fromHigh = ((currentPrice/y.fiftyTwoWkHigh)-1)*100;
      gaugeEl.innerHTML = `<div style="font-size:10.5px;color:var(--text-2);margin-bottom:4px;display:flex;justify-content:space-between;"><span>52W Low</span><span>52W High</span></div>
        <div style="position:relative;height:8px;background:var(--bg-2);border-radius:4px;overflow:visible;">
          <div style="position:absolute;left:0;top:0;height:100%;width:${pct}%;background:linear-gradient(90deg,var(--down),var(--amber),var(--up));border-radius:4px;opacity:0.35;"></div>
          <div style="position:absolute;left:${pct}%;top:-3px;width:3px;height:14px;background:var(--text-0);border-radius:2px;transform:translateX(-50%);"></div>
        </div>
        <div style="font-size:10.5px;color:var(--text-2);margin-top:4px;text-align:center;">Currently ${pct.toFixed(0)}% of the way from 52W low to high (${fromHigh>=0?'+':''}${fromHigh.toFixed(1)}% vs 52W high)</div>`;
    } else {
      gaugeEl.innerHTML = '';
    }
  }
}
function renderEarningsCalendar(earnings, sourceName){
  const box = document.getElementById('fundEarningsBox'), badge = document.getElementById('fundEarningsBadge');
  if(!box) return;
  if(!earnings){
    box.innerHTML = `<div class="notebox">No upcoming earnings date returned for this ticker (Yahoo doesn't always publish one — common for less-covered or non-US tickers).</div>`;
    return;
  }
  const fmt = d => d.toLocaleDateString(undefined,{weekday:'short', year:'numeric', month:'short', day:'numeric'});
  const daysAway = Math.round((earnings.nextDate - new Date())/(1000*60*60*24));
  const rangeStr = earnings.dateRange[0].getTime()!==earnings.dateRange[1].getTime()
    ? `${fmt(earnings.dateRange[0])} – ${fmt(earnings.dateRange[1])}` : fmt(earnings.dateRange[0]);
  box.innerHTML = kv([
    ['Next Earnings Date', rangeStr + (daysAway>=0 ? ` (in ${daysAway} day${daysAway===1?'':'s'})` : ' (recently passed — Yahoo hasn\'t posted the next date yet)')],
    ['EPS Estimate', earnings.epsEstimate!=null ? earnings.epsEstimate.toFixed(2) : '—'],
    ['EPS Estimate Range', (earnings.epsLow!=null && earnings.epsHigh!=null) ? `${earnings.epsLow.toFixed(2)} – ${earnings.epsHigh.toFixed(2)}` : '—'],
    ['Revenue Estimate', earnings.revenueEstimate!=null ? '$'+(earnings.revenueEstimate/1e9).toFixed(2)+'B' : '—'],
  ]) + `<div class="notebox" style="margin-top:6px;">Sourced live from ${sourceName}, same fetch as Key Stats/Ratios above — no separate request needed.</div>`;
  if(badge){ badge.textContent='LIVE'; badge.className='badge fact'; }
}
const fillKeyStatsAndRatios = (y, sourceName) => {
    const pct = v => v==null ? null : v*100; // Yahoo and FMP both return ratios as decimals (1.5 = 150% ROE) — the old 'v>1 means already a %' guess turned a 150% ROE into 1.5%
    if(ksEl){
      ksEl.innerHTML = kv([
        ['P/E (trailing)', y.pe!=null ? (+y.pe).toFixed(1)+'x' : '—'],
        ['P/E (forward)', y.forwardPe!=null ? (+y.forwardPe).toFixed(1)+'x' : '—'],
        ['PEG Ratio', y.pegRatio!=null ? (+y.pegRatio).toFixed(2) : '—'],
        ['Price/Book', y.priceToBook!=null ? (+y.priceToBook).toFixed(2) : '—'],
        ['EPS (trailing)', y.eps!=null ? fmtPrice(+y.eps, y.currency) : '—'],
        ['Market Cap', fmtMarketCapShort(y.marketCap, y.marketCapCurrency || y.currency)],
        ['EV / EBITDA', y.evEbitda!=null ? (+y.evEbitda).toFixed(1)+'x' : '—'],
        ['Price / Sales', y.priceToSales!=null ? (+y.priceToSales).toFixed(2)+'x' : '—'],
        ['Revenue Growth (YoY)', y.revenueGrowth!=null ? (y.revenueGrowth>=0?'+':'')+(y.revenueGrowth*100).toFixed(1)+'%' : '—'],
        ['Dividend Yield', y.dividendYield!=null ? pct(y.dividendYield).toFixed(2)+'%' : '—'],
        ['Beta', y.beta!=null ? (+y.beta).toFixed(2) : '—'],
        ['52-Week Range', (y.fiftyTwoWkLow!=null && y.fiftyTwoWkHigh!=null) ? `${fmtPrice(+y.fiftyTwoWkLow, y.currency)} – ${fmtPrice(+y.fiftyTwoWkHigh, y.currency)}` : '—'],
      ]);
      if(ksBadge){ ksBadge.textContent='LIVE'; ksBadge.className='badge fact'; }
    }
    if(ratiosBox && (y.roe!=null || y.profitMargin!=null || y.grossMargin!=null || y.debtToEquity!=null)){
      let html = '';
      if(y.roe!=null) html += bar('ROE (live)', pct(y.roe), Math.max(100,pct(y.roe)*1.3), 'var(--teal)', pct(y.roe).toFixed(1)+'%');
      if(y.roic!=null) html += bar('ROIC (live)', pct(y.roic), Math.max(50,pct(y.roic)*1.5), 'var(--teal)', pct(y.roic).toFixed(1)+'%');
      if(y.roa!=null) html += bar('ROA (live)', pct(y.roa), Math.max(50,pct(y.roa)*1.5), 'var(--teal)', pct(y.roa).toFixed(1)+'%');
      if(y.grossMargin!=null) html += bar('Gross Margin (live)', Math.round(pct(y.grossMargin)), 100, 'var(--teal)');
      if(y.operatingMargin!=null) html += bar('Operating Margin (live)', Math.round(pct(y.operatingMargin)), 100, 'var(--teal)');
      if(y.profitMargin!=null) html += bar('Net Margin (live)', Math.round(pct(y.profitMargin)), 100, 'var(--teal)');
      if(y.debtToEquity!=null){ const dePct = Math.abs(y.debtToEquity) < 10 ? y.debtToEquity*100 : y.debtToEquity; /* FMP reports 1.5x, Yahoo reports 150 (%) */ html += bar('Debt/Equity (live)', dePct, Math.max(200, dePct*1.2), 'var(--teal)', dePct.toFixed(0)+'%'); }
      html += `<div class="notebox" style="margin-top:6px;">Sourced live from ${sourceName} — not looked up manually.</div>`;
      ratiosBox.innerHTML = html;
      if(ratiosBadge){ ratiosBadge.textContent='LIVE'; ratiosBadge.className='badge fact'; }
    }
    statusParts.push(`<b>Key Stats/Ratios:</b> <span class="badge fact">LIVE</span> via ${sourceName} — ${y.entityName || ticker}`);
    renderEarningsCalendar(y.earnings, sourceName);
    const secForPrice = SECURITIES.find(x=>x.t===ticker);
    renderAnalystRatings(y.analyst, secForPrice ? secForPrice.px : null, y.currency);
    renderDividendInfo(y.dividend, y.currency);
    renderOverviewKeyStats(y, secForPrice ? secForPrice.px : null, y.currency);
    renderTvRecommendation(y.analyst, ticker);
    AppState.fundamentals = {ticker, isLive:true, pe:y.pe, roePct:pct(y.roe), netMarginPct:pct(y.profitMargin), marketCap:y.marketCap, entityName:y.entityName};
    // Write real fetched P/E, ROE, and Market Cap back into this ticker's SECURITIES record so
    // the Screener (which filters SECURITIES directly) reflects it too instead of staying on the
    // initial seeded value forever — same pattern updateLiveQuote() already uses for price. Only
    // overwrites the specific fields that came back real; the Screener disclosure below tells the
    // user which tickers this has happened for.
    const secRec = SECURITIES.find(x=>x.t===ticker);
    if(secRec){
      if(y.pe!=null){ secRec.pe = Math.round(y.pe*10)/10; secRec._peIsLive = true; }
      if(y.roe!=null){ secRec.roe = Math.round(pct(y.roe)*10)/10; secRec._roeIsLive = true; }
      if(y.marketCap!=null){ secRec.mcap = Math.round(y.marketCap/1e9*10)/10; secRec._mcapIsLive = true; } // stored in $B like the rest of the screener
    }
  };

  let fmpSucceeded = false;
  if(getKey('fmp')){
    try{
      const fmp = await fetchFmpFundamentals(ticker);
      if(myToken !== fundFetchToken) return;
      fillKeyStatsAndRatios(fmp, 'Financial Modeling Prep ('+fmp.via+')');
      fmpSucceeded = true;
    }catch(fmpErr){
      if(myToken !== fundFetchToken) return;
      statusParts.push(`<b>Financial Modeling Prep:</b> <span style="color:var(--down)">${escapeHtml(fmpErr.message)}</span> — trying Yahoo instead.`);
    }
  }

  const ySymbol = yahooSymbolFor(ticker);
  let liveY = null;
  if(!fmpSucceeded){
    try{
      liveY = await fetchLiveFundamentals(ticker);
    }catch(tvErr){
      if(myToken !== fundFetchToken) return;
      if(ySymbol && getCustomProxy()){
        try{ liveY = await fetchYahooFundamentals(ticker, ySymbol); liveY.via = 'Yahoo Finance via your proxy'; }
        catch(yErr){ statusParts.push(`<b>Key Stats/Ratios:</b> unavailable — TradingView: ${escapeHtml(tvErr.message)}; Yahoo: ${escapeHtml(yErr.message)}`); }
      } else {
        statusParts.push(`<b>Key Stats/Ratios:</b> unavailable — ${escapeHtml(tvErr.message)}`);
      }
    }
    if(myToken !== fundFetchToken) return;
    if(liveY){
      anyLive = true;
      LIVE_FUNDAMENTALS[ticker] = liveY; delete LIVE_FUNDAMENTALS_ERR[ticker];
      fillKeyStatsAndRatios(liveY, liveY.via);
      if(ticker === currentSecurity){ try{ renderValuationTable(ticker); populateDcfDefaults(ticker); runDcf(); renderScoreChips(); }catch(e){ console.error(e); } }
    } else {
      LIVE_FUNDAMENTALS_ERR[ticker] = 'live fundamentals unreachable right now';
      ['fundKeyStatsBox','fundRatiosBox'].forEach(id=>{ const el=document.getElementById(id); if(el) el.innerHTML = '<div class="notebox">Live fundamentals are unreachable right now — no estimated numbers are shown in their place.</div>'; });
      ['fundKeyStatsBadge','fundRatiosBadge'].forEach(id=>{ const b=document.getElementById(id); if(b){ b.textContent='UNAVAILABLE'; b.className='badge assume'; } });
      renderTvRecommendation(null, ticker);
      if(ticker === currentSecurity){ try{ renderValuationTable(ticker); populateDcfDefaults(ticker); renderScoreChips(); }catch(e){ console.error(e); } }
    }
  }
  if(fmpSucceeded || liveY){
    // live key stats already rendered above
  } else if(false){
    statusParts.push(`<b>Key Stats/Ratios:</b> SAMPLE — ${ticker}'s exchange isn't mapped to a Yahoo Finance symbol yet${getKey('fmp')?' and FMP had no data either':' (add a free FMP key in Settings for broader coverage)'}.`);
  }

  // REAL BUG FIXED HERE: renderEarningsCalendar() — the only thing that ever fills in
  // #fundEarningsBox — is called exclusively from inside fillKeyStatsAndRatios(), which itself
  // only runs if FMP or Yahoo actually succeeded above. If BOTH fail (or there's no Yahoo symbol
  // mapping and no FMP key), fillKeyStatsAndRatios() never runs at all, and the box — which starts
  // as a hardcoded "Loading…" placeholder in the HTML — was left stuck on "Loading…" forever, with
  // no error, no fallback, nothing. Found via an automated check for exactly this failure class
  // (elements still showing "Loading…" after every async chain in the app has had time to settle)
  // rather than by inspection — this is the kind of bug that's invisible in a code read-through
  // but very visible to an actual user staring at a spinner that never resolves.
  if(!fmpSucceeded && !anyLive){
    const box = document.getElementById('fundEarningsBox'), badge = document.getElementById('fundEarningsBadge');
    if(box){ box.innerHTML = `<div class="notebox">No earnings calendar available — Key Stats/Ratios above already explains why (no live source reached for this ticker).</div>`; }
    if(badge){ badge.textContent = 'SAMPLE'; badge.className = 'badge assume'; }
  }

  const tvStatementsOk = !!(liveY && renderTvStatements(liveY));
  if(tvStatementsOk) statusParts.push(`<b>Financial statements:</b> <span class="badge fact">LIVE</span> ${liveY.statements.years.length} reported fiscal years via TradingView (in ${escapeHtml(liveY.statements.currency||liveY.currency)}).`);
  if(!getCustomProxy()){
    if(!tvStatementsOk) renderStatementsUnavailable(ticker, liveY ? 'TradingView publishes no statement history for it' : 'live sources unreachable right now');
    if(liveY) statusParts.unshift(`<b>Source:</b> <span class="badge fact">LIVE</span> ${escapeHtml(liveY.via)} — keyless, fetched directly by your browser.`);
    statusEl.innerHTML = statusParts.join('<br>');
    renderInsiderTrading(ticker);
    return;
  }
  const tableEl = document.getElementById('fundIncomeTable');
  const badgeEl = document.getElementById('fundIncomeBadge');
  statusParts.push(`Checking SEC EDGAR (data.sec.gov) for ${ticker}'s real filed financials…`);
  statusEl.innerHTML = statusParts.join('<br>');
  try{
    const f = await fetchSecFundamentals(ticker);
    if(myToken !== fundFetchToken) return; // a newer security was selected meanwhile
    // Build a proper multi-year table (up to 10 real fiscal years now, not hardcoded to 2) by
    // merging Revenue/Net Income/EPS on their actual fiscal-year-end dates — the three tags don't
    // always have identical year coverage in XBRL, so this aligns by year rather than assuming
    // they're always the same length/order.
    const yearOf = u => u.end.slice(0,4);
    const allYears = Array.from(new Set([...f.revenue.map(yearOf), ...f.netIncome.map(yearOf), ...f.eps.map(yearOf)])).sort();
    if(!allYears.length) throw new Error('No usable annual facts in response');
    const byYear = (arr) => { const m={}; arr.forEach(u=>{ m[yearOf(u)] = u.val; }); return m; };
    const revByYr = byYear(f.revenue), niByYr = byYear(f.netIncome), epsByYr = byYear(f.eps);
    const rows = [
      ['Revenue', ...allYears.map(y => revByYr[y]!=null ? fmtUsdMn(revByYr[y]) : '—')],
      ['Net Income', ...allYears.map(y => niByYr[y]!=null ? fmtUsdMn(niByYr[y]) : '—')],
      ['EPS (diluted)', ...allYears.map(y => epsByYr[y]!=null ? epsByYr[y] : '—')],
    ].filter(r => r.slice(1).some(v => v !== '—'));
    if(!rows.length) throw new Error('No usable annual facts in response');
    tableEl.innerHTML = table(['Metric', ...allYears], rows);
    badgeEl.textContent = 'LIVE'; badgeEl.className = 'badge fact';
    statusParts[statusParts.length-1] = `<b>Income Statement:</b> <span class="badge fact">LIVE</span> via SEC EDGAR XBRL Company Facts (official, free, keyless — via ${f.via}) — ${allYears.length} real filed fiscal year(s) (${allYears[0]}–${allYears[allYears.length-1]}), deduplicated against restated/re-filed comparatives.`;

    // Balance Sheet — real filed Assets/Liabilities/Equity/Cash from the same companyfacts
    // response, aligned by fiscal-year-end the same way as the Income Statement above.
    const balTableEl = document.querySelector('#fundBalanceTable');
    const balBadgeEl = balTableEl ? balTableEl.closest('.card')?.querySelector('h3 .badge') : null;
    const assetsByYr = byYear(f.assets||[]), liabByYr = byYear(f.liabilities||[]), equityByYr = byYear(f.equity||[]), cashByYr = byYear(f.cash||[]);
    const balYears = Array.from(new Set([...Object.keys(assetsByYr), ...Object.keys(liabByYr), ...Object.keys(equityByYr), ...Object.keys(cashByYr)])).sort();
    if(balTableEl && balYears.length){
      const balRows = [
        ['Total Assets', ...balYears.map(y=>assetsByYr[y]!=null?fmtUsdMn(assetsByYr[y]):'—')],
        ['Total Liabilities', ...balYears.map(y=>liabByYr[y]!=null?fmtUsdMn(liabByYr[y]):'—')],
        ['Stockholders\' Equity', ...balYears.map(y=>equityByYr[y]!=null?fmtUsdMn(equityByYr[y]):'—')],
        ['Cash & Equivalents', ...balYears.map(y=>cashByYr[y]!=null?fmtUsdMn(cashByYr[y]):'—')],
      ].filter(r=>r.slice(1).some(v=>v!=='—'));
      if(balRows.length){
        balTableEl.innerHTML = table(['Metric', ...balYears], balRows);
        if(balBadgeEl){ balBadgeEl.textContent='LIVE'; balBadgeEl.className='badge fact'; }
      }
    }

    // Cash Flow — real filed Operating Cash Flow and CapEx, with FCF derived as OCF − CapEx
    // (a standard, disclosed definition, not a separately-filed XBRL line item).
    const cfBoxEl = document.querySelector('#fundCashflowBox');
    const cfBadgeEl = cfBoxEl ? cfBoxEl.closest('.card')?.querySelector('h3 .badge') : null;
    const ocfByYr = byYear(f.opCashFlow||[]), capexByYr = byYear(f.capex||[]);
    const cfYears = Array.from(new Set([...Object.keys(ocfByYr), ...Object.keys(capexByYr)])).sort();
    let latestFcf = null, latestFcfYear = null;
    if(cfBoxEl && cfYears.length){
      const lastCfYr = cfYears[cfYears.length-1];
      const ocfLast = ocfByYr[lastCfYr], capexLast = capexByYr[lastCfYr];
      if(ocfLast!=null && capexLast!=null){ latestFcf = ocfLast - Math.abs(capexLast); latestFcfYear = lastCfYr; }
      cfBoxEl.innerHTML = kv([
        [`Operating Cash Flow (FY${lastCfYr})`, ocfLast!=null?fmtUsdMn(ocfLast):'—'],
        [`CapEx (FY${lastCfYr})`, capexLast!=null?fmtUsdMn(Math.abs(capexLast)):'—'],
        [`Free Cash Flow (FY${lastCfYr})`, latestFcf!=null?fmtUsdMn(latestFcf):'—'],
      ]) + `<div class="notebox" style="margin-top:6px;">FCF = Operating Cash Flow − CapEx, both real filed SEC EDGAR XBRL figures (not a separately reported line item).</div>`;
      if(cfBadgeEl){ cfBadgeEl.textContent='LIVE'; cfBadgeEl.className='badge fact'; }
    }

    statusEl.innerHTML = statusParts.join('<br>');
    const lastYr = allYears[allYears.length-1];
    AppState.fundamentals = {...AppState.fundamentals, revenue: revByYr[lastYr]??AppState.fundamentals?.revenue, netIncome: niByYr[lastYr]??AppState.fundamentals?.netIncome, entityName: f.entityName||AppState.fundamentals?.entityName, yearsAvailable: allYears, fcf0: latestFcf, fcfYear: latestFcfYear, sharesOutLatest: f.sharesOut&&f.sharesOut.length?f.sharesOut[f.sharesOut.length-1].val:null};

    // DCF FCF₀ auto-populate — was previously always a manually-typed sample number with a note
    // saying this was "a planned enhancement." Now, if real SEC cash-flow data reached this
    // ticker, the DCF calculator's inputs are pre-filled from it (still fully editable) and
    // re-run automatically so the displayed valuation matches the live inputs.
    if(latestFcf!=null && document.getElementById('dcfFcf0')){
      const fcf0El = document.getElementById('dcfFcf0'), sharesEl = document.getElementById('dcfShares');
      fcf0El.value = Math.round(latestFcf/1e6); // XBRL USD values are raw dollars; DCF input is in $mn
      if(f.sharesOut && f.sharesOut.length) sharesEl.value = Math.round(f.sharesOut[f.sharesOut.length-1].val/1e6);
      const dcfNoteEl = fcf0El.closest('.card')?.querySelector('.notebox');
      if(dcfNoteEl) dcfNoteEl.innerHTML = `FCF₀ and Shares Outstanding auto-populated from real SEC EDGAR filed cash-flow data (FY${latestFcfYear}) — still editable. The calculation itself is a real, tested formula (see Tests tab).`;
      if(typeof runDcf === 'function') runDcf();
    }
    renderInsiderTrading(ticker); // independent fetch chain — never blocks or gets blocked by the statements above
  }catch(err){
    if(myToken !== fundFetchToken) return;
    if(!tvStatementsOk){ badgeEl.textContent = 'UNAVAILABLE'; badgeEl.className = 'badge assume'; }
    const isCikMiss = /No CIK found/.test(err.message);
    statusParts[statusParts.length-1] = isCikMiss
      ? `<b>Income Statement:</b> SAMPLE — ${escapeHtml(err.message)}. SEC EDGAR only covers US-listed registrants; if ${ticker} trades on a non-US exchange this is a real scope limit, not a bug.`
      : `<b>Income Statement:</b> SAMPLE (fallback) — <span style="color:var(--down)">SEC EDGAR unreachable: ${escapeHtml(err.message)}</span> (data.sec.gov doesn't support browser CORS, so this needs your proxy worker — Settings → Data Sources — to go live).`;
    statusEl.innerHTML = statusParts.join('<br>');
    renderInsiderTrading(ticker); // still attempt this independent fetch chain even if the income statement fetch above failed
  }
}
