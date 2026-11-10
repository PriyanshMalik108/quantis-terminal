/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/app/layout.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Device-aware layout behaviour (CSS lives in css/v5-responsive.css):
 *             • Watchlist / AI-assistant panels: docked on wide screens, slide-in drawers on
 *               laptops, tablets and phones. ☰ Watchlist and ✦ AI assistant buttons in the
 *               Research header toggle them; the choice is remembered per browser.
 *             • Wraps every wide data table in a horizontal scroller so tables never push the
 *               page sideways on a phone (watches the DOM, so tables rendered later are covered).
 *             • Esc / tapping outside closes an open drawer.
 * EXPOSES   QXL.{toggle(panel, force), wrapTables(root)}
 * ─────────────────────────────────────────────────────────────────────────────
 */
const QXL = (() => {
  const W = () => window.innerWidth;
  const KEY = 'quantis_layout_v1';
  let pref = {}; try{ pref = JSON.parse(safeStorage.getItem(KEY)||'{}'); }catch(e){}
  const docked = p => p==='wl' ? W() >= 1280 : W() >= 1500;   // widths where the panel is docked by default
  function isOpen(p){
    if(W() <= 900) return document.body.classList.contains(p+'-open');
    if(docked(p)) return !document.body.classList.contains(p+'-closed');
    return document.body.classList.contains(p+'-open');
  }
  function apply(){
    ['wl','ai'].forEach(p=>{
      document.body.classList.remove(p+'-open', p+'-closed');
      if(W() > 900 && docked(p) && pref[p+'Docked']===false) document.body.classList.add(p+'-closed');
    });
    sync();
  }
  function sync(){
    const b1 = document.getElementById('toggleWl'), b2 = document.getElementById('toggleAi');
    if(b1){ const o = isOpen('wl'); b1.setAttribute('aria-pressed', o); b1.classList.toggle('active', o); }
    if(b2){ const o = isOpen('ai') || document.getElementById('rightrail')?.classList.contains('mobile-show'); b2.setAttribute('aria-pressed', !!o); b2.classList.toggle('active', !!o); }
  }
  function toggle(p, force){
    const open = force ?? !isOpen(p);
    if(p==='ai' && W() <= 900){ document.getElementById('rightrail').classList.toggle('mobile-show', open); if(open) setTimeout(()=>document.getElementById('aiInput')?.focus(), 200); sync(); return; }
    if(W() > 900 && docked(p)){
      document.body.classList.toggle(p+'-closed', !open);
      pref[p+'Docked'] = open; try{ safeStorage.setItem(KEY, JSON.stringify(pref)); }catch(e){}
    } else {
      document.body.classList.toggle(p+'-open', open);
      if(open) document.body.classList.remove(p==='wl'?'ai-open':'wl-open'); // one drawer at a time on small screens
    }
    sync();
    // charts inside the centre column need a resize after its width changes
    setTimeout(()=>window.dispatchEvent(new Event('resize')), 250);
  }
  /* ---- tables never overflow the page ---- */
  function wrapTables(root){
    (root||document).querySelectorAll('table').forEach(t=>{
      const p = t.parentElement; if(!p || p.classList.contains('tbl-scroll')) return;
      if(t.closest('.qxr4, .qxc-host, .tbl-scroll')) return;          // report paper & charts manage their own layout
      const ox = getComputedStyle(p).overflowX; if(ox==='auto' || ox==='scroll') return;
      const w = document.createElement('div'); w.className = 'tbl-scroll';
      p.insertBefore(w, t); w.appendChild(t);
    });
  }
  let pending = false;
  const mo = new MutationObserver(()=>{ if(pending) return; pending = true; requestAnimationFrame(()=>{ pending = false; wrapTables(document.getElementById('app')); }); });
  function init(){
    apply();
    document.getElementById('toggleWl')?.addEventListener('click', ()=>toggle('wl'));
    document.getElementById('toggleAi')?.addEventListener('click', ()=>toggle('ai'));
    document.getElementById('wlClose')?.addEventListener('click', ()=>toggle('wl', false));
    document.getElementById('aiMobileClose')?.addEventListener('click', ()=>{ document.body.classList.remove('ai-open'); setTimeout(sync, 0); });
    document.addEventListener('keydown', e=>{ if(e.key==='Escape'){ if(document.body.classList.contains('wl-open')) toggle('wl', false); if(document.body.classList.contains('ai-open')) toggle('ai', false); } });
    // tap outside an open drawer closes it
    document.getElementById('center')?.addEventListener('click', e=>{ if(e.target.closest('.sec-actions')) return; if(document.body.classList.contains('wl-open')) toggle('wl', false); if(document.body.classList.contains('ai-open')) toggle('ai', false); });
    // picking a stock in the watchlist drawer closes the drawer
    document.getElementById('watchlist')?.addEventListener('click', ()=>{ if(document.body.classList.contains('wl-open')) setTimeout(()=>toggle('wl', false), 120); });
    let lastW = W(); window.addEventListener('resize', ()=>{ const w = W(); if((w>900)!==(lastW>900) || docked('wl')!==(lastW>=1280) || docked('ai')!==(lastW>=1500)) apply(); lastW = w; });
    document.getElementById('msSave')?.addEventListener('click', ()=>{ toggleMoreSheet(false); document.getElementById('saveWorkspaceBtn').click(); });
    document.getElementById('msWatchlist')?.addEventListener('click', ()=>{ toggleMoreSheet(false); goto('research'); setTimeout(()=>toggle('wl', true), 60); });
    // switching views closes any open drawer (a drawer left open used to cover the next view's buttons)
    if(typeof goto==='function'){ const og = goto; goto = function(...a){ if(document.body.classList.contains('wl-open')) toggle('wl', false); if(document.body.classList.contains('ai-open')) toggle('ai', false); return og.apply(this, a); }; }
    wrapTables(document.getElementById('app'));
    mo.observe(document.getElementById('app'), {childList:true, subtree:true});
  }
  return {init, toggle, wrapTables, sync};
})();
