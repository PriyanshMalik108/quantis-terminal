/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/data/public-sources.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   World Bank, CFTC, OpenFIGI, Finnhub recommendation trends, sanctions lists.
 * DEPENDS   core/*
 * EXPOSES   fetchWorldBank..., fetchCftc..., openFigiSearch... (global — classic script, shared scope)
 * LOAD      Classic <script>, order defined in js/manifest.json. Top-level code runs at load,
 *           so it may only call functions from files listed EARLIER in the manifest.
 * NOTE      Migrated verbatim from the single-file build; inline comments marked
 *           "REAL BUG FIXED" / "post-launch fix" document past defects — keep them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* ===================== WORLD BANK OPEN DATA (country macro indicators) =====================
   Free, keyless, genuinely CORS-open (api.worldbank.org sets Access-Control-Allow-Origin: *,
   confirmed against their own developer docs) — one of the only macro sources here that needs
   neither a key nor a proxy. Covers GDP growth, inflation, unemployment, and trade-openness for
   190+ countries going back decades, which is broader country coverage than FRED (US-focused)
   or Yahoo (whatever a ticker happens to expose) give this app anywhere else. mrnev=1 asks the
   API for the Most Recent Non-Empty Value directly, so a country that hasn't published this
   year's figure yet still returns last year's real one instead of a null. */
const WORLD_BANK_COUNTRIES = [
  {code:'US', name:'United States'}, {code:'CN', name:'China'}, {code:'JP', name:'Japan'},
  {code:'DE', name:'Germany'}, {code:'GB', name:'United Kingdom'}, {code:'IN', name:'India'},
  {code:'FR', name:'France'}, {code:'BR', name:'Brazil'}, {code:'CA', name:'Canada'},
  {code:'KR', name:'South Korea'}, {code:'AU', name:'Australia'}, {code:'EU', name:'Euro Area'},
];
const WORLD_BANK_INDICATORS = {
  gdpGrowth: 'NY.GDP.MKTP.KD.ZG',      // GDP growth (annual %)
  inflation: 'FP.CPI.TOTL.ZG',         // Inflation, consumer prices (annual %)
  unemployment: 'SL.UEM.TOTL.ZS',      // Unemployment (% of total labor force)
  currentAccount: 'BN.CAB.XOKA.GD.ZS', // Current account balance (% of GDP)
  govDebt: 'GC.DOD.TOTL.GD.ZS',        // Central government debt (% of GDP)
};
async function fetchWorldBankIndicatorLive(countryCode, indicatorCode){
  const url = `https://api.worldbank.org/v2/country/${countryCode}/indicator/${indicatorCode}?format=json&per_page=5&mrnev=1`;
  const {res, via} = await fetchViaProxyChain(url);
  const json = await res.json();
  // World Bank's own error shape: [{"message":[{"id":"120","key":"Invalid value","value":"..."}]}]
  if(json && json[0] && json[0].message) throw new Error(json[0].message[0]?.value || 'World Bank API error');
  const rows = (json && json[1]) || [];
  const point = rows.find(r=>r.value!=null);
  if(!point) throw new Error('No published value for '+indicatorCode+' / '+countryCode);
  return {value: point.value, year: point.date, via};
}
async function fetchWorldBankCountryLive(countryCode){
  const entries = await Promise.all(Object.entries(WORLD_BANK_INDICATORS).map(async ([key, code])=>{
    try{ const r = await fetchWorldBankIndicatorLive(countryCode, code); return [key, r]; }
    catch(e){ return [key, null]; } // one missing series (e.g. a small country lacking debt data) shouldn't fail the whole card
  }));
  const out = Object.fromEntries(entries);
  if(Object.values(out).every(v=>v===null)) throw new Error('World Bank returned no data for '+countryCode);
  return out;
}
async function fetchWorldBankCountry(countryCode){ return cachedFetch('worldbank_'+countryCode, 6*60*60*1000, ()=>fetchWorldBankCountryLive(countryCode)); }
let worldBankRenderToken = 0;
async function renderWorldBankPanel(){
  const sel = document.getElementById('wbCountrySelect');
  const box = document.getElementById('wbIndicatorBox');
  if(!sel || !box) return;
  const code = sel.value;
  const myToken = ++worldBankRenderToken;
  box.innerHTML = `<div class="notebox">Loading ${WORLD_BANK_COUNTRIES.find(c=>c.code===code)?.name||code} indicators from World Bank Open Data…</div>`;
  try{
    const d = await fetchWorldBankCountry(code);
    if(myToken !== worldBankRenderToken) return;
    const fmt = (r,suffix)=> r ? `${r.value>=0?'+':''}${r.value.toFixed(1)}${suffix} <span style="color:var(--text-2);font-size:10.5px;">(${r.year})</span>` : '<span style="color:var(--text-2)">not published</span>';
    box.innerHTML = kv([
      ['GDP Growth (annual)', fmt(d.gdpGrowth,'%')],
      ['Inflation (CPI, annual)', fmt(d.inflation,'%')],
      ['Unemployment', fmt(d.unemployment,'%')],
      ['Current Account Balance', fmt(d.currentAccount,'% of GDP')],
      ['Central Govt. Debt', fmt(d.govDebt,'% of GDP')],
    ]) + `<div class="notebox" style="margin-top:8px;"><span class="badge fact">LIVE</span> World Bank Open Data (api.worldbank.org), keyless, direct — via ${d.gdpGrowth?.via||d.inflation?.via||'direct'}. Each indicator shows the most recently published year individually (World Bank countries don't all report on the same schedule, so these years can legitimately differ from each other).</div>`;
  }catch(e){
    if(myToken !== worldBankRenderToken) return;
    box.innerHTML = `<div class="notebox"><span class="badge assume">UNAVAILABLE</span> World Bank fetch failed: ${escapeHtml(e.message)}. This is a keyless, CORS-open source — a failure here usually means a network/proxy issue, not a missing key.</div>`;
  }
}

