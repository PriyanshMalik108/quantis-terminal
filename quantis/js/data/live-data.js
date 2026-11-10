/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/data/live-data.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   LD — the keyless live-data layer: CNBC quotes & bars, TradingView scanner (fundamentals, peers, screening), CNBC search & news, BLS, DBnomics. All endpoints are CORS-open and need no key.
 * DEPENDS   core/*
 * EXPOSES   LD.{quote,quotes,bars,tvScan,fundamentals,sectorPeers,searchLive,news,...} (global — classic script, shared scope)
 * LOAD      Classic <script>, order defined in js/manifest.json. Top-level code runs at load,
 *           so it may only call functions from files listed EARLIER in the manifest.
 * NOTE      Migrated verbatim from the single-file build; inline comments marked
 *           "REAL BUG FIXED" / "post-launch fix" document past defects — keep them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* ===================== KEYLESS LIVE DATA LAYER (v3) =====================
   Why this exists: every free public CORS proxy this app used to route Yahoo Finance / SEC /
   Google News through (corsfix, allorigins, codetabs, x2u, corsproxy.io, thingproxy) is now
   either dead or paywalled, and Yahoo/SEC refuse direct browser requests. On a real deployed
   page that meant nearly every equity feature silently fell back to SAMPLE numbers.
   These providers were verified (Oct 2026) to answer DIRECT browser requests with open CORS,
   with no key and no proxy:
     • CNBC quote + chart services — live quotes, key fundamentals, ~10y daily OHLC for US/India/
       Europe/Japan/Korea/HK/Australia equities, ETFs, US funds, indices, futures, FX, crypto, yields
     • TradingView scanner — fundamentals, 20-year statement history, analyst consensus, earnings
       and dividend dates, sector data and screening across every listed market, vector logos
     • CNBC symbol lookup + news search, BLS (CPI, unemployment), DBnomics (GDP, Fed funds),
       Frankfurter/ECB (FX), CoinGecko (crypto), World Bank, CFTC, Wikipedia, Alternative.me
   Everything here is cached (localStorage, with stale-cache fallback) through cachedFetch(). */
