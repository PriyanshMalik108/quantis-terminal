/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/features/compare.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Comparison engine.
 * DEPENDS   data/*
 * EXPOSES   renderCompare (global — classic script, shared scope)
 * LOAD      Classic <script>, order defined in js/manifest.json. Top-level code runs at load,
 *           so it may only call functions from files listed EARLIER in the manifest.
 * NOTE      Migrated verbatim from the single-file build; inline comments marked
 *           "REAL BUG FIXED" / "post-launch fix" document past defects — keep them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* ===================== COMPARE ===================== */
/* ===================== COMPARE (post-launch fix) =====================
   Previously rendered a chip for every single entry in SECURITIES — fine at 6 tickers, an
   unusable wall of 100+ chips once the universe enrichment above (correctly) grew that list.
   Compare now seeds its chip pool from the active workspace's watchlist (a sensible small
   default) plus anything explicitly typed into the new "Add a ticker" box — so it stays a
   comparison of a deliberately chosen few, while still being able to reach any of the full
   universe on request via free text, not just a fixed 6. */
let compareTickerPool = null;
function renderCompare(){
  if(compareTickerPool === null){
    const seed = activeWatchlist();
    compareTickerPool = seed.length ? [...seed] : SECURITIES.slice(0,6).map(s=>s.t);
  }
  document.getElementById('compareChips').innerHTML = compareTickerPool.map((t,i)=>`<div class="chip ${i<4?'active':''}" data-t="${t}">${t}</div>`).join('');
  document.querySelectorAll('#compareChips .chip').forEach(c=>c.addEventListener('click',()=>{c.classList.toggle('active');renderCompareTable();}));
  renderCompareTable();
}
function addTickerToCompare(){
  const input = document.getElementById('compareAddInput');
  const statusEl = document.getElementById('compareAddStatus');
  const clean = (input.value||'').trim().toUpperCase();
  if(!clean){ statusEl.textContent = ''; return; }
  const meta = SECURITY_UNIVERSE.find(x=>x.t===clean);
  if(!meta){ statusEl.innerHTML = `<span style="color:var(--down)">"${clean}" isn't in the ${SECURITY_UNIVERSE.length}-ticker searchable universe. Try Ctrl+K.</span>`; return; }
  if(!SECURITIES.some(s=>s.t===clean)) SECURITIES.push(makeSampleSecurityEntry(meta));
  if(!compareTickerPool.includes(clean)) compareTickerPool.push(clean);
  input.value = '';
  statusEl.innerHTML = `<span style="color:var(--up)">Added ${clean}.</span>`;
  renderCompare();
  // make sure the newly-added chip shows as active even though renderCompare only auto-activates the first 4
  const chip = document.querySelector(`#compareChips .chip[data-t="${clean}"]`);
  if(chip && !chip.classList.contains('active')){ chip.classList.add('active'); renderCompareTable(); }
}
let compareRenderToken = 0;
async function renderCompareTable(){
  const active = [...document.querySelectorAll('#compareChips .chip.active')].map(c=>c.dataset.t);
  const rows = active.map(t=>SECURITIES.find(s=>s.t===t)).filter(Boolean);
  const myToken = ++compareRenderToken;
  const tvOf = {}; rows.forEach(r=>{ if(['Equity','ETF'].includes(r.cls)){ const tv = LD.tvSymbol(r.t); if(tv) tvOf[r.t] = tv; } });
  let fund = {}, fundErr = null;
  const draw = () => {
    const F = (r, k) => fund[r.t] ? fund[r.t][k] : undefined;
    const f1 = v => v==null ? '—' : (v===undefined ? '…' : (+v).toFixed(1));
    const pctv = v => v==null ? '—' : (v===undefined ? '…' : (+v).toFixed(1)+'%');
    const metrics = [
      ['Price', r=>r.px ? fmtPrice(r.px, r.ccy) : '—'],
      ['Day change', r=>r.chgPct!=null ? `<span class="${r.chgPct>=0?'up':'down'}">${r.chgPct>=0?'+':''}${r.chgPct.toFixed(2)}%</span>` : '—'],
      ['1-year return', r=>{ const v=F(r,'Perf.Y'); return v==null||v===undefined ? f1(v) : `<span class="${v>=0?'up':'down'}">${v>=0?'+':''}${v.toFixed(1)}%</span>`; }],
      ['Market cap (US$ B)', r=>{ const v=F(r,'market_cap_basic'); return v==null||v===undefined ? f1(v) : (v/1e9).toFixed(1); }],
      ['P/E (TTM)', r=>f1(F(r,'price_earnings_ttm'))],
      ['P/E (forward)', r=>f1(F(r,'price_earnings_forward_fy'))],
      ['P/B', r=>f1(F(r,'price_book_fq'))],
      ['EV / EBITDA', r=>f1(F(r,'enterprise_value_ebitda_ttm'))],
      ['ROE', r=>pctv(F(r,'return_on_equity'))],
      ['Net margin', r=>pctv(F(r,'net_margin'))],
      ['Revenue growth (YoY)', r=>pctv(F(r,'total_revenue_yoy_growth_ttm'))],
      ['Dividend yield', r=>pctv(F(r,'dividends_yield_current'))],
      ['Beta (1Y)', r=>{ const v=F(r,'beta_1_year'); return v==null||v===undefined ? f1(v) : v.toFixed(2); }],
      ['RSI (14)', r=>{ const v=F(r,'RSI'); return v!=null && v!==undefined ? v.toFixed(1) : (r.rsi ?? '—'); }],
      ['Sector', r=>escapeHtml(F(r,'sector') || r.sector || '—')],
      ['Currency', r=>r.ccy],
    ];
    let html = `<thead><tr><th>Metric</th>${rows.map(r=>`<th>${escapeHtml(r.t)}</th>`).join('')}</tr></thead><tbody>`;
    metrics.forEach(m=>{ html += `<tr><td style="font-family:var(--sans);color:var(--text-1);">${m[0]}</td>${rows.map(r=>`<td>${m[1](r)}</td>`).join('')}</tr>`; });
    html += '</tbody>';
    document.getElementById('compareTable').innerHTML = html;
    const srcEl = document.getElementById('compareSourceNote');
    if(srcEl) srcEl.innerHTML = fundErr ? `<span style="color:var(--down)">Live fundamentals unavailable right now: ${escapeHtml(fundErr)}</span>` : `<span class="badge fact">LIVE</span> Prices via CNBC; valuation, profitability and momentum via TradingView. Market cap converted to US$ for comparability.`;
  };
  if(!document.getElementById('compareSourceNote')){
    const t = document.getElementById('compareTable');
    if(t && t.parentElement){ const n = document.createElement('div'); n.id = 'compareSourceNote'; n.className = 'notebox'; n.style.marginTop = '8px'; t.insertAdjacentElement('afterend', n); }
  }
  draw();
  const tvSyms = Object.values(tvOf);
  if(tvSyms.length){
    try{
      const {rows: tvRows} = await LD.tvScan('global', {symbols:{tickers:tvSyms}, columns:['market_cap_basic','price_earnings_ttm','price_earnings_forward_fy','price_book_fq','enterprise_value_ebitda_ttm','return_on_equity','net_margin','total_revenue_yoy_growth_ttm','dividends_yield_current','beta_1_year','RSI','Perf.Y','sector']});
      if(myToken !== compareRenderToken) return;
      const bySym = {}; tvRows.forEach(x=>bySym[x._s]=x);
      Object.entries(tvOf).forEach(([t, tv])=>{ fund[t] = bySym[tv] || {}; });
      rows.forEach(r=>{ if(!fund[r.t]) fund[r.t] = {}; });
    }catch(e){ if(myToken !== compareRenderToken) return; fundErr = e.message; rows.forEach(r=>{ fund[r.t] = {}; }); }
    draw();
  } else { rows.forEach(r=>{ fund[r.t] = {}; }); draw(); }

  const currencies = new Set(rows.map(r=>r.ccy));
  const warnEl = document.getElementById('compareCurrencyWarn');
  if(!warnEl) return;
  if(currencies.size <= 1){ warnEl.style.display='none'; return; }
  warnEl.style.display='block';
  warnEl.innerHTML = `<span style="color:var(--amber)">⚠</span> These securities trade in different currencies (${[...currencies].join(', ')}) — the Price row above is each one's own native currency, NOT directly comparable as raw numbers. Fetching live conversion to a common currency…`;
  try{
    const rates = {};
    for(const ccy of currencies) rates[ccy] = await getFxRateToUsd(ccy);
    const convertedRow = rows.map(r=>'$'+(r.px * rates[r.ccy]).toFixed(2)).join(' · ');
    warnEl.innerHTML = `<span style="color:var(--amber)">⚠</span> Different currencies (${[...currencies].join(', ')}) — Price row above is native, not directly comparable. <b>Converted to USD (live FX via Frankfurter/ECB):</b> ${rows.map((r,i)=>r.t+' '+convertedRow.split(' · ')[i]).join(' · ')}`;
  }catch(e){
    warnEl.innerHTML = `<span style="color:var(--amber)">⚠</span> Different currencies (${[...currencies].join(', ')}) — Price row above is native, not directly comparable. Live conversion failed: ${escapeHtml(e.message)}`;
  }
}
