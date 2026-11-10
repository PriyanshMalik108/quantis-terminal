/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/features/news-tab.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   News & sentiment tab.
 * DEPENDS   data/live-data.js
 * EXPOSES   computeAndRenderNews (global — classic script, shared scope)
 * LOAD      Classic <script>, order defined in js/manifest.json. Top-level code runs at load,
 *           so it may only call functions from files listed EARLIER in the manifest.
 * NOTE      Migrated verbatim from the single-file build; inline comments marked
 *           "REAL BUG FIXED" / "post-launch fix" document past defects — keep them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* ===================== NEWS TAB — now real headlines ===================== */
/* Was 3 literal placeholder headlines. A LICENSED news API (Reuters/Bloomberg/WSJ) is still
   genuinely unavailable free — that part of the original assessment was correct. What was
   wrong was treating "licensed API" as the only way to get real news: RSS feeds are free,
   public, and don't require any license — Yahoo Finance publishes a real per-ticker RSS feed,
   and Google News RSS covers anything not on Yahoo's list. Sentiment is a simple, disclosed
   keyword-count heuristic run on the real fetched headlines (NOT a claim of NLP/ML-grade
   sentiment analysis — that would need a licensed model or service too) — it's the same honest
   pattern as everything else in this build: real data, clearly labeled methodology, no
   overclaiming what a free/simple technique can actually do. */
function parseRssItems(xmlText){
  const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
  if(doc.querySelector('parsererror')) throw new Error('RSS feed did not parse as XML');
  return Array.from(doc.querySelectorAll('item')).slice(0,8).map(it=>({
    title: (it.querySelector('title')?.textContent || '').trim(),
    link: (it.querySelector('link')?.textContent || '').trim(),
    pubDate: (it.querySelector('pubDate')?.textContent || '').trim(),
  })).filter(x=>x.title);
}
/* Headlines: CNBC's public article search (keyless, CORS-open), queried by company name.
   The Yahoo/Google RSS feeds used before need a CORS proxy and are only tried if you set one. */
