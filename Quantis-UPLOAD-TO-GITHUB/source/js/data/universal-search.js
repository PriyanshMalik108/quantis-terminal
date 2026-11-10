/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/data/universal-search.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   ONE search box → every asset class worldwide, in parallel:
 *             equity · preferred share · ETF · fund · depositary receipt   (TradingView "global")
 *             corporate bond / debenture (166k issues)                     (TradingView "bond")
 *             government bond                                              (TradingView "bonds")
 *             future (52k contracts)                                       (TradingView "futures")
 *             crypto asset (2.4k)                                          (TradingView "coin" + CoinGecko ids)
 *             FX pair                                                      (TradingView "forex")
 *             index / commodity CFD                                        (TradingView "cfd")
 *             Indian mutual fund scheme (every AMFI scheme)                (mfapi.in)
 *           Options are reached from an underlying's page (QXS.optionChain).
 * DEPENDS   LD.tvScan, cachedFetch, fetchWithTimeout, QXFREE (CoinGecko)
 * EXPOSES   QXS.{search(q, kinds), optionChain(underlyingTv, opts), snapshot(item), KINDS, kindOf(row,market)}
 * RESULT    {kind, sym(TV symbol or 'MFAPI:<code>'), name, exchange, price, ccy, changePct, mcap, country, logo, raw, market}
 * NOTE      TradingView returns null (not an error) for a column that does not exist in a market,
 *           so column lists can be generous. Each market query is independent — one failing
 *           market never hides the others.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const QXS = (() => {
  const KINDS = {
    equity:{label:'Stocks', icon:'▤'}, preferred:{label:'Preferred shares', icon:'◆'}, etf:{label:'ETFs', icon:'◫'}, fund:{label:'Funds', icon:'◩'},
    mf_in:{label:'Indian mutual funds', icon:'₹'}, bond:{label:'Corporate bonds & debentures', icon:'⊟'}, govbond:{label:'Government bonds', icon:'⊞'},
    future:{label:'Futures', icon:'⧗'}, option:{label:'Options', icon:'⌘'}, crypto:{label:'Crypto', icon:'₿'}, fx:{label:'Currencies', icon:'¤'},
    index:{label:'Indices', icon:'∑'}, commodity:{label:'Commodities & CFDs', icon:'⛁'},
  };
  const BOND_COLS = ['name','description','close','currency','country','coupon','current_coupon','maturity_date','yield_to_maturity','yield_to_worst','current_yield','modified_duration','macaulay_duration',
    'bond_snp_rating_lt','issuer_moodys_rating_lt','issuer_fitch_rating_lt','outstanding_amount','denom_min','coupon_frequency','days_to_maturity','bond_issuer_type','accrued_coupon_interest','bond_issuer_stock_symbol','change','exchange','bond_type_gen','call_next_date','call_next_price','maturity_type','coupon_type_general'];
  const MARKETS = [
    ['global', ['equity','preferred','etf','fund'], ['name','description','type','typespecs','exchange','close','currency','change','market_cap_basic','country','logoid','sector','industry','volume'], {sortBy:'market_cap_basic',sortOrder:'desc'}, 16],
    ['bond', ['bond'], BOND_COLS, {sortBy:'outstanding_amount',sortOrder:'desc'}, 10],
    ['bonds', ['govbond'], BOND_COLS, null, 6],
    ['futures', ['future'], ['name','description','close','currency','change','expiration','open_interest','exchange','volume','type'], {sortBy:'volume',sortOrder:'desc'}, 8],
    ['coin', ['crypto'], ['name','description','close','currency','change','market_cap_calc','circulating_supply','total_supply','max_supply','crypto_total_rank','volume','Perf.Y','base_currency_logoid','tvl'], {sortBy:'market_cap_calc',sortOrder:'desc'}, 8],
    ['forex', ['fx'], ['name','description','close','currency','change','exchange'], null, 6],
    ['cfd', ['index','commodity'], ['name','description','close','currency','change','exchange','type','typespecs'], null, 8],
  ];
  function kindOf(row, market){
    const ts = row.typespecs || [];
    if(market==='global'){ if(row.type==='fund') return ts.includes('etf') ? 'etf' : 'fund'; if(ts.includes('preferred')) return 'preferred'; return 'equity'; }
    if(market==='bond') return 'bond'; if(market==='bonds') return 'govbond'; if(market==='futures') return 'future'; if(market==='coin') return 'crypto'; if(market==='forex') return 'fx';
    if(market==='cfd') return /index|composite|average|nifty|sensex|s&p|dow|nasdaq|ftse|dax|cac|nikkei|hang seng|vix/i.test(row.description||'') || row.type==='index' ? 'index' : 'commodity';
    return 'equity';
  }
  const norm = (row, market) => {
    const kind = kindOf(row, market);
    const logoid = row.logoid || row.base_currency_logoid;
    return {kind, sym: row._s, name: row.description || row.name, exchange: String(row._s||'').split(':')[0], price: row.close, ccy: row.currency, changePct: row.change,
      mcap: row.market_cap_basic ?? row.market_cap_calc ?? null, country: row.country, logo: logoid ? `https://s3-symbol-logo.tradingview.com/${logoid}--big.svg` : null, raw: row, market};
  };
  async function tvMarket([mk, kinds, cols, sort, n], q){
    const body = {filter:[{left:'name,description', operation:'match', right:q}], columns:cols, range:[0,n]};
    if(mk==='global') body.filter.push({left:'is_primary', operation:'equal', right:true});
    if(sort) body.sort = sort;
    const {rows} = await LD.tvScan(mk, body);
    return rows.map(r=>norm(r, mk));
  }
  async function mfIndia(q){
    const j = await cachedJson('qxmfs_'+q.toLowerCase(), 6*3600e3, async () => { const r = await fetchWithTimeout('https://api.mfapi.in/mf/search?q='+encodeURIComponent(q), {}, 10000); if(!r.ok) throw new Error('mfapi HTTP '+r.status); return r.json(); });
    return (j||[]).slice(0,10).map(x=>({kind:'mf_in', sym:'MFAPI:'+x.schemeCode, name:x.schemeName, exchange:'AMFI', ccy:'INR', price:null, raw:x, market:'mfapi'}));
  }
  /** Search every market in parallel. kinds: optional array to restrict. Returns {items, errors}. */
  async function search(q, kinds){
    q = String(q||'').trim(); if(q.length < 2) return {items:[], errors:[]};
    const want = k => !kinds || !kinds.length || kinds.includes(k);
    const jobs = MARKETS.filter(m=>m[1].some(want)).map(m => tvMarket(m, q).then(items=>items.filter(i=>want(i.kind))).catch(e=>({error:m[0]+': '+e.message})));
    if(want('mf_in')) jobs.push(mfIndia(q).catch(e=>({error:'mfapi: '+e.message})));
    const res = await Promise.all(jobs);
    const items = [], errors = [];
    res.forEach(r => Array.isArray(r) ? items.push(...r) : errors.push(r.error));
    // exact symbol matches first, then larger issues
    const Q = q.toUpperCase();
    items.sort((a,b)=> (String(b.sym).split(':')[1]===Q) - (String(a.sym).split(':')[1]===Q));
    return {items, errors};
  }
  /** Live option chain for an underlying TradingView symbol (e.g. NASDAQ:AAPL). Includes IV and Greeks. */
  async function optionChain(underlyingTv, {expiry=null, n=400} = {}){
    const filter = [{left:'type', operation:'equal', right:'option'}];
    if(expiry) filter.push({left:'expiration', operation:'equal', right:+expiry});
    else filter.push({left:'expiration', operation:'egreater', right:+new Date().toISOString().slice(0,10).replace(/-/g,'')});
    const {rows, total} = await LD.tvScan('options', {filter, index_filters:[{name:'underlying_symbol', values:[underlyingTv]}],
      columns:['name','description','close','strike','expiration','option-type','iv','delta','gamma','theta','vega','rho','bid','ask','volume','open_interest','theoPrice','currency'], sort:{sortBy:'expiration',sortOrder:'asc'}, range:[0,n]});
    return {total, rows: rows.map(r=>({sym:r._s, type:r['option-type'], strike:r.strike, expiry:r.expiration, last:r.close, bid:r.bid, ask:r.ask, iv:r.iv, delta:r.delta, gamma:r.gamma, theta:r.theta, vega:r.vega, rho:r.rho, volume:r.volume, oi:r.open_interest, theo:r.theoPrice, ccy:r.currency}))};
  }
  /** Fresh snapshot for one search item (re-queries its own market by symbol). */
  async function snapshot(item){
    if(item.kind==='mf_in') return item;
    const m = MARKETS.find(x=>x[0]===item.market) || MARKETS[0];
    const markets = item.market==='global' ? (LD.tvMarketsFor(item.sym)) : [item.market];
    for(const mk of markets){ try{ const {rows} = await LD.tvScan(mk, {symbols:{tickers:[item.sym]}, columns:m[2]}); if(rows.length) return {...item, ...norm(rows[0], item.market), market:item.market}; }catch(e){} }
    return item;
  }
  return {search, optionChain, snapshot, KINDS, kindOf, MARKETS};
})();
