/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/modules/reports/collectors.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Data collection per security KIND. Each collector fetches everything a detail page
 *           or report needs, in parallel, and returns ONE plain object. The Security Explorer
 *           renders from it and every report template builds from it — so a number shown on
 *           screen and the same number in a PDF always come from the same fetch.
 * KINDS     equity · etf · fund · preferred (TradingView listings, opened via admitTvRow)
 *           crypto · bond · govbond · future · option · fx · index · commodity · mf_in
 * DEPENDS   LD, QXA, QXLI, QXFREE, QXS, QXM, QXC.loadBars, LIVE_FUNDAMENTALS/fetchLiveFundamentals,
 *           admitTvRow (features/dashboard.js), QXCUSTOM, QXP (peers)
 * EXPOSES   QXCOL.{collect(kind, ref), equity(t), crypto(item), bond(item), …, errors are collected
 *           in data.gaps[] — a failed source NEVER throws the whole collection}
 * RULE      Never invent a number. Missing → null → shown as "—" with the gap listed in the report.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const QXCOL = (() => {
  const fin = v => typeof v==='number' && isFinite(v);
  const settle = async (gaps, label, p) => { try{ return await p; }catch(e){ gaps.push(label+': '+e.message); return null; } };
  const ymd = n => { const s = String(n||''); return s.length===8 ? `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6)}` : s.slice(0,10); };
  const yearsTo = n => { const d = Date.parse(ymd(n)); return isFinite(d) ? (d - Date.now())/(365.25*864e5) : null; };

  /* --------------------------------- equities --------------------------------- */
  // t = Quantis ticker already in the universe (Research) — or an Explorer item (admitted first).
  async function equity(ref){
    const t = typeof ref==='string' ? ref : admitTvRow({...ref.raw, _s: ref.sym});
    const sec = SECURITIES.find(x=>x.t===t) || SECURITY_UNIVERSE.find(x=>x.t===t) || {t, n:t};
    const D = {kind: (sec.cls==='ETF'?'etf':'equity'), t, sec, gaps:[], generated:new Date()};
    await Promise.all([
      settle(D.gaps, 'Statements', (async()=>{ D.m = await QXA.get(t); D.S = QXA.summary(D.m); D.metrics = QXA.metrics(D.m); })()),
      settle(D.gaps, 'Key data', (async()=>{ D.f = LIVE_FUNDAMENTALS[t] || await fetchLiveFundamentals(t); LIVE_FUNDAMENTALS[t] = D.f; })()),
      settle(D.gaps, 'Prices', (async()=>{ const B = await QXC.loadBars(t,'1D'); D.bars = B; D.px = QXM.series.stats({t:B.time.map(x=>x*1000), c:B.close}); D.series = {t:B.time.map(x=>new Date(x*1000).toISOString().slice(0,10)), c:B.close}; })()),
      settle(D.gaps, 'Benchmark', (async()=>{ const bm = benchmarkFor(sec); if(!bm) return; const B = await QXC.loadBars(bm,'1D'); D.benchmark = {t:bm, series:{t:B.time.map(x=>new Date(x*1000).toISOString().slice(0,10)), c:B.close}}; })()),
      settle(D.gaps, 'Company facts (Wikidata)', (async()=>{ D.wd = await QXFREE.wikidataCompany(sec.n); })()),
      settle(D.gaps, 'Description (Wikipedia)', (async()=>{ D.wiki = await QXFREE.wiki(String(sec.n).replace(/ (Inc|Ltd|Limited|Corp|Corporation|PLC)\.?$/i,'')+' company'); })()),
      settle(D.gaps, 'Exact line items', (async()=>{ if(QXLI.available()) D.li = await QXLI.get(t); })()),
      settle(D.gaps, 'Custom APIs', (async()=>{ D.custom = (QXCUSTOM.list().length) ? await QXCUSTOM.runAll(t, 'equity') : []; })()),
      settle(D.gaps, 'News', (async()=>{ const n = await LD.news(sec.n || t); D.news = (n.items||[]).slice(0,8); })()),
    ]);
    if(D.f && D.f.sector) D.peers = await settle(D.gaps, 'Peers', QXP.table(t, D.f));
    D.logo = await QXFREE.logoDataUrl(D.f && D.f.logoid ? QXFREE.tvLogoUrl(D.f.logoid) : (sec._logoid ? QXFREE.tvLogoUrl(sec._logoid) : null));
    D.ccy = (D.f && D.f.currency) || sec.ccy || 'USD';
    D.price = (D.px && D.px.last) || sec.px;
    D.dcf = AppState.dcf && AppState.dcf.ticker===t ? AppState.dcf : null;
    D.tech = technicals(D.bars);
    D.stance = stance(D);
    return D;
  }
  function benchmarkFor(sec){ const c = sec.ctry||''; return /India/.test(c) ? 'NIFTY50' : /United Kingdom/.test(c) ? 'FTSE100' : /Germany/.test(c) ? 'DAX' : /Japan/.test(c) ? 'NIKKEI225' : /Hong Kong|China/.test(c) ? 'HANGSENG' : 'SPX'; }
  function technicals(B){
    if(!B || B.close.length < 60) return null; const c = B.close, n = c.length, I = (id,p) => QXC.calcIndicator(id, p, B);
    const sma50 = QXM.series.sma(c,50)[n-1], sma200 = n>=200 ? QXM.series.sma(c,200)[n-1] : null;
    const rsi = I('rsi',{period:14})[0][n-1], macd = I('macd',{fast:12,slow:26,signal:9}), adx = I('adx',{period:14})[0][n-1], atr = I('atr',{period:14})[0][n-1];
    const bb = I('bb',{period:20,mult:2}); const st = I('st',{period:10,mult:3});
    const signals = [
      ['Price vs 50-day average', c[n-1] > sma50 ? 1 : -1, `${c[n-1] > sma50 ? 'above' : 'below'} (${sma50?.toFixed(2)})`],
      ['Price vs 200-day average', sma200==null ? 0 : c[n-1] > sma200 ? 1 : -1, sma200==null ? 'n/a' : `${c[n-1] > sma200 ? 'above' : 'below'} (${sma200.toFixed(2)})`],
      ['50-day vs 200-day (golden/death cross)', sma200==null ? 0 : sma50 > sma200 ? 1 : -1, sma200==null ? 'n/a' : sma50 > sma200 ? 'golden-cross structure' : 'death-cross structure'],
      ['RSI(14)', rsi>70 ? -1 : rsi<30 ? 1 : 0, `${rsi?.toFixed(1)} — ${rsi>70?'overbought':rsi<30?'oversold':'neutral'}`],
      ['MACD vs signal', macd[0][n-1] > macd[1][n-1] ? 1 : -1, macd[0][n-1] > macd[1][n-1] ? 'bullish (MACD above signal)' : 'bearish (MACD below signal)'],
      ['Supertrend(10,3)', st[0][n-1]!=null ? 1 : -1, st[0][n-1]!=null ? 'up-trend' : 'down-trend'],
      ['ADX(14) trend strength', 0, `${adx?.toFixed(1)} — ${adx>25?'trending':'range-bound'}`],
      ['Bollinger position', c[n-1] > bb[0][n-1] ? -1 : c[n-1] < bb[2][n-1] ? 1 : 0, c[n-1] > bb[0][n-1] ? 'above upper band' : c[n-1] < bb[2][n-1] ? 'below lower band' : 'inside bands'],
    ];
    const score = signals.reduce((a,s)=>a+s[1],0);
    return {sma50, sma200, rsi, macd:macd[0][n-1], macdSignal:macd[1][n-1], adx, atr, atrPct: atr/c[n-1]*100, signals, score, label: score>=3?'Bullish':score<=-3?'Bearish':'Neutral'};
  }
  function stance(D){
    const parts = [];
    if(D.S && fin(D.S.V.overall)) parts.push(['Financial health', D.S.V.overall, 0.4]);
    if(D.f && D.peers && fin(D.f.pe) && D.f.pe>0 && fin(D.peers.median.pe)){ const rel = D.f.pe/D.peers.median.pe; parts.push([`Valuation vs peers (P/E ${D.f.pe.toFixed(1)} vs ${D.peers.median.pe.toFixed(1)})`, Math.max(0,Math.min(100, 50 + (1-rel)*60)), 0.3]); }
    if(D.tech) parts.push(['Technical trend', Math.max(0, Math.min(100, 50 + D.tech.score*8)), 0.3]);
    if(!parts.length) return null;
    const w = parts.reduce((a,b)=>a+b[2],0), score = Math.round(parts.reduce((a,b)=>a+b[1]*b[2],0)/w);
    return {score, label: score>=65?'POSITIVE':score>=45?'NEUTRAL':'CAUTIOUS', parts};
  }

  /* ---------------------------------- crypto ---------------------------------- */
  async function crypto(item){
    const D = {kind:'crypto', item, gaps:[], generated:new Date()};
    const base = String(item.sym||'').split(':').pop().replace(/USDT?$|USD$/,'') || item.name;
    const hits = await settle(D.gaps, 'CoinGecko search', QXFREE.coingeckoSearch(item.name || base)) || [];
    const hit = hits.find(h=>h.symbol && h.symbol.toUpperCase()===base.toUpperCase()) || hits[0];
    if(hit){ D.cgId = hit.id;
      await Promise.all([
        settle(D.gaps, 'CoinGecko profile', QXFREE.coingeckoCoin(hit.id).then(x=>D.cg=x)),
        settle(D.gaps, 'Price history', QXFREE.coingeckoHistory(hit.id, 365).then(h=>{ D.hist = h; D.series = {t:h.t.map(x=>new Date(x).toISOString().slice(0,10)), c:h.c}; D.px = QXM.series.stats({t:h.t, c:h.c}, {periodsPerYear:365}); })),
      ]);
    }
    const name = (D.cg && D.cg.name) || item.name;
    D.defi = await settle(D.gaps, 'DefiLlama', QXFREE.defillama(name));
    if(/^BTC$/i.test(base)) D.btc = await settle(D.gaps, 'Bitcoin network', QXFREE.btcNetwork());
    D.cross = await settle(D.gaps, 'Coinbase cross-check', QXFREE.coinbaseStats(base.toUpperCase()+'-USD'));
    D.logo = await QXFREE.logoDataUrl((D.cg && D.cg.image && D.cg.image.large) || item.logo);
    const md = (D.cg && D.cg.market_data) || {};
    D.price = md.current_price?.usd ?? item.price; D.ccy = 'USD';
    D.k = {mcap: md.market_cap?.usd ?? item.mcap, fdv: md.fully_diluted_valuation?.usd, vol24: md.total_volume?.usd, circ: md.circulating_supply ?? item.raw?.circulating_supply, total: md.total_supply ?? item.raw?.total_supply, max: md.max_supply ?? item.raw?.max_supply,
      ath: md.ath?.usd, athDate: md.ath_date?.usd, athChg: md.ath_change_percentage?.usd, atl: md.atl?.usd, atlDate: md.atl_date?.usd, rank: (D.cg && D.cg.market_cap_rank) ?? item.raw?.crypto_total_rank,
      c24: md.price_change_percentage_24h, c7: md.price_change_percentage_7d, c30: md.price_change_percentage_30d, c1y: md.price_change_percentage_1y, tvl: md.total_value_locked?.usd ?? (D.defi && D.defi.tvl)};
    D.k.turnover = fin(D.k.vol24) && fin(D.k.mcap) && D.k.mcap ? D.k.vol24/D.k.mcap*100 : null;
    D.k.circPct = fin(D.k.circ) && fin(D.k.max) && D.k.max ? D.k.circ/D.k.max*100 : (fin(D.k.circ) && fin(D.k.total) && D.k.total ? D.k.circ/D.k.total*100 : null);
    D.k.mcapToTvl = fin(D.k.mcap) && fin(D.k.tvl) && D.k.tvl ? D.k.mcap/D.k.tvl : null;
    return D;
  }

  /* ------------------------------- fixed income ------------------------------- */
  const BENCH = {USD:'TVC:US10Y', INR:'TVC:IN10Y', EUR:'TVC:DE10Y', GBP:'TVC:GB10Y', JPY:'TVC:JP10Y', CAD:'TVC:CA10Y', AUD:'TVC:AU10Y', CHF:'TVC:CH10Y', CNY:'TVC:CN10Y'};
  async function bond(item){
    const s = await QXS.snapshot(item); const r = s.raw || {};
    const D = {kind:item.kind, item:s, gaps:[], generated:new Date()};
    const T = r.days_to_maturity!=null ? r.days_to_maturity/365.25 : yearsTo(r.maturity_date);
    const c = (r.current_coupon ?? r.coupon ?? (/(\d+(?:\.\d+)?)%/.exec(s.name||'')||[])[1]*1) ;
    // TradingView publishes coupon_frequency as text ("semi-annual") and ratings as internal numeric codes
    // ("690") — codes are not an agency scale, so they are NOT shown; textual ratings are.
    const FREQ = {annual:1, 'semi-annual':2, semiannual:2, quarterly:4, monthly:12, 'bi-monthly':6};
    const f = typeof r.coupon_frequency==='number' ? r.coupon_frequency : (FREQ[String(r.coupon_frequency||'').toLowerCase()] || (item.kind==='govbond' ? 2 : 2));
    const rating = v => (v==null || /^\d+$/.test(String(v))) ? null : String(v);
    const P = r.close;
    D.terms = {issuer: s.name, coupon: c, freq: f, maturity: ymd(r.maturity_date), years: T, price: P, ccy: s.ccy, country: r.country, outstanding: r.outstanding_amount, minDenom: r.denom_min,
      ratingSP: rating(r.bond_snp_rating_lt), ratingMoodys: rating(r.issuer_moodys_rating_lt), ratingFitch: rating(r.issuer_fitch_rating_lt), issuerType: r.bond_issuer_type, couponType: r.coupon_type_general, maturityType: r.maturity_type,
      callDate: r.call_next_date ? ymd(r.call_next_date) : null, callPrice: r.call_next_price, issuerStock: r.bond_issuer_stock_symbol, accrued: r.accrued_coupon_interest};
    const ok = fin(c) && fin(T) && T>0 && fin(P) && P>0;
    const cd = ok ? c/100 : null;
    const ytm = fin(r.yield_to_maturity) ? r.yield_to_maturity/100 : ok ? QXM.bond.ytm(P, cd, f, T) : null;
    D.y = {ytm, ytmSource: fin(r.yield_to_maturity) ? 'reported' : ok ? 'computed from price' : null, ytw: fin(r.yield_to_worst) ? r.yield_to_worst/100 : null, current: fin(r.current_yield) ? r.current_yield/100 : ok ? QXM.bond.currentYield(P, cd) : null};
    if(ok && fin(ytm)){
      D.risk = {macaulay: r.macaulay_duration ?? QXM.bond.macaulay(ytm, cd, f, T), modified: r.modified_duration ?? QXM.bond.modified(ytm, cd, f, T), convexity: QXM.bond.convexity(ytm, cd, f, T), dv01: QXM.bond.dv01(ytm, cd, f, T),
        modelPrice: QXM.bond.price(ytm, cd, f, T), durationSource: r.modified_duration!=null ? 'reported' : 'computed'};
      D.shocks = [-200,-100,-50,-25,25,50,100,200].map(bp=>({bp, ...QXM.bond.shock(ytm, cd, f, T, bp/10000)}));
      D.flows = QXM.bond.flows(cd, f, T).slice(0, 40).map(x=>({date: new Date(Date.now()+x.t*365.25*864e5).toISOString().slice(0,10), t:x.t, cf:x.cf, pv: x.cf/Math.pow(1+ytm/f, x.t*f)}));
    } else D.gaps.push('Bond analytics: coupon, maturity or price not published for this issue');
    const bm = BENCH[s.ccy];
    if(bm){ const b = await settle(D.gaps, 'Benchmark yield', LD.tvScan('bonds', {symbols:{tickers:[bm]}, columns:['close','description']})); if(b && b.rows[0] && fin(b.rows[0].close)){ D.bench = {sym:bm, name:b.rows[0].description, yieldPct:b.rows[0].close}; if(fin(ytm) && item.kind==='bond') D.spreadBp = (ytm*100 - b.rows[0].close)*100; } }
    D.price = P; D.ccy = s.ccy;
    return D;
  }

  /* ------------------------------ futures & options ------------------------------ */
  async function future(item){
    const s = await QXS.snapshot(item); const r = s.raw || {};
    const D = {kind:'future', item:s, gaps:[], generated:new Date(), price:s.price, ccy:s.ccy};
    D.k = {expiry: ymd(r.expiration), daysToExpiry: r.expiration ? Math.round((Date.parse(ymd(r.expiration)) - Date.now())/864e5) : null, oi: r.open_interest, volume: r.volume, changePct: r.change, exchange: s.exchange};
    // Curve: other contracts on the same root (strip trailing month/year code), sorted by expiry.
    const root = String(s.sym.split(':')[1]||'').replace(/[FGHJKMNQUVXZ]\d{4}$/,'');
    if(root && root !== s.sym.split(':')[1]){
      const curve = await settle(D.gaps, 'Futures curve', LD.tvScan('futures', {filter:[{left:'name',operation:'match',right:root},{left:'exchange',operation:'equal',right:s.exchange}], columns:['name','description','close','expiration','open_interest'], sort:{sortBy:'expiration',sortOrder:'asc'}, range:[0,14]}));
      if(curve) D.curve = curve.rows.filter(x=>x.expiration && String(x.name).startsWith(root) && fin(x.close)).map(x=>({sym:x.name, expiry:ymd(x.expiration), price:x.close, oi:x.open_interest}));
      if(D.curve && D.curve.length > 1){ const a = D.curve[0], z = D.curve[D.curve.length-1]; const yrs = (Date.parse(z.expiry)-Date.parse(a.expiry))/(365.25*864e5); D.curveShape = z.price > a.price ? 'contango' : 'backwardation'; D.impliedCarryPct = yrs>0 ? Math.log(z.price/a.price)/yrs*100 : null; }
    }
    return D;
  }
  async function option(item){
    // item.raw = option chain row (from QXS.optionChain) + underlying {sym, price}
    const r = item.raw, u = item.underlying || {};
    const D = {kind:'option', item, gaps:[], generated:new Date(), ccy:r.ccy||'USD'};
    const T = Math.max(1/365, (Date.parse(ymd(r.expiry)) - Date.now())/(365.25*864e5));
    const S = u.price, K = r.strike, sigma = r.iv, rf = (item.rf ?? 0.045);
    D.k = {type:r.type, strike:K, expiry:ymd(r.expiry), daysToExpiry:Math.round(T*365.25), last:r.last, bid:r.bid, ask:r.ask, mid: fin(r.bid)&&fin(r.ask) ? (r.bid+r.ask)/2 : r.last, iv:sigma, oi:r.oi, volume:r.volume, underlying:u.sym, spot:S, rf};
    if(fin(S) && fin(K) && fin(sigma)){
      D.model = QXM.option.bsm(r.type, S, K, T, rf, sigma);
      D.k.moneyness = r.type==='call' ? (S>K?'in the money':S<K?'out of the money':'at the money') : (S<K?'in the money':S>K?'out of the money':'at the money');
      D.k.intrinsic = Math.max(0, r.type==='call' ? S-K : K-S); D.k.timeValue = fin(D.k.mid) ? D.k.mid - D.k.intrinsic : null;
      const prem = fin(D.k.mid) ? D.k.mid : D.model.price; D.k.breakeven = r.type==='call' ? K+prem : K-prem;
      D.payoff = Array.from({length:41}, (_,i)=>{ const x = S*(0.6 + i*0.02); return {S:x, expiry: QXM.option.payoff(r.type, K, prem, x), today: QXM.option.bsm(r.type, x, K, T, rf, sigma).price - prem}; });
      D.grid = [-0.2,-0.1,-0.05,0,0.05,0.1,0.2].map(m=>({move:m*100, values:[T, Math.max(1/365,T*0.5), 1/365].map(tt=>QXM.option.bsm(r.type, S*(1+m), K, tt, rf, sigma).price)}));
    } else D.gaps.push('Model value: underlying price or implied volatility unavailable');
    D.price = D.k.mid; return D;
  }

  /* ----------------------------------- FX ----------------------------------- */
  async function fx(item){
    const s = await QXS.snapshot(item); const pair = String(s.sym.split(':')[1]||''); const base = pair.slice(0,3), quote = pair.slice(3,6);
    const D = {kind:'fx', item:s, gaps:[], generated:new Date(), base, quote, price:s.price, ccy:quote};
    await Promise.all([
      settle(D.gaps, 'ECB history', fetchFrankfurterHistory(base+quote).then(h=>{ D.series = {t:h.labels, c:h.data}; D.px = QXM.series.stats({t:h.labels, c:h.data}); })),
      settle(D.gaps, 'Reference rates', QXFREE.fxRates(base).then(j=>{ D.ref = j && j.rates ? j.rates[quote] : null; D.refTime = j && j.time_last_update_utc; })),
    ]);
    return D;
  }
  /* -------------------------- index / commodity / ETF-like -------------------------- */
  async function market(item){
    const s = await QXS.snapshot(item); const D = {kind:item.kind, item:s, gaps:[], generated:new Date(), price:s.price, ccy:s.ccy};
    const known = SECURITY_UNIVERSE.find(x=>LD.tvSymbol(x.t)===s.sym);
    if(known){ await settle(D.gaps, 'History', QXC.loadBars(known.t,'1D').then(B=>{ D.bars=B; D.series = {t:B.time.map(x=>new Date(x*1000).toISOString().slice(0,10)), c:B.close}; D.px = QXM.series.stats({t:B.time.map(x=>x*1000), c:B.close}); D.tech = technicals(B); })); }
    else D.gaps.push('History: this instrument has no free daily history feed — snapshot only');
    return D;
  }
  /* ------------------------------ Indian mutual funds ------------------------------ */
  async function mf_in(item){
    const code = String(item.sym).split(':')[1]; const D = {kind:'mf_in', item, gaps:[], generated:new Date(), ccy:'INR'};
    const j = await settle(D.gaps, 'NAV history (mfapi.in / AMFI)', cachedJson('qxmfn_'+code, 6*3600e3, async()=>{ const r = await fetchWithTimeout('https://api.mfapi.in/mf/'+code, {}, 15000); if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); }));
    if(j && j.data){
      D.meta = j.meta || {};
      const pts = j.data.map(p=>{ const [d,m,y] = String(p.date).split('-'); return {d:`${y}-${m}-${d}`, v:+p.nav}; }).filter(p=>p.v>0).sort((a,b)=>a.d<b.d?-1:1);
      D.series = {t:pts.map(p=>p.d), c:pts.map(p=>p.v)}; D.px = QXM.series.stats(D.series); D.price = D.px && D.px.last;
      const bm = await settle(D.gaps, 'Benchmark (NIFTY 50)', QXC.loadBars('NIFTY50','1D')); if(bm) D.benchmark = {t:'NIFTY50', series:{t:bm.time.map(x=>new Date(x*1000).toISOString().slice(0,10)), c:bm.close}};
    }
    return D;
  }
  const MAP = {equity, etf:equity, fund:equity, preferred:equity, crypto, bond, govbond:bond, future, option, fx, index:market, commodity:market, mf_in};
  async function collect(kind, ref){ const fn = MAP[kind]; if(!fn) throw new Error('No collector for '+kind); return fn(ref); }
  return {collect, equity, crypto, bond, future, option, fx, market, mf_in, technicals, stance, BENCH};
})();
