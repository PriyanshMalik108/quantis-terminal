/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/features/export-center.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Export Center + downloadBlob() used by every exporter.
 * DEPENDS   core/*
 * EXPOSES   downloadBlob (global — classic script, shared scope)
 * LOAD      Classic <script>, order defined in js/manifest.json. Top-level code runs at load,
 *           so it may only call functions from files listed EARLIER in the manifest.
 * NOTE      Migrated verbatim from the single-file build; inline comments marked
 *           "REAL BUG FIXED" / "post-launch fix" document past defects — keep them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* ===================== EXPORT CENTER (Phase 6, spec sections 38-41/73) =====================
   Real downloads via Blob, no server round-trip. XLSX via SheetJS (CDN — justified by spec
   section 38's explicit XLSX requirement). CSV/JSON/Markdown are dependency-free. */
function downloadBlob(filename, content, mime){
  // Wrapped defensively: this sandbox has already shown it does non-standard things with browser
  // APIs (fetch relayed through a broken postMessage layer, elsewhere in this session) — if
  // URL.createObjectURL is unavailable or throws for any reason, in ANY environment, this now
  // degrades to a visible alert instead of an uncaught TypeError on a button click.
  try{
    const blob = new Blob([content], {type: mime});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }catch(e){
    toast('Download failed in this browser/environment: '+e.message+'. Try a different browser, or disable any content blocker for this page.');
  }
}
function exportRowsFor(category){
  // Returns {rows: [[...]], headers: [...], note: string} — the SAME real data shown in-app.
  switch(category){
    case 'prices': {
      if(!currentPriceSeries) return {headers:['Index','Close'], rows:[], note:'No price series loaded — open Research first.'};
      return {headers:['Index','Close'], rows: currentPriceSeries.map((v,i)=>[i, v.toFixed(2)]), note:`${currentSecurity} · ${currentPriceSeriesIsLive?'LIVE':'SAMPLE'} · ${currentPriceSeries.length} points`};
    }
    case 'fundamentals': {
      const f = AppState.fundamentals;
      if(!f) return {headers:['Field','Value'], rows:[], note:'No fundamentals loaded — open the Fundamentals tab first.'};
      return {headers:['Field','Value'], rows:[['Ticker',f.ticker],['Live?',f.isLive],['Revenue ($)',f.revenue],['Net Income ($)',f.netIncome],['ROE (%)',f.roePct],['Net Margin (%)',f.netMarginPct],['Entity',f.entityName||'']], note:`${f.ticker} · ${f.isLive?'LIVE (SEC EDGAR)':'SAMPLE'}`};
    }
    case 'technicals': {
      const t = AppState.technicals;
      if(!t) return {headers:['Indicator','Value'], rows:[], note:'No technicals computed — open the Technicals tab first.'};
      return {headers:['Indicator','Value'], rows:[['RSI(14)',t.rsi14],['Stoch %K',t.stochK],['Williams %R',t.willR],['ROC(10)',t.roc10],['MACD',t.macd&&t.macd.macd],['Signal',t.macd&&t.macd.signal],['SMA20',t.sma20],['SMA50',t.sma50],['ATR(14)',t.atr],['Hist Vol 30D(%)',t.histVol],['Bollinger Upper',t.boll&&t.boll.upper],['Bollinger Lower',t.boll&&t.boll.lower]], note:`${currentSecurity} · ${t.isLive?'LIVE':'SAMPLE'} price series`};
    }
    case 'prediction': {
      const p = AppState.forecast;
      if(!p) return {headers:['Model','Pred %','MAE','Dir Acc %','Weight'], rows:[], note:'No forecast computed — open the Prediction tab first.'};
      return {headers:['Model','Pred %','MAE','Dir Acc %','Weight'], rows: p.models.map(m=>[m.label,m.predPct,m.mae,m.dirAcc,m.weight]), note:`${p.ticker} · Ensemble ${p.ensemblePredPct.toFixed(1)}% · ${p.isLive?'LIVE':'SAMPLE'} price series`};
    }
    case 'portfolio': {
      const p = AppState.portfolio;
      if(!p) return {headers:['Ticker','Weight %'], rows:[], note:'No portfolio computed — open the Portfolio tab first.'};
      return {headers:['Ticker','Weight %'], rows: p.holdings.map(h=>[h.ticker,h.weightPct]), note:`Value $${p.value.toFixed(0)} · Return ${p.annReturnPct.toFixed(1)}% · Sharpe ${p.sharpe?.toFixed(2)} · MaxDD ${p.maxDrawdownPct.toFixed(1)}%`};
    }
    case 'risk': {
      const r = AppState.risk;
      if(!r) return {headers:['Metric','Value'], rows:[], note:'No risk metrics computed — open the Risk tab first.'};
      return {headers:['Metric','Value'], rows:[['VaR Hist (1D,95%)',r.varHist],['CVaR Hist (1D,95%)',r.cvarHist],['VaR Parametric',r.varParam],['Max Drawdown %',r.maxDrawdownPct],['Sharpe',r.sharpe],['Sortino',r.sortino],['Annualized Vol %',r.annualVolPct]], note:`${r.ticker} · ${r.isLive?'LIVE':'SAMPLE'}`};
    }
    case 'options': {
      const o = AppState.options;
      if(!o) return {headers:['Field','Value'], rows:[], note:'No option pricing run — open the Options tab first.'};
      return {headers:['Field','Value'], rows: Object.entries(o), note:`${o.ticker} · Black-Scholes (Tests-tab verified)`};
    }
    case 'all': {
      return {headers:['Section','JSON'], rows: Object.entries(AppState).map(([k,v])=>[k, JSON.stringify(v)]), note:'Full AppState snapshot'};
    }
    default: return {headers:[], rows:[], note:'Unknown category'};
  }
}
function runExport(){
  const cat = document.querySelector('#exportDataChips .chip.active')?.dataset.cat || 'prices';
  const fmt = document.querySelector('#exportFormatChips .chip.active')?.dataset.fmt || 'csv';
  const {headers, rows, note} = exportRowsFor(cat);
  if(!rows.length){ toast(note); return; }
  const filename = `quantis-${cat}-${currentSecurity}`;
  if(fmt==='csv'){
    const csv = [headers.join(','), ...rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(','))].join('\n');
    downloadBlob(filename+'.csv', csv, 'text/csv');
  } else if(fmt==='json'){
    const obj = cat==='all' ? AppState : rows.map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]])));
    downloadBlob(filename+'.json', JSON.stringify(obj,null,2), 'application/json');
  } else if(fmt==='md'){
    const md = `# ${cat} — ${currentSecurity}\n\n${note}\n\n| ${headers.join(' | ')} |\n|${headers.map(()=>'---').join('|')}|\n` + rows.map(r=>`| ${r.join(' | ')} |`).join('\n');
    downloadBlob(filename+'.md', md, 'text/markdown');
  } else if(fmt==='xlsx'){
    if(typeof XLSX === 'undefined'){ toast('XLSX library failed to load (check network) — try CSV or JSON instead.'); return; }
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, cat.slice(0,31));
    XLSX.writeFile(wb, filename+'.xlsx');
  }
}
document.getElementById('exportDataChips').addEventListener('click', e=>{
  const chip = e.target.closest('.chip'); if(!chip) return;
  document.querySelectorAll('#exportDataChips .chip').forEach(c=>c.classList.remove('active')); chip.classList.add('active');
  document.getElementById('exportDataNote').textContent = exportRowsFor(chip.dataset.cat).note;
});
document.getElementById('exportFormatChips').addEventListener('click', e=>{
  const chip = e.target.closest('.chip'); if(!chip) return;
  document.querySelectorAll('#exportFormatChips .chip').forEach(c=>c.classList.remove('active')); chip.classList.add('active');
});
