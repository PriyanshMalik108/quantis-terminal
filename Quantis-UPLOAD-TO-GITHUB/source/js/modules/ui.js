/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/modules/ui.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Market heatmap (squarified treemap), global sortable tables, price flash.
 * DEPENDS   LD.tvScan, cachedFetch
 * EXPOSES   QXU (single global namespace object — keep new public functions on it)
 * PATTERN   IIFE module: private helpers stay inside the closure; only the returned object is global.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* =====================================================================================
   QUANTIS UI — market heatmap (treemap), sortable tables, price flash, view wiring
   ===================================================================================== */
const QXU = (() => {
  /* ---------- squarified treemap (Bruls, Huizing & van Wijk 2000) ---------- */
  function squarify(items, x, y, w, h){
    const out = [], total = items.reduce((a,b)=>a+b.v,0); if(!total || w<=0 || h<=0) return out;
    const scale = w*h/total; let rest = items.map(i=>({...i, a:i.v*scale}));
    while(rest.length){
      const short = Math.min(w,h); let row = [], best = Infinity;
      for(let i=0;i<rest.length;i++){
        const trial = row.concat(rest[i]); const s = trial.reduce((a,b)=>a+b.a,0), mx = Math.max(...trial.map(t=>t.a)), mn = Math.min(...trial.map(t=>t.a));
        const worst = Math.max(short*short*mx/(s*s), (s*s)/(short*short*mn));
        if(worst <= best){ best = worst; row = trial; } else break;
      }
      const s = row.reduce((a,b)=>a+b.a,0);
      if(w >= h){ const cw = s/h; let yy = y; row.forEach(r=>{ const ch = r.a/cw; out.push({...r, x, y:yy, w:cw, h:ch}); yy += ch; }); x += cw; w -= cw; }
      else { const ch = s/w; let xx = x; row.forEach(r=>{ const cw = r.a/ch; out.push({...r, x:xx, y, w:cw, h:ch}); xx += cw; }); y += ch; h -= ch; }
      rest = rest.slice(row.length);
    }
    return out;
  }
  const color = p => { if(p==null||!isFinite(p)) return 'var(--bg-3)'; const t = Math.min(1, Math.abs(p)/3); const a = 0.18 + t*0.72; return p>=0 ? `rgba(46,170,110,${a})` : `rgba(230,72,88,${a})`; };
  let hmTok = 0;
  async function heatmap(){
    const box = document.getElementById('qxHeatmap'); if(!box) return;
    const market = (document.getElementById('dashMarket')||{}).value || 'america';
    const my = ++hmTok; const badge = document.getElementById('qxHeatBadge');
    try{
      const {rows} = await cachedFetch('qxheat_'+market, 3*60e3, ()=>LD.tvScan(market, {filter:[{left:'type',operation:'equal',right:'stock'},{left:'is_primary',operation:'equal',right:true}], columns:['name','description','market_cap_basic','change','sector','close','currency'], sort:{sortBy:'market_cap_basic',sortOrder:'desc'}, range:[0,90]}));
      if(my!==hmTok) return;
      const W = box.clientWidth || 900, H = Math.max(320, Math.min(520, W*0.48));
      const bySec = {}; rows.filter(r=>r.market_cap_basic>0 && r.sector).forEach(r=>{ (bySec[r.sector] = bySec[r.sector] || []).push(r); });
      const secs = Object.entries(bySec).map(([k,v])=>({k, v:v.reduce((a,b)=>a+b.market_cap_basic,0), items:v})).sort((a,b)=>b.v-a.v);
      const rects = squarify(secs, 0, 0, W, H);
      let html = '';
      rects.forEach(sr=>{
        const head = sr.h > 40 && sr.w > 60 ? 16 : 0;
        html += `<div class="qxh-sec" style="left:${sr.x}px;top:${sr.y}px;width:${sr.w}px;height:${sr.h}px">${head?`<div class="qxh-sh">${escapeHtml(sr.k)}</div>`:''}</div>`;
        squarify(sr.items.map(r=>({...r, v:r.market_cap_basic})).sort((a,b)=>b.v-a.v), sr.x+1, sr.y+1+head, sr.w-2, sr.h-2-head).forEach(t=>{
          const big = t.w>70 && t.h>36, mid = t.w>38 && t.h>22; const sym = String(t._s||'').split(':')[1] || t.name;
          html += `<div class="qxh-t" data-tv="${escapeHtml(t._s)}" style="left:${t.x}px;top:${t.y}px;width:${Math.max(0,t.w-1)}px;height:${Math.max(0,t.h-1)}px;background:${color(t.change)}" title="${escapeHtml(t.description||sym)} · ${escapeHtml(t.sector)}\n${t.change>=0?'+':''}${(t.change||0).toFixed(2)}% · mkt cap ${fmtMarketCapShort(t.market_cap_basic, /^GB[pX]$/.test(t.currency)?'GBP':t.currency)}">${mid?`<b style="font-size:${big?Math.min(18,Math.max(11,t.w/7)):10}px">${escapeHtml(sym)}</b>${big?`<span>${t.change>=0?'+':''}${(t.change||0).toFixed(2)}%</span>`:''}`:''}</div>`;
        });
      });
      box.style.height = H+'px'; box.innerHTML = html;
      if(badge){ badge.textContent = 'LIVE'; badge.className = 'badge fact'; }
      const note = document.getElementById('qxHeatNote'); if(note) note.textContent = `Largest ${rows.length} primary listings by market value · size = market cap · colour = today's % change (full colour at ±3%) · TradingView · ${new Date().toLocaleTimeString()}`;
    }catch(e){ if(my!==hmTok) return; box.innerHTML = `<div class="notebox">Heatmap unavailable: ${escapeHtml(e.message)}</div>`; if(badge){ badge.textContent='UNAVAILABLE'; badge.className='badge assume'; } }
  }
  function mountHeatmap(){
    if(document.getElementById('qxHeatmap')) return;
    const g = document.querySelector('#view-dashboard .viewbody > .grid-4'); if(!g) return;
    const card = document.createElement('div'); card.className = 'card'; card.style.marginBottom = '12px';
    card.innerHTML = `<h3>Market Heatmap <span id="qxHeatBadge" class="badge assume">LOADING</span></h3><div id="qxHeatmap" class="qxh"></div><div class="qxa-dim" id="qxHeatNote" style="margin-top:6px"></div>`;
    g.after(card);
    card.querySelector('#qxHeatmap').addEventListener('click', e=>{ const t = e.target.closest('.qxh-t'); if(!t) return; const tv = t.dataset.tv; const hit = SECURITY_UNIVERSE.find(x=>LD.tvSymbol(x.t)===tv) || SECURITIES.find(x=>LD.tvSymbol(x.t)===tv); if(hit){ goto('research'); selectSecurity(hit.t); } else toast(`${tv} isn't in the built-in universe yet — find it with Ctrl+K.`, 'warn'); });
    const sel = document.getElementById('dashMarket'); if(sel) sel.addEventListener('change', heatmap);
    let rt; window.addEventListener('resize', ()=>{ clearTimeout(rt); rt = setTimeout(()=>{ if(document.getElementById('view-dashboard').classList.contains('active')) heatmap(); }, 250); });
    heatmap(); setInterval(()=>{ if(document.visibilityState==='visible' && document.getElementById('view-dashboard').classList.contains('active')) heatmap(); }, 3*60e3);
  }

  /* ---------- sortable tables (any .datatable with a header row) ---------- */
  const parseCell = s => { const t = String(s).replace(/[,\s]/g,'').replace(/[−–]/g,'-'); const m = /^[^\d-+.]*([-+]?\d*\.?\d+)\s*([KMBT%×x]?)/i.exec(t); if(!m || t==='—' || t==='-') return null; const mult = {K:1e3,M:1e6,B:1e9,T:1e12}[m[2].toUpperCase()]||1; return parseFloat(m[1])*mult; };
  document.addEventListener('click', e=>{
    const th = e.target.closest('table.datatable thead th'); if(!th || th.closest('[data-nosort]') || th.querySelector('input,select,button')) return;
    const table = th.closest('table'), tb = table.tBodies[0]; if(!tb || tb.rows.length < 2) return;
    if([...tb.rows].some(r=>r.classList.contains('qxa-explain'))) return; // tables with expandable detail rows keep their order
    const idx = [...th.parentElement.children].indexOf(th), dir = th.dataset.sort === 'desc' ? 'asc' : 'desc';
    th.parentElement.querySelectorAll('th').forEach(x=>delete x.dataset.sort); th.dataset.sort = dir; table.classList.add('qx-sortable');
    const rows = [...tb.rows]; rows.sort((a,b)=>{ const x = a.cells[idx]?.textContent.trim() ?? '', y = b.cells[idx]?.textContent.trim() ?? ''; const nx = parseCell(x), ny = parseCell(y);
      const r = (nx!=null && ny!=null) ? nx-ny : (nx!=null ? -1 : ny!=null ? 1 : x.localeCompare(y)); return dir==='asc' ? r : -r; });
    rows.forEach(r=>tb.appendChild(r));
  });
  document.addEventListener('mouseover', e=>{ const th = e.target.closest('table.datatable thead th'); if(th) th.closest('table').classList.add('qx-sortable'); }, {passive:true});

  /* ---------- price flash on the research header ---------- */
  let lastPx = null, lastT = null;
  function flash(){ const el = document.getElementById('secPx'); if(!el) return; const v = parseFloat(String(el.textContent).replace(/[^\d.-]/g,'')); if(lastT !== currentSecurity){ lastT = currentSecurity; lastPx = isFinite(v) ? v : null; return; } if(lastPx!=null && isFinite(v) && v!==lastPx){ el.classList.remove('qx-flash-up','qx-flash-down'); void el.offsetWidth; el.classList.add(v>lastPx?'qx-flash-up':'qx-flash-down'); } lastPx = isFinite(v) ? v : lastPx; }
  function initFlash(){ const el = document.getElementById('secPx'); if(!el) return; new MutationObserver(flash).observe(el, {childList:true, characterData:true, subtree:true}); }
  return {heatmap, mountHeatmap, squarify, initFlash};
})();
