/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/features/dashboard.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Home dashboard: indices, breadth, regime, sectors, movers, AI market summary.
 * DEPENDS   data/live-data.js
 * EXPOSES   renderDashboard(), refreshDashWatch() (global — classic script, shared scope)
 * LOAD      Classic <script>, order defined in js/manifest.json. Top-level code runs at load,
 *           so it may only call functions from files listed EARLIER in the manifest.
 * NOTE      Migrated verbatim from the single-file build; inline comments marked
 *           "REAL BUG FIXED" / "post-launch fix" document past defects — keep them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* ===================== DASHBOARD ===================== */
/* renderDashboard() previously set the index strip, sector heatmap, and breadth stats from
   fully static hardcoded arrays — numbers that never changed, disconnected from every other
   real number in the app. Split into a synchronous part (renders instantly using data already
   in memory) and an async part (renderDashboardLiveIndices) that fetches real current index
   levels the same way every other live security already does — no new data source, just
   actually using the one already built for this. */
/* Was a hardcoded "WEAK BULL" label with a note explicitly saying real regime detection via ADX
   "is a planned enhancement, not yet computed" — that note went stale the moment real ADX was
   built earlier this session for the Technicals tab; it just was never wired to THIS specific
   dashboard card. Fixed by actually using it here: real ADX(14) + 50-day trend position on the
   S&P 500's real daily OHLC series (same Yahoo fetch already proven for the index strip above),
   with a genuine, disclosed methodology rather than a fabricated label. */
async function renderMarketRegime(){
  const labelEl = document.getElementById('regimeLabel'), noteEl = document.getElementById('regimeNote'), badgeEl = document.getElementById('regimeBadge');
  if(!labelEl) return;
  try{
    const rt = (document.getElementById('regimeIdx')||{}).value || 'SPX';
    const rname = (SECURITY_UNIVERSE.find(x=>x.t===rt)||{n:rt}).n;
    const hist = await fetchYahooHistory(rt, yahooSymbolFor(rt));
    const closes = hist.data;
    if(closes.length < 60) throw new Error('not enough history returned');
    const highs = hist.ohlc?.high || closes, lows = hist.ohlc?.low || closes;
    const adx14 = Formulas.adx(highs, lows, closes, 14);
    const sma50 = Formulas.sma(closes, 50);
    const last = closes[closes.length-1];
    const trending = adx14!=null && adx14 > 25;
    const bullish = sma50!=null && last > sma50;
    let regime, color;
    if(adx14==null || sma50==null){ regime='INSUFFICIENT DATA'; color='var(--text-2)'; }
    else if(trending && bullish){ regime='TRENDING BULL'; color='var(--up)'; }
    else if(trending && !bullish){ regime='TRENDING BEAR'; color='var(--down)'; }
    else if(adx14 <= 20){ regime='RANGE-BOUND / CHOPPY'; color='var(--amber)'; }
    else{ regime = bullish ? 'WEAK BULL' : 'WEAK BEAR'; color='var(--amber)'; }
    labelEl.textContent = regime; labelEl.style.color = color;
    noteEl.innerHTML = `${escapeHtml(rname)}: ADX(14) = ${adx14!=null?adx14.toFixed(1):'—'} (${adx14>25?'trending':adx14<=20?'range-bound':'weak trend'}), price ${bullish?'above':'below'} its 50-day SMA. ADX&gt;25 = trending; &le;20 = range-bound; between = weak trend. This is a real, documented, rule-based classification — not a machine-learned regime model.`;
    if(badgeEl){ badgeEl.textContent='LIVE'; badgeEl.className='badge fact'; }
  }catch(e){
    labelEl.textContent = 'UNAVAILABLE'; labelEl.style.color='var(--text-2)';
    noteEl.innerHTML = `Needs the index's live daily series (ADX + 50-day trend), which is unreachable right now — ${escapeHtml(e.message)}. A regime label is not guessed without data.`;
  }
}
async function renderDashboardLiveIndices(){
  const tickers = ['SPX','DJI','NDX','NIFTY50','SENSEX'];
  let quotes = {};
  try{ quotes = await LD.quotes(tickers.map(t=>LD.cnbcSymbol(t))); }catch(e){ quotes = {}; }
  let failures = 0;
  await Promise.all(tickers.map(async t=>{
    const s = SECURITIES.find(x=>x.t===t);
    const el = document.getElementById('idxcard-'+t);
    if(!el) return;
    let last=null, chgPct=null, src='';
    const q = quotes[LD.cnbcSymbol(t)];
    if(q){ last = q.last; chgPct = q.chgPct; src = 'live quote'; }
    else{
      try{ const h = await fetchYahooHistory(t, yahooSymbolFor(t)); last = h.lastClose; chgPct = (h.lastClose/h.prevClose-1)*100; src = 'last close'; }catch(e){}
    }
    if(last!=null){
      if(s){ s.px = last; if(chgPct!=null){ s.chgPct = chgPct; s.chg = last - last/(1+chgPct/100); } s._pxLive = true; }
      el.innerHTML = `<div class="nm">${escapeHtml(s?s.n:t)} <span class="badge fact" style="font-size:8px;padding:1px 4px;" title="CNBC ${src}">LIVE</span></div><div class="px">${last.toLocaleString(undefined,{maximumFractionDigits:2})}<div class="${(chgPct||0)>=0?'up':'down'}" style="font-size:11px;">${chgPct!=null?((chgPct>=0?'+':'')+chgPct.toFixed(2)+'%'):''}</div></div>`;
    }else{
      failures++;
      el.innerHTML = s ? `<div class="nm">${escapeHtml(s.n)} <span class="badge assume" style="font-size:8px;padding:1px 4px;">SAMPLE</span></div><div class="px">${s.px.toLocaleString(undefined,{maximumFractionDigits:2})}<div class="${s.chgPct>=0?'up':'down'}" style="font-size:11px;">${s.chgPct>=0?'+':''}${s.chgPct.toFixed(2)}%</div></div>` : `<div class="nm">${t}</div><div class="px" style="font-size:11px;color:var(--text-2);">unavailable</div>`;
    }
  }));
  const hint = document.getElementById('liveHint');
  if(hint) hint.style.display = failures===tickers.length ? 'flex' : 'none';
}
/* Real alert conditions checked against the currently loaded watchlist/universe, replacing a
   fully hardcoded "AAPL crossed above $225" line that never corresponded to reality. */
