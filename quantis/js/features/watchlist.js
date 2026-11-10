/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/features/watchlist.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Named watchlists ("workspaces") persisted to localStorage.
 * DEPENDS   core/storage.js
 * EXPOSES   activeWatchlist(), renderWorkspaceTabs() (global — classic script, shared scope)
 * LOAD      Classic <script>, order defined in js/manifest.json. Top-level code runs at load,
 *           so it may only call functions from files listed EARLIER in the manifest.
 * NOTE      Migrated verbatim from the single-file build; inline comments marked
 *           "REAL BUG FIXED" / "post-launch fix" document past defects — keep them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* ===================== WATCHLIST & WORKSPACES (post-launch fix) =====================
   Root-caused a fourth real bug: renderWatchlist() rendered ALL of SECURITIES, not a curated
   subset. That was invisible while SECURITIES had only 6 entries, but once the universe
   enrichment above (correctly) grew SECURITIES to 100+ so Screener/Compare would work, the
   watchlist sidebar would have silently started dumping the entire universe into what's
   supposed to be a short personal list — a second bug masquerading as a fix. A watchlist is a
   named subset of tickers, kept completely separate from SECURITIES (the full priceable
   universe). Workspace tabs (previously static HTML with zero event listeners — the "+ New"
   and "Default Workspace"/"India IT Basket" tabs never did anything) now switch between named
   watchlists for real, and everything persists to localStorage so it survives a reload —
   this file runs as a real hosted page once deployed, not inside a sandboxed iframe, so
   localStorage is safe and appropriate here. */
const WORKSPACE_STORAGE_KEY = 'quantis_workspaces_v1';
const DEFAULT_WORKSPACES = {
  'Default Workspace': ['AAPL','MSFT','NVDA','RELIANCE','TCS','AMZN'],
  'India IT Basket': ['TCS','INFY','WIPRO','HCLTECH'],
};
function loadWorkspaces(){
  try{
    const raw = safeStorage.getItem(WORKSPACE_STORAGE_KEY);
    if(raw){ const parsed = JSON.parse(raw); if(parsed && parsed.workspaces && parsed.active) return parsed; }
  }catch(e){ /* localStorage unavailable (e.g. private browsing) — fall back to in-memory defaults */ }
  return {workspaces: JSON.parse(JSON.stringify(DEFAULT_WORKSPACES)), active: 'Default Workspace'};
}
let workspaceState = loadWorkspaces();
function persistWorkspaces(){
  try{ safeStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(workspaceState)); }
  catch(e){ /* private browsing / storage disabled — state still works for this session */ }
  cloudSyncPush();
}
function activeWatchlist(){ return workspaceState.workspaces[workspaceState.active] || []; }
function addToWatchlist(ticker){
  const list = activeWatchlist();
  if(!list.includes(ticker)){ list.push(ticker); persistWorkspaces(); toast(`${ticker} added to ${workspaceState.active}.`, 'ok'); }
  else toast(`${ticker} is already in ${workspaceState.active}.`, 'warn');
  renderWatchlist(); renderWorkspaceTabs();
}
function removeFromWatchlist(ticker){
  const list = activeWatchlist();
  const i = list.indexOf(ticker);
  if(i>-1){ list.splice(i,1); persistWorkspaces(); }
  renderWatchlist();
}
function switchWorkspace(name){
  if(!workspaceState.workspaces[name]) return;
  workspaceState.active = name;
  persistWorkspaces();
  renderWorkspaceTabs(); renderWatchlist();
}
async function createWorkspace(){
  const name = await askText('New workspace', 'Each workspace keeps its own watchlist.', 'e.g. Banks, Swing trades');
  if(!name || !name.trim()){ renderWorkspaceTabs(); return; }
  const clean = name.trim();
  if(workspaceState.workspaces[clean]){ switchWorkspace(clean); return; }
  workspaceState.workspaces[clean] = [];
  workspaceState.active = clean;
  persistWorkspaces();
  renderWorkspaceTabs(); renderWatchlist();
}
function saveWorkspace(){
  persistWorkspaces();
  toast(`Workspace "${workspaceState.active}" saved${safeStorage.isReal()?'':' for this session (browser storage is blocked, so it will not survive a reload)'}.`, safeStorage.isReal()?'ok':'warn');
  const btn = document.getElementById('saveWorkspaceBtn');
  if(btn){ const orig = btn.title; btn.title = 'Saved!'; setTimeout(()=>btn.title = orig || 'Save workspace (Ctrl+S)', 1200); }
}
function renderWorkspaceTabs(){
  const el = document.getElementById('wsTabs'); if(!el) return;
  const names = Object.keys(workspaceState.workspaces);
  el.innerHTML = names.map(n=>`<div class="wstab ${n===workspaceState.active?'active':''}" data-ws="${escapeHtml(n)}">${escapeHtml(n)}</div>`).join('')
    + `<div class="wstab" id="wsNewBtn" style="opacity:.8">+ New</div>`;
  el.querySelectorAll('.wstab[data-ws]').forEach(t=>t.addEventListener('click', ()=>switchWorkspace(t.dataset.ws)));
  const nb = document.getElementById('wsNewBtn'); if(nb) nb.addEventListener('click', createWorkspace);

  // Mobile equivalent — .wstabs is hidden below 900px (no room for tabs), so workspace
  // switching would otherwise be completely unreachable on a phone. This <select> is the
  // mobile-only replacement, kept in sync with the same workspaceState.
  const mobileEl = document.getElementById('mobileWsSelect');
  if(mobileEl){
    mobileEl.innerHTML = names.map(n=>`<option value="${n.replace(/"/g,'&quot;')}" ${n===workspaceState.active?'selected':''}>${n}</option>`).join('') + `<option value="__new__">+ New workspace…</option>`;
  }
}
