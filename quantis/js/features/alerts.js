/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/features/alerts.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Price alert engine (indicator & drawing alerts live in modules/alerts-pro.js).
 * DEPENDS   data/live-data.js
 * EXPOSES   renderAlerts, pollAlertsLive (global — classic script, shared scope)
 * LOAD      Classic <script>, order defined in js/manifest.json. Top-level code runs at load,
 *           so it may only call functions from files listed EARLIER in the manifest.
 * NOTE      Migrated verbatim from the single-file build; inline comments marked
 *           "REAL BUG FIXED" / "post-launch fix" document past defects — keep them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* ===================== ALERTS (post-launch fix) =====================
   Root-caused two real bugs: (1) the Condition dropdown and Value input had no `id` at all, so
   addAlert() could not read them even in principle — every new alert silently got the same
   hardcoded "Price crosses above" / "—" regardless of what you picked or typed; (2) ALERTS was
   a plain in-memory array with 3 hardcoded demo rows, no persistence, and no way to remove one.
   Now: real condition/value are captured, each alert is evaluated against the security's actual
   current price/RSI/%change to set a real Active/Triggered status, alerts can be removed, and
   everything persists to local storage the same way watchlists and portfolio do. */
const ALERTS_STORAGE_KEY = 'quantis_alerts_v1';
function loadAlerts(){
  try{
    const raw = safeStorage.getItem(ALERTS_STORAGE_KEY);
    if(raw){ const parsed = JSON.parse(raw); if(Array.isArray(parsed)) return parsed; }
  }catch(e){ /* private browsing */ }
  return [
    {id:1,sec:'AAPL',cond:'Price crosses above',val:225},
    {id:2,sec:'NVDA',cond:'RSI above',val:70},
    {id:3,sec:'TCS',cond:'% change exceeds',val:2},
  ];
}
let ALERTS = loadAlerts();
function persistAlerts(){ try{ safeStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(ALERTS)); }catch(e){ /* private browsing */ } cloudSyncPush(); }
function evaluateAlert(a){
  const s = SECURITIES.find(x=>x.t===a.sec);
  if(!s) return 'Unknown ticker';
  const val = parseFloat(a.val);
  if(isNaN(val)) return 'Active';
  switch(a.cond){
    case 'Price crosses above': return s.px > val ? 'Triggered' : 'Active';
    case 'Price crosses below': return s.px < val ? 'Triggered' : 'Active';
    case 'RSI above': return s.rsi > val ? 'Triggered' : 'Active';
    case 'RSI below': return s.rsi < val ? 'Triggered' : 'Active';
    case '% change exceeds': return Math.abs(s.chgPct) > val ? 'Triggered' : 'Active';
    default: return 'Active';
  }
}
function renderAlerts(){
  document.getElementById('alSec').innerHTML = SECURITIES.map(s=>`<option>${s.t}</option>`).join('');
  syncAlertNotifBadge();
  if(ALERTS.length === 0){
    document.getElementById('alertsTable').innerHTML = '<tbody><tr><td style="padding:14px 4px;color:var(--text-2);">No alerts yet — create one above.</td></tr></tbody>';
    return;
  }
  document.getElementById('alertsTable').innerHTML = table(['Security','Condition','Value','Status','Live?',''],
    ALERTS.map(a=>{
      const status = evaluateAlert(a);
      const statusHtml = status==='Triggered' ? `<span style="color:var(--down);font-weight:600;">Triggered${a.notifiedAt?' ('+new Date(a.notifiedAt).toLocaleTimeString()+')':''}</span>` : status==='Active' ? `<span style="color:var(--up);">Active</span>` : status;
      const liveHtml = a._lastLiveCheck ? `<span class="badge fact" style="font-size:9px;">live ${new Date(a._lastLiveCheck).toLocaleTimeString()}</span>` : `<span class="badge assume" style="font-size:9px;">not yet checked live</span>`;
      return [a.sec, a.cond, a.val, statusHtml, liveHtml, `<button class="wl-remove" style="opacity:1;" title="Remove alert" aria-label="Remove alert for ${a.sec}" onclick="removeAlert(${a.id})">×</button>`];
    }));
}
function addAlert(){
  const sec = document.getElementById('alSec').value;
  const cond = document.getElementById('alCond').value;
  const val = document.getElementById('alVal').value.trim();
  if(!val || isNaN(parseFloat(val))){
    toast('Enter a numeric value for the alert condition (e.g. 230, 70, 2).');
    return;
  }
  const id = ALERTS.length ? Math.max(...ALERTS.map(a=>a.id))+1 : 1;
  ALERTS.unshift({id, sec, cond, val: parseFloat(val), notified:false, notifiedAt:null, _lastLiveCheck:null});
  persistAlerts();
  document.getElementById('alVal').value = '';
  renderAlerts();
  pollAlertsLive(); // check this new alert against a real live price right away, not just on the next 90s tick
}
function removeAlert(id){
  ALERTS = ALERTS.filter(a=>a.id!==id);
  persistAlerts();
  renderAlerts();
}
/* Background alert monitoring with real browser notifications — was previously entirely passive:
   evaluateAlert() only ever ran the instant you looked at the Alerts tab, using whatever price
   happened to already be cached in SECURITIES (usually stale unless you'd separately opened that
   ticker in Research). Now: (1) a 90s poll fetches a REAL current price for every ticker that has
   an active alert, via the same fetchLiveCloseSeries chain used by Research/Portfolio/Correlation
   — not a Yahoo quote endpoint, but the last close of the freshest available daily series, which
   is disclosed as such below; (2) RSI is computed live from that same fetched series rather than
   read from a possibly-stale SECURITIES.rsi; (3) an alert transitioning from not-triggered to
   triggered fires an actual browser Notification exactly once (re-arms if the condition later
   becomes false again, so a genuinely new crossing notifies again later). */
