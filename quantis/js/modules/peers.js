/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/modules/peers.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Peer comparison: the largest primary listings in the same sector AND home market
 *           (so market caps share a currency), with valuation, growth, profitability, returns,
 *           leverage and 1-year performance, the peer median, and the company's rank on each.
 *           Used by the Analysis tab card and every equity report.
 * DEPENDS   LD.tvScan, LD.TV_MARKET_BY_COUNTRY, LD.tvSymbol, cachedJson
 * EXPOSES   QXP.{table(t, fundamentals) → {sector, market, rows, self, median, ranks, cols}, render(el, t)}
 * NOTE      "Better" direction per column is defined in COLS (higher/lower) — the rank shown is
 *           1 = best among peers. Medians ignore nulls and, for valuation multiples, negatives.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const QXP = (() => {
  const COLS = [ // [key, label, format, better]
    ['market_cap_basic','Market cap','cap','higher'], ['price_earnings_ttm','P/E','x','lower'], ['price_book_fq','P/B','x','lower'], ['enterprise_value_ebitda_ttm','EV/EBITDA','x','lower'],
    ['price_sales_current','P/S','x','lower'], ['total_revenue_yoy_growth_ttm','Revenue growth','pct','higher'], ['gross_margin','Gross margin','pct','higher'], ['operating_margin','Operating margin','pct','higher'],
    ['net_margin','Net margin','pct','higher'], ['return_on_equity','ROE','pct','higher'], ['return_on_invested_capital','ROIC','pct','higher'], ['debt_to_equity','Debt/Equity','x2','lower'],
    ['dividends_yield_current','Div. yield','pct','higher'], ['Perf.Y','1-year return','pct','higher'],
  ];
  const fin = v => typeof v==='number' && isFinite(v);
  async function table(t, f){
    if(!f || !f.sector) throw new Error('sector unknown');
    const self = LD.tvSymbol(t);
    const market = LD.TV_MARKET_BY_COUNTRY[f.country] || 'global';
    const filter = [{left:'sector',operation:'equal',right:f.sector},{left:'type',operation:'equal',right:'stock'},{left:'is_primary',operation:'equal',right:true}];
    if(market==='global' && f.country) filter.push({left:'country',operation:'equal',right:f.country});
    const cols = ['name','description','close','currency','logoid', ...COLS.map(c=>c[0])];
    const {rows} = await cachedJson(`qxpeers1_${market}_${f.sector}_${f.country}`, 6*3600e3, () => LD.tvScan(market, {filter, columns:cols, sort:{sortBy:'market_cap_basic',sortOrder:'desc'}, range:[0,12]}));
    let list = rows.slice(0, 10);
    if(self && !list.some(r=>r._s===self)){ try{ const one = await LD.tvScan(market, {symbols:{tickers:[self]}, columns:cols}); if(one.rows[0]) list = [one.rows[0], ...list.slice(0,9)]; }catch(e){} }
    const median = {}, ranks = {};
    COLS.forEach(([k,,fmt,better])=>{
      const vals = list.map(r=>r[k]).filter(v=>fin(v) && (fmt!=='x' || v>0)).sort((a,b)=>a-b);
      median[k] = vals.length ? (vals.length%2 ? vals[(vals.length-1)/2] : (vals[vals.length/2-1]+vals[vals.length/2])/2) : null;
      const me = list.find(r=>r._s===self);
      if(me && fin(me[k])){ const sorted = vals.slice().sort((a,b)=> better==='higher' ? b-a : a-b); ranks[k] = {rank: sorted.indexOf(me[k])+1, of: sorted.length}; }
    });
    return {sector:f.sector, country:f.country, market, rows:list, self, median:{pe:median.price_earnings_ttm, pb:median.price_book_fq, evEbitda:median.enterprise_value_ebitda_ttm, ...median}, ranks, cols:COLS, ccy: (list[0]||{}).currency};
  }
  const fmt = (v, f, ccy) => !fin(v) ? '—' : f==='cap' ? fmtMarketCapShort(v, /^GB[pX]$/.test(ccy)?'GBP':ccy) : f==='pct' ? v.toFixed(1)+'%' : f==='x2' ? v.toFixed(2) : v.toFixed(1)+'×';
  async function render(el, t){
    if(!el) return; el.innerHTML = '<div class="qx-skel" style="height:160px"></div>';
    try{
      const f = LIVE_FUNDAMENTALS[t] || await fetchLiveFundamentals(t); const P = await table(t, f);
      el.innerHTML = `<div style="overflow-x:auto"><table class="datatable qxp-table"><thead><tr><th>Company</th>${P.cols.map(c=>`<th>${c[1]}</th>`).join('')}</tr></thead><tbody>
        ${P.rows.map(r=>`<tr class="${r._s===P.self?'qxp-self':''}"><td><b>${escapeHtml(String(r._s).split(':')[1])}</b> <span class="qxa-dim">${escapeHtml(String(r.description||'').slice(0,26))}</span></td>${P.cols.map(([k,,f])=>`<td>${fmt(r[k], f, r.currency)}</td>`).join('')}</tr>`).join('')}
        <tr class="qxp-med"><td><b>Peer median</b></td>${P.cols.map(([k,,f])=>`<td>${fmt(P.median[k], f, P.ccy)}</td>`).join('')}</tr>
        <tr class="qxp-rank"><td><b>${escapeHtml(t)} rank</b> <span class="qxa-dim">1 = best</span></td>${P.cols.map(([k])=>`<td>${P.ranks[k]?P.ranks[k].rank+' / '+P.ranks[k].of:'—'}</td>`).join('')}</tr></tbody></table></div>
        <div class="qxa-dim" style="margin-top:6px">Largest ${P.rows.length} primary listings in “${escapeHtml(P.sector)}”${P.country?` (${escapeHtml(P.country)})`:''} · TradingView · medians exclude negative multiples.</div>`;
    }catch(e){ el.innerHTML = `<div class="qxa-dim">Peer comparison unavailable: ${escapeHtml(e.message)}</div>`; }
  }
  return {table, render, COLS, fmt};
})();