function renderDashAlerts(){
  // Shows the user's own alerts (with their real current status) first, then big movers — the card
  // used to be titled "Recent Alerts" while never showing a single alert the user created.
  let html = '';
  if(typeof ALERTS !== 'undefined' && ALERTS.length){
    html += kv(ALERTS.slice(0,4).map(a=>{ const st = evaluateAlert(a); return [`${escapeHtml(a.sec)} · ${escapeHtml(a.cond)} ${escapeHtml(String(a.val))}`, st==='Triggered'?'<span class="down" style="font-weight:700">Triggered</span>':'<span class="up">Active</span>']; }));
  }
  const movers = SECURITIES.filter(s=>activeWatchlist().includes(s.t) && Math.abs(s.chgPct||0)>=1).slice(0,4);
  if(movers.length) html += `<div style="font-size:10px;color:var(--text-2);text-transform:uppercase;letter-spacing:.5px;margin:10px 0 2px;">Watchlist moves ≥1%</div>` + kv(movers.map(s=>[s.t, `<span class="${s.chgPct>=0?'up':'down'}">${s.chgPct>=0?'+':''}${s.chgPct.toFixed(2)}%</span>`]));
  return html || '<div class="notebox">No alerts yet and no large moves in your watchlist. Create alerts in the Alerts view.</div>';
}
function renderDashAlertsLegacy(){
  const watchTickers = activeWatchlist();
  const candidates = SECURITIES.filter(s=>watchTickers.includes(s.t) || Math.abs(s.chgPct||0)>2).slice(0,6);
  if(!candidates.length) return '<div class="notebox">No large intraday moves in your watchlist right now.</div>';
  return kv(candidates.map(s=>[s.t, `${s.chgPct>=0?'+':''}${s.chgPct.toFixed(2)}% intraday`]))
    + '<div class="notebox" style="margin-top:6px;">Real threshold check (>2% move) against securities currently in this build\'s universe — not a live streaming alert feed.</div>';
}
/* Market Hours — pure client-side, no API needed at all: exchange open/close/lunch-break times
   are public, static facts, and Intl.DateTimeFormat with each exchange's IANA timezone handles
   DST correctly without any manual UTC-offset arithmetic (a common source of off-by-one-hour
   bugs around DST transitions). Does NOT account for exchange holidays (a real, disclosed
   limitation — a holiday calendar would need its own data source) so "Open" here means
   "within regular trading hours on a weekday," not "definitely trading today." */
const EXCHANGE_HOURS = [
  {name:'NYSE / NASDAQ', tz:'America/New_York', open:[9,30], close:[16,0], country:'US'},
  {name:'London (LSE)', tz:'Europe/London', open:[8,0], close:[16,30], country:'GB'},
  {name:'Tokyo (JPX)', tz:'Asia/Tokyo', open:[9,0], close:[15,0], lunchStart:[11,30], lunchEnd:[12,30], country:'JP'},
  {name:'Hong Kong (HKEX)', tz:'Asia/Hong_Kong', open:[9,30], close:[16,0], lunchStart:[12,0], lunchEnd:[13,0], country:'HK'},
  {name:'India (NSE/BSE)', tz:'Asia/Kolkata', open:[9,15], close:[15,30], country:'IN'},
];
/* Public holiday awareness — Nager.Date is free, keyless, and CORS-open (a widely used public
   holidays API). Was previously disclosed as a real limitation ("doesn't account for exchange
   holidays"); now genuinely closes that gap for national holidays. Real caveat that stays
   disclosed: this covers NATIONAL public holidays, not exchange-specific closures that aren't
   government holidays (rare ad-hoc closures, half-days) — Nager.Date has no such data source. */
