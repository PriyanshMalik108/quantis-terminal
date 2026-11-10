/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/modules/reports/report-ui.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Reports view (#view-reports) and the QXREP facade used everywhere else.
 *           1 choose a security (universe dropdown #repSec, or "search any security worldwide")
 *           2 choose a report type valid for that security's kind (QXRT.typesFor)
 *           3 choose a design: preset theme, custom primary/accent colours, serif/sans, A4/Letter
 *           4 author fields: Prepared by, organisation, confidential notice, verticals, own view
 *           5 Generate → collect (QXCOL) → model (QXRT) → chart images (QXRV) → preview (QXRW)
 *           6 Export: PDF · Word · PowerPoint · Excel · CSV · Markdown · HTML · JSON · Print
 * KEPT IDS  #repSec, #reportPreview and the "Generate Report" button text (tests + legacy hooks).
 * EXPOSES   QXREP.{typesFor(kind), openWith({kind,item,data,type}), build(), exp(fmt), mountUi(), target, last}
 *           + legacy globals generateReport(), downloadReportMarkdown(), printReportPDF()
 * ─────────────────────────────────────────────────────────────────────────────
 */
const QXREP = (() => {
  let target = null, last = null, busy = false;
  const P = (k,d) => { try{ return safeStorage.getItem('qxr_'+k) ?? d; }catch(e){ return d; } };
  const S = (k,v) => { try{ safeStorage.setItem('qxr_'+k, v); }catch(e){} };
  const typesFor = kind => QXRT.typesFor(kind);
  // Map a universe security to {kind, item} so non-equity universe entries get the right template.
  function fromUniverse(t){
    const s = SECURITIES.find(x=>x.t===t) || SECURITY_UNIVERSE.find(x=>x.t===t); if(!s) return null;
    const tv = LD.tvSymbol(t);
    if(s.cls==='Crypto') return {kind:'crypto', item:{kind:'crypto', sym:'CRYPTO:'+t+'USD', name:s.n.replace(/ \(.*\)$/,''), price:s.px}};
    if(s.cls==='FX') return {kind:'fx', item:{kind:'fx', sym:'FX_IDC:'+t, name:s.n, price:s.px, market:'forex'}};
    if(s.cls==='Index' || s.cls==='Commodity') return {kind: s.cls==='Index'?'index':'commodity', item:{kind:s.cls==='Index'?'index':'commodity', sym:tv||t, name:s.n, price:s.px, changePct:s.chgPct, market:'cfd'}};
    if(s.cls==='Mutual Fund') return {kind:'unsupported', why:'Pick this scheme through “Search any security” (mfapi.in) to get the mutual-fund report.'};
    if(s.cls==='Derivative') return {kind:'equity', t, note:'NSE derivative — report covers the underlying.'};
    return {kind: s.cls==='ETF' ? 'etf' : 'equity', t};
  }
  function opts(){
    const g = id => { const e = document.getElementById(id); return e ? (e.type==='checkbox' ? e.checked : e.value.trim()) : ''; };
    const o = {preparedBy:g('qxrBy'), firm:g('qxrFirm'), confidential:g('qxrConf'), verticals:g('qxrVert'), analystView:g('qxrView'), pageSize:g('qxrPage')||'a4'};
    S('by', o.preparedBy); S('firm', o.firm); S('conf', o.confidential?'1':'0'); S('page', o.pageSize);
    const th = {base:g('qxrTheme')||'navy', primary:g('qxrPri'), accent:g('qxrAcc'), font:g('qxrFont')}; QXTH.save(th);
    return {o, th:QXTH.resolve(th)};
  }
  function syncTypes(){
    const sel = document.getElementById('qxrType'); if(!sel) return;
    const kind = target ? target.kind : 'equity'; const types = typesFor(kind);
    sel.innerHTML = types.map(t=>`<option value="${t.id}">${escapeHtml(t.label)} · ${t.pages}</option>`).join('') || '<option value="">No report type for this security</option>';
    const want = target && target.type; if(want && types.some(t=>t.id===want)) sel.value = want;
    const lab = document.getElementById('qxrTarget'); if(lab) lab.innerHTML = target ? `<span class="badge fact">${escapeHtml(QXS.KINDS[target.kind]?.label || target.kind)}</span> ${escapeHtml(target.item ? (target.item.name||target.item.sym) : target.t)}${target.note?` <span class="qxa-dim">${escapeHtml(target.note)}</span>`:''}` : '';
  }
  function setTarget(t){ target = t; last = null; document.querySelectorAll('[data-qxr-exp]').forEach(b=>b.disabled = true); syncTypes(); }
  async function build(){
    if(busy) return; const prev = document.getElementById('reportPreview'); if(!prev) return;
    if(!target){ const t = (document.getElementById('repSec')||{}).value || currentSecurity; setTarget(fromUniverse(t)); }
    if(!target || target.kind==='unsupported'){ prev.innerHTML = `<div class="notebox">${escapeHtml(target?target.why:'Choose a security.')}</div>`; return; }
    const type = (document.getElementById('qxrType')||{}).value || typesFor(target.kind)[0]?.id;
    if(!type){ prev.innerHTML = '<div class="notebox">No report template exists for this security type.</div>'; return; }
    busy = true; const {o, th} = opts();
    const label = target.item ? (target.item.name||target.item.sym) : target.t;
    prev.innerHTML = `<div class="qxr-loading"><div class="qxr-steps"><div class="on">1 · Collecting live data for ${escapeHtml(label)}</div><div>2 · Writing the analysis</div><div>3 · Drawing charts</div><div>4 · Typesetting</div></div><div class="qx-skel" style="height:240px;margin-top:12px"></div></div>`;
    const step = i => prev.querySelectorAll('.qxr-steps div').forEach((d,k)=>d.classList.toggle('on', k<=i));
    try{
      let D = target.data;
      if(!D || D.kind==null || (target.kind==='equity' && !D.m && !D.f)) D = await QXCOL.collect(target.kind, target.item || target.t);
      target.data = D; step(1);
      const M = QXRT.build(type, D, o); step(2);
      const images = await QXRV.render(M.charts, th, M.meta.ccy); step(3);
      last = {M, images, th, o, file: `${String(M.meta.ticker||'report').replace(/[^\w.-]+/g,'_')}_${type}_${M.meta.date.toISOString().slice(0,10)}`};
      const {inner, css} = QXRW.html(M, images, th, o, false);
      prev.innerHTML = `<style>${css}</style><div class="qxr-paper">${inner}</div>`;
      document.querySelectorAll('[data-qxr-exp]').forEach(b=>b.disabled = false);
      toast(`${M.meta.typeLabel.split(' — ')[0]} ready for ${M.meta.name}. Choose an export format.`, 'ok');
    }catch(e){ console.error(e); prev.innerHTML = `<div class="notebox">Could not build the report: ${escapeHtml(e.message)}</div>`; }
    finally{ busy = false; }
  }
  async function exp(fmt){
    if(!last){ toast('Generate the report first.', 'warn'); return; }
    const {M, images, th, o, file} = last;
    const btn = document.querySelector(`[data-qxr-exp="${fmt}"]`); if(btn){ btn.disabled = true; btn.dataset.l = btn.textContent; btn.textContent = '…'; }
    try{
      if(fmt==='pdf') await QXRO.pdf(M, images, th, o, file+'.pdf');
      else if(fmt==='docx') await QXRO.docx(M, images, th, o, file+'.docx');
      else if(fmt==='pptx') await QXRO.pptx(M, images, th, o, file+'.pptx');
      else if(fmt==='xlsx') QXRW.xlsx(M, o, file+'.xlsx');
      else if(fmt==='csv') downloadBlob(file+'.csv', QXRW.csv(M), 'text/csv');
      else if(fmt==='md') downloadBlob(file+'.md', QXRW.markdown(M, o), 'text/markdown');
      else if(fmt==='html') downloadBlob(file+'.html', QXRW.html(M, images, th, o, true), 'text/html');
      else if(fmt==='json') downloadBlob(file+'.json', QXRW.json(M), 'application/json');
      else if(fmt==='print'){ const w = window.open('', '_blank'); if(!w){ toast('Pop-up blocked — allow pop-ups to print.', 'warn'); return; } w.document.write(QXRW.html(M, images, th, o, true)); w.document.close(); setTimeout(()=>w.print(), 500); return; }
      toast(fmt.toUpperCase()+' downloaded.', 'ok');
    }catch(e){ console.error(e); toast('Export failed: '+e.message, 'err'); }
    finally{ if(btn){ btn.disabled = false; btn.textContent = btn.dataset.l; } }
  }
  function openWith(t){ goto('reports'); setTimeout(()=>{ mountUi(); setTarget(t); const sel = document.getElementById('qxrType'); if(t.type && sel) sel.value = t.type; build(); }, 60); }
  function mountUi(){
    const v = document.getElementById('view-reports'); if(!v || v.dataset.qxr4) return; v.dataset.qxr4 = '1';
    v.querySelector('.viewhead').innerHTML = `<h2>Report Studio</h2><div class="sub">Institutional-format reports for every security type · 16 templates · your colours · PDF, Word, PowerPoint, Excel, CSV, Markdown, HTML, JSON</div>`;
    const th = QXTH.load();
    v.querySelector('.viewbody').innerHTML = `<div class="qxr-layout">
      <div class="card qxr-side">
        <h3>1 · Security</h3>
        <div class="formrow"><label>From your universe</label><select id="repSec"></select></div>
        <div class="formrow"><label>…or search any security worldwide (bonds, crypto, funds, futures…)</label><input id="qxrSearch" placeholder="e.g. Reliance 2045 bond, Solana, HDFC flexi cap" autocomplete="off"><div id="qxrHits" class="qxr-hits"></div></div>
        <div id="qxrTarget" class="qxr-target"></div>
        <h3>2 · Report type</h3>
        <div class="formrow"><select id="qxrType"></select></div>
        <h3>3 · Design</h3>
        <div class="qxr-themes">${Object.entries(QXTH.PRESETS).map(([k,p])=>`<button class="qxr-sw ${ (th.base||'navy')===k?'active':''}" data-th="${k}" title="${escapeHtml(p.name)}" style="--a:${p.primary};--b:${p.accent}"><i></i><span>${escapeHtml(p.name)}</span></button>`).join('')}</div>
        <input type="hidden" id="qxrTheme" value="${escapeHtml(th.base||'navy')}">
        <div class="qxr-colors"><label>Primary <input type="color" id="qxrPri" value="${/^#[\da-f]{6}$/i.test(th.primary||'')?th.primary:(QXTH.PRESETS[th.base||'navy']||QXTH.PRESETS.navy).primary}"></label><label>Accent <input type="color" id="qxrAcc" value="${/^#[\da-f]{6}$/i.test(th.accent||'')?th.accent:(QXTH.PRESETS[th.base||'navy']||QXTH.PRESETS.navy).accent}"></label>
          <label>Font <select id="qxrFont"><option value="serif" ${th.font!=='sans'?'selected':''}>Serif (classic)</option><option value="sans" ${th.font==='sans'?'selected':''}>Sans (modern)</option></select></label><label>Page <select id="qxrPage"><option value="a4">A4</option><option value="letter" ${P('page','a4')==='letter'?'selected':''}>Letter</option></select></label></div>
        <h3>4 · Author</h3>
        <div class="formrow"><label>Prepared by (author)</label><input id="qxrBy" placeholder="Your name" value="${escapeHtml(P('by',''))}"></div>
        <div class="formrow"><label>Organisation (optional)</label><input id="qxrFirm" placeholder="Firm / team" value="${escapeHtml(P('firm',''))}"></div>
        <label class="qxr-check"><input type="checkbox" id="qxrConf" ${P('conf','0')==='1'?'checked':''}> Confidential — adds an all-rights-reserved, do-not-share notice in the author's name</label>
        <div class="formrow"><label>Business verticals / segments (optional)</label><textarea id="qxrVert" rows="2" placeholder="e.g. Oil-to-chemicals 55%, Retail 25%, Digital 20%"></textarea></div>
        <div class="formrow"><label>Your analyst view (optional, added to the conclusion)</label><textarea id="qxrView" rows="2" placeholder="Your conclusion in your own words"></textarea></div>
        <button class="btn" id="qxrGen" style="width:100%">Generate Report</button>
        <div class="qxr-exports">${[['pdf','PDF'],['docx','Word'],['pptx','PowerPoint'],['xlsx','Excel'],['csv','CSV'],['md','Markdown'],['html','HTML'],['json','JSON'],['print','Print']].map(([k,l])=>`<button class="btn secondary small" data-qxr-exp="${k}" disabled>${l}</button>`).join('')}</div>
      </div>
      <div class="qxr-main"><div id="reportPreview" class="qxr-preview"><div class="qxr-empty"><div style="font-size:34px">📄</div><b>Pick a security and a report type, then press Generate Report</b><div class="qxa-dim">Equity: master, company profile, core financial analysis, valuation, peers, technical, risk · ETFs & funds · Indian mutual funds · crypto (full / one-page) · bonds & debentures · futures · options · currencies · indices & commodities.</div></div></div></div>
    </div>`;
    if(typeof renderReportsSecSelect==='function') renderReportsSecSelect();
    const sel = document.getElementById('repSec'); if(sel && [...sel.options].some(o=>o.value===currentSecurity)) sel.value = currentSecurity;
    sel.addEventListener('change', ()=>setTarget(fromUniverse(sel.value)));
    setTarget(fromUniverse(sel.value || currentSecurity));
    const q = v.querySelector('#qxrSearch'), hits = v.querySelector('#qxrHits'); let deb, items = [];
    q.addEventListener('input', ()=>{ clearTimeout(deb); deb = setTimeout(async()=>{ if(q.value.trim().length<2){ hits.innerHTML=''; return; } hits.innerHTML = '<div class="qxa-dim">Searching…</div>'; const r = await QXS.search(q.value); items = r.items.slice(0,24); hits.innerHTML = items.map((it,i)=>`<div class="qxr-hit" data-i="${i}"><span class="badge">${escapeHtml(QXS.KINDS[it.kind]?.label||it.kind)}</span> <b>${escapeHtml(String(it.sym).split(':').pop())}</b> ${escapeHtml(String(it.name||'').slice(0,50))}</div>`).join('') || '<div class="qxa-dim">No match.</div>'; }, 400); });
    hits.addEventListener('click', e=>{ const h = e.target.closest('[data-i]'); if(!h) return; const it = items[+h.dataset.i]; hits.innerHTML = ''; q.value = it.name||it.sym;
      if(['equity','etf','fund','preferred'].includes(it.kind)){ const t = admitTvRow({...it.raw, _s:it.sym}); setTarget({kind:it.kind==='etf'||it.kind==='fund'?'etf':it.kind, t}); } else setTarget({kind:it.kind, item:it}); });
    v.querySelectorAll('.qxr-sw').forEach(b=>b.onclick=()=>{ v.querySelectorAll('.qxr-sw').forEach(x=>x.classList.toggle('active', x===b)); const p = QXTH.PRESETS[b.dataset.th]; document.getElementById('qxrTheme').value = b.dataset.th; document.getElementById('qxrPri').value = p.primary; document.getElementById('qxrAcc').value = p.accent; document.getElementById('qxrFont').value = p.font; if(last) rerender(); });
    ['qxrPri','qxrAcc','qxrFont'].forEach(id=>document.getElementById(id).addEventListener('change', ()=>{ if(last) rerender(); }));
    v.querySelector('#qxrGen').addEventListener('click', build);
    v.querySelectorAll('[data-qxr-exp]').forEach(b=>b.addEventListener('click', ()=>exp(b.dataset.qxrExp)));
  }
  async function rerender(){ // re-theme the current report without re-fetching data
    if(!last) return; const {o, th} = opts(); const images = await QXRV.render(last.M.charts, th, last.M.meta.ccy); last = {...last, images, th, o};
    const {inner, css} = QXRW.html(last.M, images, th, o, false); document.getElementById('reportPreview').innerHTML = `<style>${css}</style><div class="qxr-paper">${inner}</div>`;
  }
  return {typesFor, openWith, build, exp, mountUi, fromUniverse, get target(){ return target; }, get last(){ return last; }};
})();
// Legacy entry points (inline handlers / older modules) route to the Report Studio.
function generateReport(){ QXREP.build(); }
function downloadReportMarkdown(){ if(QXREP.last) QXREP.exp('md'); else QXREP.build().then(()=>QXREP.exp('md')); }
function printReportPDF(){ if(QXREP.last) QXREP.exp('print'); else QXREP.build().then(()=>QXREP.exp('print')); }
// Back-compat shim: the v3 Analysis tab button calls QXR.build(ticker).
const QXR = {build: t => { QXREP.openWith({kind:'equity', t, type:'master'}); }, mountUi: () => QXREP.mountUi()};
