/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/modules/alerts-pro.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Indicator-signal and drawn-line alerts (the classic price alerts stay in
 *           features/alerts.js). Conditions are evaluated on CLOSED bars of the chosen
 *           interval: an alert fires when the condition flips between the previous bar and the
 *           latest bar (a true "cross"), so it does not repeat every poll.
 * CONDITIONS rsi_above/rsi_below (level) · macd_bull/macd_bear · price_above_ma/price_below_ma (MA type+period)
 *            golden_cross/death_cross (50/200) · bb_upper/bb_lower · st_up/st_down (Supertrend 10,3)
 *            line_cross (a horizontal line or trend line drawn on a chart — either direction)
 * DELIVERY  toast + browser notification (if permitted) + history log. Mode 'once' disarms after
 *           firing; 'every' keeps watching (one fire per new bar at most).
 * LIMITS    Runs while a Quantis tab is open (browser-only app, no server). The PWA service worker
 *           does not run alerts in the background — documented in the UI.
 * DEPENDS   QXC.loadBars, QXC.calcIndicator, safeStorage, toast
 * EXPOSES   QXAL.{add(a), remove(id), list(), fromDrawing(sym, interval, drawing), evaluate(), mount(el), CONDS}
 * ─────────────────────────────────────────────────────────────────────────────
 */
