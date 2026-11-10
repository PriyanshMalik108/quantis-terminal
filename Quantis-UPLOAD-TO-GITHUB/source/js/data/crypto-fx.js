/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/data/crypto-fx.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   CoinGecko crypto and ECB/Frankfurter FX history.
 * DEPENDS   core/*
 * EXPOSES   fetchCoinGeckoHistory, fetchFrankfurterHistory, COINGECKO_ID (global — classic script, shared scope)
 * LOAD      Classic <script>, order defined in js/manifest.json. Top-level code runs at load,
 *           so it may only call functions from files listed EARLIER in the manifest.
 * NOTE      Migrated verbatim from the single-file build; inline comments marked
 *           "REAL BUG FIXED" / "post-launch fix" document past defects — keep them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* ===================== CoinGecko (crypto) + Frankfurter/ECB (FX) — direct, keyless, CORS-
   enabled sources, no proxy needed at all ===================================================
   These two were already used for the small header market-pulse ticker, but every crypto/FX
   SECURITY selected in Research still fell through to the generic Yahoo-via-proxy path like
   everything else — meaning the one asset class that had a genuinely zero-setup, always-on
   free source available wasn't actually using it for its main chart. Fixed: these are now tried
   FIRST for Crypto/FX tickers, ahead of Yahoo, so those two categories work with no proxy
   dependency whatsoever, proxy configured or not. */
const COINGECKO_ID = {BTC:'bitcoin',ETH:'ethereum',SOL:'solana',XRP:'ripple',ADA:'cardano',DOGE:'dogecoin',BNB:'binancecoin',AVAX:'avalanche-2',DOT:'polkadot',LTC:'litecoin'};
async function fetchCoinGeckoHistoryLive(ticker){
  const id = COINGECKO_ID[ticker];
  if(!id) throw new Error('No CoinGecko id mapped for '+ticker);
  const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=365&interval=daily`;
  const res = await fetchWithTimeout(url, {mode:'cors'}, 8000); // direct — no proxy chain, CoinGecko supports CORS natively
  if(!res.ok) throw new Error('HTTP '+res.status+(res.status===429?' (CoinGecko free-tier rate limit — wait a minute and retry)':''));
  const j = await res.json();
  const prices = j.prices || []; // [[ms, price], ...]
  if(prices.length < 10) throw new Error('CoinGecko returned too little history');
  const labels = prices.map(p=>new Date(p[0]).toISOString().slice(0,10));
  const data = prices.map(p=>p[1]);
  return {labels, data, ohlc:{open:data,high:data,low:data,close:data}, lastClose:data[data.length-1], prevClose:data[data.length-2], lastDate:labels[labels.length-1], cacheStatus:'fresh', cachedAt:'just now', via:'CoinGecko (direct)'};
}
async function fetchCoinGeckoHistory(ticker){
  return cachedFetch('coingecko_'+ticker, 5*60*1000, ()=>fetchCoinGeckoHistoryLive(ticker));
}
async function fetchCoinGeckoProfileLive(ticker){
  const id = COINGECKO_ID[ticker];
  if(!id) throw new Error('No CoinGecko id mapped for '+ticker);
  const url = `https://api.coingecko.com/api/v3/coins/${id}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`;
  const res = await fetchWithTimeout(url, {mode:'cors'}, 8000); // direct — CoinGecko supports CORS natively, same as the price fetch
  if(!res.ok) throw new Error('HTTP '+res.status+(res.status===429?' (CoinGecko free-tier rate limit — wait a minute and retry)':''));
  const j = await res.json();
  const md = j.market_data || {};
  return {
    marketCap: md.market_cap?.usd, rank: j.market_cap_rank,
    athUsd: md.ath?.usd, athDate: md.ath_date?.usd,
    circulating: md.circulating_supply, total: md.total_supply, max: md.max_supply,
  };
}
async function fetchCoinGeckoProfile(ticker){
  return cachedFetch('coingeckoprofile_'+ticker, 5*60*1000, ()=>fetchCoinGeckoProfileLive(ticker));
}
async function fetchFrankfurterHistoryLive(ticker){
  // Tickers here are formatted like 'EURUSD' — split into base/quote (always 3+3 chars).
  const base = ticker.slice(0,3), quote = ticker.slice(3,6);
  if(base.length!==3 || quote.length!==3) throw new Error('Unexpected FX ticker format: '+ticker);
  const end = new Date().toISOString().slice(0,10);
  const startDate = new Date(); startDate.setFullYear(startDate.getFullYear()-2);
  const start = startDate.toISOString().slice(0,10);
  const url = `https://api.frankfurter.dev/v1/${start}..${end}?base=${base}&symbols=${quote}`;
  const res = await fetchWithTimeout(url, {mode:'cors'}, 8000); // direct — Frankfurter supports CORS natively
  if(!res.ok) throw new Error('HTTP '+res.status);
  const j = await res.json();
  const rates = j.rates || {};
  const dates = Object.keys(rates).sort();
  if(dates.length < 10) throw new Error('Frankfurter returned too little history for '+base+'/'+quote);
  const data = dates.map(d=>rates[d][quote]);
  return {labels:dates, data, ohlc:{open:data,high:data,low:data,close:data}, lastClose:data[data.length-1], prevClose:data[data.length-2], lastDate:dates[dates.length-1], cacheStatus:'fresh', cachedAt:'just now', via:'Frankfurter/ECB (direct)'};
}
async function fetchFrankfurterHistory(ticker){
  return cachedFetch('frankfurter_'+ticker, 15*60*1000, ()=>fetchFrankfurterHistoryLive(ticker));
}
/* Real currency conversion for cross-currency comparisons — was completely absent: the Compare
   tool showed raw native-currency prices/market caps side by side (e.g. AAPL's $227 next to
   TCS's ₹3,820) with only a small, easy-to-miss "Currency" row disclosing the mismatch. Uses
   the same direct, keyless, CORS-enabled Frankfurter/ECB endpoint already proven for FX
   securities — a real spot rate, not an assumed/hardcoded one. */
