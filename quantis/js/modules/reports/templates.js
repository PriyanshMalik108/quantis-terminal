/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/modules/reports/templates.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Report TYPES and their fixed templates. Each template turns collected data
 *           (modules/reports/collectors.js) into a neutral REPORT MODEL that every renderer
 *           (HTML, PDF, Word, PowerPoint, Excel, CSV, Markdown, JSON) understands.
 * MODEL     { meta:{title, typeLabel, kind, ticker, name, sector, ccy, date, logo},
 *             cover:{kpis:[{l,v,s,tone}], keyData:[[k,v]], stance?, highlights:[…]},
 *             sections:[{title, blocks:[…]}], charts:{key:spec}, tables:{name:{head,rows}} (Excel), gaps:[…] }
 * BLOCKS    {t:'p', text} {t:'ul', items} {t:'kv', rows} {t:'table', head, rows, note, hl?} {t:'kpis', items}
 *           {t:'chart', key} {t:'callout', tone:'info'|'good'|'bad'|'warn', title, text} {t:'bars', items:[{l,v,txt}]}
 * TYPES     QXRT.TYPES lists every report type with the security kinds it applies to.
 *           Add a type: write build_<id>(D, opt) returning a model, then add it to TYPES.
 * RULES     • Text is plain (renderers escape it). • Never print an estimate in place of missing
 *           data — use '—' and list the gap. • Every derived number names its formula somewhere
 *           in the report (methodology appendix or table note).
 * ─────────────────────────────────────────────────────────────────────────────
 */