const QXAL = (() => {
  const KEY = 'qx_alerts_pro_v1', LOG = 'qx_alerts_pro_log_v1';
  const CONDS = {
    rsi_above:{label:'RSI(14) crosses above', p:{level:70}}, rsi_below:{label:'RSI(14) crosses below', p:{level:30}},
    macd_bull:{label:'MACD crosses above signal (bullish)', p:{}}, macd_bear:{label:'MACD crosses below signal (bearish)', p:{}},
    price_above_ma:{label:'Price crosses above moving average', p:{ma:'sma', period:50}}, price_below_ma:{label:'Price crosses below moving average', p:{ma:'sma', period:50}},
    golden_cross:{label:'Golden cross (50 over 200)', p:{}}, death_cross:{label:'Death cross (50 under 200)', p:{}},
    bb_upper:{label:'Close breaks above upper Bollinger band', p:{}}, bb_lower:{label:'Close breaks below lower Bollinger band', p:{}},
    st_up:{label:'Supertrend flips to up-trend', p:{}}, st_down:{label:'Supertrend flips to down-trend', p:{}},
    line_cross:{label:'Price crosses a drawn line', p:{}},
  };
  const load = () => { try{ return JSON.parse(safeStorage.getItem(KEY)||'[]'); }catch(e){ return []; } };
  const save = a => safeStorage.setItem(KEY, JSON.stringify(a));
  const list = () => load();
  function add(a){ const arr = load(); a.id = a.id || 'al'+Date.now().toString(36); a.created = Date.now(); a.active = true; a.mode = a.mode || 'once'; arr.push(a); save(arr); render(); evaluate([a.id]); return a; }
  function remove(id){ save(load().filter(x=>x.id!==id)); render(); }
  function fromDrawing(sym, interval, d){
    if(!d || !['hline','trend','ray'].includes(d.t)) { toast('Select a horizontal line or trend line first, then press 🔔.', 'warn'); return; }
    add({sym, interval, cond:'line_cross', p:{line:d}, note: d.t==='hline' ? `horizontal line at ${(+d.a.price).toFixed(2)}` : 'trend line'});
    toast(`Alert set: ${sym} crossing the ${d.t==='hline'?'horizontal':'trend'} line. Manage it in Alerts.`, 'ok');
  }
  function lineAt(line, t){ // value of a drawn line at time t (seconds); trend lines extrapolate linearly
    if(line.t==='hline') return line.a.price;
    const dt = line.b.time - line.a.time; if(!dt) return line.a.price;
    return line.a.price + (line.b.price - line.a.price) * (t - line.a.time) / dt;
  }
  function state(a, B, i){ // boolean state at bar i (the alert fires when state flips false→true)
    const I = (id, p) => QXC.calcIndicator(id, p, B), c = B.close;
    switch(a.cond){
      case 'rsi_above': return I('rsi',{period:14})[0][i] > a.p.level;
      case 'rsi_below': return I('rsi',{period:14})[0][i] < a.p.level;
      case 'macd_bull': { const m = I('macd',{fast:12,slow:26,signal:9}); return m[0][i] > m[1][i]; }
      case 'macd_bear': { const m = I('macd',{fast:12,slow:26,signal:9}); return m[0][i] < m[1][i]; }
      case 'price_above_ma': return c[i] > I(a.p.ma||'sma',{period:+a.p.period||50})[0][i];
      case 'price_below_ma': return c[i] < I(a.p.ma||'sma',{period:+a.p.period||50})[0][i];
      case 'golden_cross': { const s = I('sma',{period:50})[0][i], l = I('sma',{period:200})[0][i]; return s!=null && l!=null && s > l; }
      case 'death_cross': { const s = I('sma',{period:50})[0][i], l = I('sma',{period:200})[0][i]; return s!=null && l!=null && s < l; }
      case 'bb_upper': return c[i] > I('bb',{period:20,mult:2})[0][i];
      case 'bb_lower': return c[i] < I('bb',{period:20,mult:2})[2][i];
      case 'st_up': return I('st',{period:10,mult:3})[0][i] != null;
      case 'st_down': return I('st',{period:10,mult:3})[1][i] != null;
      case 'line_cross': { const v = lineAt(a.p.line, B.time[i]); a._side = a._side ?? null; return c[i] > v; }
    }
    return false;
  }
  async function evaluate(ids){
    const arr = load(); let changed = false;
    for(const a of arr){
      if(!a.active || (ids && !ids.includes(a.id))) continue;
      try{
        const B = await QXC.loadBars(a.sym, a.interval || '1D'); const n = B.close.length; if(n < 3) continue;
        // use the last COMPLETED bar pair for intraday (the newest intraday bar may still be forming)
        const i = B.intraday ? n-2 : n-1;
        const now = state(a, B, i), prev = state(a, B, i-1);
        a.lastCheck = Date.now(); a.lastState = now; changed = true;
        const flipped = a.cond==='line_cross' ? now !== prev : (now && !prev);
        const barT = B.time[i];
        if(flipped && a.lastFiredBar !== barT){
          a.lastFiredBar = barT; a.fired = (a.fired||0) + 1; if(a.mode==='once') a.active = false;
          const msg = `${a.sym}: ${CONDS[a.cond].label}${a.cond==='line_cross' ? ` (${a.note||'line'}, ${now?'upward':'downward'})` : a.p.level!=null ? ' '+a.p.level : a.p.period ? ` ${String(a.p.ma||'sma').toUpperCase()}(${a.p.period})` : ''} — close ${B.close[i].toFixed(2)} on ${a.interval||'1D'}`;
          notify(msg);
        }
      }catch(e){ a.lastError = e.message; changed = true; }
    }
    if(changed){ save(arr); render(); }
  }
  function notify(msg){
    toast('🔔 '+msg, 'warn');
    try{ const log = JSON.parse(safeStorage.getItem(LOG)||'[]'); log.unshift({t:Date.now(), msg}); safeStorage.setItem(LOG, JSON.stringify(log.slice(0,100))); }catch(e){}
    try{ if('Notification' in window && Notification.permission==='granted') new Notification('Quantis alert', {body:msg, tag:'qxal'}); }catch(e){}
  }
  let host = null;
  function mount(el){
    host = el; if(!el) return;
    el.innerHTML = `<div class="qxal-form">
        <label>Symbol<input id="qxalSym" list="qxcSymList" value="${escapeHtml(currentSecurity)}" spellcheck="false"></label>
        <label>Interval<select id="qxalIv">${['5M','15M','30M','1H','4H','1D','1W'].map(x=>`<option ${x==='1D'?'selected':''}>${x}</option>`).join('')}</select></label>
        <label style="flex:2">Condition<select id="qxalCond">${Object.entries(CONDS).filter(([k])=>k!=='line_cross').map(([k,c])=>`<option value="${k}">${c.label}</option>`).join('')}</select></label>
        <label id="qxalP1w">Level<input id="qxalP1" type="number" value="70"></label>
        <label id="qxalP2w" style="display:none">MA<select id="qxalMa"><option value="sma">SMA</option><option value="ema">EMA</option></select></label>
        <label>Repeat<select id="qxalMode"><option value="once">Once</option><option value="every">Every time</option></select></label>
        <button class="btn" id="qxalAdd">Add alert</button></div>
      <div class="qxa-dim" style="margin:6px 0 10px">Checked every minute while Quantis is open. Draw a horizontal or trend line on any chart, select it and press 🔔 to alert on a line break. <button class="btn secondary small" id="qxalPerm">Enable desktop notifications</button></div>
      <div id="qxalList"></div><details style="margin-top:8px"><summary class="qxa-dim">Alert history</summary><div id="qxalLog"></div></details>`;
    const cond = el.querySelector('#qxalCond'), p1 = el.querySelector('#qxalP1');
    const sync = () => { const c = cond.value; el.querySelector('#qxalP1w').style.display = /rsi|_ma$/.test(c) ? '' : 'none'; el.querySelector('#qxalP2w').style.display = /_ma$/.test(c) ? '' : 'none'; el.querySelector('#qxalP1w').firstChild.textContent = /_ma$/.test(c) ? 'Period' : 'Level'; if(document.activeElement!==p1) p1.value = c==='rsi_below' ? 30 : /_ma$/.test(c) ? 50 : 70; };
    cond.onchange = sync; sync();
    el.querySelector('#qxalAdd').onclick = () => { const sym = el.querySelector('#qxalSym').value.trim().toUpperCase(); if(!SECURITY_UNIVERSE.some(x=>x.t===sym) && !SECURITIES.some(x=>x.t===sym)){ toast(`"${sym}" isn't in the universe — open it via Search first.`, 'warn'); return; }
      const c = cond.value; const p = /rsi/.test(c) ? {level:+p1.value} : /_ma$/.test(c) ? {ma:el.querySelector('#qxalMa').value, period:+p1.value} : {};
      add({sym, interval:el.querySelector('#qxalIv').value, cond:c, p, mode:el.querySelector('#qxalMode').value}); toast('Alert added.', 'ok'); };
    el.querySelector('#qxalPerm').onclick = () => { if('Notification' in window) Notification.requestPermission().then(r=>toast('Notifications: '+r, r==='granted'?'ok':'warn')); };
    render();
  }
  function render(){
    if(!host) return; const L = host.querySelector('#qxalList'); if(!L) return; const arr = load();
    L.innerHTML = arr.length ? `<table class="datatable" data-nosort><thead><tr><th>Symbol</th><th>Interval</th><th>Condition</th><th>Status</th><th>Last check</th><th></th></tr></thead><tbody>${arr.map(a=>`<tr><td><b>${escapeHtml(a.sym)}</b></td><td>${escapeHtml(a.interval||'1D')}</td><td>${escapeHtml(CONDS[a.cond]?.label||a.cond)}${a.p&&a.p.level!=null?' '+a.p.level:''}${a.p&&a.p.period?` ${String(a.p.ma||'').toUpperCase()}(${a.p.period})`:''}${a.note?` <span class="qxa-dim">${escapeHtml(a.note)}</span>`:''}</td><td>${a.active?'<span class="badge fact">ARMED</span>':'<span class="badge assume">FIRED</span>'}${a.fired?` ×${a.fired}`:''}${a.lastError?` <span class="qxa-dim" title="${escapeHtml(a.lastError)}">⚠</span>`:''}</td><td class="qxa-dim">${a.lastCheck?new Date(a.lastCheck).toLocaleTimeString():'—'}</td><td><button class="btn secondary small" data-al-rm="${a.id}">Remove</button></td></tr>`).join('')}</tbody></table>` : '<div class="qxa-dim">No indicator or line alerts yet.</div>';
    L.querySelectorAll('[data-al-rm]').forEach(b=>b.onclick=()=>remove(b.dataset.alRm));
    const lg = host.querySelector('#qxalLog'); if(lg){ try{ const log = JSON.parse(safeStorage.getItem(LOG)||'[]'); lg.innerHTML = log.length ? log.slice(0,30).map(x=>`<div class="qxa-dim">${new Date(x.t).toLocaleString()} — ${escapeHtml(x.msg)}</div>`).join('') : '<div class="qxa-dim">Nothing yet.</div>'; }catch(e){} }
  }
  let timer = null;
  function start(){ if(timer) return; timer = setInterval(()=>{ if(document.visibilityState==='visible' && load().some(a=>a.active)) evaluate(); }, 60e3); setTimeout(()=>{ if(load().some(a=>a.active)) evaluate(); }, 8000); }
  return {add, remove, list, fromDrawing, evaluate, mount, start, CONDS, _lineAt: lineAt};
})();