/* ===================== CFTC COMMITMENTS OF TRADERS (futures positioning) =====================
   Free, keyless, CORS-open (Socrata open-data platform — publicreporting.cftc.gov — sets CORS
   the same way every other Socrata-hosted government dataset does). This is the CFTC's real
   weekly "Legacy Futures Only" report: how many contracts non-commercial traders (speculators/
   funds) vs. commercial traders (hedgers) hold net long or net short, for major US-listed
   futures. A widely-watched real positioning/sentiment gauge, genuinely distinct from price
   data — nothing else in this app measures who is positioned which way, only what price did. */
const CFTC_MARKETS = [
  {code:'S&P 500 Consolidated - CHICAGO MERCANTILE EXCHANGE', label:'S&P 500 (E-mini)'},
  {code:'GOLD - COMMODITY EXCHANGE INC.', label:'Gold'},
  {code:'CRUDE OIL, LIGHT SWEET-WTI - ICE FUTURES EUROPE', label:'Crude Oil WTI'},
  {code:'USD INDEX - ICE FUTURES U.S.', label:'US Dollar Index'},
  {code:'EURO FX - CHICAGO MERCANTILE EXCHANGE', label:'Euro FX'},
];
async function fetchCftcCotLive(marketName){
  // Socrata SoQL: exact market name match, most recent report first, only the one row needed.
  const query = `$where=${encodeURIComponent(`market_and_exchange_names='${marketName}'`)}&$order=report_date_as_yyyy_mm_dd DESC&$limit=1`;
  const url = `https://publicreporting.cftc.gov/resource/6dca-aqww.json?${query}`;
  const {res, via} = await fetchViaProxyChain(url);
  const json = await res.json();
  const row = json && json[0];
  if(!row) throw new Error('No CFTC report row for "'+marketName+'" — market name may have changed; see cftc.gov for the current exact name');
  const noncommLong = parseFloat(row.noncomm_positions_long_all);
  const noncommShort = parseFloat(row.noncomm_positions_short_all);
  const commLong = parseFloat(row.comm_positions_long_all);
  const commShort = parseFloat(row.comm_positions_short_all);
  const openInterest = parseFloat(row.open_interest_all);
  return {
    date: String(row.report_date_as_yyyy_mm_dd||'').slice(0,10), openInterest,
    noncommNet: noncommLong - noncommShort, noncommLong, noncommShort,
    commNet: commLong - commShort, commLong, commShort, via,
  };
}
async function fetchCftcCot(marketName){ return cachedFetch('cftc_'+marketName, 6*60*60*1000, ()=>fetchCftcCotLive(marketName)); }
let cftcRenderToken = 0;
async function renderCftcPanel(){
  const box = document.getElementById('cftcBox');
  if(!box) return;
  const myToken = ++cftcRenderToken;
  box.innerHTML = `<div class="notebox">Loading latest weekly CFTC Commitments of Traders report for ${CFTC_MARKETS.length} markets…</div>`;
  const results = await Promise.allSettled(CFTC_MARKETS.map(m=>fetchCftcCot(m.code)));
  if(myToken !== cftcRenderToken) return;
  const rows = results.map((r,i)=>{
    const label = CFTC_MARKETS[i].label;
    if(r.status !== 'fulfilled') return [label, '—', '—', `<span style="color:var(--text-2)" title="${escapeHtml(r.reason.message)}">unavailable</span>`];
    const d = r.value;
    const pctOi = d.openInterest ? (d.noncommNet/d.openInterest*100) : null;
    return [label,
      `${d.date}`,
      `<span class="${d.noncommNet>=0?'up':'down'}">${d.noncommNet>=0?'+':''}${d.noncommNet.toLocaleString()} contracts</span>${pctOi!=null?` (${pctOi>=0?'+':''}${pctOi.toFixed(1)}% of OI)`:''}`,
      d.noncommNet>=0 ? 'Speculators net LONG — bullish positioning tilt' : 'Speculators net SHORT — bearish positioning tilt',
    ];
  });
  box.innerHTML = table(['Market','Report Date','Non-Commercial (Speculator) Net Position','Read'], rows)
    + `<div class="notebox" style="margin-top:8px;"><span class="badge fact">LIVE</span> CFTC Commitments of Traders, "Legacy Futures Only" report (publicreporting.cftc.gov), published weekly (Fridays, for the prior Tuesday's data), keyless, direct. Net position = non-commercial (speculator/fund) long contracts minus short contracts — a real, widely-watched positioning gauge, not a price-derived proxy. Extreme net-long or net-short readings are sometimes read as contrarian crowding signals, but this is one week of one dataset — not a trading signal on its own.</div>`;
}