/* REAL BUG FIXED HERE: cachedFetch() (used by ~20 other fetchers throughout this app) is built
   to wrap fetch functions that return an OBJECT — it does {...result, cacheStatus, cachedAt} to
   attach cache metadata. This function's fetchFn was returning a bare NUMBER (the rate itself).
   Spreading a primitive number with {...number} silently produces an EMPTY object (numbers have
   no enumerable own properties) — so every call to getFxRateToUsd() was returning {cacheStatus,
   cachedAt} with the actual rate discarded, and any caller doing rate.toFixed(...) or using the
   rate in arithmetic would get NaN or a hard crash. Found via a regression test for the new
   Currency Converter below (which had the identical bug, also fixed) — same fetchFn now returns
   {rate, via}, matching the object-shape convention every other cachedFetch() call in this app
   already follows, and getFxRateToUsd() unwraps .rate for its own simpler return contract. */
async function getFxRateToUsd(ccy){
  if(ccy === 'USD') return 1;
  if(ccy === 'GBp' || ccy === 'GBX') return (await getFxRateToUsd('GBP'))/100; // pence
  const result = await cachedFetch('fxrate_'+ccy+'_USD', 60*60*1000, async ()=>{
    const res = await fetchWithTimeout(`https://api.frankfurter.dev/v1/latest?base=${ccy}&symbols=USD`, {mode:'cors'}, 8000);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const j = await res.json();
    const rate = j.rates?.USD;
    if(rate==null) throw new Error('No USD rate returned for '+ccy);
    return {rate, via:'Frankfurter/ECB'};
  });
  return result.rate;
}
/* NEW FEATURE: Currency Converter — a genuinely useful standalone tool (not just the internal
   cross-currency helper above) for anyone checking "what's $100 in rupees right now" without
   leaving the terminal. Reuses the same direct, keyless, CORS-enabled Frankfurter/ECB endpoint
   already proven elsewhere in this app — real live spot rates, cached 15 minutes (Frankfurter
   itself only updates once/day on ECB business days, so more-frequent polling wouldn't get
   fresher data anyway). */