function newsQueryFor(ticker, companyName){
  const n = (companyName || ticker).replace(/\b(Inc\.?|Corp\.?|Corporation|Ltd\.?|Limited|plc|PLC|S\.?A\.?|AG|N\.?V\.?|Co\.?|Company|Holdings?|Group|Class [A-C]|\(.*?\))\b/g,'').replace(/[.,]+$/,'').replace(/\s+/g,' ').trim();
  return n || ticker;
}
async function fetchTickerNewsLive(ticker, companyName){
  try{
    const q = newsQueryFor(ticker, companyName);
    const {items} = await LD.news(q);
    const words = q.toLowerCase().split(' ').filter(w=>w.length>2);
    const relevant = items.filter(it=>{ const t = (it.title+' '+it.summary).toLowerCase(); return words.some(w=>t.includes(w)) || t.includes(ticker.toLowerCase()); });
    const list = (relevant.length >= 3 ? relevant : items).slice(0, 15).map(it=>({title: it.title, link: it.url, pubDate: it.date, summary: it.summary}));
    if(list.length) return {items: list, via: 'direct', source: 'CNBC'};
    throw new Error('no CNBC articles matched');
  }catch(cnbcErr){
    if(!getCustomProxy()) throw cnbcErr;
  }
  const yahooUrl = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(ticker)}&region=US&lang=en-US`;
  try{
    const {res, via} = await fetchViaProxyChain(yahooUrl);
    const items = parseRssItems(await res.text());
    if(items.length) return {items, via, source:'Yahoo Finance RSS'};
    throw new Error('empty feed');
  }catch(e){
    const gUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(companyName)}+stock&hl=en-US&gl=US&ceid=US:en`;
    const {res, via} = await fetchViaProxyChain(gUrl);
    const items = parseRssItems(await res.text());
    return {items, via, source:'Google News RSS'};
  }
}
async function fetchTickerNews(ticker, companyName){
  return cachedFetch('news_'+ticker, 15*60*1000, ()=>fetchTickerNewsLive(ticker, companyName));
}
const NEWS_POS_WORDS = ['surge','soar','rally','gain','gains','beat','beats','jump','jumps','rise','rises','rising','outperform','upgrade','upgraded','strong','record','profit','profits','growth','bullish','higher','boost','boosts','wins','win','buy','recovery','rebound'];
const NEWS_NEG_WORDS = ['drop','drops','fall','falls','plunge','plunges','slump','loss','losses','miss','misses','downgrade','downgraded','sell','weak','bearish','lower','cut','cuts','concern','concerns','risk','risks','decline','declines','crash','warning','lawsuit','probe','investigation','recall','layoff','layoffs'];
function classifyHeadline(title){
  const words = title.toLowerCase().match(/[a-z]+/g) || [];
  let pos=0, neg=0;
  words.forEach(w=>{ if(NEWS_POS_WORDS.includes(w)) pos++; if(NEWS_NEG_WORDS.includes(w)) neg++; });
  if(pos>neg) return 'pos'; if(neg>pos) return 'neg'; return 'neu';
}
let newsRenderToken = 0;
async function computeAndRenderNews(){
  const myToken = ++newsRenderToken;
  const el = document.getElementById('newsContent');
  if(!el) return;
  const s = SECURITIES.find(x=>x.t===currentSecurity);
  const name = s ? s.n : currentSecurity;
  const stocktwitsCard = !getCustomProxy() ? '' : `<div class="card" style="margin-top:12px;"><h3>Community (StockTwits) <span id="stocktwitsBadge" class="badge assume">SAMPLE</span></h3><div id="stocktwitsBox"><div class="notebox">Loading…</div></div></div>`;
  el.innerHTML = `<div class="notebox">Fetching live headlines for ${escapeHtml(name)} from CNBC…</div>${stocktwitsCard}`;
  if(stocktwitsCard) renderStockTwits(currentSecurity, myToken);
  try{
    const {items, via, source} = await fetchTickerNews(currentSecurity, name);
    if(myToken !== newsRenderToken) return;
    if(!items.length){
      el.innerHTML = `<div class="notebox">No recent headlines found for ${escapeHtml(name)} via ${source}. This can happen for thinly-covered tickers — try a more widely-covered security, or check Data Sources if this persists for well-known tickers too.</div>${stocktwitsCard}`;
      renderStockTwits(currentSecurity, myToken);
      return;
    }
    const classified = items.map(it=>({...it, sentiment: classifyHeadline(it.title)}));
    const pos = classified.filter(c=>c.sentiment==='pos').length;
    const neg = classified.filter(c=>c.sentiment==='neg').length;
    const neu = classified.length - pos - neg;
    const pct = n => Math.round(n/classified.length*100);
    const headlinesHtml = classified.map(c=>{
      const dot = c.sentiment==='pos' ? 'var(--up)' : c.sentiment==='neg' ? 'var(--down)' : 'var(--text-2)';
      const dateStr = c.pubDate ? new Date(c.pubDate).toLocaleDateString(undefined,{month:'short',day:'numeric'}) : '';
      return `<div style="padding:7px 0;border-bottom:1px solid var(--line-soft);">
        <div style="display:flex;gap:8px;align-items:flex-start;">
          <span style="width:7px;height:7px;border-radius:50%;background:${dot};margin-top:5px;flex-shrink:0;"></span>
          <a href="${escapeHtml(c.link)}" target="_blank" rel="noopener" style="color:var(--text-0);text-decoration:none;font-size:12px;line-height:1.4;">${escapeHtml(c.title)}</a>
        </div>
        <div style="font-size:10px;color:var(--text-2);margin-left:15px;">${dateStr}</div>
      </div>`;
    }).join('');
    el.innerHTML = `<div class="grid grid-2">
        <div class="card"><h3>Headlines <span class="badge fact">LIVE via ${source}</span></h3>${headlinesHtml}</div>
        <div class="card"><h3>Sentiment <span class="badge fact">computed from real headlines</span></h3>${bar('Positive',pct(pos),100,'var(--up)')}${bar('Neutral',pct(neu),100,'var(--text-2)')}${bar('Negative',pct(neg),100,'var(--down)')}
          <div class="notebox" style="margin-top:8px;">Headlines above are real, fetched live (via ${via}). Sentiment is a simple keyword-count heuristic run on those real headlines — NOT NLP/ML-grade sentiment analysis, which would need a licensed model. Treat the split as a rough signal, not a precise score.</div></div>
      </div>
      ${stocktwitsCard}`;
    renderStockTwits(currentSecurity, myToken);
  }catch(e){
    if(myToken !== newsRenderToken) return;
    el.innerHTML = `<div class="notebox"><span style="color:var(--down)">Couldn't fetch live news for ${escapeHtml(name)}: ${escapeHtml(e.message)}.</span> Check your connection (CNBC article search must be reachable) — or set a personal proxy for the Yahoo/Google feeds (Settings → Data Sources) to go live reliably.</div>${stocktwitsCard}`;
    renderStockTwits(currentSecurity, myToken);
  }
}
/* StockTwits community sentiment — free public API, no key. CORS reliability is genuinely
   inconsistent for this one (unlike Yahoo/SEC/FRED/Wikipedia above, which are dependably either
   open or reliably proxy-able) — if it fails, that's disclosed plainly rather than silently
   hidden. Sentiment shown is each poster's own self-applied Bullish/Bearish tag, not a computed
   score — StockTwits users tag their own posts; this isn't NLP run over the message text. */
