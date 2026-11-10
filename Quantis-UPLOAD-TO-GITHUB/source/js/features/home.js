/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/features/home.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Home (dashboard) — every card is user-configurable:
 *             • Layout: show / hide, reorder and resize any card (Customize button), remembered.
 *             • World Indices: 60+ benchmark indices from 45 countries, each labelled with its
 *               country; add from the catalogue or search ANY index worldwide; remove with ×;
 *               period (1D/1W/1M/YTD/1Y) and sort controls; click → full index page.
 *             • Market Breadth / Sectors / Movers / Heatmap: any of 67 national markets or Global.
 *             • Market Regime: choose which index to classify.
 *             • Market Hours: 40 exchanges, add/remove, local + your time, live countdown to the
 *               next open/close, lunch breaks and national holidays.
 *             • Currency Converter: 160+ currencies, swap, quick pairs, rate source shown.
 *             • Live Market Pulse: pick any instruments (crypto, FX, metals, energy, bonds, VIX…).
 * DATA      TradingView scanner (keyless) for index / pulse quotes, Frankfurter (ECB) and
 *           ExchangeRate-API (open) for FX, Nager.Date for holidays.
 * EXPOSES   QXH.{init(), refreshIndices(), refreshPulse(), customize()}
 * ─────────────────────────────────────────────────────────────────────────────
 */
