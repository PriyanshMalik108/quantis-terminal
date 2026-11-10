/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/features/macro.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Macro view.
 * DEPENDS   data/*
 * EXPOSES   renderMacroDashboard (global — classic script, shared scope)
 * LOAD      Classic <script>, order defined in js/manifest.json. Top-level code runs at load,
 *           so it may only call functions from files listed EARLIER in the manifest.
 * NOTE      Migrated verbatim from the single-file build; inline comments marked
 *           "REAL BUG FIXED" / "post-launch fix" document past defects — keep them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* ===================== MACRO DASHBOARD — now real ===================== */
/* Was 8 hardcoded numbers with a note saying "not wired to a live source yet." Two real, free
   sources power it now, neither needing a paid plan: (1) FRED (Federal Reserve Economic Data) —
   free registration (same "bring your own key" pattern as the LLM keys above), gives real US
   10Y yield/CPI/GDP/unemployment straight from the source the financial press itself quotes;
   (2) Yahoo Finance — already used everywhere else in this app, no key needed, gives real
   VIX/Gold/Brent/DXY via the same fetchYahooHistory() chain. If no FRED key is configured, the
   four FRED-backed cards stay disclosed sample while the four Yahoo-backed cards go live anyway
   — partial live is reported accurately, not held back until every card can be live at once. */
/* ---------- Macro: official statistics, keyless ----------
   CPI and unemployment come straight from the U.S. Bureau of Labor Statistics API, real GDP
   growth (BEA) and the effective Fed funds rate (Federal Reserve H.15) from DBnomics, and the
   10-year yield, Brent, DXY, VIX and gold from CNBC's live quote service. FRED (which needs a key
   AND blocks browser CORS) is no longer required for any of it. */
