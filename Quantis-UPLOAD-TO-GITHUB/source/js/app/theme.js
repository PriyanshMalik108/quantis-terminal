/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/app/theme.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Dark/light theme palettes.
 * DEPENDS   —
 * EXPOSES   applyTheme (global — classic script, shared scope)
 * LOAD      Classic <script>, order defined in js/manifest.json. Top-level code runs at load,
 *           so it may only call functions from files listed EARLIER in the manifest.
 * NOTE      Migrated verbatim from the single-file build; inline comments marked
 *           "REAL BUG FIXED" / "post-launch fix" document past defects — keep them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* ===================== THEME (post-launch fix) =====================
   Root-caused the "poor color grading / mismatching in light mode" report: the old toggle only
   swapped 9 background/text variables. Everything else — badge tints, card shadows, hover
   borders, even the up/down/amber accent colors themselves — stayed hardcoded at their
   dark-mode values, so badges kept dark, murky backgrounds on a white page and the accent
   colors weren't recontrasted for a light background. This now swaps every themed variable at
   once from two complete, deliberately designed palettes, and remembers your choice. */
const THEME_DARK = {
  '--bg-0':'#08090C','--bg-1':'#0E1015','--bg-2':'#14171E','--bg-3':'#1B1F29',
  '--line':'#252A36','--line-soft':'#1C202A',
  '--amber':'#D9A441','--amber-dim':'#7A5F2E',
  '--teal':'#2DD4BF','--up':'#3ECF8E','--down':'#FF5C6C',
  '--text-0':'#ECEEF3','--text-1':'#A7ADBC','--text-2':'#838A9A',
  '--fact-bg':'#0E211F','--fact-border':'#1E4A46','--model-bg':'#231A08',
  '--card-shadow':'0 1px 2px rgba(0,0,0,.24),0 0 0 1px rgba(255,255,255,.015) inset',
  '--card-hover-border':'#2E3444',
  '--btn-bg':'#D9A441','--btn-fg':'#1A1300',
};
const THEME_LIGHT = {
  '--bg-0':'#F4F5F7','--bg-1':'#FFFFFF','--bg-2':'#EEF0F3','--bg-3':'#E4E7EC',
  '--line':'#D7DAE0','--line-soft':'#E4E7EC',
  // FIXED — real WCAG contrast failure found in a systematic audit: these four accent colors
  // (used for the brand logo, LIVE/badge indicators, and every single price up/down figure in
  // the app) all failed the 4.5:1 minimum against light-theme backgrounds — as low as 2.91:1 in
  // the worst case (up-color on bg-3). This is almost certainly what "poor color grading when
  // switching to light theme" was actually describing. Darkened each just enough to pass 4.5:1
  // against even the lightest background used (bg-3), verified by direct calculation, not eyeballed.
  '--amber':'#7A4F0B','--amber-dim':'#E3C692',
  '--teal':'#0A6259','--up':'#146B40','--down':'#A32535',
  '--text-0':'#14161A','--text-1':'#454B58','--text-2':'#5C6270',
  '--fact-bg':'#E1F5F1','--fact-border':'#B7E3DA','--model-bg':'#FBF0DC',
  '--card-shadow':'0 1px 3px rgba(20,22,26,.08),0 0 0 1px rgba(20,22,26,.02) inset',
  '--card-hover-border':'#C4C8D0',
  // Primary buttons used var(--amber), which the light palette darkens to #7A4F0B for text contrast
  // — leaving near-black button text on a dark-brown button. Buttons now have their own colours.
  '--btn-bg':'#C98A1E','--btn-fg':'#170F00',
};
const THEME_STORAGE_KEY = 'quantis_theme_v1';
let light = false;
function applyTheme(){
  const palette = light ? THEME_LIGHT : THEME_DARK;
  const r = document.documentElement.style;
  Object.entries(palette).forEach(([k,v])=>r.setProperty(k,v));
  // Was raw ◐/◑ Unicode "half circle" glyphs set via textContent — these render inconsistently
  // (missing glyph / wrong size / tofu box) across different OS font stacks, especially on
  // mobile, and were easy to mistake for a rendering bug rather than an intentional icon. Now
  // two proper stroke-style SVGs (moon/sun) matching every other icon in the toolbar, toggled
  // via display instead of swapping text content.
  document.getElementById('themeIconMoon').style.display = light ? 'none' : '';
  document.getElementById('themeIconSun').style.display = light ? '' : 'none';
  document.getElementById('themeBtn').title = light ? 'Switch to dark theme' : 'Switch to light theme';
}
try{ light = safeStorage.getItem(THEME_STORAGE_KEY) === 'light'; }catch(e){ /* private browsing */ }
applyTheme();
document.getElementById('themeBtn').addEventListener('click',()=>{
  light = !light;
  applyTheme();
  try{ safeStorage.setItem(THEME_STORAGE_KEY, light ? 'light' : 'dark'); }catch(e){ /* private browsing — still works for this session */ }
  cloudSyncPush();
  // Redraw every Chart.js canvas currently on screen, not just the price chart — each one
  // reads its grid/line colors via cssVar() at draw time, so this is what actually applies
  // the new theme to them (previously only the price chart was told to redraw, so switching
  // themes left the Backtest and Options payoff charts stuck in the old palette).
  setTimeout(()=>{
    drawPriceChart();
    try{ QXC.retheme(); }catch(e){}
    if(document.querySelector('#panel-analysis.active')) QXA.render(currentSecurity);
    if(document.getElementById('backtestChart')) runBacktestEngine();
    if(document.getElementById('payoffChart')) runBlackScholes();
  },10);
});
