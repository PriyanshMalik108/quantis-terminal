/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/app/navigation.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   goto(view) — switches views and triggers each view's lazy render. Add new views here.
 * DEPENDS   everything it calls is resolved at call time
 * EXPOSES   goto(view) (global — classic script, shared scope)
 * LOAD      Classic <script>, order defined in js/manifest.json. Top-level code runs at load,
 *           so it may only call functions from files listed EARLIER in the manifest.
 * NOTE      Migrated verbatim from the single-file build; inline comments marked
 *           "REAL BUG FIXED" / "post-launch fix" document past defects — keep them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* ===================== NAV / VIEW SWITCHING ===================== */
/* NEW FEATURE: Live P&L Browser Tab Title — glanceable price/portfolio movement without needing
   this tab focused. Zero new API — reuses SECURITIES.chgPct (already populated by every live
   price fetch elsewhere) and the same pfCurrentPrices() helper the Portfolio tab itself uses.
   Portfolio's "daily" change is a real $-value-weighted average of each holding's own chgPct,
   not a separate computation — consistent with how weights are calculated everywhere else in
   this app. Falls back to the plain default title when there's nothing meaningful to show
   (e.g. Dashboard, empty portfolio) rather than showing a stale or misleading number. */
const DEFAULT_TAB_TITLE = document.title;
function computePortfolioDailyChangePct(){
  if(PORTFOLIO_HOLDINGS.length === 0) return null;
  const prices = pfCurrentPrices();
  let totalValue = 0, weightedChangeSum = 0, anyChgKnown = false;
  PORTFOLIO_HOLDINGS.forEach(h=>{
    const sec = SECURITIES.find(x=>x.t===h.t);
    const value = pfUsdValue(h, prices);
    totalValue += value;
    if(sec && sec.chgPct!=null){ weightedChangeSum += value*sec.chgPct; anyChgKnown = true; }
  });
  return (totalValue>0 && anyChgKnown) ? weightedChangeSum/totalValue : null;
}
function updateTabTitle(){
  const activeView = document.querySelector('.view.active');
  const viewName = activeView ? activeView.id.replace('view-','') : null;
  if(viewName === 'research'){
    const s = SECURITIES.find(x=>x.t===currentSecurity);
    if(s && s.chgPct!=null){
      document.title = `${s.chgPct>=0?'▲':'▼'} ${currentSecurity} ${s.chgPct>=0?'+':''}${s.chgPct.toFixed(2)}% · Quantis`;
      return;
    }
  } else if(viewName === 'portfolio'){
    const chg = computePortfolioDailyChangePct();
    if(chg!=null){
      document.title = `${chg>=0?'▲':'▼'} Portfolio ${chg>=0?'+':''}${chg.toFixed(2)}% · Quantis`;
      return;
    }
  }
  document.title = DEFAULT_TAB_TITLE;
}
function goto(view){
  const target = document.getElementById('view-'+view);
  if(!target){
    console.error('[Quantis] goto() called with unknown view "'+view+'" — no #view-'+view+' element exists. Navigation ignored rather than throwing.');
    return; // defensive guard: a bad/typo'd view name (e.g. from a future edit, malformed deep-link, or stray onclick) should never crash the whole click handler
  }
  document.querySelectorAll('.navitem').forEach(n=>n.classList.toggle('active', n.dataset.view===view));
  document.querySelectorAll('#mobilenav .mnitem').forEach(n=>n.classList.toggle('active', n.dataset.view===view));
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  target.classList.add('active');
  if(view==='research') setTimeout(drawPriceChart,20);
  if(view==='charts') setTimeout(()=>QXC.mountGrid(),20);
  if(view==='explorer') setTimeout(()=>{ QXE.mount(); document.getElementById('qxeQ')?.focus(); },20);
  if(view==='formulas') setTimeout(()=>QXFLAB.mount(),20);
  if(view==='reports') setTimeout(()=>QXREP.mountUi(),10);
  if(view==='ailab') setTimeout(()=>QXAI.renderLab(),20);
  if(view==='dashboard') setTimeout(()=>QXU.heatmap(),40);
  if(view==='research' && document.querySelector('#tabs .tabbtn.active')?.dataset.tab==='analysis') setTimeout(()=>QXA.render(currentSecurity),30);
  if(view==='backtest') setTimeout(runBacktestEngine,20);
  if(view==='options') setTimeout(()=>{ runBlackScholes(); updateStrategyInputsVisibility(); runStrategyBuilder(); },20);
  if(view==='sources') setTimeout(refreshSourceStatus,20);
  if(view==='tests') setTimeout(runFormulaTests,20);
  if(view==='correlation') setTimeout(renderCorrelation,20); // was init-once only — the matrix should reflect whatever's on the watchlist right now, not whatever it was on first load
  if(view==='alerts') setTimeout(pollAlertsLive,20);
  if(view==='macro') setTimeout(renderMacroDashboard,20);
  if(view==='compare') setTimeout(renderCompareTable,20);
  if(view==='options') setTimeout(syncOptionsToSelection,20);
  if(view==='portfolio' && PORTFOLIO_HOLDINGS.length) setTimeout(renderPortfolio,20);
  if(view==='dashboard') setTimeout(refreshDashWatch,20);
  if(view==='reports') setTimeout(()=>{ const sel=document.getElementById('repSec'); if(sel && SECURITIES.some(x=>x.t===currentSecurity)){ if(![...sel.options].some(o=>o.value===currentSecurity)) renderReportsSecSelect(); sel.value=currentSecurity; } },20);
  document.querySelectorAll('#moreSheet .msitem[data-view]').forEach(n=>n.classList.toggle('active', n.dataset.view===view));
  const moreViews = ['explorer','charts','formulas','ailab','screener','compare','backtest','options','macro','screening','correlation','reports','export','sources','tests','docs'];
  const mn = document.getElementById('mnMore'); if(mn) mn.classList.toggle('active', moreViews.includes(view));
  const vb = target.querySelector('.viewbody'); if(vb) vb.scrollTop = 0;
  if(view==='export') setTimeout(()=>{ const active=document.querySelector('#exportDataChips .chip.active'); if(active) document.getElementById('exportDataNote').textContent = exportRowsFor(active.dataset.cat).note; },20);
  updateTabTitle();
}
document.querySelectorAll('.navitem').forEach(n=>n.addEventListener('click',()=>goto(n.dataset.view)));
document.querySelectorAll('#mobilenav .mnitem[data-view]').forEach(n=>n.addEventListener('click',()=>{ toggleMoreSheet(false); goto(n.dataset.view); }));

/* Workspace tabs (top bar) — see renderWorkspaceTabs() near the top of the script, which
   replaced this: the old version below was static HTML with zero event listeners, so the
   tabs, "+ New", and workspace switching never actually did anything. Kept only as a comment
   marker for where initialization calls this. */
