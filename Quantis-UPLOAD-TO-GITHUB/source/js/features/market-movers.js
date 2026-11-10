/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/features/market-movers.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Live batch quotes for movers.
 * DEPENDS   data/live-data.js
 * EXPOSES   — (global — classic script, shared scope)
 * LOAD      Classic <script>, order defined in js/manifest.json. Top-level code runs at load,
 *           so it may only call functions from files listed EARLIER in the manifest.
 * NOTE      Migrated verbatim from the single-file build; inline comments marked
 *           "REAL BUG FIXED" / "post-launch fix" document past defects — keep them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* ===================== GLOBAL MARKET MOVERS (live batch quote) =====================
   Previously "Top Movers" only ever sorted the 6-item SAMPLE SECURITIES array by seeded
   |chgPct| — same demo numbers every load, never actually live, with no disclosure that it
   wasn't. This replaces it with a real Yahoo Finance batch quote call (v7/finance/quote, one
   HTTP request for the whole watchlist rather than N separate history fetches) across a curated
   set of liquid tickers spanning multiple exchanges/currencies, so gainers/losers reflect
   today's real prices. Falls back to the old seeded-sample behavior, clearly badged SAMPLE,
   if the live fetch fails for any reason (network, all proxies down, etc.) — never silently
   substitutes fake numbers for real ones. */
const GLOBAL_MOVERS_WATCHLIST = ['AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA','AVGO','JPM','V',
  'RELIANCE','TCS','INFY','HDFCBANK','ICICIBANK', 'TM','SONY','9984.T','7203.T',
  'BABA','TSM','SAP','ASML','NESN.SW','SHEL','AZN.L','HSBA.L','SIE.DE','MC.PA'];
async function fetchYahooQuoteBatchLive(ySymbols){
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(ySymbols.join(','))}`;
  const {res, via} = await fetchViaProxyChain(url);
  const json = await res.json();
  const rows = json?.quoteResponse?.result;
  if(!Array.isArray(rows) || !rows.length) throw new Error('Empty batch quote response');
  return {rows, via};
}
let moversRenderToken = 0;
async function renderGlobalMarketMovers(){
  const box = document.getElementById('moversList');
  const badge = document.getElementById('moversBadge');
  if(!box) return;
  const myToken = ++moversRenderToken;
  try{
    const ySymbols = GLOBAL_MOVERS_WATCHLIST.map(t=> YAHOO_SYMBOL_OVERRIDE[t] || (t.includes('.') ? t : yahooSymbolFor(t)) || t);
    const {rows, via} = await fetchYahooQuoteBatchLive([...new Set(ySymbols)]);
    if(myToken !== moversRenderToken) return;
    const quotes = rows.filter(r=> r.regularMarketChangePercent!=null && r.regularMarketPrice!=null)
      .map(r=>({t: r.symbol, name: r.shortName||r.symbol, chgPct: r.regularMarketChangePercent, px: r.regularMarketPrice, ccy: r.currency||'USD'}));
    if(!quotes.length) throw new Error('No usable quotes in batch response');
    const sorted = [...quotes].sort((a,b)=>b.chgPct-a.chgPct);
    const gainers = sorted.slice(0,4), losers = sorted.slice(-4).reverse();
    const movers = [...gainers, ...losers];
    box.innerHTML = movers.map(s=>`<div class="idxcard" title="${escapeHtml(s.name)}"><div class="nm">${s.t.replace(/\.(NS|T|L|SW|DE|PA)$/,'')}</div><div class="px ${s.chgPct>=0?'up':'down'}">${s.chgPct>=0?'+':''}${s.chgPct.toFixed(2)}%</div></div>`).join('');
    if(badge){ badge.textContent = 'LIVE'; badge.className = 'badge fact'; badge.title = `Yahoo Finance batch quote (${quotes.length}/${GLOBAL_MOVERS_WATCHLIST.length} symbols resolved), via ${via}`; }
  }catch(e){
    if(myToken !== moversRenderToken) return;
    // Fall back to the original seeded-SECURITIES behavior, but now honestly badged.
    const movers = [...SECURITIES].filter(s=>typeof s.chgPct==='number').sort((a,b)=>Math.abs(b.chgPct)-Math.abs(a.chgPct)).slice(0,8);
    box.innerHTML = movers.map(s=>`<div class="idxcard"><div class="nm">${s.t}</div><div class="px ${s.chg>=0?'up':'down'}">${s.chg>=0?'+':''}${s.chgPct.toFixed(2)}%</div></div>`).join('');
    if(badge){ badge.textContent = 'SAMPLE'; badge.className = 'badge assume'; badge.title = `Live batch quote failed: ${e.message}`; }
  }
}
function parseYahooChart(json, ticker){
  const result = json?.chart?.result?.[0];
  const err = json?.chart?.error;
  if(err) throw new Error(err.description || 'Yahoo Finance error');
  if(!result || !result.meta) throw new Error('Unexpected Yahoo Finance response for '+ticker);
  const meta = result.meta;
  const ts = result.timestamp || [];
  const q = result.indicators?.quote?.[0] || {};
  const closes = q.close || [];
  const labels = [], data = [], opens = [], highs = [], lows = [];
  for(let i=0;i<ts.length;i++){
    if(closes[i]==null) continue;
    labels.push(new Date(ts[i]*1000).toISOString().slice(0,10));
    data.push(closes[i]); opens.push(q.open?.[i] ?? closes[i]); highs.push(q.high?.[i] ?? closes[i]); lows.push(q.low?.[i] ?? closes[i]);
  }
  if(data.length < 5) throw new Error('Too little Yahoo Finance history for '+ticker);
  const lastClose = meta.regularMarketPrice ?? data[data.length-1];
  const prevClose = meta.previousClose ?? meta.chartPreviousClose ?? data[data.length-2];
  return {labels, data, ohlc:{open:opens, high:highs, low:lows, close:data},
    lastDate: labels[labels.length-1], lastClose, prevClose, currency: meta.currency || 'USD'};
}
async function fetchYahooHistoryLive(ticker, ySymbol){
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ySymbol)}?range=10y&interval=1d`; // was range=1y — the direct cause of "technicals only look at ~1 year" even for global (non-Stooq) tickers
  const {res, via} = await fetchViaProxyChain(url);
  const json = await res.json();
  const parsed = parseYahooChart(json, ySymbol);
  parsed.via = via;
  return parsed;
}
/* Universal daily history. Name kept for its ~15 call sites. CNBC's chart service (keyless,
   CORS-open, ~10 years of split-adjusted daily OHLC) covers all 201 instruments in the universe;
   Yahoo is only attempted when the user has configured their own proxy. */
async function fetchYahooHistory(ticker, ySymbol){
  const known = SECURITY_UNIVERSE.some(x=>x.t===ticker) || SECURITIES.some(x=>x.t===ticker);
  const cn = LD.cnbcSymbol(ticker) || (!known && /^[A-Z0-9.\-]{1,12}$/i.test(ticker) ? ticker.toUpperCase() : null);
  let firstErr = null;
  if(cn){
    try{
      const h = await LD.bars(cn, 10);
      const sec = SECURITIES.find(x=>x.t===ticker);
      return {...h, currency: (sec && sec.ccy) || 'USD', via: 'CNBC', cnbcSymbol: cn};
    }catch(e){ firstErr = e; }
  }
  if(ySymbol && getCustomProxy()){
    return cachedFetch('yahoo_'+ticker, 15*60*1000, ()=>fetchYahooHistoryLive(ticker, ySymbol));
  }
  throw firstErr || new Error('no live price source is mapped for '+ticker);
}