async function fetchMacroOfficialLive(){
  const [cpi, unrate, gdp, ff] = await Promise.allSettled([
    LD.bls('CUUR0000SA0'), LD.bls('LNS14000000'),
    LD.dbnomics('BEA/NIPA-T10101/A191RL-Q'), LD.dbnomics('FED/H15/RIFSPFF_N.B'),
  ]);
  const out = {};
  if(cpi.status==='fulfilled'){
    const d = cpi.value.data; const latest = d[0];
    const [y,m] = latest.period.split('-');
    const yearAgo = d.find(x=>x.period === `${+y-1}-${m}`);
    if(yearAgo) out.cpi = {yoy: (latest.value/yearAgo.value-1)*100, label: latest.label, index: latest.value};
  }
  if(unrate.status==='fulfilled'){ const d = unrate.value.data; out.unrate = {value: d[0].value, label: d[0].label, prev: d[1]?.value}; }
  if(gdp.status==='fulfilled'){ const d = gdp.value.data; const last = d[d.length-1]; out.gdp = {value: last.value, label: last.period, prev: d[d.length-2]?.value}; }
  if(ff.status==='fulfilled'){ const d = ff.value.data; const last = d[d.length-1]; out.fedFunds = {value: last.value, label: last.period}; }
  out.errors = [cpi,unrate,gdp,ff].filter(x=>x.status==='rejected').map(x=>x.reason && x.reason.message);
  return out;
}
let calendarRenderToken = 0;
async function renderEconomicCalendar(macro){
  const myToken = ++calendarRenderToken;
  const box = document.getElementById('econCalendarBox'), badge = document.getElementById('econCalendarBadge');
  if(!box) return;
  const rows = [];
  if(macro){
    if(macro.cpi) rows.push([escapeHtml(macro.cpi.label), 'US CPI (all items, NSA) — BLS', `${macro.cpi.yoy.toFixed(1)}% YoY`]);
    if(macro.unrate) rows.push([escapeHtml(macro.unrate.label), 'US unemployment rate — BLS', `${macro.unrate.value.toFixed(1)}%${macro.unrate.prev!=null?` (prior ${macro.unrate.prev.toFixed(1)}%)`:''}`]);
    if(macro.gdp) rows.push([escapeHtml(macro.gdp.label), 'US real GDP, q/q annualised — BEA', `${macro.gdp.value.toFixed(1)}%`]);
    if(macro.fedFunds) rows.push([escapeHtml(macro.fedFunds.label), 'Effective Fed funds rate — Federal Reserve H.15', `${macro.fedFunds.value.toFixed(2)}%`]);
  }
  // upcoming earnings for the active watchlist + portfolio, from TradingView
  const tvSyms = [...new Set([...activeWatchlist(), ...PORTFOLIO_HOLDINGS.map(h=>h.t)])].map(t=>[t, LD.tvSymbol(t)]).filter(x=>x[1] && !/^(TVC|SP|DJ):/.test(x[1]));
  let earn = [];
  try{
    if(tvSyms.length){
      const {rows: er} = await LD.tvScan('global', {symbols:{tickers:tvSyms.map(x=>x[1])}, columns:['earnings_release_next_date','earnings_per_share_forecast_next_fq','description']});
      const now = Date.now()/1000;
      earn = er.filter(r=>r.earnings_release_next_date && r.earnings_release_next_date > now-86400 && r.earnings_release_next_date < now+60*86400)
        .sort((a,b)=>a.earnings_release_next_date-b.earnings_release_next_date)
        .map(r=>{ const d = new Date(r.earnings_release_next_date*1000); const days = Math.round((d-Date.now())/864e5);
          return [d.toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}), `${escapeHtml(r.description||r._s)} earnings`, days<=0?'today':days===1?'tomorrow':`in ${days} days`]; });
    }
  }catch(e){ /* earnings list is optional */ }
  if(myToken !== calendarRenderToken) return;
  if(!rows.length && !earn.length){
    box.innerHTML = `<div class="notebox">Official statistics and earnings dates couldn't be reached right now.</div>`;
    if(badge){ badge.textContent='UNAVAILABLE'; badge.className='badge assume'; }
    return;
  }
  box.innerHTML = (rows.length ? `<div style="font-size:10.5px;color:var(--text-2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Latest official releases</div>` + table(['Period','Release','Value'], rows) : '')
    + (earn.length ? `<div style="font-size:10.5px;color:var(--text-2);text-transform:uppercase;letter-spacing:.5px;margin:10px 0 4px;">Upcoming earnings — your watchlist &amp; portfolio</div>` + table(['Date','Event','When'], earn) : (tvSyms.length ? `<div class="notebox" style="margin-top:8px;">No earnings scheduled in the next 60 days for your watchlist and portfolio companies.</div>` : ''))
    + `<div class="notebox" style="margin-top:6px;">Released values come straight from the BLS API, DBnomics (BEA, Federal Reserve) and TradingView earnings dates — nothing here is estimated.</div>`;
  if(badge){ badge.textContent='LIVE'; badge.className='badge fact'; }
}
let macroRenderToken = 0;
async function renderMacroDashboard(){
  const myToken = ++macroRenderToken;
  const wbSel = document.getElementById('wbCountrySelect');
  if(wbSel && !wbSel.dataset.populated){
    wbSel.innerHTML = WORLD_BANK_COUNTRIES.map(c=>`<option value="${c.code}">${c.name}</option>`).join('');
    wbSel.dataset.populated = '1';
  }
  renderWorldBankPanel();
  renderCftcPanel();
  const setCard = (id, text, isLive, sub, title)=>{
    const el = document.getElementById(id), badge = document.getElementById(id+'Badge'), subEl = document.getElementById(id+'Sub');
    if(el) el.textContent = text;
    if(subEl) subEl.textContent = sub || '';
    if(badge){ badge.textContent = isLive?'LIVE':'UNAVAILABLE'; badge.className = isLive?'badge fact':'badge assume'; badge.title = title||''; }
  };
  const errs = [];
  const quotesP = LD.quotes(['US10Y','@LCO.1','.DXY','.VIX','@GC.1']).catch(e=>{ errs.push('CNBC: '+e.message); return {}; });
  const officialP = cachedFetch('macro_official_v2', 3*60*60*1000, fetchMacroOfficialLive).catch(e=>{ errs.push(e.message); return null; });
  const [q, macro] = await Promise.all([quotesP, officialP]);
  if(myToken !== macroRenderToken) return;
  const qc = (sym, id, fmt, label)=>{
    const x = q[sym];
    if(x){ setCard(id, fmt(x.last), true, `${x.chgPct!=null?(x.chgPct>=0?'+':'')+x.chgPct.toFixed(2)+'% today':''}${label?' · '+label:''}`, 'CNBC live quote'); }
    else setCard(id, '—', false, 'unavailable');
  };
  qc('US10Y','macroDgs10', v=>v.toFixed(3)+'%', 'US Treasury 10Y');
  qc('@LCO.1','macroBrent', v=>'$'+v.toFixed(2), 'front-month ICE');
  qc('.DXY','macroDxy', v=>v.toFixed(2), 'ICE US Dollar Index');
  qc('.VIX','macroVix', v=>v.toFixed(2), 'CBOE');
  qc('@GC.1','macroGold', v=>'$'+v.toLocaleString(undefined,{maximumFractionDigits:1}), 'COMEX /oz');
  if(macro && macro.cpi) setCard('macroCpi', macro.cpi.yoy.toFixed(1)+'%', true, macro.cpi.label+' · BLS', 'U.S. Bureau of Labor Statistics'); else setCard('macroCpi','—',false,'unavailable');
  if(macro && macro.gdp) setCard('macroGdp', macro.gdp.value.toFixed(1)+'%', true, macro.gdp.label+' · q/q annualised · BEA', 'BEA via DBnomics'); else setCard('macroGdp','—',false,'unavailable');
  if(macro && macro.unrate) setCard('macroUnrate', macro.unrate.value.toFixed(1)+'%', true, macro.unrate.label+' · BLS', 'U.S. Bureau of Labor Statistics'); else setCard('macroUnrate','—',false,'unavailable');
  renderEconomicCalendar(macro);
  const noteEl = document.getElementById('macroNote');
  if(noteEl){
    const allErrs = [...errs, ...((macro && macro.errors) || [])].filter(Boolean);
    noteEl.innerHTML = `CPI and unemployment: U.S. Bureau of Labor Statistics API. GDP: BEA via DBnomics. Fed funds: Federal Reserve H.15 via DBnomics. 10Y yield, Brent, DXY, VIX, gold: CNBC live quotes. All keyless and fetched directly by your browser.`
      + (allErrs.length ? ` <span style="color:var(--down)">Some sources were unreachable: ${escapeHtml(allErrs.join(' · '))}</span>` : '');
  }
}

