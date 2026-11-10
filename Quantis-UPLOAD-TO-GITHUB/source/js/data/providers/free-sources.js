/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/data/providers/free-sources.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Additional free, verified, browser-reachable (CORS-open) data sources:
 *             • Wikidata         — company facts: founded, HQ, CEO, founders, website, industry, employees, ISIN
 *             • Wikipedia        — company/asset description
 *             • CoinGecko        — full crypto profile (supply, ATH, links, categories, dev & community data)
 *             • DefiLlama        — DeFi TVL by chain/protocol
 *             • Coinbase Exchange— BTC/ETH spot cross-check and candles
 *             • mempool.space    — Bitcoin network fees / hashrate
 *             • open.er-api.com  — 160+ FX reference rates (daily)
 *             • TradingView logo CDN — logos for reports (fetched as blobs, so canvas/PDF stay untainted)
 *           and the SOURCE CATALOGUE (QXSRC.catalogue) rendered in Data Sources and docs.
 * DEPENDS   cachedFetch, fetchWithTimeout, LD
 * EXPOSES   QXFREE.{wikidataCompany, wiki, coingeckoCoin, coingeckoSearch, coingeckoHistory, defillama,
 *                   coinbaseStats, btcNetwork, fxRates, logoDataUrl}
 *           QXSRC.{catalogue, probe(id)}
 * ADDING A SOURCE  1) write a fetcher here (always via cachedFetch with a sensible TTL),
 *                  2) add a catalogue entry with a cheap probe(), 3) use it from a template/feature.
 *                  Only add sources that (a) are free, (b) send Access-Control-Allow-Origin, (c) are
 *                  primary or well-known aggregators. Verified working from a browser: 2026-11-10.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const QXFREE = (() => {
  const J = async (url, opt, ms) => { const r = await fetchWithTimeout(url, opt||{}, ms||12000); if(!r.ok) throw new Error(new URL(url).host+' HTTP '+r.status); return r.json(); };

  /* Wikidata: search entity by company name, then read well-known properties. */
  async function wikidataCompany(name){
    const clean = String(name||'').replace(/\b(Inc|Corp|Corporation|Ltd|Limited|PLC|N\.V\.|SE|AG|S\.A\.|Holdings?|Group|Class [A-C]|Common Stock)\b\.?/gi,'').replace(/[,.]+$/,'').trim();
    return cachedFetch('qxwd2_'+clean.toLowerCase(), 14*864e5, async () => {
      const s = await J(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(clean)}&language=en&type=item&limit=5&format=json&origin=*`);
      const hit = (s.search||[]).find(h => /compan|corporat|conglomerate|bank|manufactur|business|enterprise|group|insurer|retailer|airline|developer/i.test(h.description||'')) || (s.search||[])[0];
      if(!hit) throw new Error('no Wikidata entity');
      const e = (await J(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${hit.id}&props=claims|labels|descriptions|sitelinks&languages=en&format=json&origin=*`)).entities[hit.id];
      const C = e.claims || {};
      const val = p => { const c = (C[p]||[]).find(x=>x.rank==='preferred') || (C[p]||[])[0]; return c && c.mainsnak && c.mainsnak.datavalue ? c.mainsnak.datavalue.value : null; };
      const ids = p => (C[p]||[]).map(c=>c.mainsnak?.datavalue?.value?.id).filter(Boolean).slice(0,4);
      const refIds = [...new Set([].concat(ids('P159'), ids('P169'), ids('P112'), ids('P452'), ids('P17')))];
      let labels = {};
      if(refIds.length){ const L = await J(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${refIds.join('|')}&props=labels&languages=en&format=json&origin=*`); Object.values(L.entities||{}).forEach(x=>labels[x.id] = x.labels?.en?.value); }
      const lab = arr => arr.map(i=>labels[i]).filter(Boolean);
      const time = v => v && v.time ? v.time.replace(/^\+/,'').slice(0,4) : null;
      const qty = v => v && v.amount ? Math.round(+v.amount) : null;
      return {id:hit.id, url:'https://www.wikidata.org/wiki/'+hit.id, label:e.labels?.en?.value, description:e.descriptions?.en?.value,
        founded: time(val('P571')), headquarters: lab(ids('P159')).join(', ') || null, ceo: lab(ids('P169')).join(', ') || null, founders: lab(ids('P112')).join(', ') || null,
        industry: lab(ids('P452')).join(', ') || null, country: lab(ids('P17')).join(', ') || null, website: val('P856'), employees: qty(val('P1128')), isin: val('P946'),
        wikipedia: e.sitelinks?.enwiki ? 'https://en.wikipedia.org/wiki/'+encodeURIComponent(e.sitelinks.enwiki.title.replace(/ /g,'_')) : null};
    });
  }
  async function wiki(title){
    return cachedFetch('qxwk2_'+title, 7*864e5, async () => {
      const s = await J('https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch='+encodeURIComponent(title)+'&format=json&origin=*&srlimit=3');
      const hit = (s?.query?.search||[]).find(h=>!/disambiguation|list of/i.test(h.title)); if(!hit) throw new Error('no article');
      const j = await J('https://en.wikipedia.org/api/rest_v1/page/summary/'+encodeURIComponent(hit.title.replace(/ /g,'_')));
      return {title:j.title, extract:j.extract, url:j.content_urls?.desktop?.page};
    });
  }

  /* CoinGecko (keyless public API; ~10–30 calls/min — everything cached). */
  const CG = 'https://api.coingecko.com/api/v3/';
  const cgKey = () => { const k = (typeof getKey==='function') && getKey('coingecko'); return k ? `&x_cg_demo_api_key=${encodeURIComponent(k)}` : ''; };
  const coingeckoSearch = q => cachedJson('qxcgs_'+q.toLowerCase(), 3600e3, async () => (await J(CG+'search?query='+encodeURIComponent(q)+cgKey())).coins.slice(0,15));
  const coingeckoCoin = id => cachedFetch('qxcgc2_'+id, 10*60e3, () => J(`${CG}coins/${encodeURIComponent(id)}?localization=false&tickers=false&market_data=true&community_data=true&developer_data=true&sparkline=false${cgKey()}`));
  const coingeckoHistory = (id, days=365) => cachedFetch(`qxcgh_${id}_${days}`, 30*60e3, async () => { const j = await J(`${CG}coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=${days}${cgKey()}`); return {t:j.prices.map(p=>p[0]), c:j.prices.map(p=>p[1]), mcap:j.market_caps.map(p=>p[1]), vol:j.total_volumes.map(p=>p[1])}; });
  /* DefiLlama: TVL for a chain or protocol name (best-effort match). */
  const defillama = name => cachedFetch('qxdl_'+String(name).toLowerCase(), 3600e3, async () => {
    const chains = await J('https://api.llama.fi/v2/chains'); const c = chains.find(x => x.name.toLowerCase() === String(name).toLowerCase() || (x.tokenSymbol||'').toLowerCase() === String(name).toLowerCase());
    if(c) return {kind:'chain', name:c.name, tvl:c.tvl, token:c.tokenSymbol};
    const p = await J('https://api.llama.fi/protocol/'+encodeURIComponent(String(name).toLowerCase().replace(/\s+/g,'-'))); return {kind:'protocol', name:p.name, tvl: Array.isArray(p.tvl) && p.tvl.length ? p.tvl[p.tvl.length-1].totalLiquidityUSD : null, category:p.category, chains:p.chains};
  });
  const coinbaseStats = pair => cachedFetch('qxcb_'+pair, 60e3, () => J(`https://api.exchange.coinbase.com/products/${encodeURIComponent(pair)}/stats`));
  const btcNetwork = () => cachedFetch('qxmp', 10*60e3, async () => { const [fees, hr] = await Promise.all([J('https://mempool.space/api/v1/fees/recommended'), J('https://mempool.space/api/v1/mining/hashrate/3d').catch(()=>null)]); return {fees, hashrate: hr && hr.currentHashrate, difficulty: hr && hr.currentDifficulty}; });
  const fxRates = base => cachedFetch('qxer_'+base, 6*3600e3, () => J('https://open.er-api.com/v6/latest/'+encodeURIComponent(base)));

  /* Logo → data URL (PNG). Fetching as a blob keeps the canvas clean so PDF/DOCX/PPTX can embed it. */
  async function logoDataUrl(url, px=160){
    if(!url) return null;
    try{
      const r = await fetchWithTimeout(url, {}, 8000); if(!r.ok) return null;
      const blob = await r.blob(); const obj = URL.createObjectURL(blob);
      const img = await new Promise((res, rej)=>{ const i = new Image(); i.onload = ()=>res(i); i.onerror = rej; i.src = obj; });
      const c = document.createElement('canvas'); c.width = c.height = px; const g = c.getContext('2d');
      const s = Math.min(px/(img.naturalWidth||px), px/(img.naturalHeight||px)); const w = (img.naturalWidth||px)*s, h = (img.naturalHeight||px)*s;
      g.drawImage(img, (px-w)/2, (px-h)/2, w, h); URL.revokeObjectURL(obj);
      return c.toDataURL('image/png');
    }catch(e){ return null; }
  }
  const tvLogoUrl = logoid => logoid ? `https://s3-symbol-logo.tradingview.com/${logoid}--big.svg` : null;
  return {wikidataCompany, wiki, coingeckoSearch, coingeckoCoin, coingeckoHistory, defillama, coinbaseStats, btcNetwork, fxRates, logoDataUrl, tvLogoUrl};
})();

/* ===================== SOURCE CATALOGUE ===================== */
const QXSRC = (() => {
  // key: null = keyless. cors: verified browser-reachable. probe: cheap live check (optional).
  const catalogue = [
    {id:'cnbc', name:'CNBC market data', cat:'Prices & quotes', key:null, scope:'Global stocks, ETFs, indices, FX, commodities, crypto — quotes and bars from 1-minute to monthly', url:'https://www.cnbc.com', probe:()=>LD.quote('AAPL')},
    {id:'tradingview', name:'TradingView screener', cat:'Fundamentals & universe', key:null, scope:'Statements & ratios for ~70k listed companies; stocks, preferreds, ETFs, funds, 166k bonds & debentures, government bonds, futures, option chains with Greeks, 2,400 crypto assets, FX', url:'https://www.tradingview.com/screener/', probe:()=>LD.tvScan('america',{symbols:{tickers:['NASDAQ:AAPL']},columns:['close']})},
    {id:'coingecko', name:'CoinGecko', cat:'Crypto', key:'coingecko', keyOptional:true, scope:'Crypto prices, history, supply, ATH, categories, developer & community data', url:'https://www.coingecko.com/en/api', probe:()=>QXFREE.coingeckoSearch('bitcoin')},
    {id:'defillama', name:'DefiLlama', cat:'Crypto', key:null, scope:'DeFi TVL by chain and protocol', url:'https://defillama.com/docs/api', probe:()=>QXFREE.defillama('Ethereum')},
    {id:'coinbase', name:'Coinbase Exchange', cat:'Crypto', key:null, scope:'Exchange spot stats (cross-check)', url:'https://docs.cdp.coinbase.com/exchange/', probe:()=>QXFREE.coinbaseStats('BTC-USD')},
    {id:'mempool', name:'mempool.space', cat:'Crypto', key:null, scope:'Bitcoin network fees, hashrate, difficulty', url:'https://mempool.space/docs/api', probe:()=>QXFREE.btcNetwork()},
    {id:'wikidata', name:'Wikidata', cat:'Company facts', key:null, scope:'Founded, HQ, CEO, founders, industry, website, ISIN', url:'https://www.wikidata.org', probe:()=>QXFREE.wikidataCompany('Apple')},
    {id:'wikipedia', name:'Wikipedia', cat:'Company facts', key:null, scope:'Descriptions', url:'https://en.wikipedia.org/api/rest_v1/', probe:()=>QXFREE.wiki('Apple Inc')},
    {id:'ecb', name:'Frankfurter (ECB reference rates)', cat:'FX & rates', key:null, scope:'Official ECB FX history', url:'https://frankfurter.dev', probe:()=>fetchWithTimeout('https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR', {}, 8000).then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); })},
    {id:'erapi', name:'ExchangeRate-API (open)', cat:'FX & rates', key:null, scope:'160+ currencies, daily', url:'https://www.exchangerate-api.com/docs/free', probe:()=>QXFREE.fxRates('USD')},
    {id:'worldbank', name:'World Bank Open Data', cat:'Macro', key:null, scope:'GDP, inflation, unemployment, debt by country', url:'https://data.worldbank.org', probe:null},
    {id:'bls', name:'U.S. Bureau of Labor Statistics', cat:'Macro', key:null, scope:'CPI, unemployment', url:'https://www.bls.gov/developers/', probe:null},
    {id:'dbnomics', name:'DBnomics', cat:'Macro', key:null, scope:'IMF/OECD/Eurostat/BIS series mirror', url:'https://db.nomics.world', probe:null},
    {id:'cftc', name:'CFTC Commitments of Traders', cat:'Macro', key:null, scope:'Futures positioning', url:'https://publicreporting.cftc.gov', probe:null},
    {id:'treasury', name:'U.S. Treasury Fiscal Data', cat:'Macro', key:null, scope:'Average interest rates on Treasury debt', url:'https://fiscaldata.treasury.gov/api-documentation/', probe:null},
    {id:'mfapi', name:'mfapi.in (AMFI)', cat:'Funds', key:null, scope:'Every Indian mutual fund scheme with full NAV history', url:'https://www.mfapi.in', probe:()=>fetchWithTimeout('https://api.mfapi.in/mf/search?q=hdfc', {}, 8000)},
    {id:'news', name:'CNBC news search', cat:'News', key:null, scope:'Company and market headlines', url:'https://www.cnbc.com', probe:()=>LD.news('markets')},
    {id:'pollinations', name:'Pollinations AI', cat:'AI', key:null, scope:'Free keyless LLM (open-weight model)', url:'https://pollinations.ai', probe:null},
    {id:'fmp', name:'Financial Modeling Prep', cat:'Statements (your key)', key:'fmp', scope:'Exact annual & quarterly statement line items, global coverage — free 250 calls/day', url:'https://site.financialmodelingprep.com/developer/docs'},
    {id:'alphavantage', name:'Alpha Vantage', cat:'Statements (your key)', key:'alphavantage', scope:'US statements (annual + quarterly), 25 calls/day free', url:'https://www.alphavantage.co/support/#api-key'},
    {id:'finnhub', name:'Finnhub', cat:'Statements (your key)', key:'finnhub', scope:'SEC filings as reported, recommendation trends, insider data — free 60 calls/min', url:'https://finnhub.io/register'},
    {id:'twelvedata', name:'Twelve Data', cat:'Prices (your key)', key:'twelvedata', scope:'Alternative OHLC history', url:'https://twelvedata.com/pricing'},
    {id:'fred', name:'FRED (St. Louis Fed)', cat:'Macro (your key)', key:'fred', scope:'800k US/intl economic series (needs your CORS proxy)', url:'https://fred.stlouisfed.org/docs/api/api_key.html'},
    {id:'groq', name:'Groq', cat:'AI (your key)', key:'groq', scope:'Fast free LLM inference', url:'https://console.groq.com'},
    {id:'gemini', name:'Google Gemini', cat:'AI (your key)', key:'gemini', scope:'Free LLM tier', url:'https://aistudio.google.com/app/apikey'},
    {id:'openrouter', name:'OpenRouter', cat:'AI (your key)', key:'openrouter', scope:'Free open models (":free")', url:'https://openrouter.ai/keys'},
  ];
  async function probe(id){ const s = catalogue.find(x=>x.id===id); if(!s || !s.probe) return {ok:null, msg:'no live probe'}; const t0 = performance.now(); try{ await s.probe(); return {ok:true, ms:Math.round(performance.now()-t0)}; }catch(e){ return {ok:false, msg:e.message}; } }
  return {catalogue, probe};
})();
