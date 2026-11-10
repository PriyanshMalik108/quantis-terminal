/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/modules/reports/render-office.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Renders a report MODEL to native office formats, using the resolved THEME:
 *             • PDF  — jsPDF + jspdf-autotable (lazy-loaded). Cover band with logo, KPI tiles,
 *                      highlights + key data, numbered sections, themed tables, callouts, score bars,
 *                      chart images (JPEG), running header/footer with page x of y.
 *             • DOCX — docx.js (lazy-loaded). Same structure with native Word tables, headings
 *                      (navigable outline), images, header/footer with page numbers.
 *             • PPTX — PptxGenJS (lazy-loaded). Cover slide, KPI slide, highlights, one slide per
 *                      section (text + chart) and per large table / extra chart.
 * NOTES     • jsPDF's built-in fonts are Latin-1 only → pdfText() maps ₹ → "Rs", − → "-", etc.
 *           • Libraries load from jsDelivr on first use (no cost until a user exports).
 * EXPOSES   QXRO.{pdf(model, images, theme, opt, file), docx(…), pptx(…), loadLib(name)}
 * ─────────────────────────────────────────────────────────────────────────────
 */
const QXRO = (() => {
  const LIBS = {autotable:'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js', docx:'https://cdn.jsdelivr.net/npm/docx@9.5.1/dist/index.iife.js', pptx:'https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js'};
  // SRI hashes (config/sri.json) — the browser rejects a library whose bytes were tampered with.
  const SRI = {autotable:'sha384-Xl/CUCfJbzsngMp0CFxkmF0VW/8C160IsGujqeQlIhaGxKz2+JsIGORFqtCPeldF', docx:'sha384-HWC8sFPgg/WYrr43jIR6e0YIKgPkS3VLdteGgh9MFlUet3xdAVEM8YS69xP4Puse', pptx:'sha384-Cck14aA9cifjYolcnjebXRfWGkz5ltHMBiG4px/j8GS+xQcb7OhNQWZYyWjQ+UwQ'};
  const loaded = {};
  function loadLib(k){ if(loaded[k]) return loaded[k]; loaded[k] = new Promise((res,rej)=>{ const s = document.createElement('script'); s.src = LIBS[k]; s.crossOrigin = 'anonymous'; s.integrity = SRI[k]; s.onload = res; s.onerror = ()=>{ delete loaded[k]; rej(new Error('could not load the '+k+' library (network or blocker)')); }; document.head.appendChild(s); }); return loaded[k]; }
  const rgb = h => QXTH.hex2rgb(h);
  const pdfText = s => String(s??'').replace(/[−–—]/g,'-').replace(/×/g,'x').replace(/₹/g,'Rs ').replace(/€/g,'EUR ').replace(/[≈]/g,'~').replace(/[≥]/g,'>=').replace(/[≤]/g,'<=').replace(/[ₜₙ₋₁₀₂]/g,m=>({'ₜ':'t','ₙ':'n','₋':'-','₁':'1','₀':'0','₂':'2'}[m])).replace(/√/g,'sqrt').replace(/÷/g,'/').replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/…/g,'...').replace(/Δ/g,'chg ').replace(/σ/g,'sd').replace(/β/g,'beta').replace(/[²]/g,'^2').replace(/[^\x00-\xFF]/g,'');
  const kick = mt => String(mt.typeLabel||'Report').split(' — ')[0].split('(')[0].trim().toUpperCase();

  /* ===================================== PDF ===================================== */
  async function pdf(M, images, th, opt, file){
    if(!window.jspdf) throw new Error('PDF library not loaded');
    await loadLib('autotable');
    const {jsPDF} = window.jspdf; const doc = new jsPDF({unit:'pt', format: opt.pageSize==='letter' ? 'letter' : 'a4'});
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), mL = 44, mR = 44, cw = W-mL-mR, BODY = th.pdfFont; let y = 0;
    const P = rgb(th.primary), A = rgb(th.accent), INK = rgb(th.ink), MU = rgb(th.muted), RU = rgb(th.rule), SO = rgb(th.soft);
    const drawn = new Set([1]);
    const header = () => { const pg = doc.internal.getCurrentPageInfo().pageNumber; y = 52; if(drawn.has(pg)) return; drawn.add(pg);
      doc.setFillColor(...P); doc.rect(0,0,W,8,'F'); doc.setFillColor(...A); doc.rect(0,8,W,2,'F');
      doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(...P); doc.text(pdfText(`${M.meta.name} (${M.meta.ticker})`).slice(0,80), mL, 26);
      doc.setFont('helvetica','normal'); doc.setTextColor(...MU); doc.text(pdfText(kick(M.meta)+' · '+M.meta.date.toISOString().slice(0,10)), W-mR, 26, {align:'right'}); };
    const ensure = h => { if(y + h > H - 46){ doc.addPage(); header(); } };
    const para = (t, o={}) => { doc.setFont(o.font||BODY, o.bold?'bold':'normal'); doc.setFontSize(o.size||10.5); doc.setTextColor(...(o.color||INK)); const lh = (o.size||10.5)*1.42;
      doc.splitTextToSize(pdfText(t), cw-(o.indent||0)).forEach(l=>{ ensure(lh); doc.text(l, mL+(o.indent||0), y); y += lh; }); y += 4; };
    // ---- cover ----
    doc.setFillColor(...P); doc.rect(0,0,W,132,'F'); doc.setFillColor(...A); doc.rect(0,132,W,5,'F');
    let tx = mL;
    if(M.meta.logo){ try{ doc.setFillColor(255,255,255); doc.roundedRect(mL, 30, 70, 70, 10, 10, 'F'); doc.addImage(M.meta.logo, 'PNG', mL+8, 38, 54, 54); tx = mL + 86; }catch(e){} }
    doc.setTextColor(255); doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.text(pdfText(kick(M.meta)+(M.meta.sector?' · '+String(M.meta.sector).toUpperCase():'')).slice(0,90), tx, 44);
    doc.setFont(BODY,'bold'); doc.setFontSize(22); doc.splitTextToSize(pdfText(M.meta.name), W-tx-(M.cover.stance?170:mR)).slice(0,2).forEach((l,i)=>doc.text(l, tx, 72+i*24));
    doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.text(pdfText(`${M.meta.ticker}  |  ${M.meta.ccy||''}  |  ${M.meta.date.toISOString().slice(0,10)}`), tx, 116);
    const st = M.cover.stance;
    if(st){ doc.setFillColor(255,255,255); doc.roundedRect(W-mR-122, 46, 122, 30, 4, 4, 'F'); doc.setTextColor(...rgb(st.label==='POSITIVE'?th.up:st.label==='CAUTIOUS'?th.down:th.accent)); doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.text(st.label, W-mR-61, 66, {align:'center'}); doc.setTextColor(255); doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.text(`Model view ${st.score}/100`, W-mR-61, 92, {align:'center'}); }
    y = 152;
    const tiles = (items, top) => { const cols = 3, gap = 6, tw = (cw - gap*(cols-1))/cols, th2 = 50; items.slice(0,9).forEach((k,i)=>{ const r = Math.floor(i/cols), c = i%cols, x = mL + c*(tw+gap), yy = top + r*(th2+gap);
        doc.setFillColor(...SO); doc.setDrawColor(...RU); doc.rect(x, yy, tw, th2, 'FD'); doc.setFillColor(...A); doc.rect(x, yy, 3, th2, 'F');
        doc.setFont('helvetica','bold'); doc.setFontSize(7); doc.setTextColor(...MU); doc.text(pdfText(String(k.l).toUpperCase()).slice(0,34), x+10, yy+13);
        doc.setFontSize(13.5); doc.setTextColor(...(k.tone==='up'?rgb(th.up):k.tone==='down'?rgb(th.down):INK)); doc.text(pdfText(k.v).slice(0,22), x+10, yy+31);
        doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(...MU); doc.text(pdfText(k.s||'').slice(0,40), x+10, yy+43); });
      return top + Math.ceil(Math.min(items.length,9)/3)*(th2+gap); };
    y = tiles(M.cover.kpis||[], y) + 8;
    const colW = (cw-18)/2, y0 = y;
    doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(...P); doc.text('HIGHLIGHTS', mL, y); doc.text('KEY DATA', mL+colW+18, y); doc.setDrawColor(...A); doc.setLineWidth(1.4); doc.line(mL, y+4, mL+colW, y+4); doc.line(mL+colW+18, y+4, W-mR, y+4); doc.setLineWidth(0.5);
    let yl = y + 18; doc.setFont(BODY,'normal'); doc.setFontSize(9.5); doc.setTextColor(...INK);
    (M.cover.highlights||[]).filter(Boolean).slice(0,6).forEach(h=>{ const lines = doc.splitTextToSize(pdfText(h), colW-12); if(yl + lines.length*12.5 > H-120) return; doc.setFillColor(...A); doc.circle(mL+3, yl-3, 1.8, 'F'); lines.forEach(l=>{ doc.text(l, mL+11, yl); yl += 12.5; }); yl += 3; });
    doc.autoTable({startY:y+10, margin:{left:mL+colW+18, right:mR}, theme:'plain', styles:{fontSize:8.2, cellPadding:2.6, textColor:INK, font:'helvetica'}, columnStyles:{0:{textColor:MU, cellWidth:colW*0.42}, 1:{fontStyle:'bold'}},
      body:(M.cover.keyData||[]).map(r=>[pdfText(r[0]), pdfText(r[1])]), didDrawCell:d=>{ doc.setDrawColor(...RU); doc.line(d.cell.x, d.cell.y+d.cell.height, d.cell.x+d.cell.width, d.cell.y+d.cell.height); }});
    y = Math.max(yl, doc.lastAutoTable.finalY) + 10;
    if(opt.preparedBy || opt.confidential){ doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(...MU); doc.text(pdfText(`${opt.preparedBy?'Prepared by '+opt.preparedBy:''}${opt.firm?' | '+opt.firm:''}${opt.confidential?'  |  CONFIDENTIAL':''}`), mL, y); y += 14; }
    // ---- sections ----
    const cellAlign = head => Object.fromEntries(head.map((h,i)=>[i,{halign: i===0 || /Formula|Basis|Reading|Signal|headline|Inputs|Group|Metric|Company|Contract|Date/i.test(h) ? 'left' : 'right'}]));
    M.sections.forEach((s, si) => {
      ensure(60); y += 12;
      doc.setFillColor(...P); doc.roundedRect(mL, y-11, 20, 15, 2, 2, 'F'); doc.setTextColor(255); doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.text(String(si+1), mL+10, y, {align:'center'});
      doc.setTextColor(...P); doc.setFont(BODY,'bold'); doc.setFontSize(14); doc.text(pdfText(s.title), mL+28, y+1); doc.setDrawColor(...RU); doc.line(mL, y+8, W-mR, y+8); y += 24;
      s.blocks.forEach(b => {
        if(b.t==='p') para(b.text);
        else if(b.t==='ul'){ b.items.forEach(it=>{ doc.setFont(BODY,'normal'); doc.setFontSize(10.3); doc.setTextColor(...INK); const lines = doc.splitTextToSize(pdfText(it), cw-16); ensure(14); doc.setFillColor(...A); doc.circle(mL+4, y-3.2, 1.8, 'F'); lines.forEach(l=>{ ensure(14); doc.text(l, mL+14, y); y += 14; }); }); y += 4; }
        else if(b.t==='kpis'){ ensure(Math.ceil(b.items.length/3)*56+8); y = tiles(b.items, y) + 8; }
        else if(b.t==='callout'){ const col = rgb(b.tone==='good'?th.up:b.tone==='bad'?th.down:b.tone==='warn'?th.accent:th.primary); doc.setFont(BODY,'normal'); doc.setFontSize(9.8); const lines = doc.splitTextToSize(pdfText(b.text), cw-24); const hh = lines.length*13 + (b.title?16:0) + 12; ensure(Math.min(hh, 300));
          doc.setFillColor(...SO); doc.rect(mL, y-10, cw, hh, 'F'); doc.setFillColor(...col); doc.rect(mL, y-10, 3.5, hh, 'F');
          if(b.title){ doc.setFont('helvetica','bold'); doc.setFontSize(9.5); doc.setTextColor(...col); doc.text(pdfText(b.title), mL+12, y+2); y += 15; }
          doc.setFont(BODY,'normal'); doc.setFontSize(9.8); doc.setTextColor(...INK); lines.forEach(l=>{ if(y > H-50){ doc.addPage(); header(); } doc.text(l, mL+12, y+2); y += 13; }); y += 14; }
        else if(b.t==='bars'){ b.items.forEach(x=>{ ensure(16); doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(...INK); doc.text(pdfText(x.l), mL, y); doc.setFillColor(...SO); doc.roundedRect(mL+130, y-7, cw-190, 8, 4, 4, 'F'); doc.setFillColor(...rgb(x.v>=58?th.up:x.v>=42?th.accent:th.down)); doc.roundedRect(mL+130, y-7, Math.max(4,(cw-190)*x.v/100), 8, 4, 4, 'F'); doc.setFont('helvetica','bold'); doc.text(pdfText(x.txt), W-mR, y, {align:'right'}); y += 16; }); y += 4; }
        else if(b.t==='chart'){ const im = images[b.key]; if(!im) return; const w = im.w < 1500 ? cw*0.62 : cw, x = mL + (cw-w)/2, h = w*im.h/im.w; ensure(h+8); doc.setDrawColor(...RU); doc.rect(x-1, y-1, w+2, h+2); doc.addImage(im.jpg, 'JPEG', x, y, w, h, undefined, 'FAST'); y += h + 12; }
        else if(b.t==='kv' || b.t==='table'){
          const isT = b.t==='table'; ensure(40);
          doc.autoTable({startY:y, margin:{left:mL, right:mR, top:52, bottom:46}, head:isT?[b.head.map(pdfText)]:undefined, body:(isT?b.rows:b.rows).map(r=>r.map(pdfText)), theme:isT?'striped':'plain',
            headStyles:{fillColor:P, textColor:255, fontSize:8, fontStyle:'bold'}, styles:{fontSize:8.2, cellPadding:3.2, overflow:'linebreak', textColor:INK, lineColor:RU}, alternateRowStyles:{fillColor:SO},
            columnStyles: isT ? cellAlign(b.head) : {0:{textColor:MU, cellWidth:cw*0.4}, 1:{fontStyle:'bold'}},
            didParseCell: d => { if(isT && d.section==='body' && d.row.index===b.hl){ d.cell.styles.fillColor = rgb(QXTH.mix(th.accent,'#FFFFFF',0.75)); d.cell.styles.fontStyle = 'bold'; } },
            didDrawCell: d => { if(!isT){ doc.setDrawColor(...RU); doc.line(d.cell.x, d.cell.y+d.cell.height, d.cell.x+d.cell.width, d.cell.y+d.cell.height); } },
            didDrawPage: () => header()});
          y = doc.lastAutoTable.finalY + 6;
          if(b.note){ doc.setFont('helvetica','italic'); doc.setFontSize(7.8); doc.setTextColor(...MU); doc.splitTextToSize(pdfText(b.note), cw).forEach(l=>{ ensure(10); doc.text(l, mL, y+4); y += 10; }); }
          y += 8;
        }
      });
    });
    const n = doc.internal.getNumberOfPages();
    for(let i=1;i<=n;i++){ doc.setPage(i); doc.setDrawColor(...RU); doc.line(mL, H-34, W-mR, H-34); doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(...MU);
      doc.text(pdfText(`${opt.confidential?'CONFIDENTIAL - ':''}${opt.preparedBy?'Prepared by '+opt.preparedBy+' - ':''}For information only; not investment advice.`).slice(0,120), mL, H-22); doc.text(`Page ${i} of ${n}`, W-mR, H-22, {align:'right'}); }
    doc.save(file);
  }

  /* ===================================== DOCX ===================================== */
  async function docx(M, images, th, opt, file){
    await loadLib('docx'); const d = window.docx;
    const P = th.primary.slice(1), A = th.accent.slice(1), MU = th.muted.slice(1), SO = th.soft.slice(1), RU = th.rule.slice(1), F = th.docxFont;
    const run = (t, o={}) => new d.TextRun({text:String(t??''), font:o.font||F, size:o.size||21, bold:o.bold, color:o.color, italics:o.italics});
    const para = (children, o={}) => new d.Paragraph({children, spacing:{after:o.after??120, before:o.before??0}, alignment:o.align, shading:o.fill?{type:d.ShadingType.CLEAR, color:'auto', fill:o.fill}:undefined, border:o.border, heading:o.heading, keepNext:o.keepNext});
    const none = {style:d.BorderStyle.NONE, size:0, color:'FFFFFF'};
    const cell = (children, o={}) => new d.TableCell({children: Array.isArray(children) ? children : [para([run(children, {size:o.size||18, bold:o.bold, color:o.color})], {after:0, align:o.right?d.AlignmentType.RIGHT:d.AlignmentType.LEFT})], shading:o.fill?{type:d.ShadingType.CLEAR, color:'auto', fill:o.fill}:undefined, margins:{top:70,bottom:70,left:110,right:110}, width:o.w?{size:o.w, type:d.WidthType.PERCENTAGE}:undefined, borders:o.borders, verticalAlign:o.vAlign});
    const img = (key, width=620) => { const im = images[key]; if(!im) return null; const bin = atob(im.png.split(',')[1]); const u8 = new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u8[i]=bin.charCodeAt(i); return new d.Paragraph({children:[new d.ImageRun({type:'png', data:u8, transformation:{width, height:Math.round(width*im.h/im.w)}})], spacing:{after:160}}); };
    const tbl = (head, rows, o={}) => new d.Table({width:{size:100, type:d.WidthType.PERCENTAGE}, borders:{top:{style:d.BorderStyle.SINGLE,size:6,color:P}, bottom:{style:d.BorderStyle.SINGLE,size:6,color:P}, left:none, right:none, insideHorizontal:{style:d.BorderStyle.SINGLE,size:2,color:RU}, insideVertical:none},
      rows:[...(head?[new d.TableRow({tableHeader:true, children:head.map((h,i)=>cell(h,{bold:true, color:'FFFFFF', fill:P, right:i>0 && !/Formula|Basis|Reading|headline|Inputs|Group|Company/i.test(h)}))})]:[]),
        ...rows.map((r,ri)=>new d.TableRow({children:r.map((c,i)=>cell(c,{right:head&&i>0&&!/Formula|Basis|Reading|headline|Inputs|Group|Company/i.test(head[i]||''), bold:(!head&&i===1)||ri===o.hl, color:!head&&i===0?MU:undefined, fill: ri===o.hl ? QXTH.mix(th.accent,'#FFFFFF',0.75).slice(1) : (head&&ri%2 ? SO : undefined), w: !head ? (i===0?42:58) : undefined}))}))]});
    const kpiTable = items => new d.Table({width:{size:100, type:d.WidthType.PERCENTAGE}, borders:{top:none,bottom:none,left:none,right:none,insideHorizontal:{style:d.BorderStyle.SINGLE,size:12,color:'FFFFFF'},insideVertical:{style:d.BorderStyle.SINGLE,size:12,color:'FFFFFF'}},
      rows: Array.from({length:Math.ceil(items.length/3)}, (_,r)=>new d.TableRow({children: items.slice(r*3, r*3+3).concat(Array(3-items.slice(r*3,r*3+3).length).fill(null)).map(k=> k ? cell([para([run(String(k.l).toUpperCase(),{size:14,bold:true,color:MU})],{after:20}), para([run(k.v,{size:30,bold:true,color: k.tone==='up'?th.up.slice(1):k.tone==='down'?th.down.slice(1):th.ink.slice(1), font:'Arial'})],{after:10}), para([run(k.s||'',{size:15,color:MU})],{after:0})], {fill:SO, w:33, borders:{left:{style:d.BorderStyle.SINGLE,size:18,color:A}, top:none,bottom:none,right:none}}) : cell('', {w:33}))})) });
    const ch = [];
    // cover
    const logoRun = (()=>{ if(!M.meta.logo) return null; try{ const bin = atob(M.meta.logo.split(',')[1]); const u8 = new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u8[i]=bin.charCodeAt(i); return new d.ImageRun({type:'png', data:u8, transformation:{width:64, height:64}}); }catch(e){ return null; } })();
    ch.push(new d.Table({width:{size:100, type:d.WidthType.PERCENTAGE}, borders:{top:none,bottom:{style:d.BorderStyle.SINGLE,size:30,color:A},left:none,right:none,insideHorizontal:none,insideVertical:none}, rows:[new d.TableRow({children:[
      ...(logoRun?[cell([para([logoRun],{after:0})], {fill:P, w:14, vAlign:d.VerticalAlign.CENTER})]:[]),
      cell([para([run(kick(M.meta)+(M.meta.sector?'  ·  '+String(M.meta.sector).toUpperCase():''),{size:16,bold:true,color:'FFFFFF',font:'Arial'})],{after:60}), para([run(M.meta.name,{size:44,bold:true,color:'FFFFFF'})],{after:60}), para([run(`${M.meta.ticker}  |  ${M.meta.ccy||''}  |  ${M.meta.date.toISOString().slice(0,10)}`,{size:19,color:'FFFFFF',font:'Arial'})],{after:0})], {fill:P, w:logoRun?62:76}),
      cell(M.cover.stance?[para([run(M.cover.stance.label,{size:26,bold:true,color:P,font:'Arial'})],{after:40, align:d.AlignmentType.CENTER, fill:'FFFFFF'}), para([run(`Model view ${M.cover.stance.score}/100`,{size:16,color:'FFFFFF',font:'Arial'})],{after:0, align:d.AlignmentType.CENTER})]:[para([run('')])], {fill:P, w:24, vAlign:d.VerticalAlign.CENTER})]})]}));
    ch.push(para([run('')],{after:120}));
    ch.push(kpiTable(M.cover.kpis||[]));
    ch.push(para([run('HIGHLIGHTS',{size:17,bold:true,color:P,font:'Arial'})],{before:240, after:80, border:{bottom:{style:d.BorderStyle.SINGLE,size:12,color:A,space:2}}}));
    (M.cover.highlights||[]).filter(Boolean).forEach(h=>ch.push(new d.Paragraph({bullet:{level:0}, spacing:{after:60}, children:[run(h,{size:20})]})));
    ch.push(para([run('KEY DATA',{size:17,bold:true,color:P,font:'Arial'})],{before:200, after:80, border:{bottom:{style:d.BorderStyle.SINGLE,size:12,color:A,space:2}}}));
    ch.push(tbl(null, M.cover.keyData||[]));
    if(opt.preparedBy || opt.confidential) ch.push(para([run(`${opt.preparedBy?'Prepared by '+opt.preparedBy:''}${opt.firm?' | '+opt.firm:''}${opt.confidential?'  |  CONFIDENTIAL':''}`,{size:18,bold:true,color:MU})],{before:160}));
    // sections
    M.sections.forEach((s, si) => {
      ch.push(new d.Paragraph({heading:d.HeadingLevel.HEADING_1, pageBreakBefore: si===0, spacing:{before:si===0?0:320, after:120}, keepNext:true, border:{bottom:{style:d.BorderStyle.SINGLE,size:8,color:RU,space:4}}, children:[run(`${si+1}  `,{size:28,bold:true,color:A}), run(s.title,{size:28,bold:true,color:P})]}));
      s.blocks.forEach(b => {
        if(b.t==='p') ch.push(para([run(b.text)]));
        else if(b.t==='ul') b.items.forEach(i=>ch.push(new d.Paragraph({bullet:{level:0}, spacing:{after:60}, children:[run(i)]})));
        else if(b.t==='kv'){ ch.push(tbl(null, b.rows)); ch.push(para([run('')],{after:60})); }
        else if(b.t==='table'){ ch.push(tbl(b.head, b.rows, {hl:b.hl})); ch.push(para([run(b.note||'',{italics:true,size:16,color:MU})],{before:60, after:160})); }
        else if(b.t==='kpis'){ ch.push(kpiTable(b.items)); ch.push(para([run('')],{after:60})); }
        else if(b.t==='chart'){ const im = images[b.key]; const p = img(b.key, im && im.w < 1500 ? 400 : 620); if(p) ch.push(p); }
        else if(b.t==='callout'){ const col = (b.tone==='good'?th.up:b.tone==='bad'?th.down:b.tone==='warn'?th.accent:th.primary).slice(1);
          ch.push(new d.Table({width:{size:100, type:d.WidthType.PERCENTAGE}, borders:{top:none,bottom:none,right:none,left:{style:d.BorderStyle.SINGLE,size:24,color:col},insideHorizontal:none,insideVertical:none}, rows:[new d.TableRow({children:[cell([...(b.title?[para([run(b.title,{bold:true,color:col,size:20})],{after:40})]:[]), para([run(b.text,{size:20})],{after:0})], {fill:SO})]})]})); ch.push(para([run('')],{after:60})); }
        else if(b.t==='bars') ch.push(tbl(['Pillar','Score'], b.items.map(x=>[x.l, x.txt])));
      });
    });
    const foot = `${opt.confidential?'CONFIDENTIAL — ':''}${opt.preparedBy?'Prepared by '+opt.preparedBy+' — ':''}For information only; not investment advice.`;
    const docx = new d.Document({creator: opt.preparedBy || 'Quantis Terminal', title:`${M.meta.name} — ${M.meta.typeLabel}`, description:'Generated by Quantis Terminal', styles:{default:{document:{run:{font:F, size:21}}}},
      sections:[{properties:{page:{size: opt.pageSize==='letter' ? {width:12240, height:15840} : {width:11906, height:16838}, margin:{top:1000,bottom:1000,left:1050,right:1050}}},
        headers:{default:new d.Header({children:[para([run(`${M.meta.name} (${M.meta.ticker})`,{size:16,bold:true,color:P,font:'Arial'}), run(`   ·   ${kick(M.meta)}`,{size:16,color:MU,font:'Arial'})],{after:0, border:{bottom:{style:d.BorderStyle.SINGLE,size:6,color:A,space:4}}})]})},
        footers:{default:new d.Footer({children:[new d.Paragraph({children:[run(foot,{size:15,color:MU,font:'Arial'}), run('     Page ',{size:15,color:MU,font:'Arial'}), new d.TextRun({children:[d.PageNumber.CURRENT], size:15, color:MU, font:'Arial'}), run(' of ',{size:15,color:MU,font:'Arial'}), new d.TextRun({children:[d.PageNumber.TOTAL_PAGES], size:15, color:MU, font:'Arial'})]})]})},
        children:ch}]});
    const blob = await d.Packer.toBlob(docx); save(blob, file);
  }

  /* ===================================== PPTX ===================================== */
  async function pptx(M, images, th, opt, file){
    await loadLib('pptx'); const p = new window.PptxGenJS(); p.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5 in
    p.author = opt.preparedBy || 'Quantis Terminal'; p.title = `${M.meta.name} — ${M.meta.typeLabel}`;
    const P = th.primary.slice(1), A = th.accent.slice(1), INK = th.ink.slice(1), MU = th.muted.slice(1), SO = th.soft.slice(1), F = th.font==='serif' ? 'Georgia' : 'Calibri';
    p.defineSlideMaster({title:'QX', background:{color:'FFFFFF'}, objects:[{rect:{x:0, y:0, w:13.33, h:0.12, fill:{color:P}}}, {rect:{x:0, y:0.12, w:13.33, h:0.04, fill:{color:A}}},
      {text:{text:`${M.meta.name} · ${kick(M.meta)}`, options:{x:0.5, y:7.05, w:8, h:0.3, fontSize:9, color:MU, fontFace:'Calibri'}}}, {text:{text:`${opt.confidential?'CONFIDENTIAL · ':''}${opt.preparedBy?'Prepared by '+opt.preparedBy:''}`, options:{x:7, y:7.05, w:5.3, h:0.3, fontSize:9, color:MU, align:'right', fontFace:'Calibri'}}}], slideNumber:{x:12.5, y:7.05, fontSize:9, color:MU}});
    const title = (s, t) => { s.addText(t, {x:0.5, y:0.35, w:12.3, h:0.6, fontSize:24, bold:true, color:P, fontFace:F}); s.addShape(p.ShapeType.line, {x:0.5, y:0.98, w:1.2, h:0, line:{color:A, width:3}}); };
    // cover
    let s = p.addSlide(); s.background = {color:P};
    s.addShape(p.ShapeType.rect, {x:0, y:5.6, w:13.33, h:0.08, fill:{color:A}});
    if(M.meta.logo){ s.addShape(p.ShapeType.roundRect, {x:0.7, y:1.2, w:1.3, h:1.3, fill:{color:'FFFFFF'}, rectRadius:0.15}); s.addImage({data:M.meta.logo, x:0.82, y:1.32, w:1.06, h:1.06}); }
    s.addText(kick(M.meta)+(M.meta.sector?'  ·  '+String(M.meta.sector).toUpperCase():''), {x:0.7, y:2.8, w:11, h:0.4, fontSize:13, color:'FFFFFF', bold:true, charSpacing:3, fontFace:'Calibri'});
    s.addText(M.meta.name, {x:0.7, y:3.2, w:11.5, h:1.2, fontSize:40, bold:true, color:'FFFFFF', fontFace:F, fit:'shrink'});
    s.addText(`${M.meta.ticker}  |  ${M.meta.ccy||''}  |  ${M.meta.date.toISOString().slice(0,10)}`, {x:0.7, y:4.4, w:11, h:0.4, fontSize:15, color:'FFFFFF', fontFace:'Calibri'});
    if(M.cover.stance){ s.addShape(p.ShapeType.roundRect, {x:10.3, y:1.3, w:2.4, h:0.7, fill:{color:'FFFFFF'}, rectRadius:0.08}); s.addText(M.cover.stance.label, {x:10.3, y:1.3, w:2.4, h:0.7, fontSize:18, bold:true, color:P, align:'center', fontFace:'Calibri'}); s.addText(`Model view ${M.cover.stance.score}/100`, {x:10.3, y:2.05, w:2.4, h:0.35, fontSize:11, color:'FFFFFF', align:'center'}); }
    if(opt.preparedBy) s.addText(`Prepared by ${opt.preparedBy}${opt.firm?' · '+opt.firm:''}${opt.confidential?'  ·  CONFIDENTIAL':''}`, {x:0.7, y:6.0, w:11, h:0.4, fontSize:13, color:'FFFFFF'});
    // KPIs + highlights
    s = p.addSlide({masterName:'QX'}); title(s, 'At a glance');
    (M.cover.kpis||[]).slice(0,6).forEach((k,i)=>{ const x = 0.5 + (i%3)*4.15, y = 1.3 + Math.floor(i/3)*1.45; s.addShape(p.ShapeType.rect, {x, y, w:3.95, h:1.3, fill:{color:SO}, line:{color:SO}}); s.addShape(p.ShapeType.rect, {x, y, w:0.07, h:1.3, fill:{color:A}});
      s.addText(String(k.l).toUpperCase(), {x:x+0.2, y:y+0.08, w:3.6, h:0.3, fontSize:10, bold:true, color:MU}); s.addText(k.v, {x:x+0.2, y:y+0.38, w:3.6, h:0.55, fontSize:24, bold:true, color: k.tone==='up'?th.up.slice(1):k.tone==='down'?th.down.slice(1):INK, fontFace:'Calibri', fit:'shrink'}); s.addText(k.s||'', {x:x+0.2, y:y+0.92, w:3.6, h:0.3, fontSize:10, color:MU}); });
    const hl = (M.cover.highlights||[]).filter(Boolean).slice(0,5);
    if(hl.length) s.addText(hl.map(h=>({text:h.length>230?h.slice(0,227)+'…':h, options:{bullet:{code:'25A0'}, paraSpaceAfter:6}})), {x:0.5, y:4.3, w:12.3, h:2.6, fontSize:13, color:INK, fontFace:F, valign:'top'});
    // sections
    M.sections.forEach((sec, si) => {
      const text = sec.blocks.filter(b=>['p','ul','callout'].includes(b.t)).flatMap(b=> b.t==='ul' ? b.items : b.t==='callout' ? [(b.title?b.title+': ':'')+b.text] : [b.text]).filter(Boolean);
      const charts = sec.blocks.filter(b=>b.t==='chart' && images[b.key]).map(b=>b.key);
      const tables = sec.blocks.filter(b=>b.t==='table' || b.t==='kv');
      const kp = sec.blocks.find(b=>b.t==='kpis');
      s = p.addSlide({masterName:'QX'}); title(s, `${si+1}. ${sec.title}`);
      const hasChart = charts.length > 0;
      const body = text.slice(0,6).map(t=>({text: t.length>320 ? t.slice(0,317)+'…' : t, options:{bullet:{code:'25A0'}, paraSpaceAfter:6}}));
      if(kp && !hasChart && !body.length){ kp.items.slice(0,6).forEach((k,i)=>{ const x = 0.5 + (i%3)*4.15, y = 1.3 + Math.floor(i/3)*1.45; s.addShape(p.ShapeType.rect, {x, y, w:3.95, h:1.3, fill:{color:SO}}); s.addText(String(k.l).toUpperCase(), {x:x+0.2, y:y+0.1, w:3.6, h:0.3, fontSize:10, bold:true, color:MU}); s.addText(k.v, {x:x+0.2, y:y+0.42, w:3.6, h:0.6, fontSize:24, bold:true, color:INK}); }); }
      if(body.length) s.addText(body, {x:0.5, y:1.25, w: hasChart ? 5.4 : 12.3, h:5.6, fontSize: hasChart ? 12 : 14, color:INK, fontFace:F, valign:'top', fit:'shrink'});
      if(hasChart){ const im = images[charts[0]]; const w = body.length ? 6.6 : 12.3, h = Math.min(5.5, w*im.h/im.w); s.addImage({data:im.png, x: body.length ? 6.2 : 0.5, y:1.3, w, h}); }
      else if(!body.length && tables.length){ addTable(s, tables[0]); tables.shift(); }
      charts.slice(1).forEach(k=>{ const im = images[k]; const sl = p.addSlide({masterName:'QX'}); title(sl, `${si+1}. ${sec.title} (chart)`); const w = 12.3, h = Math.min(5.6, w*im.h/im.w); sl.addImage({data:im.png, x:0.5, y:1.25, w, h}); });
      tables.filter(t => (t.rows||[]).length >= 2).slice(0,3).forEach(t=>{ const sl = p.addSlide({masterName:'QX'}); title(sl, `${si+1}. ${sec.title} (table)`); addTable(sl, t); });
    });
    function addTable(sl, t){
      const head = t.t==='table' ? t.head : ['Item','Value']; const rows = (t.rows||[]).slice(0,14);
      const data = [head.map(h=>({text:String(h), options:{bold:true, color:'FFFFFF', fill:{color:P}, fontSize:10}})), ...rows.map((r,ri)=>r.map(c=>({text:String(c??''), options:{fontSize:9.5, color:INK, fill:{color: ri===t.hl ? QXTH.mix(th.accent,'#FFFFFF',0.75).slice(1) : (ri%2 ? SO : 'FFFFFF')}}})))];
      sl.addTable(data, {x:0.5, y:1.25, w:12.3, colW: head.length===2 ? [5, 7.3] : undefined, border:{type:'solid', pt:0.5, color:th.rule.slice(1)}, fontFace:'Calibri', autoPage:false});
      if(t.note) sl.addText(t.note, {x:0.5, y:6.6, w:12.3, h:0.35, fontSize:9, italic:true, color:MU});
    }
    const blob = await p.write({outputType:'blob'}); save(blob, file);
  }
  function save(blob, file){ const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href), 4000); }
  return {pdf, docx, pptx, loadLib, pdfText};
})();
