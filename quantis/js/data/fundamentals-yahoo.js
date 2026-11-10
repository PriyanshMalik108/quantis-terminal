/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/data/fundamentals-yahoo.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Legacy Yahoo fundamentals path (only used with a user CORS proxy).
 * DEPENDS   data/proxy-chain.js
 * EXPOSES   fetchYahooFundamentals (global — classic script, shared scope)
 * LOAD      Classic <script>, order defined in js/manifest.json. Top-level code runs at load,
 *           so it may only call functions from files listed EARLIER in the manifest.
 * NOTE      Migrated verbatim from the single-file build; inline comments marked
 *           "REAL BUG FIXED" / "post-launch fix" document past defects — keep them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* ===================== YAHOO FINANCE QUOTESUMMARY — LIVE FUNDAMENTALS (post-launch fix) =====
   Root cause of "fundamentals/valuation is inaccurate — only sample data, not real": the
   Fundamentals tab only ever had ONE live path — SEC EDGAR XBRL — and that was hardcoded to
   exactly 4 US tickers (SEC_CIK above). Every other security on Earth, including US names
   outside that list, silently fell through to seededFundamentalsFor()'s deterministic-but-fake
   numbers with no live attempt ever made for them. That's the actual "sample only" behavior
   being reported.
   Fix: query1.finance.yahoo.com's "quoteSummary" endpoint carries real P/E, EPS, ROE, margins,
   market cap, revenue, debt and analyst-style key stats for essentially any ticker Yahoo lists —
   the SAME global exchange coverage (NSE/BSE/LSE/XETRA/TSE/HKEX/ASX/KRX...) already proven out
   for price history above via yahooSymbolFor(). It's unofficial (no official CORS, no SLA,
   fields occasionally null for thinly-covered names) so it goes through the same disclose-on-
   failure proxy chain as everything else — never fabricates, and now finally gives most
   real-world tickers an actual shot at LIVE fundamentals instead of defaulting to sample. */
function getKey(name){
  try{ return (safeStorage.getItem('quantis_key_'+name)||'').trim(); }catch(e){ return ''; }
}
/* Financial Modeling Prep — optional (needs a free key, ~250 req/day, no card required) but
   genuinely broader than everything else here: real fundamentals for ~25,000 companies across
   global exchanges, not just the ~50 SEC-mapped US tickers or whatever Yahoo's undocumented
   endpoint happens to return for a given symbol that day. Tried FIRST when a key is set, since
   it's the most complete real source available; Yahoo remains the zero-setup fallback under it. */
async function fetchFmpFundamentalsLive(ticker, apiKey){
  const base = 'https://financialmodelingprep.com/api/v3';
  const profileUrl = `${base}/profile/${encodeURIComponent(ticker)}?apikey=${encodeURIComponent(apiKey)}`;
  const ratiosUrl = `${base}/ratios-ttm/${encodeURIComponent(ticker)}?apikey=${encodeURIComponent(apiKey)}`;
  const [profileRes, ratiosRes] = await Promise.all([
    fetchWithTimeout(profileUrl, {mode:'cors'}, 8000),
    fetchWithTimeout(ratiosUrl, {mode:'cors'}, 8000),
  ]);
  if(!profileRes.ok) throw new Error('FMP profile HTTP '+profileRes.status+(profileRes.status===401?' (bad or missing API key)':''));
  const profileArr = await profileRes.json();
  const p = Array.isArray(profileArr) ? profileArr[0] : null;
  if(!p) throw new Error('FMP has no profile for '+ticker+' — check the ticker is FMP-recognized (US tickers plain, e.g. RY.TO for Toronto, 7203.T for Tokyo)');
  let r = {};
  if(ratiosRes.ok){ const ratiosArr = await ratiosRes.json(); r = (Array.isArray(ratiosArr) && ratiosArr[0]) ? ratiosArr[0] : {}; }
  return {
    entityName: p.companyName, currency: p.currency || 'USD',
    marketCap: p.mktCap, pe: p.pe ?? r.peRatioTTM, eps: p.eps,
    beta: p.beta, fiftyTwoWkLow: p.range ? parseFloat((p.range.split('-')[0]||'').trim()) : null,
    fiftyTwoWkHigh: p.range ? parseFloat((p.range.split('-')[1]||'').trim()) : null,
    roe: r.returnOnEquityTTM, roa: r.returnOnAssetsTTM, profitMargin: r.netProfitMarginTTM,
    grossMargin: r.grossProfitMarginTTM, operatingMargin: r.operatingProfitMarginTTM,
    debtToEquity: r.debtEquityRatioTTM, dividendYield: r.dividendYieldTTM,
    priceToBook: r.priceToBookRatioTTM, pegRatio: r.priceEarningsToGrowthRatioTTM,
    via: 'Financial Modeling Prep (direct)',
  };
}
async function fetchFmpFundamentals(ticker){
  const apiKey = getKey('fmp');
  if(!apiKey) throw new Error('no FMP key set');
  return cachedFetch('fmpfund_'+ticker, 60*60*1000, ()=>fetchFmpFundamentalsLive(ticker, apiKey));
}
/* Earnings calendar — Yahoo's quoteSummary already carries this in the calendarEvents module,
   which the fundamentals fetch above was already calling for other data; this just reads a
   field that was already coming back in the response but was previously discarded entirely. No
   new endpoint, no new key, no new network call. Yahoo wraps each date as either a raw unix
   timestamp (seconds) or {raw, fmt} depending on which quoteSummary code path served the
   request, so both shapes are handled. */