const EXCHANGE_HOLIDAYS = {}; // countryCode -> {'YYYY-MM-DD': holidayName}
let exchangeHolidaysLoaded = false, exchangeHolidaysFailed = false, exchangeHolidaysNoFeed = [];
/* REAL BUG FIXED HERE: same cachedFetch object-spread issue as getFxRateToUsd above, different
   shape — this fetchFn returned a bare ARRAY (Nager.Date's response format), and spreading an
   array with {...array} produces a plain object with numeric-string keys ({0:.., 1:.., ...}),
   NOT an actual Array. The caller's list.forEach(...) then threw "not a function" on every
   single call, silently caught by loadExchangeHolidays()'s try/catch — meaning public-holiday
   awareness for Market Hours has been completely non-functional (always failing over to "not
   accounted for") since it was built, with no visible error. Wrapped in {list, via} to match
   cachedFetch's expected object-shape convention, same fix pattern as the FX bug above. */
async function fetchPublicHolidaysLive(countryCode, year){
  const url = `https://date.nager.at/api/v3/PublicHolidays/${year}/${countryCode}`;
  const res = await fetchWithTimeout(url, {mode:'cors'}, 10000);
  if(!res.ok) throw new Error('HTTP '+res.status);
  const txt = await res.text();
  const list = txt.trim() ? JSON.parse(txt) : [];   // 204 / empty = Nager.Date has no calendar for that country
  return {list: Array.isArray(list) ? list : [], via: 'Nager.Date', empty: !txt.trim()};
}
async function fetchPublicHolidays(countryCode, year){
  const result = await cachedFetch('holidays_'+countryCode+'_'+year, 7*24*60*60*1000, ()=>fetchPublicHolidaysLive(countryCode, year));
  return result.list;
}
async function loadExchangeHolidays(){
  const year = new Date().getFullYear();
  const codes = [...new Set(EXCHANGE_HOURS.map(ex=>ex.country))];
  const results = await Promise.all(codes.map(async code=>{
    try{
      const list = await fetchPublicHolidays(code, year);
      const map = {}; list.forEach(h=>{ map[h.date] = h.localName || h.name; });
      return {code, map, ok:true, empty: !list.length};
    }catch(e){ return {code, ok:false}; }
  }));
  results.forEach(r=>{ if(r.ok) EXCHANGE_HOLIDAYS[r.code] = r.map; });
  exchangeHolidaysLoaded = results.some(r=>r.ok);
  exchangeHolidaysFailed = results.every(r=>!r.ok);
  exchangeHolidaysNoFeed = results.filter(r=>!r.ok || r.empty).map(r=>r.code);
  renderMarketHours(); // refresh once holiday data lands, whether or not the page is still on Dashboard
}
loadExchangeHolidays();
function getExchangeStatus(ex, now){
  const parts = new Intl.DateTimeFormat('en-US', {timeZone: ex.tz, hour12:false, hour:'2-digit', minute:'2-digit', weekday:'short'}).formatToParts(now);
  const weekday = parts.find(p=>p.type==='weekday').value;
  const hour = parseInt(parts.find(p=>p.type==='hour').value, 10) % 24; // Intl can return "24" for midnight in some engines
  const minute = parseInt(parts.find(p=>p.type==='minute').value, 10);
  const minutesNow = hour*60+minute;
  const isWeekend = weekday==='Sat' || weekday==='Sun';
  const dateKey = new Intl.DateTimeFormat('en-CA', {timeZone: ex.tz, year:'numeric', month:'2-digit', day:'2-digit'}).format(now); // en-CA locale formats as YYYY-MM-DD
  const holidayName = EXCHANGE_HOLIDAYS[ex.country]?.[dateKey] || null;
  const openMin = ex.open[0]*60+ex.open[1], closeMin = ex.close[0]*60+ex.close[1];
  let status = 'Closed';
  if(!isWeekend && !holidayName && minutesNow>=openMin && minutesNow<closeMin){
    status = 'Open';
    if(ex.lunchStart){
      const lsMin = ex.lunchStart[0]*60+ex.lunchStart[1], leMin = ex.lunchEnd[0]*60+ex.lunchEnd[1];
      if(minutesNow>=lsMin && minutesNow<leMin) status = 'Lunch break';
    }
  }
  return {status, localTimeStr: `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`, weekday, holidayName};
}
function renderMarketHours(){
  if((typeof QXH!=='undefined')){ QXH.renderHours(); return; } // Home v2 (js/features/home.js) owns this card now
  const box = document.getElementById('marketHoursBox');
  if(!box) return;
  const now = new Date();
  const rows = EXCHANGE_HOURS.map(ex=>{
    const {status, localTimeStr, holidayName} = getExchangeStatus(ex, now);
    const color = status==='Open' ? 'var(--up)' : status==='Lunch break' ? 'var(--amber)' : 'var(--text-2)';
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid var(--line-soft);font-size:11.5px;">
      <span style="color:var(--text-1);">${ex.name}${holidayName?` <span style="color:var(--amber);font-size:10px;">(${holidayName})</span>`:''}</span>
      <span style="font-family:var(--mono);">${localTimeStr}&nbsp; <span style="color:${color};font-weight:700;">${status}</span></span>
    </div>`;
  }).join('');
  const CN = {US:'US',GB:'UK',JP:'Japan',HK:'Hong Kong',IN:'India',DE:'Germany',FR:'France',AU:'Australia',CN:'China',KR:'Korea'};
  const holidayNote = exchangeHolidaysFailed ? `Public-holiday calendar unreachable right now — status reflects regular trading hours.`
    : exchangeHolidaysLoaded ? `Public holidays via Nager.Date${exchangeHolidaysNoFeed.length ? ` (no free holiday feed covers ${exchangeHolidaysNoFeed.map(c=>CN[c]||c).join(', ')} — regular hours shown there)` : ''}. Ad-hoc exchange closures aren't included.`
    : `Loading public holiday data…`;
  box.innerHTML = rows + `<div class="notebox" style="margin-top:8px;font-size:10px;">${holidayNote}</div>`;
}
if(!window._marketHoursInterval) window._marketHoursInterval = setInterval(renderMarketHours, 60*1000);
function renderDashboard(){
  if((typeof QXH!=='undefined')) QXH.init();
  renderMarketHours();
  runCurrencyConvert();
  if((typeof QXH!=='undefined')) QXH.refreshIndices();
  renderMarketRegime();
  document.getElementById('dashAlerts').innerHTML = renderDashAlerts();
  const sel = document.getElementById('dashMarket');
  if(sel && !sel.dataset.bound){
    try{ const saved = localStorage.getItem('quantis_dash_market'); if(saved) sel.value = saved; }catch(e){}
    sel.addEventListener('change', ()=>{ try{ localStorage.setItem('quantis_dash_market', sel.value); }catch(e){} renderMarketSnapshot(); });
    sel.dataset.bound = '1';
  }
  renderMarketSnapshot();
  refreshDashWatch();
  renderDashPortfolio();
}
/* Market-wide breadth, sector heat-map, top movers and the AI summary — computed from the 500
   largest primary listings of the selected market via the TradingView screener (keyless, live).
   Previously these were averages of the app's own seeded sample prices. */
const DASH_MARKET_LABEL = {america:'US', india:'India', uk:'UK', germany:'Germany', japan:'Japan', hongkong:'Hong Kong', canada:'Canada', australia:'Australia'};
let MARKET_SNAPSHOT = null, snapshotToken = 0;
async function fetchMarketSnapshot(market){
  return cachedFetch('mktsnap_'+market, 3*60*1000, async ()=>{
    const filter = [{left:'type',operation:'equal',right:'stock'},{left:'is_primary',operation:'equal',right:true},{left:'market_cap_basic',operation:'nempty'}];
    if(market === 'india') filter.push({left:'exchange',operation:'equal',right:'NSE'});
    const {rows, total} = await LD.tvScan(market, {filter, columns:['name','description','close','change','sector','market_cap_basic','logoid','currency','price_52_week_high','price_52_week_low','exchange','country','type','volume'],
      sort:{sortBy:'market_cap_basic',sortOrder:'desc'}, range:[0,500]});
    if(rows.length < 5) throw new Error('too few listings returned for this market');
    return {rows, total, via:'TradingView'};
  });
}
async function renderMarketSnapshot(){
  const myToken = ++snapshotToken;
  const market = (document.getElementById('dashMarket')||{}).value || 'america';
  const label = DASH_MARKET_LABEL[market] || market;
  const setBadge = (id, live, title)=>{ const b = document.getElementById(id); if(b){ b.textContent = live ? 'LIVE' : 'UNAVAILABLE'; b.className = live ? 'badge fact' : 'badge assume'; b.title = title||''; } };
  try{
    const snap = await fetchMarketSnapshot(market);
    if(myToken !== snapshotToken) return;
    const rows = snap.rows.filter(r=>typeof r.change === 'number');
    MARKET_SNAPSHOT = {market, label, rows};
    const adv = rows.filter(r=>r.change>0).length, dec = rows.filter(r=>r.change<0).length, unch = rows.length-adv-dec;
    const bigUp = rows.filter(r=>r.change>3).length, bigDn = rows.filter(r=>r.change<-3).length;
    const nearHi = rows.filter(r=>r.price_52_week_high && r.close >= r.price_52_week_high*0.98).length;
    const nearLo = rows.filter(r=>r.price_52_week_low && r.close <= r.price_52_week_low*1.02).length;
    const ratio = dec ? (adv/dec) : null;
    document.getElementById('breadthBox').innerHTML = kv([
      ['Advancers', `<span class="up">${adv}</span>`], ['Decliners', `<span class="down">${dec}</span>`], ['Unchanged', String(unch)],
      ['Adv / Dec ratio', ratio!=null ? ratio.toFixed(2) : '—'],
      ['Big gainers (> +3%)', String(bigUp)], ['Big losers (< −3%)', String(bigDn)],
      ['Within 2% of 52W high', String(nearHi)], ['Within 2% of 52W low', String(nearLo)],
    ]) + `<div class="notebox" style="margin-top:6px;">Live across the ${rows.length} largest ${label} primary listings by market cap (TradingView screener), refreshed every few minutes.</div>`;
    setBadge('breadthBadge', true);
    // market-cap-weighted sector moves
    const bySector = {};
    rows.forEach(r=>{ if(!r.sector) return; const w = r.market_cap_basic||0; const o = bySector[r.sector] = bySector[r.sector] || {w:0, sum:0, n:0}; o.w += w; o.sum += w*r.change; o.n++; });
    const sectors = Object.entries(bySector).filter(([,o])=>o.w>0).map(([name,o])=>[name, o.sum/o.w, o.n]).sort((a,b)=>b[1]-a[1]);
    document.getElementById('sectorHeat').innerHTML = sectors.slice(0,15).map(sx=>{
      const c = sx[1]>=0 ? `rgba(62,207,142,${Math.min(0.9,0.25+Math.abs(sx[1])/3)})` : `rgba(255,92,108,${Math.min(0.9,0.25+Math.abs(sx[1])/3)})`;
      return `<div class="heatcell" data-sector="${escapeHtml(sx[0])}" style="background:${c};cursor:pointer;" title="${sx[2]} companies — click for the biggest ones"><div>${escapeHtml(sx[0])}</div><div style="margin-top:4px;font-weight:700;">${sx[1]>=0?'+':''}${sx[1].toFixed(2)}%</div></div>`;
    }).join('');
    document.getElementById('sectorDrilldown').innerHTML = '';
    setBadge('sectorBadge', true);
    // top movers among the 500 largest
    const sorted = [...rows].sort((a,b)=>b.change-a.change);
    const mode = (()=>{ try{ return JSON.parse(safeStorage.getItem('quantis_movers_mode')) || 'both'; }catch(e){ return 'both'; } })();
    const movers = mode==='gainers' ? sorted.slice(0,10) : mode==='losers' ? sorted.slice(-10).reverse() : mode==='active' ? [...rows].sort((a,b)=>(b.close*(b.volume||0))-(a.close*(a.volume||0))).slice(0,10) : [...sorted.slice(0,5), ...sorted.slice(-5).reverse()];
    document.getElementById('moversList').innerHTML = movers.map(r=>{
      const tk = r._s.split(':')[1];
      return `<div class="idxcard" style="cursor:pointer" data-tv="${escapeHtml(r._s)}" title="${escapeHtml(r.description||r.name)} — open in Research"><div class="nm" style="display:flex;align-items:center;gap:6px;">${r.logoid?`<img src="${LD.logoUrl(r.logoid)}" width="16" height="16" alt="" style="border-radius:50%;background:#fff;" onerror="this.remove()">`:''}${escapeHtml(tk)}</div><div class="px ${r.change>=0?'up':'down'}">${r.change>=0?'+':''}${r.change.toFixed(2)}%</div></div>`;
    }).join('');
    document.getElementById('moversList').querySelectorAll('[data-tv]').forEach(el=>el.addEventListener('click', ()=>{
      const row = rows.find(r=>r._s===el.dataset.tv); if(row) openTvRow(row);
    }));
    setBadge('moversBadge', true, `Largest daily moves among the ${rows.length} biggest ${label} stocks`);
    renderAiMarketSummary({advancers:adv, decliners:dec, universe:rows.length, sectors:sectors.map(x=>[x[0],x[1]]),
      movers: movers.map(r=>({t:r._s.split(':')[1], chgPct:r.change})), market: label});
  }catch(e){
    if(myToken !== snapshotToken) return;
    document.getElementById('breadthBox').innerHTML = `<div class="notebox">Market breadth needs the TradingView screener, which is unreachable right now (${escapeHtml(e.message)}).</div>`;
    document.getElementById('sectorHeat').innerHTML = '';
    document.getElementById('moversList').innerHTML = `<div class="notebox">Unavailable right now.</div>`;
    ['breadthBadge','sectorBadge','moversBadge'].forEach(id=>setBadge(id, false, e.message));
    const box = document.getElementById('aiSummaryBox'); if(box) box.textContent = 'Market summary unavailable — live breadth data could not be loaded.';
    const b = document.getElementById('aiSummaryBadge'); if(b){ b.textContent='UNAVAILABLE'; b.className='badge assume'; }
  }
}
/* Opens a security discovered via the TradingView screener/dashboard in Research, admitting it to
   the universe with its real exchange, currency and symbols so every tab works on it. */
function openTvRow(row){
  const t = admitTvRow(row);
  if(t) selectSecurity(t);
}
/* Securities opened from worldwide search are remembered (this browser only, max 300) so a
   watchlist, portfolio or workspace that contains e.g. BSE:TAPARIA still works after a reload. */
const ADMITTED_KEY = 'quantis_admitted_v1';
function rememberAdmitted(kind, data){
  try{ const a = JSON.parse(safeStorage.getItem(ADMITTED_KEY)||'[]'); const id = kind+':'+(data._s||data._cnbc);
    if(a.some(x=>x.id===id)) return; a.push({id, kind, data}); safeStorage.setItem(ADMITTED_KEY, JSON.stringify(a.slice(-300))); }catch(e){}
}
function restoreAdmitted(){
  let a = []; try{ a = JSON.parse(safeStorage.getItem(ADMITTED_KEY)||'[]'); }catch(e){ return; }
  a.forEach(x=>{ try{ if(x.kind==='tv') admitTvRow(x.data); else if(x.kind==='cnbc') admitGlobalSearchResult(x.data); }catch(e){} });
}
function admitTvRow(row){
  const tvSym = row._s; if(!tvSym) return null;
  const known = SECURITY_UNIVERSE.find(x=>LD.tvSymbol(x.t)===tvSym) || SECURITIES.find(x=>x._tv===tvSym);
  if(known) return known.t;
  const [ex, sym] = tvSym.split(':');
  let t = sym;
  if(SECURITY_UNIVERSE.some(x=>x.t===t) || SECURITIES.some(x=>x.t===t)) t = sym+'.'+ex;
  const country = row.country || '';
  const cls = ({fund:'ETF', index:'Index', crypto:'Crypto', spot:'Crypto', forex:'FX', fx:'FX', commodity:'Commodity', cfd:'Commodity', futures:'Derivative', future:'Derivative'})[row.type] || 'Equity';
  const meta = {t, n: row.description || row.name || sym, ex: LD.TV_EX_LABEL[ex] || ex, ctry: country || 'Global', sector: row.sector || cls, cls,
    _tv: tvSym, _cnbc: LD.cnbcFromTv(tvSym, country), _logoid: row.logoid || null};
  SECURITY_UNIVERSE.push(meta);
  rememberAdmitted('tv', {_s:tvSym, name:row.name, description:row.description, type:row.type, country, currency:row.currency, sector:row.sector, logoid:row.logoid});
  const ccy = row.currency || currencyFor(country);
  SECURITIES.push({...meta, ccy, px: row.close || 0, chg: row.close && row.change!=null ? row.close - row.close/(1+row.change/100) : 0, chgPct: row.change || 0,
    rsi: row.RSI!=null ? Math.round(row.RSI*10)/10 : null, mcap: row.market_cap_basic ? Math.round(row.market_cap_basic/1e9*10)/10 : null,
    pe: row.price_earnings_ttm ?? null, roe: row.return_on_equity ?? null, _pxLive: true});
  return t;
}
function renderDashPortfolio(){
  const box = document.getElementById('dashPfBox'), badge = document.getElementById('dashPfBadge');
  if(!box) return;
  if(!PORTFOLIO_HOLDINGS.length){ box.innerHTML = `<div class="notebox">No holdings yet — add positions in the Portfolio view.</div>`; if(badge){ badge.textContent='EMPTY'; badge.className='badge'; } return; }
  const prices = pfCurrentPrices();
  let value = 0, cost = 0, dayChg = 0, live = 0;
  PORTFOLIO_HOLDINGS.forEach(h=>{
    const fx = pfFx(h.t), sec = SECURITIES.find(x=>x.t===h.t);
    value += h.qty*prices[h.t]*fx; cost += h.qty*h.avg*fx;
    if(sec && sec.chg!=null) dayChg += h.qty*sec.chg*fx;
    if(sec && sec._pxLive) live++;
  });
  const pnl = value-cost, pnlPct = cost ? pnl/cost*100 : 0, dayPct = value-dayChg ? dayChg/(value-dayChg)*100 : 0;
  const m = AppState.portfolioMetrics;
  box.innerHTML = `<div style="font-family:var(--mono);font-size:22px;font-weight:700;">$${value.toLocaleString(undefined,{maximumFractionDigits:0})}</div>
    <div class="${dayChg>=0?'up':'down'}" style="font-family:var(--mono);font-size:12px;">${dayChg>=0?'+':'−'}$${Math.abs(dayChg).toLocaleString(undefined,{maximumFractionDigits:0})} (${dayPct>=0?'+':''}${dayPct.toFixed(2)}%) today</div>
    <div class="notebox" style="margin-top:8px;">Unrealised P&amp;L <span class="${pnl>=0?'up':'down'}">${pnl>=0?'+':'−'}$${Math.abs(pnl).toLocaleString(undefined,{maximumFractionDigits:0})} (${pnlPct>=0?'+':''}${pnlPct.toFixed(1)}%)</span> · ${PORTFOLIO_HOLDINGS.length} holdings${m ? ` · Sharpe ${m.sharpe!=null?m.sharpe.toFixed(2):'—'} · Max DD ${m.maxDD!=null?m.maxDD.toFixed(1)+'%':'—'}` : ''}<br><span style="font-size:10.5px;">USD-converted at live ECB rates. ${m ? '' : 'Open Portfolio once to compute risk metrics.'}</span></div>`;
  if(badge){ const allLive = live===PORTFOLIO_HOLDINGS.length; badge.textContent = allLive ? 'LIVE' : live ? 'PARTLY LIVE' : 'SAMPLE PRICES'; badge.className = allLive ? 'badge fact' : 'badge assume'; }
}

function refreshDashWatch(){
  const el = document.getElementById('dashWatch'); if(!el) return;
  const watchSecs = activeWatchlist().map(t=>SECURITIES.find(s=>s.t===t)).filter(Boolean);
  el.innerHTML = watchSecs.length
    ? watchSecs.map(s=>`<div class="idxcard" style="cursor:pointer" onclick="selectSecurity('${s.t}')"><div class="nm">${s.t}</div><div class="px">${fmtPrice(s.px, s.ccy)}<div class="${s.chg>=0?'up':'down'}" style="font-size:11px;">${s.chg>=0?'+':''}${s.chgPct.toFixed(2)}%</div></div></div>`).join('')
    : `<div style="color:var(--text-2);font-size:11.5px;padding:8px 0;">No tickers in this workspace yet — add some from Research.</div>`;
  const dashAlertsEl = document.getElementById('dashAlerts');
  if(dashAlertsEl) dashAlertsEl.innerHTML = renderDashAlerts();
}
/* Live refresh of every loaded security: CNBC batch quotes (≈6 requests for ~200 symbols) for
   price/change, and one TradingView scan for market cap, P/E, ROE, RSI and sector. Replaces the
   seeded sample numbers the watchlist, screener, compare table and dashboard started with. */
let universeRefreshRunning = false, universeLastRefresh = 0;
async function refreshUniverseLive(){
  if(universeRefreshRunning) return;
  universeRefreshRunning = true;
  try{
    const symOf = {};
    SECURITIES.forEach(s=>{ if(!s._kuvera){ const c = LD.cnbcSymbol(s.t); if(c) symOf[s.t] = c; } });
    const quotes = await LD.quotes(Object.values(symOf));
    let updated = 0;
    SECURITIES.forEach(s=>{
      const q = quotes[symOf[s.t]];
      if(!q) return;
      if(s.cls === 'Derivative' && s.ex === 'NSE') return; // priced from the futures feed when opened, never from the underlying
      s.px = q.last;
      if(q.chg!=null) s.chg = q.chg; else if(q.prev) s.chg = q.last - q.prev;
      if(q.chgPct!=null) s.chgPct = q.chgPct;
      if(q.currency) s.ccy = q.currency;
      s._pxLive = true; updated++;
    });
    const tvMap = {};
    SECURITIES.forEach(s=>{ if(['Equity','ETF'].includes(s.cls)){ const tv = LD.tvSymbol(s.t); if(tv) tvMap[tv] = s; } });
    const tvSyms = Object.keys(tvMap);
    if(tvSyms.length){
      try{
        const {rows} = await LD.tvScan('global', {symbols:{tickers:tvSyms}, columns:['market_cap_basic','price_earnings_ttm','return_on_equity','RSI','sector','logoid','fundamental_currency_code']});
        rows.forEach(r=>{
          const s = tvMap[r._s]; if(!s) return;
          if(r.market_cap_basic){ s.mcap = Math.round(r.market_cap_basic/1e9*10)/10; s.mcapCcy = r.fundamental_currency_code || 'USD'; s._mcapIsLive = true; }
          if(r.price_earnings_ttm!=null){ s.pe = Math.round(r.price_earnings_ttm*10)/10; s._peIsLive = true; } else if(s.cls==='Equity'){ s.pe = null; }
          if(r.return_on_equity!=null){ s.roe = Math.round(r.return_on_equity*10)/10; s._roeIsLive = true; } else if(s.cls==='Equity'){ s.roe = null; }
          if(r.RSI!=null){ s.rsi = Math.round(r.RSI*10)/10; s._rsiIsLive = true; }
          if(r.sector) s.tvSector = r.sector;
          if(r.logoid && !s._logoid) s._logoid = r.logoid;
        });
      }catch(e){ console.warn('[Quantis] TradingView universe scan failed', e.message); }
    }
    universeLastRefresh = Date.now();
    if(updated){
      setDataPill(true);
      renderWatchlist(); refreshDashWatch(); renderDashPortfolio();
      const cur = SECURITIES.find(x=>x.t===currentSecurity);
      if(cur && cur._pxLive && !document.getElementById('secLiveStatus').textContent.includes('LIVE')){
        updateLiveQuote(cur.t, cur.px, cur.px - (cur.chg||0), cur.ccy, 'CNBC live quote');
      }
      if(document.getElementById('view-compare')?.classList.contains('active')) renderCompareTable();
    }
  }catch(e){
    console.warn('[Quantis] universe refresh failed', e.message);
  }finally{ universeRefreshRunning = false; }
}
/* AI Market Summary — was a single hardcoded sentence with a note calling itself "placeholder
   text... a planned enhancement, not yet built." Two tiers, same pattern as the Research
   Assistant elsewhere in the app: (1) always-on grounded summary, built as real template text
   from the real breadth/sector/mover numbers computed just above (no fabrication, no ML) — this
   is what renders with zero setup; (2) if the user has saved an LLM key in Settings, that same
   real data is sent as the ONLY permitted source of facts and the model is asked to phrase it
   as a short narrative, same one-key-of-three routing as llmAnswer(). */
function groundedMarketSummary({advancers, decliners, universe, sectors, movers}){
  const topSector = sectors[0], botSector = sectors[sectors.length-1];
  const breadthTilt = advancers>decliners ? 'positive' : advancers<decliners ? 'negative' : 'flat';
  const topMover = movers[0];
  return `${arguments[0].market ? arguments[0].market+' market breadth' : 'Breadth'} is ${breadthTilt}: ${advancers} advancers vs ${decliners} decliners among the ${universe} largest listed companies. `
    + `${topSector ? `${topSector[0]} leads sector performance today (${topSector[1]>=0?'+':''}${topSector[1].toFixed(1)}%)` : ''}`
    + `${botSector && botSector!==topSector ? `, while ${botSector[0]} lags (${botSector[1]>=0?'+':''}${botSector[1].toFixed(1)}%).` : '.'} `
    + `${topMover ? `Biggest single mover: ${topMover.t} at ${topMover.chgPct>=0?'+':''}${topMover.chgPct.toFixed(2)}%.` : ''}`;
}
let aiSummaryToken = 0;
async function renderAiMarketSummary(data){
  const myToken = ++aiSummaryToken;
  const box = document.getElementById('aiSummaryBox'), badge = document.getElementById('aiSummaryBadge');
  if(!box) return;
  const grounded = groundedMarketSummary(data);
  box.textContent = grounded;
  if(badge){ badge.textContent = 'LIVE DATA'; badge.className = 'badge fact'; }
  const anthropicKey = (safeStorage.getItem('quantis_key_anthropic')||'').trim();
  const openaiKey = (safeStorage.getItem('quantis_key_openai')||'').trim();
  const groqKey = (safeStorage.getItem('quantis_key_groq')||'').trim();
  if(!anthropicKey && !openaiKey && !groqKey) return; // no key configured — grounded summary above is the final answer
  try{
    const sys = `You are a financial market summarizer. Rewrite the following real, computed market-breadth data as a short (2-3 sentence) natural-language narrative for a trading terminal dashboard. Do NOT add any fact, number, or claim that is not already present in the data below — only rephrase/summarize it. Data: ${JSON.stringify(data)}`;
    const r = await QXAI.chat([{role:'system',content:sys},{role:'user',content:grounded}], {maxTokens:220}); const text = r.text;
    if(myToken !== aiSummaryToken || !text) return;
    box.textContent = text.trim();
    if(badge){ badge.textContent = 'LIVE (LLM)'; badge.className = 'badge fact'; }
  }catch(e){
    if(myToken !== aiSummaryToken) return;
    box.innerHTML = escapeHtml(grounded) + `<br><span style="color:var(--down);font-size:10.5px;">(Your configured AI key failed — ${escapeHtml(e.message)} — showing the grounded summary instead.)</span>`;
  }
}
