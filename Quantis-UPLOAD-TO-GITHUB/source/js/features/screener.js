/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/features/screener.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Screener + saved screens.
 * DEPENDS   data/live-data.js
 * EXPOSES   runScreen (global — classic script, shared scope)
 * LOAD      Classic <script>, order defined in js/manifest.json. Top-level code runs at load,
 *           so it may only call functions from files listed EARLIER in the manifest.
 * NOTE      Migrated verbatim from the single-file build; inline comments marked
 *           "REAL BUG FIXED" / "post-launch fix" document past defects — keep them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* ===================== SCREENER ===================== */
const TV_SECTORS = ['Commercial Services','Communications','Consumer Durables','Consumer Non-Durables','Consumer Services','Distribution Services','Electronic Technology',
  'Energy Minerals','Finance','Health Services','Health Technology','Industrial Services','Miscellaneous','Non-Energy Minerals','Process Industries','Producer Manufacturing',
  'Retail Trade','Technology Services','Transportation','Utilities'];
const SCREEN_COUNTRIES = ['United States','India','United Kingdom','Germany','France','Netherlands','Switzerland','Japan','South Korea','Hong Kong','China','Taiwan','Australia','Canada','Brazil','Singapore'];
function populateScreenerDropdowns(){
  const sectorEl = document.getElementById('fSector'), countryEl = document.getElementById('fCountry'), classEl = document.getElementById('fClass');
  if(!sectorEl || !countryEl || !classEl) return;
  const curSector = sectorEl.value, curCountry = countryEl.value, curClass = classEl.value;
  const classes = [['Equity','Stocks — every listing worldwide (live)'],['ETF','ETFs — every listing worldwide (live)'], ...[...new Set(SECURITIES.map(s=>s.cls))].filter(c=>!['Equity','ETF'].includes(c)).sort().map(c=>[c, c+' — built-in list (live prices)'])];
  classEl.innerHTML = classes.map(([v,l])=>`<option value="${v}" ${v===(curClass||'Equity')?'selected':''}>${l}</option>`).join('');
  sectorEl.innerHTML = '<option value="">Any</option>' + TV_SECTORS.map(x=>`<option ${x===curSector?'selected':''}>${x}</option>`).join('');
  countryEl.innerHTML = '<option value="">Any</option>' + SCREEN_COUNTRIES.map(c=>`<option ${c===curCountry?'selected':''}>${c}</option>`).join('');
}
let screenRunToken = 0, lastScreenRows = [];
async function runScreen(){
  const num = id => { const v = parseFloat(document.getElementById(id).value); return isFinite(v) ? v : null; };
  const mcap = num('fMcap'), pe = num('fPe'), roe = num('fRoe'), rsi = num('fRsi');
  const sector = document.getElementById('fSector').value, country = document.getElementById('fCountry').value;
  const cls = document.getElementById('fClass').value || 'Equity';
  const countEl = document.getElementById('screenCount'), tableEl = document.getElementById('screenTable'), noteEl = document.getElementById('screenLiveNote');
  const myToken = ++screenRunToken;
  if(cls === 'Equity' || cls === 'ETF'){
    countEl.textContent = 'Screening…';
    tableEl.innerHTML = '<tbody><tr><td style="padding:14px;color:var(--text-2)">Running live screen…</td></tr></tbody>';
    const filter = cls === 'ETF'
      ? [{left:'type',operation:'equal',right:'fund'},{left:'subtype',operation:'equal',right:'etf'}]
      : [{left:'type',operation:'equal',right:'stock'},{left:'is_primary',operation:'equal',right:true}];
    if(mcap!=null && mcap>0) filter.push({left:'market_cap_basic',operation:'egreater',right:mcap*1e9});
    if(pe!=null && cls==='Equity') filter.push({left:'price_earnings_ttm',operation:'in_range',right:[0, pe]});
    if(roe!=null && cls==='Equity') filter.push({left:'return_on_equity',operation:'egreater',right:roe});
    if(rsi!=null) filter.push({left:'RSI',operation:'eless',right:rsi});
    if(sector && cls==='Equity') filter.push({left:'sector',operation:'equal',right:sector});
    if(country) filter.push({left:'country',operation:'equal',right:country});
    const columns = ['name','description','exchange','country','sector','type','currency','close','change','market_cap_basic','price_earnings_ttm','return_on_equity','RSI','logoid','aum','expense_ratio'];
    try{
      const {rows, total} = await LD.tvScan('global', {filter, columns, sort:{sortBy: cls==='ETF' ? 'aum' : 'market_cap_basic', sortOrder:'desc'}, range:[0,150]});
      if(myToken !== screenRunToken) return;
      lastScreenRows = rows;
      countEl.textContent = `${(total||0).toLocaleString()} match${total===1?'':'es'}`;
      const f1 = v => v!=null && isFinite(v) ? (+v).toFixed(1) : '—';
      const head = cls === 'ETF' ? ['Symbol','Name','Exchange','Country','Price','Chg %','AUM ($B)','Expense %','RSI']
                                 : ['Symbol','Name','Exchange','Country','Sector','Price','Chg %','Mcap ($B)','P/E','ROE %','RSI'];
      tableEl.innerHTML = table(head, rows.map((r,i)=>{
        const logo = r.logoid ? `<img src="${LD.logoUrl(r.logoid)}" width="16" height="16" alt="" style="border-radius:50%;background:#fff;vertical-align:-3px;margin-right:6px;" onerror="this.remove()">` : '';
        const sym = `<a href="#" data-screen-row="${i}" style="color:var(--amber);text-decoration:none;font-weight:600;">${logo}${escapeHtml(r.name||'')}</a>`;
        const chg = r.change!=null ? `<span class="${r.change>=0?'up':'down'}">${r.change>=0?'+':''}${r.change.toFixed(2)}%</span>` : '—';
        const px = r.close!=null ? fmtPrice(r.close, r.currency||'USD') : '—';
        return cls === 'ETF'
          ? [sym, escapeHtml(r.description||''), escapeHtml(LD.TV_EX_LABEL[r.exchange]||r.exchange||''), escapeHtml(r.country||''), px, chg, r.aum ? (r.aum/1e9).toFixed(1) : '—', r.expense_ratio!=null ? r.expense_ratio.toFixed(2) : '—', f1(r.RSI)]
          : [sym, escapeHtml(r.description||''), escapeHtml(LD.TV_EX_LABEL[r.exchange]||r.exchange||''), escapeHtml(r.country||''), escapeHtml(r.sector||''), px, chg, r.market_cap_basic ? (r.market_cap_basic/1e9).toFixed(1) : '—', f1(r.price_earnings_ttm), f1(r.return_on_equity), f1(r.RSI)];
      }));
      tableEl.querySelectorAll('[data-screen-row]').forEach(a=>a.addEventListener('click', e=>{ e.preventDefault(); openTvRow(lastScreenRows[+a.dataset.screenRow]); }));
      if(noteEl) noteEl.innerHTML = `<span class="badge fact">LIVE</span> Screened across every primary ${cls==='ETF'?'ETF':'stock'} listing worldwide via TradingView — showing the ${rows.length} largest of ${(total||0).toLocaleString()} matches. Market cap / AUM in US$ billions; prices in each listing's own currency. Click a symbol to research it.`;
    }catch(e){
      if(myToken !== screenRunToken) return;
      countEl.textContent = 'unavailable';
      tableEl.innerHTML = '';
      if(noteEl) noteEl.innerHTML = `<span style="color:var(--down)">Live screener unreachable right now: ${escapeHtml(e.message)}</span>`;
    }
    return;
  }
  // Index / crypto / FX / commodity / derivative / fund classes: the built-in list with live prices
  const res = SECURITIES.filter(s=> s.cls===cls && (rsi==null || s.rsi==null || s.rsi<=rsi) && (!country || s.ctry===country));
  countEl.textContent = res.length+' match'+(res.length===1?'':'es');
  tableEl.innerHTML = table(['Ticker','Name','Exchange','Country','Price','Chg %','RSI'], res.map(s=>[
    `<a href="#" onclick="event.preventDefault();selectSecurity('${s.t}')" style="color:var(--amber);text-decoration:none;font-weight:600;">${escapeHtml(s.t)}</a>`, escapeHtml(s.n), escapeHtml(s.ex), escapeHtml(s.ctry),
    s.px ? fmtPrice(s.px, s.ccy) : '—', s.chgPct!=null ? `<span class="${s.chgPct>=0?'up':'down'}">${s.chgPct>=0?'+':''}${s.chgPct.toFixed(2)}%</span>` : '—', s.rsi ?? '—']));
  if(noteEl) noteEl.innerHTML = `${cls} instruments from the built-in list, with ${SECURITIES.filter(s=>s.cls===cls && s._pxLive).length} live-priced. Fundamental filters (market cap, P/E, ROE, sector) apply to stocks only.`;
}
function clearScreen(){ ['fMcap','fPe','fRoe','fRsi'].forEach(id=>document.getElementById(id).value=''); document.getElementById('fSector').value=''; document.getElementById('fCountry').value=''; if(false) document.getElementById('fClass').value=''; runScreen(); }