function parseEarningsCalendar(calendarEvents){
  const e = calendarEvents?.earnings;
  if(!e) return null;
  const toDate = v => {
    if(v==null) return null;
    const raw = typeof v === 'object' ? v.raw : v;
    if(typeof raw !== 'number') return null;
    return new Date(raw*1000);
  };
  const dates = (e.earningsDate||[]).map(toDate).filter(Boolean);
  if(!dates.length) return null;
  const num = obj => (obj && typeof obj.raw === 'number') ? obj.raw : (typeof obj === 'number' ? obj : null);
  return {
    nextDate: dates[0], dateRange: dates.length>1 ? [dates[0],dates[1]] : [dates[0],dates[0]],
    epsEstimate: num(e.earningsAverage), epsLow: num(e.earningsLow), epsHigh: num(e.earningsHigh),
    revenueEstimate: num(e.revenueAverage),
  };
}

/* NEW FEATURE: Analyst Ratings & Price Targets — Yahoo's financialData and defaultKeyStatistics
   modules were already being fetched for every ticker (zero additional network cost), but the
   analyst consensus fields inside them (target price range, buy/hold/sell recommendation,
   number of analysts) were being silently discarded. Real Wall Street consensus data, not a
   computed/derived number — same "disclose the real source, never fabricate" discipline as
   everywhere else in this app. */