let fxConvToken = 0;
async function runCurrencyConvert(){
  const myToken = ++fxConvToken;
  const resultEl = document.getElementById('fxConvResult');
  const amount = parseFloat(document.getElementById('fxConvAmount').value);
  const from = document.getElementById('fxConvFrom').value;
  const to = document.getElementById('fxConvTo').value;
  if(isNaN(amount) || amount<0){ resultEl.innerHTML = `<span style="color:var(--down);font-size:12px;">Enter a valid amount.</span>`; return; }
  if(from === to){ resultEl.innerHTML = `${amount.toLocaleString()} ${from} = ${amount.toLocaleString()} ${to} <span style="font-size:11px;color:var(--text-2);font-weight:400;">(same currency)</span>`; return; }
  resultEl.innerHTML = `<span style="font-size:12px;color:var(--text-2);font-weight:400;">Converting…</span>`;
  try{
    const cfResult = await cachedFetch(`fxconv_${from}_${to}`, 15*60*1000, async ()=>{
      const res = await fetchWithTimeout(`https://api.frankfurter.dev/v1/latest?base=${from}&symbols=${to}`, {mode:'cors'}, 8000);
      if(!res.ok) throw new Error('HTTP '+res.status);
      const j = await res.json();
      const r = j.rates?.[to];
      if(r==null) throw new Error(`No ${to} rate returned for ${from}`);
      return {rate: r, via:'Frankfurter/ECB'}; // object shape, not a bare number — see getFxRateToUsd's comment above for why that matters with cachedFetch()
    });
    const rate = cfResult.rate;
    if(myToken !== fxConvToken) return; // a newer conversion request superseded this one
    const converted = amount*rate;
    resultEl.innerHTML = `${amount.toLocaleString()} ${from} = <span class="up">${converted.toLocaleString(undefined,{maximumFractionDigits:2})} ${to}</span> <span style="font-size:11px;color:var(--text-2);font-weight:400;">(1 ${from} = ${rate.toFixed(4)} ${to}, live via Frankfurter/ECB)</span>`;
  }catch(e){
    if(myToken !== fxConvToken) return;
    const fFrom = FX_FALLBACK_TO_USD[from], fTo = FX_FALLBACK_TO_USD[to];
    if(fFrom && fTo){
      const rate = fFrom/fTo, converted = amount*rate;
      resultEl.innerHTML = `${amount.toLocaleString()} ${from} ≈ <span style="color:var(--amber)">${converted.toLocaleString(undefined,{maximumFractionDigits:2})} ${to}</span> <span style="font-size:11px;color:var(--text-2);font-weight:400;">(approximate offline rate 1 ${from} ≈ ${rate.toFixed(4)} ${to} — live ECB rate unreachable)</span>`;
    } else {
      resultEl.innerHTML = `<span style="color:var(--down);font-size:12px;">Conversion failed: ${escapeHtml(e.message)}</span>`;
    }
  }
}
/* SEC EDGAR XBRL Company Facts — free, keyless, official, but confirmed by SEC.gov itself
   to NOT support CORS, so it uses the same proxy chain as Stooq. Only wired for the four
   US sample tickers with known CIKs; everything else stays sample until a ticker->CIK
   lookup (also needs a proxy — sec.gov/files/company_tickers.json) is added. */
/* Expanded from 4 to ~50 real US tickers — every CIK below was cross-checked directly against
   SEC's own https://www.sec.gov/files/company_tickers.json (fetched and verified, not
   guessed/recalled), since a wrong CIK here wouldn't just fail gracefully, it would silently
   pull a stranger company's financials under the wrong ticker. This is the ACTUAL fix for
   "fundamentals inaccurate/sample only" for this set of companies — real filed 10-K figures,
   not sample data — and combined with the local mirror below, works with zero dependency on
   the proxy chain or your Cloudflare Worker for these specific tickers. */