const QXH = (() => {
  const LS = (k, d) => { try{ const v = JSON.parse(safeStorage.getItem(k)); return v ?? d; }catch(e){ return d; } };
  const SS = (k, v) => { try{ safeStorage.setItem(k, JSON.stringify(v)); }catch(e){} };
  const fin = v => typeof v==='number' && isFinite(v);
  const pc = v => fin(v) ? `${v>=0?'+':''}${v.toFixed(2)}%` : '—';
  const cls = v => fin(v) ? (v>=0?'up':'down') : '';

  /* ======================= World index catalogue (verified TradingView symbols) ======================= */
  const IDX = [
    ['SP:SPX','S&P 500','United States','Americas'],['NASDAQ:IXIC','Nasdaq Composite','United States','Americas'],['NASDAQ:NDX','Nasdaq 100','United States','Americas'],
    ['DJ:DJI','Dow Jones Industrial Average','United States','Americas'],['TVC:RUT','Russell 2000','United States','Americas'],['CBOE:VIX','CBOE Volatility Index (VIX)','United States','Americas'],
    ['TSX:TSX','S&P/TSX Composite','Canada','Americas'],['BMFBOVESPA:IBOV','Bovespa','Brazil','Americas'],['BMV:ME','S&P/BMV IPC','Mexico','Americas'],
    ['BCS:MXIPSAGC','S&P IPSA','Chile','Americas'],['BVC:ICAP','MSCI COLCAP','Colombia','Americas'],
    ['TVC:UKX','FTSE 100','United Kingdom','Europe'],['XETR:DAX','DAX 40','Germany','Europe'],['TVC:CAC40','CAC 40','France','Europe'],['TVC:SX5E','Euro Stoxx 50','Eurozone','Europe'],
    ['EURONEXT:AEX','AEX','Netherlands','Europe'],['EURONEXT:BEL20','BEL 20','Belgium','Europe'],['TVC:IBEX35','IBEX 35','Spain','Europe'],['INDEX:FTSEMIB','FTSE MIB','Italy','Europe'],
    ['SIX:SMI','Swiss Market Index','Switzerland','Europe'],['EURONEXT:PSI20','PSI','Portugal','Europe'],['OMXSTO:OMXS30','OMX Stockholm 30','Sweden','Europe'],
    ['OMXCOP:OMXC25','OMX Copenhagen 25','Denmark','Europe'],['OMXHEX:OMXH25','OMX Helsinki 25','Finland','Europe'],['OSL:OBX','OBX','Norway','Europe'],
    ['ATHEX:GD','Athens General','Greece','Europe'],['GPW:WIG20','WIG20','Poland','Europe'],['VIE:ATX','ATX','Austria','Europe'],['BIST:XU100','BIST 100','Turkey','Europe'],
    ['TVC:NI225','Nikkei 225','Japan','Asia-Pacific'],['TSE:TOPIX','TOPIX','Japan','Asia-Pacific'],['TVC:HSI','Hang Seng','Hong Kong','Asia-Pacific'],
    ['SSE:000001','SSE Composite','China','Asia-Pacific'],['SZSE:399001','Shenzhen Component','China','Asia-Pacific'],['SSE:000300','CSI 300','China','Asia-Pacific'],['SZSE:399006','ChiNext','China','Asia-Pacific'],
    ['TVC:KOSPI','KOSPI','South Korea','Asia-Pacific'],
    ['NSE:NIFTY','Nifty 50','India','Asia-Pacific'],['BSE:SENSEX','BSE Sensex','India','Asia-Pacific'],['NSE:BANKNIFTY','Nifty Bank','India','Asia-Pacific'],['NSE:CNXIT','Nifty IT','India','Asia-Pacific'],
    ['NSE:CNX500','Nifty 500','India','Asia-Pacific'],['NSE:CNXSMALLCAP','Nifty Smallcap 100','India','Asia-Pacific'],['NSE:INDIAVIX','India VIX','India','Asia-Pacific'],
    ['SP:XJO','S&P/ASX 200','Australia','Asia-Pacific'],['NZX:NZ50G','S&P/NZX 50','New Zealand','Asia-Pacific'],['TVC:STI','Straits Times Index','Singapore','Asia-Pacific'],
    ['FTSEMYX:FBMKLCI','FTSE Bursa Malaysia KLCI','Malaysia','Asia-Pacific'],['SET:SET','SET Index','Thailand','Asia-Pacific'],['IDX:COMPOSITE','IDX Composite','Indonesia','Asia-Pacific'],
    ['PSE:PSEI','PSEi','Philippines','Asia-Pacific'],['HOSE:VNINDEX','VN-Index','Vietnam','Asia-Pacific'],['PSX:KSE100','KSE 100','Pakistan','Asia-Pacific'],['DSEBD:DSEX','DSEX','Bangladesh','Asia-Pacific'],
    ['TADAWUL:TASI','Tadawul All Share','Saudi Arabia','Middle East & Africa'],['DFM:DFMGI','DFM General','UAE','Middle East & Africa'],['ADX:FADGI','FTSE ADX General','UAE','Middle East & Africa'],
    ['QSE:GNRI','QE General','Qatar','Middle East & Africa'],['TASE:TA35','TA-35','Israel','Middle East & Africa'],['EGX:EGX30','EGX 30','Egypt','Middle East & Africa'],
    ['JSE:J203','FTSE/JSE All Share','South Africa','Middle East & Africa'],
    ['TVC:DXY','US Dollar Index','Global','Global'],
    ['BVL:MXNUAMPEGEN','S&P/BVL Peru General','Peru','Americas'],['BVCV:IBC','IBC Caracas','Venezuela','Americas'],['TVC:NYA','NYSE Composite','United States','Americas'],
    ['EURONEXT:ISEQ','ISEQ Overall','Ireland','Europe'],['EURONEXT:PX1','CAC 40 (Euronext)','France','Europe'],['BME:IBC','IBEX Composite','Spain','Europe'],['PSECZ:PX','PX Index','Czech Republic','Europe'],['BET:BUX','BUX','Hungary','Europe'],['BVB:BET','BET','Romania','Europe'],['BSESOF:SOFIX','SOFIX','Bulgaria','Europe'],['BELEX:BELEX15','BELEX 15','Serbia','Europe'],['LJSE:SBITOP','SBITOP','Slovenia','Europe'],['BSSE:SAX','SAX','Slovakia','Europe'],['OMXTSE:OMXTGI','OMX Tallinn','Estonia','Europe'],['OMXRSE:OMXRGI','OMX Riga','Latvia','Europe'],['OMXVSE:OMXVGI','OMX Vilnius','Lithuania','Europe'],['OMXICE:OMXI15','OMX Iceland 15','Iceland','Europe'],['LUXSE:LUXX','LuxX','Luxembourg','Europe'],['CSECY:MAIN','CSE Main Market','Cyprus','Europe'],['RUS:RTSI','RTS Index','Russia','Europe'],['STOXX:SXXP','STOXX Europe 600','Europe (region)','Europe'],['EURONEXT:N100','Euronext 100','Europe (region)','Europe'],
    ['TWSE:IX0001','TAIEX','Taiwan','Asia-Pacific'],['KRX:KOSDAQ','KOSDAQ','South Korea','Asia-Pacific'],['CSELK:ASI','CSE All Share','Sri Lanka','Asia-Pacific'],['IDX:IDX30','IDX30','Indonesia','Asia-Pacific'],
    ['KSE:BKP','Boursa Kuwait Premier','Kuwait','Middle East & Africa'],['BAHRAIN:BHBX','Bahrain All Share','Bahrain','Middle East & Africa'],['MSX:MSX30','MSX 30','Oman','Middle East & Africa'],['CSEMA:MASI','MASI','Morocco','Middle East & Africa'],['NSENG:ASI','NGX All Share','Nigeria','Middle East & Africa'],
  ].map(([sym,name,country,region])=>({sym,name,country,region}));
  const DEFAULT_IDX = ['SP:SPX','NASDAQ:IXIC','DJ:DJI','NSE:NIFTY','BSE:SENSEX','TVC:UKX','XETR:DAX','TVC:NI225','TVC:HSI','SSE:000001'];
  const PERF = {'1D':'change','1W':'Perf.W','1M':'Perf.1M','YTD':'Perf.YTD','1Y':'Perf.Y'};
  let idxState = LS('quantis_idx_v1', {list:DEFAULT_IDX, extra:{}, period:'1D', sort:'list'});
  const idxMeta = sym => IDX.find(x=>x.sym===sym) || idxState.extra[sym] || {sym, name:sym.split(':')[1], country:'—'};

  /* ======================= Pulse catalogue ======================= */
  const PULSE = [
    ['BITSTAMP:BTCUSD','Bitcoin','BTC / USD','Crypto'],['BITSTAMP:ETHUSD','Ethereum','ETH / USD','Crypto'],['COINBASE:SOLUSD','Solana','SOL / USD','Crypto'],['BITSTAMP:XRPUSD','XRP','XRP / USD','Crypto'],
    ['CRYPTOCAP:TOTAL','Total crypto market cap','Crypto market','Crypto'],['CRYPTOCAP:BTC.D','Bitcoin dominance','BTC dominance %','Crypto'],
    ['FX_IDC:EURUSD','Euro','EUR / USD','FX'],['FX_IDC:USDINR','Indian rupee','USD / INR','FX'],['FX_IDC:GBPUSD','Pound','GBP / USD','FX'],['FX_IDC:USDJPY','Yen','USD / JPY','FX'],
    ['FX_IDC:USDCNY','Yuan','USD / CNY','FX'],['FX_IDC:AUDUSD','Aussie dollar','AUD / USD','FX'],['FX_IDC:USDCAD','Canadian dollar','USD / CAD','FX'],['FX_IDC:USDCHF','Swiss franc','USD / CHF','FX'],['TVC:DXY','US Dollar Index','DXY','FX'],
    ['TVC:GOLD','Gold','Gold (USD/oz)','Commodities'],['TVC:SILVER','Silver','Silver (USD/oz)','Commodities'],['TVC:PLATINUM','Platinum','Platinum (USD/oz)','Commodities'],
    ['NYMEX:CL1!','WTI crude','WTI crude (USD/bbl)','Commodities'],['ICEEUR:BRN1!','Brent crude','Brent (USD/bbl)','Commodities'],['NYMEX:NG1!','Natural gas','Natural gas','Commodities'],['COMEX:HG1!','Copper','Copper','Commodities'],
    ['TVC:US10Y','US 10Y yield','US 10Y yield %','Rates'],['TVC:US02Y','US 2Y yield','US 2Y yield %','Rates'],['TVC:IN10Y','India 10Y yield','India 10Y yield %','Rates'],
    ['CBOE:VIX','VIX','VIX volatility','Volatility'],['NSE:INDIAVIX','India VIX','India VIX','Volatility'],
  ].map(([sym,name,label,group])=>({sym,name,label,group}));
  let pulseList = LS('quantis_pulse_v1', ['BITSTAMP:BTCUSD','BITSTAMP:ETHUSD','FX_IDC:EURUSD','FX_IDC:USDINR','TVC:GOLD','NYMEX:CL1!','TVC:US10Y','CBOE:VIX']);

  /* ======================= Exchanges ======================= */
  const EX = [
    ['NYSE / NASDAQ','New York','America/New_York',[9,30],[16,0],null,'US','USD'],['TSX','Toronto','America/Toronto',[9,30],[16,0],null,'CA','CAD'],
    ['B3','São Paulo','America/Sao_Paulo',[10,0],[17,0],null,'BR','BRL'],['BMV','Mexico City','America/Mexico_City',[8,30],[15,0],null,'MX','MXN'],
    ['LSE','London','Europe/London',[8,0],[16,30],null,'GB','GBP'],['Euronext Paris','Paris','Europe/Paris',[9,0],[17,30],null,'FR','EUR'],
    ['Xetra','Frankfurt','Europe/Berlin',[9,0],[17,30],null,'DE','EUR'],['Euronext Amsterdam','Amsterdam','Europe/Amsterdam',[9,0],[17,30],null,'NL','EUR'],
    ['SIX','Zurich','Europe/Zurich',[9,0],[17,30],null,'CH','CHF'],['Borsa Italiana','Milan','Europe/Rome',[9,0],[17,30],null,'IT','EUR'],
    ['BME','Madrid','Europe/Madrid',[9,0],[17,30],null,'ES','EUR'],['Nasdaq Stockholm','Stockholm','Europe/Stockholm',[9,0],[17,30],null,'SE','SEK'],
    ['Oslo Børs','Oslo','Europe/Oslo',[9,0],[16,20],null,'NO','NOK'],['GPW','Warsaw','Europe/Warsaw',[9,0],[17,0],null,'PL','PLN'],
    ['Borsa Istanbul','Istanbul','Europe/Istanbul',[10,0],[18,0],null,'TR','TRY'],['MOEX','Moscow','Europe/Moscow',[9,50],[18,40],null,'RU','RUB'],
    ['Tadawul','Riyadh','Asia/Riyadh',[10,0],[15,0],null,'SA','SAR','sun-thu'],['DFM / ADX','Dubai','Asia/Dubai',[10,0],[15,0],null,'AE','AED'],
    ['TASE','Tel Aviv','Asia/Jerusalem',[9,59],[17,14],null,'IL','ILS','mon-thu-fri'],['EGX','Cairo','Africa/Cairo',[10,0],[14,30],null,'EG','EGP','sun-thu'],
    ['JSE','Johannesburg','Africa/Johannesburg',[9,0],[17,0],null,'ZA','ZAR'],['NGX','Lagos','Africa/Lagos',[10,0],[14,30],null,'NG','NGN'],
    ['NSE / BSE','Mumbai','Asia/Kolkata',[9,15],[15,30],null,'IN','INR'],['PSX','Karachi','Asia/Karachi',[9,30],[15,30],null,'PK','PKR'],
    ['DSE','Dhaka','Asia/Dhaka',[10,0],[14,30],null,'BD','BDT','sun-thu'],['SGX','Singapore','Asia/Singapore',[9,0],[17,0],[[12,0],[13,0]],'SG','SGD'],
    ['Bursa Malaysia','Kuala Lumpur','Asia/Kuala_Lumpur',[9,0],[17,0],[[12,30],[14,30]],'MY','MYR'],['SET','Bangkok','Asia/Bangkok',[10,0],[16,30],[[12,30],[14,30]],'TH','THB'],
    ['IDX','Jakarta','Asia/Jakarta',[9,0],[16,0],[[12,0],[13,30]],'ID','IDR'],['PSE','Manila','Asia/Manila',[9,30],[15,0],[[12,0],[13,0]],'PH','PHP'],
    ['HOSE','Ho Chi Minh City','Asia/Ho_Chi_Minh',[9,0],[15,0],[[11,30],[13,0]],'VN','VND'],['HKEX','Hong Kong','Asia/Hong_Kong',[9,30],[16,0],[[12,0],[13,0]],'HK','HKD'],
    ['SSE / SZSE','Shanghai','Asia/Shanghai',[9,30],[15,0],[[11,30],[13,0]],'CN','CNY'],['TWSE','Taipei','Asia/Taipei',[9,0],[13,30],null,'TW','TWD'],
    ['KRX','Seoul','Asia/Seoul',[9,0],[15,30],null,'KR','KRW'],['JPX (Tokyo)','Tokyo','Asia/Tokyo',[9,0],[15,30],[[11,30],[12,30]],'JP','JPY'],
    ['ASX','Sydney','Australia/Sydney',[10,0],[16,0],null,'AU','AUD'],['NZX','Wellington','Pacific/Auckland',[10,0],[16,45],null,'NZ','NZD'],
  ].map(([name,city,tz,open,close,lunch,country,ccy,week])=>({id:name, name, city, tz, open, close, lunch, country, ccy, week:week||'mon-fri'}));
  let exList = LS('quantis_ex_v1', ['NYSE / NASDAQ','LSE','Xetra','NSE / BSE','HKEX','JPX (Tokyo)','SSE / SZSE','ASX']);
  const holidays = {}; // country -> {date:name}

  /* ======================= Layout ======================= */
  const CARDS = [
    ['indices','World Indices',2],['breadth','Market Breadth',1],['regime','Market Regime',1],['hours','Market Hours',1],['heatmap','Market Heatmap',3],
    ['sectors','Sector Performance',2],['movers','Top Movers',1],['pulse','Live Market Pulse',3],['fx','Currency Converter',1],['alerts','Alerts & Big Movers',1],
    ['watch','Watchlist Snapshot',1],['portfolio','Portfolio Snapshot',1],['aisum','AI Market Summary',1],
  ];
  let layout = LS('quantis_dash_layout_v1', null);
  function normLayout(){ const def = CARDS.map(([k,,size])=>({k, on:true, size})); if(!Array.isArray(layout)) return def; const out = layout.filter(x=>CARDS.some(c=>c[0]===x.k)); CARDS.forEach(([k,,size])=>{ if(!out.some(x=>x.k===k)) out.push({k, on:true, size}); }); return out; }
  function applyLayout(){
    layout = normLayout();
    layout.forEach((c,i)=>{ const el = document.querySelector(`#dashGrid [data-card="${c.k}"]`); if(!el) return; el.style.order = i; el.hidden = !c.on; el.dataset.size = c.size; });
  }
  function customize(){
    layout = normLayout();
    const ov = document.createElement('div'); ov.className = 'modalOverlay show'; ov.id = 'dashCustomize';
    const draw = () => { ov.innerHTML = `<div class="modalBox" style="width:520px"><h3>Customise Home</h3><p class="qxa-dim">Show or hide cards, change their width, and move them up or down. Saved in this browser${typeof CLOUD_SYNC_KEYS!=='undefined'?' (and synced when you sign in)':''}.</p>
      <div class="dc-list">${layout.map((c,i)=>{ const meta = CARDS.find(x=>x[0]===c.k); return `<div class="dc-row" data-i="${i}"><label class="qx-switch"><input type="checkbox" ${c.on?'checked':''} data-act="on"><span></span></label><b>${escapeHtml(meta[1])}</b>
        <div class="seg seg-sm" data-act="size">${[[1,'S'],[2,'M'],[3,'Full']].map(([v,l])=>`<button type="button" data-v="${v}" class="${+c.size===v?'active':''}">${l}</button>`).join('')}</div>
        <button type="button" class="btn ghost small" data-act="up" ${i===0?'disabled':''} aria-label="Move up">↑</button><button type="button" class="btn ghost small" data-act="down" ${i===layout.length-1?'disabled':''} aria-label="Move down">↓</button></div>`; }).join('')}</div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button class="btn secondary small" data-act="reset" type="button">Reset to default</button><button class="btn small" data-act="close" type="button">Done</button></div></div>`; };
    draw(); document.body.appendChild(ov);
    ov.addEventListener('click', e=>{
      if(e.target===ov){ ov.remove(); return; }
      const b = e.target.closest('[data-act]'); if(!b || b.dataset.act==='on') return; const row = b.closest('.dc-row'); const i = row ? +row.dataset.i : -1; const act = b.dataset.act;
      if(act==='close'){ ov.remove(); return; }
      if(act==='reset'){ layout = null; SS('quantis_dash_layout_v1', null); layout = normLayout(); applyLayout(); draw(); return; }
      if(act==='up' && i>0){ [layout[i-1], layout[i]] = [layout[i], layout[i-1]]; }
      if(act==='down' && i<layout.length-1){ [layout[i+1], layout[i]] = [layout[i], layout[i+1]]; }
      if(act==='size'){ const v = e.target.closest('button[data-v]'); if(!v) return; layout[i].size = +v.dataset.v; }
      SS('quantis_dash_layout_v1', layout); applyLayout(); draw();
    });
    ov.addEventListener('change', e=>{ const cb = e.target.closest('[data-act="on"]'); if(!cb) return; const i = +cb.closest('.dc-row').dataset.i; layout[i].on = cb.checked; SS('quantis_dash_layout_v1', layout); applyLayout(); });
  }

  /* ======================= World indices ======================= */
  let idxTok = 0, idxTimer = null;
  async function refreshIndices(){
    const box = document.getElementById('idxList'); if(!box) return;
    const my = ++idxTok; const list = idxState.list;
    if(!list.length){ box.innerHTML = '<div class="qxa-dim" style="padding:10px 0">No indices selected — press ＋ Add.</div>'; return; }
    if(!box.querySelector('.ix-row')) box.innerHTML = list.map(()=>'<div class="qx-skel" style="height:42px;margin:6px 0"></div>').join('');
    let rows = [];
    try{ ({rows} = await LD.tvScan('global', {symbols:{tickers:list}, columns:['description','close','change','Perf.W','Perf.1M','Perf.YTD','Perf.Y','currency','country']})); }
    catch(e){ if(my!==idxTok) return; box.innerHTML = `<div class="notebox">Index quotes unavailable right now (${escapeHtml(e.message)}).</div>`; return; }
    if(my!==idxTok) return;
    const by = Object.fromEntries(rows.map(r=>[r._s, r]));
    const col = PERF[idxState.period];
    let items = list.map(sym=>({sym, m:idxMeta(sym), r:by[sym]}));
    if(idxState.sort==='best') items.sort((a,b)=>(b.r?.[col]??-1e9)-(a.r?.[col]??-1e9));
    if(idxState.sort==='worst') items.sort((a,b)=>(a.r?.[col]??1e9)-(b.r?.[col]??1e9));
    if(idxState.sort==='country') items.sort((a,b)=>String(a.m.country).localeCompare(b.m.country));
    box.innerHTML = items.map(({sym,m,r})=>{
      const v = r ? r[col] : null;
      return `<div class="ix-row" data-sym="${escapeHtml(sym)}" tabindex="0" role="button" aria-label="${escapeHtml(m.name)}">
        <div class="ix-name"><b>${escapeHtml(m.name)}</b><span>Country — ${escapeHtml(m.country)}${m.region&&m.region!=='Global'?'':''}</span></div>
        <div class="ix-val"><b>${r&&fin(r.close)?r.close.toLocaleString(undefined,{maximumFractionDigits:2}):'—'}</b><span class="${cls(v)}">${r?pc(v):'no data'} <em>${idxState.period}</em></span></div>
        <button type="button" class="ix-x" data-rm="${escapeHtml(sym)}" title="Remove ${escapeHtml(m.name)}" aria-label="Remove ${escapeHtml(m.name)}">×</button></div>`;
    }).join('');
    const st = document.getElementById('idxStamp'); if(st) st.textContent = `TradingView · ${new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`;
  }
  function idxPanel(){
    const p = document.getElementById('idxAddPanel'); if(!p) return;
    if(!p.hidden){ p.hidden = true; return; }
    p.hidden = false;
    const regions = [...new Set(IDX.map(x=>x.region))];
    p.innerHTML = `<input id="idxSearch" placeholder="Search any index worldwide, e.g. KOSPI, Merval, Nifty Auto…" class="qx-input">
      <div class="ix-cat">${regions.map(rg=>`<div class="ix-reg"><h5>${escapeHtml(rg)}</h5>${IDX.filter(x=>x.region===rg).map(x=>`<label class="ix-opt"><input type="checkbox" value="${escapeHtml(x.sym)}" ${idxState.list.includes(x.sym)?'checked':''}><span>${escapeHtml(x.name)}</span><em>${escapeHtml(x.country)}</em></label>`).join('')}</div>`).join('')}</div>
      <div style="display:flex;gap:6px;justify-content:flex-end;margin-top:8px"><button type="button" class="btn ghost small" id="idxReset">Reset list</button><button type="button" class="btn small" id="idxDone">Done</button></div>`;
    QXPICK.attach(p.querySelector('#idxSearch'), {indexOnly:true, onPick:(sym, it)=>{ if(!idxState.list.includes(sym)){ idxState.list.push(sym); idxState.extra[sym] = {sym, name:it.raw?.description||sym, country:it.raw?.country||String(sym).split(':')[0]}; SS('quantis_idx_v1', idxState); refreshIndices(); toast(`Added ${it.raw?.description||sym}.`, 'ok'); } }});
    p.querySelectorAll('.ix-opt input').forEach(cb=>cb.addEventListener('change', ()=>{ const s = cb.value; if(cb.checked){ if(!idxState.list.includes(s)) idxState.list.push(s); } else idxState.list = idxState.list.filter(x=>x!==s); SS('quantis_idx_v1', idxState); refreshIndices(); }));
    p.querySelector('#idxDone').onclick = () => { p.hidden = true; };
    p.querySelector('#idxReset').onclick = () => { idxState.list = [...DEFAULT_IDX]; SS('quantis_idx_v1', idxState); p.hidden = true; refreshIndices(); };
  }
  function openIndex(sym){
    const m = idxMeta(sym);
    // Prefer the full Research workspace when the index exists in the built-in universe (charts, risk, technicals)
    const known = SECURITY_UNIVERSE.find(x=>x.cls==='Index' && LD.tvSymbol(x.t)===sym);
    if(known){ goto('research'); selectSecurity(known.t); return; }
    goto('explorer'); setTimeout(()=>QXE.open({kind:'index', sym, name:m.name, exchange:sym.split(':')[0], country:m.country, market:'cfd', raw:{}}), 80);
  }

  /* ======================= Market hours ======================= */
  const minsIn = (tz, d) => { const p = new Intl.DateTimeFormat('en-US', {timeZone:tz, hour12:false, weekday:'short', hour:'2-digit', minute:'2-digit', second:'2-digit'}).formatToParts(d); const g = t => p.find(x=>x.type===t).value; return {wd:g('weekday'), m:(+g('hour')%24)*60 + +g('minute'), s:+g('second'), date:new Intl.DateTimeFormat('en-CA', {timeZone:tz, year:'numeric', month:'2-digit', day:'2-digit'}).format(d)}; };
  const tradingDay = (ex, wd) => ex.week==='sun-thu' ? ['Sun','Mon','Tue','Wed','Thu'].includes(wd) : ex.week==='mon-thu-fri' ? ['Mon','Tue','Wed','Thu','Fri'].includes(wd) : ['Mon','Tue','Wed','Thu','Fri'].includes(wd);
  function exStatus(ex, now){
    const t = minsIn(ex.tz, now), o = ex.open[0]*60+ex.open[1], c = ex.close[0]*60+ex.close[1];
    const hol = holidays[ex.country]?.[t.date];
    const isDay = tradingDay(ex, t.wd) && !hol;
    let status = 'Closed', next = null, nextLbl = '';
    if(isDay && t.m >= o && t.m < c){
      status = 'Open'; next = c - t.m; nextLbl = 'closes in';
      if(ex.lunch){ const ls = ex.lunch[0][0]*60+ex.lunch[0][1], le = ex.lunch[1][0]*60+ex.lunch[1][1]; if(t.m>=ls && t.m<le){ status='Lunch break'; next = le - t.m; nextLbl='reopens in'; } else if(t.m < ls){ next = ls - t.m; nextLbl='lunch in'; } }
    } else {
      // minutes until the next session open (search up to 8 days ahead)
      for(let dd=0; dd<9; dd++){ const probe = new Date(now.getTime() + dd*86400000); const pt = minsIn(ex.tz, probe); if(!tradingDay(ex, pt.wd) || holidays[ex.country]?.[pt.date]) continue; if(dd===0 && t.m >= o) continue; next = (dd===0 ? o - t.m : dd*1440 - t.m + o); break; }
      nextLbl = 'opens in';
    }
    return {status, local:`${String(Math.floor(t.m/60)).padStart(2,'0')}:${String(t.m%60).padStart(2,'0')}`, hol, next, nextLbl};
  }
  const dur = m => m==null ? '' : m>=1440 ? `${Math.floor(m/1440)}d ${Math.floor(m%1440/60)}h` : m>=60 ? `${Math.floor(m/60)}h ${m%60}m` : `${m}m`;
  function sessionInMyTime(ex){
    const now = new Date(); const t = minsIn(ex.tz, now); const offsetMin = ((now.getHours()*60+now.getMinutes()) - t.m + 1440*2) % 1440;
    const f = m => { m = ((m + offsetMin) % 1440 + 1440) % 1440; return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`; };
    return `${f(ex.open[0]*60+ex.open[1])}–${f(ex.close[0]*60+ex.close[1])}`;
  }
  function renderHours(){
    const box = document.getElementById('marketHoursBox'); if(!box) return;
    const now = new Date(); const list = exList.map(id=>EX.find(e=>e.id===id)).filter(Boolean);
    const open = list.filter(ex=>exStatus(ex, now).status==='Open').length;
    box.innerHTML = `<div class="mh-sum"><b>${open}</b> of ${list.length} open now · your time ${now.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>` + list.map(ex=>{
      const s = exStatus(ex, now); const c = s.status==='Open' ? 'open' : s.status==='Lunch break' ? 'lunch' : 'closed';
      return `<div class="mh-row"><div class="mh-name"><b>${escapeHtml(ex.name)}</b><span>${escapeHtml(ex.city)} · ${escapeHtml(ex.ccy)} · local ${s.local}${s.hol?` · <em>${escapeHtml(s.hol)}</em>`:''}</span><span class="mh-my" title="Regular session converted to your time zone">Session in your time: ${sessionInMyTime(ex)}</span></div>
        <div class="mh-st"><span class="mh-pill ${c}">${s.status}</span><span class="mh-cd">${s.nextLbl} ${dur(s.next)}</span></div><button type="button" class="ix-x" data-rmex="${escapeHtml(ex.id)}" aria-label="Remove ${escapeHtml(ex.name)}">×</button></div>`;
    }).join('') + `<div class="qxa-dim" style="margin-top:6px">Regular sessions; national holidays via Nager.Date. Exchange-specific half-days are not included.</div>`;
  }
  function hoursPanel(){
    const p = document.getElementById('hoursAddPanel'); if(!p) return; if(!p.hidden){ p.hidden = true; return; } p.hidden = false;
    p.innerHTML = `<div class="ix-cat">${EX.map(ex=>`<label class="ix-opt"><input type="checkbox" value="${escapeHtml(ex.id)}" ${exList.includes(ex.id)?'checked':''}><span>${escapeHtml(ex.name)}</span><em>${escapeHtml(ex.city)}</em></label>`).join('')}</div><div style="text-align:right;margin-top:8px"><button type="button" class="btn small" id="hoursDone">Done</button></div>`;
    p.querySelectorAll('input').forEach(cb=>cb.addEventListener('change', ()=>{ exList = cb.checked ? [...new Set([...exList, cb.value])] : exList.filter(x=>x!==cb.value); SS('quantis_ex_v1', exList); loadHolidays(); renderHours(); }));
    p.querySelector('#hoursDone').onclick = () => { p.hidden = true; };
  }
  async function loadHolidays(){
    const year = new Date().getFullYear(); const codes = [...new Set(exList.map(id=>EX.find(e=>e.id===id)?.country).filter(Boolean))].filter(c=>!holidays[c]);
    await Promise.all(codes.map(async c=>{ try{ const list = await fetchPublicHolidays(c, year); holidays[c] = Object.fromEntries((list||[]).map(h=>[h.date, h.localName||h.name])); }catch(e){ holidays[c] = {}; } }));
    renderHours();
  }

  /* ======================= Pulse ======================= */
  let pulseTok = 0;
  async function refreshPulse(){
    const grid = document.getElementById('pulseGrid'), badge = document.getElementById('pulseBadge'), note = document.getElementById('pulseNote'); if(!grid) return;
    const my = ++pulseTok;
    if(!grid.querySelector('.pl-tile')) grid.innerHTML = pulseList.map(()=>'<div class="qx-skel" style="height:74px"></div>').join('');
    try{
      const {rows} = await LD.tvScan('global', {symbols:{tickers:pulseList}, columns:['close','change','Perf.W','Perf.1M','currency']});
      if(my!==pulseTok) return; const by = Object.fromEntries(rows.map(r=>[r._s, r]));
      grid.innerHTML = pulseList.map(sym=>{ const m = PULSE.find(x=>x.sym===sym) || {label:sym, name:sym}; const r = by[sym];
        const v = r && fin(r.close) ? r.close : null; const big = v!=null && Math.abs(v) >= 1e9;
        return `<div class="pl-tile" title="${escapeHtml(m.name)}"><span>${escapeHtml(m.label)}</span><b>${v==null?'—':big?(v/1e12>=1?(v/1e12).toFixed(2)+'T':(v/1e9).toFixed(1)+'B'):v.toLocaleString(undefined,{maximumFractionDigits: Math.abs(v)<10?4:2})}</b><i class="${cls(r?.change)}">${r?pc(r.change):'no data'} today</i><em>1W ${r?pc(r['Perf.W']):'—'} · 1M ${r?pc(r['Perf.1M']):'—'}</em><button type="button" class="ix-x" data-rmpl="${escapeHtml(sym)}" aria-label="Remove ${escapeHtml(m.label)}">×</button></div>`; }).join('');
      if(badge){ badge.textContent = 'LIVE'; badge.className = 'badge fact'; }
      if(note) note.textContent = `TradingView quotes · updated ${new Date().toLocaleTimeString()} · refreshes every minute while Home is open.`;
    }catch(e){ if(my!==pulseTok) return; if(badge){ badge.textContent='UNAVAILABLE'; badge.className='badge assume'; } if(note) note.textContent = 'Live quotes unreachable: '+e.message; }
  }
  function pulsePanel(){
    const p = document.getElementById('pulseAddPanel'); if(!p) return; if(!p.hidden){ p.hidden = true; return; } p.hidden = false;
    const groups = [...new Set(PULSE.map(x=>x.group))];
    p.innerHTML = `<div class="ix-cat">${groups.map(g=>`<div class="ix-reg"><h5>${g}</h5>${PULSE.filter(x=>x.group===g).map(x=>`<label class="ix-opt"><input type="checkbox" value="${escapeHtml(x.sym)}" ${pulseList.includes(x.sym)?'checked':''}><span>${escapeHtml(x.label)}</span></label>`).join('')}</div>`).join('')}</div><div style="text-align:right;margin-top:8px"><button type="button" class="btn small" id="pulseDone">Done</button></div>`;
    p.querySelectorAll('input').forEach(cb=>cb.addEventListener('change', ()=>{ pulseList = cb.checked ? [...new Set([...pulseList, cb.value])] : pulseList.filter(x=>x!==cb.value); SS('quantis_pulse_v1', pulseList); refreshPulse(); }));
    p.querySelector('#pulseDone').onclick = () => { p.hidden = true; };
  }

  /* ======================= Breadth market list & regime ======================= */
  const MARKETS = {'Global':[['global','Global — all markets']],
    'Americas':[['america','United States'],['canada','Canada'],['brazil','Brazil'],['mexico','Mexico'],['argentina','Argentina'],['chile','Chile'],['colombia','Colombia'],['peru','Peru']],
    'Europe':[['uk','United Kingdom'],['germany','Germany'],['france','France'],['italy','Italy'],['spain','Spain'],['netherlands','Netherlands'],['belgium','Belgium'],['switzerland','Switzerland'],['sweden','Sweden'],['norway','Norway'],['denmark','Denmark'],['finland','Finland'],['austria','Austria'],['portugal','Portugal'],['ireland','Ireland'],['poland','Poland'],['greece','Greece'],['hungary','Hungary'],['czech','Czech Republic'],['romania','Romania'],['turkey','Turkey'],['russia','Russia'],['iceland','Iceland'],['estonia','Estonia'],['lithuania','Lithuania']],
    'Middle East & Africa':[['israel','Israel'],['ksa','Saudi Arabia'],['uae','UAE'],['qatar','Qatar'],['kuwait','Kuwait'],['bahrain','Bahrain'],['egypt','Egypt'],['rsa','South Africa'],['nigeria','Nigeria'],['kenya','Kenya'],['morocco','Morocco'],['tunisia','Tunisia']],
    'Asia-Pacific':[['india','India'],['china','China'],['japan','Japan'],['hongkong','Hong Kong'],['korea','South Korea'],['taiwan','Taiwan'],['singapore','Singapore'],['malaysia','Malaysia'],['thailand','Thailand'],['indonesia','Indonesia'],['philippines','Philippines'],['vietnam','Vietnam'],['pakistan','Pakistan'],['bangladesh','Bangladesh'],['srilanka','Sri Lanka'],['australia','Australia'],['newzealand','New Zealand']]};
  function fillMarketSelect(){
    const sel = document.getElementById('dashMarket'); if(!sel || sel.dataset.full) return; sel.dataset.full = '1';
    const cur = (()=>{ try{ return localStorage.getItem('quantis_dash_market') || 'america'; }catch(e){ return 'america'; } })();
    sel.innerHTML = Object.entries(MARKETS).map(([g,l])=>`<optgroup label="${g}">${l.map(([v,n])=>`<option value="${v}">${n}</option>`).join('')}</optgroup>`).join('');
    sel.value = cur; if(!sel.value) sel.value = 'america';
    Object.values(MARKETS).flat().forEach(([v,n])=>{ DASH_MARKET_LABEL[v] = n; });
  }
  const REGIME_IDX = ['SPX','NDX','DJI','NIFTY50','SENSEX','FTSE100','DAX','NIKKEI225','HANGSENG','KOSPI'];
  function fillRegimeSelect(){
    const sel = document.getElementById('regimeIdx'); if(!sel || sel.dataset.ok) return; sel.dataset.ok = '1';
    sel.innerHTML = REGIME_IDX.filter(t=>SECURITY_UNIVERSE.some(x=>x.t===t)).map(t=>`<option value="${t}">${escapeHtml(SECURITY_UNIVERSE.find(x=>x.t===t).n)}</option>`).join('');
    sel.value = LS('quantis_regime_idx', 'SPX'); sel.addEventListener('change', ()=>{ SS('quantis_regime_idx', sel.value); renderMarketRegime(); });
  }

  /* ======================= Currency converter ======================= */
  let ccyLoaded = false;
  async function loadCurrencies(){
    if(ccyLoaded) return; ccyLoaded = true;
    try{
      const j = await cachedJson('er_usd', 6*3600e3, async()=>{ const r = await fetchWithTimeout('https://open.er-api.com/v6/latest/USD', {}, 9000); if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); });
      const codes = Object.keys(j.rates||{}).sort(); if(codes.length < 20) return;
      const names = (()=>{ try{ return new Intl.DisplayNames(['en'], {type:'currency'}); }catch(e){ return null; } })();
      ['fxConvFrom','fxConvTo'].forEach(id=>{ const s = document.getElementById(id); if(!s) return; const v = s.value; s.innerHTML = codes.map(c=>`<option value="${c}">${c}${names?' — '+escapeHtml(names.of(c)||''):''}</option>`).join(''); s.value = v; });
    }catch(e){}
  }

  /* ======================= init ======================= */
  function init(){
    const g = document.getElementById('dashGrid'); if(!g || g.dataset.ready) return; g.dataset.ready = '1';
    applyLayout(); fillMarketSelect(); fillRegimeSelect(); loadCurrencies();
    document.getElementById('dashCustomizeBtn')?.addEventListener('click', customize);
    // indices
    document.getElementById('idxAddBtn')?.addEventListener('click', idxPanel);
    const seg = document.getElementById('idxPeriod');
    if(seg){ seg.querySelectorAll('button').forEach(b=>b.classList.toggle('active', b.dataset.v===idxState.period)); seg.addEventListener('click', e=>{ const b = e.target.closest('button'); if(!b) return; idxState.period = b.dataset.v; SS('quantis_idx_v1', idxState); seg.querySelectorAll('button').forEach(x=>x.classList.toggle('active', x===b)); refreshIndices(); }); }
    const sortSel = document.getElementById('idxSort'); if(sortSel){ sortSel.value = idxState.sort; sortSel.addEventListener('change', ()=>{ idxState.sort = sortSel.value; SS('quantis_idx_v1', idxState); refreshIndices(); }); }
    document.getElementById('idxList')?.addEventListener('click', e=>{ const x = e.target.closest('[data-rm]'); if(x){ e.stopPropagation(); idxState.list = idxState.list.filter(s=>s!==x.dataset.rm); SS('quantis_idx_v1', idxState); refreshIndices(); const cb = document.querySelector(`#idxAddPanel input[value="${CSS.escape(x.dataset.rm)}"]`); if(cb) cb.checked = false; return; } const r = e.target.closest('.ix-row'); if(r) openIndex(r.dataset.sym); });
    document.getElementById('idxList')?.addEventListener('keydown', e=>{ if(e.key==='Enter'){ const r = e.target.closest('.ix-row'); if(r) openIndex(r.dataset.sym); } });
    // hours
    document.getElementById('hoursAddBtn')?.addEventListener('click', hoursPanel);
    document.getElementById('marketHoursBox')?.addEventListener('click', e=>{ const x = e.target.closest('[data-rmex]'); if(x){ exList = exList.filter(i=>i!==x.dataset.rmex); SS('quantis_ex_v1', exList); renderHours(); } });
    // pulse
    document.getElementById('pulseAddBtn')?.addEventListener('click', pulsePanel);
    document.getElementById('pulseGrid')?.addEventListener('click', e=>{ const x = e.target.closest('[data-rmpl]'); if(x){ pulseList = pulseList.filter(s=>s!==x.dataset.rmpl); SS('quantis_pulse_v1', pulseList); refreshPulse(); } });
    // fx swap + quick pairs
    document.getElementById('fxSwap')?.addEventListener('click', ()=>{ const a = document.getElementById('fxConvFrom'), b = document.getElementById('fxConvTo'); [a.value, b.value] = [b.value, a.value]; runCurrencyConvert(); });
    ['fxConvFrom','fxConvTo'].forEach(id=>document.getElementById(id)?.addEventListener('change', runCurrencyConvert));
    document.getElementById('fxConvAmount')?.addEventListener('input', ()=>{ clearTimeout(window.__fxT); window.__fxT = setTimeout(runCurrencyConvert, 300); });
    document.getElementById('fxQuick')?.addEventListener('click', e=>{ const b = e.target.closest('button[data-p]'); if(!b) return; const [f,t] = b.dataset.p.split('/'); document.getElementById('fxConvFrom').value = f; document.getElementById('fxConvTo').value = t; runCurrencyConvert(); });
    // movers mode
    document.getElementById('moversMode')?.addEventListener('click', e=>{ const b = e.target.closest('button'); if(!b) return; SS('quantis_movers_mode', b.dataset.v); document.querySelectorAll('#moversMode button').forEach(x=>x.classList.toggle('active', x===b)); renderMarketSnapshot(); });
    document.querySelectorAll('#moversMode button').forEach(x=>x.classList.toggle('active', x.dataset.v===LS('quantis_movers_mode','both')));
    // watchlist snapshot: add from Home
    const wa = document.getElementById('dashWatchAdd'); if(wa) QXPICK.attach(wa, {onPick:t=>{ addToWatchlist(t); renderWatchlist(); refreshDashWatch(); }});
    refreshIndices(); loadHolidays(); renderHours(); refreshPulse();
    clearInterval(idxTimer);
    idxTimer = setInterval(()=>{ if(document.visibilityState==='visible' && document.getElementById('view-dashboard')?.classList.contains('active')){ refreshIndices(); refreshPulse(); } renderHours(); }, 60e3);
  }
  return {init, refreshIndices, refreshPulse, customize, renderHours, IDX, EX, PULSE};
})();