function parseAnalystData(financialData, keyStats){
  const num = (obj)=> (obj && typeof obj.raw === 'number') ? obj.raw : (typeof obj === 'number' ? obj : null);
  const targetMean = num(financialData.targetMeanPrice);
  const targetHigh = num(financialData.targetHighPrice);
  const targetLow = num(financialData.targetLowPrice);
  const numAnalysts = num(financialData.numberOfAnalystOpinions);
  const recKey = financialData.recommendationKey; // e.g. "buy", "hold", "strong_buy", "underperform"
  const recMean = num(financialData.recommendationMean); // 1.0 (Strong Buy) .. 5.0 (Sell)
  const shortRatio = num(keyStats?.shortRatio);
  const shortPctFloat = num(keyStats?.shortPercentOfFloat);
  if(targetMean==null && !recKey) return null;
  return {targetMean, targetHigh, targetLow, numAnalysts, recKey, recMean, shortRatio, shortPctFloat};
}
const RECOMMENDATION_LABELS = {
  strong_buy:'Strong Buy', buy:'Buy', hold:'Hold', underperform:'Underperform', sell:'Sell', none:'—'
};
function renderAnalystRatings(analyst, currentPrice, currency){
  const box = document.getElementById('fundAnalystBox'), badge = document.getElementById('fundAnalystBadge');
  if(!box) return;
  if(!analyst){
    box.innerHTML = `<div class="notebox">No analyst coverage data returned by Yahoo for this ticker (common for smaller-cap or thinly-covered names).</div>`;
    return;
  }
  const upside = (analyst.targetMean!=null && currentPrice) ? ((analyst.targetMean/currentPrice)-1)*100 : null;
  const recLabel = RECOMMENDATION_LABELS[analyst.recKey] || (analyst.recKey ? analyst.recKey.replace(/_/g,' ') : '—');
  const rows = [
    ['Consensus Rating', `${escapeHtml(recLabel)}${analyst.recMean!=null?` (${analyst.recMean.toFixed(1)}/5.0, 1=Strong Buy)`:''}`],
    ['Analysts Covering', analyst.numAnalysts!=null ? String(analyst.numAnalysts) : '—'],
    ['Mean Price Target', analyst.targetMean!=null ? fmtPrice(analyst.targetMean, currency) : '—'],
    ['Target Range', (analyst.targetLow!=null && analyst.targetHigh!=null) ? `${fmtPrice(analyst.targetLow, currency)} – ${fmtPrice(analyst.targetHigh, currency)}` : '—'],
    ['Implied Upside/Downside', upside!=null ? `<span class="${upside>=0?'up':'down'}">${upside>=0?'+':''}${upside.toFixed(1)}%</span> vs current price` : '—'],
  ];
  if(analyst.shortPctFloat!=null) rows.push(['Short % of Float', (analyst.shortPctFloat*100).toFixed(1)+'%']);
  box.innerHTML = kv(rows) + `<div class="notebox" style="margin-top:6px;">Real Wall Street analyst consensus from Yahoo Finance (same fetch as Key Stats above, not a separate request). "Implied Upside" is mechanical (target ÷ current price − 1) — not this app's own opinion, and analyst targets are frequently wrong, especially over short horizons.</div>`;
  if(badge){ badge.textContent='LIVE'; badge.className='badge fact'; }
}
/* NEW FEATURE: Dividend Info — same "already fetched, never displayed" pattern. summaryDetail
   already carried dividendRate/exDividendDate/payoutRatio alongside the dividendYield that WAS
   being shown; calendarEvents (already fetched for the earnings calendar) also carries
   exDividendDate as a fallback path since Yahoo has served it from either module at different
   times. */