const SEC_CIK = {
  AAPL:'0000320193', MSFT:'0000789019', NVDA:'0001045810', AMZN:'0001018724',
  GOOGL:'0001652044', GOOG:'0001652044', AVGO:'0001730168', META:'0001326801', TSLA:'0001318605',
  'BRK.B':'0001067983', LLY:'0000059478', WMT:'0000104169', JPM:'0000019617', V:'0001403161',
  ORCL:'0001341439', XOM:'0000034088', JNJ:'0000200406', MA:'0001141391', NFLX:'0001065280',
  COST:'0000909832', BAC:'0000070858', PG:'0000080424', HD:'0000354950', GE:'0000040545',
  KO:'0000021344', CVX:'0000093410', ABNB:'0001559720', PDD:'0001737806', ADBE:'0000796343',
  UBER:'0001543151', CSCO:'0000858877', INTC:'0000050863', IBM:'0000051143', DIS:'0001744489',
  BA:'0000012927', GS:'0000886982', MS:'0000895421', C:'0000831001', WFC:'0000072971',
  CAT:'0000018230', GM:'0001467858', F:'0000037996', PFE:'0000078003', PEP:'0000077476',
  T:'0000732717', VZ:'0000732712', NKE:'0000320187', SBUX:'0000829224', QCOM:'0000804328',
  TXN:'0000097476', UNH:'0000731766', PYPL:'0001633917', BABA:'0001577552'
};
/* SEC coverage was hardcoded to exactly the ~50 tickers above — every other US-listed company
   (thousands of them) silently fell to "No CIK mapped for X yet" and stayed sample, even though
   real SEC EDGAR data exists for practically all of them. Hand-adding more individual CIKs risks
   exactly the failure mode already guarded against elsewhere in this file: a wrong/guessed CIK
   would silently pull a DIFFERENT real company's real financials under the wrong ticker, which is
   worse than sample data. The actual fix is to look CIKs up, not guess them: SEC itself publishes
   a complete, authoritative ticker->CIK mapping for every registrant, free and keyless, at
   www.sec.gov/files/company_tickers.json. Fetching that once (cached 24h) and consulting it as a
   fallback after the verified built-in map extends real coverage to virtually every US ticker
   without ever hand-typing an unverified CIK. */
async function fetchSecTickerMapLive(){
  const url = 'https://www.sec.gov/files/company_tickers.json';
  const {res, via} = await fetchViaProxyChain(url, {'User-Agent':'Quantis-Terminal-Research contact@example.com'});
  const json = await res.json();
  const map = {};
  Object.values(json).forEach(entry=>{
    if(entry && entry.ticker && entry.cik_str!=null) map[String(entry.ticker).toUpperCase()] = String(entry.cik_str).padStart(10,'0');
  });
  return {map, via};
}
async function fetchSecTickerMap(){
  return cachedFetch('sec_ticker_map_v1', 24*60*60*1000, fetchSecTickerMapLive);
}
/* Company Profile (Wikipedia) — free, keyless, and genuinely CORS-open (Wikipedia's REST API
   sends Access-Control-Allow-Origin: * on this endpoint, so this typically succeeds on the
   direct/no-proxy attempt even without a CORS worker configured — unlike SEC/Yahoo elsewhere in
   this app). Looked up by the company's real name (never a guessed URL slug), and a
   disambiguation-page response is treated as a genuine miss rather than shown as if it were the
   right company. */
async function fetchWikipediaSummaryLive(title){
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g,'_'))}`;
  const {res, via} = await fetchViaProxyChain(url);
  const json = await res.json();
  if(json.type === 'disambiguation') throw new Error(`"${title}" is ambiguous on Wikipedia (multiple pages share this name)`);
  if(!json.extract) throw new Error('no summary text returned');
  return {title: json.title, extract: json.extract, thumbnail: json.thumbnail?.source, pageUrl: json.content_urls?.desktop?.page, via};
}
async function fetchWikipediaSummary(companyName){
  return cachedFetch('wiki_'+companyName, 24*60*60*1000, ()=>fetchWikipediaSummaryLive(companyName));
}
let wikiRenderToken = 0;
async function renderCompanyProfile(companyName){
  const myToken = ++wikiRenderToken;
  const box = document.getElementById('fundWikiBox'), badge = document.getElementById('fundWikiBadge');
  if(!box) return;
  try{
    const w = await fetchWikipediaSummary(companyName);
    if(myToken !== wikiRenderToken) return;
    box.innerHTML = `<div style="display:flex;gap:12px;align-items:flex-start;">
      ${w.thumbnail?`<img src="${escapeHtml(w.thumbnail)}" style="width:64px;height:64px;object-fit:cover;border-radius:6px;flex-shrink:0;" loading="lazy">`:''}
      <div><div style="font-size:13px;line-height:1.55;color:var(--text-1);">${escapeHtml(w.extract)}</div>
      <a href="${escapeHtml(w.pageUrl)}" target="_blank" rel="noopener" style="color:var(--teal);font-size:11px;">Read more on Wikipedia →</a></div>
    </div>`;
    if(badge){ badge.textContent='LIVE'; badge.className='badge fact'; }
  }catch(e){
    if(myToken !== wikiRenderToken) return;
    box.innerHTML = `<div class="notebox">Couldn't fetch a Wikipedia summary for "${companyName}" (${escapeHtml(e.message)}).</div>`;
  }
}

