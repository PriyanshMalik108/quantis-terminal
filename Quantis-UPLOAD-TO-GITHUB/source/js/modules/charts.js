/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/modules/charts.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Advanced chart widget (TradingView Lightweight Charts v5): 14 chart types, 1m–1M intervals, 29 indicators, drawing tools, compare, multi-chart grid.
 * DEPENDS   LightweightCharts (CDN), LD, safeStorage, SECURITIES
 * EXPOSES   QXC (single global namespace object — keep new public functions on it)
 * PATTERN   IIFE module: private helpers stay inside the closure; only the returned object is global.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* =====================================================================================
   QUANTIS ADVANCED CHARTS — built on TradingView's open-source Lightweight Charts (Apache-2.0)
   Chart types · intervals 1m→1M · 25 indicators (overlay + separate panes) · drawing tools ·
   crosshair legend · compare · log/% scales · screenshots · saved layouts · multi-chart grid.
   Data: CNBC bars (keyless, CORS-open) for every interval; the app's own daily chain
   (CNBC → CoinGecko / ECB / AMFI fallbacks) for daily data on any other instrument.
   ===================================================================================== */
const QXC = (() => {
  const LW = () => window.LightweightCharts;
  const TZ_SHIFT = -new Date().getTimezoneOffset() * 60; // display intraday bars in the viewer's local time
  const CFG_KEY = 'qx_chart_cfg_v2', DRAW_KEY = 'qx_draw_v2_';
  const store = {
    get(k, d){ try{ const v = safeStorage.getItem(k); return v ? JSON.parse(v) : d; }catch(e){ return d; } },
    set(k, v){ try{ safeStorage.setItem(k, JSON.stringify(v)); }catch(e){} },
  };
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  /* ---------------- catalogues ---------------- */
  const CHART_TYPES = [
    ['candles','Candles'],['hollow','Hollow candles'],['heikin','Heikin Ashi'],['bars','OHLC bars'],['hlc','HLC bars'],
    ['line','Line'],['linemarkers','Line with markers'],['step','Step line'],['area','Area'],['baseline','Baseline'],
    ['columns','Columns'],['hilo','High-Low'],['renko','Renko'],['linebreak','Line break (3)'],
  ];
  const INTERVALS = [
    ['1M','1m','1 minute',3],['5M','5m','5 minutes',10],['15M','15m','15 minutes',20],['30M','30m','30 minutes',30],
    ['1H','1h','1 hour',90],['4H','4h','4 hours',240],['1D','D','1 day',null],['1W','W','1 week',null],['1MO','M','1 month',null],
  ];
  const RANGES = [['1D',1],['5D',5],['1M',30],['3M',91],['6M',182],['YTD','ytd'],['1Y',365],['5Y',1826],['ALL',null]];
  const IND = {
    // overlays (pane 0)
    sma:{name:'Simple Moving Average',short:'SMA',overlay:true,params:{period:20},colors:['#60A5FA']},
    ema:{name:'Exponential Moving Average',short:'EMA',overlay:true,params:{period:50},colors:['#F472B6']},
    wma:{name:'Weighted Moving Average',short:'WMA',overlay:true,params:{period:20},colors:['#FBBF24']},
    hma:{name:'Hull Moving Average',short:'HMA',overlay:true,params:{period:21},colors:['#22D3EE']},
    vwap:{name:'VWAP (session / anchored)',short:'VWAP',overlay:true,params:{},colors:['#E879F9']},
    bb:{name:'Bollinger Bands',short:'BB',overlay:true,params:{period:20,mult:2},colors:['#A78BFA','#A78BFA','#A78BFA']},
    kc:{name:'Keltner Channels',short:'KC',overlay:true,params:{period:20,mult:2},colors:['#34D399','#34D399','#34D399']},
    dc:{name:'Donchian Channels',short:'DC',overlay:true,params:{period:20},colors:['#FB923C','#FB923C','#FB923C']},
    ichi:{name:'Ichimoku Cloud',short:'Ichimoku',overlay:true,params:{conv:9,base:26,span:52},colors:['#60A5FA','#F87171','#34D399','#F472B6']},
    psar:{name:'Parabolic SAR',short:'PSAR',overlay:true,params:{step:0.02,max:0.2},colors:['#FBBF24']},
    st:{name:'Supertrend',short:'Supertrend',overlay:true,params:{period:10,mult:3},colors:['#3ECF8E','#FF5C6C']},
    env:{name:'Moving Average Envelope',short:'ENV',overlay:true,params:{period:20,pct:2.5},colors:['#94A3B8','#94A3B8','#94A3B8']},
    lr:{name:'Linear Regression Channel',short:'LinReg',overlay:true,params:{period:100,mult:2},colors:['#38BDF8','#38BDF8','#38BDF8']},
    pivots:{name:'Pivot Points (classic, prior period)',short:'Pivots',overlay:true,params:{},colors:['#94A3B8']},
    // separate panes
    vol:{name:'Volume',short:'Vol',overlay:false,params:{ma:20},colors:['#3ECF8E','#FF5C6C','#FBBF24']},
    rsi:{name:'Relative Strength Index',short:'RSI',overlay:false,params:{period:14},colors:['#A78BFA']},
    macd:{name:'MACD',short:'MACD',overlay:false,params:{fast:12,slow:26,signal:9},colors:['#60A5FA','#F59E0B','#3ECF8E','#FF5C6C']},
    stoch:{name:'Stochastic',short:'Stoch',overlay:false,params:{k:14,d:3},colors:['#60A5FA','#F59E0B']},
    stochrsi:{name:'Stochastic RSI',short:'StochRSI',overlay:false,params:{period:14,k:3,d:3},colors:['#60A5FA','#F59E0B']},
    atr:{name:'Average True Range',short:'ATR',overlay:false,params:{period:14},colors:['#F87171']},
    adx:{name:'ADX / DMI',short:'ADX',overlay:false,params:{period:14},colors:['#FBBF24','#3ECF8E','#FF5C6C']},
    cci:{name:'Commodity Channel Index',short:'CCI',overlay:false,params:{period:20},colors:['#22D3EE']},
    willr:{name:'Williams %R',short:'%R',overlay:false,params:{period:14},colors:['#F472B6']},
    mfi:{name:'Money Flow Index',short:'MFI',overlay:false,params:{period:14},colors:['#34D399']},
    obv:{name:'On-Balance Volume',short:'OBV',overlay:false,params:{},colors:['#60A5FA']},
    roc:{name:'Rate of Change',short:'ROC',overlay:false,params:{period:12},colors:['#FB923C']},
    cmf:{name:'Chaikin Money Flow',short:'CMF',overlay:false,params:{period:20},colors:['#2DD4BF']},
    aroon:{name:'Aroon',short:'Aroon',overlay:false,params:{period:25},colors:['#3ECF8E','#FF5C6C']},
    hv:{name:'Historical Volatility (annualised)',short:'HV',overlay:false,params:{period:20},colors:['#E879F9']},
  };
  const IND_GROUPS = [
    ['Moving averages', ['sma','ema','wma','hma','vwap','env']],
    ['Bands & channels', ['bb','kc','dc','lr']],
    ['Trend', ['ichi','psar','st','adx','aroon','pivots']],
    ['Momentum (oscillators)', ['rsi','macd','stoch','stochrsi','cci','willr','roc']],
    ['Volume', ['vol','obv','mfi','cmf']],
    ['Volatility', ['atr','hv']],
  ];
  const TOOLS = [
    ['cursor','Cursor / select','M4 3l14 7-6 2-2 6z'],
    ['trend','Trend line','M4 20L20 4'],
    ['ray','Ray (extends right)','M4 20L20 4M14 10l6-6'],
    ['hline','Horizontal line','M3 12h18'],
    ['vline','Vertical line','M12 3v18'],
    ['rect','Rectangle zone','M4 6h16v12H4z'],
    ['fib','Fibonacci retracement','M3 5h18M3 9h18M3 13h18M3 19h18'],
    ['measure','Measure (price & % change)','M4 20V4M20 20V4M4 12h16'],
    ['text','Text note','M5 5h14M12 5v14'],
  ];

  /* ---------------- maths (array-based, aligned to bars; null during warm-up) ---------------- */
  const M = {
    sma(a,n){ const o=new Array(a.length).fill(null); let s=0; for(let i=0;i<a.length;i++){ s+=a[i]; if(i>=n) s-=a[i-n]; if(i>=n-1) o[i]=s/n; } return o; },
    ema(a,n){ const o=new Array(a.length).fill(null); const k=2/(n+1); let e=null, s=0; for(let i=0;i<a.length;i++){ if(a[i]==null) continue; if(e==null){ s+=a[i]; if(i===n-1){ e=s/n; o[i]=e; } continue; } e=a[i]*k+e*(1-k); o[i]=e; } return o; },
    emaNull(a,n){ const o=new Array(a.length).fill(null); const k=2/(n+1); let e=null, cnt=0, s=0; for(let i=0;i<a.length;i++){ const v=a[i]; if(v==null) continue; if(e==null){ s+=v; cnt++; if(cnt===n){ e=s/n; o[i]=e; } continue; } e=v*k+e*(1-k); o[i]=e; } return o; },
    rma(a,n){ const o=new Array(a.length).fill(null); let r=null, s=0, c=0; for(let i=0;i<a.length;i++){ const v=a[i]; if(v==null) continue; if(r==null){ s+=v; c++; if(c===n){ r=s/n; o[i]=r; } continue; } r=(r*(n-1)+v)/n; o[i]=r; } return o; },
    wma(a,n){ const o=new Array(a.length).fill(null); const den=n*(n+1)/2; for(let i=n-1;i<a.length;i++){ let s=0; for(let j=0;j<n;j++) s+=a[i-j]*(n-j); o[i]=s/den; } return o; },
    std(a,n){ const o=new Array(a.length).fill(null); for(let i=n-1;i<a.length;i++){ let m=0; for(let j=i-n+1;j<=i;j++) m+=a[j]; m/=n; let v=0; for(let j=i-n+1;j<=i;j++) v+=(a[j]-m)**2; o[i]=Math.sqrt(v/n); } return o; },
    tr(h,l,c){ return h.map((x,i)=> i===0 ? x-l[i] : Math.max(x-l[i], Math.abs(x-c[i-1]), Math.abs(l[i]-c[i-1]))); },
    hh(a,n,i){ let m=-Infinity; for(let j=Math.max(0,i-n+1);j<=i;j++) m=Math.max(m,a[j]); return m; },
    ll(a,n,i){ let m=Infinity; for(let j=Math.max(0,i-n+1);j<=i;j++) m=Math.min(m,a[j]); return m; },
  };
  function calcIndicator(id, p, B){
    const c=B.close, h=B.high, l=B.low, o=B.open, v=B.volume||[], n=c.length;
    const out = [];
    switch(id){
      case 'sma': out.push(M.sma(c,p.period)); break;
      case 'ema': out.push(M.ema(c,p.period)); break;
      case 'wma': out.push(M.wma(c,p.period)); break;
      case 'hma': { const half=M.wma(c,Math.max(1,Math.round(p.period/2))), full=M.wma(c,p.period); const diff=c.map((_,i)=> half[i]!=null&&full[i]!=null ? 2*half[i]-full[i] : null); const sq=Math.max(1,Math.round(Math.sqrt(p.period))); const r=new Array(n).fill(null); for(let i=0;i<n;i++){ let ok=true, s=0, den=sq*(sq+1)/2; for(let j=0;j<sq;j++){ const x=diff[i-j]; if(x==null){ ok=false; break; } s+=x*(sq-j); } if(ok) r[i]=s/den; } out.push(r); break; }
      case 'vwap': { const r=new Array(n).fill(null); let pv=0, vv=0, day=null; for(let i=0;i<n;i++){ const d = B.intraday ? new Date((B.time[i]-TZ_SHIFT)*1000).toISOString().slice(0,10) : 'all'; if(d!==day){ pv=0; vv=0; day=d; } const tp=(h[i]+l[i]+c[i])/3, vol=v[i]||0; pv+=tp*vol; vv+=vol; r[i]= vv>0 ? pv/vv : null; } out.push(r); break; }
      case 'bb': { const m=M.sma(c,p.period), s=M.std(c,p.period); out.push(m.map((x,i)=>x==null?null:x+p.mult*s[i]), m, m.map((x,i)=>x==null?null:x-p.mult*s[i])); break; }
      case 'kc': { const m=M.ema(c,p.period), a=M.rma(M.tr(h,l,c),10); out.push(m.map((x,i)=>x==null||a[i]==null?null:x+p.mult*a[i]), m, m.map((x,i)=>x==null||a[i]==null?null:x-p.mult*a[i])); break; }
      case 'dc': { const up=c.map((_,i)=> i>=p.period-1 ? M.hh(h,p.period,i) : null), dn=c.map((_,i)=> i>=p.period-1 ? M.ll(l,p.period,i) : null); out.push(up, up.map((x,i)=>x==null?null:(x+dn[i])/2), dn); break; }
      case 'env': { const m=M.sma(c,p.period); out.push(m.map(x=>x==null?null:x*(1+p.pct/100)), m, m.map(x=>x==null?null:x*(1-p.pct/100))); break; }
      case 'lr': { const N=Math.min(p.period, n), mid=new Array(n).fill(null), up=new Array(n).fill(null), dn=new Array(n).fill(null); if(N>=10){ const s=n-N; let sx=0,sy=0,sxy=0,sxx=0; for(let i=0;i<N;i++){ sx+=i; sy+=c[s+i]; sxy+=i*c[s+i]; sxx+=i*i; } const b=(N*sxy-sx*sy)/(N*sxx-sx*sx), a=(sy-b*sx)/N; let e=0; for(let i=0;i<N;i++){ e+=(c[s+i]-(a+b*i))**2; } const sd=Math.sqrt(e/N); for(let i=0;i<N;i++){ const y=a+b*i; mid[s+i]=y; up[s+i]=y+p.mult*sd; dn[s+i]=y-p.mult*sd; } } out.push(up, mid, dn); break; }
      case 'ichi': { const mid=(per,i)=> i>=per-1 ? (M.hh(h,per,i)+M.ll(l,per,i))/2 : null; const conv=c.map((_,i)=>mid(p.conv,i)), base=c.map((_,i)=>mid(p.base,i)); const sa=new Array(n).fill(null), sb=new Array(n).fill(null), lag=new Array(n).fill(null); for(let i=0;i<n;i++){ const j=i+p.base; if(j<n){ if(conv[i]!=null&&base[i]!=null) sa[j]=(conv[i]+base[i])/2; const m=mid(p.span,i); if(m!=null) sb[j]=m; } if(i-p.base>=0) lag[i-p.base]=c[i]; } out.push(conv, base, sa, sb); break; }
      case 'psar': { const r=new Array(n).fill(null); if(n>2){ let up=c[1]>=c[0], af=p.step, ep=up?h[0]:l[0], sar=up?l[0]:h[0]; for(let i=1;i<n;i++){ sar=sar+af*(ep-sar); if(up){ sar=Math.min(sar,l[i-1],i>1?l[i-2]:l[i-1]); if(l[i]<sar){ up=false; sar=ep; ep=l[i]; af=p.step; } else if(h[i]>ep){ ep=h[i]; af=Math.min(p.max,af+p.step); } } else { sar=Math.max(sar,h[i-1],i>1?h[i-2]:h[i-1]); if(h[i]>sar){ up=true; sar=ep; ep=h[i]; af=p.step; } else if(l[i]<ep){ ep=l[i]; af=Math.min(p.max,af+p.step); } } r[i]=sar; } } out.push(r); break; }
      case 'st': { const atr=M.rma(M.tr(h,l,c),p.period); const upL=new Array(n).fill(null), dnL=new Array(n).fill(null); let fu=null, fl=null, trend=1; for(let i=0;i<n;i++){ if(atr[i]==null) continue; const hl2=(h[i]+l[i])/2, bu=hl2+p.mult*atr[i], bl=hl2-p.mult*atr[i]; fu = (fu==null || bu<fu || c[i-1]>fu) ? bu : fu; fl = (fl==null || bl>fl || c[i-1]<fl) ? bl : fl; if(trend===1 && c[i]<fl) trend=-1; else if(trend===-1 && c[i]>fu) trend=1; if(trend===1) upL[i]=fl; else dnL[i]=fu; } out.push(upL, dnL); break; }
      case 'pivots': { out.push([]); break; }
      case 'vol': out.push(v.slice(), M.sma(v.map(x=>x||0),p.ma)); break;
      case 'rsi': out.push(rsiArr(c,p.period)); break;
      case 'macd': { const f=M.ema(c,p.fast), s=M.ema(c,p.slow); const m=c.map((_,i)=>f[i]!=null&&s[i]!=null?f[i]-s[i]:null); const sig=M.emaNull(m,p.signal); out.push(m, sig, m.map((x,i)=>x!=null&&sig[i]!=null?x-sig[i]:null)); break; }
      case 'stoch': { const k=c.map((_,i)=>{ if(i<p.k-1) return null; const hh=M.hh(h,p.k,i), ll=M.ll(l,p.k,i); return hh===ll?50:(c[i]-ll)/(hh-ll)*100; }); const ks=smaNull(k,3), d=smaNull(ks,p.d); out.push(ks,d); break; }
      case 'stochrsi': { const r=rsiArr(c,p.period); const st=r.map((x,i)=>{ if(x==null) return null; let mx=-Infinity, mn=Infinity, ok=true; for(let j=i-p.period+1;j<=i;j++){ if(j<0||r[j]==null){ ok=false; break; } mx=Math.max(mx,r[j]); mn=Math.min(mn,r[j]); } return ok ? (mx===mn?50:(x-mn)/(mx-mn)*100) : null; }); const k=smaNull(st,p.k), d=smaNull(k,p.d); out.push(k,d); break; }
      case 'atr': out.push(M.rma(M.tr(h,l,c),p.period)); break;
      case 'adx': { const up=h.map((x,i)=>i?x-h[i-1]:0), dn=l.map((x,i)=>i?l[i-1]-x:0); const pdm=up.map((u,i)=> u>dn[i]&&u>0?u:0), ndm=dn.map((d,i)=> d>up[i]&&d>0?d:0); const tr=M.rma(M.tr(h,l,c),p.period), sp=M.rma(pdm,p.period), sn=M.rma(ndm,p.period); const pdi=tr.map((t,i)=>t?100*sp[i]/t:null), ndi=tr.map((t,i)=>t?100*sn[i]/t:null); const dx=pdi.map((x,i)=> x!=null&&ndi[i]!=null&&(x+ndi[i])>0 ? 100*Math.abs(x-ndi[i])/(x+ndi[i]) : null); out.push(M.rma(dx.map(x=>x),p.period), pdi, ndi); break; }
      case 'cci': { const tp=c.map((x,i)=>(h[i]+l[i]+x)/3), m=M.sma(tp,p.period); out.push(tp.map((x,i)=>{ if(m[i]==null) return null; let md=0; for(let j=i-p.period+1;j<=i;j++) md+=Math.abs(tp[j]-m[i]); md/=p.period; return md? (x-m[i])/(0.015*md) : 0; })); break; }
      case 'willr': out.push(c.map((x,i)=>{ if(i<p.period-1) return null; const hh=M.hh(h,p.period,i), ll=M.ll(l,p.period,i); return hh===ll?-50:-100*(hh-x)/(hh-ll); })); break;
      case 'mfi': { const tp=c.map((x,i)=>(h[i]+l[i]+x)/3); out.push(tp.map((x,i)=>{ if(i<p.period) return null; let pos=0, neg=0; for(let j=i-p.period+1;j<=i;j++){ const mf=tp[j]*(v[j]||0); if(tp[j]>tp[j-1]) pos+=mf; else if(tp[j]<tp[j-1]) neg+=mf; } return neg===0?100:100-100/(1+pos/neg); })); break; }
      case 'obv': { let s=0; out.push(c.map((x,i)=>{ if(i>0){ if(x>c[i-1]) s+=(v[i]||0); else if(x<c[i-1]) s-=(v[i]||0); } return s; })); break; }
      case 'roc': out.push(c.map((x,i)=> i>=p.period ? (x/c[i-p.period]-1)*100 : null)); break;
      case 'cmf': { const mfv=c.map((x,i)=> h[i]===l[i]?0:((x-l[i])-(h[i]-x))/(h[i]-l[i])*(v[i]||0)); out.push(c.map((_,i)=>{ if(i<p.period-1) return null; let a=0,b=0; for(let j=i-p.period+1;j<=i;j++){ a+=mfv[j]; b+=(v[j]||0); } return b?a/b:0; })); break; }
      case 'aroon': { const up=new Array(n).fill(null), dn=new Array(n).fill(null); for(let i=p.period;i<n;i++){ let hi=i, lo=i; for(let j=i-p.period;j<=i;j++){ if(h[j]>=h[hi]) hi=j; if(l[j]<=l[lo]) lo=j; } up[i]=100*(p.period-(i-hi))/p.period; dn[i]=100*(p.period-(i-lo))/p.period; } out.push(up,dn); break; }
      case 'hv': { const ann = B.intraday ? Math.sqrt(252*6.5*60/(B.minutes||60)) : Math.sqrt(B.periodsPerYear||252); const r=c.map((x,i)=> i? Math.log(x/c[i-1]) : null); out.push(c.map((_,i)=>{ if(i<p.period) return null; let m=0; for(let j=i-p.period+1;j<=i;j++) m+=r[j]; m/=p.period; let s=0; for(let j=i-p.period+1;j<=i;j++) s+=(r[j]-m)**2; return Math.sqrt(s/(p.period-1))*ann*100; })); break; }
    }
    return out;
  }
  function smaNull(a,n){ const o=new Array(a.length).fill(null); for(let i=0;i<a.length;i++){ let s=0, ok=true; for(let j=i-n+1;j<=i;j++){ if(j<0||a[j]==null){ ok=false; break; } s+=a[j]; } if(ok) o[i]=s/n; } return o; }
  function rsiArr(c,n){ const o=new Array(c.length).fill(null); let ag=0, al=0; for(let i=1;i<c.length;i++){ const d=c[i]-c[i-1], g=Math.max(d,0), lo=Math.max(-d,0); if(i<=n){ ag+=g; al+=lo; if(i===n){ ag/=n; al/=n; o[i]= al===0?100:100-100/(1+ag/al); } } else { ag=(ag*(n-1)+g)/n; al=(al*(n-1)+lo)/n; o[i]= al===0?100:100-100/(1+ag/al); } } return o; }

  /* ---------------- data ---------------- */
  const pad = x => String(x).padStart(2,'0');
  const stamp = d => `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00`;
  const dataCache = new Map();
  async function cnbcBars(sym, iv, days){
    const end = new Date(Date.now()+864e5), start = new Date(Date.now()-days*864e5);
    const url = `https://ts-api.cnbc.com/harmony/app/bars/${encodeURIComponent(sym)}/${iv}/${stamp(start)}/${stamp(end)}/adjusted/EST5EDT.json`;
    const r = await fetchWithTimeout(url, {mode:'cors'}, 15000);
    if(!r.ok) throw new Error('CNBC HTTP '+r.status);
    const j = await r.json();
    const bars = (j && j.barData && j.barData.priceBars) || [];
    const out = {time:[], open:[], high:[], low:[], close:[], volume:[]};
    const num = x => { const v = parseFloat(String(x).replace(/,/g,'')); return isFinite(v) ? v : null; };
    for(const b of bars){
      const cl = num(b.close); if(cl==null || cl<=0) continue;
      const t = Math.floor(Number(b.tradeTimeinMills)/1000);
      if(!isFinite(t)) continue;
      if(out.time.length && t <= out.time[out.time.length-1]) continue;
      out.time.push(t); out.close.push(cl);
      out.open.push(num(b.open) ?? cl); out.high.push(Math.max(num(b.high) ?? cl, cl)); out.low.push(Math.min(num(b.low) ?? cl, cl)); out.volume.push(+b.volume || 0);
    }
    if(out.time.length < 3) throw new Error('too little '+iv+' data');
    return out;
  }
  function aggregate(src, groupKey){
    const out = {time:[], open:[], high:[], low:[], close:[], volume:[]};
    let key = null;
    for(let i=0;i<src.time.length;i++){
      const k = groupKey(src.time[i]);
      if(k !== key){ key = k; out.time.push(src.time[i]); out.open.push(src.open[i]); out.high.push(src.high[i]); out.low.push(src.low[i]); out.close.push(src.close[i]); out.volume.push(src.volume[i]||0); }
      else { const j = out.time.length-1; out.high[j] = Math.max(out.high[j], src.high[i]); out.low[j] = Math.min(out.low[j], src.low[i]); out.close[j] = src.close[i]; out.volume[j] += src.volume[i]||0; }
    }
    return out;
  }
  function fromHist(h){
    // the app's daily history object {labels:['YYYY-MM-DD'], data, ohlc, volume}
    const out = {time:[], open:[], high:[], low:[], close:[], volume:[]};
    const o = h.ohlc || {open:h.data, high:h.data, low:h.data, close:h.data};
    for(let i=0;i<h.data.length;i++){
      const t = Math.floor(Date.parse(h.labels[i]+'T00:00:00Z')/1000);
      if(!isFinite(t) || (out.time.length && t <= out.time[out.time.length-1])) continue;
      const cl = h.data[i];
      out.time.push(t); out.close.push(cl); out.open.push(o.open[i] ?? cl);
      out.high.push(Math.max(o.high[i] ?? cl, cl, o.open[i] ?? cl)); out.low.push(Math.min(o.low[i] ?? cl, cl, o.open[i] ?? cl));
      out.volume.push(h.volume ? (h.volume[i]||0) : 0);
    }
    return out;
  }
  async function loadDaily(ticker){
    if(ticker === currentSecurity && window.QX_LAST_HIST && window.QX_LAST_HIST._t === ticker) return fromHist(window.QX_LAST_HIST);
    const sec = SECURITIES.find(x=>x.t===ticker);
    let h = null;
    if(sec && sec._kuvera) h = await fetchIndianMfNav(sec);
    else{
      try{ h = await fetchYahooHistory(ticker, yahooSymbolFor(ticker)); }
      catch(e){
        if(sec && sec.cls==='Crypto' && typeof COINGECKO_ID!=='undefined' && COINGECKO_ID[ticker]) h = await fetchCoinGeckoHistory(ticker);
        else if(sec && sec.cls==='FX') h = await fetchFrankfurterHistory(ticker);
        else throw e;
      }
    }
    return fromHist(h);
  }
  async function loadBars(ticker, interval){
    const key = ticker+'|'+interval;
    const hit = dataCache.get(key);
    if(hit && Date.now()-hit.ts < (['1D','1W','1MO'].includes(interval) ? 10*60e3 : 60e3)) return hit.data;
    const cn = LD.cnbcSymbol(ticker);
    let d, intraday = !['1D','1W','1MO'].includes(interval), minutes = ({'1M':1,'5M':5,'15M':15,'30M':30,'1H':60,'4H':240})[interval] || 1440;
    if(intraday){
      if(!cn) throw new Error('intraday bars are not available for this instrument — use D, W or M');
      const days = INTERVALS.find(x=>x[0]===interval)[3];
      if(interval==='15M'){ const b = await cnbcBars(cn,'5M',days); d = aggregate(b, t=>Math.floor(t/900)); }
      else if(interval==='4H'){ const b = await cnbcBars(cn,'1H',days); const dayKey = t=>new Date(t*1000).toISOString().slice(0,10); d = aggregate(b, t=>dayKey(t)+'_'+Math.floor(new Date(t*1000).getUTCHours()/4)); }
      else d = await cnbcBars(cn, interval, days);
      d.time = d.time.map(t=>t+TZ_SHIFT);
    } else {
      const daily = await loadDaily(ticker);
      if(interval==='1D') d = daily;
      else if(interval==='1W') d = aggregate(daily, t=>{ const dt=new Date(t*1000); const day=(dt.getUTCDay()+6)%7; return Math.floor((t-day*86400)/604800); });
      else d = aggregate(daily, t=>new Date(t*1000).toISOString().slice(0,7));
    }
    d.intraday = intraday; d.minutes = minutes; d.periodsPerYear = interval==='1W'?52:interval==='1MO'?12:252;
    dataCache.set(key, {ts:Date.now(), data:d});
    return d;
  }

  /* ---------------- transforms for special chart types ---------------- */
  function heikin(B){
    const o=[],h=[],l=[],c=[];
    for(let i=0;i<B.close.length;i++){
      const hc=(B.open[i]+B.high[i]+B.low[i]+B.close[i])/4;
      const ho= i===0 ? (B.open[i]+B.close[i])/2 : (o[i-1]+c[i-1])/2;
      o.push(ho); c.push(hc); h.push(Math.max(B.high[i],ho,hc)); l.push(Math.min(B.low[i],ho,hc));
    }
    return {...B, open:o, high:h, low:l, close:c};
  }
  function renko(B){
    const tr = M.rma(M.tr(B.high,B.low,B.close),14).filter(x=>x!=null);
    const box = tr.length ? tr[tr.length-1] : (Math.max(...B.close)-Math.min(...B.close))/50;
    const out = {time:[], open:[], high:[], low:[], close:[], volume:[], box};
    let base = B.close[0], lastT = B.time[0]-1;
    for(let i=1;i<B.close.length;i++){
      let diff = B.close[i]-base;
      while(Math.abs(diff) >= box){
        const dir = Math.sign(diff), op = base, cl = base+dir*box;
        let t = Math.max(B.time[i], lastT+1); lastT = t;
        out.time.push(t); out.open.push(op); out.close.push(cl); out.high.push(Math.max(op,cl)); out.low.push(Math.min(op,cl)); out.volume.push(0);
        base = cl; diff = B.close[i]-base;
      }
    }
    return out;
  }
  function lineBreak(B, lines=3){
    const out = {time:[], open:[], high:[], low:[], close:[], volume:[]};
    if(!B.close.length) return out;
    let lastT = B.time[0]-1;
    const push = (t,op,cl)=>{ t=Math.max(t,lastT+1); lastT=t; out.time.push(t); out.open.push(op); out.close.push(cl); out.high.push(Math.max(op,cl)); out.low.push(Math.min(op,cl)); out.volume.push(0); };
    push(B.time[0], B.open[0], B.close[0]);
    for(let i=1;i<B.close.length;i++){
      const n = out.close.length, last = out.close[n-1], lastOpen = out.open[n-1], up = last >= lastOpen, px = B.close[i];
      const look = Math.min(lines, n);
      let hi=-Infinity, lo=Infinity; for(let j=n-look;j<n;j++){ hi=Math.max(hi,out.open[j],out.close[j]); lo=Math.min(lo,out.open[j],out.close[j]); }
      if(up){ if(px > last) push(B.time[i], last, px); else if(px < lo) push(B.time[i], lastOpen, px); }
      else { if(px < last) push(B.time[i], last, px); else if(px > hi) push(B.time[i], lastOpen, px); }
    }
    return out;
  }

  /* ---------------- the chart widget ---------------- */
  class Chart {
    constructor(host, opts){
      this.host = host; this.opts = Object.assign({compact:false, persistKey:'main', symbol:currentSecurity, followResearch:false}, opts||{});
      const saved = store.get(CFG_KEY+'_'+this.opts.persistKey, null);
      this.cfg = Object.assign({type:'candles', interval:'1D', range:'1Y', scale:'normal', magnet:true, indicators:[{id:'vol',p:{ma:20}},{id:'sma',p:{period:50}},{id:'sma',p:{period:200}}]}, saved||{});
      this.symbol = this.opts.symbol;
      this.compare = []; this.tool = 'cursor'; this.drawings = []; this.sel = null; this.pending = null;
      this.build();
    }
    save(){ store.set(CFG_KEY+'_'+this.opts.persistKey, this.cfg); }
    build(){
      const id = 'qxc'+Math.random().toString(36).slice(2,8); this.id = id;
      this.host.classList.add('qxc');
      this.host.innerHTML = `
        <div class="qxc-top">
          ${this.opts.symbolInput ? `<input class="qxc-sym" list="qxcSymList" value="${escapeHtml(this.symbol)}" aria-label="Symbol" spellcheck="false">` : ''}
          <div class="qxc-group qxc-intervals">${INTERVALS.map(([k,l,t])=>`<button data-iv="${k}" title="${t}">${l}</button>`).join('')}</div>
          <span class="qxc-sep"></span>
          <div class="qxc-dd">
            <button class="qxc-ddbtn qxc-typebtn" title="Chart type"><span class="qxc-typelabel"></span> ▾</button>
            <div class="qxc-menu qxc-typemenu">${CHART_TYPES.map(([k,l])=>`<div class="qxc-mi" data-type="${k}">${l}</div>`).join('')}</div>
          </div>
          <div class="qxc-dd">
            <button class="qxc-ddbtn qxc-indbtn" title="Indicators"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 17l5-6 4 4 8-10"/></svg> Indicators ▾</button>
            <div class="qxc-menu qxc-indmenu wide">
              <input class="qxc-indsearch" placeholder="Search indicators…">
              ${IND_GROUPS.map(([g,ids])=>`<div class="qxc-mh">${g}</div>${ids.map(i=>`<div class="qxc-mi" data-ind="${i}"><b>${IND[i].short}</b> <span>${IND[i].name}</span></div>`).join('')}`).join('')}
            </div>
          </div>
          <span class="qxc-sep"></span>
          <div class="qxc-dd">
            <button class="qxc-ddbtn" title="Price scale">Scale ▾</button>
            <div class="qxc-menu qxc-scalemenu">${[['normal','Linear'],['log','Logarithmic'],['pct','Percent'],['idx','Indexed to 100']].map(([k,l])=>`<div class="qxc-mi" data-scale="${k}">${l}</div>`).join('')}</div>
          </div>
          <button class="qxc-ib qxc-cmpbtn" title="Compare with another symbol">+ Compare</button>
          <input class="qxc-cmpinput" list="qxcSymList" placeholder="Symbol, Enter" style="display:none" spellcheck="false">
          <span class="qxc-spacer"></span>
          <button class="qxc-ib qxc-magnet" title="Magnet: snap crosshair and drawings to OHLC">🧲</button>
          <button class="qxc-ib qxc-fit" title="Reset view (fit all)">⤢</button>
          <button class="qxc-ib qxc-shot" title="Download chart image (PNG)">📷</button>
          <button class="qxc-ib qxc-full" title="Full screen">⛶</button>
        </div>
        <div class="qxc-body">
          <div class="qxc-tools">${TOOLS.map(([k,t,d])=>`<button data-tool="${k}" title="${t}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="${d}"/></svg></button>`).join('')}<span class="qxc-tsep"></span><button data-act="alert" title="Alert me when price crosses the selected line">🔔</button><button data-act="del" title="Delete selected drawing (Del)">🗑</button><button data-act="clear" title="Remove all drawings on this symbol">✕</button></div>
          <div class="qxc-stage">
            <div class="qxc-canvas"></div>
            <svg class="qxc-draw"></svg>
            <div class="qxc-legend"></div>
            <div class="qxc-status"></div>
          </div>
        </div>
        <div class="qxc-bottom"><div class="qxc-group qxc-ranges">${RANGES.map(([k])=>`<button data-range="${k}">${k}</button>`).join('')}</div><span class="qxc-spacer"></span><span class="qxc-foot"></span></div>
        <div class="qxc-chips"></div>`;
      this.q = s => this.host.querySelector(s);
      this.wire();
      this.makeChart();
    }
    makeChart(){
      const lw = LW();
      const stage = this.q('.qxc-canvas');
      if(!lw){ stage.innerHTML = '<div class="notebox" style="margin:20px">The charting library could not load (network or content blocker). Prices and all analytics still work.</div>'; return; }
      this.chart = lw.createChart(stage, {
        autoSize:true,
        layout:{background:{type:'solid', color:'transparent'}, textColor:css('--text-1')||'#A7ADBC', fontFamily:"'JetBrains Mono',monospace", fontSize:11, panes:{separatorColor:css('--line')||'#252A36', enableResize:true}},
        grid:{vertLines:{color:css('--line-soft')||'#1C202A'}, horzLines:{color:css('--line-soft')||'#1C202A'}},
        rightPriceScale:{borderColor:css('--line')||'#252A36', scaleMargins:{top:0.08,bottom:0.08}},
        timeScale:{borderColor:css('--line')||'#252A36', rightOffset:6, timeVisible:false, secondsVisible:false},
        localization:{locale: (()=>{ try{ const l = navigator.language || 'en-US'; new Intl.DateTimeFormat(l); new Intl.NumberFormat(l); return l; }catch(e){ return 'en-US'; } })()},
        crosshair:{mode: this.cfg.magnet ? lw.CrosshairMode.MagnetOHLC ?? 1 : lw.CrosshairMode.Normal},
      });
      this.chart.subscribeCrosshairMove(p=>this.onCross(p));
      this.chart.timeScale().subscribeVisibleLogicalRangeChange(()=>this.renderDrawings());
      new ResizeObserver(()=>this.renderDrawings()).observe(stage);
      this.syncToolbar();
    }
    fmtP(p){ if(p==null||!isFinite(p)) return ''; const a=Math.abs(p); const d = a>=1000?2:a>=10?2:a>=1?3:a>=0.01?4:6; return p.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}); }
    theme(){ if(!this.chart) return; this.chart.applyOptions({layout:{textColor:css('--text-1')}, grid:{vertLines:{color:css('--line-soft')}, horzLines:{color:css('--line-soft')}}, rightPriceScale:{borderColor:css('--line')}, timeScale:{borderColor:css('--line')}}); this.redraw(); }
    wire(){
      const h = this.host;
      h.addEventListener('click', e=>{
        const t = e.target.closest('button,.qxc-mi'); if(!t) return;
        if(t.dataset.iv){ this.cfg.interval = t.dataset.iv; if(['1M','5M','15M','30M','1H','4H'].includes(t.dataset.iv) && ['1Y','5Y','ALL','YTD','6M','3M'].includes(this.cfg.range)) this.cfg.range = t.dataset.iv==='1M'?'1D':t.dataset.iv==='5M'?'5D':'1M'; this.save(); this.load(); }
        else if(t.dataset.range){ this.cfg.range = t.dataset.range; if(['1D','5D'].includes(t.dataset.range) && ['1D','1W','1MO'].includes(this.cfg.interval)){ this.cfg.interval = t.dataset.range==='1D'?'5M':'30M'; this.save(); this.load(); return; } this.save(); this.applyRange(); this.syncToolbar(); }
        else if(t.dataset.type){ this.cfg.type = t.dataset.type; this.save(); this.closeMenus(); this.redraw(); }
        else if(t.dataset.scale){ this.cfg.scale = t.dataset.scale; this.save(); this.closeMenus(); this.applyScale(); this.syncToolbar(); }
        else if(t.dataset.ind){ this.addIndicator(t.dataset.ind); this.closeMenus(); }
        else if(t.dataset.tool){ this.setTool(t.dataset.tool); }
        else if(t.dataset.act==='del'){ this.deleteSelected(); }
        else if(t.dataset.act==='alert'){ QXAL.fromDrawing(this.symbol, this.cfg.interval, this.sel!=null ? this.drawings[this.sel] : null); }
        else if(t.dataset.act==='clear'){ if(this.drawings.length){ this.drawings=[]; this.sel=null; this.saveDrawings(); this.renderDrawings(); toast('Drawings cleared for '+this.symbol+'.','ok'); } }
        else if(t.classList.contains('qxc-ddbtn')){ const m = t.parentElement.querySelector('.qxc-menu'); const open = !m.classList.contains('open'); this.closeMenus(); if(open){ m.style.left=''; m.style.right=''; m.classList.add('open'); /* keep the menu on-screen on narrow devices */ const rr = m.getBoundingClientRect(), vw = document.documentElement.clientWidth; if(rr.right > vw - 8){ m.style.left = Math.min(0, vw - 8 - rr.right) + 'px'; } if(m.getBoundingClientRect().left < 8){ m.style.left = (parseFloat(m.style.left||0) + 8 - m.getBoundingClientRect().left) + 'px'; } const s=m.querySelector('.qxc-indsearch'); if(s){ s.value=''; s.dispatchEvent(new Event('input')); setTimeout(()=>s.focus(),30); } } e.stopPropagation(); }
        else if(t.classList.contains('qxc-magnet')){ this.cfg.magnet = !this.cfg.magnet; this.save(); if(this.chart) this.chart.applyOptions({crosshair:{mode: this.cfg.magnet ? (LW().CrosshairMode.MagnetOHLC ?? 1) : LW().CrosshairMode.Normal}}); this.syncToolbar(); }
        else if(t.classList.contains('qxc-fit')){ if(this.chart) this.chart.timeScale().fitContent(); }
        else if(t.classList.contains('qxc-shot')){ this.screenshot(); }
        else if(t.classList.contains('qxc-full')){ this.toggleFull(); }
        else if(t.classList.contains('qxc-cmpbtn')){ const i=this.q('.qxc-cmpinput'); i.style.display = i.style.display==='none' ? '' : 'none'; if(i.style.display==='') i.focus(); }
      });
      document.addEventListener('click', e=>{ if(!this.host.contains(e.target) || !e.target.closest('.qxc-dd')) this.closeMenus(); });
      const s = this.q('.qxc-indsearch');
      s.addEventListener('input', ()=>{ const q=s.value.toLowerCase(); this.host.querySelectorAll('.qxc-indmenu .qxc-mi').forEach(x=>{ x.style.display = x.textContent.toLowerCase().includes(q) ? '' : 'none'; }); });
      s.addEventListener('click', e=>e.stopPropagation());
      const cmp = this.q('.qxc-cmpinput');
      cmp.addEventListener('keydown', e=>{ if(e.key==='Enter'){ const v=cmp.value.trim().toUpperCase(); cmp.value=''; if(v) this.addCompare(v); } });
      const symIn = this.q('.qxc-sym');
      if(symIn){ symIn.addEventListener('keydown', e=>{ if(e.key==='Enter'){ const v=symIn.value.trim().toUpperCase(); if(v){ this.setSymbol(v); } } }); symIn.addEventListener('change', ()=>{ const v=symIn.value.trim().toUpperCase(); if(v && v!==this.symbol) this.setSymbol(v); }); }
      this.q('.qxc-chips').addEventListener('click', e=>{
        const x = e.target.closest('[data-rm]'); if(x){ const i=+x.dataset.rm; this.cfg.indicators.splice(i,1); this.save(); this.redraw(); return; }
        const c = e.target.closest('[data-rmcmp]'); if(c){ this.compare = this.compare.filter(k=>k.t!==c.dataset.rmcmp); this.redraw(); return; }
        const ed = e.target.closest('[data-edit]'); if(ed){ this.editIndicator(+ed.dataset.edit); }
        const hd = e.target.closest('[data-hide]'); if(hd){ const it=this.cfg.indicators[+hd.dataset.hide]; it.hidden=!it.hidden; this.save(); this.redraw(); }
      });
      // drawing interactions
      const svg = this.q('.qxc-draw');
      svg.addEventListener('pointerdown', e=>this.onPointerDown(e));
      svg.addEventListener('pointermove', e=>this.onPointerMove(e));
      svg.addEventListener('pointerup', e=>this.onPointerUp(e));
      this.host.tabIndex = 0;
      this.host.addEventListener('keydown', e=>{
        if(['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) return;
        if((e.key==='Delete'||e.key==='Backspace') && this.sel!=null){ e.preventDefault(); this.deleteSelected(); }
        if(e.key==='Escape'){ this.pending=null; this.setTool('cursor'); this.renderDrawings(); }
        if(e.altKey && !e.ctrlKey){ const map={t:'trend',h:'hline',v:'vline',f:'fib',r:'rect',m:'measure',n:'text'}; const k=map[e.key.toLowerCase()]; if(k){ e.preventDefault(); this.setTool(k); } }
      });
    }
    closeMenus(){ this.host.querySelectorAll('.qxc-menu.open').forEach(m=>m.classList.remove('open')); }
    syncToolbar(){
      this.host.querySelectorAll('[data-iv]').forEach(b=>b.classList.toggle('active', b.dataset.iv===this.cfg.interval));
      this.host.querySelectorAll('[data-range]').forEach(b=>b.classList.toggle('active', b.dataset.range===this.cfg.range));
      this.host.querySelectorAll('[data-type]').forEach(b=>b.classList.toggle('active', b.dataset.type===this.cfg.type));
      this.host.querySelectorAll('[data-scale]').forEach(b=>b.classList.toggle('active', b.dataset.scale===this.cfg.scale));
      this.host.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active', b.dataset.tool===this.tool));
      const tl = this.q('.qxc-typelabel'); if(tl) tl.textContent = (CHART_TYPES.find(x=>x[0]===this.cfg.type)||['','Candles'])[1];
      const mg = this.q('.qxc-magnet'); if(mg) mg.classList.toggle('active', !!this.cfg.magnet);
      const sv = this.q('.qxc-sym'); if(sv && document.activeElement!==sv) sv.value = this.symbol;
    }
    setSymbol(t){
      const known = SECURITY_UNIVERSE.some(x=>x.t===t) || SECURITIES.some(x=>x.t===t);
      if(!known){ toast(`"${t}" isn't in the built-in universe — search it with Ctrl+K first, then open it here.`, 'warn'); this.syncToolbar(); return; }
      this.symbol = t; this.compare = []; this.load();
    }
    async load(){
      const st = this.q('.qxc-status'); this.syncToolbar();
      if(!this.chart) return;
      const myTok = this.tok = (this.tok||0)+1;
      st.textContent = 'Loading '+this.symbol+'…'; st.classList.add('show');
      try{
        const d = await loadBars(this.symbol, this.cfg.interval);
        if(myTok !== this.tok) return;
        this.B = d; this.loadDrawings();
        st.classList.remove('show');
        this.redraw();
        this.applyRange();
        const sec = SECURITIES.find(x=>x.t===this.symbol) || SECURITY_UNIVERSE.find(x=>x.t===this.symbol);
        const last = new Date((d.time[d.time.length-1]-(d.intraday?TZ_SHIFT:0))*1000);
        this.q('.qxc-foot').textContent = `${d.close.length.toLocaleString()} bars · ${d.intraday ? 'intraday, your local time' : 'daily-based'} · last ${d.intraday ? last.toLocaleString() : last.toISOString().slice(0,10)} · CNBC${sec&&sec._kuvera?' / AMFI':''}`;
      }catch(e){
        if(myTok !== this.tok) return;
        st.textContent = 'Chart data unavailable: '+e.message; st.classList.add('show');
      }
    }
    setData(hist){ // used by Research to push the already-fetched daily history
      if(this.cfg.interval !== '1D'){ this.load(); return; }
      this.B = fromHist(hist); this.B.intraday=false; this.B.periodsPerYear=252; dataCache.set(this.symbol+'|1D', {ts:Date.now(), data:this.B});
      this.loadDrawings(); this.q('.qxc-status').classList.remove('show'); this.redraw(); this.applyRange();
      const last = new Date(this.B.time[this.B.time.length-1]*1000).toISOString().slice(0,10);
      this.q('.qxc-foot').textContent = `${this.B.close.length.toLocaleString()} daily bars · last ${last} · ${hist.via==='CNBC'||!hist.via?'CNBC':hist.via}`;
      this.syncToolbar();
    }
    displayData(){
      const B = this.B; const t = this.cfg.type;
      if(t==='heikin') return heikin(B);
      if(t==='renko') return renko(B);
      if(t==='linebreak') return lineBreak(B,3);
      return B;
    }
    redraw(){
      if(!this.chart || !this.B) return;
      const lw = LW();
      (this.series||[]).forEach(s=>{ try{ this.chart.removeSeries(s); }catch(e){} });
      this.series = []; this.indSeries = [];
      const D = this.displayData(); this.D = D;
      const up = css('--up')||'#3ECF8E', dn = css('--down')||'#FF5C6C', accent = css('--teal')||'#2DD4BF';
      const t = this.cfg.type;
      const bars = D.time.map((tm,i)=>({time:tm, open:D.open[i], high:D.high[i], low:D.low[i], close:D.close[i]}));
      const line = D.time.map((tm,i)=>({time:tm, value:D.close[i]}));
      let main;
      if(['candles','heikin','renko','linebreak'].includes(t)){ main = this.chart.addSeries(lw.CandlestickSeries, {upColor:up, downColor:dn, borderUpColor:up, borderDownColor:dn, wickUpColor:up, wickDownColor:dn}); main.setData(bars); }
      else if(t==='hollow'){ main = this.chart.addSeries(lw.CandlestickSeries, {upColor:'rgba(0,0,0,0)', downColor:dn, borderUpColor:up, borderDownColor:dn, wickUpColor:up, wickDownColor:dn}); main.setData(bars.map((b,i)=>({...b, color: b.close>=b.open ? 'rgba(0,0,0,0)' : dn, borderColor: (i&&b.close<D.close[i-1]) ? dn : up, wickColor:(i&&b.close<D.close[i-1]) ? dn : up}))); }
      else if(t==='bars'){ main = this.chart.addSeries(lw.BarSeries, {upColor:up, downColor:dn, openVisible:true, thinBars:false}); main.setData(bars); }
      else if(t==='hlc'){ main = this.chart.addSeries(lw.BarSeries, {upColor:up, downColor:dn, openVisible:false}); main.setData(bars); }
      else if(t==='hilo'){ main = this.chart.addSeries(lw.BarSeries, {upColor:accent, downColor:accent, openVisible:false, thinBars:false}); main.setData(bars.map(b=>({time:b.time, open:b.low, high:b.high, low:b.low, close:b.high}))); }
      else if(t==='line' || t==='linemarkers' || t==='step'){ main = this.chart.addSeries(lw.LineSeries, {color:accent, lineWidth:2, lineType: t==='step'?1:0, pointMarkersVisible: t==='linemarkers', pointMarkersRadius:2.5}); main.setData(line); }
      else if(t==='area'){ main = this.chart.addSeries(lw.AreaSeries, {lineColor:accent, topColor:'rgba(45,212,191,0.32)', bottomColor:'rgba(45,212,191,0.02)', lineWidth:2}); main.setData(line); }
      else if(t==='baseline'){ const base = D.close[Math.max(0, D.close.length-1-this.visibleCount())] ?? D.close[0]; main = this.chart.addSeries(lw.BaselineSeries, {baseValue:{type:'price', price:base}, topLineColor:up, bottomLineColor:dn, topFillColor1:'rgba(62,207,142,0.28)', topFillColor2:'rgba(62,207,142,0.02)', bottomFillColor1:'rgba(255,92,108,0.02)', bottomFillColor2:'rgba(255,92,108,0.28)', lineWidth:2}); main.setData(line); }
      else if(t==='columns'){ main = this.chart.addSeries(lw.HistogramSeries, {color:accent}); main.setData(line.map((p,i)=>({...p, color: i&&D.close[i]<D.close[i-1] ? dn : up}))); }
      main.applyOptions({priceLineVisible:true, lastValueVisible:true, priceFormat:{type:'custom', minMove:0.000001, formatter:p=>this.fmtP(p)}});
      this.main = main; this.series.push(main);
      // watermark
      try{ if(this.wm) this.wm.detach(); this.wm = lw.createTextWatermark(this.chart.panes()[0], {horzAlign:'center', vertAlign:'center', lines:[{text:this.symbol+' · '+(INTERVALS.find(x=>x[0]===this.cfg.interval)||[])[1], color:'rgba(127,127,127,0.07)', fontSize:Math.min(64, Math.max(28, this.host.clientWidth/14))}]}); }catch(e){}
      // compare overlays
      const palette = ['#F59E0B','#60A5FA','#F472B6','#A78BFA','#34D399'];
      this.compare.forEach((c,k)=>{ if(!c.B) return; const s = this.chart.addSeries(lw.LineSeries, {color:palette[k%palette.length], lineWidth:2, priceLineVisible:false, lastValueVisible:true, title:c.t}); const map = new Map(c.B.time.map((tm,i)=>[tm, c.B.close[i]])); s.setData(D.time.filter(tm=>map.has(tm)).map(tm=>({time:tm, value:map.get(tm)}))); this.series.push(s); c.series = s; });
      // indicators
      let paneIdx = 1;
      this.cfg.indicators.forEach((it, idx)=>{
        const def = IND[it.id]; if(!def || it.hidden) return;
        const p = Object.assign({}, def.params, it.p||{});
        const src = (t==='renko'||t==='linebreak') ? this.B : D;
        let vals; try{ vals = calcIndicator(it.id, p, src); }catch(e){ return; }
        const times = src.time;
        const toLine = arr => times.map((tm,i)=> arr[i]==null||!isFinite(arr[i]) ? {time:tm} : {time:tm, value:arr[i]});
        const pane = def.overlay ? 0 : paneIdx++;
        const add = (type, opts, data) => { const s = this.chart.addSeries(type, Object.assign({priceLineVisible:false, lastValueVisible:false, crosshairMarkerVisible:false}, opts), pane); s.setData(data); this.series.push(s); this.indSeries.push({s, idx, label:opts.title||def.short}); return s; };
        if(it.id==='vol'){
          const vs = add(lw.HistogramSeries, {priceFormat:{type:'custom', minMove:1, formatter:v=>fmtBig(v)}, title:'Vol'}, times.map((tm,i)=>({time:tm, value:vals[0][i]||0, color: i&&src.close[i]<src.close[i-1] ? 'rgba(255,92,108,0.55)' : 'rgba(62,207,142,0.55)'})));
          add(lw.LineSeries, {color:def.colors[2], lineWidth:1, title:'Vol MA', priceFormat:{type:'custom', minMove:1, formatter:v=>fmtBig(v)}}, toLine(vals[1]));
          vs.priceScale().applyOptions({scaleMargins:{top:0.1,bottom:0}});
        } else if(it.id==='macd'){
          add(lw.HistogramSeries, {title:'Hist'}, times.map((tm,i)=> vals[2][i]==null ? {time:tm} : {time:tm, value:vals[2][i], color: vals[2][i]>=0 ? 'rgba(62,207,142,0.6)' : 'rgba(255,92,108,0.6)'}));
          add(lw.LineSeries, {color:def.colors[0], lineWidth:1.5, title:'MACD'}, toLine(vals[0]));
          add(lw.LineSeries, {color:def.colors[1], lineWidth:1.5, title:'Signal'}, toLine(vals[1]));
        } else if(it.id==='psar'){
          add(lw.LineSeries, {color:def.colors[0], lineVisible:false, pointMarkersVisible:true, pointMarkersRadius:1.6, title:'PSAR'}, toLine(vals[0]));
        } else if(it.id==='st'){
          add(lw.LineSeries, {color:def.colors[0], lineWidth:2, title:'ST up'}, toLine(vals[0]));
          add(lw.LineSeries, {color:def.colors[1], lineWidth:2, title:'ST down'}, toLine(vals[1]));
        } else if(it.id==='pivots'){
          const pv = this.pivots(src); pv.forEach(([lbl,val],k)=>{ const s = main.createPriceLine({price:val, color: lbl==='P' ? '#94A3B8' : lbl[0]==='R' ? 'rgba(255,92,108,0.7)' : 'rgba(62,207,142,0.7)', lineWidth:1, lineStyle:2, axisLabelVisible:true, title:lbl}); });
        } else {
          vals.forEach((arr,k)=> add(lw.LineSeries, {color:def.colors[k]||def.colors[0], lineWidth: (['bb','kc','dc','env','lr'].includes(it.id) && k!==1) ? 1 : 1.6, lineStyle: (['bb','kc','dc','env','lr'].includes(it.id) && k===1) ? 2 : 0, title: def.short+(p.period&&vals.length===1?' '+p.period:'')+(vals.length>1?['',' mid',' lo',' 4'][k]||'':'')}, toLine(arr)));
        }
        if(!def.overlay){
          const lvls = {rsi:[70,30], stoch:[80,20], stochrsi:[80,20], willr:[-20,-80], mfi:[80,20], cci:[100,-100], adx:[25], aroon:[70,30]}[it.id];
          const anchor = this.indSeries.filter(x=>x.idx===idx).slice(-1)[0];
          if(lvls && anchor) lvls.forEach(v=>anchor.s.createPriceLine({price:v, color:'rgba(148,163,184,0.45)', lineWidth:1, lineStyle:2, axisLabelVisible:false}));
        }
      });
      // pane heights: main pane dominant
      if(this.opts.growPanes){ const subs = Math.max(0, paneIdx-1); this.q('.qxc-stage').style.height = (440 + subs*115)+'px'; }
      try{ const panes = this.chart.panes(); const H = this.q('.qxc-canvas').clientHeight || 480; if(panes.length>1){ const sub = this.opts.growPanes ? 105 : Math.max(70, Math.min(130, H*0.18)); panes.forEach((pn,i)=>{ if(i>0) pn.setHeight(sub); }); } }catch(e){}
      this.applyScale();
      this.renderChips();
      this.renderDrawings();
      this.chart.timeScale().applyOptions({timeVisible: !!D.intraday});
      this.onCross({});
    }
    pivots(B){
      // classic floor pivots from the previous completed period (prior day for intraday, prior month for daily, prior year for weekly/monthly)
      const n = B.close.length; if(n<3) return [];
      const keyOf = this.B.intraday ? (t=>new Date((t-TZ_SHIFT)*1000).toISOString().slice(0,10)) : this.cfg.interval==='1D' ? (t=>new Date(t*1000).toISOString().slice(0,7)) : (t=>new Date(t*1000).toISOString().slice(0,4));
      const lastKey = keyOf(B.time[n-1]); let i=n-1; while(i>=0 && keyOf(B.time[i])===lastKey) i--; if(i<0) return [];
      const pk = keyOf(B.time[i]); let hi=-Infinity, lo=Infinity, cl=B.close[i]; for(let j=i;j>=0 && keyOf(B.time[j])===pk;j--){ hi=Math.max(hi,B.high[j]); lo=Math.min(lo,B.low[j]); }
      const P=(hi+lo+cl)/3;
      return [['R3',hi+2*(P-lo)],['R2',P+(hi-lo)],['R1',2*P-lo],['P',P],['S1',2*P-hi],['S2',P-(hi-lo)],['S3',lo-2*(hi-P)]];
    }
    visibleCount(){ const r = this.cfg.range; const per = this.B && this.B.intraday ? 1 : 1; const map={'1D':1,'5D':5,'1M':21,'3M':63,'6M':126,'1Y':252,'5Y':1260}; return (map[r]||252)*per; }
    applyRange(){
      if(!this.chart || !this.D || !this.D.time.length) return;
      const ts = this.chart.timeScale(); const D = this.D; const last = D.time[D.time.length-1];
      const r = RANGES.find(x=>x[0]===this.cfg.range); if(!r){ ts.fitContent(); return; }
      if(r[1]==null){ ts.fitContent(); return; }
      let from;
      if(r[1]==='ytd'){ const y = new Date(last*1000).getUTCFullYear(); from = Date.UTC(y,0,1)/1000; }
      else from = last - r[1]*86400;
      if(from <= D.time[0]){ ts.fitContent(); return; }
      try{ ts.setVisibleRange({from, to:last}); }catch(e){ ts.fitContent(); }
      if(this.cfg.type==='baseline') this.redraw();
    }
    applyScale(){
      if(!this.chart) return;
      const lw = LW(); const map = {normal:lw.PriceScaleMode.Normal, log:lw.PriceScaleMode.Logarithmic, pct:lw.PriceScaleMode.Percentage, idx:lw.PriceScaleMode.IndexedTo100};
      const mode = this.compare.length && this.cfg.scale==='normal' ? lw.PriceScaleMode.Percentage : map[this.cfg.scale];
      this.chart.priceScale('right').applyOptions({mode});
    }
    renderChips(){
      const box = this.q('.qxc-chips');
      const ind = this.cfg.indicators.map((it,i)=>{ const d=IND[it.id]; if(!d) return ''; const p=Object.assign({},d.params,it.p||{}); const ps=Object.values(p).join(', '); return `<span class="qxc-chip${it.hidden?' off':''}"><i style="background:${d.colors[0]}"></i>${d.short}${ps?` (${ps})`:''}<button data-edit="${i}" title="Settings">⚙</button><button data-hide="${i}" title="${it.hidden?'Show':'Hide'}">${it.hidden?'◌':'●'}</button><button data-rm="${i}" title="Remove">✕</button></span>`; }).join('');
      const cmp = this.compare.map(c=>`<span class="qxc-chip"><i style="background:#F59E0B"></i>vs ${escapeHtml(c.t)}${c.err?' (unavailable)':''}<button data-rmcmp="${escapeHtml(c.t)}" title="Remove">✕</button></span>`).join('');
      box.innerHTML = ind + cmp;
    }
    addIndicator(id){
      if(this.cfg.indicators.length >= 12){ toast('Up to 12 indicators per chart — remove one first.', 'warn'); return; }
      this.cfg.indicators.push({id, p:Object.assign({}, IND[id].params)}); this.save(); this.redraw();
      toast(IND[id].name+' added. Use ⚙ on its chip to change settings.', 'ok');
    }
    async editIndicator(i){
      const it = this.cfg.indicators[i], def = IND[it.id]; const p = Object.assign({}, def.params, it.p||{});
      const keys = Object.keys(p); if(!keys.length){ toast(def.name+' has no adjustable settings.', 'warn'); return; }
      const cur = keys.map(k=>k+'='+p[k]).join(', ');
      const v = await askText(def.name+' settings', 'Edit as name=value pairs separated by commas. Example: '+cur, cur, val=>{
        const ok = val.split(',').every(x=>{ const [k,n]=x.split('=').map(s=>s.trim()); return keys.includes(k) && isFinite(parseFloat(n)) && parseFloat(n)>0; });
        return ok ? null : 'Use the same names with positive numbers, e.g. '+cur;
      });
      if(!v) return;
      v.split(',').forEach(x=>{ const [k,n]=x.split('=').map(s=>s.trim()); p[k] = parseFloat(n); });
      if(p.period) p.period = Math.max(1, Math.round(p.period));
      it.p = p; this.save(); this.redraw();
    }
    async addCompare(t){
      if(this.compare.length>=4){ toast('Up to 4 comparison symbols.', 'warn'); return; }
      if(t===this.symbol || this.compare.some(c=>c.t===t)) return;
      const known = SECURITY_UNIVERSE.some(x=>x.t===t) || SECURITIES.some(x=>x.t===t);
      if(!known){ toast(`"${t}" isn't in the built-in universe.`, 'warn'); return; }
      const c = {t}; this.compare.push(c); this.renderChips();
      try{ c.B = await loadBars(t, this.cfg.interval); }catch(e){ c.err = e.message; toast('Compare: '+t+' unavailable — '+e.message, 'err'); }
      this.redraw(); this.q('.qxc-cmpinput').style.display='none';
    }
    onCross(p){
      const lg = this.q('.qxc-legend'); if(!lg || !this.D) return;
      const D = this.D; let i = D.time.length-1;
      if(p && p.time!=null){ const k = this.findIdx(p.time); if(k>=0) i = k; }
      const sec = SECURITIES.find(x=>x.t===this.symbol) || SECURITY_UNIVERSE.find(x=>x.t===this.symbol) || {};
      const ch = i>0 ? D.close[i]-D.close[i-1] : 0, chp = i>0 ? ch/D.close[i-1]*100 : 0;
      const cls = ch>=0 ? 'up' : 'down';
      const dt = new Date((D.time[i]-(D.intraday?0:0))*1000);
      const when = D.intraday ? dt.toISOString().replace('T',' ').slice(0,16) : dt.toISOString().slice(0,10);
      const f = v=>this.fmtP(v);
      let html = `<div class="qxc-lrow"><b>${escapeHtml(this.symbol)}</b><span class="qxc-dim">${escapeHtml(sec.n||'')}</span><span class="qxc-dim">${when}</span></div>`
        + `<div class="qxc-lrow">O <span class="${cls}">${f(D.open[i])}</span> H <span class="${cls}">${f(D.high[i])}</span> L <span class="${cls}">${f(D.low[i])}</span> C <span class="${cls}">${f(D.close[i])}</span> <span class="${cls}">${ch>=0?'+':''}${f(ch)} (${chp>=0?'+':''}${chp.toFixed(2)}%)</span>${D.volume&&D.volume[i]?` <span class="qxc-dim">Vol ${fmtBig(D.volume[i])}</span>`:''}</div>`;
      const seen = new Set();
      (this.indSeries||[]).forEach(x=>{ if(seen.has(x.idx)) return; const vals = this.indSeries.filter(y=>y.idx===x.idx).map(y=>{ const d = p && p.seriesData ? p.seriesData.get(y.s) : null; const v = d && (d.value!=null ? d.value : null); return v==null ? null : (Math.abs(v)>=1e5 ? fmtBig(v) : v.toFixed(2)); }).filter(v=>v!=null); seen.add(x.idx); const it = this.cfg.indicators[x.idx]; if(it && vals.length) html += `<div class="qxc-lrow qxc-ind"><i style="background:${IND[it.id].colors[0]}"></i>${IND[it.id].short} <span>${vals.join(' · ')}</span></div>`; });
      lg.innerHTML = html;
    }
    findIdx(t){ const a=this.D.time; let lo=0, hi=a.length-1; while(lo<=hi){ const m=(lo+hi)>>1; if(a[m]===t) return m; if(a[m]<t) lo=m+1; else hi=m-1; } return Math.max(0, Math.min(a.length-1, lo)); }

    /* ---- drawings ---- */
    drawKey(){ return DRAW_KEY+this.symbol; }
    loadDrawings(){ this.drawings = store.get(this.drawKey(), []); this.sel=null; }
    saveDrawings(){ store.set(this.drawKey(), this.drawings); }
    setTool(t){ this.tool = t; this.pending = null; const svg=this.q('.qxc-draw'); svg.classList.toggle('active', t!=='cursor'); this.syncToolbar(); if(t!=='cursor') this.host.focus(); }
    pt(e){
      const r = this.q('.qxc-canvas').getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top;
      if(!this.chart || !this.main || !this.D) return null;
      const ts = this.chart.timeScale(); let lg = ts.coordinateToLogical(x); if(lg==null) return null;
      let idx = Math.round(lg); let price = this.main.coordinateToPrice(y); if(price==null) return null;
      idx = Math.max(-5000, idx);
      if(this.cfg.magnet && idx>=0 && idx<this.D.time.length){ const c=[this.D.open[idx],this.D.high[idx],this.D.low[idx],this.D.close[idx]]; price = c.reduce((a,b)=>Math.abs(b-price)<Math.abs(a-price)?b:a); }
      const time = idx < this.D.time.length && idx>=0 ? this.D.time[idx] : this.D.time[this.D.time.length-1] + (idx-(this.D.time.length-1))*((this.D.time[this.D.time.length-1]-this.D.time[0])/Math.max(1,this.D.time.length-1));
      return {time, price, x, y, idx};
    }
    xy(p){
      const ts = this.chart.timeScale(); const a = this.D.time; let idx;
      if(p.time > a[a.length-1]){ const step=(a[a.length-1]-a[0])/Math.max(1,a.length-1); idx = a.length-1 + (p.time-a[a.length-1])/step; } else idx = this.findIdx(p.time);
      const x = ts.logicalToCoordinate(idx); const y = this.main.priceToCoordinate(p.price);
      return x==null||y==null ? null : {x, y};
    }
    onPointerDown(e){
      const P = this.pt(e); if(!P) return;
      if(this.tool==='cursor'){
        const hit = e.target.closest('[data-di]'); if(hit){ this.sel = +hit.dataset.di; const h = e.target.dataset.h; if(h!=null){ this.drag = {i:this.sel, h:+h}; this.q('.qxc-draw').setPointerCapture(e.pointerId); } this.renderDrawings(); }
        else { this.sel=null; this.renderDrawings(); }
        return;
      }
      e.preventDefault();
      if(['hline','vline'].includes(this.tool)){ this.drawings.push({t:this.tool, a:{time:P.time, price:P.price}}); this.finishDraw(); return; }
      if(this.tool==='text'){ askText('Text note', 'Shown on the chart at the point you clicked.', 'e.g. Earnings gap').then(v=>{ if(v){ this.drawings.push({t:'text', a:{time:P.time,price:P.price}, text:v}); this.finishDraw(); } }); return; }
      if(!this.pending){ this.pending = {t:this.tool, a:{time:P.time, price:P.price}, b:{time:P.time, price:P.price}}; this.q('.qxc-draw').setPointerCapture(e.pointerId); }
    }
    onPointerMove(e){
      if(this.pending){ const P=this.pt(e); if(P){ this.pending.b = {time:P.time, price:P.price}; this.renderDrawings(); } }
      else if(this.drag){ const P=this.pt(e); if(P){ const d=this.drawings[this.drag.i]; d[this.drag.h===0?'a':'b'] = {time:P.time, price:P.price}; this.renderDrawings(); } }
    }
    onPointerUp(e){
      if(this.pending){ const p=this.pending; const A=this.xy(p.a), Bp=this.xy(p.b); if(A && Bp && Math.hypot(A.x-Bp.x, A.y-Bp.y) > 4){ this.drawings.push(p); this.pending=null; this.finishDraw(); } }
      if(this.drag){ this.drag=null; this.saveDrawings(); }
    }
    finishDraw(){ this.saveDrawings(); this.sel = this.drawings.length-1; this.setTool('cursor'); this.renderDrawings(); }
    deleteSelected(){ if(this.sel==null) return; this.drawings.splice(this.sel,1); this.sel=null; this.saveDrawings(); this.renderDrawings(); }
    renderDrawings(){
      const svg = this.q('.qxc-draw'); if(!svg || !this.chart || !this.main || !this.D) return;
      const W = this.q('.qxc-canvas').clientWidth; let H; try{ H = this.chart.panes()[0].getHeight(); }catch(e){ H = this.q('.qxc-canvas').clientHeight; }
      svg.setAttribute('width', W); svg.setAttribute('height', H); svg.style.height = H+'px';
      const list = this.drawings.concat(this.pending ? [this.pending] : []);
      const fib = [0,0.236,0.382,0.5,0.618,0.786,1];
      let out = '';
      list.forEach((d,i)=>{
        const sel = i===this.sel, col = sel ? '#F59E0B' : '#60A5FA', di = i<this.drawings.length ? `data-di="${i}"` : '';
        const A = this.xy(d.a); if(!A) return; const Bp = d.b ? this.xy(d.b) : null;
        const handle = (P,h)=> sel ? `<circle cx="${P.x}" cy="${P.y}" r="5" class="qxc-h" data-h="${h}" ${di}/>` : '';
        if(d.t==='hline'){ out += `<g ${di}><line x1="0" x2="${W}" y1="${A.y}" y2="${A.y}" stroke="${col}" stroke-width="1.5" class="qxc-s"/><text x="${W-6}" y="${A.y-4}" text-anchor="end" class="qxc-t">${this.fmtP(d.a.price)}</text></g>`; }
        else if(d.t==='vline'){ out += `<g ${di}><line x1="${A.x}" x2="${A.x}" y1="0" y2="${H}" stroke="${col}" stroke-width="1.5" class="qxc-s"/></g>`; }
        else if(d.t==='text'){ out += `<g ${di}><text x="${A.x+6}" y="${A.y-6}" class="qxc-t qxc-note" style="fill:${col}">${escapeHtml(d.text)}</text><circle cx="${A.x}" cy="${A.y}" r="3" fill="${col}"/></g>`; }
        else if(Bp){
          if(d.t==='trend' || d.t==='ray'){ let x2=Bp.x, y2=Bp.y; if(d.t==='ray' && Bp.x!==A.x){ const k=(Bp.y-A.y)/(Bp.x-A.x); x2 = Bp.x>A.x ? W : 0; y2 = A.y + k*(x2-A.x); } out += `<g ${di}><line x1="${A.x}" y1="${A.y}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="2" class="qxc-s"/>${handle(A,0)}${handle(Bp,1)}</g>`; }
          else if(d.t==='rect'){ out += `<g ${di}><rect x="${Math.min(A.x,Bp.x)}" y="${Math.min(A.y,Bp.y)}" width="${Math.abs(Bp.x-A.x)}" height="${Math.abs(Bp.y-A.y)}" fill="rgba(96,165,250,0.12)" stroke="${col}" class="qxc-s"/>${handle(A,0)}${handle(Bp,1)}</g>`; }
          else if(d.t==='fib'){ const hi=d.a.price, lo=d.b.price; let g=`<g ${di}>`; fib.forEach(f=>{ const pr = hi - (hi-lo)*f; const y = this.main.priceToCoordinate(pr); if(y==null) return; g += `<line x1="${Math.min(A.x,Bp.x)}" x2="${Math.max(A.x,Bp.x, W*0.98)}" y1="${y}" y2="${y}" stroke="${col}" stroke-opacity="${f===0||f===1?0.9:0.55}" class="qxc-s"/><text x="${Math.min(A.x,Bp.x)+4}" y="${y-3}" class="qxc-t">${(f*100).toFixed(1)}%  ${this.fmtP(pr)}</text>`; }); g += `<line x1="${A.x}" y1="${A.y}" x2="${Bp.x}" y2="${Bp.y}" stroke="${col}" stroke-dasharray="4 3" class="qxc-s"/>${handle(A,0)}${handle(Bp,1)}</g>`; out += g; }
          else if(d.t==='measure'){ const ch = d.b.price-d.a.price, pc = ch/d.a.price*100, bars = Math.round(Math.abs(this.findIdx(d.b.time)-this.findIdx(d.a.time))); const c2 = ch>=0 ? 'rgba(62,207,142,' : 'rgba(255,92,108,'; out += `<g ${di}><rect x="${Math.min(A.x,Bp.x)}" y="${Math.min(A.y,Bp.y)}" width="${Math.abs(Bp.x-A.x)}" height="${Math.abs(Bp.y-A.y)}" fill="${c2}0.14)" stroke="${c2}0.8)" class="qxc-s"/><text x="${(A.x+Bp.x)/2}" y="${Math.min(A.y,Bp.y)-6}" text-anchor="middle" class="qxc-t qxc-meas">${ch>=0?'+':''}${this.fmtP(ch)} (${pc>=0?'+':''}${pc.toFixed(2)}%) · ${bars} bars</text>${handle(A,0)}${handle(Bp,1)}</g>`; }
        }
      });
      svg.innerHTML = out;
    }
    async screenshot(){
      if(!this.chart) return;
      try{
        const c = this.chart.takeScreenshot();
        const svg = this.q('.qxc-draw');
        if(svg && svg.innerHTML.trim()){
          const clone = svg.cloneNode(true); clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
          const st = document.createElementNS('http://www.w3.org/2000/svg','style'); st.textContent = `.qxc-t{fill:${css('--text-1')};font:11px monospace}.qxc-note{font:600 12px sans-serif}.qxc-meas{fill:${css('--text-0')};font-weight:600}.qxc-h{fill:none}`; clone.insertBefore(st, clone.firstChild);
          const xml = new XMLSerializer().serializeToString(clone);
          const img = new Image(); const ok = await new Promise(r=>{ img.onload=()=>r(true); img.onerror=()=>r(false); img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(xml); });
          if(ok){ const ratio = c.width / (this.q('.qxc-canvas').clientWidth || c.width); c.getContext('2d').drawImage(img, 0, 0, img.width*ratio, img.height*ratio); }
        }
        const ctx = c.getContext('2d'); ctx.fillStyle = css('--text-1'); ctx.font = '12px sans-serif'; ctx.fillText(`${this.symbol} · ${(INTERVALS.find(x=>x[0]===this.cfg.interval)||[])[2]} · Quantis · ${new Date().toISOString().slice(0,16).replace('T',' ')} UTC`, 10, c.height-10);
        const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = `${this.symbol}_${this.cfg.interval}_chart.png`; a.click();
        toast('Chart image downloaded.', 'ok');
      }catch(e){ toast('Screenshot failed: '+e.message, 'err'); }
    }
    toggleFull(){
      const on = !this.host.classList.contains('qxc-fullscreen');
      this.host.classList.toggle('qxc-fullscreen', on); document.body.classList.toggle('qxc-lock', on);
      setTimeout(()=>{ this.renderDrawings(); }, 60);
    }
  }
  function fmtBig(v){ const a=Math.abs(v); return a>=1e12?(v/1e12).toFixed(2)+'T':a>=1e9?(v/1e9).toFixed(2)+'B':a>=1e6?(v/1e6).toFixed(2)+'M':a>=1e3?(v/1e3).toFixed(1)+'K':String(Math.round(v)); }

  /* ---------------- symbol datalist ---------------- */
  function ensureDatalist(){
    if(document.getElementById('qxcSymList')) return;
    const dl = document.createElement('datalist'); dl.id = 'qxcSymList';
    dl.innerHTML = SECURITY_UNIVERSE.map(s=>`<option value="${escapeHtml(s.t)}">${escapeHtml(s.n)}</option>`).join('');
    document.body.appendChild(dl);
  }

  /* ---------------- instances ---------------- */
  let research = null; const grid = [];
  function mountResearch(){
    const host = document.getElementById('qxResearchChart'); if(!host) return null;
    if(research && research.host === host) return research;
    if(research){ try{ research.chart && research.chart.remove(); }catch(e){} }
    ensureDatalist();
    research = new Chart(host, {persistKey:'research', symbol:currentSecurity, growPanes:true});
    return research;
  }
  function onResearchData(t, hist){
    const c = mountResearch(); if(!c) return;
    if(hist && hist._t !== t) hist._t = t;
    if(c.symbol !== t){ c.symbol = t; c.compare = []; }
    if(hist) c.setData(hist); else c.load();
  }
  function mountGrid(n){
    ensureDatalist();
    const wrap = document.getElementById('qxChartGrid'); if(!wrap) return;
    n = n || store.get('qx_grid_layout', 1);
    store.set('qx_grid_layout', n);
    document.querySelectorAll('#qxLayoutBtns [data-layout]').forEach(b=>b.classList.toggle('active', +b.dataset.layout===n));
    wrap.className = 'qxc-grid qxc-grid-'+n;
    const syms = store.get('qx_grid_syms', [currentSecurity,'SPX','NIFTY50','BTC']);
    while(grid.length > n){ const g = grid.pop(); try{ g.chart && g.chart.remove(); }catch(e){} g.host.remove(); }
    for(let i=grid.length;i<n;i++){
      const host = document.createElement('div'); host.className = 'qxc-cell'; wrap.appendChild(host);
      const c = new Chart(host, {persistKey:'grid'+i, symbol: syms[i] || currentSecurity, symbolInput:true});
      const orig = c.setSymbol.bind(c); c.setSymbol = t=>{ orig(t); const s = store.get('qx_grid_syms', []); s[i]=c.symbol; store.set('qx_grid_syms', s); };
      grid.push(c); c.load();
    }
    setTimeout(()=>grid.forEach(g=>g.renderDrawings()), 80);
  }
  function retheme(){ if(research) research.theme(); grid.forEach(g=>g.theme()); }
  return {Chart, mountResearch, onResearchData, mountGrid, retheme, calcIndicator, IND, CHART_TYPES, INTERVALS, loadBars, get research(){ return research; }, grid};
})();
