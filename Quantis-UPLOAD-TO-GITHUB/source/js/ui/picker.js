/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/ui/picker.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   One reusable "find any security" input with a live dropdown, used wherever a user adds
 *           something (Compare, Correlation, Watchlist, Alerts, Indices, Macro…).
 *             • instant matches from the built-in universe, then
 *             • worldwide matches from TradingView (every exchange, incl. BSE-only small caps,
 *               ETFs, indices, crypto, FX, commodities) a moment later.
 *           Keyboard: ↑/↓ to move, Enter to pick, Esc to close.
 * USAGE     QXPICK.attach(inputEl, {onPick:(t, item)=>{…}, kinds:['equity','etf',…], indexOnly:false})
 *           onPick receives a Quantis ticker already admitted into the universe (so every module can
 *           use it) and the raw search item. For indexOnly pickers it receives (tvSymbol, item).
 * ─────────────────────────────────────────────────────────────────────────────
 */
const QXPICK = (() => {
  function norm(s){ return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase(); }
  function attach(input, opts={}){
    if(!input || input.dataset.qxpick) return; input.dataset.qxpick = '1';
    input.setAttribute('autocomplete','off'); input.setAttribute('role','combobox'); input.setAttribute('aria-expanded','false');
    const wrap = document.createElement('div'); wrap.className = 'qxpick'; input.parentNode.insertBefore(wrap, input); wrap.appendChild(input);
    const dd = document.createElement('div'); dd.className = 'qxpick-dd'; dd.setAttribute('role','listbox'); wrap.appendChild(dd);
    let items = [], sel = -1, tok = 0, timer;
    const close = () => { dd.classList.remove('open'); input.setAttribute('aria-expanded','false'); sel = -1; };
    const draw = (loading) => {
      if(!items.length && !loading){ dd.innerHTML = `<div class="qxpick-empty">No match — try a shorter name, the ticker or the ISIN.</div>`; }
      else dd.innerHTML = items.map((it,i)=>`<div class="qxpick-row ${i===sel?'sel':''}" data-i="${i}" role="option"><b>${escapeHtml(it.label)}</b><span>${escapeHtml(it.sub)}</span></div>`).join('') + (loading ? `<div class="qxpick-empty"><span class="qx-spin"></span> Searching worldwide…</div>` : '');
      dd.classList.add('open'); input.setAttribute('aria-expanded','true');
    };
    const pick = async (it) => {
      close(); input.value = '';
      try{
        if(opts.indexOnly){ opts.onPick && opts.onPick(it.sym, it); return; }
        let t = it.t;
        if(!t && it.raw){
          if(['equity','preferred','etf','fund'].includes(it.kind)) t = admitTvRow({...it.raw, _s: it.sym});
          else t = admitTvRow({...it.raw, _s: it.sym, type: it.kind==='crypto'?'crypto':it.kind});
        }
        if(t && opts.onPick) opts.onPick(t, it);
      }catch(e){ toast('Could not add: '+e.message, 'err'); }
    };
    const search = async () => {
      const q = input.value.trim(); const my = ++tok;
      if(q.length < 1){ close(); return; }
      const qn = norm(q);
      items = [];
      if(!opts.indexOnly){
        items = SECURITY_UNIVERSE.filter(s => norm(s.t).startsWith(qn) || norm(s.n).includes(qn)).slice(0, 6)
          .map(s => ({t:s.t, label:s.t, sub:`${s.n} · ${s.cls} · ${s.ex} · ${s.ctry}`}));
      }
      draw(q.length >= 2);
      if(q.length < 2) return;
      clearTimeout(timer);
      timer = setTimeout(async () => {
        try{
          let found = [];
          if(opts.indexOnly){
            const {rows} = await LD.tvScan('global', {filter:[{left:'name,description', operation:'match', right:q}, {left:'type', operation:'equal', right:'index'}], columns:['name','description','close','change','country','currency','exchange'], range:[0,14]});
            found = rows.map(r => ({sym:r._s, kind:'index', label:String(r._s).split(':')[1], sub:`${r.description||r.name} · ${String(r._s).split(':')[0]}${r.country?' · '+r.country:''}`, raw:r}));
          } else {
            const r = await QXS.search(q, opts.kinds || ['equity','preferred','etf','fund','index','commodity','crypto','fx']);
            const have = new Set(items.map(i => LD.tvSymbol(i.t)));
            found = r.items.filter(i => i.kind!=='mf_in' && !have.has(i.sym)).slice(0, 14).map(i => ({sym:i.sym, kind:i.kind, raw:i.raw || {}, label:String(i.sym).split(':').pop(),
              sub:`${i.name||''} · ${QXS.KINDS[i.kind]?.label||i.kind} · ${i.exchange||''}${i.country?' · '+i.country:''}`}));
          }
          if(my !== tok) return;
          items = items.concat(found); draw(false);
        }catch(e){ if(my !== tok) return; draw(false); dd.insertAdjacentHTML('beforeend', `<div class="qxpick-empty">Worldwide search unavailable: ${escapeHtml(e.message)}</div>`); }
      }, 300);
    };
    input.addEventListener('input', search);
    input.addEventListener('focus', () => { if(input.value.trim()) search(); });
    input.addEventListener('keydown', e => {
      if(e.key==='ArrowDown' || e.key==='ArrowUp'){ if(!items.length) return; e.preventDefault(); sel = (sel + (e.key==='ArrowDown'?1:-1) + items.length) % items.length; draw(false); dd.querySelector('.sel')?.scrollIntoView({block:'nearest'}); }
      else if(e.key==='Enter'){ e.preventDefault(); if(items.length) pick(items[sel>=0?sel:0]); }
      else if(e.key==='Escape') close();
    });
    dd.addEventListener('mousedown', e => { const r = e.target.closest('.qxpick-row'); if(!r) return; e.preventDefault(); pick(items[+r.dataset.i]); });
    document.addEventListener('click', e => { if(!wrap.contains(e.target)) close(); });
    return {close, search};
  }
  return {attach};
})();
