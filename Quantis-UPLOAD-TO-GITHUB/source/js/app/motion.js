/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/app/motion.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Pointer-tracking highlight used by css/v6-premium.css: the card / tile / button under
 *           the cursor gets --mx/--my (or --bx/--by for buttons) so its glow follows the pointer.
 *           One delegated listener, throttled to one update per animation frame, writes only CSS
 *           custom properties (no layout reads except one getBoundingClientRect on the hovered
 *           element) — so it costs well under 0.1 ms per frame. Disabled for touch and
 *           "reduce motion" users.
 * ─────────────────────────────────────────────────────────────────────────────
 */
(() => {
  if(window.matchMedia && (matchMedia('(hover: none)').matches || matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
  const SEL = '.card,.mg-tile,.pl-tile,.qxai-card,.qxe-tile,.ix-row';
  let lit = null, btn = null, ev = null, queued = false;
  function frame(){
    queued = false; const e = ev; if(!e) return;
    const t = e.target instanceof Element ? e.target : null;
    const b = t && t.closest('.btn');
    if(b){ const r = b.getBoundingClientRect(); b.style.setProperty('--bx', (e.clientX - r.left)+'px'); b.style.setProperty('--by', (e.clientY - r.top)+'px'); }
    btn = b;
    const el = t && t.closest(SEL);
    if(el !== lit){ if(lit) lit.classList.remove('qx-lit'); lit = el; if(el) el.classList.add('qx-lit'); }
    if(el){ const r = el.getBoundingClientRect(); el.style.setProperty('--mx', (e.clientX - r.left)+'px'); el.style.setProperty('--my', (e.clientY - r.top)+'px');
      // tiles inside a card also light their parent card's border
      const parent = el.parentElement && el.parentElement.closest('.card'); if(parent && parent !== el){ const pr = parent.getBoundingClientRect(); parent.style.setProperty('--mx', (e.clientX - pr.left)+'px'); parent.style.setProperty('--my', (e.clientY - pr.top)+'px'); parent.classList.add('qx-lit'); } }
  }
  document.addEventListener('pointermove', e => { ev = e; if(!queued){ queued = true; requestAnimationFrame(frame); } }, {passive:true});
  document.addEventListener('pointerleave', () => { if(lit) lit.classList.remove('qx-lit'); lit = null; document.querySelectorAll('.card.qx-lit').forEach(c=>c.classList.remove('qx-lit')); });
  document.addEventListener('pointerout', e => { const c = e.target instanceof Element && e.target.closest('.card'); if(c && !c.contains(e.relatedTarget)) c.classList.remove('qx-lit'); }, {passive:true});
})();