/* ===================== OPENFIGI (broader instrument identifier search) =====================
   Free, POST-only (no GET equivalent exists in OpenFIGI's API, so unlike every other source in
   this app it can't be relayed through the public GET-passthrough proxy chain — this call is
   always direct). OpenFIGI's coverage spans equities, options, futures, bonds, and more, mapped
   to FIGI (Financial Instrument Global Identifier) — broader instrument-TYPE coverage than the
   Yahoo-search-based global search elsewhere in this app, which is effectively equities/ETFs/
   funds/crypto/FX only. Keyless works at 25 requests/minute; an optional free key (see Settings)
   raises that limit — the key is sent as the documented X-OPENFIGI-APIKEY header, never as a
   URL param, so it never leaks into any proxy or cache key. */
async function fetchOpenFigiSearchLive(query, apiKey){
  const headers = {'Content-Type':'application/json'};
  if(apiKey) headers['X-OPENFIGI-APIKEY'] = apiKey;
  const res = await fetchWithTimeout('https://api.openfigi.com/v3/search', {
    method:'POST', mode:'cors', headers, body: JSON.stringify({query, hasResults: true}),
  }, 8000);
  if(!res.ok){
    if(res.status === 429) throw new Error('rate-limited (25/min keyless) — add a free OpenFIGI key in Settings for a higher limit, or wait a minute');
    throw new Error('HTTP '+res.status);
  }
  const json = await res.json();
  return (json.data || []).slice(0, 20);
}
let lastFigiRows = [];
async function runFigiSearch(){
  const q = document.getElementById('figiSearchInput').value.trim();
  const box = document.getElementById('figiResultsBox');
  if(!box) return;
  if(!q){ box.innerHTML = `<div class="notebox">Enter a company name, ticker, or ISIN to search.</div>`; return; }
  const isIsin = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/i.test(q);
  box.innerHTML = `<div class="notebox">Searching every listing worldwide for "${escapeHtml(q)}"…</div>`;
  try{
    const filter = isIsin ? [{left:'isin',operation:'equal',right:q.toUpperCase()}] : [{left:'name,description',operation:'match',right:q}];
    const {rows, total} = await LD.tvScan('global', {filter, columns:['name','description','exchange','type','subtype','isin','currency','country','close','change','market_cap_basic','logoid','sector','RSI','price_earnings_ttm','return_on_equity'],
      sort:{sortBy:'market_cap_basic',sortOrder:'desc'}, range:[0,30]});
    lastFigiRows = rows;
    if(!rows.length){ box.innerHTML = `<div class="notebox">No listing matches "${escapeHtml(q)}".</div>`; return; }
    const typeLbl = r => ({stock:'Stock', fund:(r.subtype==='etf'?'ETF':'Fund'), dr:'Depositary receipt', bond:'Bond', structured:'Structured product', index:'Index', futures:'Future'})[r.type] || r.type || '—';
    box.innerHTML = table(['Symbol','Name','Exchange','Type','ISIN','Country','Price'], rows.map((r,i)=>[
      `<a href="#" data-figi-row="${i}" style="color:var(--amber);text-decoration:none;font-weight:600;">${escapeHtml(r.name||'')}</a>`, escapeHtml(r.description||''),
      escapeHtml(LD.TV_EX_LABEL[r.exchange]||r.exchange||''), typeLbl(r), escapeHtml(r.isin||'—'), escapeHtml(r.country||'—'), r.close!=null ? fmtPrice(r.close, r.currency||'USD') : '—']))
      + `<div class="notebox" style="margin-top:8px;"><span class="badge fact">LIVE</span> ${total>rows.length?`Top ${rows.length} of ${total.toLocaleString()} listings`:`${rows.length} listing${rows.length===1?'':'s'}`} via TradingView${isIsin?' (exact ISIN match)':''}. Click a symbol to research it.</div>`;
    box.querySelectorAll('[data-figi-row]').forEach(a=>a.addEventListener('click', e=>{ e.preventDefault(); const r = lastFigiRows[+a.dataset.figiRow]; if(['stock','fund','dr'].includes(r.type)) openTvRow(r); else toast('Only stocks, ETFs and depositary receipts can be opened in Research.', 'warn'); }));
  }catch(e){
    box.innerHTML = `<div class="notebox"><span class="badge assume">UNAVAILABLE</span> ${escapeHtml(e.message)}</div>`;
  }
}

