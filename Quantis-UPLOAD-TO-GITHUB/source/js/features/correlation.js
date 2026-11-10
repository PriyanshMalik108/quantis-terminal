/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/features/correlation.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Correlation & Relationship Engine (#view-correlation).
 *             • Build the basket: add any security worldwide (picker), remove with ×, or load a
 *               preset (watchlist, portfolio, world indices, cross-asset, Indian large caps…).
 *             • Settings: period (3M–5Y), frequency (daily / weekly), method (Pearson / Spearman
 *               rank), return type (simple / log), ordering (as added / clustered by similarity).
 *             • Heatmap: click any cell → pair detail with rolling correlation (30/60/90/120),
 *               beta, R², observations; plus insights (most / least related pairs, average
 *               correlation = diversification check). Export to CSV.
 *           Returns are aligned on COMMON CALENDAR DATES (different exchanges have different
 *           holidays) — earlier versions aligned by position, which mixed up days.
 * EXPOSES   QXCOR.{render(), add(t), remove(t), preset(id)}; renderCorrelation() delegates here.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const QXCOR = (() => {
  const KEY = 'quantis_corr_v2';
  let st = {list:null, period:'1Y', freq:'1D', method:'pearson', ret:'simple', order:'added', win:60};
  try{ Object.assign(st, JSON.parse(safeStorage.getItem(KEY)||'{}')); }catch(e){}
  const save = () => { try{ safeStorage.setItem(KEY, JSON.stringify(st)); }catch(e){} };
  const PRESETS = {
    watchlist:{label:'My watchlist', get:()=>activeWatchlist().slice(0,14)},
    portfolio:{label:'My portfolio', get:()=>PORTFOLIO_HOLDINGS.map(h=>h.t).slice(0,14)},
    indices:{label:'World indices', get:()=>['SPX','NDX','DJI','FTSE100','DAX','NIKKEI225','HANGSENG','NIFTY50','SENSEX','KOSPI']},
    cross:{label:'Cross-asset', get:()=>['SPX','NIFTY50','GOLD','SILVER','WTI','BTC','ETH','EURUSD','USDINR','TLT']},
    usmega:{label:'US mega caps', get:()=>['AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA','BRK.B','JPM','XOM']},
    india:{label:'India large caps', get:()=>['RELIANCE','TCS','HDFCBANK','INFY','ICICIBANK','SBIN','BHARTIARTL','ITC','LT','HINDUNILVR']},
  };
  let tok = 0, last = null, pairChart = null;
  const inUni = t => SECURITY_UNIVERSE.some(x=>x.t===t) || SECURITIES.some(x=>x.t===t);
  function ensureSec(t){ if(!SECURITIES.some(s=>s.t===t)){ const m = SECURITY_UNIVERSE.find(x=>x.t===t); if(m) SECURITIES.push(makeSampleSecurityEntry(m)); } }
  function list(){ if(!st.list || !st.list.length){ const w = activeWatchlist(); st.list = (w.length>=2 ? w : PRESETS.cross.get()).filter(inUni).slice(0,12); } return st.list; }
  function add(t){ if(!t) return; const l = list(); if(l.includes(t)) return toast(t+' is already in the basket.', 'warn'); if(l.length >= 20) return toast('Up to 20 securities — remove one first.', 'warn'); l.push(t); save(); render(); }
  function remove(t){ st.list = list().filter(x=>x!==t); save(); render(); }
  function preset(id){ const p = PRESETS[id]; if(!p) return; const l = p.get().filter(inUni); if(l.length < 2){ toast(`"${p.label}" needs at least 2 securities.`, 'warn'); return; } st.list = l; save(); render(); }

  function mount(){
    const v = document.querySelector('#view-correlation .viewbody'); if(!v || v.dataset.v2) return; v.dataset.v2 = '1';
    v.innerHTML = `
      <div class="card corr-controls">
        <div class="corr-row"><div style="flex:1;min-width:240px"><label class="qx-lbl">Add a security (any exchange, index, crypto, FX, commodity)</label><input id="corrAdd" class="qx-input" placeholder="Search name, ticker or ISIN…"></div>
          <div><label class="qx-lbl">Presets</label><select id="corrPreset" class="qx-select"><option value="">Load a preset…</option>${Object.entries(PRESETS).map(([k,p])=>`<option value="${k}">${p.label}</option>`).join('')}</select></div></div>
        <div id="corrChips" class="chiprow" style="margin-top:10px"></div>
        <div class="corr-row" style="margin-top:6px">
          <div><label class="qx-lbl">Period</label><div class="seg" data-k="period">${['3M','6M','1Y','3Y','5Y'].map(x=>`<button type="button" data-v="${x}">${x}</button>`).join('')}</div></div>
          <div><label class="qx-lbl">Frequency</label><div class="seg" data-k="freq"><button type="button" data-v="1D">Daily</button><button type="button" data-v="1W">Weekly</button></div></div>
          <div><label class="qx-lbl">Method</label><div class="seg" data-k="method"><button type="button" data-v="pearson">Pearson</button><button type="button" data-v="spearman">Spearman (rank)</button></div></div>
          <div><label class="qx-lbl">Returns</label><div class="seg" data-k="ret"><button type="button" data-v="simple">Simple</button><button type="button" data-v="log">Log</button></div></div>
          <div><label class="qx-lbl">Order</label><div class="seg" data-k="order"><button type="button" data-v="added">As added</button><button type="button" data-v="cluster">Clustered</button></div></div>
          <div style="margin-left:auto;align-self:flex-end"><button class="btn secondary small" id="corrCsv" type="button">Export CSV</button></div>
        </div>
      </div>
      <div class="grid corr-grid" style="margin-top:12px">
        <div class="card"><h3>Correlation heatmap <span id="corrBadge" class="badge assume">—</span></h3><div id="corrHeat"></div><div class="corr-legend"><span>−1 move opposite</span><i></i><span>+1 move together</span></div><div class="qxa-dim" id="corrNote" style="margin-top:8px"></div></div>
        <div class="card"><h3>Insights</h3><div id="corrInsights"><div class="qxa-dim">Computing…</div></div></div>
      </div>
      <div class="card" style="margin-top:12px" id="corrPairCard"><h3>Pair detail <span class="qxa-dim" style="text-transform:none;letter-spacing:0;font-weight:400">click any cell in the heatmap</span></h3>
        <div class="corr-row"><div><label class="qx-lbl">Rolling window</label><div class="seg" data-k="win">${[30,60,90,120].map(x=>`<button type="button" data-v="${x}">${x}</button>`).join('')}</div></div><div id="corrPairStats" class="corr-stats"></div></div>
        <div style="position:relative;height:260px;margin-top:10px"><canvas id="corrPairCanvas"></canvas></div></div>`;
    QXPICK.attach(v.querySelector('#corrAdd'), {onPick:t=>add(t)});
    v.querySelector('#corrPreset').addEventListener('change', e=>{ if(e.target.value) preset(e.target.value); e.target.value=''; });
    v.querySelectorAll('.seg[data-k]').forEach(seg=>seg.addEventListener('click', e=>{ const b = e.target.closest('button'); if(!b) return; const k = seg.dataset.k; st[k] = k==='win' ? +b.dataset.v : b.dataset.v; save(); syncSeg(); if(k==='win'){ if(last && last.pair) pair(last.pair[0], last.pair[1]); } else render(); }));
    v.querySelector('#corrCsv').addEventListener('click', csv);
    v.querySelector('#corrChips').addEventListener('click', e=>{ const x = e.target.closest('[data-rm]'); if(x) remove(x.dataset.rm); });
    v.querySelector('#corrHeat').addEventListener('click', e=>{ const c = e.target.closest('td[data-i]'); if(c && last) pair(+c.dataset.i, +c.dataset.j); });
  }
  function syncSeg(){ document.querySelectorAll('#view-correlation .seg[data-k]').forEach(seg=>seg.querySelectorAll('button').forEach(b=>b.classList.toggle('active', String(st[seg.dataset.k])===b.dataset.v))); }
  const rank = a => { const idx = a.map((v,i)=>[v,i]).sort((x,y)=>x[0]-y[0]); const r = new Array(a.length); for(let i=0;i<idx.length;){ let j=i; while(j+1<idx.length && idx[j+1][0]===idx[i][0]) j++; const avg=(i+j)/2+1; for(let k=i;k<=j;k++) r[idx[k][1]]=avg; i=j+1; } return r; };
  function corr(a, b){ const n = a.length; if(n < 3) return null; let ma=0, mb=0; for(let i=0;i<n;i++){ ma+=a[i]; mb+=b[i]; } ma/=n; mb/=n; let sab=0, saa=0, sbb=0; for(let i=0;i<n;i++){ const x=a[i]-ma, y=b[i]-mb; sab+=x*y; saa+=x*x; sbb+=y*y; } return saa&&sbb ? sab/Math.sqrt(saa*sbb) : null; }
  async function render(){
    mount(); syncSeg();
    const l = list(); l.forEach(ensureSec);
    document.getElementById('corrChips').innerHTML = l.map(t=>`<span class="chip active">${escapeHtml(t)}<span class="chip-x" data-rm="${escapeHtml(t)}" title="Remove">×</span></span>`).join('') || '<span class="qxa-dim">Add at least two securities.</span>';
    const heat = document.getElementById('corrHeat'), badge = document.getElementById('corrBadge');
    if(l.length < 2){ heat.innerHTML = '<div class="notebox">Add at least two securities to compute correlations.</div>'; return; }
    const my = ++tok; heat.innerHTML = `<div class="qx-skel" style="height:${40+l.length*30}px"></div>`; badge.textContent='LOADING'; badge.className='badge assume';
    const days = {'3M':92,'6M':183,'1Y':366,'3Y':1096,'5Y':1827}[st.period], start = Date.now()/1000 - days*86400;
    const res = await Promise.all(l.map(async t=>{ try{ const B = await QXC.loadBars(t, st.freq); const m = new Map(); for(let i=0;i<B.time.length;i++) if(B.time[i]>=start && B.close[i]>0) m.set(new Date(B.time[i]*1000).toISOString().slice(0, st.freq==='1W'?10:10), B.close[i]); return {t, m}; }catch(e){ return {t, m:new Map(), err:e.message}; } }));
    if(my !== tok) return;
    const ok = res.filter(r=>r.m.size > 10), failed = res.filter(r=>r.m.size <= 10);
    if(ok.length < 2){ heat.innerHTML = `<div class="notebox">Not enough price history (${failed.map(f=>f.t).join(', ')}).</div>`; badge.textContent='UNAVAILABLE'; return; }
    // weekly bars from different markets close on different days → bucket by ISO week for weekly
    const keyOf = d => { if(st.freq!=='1W') return d; const dt = new Date(d+'T00:00:00Z'); const day=(dt.getUTCDay()+6)%7; dt.setUTCDate(dt.getUTCDate()-day); return dt.toISOString().slice(0,10); };
    ok.forEach(r=>{ const m2 = new Map(); [...r.m.entries()].sort().forEach(([d,v])=>m2.set(keyOf(d), v)); r.m = m2; });
    const dates = [...ok[0].m.keys()].filter(d=>ok.every(r=>r.m.has(d))).sort();
    const R = ok.map(r=>{ const p = dates.map(d=>r.m.get(d)); const out = []; for(let i=1;i<p.length;i++) out.push(st.ret==='log' ? Math.log(p[i]/p[i-1]) : p[i]/p[i-1]-1); return out; });
    const X = st.method==='spearman' ? R.map(rank) : R;
    const n = ok.length, M = Array.from({length:n}, (_,i)=>Array.from({length:n}, (_,j)=> i===j ? 1 : corr(X[i], X[j])));
    let order = ok.map((_,i)=>i);
    if(st.order==='cluster'){ // greedy ordering: start with the most connected, then keep picking the closest remaining
      const avg = i => M[i].reduce((a,v,j)=>a+(j!==i&&v!=null?v:0),0)/(n-1);
      const rest = new Set(order); let cur = order.reduce((a,b)=>avg(b)>avg(a)?b:a); order = [cur]; rest.delete(cur);
      while(rest.size){ let best=null, bv=-2; rest.forEach(j=>{ const v = M[cur][j] ?? -2; if(v>bv){ bv=v; best=j; } }); order.push(best); rest.delete(best); cur = best; }
    }
    last = {ok, R, M, order, dates, pair:null};
    const col = v => { if(v==null) return 'transparent'; const a = Math.min(.9, .12 + Math.abs(v)*.78); return v>=0 ? `rgba(62,207,142,${a})` : `rgba(255,92,108,${a})`; };
    const T = i => ok[i].t;
    heat.innerHTML = `<table class="corr-tbl" data-nosort><thead><tr><th></th>${order.map(i=>`<th title="${escapeHtml(T(i))}">${escapeHtml(T(i))}</th>`).join('')}</tr></thead><tbody>${order.map(i=>`<tr><th>${escapeHtml(T(i))}</th>${order.map(j=>`<td data-i="${i}" data-j="${j}" style="background:${col(M[i][j])}" title="${escapeHtml(T(i))} vs ${escapeHtml(T(j))}: ${M[i][j]!=null?M[i][j].toFixed(3):'—'}">${M[i][j]!=null?M[i][j].toFixed(2):'—'}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    badge.textContent = 'LIVE'; badge.className = 'badge fact';
    document.getElementById('corrNote').textContent = `${st.method==='spearman'?'Spearman rank':'Pearson'} correlation of ${st.ret} ${st.freq==='1W'?'weekly':'daily'} returns over ${st.period}: ${dates.length-1} common observations (${dates[0]} → ${dates[dates.length-1]}), aligned on shared trading dates.${failed.length?' No usable history for: '+failed.map(f=>f.t).join(', ')+'.':''}`;
    // insights
    const pairs = []; for(let i=0;i<n;i++) for(let j=i+1;j<n;j++) if(M[i][j]!=null) pairs.push([i,j,M[i][j]]);
    pairs.sort((a,b)=>b[2]-a[2]);
    const avgC = pairs.reduce((a,p)=>a+p[2],0)/(pairs.length||1);
    const li = p => `<li><b>${escapeHtml(T(p[0]))} ↔ ${escapeHtml(T(p[1]))}</b> <span class="${p[2]>=0?'up':'down'}">${p[2].toFixed(2)}</span></li>`;
    document.getElementById('corrInsights').innerHTML = `<div class="corr-kpi"><span>Average pairwise correlation</span><b>${avgC.toFixed(2)}</b><i>${avgC>0.6?'Low diversification — these tend to move together.':avgC>0.3?'Moderate diversification.':'Good diversification — mostly independent moves.'}</i></div>
      <h4 class="qx-h4">Most related</h4><ul class="corr-list">${pairs.slice(0,4).map(li).join('')}</ul>
      <h4 class="qx-h4">Least related / hedges</h4><ul class="corr-list">${pairs.slice(-4).reverse().map(li).join('')}</ul>
      <div class="qxa-dim">0.7+ strong · 0.3–0.7 moderate · below 0.3 weak · negative = tend to move in opposite directions. Correlation changes over time — check the rolling view.</div>`;
    if(pairs.length) pair(pairs[0][0], pairs[0][1]);
  }
  function pair(i, j){
    if(!last || i===j) return; last.pair = [i,j];
    const a = last.R[i], b = last.R[j], A = last.ok[i].t, B = last.ok[j].t, w = st.win;
    const roll = [], labels = [];
    for(let k=w;k<=a.length;k++){ roll.push(corr(a.slice(k-w,k), b.slice(k-w,k))); labels.push(last.dates[k]); }
    const r = corr(a,b); let mb=0, ma=0; a.forEach((x,k)=>{ ma+=x; mb+=b[k]; }); ma/=a.length; mb/=b.length; let cov=0, vb=0; a.forEach((x,k)=>{ cov+=(x-ma)*(b[k]-mb); vb+=(b[k]-mb)**2; });
    const beta = vb ? cov/vb : null;
    document.getElementById('corrPairStats').innerHTML = [[`${A} vs ${B}`, r!=null?r.toFixed(3):'—', 'correlation'], ['Beta of '+A, beta!=null?beta.toFixed(2):'—', `${A} move per 1% of ${B}`], ['R²', r!=null?(r*r*100).toFixed(1)+'%':'—', 'variance explained'], ['Observations', String(a.length), st.freq==='1W'?'weeks':'days']].map(x=>`<div><span>${escapeHtml(x[0])}</span><b>${x[1]}</b><i>${escapeHtml(x[2])}</i></div>`).join('');
    if(typeof Chart==='undefined'){ return; } // chart library blocked — numbers above still work
    const ctx = document.getElementById('corrPairCanvas'); if(pairChart){ try{ pairChart.destroy(); }catch(e){} }
    pairChart = new Chart(ctx, {type:'line', data:{labels, datasets:[{label:`${w}-period rolling correlation`, data:roll, borderColor:'#D9A441', backgroundColor:'rgba(217,164,65,.12)', fill:true, pointRadius:0, borderWidth:2, tension:.2}]},
      options:{responsive:true, maintainAspectRatio:false, animation:{duration:450}, interaction:{mode:'index', intersect:false}, plugins:{legend:{labels:{color:cssVar('--text-1')}}},
        scales:{x:{ticks:{color:cssVar('--text-2'), maxTicksLimit:8}, grid:{display:false}}, y:{min:-1, max:1, ticks:{color:cssVar('--text-2')}, grid:{color:cssVar('--line')}}}}});
    if(roll.length < 2) document.getElementById('corrPairStats').insertAdjacentHTML('beforeend', `<div class="qxa-dim">Not enough observations for a ${w}-period rolling window — choose a longer period.</div>`);
  }
  function csv(){
    if(!last) return toast('Nothing to export yet.', 'warn');
    const T = last.order.map(i=>last.ok[i].t);
    const rows = [['',...T], ...last.order.map(i=>[last.ok[i].t, ...last.order.map(j=>last.M[i][j]!=null?last.M[i][j].toFixed(4):'')])];
    downloadBlob(`correlation_${st.period}_${st.freq}_${st.method}.csv`, rows.map(r=>r.join(',')).join('\n'), 'text/csv');
  }
  return {render, add, remove, preset};
})();
