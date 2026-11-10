/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/ui/logos.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Company logo rendering (TradingView logo CDN with a lettered fallback).
 * DEPENDS   data/universe.js
 * EXPOSES   logoHtmlFor(ticker,size) (global — classic script, shared scope)
 * LOAD      Classic <script>, order defined in js/manifest.json. Top-level code runs at load,
 *           so it may only call functions from files listed EARLIER in the manifest.
 * NOTE      Migrated verbatim from the single-file build; inline comments marked
 *           "REAL BUG FIXED" / "post-launch fix" document past defects — keep them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* ===================== COMPANY LOGOS — rebuilt (root-cause fix) =====================
   Previous implementation's single source (icons.duckduckgo.com) is a genuine root cause of two
   separate visible bugs, confirmed against DuckDuckGo's and this app's own prior documentation:
     1. BLURRY logos — that service only ever serves 16x16/32x32 favicon rasters. Every place
        this app displays a logo (22px watchlist rows, 40px security header) was requesting that
        tiny source scaled UP to fill a larger box, which is exactly what produces visible blur —
        not a rendering bug, a wrong-resolution-source bug.
     2. WRONG icons ("$" signs, generic globes, unrelated glyphs) — the earlier comment assumed
        DuckDuckGo reliably 404s for domains with no real icon, so onerror would cleanly fall
        back to this app's own colored-initial avatar. In practice it doesn't always 404; for
        some real-but-uncommon domains it returns A real HTTP 200 with some generic/unrelated
        default glyph instead — which never triggers onerror, so the wrong image just sits there
        looking broken.
   Fix: Google's public favicon service (s2/favicons), requested at an explicit high `sz` (always
   at least 2x the CSS display size, so retina/high-DPI screens get a crisp downscaled image
   instead of an upscaled blurry one), as the PRIMARY source — for the real, curated public
   company domains in TICKER_DOMAIN below, Google's index actually has proper higher-resolution
   icon data (not just a 16px favicon.ico), unlike DuckDuckGo. DuckDuckGo is kept as a SECONDARY
   fallback (still free/keyless/CORS-safe as a plain <img> src), and this app's own generated
   colored-initial avatar remains the guaranteed-to-always-render final fallback — chained via
   onerror with an explicit stage counter, so each real failure advances exactly one step instead
   of retrying the same failed source or skipping a step. */
const TICKER_DOMAIN = {
  AAPL:'apple.com', MSFT:'microsoft.com', GOOGL:'abc.xyz', GOOG:'abc.xyz', AMZN:'amazon.com',
  NVDA:'nvidia.com', META:'meta.com', TSLA:'tesla.com', 'BRK.B':'berkshirehathaway.com',
  LLY:'lilly.com', WMT:'walmart.com', JPM:'jpmorganchase.com', V:'visa.com', ORCL:'oracle.com',
  XOM:'exxonmobil.com', JNJ:'jnj.com', MA:'mastercard.com', NFLX:'netflix.com', COST:'costco.com',
  BAC:'bankofamerica.com', PG:'pg.com', HD:'homedepot.com', GE:'ge.com', KO:'coca-cola.com',
  CVX:'chevron.com', ABNB:'airbnb.com', PDD:'pinduoduo.com', ADBE:'adobe.com', UBER:'uber.com',
  CSCO:'cisco.com', INTC:'intel.com', IBM:'ibm.com', DIS:'disney.com', BA:'boeing.com',
  GS:'goldmansachs.com', MS:'morganstanley.com', C:'citigroup.com', WFC:'wellsfargo.com',
  CAT:'caterpillar.com', GM:'gm.com', F:'ford.com', PFE:'pfizer.com', PEP:'pepsico.com',
  T:'att.com', VZ:'verizon.com', NKE:'nike.com', SBUX:'starbucks.com', QCOM:'qualcomm.com',
  TXN:'ti.com', UNH:'unitedhealthgroup.com', PYPL:'paypal.com', BABA:'alibaba.com',
  SPOT:'spotify.com', SHOP:'shopify.com', SQ:'squareup.com', AMD:'amd.com', AVGO:'broadcom.com',
  CRM:'salesforce.com', TCS:'tcs.com', INFY:'infosys.com', RELIANCE:'ril.com', HDFCBANK:'hdfcbank.com',
  SAMSUNG:'samsung.com', TM:'toyota.com', SONY:'sony.com', HSBC:'hsbc.com', BP:'bp.com',
  SHEL:'shell.com', SIEMENS:'siemens.com', SAP:'sap.com', ASML:'asml.com', NESN:'nestle.com',
  MCD:'mcdonalds.com', JD:'jd.com', TCEHY:'tencent.com', TSM:'tsmc.com', GSK:'gsk.com',
  AZN:'astrazeneca.com', BHP:'bhp.com', VOD:'vodafone.com', ULVR:'unilever.com', HSBA:'hsbc.com',
  BARC:'home.barclays', NOVN:'novartis.com', CBA:'commbank.com.au',
  ADANIENT:'adanienterprises.com', ASIANPAINT:'asianpaints.com', AXISBANK:'axisbank.com',
  BHARTIARTL:'airtel.in', HCLTECH:'hcltech.com', HINDUNILVR:'hul.co.in', ICICIBANK:'icicibank.com',
  KOTAKBANK:'kotak.com', MARUTI:'marutisuzuki.com', SUNPHARMA:'sunpharma.com',
  TATAMOTORS:'tatamotors.com', TITAN:'titancompany.in', WIPRO:'wipro.com', LT:'larsentoubro.com',
  SBIN:'bank.sbi', NTPC:'ntpc.co.in', ONGC:'ongcindia.com',
  ITC:'itcportal.com', SIE:'siemens.com', MC:'lvmh.com',
};
