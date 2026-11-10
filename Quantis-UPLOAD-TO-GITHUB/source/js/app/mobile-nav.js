/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/app/mobile-nav.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Bottom navigation + More sheet on phones.
 * DEPENDS   —
 * EXPOSES   toggleMoreSheet (global — classic script, shared scope)
 * LOAD      Classic <script>, order defined in js/manifest.json. Top-level code runs at load,
 *           so it may only call functions from files listed EARLIER in the manifest.
 * NOTE      Migrated verbatim from the single-file build; inline comments marked
 *           "REAL BUG FIXED" / "post-launch fix" document past defects — keep them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* ===================== MOBILE NAVIGATION (post-launch fix) =====================
   Root-caused a real usability gap: the mobile bottom nav only exposed 4 of this app's 15
   views (Home/Research/Folio/Alerts) — Screener, Compare, Backtest, Options, Macro,
   Correlation, Reports, Export, Sources, Tests, and Docs were all completely unreachable on a
   phone, with no menu or "more" affordance anywhere. Workspace switching also disappeared
   below 900px with nothing to replace it. Both fixed here: a "More" sheet lists every
   remaining view plus Settings/Theme/AI, and a mobile-only <select> replaces the desktop
   workspace tabs. The AI assistant panel (previously just `display:none` below 900px, with no
   way to ever see it again on mobile) now opens as a full-screen overlay from the same sheet. */
function toggleMoreSheet(show){
  const sheet = document.getElementById('moreSheet');
  const mn = document.getElementById('mnMore');
  const willShow = show!=null ? show : !sheet.classList.contains('show');
  sheet.classList.toggle('show', willShow);
  const bd = document.getElementById('moreBackdrop'); if(bd) bd.classList.toggle('show', willShow);
  if(mn) mn.classList.toggle('active', willShow || ['screener','compare','backtest','options','macro','screening','correlation','reports','export','sources','tests','docs'].includes((document.querySelector('.view.active')||{id:''}).id.replace('view-','')));
}
document.getElementById('moreBackdrop').addEventListener('click', ()=>toggleMoreSheet(false));
document.getElementById('mnMore').addEventListener('click', ()=>toggleMoreSheet());
document.querySelectorAll('#moreSheet .msitem[data-view]').forEach(item=>{
  item.addEventListener('click', ()=>{ goto(item.dataset.view); toggleMoreSheet(false); });
});
document.getElementById('msSettings').addEventListener('click', ()=>{
  toggleMoreSheet(false);
  document.getElementById('settingsBtn').click();
});
document.getElementById('msTheme').addEventListener('click', ()=>{
  toggleMoreSheet(false);
  document.getElementById('themeBtn').click();
});
document.getElementById('msAiToggle').addEventListener('click', ()=>{
  toggleMoreSheet(false);
  // The assistant panel lives inside the Research view; opening it from any other view used to do
  // nothing (its parent view was display:none). Switch to Research first.
  if(!document.getElementById('view-research').classList.contains('active')) goto('research');
  document.getElementById('rightrail').classList.add('mobile-show');
  setTimeout(()=>document.getElementById('aiInput').focus(), 250);
});
document.getElementById('aiMobileClose').addEventListener('click', ()=>{
  document.getElementById('rightrail').classList.remove('mobile-show');
});
document.getElementById('mobileWsSelect').addEventListener('change', e=>{
  if(e.target.value === '__new__'){ createWorkspace(); return; }
  switchWorkspace(e.target.value);
});
// Tapping outside the sheet (on the dimmed area below it) closes it, same as the command palette.
document.getElementById('moreSheet').addEventListener('click', e=>{ if(e.target.id==='moreSheet') toggleMoreSheet(false); });
document.getElementById('settingsOverlay').addEventListener('click', e=>{ if(e.target.id==='settingsOverlay') e.target.classList.remove('show'); });
document.getElementById('keyCustomProxy').addEventListener('input', ()=>updateCustomProxyPreview()); // arrow: the function lives in a later file (settings-cloud-sync.js)