async function renderFearGreedIndex(boxId, badgeId){
  const box = document.getElementById(boxId), badge = document.getElementById(badgeId);
  if(!box) return;
  try{
    const fg = await fetchFearGreed();
    const color = fg.value>=75?'var(--up)':fg.value>=55?'#a3d977':fg.value>=45?'var(--amber)':fg.value>=25?'#f87171':'var(--down)';
    box.innerHTML = `<div style="display:flex;align-items:center;gap:16px;">
        <div style="font-family:var(--mono);font-size:38px;font-weight:800;color:${color};">${fg.value}</div>
        <div><div style="font-weight:700;color:${color};font-size:14px;">${fg.classification}</div><div style="font-size:10.5px;color:var(--text-2);">as of ${new Date(fg.timestamp).toLocaleDateString()}</div></div>
      </div>
      <div style="height:6px;border-radius:3px;background:linear-gradient(90deg,var(--down),var(--amber),var(--up));margin-top:10px;position:relative;">
        <div style="position:absolute;top:-3px;left:calc(${fg.value}% - 6px);width:12px;height:12px;border-radius:50%;background:#fff;border:2px solid ${color};"></div>
      </div>
      <div class="notebox" style="margin-top:10px;">0 = Extreme Fear, 100 = Extreme Greed. Sourced live from alternative.me's free public API (via ${fg.via}), refreshed at most once every 30 minutes since the underlying index itself only updates daily.</div>`;
    if(badge){ badge.textContent = 'LIVE via '+fg.via; badge.className = 'badge fact'; }
  }catch(e){
    box.innerHTML = `<div class="notebox">Couldn't fetch the Fear &amp; Greed Index right now (${escapeHtml(e.message)}).</div>`;
    if(badge){ badge.textContent = 'unavailable'; badge.className = 'badge assume'; }
  }
}
/* Real ADF / Jarque-Bera / Ljung-Box / ARCH-LM hypothesis tests — this panel used to say these
   "require critical-value tables and iterative estimation beyond summary statistics — not
   implemented in this build." All four are now implemented (OLS-based ADF and ARCH-LM, exact
   chi-sq(2) Jarque-Bera, chi-sq(h) Ljung-Box) in the Formula Engine above and wired in here. */
function renderQuantTests(returns){
  if(returns.length < 30){
    return `<div class="notebox">Need at least 30 observations to run the formal tests below reliably (have ${returns.length}).</div>`;
  }
  const adf = Formulas.adfTest(returns);
  const jb = Formulas.jarqueBeraTest(returns);
  const lb = Formulas.ljungBoxTest(returns, Math.min(10, Math.floor(returns.length/5)));
  const arch = Formulas.archTest(returns, Math.min(5, Math.floor(returns.length/10)));
  const rows = [
    ['ADF (stationarity)', adf ? `t = ${adf.tstat.toFixed(2)} — ${adf.stationary5pct?'stationary':'unit root not rejected'} at 5% (crit. ${adf.criticalValues['5%']})` : 'Not enough data'],
    ['Jarque-Bera (normality)', jb ? `JB = ${jb.jb.toFixed(2)}, p ${jb.pValue<0.0001?'< 0.0001':'= '+jb.pValue.toFixed(4)} — ${jb.normal5pct?'normal':'reject normality'} at 5%` : 'Not enough data'],
    ['Ljung-Box (autocorr, h='+(lb?lb.h:'—')+')', lb ? `Q = ${lb.q.toFixed(2)}, p ${lb.pValue<0.0001?'< 0.0001':'= '+lb.pValue.toFixed(4)} — ${lb.noAutocorr5pct?'no autocorrelation':'autocorrelation present'} at 5%` : 'Not enough data'],
    ['ARCH effects (q='+(arch?arch.q:'—')+')', arch ? `LM = ${arch.stat.toFixed(2)}, p ${arch.pValue<0.0001?'< 0.0001':'= '+arch.pValue.toFixed(4)} — ${arch.noArchEffect5pct?'no ARCH effect':'volatility clustering present'} at 5%` : 'Not enough data'],
  ];
  return `<div class="notebox">Real hypothesis tests computed from the price series' actual return distribution — ADF and ARCH-LM via OLS regression (Formula Engine), Jarque-Bera via the exact chi-sq(2) CDF, Ljung-Box via chi-sq(h) (Wilson-Hilferty approximation for the p-value). Verdicts are at the 5% significance level, not investment advice.</div>` + kv(rows);
}
