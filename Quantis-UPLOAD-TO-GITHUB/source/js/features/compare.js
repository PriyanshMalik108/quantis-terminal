/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/features/compare.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Comparison engine.
 * DEPENDS   data/*
 * EXPOSES   renderCompare (global — classic script, shared scope)
 * LOAD      Classic <script>, order defined in js/manifest.json. Top-level code runs at load,
 *           so it may only call functions from files listed EARLIER in the manifest.
 * NOTE      Migrated verbatim from the single-file build; inline comments marked
 *           "REAL BUG FIXED" / "post-launch fix" document past defects — keep them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* ===================== COMPARE ===================== */
/* ===================== COMPARE (post-launch fix) =====================
   Previously rendered a chip for every single entry in SECURITIES — fine at 6 tickers, an
   unusable wall of 100+ chips once the universe enrichment above (correctly) grew that list.
   Compare now seeds its chip pool from the active workspace's watchlist (a sensible small
   default) plus anything explicitly typed into the new "Add a ticker" box — so it stays a
   comparison of a deliberately chosen few, while still being able to reach any of the full
   universe on request via free text, not just a fixed 6. */
let compareTickerPool = null;
function renderCompare(){
  if(compareTickerPool === null){
    const seed = activeWatchlist();
    compareTickerPool = seed.length ? [...seed] : SECURITIES.slice(0,6).map(s=>s.t);
  }
  const wasActive = new Set([...document.querySelectorAll('#compareChips .chip.active')].map(c=>c.dataset.t));
  const keep = wasActive.size > 0;
  document.getElementById('compareChips').innerHTML = compareTickerPool.map((t,i)=>`<div class="chip ${(keep ? wasActive.has(t) : i<4)?'active':''}" data-t="${escapeHtml(t)}" title="Click to include/exclude">${escapeHtml(t)}<span class="chip-x" data-rm="${escapeHtml(t)}" title="Remove ${escapeHtml(t)}" aria-label="Remove ${escapeHtml(t)}">×</span></div>`).join('')
    + (compareTickerPool.length ? '' : '<div class="qxa-dim">Add securities above to compare them.</div>');
  document.querySelectorAll('#compareChips .chip').forEach(c=>c.addEventListener('click',e=>{ if(e.target.closest('.chip-x')){ e.stopPropagation(); removeCompareTicker(e.target.closest('.chip-x').dataset.rm); return; } c.classList.toggle('active');renderCompareTable();}));
  const inp = document.getElementById('compareAddInput'); if(inp && (typeof QXPICK!=='undefined')) QXPICK.attach(inp, {onPick:t=>addCompareTicker(t)});
  renderCompareTable();
}
function addTickerToCompare(){
  const input = document.getElementById('compareAddInput');
  const statusEl = document.getElementById('compareAddStatus');
  const clean = (input.value||'').trim().toUpperCase();
  if(!clean){ statusEl.textContent = ''; return; }
  const meta = SECURITY_UNIVERSE.find(x=>x.t===clean);
  if(!meta){
    // Not in the built-in list → search every exchange worldwide and add the best match (fixes "compare search not working").
    statusEl.innerHTML = `<span class="qx-spin"></span> Searching worldwide for "${escapeHtml(input.value.trim())}"…`;
    QXS.search(input.value.trim(), ['equity','preferred','etf','fund','index','crypto','fx','commodity']).then(r=>{
      const it = r.items.find(i=>i.kind!=='mf_in');
      if(!it){ statusEl.innerHTML = `<span style="color:var(--down)">No listed security matches "${escapeHtml(input.value.trim())}". Try the ticker or ISIN.</span>`; return; }
      const t = admitTvRow({...it.raw, _s: it.sym}); input.value = ''; addCompareTicker(t);
    }).catch(e=>{ statusEl.innerHTML = `<span style="color:var(--down)">Search failed: ${escapeHtml(e.message)}</span>`; });
    return;
  }
  if(!SECURITIES.some(s=>s.t===clean)) SECURITIES.push(makeSampleSecurityEntry(meta));
  if(!compareTickerPool.includes(clean)) compareTickerPool.push(clean);
  input.value = '';
  statusEl.innerHTML = `<span style="color:var(--up)">Added ${clean}.</span>`;
  renderCompare();
  // make sure the newly-added chip shows as active even though renderCompare only auto-activates the first 4
  const chip = document.querySelector(`#compareChips .chip[data-t="${clean}"]`);
  if(chip && !chip.classList.contains('active')){ chip.classList.add('active'); renderCompareTable(); }
}
/* Adds a ticker (already in the universe) to the comparison and activates it. Used by the picker. */
function addCompareTicker(t){
  if(!t) return; if(compareTickerPool===null) compareTickerPool = [];
  if(!compareTickerPool.includes(t)) compareTickerPool.push(t);
  const st = document.getElementById('compareAddStatus'); if(st) st.innerHTML = `<span style="color:var(--up)">Added ${escapeHtml(t)}.</span>`;
  renderCompare();
  const chip = document.querySelector(`#compareChips .chip[data-t="${CSS.escape(t)}"]`);
  if(chip && !chip.classList.contains('active')){ chip.classList.add('active'); renderCompareTable(); }
}
function removeCompareTicker(t){ compareTickerPool = (compareTickerPool||[]).filter(x=>x!==t); renderCompare(); }
let compareRenderToken = 0;
async function renderCompareTable(){
  const active = [...document.querySelectorAll('#compareChips .chip.active')].map(c=>c.dataset.t);
  const rows = active.map(t=>SECURITIES.find(s=>s.t===t)).filter(Boolean);
  const myToken = ++compareRenderToken;
  const tvOf = {}; rows.forEach(r=>{ if(['Equity','ETF'].includes(r.cls)){ const tv = LD.tvSymbol(r.t); if(tv) tvOf[r.t] = tv; } });
  let fund = {}, fundErr = null;
  const draw = () => {
    const F = (r, k) => fund[r.t] ? fund[r.t][k] : undefined;
    const f1 = v => v==null ? '—' : (v===undefined ? '…' : (+v).toFixed(1));
    const pctv = v => v==null ? '—' : (v===undefined ? '…' : (+v).toFixed(1)+'%');
    const metrics = [
      ['Price', r=>r.px ? fmtPrice(r.px, r.ccy) : '—'],
      ['Day change', r=>r.chgPct!=null ? `<span class="${r.chgPct>=0?'up':'down'}">${r.chgPct>=0?'+':''}${r.chgPct.toFixed(2)}%</span>` : '—'],
      ['1-year return', r=>{ const v=F(r,'Perf.Y'); return v==null||v===undefined ? f1(v) : `<span class="${v>=0?'up':'down'}">${v>=0?'+':''}${v.toFixed(1)}%</span>`; }],
      ['Market cap (US$ B)', r=>{ const v=F(r,'market_cap_basic'); return v==null||v===undefined ? f1(v) : (v/1e9).toFixed(1); }],
      ['P/E (TTM)', r=>f1(F(r,'price_earnings_ttm'))],
      ['P/E (forward)', r=>f1(F(r,'price_earnings_forward_fy'))],
      ['P/B', r=>f1(F(r,'price_book_fq'))],
      ['EV / EBITDA', r=>f1(F(r,'enterprise_value_ebitda_ttm'))],
      ['ROE', r=>pctv(F(r,'return_on_equity'))],
      ['Net margin', r=>pctv(F(r,'net_margin'))],
      ['Revenue growth (YoY)', r=>pctv(F(r,'total_revenue_yoy_growth_ttm'))],
      ['Dividend yield', r=>pctv(F(r,'dividends_yield_current'))],
      ['Gross margin', r=>pctv(F(r,'gross_margin'))],
      ['Operating margin', r=>pctv(F(r,'operating_margin'))],
      ['EPS growth (YoY)', r=>pctv(F(r,'earnings_per_share_diluted_yoy_growth_ttm'))],
      ['Debt / Equity', r=>f1(F(r,'debt_to_equity'))],
      ['Current ratio', r=>f1(F(r,'current_ratio'))],
      ['From 52-week high', r=>{ const h=F(r,'price_52_week_high'); return h && r.px ? `${((r.px/h-1)*100).toFixed(1)}%` : (h===undefined?'…':'—'); }],
      ['Analyst rating', r=>{ const v=F(r,'Recommend.All'); if(v===undefined) return '…'; if(v==null) return '—'; return v>0.5?'Strong buy':v>0.1?'Buy':v>=-0.1?'Neutral':v>=-0.5?'Sell':'Strong sell'; }],
      ['Beta (1Y)', r=>{ const v=F(r,'beta_1_year'); return v==null||v===undefined ? f1(v) : v.toFixed(2); }],
      ['RSI (14)', r=>{ const v=F(r,'RSI'); return v!=null && v!==undefined ? v.toFixed(1) : (r.rsi ?? '—'); }],
      ['Sector', r=>escapeHtml(F(r,'sector') || r.sector || '—')],
      ['Currency', r=>r.ccy],
    ];
    let html = `<thead><tr><th>Metric</th>${rows.map(r=>`<th>${escapeHtml(r.t)}</th>`).join('')}</tr></thead><tbody>`;
    // Highlight the best value in each comparable row (higher is better unless listed in LOWER).
    const LOWER = new Set(['P/E (TTM)','P/E (forward)','P/B','EV / EBITDA','Debt / Equity','Beta (1Y)']);
    const num = h => { const m = /(-?\d[\d,]*\.?\d*)/.exec(String(h).replace(/<[^>]+>/g,'')); return m ? parseFloat(m[1].replace(/,/g,'')) : null; };
    metrics.forEach(m=>{
      const cells = rows.map(r=>m[1](r)); let best = -1;
      if(rows.length > 1 && !['Price','Sector','Currency','Analyst rating','From 52-week high','RSI (14)','Day change'].includes(m[0])){
        const vals = cells.map(num); const ok = vals.map((v,i)=>v!=null && !(LOWER.has(m[0]) && v<=0) ? i : -1).filter(i=>i>=0);
        if(ok.length > 1) best = ok.reduce((a,b)=> (LOWER.has(m[0]) ? vals[b] < vals[a] : vals[b] > vals[a]) ? b : a);
      }
      html += `<tr><td style="font-family:var(--sans);color:var(--text-1);">${m[0]}</td>${cells.map((c,i)=>`<td class="${i===best?'cmp-best':''}">${c}</td>`).join('')}</tr>`;
    });
    html += '</tbody>';
    document.getElementById('compareTable').innerHTML = html;
    const srcEl = document.getElementById('compareSourceNote');
    if(srcEl) srcEl.innerHTML = fundErr ? `<span style="color:var(--down)">Live fundamentals unavailable right now: ${escapeHtml(fundErr)}</span>` : `<span class="badge fact">LIVE</span> Prices via CNBC; valuation, profitability and momentum via TradingView. Market cap converted to US$ for comparability.`;
  };
  if(!document.getElementById('compareSourceNote')){
    const t = document.getElementById('compareTable');
    if(t && t.parentElement){ const n = document.createElement('div'); n.id = 'compareSourceNote'; n.className = 'notebox'; n.style.marginTop = '8px'; t.insertAdjacentElement('afterend', n); }
  }
  draw();
  const tvSyms = Object.values(tvOf);
  if(tvSyms.length){
    try{
      const {rows: tvRows} = await LD.tvScan('global', {symbols:{tickers:tvSyms}, columns:['gross_margin','operating_margin','earnings_per_share_diluted_yoy_growth_ttm','debt_to_equity','current_ratio','price_52_week_high','Recommend.All','market_cap_basic','price_earnings_ttm','price_earnings_forward_fy','price_book_fq','enterprise_value_ebitda_ttm','return_on_equity','net_margin','total_revenue_yoy_growth_ttm','dividends_yield_current','beta_1_year','RSI','Perf.Y','sector']});
      if(myToken !== compareRenderToken) return;
      const bySym = {}; tvRows.forEach(x=>bySym[x._s]=x);
      Object.entries(tvOf).forEach(([t, tv])=>{ fund[t] = bySym[tv] || {}; });
      rows.forEach(r=>{ if(!fund[r.t]) fund[r.t] = {}; });
    }catch(e){ if(myToken !== compareRenderToken) return; fundErr = e.message; rows.forEach(r=>{ fund[r.t] = {}; }); }
    draw();
  } else { rows.forEach(r=>{ fund[r.t] = {}; }); draw(); }

  renderComparePerf(rows.map(r=>r.t), myToken);
  const currencies = new Set(rows.map(r=>r.ccy));
  const warnEl = document.getElementById('compareCurrencyWarn');
  if(!warnEl) return;
  if(currencies.size <= 1){ warnEl.style.display='none'; return; }
  warnEl.style.display='block';
  warnEl.innerHTML = `<span style="color:var(--amber)">⚠</span> These securities trade in different currencies (${[...currencies].join(', ')}) — the Price row above is each one's own native currency, NOT directly comparable as raw numbers. Fetching live conversion to a common currency…`;
  try{
    const rates = {};
    for(const ccy of currencies) rates[ccy] = await getFxRateToUsd(ccy);
    const convertedRow = rows.map(r=>'$'+(r.px * rates[r.ccy]).toFixed(2)).join(' · ');
    warnEl.innerHTML = `<span style="color:var(--amber)">⚠</span> Different currencies (${[...currencies].join(', ')}) — Price row above is native, not directly comparable. <b>Converted to USD (live FX via Frankfurter/ECB):</b> ${rows.map((r,i)=>r.t+' '+convertedRow.split(' · ')[i]).join(' · ')}`;
  }catch(e){
    warnEl.innerHTML = `<span style="color:var(--amber)">⚠</span> Different currencies (${[...currencies].join(', ')}) — Price row above is native, not directly comparable. Live conversion failed: ${escapeHtml(e.message)}`;
  }
}

