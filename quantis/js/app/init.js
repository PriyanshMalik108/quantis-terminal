/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/app/init.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Application start-up: every step wrapped in runInit so failures are isolated. Runs LAST.
 * DEPENDS   everything
 * EXPOSES   — (global — classic script, shared scope)
 * LOAD      Classic <script>, order defined in js/manifest.json. Top-level code runs at load,
 *           so it may only call functions from files listed EARLIER in the manifest.
 * NOTE      Migrated verbatim from the single-file build; inline comments marked
 *           "REAL BUG FIXED" / "post-launch fix" document past defects — keep them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* ===================== INIT ===================== */
/* Every step below is isolated — if any single one throws (blocked CDN, unexpected data shape,
   etc.) the rest of the app still finishes loading and the failure is shown in initDiagnostics
   instead of silently killing everything after it. This directly fixes a real bug: a slow/blocked
   Chart.js CDN previously crashed renderOptions() and took Correlation/Alerts/Reports/Docs/Tests/
   the AI greeting/price chart/DCF down with it, since they all ran after it unguarded. */
runInit('workspace tabs', renderWorkspaceTabs);
runInit('cloud sync', initFirebaseIfConfigured);
runInit('dashboard', renderDashboard);
runInit('watchlist', renderWatchlist);
runInit('score chips', renderScoreChips);
runInit('research tabs', renderTabs);
runInit('research panels', renderPanels);
runInit('header logo', ()=>{ const w=document.getElementById('secLogoWrap'); if(w) w.innerHTML = logoHtmlFor(currentSecurity, 40); });
runInit('compare view', renderCompare);
runInit('portfolio view', renderPortfolio);
runInit('screener dropdowns', populateScreenerDropdowns);
runInit('screener', runScreen);
runInit('options view', renderOptions);
runInit('correlation view', renderCorrelation);
runInit('alerts view', renderAlerts);
runInit('reports selector', renderReportsSecSelect);
runInit('docs view', renderDocs);
runInit('AI greeting', ()=>aiPush("Grounded assistant ready — I answer only from real computed data (fundamentals, technicals, valuation, risk, forecast, options, portfolio) already in this app, and say \"data unavailable\" rather than guess. Try asking about risk, valuation, or the forecast for the selected security. Add your own Anthropic/OpenAI key in Settings for open-ended questions, still grounded to the same real data.", null, 'UNCERTAIN'));
runInit('live market pulse', fetchLivePulse);
runInit('watchlist add button', ()=>{
  const btn = document.getElementById('wlAddBtn');
  btn.addEventListener('click', promptAddToWatchlist);
  // role="button" on a <span> gets no native keyboard activation — Enter/Space do nothing
  // unless wired explicitly, which would make the aria-label/role a lie for keyboard users.
  btn.addEventListener('keydown', e=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); promptAddToWatchlist(); } });
});
runInit('save workspace button', ()=>document.getElementById('saveWorkspaceBtn').addEventListener('click', saveWorkspace));
runInit('saved screens', renderSavedScreensList);
runInit('enter-to-submit forms', ()=>{
  const bind = (ids, fn)=>ids.forEach(id=>{ const el=document.getElementById(id); if(el) el.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); fn(); } }); });
  bind(['pfAddTicker','pfAddQty','pfAddAvg'], addPortfolioPosition);
  bind(['alVal'], addAlert);
  bind(['bsSpot','bsStrike','bsDays','bsRate','bsVol'], ()=>{ runBlackScholes(); runStrategyBuilder(); });
  bind(['fMcap','fPe','fRoe','fRsi'], runScreen);
  bind(['dcfFcf0','dcfShares','dcfGrowth','dcfWacc','dcfTerminal'], runDcf);
});
runInit('accessible names for icon buttons', ()=>{
  document.querySelectorAll('button[title]:not([aria-label])').forEach(b=>b.setAttribute('aria-label', b.title));
  document.querySelectorAll('.navitem[data-view]').forEach(n=>{ if(!n.getAttribute('role')) n.setAttribute('role','button'); if(!n.hasAttribute('tabindex')) n.setAttribute('tabindex','0'); n.addEventListener('keydown', e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); goto(n.dataset.view); } }); });
});
runInit('options default to selected security', syncOptionsToSelection);
runInit('compare add-ticker enter key', ()=>document.getElementById('compareAddInput').addEventListener('keydown', e=>{ if(e.key==='Enter') addTickerToCompare(); }));
runInit('price chart', drawPriceChart);
runInit('fundamentals', ()=>refreshFundamentals(currentSecurity));
runInit('valuation defaults', ()=>{ populateDcfDefaults(currentSecurity); renderValuationTable(currentSecurity); });
runInit('DCF calculator', runDcf);
runInit('formula test suite', runFormulaTests);

/* ---- v3/v4 module start-up (modules are loaded before this file) ---- */
runInit('AI settings block', ()=>{ const b=document.getElementById('qxaiSettings'); if(b) b.innerHTML = QXAI.settingsHtml(); QXAI.loadSettings(); document.getElementById('qxaiPref')?.addEventListener('change', ()=>{ safeStorage.setItem('quantis_ai_provider', document.getElementById('qxaiPref').value); QXAI.loadSettings(); }); });
runInit('company report UI', ()=>QXR.mountUi());
runInit('market heatmap', ()=>QXU.mountHeatmap());
runInit('price flash', ()=>QXU.initFlash());
runInit('chart layout buttons', ()=>document.querySelectorAll('#qxLayoutBtns [data-layout]').forEach(b=>b.addEventListener('click',()=>QXC.mountGrid(+b.dataset.layout))));
runInit('info guides', ()=>QXG.init());
runInit('accessible names (new controls)', ()=>{ document.querySelectorAll('button[title]:not([aria-label])').forEach(b=>b.setAttribute('aria-label', b.title)); });
