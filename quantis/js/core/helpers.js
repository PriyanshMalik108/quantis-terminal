/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/core/helpers.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Small HTML builders and escaping. escapeHtml is the single XSS choke point — use it for any text that came from an API or the user.
 * DEPENDS   nothing
 * EXPOSES   cssVar, kv, table, escapeHtml (global — classic script, shared scope)
 * LOAD      Classic <script>, order defined in js/manifest.json. Top-level code runs at load,
 *           so it may only call functions from files listed EARLIER in the manifest.
 * NOTE      Migrated verbatim from the single-file build; inline comments marked
 *           "REAL BUG FIXED" / "post-launch fix" document past defects — keep them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* ===================== HELPERS ===================== */
function scoreColor(v){ return v>=70?'var(--up)':v>=45?'var(--amber)':'var(--down)'; }
/* Theme-aware color reader for anything that can't take a CSS var string directly — Chart.js
   options objects need real hex/rgb values, not "var(--x)". Previously every chart (price,
   backtest, options payoff) hardcoded its dark-theme hex colors directly, so switching to light
   theme left every chart's grid lines and axis labels dark-on-white — the "poor color grading in
   light mode" report. Reading the CURRENT value of each CSS variable at chart-draw time fixes
   this for good, including for anyone who adds a third theme later — no chart code needs to
   change again. */
function cssVar(name){ return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function kv(rows){ return `<table class="datatable"><tbody>${rows.map(r=>`<tr><td style="color:var(--text-2);font-family:var(--sans);">${r[0]}</td><td style="text-align:right;">${r[1]}</td></tr>`).join('')}</tbody></table>`; }
/* table() now wraps its own output in an overflow-x scroller. Previously every call site had to
   remember to wrap it manually — Screener/Compare/Portfolio/Options did, but all six Fundamentals
   sub-panels (Income Statement, Balance Sheet, Ratios, Cash Flow, Fund Profile, Holdings, etc.)
   didn't, so a wide financial table on a phone either got clipped or forced the whole page to
   scroll sideways. Fixing it here means no future caller can reproduce that bug by forgetting. */
function table(headers,rows){ return `<div style="overflow-x:auto;"><table class="datatable"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map((c,i)=>`<td style="${i===0?'font-family:var(--sans);color:var(--text-1);':''}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`; }
/* HTML-escapes text before it's interpolated into an innerHTML template. Needed anywhere content
   originates outside this app's own control — RSS headlines, StockTwits posts/usernames, insider
   names from SEC filings, Wikipedia extracts, anything a user typed (tickers, portfolio CSV
   rows). Without this, a headline or message body containing a literal "<" or "&" can silently
   break the surrounding markup (the most likely explanation for a card rendering blank or
   mangled), and in the worst case a message body containing an actual <script> or event-handler
   attribute would execute as real HTML. Applied at every external-text insertion point below. */
function escapeHtml(str){
  if(str==null) return '';
  return String(str).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function bar(label,val,max,color,display){ const pct=Math.max(0,Math.min(100,(Math.abs(val)/(max||1))*100)); return `<div class="barrow"><div class="blbl">${label}</div><div class="btrack"><div class="bfill" style="width:${pct}%;background:${color||'var(--amber)'}"></div></div><div class="bval">${display!=null?display:val+(max===100?'%':'')}</div></div>`; }
function seededRnd(seed){ let s=seed; return function(){ s=(s*1103515245+12345)&0x7fffffff; return s/0x7fffffff; }; }
