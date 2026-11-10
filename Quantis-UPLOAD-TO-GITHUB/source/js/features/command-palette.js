/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/features/command-palette.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Ctrl+K palette and asset-class search filter.
 * DEPENDS   data/*
 * EXPOSES   — (global — classic script, shared scope)
 * LOAD      Classic <script>, order defined in js/manifest.json. Top-level code runs at load,
 *           so it may only call functions from files listed EARLIER in the manifest.
 * NOTE      Migrated verbatim from the single-file build; inline comments marked
 *           "REAL BUG FIXED" / "post-launch fix" document past defects — keep them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* ===================== COMMAND PALETTE ===================== */
const overlay = document.getElementById('palOverlay');
const palInput = document.getElementById('palInput');
const palResults = document.getElementById('palResults');
const COMMANDS = [
  {c:'/search', d:'Search a security'}, {c:'/compare', d:'Open comparison engine'}, {c:'/chart', d:'Open chart for a ticker'},
  {c:'/forecast', d:'Open prediction tab'}, {c:'/portfolio', d:'Open portfolio analysis'}, {c:'/screener', d:'Open screener'},
  {c:'/valuation', d:'Open valuation tab'}, {c:'/backtest', d:'Open strategy builder'}, {c:'/risk', d:'Open risk view'}, {c:'/export', d:'Open export center'},
];
function openPalette(){ overlay.classList.add('show'); palInput.value=''; palInput.focus(); renderPalClassChips(); renderPalResults(''); }
function closePalette(){ overlay.classList.remove('show'); }
function normalizeSearchText(s){
  // Strips accents/diacritics (so "nestle" matches "Nestlé") and lowercases.
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
}
const SECURITY_ALIASES = { // common informal names that don't literally appear in the legal entity name
  GOOGL:['google'], GOOG:['google'], META:['facebook'], TCEHY:['tencent'], '0700':['tencent'],
  '7203':['toyota'], '6758':['sony'], '005930':['samsung electronics','samsung'],
};
/* ===================== ASSET-CLASS SEARCH FILTER (post-launch fix) =====================
   Root-caused the "ETFs/bonds/mutual funds/futures/crypto not found" report: the universe
   itself only had equities, FX, and 2 commodities/2 cryptos — searching "index fund" or
   "debenture" had nothing to find, full stop, no filter would have fixed that. Two real fixes:
   (1) the universe above now has real ETF (bond ETFs included in this one category, per
   request — "all ETFs should be covered in ETF category itself"), Mutual Fund, Derivative
   (futures + an options-chain lookup for any underlying), Commodity, FX, and Crypto tickers —
   all genuine, Yahoo-chart-compatible symbols, not placeholders; (2) this class filter row so
   you can scope search to one asset type at a time. Individual corporate bonds/debentures
   specifically have no free live-quote API anywhere in the world (bond ETFs are the closest
   live-priceable proxy, kept inside the ETF category) — that limit is real and disclosed
   whenever a bond/debenture-flavored query comes in, not a bug to fix. */