async function fetchStockTwitsLive(ticker){
  const url = `https://api.stocktwits.com/api/2/streams/symbol/${encodeURIComponent(ticker)}.json`;
  const {res, via} = await fetchViaProxyChain(url);
  const json = await res.json();
  if(json.response && json.response.status && json.response.status !== 200) throw new Error('StockTwits returned status '+json.response.status);
  const messages = (json.messages||[]).slice(0,15).map(m=>({
    body: m.body, username: m.user?.username, sentiment: m.entities?.sentiment?.basic || null,
  }));
  return {messages, via};
}
async function fetchStockTwits(ticker){ return cachedFetch('stocktwits_'+ticker, 10*60*1000, ()=>fetchStockTwitsLive(ticker)); }
async function renderStockTwits(ticker, expectedToken){
  const box = document.getElementById('stocktwitsBox'), badge = document.getElementById('stocktwitsBadge');
  if(!box) return;
  try{
    const {messages, via} = await fetchStockTwits(ticker);
    if(expectedToken!=null && expectedToken !== newsRenderToken) return;
    if(!messages.length){ box.innerHTML = `<div class="notebox">No recent StockTwits messages found for $${ticker}.</div>`; return; }
    const bullish = messages.filter(m=>m.sentiment==='Bullish').length;
    const bearish = messages.filter(m=>m.sentiment==='Bearish').length;
    const tagged = bullish+bearish;
    const msgHtml = messages.map(m=>{
      const dot = m.sentiment==='Bullish' ? 'var(--up)' : m.sentiment==='Bearish' ? 'var(--down)' : 'var(--text-2)';
      return `<div style="padding:6px 0;border-bottom:1px solid var(--line-soft);font-size:11.5px;color:var(--text-1);">
        <span style="width:6px;height:6px;border-radius:50%;background:${dot};display:inline-block;margin-right:6px;"></span>
        <b>@${escapeHtml(m.username||'user')}</b> ${escapeHtml(m.body)}
      </div>`;
    }).join('');
    box.innerHTML = (tagged>0 ? `<div style="margin-bottom:8px;">${bar('Bullish', Math.round(bullish/tagged*100),100,'var(--up)')}${bar('Bearish', Math.round(bearish/tagged*100),100,'var(--down)')}</div>` : '')
      + msgHtml
      + `<div class="notebox" style="margin-top:8px;">Real public posts from StockTwits (via ${via}). Bullish/Bearish tags are self-applied by each poster, not a computed sentiment score — ${tagged} of ${messages.length} recent posts carried a tag; the rest were untagged.</div>`;
    if(badge){ badge.textContent='LIVE'; badge.className='badge fact'; }
  }catch(e){
    if(expectedToken!=null && expectedToken !== newsRenderToken) return;
    box.innerHTML = `<div class="notebox">Couldn't fetch StockTwits for $${ticker}: ${escapeHtml(e.message)}. StockTwits' CORS policy is inconsistent — this may need your proxy worker (Settings → Data Sources), or may simply be unavailable right now.</div>`;
  }
}