function parseDividendData(summaryDetail, calendarEvents){
  const num = (obj)=> (obj && typeof obj.raw === 'number') ? obj.raw : (typeof obj === 'number' ? obj : null);
  const toDate = v => {
    if(v==null) return null;
    const raw = typeof v === 'object' ? v.raw : v;
    return (typeof raw === 'number') ? new Date(raw*1000) : null;
  };
  const rate = num(summaryDetail.dividendRate);
  const yieldPct = num(summaryDetail.dividendYield);
  const payoutRatio = num(summaryDetail.payoutRatio);
  const fiveYrAvgYield = num(summaryDetail.fiveYearAvgDividendYield);
  const exDivDate = toDate(summaryDetail.exDividendDate) || toDate(calendarEvents?.exDividendDate);
  if(rate==null && yieldPct==null && !exDivDate) return null;
  return {rate, yieldPct, payoutRatio, fiveYrAvgYield, exDivDate};
}
function renderDividendInfo(dividend, currency){
  const box = document.getElementById('fundDividendBox'), badge = document.getElementById('fundDividendBadge');
  if(!box) return;
  if(!dividend){
    box.innerHTML = `<div class="notebox">No dividend data — this ticker may not currently pay a dividend (common for growth-focused companies).</div>`;
    if(badge){ badge.textContent='LIVE — no dividend'; badge.className='badge fact'; }
    return;
  }
  const rows = [
    ['Annual Dividend Rate', dividend.rate!=null ? fmtPrice(dividend.rate, currency)+'/share' : '—'],
    ['Dividend Yield', dividend.yieldPct!=null ? (dividend.yieldPct*100).toFixed(2)+'%' : '—'],
    ['5-Year Average Yield', dividend.fiveYrAvgYield!=null ? dividend.fiveYrAvgYield.toFixed(2)+'%' : '—'], // Yahoo reports this one already as a plain percent, not a decimal fraction
    ['Payout Ratio', dividend.payoutRatio!=null ? (dividend.payoutRatio*100).toFixed(1)+'%' : '—'],
    ['Next Ex-Dividend Date', dividend.exDivDate ? dividend.exDivDate.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}) : '—'],
  ];
  box.innerHTML = kv(rows) + `<div class="notebox" style="margin-top:6px;">Sourced live from Yahoo Finance (same fetch as Key Stats above). A high payout ratio (&gt;80-100%) can signal a dividend that's harder to sustain — not a recommendation, just what the ratio measures.</div>`;
  if(badge){ badge.textContent='LIVE'; badge.className='badge fact'; }
}
async function fetchYahooFundamentalsLive(ySymbol){
  const modules = 'summaryDetail,defaultKeyStatistics,financialData,price,incomeStatementHistory,balanceSheetHistory,calendarEvents';
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ySymbol)}?modules=${modules}`;
  const {res, via} = await fetchViaProxyChain(url);
  const rawText = await res.text();
  let json;
  try{ json = JSON.parse(rawText); }
  catch(e){ throw new Error(`Yahoo returned non-JSON (likely rate-limited/blocked this request) — first 80 chars: "${rawText.slice(0,80).replace(/\s+/g,' ')}"`); }
  // Yahoo's undocumented quoteSummary endpoint has been increasingly requiring a session
  // cookie + "crumb" token for anonymous requests since 2023-24, and can nest an auth error
  // under either quoteSummary.error OR a top-level finance.error depending on which wall it
  // hit — checking only one shape silently misreported real auth failures as "unexpected
  // response" with zero detail. Now checks both and surfaces Yahoo's own error text.
  const err = json?.quoteSummary?.error || json?.finance?.error;
  if(err) throw new Error((err.description || err.code || 'Yahoo Finance error') + ' — this unofficial endpoint sometimes blocks anonymous/proxied requests; it is not something a proxy fix can guarantee around.');
  const r = json?.quoteSummary?.result?.[0];
  if(!r) throw new Error(`Yahoo returned a response with no result for ${ySymbol} (raw keys: ${Object.keys(json||{}).join(',')||'none'}) — likely means this exact symbol isn't covered, or Yahoo throttled this request.`);
  const num = (obj)=> (obj && typeof obj.raw === 'number') ? obj.raw : null; // Yahoo wraps numbers as {raw,fmt}
  const sd = r.summaryDetail || {}, ks = r.defaultKeyStatistics || {}, fd = r.financialData || {}, pr = r.price || {};
  const incHist = r.incomeStatementHistory?.incomeStatementHistory || [];
  const balHist = r.balanceSheetHistory?.balanceSheetHistory || [];
  const out = {
    via, entityName: pr.longName || pr.shortName || ySymbol, currency: pr.currency || sd.currency || 'USD',
    marketCap: num(pr.marketCap) ?? num(sd.marketCap),
    pe: num(sd.trailingPE), forwardPe: num(sd.forwardPE), pegRatio: num(ks.pegRatio),
    priceToBook: num(ks.priceToBook), eps: num(ks.trailingEps),
    profitMargin: num(fd.profitMargins), grossMargin: num(fd.grossMargins), operatingMargin: num(fd.operatingMargins),
    roe: num(fd.returnOnEquity), roa: num(fd.returnOnAssets),
    revenue: num(fd.totalRevenue), revenueGrowth: num(fd.revenueGrowth),
    debtToEquity: num(fd.debtToEquity), currentRatio: num(fd.currentRatio),
    dividendYield: num(sd.dividendYield), beta: num(sd.beta),
    fiftyTwoWkHigh: num(sd.fiftyTwoWeekHigh), fiftyTwoWkLow: num(sd.fiftyTwoWeekLow),
    incomeHistory: incHist.slice(0,2).map(y=>({ totalRevenue: num(y.totalRevenue), netIncome: num(y.netIncome), grossProfit: num(y.grossProfit) })),
    balanceHistory: balHist.slice(0,2).map(y=>({ totalAssets: num(y.totalAssets), totalStockholderEquity: num(y.totalStockholderEquity) })),
    earnings: parseEarningsCalendar(r.calendarEvents),
    analyst: parseAnalystData(fd, ks),
    dividend: parseDividendData(sd, r.calendarEvents),
  };
  const hasAnyRealField = Object.values(out).some(v => typeof v==='number' && v!==0);
  if(!hasAnyRealField) throw new Error('Yahoo Finance returned no populated fundamentals fields for '+ySymbol);
  return out;
}
async function fetchYahooFundamentals(ticker, ySymbol){
  return cachedFetch('yahoofund_'+ticker, 60*60*1000, ()=>fetchYahooFundamentalsLive(ySymbol));
}
