/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/features/macro-global.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Global macro workspace at the top of the Macro view:
 *             • Pick ANY of ~217 economies (searchable). Choice is remembered.
 *             • 16 headline indicators from World Bank Open Data — latest value, year, change
 *               vs the prior year and a 15-year sparkline. Click a tile to chart it.
 *             • Country markets strip: benchmark index, 10-year government bond yield and the
 *               currency vs USD (TradingView, where listed).
 *             • Compare: chart any indicator for the selected economy against up to 6 others
 *               over 5 / 10 / 20 / 30 years; export the data as CSV.
 *           The US high-frequency releases (BLS, BEA, Fed, CFTC…) stay below, under their own heading.
 * DATA      api.worldbank.org (keyless, CORS-open, annual data, latest year usually t-1),
 *           scanner.tradingview.com (keyless) for market data.
 * EXPOSES   QXMG.{mount(), setCountry(iso2)}
 * ─────────────────────────────────────────────────────────────────────────────
 */
const QXMG = (() => {
  const IND = [
    ['NY.GDP.MKTP.KD.ZG','Real GDP growth','%','Growth'],['NY.GDP.MKTP.CD','GDP (current US$)','usd','Growth'],['NY.GDP.PCAP.CD','GDP per capita (US$)','usd','Growth'],
    ['FP.CPI.TOTL.ZG','Inflation (CPI)','%','Prices'],['NY.GDP.DEFL.KD.ZG','GDP deflator inflation','%','Prices'],
    ['SL.UEM.TOTL.ZS','Unemployment','%','Labour'],['SP.POP.TOTL','Population','num','Labour'],
    ['BN.CAB.XOKA.GD.ZS','Current account (% of GDP)','%','External'],['NE.EXP.GNFS.ZS','Exports (% of GDP)','%','External'],['NE.IMP.GNFS.ZS','Imports (% of GDP)','%','External'],
    ['BX.KLT.DINV.WD.GD.ZS','FDI net inflows (% of GDP)','%','External'],['FI.RES.TOTL.CD','Total reserves (US$)','usd','External'],
    ['GC.DOD.TOTL.GD.ZS','Central government debt (% of GDP)','%','Fiscal'],['GC.REV.XGRT.GD.ZS','Government revenue (% of GDP)','%','Fiscal'],
    ['FR.INR.LEND','Lending interest rate','%','Rates'],['FR.INR.RINR','Real interest rate','%','Rates'],
  ].map(([id,name,unit,group])=>({id,name,unit,group}));
  const CCY = {US:'USD',IN:'INR',GB:'GBP',DE:'EUR',FR:'EUR',IT:'EUR',ES:'EUR',NL:'EUR',BE:'EUR',AT:'EUR',PT:'EUR',IE:'EUR',FI:'EUR',GR:'EUR',JP:'JPY',CN:'CNY',HK:'HKD',KR:'KRW',TW:'TWD',SG:'SGD',MY:'MYR',TH:'THB',ID:'IDR',PH:'PHP',VN:'VND',AU:'AUD',NZ:'NZD',CA:'CAD',BR:'BRL',MX:'MXN',AR:'ARS',CL:'CLP',CO:'COP',PE:'PEN',ZA:'ZAR',NG:'NGN',EG:'EGP',KE:'KES',SA:'SAR',AE:'AED',QA:'QAR',KW:'KWD',IL:'ILS',TR:'TRY',RU:'RUB',PL:'PLN',CZ:'CZK',HU:'HUF',RO:'RON',SE:'SEK',NO:'NOK',DK:'DKK',CH:'CHF',PK:'PKR',BD:'BDT',LK:'LKR',NP:'NPR',MA:'MAD'};
  const COUNTRY_TV = {US:'United States',GB:'United Kingdom',KR:'South Korea',AE:'UAE',RU:'Russia'};
  const LS = (k,d)=>{ try{ return JSON.parse(safeStorage.getItem(k)) ?? d; }catch(e){ return d; } }, SS = (k,v)=>{ try{ safeStorage.setItem(k, JSON.stringify(v)); }catch(e){} };
  let st = LS('quantis_macro_v2', {c:'IN', cmp:['US','CN','GB','JP'], ind:'NY.GDP.MKTP.KD.ZG', yrs:20});
  let countries = [], chart = null, tok = 0;
  const fmt = (v, u) => v==null || !isFinite(v) ? '—' : u==='%' ? v.toFixed(2)+'%' : u==='usd' ? '$'+(Math.abs(v)>=1e12?(v/1e12).toFixed(2)+'T':Math.abs(v)>=1e9?(v/1e9).toFixed(1)+'B':Math.abs(v)>=1e6?(v/1e6).toFixed(1)+'M':v.toLocaleString(undefined,{maximumFractionDigits:0})) : (Math.abs(v)>=1e9?(v/1e9).toFixed(2)+'B':Math.abs(v)>=1e6?(v/1e6).toFixed(1)+'M':v.toLocaleString());
  async function wb(path){ const r = await fetchWithTimeout('https://api.worldbank.org/v2/'+path+(path.includes('?')?'&':'?')+'format=json&per_page=2000', {}, 15000); if(!r.ok) throw new Error('World Bank HTTP '+r.status); const j = await r.json(); if(!Array.isArray(j) || !j[1]) throw new Error((j&&j[0]&&j[0].message&&j[0].message[0]&&j[0].message[0].value) || 'no data'); return j[1]; }
  async function loadCountries(){
    if(countries.length) return countries;
    const rows = await cachedJson('wb_countries_v1', 30*86400e3, ()=>wb('country'));
    countries = rows.filter(x=>x.region && x.region.id!=='NA').map(x=>({iso2:x.iso2Code, iso3:x.id, name:x.name, region:x.region.value, income:x.incomeLevel.value, capital:x.capitalCity})).sort((a,b)=>a.name.localeCompare(b.name));
    return countries;
  }
  const cName = iso2 => (countries.find(c=>c.iso2===iso2)||{name:iso2}).name;
  function mount(){
    const body = document.querySelector('#view-macro .viewbody'); if(!body || body.dataset.mg) return; body.dataset.mg = '1';
    const sec = document.createElement('div'); sec.id = 'macroGlobal';
    sec.innerHTML = `<div class="card mg-head"><div class="mg-pick"><div style="flex:1;min-width:220px"><label class="qx-lbl">Economy</label><input id="mgCountry" class="qx-input" placeholder="Search a country or region…" list="mgCountryList" autocomplete="off"><datalist id="mgCountryList"></datalist></div>
        <div class="mg-meta" id="mgMeta"></div></div><div class="mg-markets" id="mgMarkets"></div></div>
      <div class="mg-grid" id="mgTiles"></div>
      <div class="card" style="margin-top:12px"><h3>Compare economies <span class="dc-sub" id="mgCmpTitle"></span></h3>
        <div class="corr-row"><div style="min-width:220px;flex:1"><label class="qx-lbl">Indicator</label><select id="mgInd" class="qx-select">${[...new Set(IND.map(i=>i.group))].map(g=>`<optgroup label="${g}">${IND.filter(i=>i.group===g).map(i=>`<option value="${i.id}">${i.name}</option>`).join('')}</optgroup>`).join('')}</select></div>
          <div><label class="qx-lbl">Period</label><div class="seg" id="mgYrs">${[5,10,20,30].map(y=>`<button type="button" data-v="${y}">${y}Y</button>`).join('')}</div></div>
          <div style="min-width:220px;flex:1"><label class="qx-lbl">Add a country to compare (max 6)</label><input id="mgAddCmp" class="qx-input" list="mgCountryList" placeholder="e.g. Brazil" autocomplete="off"></div>
          <div style="align-self:flex-end"><button type="button" class="btn secondary small" id="mgCsv">Export CSV</button></div></div>
        <div id="mgCmpChips" class="chiprow" style="margin-top:8px"></div>
        <div style="position:relative;height:320px;margin-top:8px"><canvas id="mgChart"></canvas></div><div class="qxa-dim" id="mgNote" style="margin-top:6px"></div></div>
      <h3 class="mg-us-head">United States — high-frequency releases</h3>`;
    body.insertBefore(sec, body.firstChild);
    // the old single-country World Bank card is superseded by this workspace
    const old = document.getElementById('wbCountrySelect')?.closest('.card'); if(old) old.hidden = true;
    sec.querySelector('#mgInd').value = st.ind;
    sec.querySelector('#mgInd').addEventListener('change', e=>{ st.ind = e.target.value; SS('quantis_macro_v2', st); compare(); });
    sec.querySelector('#mgYrs').addEventListener('click', e=>{ const b = e.target.closest('button'); if(!b) return; st.yrs = +b.dataset.v; SS('quantis_macro_v2', st); syncSeg(); compare(); });
    const pickCountry = (inp, cb) => inp.addEventListener('change', ()=>{ const v = inp.value.trim().toLowerCase(); const c = countries.find(x=>x.name.toLowerCase()===v || x.iso2.toLowerCase()===v || x.iso3.toLowerCase()===v) || countries.find(x=>x.name.toLowerCase().startsWith(v)); if(c){ cb(c); inp.value = cb===setFromInput ? c.name : ''; } else toast('Country not found — pick from the list.', 'warn'); });
    const setFromInput = c => setCountry(c.iso2);
    pickCountry(sec.querySelector('#mgCountry'), setFromInput);
    pickCountry(sec.querySelector('#mgAddCmp'), c=>{ if(c.iso2===st.c || st.cmp.includes(c.iso2)) return; if(st.cmp.length >= 6) return toast('Up to 6 comparison economies.', 'warn'); st.cmp.push(c.iso2); SS('quantis_macro_v2', st); compare(); });
    sec.querySelector('#mgCmpChips').addEventListener('click', e=>{ const x = e.target.closest('[data-rm]'); if(x){ st.cmp = st.cmp.filter(c=>c!==x.dataset.rm); SS('quantis_macro_v2', st); compare(); } });
    sec.querySelector('#mgTiles').addEventListener('click', e=>{ const t = e.target.closest('[data-ind]'); if(t){ st.ind = t.dataset.ind; sec.querySelector('#mgInd').value = st.ind; SS('quantis_macro_v2', st); compare(); sec.querySelector('#mgChart').scrollIntoView({behavior:'smooth', block:'center'}); } });
    sec.querySelector('#mgCsv').addEventListener('click', csv);
    syncSeg();
    loadCountries().then(()=>{ sec.querySelector('#mgCountryList').innerHTML = countries.map(c=>`<option value="${escapeHtml(c.name)}">${c.iso2} · ${escapeHtml(c.region)}</option>`).join(''); sec.querySelector('#mgCountry').value = cName(st.c); render(); })
      .catch(e=>{ sec.querySelector('#mgTiles').innerHTML = `<div class="notebox">World Bank data unreachable: ${escapeHtml(e.message)}</div>`; });
  }
  function syncSeg(){ document.querySelectorAll('#mgYrs button').forEach(b=>b.classList.toggle('active', +b.dataset.v===st.yrs)); }
  function setCountry(iso2){ st.c = iso2; st.cmp = st.cmp.filter(c=>c!==iso2); SS('quantis_macro_v2', st); render(); }
  async function render(){
    const my = ++tok, c = countries.find(x=>x.iso2===st.c) || {iso2:st.c, name:st.c};
    document.getElementById('mgMeta').innerHTML = `<b>${escapeHtml(c.name)}</b><span>${escapeHtml(c.region||'')}${c.income?' · '+escapeHtml(c.income):''}${c.capital?' · capital '+escapeHtml(c.capital):''}</span>`;
    const tiles = document.getElementById('mgTiles');
    tiles.innerHTML = IND.map(()=>'<div class="qx-skel" style="height:96px"></div>').join('');
    markets(c);
    const start = new Date().getFullYear() - 16;
    const res = await Promise.all(IND.map(async ind=>{ try{ const rows = await cachedJson(`wb_${st.c}_${ind.id}_${start}`, 12*3600e3, ()=>wb(`country/${st.c}/indicator/${ind.id}?date=${start}:${new Date().getFullYear()}`)); return {ind, pts: rows.filter(r=>r.value!=null).map(r=>[+r.date, r.value]).sort((a,b)=>a[0]-b[0])}; }catch(e){ return {ind, pts:[], err:e.message}; } }));
    if(my!==tok) return;
    tiles.innerHTML = res.map(({ind, pts})=>{
      const last = pts[pts.length-1], prev = pts[pts.length-2];
      const d = last && prev ? (ind.unit==='%' ? last[1]-prev[1] : (last[1]/prev[1]-1)*100) : null;
      const sp = spark(pts.map(p=>p[1]));
      return `<button type="button" class="mg-tile ${ind.id===st.ind?'active':''}" data-ind="${ind.id}" title="Click to chart ${escapeHtml(ind.name)} and compare"><span>${escapeHtml(ind.name)}</span><b>${last?fmt(last[1], ind.unit):'—'}</b>
        <i>${last?last[0]:'no data'}${d!=null?` · <em class="${d>=0?'up':'down'}">${d>=0?'+':''}${d.toFixed(2)}${ind.unit==='%'?' pts':'%'} y/y</em>`:''}</i>${sp}</button>`;
    }).join('');
    compare();
  }
  function spark(v){ if(v.length < 3) return ''; const mn = Math.min(...v), mx = Math.max(...v), w = 120, h = 26; const pts = v.map((x,i)=>`${(i/(v.length-1)*w).toFixed(1)},${(h-(mx===mn?h/2:(x-mn)/(mx-mn)*h)).toFixed(1)}`).join(' '); return `<svg class="mg-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${pts}"/></svg>`; }
  async function markets(c){
    const el = document.getElementById('mgMarkets'); if(!el) return;
    const idx = (typeof QXH!=='undefined' ? QXH.IDX : []).filter(x=>x.country===(COUNTRY_TV[c.iso2]||c.name)).slice(0,2);
    const ccy = CCY[c.iso2];
    const syms = [...idx.map(x=>x.sym), `TVC:${c.iso2}10Y`, ...(ccy && ccy!=='USD' ? [`FX_IDC:USD${ccy}`] : ccy==='USD' ? ['TVC:DXY'] : [])];
    el.innerHTML = '<div class="qx-skel" style="height:54px"></div>';
    try{
      const {rows} = await LD.tvScan('global', {symbols:{tickers:syms}, columns:['description','close','change','Perf.Y']}); const by = Object.fromEntries(rows.map(r=>[r._s, r]));
      const tile = (lbl, r, unit='') => `<div class="mg-mk"><span>${escapeHtml(lbl)}</span><b>${r&&isFinite(r.close)?r.close.toLocaleString(undefined,{maximumFractionDigits:r.close<20?3:2})+unit:'—'}</b><i class="${r&&r.change>=0?'up':'down'}">${r&&isFinite(r.change)?(r.change>=0?'+':'')+r.change.toFixed(2)+'% today':'not listed'}${r&&isFinite(r['Perf.Y'])?' · 1Y '+(r['Perf.Y']>=0?'+':'')+r['Perf.Y'].toFixed(1)+'%':''}</i></div>`;
      el.innerHTML = idx.map(x=>tile(x.name, by[x.sym])).join('') + tile('10-year govt bond yield', by[`TVC:${c.iso2}10Y`], '%') + (ccy && ccy!=='USD' ? tile(`USD / ${ccy}`, by[`FX_IDC:USD${ccy}`]) : ccy==='USD' ? tile('US Dollar Index', by['TVC:DXY']) : '');
    }catch(e){ el.innerHTML = `<div class="qxa-dim">Market data unavailable: ${escapeHtml(e.message)}</div>`; }
  }
  let lastData = null;
  async function compare(){
    const ind = IND.find(i=>i.id===st.ind) || IND[0]; const list = [st.c, ...st.cmp];
    document.getElementById('mgCmpTitle').textContent = `${ind.name} · World Bank`;
    document.getElementById('mgCmpChips').innerHTML = list.map((c,i)=>`<span class="chip ${i===0?'active':''}">${escapeHtml(cName(c))}${i?`<span class="chip-x" data-rm="${c}" title="Remove">×</span>`:''}</span>`).join('');
    const start = new Date().getFullYear() - st.yrs; const note = document.getElementById('mgNote'); note.innerHTML = '<span class="qx-spin"></span> Loading…';
    try{
      const rows = await cachedJson(`wbc_${list.join(';')}_${ind.id}_${start}`, 12*3600e3, ()=>wb(`country/${list.join(';')}/indicator/${ind.id}?date=${start}:${new Date().getFullYear()}`));
      const years = [...new Set(rows.map(r=>+r.date))].sort((a,b)=>a-b);
      const pal = ['#D9A441','#4F8CFF','#3ECF8E','#FF5C6C','#B07CFF','#2DD4BF','#F472B6'];
      const ds = list.map((c,i)=>{ const m = new Map(rows.filter(r=>r.country.id===c || r.countryiso3code===(countries.find(x=>x.iso2===c)||{}).iso3).filter(r=>r.value!=null).map(r=>[+r.date, r.value])); return {label:cName(c), data:years.map(y=>m.has(y)?m.get(y):null), borderColor:pal[i%pal.length], backgroundColor:pal[i%pal.length], borderWidth:i===0?3:2, pointRadius:0, tension:.2, spanGaps:true}; });
      lastData = {ind, years, ds};
    if(typeof Chart==='undefined'){ return; } // chart library blocked — numbers above still work
      if(chart){ try{ chart.destroy(); }catch(e){} }
      chart = new Chart(document.getElementById('mgChart'), {type:'line', data:{labels:years, datasets:ds}, options:{responsive:true, maintainAspectRatio:false, animation:{duration:500}, interaction:{mode:'index', intersect:false},
        plugins:{legend:{labels:{color:cssVar('--text-1'), boxWidth:12}}, tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${fmt(c.parsed.y, ind.unit)}`}}},
        scales:{x:{ticks:{color:cssVar('--text-2'), maxTicksLimit:10}, grid:{display:false}}, y:{ticks:{color:cssVar('--text-2'), callback:v=>fmt(v, ind.unit)}, grid:{color:cssVar('--line')}}}}});
      const lastYear = Math.max(...years.filter(y=>ds.some(d=>d.data[years.indexOf(y)]!=null)));
      note.textContent = `Annual data, World Bank Open Data (indicator ${ind.id}). Latest available year: ${isFinite(lastYear)?lastYear:'—'}. Gaps mean the country has not reported that year.`;
    }catch(e){ note.textContent = 'Comparison unavailable: '+e.message; }
  }
  function csv(){ if(!lastData) return; const {ind, years, ds} = lastData; const lines = [['Year', ...ds.map(d=>d.label)].join(','), ...years.map((y,i)=>[y, ...ds.map(d=>d.data[i]??'')].join(','))]; downloadBlob(`${ind.id}_${st.yrs}y.csv`, lines.join('\n'), 'text/csv'); }
  return {mount, setCountry};
})();