const QXRT = (() => {
  const fin = v => typeof v==='number' && isFinite(v);
  const strip = s => String(s??'').replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();
  const pc = (v,d=1) => fin(v) ? (v>=0?'+':'')+v.toFixed(d)+'%' : '—';
  const pp = (v,d=1) => fin(v) ? v.toFixed(d)+'%' : '—';
  const xx = (v,d=1) => fin(v) ? v.toFixed(d)+'×' : '—';
  const nn = (v,d=2) => fin(v) ? v.toLocaleString(undefined,{minimumFractionDigits:d, maximumFractionDigits:d}) : '—';
  const big = v => !fin(v) ? '—' : Math.abs(v)>=1e12 ? (v/1e12).toFixed(2)+'T' : Math.abs(v)>=1e9 ? (v/1e9).toFixed(2)+'B' : Math.abs(v)>=1e6 ? (v/1e6).toFixed(2)+'M' : v.toLocaleString(undefined,{maximumFractionDigits:2});
  const tone = v => fin(v) ? (v>=0?'up':'down') : '';
  const money = (v, ccy) => fin(v) ? fmtAmtCcy(v, ccy) : '—';
  const price = (v, ccy) => fin(v) ? fmtPrice(v, ccy) : '—';

  const TYPES = [
    {id:'master', label:'Master report — complete institutional analysis', kinds:['equity','preferred'], pages:'12–18 pages'},
    {id:'profile', label:'Company profile & business overview', kinds:['equity','preferred'], pages:'3–5 pages'},
    {id:'financial', label:'Core financial analysis (statements, ratios, cash flow)', kinds:['equity'], pages:'6–9 pages'},
    {id:'valuation', label:'Valuation report (multiples, football field, DCF, consensus)', kinds:['equity'], pages:'4–6 pages'},
    {id:'peers', label:'Peer comparison report', kinds:['equity'], pages:'3–4 pages'},
    {id:'technical', label:'Technical & quantitative analysis', kinds:['equity','etf','fund','preferred','index','commodity'], pages:'4–6 pages'},
    {id:'risk', label:'Risk report (market, financial, distress)', kinds:['equity','etf','fund','preferred'], pages:'4–5 pages'},
    {id:'etf', label:'ETF / fund report', kinds:['etf','fund'], pages:'4–6 pages'},
    {id:'mf', label:'Mutual fund report (NAV performance & risk)', kinds:['mf_in'], pages:'4–6 pages'},
    {id:'crypto', label:'Crypto asset report (market, tokenomics, network, risk)', kinds:['crypto'], pages:'5–7 pages'},
    {id:'crypto_brief', label:'Crypto one-page snapshot', kinds:['crypto'], pages:'1–2 pages'},
    {id:'bond', label:'Fixed-income report (terms, yield, duration, scenarios)', kinds:['bond','govbond'], pages:'4–6 pages'},
    {id:'future', label:'Futures contract report (curve, carry)', kinds:['future'], pages:'2–4 pages'},
    {id:'option', label:'Option analysis report (valuation, Greeks, scenarios)', kinds:['option'], pages:'3–4 pages'},
    {id:'fx', label:'Currency report', kinds:['fx'], pages:'3–4 pages'},
    {id:'market', label:'Market / index / commodity report', kinds:['index','commodity'], pages:'3–4 pages'},
  ];
  const typesFor = kind => TYPES.filter(t=>t.kinds.includes(kind));

  /* ---------------------------------- shared parts ---------------------------------- */
  function perfBlocks(D, ccy, label='Price'){
    const px = D.px; if(!px) return [{t:'p', text:'Price history was not available from the free sources used.'}];
    const B = [{t:'table', head:['1W','1M','3M','6M','YTD','1Y','3Y','5Y'], rows:[[px.r1w,px.r1m,px.r3m,px.r6m,px.ytd,px.r1y,px.r3y,px.r5y].map(v=>pc(v))], note:`${label} returns to ${px.lastDate}. Source series: ${px.firstDate} → ${px.lastDate}.`}];
    B.push({t:'chart', key:'price'});
    B.push({t:'kv', rows:[['Annualised volatility', pp(px.volPct)], ['Maximum drawdown', `${pp(px.mddPct)} (${px.mddFrom} → ${px.mddTo})`], ['Sharpe ratio (rf = 0)', nn(px.sharpe)], ['Sortino ratio', nn(px.sortino)], ['Calmar ratio', nn(px.calmar)], ['Daily VaR 95% / Expected shortfall', `${pp(px.var95Pct,2)} / ${pp(px.cvar95Pct,2)}`], ['Best / worst day', `${pc(px.bestPct,2)} / ${pc(px.worstPct,2)}`], ['% positive days', pp(px.posPct,0)], ['CAGR (full history)', pc(px.cagr)], ...(px.rolling1y?[['Rolling 1-year returns', `min ${pc(px.rolling1y.min)} · median ${pc(px.rolling1y.median)} · max ${pc(px.rolling1y.max)} · ${pp(px.rolling1y.pctPositive,0)} positive`]]:[])]});
    return B;
  }
  function priceChart(D, name, withMA=true){
    if(!D.series) return null;
    const n = D.series.c.length, k = Math.min(n, 520), labels = D.series.t.slice(-k), c = D.series.c.slice(-k);
    const series = [{name, data:c}];
    if(withMA && n>=200){ const s50 = QXM.series.sma(D.series.c,50).slice(-k), s200 = QXM.series.sma(D.series.c,200).slice(-k); series.push({name:'50-day average', data:s50, dash:true, width:2.2}, {name:'200-day average', data:s200, dash:true, width:2.2}); }
    return {kind:'line', title:`${name} — price (last ${Math.round(k/252*10)/10} years)`, labels, series};
  }
  function relChart(D, name){
    if(!D.series || !D.benchmark) return null;
    const map = new Map(D.benchmark.series.t.map((t,i)=>[t, D.benchmark.series.c[i]])); const k = Math.min(D.series.c.length, 260);
    const t = D.series.t.slice(-k), c = D.series.c.slice(-k); const idx = t.findIndex(x=>map.has(x)); if(idx<0) return null;
    const b0 = map.get(t[idx]), c0 = c[idx]; const labels = [], a = [], b = []; for(let i=idx;i<t.length;i++){ if(!map.has(t[i])) continue; labels.push(t[i]); a.push(c[i]/c0*100); b.push(map.get(t[i])/b0*100); }
    return {kind:'line', title:`Relative performance — rebased to 100 (1 year)`, labels, series:[{name, data:a}, {name:D.benchmark.t, data:b, dash:true}]};
  }
  function ddChart(D){ if(!D.series) return null; const k = Math.min(D.series.c.length, 780); return {kind:'line', title:'Drawdown from running peak (%)', labels:D.series.t.slice(-k), series:[{name:'Drawdown', data:QXM.series.drawdownSeries(D.series.c.slice(-k)), fill:true, color:'#B23A3A'}], yFmt:'pct'}; }
  function histChart(D){ if(!D.series || D.series.c.length < 60) return null; const c = D.series.c.slice(-253); const r = []; for(let i=1;i<c.length;i++) r.push((c[i]/c[i-1]-1)*100); return {kind:'hist', title:'Distribution of daily returns — last 12 months', data:r, bins:30}; }
  function appendix(D, opt, sources, method){
    const sec = [];
    sec.push({title:'Methodology & data sources', blocks:[{t:'ul', items:[...method, ...sources.map(s=>'Source — '+s)]}].concat(D.gaps && D.gaps.length ? [{t:'callout', tone:'warn', title:'Data gaps at generation', text:D.gaps.join(' · ')}] : [])});
    const disc = [{t:'p', text:`Generated on ${D.generated.toUTCString()} from publicly available data with automated, rule-based analysis. This document is for information and education only; it is not investment advice, an offer or a recommendation to buy or sell any security. Figures can contain errors from upstream sources — verify against primary filings before acting. Past performance does not guarantee future results.`}];
    if(opt.confidential){ const who = opt.preparedBy || 'the author'; disc.push({t:'callout', tone:'bad', title:'Confidential', text:`Prepared solely by ${who}${opt.firm?` (${opt.firm})`:''}. All rights reserved to ${who}. This document may not be copied, shared or distributed, in whole or in part, without the prior written permission of ${who}.`}); }
    sec.push({title:'Disclosures', blocks:disc});
    return sec;
  }
  function custom(D){ if(!D.custom || !D.custom.length) return []; return [{title:'Data from your connected APIs', blocks: D.custom.flatMap(c => c.error ? [{t:'p', text:`${c.name}: unavailable (${c.error}).`}] : [{t:'p', text:c.name}, {t:'kv', rows:c.rows.map(r=>[r.label, r.text])}])}]; }
  const meta = (D, typeId, name, ticker, sector, ccy, logo) => ({typeId, typeLabel:(TYPES.find(t=>t.id===typeId)||{}).label, kind:D.kind, name, ticker, sector, ccy, date:D.generated, logo});

  /* ================================ EQUITY ================================ */
  function eqCommon(D){
    const f = D.f || {}, sec = D.sec, ccy = D.ccy, m = D.m, S = D.S;
    const name = f.entityName || sec.n || D.t;
    const kpis = [
      {l:'Price', v:price(D.price, ccy), s:D.px?pc(D.px.r1y)+' 1Y':'', tone:D.px?tone(D.px.r1y):''},
      {l:'Market cap', v:fin(f.marketCap)?fmtMarketCapShort(f.marketCap, f.marketCapCurrency||ccy):'—', s:f.sector||''},
      {l:'P/E (TTM)', v:xx(f.pe), s:D.peers&&fin(D.peers.median.pe)?'peers '+xx(D.peers.median.pe):''},
      {l:'EV/EBITDA', v:xx(f.evEbitda), s:D.peers&&fin(D.peers.median.evEbitda)?'peers '+xx(D.peers.median.evEbitda):''},
      {l:'Health score', v:S?S.V.overall+'/100':'—', s:S?S.V.label:'', tone:S?(S.V.overall>=58?'up':S.V.overall<42?'down':''):''},
      {l:'Div. yield', v:fin(f.dividendYield)?pp(f.dividendYield*100,2):'—', s:fin(f.beta)?'beta '+nn(f.beta):''},
    ];
    const keyData = [['Ticker / exchange', `${D.t} · ${sec.ex||f.exchange||''}`], ['Sector / industry', `${f.sector||sec.sector||'—'} / ${f.industry||'—'}`], ['Country', f.country||sec.ctry||'—'], ['Price (close)', `${price(D.price, ccy)}${D.px?' · '+D.px.lastDate:''}`],
      ['52-week range', D.px?`${price(D.px.lo52, ccy)} – ${price(D.px.hi52, ccy)}`:'—'], ['Shares outstanding', big(f.sharesOut)], ['Beta (5Y)', nn(f.beta)], ['Consensus target', f.analyst&&fin(f.analyst.targetMean)?`${price(f.analyst.targetMean, ccy)} (${f.analyst.numAnalysts||'?'} analysts, ${pc((f.analyst.targetMean/D.price-1)*100)})`:'—'],
      ['Next earnings', f.earnings&&f.earnings.nextDate?new Date(f.earnings.nextDate).toISOString().slice(0,10):'—'], ['Reporting currency', m?m.ccy:'—']];
    const highlights = [];
    if(S) highlights.push(strip(S.html));
    if(S) S.F.green.slice(0,3).forEach(g=>highlights.push('Strength: '+g)); if(S) S.F.red.slice(0,3).forEach(g=>highlights.push('Watch: '+g));
    if(D.tech) highlights.push(`Technical trend: ${D.tech.label} (${D.tech.score>=0?'+':''}${D.tech.score} net signals of ${D.tech.signals.length}).`);
    return {f, sec, ccy, m, S, name, kpis, keyData, highlights};
  }
  function eqCharts(D, name){
    const C = {}, m = D.m;
    const pcx = priceChart(D, D.t); if(pcx) C.price = pcx; const rc = relChart(D, D.t); if(rc) C.rel = rc; const dd = ddChart(D); if(dd) C.dd = dd; const hc = histChart(D); if(hc) C.hist = hc;
    if(m){ const H = m.H, n = Math.min(5, H.years.filter(Boolean).length), idx = [...Array(n).keys()].reverse(), labels = idx.map(i=>'FY'+H.years[i]);
      C.fin = {kind:'bar', title:`Revenue, net income and free cash flow (${m.ccy})`, labels, series:[{name:'Revenue', data:idx.map(i=>H.revenue[i])}, {name:'Net income', data:idx.map(i=>H.net[i])}, {name:'Free cash flow', data:idx.map(i=>H.fcf[i])}], yFmt:'money'};
      C.margins = {kind:'line', title:'Margin trends (%)', labels, series:[['Gross',H.gm],['EBITDA',H.em],['Net',H.nm],['FCF',H.fm]].map(([nm,a])=>({name:nm, data:idx.map(i=>fin(a[i])?+(a[i]*100).toFixed(2):null)})), yFmt:'pct'};
      C.cash = {kind:'bar', title:`Operating cash flow vs net income (${m.ccy})`, labels, series:[{name:'Operating cash flow', data:idx.map(i=>H.cfo[i])}, {name:'Net income', data:idx.map(i=>H.net[i])}, {name:'Capex', data:idx.map(i=>fin(H.capex[i])?-Math.abs(H.capex[i]):null)}], yFmt:'money'};
      const L = m.L, Dd = m.D; const steps = [['Net income',L.net,'abs'],['+ D&A',Dd.da],['Working capital & other',Dd.wcOther],['Operating cash flow',L.cfo,'sub'],['Capex',L.capex],['Other investing',Dd.cfiOther],['Dividends',L.div],['Change in debt',Dd.dDebt],['Other financing',Dd.cffOther],['Net change in cash',Dd.netCash,'sub']].filter(s=>fin(s[1]));
      if(steps.length > 4) C.bridge = {kind:'waterfall', title:`Cash bridge FY${H.years[0]} (${m.ccy})`, steps, yFmt:'money'};
      if(D.S) C.radar = {kind:'radar', w:1300, h:1000, title:'Financial-health pillars (0–100)', labels:D.S.V.pillars.map(p=>p.k), series:[{name:name, data:D.S.V.pillars.map(p=>p.score)}]};
      if(D.S) C.gauge = {kind:'gauge', title:'Financial-health score', value:D.S.V.overall, label:D.S.V.label};
    }
    if(D.peers){ const P = D.peers; const rows = P.rows.filter(r=>fin(r.price_earnings_ttm) && r.price_earnings_ttm>0).slice(0,10);
      if(rows.length>2) C.peerPe = {kind:'bar', title:'P/E vs peers', labels:rows.map(r=>String(r._s).split(':')[1]), series:[{name:'P/E', data:rows.map(r=>+r.price_earnings_ttm.toFixed(1)), colors:rows.map(r=>r._s===P.self?'#C9A227':'#1F3A5F')}], yFmt:'x'};
      const rows2 = P.rows.filter(r=>fin(r.return_on_equity)).slice(0,10);
      if(rows2.length>2) C.peerRoe = {kind:'bar', title:'ROE vs peers (%)', labels:rows2.map(r=>String(r._s).split(':')[1]), series:[{name:'ROE', data:rows2.map(r=>+r.return_on_equity.toFixed(1)), colors:rows2.map(r=>r._s===P.self?'#C9A227':'#1F3A5F')}], yFmt:'pct'};
    }
    const fb = football(D); if(fb) C.football = fb;
    return C;
  }
  function football(D){
    const f = D.f || {}, P = D.peers, rows = [];
    const eps = f.eps, sh = f.sharesOut, m = D.m;
    if(P && fin(eps) && eps>0){ const pes = P.rows.map(r=>r.price_earnings_ttm).filter(v=>fin(v)&&v>0).sort((a,b)=>a-b); if(pes.length>=4){ const q = p => pes[Math.floor(p*(pes.length-1))]; rows.push({label:'Peer P/E (25th–75th pct)', lo:eps*q(0.25), hi:eps*q(0.75)}); } }
    if(P && m && fin(sh) && sh>0 && fin(m.L.ebitda)){ const evs = P.rows.map(r=>r.enterprise_value_ebitda_ttm).filter(v=>fin(v)&&v>0).sort((a,b)=>a-b); if(evs.length>=4){ const q = p => evs[Math.floor(p*(evs.length-1))]; const nd = fin(m.L.netDebt) ? m.L.netDebt : 0; const fx = f.fxReportToTrade || 1; rows.push({label:'Peer EV/EBITDA (25th–75th)', lo:(m.L.ebitda*q(0.25)-nd)/sh*fx, hi:(m.L.ebitda*q(0.75)-nd)/sh*fx}); } }
    if(f.analyst && fin(f.analyst.targetLow) && fin(f.analyst.targetHigh)) rows.push({label:'Analyst price targets', lo:f.analyst.targetLow, hi:f.analyst.targetHigh});
    if(D.px) rows.push({label:'52-week trading range', lo:D.px.lo52, hi:D.px.hi52});
    if(D.dcf && fin(D.dcf.fairValueBear) && fin(D.dcf.fairValueBull)) rows.push({label:'DCF (bear – bull)', lo:Math.min(D.dcf.fairValueBear, D.dcf.fairValueBull), hi:Math.max(D.dcf.fairValueBear, D.dcf.fairValueBull)});
    if(rows.length < 2 || !fin(D.price)) return null;
    return {kind:'football', title:`Valuation football field — value per share (${D.ccy})`, rows, marker:{value:D.price, label:'Price '+nn(D.price)}, xFmt:'num'};
  }
  function eqSections(D, which, ctx){
    const {f, ccy, m, S, name} = ctx, out = [];
    if(which.includes('summary')){
      const b = [{t:'kpis', items:ctx.kpis}, {t:'ul', items:ctx.highlights.length?ctx.highlights:['Insufficient live data to summarise.']}];
      if(D.stance) b.push({t:'callout', tone: D.stance.label==='POSITIVE'?'good':D.stance.label==='CAUTIOUS'?'bad':'info', title:`Model view: ${D.stance.label} (${D.stance.score}/100)`, text:D.stance.parts.map(p=>`${p[0]}: ${Math.round(p[1])}`).join(' · ')+'. A disclosed rule-based composite (see methodology) — not a recommendation.'});
      if(S) b.push({t:'chart', key:'gauge'});
      out.push({title:'Investment summary', blocks:b});
    }
    if(which.includes('profile')){
      const wd = D.wd || {}, b = [];
      if(D.wiki && D.wiki.extract) b.push({t:'p', text:D.wiki.extract+' (Wikipedia)'});
      else if(wd.description) b.push({t:'p', text:`${name} — ${wd.description} (Wikidata).`});
      b.push({t:'kv', rows:[['Legal / listed name', name], ['Founded', wd.founded||'—'], ['Headquarters', wd.headquarters||'—'], ['Chief executive', wd.ceo||'—'], ['Founders', wd.founders||'—'], ['Industry (Wikidata)', wd.industry||'—'], ['Employees', fin(f.employees)?Math.round(f.employees).toLocaleString():fin(wd.employees)?wd.employees.toLocaleString():'—'], ['Website', wd.website||'—'], ['ISIN', wd.isin||'—'], ['Sector (TradingView)', f.sector||'—'], ['Latest fiscal year', m&&m.H.years[0]?'FY'+m.H.years[0]:'—']]});
      b.push({t:'callout', tone:'info', title:'Business verticals / segments', text: ctx.opt.verticals || 'Segment revenue is not published by the free sources used. Add the company\'s business verticals (from its annual report) in the report options and they will appear here.'});
      if(D.news && D.news.length) b.push({t:'table', head:['Date','Recent headline'], rows:D.news.slice(0,6).map(n=>[n.date?new Date(n.date).toISOString().slice(0,10):'', n.title]), note:'Source: CNBC news search.'});
      out.push({title:'Company overview', blocks:b});
    }
    if(which.includes('financials') && m){
      const H = m.H, n = Math.min(5, H.years.filter(Boolean).length), idx = [...Array(n).keys()].reverse(), yrs = idx.map(i=>'FY'+H.years[i]);
      const row = (l,a,fmt) => [l, ...idx.map(i=>fin(a[i])?fmt(a[i],i):'—')]; const g = a => (v,i)=>{ const p0 = a[i+1]; return fin(p0)&&p0!==0 ? pc((v/Math.abs(p0)-Math.sign(p0))*100) : '—'; };
      const mo = v => money(v, m.ccy);
      out.push({title:'Financial performance', blocks:[{t:'p', text:strip(S.n.growth.concat(S.n.quarter).join(' '))},
        {t:'table', head:[`(${m.ccy})`, ...yrs], rows:[row('Revenue',H.revenue,mo), row('  growth',H.revenue,g(H.revenue)), row('Gross profit',H.gross,mo), row('EBITDA',H.ebitda,mo), row('Net income',H.net,mo), row('  growth',H.net,g(H.net)), row('EPS (diluted)',H.eps,v=>v.toFixed(2)), row('Operating cash flow',H.cfo,mo), row('Capital expenditure',H.capex,v=>mo(-Math.abs(v))), row('Free cash flow',H.fcf,mo), row('Total debt',H.debt,mo), row('Gross margin',H.gm,v=>pp(v*100)), row('EBITDA margin',H.em,v=>pp(v*100)), row('Net margin',H.nm,v=>pp(v*100)), row('Cash conversion (CFO/NI)',H.conv,v=>xx(v,2))].filter(r=>r.slice(1).some(v=>v!=='—')), note:'Source: TradingView fundamentals (company filings). Operating cash flow = free cash flow + capex (exact identity).'},
        {t:'chart', key:'fin'}]});
      if(D.li && D.li.quarterly && D.li.quarterly.length){ const Q = D.li.quarterly.slice(0,8).reverse(); const qm = v => money(v, D.li.ccy||m.ccy);
        out.push({title:'Quarterly cash flows & line items', blocks:[{t:'table', head:['Quarter ending', ...Q.map(q=>q.end)], rows:[['Revenue',...Q.map(q=>qm(q.revenue))],['Net income',...Q.map(q=>qm(q.netIncome))],['Operating cash flow',...Q.map(q=>qm(q.cfo))],['Capex',...Q.map(q=>qm(q.capex))],['Free cash flow',...Q.map(q=>fin(q.cfo)&&fin(q.capex)?qm(q.cfo+q.capex):'—')],['Investing cash flow',...Q.map(q=>qm(q.cfi))],['Financing cash flow',...Q.map(q=>qm(q.cff))],['Dividends',...Q.map(q=>qm(q.dividends))],['Buybacks',...Q.map(q=>qm(q.buybacks))]].filter(r=>r.slice(1).some(v=>v!=='—')), note:`Source: ${D.li.source} (your API key), exact reported line items.`}]}); }
      out.push({title:'Profitability & returns', blocks:[{t:'p', text:strip(S.n.margins.concat(S.n.returns).join(' '))}, {t:'chart', key:'margins'}, {t:'table', head:['Ratio','Value','Formula','Assessment'], rows:D.metrics.filter(q=>['Profitability','Returns'].includes(q.group)&&q.value!=null).map(q=>[q.name, strip(q.text), q.formula, q.tone==='good'?'Strong':q.tone==='bad'?'Weak':'Neutral'])}]});
      const L = m.L, Dd = m.D;
      out.push({title:'Cash-flow analysis', blocks:[{t:'callout', tone:fin(L.cfo)&&L.cfo<0?'bad':'good', title:'Operating activities', text:strip(S.n.cfo.join(' '))}, {t:'callout', tone:'info', title:'Investing activities', text:strip(S.n.cfi.join(' '))}, {t:'callout', tone:'info', title:'Financing activities', text:strip(S.n.cff.join(' '))}, {t:'chart', key:'bridge'},
        {t:'table', head:['Cash bridge FY'+(H.years[0]||''), m.ccy, 'Basis'], rows:[['Net income',mo(L.net),'reported'],['Depreciation & amortisation',mo(Dd.da),'EBITDA − EBIT'],['Working capital & other',mo(Dd.wcOther),'CFO − NI − D&A'],['Cash from operations',mo(L.cfo),'reported'],['Capital expenditure',mo(L.capex),'reported'],['Other investing',mo(Dd.cfiOther),'CFI − capex'],['Cash from investing',mo(L.cfi),'reported'],['Dividends paid',mo(L.div),'reported'],['Change in total debt',mo(Dd.dDebt),'debt history'],['Other financing incl. buybacks',mo(Dd.cffOther),'CFF − dividends − Δdebt'],['Cash from financing',mo(L.cff),'reported'],['Net change in cash',mo(Dd.netCash),'CFO + CFI + CFF']].filter(r=>r[1]!=='—'), note:`Life-cycle stage (Dickinson 2011): ${S.lc[0]} — ${S.lc[1]}`}, {t:'chart', key:'cash'}]});
      out.push({title:'Balance sheet & solvency', blocks:[{t:'p', text:strip(S.n.balance.join(' '))}, {t:'table', head:['Ratio','Value','Formula','Assessment'], rows:D.metrics.filter(q=>['Liquidity','Leverage','Efficiency','Cash quality','Scores'].includes(q.group)&&q.value!=null).map(q=>[q.name, strip(q.text), q.formula, q.tone==='good'?'Strong':q.tone==='bad'?'Weak':'Neutral'])}, {t:'chart', key:'radar'}]});
      out.push({title:'Red flags & strengths', blocks:[{t:'callout', tone:'bad', title:`Red flags (${S.F.red.length})`, text:S.F.red.length?S.F.red.join(' · '):'None triggered by the screening rules.'}, {t:'callout', tone:'good', title:`Strengths (${S.F.green.length})`, text:S.F.green.length?S.F.green.join(' · '):'None triggered.'}, {t:'bars', items:S.V.pillars.map(p=>({l:p.k, v:p.score, txt:p.score+'/100'}))}]});
    } else if(which.includes('financials')) out.push({title:'Financial analysis', blocks:[{t:'callout', tone:'warn', title:'Statements unavailable', text:'Reported statements were not available from the free sources used for this security.'}]});
    if(which.includes('valuation')){
      const P = D.peers, b = [];
      const vr = [['P/E (TTM)', xx(f.pe), P?xx(P.median.price_earnings_ttm):'—'], ['Forward P/E', xx(f.forwardPe), '—'], ['P/B', xx(f.priceToBook), P?xx(P.median.price_book_fq):'—'], ['P/S', xx(f.priceToSales), P?xx(P.median.price_sales_current):'—'], ['EV/EBITDA', xx(f.evEbitda), P?xx(P.median.enterprise_value_ebitda_ttm):'—'], ['PEG', xx(f.pegRatio,2), '—'], ['Dividend yield', fin(f.dividendYield)?pp(f.dividendYield*100,2):'—', P?pp(P.median.dividends_yield_current,2):'—']].filter(r=>r[1]!=='—');
      b.push({t:'table', head:['Multiple', D.t, P?`Peer median (${P.rows.length})`:'Peer median'], rows:vr, note:P?`Peers: largest primary listings in ${P.sector}${P.country?' ('+P.country+')':''}; medians exclude negative multiples.`:'Peer data unavailable.'});
      if(P && fin(f.pe) && f.pe>0 && fin(P.median.pe)) b.push({t:'p', text:`At ${f.pe.toFixed(1)}× trailing earnings the shares trade at a ${f.pe>P.median.pe?((f.pe/P.median.pe-1)*100).toFixed(0)+'% premium':((1-f.pe/P.median.pe)*100).toFixed(0)+'% discount'} to the peer median of ${P.median.pe.toFixed(1)}×. ${f.pe>P.median.pe?'A premium is justified only by superior growth, returns or lower risk — compare ROIC and growth with peers.':'A discount can indicate value, or lower growth / higher risk.'}`});
      b.push({t:'chart', key:'football'});
      if(D.dcf && fin(D.dcf.fairValueBase)) b.push({t:'kv', rows:[['DCF value — bear / base / bull', `${price(D.dcf.fairValueBear,ccy)} / ${price(D.dcf.fairValueBase,ccy)} / ${price(D.dcf.fairValueBull,ccy)}`], ['Upside to base case', pc(D.dcf.upsidePct)], ['Inputs', `FCF growth ${D.dcf.inputs.growth}%, WACC ${D.dcf.inputs.wacc}%, terminal growth ${D.dcf.inputs.terminal}%`]]});
      else b.push({t:'p', text:'DCF: run the DCF in Research → Valuation for this company to include an intrinsic-value range (inputs are yours, so they are not assumed here).'});
      if(f.analyst && fin(f.analyst.targetMean)) b.push({t:'kv', rows:[['Consensus target (mean)', price(f.analyst.targetMean, ccy)], ['Target range', `${price(f.analyst.targetLow, ccy)} – ${price(f.analyst.targetHigh, ccy)}`], ['Consensus rating', String(f.analyst.recKey||'—').replace('_',' ').toUpperCase()+(fin(f.analyst.recMean)?` (${f.analyst.recMean.toFixed(2)} on 1–5)`:'')], ['Analysts', f.analyst.numAnalysts||'—']]});
      b.push({t:'chart', key:'peerPe'});
      out.push({title:'Valuation', blocks:b});
    }
    if(which.includes('peers') && D.peers){ const P = D.peers;
      out.push({title:'Peer comparison', blocks:[{t:'table', head:['Company', ...P.cols.map(c=>c[1])], rows:[...P.rows.map(r=>[String(r._s).split(':')[1]+' — '+String(r.description||'').slice(0,22), ...P.cols.map(([k,,fm])=>QXP.fmt(r[k], fm, r.currency))]), ['Peer median', ...P.cols.map(([k,,fm])=>QXP.fmt(P.median[k], fm, P.ccy))], [`${D.t} rank (1 = best)`, ...P.cols.map(([k])=>P.ranks[k]?P.ranks[k].rank+'/'+P.ranks[k].of:'—')]], hl:P.rows.findIndex(r=>r._s===P.self), note:`Largest ${P.rows.length} primary listings in ${P.sector}${P.country?' ('+P.country+')':''} by market value · TradingView.`}, {t:'chart', key:'peerRoe'}, {t:'chart', key:'peerPe'}]}); }
    if(which.includes('technical')) out.push({title:'Share-price performance & technicals', blocks:[...perfBlocks(D, ccy), {t:'chart', key:'rel'}, ...(D.tech?[{t:'table', head:['Signal','Reading','Bias'], rows:D.tech.signals.map(s=>[s[0], s[2], s[1]>0?'Bullish':s[1]<0?'Bearish':'Neutral']), note:`Net signal score ${D.tech.score>=0?'+':''}${D.tech.score} → ${D.tech.label}. ATR(14) = ${pp(D.tech.atrPct,2)} of price.`}]:[]), {t:'chart', key:'hist'}]});
    if(which.includes('risk')){ const px = D.px, b = [];
      b.push({t:'kv', rows:[['Annualised volatility', px?pp(px.volPct):'—'], ['Beta vs '+(D.benchmark?D.benchmark.t:'market'), D.benchmark&&D.series?nn(betaVs(D)):nn(f.beta)], ['Daily VaR 95% (historical)', px?pp(px.var95Pct,2):'—'], ['Expected shortfall 95%', px?pp(px.cvar95Pct,2):'—'], ['Maximum drawdown', px?`${pp(px.mddPct)} (${px.mddFrom} → ${px.mddTo})`:'—']]});
      b.push({t:'chart', key:'dd'});
      if(D.metrics){ const pick = ['Current ratio','Quick ratio','Debt / Equity','Net debt / EBITDA','Interest cover','Altman Z-score','Zmijewski score','Piotroski F-score','Accruals ratio (balance-sheet free)']; b.push({t:'table', head:['Financial-risk measure','Value','Reading'], rows:D.metrics.filter(q=>pick.includes(q.name)&&q.value!=null).map(q=>[q.name, strip(q.text), q.tone==='good'?'Low risk':q.tone==='bad'?'Elevated':'Moderate'])}); }
      const risks = []; if(D.S) D.S.F.red.forEach(r=>risks.push(r)); if(fin(f.beta)&&f.beta>1.2) risks.push(`High market sensitivity (beta ${f.beta.toFixed(2)})`); if(px && px.volPct>40) risks.push(`High share-price volatility (${px.volPct.toFixed(0)}% annualised)`); if(D.peers&&fin(f.pe)&&fin(D.peers.median.pe)&&f.pe>1.5*D.peers.median.pe) risks.push('Valuation risk — multiple far above peers'); if(m&&m.ccy&&ccy&&m.ccy!==ccy&&!/^GB[pX]$/.test(ccy)) risks.push(`Currency mismatch: reports in ${m.ccy}, trades in ${ccy}`);
      b.push({t:'ul', items:risks.length?risks:['No quantitative risk flags triggered. Assess qualitative risks (competition, regulation, governance, execution, macro) from the annual report.']});
      out.push({title:'Risk assessment', blocks:b}); }
    if(which.includes('conclusion')){ const c = [];
      if(S) c.push(`${name} scores ${S.V.overall}/100 on financial health (${S.V.label.toLowerCase()}) and sits in the ${S.lc[0].toLowerCase()} stage of the corporate life cycle.`);
      if(S && S.F.green.length) c.push(`Its main strengths are ${S.F.green.slice(0,3).join(', ').toLowerCase()}.`);
      if(S && S.F.red.length) c.push(`Points to monitor: ${S.F.red.slice(0,3).join(', ').toLowerCase()}.`);
      if(D.peers && fin(f.pe) && fin(D.peers.median.pe)) c.push(`On valuation it trades at ${f.pe.toFixed(1)}× earnings against a peer median of ${D.peers.median.pe.toFixed(1)}×.`);
      if(D.tech) c.push(`The price trend is ${D.tech.label.toLowerCase()} on our technical checklist.`);
      if(D.stance) c.push(`Combining these, the disclosed model view is ${D.stance.label} (${D.stance.score}/100).`);
      const b = [{t:'p', text:c.join(' ')||'Insufficient data for a conclusion.'}]; if(ctx.opt.analystView) b.push({t:'callout', tone:'info', title:'Analyst\'s view', text:ctx.opt.analystView});
      out.push({title:'Conclusion', blocks:b}); }
    if(which.includes('ratios') && D.metrics) out.push({title:'Appendix — ratio library', blocks:[{t:'table', head:['Group','Metric','Formula','Inputs','Value'], rows:D.metrics.filter(q=>q.value!=null).map(q=>[q.group, q.name, q.formula, strip(q.inputs), strip(q.text)])}]});
    return out;
  }
  function betaVs(D){ const map = new Map(D.benchmark.series.t.map((t,i)=>[t, D.benchmark.series.c[i]])); const a=[], b=[]; const k = Math.min(D.series.c.length, 520); for(let i=D.series.t.length-k;i<D.series.t.length;i++){ const t = D.series.t[i]; if(map.has(t)){ a.push(D.series.c[i]); b.push(map.get(t)); } } return a.length>60 ? QXM.series.beta(a,b) : null; }
  const EQ_SOURCES = ['TradingView fundamentals & screener (statements, ratios, peers)', 'CNBC market data (prices, split-adjusted)', 'Wikidata & Wikipedia (company facts)', 'CNBC news search', 'Your statement API key (FMP / Alpha Vantage / Finnhub) where configured'];
  const EQ_METHOD = ['Derived items: D&A = EBITDA − EBIT; working-capital & other = CFO − net income − D&A; other investing = CFI − capex; other financing = CFF − dividends − Δdebt.', 'Financial-health score: share of rated ratios passing standard benchmarks (good = 1, neutral = ½, weak = 0), averaged across pillars.', 'Model view: 40% financial health, 30% relative P/E vs peer median (50 + (1 − P/E ÷ median) × 60, capped 0–100), 30% technical checklist (50 + 8 × net signals).', 'Risk statistics from daily closes: volatility = st. dev. × √252; historical VaR = 5th percentile of daily returns; expected shortfall = mean of returns below it.'];
  function buildEquity(typeId, D, opt){
    const ctx = eqCommon(D); ctx.opt = opt;
    const plans = {master:['summary','profile','financials','valuation','peers','technical','risk','conclusion','ratios'], profile:['summary','profile','peers'], financial:['summary','financials','conclusion','ratios'], valuation:['summary','valuation','peers','conclusion'], peers:['summary','peers','valuation'], technical:['summary','technical'], risk:['summary','risk','technical']};
    const sections = eqSections(D, plans[typeId] || plans.master, ctx).concat(custom(D)).concat(appendix(D, opt, EQ_SOURCES, EQ_METHOD));
    return {meta:meta(D, typeId, ctx.name, D.t, ctx.f.sector||ctx.sec.sector||'', ctx.ccy, D.logo), cover:{kpis:ctx.kpis, keyData:ctx.keyData, stance:D.stance, highlights:ctx.highlights.slice(0,6)}, sections, charts:eqCharts(D, ctx.name), gaps:D.gaps};
  }

  /* ================================ ETF / FUND (TradingView listing) ================================ */
  function buildEtf(D, opt){
    const f = D.f || {}, ccy = D.ccy, name = f.entityName || D.sec.n || D.t;
    const kpis = [{l:'Price', v:price(D.price, ccy), s:D.px?pc(D.px.r1y)+' 1Y':'', tone:D.px?tone(D.px.r1y):''}, {l:'AUM', v:fin(f.aum)?fmtMarketCapShort(f.aum, ccy):'—'}, {l:'Expense ratio', v:fin(f.expenseRatio)?pp(f.expenseRatio,2):'—'}, {l:'Dividend yield', v:fin(f.dividendYield)?pp(f.dividendYield*100,2):'—'}, {l:'Volatility', v:D.px?pp(D.px.volPct):'—'}, {l:'Max drawdown', v:D.px?pp(D.px.mddPct):'—', tone:'down'}];
    const sections = [{title:'Fund overview', blocks:[{t:'kpis', items:kpis}, {t:'kv', rows:[['Name', name], ['Issuer / brand', f.brand||'—'], ['Exchange', D.sec.ex||'—'], ['Category / sector', D.sec.sector||'—'], ['Currency', ccy]]}, ...(D.wiki&&D.wiki.extract?[{t:'p', text:D.wiki.extract}]:[])]},
      {title:'Performance', blocks:[...perfBlocks(D, ccy, 'Total price'), {t:'chart', key:'rel'}]}, {title:'Risk', blocks:[{t:'chart', key:'dd'}, {t:'chart', key:'hist'}]},
      ...(D.tech?[{title:'Trend & technicals', blocks:[{t:'table', head:['Signal','Reading','Bias'], rows:D.tech.signals.map(s=>[s[0], s[2], s[1]>0?'Bullish':s[1]<0?'Bearish':'Neutral'])}]}]:[])].concat(custom(D)).concat(appendix(D, opt, ['CNBC market data', 'TradingView fund data (AUM, expense ratio)'], ['Returns are price returns from daily closes (distributions not reinvested).']));
    const C = {}; const pcx = priceChart(D, D.t); if(pcx) C.price = pcx; const rc = relChart(D, D.t); if(rc) C.rel = rc; const dd = ddChart(D); if(dd) C.dd = dd; const hc = histChart(D); if(hc) C.hist = hc;
    return {meta:meta(D, 'etf', name, D.t, D.sec.sector||'Fund', ccy, D.logo), cover:{kpis, keyData:[['Ticker', D.t], ['Exchange', D.sec.ex||''], ['Price', price(D.price, ccy)], ['52-week range', D.px?`${price(D.px.lo52,ccy)} – ${price(D.px.hi52,ccy)}`:'—']], highlights:[D.px?`1-year return ${pc(D.px.r1y)}, annualised volatility ${pp(D.px.volPct)}, maximum drawdown ${pp(D.px.mddPct)}.`:'']}, sections, charts:C, gaps:D.gaps};
  }

  /* ================================ INDIAN MUTUAL FUND ================================ */
  function buildMf(D, opt){
    const m = D.meta || {}, px = D.px, name = m.scheme_name || D.item.name;
    const kpis = [{l:'NAV', v:fin(D.price)?'₹'+nn(D.price,4):'—', s:px?px.lastDate:''}, {l:'1-year', v:pc(px?.r1y), tone:tone(px?.r1y)}, {l:'3-year (abs.)', v:pc(px?.r3y), tone:tone(px?.r3y)}, {l:'CAGR', v:pc(px?.cagr), s:px?'since '+px.firstDate:''}, {l:'Volatility', v:px?pp(px.volPct):'—'}, {l:'Max drawdown', v:px?pp(px.mddPct):'—', tone:'down'}];
    const C = {}; if(D.series){ const k = Math.min(D.series.c.length, 1300); C.price = {kind:'line', title:'NAV history (₹)', labels:D.series.t.slice(-k), series:[{name:'NAV', data:D.series.c.slice(-k), fill:true}]}; } const rc = relChart(D, 'Fund'); if(rc) C.rel = rc; const dd = ddChart(D); if(dd) C.dd = dd; const hc = histChart(D); if(hc) C.hist = hc;
    const sections = [{title:'Scheme overview', blocks:[{t:'kpis', items:kpis}, {t:'kv', rows:[['Scheme', name], ['Fund house', m.fund_house||'—'], ['Category', m.scheme_category||'—'], ['Scheme type', m.scheme_type||'—'], ['AMFI scheme code', m.scheme_code||'—'], ['ISIN (growth)', m.isin_growth||'—'], ['ISIN (reinvestment)', m.isin_div_reinvestment||'—']]}]},
      {title:'Performance', blocks:[...perfBlocks(D, 'INR', 'NAV'), {t:'chart', key:'rel'}, {t:'p', text:'Benchmark shown is the NIFTY 50 price index for context; the scheme\'s official benchmark (see factsheet) may differ.'}]},
      {title:'Risk', blocks:[{t:'chart', key:'dd'}, {t:'chart', key:'hist'}]},
      {title:'Conclusion', blocks:[{t:'p', text: px ? `Over ${px.years.toFixed(1)} years of NAV history the scheme compounded at ${pc(px.cagr)} a year with ${pp(px.volPct)} annualised volatility and a worst peak-to-trough fall of ${pp(px.mddPct)}. ${px.rolling1y?`Rolling one-year returns were positive ${pp(px.rolling1y.pctPositive,0)} of the time (median ${pc(px.rolling1y.median)}).`:''}` : 'NAV history unavailable.'}, ...(opt.analystView?[{t:'callout', tone:'info', title:'Analyst\'s view', text:opt.analystView}]:[])]},
    ].concat(appendix(D, opt, ['mfapi.in (AMFI NAV history)', 'CNBC (NIFTY 50)'], ['Returns use published NAVs (growth option includes reinvested income).', 'Annualisation uses 252 trading days.']));
    return {meta:meta(D, 'mf', name, 'AMFI '+(m.scheme_code||''), m.scheme_category||'Mutual fund', 'INR', null), cover:{kpis, keyData:[['Fund house', m.fund_house||'—'], ['Category', m.scheme_category||'—'], ['Latest NAV', fin(D.price)?'₹'+nn(D.price,4):'—'], ['History', px?`${px.firstDate} → ${px.lastDate}`:'—']], highlights:[]}, sections, charts:C, gaps:D.gaps};
  }

  /* ================================ CRYPTO ================================ */
  function buildCrypto(D, opt, brief){
    const k = D.k, cg = D.cg || {}, px = D.px, name = cg.name || D.item.name, sym = (cg.symbol||'').toUpperCase() || String(D.item.sym).split(':').pop();
    const kpis = [{l:'Price (USD)', v:'$'+nn(D.price, D.price<1?6:2), s:pc(k.c24)+' 24h', tone:tone(k.c24)}, {l:'Market cap', v:'$'+big(k.mcap), s:k.rank?'Rank #'+k.rank:''}, {l:'24h volume', v:'$'+big(k.vol24), s:fin(k.turnover)?pp(k.turnover,1)+' of cap':''}, {l:'From all-time high', v:pc(k.athChg), tone:tone(k.athChg)}, {l:'1-year', v:pc(px?.r1y ?? k.c1y), tone:tone(px?.r1y ?? k.c1y)}, {l:'Volatility', v:px?pp(px.volPct):'—', s:'annualised'}];
    const C = {}; if(D.series) C.price = {kind:'line', title:`${sym} price — 1 year (USD, log scale)`, labels:D.series.t, series:[{name:sym, data:D.series.c, fill:true}], log:true};
    if(D.hist && D.hist.mcap) C.mcap = {kind:'line', title:'Market capitalisation (USD)', labels:D.series.t, series:[{name:'Market cap', data:D.hist.mcap}], yFmt:'money'};
    if(fin(k.circ) && (fin(k.max)||fin(k.total))) { const cap = fin(k.max)?k.max:k.total; C.supply = {kind:'doughnut', title:'Supply — circulating vs not yet circulating', labels:['Circulating','Not circulating'], data:[k.circ, Math.max(0, cap-k.circ)]}; }
    const dd = ddChart(D); if(dd) C.dd = dd; const hc = histChart(D); if(hc) C.hist = hc;
    const hl = [`${name} (${sym}) ranks #${k.rank||'—'} by market capitalisation at $${big(k.mcap)}, ${fin(k.athChg)?Math.abs(k.athChg).toFixed(0)+'% '+(k.athChg<0?'below':'above')+' its all-time high of $'+nn(k.ath, k.ath<1?6:2):''}.`];
    if(px) hl.push(`Past year: ${pc(px.r1y)} with ${pp(px.volPct)} annualised volatility and a ${pp(px.mddPct)} maximum drawdown.`);
    if(fin(k.circPct)) hl.push(`${pp(k.circPct,0)} of the ${fin(k.max)?'maximum':'total'} supply is already circulating — ${k.circPct<70?'meaningful future issuance could dilute holders':'limited dilution ahead'}.`);
    if(fin(k.tvl)) hl.push(`DeFi total value locked: $${big(k.tvl)}${fin(k.mcapToTvl)?` (market cap / TVL ${xx(k.mcapToTvl,2)})`:''}.`);
    const prof = [['Name / symbol', `${name} (${sym})`], ['Categories', (cg.categories||[]).filter(Boolean).slice(0,6).join(', ')||'—'], ['Hashing algorithm', cg.hashing_algorithm||'—'], ['Genesis date', cg.genesis_date||'—'], ['Website', (cg.links&&cg.links.homepage&&cg.links.homepage[0])||'—'], ['Market-cap rank', k.rank||'—']];
    const sections = [{title:'Snapshot', blocks:[{t:'kpis', items:kpis}, {t:'ul', items:hl}, {t:'chart', key:'price'}]}];
    if(!brief){
      sections.push({title:'Asset profile', blocks:[{t:'kv', rows:prof}, ...(cg.description&&cg.description.en?[{t:'p', text:strip(cg.description.en).slice(0,1600)}]:[])]});
      sections.push({title:'Market structure & tokenomics', blocks:[{t:'kv', rows:[['Market capitalisation', '$'+big(k.mcap)], ['Fully diluted valuation', '$'+big(k.fdv)], ['Circulating supply', big(k.circ)], ['Total supply', big(k.total)], ['Maximum supply', k.max?big(k.max):'Uncapped'], ['Circulating / max', pp(k.circPct,1)], ['24h volume / market cap', pp(k.turnover,2)], ['All-time high', k.ath?`$${nn(k.ath,k.ath<1?6:2)} (${String(k.athDate||'').slice(0,10)})`:'—'], ['All-time low', k.atl?`$${nn(k.atl,k.atl<1?6:2)} (${String(k.atlDate||'').slice(0,10)})`:'—'], ['DeFi TVL', fin(k.tvl)?'$'+big(k.tvl):'—'], ['Coinbase cross-check', D.cross&&D.cross.last?'$'+nn(+D.cross.last):'—']]}, {t:'chart', key:'supply'}, {t:'chart', key:'mcap'}]});
      sections.push({title:'Performance & risk', blocks:[...perfBlocks(D, 'USD'), {t:'chart', key:'dd'}, {t:'chart', key:'hist'}]});
      const dev = cg.developer_data || {}, com = cg.community_data || {};
      sections.push({title:'Network, development & community', blocks:[{t:'kv', rows:[['GitHub stars', big(dev.stars)], ['Forks', big(dev.forks)], ['Commits (last 4 weeks)', big(dev.commit_count_4_weeks)], ['Pull-request contributors', big(dev.pull_request_contributors)], ['Closed / total issues', fin(dev.closed_issues)?`${big(dev.closed_issues)} / ${big(dev.total_issues)}`:'—'], ['Twitter followers', big(com.twitter_followers)], ['Reddit subscribers', big(com.reddit_subscribers)], ['Telegram members', big(com.telegram_channel_user_count)], ...(D.btc?[['Bitcoin next-block fee', D.btc.fees?.fastestFee+' sat/vB'], ['Network hashrate', big(D.btc.hashrate)+'H/s'], ['Difficulty', big(D.btc.difficulty)]]:[])]}]});
      const risks = ['Price volatility: crypto assets can fall 50–80% in bear markets (see drawdown).', 'Regulatory risk: rules on trading, custody and taxation differ by country and are changing.', 'Custody & counterparty risk: exchanges and wallets can be hacked or fail.'];
      if(fin(k.circPct) && k.circPct<70) risks.push(`Supply dilution: ${(100-k.circPct).toFixed(0)}% of maximum supply is not yet circulating.`);
      if(fin(k.turnover) && k.turnover<2) risks.push('Thin trading relative to market cap — larger trades may move the price.');
      sections.push({title:'Key risks', blocks:[{t:'ul', items:risks}]});
      sections.push({title:'Conclusion', blocks:[{t:'p', text:hl.join(' ')}, ...(opt.analystView?[{t:'callout', tone:'info', title:'Analyst\'s view', text:opt.analystView}]:[])]});
    }
    return {meta:meta(D, brief?'crypto_brief':'crypto', name, sym, (cg.categories||[])[0]||'Crypto asset', 'USD', D.logo), cover:{kpis, keyData:prof, highlights:hl}, sections:sections.concat(custom(D)).concat(appendix(D, opt, ['CoinGecko (profile, market data, history)', 'DefiLlama (TVL)', 'Coinbase Exchange (price cross-check)', 'mempool.space (Bitcoin network)'], ['Crypto statistics annualise with 365 days (markets trade every day).', 'Prices in USD.'])), charts:C, gaps:D.gaps};
  }

  /* ================================ FIXED INCOME ================================ */
  function buildBond(D, opt){
    const t = D.terms, y = D.y, r = D.risk || {}, ccy = t.ccy || '', name = t.issuer;
    const kpis = [{l:'Clean price', v:nn(t.price,3), s:'per 100 face'}, {l:'Yield to maturity', v:fin(y.ytm)?pp(y.ytm*100,3):'—', s:y.ytmSource||''}, {l:'Coupon', v:fin(t.coupon)?pp(t.coupon,3):'—'}, {l:'Maturity', v:t.maturity||'—', s:fin(t.years)?nn(t.years,1)+' yrs':''}, {l:'Modified duration', v:nn(r.modified,2)}, {l:'Spread vs govt', v:fin(D.spreadBp)?Math.round(D.spreadBp)+' bp':'—', s:D.bench?D.bench.name:''}];
    const C = {};
    if(D.shocks) C.shock = {kind:'bar', title:'Price change for parallel yield shifts (%)', labels:D.shocks.map(s=>(s.bp>0?'+':'')+s.bp+'bp'), series:[{name:'Full revaluation', data:D.shocks.map(s=>+s.exactPct.toFixed(2))}, {name:'Duration + convexity', data:D.shocks.map(s=>+s.approxPct.toFixed(2))}], yFmt:'pct'};
    if(D.flows) C.flows = {kind:'bar', title:'Projected cash flows per 100 face (nominal vs present value)', labels:D.flows.slice(0,24).map(f=>f.date.slice(0,7)), series:[{name:'Cash flow', data:D.flows.slice(0,24).map(f=>+f.cf.toFixed(3))}, {name:'Present value', data:D.flows.slice(0,24).map(f=>+f.pv.toFixed(3))}]};
    if(fin(y.ytm) && fin(t.coupon) && fin(t.years) && t.years>0){ const ys = Array.from({length:21},(_,i)=>Math.max(0.0005, y.ytm-0.05+i*0.005)); C.py = {kind:'line', title:'Price–yield curve (convexity)', labels:ys.map(v=>(v*100).toFixed(2)+'%'), series:[{name:'Price', data:ys.map(v=>+QXM.bond.price(v, t.coupon/100, t.freq, t.years).toFixed(3))}]}; }
    const hl = [`${name}: ${fin(t.coupon)?t.coupon+'% coupon':''}${t.maturity?' maturing '+t.maturity:''}, priced at ${nn(t.price,3)} for a ${fin(y.ytm)?pp(y.ytm*100,3):'—'} yield to maturity.`];
    if(fin(r.modified)) hl.push(`Interest-rate sensitivity: a 1 percentage-point rise in yields would change the price by about ${pc(-r.modified)} (modified duration ${nn(r.modified)}; convexity ${nn(r.convexity)}).`);
    if(fin(D.spreadBp)) hl.push(`The bond yields ${Math.round(D.spreadBp)} bp ${D.spreadBp>=0?'above':'below'} the ${D.bench.name} (${nn(D.bench.yieldPct,3)}%) — compensation for credit and liquidity risk relative to the government benchmark (maturity difference not adjusted).`);
    const ratings = [t.ratingSP?'S&P '+t.ratingSP:null, t.ratingMoodys?"Moody's (issuer) "+t.ratingMoodys:null, t.ratingFitch?'Fitch (issuer) '+t.ratingFitch:null].filter(Boolean);
    if(ratings.length) hl.push('Credit ratings: '+ratings.join(' · ')+'.');
    const sections = [{title:'Summary', blocks:[{t:'kpis', items:kpis}, {t:'ul', items:hl}]},
      {title:'Terms of the issue', blocks:[{t:'kv', rows:[['Issuer', name], ['Symbol', D.item.sym], ['Issuer type', t.issuerType||'—'], ['Country / currency', `${t.country||'—'} / ${ccy}`], ['Coupon', fin(t.coupon)?pp(t.coupon,3)+' '+({1:'annual',2:'semi-annual',4:'quarterly',12:'monthly'}[t.freq]||''):'—'], ['Coupon type', t.couponType||'—'], ['Maturity', t.maturity||'—'], ['Maturity type', t.maturityType||'—'], ['Next call', t.callDate?t.callDate+(fin(t.callPrice)?' @ '+t.callPrice:''):'—'], ['Amount outstanding', big(t.outstanding)], ['Minimum denomination', big(t.minDenom)], ['Issuer equity listing', t.issuerStock||'—']]}]},
      {title:'Yield & credit', blocks:[{t:'kv', rows:[['Yield to maturity', fin(y.ytm)?pp(y.ytm*100,3)+' ('+y.ytmSource+')':'—'], ['Yield to worst', fin(y.ytw)?pp(y.ytw*100,3):'—'], ['Current yield', fin(y.current)?pp(y.current*100,3):'—'], ['Government benchmark', D.bench?`${D.bench.name}: ${nn(D.bench.yieldPct,3)}%`:'—'], ['Spread to benchmark', fin(D.spreadBp)?Math.round(D.spreadBp)+' bp':'—'], ['S&P long-term rating', t.ratingSP||'—'], ["Moody's issuer rating", t.ratingMoodys||'—'], ['Fitch issuer rating', t.ratingFitch||'—']]}]},
      {title:'Interest-rate risk', blocks:[{t:'kv', rows:[['Macaulay duration', fin(r.macaulay)?nn(r.macaulay)+' years':'—'], ['Modified duration', nn(r.modified)], ['Convexity', nn(r.convexity)], ['DV01 per 100 face', nn(r.dv01,4)], ['Model price at YTM', nn(r.modelPrice,3)], ['Duration source', r.durationSource||'—']]}, {t:'chart', key:'py'}, ...(D.shocks?[{t:'table', head:['Yield shift','Duration + convexity estimate','Full revaluation'], rows:D.shocks.map(s=>[(s.bp>0?'+':'')+s.bp+' bp', pc(s.approxPct,2), pc(s.exactPct,2)]), note:'ΔP/P ≈ −D_mod·Δy + ½·C·Δy² (CFA L1 Fixed Income); full revaluation reprices each cash flow.'}, {t:'chart', key:'shock'}]:[])]},
      ...(D.flows?[{title:'Cash-flow schedule', blocks:[{t:'chart', key:'flows'}, {t:'table', head:['Payment date (approx.)','Years','Cash flow','PV at YTM'], rows:D.flows.slice(0,30).map(f=>[f.date, nn(f.t), nn(f.cf,3), nn(f.pv,3)]), note:'Assumes a plain fixed-coupon bond held to maturity; dates are approximate (no business-day or day-count adjustment).'}]}]:[]),
      {title:'Key risks', blocks:[{t:'ul', items:['Interest-rate risk: price falls when yields rise (see duration).', 'Credit risk: issuer downgrade or default (see ratings and spread).', 'Liquidity risk: corporate bonds can trade infrequently with wide bid-ask spreads.', ...(t.callDate?['Call risk: the issuer can redeem early, capping price upside.']:[]), ...(ccy?[`Currency risk for investors whose home currency is not ${ccy}.`]:[])]}]},
      {title:'Conclusion', blocks:[{t:'p', text:hl.join(' ')}, ...(opt.analystView?[{t:'callout', tone:'info', title:'Analyst\'s view', text:opt.analystView}]:[])]},
    ].concat(appendix(D, opt, ['TradingView bond data (terms, price, yields, ratings)'], ['Duration, convexity and DV01 computed with standard periodic-compounding formulas when not published (CFA L1 Fixed Income).']));
    return {meta:meta(D, 'bond', name, D.item.sym, D.kind==='govbond'?'Government bond':'Corporate bond', ccy, null), cover:{kpis, keyData:[['Issuer', name], ['Coupon', fin(t.coupon)?pp(t.coupon,3):'—'], ['Maturity', t.maturity||'—'], ['Currency', ccy]], highlights:hl}, sections, charts:C, gaps:D.gaps};
  }

  /* ================================ DERIVATIVES ================================ */
  function buildFuture(D, opt){
    const k = D.k, name = D.item.name;
    const kpis = [{l:'Last', v:nn(D.price,4)}, {l:'Expiry', v:k.expiry||'—', s:fin(k.daysToExpiry)?k.daysToExpiry+' days':''}, {l:'Open interest', v:big(k.oi)}, {l:'Volume', v:big(k.volume)}, {l:'Day change', v:pc(k.changePct,2), tone:tone(k.changePct)}, {l:'Curve', v:D.curveShape||'—', s:fin(D.impliedCarryPct)?'carry '+pp(D.impliedCarryPct,2)+'/yr':''}];
    const C = {}; if(D.curve && D.curve.length>1) C.curve = {kind:'line', title:'Futures curve (price by expiry)', labels:D.curve.map(c=>c.expiry), series:[{name:'Price', data:D.curve.map(c=>c.price)}]};
    const sections = [{title:'Contract summary', blocks:[{t:'kpis', items:kpis}, {t:'kv', rows:[['Contract', name], ['Symbol', D.item.sym], ['Exchange', k.exchange], ['Currency', D.ccy||'—'], ['Expiry', k.expiry||'—']]}]},
      ...(D.curve&&D.curve.length>1?[{title:'Term structure', blocks:[{t:'chart', key:'curve'}, {t:'table', head:['Contract','Expiry','Price','Open interest'], rows:D.curve.map(c=>[c.sym, c.expiry, nn(c.price,4), big(c.oi)])}, {t:'p', text:`The curve is in ${D.curveShape}: ${D.curveShape==='contango'?'later contracts are priced above nearer ones (carry costs exceed the convenience of holding the asset).':'later contracts are priced below nearer ones (tight current supply / high convenience yield).'} Implied annualised carry between the first and last listed contracts: ${pp(D.impliedCarryPct,2)} (ln(F_far/F_near)/Δt).`}]}]:[]),
      {title:'Valuation framework', blocks:[{t:'p', text:'No-arbitrage fair value: F = S·e^((r − q + u)·T), where S is spot, r the financing rate, q the income/convenience yield and u the storage cost. Compare the market price with the fair value from your spot and rate inputs (Universal Search → this contract → cost-of-carry check).'}]},
      {title:'Key risks', blocks:[{t:'ul', items:['Leverage: margin is a small fraction of notional, so losses can exceed the initial margin.', 'Basis risk: futures and spot need not converge smoothly before expiry.', 'Roll risk: rolling positions in contango loses value over time.', 'Liquidity can fall sharply in deferred contracts.']}]}].concat(appendix(D, opt, ['TradingView futures data'], ['Implied carry = ln(F_far / F_near) / years between expiries.']));
    return {meta:meta(D, 'future', name, D.item.sym, 'Futures', D.ccy, null), cover:{kpis, keyData:[['Contract', name], ['Expiry', k.expiry||'—']], highlights:[]}, sections, charts:C, gaps:D.gaps};
  }
  function buildOption(D, opt){
    const k = D.k, m = D.model || {}, name = D.item.name;
    const kpis = [{l:'Mid price', v:nn(k.mid,3)}, {l:'Model value (BSM)', v:nn(m.price,3), s:fin(k.iv)?'IV '+pp(k.iv*100,1):''}, {l:'Underlying', v:nn(k.spot,2), s:k.moneyness||''}, {l:'Break-even', v:nn(k.breakeven,2)}, {l:'Delta', v:nn(m.delta,3)}, {l:'Days to expiry', v:String(k.daysToExpiry)}];
    const C = {}; if(D.payoff) C.payoff = {kind:'line', title:'Profit / loss per unit — at expiry and today', labels:D.payoff.map(p=>p.S.toFixed(1)), series:[{name:'At expiry', data:D.payoff.map(p=>+p.expiry.toFixed(3))}, {name:'Today (BSM)', data:D.payoff.map(p=>+p.today.toFixed(3)), dash:true}]};
    const sections = [{title:'Option summary', blocks:[{t:'kpis', items:kpis}, {t:'kv', rows:[['Contract', name], ['Type / strike', `${k.type} ${k.strike}`], ['Expiry', k.expiry], ['Underlying', `${k.underlying} at ${nn(k.spot)}`], ['Bid / ask', `${nn(k.bid,3)} / ${nn(k.ask,3)}`], ['Intrinsic / time value', `${nn(k.intrinsic,3)} / ${nn(k.timeValue,3)}`], ['Open interest / volume', `${big(k.oi)} / ${big(k.volume)}`]]}]},
      {title:'Valuation & Greeks', blocks:[{t:'kv', rows:[['Black-Scholes-Merton value', nn(m.price,4)], ['Implied volatility (market)', fin(k.iv)?pp(k.iv*100,2):'—'], ['Risk-free rate assumed', pp(k.rf*100,2)], ['Delta', nn(m.delta,4)], ['Gamma', nn(m.gamma,5)], ['Theta (per calendar day)', nn(m.theta,4)], ['Vega (per 1 vol point)', nn(m.vega,4)], ['Rho (per 1% rate)', nn(m.rho,4)], ['N(d2) — risk-neutral probability of finishing in the money', fin(m.probITM)?pp(m.probITM*100,1):'—']]}, {t:'chart', key:'payoff'}]},
      ...(D.grid?[{title:'Scenario analysis', blocks:[{t:'table', head:['Underlying move','Value now','Half-way to expiry','At expiry'], rows:D.grid.map(g=>[pc(g.move,0), ...g.values.map(v=>nn(v,3))]), note:'BSM values holding implied volatility and rates constant.'}]}]:[]),
      {title:'Key risks', blocks:[{t:'ul', items:['Time decay (theta) erodes long option value every day.', 'Volatility risk: falling implied volatility lowers option value (vega).', 'Options can expire worthless; short options can carry large or unlimited losses.', 'American-style early exercise is not modelled (European BSM).']}]}].concat(appendix(D, opt, ['TradingView options data (OPRA)'], ['Black-Scholes-Merton with continuous compounding; Greeks per standard definitions (CFA L1/L2 Derivatives).']));
    return {meta:meta(D, 'option', name, D.item.sym, 'Option', D.ccy, null), cover:{kpis, keyData:[['Contract', name]], highlights:[]}, sections, charts:C, gaps:D.gaps};
  }
  /* ================================ FX & MARKETS ================================ */
  function buildFx(D, opt){
    const px = D.px, pair = D.base+'/'+D.quote;
    const kpis = [{l:'Rate', v:nn(D.price,4)}, {l:'ECB / reference', v:nn(D.ref,4)}, {l:'1-month', v:pc(px?.r1m), tone:tone(px?.r1m)}, {l:'1-year', v:pc(px?.r1y), tone:tone(px?.r1y)}, {l:'Volatility', v:px?pp(px.volPct):'—'}, {l:'52-week range', v:px?`${nn(px.lo52,4)}–${nn(px.hi52,4)}`:'—'}];
    const C = {}; const pcx = priceChart(D, pair, false); if(pcx) C.price = pcx; const dd = ddChart(D); if(dd) C.dd = dd; const hc = histChart(D); if(hc) C.hist = hc;
    const sections = [{title:'Summary', blocks:[{t:'kpis', items:kpis}, {t:'p', text:px?`${pair} moved ${pc(px.r1y)} over the past year (${D.base} ${px.r1y>=0?'strengthened':'weakened'} against ${D.quote}) with ${pp(px.volPct)} annualised volatility.`:'History unavailable.'}]},
      {title:'Performance & risk', blocks:perfBlocks(D, D.quote, 'Exchange-rate').concat([{t:'chart', key:'dd'}, {t:'chart', key:'hist'}])},
      {title:'Framework', blocks:[{t:'ul', items:['Covered interest parity: F = S × (1 + i_quote)/(1 + i_base) — the higher-rate currency trades at a forward discount.', 'Relative PPP: expected change ≈ inflation(quote) − inflation(base) over the long run.', 'Use Formula Lab → Economics to compute forwards and PPP values with current rates.']}]}].concat(appendix(D, opt, ['ECB reference rates via Frankfurter', 'ExchangeRate-API (open)', 'TradingView FX'], ['ECB reference rates are published once per business day (~16:00 CET).']));
    return {meta:meta(D, 'fx', pair, D.item.sym, 'Currency', D.quote, null), cover:{kpis, keyData:[['Pair', pair]], highlights:[]}, sections, charts:C, gaps:D.gaps};
  }
  function buildMarket(D, opt){
    const px = D.px, name = D.item.name;
    const kpis = [{l:'Last', v:nn(D.price)}, {l:'Day', v:pc(D.item.changePct,2), tone:tone(D.item.changePct)}, {l:'1-year', v:pc(px?.r1y), tone:tone(px?.r1y)}, {l:'Volatility', v:px?pp(px.volPct):'—'}, {l:'Max drawdown', v:px?pp(px.mddPct):'—'}, {l:'Trend', v:D.tech?D.tech.label:'—'}];
    const C = {}; const pcx = priceChart(D, name); if(pcx) C.price = pcx; const dd = ddChart(D); if(dd) C.dd = dd; const hc = histChart(D); if(hc) C.hist = hc;
    const sections = [{title:'Summary', blocks:[{t:'kpis', items:kpis}]}, {title:'Performance & risk', blocks:perfBlocks(D, D.ccy).concat([{t:'chart', key:'dd'}])}, ...(D.tech?[{title:'Technicals', blocks:[{t:'table', head:['Signal','Reading','Bias'], rows:D.tech.signals.map(s=>[s[0], s[2], s[1]>0?'Bullish':s[1]<0?'Bearish':'Neutral'])}, {t:'chart', key:'hist'}]}]:[])].concat(appendix(D, opt, ['CNBC market data', 'TradingView'], []));
    return {meta:meta(D, 'market', name, D.item.sym, D.kind==='index'?'Index':'Commodity', D.ccy, null), cover:{kpis, keyData:[['Instrument', name]], highlights:[]}, sections, charts:C, gaps:D.gaps};
  }
  /* Cover already shows the KPI tiles and highlights — remove identical blocks from the first section so the
     report does not repeat itself, and drop any section left empty. */
  function dedupe(M){
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    M.sections.forEach((s, i) => { if(i > 0) return; s.blocks = s.blocks.filter(b => !(b.t==='kpis' && same(b.items, M.cover.kpis)) && !(b.t==='ul' && same(b.items.filter(Boolean), (M.cover.highlights||[]).filter(Boolean)))); });
    M.sections = M.sections.filter(s => s.blocks.length);
    // every cover gets highlights: fall back to the first paragraph + the headline KPIs
    if(!(M.cover.highlights||[]).filter(Boolean).length){
      const firstP = M.sections.flatMap(s=>s.blocks).find(b=>b.t==='p' && b.text && b.text.length > 40);
      M.cover.highlights = [].concat(firstP ? [firstP.text] : [], (M.cover.kpis||[]).slice(0,4).map(k=>`${k.l}: ${k.v}${k.s?' ('+k.s+')':''}`));
    }
    return M;
  }
  function build(typeId, D, opt){ return dedupe(buildRaw(typeId, D, opt)); }
  function buildRaw(typeId, D, opt){
    if(['master','profile','financial','valuation','peers','technical','risk'].includes(typeId)){
      if(['etf','fund'].includes(D.kind) && typeId!=='technical' && typeId!=='risk') return buildEtf(D, opt);
      if(['index','commodity'].includes(D.kind)) return buildMarket(D, opt);
      return buildEquity(typeId, D, opt);
    }
    if(typeId==='etf') return buildEtf(D, opt); if(typeId==='mf') return buildMf(D, opt);
    if(typeId==='crypto') return buildCrypto(D, opt, false); if(typeId==='crypto_brief') return buildCrypto(D, opt, true);
    if(typeId==='bond') return buildBond(D, opt); if(typeId==='future') return buildFuture(D, opt); if(typeId==='option') return buildOption(D, opt);
    if(typeId==='fx') return buildFx(D, opt); if(typeId==='market') return buildMarket(D, opt);
    throw new Error('Unknown report type '+typeId);
  }
  return {TYPES, typesFor, build, strip};
})();
