/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/features/explorer.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   "Universal Search" view (#view-explorer): one search across every asset class
 *           (QXS.search) → grouped results → a detail page tailored to the security type, with
 *           live analytics and the report types available for that type (QXREP.typesFor(kind)).
 * FLOW      search box → QXS.search → renderResults → click → open(item)
 *             equity/etf/fund/preferred → snapshot + "Open in Research" (admitTvRow) + option chain
 *             crypto/bond/govbond/future/fx/index/commodity/mf_in → QXCOL.collect(kind,item) → detail renderer
 *             option chain row → QXCOL.option → option detail
 * DEPENDS   QXS, QXCOL, QXM, QXREP, Chart.js, admitTvRow, selectSecurity, goto
 * EXPOSES   QXE.{mount(), search(q), open(item), current}
 * ADD A KIND  add a renderer to RENDER below + a collector in modules/reports/collectors.js
 *             + report types in modules/reports/templates.js.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const QXE = (() => {
  const fin = v => typeof v==='number' && isFinite(v);
  const n2 = (v,d=2) => fin(v) ? v.toLocaleString(undefined,{minimumFractionDigits:d, maximumFractionDigits:d}) : '—';
  const pc = (v,d=2) => fin(v) ? (v>=0?'+':'')+v.toFixed(d)+'%' : '—';
  const big = v => !fin(v) ? '—' : Math.abs(v)>=1e12 ? (v/1e12).toFixed(2)+'T' : Math.abs(v)>=1e9 ? (v/1e9).toFixed(2)+'B' : Math.abs(v)>=1e6 ? (v/1e6).toFixed(2)+'M' : v.toLocaleString(undefined,{maximumFractionDigits:2});
  const tone = v => fin(v) ? (v>=0?'up':'down') : '';
  let last = {items:[]}, current = null, charts = [], tok = 0;
  const tiles = arr => `<div class="qxe-tiles">${arr.filter(Boolean).map(([l,v,s,t])=>`<div class="qxe-tile"><span>${l}</span><b class="${t||''}">${v}</b>${s?`<i>${s}</i>`:''}</div>`).join('')}</div>`;
  // SECURITY: kvt escapes every value (API text is untrusted). Wrap pre-built, already-escaped markup in H().
  const H = html => ({__html: html});
  const kvt = rows => kv(rows.filter(r=>r[1]!=null && r[1]!=='—' && r[1]!=='').map(r=>[escapeHtml(r[0]), r[1] && r[1].__html!=null ? r[1].__html : escapeHtml(String(r[1]))]));

  function mount(){
    const v = document.getElementById('view-explorer'); if(!v || v.dataset.ready) return; v.dataset.ready = 1;
    v.querySelector('.viewbody').innerHTML = `
      <div class="qxe-search card">
        <div class="qxe-bar"><input id="qxeQ" placeholder="Search anything — a company, ETF, bond issuer, future, crypto, currency pair, mutual fund…" autocomplete="off" spellcheck="false"><button class="btn" id="qxeGo">Search</button></div>
        <div class="qxe-kinds"><button class="chip active" data-k="">All</button>${Object.entries(QXS.KINDS).filter(([k])=>k!=='option').map(([k,x])=>`<button class="chip" data-k="${k}">${x.icon} ${x.label}</button>`).join('')}</div>
        <div class="qxa-dim">Options: open an underlying (stock, ETF or index) and press “Option chain”. Sources: TradingView (listings, bonds, futures, options, crypto, FX), CoinGecko, mfapi.in/AMFI.</div>
      </div>
      <div class="qxe-layout"><div id="qxeResults" class="qxe-results"><div class="qxa-dim" style="padding:14px">Try “Reliance”, “Apple”, “gold”, “US treasury”, “HDFC flexi”, “solana”, “EURINR”, “crude oil”.</div></div><div id="qxeDetail" class="qxe-detail"></div></div>`;
    const q = v.querySelector('#qxeQ');
    v.querySelector('#qxeGo').onclick = () => search(q.value);
    q.addEventListener('keydown', e=>{ if(e.key==='Enter') search(q.value); });
    let deb; q.addEventListener('input', ()=>{ clearTimeout(deb); deb = setTimeout(()=>{ if(q.value.trim().length>=3) search(q.value); }, 450); });
    v.querySelectorAll('.qxe-kinds .chip').forEach(b=>b.onclick=()=>{ v.querySelectorAll('.qxe-kinds .chip').forEach(x=>x.classList.toggle('active', x===b)); if(q.value.trim()) search(q.value); });
    v.querySelector('#qxeResults').addEventListener('click', e=>{ const r = e.target.closest('[data-i]'); if(r) open(last.items[+r.dataset.i]); });
  }
  async function search(q){
    const res = document.getElementById('qxeResults'); const my = ++tok;
    const k = document.querySelector('#view-explorer .qxe-kinds .chip.active')?.dataset.k;
    res.innerHTML = '<div class="qx-skel" style="height:40px;margin:8px"></div>'.repeat(5);
    const {items, errors} = await QXS.search(q, k ? [k] : null);
    if(my!==tok) return; last = {items, q};
    if(!items.length){ res.innerHTML = `<div class="qxa-dim" style="padding:14px">No matches for “${escapeHtml(q)}”.${errors.length?' Some sources were unreachable: '+escapeHtml(errors.join('; ')):''}</div>`; return; }
    const groups = {}; items.forEach((it,i)=>{ (groups[it.kind] = groups[it.kind] || []).push([it,i]); });
    res.innerHTML = Object.entries(groups).map(([kind, arr])=>`<div class="qxe-group"><div class="qxe-gh">${QXS.KINDS[kind]?.icon||''} ${QXS.KINDS[kind]?.label||kind} <span>${arr.length}</span></div>${arr.map(([it,i])=>`
      <div class="qxe-row" data-i="${i}" tabindex="0">${it.logo?`<img src="${escapeHtml(it.logo)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`:`<span class="qxe-ph">${escapeHtml((it.name||'?').slice(0,1))}</span>`}
        <div class="qxe-rn"><b>${escapeHtml(String(it.sym).split(':').pop())}</b><span>${escapeHtml(String(it.name||'').slice(0,64))}</span></div>
        <div class="qxe-rp">${fin(it.price)?`<b>${n2(it.price, it.price<10?4:2)}</b>`:''}<span>${escapeHtml(it.exchange||'')} ${escapeHtml(it.ccy||'')}</span>${fin(it.changePct)?`<i class="${tone(it.changePct)}">${pc(it.changePct)}</i>`:''}</div></div>`).join('')}</div>`).join('')
      + (errors.length ? `<div class="qxa-dim" style="padding:8px">Unreachable: ${escapeHtml(errors.join('; '))}</div>` : '');
  }
  function header(it, extra=''){
    const types = QXREP.typesFor(it.kind);
    return `<div class="qxe-head">${it.logo?`<img src="${escapeHtml(it.logo)}" alt="" onerror="this.remove()">`:''}<div><div class="qxe-kind">${QXS.KINDS[it.kind]?.label||it.kind}</div><h3>${escapeHtml(it.name||it.sym)}</h3><div class="qxa-dim">${escapeHtml(it.sym)}${it.country?' · '+escapeHtml(it.country):''}</div></div>
      <div class="qxe-px">${fin(it.price)?`<b>${n2(it.price, it.price<10?4:2)} <small>${escapeHtml(it.ccy||'')}</small></b>`:''}${fin(it.changePct)?`<span class="${tone(it.changePct)}">${pc(it.changePct)}</span>`:''}</div></div>
      <div class="qxe-actions">${extra}${types.length?`<select id="qxeRepType" aria-label="Report type">${types.map(t=>`<option value="${t.id}">${t.label}</option>`).join('')}</select><button class="btn" id="qxeRep">Generate report</button>`:''}</div>`;
  }
  function wireHeader(it, data){
    const b = document.getElementById('qxeRep'); if(b) b.onclick = () => QXREP.openWith({kind:it.kind, item:it, data, type:document.getElementById('qxeRepType').value});
  }
  function lineChart(id, series, label, opts={}){
    const el = document.getElementById(id); if(!el || !series || typeof Chart==='undefined') return;
    const up = cssVar('--teal'), grid = cssVar('--line-soft'), t1 = cssVar('--text-1');
    charts.push(new Chart(el, {type:'line', data:{labels:series.t, datasets:[{label, data:series.c, borderColor:opts.color||up, backgroundColor:'rgba(45,212,191,.08)', fill:true, pointRadius:0, borderWidth:1.8, tension:0.1}]},
      options:{responsive:true, maintainAspectRatio:false, animation:{duration:500}, interaction:{mode:'index', intersect:false}, plugins:{legend:{display:false}}, scales:{x:{ticks:{color:t1, maxTicksLimit:8}, grid:{color:grid}}, y:{ticks:{color:t1}, grid:{color:grid}, type: opts.log?'logarithmic':'linear'}}}}));
  }
  const perfTable = px => !px ? '' : table(['1W','1M','3M','6M','YTD','1Y','3Y','5Y'], [[px.r1w,px.r1m,px.r3m,px.r6m,px.ytd,px.r1y,px.r3y,px.r5y].map(v=>`<span class="${tone(v)}">${pc(v)}</span>`)]);
  const riskKv = (px, ppy='') => !px ? '' : kvt([['Annualised volatility', n2(px.volPct)+'%'], ['Max drawdown', `${n2(px.mddPct)}% (${px.mddFrom} → ${px.mddTo})`], ['Sharpe (rf 0)', n2(px.sharpe)], ['Sortino', n2(px.sortino)], ['Daily VaR 95% / CVaR', `${n2(px.var95Pct)}% / ${n2(px.cvar95Pct)}%`], ['Best / worst day', `${pc(px.bestPct)} / ${pc(px.worstPct)}`], ['CAGR (full history)', pc(px.cagr)], ['History', `${px.firstDate} → ${px.lastDate}`]]);

  const RENDER = {
    crypto(D){ const k = D.k, cg = D.cg || {};
      return tiles([['Market cap', big(k.mcap), k.rank?'Rank #'+k.rank:''], ['Price', '$'+n2(D.price, D.price<1?6:2), pc(k.c24)+' 24h', tone(k.c24)], ['24h volume', big(k.vol24), fin(k.turnover)?n2(k.turnover)+'% of cap':''], ['FDV', big(k.fdv)], ['From ATH', pc(k.athChg), k.ath?'ATH $'+n2(k.ath):''], ['Circulating', big(k.circ), fin(k.circPct)?n2(k.circPct,1)+'% of max':'']])
        + `<div class="grid grid-2"><div class="card"><h3>Price — 1 year (USD)</h3><div class="qxe-chart"><canvas id="qxeC1"></canvas></div>${perfTable(D.px)}</div>
           <div class="card"><h3>Risk & return</h3>${riskKv(D.px)}<h3 style="margin-top:12px">Supply & tokenomics</h3>${kvt([['Circulating supply', big(k.circ)], ['Total supply', big(k.total)], ['Max supply', k.max?big(k.max):'Uncapped'], ['Market cap / TVL', fin(k.mcapToTvl)?n2(k.mcapToTvl)+'×':null], ['DeFi TVL', fin(k.tvl)?'$'+big(k.tvl):null], ['All-time low', k.atl?'$'+n2(k.atl, k.atl<1?6:2)+' ('+String(k.atlDate||'').slice(0,10)+')':null]])}</div></div>
          <div class="grid grid-2"><div class="card"><h3>Profile</h3>${kvt([['Categories', (cg.categories||[]).filter(Boolean).slice(0,5).join(', ')], ['Hashing algorithm', cg.hashing_algorithm], ['Genesis date', cg.genesis_date], ['Website', /^https?:\/\//.test(cg.links?.homepage?.[0]||'') ? H(`<a href="${escapeHtml(cg.links.homepage[0])}" target="_blank" rel="noopener noreferrer">${escapeHtml(cg.links.homepage[0])}</a>`) : null], ['Sentiment (votes up)', fin(cg.sentiment_votes_up_percentage)?n2(cg.sentiment_votes_up_percentage,0)+'%':null]])}<p class="qxe-desc">${escapeHtml(String(cg.description?.en||'').replace(/<[^>]+>/g,'').slice(0,700))}</p></div>
          <div class="card"><h3>Network & development</h3>${kvt([['GitHub stars', cg.developer_data?.stars], ['Commits (4 weeks)', cg.developer_data?.commit_count_4_weeks], ['Contributors', cg.developer_data?.pull_request_contributors], ['Twitter followers', cg.community_data?.twitter_followers], ['Reddit subscribers', cg.community_data?.reddit_subscribers]])}${D.btc?kvt([['Next-block fee', D.btc.fees?.fastestFee+' sat/vB'], ['Hashrate', big(D.btc.hashrate)+'H/s'], ['Difficulty', big(D.btc.difficulty)]]):''}${D.cross&&D.cross.last?`<div class="qxa-dim">Coinbase cross-check: $${n2(+D.cross.last)}</div>`:''}</div></div>`; },
    bond(D){ const t = D.terms, y = D.y, r = D.risk || {};
      return tiles([['Clean price', n2(t.price,3), '% of face'], ['Yield to maturity', fin(y.ytm)?n2(y.ytm*100,3)+'%':'—', y.ytmSource||''], ['Coupon', fin(t.coupon)?n2(t.coupon,3)+'%':'—', t.freq?({1:'annual',2:'semi-annual',4:'quarterly',12:'monthly'}[t.freq]||t.freq+'×/yr'):''], ['Maturity', t.maturity||'—', fin(t.years)?n2(t.years,1)+' yrs':''], ['Modified duration', n2(r.modified,2), r.durationSource||''], ['Spread vs govt', fin(D.spreadBp)?Math.round(D.spreadBp)+' bp':'—', D.bench?escapeHtml(D.bench.name):'']])
        + `<div class="grid grid-2"><div class="card"><h3>Terms & credit</h3>${kvt([['Issuer', t.issuer], ['Issuer type', t.issuerType], ['Currency', t.ccy], ['Country', t.country], ['Coupon type', t.couponType], ['Maturity type', t.maturityType], ['Next call', t.callDate?t.callDate+(fin(t.callPrice)?' @ '+t.callPrice:''):null], ['Amount outstanding', big(t.outstanding)], ['Minimum denomination', big(t.minDenom)], ['S&P rating (LT)', t.ratingSP], ["Moody's (issuer LT)", t.ratingMoodys], ['Fitch (issuer LT)', t.ratingFitch], ['Issuer equity', t.issuerStock]])}</div>
          <div class="card"><h3>Yield & risk measures</h3>${kvt([['Yield to maturity', fin(y.ytm)?n2(y.ytm*100,3)+'%':null], ['Yield to worst', fin(y.ytw)?n2(y.ytw*100,3)+'%':null], ['Current yield', fin(y.current)?n2(y.current*100,3)+'%':null], ['Macaulay duration', fin(r.macaulay)?n2(r.macaulay)+' yrs':null], ['Modified duration', fin(r.modified)?n2(r.modified):null], ['Convexity', fin(r.convexity)?n2(r.convexity):null], ['DV01 (per 100 face)', fin(r.dv01)?n2(r.dv01,4):null], ['Model price at YTM', fin(r.modelPrice)?n2(r.modelPrice,3):null], ['Benchmark', D.bench?`${D.bench.name}: ${n2(D.bench.yieldPct,3)}%`:null]])}</div></div>
          ${D.shocks?`<div class="card"><h3>Interest-rate scenarios (parallel shift)</h3>${table(['Shift','Duration + convexity estimate','Full revaluation'], D.shocks.map(s=>[(s.bp>0?'+':'')+s.bp+' bp', `<span class="${tone(s.approxPct)}">${pc(s.approxPct)}</span>`, `<span class="${tone(s.exactPct)}">${pc(s.exactPct)}</span>`]))}<div class="qxa-dim">ΔP/P ≈ −D<sub>mod</sub>·Δy + ½·C·Δy² (CFA L1 Fixed Income). Full revaluation reprices every cash flow at the shifted yield.</div></div>`:''}
          ${D.flows?`<div class="card"><h3>Projected cash flows (per 100 face)</h3>${table(['Date (approx.)','Years','Cash flow','PV at YTM'], D.flows.slice(0,16).map(f=>[f.date, n2(f.t), n2(f.cf,3), n2(f.pv,3)]))}</div>`:''}`; },
    future(D){ const k = D.k;
      return tiles([['Last', n2(D.price, 4)], ['Expiry', k.expiry||'—', fin(k.daysToExpiry)?k.daysToExpiry+' days':''], ['Open interest', big(k.oi)], ['Volume', big(k.volume)], ['Day change', pc(k.changePct), '', tone(k.changePct)], ['Curve', D.curveShape||'—', fin(D.impliedCarryPct)?'carry '+n2(D.impliedCarryPct)+'%/yr':'']])
        + (D.curve&&D.curve.length>1?`<div class="grid grid-2"><div class="card"><h3>Futures curve</h3><div class="qxe-chart"><canvas id="qxeC1"></canvas></div></div><div class="card"><h3>Contracts</h3>${table(['Contract','Expiry','Price','Open interest'], D.curve.map(c=>[escapeHtml(c.sym), c.expiry, n2(c.price,4), big(c.oi)]))}</div></div>`:'')
        + `<div class="card"><h3>Cost-of-carry check</h3><div class="qxa-dim">Fair value F = S·e<sup>(r − q + storage)·T</sup>. Enter the spot price of the underlying to compare.</div><div class="qxe-calc"><label>Spot <input id="qxeS" type="number" step="any"></label><label>Rate % <input id="qxeR" type="number" step="any" value="4.5"></label><label>Yield/conv. % <input id="qxeQ2" type="number" step="any" value="0"></label><button class="btn secondary small" id="qxeFv">Compute</button><span id="qxeFvOut"></span></div></div>`; },
    option(D){ const k = D.k, m = D.model || {};
      return tiles([['Mid price', n2(k.mid,3)], ['Model (BSM)', n2(m.price,3), 'at IV '+(fin(k.iv)?n2(k.iv*100,1)+'%':'—')], ['Underlying', n2(k.spot,2), k.moneyness||''], ['Break-even', n2(k.breakeven,2)], ['Delta', n2(m.delta,3)], ['Days', k.daysToExpiry]])
        + `<div class="grid grid-2"><div class="card"><h3>Payoff</h3><div class="qxe-chart"><canvas id="qxeC1"></canvas></div><div class="qxa-dim">Solid: at expiry · dashed: today (BSM, same IV). Per 1 unit.</div></div>
           <div class="card"><h3>Greeks & valuation</h3>${kvt([['Type / strike / expiry', `${k.type} ${k.strike} · ${k.expiry}`], ['Bid / ask', `${n2(k.bid,3)} / ${n2(k.ask,3)}`], ['Intrinsic / time value', `${n2(k.intrinsic,3)} / ${n2(k.timeValue,3)}`], ['Gamma', n2(m.gamma,5)], ['Theta (per day)', n2(m.theta,4)], ['Vega (per 1% vol)', n2(m.vega,4)], ['Rho (per 1% rate)', n2(m.rho,4)], ['Prob. finish in the money (N(d2))', fin(m.probITM)?n2(m.probITM*100,1)+'%':null], ['Open interest / volume', `${big(k.oi)} / ${big(k.volume)}`], ['Risk-free rate used', n2(k.rf*100,2)+'%']])}</div></div>
          ${D.grid?`<div class="card"><h3>Scenario grid — model value</h3>${table(['Underlying move','Now','Half-way to expiry','At expiry'], D.grid.map(g=>[pc(g.move,0), ...g.values.map(v=>n2(v,3))]))}</div>`:''}`; },
    fx(D){ return tiles([['Rate', n2(D.price, 4), D.base+'/'+D.quote], ['ECB/ref. rate', n2(D.ref, 4), String(D.refTime||'').slice(0,16)], ['1M', pc(D.px?.r1m), '', tone(D.px?.r1m)], ['1Y', pc(D.px?.r1y), '', tone(D.px?.r1y)], ['Volatility', D.px?n2(D.px.volPct)+'%':'—', 'annualised'], ['52-week range', D.px?`${n2(D.px.lo52,4)} – ${n2(D.px.hi52,4)}`:'—']])
        + `<div class="grid grid-2"><div class="card"><h3>${escapeHtml(D.base+'/'+D.quote)} — ECB reference history</h3><div class="qxe-chart"><canvas id="qxeC1"></canvas></div>${perfTable(D.px)}</div><div class="card"><h3>Risk</h3>${riskKv(D.px)}</div></div>`; },
    market(D){ return tiles([['Last', n2(D.price)], ['Day', pc(D.item.changePct), '', tone(D.item.changePct)], ['1Y', pc(D.px?.r1y), '', tone(D.px?.r1y)], ['Volatility', D.px?n2(D.px.volPct)+'%':'—'], ['Max drawdown', D.px?n2(D.px.mddPct)+'%':'—'], ['Trend', D.tech?D.tech.label:'—']])
        + (D.series?`<div class="grid grid-2"><div class="card"><h3>Price history</h3><div class="qxe-chart"><canvas id="qxeC1"></canvas></div>${perfTable(D.px)}</div><div class="card"><h3>Risk</h3>${riskKv(D.px)}</div></div>`:`<div class="notebox">${escapeHtml(D.gaps.join(' · '))}</div>`); },
    mf_in(D){ const m = D.meta || {};
      return tiles([['NAV', '₹'+n2(D.price, 4), D.px?D.px.lastDate:''], ['1Y', pc(D.px?.r1y), '', tone(D.px?.r1y)], ['3Y', pc(D.px?.r3y), '', tone(D.px?.r3y)], ['CAGR', pc(D.px?.cagr), 'since '+(D.px?.firstDate||'')], ['Volatility', D.px?n2(D.px.volPct)+'%':'—'], ['Max drawdown', D.px?n2(D.px.mddPct)+'%':'—']])
        + `<div class="grid grid-2"><div class="card"><h3>NAV history</h3><div class="qxe-chart"><canvas id="qxeC1"></canvas></div>${perfTable(D.px)}</div><div class="card"><h3>Scheme</h3>${kvt([['Fund house', m.fund_house], ['Category', m.scheme_category], ['Type', m.scheme_type], ['Scheme code', m.scheme_code], ['ISIN (growth)', m.isin_growth], ['Rolling 1-year returns', D.px?.rolling1y?`min ${pc(D.px.rolling1y.min)} · median ${pc(D.px.rolling1y.median)} · max ${pc(D.px.rolling1y.max)} · positive ${n2(D.px.rolling1y.pctPositive,0)}%`:null]])}<h3 style="margin-top:10px">Risk</h3>${riskKv(D.px)}</div></div>`; },
  };
  RENDER.govbond = RENDER.bond; RENDER.index = RENDER.market; RENDER.commodity = RENDER.market;

  async function open(it){
    if(!it) return; current = it; charts.splice(0).forEach(c=>{ try{ c.destroy(); }catch(e){} });
    const el = document.getElementById('qxeDetail'); el.classList.add('show');
    document.querySelectorAll('#qxeResults .qxe-row').forEach(r=>r.classList.toggle('active', last.items[+r.dataset.i]===it));
    if(['equity','etf','fund','preferred'].includes(it.kind)){
      el.innerHTML = header(it, `<button class="btn" id="qxeRes">Open in Research</button><button class="btn secondary" id="qxeOpt">Option chain</button>`)
        + tiles([['Market cap', it.mcap?fmtMarketCapShort(it.mcap, it.ccy):'—'], ['Sector', escapeHtml(it.raw?.sector||'—')], ['Industry', escapeHtml(String(it.raw?.industry||'—').slice(0,28))], ['Exchange', escapeHtml(it.exchange||'')], ['Type', escapeHtml(((it.raw?.typespecs)||[]).join(', ')||it.kind)]])
        + `<div id="qxeExtra"></div>`;
      document.getElementById('qxeRes').onclick = () => { const t = admitTvRow({...it.raw, _s: it.sym}); if(t){ goto('research'); selectSecurity(t); } };
      document.getElementById('qxeOpt').onclick = () => chain(it);
      wireHeader(it, null); return;
    }
    el.innerHTML = header(it) + '<div class="qx-skel" style="height:90px;margin:10px 0"></div><div class="qx-skel" style="height:260px"></div>';
    try{
      const D = await QXCOL.collect(it.kind, it); if(current!==it) return;
      el.innerHTML = header({...it, price: D.price ?? it.price}) + (RENDER[it.kind] ? RENDER[it.kind](D) : '') + (D.gaps.length?`<div class="qxa-dim" style="margin-top:8px">Data gaps: ${escapeHtml(D.gaps.join(' · '))}</div>`:'');
      wireHeader(it, D);
      if(it.kind==='future' && D.curve && D.curve.length>1) lineChart('qxeC1', {t:D.curve.map(c=>c.expiry), c:D.curve.map(c=>c.price)}, 'Curve');
      else if(it.kind==='option' && D.payoff){ const el2 = document.getElementById('qxeC1'); charts.push(new Chart(el2, {type:'line', data:{labels:D.payoff.map(p=>p.S.toFixed(1)), datasets:[{label:'At expiry', data:D.payoff.map(p=>p.expiry), borderColor:cssVar('--amber'), pointRadius:0}, {label:'Today', data:D.payoff.map(p=>p.today), borderColor:cssVar('--teal'), borderDash:[5,4], pointRadius:0}]}, options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{labels:{color:cssVar('--text-1')}}}, scales:{x:{ticks:{color:cssVar('--text-1'), maxTicksLimit:8}}, y:{ticks:{color:cssVar('--text-1')}}}}})); }
      else if(D.series) lineChart('qxeC1', D.series, it.name, {log: it.kind==='crypto'});
      if(it.kind==='future'){ const b = document.getElementById('qxeFv'); if(b) b.onclick = () => { const S = +document.getElementById('qxeS').value, r = +document.getElementById('qxeR').value/100, q = +document.getElementById('qxeQ2').value/100; const T = Math.max(0, D.k.daysToExpiry||0)/365.25; const F = QXM.future.fair(S, r, T, q); document.getElementById('qxeFvOut').innerHTML = S>0 ? `Fair ${n2(F,4)} vs market ${n2(D.price,4)} → ${pc((D.price/F-1)*100)} ${D.price>F?'rich':'cheap'}` : 'enter spot'; }; }
    }catch(e){ el.innerHTML = header(it) + `<div class="notebox">Could not load: ${escapeHtml(e.message)}</div>`; }
  }
  async function chain(it){
    const box = document.getElementById('qxeExtra'); box.innerHTML = '<div class="qx-skel" style="height:200px"></div>';
    try{
      const all = await QXS.optionChain(it.sym, {n:1});
      if(!all.total){ box.innerHTML = '<div class="notebox">No listed options found for this underlying (TradingView covers US OPRA options and selected other venues).</div>'; return; }
      const exps = await LD.tvScan('options', {filter:[{left:'type',operation:'equal',right:'option'}], index_filters:[{name:'underlying_symbol',values:[it.sym]}], columns:['expiration'], sort:{sortBy:'expiration',sortOrder:'asc'}, range:[0,1500]});
      const list = [...new Set(exps.rows.map(r=>r.expiration))].filter(x=>x >= +new Date().toISOString().slice(0,10).replace(/-/g,'')).slice(0,24);
      box.innerHTML = `<div class="card"><h3>Option chain — ${escapeHtml(it.sym)}</h3><div class="qxe-calc"><label>Expiry <select id="qxeExp">${list.map(x=>`<option value="${x}">${String(x).replace(/(\d{4})(\d\d)(\d\d)/,'$1-$2-$3')}</option>`).join('')}</select></label><span class="qxa-dim">${all.total.toLocaleString()} contracts · IV and Greeks from TradingView · click a row for full analysis</span></div><div id="qxeChain"></div></div>`;
      const load = async () => {
        const c = document.getElementById('qxeChain'); c.innerHTML = '<div class="qx-skel" style="height:160px"></div>';
        const {rows} = await QXS.optionChain(it.sym, {expiry: document.getElementById('qxeExp').value, n:300});
        const strikes = [...new Set(rows.map(r=>r.strike))].sort((a,b)=>a-b); const S = it.price;
        const near = strikes.filter(k=>!fin(S) || Math.abs(k/S-1) < 0.35);
        const cell = (r, side) => r ? `<td class="qxe-oc" data-sym="${escapeHtml(r.sym)}">${n2(r.last ?? r.theo, 2)}</td><td>${fin(r.iv)?n2(r.iv*100,1)+'%':'—'}</td><td>${n2(r.delta,2)}</td><td>${big(r.oi)}</td>` : '<td>—</td><td></td><td></td><td></td>';
        c.innerHTML = `<div style="overflow-x:auto;max-height:420px"><table class="datatable qxe-chain" data-nosort><thead><tr><th>Call</th><th>IV</th><th>Δ</th><th>OI</th><th style="text-align:center">Strike</th><th>Put</th><th>IV</th><th>Δ</th><th>OI</th></tr></thead><tbody>${near.map(k=>{ const cR = rows.find(r=>r.strike===k && r.type==='call'), pR = rows.find(r=>r.strike===k && r.type==='put'); return `<tr class="${fin(S)&&k<=S?'qxe-itm':''}">${cell(cR)}<td class="qxe-k">${n2(k,2)}</td>${cell(pR)}</tr>`; }).join('')}</tbody></table></div>`;
        c.onclick = e => { const td = e.target.closest('.qxe-oc'); if(!td) return; const r = rows.find(x=>x.sym===td.dataset.sym); open({kind:'option', sym:r.sym, name:`${String(it.sym).split(':')[1]} ${r.type.toUpperCase()} ${r.strike} ${String(r.expiry).replace(/(\d{4})(\d\d)(\d\d)/,'$1-$2-$3')}`, price:r.last, ccy:r.ccy, raw:r, underlying:{sym:it.sym, price:it.price}}); };
      };
      document.getElementById('qxeExp').onchange = load; load();
    }catch(e){ box.innerHTML = `<div class="notebox">Option chain unavailable: ${escapeHtml(e.message)}</div>`; }
  }
  return {mount, search, open, chain, get current(){ return current; }};
})();