const LD = (()=>{
  const TIMEOUT = 12000;
  const tfetch = (url, opts) => (typeof fetchWithTimeout === 'function'
    ? fetchWithTimeout(url, Object.assign({mode:'cors'}, opts||{}), TIMEOUT)
    : fetch(url, opts));
  const getJson = async (url, opts) => {
    const r = await tfetch(url, opts);
    if(!r.ok) throw new Error('HTTP '+r.status);
    return r.json();
  };
  /* CNBC formats numbers as strings: "14.59B", "148.19%", "62,399.00", "-0.94". */
  function num(v){
    if(v==null || v==='' || v==='--' || v==='N/A') return null;
    if(typeof v === 'number') return isFinite(v) ? v : null;
    const s = String(v).trim().replace(/,/g,'');
    const m = s.match(/^([+-]?[\d.]+)\s*([KMBT%])?$/i);
    if(!m) return null;
    let n = parseFloat(m[1]); if(!isFinite(n)) return null;
    const u = (m[2]||'').toUpperCase();
    if(u==='K') n*=1e3; else if(u==='M') n*=1e6; else if(u==='B') n*=1e9; else if(u==='T') n*=1e12;
    return n;
  }
  const pad = n => String(n).padStart(2,'0');
  const cnbcStamp = d => `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}000000`;

  /* ---------- symbol mapping ---------- */
  const CNBC_EXPLICIT = {
    'BRK.B':'BRK.B','BP':'BP.-GB','TATAMOTORS':'TMPV-IN','NOVN':'NOV.N-CH',
    'SPX':'.SPX','DJI':'.DJI','NDX':'.NDX','RUT':'.RUT','NIFTY50':'.NSEI','SENSEX':'.BSESN','FTSE100':'.FTSE','DAX':'.GDAXI',
    'CAC40':'.FCHI','NIKKEI225':'.N225','HANGSENG':'.HSI','ASX200':'.AXJO','KOSPI':'.KS11','STOXX50':'.STOXX50E','VIX':'.VIX',
    'GOLD':'@GC.1','SILVER':'@SI.1','WTI':'@CL.1','BRENT':'@LCO.1',
    'ES':'@SP.1','NQ':'@ND.1','RTY':'@TFS.1','YM':'@DJ.1','ZC':'@C.1','ZW':'@W.1','ZS':'@S.1','ZB':'@US.1','NG':'@NG.1','HG':'@HG.1',
    'BTC':'BTC.CM=','ETH':'ETH.CM=','SOL':'SOL.CM=','XRP':'XRP.CM=','ADA':'ADA.CM=','DOGE':'DOGE.CM=','BNB':'BNB.CM=','AVAX':'AVAX.CM=','DOT':'DOT.CM=','LTC':'LTC.CM=',
    'EURUSD':'EUR=','USDINR':'INR=','GBPUSD':'GBP=',
    'TCEHY':'TCEHY',
    // NSE futures/options: CNBC carries no NSE derivatives, so price history resolves to the
    // underlying cash index/stock (disclosed as "underlying spot" wherever it's shown).
    'NIFTYFUT':'.NSEI','NIFTYOPT':'.NSEI','BANKNIFTYFUT':'NIFTYBANK','BANKNIFTYOPT':'NIFTYBANK','FINNIFTYFUT':'.NIFTYFIN',
    'RELIANCEFUT':'RELIANCE-IN','RELIANCEOPT':'RELIANCE-IN','HDFCBANKFUT':'HDFCBANK-IN','HDFCBANKOPT':'HDFCBANK-IN','HDFCFUT':'HDFCBANK-IN',
    'TCSFUT':'TCS-IN','INFYFUT':'INFY-IN','SBINFUT':'SBIN-IN','ICICIBANKFUT':'ICICIBANK-IN','TATAMOTORSFUT':'TMPV-IN',
  };
  const CNBC_SUFFIX = {'NSE':'-IN','BSE':'-IN','LSE':'-GB','XETRA':'-DE','Euronext Paris':'-FR','Euronext Amsterdam':'-NL','SIX':'-CH','TSE':'.T-JP','KRX':'-KR','HKEX':'-HK','ASX':'-AU'};
  const TV_EXCHANGE = {'NASDAQ':'NASDAQ','NYSE':'NYSE','NYSE Arca':'AMEX','NSE':'NSE','BSE':'BSE','LSE':'LSE','XETRA':'XETR','Euronext Paris':'EURONEXT','Euronext Amsterdam':'EURONEXT','SIX':'SIX','TSE':'TSE','KRX':'KRX','HKEX':'HKEX','ASX':'ASX'};
  const TV_EXPLICIT = {'WMT':'NASDAQ:WMT','BP':'LSE:BP.','ARKK':'CBOE:ARKK','INDA':'CBOE:INDA','TATAMOTORS':'NSE:TMPV','TCEHY':'OTC:TCEHY',
    'SPX':'SP:SPX','DJI':'DJ:DJI','NDX':'NASDAQ:NDX','RUT':'TVC:RUT','NIFTY50':'NSE:NIFTY','SENSEX':'BSE:SENSEX','FTSE100':'TVC:UKX','DAX':'XETR:DAX',
    'CAC40':'EURONEXT:PX1','NIKKEI225':'TVC:NI225','HANGSENG':'TVC:HSI','KOSPI':'TVC:KOSPI','STOXX50':'TVC:SX5E','VIX':'TVC:VIX',
    'NIFTYFUT':'NSE:NIFTY1!','BANKNIFTYFUT':'NSE:BANKNIFTY1!','FINNIFTYFUT':'NSE:FINNIFTY1!','RELIANCEFUT':'NSE:RELIANCE1!','HDFCBANKFUT':'NSE:HDFCBANK1!',
    'HDFCFUT':'NSE:HDFCBANK1!','TCSFUT':'NSE:TCS1!','INFYFUT':'NSE:INFY1!','SBINFUT':'NSE:SBIN1!','ICICIBANKFUT':'NSE:ICICIBANK1!','TATAMOTORSFUT':'NSE:TMPV',
    // NSE options have no single TradingView symbol; fundamentals/quotes resolve to the underlying.
    'NIFTYOPT':'NSE:NIFTY','BANKNIFTYOPT':'NSE:BANKNIFTY','HDFCBANKOPT':'NSE:HDFCBANK','RELIANCEOPT':'NSE:RELIANCE'};
  function metaFor(t){
    return (typeof SECURITIES!=='undefined' && SECURITIES.find(x=>x.t===t))
      || (typeof SECURITY_UNIVERSE!=='undefined' && SECURITY_UNIVERSE.find(x=>x.t===t)) || null;
  }
  function cnbcSymbol(t){
    const m = metaFor(t);
    if(m && m._cnbc) return m._cnbc;
    if(CNBC_EXPLICIT[t]) return CNBC_EXPLICIT[t];
    if(!m) return null;
    if(m.ex in CNBC_SUFFIX){ const base = m.ex==='HKEX' ? t.replace(/^0+/,'') : t; return base + CNBC_SUFFIX[m.ex]; }
    if(['NASDAQ','NYSE','NYSE Arca','Mutual Fund'].includes(m.ex)) return t;
    return null;
  }
  function tvSymbol(t){
    const m = metaFor(t);
    if(m && m._tv) return m._tv;
    if(TV_EXPLICIT[t]) return TV_EXPLICIT[t];
    if(!m) return null;
    const e = TV_EXCHANGE[m.ex]; if(!e) return null;
    return e + ':' + (m.ex==='HKEX' ? t.replace(/^0+/,'') : t);
  }
  /* TradingView "EXCHANGE:SYM" -> CNBC symbol, for securities discovered through the screener. */
  const TV_TO_CNBC_SUFFIX = {NSE:'-IN',BSE:'-IN',LSE:'-GB',XETR:'-DE',FWB:'-DE',EURONEXT:null,SIX:'-CH',TSE:'.T-JP',KRX:'-KR',HKEX:'-HK',ASX:'-AU',TSX:'-CA'};
  function cnbcFromTv(tvSym, country){
    const [ex, sym] = tvSym.split(':');
    if(['NASDAQ','NYSE','AMEX','CBOE','ARCA','OTC','NYSE ARCA'].includes(ex)) return sym.replace(/\//g,'.');
    if(ex==='EURONEXT'){ const c = {France:'-FR',Netherlands:'-NL',Belgium:'-BE',Portugal:'-PT'}[country]; return c ? sym+c : null; }
    const suf = TV_TO_CNBC_SUFFIX[ex];
    return suf ? sym + suf : null;
  }
  const TV_EX_LABEL = {NASDAQ:'NASDAQ',NYSE:'NYSE',AMEX:'NYSE Arca',CBOE:'Cboe',NSE:'NSE',BSE:'BSE',LSE:'LSE',XETR:'XETRA',EURONEXT:'Euronext',SIX:'SIX',TSE:'TSE',KRX:'KRX',HKEX:'HKEX',ASX:'ASX',TSX:'TSX',OTC:'OTC'};

  /* ---------- CNBC: history ---------- */
  async function barsLive(sym, years){
    const end = new Date(Date.now()+2*864e5), start = new Date(Date.now()-(years||10)*365.25*864e5);
    const url = `https://ts-api.cnbc.com/harmony/app/bars/${encodeURIComponent(sym)}/1D/${cnbcStamp(start)}/${cnbcStamp(end)}/adjusted/EST5EDT.json`;
    const j = await getJson(url);
    const bars = j?.barData?.priceBars || [];
    const labels=[], data=[], open=[], high=[], low=[], volume=[];
    for(const b of bars){
      const c = num(b.close); if(c==null || c<=0) continue;
      const t = String(b.tradeTime||'');
      labels.push(t.length>=8 ? `${t.slice(0,4)}-${t.slice(4,6)}-${t.slice(6,8)}` : new Date(b.tradeTimeinMills).toISOString().slice(0,10));
      data.push(c); open.push(num(b.open)??c); high.push(num(b.high)??c); low.push(num(b.low)??c); volume.push(+b.volume||0);
    }
    if(data.length < 5) throw new Error('CNBC returned too little history for '+sym);
    return {labels, data, ohlc:{open, high, low, close:data}, volume, lastDate: labels[labels.length-1],
      lastClose: data[data.length-1], prevClose: data[data.length-2], via:'CNBC', name: j?.barData?.companyName || null};
  }
  async function bars(sym, years){
    if(typeof cachedFetch === 'function') return cachedFetch('cnbcbars_'+sym+'_'+(years||10), 30*60*1000, ()=>barsLive(sym, years));
    return barsLive(sym, years);
  }

  /* ---------- CNBC: batch quotes ---------- */
  async function quotesLive(syms){
    const out = {};
    const uniq = [...new Set(syms.filter(Boolean))];
    for(let i=0;i<uniq.length;i+=40){
      const chunk = uniq.slice(i,i+40);
      const url = 'https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols='+encodeURIComponent(chunk.join('|'))+'&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json';
      const j = await getJson(url);
      [].concat(j?.FormattedQuoteResult?.FormattedQuote || []).forEach(q=>{
        const last = num(q.last);
        if(last==null || last<=0) return;
        const prev = num(q.previous_day_closing);
        const chg = num(q.change) ?? (prev!=null ? last-prev : null);
        out[q.symbol] = {
          symbol:q.symbol, name:q.name||q.shortName, last, prev: prev ?? (chg!=null ? last-chg : null), chg,
          chgPct: num(q.change_pct) ?? (prev ? (last/prev-1)*100 : null), currency:q.currencyCode||null,
          open:num(q.open), high:num(q.high), low:num(q.low), volume:num(q.volume),
          pe:num(q.pe), fpe:num(q.fpe), eps:num(q.eps), feps:num(q.feps), beta:num(q.beta), divYieldPct:num(q.dividendyield),
          dividend:num(q.dividend), mktcap:num(q.mktcapView), sharesOut:num(q.sharesout), revenueTtm:num(q.revenuettm),
          ps:num(q.psales), roePct:num(q.ROETTM), netMarginPct:num(q.NETPROFTTM), grossMarginPct:num(q.GROSMGNTTM),
          debtEquityPct:num(q.DEBTEQTYQ), ebitda:num(q.TTMEBITD), hi52:num(q.yrhiprice), lo52:num(q.yrloprice),
          time:q.last_time||q.last_timedate||null, status:q.curmktstatus||null, exchange:q.exchange||null,
        };
      });
    }
    // CNBC's quote service doesn't price a few listings it still has history for (Korean stocks,
    // the BSE Sensex). Fill any gaps from TradingView so every instrument shows a live price.
    const missing = uniq.filter(sym=>!out[sym]);
    if(missing.length){
      const pool = [].concat(typeof SECURITIES!=='undefined' ? SECURITIES : [], typeof SECURITY_UNIVERSE!=='undefined' ? SECURITY_UNIVERSE : []);
      const tvFor = {};
      missing.forEach(sym=>{ const m = pool.find(x=>x && cnbcSymbol(x.t)===sym); const tv = m ? tvSymbol(m.t) : null; if(tv) tvFor[tv] = {sym, ccy: m.ccy || null}; });
      const tvSyms = Object.keys(tvFor);
      if(tvSyms.length){
        try{
          const {rows} = await tvScan('global', {symbols:{tickers:tvSyms}, columns:['close','change','change_abs','open','high','low','volume','price_52_week_high','price_52_week_low','currency','description']});
          rows.forEach(r=>{
            const info = tvFor[r._s]; if(!info || !(r.close>0)) return;
            const chg = r.change_abs ?? null, prev = chg!=null ? r.close - chg : null;
            out[info.sym] = {symbol:info.sym, name:r.description, last:r.close, prev, chg, chgPct:r.change ?? null, currency:r.currency || info.ccy,
              open:r.open ?? null, high:r.high ?? null, low:r.low ?? null, volume:r.volume ?? null, hi52:r.price_52_week_high ?? null, lo52:r.price_52_week_low ?? null,
              time:new Date().toISOString(), status:null, exchange:null, via:'TradingView'};
          });
        }catch(e){ /* leave the gap; callers already handle a missing quote */ }
      }
    }
    return out;
  }
  async function quotes(syms){ return quotesLive(syms); }
  async function quote(sym){ const m = await quotes([sym]); return m[sym] || null; }

  /* ---------- TradingView scanner ---------- */
  async function tvScan(market, body){
    const r = await tfetch('https://scanner.tradingview.com/'+(market||'global')+'/scan', {method:'POST', body: JSON.stringify(body)});
    if(!r.ok) throw new Error('TradingView HTTP '+r.status);
    const j = await r.json();
    if(j.error) throw new Error('TradingView: '+j.error);
    const cols = body.columns || [];
    return {total: j.totalCount, rows: (j.data||[]).map(x=>{ const o={_s:x.s}; cols.forEach((c,i)=>o[c]=x.d[i]); return o; })};
  }
  const FUND_COLS = ['description','currency','fundamental_currency_code','market_cap_basic','price_earnings_ttm','price_earnings_forward_fy','price_earnings_growth_ttm',
    'price_book_fq','price_sales_current','enterprise_value_ebitda_ttm','enterprise_value_current','earnings_per_share_diluted_ttm','net_margin','gross_margin',
    'operating_margin','return_on_equity','return_on_assets','return_on_invested_capital','debt_to_equity','current_ratio','quick_ratio','dividends_yield_current',
    'dividend_payout_ratio_ttm','dps_common_stock_prim_issue_fy','ex_dividend_date_upcoming','ex_dividend_date_recent','beta_1_year','beta_5_year',
    'price_52_week_high','price_52_week_low','total_revenue_ttm','total_revenue_yoy_growth_ttm','earnings_release_next_date','earnings_per_share_forecast_next_fq',
    'revenue_forecast_next_fq','price_target_average','price_target_high','price_target_low','recommendation_total','recommendation_buy','recommendation_over',
    'recommendation_hold','recommendation_under','recommendation_sell','sector','industry','country','exchange','type','logoid','total_shares_outstanding_fundamental',
    'free_cash_flow_ttm','total_debt','cash_n_equivalents_fq','total_liabilities_fq','total_equity_fq','cash_n_short_term_invest_fq','cash_f_operating_activities_fy',
    'capital_expenditures_fy','free_cash_flow_fy','fiscal_period_fy_h','total_revenue_fy_h','net_income_fy_h','gross_profit_fy_h','ebitda_fy_h',
    'earnings_per_share_diluted_fy_h','free_cash_flow_fy_h','total_assets_fy_h','total_debt_fy_h','number_of_employees','close','change','RSI','Perf.Y',
    'expense_ratio','aum','brand'];
  const d100 = v => v==null ? null : v/100;
  const unix = v => (typeof v==='number' && v>0) ? new Date(v*1000) : null;
  function recFromCounts(r){
    const b=r.recommendation_buy||0, o=r.recommendation_over||0, h=r.recommendation_hold||0, u=r.recommendation_under||0, s=r.recommendation_sell||0;
    const tot = b+o+h+u+s; if(!tot) return null;
    const mean = (1*b+2*o+3*h+4*u+5*s)/tot;
    const key = mean<1.5?'strong_buy':mean<2.5?'buy':mean<3.5?'hold':mean<4.5?'underperform':'sell';
    return {mean, key, tot, counts:{strongBuy:b, buy:o, hold:h, underperform:u, sell:s}};
  }
  function normalizeFundamentals(r){
    const rec = recFromCounts(r);
    const years = Array.isArray(r.fiscal_period_fy_h) ? r.fiscal_period_fy_h.map(String) : [];
    const arr = k => Array.isArray(r[k]) ? r[k] : [];
    const statements = years.length ? {
      years, currency: r.fundamental_currency_code || r.currency,
      revenue: arr('total_revenue_fy_h'), netIncome: arr('net_income_fy_h'), grossProfit: arr('gross_profit_fy_h'),
      ebitda: arr('ebitda_fy_h'), eps: arr('earnings_per_share_diluted_fy_h'), fcf: arr('free_cash_flow_fy_h'),
      totalAssets: arr('total_assets_fy_h'), totalDebt: arr('total_debt_fy_h'),
    } : null;
    const nextEarn = unix(r.earnings_release_next_date);
    const exDiv = unix(r.ex_dividend_date_upcoming) || unix(r.ex_dividend_date_recent);
    return {
      via:'TradingView', source:'TradingView', entityName: r.description || r._s, currency: r.currency || 'USD',
      fundamentalCurrency: r.fundamental_currency_code || r.currency || 'USD', tvSymbol: r._s,
      marketCap: r.market_cap_basic, pe: r.price_earnings_ttm, forwardPe: r.price_earnings_forward_fy, pegRatio: r.price_earnings_growth_ttm,
      priceToBook: r.price_book_fq, priceToSales: r.price_sales_current, evEbitda: r.enterprise_value_ebitda_ttm, enterpriseValue: r.enterprise_value_current,
      eps: r.earnings_per_share_diluted_ttm, profitMargin: d100(r.net_margin), grossMargin: d100(r.gross_margin), operatingMargin: d100(r.operating_margin),
      roe: d100(r.return_on_equity), roa: d100(r.return_on_assets), roic: d100(r.return_on_invested_capital),
      revenue: r.total_revenue_ttm, revenueGrowth: d100(r.total_revenue_yoy_growth_ttm),
      debtToEquity: r.debt_to_equity, currentRatio: r.current_ratio, quickRatio: r.quick_ratio,
      dividendYield: d100(r.dividends_yield_current), beta: r.beta_5_year ?? r.beta_1_year,
      fiftyTwoWkHigh: r.price_52_week_high, fiftyTwoWkLow: r.price_52_week_low,
      sharesOut: r.total_shares_outstanding_fundamental, fcfTtm: r.free_cash_flow_ttm, totalDebt: r.total_debt,
      cash: r.cash_n_short_term_invest_fq ?? r.cash_n_equivalents_fq, totalLiabilities: r.total_liabilities_fq, totalEquity: r.total_equity_fq,
      opCashFlowFy: r.cash_f_operating_activities_fy, capexFy: r.capital_expenditures_fy, fcfFy: r.free_cash_flow_fy,
      sector: r.sector, industry: r.industry, country: r.country, exchange: r.exchange, type: r.type, logoid: r.logoid,
      employees: r.number_of_employees, price: r.close, changePct: r.change, rsi: r.RSI, perf1y: r['Perf.Y'],
      expenseRatio: r.expense_ratio, aum: r.aum, brand: r.brand,
      statements,
      earnings: nextEarn ? {nextDate: nextEarn, dateRange:[nextEarn,nextEarn], epsEstimate: r.earnings_per_share_forecast_next_fq ?? null,
        epsLow:null, epsHigh:null, revenueEstimate: r.revenue_forecast_next_fq ?? null} : null,
      analyst: (r.price_target_average!=null || rec) ? {targetMean: r.price_target_average ?? null, targetHigh: r.price_target_high ?? null,
        targetLow: r.price_target_low ?? null, numAnalysts: rec ? rec.tot : (r.recommendation_total ?? null), recKey: rec ? rec.key : null,
        recMean: rec ? rec.mean : null, counts: rec ? rec.counts : null, shortRatio:null, shortPctFloat:null} : null,
      dividend: (r.dps_common_stock_prim_issue_fy || r.dividends_yield_current || exDiv) ? {rate: r.dps_common_stock_prim_issue_fy ?? null,
        yieldPct: d100(r.dividends_yield_current), payoutRatio: d100(r.dividend_payout_ratio_ttm), fiveYrAvgYield:null, exDivDate: exDiv} : null,
    };
  }
  const TV_MARKETS_BY_PREFIX = {NSE:['india'],BSE:['india'],NASDAQ:['america'],NYSE:['america'],AMEX:['america'],CBOE:['america'],OTC:['america'],
    LSE:['uk'],XETR:['germany'],FWB:['germany'],SIX:['switzerland'],TSE:['japan'],KRX:['korea'],HKEX:['hongkong'],ASX:['australia'],TSX:['canada'],
    EURONEXT:['france','netherlands','belgium','portugal']};
  function tvMarketsFor(tvSym){ return (TV_MARKETS_BY_PREFIX[String(tvSym||'').split(':')[0]] || []).concat(['global']); }
  async function fundamentalsLive(tvSym){
    let rows = [];
    for(const mk of tvMarketsFor(tvSym)){
      try{ ({rows} = await tvScan(mk, {symbols:{tickers:[tvSym]}, columns: FUND_COLS})); }catch(e){ rows = []; }
      if(rows.length) break;
    }
    if(!rows.length) throw new Error('TradingView has no record for '+tvSym);
    const y = normalizeFundamentals(rows[0]);
    if(y.marketCap==null && y.pe==null && !y.statements && y.expenseRatio==null) throw new Error('TradingView returned no fundamentals for '+tvSym);
    return y;
  }
  async function fundamentals(tvSym){
    if(typeof cachedFetch === 'function') return cachedFetch('tvfund2_'+tvSym, 6*60*60*1000, ()=>fundamentalsLive(tvSym));
    return fundamentalsLive(tvSym);
  }
  function median(a){ const v=a.filter(x=>typeof x==='number' && isFinite(x) && x>0).sort((p,q)=>p-q); if(!v.length) return null; const m=Math.floor(v.length/2); return v.length%2?v[m]:(v[m-1]+v[m])/2; }
  const TV_MARKET_BY_COUNTRY = {'United States':'america','India':'india','United Kingdom':'uk','Germany':'germany','France':'france','Netherlands':'netherlands',
    'Switzerland':'switzerland','Japan':'japan','Korea, Republic of':'korea','South Korea':'korea','Hong Kong':'hongkong','China':'china','Australia':'australia','Canada':'canada','Taiwan':'taiwan'};
  async function sectorPeersLive(sector, country){
    const market = TV_MARKET_BY_COUNTRY[country] || 'global';
    const filter = [{left:'sector',operation:'equal',right:sector},{left:'type',operation:'equal',right:'stock'},{left:'is_primary',operation:'equal',right:true}];
    if(market==='global' && country) filter.push({left:'country',operation:'equal',right:country});
    const {rows} = await tvScan(market, {filter, columns:['name','description','price_earnings_ttm','price_book_fq','price_sales_current','enterprise_value_ebitda_ttm','return_on_equity','net_margin','market_cap_basic','price_earnings_forward_fy','price_earnings_growth_ttm'],
      sort:{sortBy:'market_cap_basic',sortOrder:'desc'}, range:[0,40]});
    if(rows.length < 3) throw new Error('Too few sector peers on TradingView');
    return {sector, country, market, n: rows.length, via:'TradingView',
      pe: median(rows.map(r=>r.price_earnings_ttm)), pb: median(rows.map(r=>r.price_book_fq)), ps: median(rows.map(r=>r.price_sales_current)),
      evEbitda: median(rows.map(r=>r.enterprise_value_ebitda_ttm)), fpe: median(rows.map(r=>r.price_earnings_forward_fy)), peg: median(rows.map(r=>r.price_earnings_growth_ttm)), roe: median(rows.map(r=>r.return_on_equity)), netMargin: median(rows.map(r=>r.net_margin)),
      peers: rows.slice(0,8).map(r=>({sym:r._s, name:r.description||r.name, pe:r.price_earnings_ttm, mcap:r.market_cap_basic}))};
  }
  async function sectorPeers(sector, country){
    if(typeof cachedFetch === 'function') return cachedFetch('tvpeers2_'+sector+'_'+country, 12*60*60*1000, ()=>sectorPeersLive(sector, country));
    return sectorPeersLive(sector, country);
  }

  /* ---------- search, news ---------- */
  async function searchLive(q){
    const j = await getJson('https://symlookup.cnbc.com/symservice/symlookup.do?prefix='+encodeURIComponent(q)+'&partnerid=20064&pgok=1&pgsize=12');
    return (Array.isArray(j) ? j.slice(1) : []).filter(x=>x && x.symbolName).map(x=>({cnbc:x.symbolName, name:x.companyName||x.symbolName,
      type:x.issueType||'', exchange:x.exchangeName||'', country:x.countryCode||''}));
  }
  async function newsLive(query){
    const j = await getJson('https://api.queryly.com/cnbc/json.aspx?queryly_key=31a35d40a9a64ab3&query='+encodeURIComponent(query)+'&endindex=0&batchsize=20&sort=date');
    return (j?.results||[]).map(r=>({title: r['cn:title'] || r.description || '', summary: r.summary || r.description || '', url: r.url || r['cn:liveURL'] || '',
      date: r.datePublished ? new Date(r.datePublished.replace(/\+0000$/,'Z')) : (r._pubDate ? new Date(r._pubDate*1000) : null),
      source: r['cn:branding'] ? String(r['cn:branding']).toUpperCase()==='CNBC' ? 'CNBC' : r['cn:branding'] : 'CNBC', section: r.section || ''})).filter(n=>n.title);
  }
  async function news(query){
    if(typeof cachedFetch === 'function') return cachedFetch('cnbcnews_'+query.toLowerCase(), 20*60*1000, async()=>({items: await newsLive(query), via:'CNBC'}));
    return {items: await newsLive(query), via:'CNBC'};
  }

  /* ---------- macro ---------- */
  async function blsLive(seriesId){
    const j = await getJson('https://api.bls.gov/publicAPI/v2/timeseries/data/'+encodeURIComponent(seriesId));
    if(j.status !== 'REQUEST_SUCCEEDED') throw new Error('BLS: '+(j.message||[]).join(' ').slice(0,120));
    const data = (j?.Results?.series?.[0]?.data || []).filter(d=>/^M\d\d$/.test(d.period) && d.period!=='M13')
      .map(d=>({period:`${d.year}-${d.period.slice(1)}`, label:`${d.periodName} ${d.year}`, value: parseFloat(d.value)})).filter(d=>isFinite(d.value));
    if(!data.length) throw new Error('BLS returned no observations for '+seriesId);
    return {data, via:'U.S. Bureau of Labor Statistics'}; // newest first
  }
  async function bls(seriesId){
    if(typeof cachedFetch === 'function') return cachedFetch('bls_'+seriesId, 12*60*60*1000, ()=>blsLive(seriesId));
    return blsLive(seriesId);
  }
  async function dbnomicsLive(id){
    const j = await getJson('https://api.db.nomics.world/v22/series/'+id+'?observations=1');
    const d = j?.series?.docs?.[0];
    if(!d || !d.period || !d.period.length) throw new Error('DBnomics: no data for '+id);
    const pts = d.period.map((p,i)=>({period:p, value: typeof d.value[i]==='number' ? d.value[i] : parseFloat(d.value[i])})).filter(x=>isFinite(x.value));
    return {data: pts, name: d.series_name || id, via:'DBnomics'}; // oldest first
  }
  async function dbnomics(id){
    if(typeof cachedFetch === 'function') return cachedFetch('dbn_'+id, 12*60*60*1000, ()=>dbnomicsLive(id));
    return dbnomicsLive(id);
  }

  /* ---------- logos ---------- */
  const TV_LOGO = {"6758":"sony","7203":"toyota","7974":"nintendo","9984":"softbank","9988":"alibaba","GOOGL":"alphabet","GOOG":"alphabet","META":"meta-platforms",
    "TSLA":"tesla","BRK.B":"berkshire-hathaway","JPM":"jpmorgan-chase","V":"visa","MA":"mastercard","UNH":"unitedhealth","JNJ":"johnson-and-johnson","LLY":"eli-lilly",
    "PFE":"pfizer","XOM":"exxon","CVX":"chevron","WMT":"walmart","HD":"home-depot","PG":"procter-and-gamble","KO":"coca-cola","PEP":"pepsico","COST":"costco-wholesale",
    "MCD":"mcdonalds","NKE":"nike","DIS":"walt-disney","NFLX":"netflix","ADBE":"adobe","CRM":"salesforce","ORCL":"oracle","IBM":"international-bus-mach","INTC":"intel",
    "AMD":"advanced-micro-devices","QCOM":"qualcomm","TXN":"texas-instruments","AVGO":"broadcom","CSCO":"cisco","PYPL":"paypal","UBER":"uber","ABNB":"airbnb","BA":"boeing",
    "CAT":"caterpillar","GE":"ge-aerospace","GS":"golden-sachs-etf-trust-goldman","MS":"morgan-stanley","BAC":"bank-of-america","WFC":"wells-fargo","C":"citigroup","F":"ford",
    "GM":"general-motors","SBUX":"starbucks","T":"at-and-t","VZ":"verizon","SPY":"spdr-sandp500-etf-tr","QQQ":"invesco","VOO":"vanguard","HDFCBANK":"hdfc-bank",
    "ICICIBANK":"icici-bank","INFY":"infosys","HINDUNILVR":"unilever","ITC":"itc","SBIN":"state-bank","BHARTIARTL":"airtel","LT":"larsen-and-toubro",
    "KOTAKBANK":"kotak-mahindra-ast","AXISBANK":"axis-bank","ASIANPAINT":"asian-paints","MARUTI":"maruti-suzuki-india","TATAMOTORS":"tata","WIPRO":"wipro",
    "HCLTECH":"hcl-technologies","SUNPHARMA":"sun-pharmaceutical","ADANIENT":"adani","NTPC":"ntpc","ONGC":"oil-and-natural-gas","TITAN":"titan-company","HSBA":"hsbc",
    "BP":"bp","SHEL":"shell","ULVR":"unilever","AZN":"astrazeneca","GSK":"glaxosmithkline","BARC":"barclays","VOD":"vodafone","SAP":"sap","SIE":"siemens",
    "VOW3":"volkswagen","MC":"lvmh","OR":"l-oreal","NESN":"nestle","NOVN":"novartis","ASML":"asml","005930":"samsung","BABA":"alibaba","JD":"jd-com","PDD":"pinduoduo",
    "TCEHY":"tencent","0700":"tencent","TSM":"taiwan-semiconductor","BHP":"bhp","CBA":"commonwealth-bank","VTI":"vanguard","IVV":"ishares","IWM":"ishares",
    "DIA":"spdr-sandp500-etf-tr","EEM":"ishares","EFA":"ishares","VEA":"vanguard","GLD":"spdr-sandp500-etf-tr","SLV":"ishares","XLK":"spdr-sandp500-etf-tr",
    "XLF":"spdr-sandp500-etf-tr","XLE":"spdr-sandp500-etf-tr","XLV":"spdr-sandp500-etf-tr","VNQ":"vanguard","ARKK":"ark-etf-tr","EWJ":"ishares","FXI":"ishares",
    "INDA":"ishares","NIFTYBEES":"nippon-life-india-asset","GOLDBEES":"nippon-life-india-asset","BANKBEES":"nippon-life-india-asset","AGG":"ishares","BND":"vanguard",
    "TLT":"ishares","IEF":"ishares","SHY":"ishares","LQD":"ishares","HYG":"ishares","TIP":"ishares","SPX":"indices/s-and-p-500","DJI":"indices/dow-30",
    "NDX":"indices/nasdaq-100","RUT":"indices/russell-2000","NIFTY50":"indices/nifty-50","SENSEX":"indices/bse-sensex","FTSE100":"indices/uk-100","DAX":"indices/dax",
    "CAC40":"indices/cac-40","NIKKEI225":"indices/nikkei-225","HANGSENG":"indices/hang-seng","KOSPI":"indices/korea-composite-index","STOXX50":"indices/euro-stoxx-50",
    "VIX":"indices/volatility-s-and-p-500","ASX200":"country/AU","AAPL":"apple","MSFT":"microsoft","NVDA":"nvidia","AMZN":"amazon","RELIANCE":"reliance-industrial-infrastructure","TCS":"tata",
    "GOLD":"metal/gold","SILVER":"metal/silver","WTI":"crude-oil","BRENT":"crude-oil","NG":"natural-gas","HG":"metal/copper","ZC":"corn","ZW":"wheat","ZS":"soybean",
    "ES":"indices/s-and-p-500","NQ":"indices/nasdaq-100","YM":"indices/dow-30","RTY":"indices/russell-2000","ZB":"country/US",
    "EURUSD":"country/EU","USDINR":"country/IN","GBPUSD":"country/GB",
    "VFIAX":"vanguard","VTSAX":"vanguard","VTIAX":"vanguard","VBTLX":"vanguard","FXAIX":"fidelity",
    "NIFTYFUT":"indices/nifty-50","NIFTYOPT":"indices/nifty-50","RELIANCEFUT":"reliance-industrial-infrastructure","RELIANCEOPT":"reliance-industrial-infrastructure",
    "HDFCBANKFUT":"hdfc-bank","HDFCBANKOPT":"hdfc-bank","HDFCFUT":"hdfc-bank","TCSFUT":"tata","INFYFUT":"infosys","SBINFUT":"state-bank","ICICIBANKFUT":"icici-bank","TATAMOTORSFUT":"tata"};
  const CRYPTO = ['BTC','ETH','SOL','XRP','ADA','DOGE','BNB','AVAX','DOT','LTC'];
  function logoId(t){
    const m = metaFor(t);
    if(m && m._logoid) return m._logoid;
    if(TV_LOGO[t]) return TV_LOGO[t];
    if(CRYPTO.includes(t) || (m && m.cls==='Crypto')) return 'crypto/XTVC'+t;
    return null;
  }
  const logoUrl = id => id ? 'https://s3-symbol-logo.tradingview.com/'+id+'--big.svg' : null;

  return {num, cnbcSymbol, tvSymbol, cnbcFromTv, TV_EX_LABEL, tvMarketsFor, bars, barsLive, quotes, quote, tvScan, fundamentals, fundamentalsLive, normalizeFundamentals,
    sectorPeers, median, searchLive, news, newsLive, bls, dbnomics, logoId, logoUrl, TV_MARKET_BY_COUNTRY, metaFor};
})();

const LOGO_COLORS = ['#60A5FA','#F472B6','#FBBF24','#34D399','#A78BFA','#FB923C','#38BDF8','#F87171'];
function logoColorFor(ticker){ const sum = ticker.split('').reduce((a,c)=>a+c.charCodeAt(0),0); return LOGO_COLORS[sum % LOGO_COLORS.length]; }
function buildLogoFallbackEl(ticker, sizePx){
  const clean = ticker.replace(/[^A-Z]/g,'') || ticker.toUpperCase();
  const initials = clean.length>=2 ? clean.slice(0,2) : clean.charAt(0)+(ticker.charAt(1)||'').toUpperCase();
  const div = document.createElement('div');
  div.style.cssText = `width:${sizePx}px;height:${sizePx}px;border-radius:50%;background:${logoColorFor(ticker)};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${Math.round(sizePx*0.38)}px;letter-spacing:-0.5px;color:#0a0e14;flex-shrink:0;box-shadow:inset 0 0 0 1px rgba(255,255,255,.15);`;
  div.textContent = initials;
  return div;
}
/* Logos: TradingView's official vector (SVG) logos — razor-sharp at any size and on retina
   screens, unlike the 64 px Google favicons used before, which were being stretched to 2x and
   looked blurry. Fallback chain: TradingView SVG → Google favicon (for tickers with a known
   domain) → coloured initials (never fails). */
function logoUrlForStage(ticker, domain, sizePx, stage){
  const stages = [];
  const id = LD.logoId(ticker);
  if(id) stages.push(LD.logoUrl(id));
  if(domain) stages.push(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`);
  return stages[stage] || null;
}
function handleLogoImgError(imgEl){
  const ticker = imgEl.dataset.ticker, sizePx = parseInt(imgEl.dataset.size, 10) || 22, domain = imgEl.dataset.domain || '';
  const nextStage = (parseInt(imgEl.dataset.stage, 10) || 0) + 1;
  const nextUrl = logoUrlForStage(ticker, domain, sizePx, nextStage);
  if(nextUrl){ imgEl.dataset.stage = String(nextStage); imgEl.src = nextUrl; return; }
  imgEl.replaceWith(buildLogoFallbackEl(ticker, sizePx));
}
function logoHtmlFor(ticker, sizePx){
  const domain = (typeof TICKER_DOMAIN !== 'undefined' && TICKER_DOMAIN[ticker]) || '';
  const first = logoUrlForStage(ticker, domain, sizePx, 0);
  if(!first) return buildLogoFallbackEl(ticker, sizePx).outerHTML;
  return `<img src="${first}" width="${sizePx}" height="${sizePx}" alt="" decoding="async" style="border-radius:50%;object-fit:contain;flex-shrink:0;background:#fff;box-shadow:0 0 0 1px rgba(127,127,127,.25);" loading="lazy" data-ticker="${escapeHtml(ticker)}" data-size="${sizePx}" data-domain="${escapeHtml(domain)}" data-stage="0" onerror="handleLogoImgError(this)">`;
}
const SECURITY_UNIVERSE = [
  ...SECURITIES.map(s=>({t:s.t,n:s.n,ex:s.ex,ctry:s.ctry,sector:s.sector,cls:'Equity'})),
  {t:'GOOGL',n:'Alphabet Inc. (Class A)',ex:'NASDAQ',ctry:'United States',sector:'Technology',cls:'Equity'},
  {t:'GOOG',n:'Alphabet Inc. (Class C)',ex:'NASDAQ',ctry:'United States',sector:'Technology',cls:'Equity'},
  {t:'META',n:'Meta Platforms Inc.',ex:'NASDAQ',ctry:'United States',sector:'Technology',cls:'Equity'},
  {t:'TSLA',n:'Tesla Inc.',ex:'NASDAQ',ctry:'United States',sector:'Automotive',cls:'Equity'},
  {t:'BRK.B',n:'Berkshire Hathaway Inc.',ex:'NYSE',ctry:'United States',sector:'Conglomerate',cls:'Equity'},
  {t:'JPM',n:'JPMorgan Chase & Co.',ex:'NYSE',ctry:'United States',sector:'Financials',cls:'Equity'},
  {t:'V',n:'Visa Inc.',ex:'NYSE',ctry:'United States',sector:'Financials',cls:'Equity'},
  {t:'MA',n:'Mastercard Inc.',ex:'NYSE',ctry:'United States',sector:'Financials',cls:'Equity'},
  {t:'UNH',n:'UnitedHealth Group Inc.',ex:'NYSE',ctry:'United States',sector:'Healthcare',cls:'Equity'},
  {t:'JNJ',n:'Johnson & Johnson',ex:'NYSE',ctry:'United States',sector:'Healthcare',cls:'Equity'},
  {t:'LLY',n:'Eli Lilly and Co.',ex:'NYSE',ctry:'United States',sector:'Healthcare',cls:'Equity'},
  {t:'PFE',n:'Pfizer Inc.',ex:'NYSE',ctry:'United States',sector:'Healthcare',cls:'Equity'},
  {t:'XOM',n:'Exxon Mobil Corp.',ex:'NYSE',ctry:'United States',sector:'Energy',cls:'Equity'},
  {t:'CVX',n:'Chevron Corp.',ex:'NYSE',ctry:'United States',sector:'Energy',cls:'Equity'},
  {t:'WMT',n:'Walmart Inc.',ex:'NYSE',ctry:'United States',sector:'Retail',cls:'Equity'},
  {t:'HD',n:'Home Depot Inc.',ex:'NYSE',ctry:'United States',sector:'Retail',cls:'Equity'},
  {t:'PG',n:'Procter & Gamble Co.',ex:'NYSE',ctry:'United States',sector:'Consumer Staples',cls:'Equity'},
  {t:'KO',n:'Coca-Cola Co.',ex:'NYSE',ctry:'United States',sector:'Consumer Staples',cls:'Equity'},
  {t:'PEP',n:'PepsiCo Inc.',ex:'NASDAQ',ctry:'United States',sector:'Consumer Staples',cls:'Equity'},
  {t:'COST',n:'Costco Wholesale Corp.',ex:'NASDAQ',ctry:'United States',sector:'Retail',cls:'Equity'},
  {t:'MCD',n:"McDonald's Corp.",ex:'NYSE',ctry:'United States',sector:'Consumer Discretionary',cls:'Equity'},
  {t:'NKE',n:'Nike Inc.',ex:'NYSE',ctry:'United States',sector:'Consumer Discretionary',cls:'Equity'},
  {t:'DIS',n:'Walt Disney Co.',ex:'NYSE',ctry:'United States',sector:'Media & Entertainment',cls:'Equity'},
  {t:'NFLX',n:'Netflix Inc.',ex:'NASDAQ',ctry:'United States',sector:'Media & Entertainment',cls:'Equity'},
  {t:'ADBE',n:'Adobe Inc.',ex:'NASDAQ',ctry:'United States',sector:'Technology',cls:'Equity'},
  {t:'CRM',n:'Salesforce Inc.',ex:'NYSE',ctry:'United States',sector:'Technology',cls:'Equity'},
  {t:'ORCL',n:'Oracle Corp.',ex:'NYSE',ctry:'United States',sector:'Technology',cls:'Equity'},
  {t:'IBM',n:'International Business Machines Corp.',ex:'NYSE',ctry:'United States',sector:'Technology',cls:'Equity'},
  {t:'INTC',n:'Intel Corp.',ex:'NASDAQ',ctry:'United States',sector:'Semiconductors',cls:'Equity'},
  {t:'AMD',n:'Advanced Micro Devices Inc.',ex:'NASDAQ',ctry:'United States',sector:'Semiconductors',cls:'Equity'},
  {t:'QCOM',n:'Qualcomm Inc.',ex:'NASDAQ',ctry:'United States',sector:'Semiconductors',cls:'Equity'},
  {t:'TXN',n:'Texas Instruments Inc.',ex:'NASDAQ',ctry:'United States',sector:'Semiconductors',cls:'Equity'},
  {t:'AVGO',n:'Broadcom Inc.',ex:'NASDAQ',ctry:'United States',sector:'Semiconductors',cls:'Equity'},
  {t:'CSCO',n:'Cisco Systems Inc.',ex:'NASDAQ',ctry:'United States',sector:'Technology',cls:'Equity'},
  {t:'PYPL',n:'PayPal Holdings Inc.',ex:'NASDAQ',ctry:'United States',sector:'Financials',cls:'Equity'},
  {t:'UBER',n:'Uber Technologies Inc.',ex:'NYSE',ctry:'United States',sector:'Technology',cls:'Equity'},
  {t:'ABNB',n:'Airbnb Inc.',ex:'NASDAQ',ctry:'United States',sector:'Technology',cls:'Equity'},
  {t:'BA',n:'Boeing Co.',ex:'NYSE',ctry:'United States',sector:'Industrials',cls:'Equity'},
  {t:'CAT',n:'Caterpillar Inc.',ex:'NYSE',ctry:'United States',sector:'Industrials',cls:'Equity'},
  {t:'GE',n:'General Electric Co.',ex:'NYSE',ctry:'United States',sector:'Industrials',cls:'Equity'},
  {t:'GS',n:'Goldman Sachs Group Inc.',ex:'NYSE',ctry:'United States',sector:'Financials',cls:'Equity'},
  {t:'MS',n:'Morgan Stanley',ex:'NYSE',ctry:'United States',sector:'Financials',cls:'Equity'},
  {t:'BAC',n:'Bank of America Corp.',ex:'NYSE',ctry:'United States',sector:'Financials',cls:'Equity'},
  {t:'WFC',n:'Wells Fargo & Co.',ex:'NYSE',ctry:'United States',sector:'Financials',cls:'Equity'},
  {t:'C',n:'Citigroup Inc.',ex:'NYSE',ctry:'United States',sector:'Financials',cls:'Equity'},
  {t:'F',n:'Ford Motor Co.',ex:'NYSE',ctry:'United States',sector:'Automotive',cls:'Equity'},
  {t:'GM',n:'General Motors Co.',ex:'NYSE',ctry:'United States',sector:'Automotive',cls:'Equity'},
  {t:'SBUX',n:'Starbucks Corp.',ex:'NASDAQ',ctry:'United States',sector:'Consumer Discretionary',cls:'Equity'},
  {t:'T',n:'AT&T Inc.',ex:'NYSE',ctry:'United States',sector:'Telecom',cls:'Equity'},
  {t:'VZ',n:'Verizon Communications Inc.',ex:'NYSE',ctry:'United States',sector:'Telecom',cls:'Equity'},
  {t:'SPY',n:'SPDR S&P 500 ETF Trust',ex:'NYSE Arca',ctry:'United States',sector:'ETF — Broad Market',cls:'ETF'},
  {t:'QQQ',n:'Invesco QQQ Trust',ex:'NASDAQ',ctry:'United States',sector:'ETF — Technology',cls:'ETF'},
  {t:'VOO',n:'Vanguard S&P 500 ETF',ex:'NYSE Arca',ctry:'United States',sector:'ETF — Broad Market',cls:'ETF'},
  // India — NSE/BSE
  {t:'HDFCBANK',n:'HDFC Bank Ltd.',ex:'NSE',ctry:'India',sector:'Financials',cls:'Equity'},
  {t:'ICICIBANK',n:'ICICI Bank Ltd.',ex:'NSE',ctry:'India',sector:'Financials',cls:'Equity'},
  {t:'INFY',n:'Infosys Ltd.',ex:'NSE',ctry:'India',sector:'IT Services',cls:'Equity'},
  {t:'HINDUNILVR',n:'Hindustan Unilever Ltd.',ex:'NSE',ctry:'India',sector:'Consumer Staples',cls:'Equity'},
  {t:'ITC',n:'ITC Ltd.',ex:'NSE',ctry:'India',sector:'Conglomerate',cls:'Equity'},
  {t:'SBIN',n:'State Bank of India',ex:'NSE',ctry:'India',sector:'Financials',cls:'Equity'},
  {t:'BHARTIARTL',n:'Bharti Airtel Ltd.',ex:'NSE',ctry:'India',sector:'Telecom',cls:'Equity'},
  {t:'LT',n:'Larsen & Toubro Ltd.',ex:'NSE',ctry:'India',sector:'Industrials',cls:'Equity'},
  {t:'KOTAKBANK',n:'Kotak Mahindra Bank Ltd.',ex:'NSE',ctry:'India',sector:'Financials',cls:'Equity'},
  {t:'AXISBANK',n:'Axis Bank Ltd.',ex:'NSE',ctry:'India',sector:'Financials',cls:'Equity'},
  {t:'ASIANPAINT',n:'Asian Paints Ltd.',ex:'NSE',ctry:'India',sector:'Materials',cls:'Equity'},
  {t:'MARUTI',n:'Maruti Suzuki India Ltd.',ex:'NSE',ctry:'India',sector:'Automotive',cls:'Equity'},
  {t:'TATAMOTORS',n:'Tata Motors Ltd.',ex:'NSE',ctry:'India',sector:'Automotive',cls:'Equity'},
  {t:'WIPRO',n:'Wipro Ltd.',ex:'NSE',ctry:'India',sector:'IT Services',cls:'Equity'},
  {t:'HCLTECH',n:'HCL Technologies Ltd.',ex:'NSE',ctry:'India',sector:'IT Services',cls:'Equity'},
  {t:'SUNPHARMA',n:'Sun Pharmaceutical Industries Ltd.',ex:'NSE',ctry:'India',sector:'Healthcare',cls:'Equity'},
  {t:'ADANIENT',n:'Adani Enterprises Ltd.',ex:'NSE',ctry:'India',sector:'Conglomerate',cls:'Equity'},
  {t:'NTPC',n:'NTPC Ltd.',ex:'NSE',ctry:'India',sector:'Utilities',cls:'Equity'},
  {t:'ONGC',n:'Oil & Natural Gas Corp. Ltd.',ex:'NSE',ctry:'India',sector:'Energy',cls:'Equity'},
  {t:'TITAN',n:'Titan Company Ltd.',ex:'NSE',ctry:'India',sector:'Consumer Discretionary',cls:'Equity'},
  // UK / Europe
  {t:'HSBA',n:'HSBC Holdings plc',ex:'LSE',ctry:'United Kingdom',sector:'Financials',cls:'Equity'},
  {t:'BP',n:'BP plc',ex:'LSE',ctry:'United Kingdom',sector:'Energy',cls:'Equity'},
  {t:'SHEL',n:'Shell plc',ex:'LSE',ctry:'United Kingdom',sector:'Energy',cls:'Equity'},
  {t:'ULVR',n:'Unilever plc',ex:'LSE',ctry:'United Kingdom',sector:'Consumer Staples',cls:'Equity'},
  {t:'AZN',n:'AstraZeneca plc',ex:'LSE',ctry:'United Kingdom',sector:'Healthcare',cls:'Equity'},
  {t:'GSK',n:'GSK plc',ex:'LSE',ctry:'United Kingdom',sector:'Healthcare',cls:'Equity'},
  {t:'BARC',n:'Barclays plc',ex:'LSE',ctry:'United Kingdom',sector:'Financials',cls:'Equity'},
  {t:'VOD',n:'Vodafone Group plc',ex:'LSE',ctry:'United Kingdom',sector:'Telecom',cls:'Equity'},
  {t:'SAP',n:'SAP SE',ex:'XETRA',ctry:'Germany',sector:'Technology',cls:'Equity'},
  {t:'SIE',n:'Siemens AG',ex:'XETRA',ctry:'Germany',sector:'Industrials',cls:'Equity'},
  {t:'VOW3',n:'Volkswagen AG',ex:'XETRA',ctry:'Germany',sector:'Automotive',cls:'Equity'},
  {t:'MC',n:'LVMH Moët Hennessy Louis Vuitton',ex:'Euronext Paris',ctry:'France',sector:'Consumer Discretionary',cls:'Equity'},
  {t:'OR',n:"L'Oréal S.A.",ex:'Euronext Paris',ctry:'France',sector:'Consumer Staples',cls:'Equity'},
  {t:'NESN',n:'Nestlé S.A.',ex:'SIX',ctry:'Switzerland',sector:'Consumer Staples',cls:'Equity'},
  {t:'NOVN',n:'Novartis AG',ex:'SIX',ctry:'Switzerland',sector:'Healthcare',cls:'Equity'},
  {t:'ASML',n:'ASML Holding N.V.',ex:'Euronext Amsterdam',ctry:'Netherlands',sector:'Semiconductors',cls:'Equity'},
  // Japan / Asia-Pacific
  {t:'7203',n:'Toyota Motor Corp.',ex:'TSE',ctry:'Japan',sector:'Automotive',cls:'Equity'},
  {t:'6758',n:'Sony Group Corp.',ex:'TSE',ctry:'Japan',sector:'Technology',cls:'Equity'},
  {t:'9984',n:'SoftBank Group Corp.',ex:'TSE',ctry:'Japan',sector:'Technology',cls:'Equity'},
  {t:'7974',n:'Nintendo Co. Ltd.',ex:'TSE',ctry:'Japan',sector:'Media & Entertainment',cls:'Equity'},
  {t:'005930',n:'Samsung Electronics Co. Ltd.',ex:'KRX',ctry:'South Korea',sector:'Technology',cls:'Equity'},
  {t:'BABA',n:'Alibaba Group Holding Ltd.',ex:'NYSE',ctry:'China',sector:'E-Commerce',cls:'Equity'},
  {t:'JD',n:'JD.com Inc.',ex:'NASDAQ',ctry:'China',sector:'E-Commerce',cls:'Equity'},
  {t:'PDD',n:'PDD Holdings Inc.',ex:'NASDAQ',ctry:'China',sector:'E-Commerce',cls:'Equity'},
  {t:'TCEHY',n:'Tencent Holdings Ltd.',ex:'OTC (HK primary)',ctry:'China',sector:'Technology',cls:'Equity'},
  {t:'0700',n:'Tencent Holdings Ltd.',ex:'HKEX',ctry:'China',sector:'Technology',cls:'Equity'},
  {t:'9988',n:'Alibaba Group Holding Ltd.',ex:'HKEX',ctry:'China',sector:'E-Commerce',cls:'Equity'},
  {t:'TSM',n:'Taiwan Semiconductor Manufacturing Co.',ex:'NYSE',ctry:'Taiwan',sector:'Semiconductors',cls:'Equity'},
  {t:'BHP',n:'BHP Group Ltd.',ex:'ASX',ctry:'Australia',sector:'Materials',cls:'Equity'},
  {t:'CBA',n:'Commonwealth Bank of Australia',ex:'ASX',ctry:'Australia',sector:'Financials',cls:'Equity'},
  // Commodities / FX / Indices (identity only — for search; not all have live wiring)
  {t:'GOLD',n:'Gold Spot',ex:'COMEX',ctry:'Global',sector:'Commodity — Metals',cls:'Commodity'},
  {t:'SILVER',n:'Silver Spot',ex:'COMEX',ctry:'Global',sector:'Commodity — Metals',cls:'Commodity'},
  {t:'WTI',n:'WTI Crude Oil',ex:'NYMEX',ctry:'Global',sector:'Commodity — Energy',cls:'Commodity'},
  {t:'BRENT',n:'Brent Crude Oil',ex:'ICE',ctry:'Global',sector:'Commodity — Energy',cls:'Commodity'},
  {t:'BTC',n:'Bitcoin',ex:'Crypto',ctry:'Global',sector:'Cryptocurrency',cls:'Crypto'},
  {t:'ETH',n:'Ethereum',ex:'Crypto',ctry:'Global',sector:'Cryptocurrency',cls:'Crypto'},
  {t:'EURUSD',n:'Euro / US Dollar',ex:'FX',ctry:'Global',sector:'Currency',cls:'FX'},
  {t:'USDINR',n:'US Dollar / Indian Rupee',ex:'FX',ctry:'Global',sector:'Currency',cls:'FX'},
  {t:'GBPUSD',n:'British Pound / US Dollar',ex:'FX',ctry:'Global',sector:'Currency',cls:'FX'},

  // ===== ETFs — index/sector/commodity/bond trackers, real tickers, all Yahoo-chart-compatible =====
  {t:'VTI',n:'Vanguard Total Stock Market ETF',ex:'NYSE Arca',ctry:'United States',sector:'ETF — Broad Market',cls:'ETF'},
  {t:'IVV',n:'iShares Core S&P 500 ETF',ex:'NYSE Arca',ctry:'United States',sector:'ETF — Broad Market',cls:'ETF'},
  {t:'IWM',n:'iShares Russell 2000 ETF',ex:'NYSE Arca',ctry:'United States',sector:'ETF — Small Cap',cls:'ETF'},
  {t:'DIA',n:'SPDR Dow Jones Industrial Average ETF',ex:'NYSE Arca',ctry:'United States',sector:'ETF — Broad Market',cls:'ETF'},
  {t:'EEM',n:'iShares MSCI Emerging Markets ETF',ex:'NYSE Arca',ctry:'United States',sector:'ETF — Emerging Markets',cls:'ETF'},
  {t:'EFA',n:'iShares MSCI EAFE ETF',ex:'NYSE Arca',ctry:'United States',sector:'ETF — International',cls:'ETF'},
  {t:'VEA',n:'Vanguard FTSE Developed Markets ETF',ex:'NYSE Arca',ctry:'United States',sector:'ETF — International',cls:'ETF'},
  {t:'GLD',n:'SPDR Gold Shares',ex:'NYSE Arca',ctry:'United States',sector:'ETF — Gold',cls:'ETF'},
  {t:'SLV',n:'iShares Silver Trust',ex:'NYSE Arca',ctry:'United States',sector:'ETF — Silver',cls:'ETF'},
  {t:'XLK',n:'Technology Select Sector SPDR Fund',ex:'NYSE Arca',ctry:'United States',sector:'ETF — Technology',cls:'ETF'},
  {t:'XLF',n:'Financial Select Sector SPDR Fund',ex:'NYSE Arca',ctry:'United States',sector:'ETF — Financials',cls:'ETF'},
  {t:'XLE',n:'Energy Select Sector SPDR Fund',ex:'NYSE Arca',ctry:'United States',sector:'ETF — Energy',cls:'ETF'},
  {t:'XLV',n:'Health Care Select Sector SPDR Fund',ex:'NYSE Arca',ctry:'United States',sector:'ETF — Healthcare',cls:'ETF'},
  {t:'VNQ',n:'Vanguard Real Estate ETF',ex:'NYSE Arca',ctry:'United States',sector:'ETF — Real Estate',cls:'ETF'},
  {t:'ARKK',n:'ARK Innovation ETF',ex:'NYSE Arca',ctry:'United States',sector:'ETF — Innovation',cls:'ETF'},
  {t:'EWJ',n:'iShares MSCI Japan ETF',ex:'NYSE Arca',ctry:'United States',sector:'ETF — Japan',cls:'ETF'},
  {t:'FXI',n:'iShares China Large-Cap ETF',ex:'NYSE Arca',ctry:'United States',sector:'ETF — China',cls:'ETF'},
  {t:'INDA',n:'iShares MSCI India ETF',ex:'NYSE Arca',ctry:'United States',sector:'ETF — India',cls:'ETF'},
  {t:'NIFTYBEES',n:'Nippon India ETF Nifty BeES',ex:'NSE',ctry:'India',sector:'ETF — Nifty 50',cls:'ETF'},
  {t:'GOLDBEES',n:'Nippon India ETF Gold BeES',ex:'NSE',ctry:'India',sector:'ETF — Gold',cls:'ETF'},
  {t:'BANKBEES',n:'Nippon India ETF Bank BeES',ex:'NSE',ctry:'India',sector:'ETF — Banking',cls:'ETF'},

  // ===== Bond ETFs (individual corporate bonds/debentures have no free live-quote API anywhere —
  // these exchange-traded bond funds are the closest real, searchable, live-priceable proxy) =====
  {t:'AGG',n:'iShares Core U.S. Aggregate Bond ETF',ex:'NYSE Arca',ctry:'United States',sector:'Bond ETF — Aggregate',cls:'ETF'},
  {t:'BND',n:'Vanguard Total Bond Market ETF',ex:'NASDAQ',ctry:'United States',sector:'Bond ETF — Aggregate',cls:'ETF'},
  {t:'TLT',n:'iShares 20+ Year Treasury Bond ETF',ex:'NASDAQ',ctry:'United States',sector:'Bond ETF — Long Treasury',cls:'ETF'},
  {t:'IEF',n:'iShares 7-10 Year Treasury Bond ETF',ex:'NASDAQ',ctry:'United States',sector:'Bond ETF — Intermediate Treasury',cls:'ETF'},
  {t:'SHY',n:'iShares 1-3 Year Treasury Bond ETF',ex:'NASDAQ',ctry:'United States',sector:'Bond ETF — Short Treasury',cls:'ETF'},
  {t:'LQD',n:'iShares iBoxx Investment Grade Corporate Bond ETF',ex:'NYSE Arca',ctry:'United States',sector:'Bond ETF — Corporate',cls:'ETF'},
  {t:'HYG',n:'iShares iBoxx High Yield Corporate Bond ETF',ex:'NYSE Arca',ctry:'United States',sector:'Bond ETF — High Yield',cls:'ETF'},
  {t:'TIP',n:'iShares TIPS Bond ETF',ex:'NYSE Arca',ctry:'United States',sector:'Bond ETF — Inflation-Protected',cls:'ETF'},

  // ===== Mutual funds — real NAV tickers Yahoo carries; global open-ended fund coverage beyond
  // this (e.g. most India AMC schemes, which trade by NAV not ticker) is a genuine, disclosed gap =====
  {t:'VFIAX',n:'Vanguard 500 Index Fund Admiral Shares',ex:'Mutual Fund',ctry:'United States',sector:'Index Fund — S&P 500',cls:'Mutual Fund'},
  {t:'FXAIX',n:'Fidelity 500 Index Fund',ex:'Mutual Fund',ctry:'United States',sector:'Index Fund — S&P 500',cls:'Mutual Fund'},
  {t:'VTSAX',n:'Vanguard Total Stock Market Index Fund Admiral',ex:'Mutual Fund',ctry:'United States',sector:'Index Fund — Total Market',cls:'Mutual Fund'},
  {t:'SWPPX',n:'Schwab S&P 500 Index Fund',ex:'Mutual Fund',ctry:'United States',sector:'Index Fund — S&P 500',cls:'Mutual Fund'},
  {t:'VTIAX',n:'Vanguard Total International Stock Index Fund',ex:'Mutual Fund',ctry:'United States',sector:'Index Fund — International',cls:'Mutual Fund'},
  {t:'VBTLX',n:'Vanguard Total Bond Market Index Fund Admiral',ex:'Mutual Fund',ctry:'United States',sector:'Bond Fund — Aggregate',cls:'Mutual Fund'},

  // ===== Futures — major index, energy, metals, and agricultural contracts =====
  {t:'ES',n:'E-mini S&P 500 Futures',ex:'CME',ctry:'Global',sector:'Future — Equity Index',cls:'Derivative'},
  {t:'NQ',n:'E-mini Nasdaq-100 Futures',ex:'CME',ctry:'Global',sector:'Future — Equity Index',cls:'Derivative'},
  {t:'YM',n:'E-mini Dow Futures',ex:'CBOT',ctry:'Global',sector:'Future — Equity Index',cls:'Derivative'},
  {t:'RTY',n:'E-mini Russell 2000 Futures',ex:'CME',ctry:'Global',sector:'Future — Equity Index',cls:'Derivative'},
  {t:'ZC',n:'Corn Futures',ex:'CBOT',ctry:'Global',sector:'Future — Agriculture',cls:'Derivative'},
  {t:'ZW',n:'Wheat Futures',ex:'CBOT',ctry:'Global',sector:'Future — Agriculture',cls:'Derivative'},
  {t:'ZS',n:'Soybean Futures',ex:'CBOT',ctry:'Global',sector:'Future — Agriculture',cls:'Derivative'},
  {t:'NG',n:'Natural Gas Futures',ex:'NYMEX',ctry:'Global',sector:'Future — Energy',cls:'Derivative'},
  {t:'HG',n:'Copper Futures',ex:'COMEX',ctry:'Global',sector:'Future — Metals',cls:'Derivative'},
  {t:'ZB',n:'30-Year U.S. Treasury Bond Futures',ex:'CBOT',ctry:'Global',sector:'Future — Rates',cls:'Derivative'},

  // ===== NSE India F&O — index and single-stock futures (added: previously the Derivative
  // category only had global CME/CBOT/COMEX contracts, so a search like "HDFC futures" or
  // "Nifty options" returned nothing. NSE doesn't publish a free live F&O quote feed, so these
  // are curated identity entries with SAMPLE pricing, same disclosed pattern as every other
  // sample-priced entry in this build — findable and consistent, not silently fabricated =====
  {t:'NIFTYFUT',n:'Nifty 50 Futures',ex:'NSE',ctry:'India',sector:'Future — Equity Index',cls:'Derivative'},
  {t:'BANKNIFTYFUT',n:'Bank Nifty Futures',ex:'NSE',ctry:'India',sector:'Future — Equity Index',cls:'Derivative'},
  {t:'FINNIFTYFUT',n:'Fin Nifty Futures',ex:'NSE',ctry:'India',sector:'Future — Equity Index',cls:'Derivative'},
  {t:'RELIANCEFUT',n:'Reliance Industries Futures',ex:'NSE',ctry:'India',sector:'Future — Single Stock',cls:'Derivative'},
  {t:'HDFCBANKFUT',n:'HDFC Bank Futures',ex:'NSE',ctry:'India',sector:'Future — Single Stock',cls:'Derivative'},
  {t:'HDFCFUT',n:'HDFC Ltd Futures',ex:'NSE',ctry:'India',sector:'Future — Single Stock',cls:'Derivative'},
  {t:'TCSFUT',n:'TCS Futures',ex:'NSE',ctry:'India',sector:'Future — Single Stock',cls:'Derivative'},
  {t:'INFYFUT',n:'Infosys Futures',ex:'NSE',ctry:'India',sector:'Future — Single Stock',cls:'Derivative'},
  {t:'SBINFUT',n:'SBI Futures',ex:'NSE',ctry:'India',sector:'Future — Single Stock',cls:'Derivative'},
  {t:'ICICIBANKFUT',n:'ICICI Bank Futures',ex:'NSE',ctry:'India',sector:'Future — Single Stock',cls:'Derivative'},
  {t:'TATAMOTORSFUT',n:'Tata Motors Futures',ex:'NSE',ctry:'India',sector:'Future — Single Stock',cls:'Derivative'},
  {t:'NIFTYOPT',n:'Nifty 50 Options (Chain)',ex:'NSE',ctry:'India',sector:'Option — Equity Index',cls:'Derivative'},
  {t:'BANKNIFTYOPT',n:'Bank Nifty Options (Chain)',ex:'NSE',ctry:'India',sector:'Option — Equity Index',cls:'Derivative'},
  {t:'HDFCBANKOPT',n:'HDFC Bank Options (Chain)',ex:'NSE',ctry:'India',sector:'Option — Single Stock',cls:'Derivative'},
  {t:'RELIANCEOPT',n:'Reliance Industries Options (Chain)',ex:'NSE',ctry:'India',sector:'Option — Single Stock',cls:'Derivative'},

  // ===== More cryptocurrencies =====
  {t:'SOL',n:'Solana',ex:'Crypto',ctry:'Global',sector:'Cryptocurrency',cls:'Crypto'},
  {t:'XRP',n:'XRP',ex:'Crypto',ctry:'Global',sector:'Cryptocurrency',cls:'Crypto'},
  {t:'ADA',n:'Cardano',ex:'Crypto',ctry:'Global',sector:'Cryptocurrency',cls:'Crypto'},
  {t:'DOGE',n:'Dogecoin',ex:'Crypto',ctry:'Global',sector:'Cryptocurrency',cls:'Crypto'},
  {t:'BNB',n:'BNB',ex:'Crypto',ctry:'Global',sector:'Cryptocurrency',cls:'Crypto'},
  {t:'AVAX',n:'Avalanche',ex:'Crypto',ctry:'Global',sector:'Cryptocurrency',cls:'Crypto'},
  {t:'DOT',n:'Polkadot',ex:'Crypto',ctry:'Global',sector:'Cryptocurrency',cls:'Crypto'},
  {t:'LTC',n:'Litecoin',ex:'Crypto',ctry:'Global',sector:'Cryptocurrency',cls:'Crypto'},

  // ===== Global indexes — real Yahoo index tickers (^-prefixed), a separate searchable
  // category per request, not folded into ETF/Equity/Commodity =====
  {t:'SPX',n:'S&P 500 Index',ex:'Index',ctry:'United States',sector:'Index — Broad Market',cls:'Index'},
  {t:'DJI',n:'Dow Jones Industrial Average',ex:'Index',ctry:'United States',sector:'Index — Broad Market',cls:'Index'},
  {t:'NDX',n:'Nasdaq 100 Index',ex:'Index',ctry:'United States',sector:'Index — Technology',cls:'Index'},
  {t:'RUT',n:'Russell 2000 Index',ex:'Index',ctry:'United States',sector:'Index — Small Cap',cls:'Index'},
  {t:'NIFTY50',n:'Nifty 50 Index',ex:'Index',ctry:'India',sector:'Index — Broad Market',cls:'Index'},
  {t:'SENSEX',n:'BSE Sensex Index',ex:'Index',ctry:'India',sector:'Index — Broad Market',cls:'Index'},
  {t:'FTSE100',n:'FTSE 100 Index',ex:'Index',ctry:'United Kingdom',sector:'Index — Broad Market',cls:'Index'},
  {t:'DAX',n:'DAX Index',ex:'Index',ctry:'Germany',sector:'Index — Broad Market',cls:'Index'},
  {t:'CAC40',n:'CAC 40 Index',ex:'Index',ctry:'France',sector:'Index — Broad Market',cls:'Index'},
  {t:'NIKKEI225',n:'Nikkei 225 Index',ex:'Index',ctry:'Japan',sector:'Index — Broad Market',cls:'Index'},
  {t:'HANGSENG',n:'Hang Seng Index',ex:'Index',ctry:'China',sector:'Index — Broad Market',cls:'Index'},
  {t:'ASX200',n:'S&P/ASX 200 Index',ex:'Index',ctry:'Australia',sector:'Index — Broad Market',cls:'Index'},
  {t:'KOSPI',n:'KOSPI Index',ex:'Index',ctry:'South Korea',sector:'Index — Broad Market',cls:'Index'},
  {t:'STOXX50',n:'Euro Stoxx 50 Index',ex:'Index',ctry:'Global',sector:'Index — Broad Market',cls:'Index'},
  {t:'VIX',n:'CBOE Volatility Index',ex:'Index',ctry:'United States',sector:'Index — Volatility',cls:'Index'},
];