/* Relative performance chart: every selected security rebased to 100 over the chosen period, so
   different currencies and price levels compare fairly (pure % performance). */
let comparePerfChart = null, comparePerfRange = '1Y';
async function renderComparePerf(tickers, token){
  let card = document.getElementById('comparePerfCard');
  if(!card){
    const after = document.getElementById('compareSourceNote') || document.getElementById('compareTable');
    card = document.createElement('div'); card.className = 'card'; card.id = 'comparePerfCard'; card.style.marginTop = '12px';
    card.innerHTML = `<h3>Relative performance <span class="qxa-dim" style="text-transform:none;letter-spacing:0;font-weight:400">rebased to 100</span></h3>
      <div class="seg" id="comparePerfRange">${['1M','3M','6M','YTD','1Y','3Y','5Y'].map(r=>`<button type="button" data-r="${r}" class="${r===comparePerfRange?'active':''}">${r}</button>`).join('')}</div>
      <div style="position:relative;height:300px;margin-top:8px"><canvas id="comparePerfCanvas"></canvas></div><div class="qxa-dim" id="comparePerfNote" style="margin-top:6px"></div>`;
    (after.closest('.tbl-scroll') || after).insertAdjacentElement('afterend', card);
    card.querySelector('#comparePerfRange').addEventListener('click', e=>{ const b = e.target.closest('button'); if(!b) return; comparePerfRange = b.dataset.r; card.querySelectorAll('#comparePerfRange button').forEach(x=>x.classList.toggle('active', x===b)); renderComparePerf([...document.querySelectorAll('#compareChips .chip.active')].map(c=>c.dataset.t), compareRenderToken); });
  }
  const note = card.querySelector('#comparePerfNote');
  if(!tickers.length){ note.textContent = 'Select at least one security.'; return; }
  note.innerHTML = '<span class="qx-spin"></span> Loading price history…';
  const days = {'1M':31,'3M':92,'6M':183,'1Y':366,'3Y':1096,'5Y':1827}[comparePerfRange];
  const startSec = comparePerfRange==='YTD' ? Date.UTC(new Date().getUTCFullYear(),0,1)/1000 : Date.now()/1000 - days*86400;
  const series = await Promise.all(tickers.map(async t=>{ try{ const B = await QXC.loadBars(t, comparePerfRange==='3Y'||comparePerfRange==='5Y' ? '1W' : '1D'); const pts = []; for(let i=0;i<B.time.length;i++) if(B.time[i] >= startSec) pts.push([B.time[i], B.close[i]]); return {t, pts}; }catch(e){ return {t, pts:[], err:e.message}; } }));
  if(token !== compareRenderToken) return;
  const dateKeys = [...new Set(series.flatMap(s=>s.pts.map(p=>new Date(p[0]*1000).toISOString().slice(0,10))))].sort();
  const pal = ['#D9A441','#4F8CFF','#3ECF8E','#FF5C6C','#B07CFF','#2DD4BF','#F472B6','#94A3B8'];
  const datasets = series.filter(s=>s.pts.length>1).map((s,i)=>{ const base = s.pts[0][1]; const map = new Map(s.pts.map(p=>[new Date(p[0]*1000).toISOString().slice(0,10), p[1]/base*100]));
    let last = null; const data = dateKeys.map(d=>{ if(map.has(d)) last = map.get(d); return last; });
    return {label:s.t, data, borderColor:pal[i%pal.length], backgroundColor:pal[i%pal.length], borderWidth:2, pointRadius:0, tension:0.1, spanGaps:true}; });
    if(typeof Chart==='undefined'){ return; } // chart library blocked — numbers above still work
  const ctx = card.querySelector('#comparePerfCanvas');
  if(comparePerfChart){ try{ comparePerfChart.destroy(); }catch(e){} }
  comparePerfChart = new Chart(ctx, {type:'line', data:{labels:dateKeys, datasets}, options:{responsive:true, maintainAspectRatio:false, animation:{duration:500}, interaction:{mode:'index', intersect:false},
    plugins:{legend:{labels:{color:cssVar('--text-1'), boxWidth:12}}, tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${c.parsed.y!=null?(c.parsed.y-100>=0?'+':'')+(c.parsed.y-100).toFixed(2)+'%':'—'}`}}},
    scales:{x:{ticks:{color:cssVar('--text-2'), maxTicksLimit:8}, grid:{display:false}}, y:{ticks:{color:cssVar('--text-2')}, grid:{color:cssVar('--line')}}}}});
  const failed = series.filter(s=>s.pts.length<2).map(s=>s.t);
  note.textContent = datasets.map(d=>{ const v = d.data.filter(x=>x!=null); return `${d.label} ${v.length?((v[v.length-1]-100)>=0?'+':'')+(v[v.length-1]-100).toFixed(1)+'%':'—'}`; }).join(' · ') + (failed.length ? ` · no history for ${failed.join(', ')}` : '') + ` · ${comparePerfRange}`;
}
