/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/features/screener-pro.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Advanced Screener (#view-screener), rebuilt:
 *             • Stocks or ETFs from every primary listing worldwide (TradingView, keyless).
 *             • Min / max ranges for 16 metrics (size, valuation, profitability, growth, balance
 *               sheet, income, momentum, risk) + sector, country (all 60+), exchange.
 *             • Sort by any metric, ascending / descending; 50 / 100 / 250 rows; "load more".
 *             • Quick presets, saved screens (kept per browser), CSV export, click → Research.
 * FIXES     ETF results were duplicated across exchanges (no primary-listing filter); only four
 *           filters existed, each one-sided; the country list had 16 entries.
 * EXPOSES   runScreen(), clearScreen(), saveCurrentScreen() (globals used elsewhere), QXSCR.preset(id)
 * ─────────────────────────────────────────────────────────────────────────────
 */
const QXSCR = (() => {
  // [key, label, TradingView column, unit/format, applies to ('s' stocks, 'e' ETFs, 'b' both), multiplier for input]
  const F = [
    ['mcap','Market cap (US$ B)','market_cap_basic','b','b',1e9],
    ['price','Price','close','n','b',1],
    ['chg','Change today %','change','p','b',1],
    ['perfY','1-year return %','Perf.Y','p','b',1],
    ['pe','P/E (TTM)','price_earnings_ttm','x','s',1],
    ['pb','P/B','price_book_fq','x','s',1],
    ['evebitda','EV / EBITDA','enterprise_value_ebitda_ttm','x','s',1],
    ['roe','ROE %','return_on_equity','p','s',1],
    ['netm','Net margin %','net_margin','p','s',1],
    ['revg','Revenue growth % (YoY)','total_revenue_yoy_growth_ttm','p','s',1],
    ['epsg','EPS growth % (YoY)','earnings_per_share_diluted_yoy_growth_ttm','p','s',1],
    ['de','Debt / Equity','debt_to_equity','x','s',1],
    ['dy','Dividend yield %','dividends_yield_current','p','b',1],
    ['rsi','RSI (14)','RSI','n','b',1],
    ['beta','Beta (1Y)','beta_1_year','n','s',1],
    ['aum','AUM (US$ B)','aum','b','e',1e9],
    ['er','Expense ratio %','expense_ratio','p','e',1],
  ];
  const PRESETS = {
    quality:{label:'Quality compounders', f:{mcap:[10,null], roe:[20,null], de:[null,1], netm:[15,null]}, sort:'market_cap_basic'},
    value:{label:'Deep value', f:{pe:[0,12], pb:[0,1.5], mcap:[1,null]}, sort:'market_cap_basic'},
    growth:{label:'High growth', f:{revg:[25,null], epsg:[20,null], mcap:[2,null]}, sort:'total_revenue_yoy_growth_ttm'},
    income:{label:'Dividend income', f:{dy:[4,null], mcap:[5,null], de:[null,1.5]}, sort:'dividends_yield_current'},
    oversold:{label:'Oversold large caps', f:{rsi:[null,30], mcap:[50,null]}, sort:'RSI', dir:'asc'},
    momentum:{label:'Momentum leaders', f:{perfY:[50,null], mcap:[5,null], rsi:[55,null]}, sort:'Perf.Y'},
    india:{label:'India large caps', f:{mcap:[10,null]}, country:'India', sort:'market_cap_basic'},
    smallIndia:{label:'India small caps, profitable', f:{mcap:[0.05,1], roe:[15,null], pe:[0,25]}, country:'India', sort:'return_on_equity'},
  };
  const COUNTRIES = ['United States','Canada','Brazil','Mexico','Argentina','Chile','Colombia','Peru','United Kingdom','Germany','France','Italy','Spain','Netherlands','Belgium','Switzerland','Sweden','Norway','Denmark','Finland','Austria','Portugal','Ireland','Poland','Greece','Hungary','Czech Republic','Romania','Turkey','Russia','Israel','Saudi Arabia','United Arab Emirates','Qatar','Kuwait','Bahrain','Egypt','South Africa','Nigeria','Kenya','Morocco','India','Pakistan','Bangladesh','Sri Lanka','China','Japan','Hong Kong','South Korea','Taiwan','Singapore','Malaysia','Thailand','Indonesia','Philippines','Vietnam','Australia','New Zealand'];
  let sortCol = 'market_cap_basic', sortDir = 'desc', pageSize = 100, offset = 0, rowsAll = [], total = 0, tok = 0;
  const fmt = (v, u) => v==null || !isFinite(v) ? '—' : u==='b' ? (v/1e9).toFixed(v>=1e10?0:2) : u==='p' ? v.toFixed(2) : u==='x' ? v.toFixed(1) : (+v).toLocaleString(undefined,{maximumFractionDigits:2});
  function mount(){
    const v = document.querySelector('#view-screener .viewbody'); if(!v || v.dataset.v2) return; v.dataset.v2 = '1';
    v.innerHTML = `
      <div class="card">
        <div class="scr-top"><div><label class="qx-lbl">Universe</label><div class="seg" id="scrClass"><button type="button" data-v="Equity" class="active">Stocks</button><button type="button" data-v="ETF">ETFs</button></div></div>
          <div><label class="qx-lbl">Country</label><select id="fCountry" class="qx-select-sm"><option value="">All countries</option>${COUNTRIES.map(c=>`<option>${c}</option>`).join('')}</select></div>
          <div class="scr-sector"><label class="qx-lbl">Sector</label><select id="fSector" class="qx-select-sm"><option value="">All sectors</option>${TV_SECTORS.map(x=>`<option>${x}</option>`).join('')}</select></div>
          <div><label class="qx-lbl">Exchange (optional)</label><input id="fExchange" class="qx-input qx-input-sm" placeholder="e.g. NSE, BSE, NYSE" style="width:150px"></div>
          <div><label class="qx-lbl">Quick presets</label><select id="scrPreset" class="qx-select-sm"><option value="">Choose…</option>${Object.entries(PRESETS).map(([k,p])=>`<option value="${k}">${p.label}</option>`).join('')}</select></div>
          <input type="hidden" id="fClass" value="Equity"></div>
        <div class="scr-grid" id="scrFields">${F.map(([k,l,col,u,ap])=>`<div class="scr-f" data-ap="${ap}"><label>${l}</label><div><input type="number" step="any" id="f-${k}-min" data-sf placeholder="min"><span>–</span><input type="number" step="any" id="f-${k}-max" data-sf placeholder="max"></div></div>`).join('')}</div>
        <div class="scr-actions"><button class="btn" id="scrRun" type="button">Run screen</button><button class="btn secondary" type="button" id="scrClear">Clear filters</button><button class="btn secondary" type="button" id="scrSave">Save screen</button>
          <span class="qxa-dim" id="scrActive" style="margin-left:auto"></span></div>
      </div>
      <div class="card" style="margin-top:12px"><h3>Results <span id="screenCount" class="badge">—</span></h3>
        <div class="scr-top" style="margin-bottom:8px"><div><label class="qx-lbl">Sort by</label><select id="scrSort" class="qx-select-sm">${F.map(([k,l,col])=>`<option value="${col}">${l}</option>`).join('')}</select></div>
          <div><label class="qx-lbl">Order</label><div class="seg seg-sm" id="scrDir"><button type="button" data-v="desc" class="active">High → low</button><button type="button" data-v="asc">Low → high</button></div></div>
          <div><label class="qx-lbl">Rows</label><div class="seg seg-sm" id="scrRows">${[50,100,250].map(n=>`<button type="button" data-v="${n}" class="${n===100?'active':''}">${n}</button>`).join('')}</div></div>
          <div style="margin-left:auto;align-self:flex-end"><button class="btn secondary small" type="button" id="scrCsv">Export CSV</button></div></div>
        <div style="overflow-x:auto;"><table class="datatable" id="screenTable"></table></div>
        <div style="text-align:center;margin-top:10px"><button class="btn secondary small" type="button" id="scrMore" hidden>Load more</button></div>
        <div class="notebox" id="screenLiveNote" style="margin-top:8px;"></div></div>`;
    const seg = (id, cb) => v.querySelector(id).addEventListener('click', e=>{ const b = e.target.closest('button'); if(!b) return; v.querySelectorAll(id+' button').forEach(x=>x.classList.toggle('active', x===b)); cb(b.dataset.v); });
    seg('#scrClass', c=>{ document.getElementById('fClass').value = c; applyClass(); run(); });
    seg('#scrDir', d=>{ sortDir = d; run(); });
    seg('#scrRows', n=>{ pageSize = +n; run(); });
    v.querySelector('#scrSort').addEventListener('change', e=>{ sortCol = e.target.value; run(); });
    v.querySelector('#scrRun').addEventListener('click', ()=>run());
    v.querySelector('#scrClear').addEventListener('click', clear);
    v.querySelector('#scrSave').addEventListener('click', ()=>saveCurrentScreen());
    v.querySelector('#scrCsv').addEventListener('click', csv);
    v.querySelector('#scrMore').addEventListener('click', ()=>run(true));
    v.querySelector('#scrPreset').addEventListener('change', e=>{ if(e.target.value) preset(e.target.value); e.target.value=''; });
    v.querySelectorAll('[data-sf]').forEach(i=>i.addEventListener('keydown', e=>{ if(e.key==='Enter') run(); }));
    ['fCountry','fSector'].forEach(id=>v.querySelector('#'+id).addEventListener('change', ()=>run()));
    applyClass();
  }
  function applyClass(){ const etf = document.getElementById('fClass').value==='ETF'; document.querySelectorAll('#scrFields .scr-f').forEach(f=>{ const ap = f.dataset.ap; f.hidden = etf ? ap==='s' : ap==='e'; }); const s = document.querySelector('.scr-sector'); if(s) s.hidden = etf; const so = document.getElementById('scrSort'); if(so){ [...so.options].forEach(o=>{ const def = F.find(x=>x[2]===o.value); o.hidden = etf ? def[4]==='s' : def[4]==='e'; }); if(etf && sortCol==='market_cap_basic') sortCol = 'aum'; if(!etf && sortCol==='aum') sortCol = 'market_cap_basic'; so.value = sortCol; } }
  function filters(){
    const etf = document.getElementById('fClass').value==='ETF';
    const out = etf ? [{left:'type',operation:'equal',right:'fund'},{left:'typespecs',operation:'has',right:['etf']},{left:'is_primary',operation:'equal',right:true}]
                    : [{left:'type',operation:'equal',right:'stock'},{left:'is_primary',operation:'equal',right:true}];
    const act = [];
    F.forEach(([k,l,col,u,ap,mult])=>{ if((etf && ap==='s') || (!etf && ap==='e')) return;
      const mn = parseFloat(document.getElementById(`f-${k}-min`).value), mx = parseFloat(document.getElementById(`f-${k}-max`).value);
      if(isFinite(mn) && isFinite(mx)) out.push({left:col, operation:'in_range', right:[mn*mult, mx*mult]});
      else if(isFinite(mn)) out.push({left:col, operation:'egreater', right:mn*mult});
      else if(isFinite(mx)) out.push({left:col, operation:'eless', right:mx*mult});
      if(isFinite(mn) || isFinite(mx)) act.push(`${l} ${isFinite(mn)?'≥ '+mn:''}${isFinite(mn)&&isFinite(mx)?' and ':''}${isFinite(mx)?'≤ '+mx:''}`);
    });
    const c = document.getElementById('fCountry').value, s = document.getElementById('fSector').value, ex = document.getElementById('fExchange').value.trim().toUpperCase();
    if(c){ out.push({left:'country', operation:'equal', right:c}); act.push(c); }
    if(s && !etf){ out.push({left:'sector', operation:'equal', right:s}); act.push(s); }
    if(ex){ const list = ex.split(/[\s,]+/).filter(Boolean); out.push({left:'exchange', operation:'in_range', right:list}); act.push('exchange '+list.join('/')); }
    document.getElementById('scrActive').textContent = act.length ? act.length+' filter'+(act.length>1?'s':'')+': '+act.join(' · ') : 'No filters — showing the largest listings';
    return out;
  }
  async function run(more){
    mount();
    const etf = document.getElementById('fClass').value==='ETF';
    const countEl = document.getElementById('screenCount'), tableEl = document.getElementById('screenTable'), noteEl = document.getElementById('screenLiveNote'), moreBtn = document.getElementById('scrMore');
    if(!more){ offset = 0; rowsAll = []; tableEl.innerHTML = `<tbody><tr><td style="padding:14px"><span class="qx-spin"></span> Screening every listing worldwide…</td></tr></tbody>`; }
    const my = ++tok; countEl.textContent = 'Screening…';
    const cols = ['name','description','exchange','country','sector','currency','close','change','logoid', ...F.map(f=>f[2])];
    try{
      const {rows, total: tot} = await LD.tvScan('global', {filter:filters(), columns:[...new Set(cols)], sort:{sortBy:sortCol, sortOrder:sortDir, nullsFirst:false}, range:[offset, offset+pageSize]});
      if(my!==tok) return;
      rowsAll = rowsAll.concat(rows); total = tot||0; offset += rows.length; lastScreenRows = rowsAll;
      countEl.textContent = `${total.toLocaleString()} match${total===1?'':'es'}`;
      const show = etf ? ['mcap','price','chg','perfY','aum','er','dy','rsi'] : ['mcap','price','chg','perfY','pe','pb','roe','netm','revg','de','dy','rsi'];
      const defs = show.map(k=>F.find(f=>f[0]===k));
      tableEl.innerHTML = `<thead><tr><th>#</th><th>Symbol</th><th>Name</th><th>Country</th>${etf?'':'<th>Sector</th>'}${defs.map(d=>`<th class="${d[2]===sortCol?'scr-sorted':''}" data-col="${d[2]}">${d[1]}</th>`).join('')}</tr></thead><tbody>${rowsAll.map((r,i)=>{
        const logo = r.logoid ? `<img src="${LD.logoUrl(r.logoid)}" width="16" height="16" alt="" class="scr-logo" onerror="this.remove()">` : '';
        return `<tr><td class="qxa-dim">${i+1}</td><td><a href="#" data-screen-row="${i}" class="scr-sym">${logo}${escapeHtml(r.name||'')}</a><span class="qxa-dim" style="font-size:10px;margin-left:4px">${escapeHtml(r.exchange||'')}</span></td><td>${escapeHtml(String(r.description||'').slice(0,40))}</td><td>${escapeHtml(r.country||'')}</td>${etf?'':`<td>${escapeHtml(r.sector||'')}</td>`}
          ${defs.map(d=>{ const v = r[d[2]]; const c = d[0]==='chg'||d[0]==='perfY' ? (v>=0?'up':'down') : ''; return `<td class="${c}">${d[0]==='price'&&v!=null ? fmtPrice(v, r.currency||'USD') : fmt(v, d[3])}</td>`; }).join('')}</tr>`; }).join('')}</tbody>`;
      tableEl.querySelectorAll('[data-screen-row]').forEach(a=>a.addEventListener('click', e=>{ e.preventDefault(); openTvRow(rowsAll[+a.dataset.screenRow]); }));
      tableEl.querySelectorAll('th[data-col]').forEach(th=>th.addEventListener('click', e=>{ e.stopPropagation(); const c = th.dataset.col; if(sortCol===c) sortDir = sortDir==='desc'?'asc':'desc'; else { sortCol = c; sortDir = 'desc'; } document.getElementById('scrSort').value = c; document.querySelectorAll('#scrDir button').forEach(b=>b.classList.toggle('active', b.dataset.v===sortDir)); run(); }));
      moreBtn.hidden = offset >= total;
      noteEl.innerHTML = `<span class="badge fact">LIVE</span> TradingView screener · primary listings only (no duplicate cross-listings) · showing ${rowsAll.length} of ${total.toLocaleString()} · market cap and AUM in US$ billions · ratios as reported (TTM / latest quarter). Click a symbol to open it in Research; click a column header to sort.`;
    }catch(e){ if(my!==tok) return; countEl.textContent = 'unavailable'; if(!more) tableEl.innerHTML = ''; noteEl.innerHTML = `<span style="color:var(--down)">Live screener unreachable right now: ${escapeHtml(e.message)}</span>`; }
  }
  function clear(){ document.querySelectorAll('#scrFields input').forEach(i=>i.value=''); ['fCountry','fSector','fExchange'].forEach(id=>{ const e = document.getElementById(id); if(e) e.value=''; }); run(); }
  function preset(id){ const p = PRESETS[id]; if(!p) return; mount(); goto('screener'); document.querySelectorAll('#scrFields input').forEach(i=>i.value=''); ['fSector','fExchange'].forEach(x=>document.getElementById(x).value='');
    document.getElementById('fCountry').value = p.country || '';
    Object.entries(p.f).forEach(([k,[mn,mx]])=>{ if(mn!=null) document.getElementById(`f-${k}-min`).value = mn; if(mx!=null) document.getElementById(`f-${k}-max`).value = mx; });
    sortCol = p.sort || 'market_cap_basic'; sortDir = p.dir || 'desc'; document.getElementById('scrSort').value = sortCol; document.querySelectorAll('#scrDir button').forEach(b=>b.classList.toggle('active', b.dataset.v===sortDir));
    run(); toast(`Preset "${p.label}" applied.`, 'ok'); }
  function csv(){ if(!rowsAll.length) return toast('Run a screen first.', 'warn'); const cols = ['name','description','exchange','country','sector','currency','close',...F.map(f=>f[2])]; const q = v => `"${String(v??'').replace(/"/g,'""')}"`; downloadBlob('screen.csv', [cols.join(','), ...rowsAll.map(r=>cols.map(c=>q(r[c])).join(','))].join('\n'), 'text/csv'); }
  function capture(){ const f = {}; document.querySelectorAll('#view-screener [data-sf], #fCountry, #fSector, #fExchange, #fClass').forEach(i=>{ if(i.value) f[i.id] = i.value; }); f._sort = sortCol; f._dir = sortDir; return f; }
  function restore(f){ mount(); document.querySelectorAll('#scrFields input').forEach(i=>i.value=''); ['fCountry','fSector','fExchange'].forEach(x=>document.getElementById(x).value='');
    const legacy = {fMcap:'f-mcap-min', fPe:'f-pe-max', fRoe:'f-roe-min', fRsi:'f-rsi-max'};
    Object.entries(f||{}).forEach(([k,v])=>{ if(k==='_sort'){ sortCol = v; return; } if(k==='_dir'){ sortDir = v; return; } const el = document.getElementById(legacy[k]||k); if(el) el.value = v; });
    const cls = document.getElementById('fClass').value || 'Equity'; document.querySelectorAll('#scrClass button').forEach(b=>b.classList.toggle('active', b.dataset.v===cls)); applyClass(); }
  return {mount, run, clear, preset, capture, restore, PRESETS};
})();
/* Globals kept for compatibility with saved screens, Research rail and keyboard shortcuts. */
function runScreen(){ return QXSCR.run(); }
function clearScreen(){ return QXSCR.clear(); }
function populateScreenerDropdowns(){ QXSCR.mount(); }
async function saveCurrentScreen(){
  const f = QXSCR.capture(); const n = Object.keys(f).filter(k=>!k.startsWith('_') && k!=='fClass').length;
  if(!n){ toast('Set at least one filter before saving.', 'warn'); return; }
  const name = await askText('Save screen', 'Saves the current filters to Saved Screens (Research rail and Screener presets).', 'e.g. Cheap Indian banks', v=>v.trim()?null:'Enter a name');
  if(!name) return;
  const id = customScreens.length ? Math.max(...customScreens.map(s=>s.id))+1 : 1;
  customScreens.push({id, name:name.trim(), filters:f}); persistCustomScreens(); renderSavedScreensList(); toast(`Saved screen "${name.trim()}".`, 'ok');
}
function runCustomScreen(id){ const s = customScreens.find(x=>x.id===id); if(!s) return; goto('screener'); QXSCR.restore(s.filters); QXSCR.run(); }
function runSavedScreen(key){ const map = {hqc:'quality', osl:'oversold', itb:'india'}; goto('screener'); QXSCR.preset(map[key] || key); }
