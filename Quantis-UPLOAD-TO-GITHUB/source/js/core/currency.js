/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/core/currency.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Currency metadata and price formatting (symbols, decimals, GBp/GBX pence handling).
 * DEPENDS   core/*
 * EXPOSES   CURRENCY_META, fmtPrice(value,ccy) (global — classic script, shared scope)
 * LOAD      Classic <script>, order defined in js/manifest.json. Top-level code runs at load,
 *           so it may only call functions from files listed EARLIER in the manifest.
 * NOTE      Migrated verbatim from the single-file build; inline comments marked
 *           "REAL BUG FIXED" / "post-launch fix" document past defects — keep them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* ===================== CURRENCY SYSTEM (post-launch fix) =====================
   Root-caused another real bug: every price everywhere was hardcoded to a "$" symbol and a
   generic "USD" label regardless of what the security actually trades in — so an Indian NSE
   stock or a UK LSE stock would show a dollar sign, which is simply wrong. Fixed with a real
   country->currency mapping, per-currency realistic price ranges for sample data (so an INR
   stock samples into a plausible ₹100-9000 range instead of a $20-500 US-style range), and a
   single formatting function every price display now goes through. */
const COUNTRY_CURRENCY = {
  'United States':'USD', 'India':'INR', 'United Kingdom':'GBP', 'Germany':'EUR', 'France':'EUR',
  'Netherlands':'EUR', 'Switzerland':'CHF', 'Japan':'JPY', 'South Korea':'KRW', 'China':'CNY',
  'Taiwan':'TWD', 'Australia':'AUD', 'Global':'USD',
};
const CURRENCY_META = {
  USD:{symbol:'$', decimals:2, range:[20,500]},
  INR:{symbol:'₹', decimals:2, range:[100,9000]},
  GBP:{symbol:'£', decimals:2, range:[3,80]},
  EUR:{symbol:'€', decimals:2, range:[10,300]},
  CHF:{symbol:'CHF ', decimals:2, range:[20,400]},
  JPY:{symbol:'¥', decimals:0, range:[500,50000]},
  KRW:{symbol:'₩', decimals:0, range:[10000,900000]},
  CNY:{symbol:'¥', decimals:2, range:[5,300]},
  TWD:{symbol:'NT$', decimals:2, range:[20,1200]},
  AUD:{symbol:'A$', decimals:2, range:[5,150]},
  HKD:{symbol:'HK$', decimals:2, range:[5,600]},
  CAD:{symbol:'C$', decimals:2, range:[5,300]},
  SGD:{symbol:'S$', decimals:2, range:[1,60]},
  // London prices are quoted in pence (GBp/GBX), not pounds — shown with an explicit "p" so
  // 619.90p is never mistaken for £619.90 (100x the real price).
  GBp:{symbol:'', suffix:'p', decimals:2, range:[50,8000]},
  GBX:{symbol:'', suffix:'p', decimals:2, range:[50,8000]},
};
function currencyFor(ctry){ return COUNTRY_CURRENCY[ctry] || 'USD'; }
function fmtPrice(value, ccy){
  if(value==null || !isFinite(value)) return '—';
  const meta = CURRENCY_META[ccy] || (ccy && ccy!=='USD' ? {symbol: ccy+' ', decimals:2} : CURRENCY_META.USD);
  const neg = value < 0;
  const av = Math.abs(value);
  const dec = (av > 0 && av < 2) ? Math.max(meta.decimals, av < 0.01 ? 6 : 4) : meta.decimals;
  const body = av.toLocaleString(undefined,{minimumFractionDigits:dec, maximumFractionDigits:dec});
  return (neg?'−':'') + meta.symbol + body + (meta.suffix||'');
}
function seededPriceFor(ticker, ccy){
  // Deterministic, ticker-specific sample price/change — never random, never mismatched, always
  // reproducible for the same ticker, so re-selecting a security shows the same sample figures.
  // Range is currency-appropriate (an INR stock samples in the hundreds-to-thousands, not $20-500).
  const meta = CURRENCY_META[ccy] || CURRENCY_META.USD;
  const seed = ticker.split('').reduce((a,c)=>a+c.charCodeAt(0)*31,7);
  const rnd = seededRnd(seed);
  const [lo,hi] = meta.range;
  const px = lo + rnd()*(hi-lo);
  const chgPct = (rnd()-0.5)*6;
  const rounded = meta.decimals===0 ? Math.round(px) : Math.round(px*100)/100;
  return {px: rounded, chgPct: Math.round(chgPct*100)/100, chg: Math.round(rounded*chgPct/100*100)/100};
}
