/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/core/defensive.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Global error handlers and runInit() — every init step is isolated so one failure cannot blank the app.
 * DEPENDS   core/feedback.js
 * EXPOSES   runInit(name, fn) (global — classic script, shared scope)
 * LOAD      Classic <script>, order defined in js/manifest.json. Top-level code runs at load,
 *           so it may only call functions from files listed EARLIER in the manifest.
 * NOTE      Migrated verbatim from the single-file build; inline comments marked
 *           "REAL BUG FIXED" / "post-launch fix" document past defects — keep them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* ===================== DEFENSIVE INFRASTRUCTURE (post-launch fix) =====================
   Root-caused a real crash: if the Chart.js CDN is slow, blocked, or offline when this page
   loads, `new Chart(...)` throws a ReferenceError. Since every init call at the bottom of this
   script runs synchronously and unguarded, ONE such throw silently killed every init call after
   it — Options, Correlation, Alerts, Reports, Docs, Tests, the AI greeting, and the price chart
   itself never rendered. That is almost certainly why the app looked broken. Fixed two ways:
   (1) every chart render goes through this safe wrapper instead of calling `new Chart` directly,
   (2) every init call below is now individually try/caught so a single failure can never take
   down the rest of the app (spec requirement: never silently fail). */
function safeNewChart(canvasId, config){
  const ctx = document.getElementById(canvasId);
  if(!ctx) return null;
  if(typeof Chart === 'undefined'){
    // (removed ctx.replaceWith?.() — called with no arguments it DETACHES the canvas, so
    // parentElement was null and this explanation never appeared: charts just vanished silently)
    const parent = ctx.parentElement;
    if(parent) parent.innerHTML = '<div class="notebox" style="color:var(--down);">Chart library failed to load from the CDN (blocked network, ad-blocker, or offline) — the numbers above are still real, just not plotted. Try disabling any content/ad blocker for this page and reloading.</div>';
    return null;
  }
  // maintainAspectRatio:false, applied once here for every chart in the app rather than at each
  // of the 5+ individual call sites: without it, Chart.js v4 defaults to locking each chart to
  // its initial width:height ratio (computed from the canvas's rendered size on first paint),
  // so as a container narrows on a phone/tablet the chart either gets squashed unreadably short
  // or forces horizontal scroll trying to preserve that ratio — a real, common "doesn't fit on
  // mobile" cause. Setting it false lets the chart fill its wrapper's actual CSS height (each
  // wrapper already has a sane fixed/min height in CSS) at any width. Config-provided options
  // still win if a specific chart genuinely needs to override this.
  config.options = Object.assign({maintainAspectRatio:false}, config.options||{});
  try{ return new Chart(ctx, config); }
  catch(e){ console.error('Chart render failed for #'+canvasId+':', e); return null; }
}
function runInit(label, fn){
  try{
    const result = fn();
    if(result && typeof result.catch === 'function'){
      result.catch(e=>{
        console.error('[Quantis init] "'+label+'" (async) failed:', e);
        const banner = document.getElementById('initDiagnostics');
        if(banner){ banner.style.display='block'; banner.innerHTML += `<div>⚠ "${label}" failed: ${escapeHtml(e.message)}</div>`; }
      });
    }
  }
  catch(e){
    console.error('[Quantis init] "'+label+'" failed:', e);
    const banner = document.getElementById('initDiagnostics');
    if(banner){
      banner.style.display = 'block';
      banner.innerHTML += `<div>⚠ "${label}" failed to initialize: ${escapeHtml(e.message)} — the rest of the app kept loading normally.</div>`;
    }
  }
}
