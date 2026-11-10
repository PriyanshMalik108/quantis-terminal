/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/features/formula-lab.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Formula Lab view (#view-formulas): browse/search the CFA L1–L3 catalogue (QXFL),
 *           run any formula, and one-click "Fill from <ticker>" to apply it to the selected
 *           company's live statements. Inputs that were auto-filled are marked LIVE.
 * DEPENDS   QXFL (modules/formulas/cfa-library.js), currentSecurity, toast
 * EXPOSES   QXFLAB.{mount(), open(id)}
 * ─────────────────────────────────────────────────────────────────────────────
 */
const QXFLAB = (() => {
  let cur = null, filled = {}, ctxT = null;
  const fmt = (v, unit) => { if(typeof v!=='number' || !isFinite(v)) return '—'; const a = Math.abs(v); const s = a>=1e9 ? (v/1e9).toFixed(2)+'B' : a>=1e6 ? (v/1e6).toFixed(2)+'M' : a>=1000 ? v.toLocaleString(undefined,{maximumFractionDigits:2}) : v.toFixed(a<1?4:2);
    return unit==='%' ? s+'%' : unit==='x' ? s+'×' : unit==='yrs' ? s+' yrs' : unit==='days' ? s+' days' : unit==='bp' ? s+' bp' : s; };
  function mount(){
    const v = document.getElementById('view-formulas'); if(!v || v.dataset.ready) return; v.dataset.ready = 1;
    const levels = ['L1','L2','L3'];
    v.querySelector('.viewbody').innerHTML = `<div class="qxfl-layout">
      <div class="card qxfl-side"><input id="qxflQ" placeholder="Search ${QXFL.all.length} formulas…" spellcheck="false">
        <div class="qxfl-lv"><button class="chip active" data-lv="">All</button>${levels.map(l=>`<button class="chip" data-lv="${l}">CFA ${l}</button>`).join('')}</div>
        <div id="qxflList" class="qxfl-list"></div></div>
      <div class="card qxfl-main" id="qxflMain"></div></div>`;
    const draw = () => {
      const q = v.querySelector('#qxflQ').value.toLowerCase(), lv = v.querySelector('.qxfl-lv .chip.active').dataset.lv;
      const items = QXFL.all.filter(e => (!lv || e.lv===lv) && (!q || (e.name+' '+e.topic+' '+e.f).toLowerCase().includes(q)));
      const groups = {}; items.forEach(e => (groups[e.lv+' · '+e.topic] = groups[e.lv+' · '+e.topic] || []).push(e));
      v.querySelector('#qxflList').innerHTML = Object.entries(groups).map(([g, arr])=>`<div class="qxfl-g">${escapeHtml(g)}</div>${arr.map(e=>`<div class="qxfl-i ${cur&&cur.id===e.id?'active':''}" data-id="${e.id}">${escapeHtml(e.name)}${e.in.some(i=>i[3])?'<span title="Can be filled from live company data">◉</span>':''}</div>`).join('')}`).join('') || '<div class="qxa-dim">No match.</div>';
    };
    v.querySelector('#qxflQ').addEventListener('input', draw);
    v.querySelectorAll('.qxfl-lv .chip').forEach(b=>b.onclick=()=>{ v.querySelectorAll('.qxfl-lv .chip').forEach(x=>x.classList.toggle('active',x===b)); draw(); });
    v.querySelector('#qxflList').addEventListener('click', e=>{ const i = e.target.closest('[data-id]'); if(i){ open(i.dataset.id); draw(); } });
    draw(); open('wacc'); draw();
  }
  function open(id){
    cur = QXFL.byId(id); filled = {}; const el = document.getElementById('qxflMain'); if(!cur || !el) return;
    const auto = cur.in.some(i=>i[3]);
    el.innerHTML = `<div class="qxfl-tags"><span class="badge fact">CFA ${cur.lv}</span><span class="badge">${escapeHtml(cur.topic)}</span></div><h3 class="qxfl-title">${escapeHtml(cur.name)}</h3>
      <code class="qxg-f">${escapeHtml(cur.f)}</code>
      <div class="qxfl-inputs">${cur.in.map(([k,label,d,a])=>`<label>${escapeHtml(label)}${a?` <span class="qxfl-auto" data-auto="${k}"></span>`:''}<input data-k="${k}" ${/List$/.test(k)?'':'type="number" step="any"'} value="${escapeHtml(String(d))}"></label>`).join('')}</div>
      <div class="qxfl-actions">${auto?`<button class="btn" id="qxflFill">Fill from ${escapeHtml(currentSecurity)}</button>`:''}<button class="btn secondary" id="qxflReset">Reset to example</button><button class="btn secondary" id="qxflCopy">Copy result</button></div>
      <div class="qxfl-result"><span>Result</span><b id="qxflOut">—</b></div>
      <p class="qxfl-read">${escapeHtml(cur.read)}</p><div class="qxa-dim" id="qxflNote"></div>`;
    const calc = () => { const vals = {}; el.querySelectorAll('[data-k]').forEach(i=>vals[i.dataset.k]=i.value); try{ const r = QXFL.run(cur, vals); const o = el.querySelector('#qxflOut'); o.textContent = fmt(r.value, cur.unit); o.className = r.tone==='good'?'up':r.tone==='bad'?'down':''; o.classList.remove('qx-pop'); void o.offsetWidth; o.classList.add('qx-pop'); }catch(e){ el.querySelector('#qxflOut').textContent = 'check inputs'; } };
    el.querySelectorAll('[data-k]').forEach(i=>i.addEventListener('input', ()=>{ const s = el.querySelector(`[data-auto="${i.dataset.k}"]`); if(s) s.textContent=''; calc(); }));
    el.querySelector('#qxflReset').onclick = () => open(cur.id);
    el.querySelector('#qxflCopy').onclick = () => navigator.clipboard?.writeText(`${cur.name}: ${el.querySelector('#qxflOut').textContent}`).then(()=>toast('Copied.','ok'));
    const fb = el.querySelector('#qxflFill');
    if(fb) fb.onclick = async () => { fb.disabled = true; fb.textContent = 'Fetching live data…'; const C = await QXFL.context(currentSecurity); ctxT = currentSecurity; let n = 0;
      cur.in.forEach(([k,,,a])=>{ if(a && C[a]!=null){ const inp = el.querySelector(`[data-k="${k}"]`); inp.value = +C[a].toPrecision(10); const s = el.querySelector(`[data-auto="${k}"]`); if(s) s.innerHTML = '<span class="badge fact">LIVE</span>'; n++; } });
      fb.disabled = false; fb.textContent = `Fill from ${currentSecurity}`; calc();
      el.querySelector('#qxflNote').textContent = n ? `${n} input(s) filled with ${currentSecurity}'s latest reported figures (TradingView${QXLI.available()?' + your statement API key':''}). Other inputs keep their example values — edit them.` : `No matching live data for ${currentSecurity}${QXLI.available()?'':' — add a free FMP / Alpha Vantage / Finnhub key in Settings for line items such as interest, receivables and inventory'}.`; };
    calc();
  }
  return {mount, open};
})();