/* ===================== FINNHUB (analyst recommendation trends) =====================
   Optional free key — used ONLY for one thing not available anywhere else in this app: real
   analyst buy/hold/sell recommendation counts over time. Everything else this app already gets
   live for free elsewhere (price, fundamentals) is deliberately NOT duplicated through Finnhub,
   to avoid a second, possibly-inconsistent source of the same numbers. */
async function fetchFinnhubRecommendationsLive(ticker, apiKey){
  const url = `https://finnhub.io/api/v1/stock/recommendation?symbol=${encodeURIComponent(ticker)}&token=${apiKey}`;
  const res = await fetchWithTimeout(url, {mode:'cors'}, 12000); const via = 'Finnhub';
  if(!res.ok) throw new Error('Finnhub HTTP '+res.status+(res.status===401||res.status===403?' — check the key in Settings':''));
  const json = await res.json();
  if(!Array.isArray(json) || !json.length) throw new Error('No Finnhub recommendation data for '+ticker+' (may be outside Finnhub\'s US-listed coverage on the free tier)');
  return {...json[0], via};
}
async function renderFinnhubRecommendations(ticker){
  const box = document.getElementById('finnhubRecBox');
  if(!box) return;
  const key = getKey('finnhub');
  if(!key){ box.innerHTML = `<div class="notebox">Loading analyst consensus…</div>`; return; } // filled from the live fundamentals fetch
  box.innerHTML = `<div class="notebox">Loading analyst recommendation trend for ${ticker}…</div>`;
  try{
    const r = await fetchFinnhubRecommendationsLive(ticker, key);
    const total = (r.strongBuy||0)+(r.buy||0)+(r.hold||0)+(r.sell||0)+(r.strongSell||0);
    if(!total){ box.innerHTML = `<div class="notebox">Finnhub returned no analyst coverage for ${ticker}.</div>`; return; }
    const bar = (n,color)=> `<div style="flex:${Math.max(n,0.001)};background:${color};height:16px;" title="${n}"></div>`;
    box.innerHTML = `
      <div style="display:flex;border-radius:4px;overflow:hidden;margin-bottom:8px;">
        ${bar(r.strongBuy, '#1f9d63')}${bar(r.buy, '#3ECF8E')}${bar(r.hold, '#7A5F2E')}${bar(r.sell, '#FF5C6C')}${bar(r.strongSell, '#a3222f')}
      </div>` + kv([
        ['Strong Buy', String(r.strongBuy||0)], ['Buy', String(r.buy||0)], ['Hold', String(r.hold||0)],
        ['Sell', String(r.sell||0)], ['Strong Sell', String(r.strongSell||0)], ['Period', r.period||'—'],
      ]) + `<div class="notebox" style="margin-top:8px;"><span class="badge fact">LIVE</span> Finnhub analyst recommendation trends, ${total} analysts, via ${r.via}. This reflects sell-side analyst ratings, not this app's own scoring elsewhere — shown separately, not blended in.</div>`;
  }catch(e){
    box.innerHTML = `<div class="notebox"><span class="badge assume">FAILED</span> ${escapeHtml(e.message)}</div>`;
  }
}