async function resolveCik(ticker){
  if(SEC_CIK[ticker]) return {cik: SEC_CIK[ticker], via: 'built-in verified mapping'};
  try{
    const {map} = await fetchSecTickerMap();
    const clean = ticker.replace('.', '-'); // SEC's file uses e.g. BRK-B, this app uses BRK.B
    if(map[ticker]) return {cik: map[ticker], via: "SEC's official company_tickers.json (looked up live)"};
    if(map[clean]) return {cik: map[clean], via: "SEC's official company_tickers.json (looked up live)"};
  }catch(e){ /* ticker map fetch failed — caller reports "no CIK" same as before */ }
  return null;
}
/* Insider trading (Form 4) — was entirely absent. Every Form 4 (an insider's real, legally-
   mandated disclosure of buying/selling their own company's stock) is public and free on SEC
   EDGAR, no license needed — the same trust tier as the SEC fundamentals already wired in above.
   Two real fetches: (1) an Atom feed listing recent Form 4 filings for this CIK as issuer; (2)
   for the most recent few, the filing's own index page to find the actual Form 4 XML document,
   then that XML parsed for the real transaction (code, shares, price). Per-filing failures never
   block the rest — a filing that can't be parsed still shows with a link to view it directly. */
const TRANSACTION_CODE_LABELS = {
  P:'Open-market Purchase', S:'Open-market Sale', A:'Grant/Award', D:'Disposition (other)',
  M:'Option Exercise', F:'Tax Withholding', G:'Gift', C:'Conversion', X:'Option Exercise (in-the-money)',
};
async function fetchInsiderFilingListLive(cik){
  const url = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=4&dateb=&owner=include&count=15&output=atom`;
  const {res, via} = await fetchViaProxyChain(url, {'User-Agent':'Quantis-Terminal-Research contact@example.com'});
  const xmlText = await res.text();
  const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
  if(doc.querySelector('parsererror')) throw new Error('Insider filing feed did not parse as XML');
  const entries = Array.from(doc.querySelectorAll('entry')).slice(0,15).map(entry=>{
    const title = (entry.querySelector('title')?.textContent || '').trim();
    const link = entry.querySelector('link')?.getAttribute('href') || '';
    const updated = entry.querySelector('updated')?.textContent || '';
    const nameMatch = title.match(/^4\s*-\s*(.+?)\s*\(\d+\)/i);
    return {name: nameMatch ? nameMatch[1] : title.replace(/^4\s*-\s*/i,''), indexUrl: link, date: updated ? new Date(updated) : null};
  }).filter(e=>e.indexUrl);
  return {entries, via};
}
async function fetchForm4DetailLive(indexUrl){
  const {res: idxRes} = await fetchViaProxyChain(indexUrl, {'User-Agent':'Quantis-Terminal-Research contact@example.com'});
  const html = await idxRes.text();
  const match = html.match(/href="([^"]+\.xml)"/i);
  if(!match) throw new Error('no XML document found in filing index');
  let xmlUrl = match[1];
  if(xmlUrl.startsWith('/')) xmlUrl = 'https://www.sec.gov'+xmlUrl;
  const {res: xmlRes} = await fetchViaProxyChain(xmlUrl, {'User-Agent':'Quantis-Terminal-Research contact@example.com'});
  const xmlText = await xmlRes.text();
  const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
  if(doc.querySelector('parsererror')) throw new Error('Form 4 XML did not parse');
  const getTxt = sel => doc.querySelector(sel)?.textContent?.trim() || null;
  const isDirector = getTxt('reportingOwner isDirector') === '1' || getTxt('isDirector')==='1';
  const isOfficer = getTxt('reportingOwner isOfficer') === '1' || getTxt('isOfficer')==='1';
  const officerTitle = getTxt('reportingOwner officerTitle') || getTxt('officerTitle');
  const role = officerTitle || (isDirector ? 'Director' : isOfficer ? 'Officer' : null);
  const transactions = Array.from(doc.querySelectorAll('nonDerivativeTransaction')).map(t=>{
    const code = t.querySelector('transactionCoding transactionCode')?.textContent?.trim();
    const shares = parseFloat(t.querySelector('transactionAmounts transactionShares value')?.textContent);
    const price = parseFloat(t.querySelector('transactionAmounts transactionPricePerShare value')?.textContent);
    const acqDisp = t.querySelector('transactionAmounts transactionAcquiredDisposedCode value')?.textContent?.trim();
    const sharesAfter = parseFloat(t.querySelector('postTransactionAmounts sharesOwnedFollowingTransaction value')?.textContent);
    const date = t.querySelector('transactionDate value')?.textContent?.trim();
    return {code, shares: isNaN(shares)?null:shares, price: isNaN(price)?null:price, acqDisp, sharesAfter: isNaN(sharesAfter)?null:sharesAfter, date};
  }).filter(t=>t.code);
  return {role, transactions};
}
let insiderRenderToken = 0;
async function fetchFinnhubInsidersLive(ticker, key){
  const res = await fetchWithTimeout(`https://finnhub.io/api/v1/stock/insider-transactions?symbol=${encodeURIComponent(ticker)}&token=${encodeURIComponent(key)}`, {mode:'cors'}, 12000);
  if(!res.ok) throw new Error('Finnhub HTTP '+res.status+(res.status===401||res.status===403?' — check the key in Settings':''));
  const j = await res.json();
  return (j.data||[]).sort((a,b)=>String(b.transactionDate).localeCompare(String(a.transactionDate)));
}
const INSIDER_CODE = {P:'Open-market purchase', S:'Open-market sale', M:'Option exercise', A:'Grant / award', G:'Gift', F:'Tax withholding', D:'Disposition to issuer', C:'Conversion', X:'Option exercise', J:'Other'};
async function renderInsiderTrading(ticker){
  const myToken = ++insiderRenderToken;
  const box = document.getElementById('fundInsiderBox'), badge = document.getElementById('fundInsiderBadge');
  if(!box) return;
  const sec = SECURITIES.find(x=>x.t===ticker);
  const usListed = sec && ['NASDAQ','NYSE','NYSE Arca','Cboe','OTC'].includes(sec.ex);
  const fkey = getKey('finnhub');
  if(fkey && usListed){
    try{
      const rows = await cachedFetch('fh_insider_'+ticker, 6*60*60*1000, async()=>({list: await fetchFinnhubInsidersLive(ticker, fkey)}));
      if(myToken !== insiderRenderToken) return;
      const list = (rows.list||[]).slice(0, 15);
      if(!list.length){ box.innerHTML = `<div class="notebox">No insider transactions reported for ${escapeHtml(ticker)} recently.</div>`; }
      else{
        const buys = list.filter(r=>r.transactionCode==='P').reduce((a,r)=>a+(r.change||0),0), sells = list.filter(r=>r.transactionCode==='S').reduce((a,r)=>a+(r.change||0),0);
        box.innerHTML = table(['Date','Insider','Type','Shares','Price'], list.map(r=>[r.transactionDate||'—', escapeHtml(r.name||'—'), INSIDER_CODE[r.transactionCode]||escapeHtml(r.transactionCode||'—'),
          `<span class="${(r.change||0)>=0?'up':'down'}">${(r.change||0)>=0?'+':''}${(r.change||0).toLocaleString()}</span>`, r.transactionPrice ? fmtPrice(r.transactionPrice, 'USD') : '—']))
          + `<div class="notebox" style="margin-top:6px;">Open-market net over these filings: purchases ${buys.toLocaleString()} sh, sales ${sells.toLocaleString()} sh. Source: Finnhub (SEC Form 4).</div>`;
      }
      if(badge){ badge.textContent='LIVE'; badge.className='badge fact'; }
      return;
    }catch(e){
      if(!getCustomProxy()){ box.innerHTML = `<div class="notebox">Insider data unavailable: ${escapeHtml(e.message)}</div>`; if(badge){ badge.textContent='UNAVAILABLE'; badge.className='badge assume'; } return; }
    }
  }
  if(!getCustomProxy()){
    box.innerHTML = usListed
      ? `<div class="notebox">Insider (Form 4) filings come from SEC EDGAR, which doesn't allow direct browser requests. Add a free <b>Finnhub</b> key in Settings (finnhub.io — instant, no card) to load ${escapeHtml(ticker)}'s insider buys and sells here.</div>`
      : `<div class="notebox">Insider-transaction filings are only available for US-listed companies (SEC Form 4).</div>`;
    if(badge){ badge.textContent = usListed ? 'FREE KEY' : 'N/A'; badge.className='badge assume'; }
    return;
  }
  try{
    const resolved = await resolveCik(ticker);
    if(!resolved) throw new Error('No CIK resolvable for '+ticker);
    const cikNum = String(parseInt(resolved.cik,10)); // browse-edgar wants the CIK without leading zeros
    const {entries, via} = await cachedFetch('insider_list_'+ticker, 4*60*60*1000, ()=>fetchInsiderFilingListLive(cikNum));
    if(myToken !== insiderRenderToken) return;
    if(!entries.length){
      box.innerHTML = `<div class="notebox">No Form 4 filings found for ${ticker} in SEC EDGAR's recent index.</div>`;
      return;
    }
    box.innerHTML = `<div class="notebox">Fetching transaction details for the ${Math.min(6,entries.length)} most recent filings…</div>`;
    const detailed = await Promise.all(entries.slice(0,6).map(async e=>{
      try{
        const d = await cachedFetch('insider_detail_'+e.indexUrl, 24*60*60*1000, ()=>fetchForm4DetailLive(e.indexUrl));
        return {...e, ...d, detailOk:true};
      }catch(err){ return {...e, detailOk:false, detailError: err.message}; }
    }));
    if(myToken !== insiderRenderToken) return;
    const rows = [];
    detailed.forEach(e=>{
      const dateStr = e.date ? e.date.toLocaleDateString() : '—';
      if(e.detailOk && e.transactions.length){
        e.transactions.forEach(t=>{
          const codeLabel = TRANSACTION_CODE_LABELS[t.code] || t.code || '—';
          const valueStr = (t.shares!=null && t.price!=null) ? '$'+Math.round(t.shares*t.price).toLocaleString() : '—';
          rows.push([escapeHtml(e.name) + (e.role?` (${escapeHtml(e.role)})`:''), t.date||dateStr, codeLabel, t.shares!=null?t.shares.toLocaleString():'—', t.price!=null?'$'+t.price.toFixed(2):'—', valueStr, `<a href="${escapeHtml(e.indexUrl)}" target="_blank" rel="noopener" style="color:var(--teal);">View filing</a>`]);
        });
      } else {
        rows.push([escapeHtml(e.name), dateStr, 'Filed (detail unavailable)', '—', '—', '—', `<a href="${escapeHtml(e.indexUrl)}" target="_blank" rel="noopener" style="color:var(--teal);">View filing</a>`]);
      }
    });
    box.innerHTML = table(['Insider','Date','Transaction','Shares','Price','Value',''], rows)
      + `<div class="notebox" style="margin-top:8px;">Real Form 4 filings from SEC EDGAR (via ${via}) — the same disclosures the SEC legally requires from company insiders. "Value" is shares × reported price per share, not always the full dollar amount of a complex transaction. Grants/awards (code A) and option exercises (M/X) aren't open-market buy/sell signals the way P (purchase) and S (sale) are.</div>`;
    if(badge){ badge.textContent='LIVE'; badge.className='badge fact'; }
  }catch(e){
    if(myToken !== insiderRenderToken) return;
    box.innerHTML = `<div class="notebox">Couldn't fetch insider filings for ${ticker}: ${escapeHtml(e.message)}. ${/No CIK/.test(e.message) ? 'SEC EDGAR only covers US-listed registrants.' : 'data.sec.gov/www.sec.gov may need your proxy worker — see Data Sources.'}</div>`;
  }
}