let alertPollToken = 0, alertPollInterval = null;
function requestAlertNotificationPermission(){
  if(!('Notification' in window)){
    document.getElementById('alertPollStatus').innerHTML = `<span style="color:var(--down)">This browser doesn't support the Notification API — alerts will still show as Triggered on this page, just without a popup.</span>`;
    return;
  }
  Notification.requestPermission().then(()=>{ syncAlertNotifBadge(); pollAlertsLive(); });
}
function syncAlertNotifBadge(){
  const badge = document.getElementById('alertNotifBadge'), btn = document.getElementById('alertNotifBtn');
  if(!badge) return;
  const supported = 'Notification' in window;
  const perm = supported ? Notification.permission : 'unsupported';
  if(perm === 'granted'){ badge.textContent='Notifications on'; badge.className='badge fact'; if(btn) btn.style.display='none'; }
  else if(perm === 'denied'){ badge.textContent='Notifications blocked'; badge.className='badge assume'; if(btn) btn.style.display='none'; }
  else { badge.textContent = supported ? 'Notifications off' : 'Not supported'; badge.className='badge assume'; if(btn) btn.style.display = supported?'inline-block':'none'; }
}
async function pollAlertsLive(){
  const myToken = ++alertPollToken;
  if(ALERTS.length === 0) return;
  const tickers = [...new Set(ALERTS.map(a=>a.sec))];
  const statusEl = document.getElementById('alertPollStatus');
  const results = await Promise.all(tickers.map(async t=>{
    try{
      const live = await fetchLiveCloseSeries(t);
      if(!live.data || live.data.length < 15) throw new Error('too little history');
      let px = live.data[live.data.length-1];
      let prevPx = live.data[live.data.length-2];
      let via = live.via;
      try{ // upgrade to the intraday quote so price alerts fire during the session, not after the close
        const cn = LD.cnbcSymbol(t); const q = cn ? await LD.quote(cn) : null;
        if(q && q.last){ px = q.last; if(q.prev) prevPx = q.prev; via = 'CNBC live quote'; }
      }catch(e){}
      const series = live.data.slice(); series[series.length-1] = px;
      const rsi = Formulas.rsi(series, 14);
      const chgPct = prevPx ? ((px-prevPx)/prevPx)*100 : 0;
      return {t, px, rsi, chgPct, isLive:true, via};
    }catch(e){
      return {t, isLive:false, via: e.message};
    }
  }));
  if(myToken !== alertPollToken) return;
  const now = Date.now();
  let anyNewTrigger = false;
  results.forEach(r=>{
    const secRec = SECURITIES.find(x=>x.t===r.t);
    if(r.isLive && secRec){ secRec.px = r.px; if(r.rsi!=null) secRec.rsi = Math.round(r.rsi*10)/10; secRec.chgPct = r.chgPct; }
    ALERTS.filter(a=>a.sec===r.t).forEach(a=>{
      a._lastLiveCheck = r.isLive ? now : a._lastLiveCheck;
      const status = evaluateAlert(a);
      if(status === 'Triggered' && !a.notified){
        a.notified = true; a.notifiedAt = now; anyNewTrigger = true;
        if('Notification' in window && Notification.permission === 'granted'){
          try{ new Notification(`Quantis Alert: ${a.sec}`, {body: `${a.cond} ${a.val} — condition met.`, tag: 'quantis-alert-'+a.id}); }catch(e){}
        }
      } else if(status !== 'Triggered' && a.notified){
        a.notified = false; a.notifiedAt = null; // re-arm: condition went false again, a future crossing should notify again
      }
    });
  });
  persistAlerts();
  if(anyNewTrigger || document.getElementById('view-alerts')?.classList.contains('active')) renderAlerts();
  if(statusEl){
    const liveCount = results.filter(r=>r.isLive).length;
    statusEl.innerHTML = `Last checked ${new Date(now).toLocaleTimeString()} — ${liveCount}/${results.length} ticker(s) fetched live. Enable browser notifications above to get alerted the moment a condition is met, even if this tab isn't focused on Alerts. Checks run every 90 seconds using each alert's real live price/RSI (same live-data chain as Research/Portfolio).`;
  }
}
if(!alertPollInterval) alertPollInterval = setInterval(pollAlertsLive, 90*1000);
setTimeout(()=>{ refreshUniverseLive(); }, 150);
if(!window._universeRefreshInterval) window._universeRefreshInterval = setInterval(()=>{ if(document.visibilityState === 'visible') refreshUniverseLive(); }, 60*1000);