/* ===================== OFAC / CONSOLIDATED SANCTIONS SCREENING =====================
   Uses the US government's own official Consolidated Screening List API (developer.trade.gov —
   run jointly by Commerce/Census, State, and Treasury), which merges OFAC's SDN list with 10
   other US sanctions/export-control lists (BIS Entity List, Denied Persons List, State
   Department lists, etc.) behind one real, free, key-gated endpoint — genuinely the same data
   compliance teams use, not a scraped approximation. Requires a free key (instant signup, no
   card) since api.trade.gov gates every endpoint behind one, unlike the fully keyless sources
   elsewhere in this app — disclosed plainly rather than pretending this could ever be keyless. */
async function fetchCslScreeningLive(name, apiKey){
  const url = `https://data.trade.gov/consolidated_screening_list/v1/search?name=${encodeURIComponent(name)}&subscription-key=${encodeURIComponent(apiKey)}`;
  const res = await fetchWithTimeout(url, {mode:'cors'}, 15000); const via = 'Trade.gov (direct)';
  if(res.status === 401 || res.status === 403) throw new Error('key rejected (HTTP '+res.status+') — check the Trade.gov key in Settings');
  const json = await res.json();
  return {results: json.results || [], total: json.total ?? (json.results||[]).length, via};
}
async function runSanctionsScreen(){
  const q = document.getElementById('sanctionsInput').value.trim();
  const box = document.getElementById('sanctionsResultsBox');
  if(!box) return;
  if(!q){ box.innerHTML = `<div class="notebox">Enter a person or entity name to screen.</div>`; return; }
  const key = getKey('csl');
  if(!key){ box.innerHTML = `<div class="notebox">Add a free Trade.gov Consolidated Screening List key in Settings (developer.trade.gov, instant signup) to use sanctions screening. This app never fabricates a "clear" result without actually querying a real government list.</div>`; return; }
  box.innerHTML = `<div class="notebox">Screening "${escapeHtml(q)}" against OFAC SDN + 10 other US consolidated sanctions/export-control lists…</div>`;
  try{
    const {results, total, via} = await fetchCslScreeningLive(q, key);
    if(!total){
      box.innerHTML = `<div class="notebox"><span class="badge fact">NO MATCH</span> No hits for "${escapeHtml(q)}" on any of the US Consolidated Screening List's sources (via ${via}), as of right now. This checks name-matching only — it is not a legal compliance clearance, does not check aliases/transliterations exhaustively, and should not be the sole basis for a real compliance decision. Consult a qualified compliance professional for anything with actual legal/financial consequence.</div>`;
      return;
    }
    const rows = results.slice(0,25).map(r=>[
      r.name || '—', (r.source_list_url ? `<a href="${r.source_list_url}" target="_blank" rel="noopener">${escapeHtml(r.source||'—')}</a>` : escapeHtml(r.source||'—')),
      r.type || '—', (r.programs||[]).join(', ') || '—', r.remarks ? escapeHtml(String(r.remarks)).slice(0,140) : '—',
    ]);
    box.innerHTML = `<div class="notebox" style="margin-bottom:8px;background:var(--model-bg);"><span class="badge model">${total} POTENTIAL MATCH${total===1?'':'ES'}</span> This is a real query against official US government sanctions/export-control data — it is NOT a legal compliance determination. Name matching produces false positives routinely (common names, transliteration variants); every hit needs human review of the full record before any decision is made.</div>`
      + table(['Matched Name','Source List','Type','Program(s)','Remarks'], rows)
      + `<div class="notebox" style="margin-top:8px;">Via ${via}, developer.trade.gov Consolidated Screening List API.</div>`;
  }catch(e){
    box.innerHTML = `<div class="notebox"><span class="badge assume">FAILED</span> ${escapeHtml(e.message)}</div>`;
  }
}