function pickAnnualUsGaap(facts, tag, years=10){
  try{
    const units = facts.facts['us-gaap'][tag].units.USD;
    const annual = units.filter(u=>u.form==='10-K' && u.fp==='FY').sort((a,b)=>b.end.localeCompare(a.end));
    // XBRL companyfacts often contains the SAME fiscal year filed more than once (a 10-K reports
    // both the current year and prior-year comparatives, and restatements re-report old years) —
    // without deduping by fiscal-year-end, "10 years" could actually be 5-6 real years with
    // duplicates, which is exactly the kind of inaccuracy being reported. Keep only the first
    // (i.e. most recently FILED, so most authoritative/restated) entry per distinct end date.
    const seen = new Set(); const deduped = [];
    for(const u of annual){ if(!seen.has(u.end)){ seen.add(u.end); deduped.push(u); } }
    return deduped.slice(0,years).reverse(); // oldest first, to match the table layout
  }catch(e){ return []; }
}
async function fetchSecFundamentalsLive(ticker){
  const resolved = await resolveCik(ticker);
  if(!resolved) throw new Error('No CIK found for '+ticker+' — checked the built-in verified list and SEC\'s own official company_tickers.json');
  const cik = resolved.cik;
  // Same-origin mirror check FIRST (see .github/workflows/update-sec-facts.yml, shipped
  // alongside this file) — a scheduled job fetches every mapped ticker's real SEC companyfacts
  // JSON server-side and commits it to data/sec/{TICKER}.json. Reading that back from this
  // page's own origin has zero CORS exposure, so it works even with no proxy/worker configured
  // at all. Only the built-in verified tickers are pre-mirrored this way; tickers resolved via
  // the live SEC ticker-map lookup fall straight to the proxy chain below.
  let facts = null, via = null;
  if(resolved.via === 'built-in verified mapping'){
    try{
      const localRes = await fetch(`data/sec/${ticker}.json`, {cache:'no-store'});
      if(localRes.ok){ facts = await localRes.json(); via = 'same-origin mirror'; }
    }catch(e){ /* mirror not deployed yet — fall through below */ }
  }
  if(!facts){
    const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
    // SEC requires a descriptive User-Agent with contact info; browsers block custom UA headers on
    // direct fetches, so this only really takes effect once routed through your own proxy worker
    // (the shipped worker template already forwards a compliant header).
    const r = await fetchViaProxyChain(url, {'User-Agent':'Quantis-Terminal-Research contact@example.com'});
    facts = await r.res.json(); via = r.via + (resolved.via!=='built-in verified mapping' ? ' + '+resolved.via : '');
  }
  const revenue = pickAnnualUsGaap(facts, 'Revenues').length ? pickAnnualUsGaap(facts,'Revenues') : pickAnnualUsGaap(facts,'RevenueFromContractWithCustomerExcludingAssessedTax');
  const netIncome = pickAnnualUsGaap(facts, 'NetIncomeLoss');
  const eps = pickAnnualUsGaap(facts, 'EarningsPerShareDiluted');
  const grossProfit = pickAnnualUsGaap(facts, 'GrossProfit');
  const equity = pickAnnualUsGaap(facts, 'StockholdersEquity');
  const assets = pickAnnualUsGaap(facts, 'Assets');
  if(!revenue.length && !netIncome.length) throw new Error('No matching XBRL facts found');
  // Balance Sheet + Cash Flow tags — these were already being fetched for equity/assets above but
  // never rendered anywhere (Balance Sheet/Cash Flow cards stayed hardcoded SAMPLE with a note
  // saying "pending fuller XBRL tag mapping"). Adding the remaining tags needed for both real
  // statements, plus the two Cash Flow lines (OCF, CapEx) needed to auto-populate the DCF's FCF0
  // input from real filed data instead of a manually-typed sample number.
  const liabilities = pickAnnualUsGaap(facts, 'Liabilities');
  const cash = pickAnnualUsGaap(facts, 'CashAndCashEquivalentsAtCarryingValue').length ? pickAnnualUsGaap(facts,'CashAndCashEquivalentsAtCarryingValue') : pickAnnualUsGaap(facts,'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents');
  const sharesOut = pickAnnualUsGaap(facts, 'CommonStockSharesOutstanding');
  const opCashFlow = pickAnnualUsGaap(facts, 'NetCashProvidedByUsedInOperatingActivities').length ? pickAnnualUsGaap(facts,'NetCashProvidedByUsedInOperatingActivities') : pickAnnualUsGaap(facts,'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations');
  const capex = pickAnnualUsGaap(facts, 'PaymentsToAcquirePropertyPlantAndEquipment').length ? pickAnnualUsGaap(facts,'PaymentsToAcquirePropertyPlantAndEquipment') : pickAnnualUsGaap(facts,'PaymentsForCapitalImprovements');
  return {revenue, netIncome, eps, grossProfit, equity, assets, liabilities, cash, sharesOut, opCashFlow, capex, via, entityName: facts.entityName};
}
async function fetchSecFundamentals(ticker){
  return cachedFetch('sec_'+ticker, 24*60*60*1000, ()=>fetchSecFundamentalsLive(ticker));
}

const STOOQ_SUPPORTED = ['AAPL','MSFT','NVDA','AMZN']; // 4 US tickers that used to get Stooq priority; now just used as a quick "raw ticker = valid Yahoo symbol" list (see fetchLiveCloseSeries) since Stooq itself was removed — see the Stooq comment above drawPriceChart's equity branch for why.