/* ===================== SAVED SCREENS (post-launch fix) =====================
   These used to be static HTML with zero event listeners (clicking did nothing), then were
   fixed to run 3 built-in presets — but there was still no way to save YOUR OWN filter
   combination, which is the actual point of a "saved screen" feature (a screener you build
   once and revisit, not just 3 examples someone else picked). "Save as new screen" now
   captures the Screener's current filter values, names it, and persists it to local storage
   alongside watchlists/portfolio/alerts — with a remove (×) button per custom screen. */
const SAVED_SCREEN_PRESETS = {
  hqc: {mcap:10, roe:20, pe:40, label:'High Quality Compounders (Mcap ≥ $10B, ROE ≥ 20%, P/E ≤ 40)'},
  osl: {mcap:100, rsi:35, label:'Oversold Large Caps (Mcap ≥ $100B, RSI ≤ 35)'},
  itb: {sector:'Technology Services', country:'India', mcap:1, label:'India IT Basket (Technology Services, India)'},
};
const CUSTOM_SCREENS_STORAGE_KEY = 'quantis_custom_screens_v1';
function loadCustomScreens(){
  try{
    const raw = safeStorage.getItem(CUSTOM_SCREENS_STORAGE_KEY);
    if(raw){ const parsed = JSON.parse(raw); if(Array.isArray(parsed)) return parsed; }
  }catch(e){ /* private browsing */ }
  return [];
}
let customScreens = loadCustomScreens();
function persistCustomScreens(){ try{ safeStorage.setItem(CUSTOM_SCREENS_STORAGE_KEY, JSON.stringify(customScreens)); }catch(e){ /* private browsing */ } cloudSyncPush(); }
function renderSavedScreensList(){
  const el = document.getElementById('savedScreensList');
  if(!el) return;
  const starSvg = `<svg class="svgi" width="13" height="13" viewBox="0 0 24 24" ><path d="M12 2l2.4 5.5L20 8.5l-4 4 1 6.5-5-3-5 3 1-6.5-4-4 5.6-1z"/></svg>`;
  let html = Object.entries(SAVED_SCREEN_PRESETS).map(([key,p])=>
    `<div class="saved-screen-item" data-preset="${key}" style="cursor:pointer;">${starSvg} ${p.label.split(' (')[0]}</div>`
  ).join('');
  html += customScreens.map(s=>
    `<div class="saved-screen-item" style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;" data-custom="${s.id}">
      <span>${starSvg} ${escapeHtml(s.name)}</span>
      <button class="wl-remove" style="opacity:1;" title="Remove screen" aria-label="Remove saved screen" onclick="event.stopPropagation();removeCustomScreen(${s.id})">×</button>
    </div>`
  ).join('');
  el.innerHTML = html || '<div style="color:var(--text-2);">No saved screens.</div>';
  el.querySelectorAll('.saved-screen-item[data-preset]').forEach(item=>item.addEventListener('click', ()=>runSavedScreen(item.dataset.preset)));
  el.querySelectorAll('.saved-screen-item[data-custom]').forEach(item=>item.addEventListener('click', ()=>runCustomScreen(parseInt(item.dataset.custom))));
}
function runSavedScreen(key){
  const p = SAVED_SCREEN_PRESETS[key]; if(!p) return;
  goto('screener');
  clearScreen();
  if(p.mcap!=null) document.getElementById('fMcap').value = p.mcap;
  if(p.pe!=null) document.getElementById('fPe').value = p.pe;
  if(p.roe!=null) document.getElementById('fRoe').value = p.roe;
  if(p.rsi!=null) document.getElementById('fRsi').value = p.rsi;
  if(p.sector) document.getElementById('fSector').value = p.sector;
  if(p.country) document.getElementById('fCountry').value = p.country;
  runScreen();
}
function runCustomScreen(id){
  const s = customScreens.find(x=>x.id===id); if(!s) return;
  goto('screener');
  clearScreen();
  Object.entries(s.filters).forEach(([elId,val])=>{ const el = document.getElementById(elId); if(el && val) el.value = val; });
  runScreen();
}
async function saveCurrentScreen(){
  const anyFilter = ['fClass','fMcap','fPe','fRoe','fRsi','fSector','fCountry'].some(id=>{ const el=document.getElementById(id); return el && el.value; });
  if(!anyFilter){ toast('Set at least one filter before saving — an empty screen matches everything.', 'warn'); return; }
  const name = await askText('Save screen', 'Saves the current filter values to the Saved Screens list in Research.', 'e.g. Cheap Indian banks');
  if(!name || !name.trim()) return;
  const filters = {};
  ['fClass','fMcap','fPe','fRoe','fRsi','fSector','fCountry'].forEach(id=>{
    const el = document.getElementById(id);
    if(el && el.value) filters[id] = el.value;
  });
  if(Object.keys(filters).length === 0){
    toast('Set at least one filter before saving — an empty screen matches everything, not much to save.');
    return;
  }
  const id = customScreens.length ? Math.max(...customScreens.map(s=>s.id))+1 : 1;
  customScreens.push({id, name: name.trim(), filters});
  persistCustomScreens();
  renderSavedScreensList();
  toast(`Saved screen "${name.trim()}".`, 'ok');
}
function removeCustomScreen(id){
  customScreens = customScreens.filter(s=>s.id!==id);
  persistCustomScreens();
  renderSavedScreensList();
}