/* Real GBM Monte Carlo — drift and volatility estimated from the same live/sample return
   series, 2000 independent paths via Box-Muller-sampled Math.random(), not staged percentiles. */
let mcChart;
function runMonteCarlo(){
  const s = currentPriceSeries;
  if(!s || s.length < 31) return;
  const returns = Formulas.dailyReturns(s, true); // log returns for GBM drift/vol
  const meanLogRet = returns.reduce((a,b)=>a+b,0)/returns.length;
  const sdLogRet = Formulas.stddev(returns, true);
  const muAnnual = meanLogRet*252 + 0.5*sdLogRet*sdLogRet*252; // convert log-return drift back to GBM mu
  const sigmaAnnual = sdLogRet*Math.sqrt(252);
  const s0 = s[s.length-1];
  const horizon = 20; // trading days, matches the "20-Day Forecast" convention used elsewhere
  const mc = Formulas.monteCarloGBM(s0, muAnnual, sigmaAnnual, horizon, 2000);

  const pctEl = document.getElementById('mcPercentiles');
  if(pctEl) pctEl.innerHTML = table(['Percentile','Price','vs Spot'], [
    ['5th (bear tail)', mc.p5.toFixed(2), ((mc.p5/s0-1)*100).toFixed(1)+'%'],
    ['25th', mc.p25.toFixed(2), ((mc.p25/s0-1)*100).toFixed(1)+'%'],
    ['50th (median)', mc.p50.toFixed(2), ((mc.p50/s0-1)*100).toFixed(1)+'%'],
    ['75th', mc.p75.toFixed(2), ((mc.p75/s0-1)*100).toFixed(1)+'%'],
    ['95th (bull tail)', mc.p95.toFixed(2), ((mc.p95/s0-1)*100).toFixed(1)+'%'],
  ]);
  const noteEl = document.getElementById('mcNote');
  if(noteEl) noteEl.innerHTML = `2,000 simulated ${horizon}-day paths, GBM with μ=${(muAnnual*100).toFixed(1)}%/yr, σ=${(sigmaAnnual*100).toFixed(1)}%/yr — both estimated from the ${currentPriceSeriesIsLive?'live':'sample'} price series above, re-drawn fresh on every "Re-run" click.`;

  const histCtx = document.getElementById('mcHistogram');
  if(histCtx){
    const nBins = 24;
    const lo = mc.finals[0], hi = mc.finals[mc.finals.length-1];
    const binW = (hi-lo)/nBins || 1;
    const bins = new Array(nBins).fill(0);
    mc.finals.forEach(v=>{ const idx = Math.min(nBins-1, Math.floor((v-lo)/binW)); bins[idx]++; });
    const labels = bins.map((_,i)=> (lo+i*binW).toFixed(0));
    if(mcChart && mcChart.destroy) mcChart.destroy();
    mcChart = safeNewChart('mcHistogram', {type:'bar',data:{labels,datasets:[{data:bins,backgroundColor:'rgba(255,176,0,0.55)',borderWidth:0}]},
      options:{responsive:true,plugins:{legend:{display:false}},scales:{x:{ticks:{color:cssVar('--text-2'),maxTicksLimit:8}},y:{grid:{color:cssVar('--line-soft')},ticks:{color:cssVar('--text-2')}}}}});
  }
}

function setDataQuality(html){
  const box = document.getElementById('dataQualityBox');
  if(box) box.innerHTML = html;
}