const ASSET_CLASSES = ['Equity','ETF','Mutual Fund','Derivative','Commodity','Index','Crypto','FX'];
let paletteClassFilter = '';
function renderPalClassChips(){
  const el = document.getElementById('palClassChips');
  const chips = ['All', ...ASSET_CLASSES];
  el.innerHTML = chips.map(c=>`<div class="chip ${((c==='All'&&!paletteClassFilter)||c===paletteClassFilter)?'active':''}" data-cls="${c==='All'?'':c}">${c}</div>`).join('');
  el.querySelectorAll('.chip').forEach(ch=>ch.addEventListener('click', ()=>{
    paletteClassFilter = ch.dataset.cls;
    renderPalClassChips();
    renderPalResults(palInput.value);
  }));
}
let paletteSearchToken = 0; // guards against a slow/stale global search overwriting a newer query's results
function renderPalResults(q){
  const qn = normalizeSearchText(q);
  paletteSearchToken++;
  const myToken = paletteSearchToken;
  let html = '';
  if(q.startsWith('/') || q===''){
    const cmds = COMMANDS.filter(c=>c.c.includes(qn));
    if(cmds.length && !paletteClassFilter){ html += `<div class="palgroup">Commands</div>` + cmds.map(c=>`<div class="palrow" data-cmd="${c.c}"><span class="pt">${c.c}</span><span class="pn">${c.d}</span></div>`).join(''); }
  }
  const pool = paletteClassFilter ? SECURITY_UNIVERSE.filter(s=>s.cls===paletteClassFilter) : SECURITY_UNIVERSE;
  const matches = (qn==='' && !paletteClassFilter) ? [] : pool.filter(s=>
    qn==='' || normalizeSearchText(s.t).includes(qn) || normalizeSearchText(s.n).includes(qn) ||
    (SECURITY_ALIASES[s.t]||[]).some(a=>normalizeSearchText(a).includes(qn))
  ).slice(0,30);
  const classLabel = paletteClassFilter ? ` — ${paletteClassFilter}` : '';
  const isBondQuery = /bond|debenture/.test(qn);
  const bondMsg = isBondQuery ? ` Individual corporate bonds/debentures aren't covered by any free live-quote source anywhere — bond ETFs (try the ETF filter) are the closest real, live-priceable option.` : '';
  if(matches.length){ html += `<div class="palgroup">Curated${classLabel} (${matches.length}${matches.length===30?'+':''})</div>` + matches.map(s=>`<div class="palrow" data-t="${s.t}"><span class="pt">${s.t}</span><span class="pn">${s.n} · ${s.cls} · ${s.ex} · ${s.ctry}</span></div>`).join('') + (isBondQuery ? `<div class="palrow"><span class="pn" style="color:var(--text-2)">${bondMsg.trim()}</span></div>` : ''); }
  else if((q && !q.startsWith('/')) || paletteClassFilter){
    html += `<div class="palgroup">Curated${classLabel}</div><div class="palrow"><span class="pn">No curated match${classLabel} for "${escapeHtml(q)}" — searching worldwide…${bondMsg}</span></div>`;
  }
  // Derivative + Options: an individual option contract (e.g. "AAPL $150 Call") isn't something
  // any free source lets you search by name — real trading terminals don't work that way either;
  // you pick an underlying, then browse its live option chain. So when the Derivative filter is
  // active and the query matches a known underlying, offer a direct link into that chain instead
  // of a dead end (e.g. searching "HDFCBANK" now surfaces its real options chain, not nothing).
  if((paletteClassFilter==='Derivative' || !paletteClassFilter) && qn.length>=2){
    const underlyings = SECURITY_UNIVERSE.filter(s=>(s.cls==='Equity'||s.cls==='ETF') &&
      (normalizeSearchText(s.t).includes(qn) || normalizeSearchText(s.n).includes(qn))).slice(0,5);
    if(underlyings.length){
      html += `<div class="palgroup">Options chains (live, by underlying)</div>` + underlyings.map(s=>
        `<div class="palrow" data-optchain="${s.t}"><span class="pt">${s.t} options</span><span class="pn">Live chain for ${s.n} — pick an expiry once open</span></div>`
      ).join('');
    }
  }
  // Forwards and swaps are OTC (over-the-counter) contracts by definition — privately negotiated
  // between two counterparties, never listed on any exchange, with no public ticker or quote
  // system anywhere in the world (not on Bloomberg, not on Yahoo, nowhere free or paid at retail
  // level). Disclosing this honestly beats a dead-end silent no-results when someone searches
  // for one, since no future fix ever makes this searchable — it isn't a data gap, it's what an
  // OTC instrument means.
  if(paletteClassFilter==='Derivative' && /forward|\bswap\b/.test(qn)){
    html += `<div class="palgroup">Forwards &amp; Swaps</div><div class="palrow"><span class="pn">Forwards and swaps are OTC (over-the-counter) contracts — privately negotiated between two counterparties, never listed on any exchange. No public ticker or quote system exists for them anywhere, free or paid at retail level — this isn't a data gap in this app, it's what "OTC" means. Listed futures and options (searchable above) are the exchange-traded alternative.</span></div>`;
  }
  // Two result divs for the two live/background searches, appended separately so each can
  // update asynchronously without re-rendering (and losing) the instant curated results above.
  html += `<div id="palAmfiResults"></div><div id="palGlobalResults"></div>`;
  palResults.innerHTML = html || `<div class="palrow"><span class="pn">Type a ticker, company name, or /command — or pick an asset class above</span></div>`;
  bindPalRows();
  // Global live search (Yahoo) + AMFI India mutual fund NAV search — real worldwide coverage
  // beyond the curated list, per the "search anything, any country, any asset class" request.
  // Debounced so it doesn't fire per keystroke, and token-guarded so a slow response for an old
  // query can't clobber a newer one's results.
  clearTimeout(window.__palSearchTimer);
  const wantsMutualFund = !paletteClassFilter || paletteClassFilter==='Mutual Fund';
  if(q.trim().length >= 2 && !q.startsWith('/')){
    const globalEl = document.getElementById('palGlobalResults');
    if(globalEl) globalEl.innerHTML = `<div class="palgroup">Worldwide (live)</div><div class="palrow"><span class="pn">Searching…</span></div>`;
    const amfiEl = document.getElementById('palAmfiResults');
    if(amfiEl && wantsMutualFund) amfiEl.innerHTML = `<div class="palgroup">India Mutual Funds</div><div class="palrow"><span class="pn">Loading the scheme directory…</span></div>`;
    window.__palSearchTimer = setTimeout(async ()=>{
      try{
        let results = await searchYahooGlobalLive(q.trim());
        if(paletteClassFilter) results = results.filter(r=>r.cls===paletteClassFilter);
        results = results.filter(r=>!SECURITY_UNIVERSE.some(s=>LD.cnbcSymbol(s.t)===r._cnbc)); // don't duplicate what's already shown above
        if(myToken !== paletteSearchToken) return; // a newer query has since been typed — discard
        const el = document.getElementById('palGlobalResults');
        if(!el) return;
        if(results.length){
          el.innerHTML = `<div class="palgroup">Worldwide (live, ${results.length})</div>` + results.map(r=>
            `<div class="palrow" data-global-t="${escapeHtml(r._cnbc)}"><span class="pt">${escapeHtml(r.t)}</span><span class="pn">${escapeHtml(r.n)} · ${escapeHtml(r.cls)} · ${escapeHtml(r.ex)} · ${escapeHtml(r.ctry)}</span></div>`
          ).join('');
          el.querySelectorAll('.palrow[data-global-t]').forEach(row=>row.addEventListener('click', ()=>{
            const r = results.find(x=>x._cnbc===row.dataset.globalT);
            if(r){ admitGlobalSearchResult(r); selectSecurity(r.t); closePalette(); }
          }));
        }else{
          el.innerHTML = `<div class="palgroup">Worldwide (live)</div><div class="palrow"><span class="pn">No worldwide match either for "${escapeHtml(q)}".</span></div>`;
        }
      }catch(err){
        if(myToken !== paletteSearchToken) return;
        const el = document.getElementById('palGlobalResults');
        if(el) el.innerHTML = `<div class="palgroup">Worldwide (live)</div><div class="palrow"><span class="pn" style="color:var(--down)">Worldwide search failed: ${escapeHtml(err.message)} — check your connection.</span></div>`;
      }
      if(wantsMutualFund){
        try{
          await loadAmfiSchemes();
          if(myToken !== paletteSearchToken) return;
          const el = document.getElementById('palAmfiResults');
          if(!el) return;
          if(!amfiSchemes.length){
            el.innerHTML = `<div class="palgroup">India Mutual Funds (AMFI)</div><div class="palrow"><span class="pn" style="color:var(--down)">AMFI's NAV file failed to load${amfiSchemes._error?': '+amfiSchemes._error:''} — see Data Sources for proxy setup.</span></div>`;
            return;
          }
          const schemes = searchAmfiSchemes(q.trim(), 8);
          if(schemes.length){
            el.innerHTML = `<div class="palgroup">India Mutual Funds (${schemes.length})</div>` + schemes.map(s=>
              `<div class="palrow" data-amfi-code="${escapeHtml(s.code)}"><span class="pt">${s.ret1y!=null?`<span class="${s.ret1y>=0?'up':'down'}">${s.ret1y>=0?'+':''}${s.ret1y.toFixed(1)}% 1Y</span>`:'MF'}</span><span class="pn">${escapeHtml(s.name)} · ${escapeHtml(s.category)}</span></div>`
            ).join('');
            el.querySelectorAll('.palrow[data-amfi-code]').forEach(row=>row.addEventListener('click', ()=>{
              const s = schemes.find(x=>x.code===row.dataset.amfiCode);
              if(s){ const t = admitAmfiScheme(s); selectSecurity(t); closePalette(); }
            }));
          }else{
            el.innerHTML = `<div class="palgroup">India Mutual Funds (AMFI)</div><div class="palrow"><span class="pn">No AMFI scheme matches "${escapeHtml(q)}" among ${amfiSchemes.length} live schemes.</span></div>`;
          }
        }catch(err){
          if(myToken !== paletteSearchToken) return;
          const el = document.getElementById('palAmfiResults');
          if(el) el.innerHTML = `<div class="palgroup">India Mutual Funds (AMFI)</div><div class="palrow"><span class="pn" style="color:var(--down)">AMFI search failed: ${escapeHtml(err.message)}</span></div>`;
        }
      }
    }, 350);
  }
}
function bindPalRows(){
  palResults.querySelectorAll('.palrow[data-t]').forEach(r=>r.addEventListener('click',()=>{ selectSecurity(r.dataset.t); closePalette(); }));
  palResults.querySelectorAll('.palrow[data-optchain]').forEach(r=>r.addEventListener('click',()=>{ openOptionsChainFor(r.dataset.optchain); closePalette(); }));
  palResults.querySelectorAll('.palrow[data-cmd]').forEach(r=>r.addEventListener('click',()=>{
    const map = {'/search':'research','/compare':'compare','/chart':'research','/forecast':'research','/portfolio':'portfolio','/screener':'screener','/valuation':'research','/backtest':'backtest','/risk':'research','/export':'export'};
    goto(map[r.dataset.cmd] || 'dashboard'); closePalette();
  }));
}
palInput.addEventListener('input', e=>renderPalResults(e.target.value));
// Arrow keys / Enter in the command palette — previously mouse-only, despite being a keyboard-first feature.
palInput.addEventListener('keydown', e=>{
  const rows = [...palResults.querySelectorAll('.palrow[data-t],.palrow[data-cmd],.palrow[data-optchain],.palrow[data-global-t],.palrow[data-amfi-code]')];
  if(!rows.length) return;
  let i = rows.findIndex(r=>r.classList.contains('sel'));
  if(e.key==='ArrowDown' || e.key==='ArrowUp'){
    e.preventDefault();
    i = e.key==='ArrowDown' ? Math.min(rows.length-1, i+1) : Math.max(0, i-1);
    rows.forEach(r=>r.classList.remove('sel')); rows[i].classList.add('sel'); rows[i].scrollIntoView({block:'nearest'});
  } else if(e.key==='Enter'){
    e.preventDefault();
    (rows[i>=0?i:0]).click();
  }
});
overlay.addEventListener('click', e=>{ if(e.target===overlay) closePalette(); });
document.getElementById('globalSearch').addEventListener('focus', openPalette);
document.getElementById('helpBtn').addEventListener('click', ()=>document.getElementById('helpOverlay').classList.add('show'));
document.getElementById('settingsBtn').addEventListener('click', ()=>{ loadSettingsIntoForm(); document.getElementById('settingsOverlay').classList.add('show'); });
document.getElementById('cloudSyncBtn').addEventListener('click', ()=>{ loadSettingsIntoForm(); document.getElementById('settingsOverlay').classList.add('show'); document.getElementById('cloudSyncSetupBox')?.scrollIntoView?.({block:'nearest'}); });
// (cloud-sync start-up moved to js/app/init.js — it lives in a later file)
