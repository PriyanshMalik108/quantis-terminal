/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/modules/reports/render-web.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Renders a report MODEL (templates.js) to:
 *             • HTML — on-screen preview and standalone .html / print (themed, cover page, KPI tiles,
 *               callouts, score bars, charts, numbered sections, running footer when printed)
 *             • Markdown · CSV (every table) · JSON (model without images) · Excel (one sheet per table
 *               + cover + chart data)
 * SECURITY  ALL text goes through esc() — report text contains API-sourced strings.
 * EXPOSES   QXRW.{html(model, images, theme, opt, standalone), markdown(model, opt), csv(model), json(model), xlsx(model, opt, fileName)}
 * ─────────────────────────────────────────────────────────────────────────────
 */
const QXRW = (() => {
  const esc = s => escapeHtml(String(s ?? ''));
  const toneColor = (th, t) => t==='up'||t==='good' ? th.up : t==='down'||t==='bad' ? th.down : t==='warn' ? th.accent : th.primary;
  function css(th){
    return `.qxr4{font-family:${th.fontCss};color:${th.ink};background:#fff;line-height:1.6;font-size:13.5px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .qxr4 *{box-sizing:border-box} .qxr4 h1,.qxr4 h2,.qxr4 h3{font-family:${th.fontCss};color:${th.primary};margin:0}
    .qxr4 .cv{border-radius:2px;overflow:hidden;border:1px solid ${th.rule};margin-bottom:22px}
    .qxr4 .band{background:${th.primary};color:#fff;padding:22px 26px 20px;display:flex;gap:18px;align-items:center;position:relative}
    .qxr4 .band:after{content:'';position:absolute;left:0;right:0;bottom:0;height:5px;background:${th.accent}}
    .qxr4 .logo{width:64px;height:64px;border-radius:12px;background:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden}
    .qxr4 .logo img{width:52px;height:52px;object-fit:contain} .qxr4 .logo b{font:700 28px Arial;color:${th.primary}}
    .qxr4 .kick{font:700 10.5px Arial,sans-serif;letter-spacing:2px;opacity:.85} .qxr4 .band h1{color:#fff;font-size:27px;line-height:1.2;margin:4px 0}
    .qxr4 .sub{font:12.5px Arial,sans-serif;opacity:.9} .qxr4 .stance{margin-left:auto;text-align:right;font-family:Arial,sans-serif}
    .qxr4 .stance b{display:inline-block;padding:7px 16px;border-radius:4px;font-size:13px;letter-spacing:1.5px;background:#fff;color:${th.primary}}
    .qxr4 .stance i{display:block;font-style:normal;font-size:11px;margin-top:5px;opacity:.9}
    .qxr4 .kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:${th.rule}}
    .qxr4 .kpi{background:#fff;padding:12px 16px} .qxr4 .kpi span{display:block;font:600 10px Arial,sans-serif;letter-spacing:1px;text-transform:uppercase;color:${th.muted}}
    .qxr4 .kpi b{display:block;font:700 19px Arial,sans-serif;color:${th.ink};margin:3px 0 1px} .qxr4 .kpi i{font:11px Arial,sans-serif;color:${th.muted};font-style:normal}
    .qxr4 .kpi b.up{color:${th.up}} .qxr4 .kpi b.down{color:${th.down}}
    .qxr4 .cvbody{display:grid;grid-template-columns:1.05fr 1fr;gap:22px;padding:18px 22px}
    .qxr4 .cvbody h3{font:700 11px Arial,sans-serif;letter-spacing:1.4px;text-transform:uppercase;color:${th.primary};border-bottom:2px solid ${th.accent};padding-bottom:4px;margin-bottom:8px}
    .qxr4 .by{font:12px Arial,sans-serif;color:${th.muted};padding:0 22px 14px}
    .qxr4 h2{font-size:18px;margin:26px 0 10px;padding-bottom:5px;border-bottom:1.5px solid ${th.rule};display:flex;gap:10px;align-items:baseline;page-break-after:avoid}
    .qxr4 h2 em{font:700 12px Arial,sans-serif;color:#fff;background:${th.primary};border-radius:3px;padding:2px 7px;font-style:normal}
    .qxr4 p{margin:6px 0 10px} .qxr4 ul{margin:4px 0 12px;padding-left:20px} .qxr4 li{margin:3px 0}
    .qxr4 table{width:100%;border-collapse:collapse;margin:8px 0 6px;font:12px Arial,sans-serif;page-break-inside:avoid}
    .qxr4 .t th{background:${th.primary};color:#fff;text-align:left;padding:6px 8px;font-weight:600}
    .qxr4 .t td{padding:5px 8px;border-bottom:1px solid ${th.rule}} .qxr4 .t tr:nth-child(even) td{background:${th.soft}}
    .qxr4 .t td:not(:first-child),.qxr4 .t th:not(:first-child){text-align:right} .qxr4 .t.wide td:nth-child(3),.qxr4 .t.wide th:nth-child(3){text-align:left}
    .qxr4 .t tr.hl td{background:${QXTH.mix(th.accent,'#FFFFFF',0.78)}!important;font-weight:700}
    .qxr4 .kv th{text-align:left;color:${th.muted};font-weight:400;padding:4px 8px;width:44%;border-bottom:1px solid ${th.rule}} .qxr4 .kv td{padding:4px 8px;border-bottom:1px solid ${th.rule};font-weight:600}
    .qxr4 .note{font:11px Arial,sans-serif;color:${th.muted};margin:2px 0 12px}
    .qxr4 .co{border-left:4px solid ${th.primary};background:${th.soft};padding:10px 14px;margin:10px 0;page-break-inside:avoid} .qxr4 .co b{display:block;font:700 12px Arial,sans-serif;margin-bottom:3px}
    .qxr4 .fig{margin:10px 0 14px;page-break-inside:avoid;border:1px solid ${th.rule};padding:6px;border-radius:3px} .qxr4 .fig img{width:100%;display:block}
    .qxr4 .bars div{display:grid;grid-template-columns:150px 1fr 60px;gap:10px;align-items:center;font:12px Arial,sans-serif;margin:5px 0}
    .qxr4 .bars i{display:block;height:10px;background:${th.soft};border-radius:5px;overflow:hidden} .qxr4 .bars i u{display:block;height:100%;border-radius:5px}
    .qxr4 .foot{margin-top:24px;padding-top:10px;border-top:2px solid ${th.primary};font:10.5px Arial,sans-serif;color:${th.muted};display:flex;justify-content:space-between;gap:10px}
    @media (max-width:700px){.qxr4 .kpis{grid-template-columns:repeat(2,1fr)}.qxr4 .cvbody{grid-template-columns:1fr}.qxr4 .band{flex-wrap:wrap}.qxr4 .stance{margin-left:0;text-align:left}}
    @media print{.qxr4 h2{page-break-before:auto}.qxr4 .sec{page-break-inside:auto}}`;
  }
  function block(b, images, th, num){
    switch(b.t){
      case 'p': return `<p>${esc(b.text)}</p>`;
      case 'ul': return `<ul>${b.items.map(i=>`<li>${esc(i)}</li>`).join('')}</ul>`;
      case 'kv': return `<table class="kv">${b.rows.map(r=>`<tr><th>${esc(r[0])}</th><td>${esc(r[1])}</td></tr>`).join('')}</table>`;
      case 'table': return `<table class="t ${b.head.length>=4&&/Formula|Basis|Reading/.test(b.head.join())?'wide':''}"><thead><tr>${b.head.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${b.rows.map((r,i)=>`<tr class="${i===b.hl?'hl':''}">${r.map(c=>`<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>${b.note?`<div class="note">${esc(b.note)}</div>`:''}`;
      case 'kpis': return `<div class="kpis" style="margin:8px 0 14px;border:1px solid ${th.rule}">${b.items.map(k=>`<div class="kpi"><span>${esc(k.l)}</span><b class="${k.tone||''}">${esc(k.v)}</b><i>${esc(k.s||'')}</i></div>`).join('')}</div>`;
      case 'chart': return images[b.key] ? `<div class="fig" style="${images[b.key].w < 1500 ? 'max-width:62%;margin-left:auto;margin-right:auto' : ''}"><img src="${images[b.key].png}" alt="chart"></div>` : '';
      case 'callout': return `<div class="co" style="border-left-color:${toneColor(th,b.tone)}"><b style="color:${toneColor(th,b.tone)}">${esc(b.title||'')}</b>${esc(b.text)}</div>`;
      case 'bars': return `<div class="bars">${b.items.map(x=>`<div><span>${esc(x.l)}</span><i><u style="width:${Math.max(0,Math.min(100,x.v))}%;background:${x.v>=58?th.up:x.v>=42?th.accent:th.down}"></u></i><b>${esc(x.txt)}</b></div>`).join('')}</div>`;
    }
    return '';
  }
  function html(M, images, th, opt, standalone){
    const mt = M.meta, st = M.cover.stance;
    const logo = mt.logo ? `<img src="${mt.logo}" alt="">` : `<b>${esc(String(mt.name||'?').slice(0,1))}</b>`;
    const kick = esc(String(mt.typeLabel||'Report').split(' — ')[0].split('(')[0].trim().toUpperCase());
    const cover = `<div class="cv"><div class="band"><div class="logo">${logo}</div><div><div class="kick">${kick} · ${esc(String(mt.sector||'').toUpperCase())}</div><h1>${esc(mt.name)}</h1><div class="sub">${esc(mt.ticker)} · ${esc(mt.ccy||'')} · ${mt.date.toISOString().slice(0,10)}</div></div>
      ${st?`<div class="stance"><b>${esc(st.label)}</b><i>Model view ${st.score}/100</i></div>`:''}</div>
      <div class="kpis">${(M.cover.kpis||[]).map(k=>`<div class="kpi"><span>${esc(k.l)}</span><b class="${k.tone||''}">${esc(k.v)}</b><i>${esc(k.s||'')}</i></div>`).join('')}</div>
      <div class="cvbody"><div><h3>Highlights</h3><ul>${(M.cover.highlights||[]).filter(Boolean).map(h=>`<li>${esc(h)}</li>`).join('')||'<li>See sections below.</li>'}</ul></div><div><h3>Key data</h3><table class="kv">${(M.cover.keyData||[]).map(r=>`<tr><th>${esc(r[0])}</th><td>${esc(r[1])}</td></tr>`).join('')}</table></div></div>
      ${opt.preparedBy||opt.confidential?`<div class="by">${opt.preparedBy?`Prepared by <b>${esc(opt.preparedBy)}</b>${opt.firm?' · '+esc(opt.firm):''}`:''}${opt.confidential?' · <b style="color:'+th.down+'">CONFIDENTIAL</b>':''}</div>`:''}</div>`;
    const body = M.sections.map((s,i)=>`<div class="sec"><h2><em>${i+1}</em>${esc(s.title)}</h2>${s.blocks.map(b=>block(b, images, th)).join('')}</div>`).join('');
    const foot = `<div class="foot"><span>${esc(mt.name)} · ${esc(mt.typeLabel||'')}</span><span>${opt.confidential?'CONFIDENTIAL · ':''}${opt.preparedBy?'Prepared by '+esc(opt.preparedBy)+' · ':''}Not investment advice</span></div>`;
    const inner = `<div class="qxr4">${cover}${body}${foot}</div>`;
    if(!standalone) return {inner, css:css(th)};
    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(mt.name)} — ${esc(mt.typeLabel||'Report')}</title>
      <style>body{margin:0;background:#E9EDF2}.page{max-width:860px;margin:24px auto;background:#fff;padding:36px 44px;box-shadow:0 2px 14px rgba(0,0,0,.1)}@page{size:${opt.pageSize==='letter'?'Letter':'A4'};margin:14mm}@media print{body{background:#fff}.page{box-shadow:none;margin:0;padding:0;max-width:none}}${css(th)}</style></head><body><div class="page">${inner}</div></body></html>`;
  }
  function markdown(M, opt){
    const mt = M.meta, L = [`# ${mt.name} (${mt.ticker})`, `**${mt.typeLabel}** · ${mt.date.toISOString().slice(0,10)}${opt.preparedBy?` · Prepared by ${opt.preparedBy}`:''}${opt.firm?` · ${opt.firm}`:''}${opt.confidential?' · **CONFIDENTIAL**':''}`, ''];
    if(M.cover.stance) L.push(`> **Model view: ${M.cover.stance.label} (${M.cover.stance.score}/100)**`, '');
    L.push('| Metric | Value |', '|---|---|', ...(M.cover.kpis||[]).map(k=>`| ${k.l} | ${k.v}${k.s?' ('+k.s+')':''} |`), '');
    if((M.cover.highlights||[]).length) L.push('## Highlights', ...M.cover.highlights.filter(Boolean).map(h=>'- '+h), '');
    L.push('| Key data | |', '|---|---|', ...(M.cover.keyData||[]).map(r=>`| ${r[0]} | ${r[1]} |`), '');
    const cell = s => String(s??'').replace(/\|/g,'\\|');
    M.sections.forEach((s,i)=>{ L.push(`## ${i+1}. ${s.title}`, ''); s.blocks.forEach(b=>{
      if(b.t==='p') L.push(b.text, ''); else if(b.t==='ul') L.push(...b.items.map(x=>'- '+x), '');
      else if(b.t==='kv') L.push('| | |','|---|---|', ...b.rows.map(r=>`| ${cell(r[0])} | ${cell(r[1])} |`), '');
      else if(b.t==='table') L.push('| '+b.head.map(cell).join(' | ')+' |', '|'+b.head.map(()=>'---').join('|')+'|', ...b.rows.map(r=>'| '+r.map(cell).join(' | ')+' |'), b.note?`\n*${b.note}*`:'', '');
      else if(b.t==='kpis') L.push(...b.items.map(k=>`- **${k.l}:** ${k.v}${k.s?' ('+k.s+')':''}`), '');
      else if(b.t==='callout') L.push(`> **${b.title||''}** ${b.text}`, '');
      else if(b.t==='bars') L.push(...b.items.map(x=>`- ${x.l}: ${x.txt}`), ''); }); });
    return L.join('\n');
  }
  function tables(M){
    const out = [{name:'Cover', head:['Metric','Value','Note'], rows:[...(M.cover.kpis||[]).map(k=>[k.l,k.v,k.s||'']), ...(M.cover.keyData||[]).map(r=>[r[0], r[1], ''])]}];
    M.sections.forEach((s,i)=>s.blocks.forEach((b,j)=>{ if(b.t==='table') out.push({name:`${i+1}.${j} ${s.title}`, head:b.head, rows:b.rows, note:b.note}); else if(b.t==='kv') out.push({name:`${i+1}.${j} ${s.title}`, head:['Item','Value'], rows:b.rows}); else if(b.t==='kpis') out.push({name:`${i+1}.${j} ${s.title}`, head:['Metric','Value','Note'], rows:b.items.map(k=>[k.l,k.v,k.s||''])}); }));
    return out;
  }
  function csv(M){
    const q = v => `"${String(v??'').replace(/"/g,'""')}"`;
    const L = [['Report', M.meta.name, M.meta.typeLabel, M.meta.date.toISOString()].map(q).join(',')];
    tables(M).forEach(t=>{ L.push(''); L.push(q(t.name)); L.push(t.head.map(q).join(',')); t.rows.forEach(r=>L.push(r.map(q).join(','))); });
    return '﻿'+L.join('\n');
  }
  const json = M => JSON.stringify({meta:{...M.meta, logo:undefined}, cover:M.cover, sections:M.sections, charts:M.charts, gaps:M.gaps}, null, 2);
  function xlsx(M, opt, file){
    if(!window.XLSX) throw new Error('Excel library not loaded');
    const wb = XLSX.utils.book_new(); const used = new Set();
    const nameOf = s => { let n = String(s).replace(/[\\/?*[\]:]/g,' ').slice(0,28).trim() || 'Sheet'; let k = n, i = 2; while(used.has(k)) k = n.slice(0,25)+' '+(i++); used.add(k); return k; };
    const header = [[M.meta.name+' — '+M.meta.typeLabel], ['Generated '+M.meta.date.toISOString()+(opt.preparedBy?' · Prepared by '+opt.preparedBy:'')+(opt.confidential?' · CONFIDENTIAL':'')], []];
    tables(M).forEach((t,i)=>{ const aoa = (i===0?header:[[t.name]]).concat([t.head], t.rows, t.note?[[],[t.note]]:[]); const ws = XLSX.utils.aoa_to_sheet(aoa); ws['!cols'] = t.head.map((h,j)=>({wch: Math.min(60, Math.max(12, ...[h, ...t.rows.map(r=>r[j])].map(v=>String(v??'').length+2)))})); XLSX.utils.book_append_sheet(wb, ws, nameOf(i===0?'Cover':t.name)); });
    Object.entries(M.charts||{}).forEach(([k,c])=>{ let aoa = null;
      if(c.labels && c.series) aoa = [[c.title||k], ['Label', ...c.series.map(s=>s.name)], ...c.labels.map((l,i)=>[l, ...c.series.map(s=>s.data[i] ?? null)])];
      else if(c.steps) aoa = [[c.title||k], ['Step','Value'], ...c.steps.map(s=>[s[0], s[1]])];
      else if(c.rows) aoa = [[c.title||k], ['Method','Low','High'], ...c.rows.map(r=>[r.label, r.lo, r.hi])];
      else if(c.labels && c.data) aoa = [[c.title||k], ['Label','Value'], ...c.labels.map((l,i)=>[l, c.data[i]])];
      if(aoa) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), nameOf('Chart '+k)); });
    const text = M.sections.flatMap((s,i)=>[[`${i+1}. ${s.title}`], ...s.blocks.flatMap(b=> b.t==='p' ? [[b.text]] : b.t==='ul' ? b.items.map(x=>['• '+x]) : b.t==='callout' ? [[(b.title?b.title+': ':'')+b.text]] : []), []]);
    const ws = XLSX.utils.aoa_to_sheet(text); ws['!cols'] = [{wch:140}]; XLSX.utils.book_append_sheet(wb, ws, nameOf('Narrative'));
    XLSX.writeFile(wb, file);
  }
  return {html, markdown, csv, json, xlsx, tables, css};
})();
