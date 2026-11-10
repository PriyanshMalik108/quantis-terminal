/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/modules/analysis.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Financial Analyst engine: pulls statements, computes the ratio library, writes cash-flow / margin / balance-sheet narratives, flags, life-cycle and health score. Renders the Research → Analysis tab.
 * DEPENDS   LD.tvScan, cachedFetch, Chart.js, modules/providers (optional exact line items)
 * EXPOSES   QXA (single global namespace object — keep new public functions on it)
 * PATTERN   IIFE module: private helpers stay inside the closure; only the returned object is global.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* =====================================================================================
   QUANTIS FINANCIAL ANALYST — automatic statement analysis
   Pulls the reported statements (TradingView fundamentals, keyless) the moment a company is
   opened, runs them through a professional formula library and writes the analyst narrative:
   why each cash flow is positive/negative and where it came from, why margins moved, what the
   balance sheet says, red flags, strengths, life-cycle stage and an overall conclusion.
   Every number shown is either reported or derived by a formula that is printed next to it.
   ===================================================================================== */
const QXA = (() => {
  const COLS = ['description','currency','fundamental_currency_code','sector','industry','country','number_of_employees','market_cap_basic','close',
    'price_earnings_ttm','price_book_fq','enterprise_value_ebitda_ttm','price_sales_current','dividends_yield_current','beta_5_year',
    'total_revenue_fy','gross_profit_fy','oper_income_fy','ebitda_fy','net_income_fy','research_and_dev_fy',
    'cash_f_operating_activities_fy','cash_f_investing_activities_fy','cash_f_financing_activities_fy','capital_expenditures_fy','free_cash_flow_fy',
    'total_cash_dividends_paid_fy','issuance_of_stock_net_ttm','cash_f_operating_activities_ttm',
    'total_current_assets_fq','total_current_liabilities_fq','total_liabilities_fq','total_equity_fq','short_term_debt_fq','long_term_debt_fq',
    'cash_n_equivalents_fq','cash_n_short_term_invest_fq','goodwill_fq','net_debt_fq','total_assets_fq','working_capital_fq','total_debt_fq',
    'current_ratio_fq','quick_ratio_fq','debt_to_equity_fq','debt_to_asset_fq','net_debt_to_ebitda_fq','interst_cover_fy','ebitda_interst_cover_fy',
    'asset_turnover_fy','invent_turnover_fy','receivables_turnover_fy','fixed_assets_turnover_fy',
    'return_on_equity_fy','return_on_assets_fy','return_on_invested_capital_fy','return_on_capital_employed_fy',
    'piotroski_f_score_fy','altman_z_score_fy','sloan_ratio_fy','zmijewski_score_fy','graham_numbers_fy','sustainable_growth_rate_fy',
    'total_revenue_yoy_growth_fy','net_income_yoy_growth_fy','ebitda_yoy_growth_fy','gross_profit_yoy_growth_fy','free_cash_flow_yoy_growth_fy',
    'total_assets_yoy_growth_fy','total_debt_yoy_growth_fy','total_revenue_5y_growth_fy','earnings_per_share_diluted_yoy_growth_fy',
    'gross_margin_fy','oper_income_margin_fy','net_margin_fy','ebitda_margin_fy','free_cash_flow_margin_fy','share_buyback_ratio_fy',
    'dividend_payout_ratio_fy','effective_interest_rate_on_debt_fy','total_equity_fy','total_assets_fy',
    'fiscal_period_fy_h','fiscal_period_end_fy','total_revenue_fy_h','gross_profit_fy_h','ebitda_fy_h','net_income_fy_h','free_cash_flow_fy_h','capital_expenditures_unchanged_fy_h',
    'total_debt_fy_h','total_assets_fy_h','earnings_per_share_diluted_fy_h','dps_common_stock_prim_issue_fy_h',
    'total_revenue_fq_h','gross_profit_fq_h','net_income_fq_h','free_cash_flow_fq_h','ebitda_fq_h','earnings_per_share_diluted_fq_h'];
  const cache = {};
  const fin = v => typeof v === 'number' && isFinite(v);
  const sd = (a,b) => (fin(a) && fin(b) && b !== 0) ? a/b : null;
  const pctS = (v,d=1) => fin(v) ? (v>=0?'+':'')+v.toFixed(d)+'%' : '—';
  const pctP = (v,d=1) => fin(v) ? v.toFixed(d)+'%' : '—';
  const xS = (v,d=2) => fin(v) ? v.toFixed(d)+'×' : '—';

  async function scanAll(tvSym){
    let lastErr = null, cols = COLS.slice();
    for(const mk of LD.tvMarketsFor(tvSym)){
      for(let attempt=0; attempt<3; attempt++){
        try{
          const {rows} = await LD.tvScan(mk, {symbols:{tickers:[tvSym]}, columns: cols});
          if(rows.length) return rows[0];
          break;
        }catch(e){
          lastErr = e; const m = /unknown field[^"']*["']([^"']+)/i.exec(e.message||'');
          if(m){ cols = cols.filter(c=>c!==m[1]); continue; } break;
        }
      }
    }
    throw lastErr || new Error('TradingView has no statement data for '+tvSym);
  }
  async function fetchData(ticker){
    const tv = LD.tvSymbol(ticker); if(!tv) throw new Error('no exchange listing mapped for '+ticker+' (statement analysis covers listed companies)');
    const r = await cachedFetch('qxa1_'+tv, 6*3600e3, ()=>scanAll(tv));
    return build(r, ticker);
  }

  /* ------------- build the model: reported + derived, every derivation recorded ------------- */
  function build(r, ticker){
    const A = k => Array.isArray(r[k]) ? r[k].map(v=>fin(v)?v:null) : [];
    /* Fiscal-year labels: TradingView numbers a fiscal year by the calendar year holding most of it,
       so Reliance's year ending 31-Mar-2026 is "2025" there — while Indian (and most) reports call it
       FY2026. We label every year by its END date instead, so FY2026 = year ending Mar 2026 / Sep 2026. */
    const raw = A('fiscal_period_fy_h');
    const endTs = fin(r.fiscal_period_end_fy) ? new Date(r.fiscal_period_end_fy*1000) : null;
    const off = endTs && fin(raw[0]) ? endTs.getUTCFullYear() - raw[0] : 0;
    const yrs = raw.map(v=>v==null?null:String(v + (Math.abs(off)<=1 ? off : 0)));
    const H = {fyEndMonth: endTs ? endTs.toLocaleString('en-US',{month:'short', timeZone:'UTC'}) : null, years:yrs, revenue:A('total_revenue_fy_h'), gross:A('gross_profit_fy_h'), ebitda:A('ebitda_fy_h'), net:A('net_income_fy_h'),
      fcf:A('free_cash_flow_fy_h'), capex:A('capital_expenditures_unchanged_fy_h'), debt:A('total_debt_fy_h'), assets:A('total_assets_fy_h'),
      eps:A('earnings_per_share_diluted_fy_h'), dps:A('dps_common_stock_prim_issue_fy_h')};
    H.cfo = H.fcf.map((f,i)=> fin(f) && fin(H.capex[i]) ? f + Math.abs(H.capex[i]) : null);
    H.gm = H.gross.map((g,i)=>sd(g,H.revenue[i])); H.em = H.ebitda.map((g,i)=>sd(g,H.revenue[i])); H.nm = H.net.map((g,i)=>sd(g,H.revenue[i])); H.fm = H.fcf.map((g,i)=>sd(g,H.revenue[i]));
    H.conv = H.cfo.map((c,i)=>sd(c,H.net[i]));
    const Q = {revenue:A('total_revenue_fq_h'), gross:A('gross_profit_fq_h'), net:A('net_income_fq_h'), fcf:A('free_cash_flow_fq_h'), ebitda:A('ebitda_fq_h'), eps:A('earnings_per_share_diluted_fq_h')};
    const L = {
      revenue:r.total_revenue_fy, gross:r.gross_profit_fy, ebit:r.oper_income_fy, ebitda:r.ebitda_fy, net:r.net_income_fy, rnd: fin(r.research_and_dev_fy) ? Math.abs(r.research_and_dev_fy) : null,
      cfo:r.cash_f_operating_activities_fy, cfi:r.cash_f_investing_activities_fy, cff:r.cash_f_financing_activities_fy, capex: fin(r.capital_expenditures_fy) ? -Math.abs(r.capital_expenditures_fy) : null,
      fcf:r.free_cash_flow_fy, div: fin(r.total_cash_dividends_paid_fy) ? -Math.abs(r.total_cash_dividends_paid_fy) : null, stockNet:r.issuance_of_stock_net_ttm,
      ca:r.total_current_assets_fq, cl:r.total_current_liabilities_fq, tl:r.total_liabilities_fq, eq:r.total_equity_fq, std:r.short_term_debt_fq, ltd:r.long_term_debt_fq,
      cash:r.cash_n_short_term_invest_fq ?? r.cash_n_equivalents_fq, goodwill:r.goodwill_fq, netDebt:r.net_debt_fq, ta:r.total_assets_fq, wc:r.working_capital_fq, debt:r.total_debt_fq,
      eqFy:r.total_equity_fy, taFy:r.total_assets_fy,
    };
    const R = {cur:r.current_ratio_fq, quick:r.quick_ratio_fq, de:r.debt_to_equity_fq, da:r.debt_to_asset_fq, ndEbitda:r.net_debt_to_ebitda_fq, icov:r.interst_cover_fy ?? r.ebitda_interst_cover_fy,
      icovEbitda: r.interst_cover_fy==null && r.ebitda_interst_cover_fy!=null, at:r.asset_turnover_fy, it:r.invent_turnover_fy, rt:r.receivables_turnover_fy, fat:r.fixed_assets_turnover_fy,
      roe:r.return_on_equity_fy, roa:r.return_on_assets_fy, roic:r.return_on_invested_capital_fy, roce:r.return_on_capital_employed_fy,
      pio:r.piotroski_f_score_fy, altman:r.altman_z_score_fy, sloan:r.sloan_ratio_fy, zmij:r.zmijewski_score_fy, graham:r.graham_numbers_fy, sgr:r.sustainable_growth_rate_fy,
      gRev:r.total_revenue_yoy_growth_fy, gNet:r.net_income_yoy_growth_fy, gEbitda:r.ebitda_yoy_growth_fy, gGross:r.gross_profit_yoy_growth_fy, gFcf:r.free_cash_flow_yoy_growth_fy,
      gAssets:r.total_assets_yoy_growth_fy, gDebt:r.total_debt_yoy_growth_fy, gRev5:r.total_revenue_5y_growth_fy, gEps:r.earnings_per_share_diluted_yoy_growth_fy,
      gm:r.gross_margin_fy, om:r.oper_income_margin_fy, nm:r.net_margin_fy, em:r.ebitda_margin_fy, fm:r.free_cash_flow_margin_fy, buyback:r.share_buyback_ratio_fy, payout:r.dividend_payout_ratio_fy,
      kd:r.effective_interest_rate_on_debt_fy, pe:r.price_earnings_ttm, pb:r.price_book_fq, evEbitda:r.enterprise_value_ebitda_ttm, ps:r.price_sales_current, dy:r.dividends_yield_current, beta:r.beta_5_year};
    // margins computed from the same reported figures shown on screen (TradingView's own margin fields are the fallback)
    const mg = (a,b) => fin(a)&&fin(b)&&b ? a/b*100 : null;
    R.gm = mg(L.gross,L.revenue) ?? R.gm; R.om = mg(L.ebit,L.revenue) ?? R.om; R.nm = mg(L.net,L.revenue) ?? R.nm; R.em = mg(L.ebitda,L.revenue) ?? R.em; R.fm = mg(L.fcf,L.revenue) ?? R.fm;
    // derived latest-year bridge items
    const D = {};
    D.da = fin(L.ebitda)&&fin(L.ebit) ? L.ebitda - L.ebit : null;
    D.wcOther = fin(L.cfo)&&fin(L.net)&&fin(D.da) ? L.cfo - L.net - D.da : null;
    D.cfiOther = fin(L.cfi)&&fin(L.capex) ? L.cfi - L.capex : null;
    D.dDebt = fin(H.debt[0])&&fin(H.debt[1]) ? H.debt[0]-H.debt[1] : null;
    D.cffOther = fin(L.cff) ? L.cff - (L.div||0) - (D.dDebt||0) : null;
    D.netCash = [L.cfo,L.cfi,L.cff].every(fin) ? L.cfo+L.cfi+L.cff : null;
    D.conv = sd(L.cfo, L.net); D.capexInt = sd(Math.abs(L.capex||0), L.cfo); D.capexSales = sd(Math.abs(L.capex||0), L.revenue);
    D.rndSales = sd(L.rnd, L.revenue); D.eqMult = sd(L.ta, L.eq); D.gwAssets = sd(L.goodwill, L.ta);
    D.dso = fin(R.rt)&&R.rt>0 ? 365/R.rt : null; D.dio = fin(R.it)&&R.it>0 ? 365/R.it : null;
    D.opLev = fin(R.gEbitda)&&fin(R.gRev)&&R.gRev!==0 ? R.gEbitda/R.gRev : null;
    D.cagr = (arr,n) => { const a=arr[0], b=arr[n]; return fin(a)&&fin(b)&&a>0&&b>0 ? (Math.pow(a/b,1/n)-1)*100 : null; };
    const nY = Math.min(4, H.revenue.filter(fin).length-1);
    D.revCagr = nY>0 ? D.cagr(H.revenue,nY) : null; D.epsCagr = nY>0 ? D.cagr(H.eps,nY) : null; D.fcfCagr = nY>0 ? D.cagr(H.fcf,nY) : null; D.nYears = nY;
    D.accrual = fin(L.net)&&fin(L.cfo)&&fin(L.ta) ? (L.net - L.cfo)/L.ta*100 : null;
    D.fcfYield = fin(L.fcf)&&fin(r.market_cap_basic)&&r.market_cap_basic>0 ? L.fcf/r.market_cap_basic*100 : null; // same-currency only; checked below
    if(r.currency && r.fundamental_currency_code && r.currency !== r.fundamental_currency_code && !(r.currency==='GBX'||r.currency==='GBp')) D.fcfYield = null;
    const sgn = v => fin(v) ? (v>=0?'+':'−') : '?';
    D.signs = sgn(L.cfo)+sgn(L.cfi)+sgn(L.cff);
    return {ticker, name:r.description||ticker, ccy:r.fundamental_currency_code||r.currency||'USD', sector:r.sector, industry:r.industry, country:r.country,
      employees:r.number_of_employees, mcap:r.market_cap_basic, price:r.close, tradeCcy:r.currency, H, Q, L, R, D, fetched:new Date()};
  }

  /* ------------------------------- formula library ------------------------------- */
  // [key, group, name, formula, value fn, format, explain, good/bad rule]
  function metrics(m){
    const {L,R,D,H} = m, c = v=>fmtAmtCcy(v, m.ccy);
    return [
      ['Profitability','Gross margin','Gross profit ÷ Revenue', R.gm, pctP, `${c(L.gross)} ÷ ${c(L.revenue)}`, 'How much of each sale is left after the direct cost of making it. Pricing power and input costs drive it.', v=>v>40?'good':v<20?'bad':''],
      ['Profitability','EBITDA margin','EBITDA ÷ Revenue', R.em, pctP, `${c(L.ebitda)} ÷ ${c(L.revenue)}`, 'Operating profit before depreciation & amortisation — a proxy for cash operating profit.', v=>v>25?'good':v<10?'bad':''],
      ['Profitability','Operating (EBIT) margin','Operating income ÷ Revenue', R.om, pctP, `${c(L.ebit)} ÷ ${c(L.revenue)}`, 'Profit from the core business after all operating costs.', v=>v>20?'good':v<5?'bad':''],
      ['Profitability','Net margin','Net income ÷ Revenue', R.nm, pctP, `${c(L.net)} ÷ ${c(L.revenue)}`, 'What reaches shareholders after interest, tax and one-offs.', v=>v>15?'good':v<3?'bad':''],
      ['Profitability','FCF margin','Free cash flow ÷ Revenue', R.fm, pctP, `${c(L.fcf)} ÷ ${c(L.revenue)}`, 'Cash actually left over per unit of sales after reinvestment.', v=>v>15?'good':v<0?'bad':''],
      ['Profitability','R&D intensity','R&D expense ÷ Revenue', fin(D.rndSales)?D.rndSales*100:null, pctP, `${c(L.rnd)} ÷ ${c(L.revenue)}`, 'Share of revenue spent on future products.', ()=>''],
      ['Returns','Return on equity (ROE)','Net income ÷ Average shareholders\' equity', R.roe, pctP, 'reported', 'Profit generated per unit of shareholder capital. Read together with leverage — debt inflates ROE.', v=>v>15?'good':v<8?'bad':''],
      ['Returns','Return on assets (ROA)','Net income ÷ Average total assets', R.roa, pctP, 'reported', 'Profit per unit of everything the company owns, regardless of how it is financed.', v=>v>8?'good':v<2?'bad':''],
      ['Returns','Return on invested capital (ROIC)','NOPAT ÷ (Debt + Equity − Cash)', R.roic, pctP, 'reported', 'The cleanest measure of value creation: compare it with the cost of capital (≈8–10% for most firms).', v=>v>12?'good':v<6?'bad':''],
      ['Returns','Return on capital employed (ROCE)','EBIT ÷ (Total assets − Current liabilities)', R.roce, pctP, 'reported', 'Pre-tax return on the long-term capital the business uses.', v=>v>15?'good':v<7?'bad':''],
      ['Returns','DuPont: equity multiplier','Total assets ÷ Shareholders\' equity', D.eqMult, xS, `${c(L.ta)} ÷ ${c(L.eq)}`, 'ROE = Net margin × Asset turnover × Equity multiplier. A high multiplier means ROE is being boosted by liabilities.', v=>v>4?'bad':''],
      ['Liquidity','Current ratio','Current assets ÷ Current liabilities', R.cur, xS, `${c(L.ca)} ÷ ${c(L.cl)}`, 'Ability to pay bills due within a year from assets that turn to cash within a year.', v=>v>=1.5?'good':v<1?'bad':''],
      ['Liquidity','Quick ratio','(Current assets − Inventory) ÷ Current liabilities', R.quick, xS, 'reported', 'Same test without relying on selling inventory.', v=>v>=1?'good':v<0.7?'bad':''],
      ['Liquidity','Working capital','Current assets − Current liabilities', L.wc, c, `${c(L.ca)} − ${c(L.cl)}`, 'The short-term cushion. Negative can be fine for businesses paid before they pay suppliers (retail, platforms).', v=>v<0?'bad':''],
      ['Leverage','Debt / Equity','Total debt ÷ Shareholders\' equity', R.de, xS, `${c(L.debt)} ÷ ${c(L.eq)}`, 'How much of the balance sheet is funded by lenders versus owners.', v=>v<0.5?'good':v>2?'bad':''],
      ['Leverage','Net debt / EBITDA','(Total debt − Cash) ÷ EBITDA', R.ndEbitda, xS, `${c(L.netDebt)} ÷ ${c(L.ebitda)}`, 'Years of operating profit needed to repay net debt. Below 0 means net cash.', v=>v<1?'good':v>3?'bad':''],
      ['Leverage','Interest cover', R.icovEbitda?'EBITDA ÷ Interest expense':'EBIT ÷ Interest expense', R.icov, xS, 'reported', 'How many times operating profit covers the interest bill.', v=>v>8?'good':v<3?'bad':''],
      ['Leverage','Debt / Assets','Total debt ÷ Total assets', fin(R.da)?R.da*100:null, pctP, `${c(L.debt)} ÷ ${c(L.ta)}`, 'Share of assets financed by borrowings.', v=>v>50?'bad':v<20?'good':''],
      ['Efficiency','Asset turnover','Revenue ÷ Average total assets', R.at, xS, 'reported', 'Sales generated per unit of assets — high for retailers, low for utilities.', ()=>''],
      ['Efficiency','Days sales outstanding (DSO)','365 ÷ Receivables turnover', D.dso, v=>fin(v)?v.toFixed(0)+' days':'—', `365 ÷ ${xS(R.rt)}`, 'Average days customers take to pay.', v=>v>90?'bad':v<45?'good':''],
      ['Efficiency','Days inventory outstanding (DIO)','365 ÷ Inventory turnover', D.dio, v=>fin(v)?v.toFixed(0)+' days':'—', `365 ÷ ${xS(R.it)}`, 'Average days stock sits before being sold.', v=>v>120?'bad':v<40?'good':''],
      ['Efficiency','Fixed-asset turnover','Revenue ÷ Net PP&E', R.fat, xS, 'reported', 'Sales per unit of plant and equipment.', ()=>''],
      ['Cash quality','Cash conversion (CFO ÷ Net income)','Operating cash flow ÷ Net income', D.conv, xS, `${c(L.cfo)} ÷ ${c(L.net)}`, 'Above 1× means profits are backed by cash; persistently below 0.8× means earnings rely on accruals.', v=>v>=1?'good':v<0.8?'bad':''],
      ['Cash quality','Accruals ratio (balance-sheet free)','(Net income − CFO) ÷ Total assets', D.accrual, pctP, `(${c(L.net)} − ${c(L.cfo)}) ÷ ${c(L.ta)}`, 'Sloan (1996): firms with high accruals tend to see earnings fall. Above +10% is a warning.', v=>v>10?'bad':v<0?'good':''],
      ['Cash quality','Capex intensity','Capex ÷ Operating cash flow', fin(D.capexInt)?D.capexInt*100:null, pctP, `${c(Math.abs(L.capex||0))} ÷ ${c(L.cfo)}`, 'How much of operating cash is reinvested in fixed assets.', v=>v>80?'bad':''],
      ['Cash quality','FCF yield','Free cash flow ÷ Market cap', D.fcfYield, pctP, `${c(L.fcf)} ÷ market cap`, 'Cash return the business generates relative to its price.', v=>v>5?'good':v<1?'bad':''],
      ['Growth','Revenue growth (YoY)','Revenueₜ ÷ Revenueₜ₋₁ − 1', R.gRev, pctS, 'reported', 'Top-line momentum.', v=>v>10?'good':v<0?'bad':''],
      ['Growth',`Revenue CAGR (${D.nYears}y)`,'(Revenueₜ ÷ Revenueₜ₋ₙ)^(1/n) − 1', D.revCagr, pctS, `FY${H.years[D.nYears]||'?'} → FY${H.years[0]||'?'}`, 'Smoothed multi-year growth rate.', v=>v>10?'good':v<0?'bad':''],
      ['Growth','Net income growth (YoY)','Net incomeₜ ÷ Net incomeₜ₋₁ − 1', R.gNet, pctS, 'reported', 'Bottom-line momentum.', v=>v>10?'good':v<0?'bad':''],
      ['Growth',`EPS CAGR (${D.nYears}y)`,'(EPSₜ ÷ EPSₜ₋ₙ)^(1/n) − 1', D.epsCagr, pctS, 'diluted EPS history', 'Per-share earnings growth (captures buybacks and dilution).', v=>v>10?'good':v<0?'bad':''],
      ['Growth','Operating leverage','%Δ EBITDA ÷ %Δ Revenue', D.opLev, xS, `${pctS(R.gEbitda)} ÷ ${pctS(R.gRev)}`, 'Above 1× means profit grows faster than sales (fixed costs being spread); below 1× means costs are growing faster.', v=>v>1?'good':v<0?'bad':''],
      ['Growth','Sustainable growth rate','ROE × (1 − Payout ratio)', R.sgr, pctP, `${pctP(R.roe)} × (1 − ${pctP(R.payout)})`, 'Growth the firm can fund internally without new equity or more leverage.', ()=>''],
      ['Scores','Piotroski F-score','Nine binary tests: profitability (4), leverage/liquidity (3), efficiency (2)', R.pio, v=>fin(v)?v+' / 9':'—', 'reported', '8–9 strong, 0–2 weak (Piotroski 2000).', v=>v>=7?'good':v<=3?'bad':''],
      ['Scores','Altman Z-score','1.2·WC/TA + 1.4·RE/TA + 3.3·EBIT/TA + 0.6·MVE/TL + 1.0·Sales/TA', R.altman, v=>fin(v)?v.toFixed(2):'—', 'reported', 'Above 2.99 safe, 1.81–2.99 grey zone, below 1.81 distress (manufacturers).', v=>v>2.99?'good':v<1.81?'bad':''],
      ['Scores','Zmijewski score','−4.3 − 4.5·NI/TA + 5.7·TL/TA − 0.004·CA/CL', R.zmij, v=>fin(v)?v.toFixed(2):'—', 'reported', 'Above 0 indicates elevated probability of financial distress.', v=>v>0?'bad':'good'],
      ['Scores','Graham number','√(22.5 × EPS × Book value per share)', R.graham, v=>fin(v)?fmtPrice(v, m.tradeCcy):'—', 'reported', 'Benjamin Graham\'s ceiling for a defensive investor\'s purchase price.', ()=>''],
    ].map(([group,name,formula,value,fmt,inputs,explain,rule])=>({group,name,formula,value: fin(value)?value:null,text:fmt(value),inputs,explain,tone: fin(value)?rule(value):''}));
  }

  /* --------------------------------- narratives --------------------------------- */
  function narrate(m){
    const {L,R,D,H} = m, c = v=>fmtAmtCcy(v, m.ccy), out = {cfo:[], cfi:[], cff:[], margins:[], growth:[], balance:[], returns:[], quarter:[]};
    const yr = H.years[0] ? 'FY'+H.years[0] : 'the latest fiscal year';
    // ---- operating cash flow
    if(fin(L.cfo)){
      if(L.cfo >= 0){
        out.cfo.push(`<b>Operating cash flow was positive at ${c(L.cfo)}</b> in ${yr}: the core business generated cash.`);
        const parts = [];
        if(fin(L.net)) parts.push(`net income of ${c(L.net)}`);
        if(fin(D.da)) parts.push(`${c(D.da)} of depreciation & amortisation added back (a non-cash charge that reduced profit but not cash)`);
        if(fin(D.wcOther)) parts.push(D.wcOther>=0 ? `${c(D.wcOther)} released from working capital and other non-cash items (e.g. collecting receivables, paying suppliers later, stock-based pay)` : `${c(D.wcOther)} absorbed by working capital and other items (cash tied up in receivables or inventory, or suppliers paid faster)`);
        if(parts.length) out.cfo.push('Where it came from: '+parts.join('; ')+'.');
      } else {
        out.cfo.push(`<b>Operating cash flow was negative at ${c(L.cfo)}</b> in ${yr}: the business consumed cash just to run.`);
        if(fin(L.net) && L.net < 0) out.cfo.push(`Primary cause: the company made a <b>net loss of ${c(L.net)}</b> — expenses exceeded revenue, so there was no profit to convert into cash.`);
        if(fin(D.wcOther) && D.wcOther < 0) out.cfo.push(`Working capital absorbed <b>${c(D.wcOther)}</b> — typically inventory build-up, customers paying more slowly (receivables rising) or suppliers being paid faster. Check whether this is growth-related (temporary) or a collection problem.`);
        if(fin(L.net) && L.net > 0) out.cfo.push(`Profit was positive (${c(L.net)}) but did not turn into cash — a classic earnings-quality warning: revenue booked but not collected, or cash stuck in stock.`);
      }
      if(fin(D.conv)) out.cfo.push(`Cash conversion (CFO ÷ net income) is <b>${D.conv.toFixed(2)}×</b>${D.conv>=1.1?' — profits are well backed by cash.':D.conv>=0.8?' — broadly in line with profit.':D.conv>0?' — profit is running ahead of cash; earnings quality deserves a closer look.':' — cash flow and profit point in opposite directions.'}`);
      const cfoH = H.cfo.filter(fin);
      if(cfoH.length >= 3){ const neg = H.cfo.slice(0,5).filter(v=>fin(v)&&v<0).length; out.cfo.push(neg ? `Operating cash flow was negative in ${neg} of the last ${Math.min(5,cfoH.length)} years.` : `Operating cash flow has been positive in each of the last ${Math.min(5,cfoH.length)} years${fin(H.cfo[0])&&fin(H.cfo[Math.min(4,cfoH.length-1)])?`, moving from ${c(H.cfo[Math.min(4,cfoH.length-1)])} to ${c(H.cfo[0])}`:''}.`); }
    }
    // ---- investing cash flow
    if(fin(L.cfi)){
      if(L.cfi < 0){
        out.cfi.push(`<b>Investing cash flow was negative at ${c(L.cfi)}</b> — the company spent cash on its future. This is normal for a healthy firm.`);
        if(fin(L.capex)) out.cfi.push(`Capital expenditure (new plant, equipment, technology) used <b>${c(Math.abs(L.capex))}</b>${fin(D.capexSales)?` (${(D.capexSales*100).toFixed(1)}% of revenue`:''}${fin(D.capexInt)?`, ${(D.capexInt*100).toFixed(0)}% of operating cash)`:fin(D.capexSales)?')':''}.`);
        if(fin(D.cfiOther)) out.cfi.push(D.cfiOther < 0 ? `A further <b>${c(D.cfiOther)}</b> went into acquisitions, investments or securities purchases.` : `This was partly offset by <b>${c(D.cfiOther)}</b> of inflows from selling investments, maturing securities or asset disposals.`);
      } else {
        out.cfi.push(`<b>Investing cash flow was positive at ${c(L.cfi)}</b> — the company took in more from investments than it spent.`);
        out.cfi.push(`Since capex was ${c(Math.abs(L.capex||0))}, the inflow of about ${c(D.cfiOther)} came from <b>selling or maturing investments, or disposing of assets/businesses</b>. Fine if it is cash-management (e.g. treasury securities maturing); a concern if the firm is selling productive assets to raise cash.`);
      }
    }
    // ---- financing cash flow
    if(fin(L.cff)){
      if(L.cff < 0){
        out.cff.push(`<b>Financing cash flow was negative at ${c(L.cff)}</b> — more cash was returned to shareholders and lenders than raised.`);
        const p = [];
        if(fin(L.div) && L.div < 0) p.push(`dividends of ${c(Math.abs(L.div))}`);
        if(fin(L.stockNet) && L.stockNet < 0) p.push(`net share buybacks of about ${c(Math.abs(L.stockNet))} (trailing 12 months)`);
        if(fin(D.dDebt) && D.dDebt < 0) p.push(`debt reduced by ${c(Math.abs(D.dDebt))}`);
        if(p.length) out.cff.push('Main uses: '+p.join('; ')+'.');
      } else {
        out.cff.push(`<b>Financing cash flow was positive at ${c(L.cff)}</b> — the company raised more capital than it paid out.`);
        const p = [];
        if(fin(D.dDebt) && D.dDebt > 0) p.push(`new borrowing (total debt up ${c(D.dDebt)})`);
        if(fin(L.stockNet) && L.stockNet > 0) p.push(`issuing shares (≈${c(L.stockNet)} net, trailing 12 months), which dilutes existing owners`);
        if(p.length) out.cff.push('Sources: '+p.join('; ')+'.');
        if(fin(L.cfo) && L.cfo < 0) out.cff.push('Because operating cash flow is negative, the business currently <b>depends on outside funding</b> to keep running — watch cash runway and access to credit.');
        else out.cff.push('With operating cash flow positive, the raise is likely funding expansion or acquisitions rather than survival.');
      }
      if(fin(D.dDebt) && Math.abs(D.dDebt) > 0) out.cff.push(`Total debt moved from ${c(H.debt[1])} to ${c(H.debt[0])} over the year.`);
    }
    if(fin(D.netCash)) out.cff.push(`Net change in cash from the three activities: <b>${c(D.netCash)}</b> (before FX effects).`);
    // ---- margins: why profit indicators moved
    const ch = (a,b)=> fin(a)&&fin(b) ? (a-b)*100 : null; // in percentage points
    const dG = ch(H.gm[0],H.gm[1]), dE = ch(H.em[0],H.em[1]), dN = ch(H.nm[0],H.nm[1]);
    if(fin(dG)) out.margins.push(`<b>Gross margin ${dG>=0?'expanded':'contracted'} by ${Math.abs(dG).toFixed(1)} pp</b> to ${(H.gm[0]*100).toFixed(1)}%. ${dG>=0?'Revenue grew faster than the direct cost of goods — usually pricing power, a richer product/service mix, scale purchasing or lower input costs.':'Cost of goods grew faster than sales — typically input-cost inflation, discounting/price competition, a shift to lower-margin products, or under-used capacity.'}`);
    if(fin(dE) && fin(dG)){ const opex = dE - dG; out.margins.push(`<b>EBITDA margin ${dE>=0?'rose':'fell'} ${Math.abs(dE).toFixed(1)} pp.</b> Stripping out the gross-margin effect, operating expenses (selling, admin, R&D) ${opex>=0?`<b>improved</b> margin by ${opex.toFixed(1)} pp — overheads grew slower than revenue (operating leverage).`:`<b>cost</b> ${Math.abs(opex).toFixed(1)} pp — overheads grew faster than revenue (investment in growth, wage inflation, marketing, or falling sales against fixed costs).`}`); }
    if(fin(dN) && fin(dE)){ const below = dN - dE; out.margins.push(`<b>Net margin ${dN>=0?'rose':'fell'} ${Math.abs(dN).toFixed(1)} pp.</b> Items below EBITDA (depreciation, interest, tax, one-offs) ${Math.abs(below)<0.3?'had little net effect.':below>0?`helped by ${below.toFixed(1)} pp — e.g. lower interest cost, a lower tax rate or a one-time gain.`:`hurt by ${Math.abs(below).toFixed(1)} pp — e.g. higher depreciation from past investment, higher interest on debt, a higher tax rate or one-time charges.`}`); }
    if(fin(D.opLev)) out.margins.push(`Operating leverage this year: EBITDA ${pctS(R.gEbitda)} on revenue ${pctS(R.gRev)} = <b>${D.opLev.toFixed(2)}×</b>. ${D.opLev>1?'Profits are growing faster than sales.':D.opLev>=0?'Profits are growing slower than sales — costs are catching up.':'Profit and revenue moved in opposite directions.'}`);
    const gm5 = H.gm.slice(0,5).filter(fin); if(gm5.length>=3){ const mx=Math.max(...gm5)*100, mn=Math.min(...gm5)*100; out.margins.push(`Gross-margin range over ${gm5.length} years: ${mn.toFixed(1)}%–${mx.toFixed(1)}% (${mx-mn<4?'very stable — a sign of a durable competitive position':'volatile — sensitive to costs, pricing or cycle'}).`); }
    // ---- growth
    if(fin(R.gRev)) out.growth.push(`Revenue ${R.gRev>=0?'grew':'declined'} <b>${pctS(R.gRev)}</b> in ${yr}${fin(D.revCagr)?`; ${D.nYears}-year CAGR ${pctS(D.revCagr)}`:''}.`);
    if(fin(R.gNet)) out.growth.push(`Net income ${R.gNet>=0?'rose':'fell'} <b>${pctS(R.gNet)}</b>${fin(R.gEps)?`, diluted EPS ${pctS(R.gEps)}`:''}${fin(R.gNet)&&fin(R.gEps)&&R.gEps-R.gNet>2?' — EPS grew faster than profit, the effect of buybacks reducing the share count.':fin(R.gNet)&&fin(R.gEps)&&R.gNet-R.gEps>2?' — EPS grew slower than profit, meaning new shares diluted owners.':'.'}`);
    if(fin(R.gFcf)) out.growth.push(`Free cash flow ${R.gFcf>=0?'rose':'fell'} ${pctS(R.gFcf)}.`);
    // ---- quarterly momentum
    const q = m.Q; if(q.revenue.filter(fin).length >= 5){ const yoy = (q.revenue[0]/q.revenue[4]-1)*100, qoq=(q.revenue[0]/q.revenue[1]-1)*100; out.quarter.push(`Latest quarter revenue ${c(q.revenue[0])}: ${pctS(yoy)} vs the same quarter last year, ${pctS(qoq)} vs the previous quarter (QoQ is affected by seasonality).`); if(fin(q.net[0])&&fin(q.net[4])&&q.net[4]!==0) out.quarter.push(`Latest quarter net income ${c(q.net[0])} (${pctS((q.net[0]/Math.abs(q.net[4])-Math.sign(q.net[4]))*100)} YoY).`); }
    // ---- balance sheet
    if(fin(R.cur)) out.balance.push(`Liquidity: current ratio <b>${R.cur.toFixed(2)}×</b>, quick ratio ${xS(R.quick)} — ${R.cur>=1.5?'comfortable short-term cover.':R.cur>=1?'adequate; short-term obligations are covered but not by a wide margin.':'current liabilities exceed current assets; the company relies on ongoing cash generation or credit lines to meet near-term bills.'}`);
    if(fin(L.netDebt)) out.balance.push(L.netDebt <= 0 ? `The company holds <b>net cash of ${c(Math.abs(L.netDebt))}</b> (cash exceeds debt) — a strong defensive position.` : `Net debt is <b>${c(L.netDebt)}</b>${fin(R.ndEbitda)?` = ${R.ndEbitda.toFixed(2)}× EBITDA (${R.ndEbitda<1?'low':R.ndEbitda<3?'moderate':'high'} leverage)`:''}.`);
    if(fin(R.de)) out.balance.push(`Debt-to-equity ${xS(R.de)}${fin(R.icov)?`; interest cover ${xS(R.icov,1)}`:''}.${fin(L.eq)&&L.eq<0?' <b>Shareholders\' equity is negative</b> — often the result of large buybacks or accumulated losses; ratios that divide by equity become meaningless.':''}`);
    if(fin(D.gwAssets) && D.gwAssets > 0.05 && D.gwAssets <= 1) out.balance.push(`Goodwill is ${(D.gwAssets*100).toFixed(0)}% of total assets — the legacy of acquisitions; an impairment would hit equity.`);
    // ---- returns & DuPont
    if(fin(R.roe) && fin(R.nm) && fin(R.at) && fin(D.eqMult)) out.returns.push(`DuPont: ROE ${pctP(R.roe)} ≈ net margin ${pctP(R.nm)} × asset turnover ${xS(R.at)} × equity multiplier ${xS(D.eqMult)}. ${D.eqMult>4?'Leverage (the equity multiplier) is a large contributor — ROE is flattered by the thin equity base.':R.nm>15?'Driven mainly by high profitability.':R.at>1.2?'Driven mainly by efficient use of assets.':'A balanced mix of margin, turnover and leverage.'}`);
    if(fin(R.roic)) out.returns.push(`ROIC of ${pctP(R.roic)} ${R.roic>12?'comfortably exceeds a typical 8–10% cost of capital — the business creates value as it grows.':R.roic>8?'is around the cost of capital — growth adds little value.':'is below a typical cost of capital — growth at these returns destroys value.'}`);
    return out;
  }
  function lifecycle(signs){
    // Dickinson (2011), The Accounting Review — firm life-cycle from the signs of (CFO, CFI, CFF)
    const map = {'−−+':['Introduction','Start-up stage: losing cash on operations, investing heavily and funded by investors/lenders.'],
      '+−+':['Growth','Profitable operations, still investing heavily, and raising outside money to grow faster.'],
      '+−−':['Mature','Operations fund all investment and the surplus is returned to shareholders and lenders.'],
      '−−−':['Shake-out','Mixed signals typical of a transition — operations, investment and financing all drain cash.'],
      '+++':['Shake-out','Cash coming in from every activity — often a restructuring or asset-sale phase.'],
      '++−':['Shake-out','Operations and asset sales funding repayments — repositioning the business.'],
      '−+−':['Decline','Selling assets to repay obligations while operations lose cash.'],
      '−++':['Decline','Selling assets and raising money to cover operating losses.']};
    return map[signs] || ['Unclassified','Cash-flow signs not available.'];
  }
  function flags(m){
    const {L,R,D,H} = m, red = [], green = [];
    if(fin(L.cfo) && L.cfo<0) red.push('Negative operating cash flow');
    if(fin(D.conv) && fin(L.net) && L.net>0 && D.conv<0.8) red.push(`Weak cash conversion (${D.conv.toFixed(2)}× net income)`);
    if(fin(D.accrual) && D.accrual>10) red.push(`High accruals (${D.accrual.toFixed(1)}% of assets)`);
    if(fin(R.cur) && R.cur<1) red.push(`Current ratio below 1 (${R.cur.toFixed(2)}×)`);
    if(fin(R.ndEbitda) && R.ndEbitda>3) red.push(`High leverage: net debt ${R.ndEbitda.toFixed(1)}× EBITDA`);
    if(fin(R.icov) && R.icov<3) red.push(`Thin interest cover (${R.icov.toFixed(1)}×)`);
    if(fin(R.altman) && R.altman<1.81) red.push(`Altman Z in distress zone (${R.altman.toFixed(2)})`);
    if(fin(R.zmij) && R.zmij>0) red.push(`Zmijewski score signals distress risk (${R.zmij.toFixed(2)})`);
    if(fin(R.pio) && R.pio<=3) red.push(`Low Piotroski F-score (${R.pio}/9)`);
    if(fin(R.gRev) && R.gRev<0) red.push(`Revenue declining (${pctS(R.gRev)})`);
    if(fin(H.gm[0])&&fin(H.gm[1]) && (H.gm[0]-H.gm[1])*100 < -2) red.push('Gross margin compression > 2 pp');
    if(fin(L.fcf) && L.fcf<0) red.push('Negative free cash flow');
    if(fin(L.eq) && L.eq<0) red.push('Negative shareholders\' equity');
    if(fin(L.stockNet) && L.stockNet>0) red.push('Net share issuance (dilution)');
    if(fin(D.gwAssets) && D.gwAssets>0.3 && D.gwAssets<=1) red.push(`Goodwill ${(D.gwAssets*100).toFixed(0)}% of assets`);
    if(fin(D.dso) && D.dso>90) red.push(`Slow collections (DSO ${D.dso.toFixed(0)} days)`);
    if(fin(D.conv) && D.conv>=1.1) green.push(`Strong cash conversion (${D.conv.toFixed(2)}×)`);
    if(fin(R.roic) && R.roic>15) green.push(`High ROIC (${R.roic.toFixed(1)}%)`);
    if(fin(L.netDebt) && L.netDebt<0) green.push('Net cash balance sheet');
    else if(fin(R.ndEbitda) && R.ndEbitda<1) green.push(`Low leverage (${R.ndEbitda.toFixed(2)}× EBITDA)`);
    if(fin(R.pio) && R.pio>=7) green.push(`Strong Piotroski F-score (${R.pio}/9)`);
    if(fin(D.revCagr) && D.revCagr>10) green.push(`Double-digit revenue CAGR (${D.revCagr.toFixed(1)}%)`);
    if(fin(R.gm) && R.gm>50) green.push(`High gross margin (${R.gm.toFixed(1)}%) — pricing power`);
    if(fin(D.opLev) && D.opLev>1.2 && R.gRev>0) green.push('Positive operating leverage');
    if(fin(L.fcf) && L.fcf>0 && fin(R.fm) && R.fm>15) green.push(`FCF margin ${R.fm.toFixed(1)}%`);
    if(fin(L.stockNet) && L.stockNet<0) green.push('Shareholder returns via buybacks');
    if(fin(R.icov) && R.icov>15) green.push(`Very safe interest cover (${R.icov.toFixed(0)}×)`);
    return {red, green};
  }
  function verdict(m, F){
    // transparent scorecard: each pillar 0–100 from the metric tones; disclosed in the UI
    const ms = metrics(m), pill = {};
    ms.forEach(x=>{ if(!x.tone) return; const g = {Profitability:'Profitability',Returns:'Returns',Liquidity:'Balance sheet',Leverage:'Balance sheet',Efficiency:'Efficiency','Cash quality':'Cash quality',Growth:'Growth',Scores:'Balance sheet'}[x.group]; pill[g] = pill[g] || {g:0,n:0}; pill[g].n++; if(x.tone==='good') pill[g].g += 1; else if(x.tone==='bad') pill[g].g += 0; else pill[g].g += 0.5; });
    Object.values(pill).forEach(p=>p.score = Math.round(p.g/p.n*100));
    const list = Object.entries(pill).map(([k,v])=>({k, score:v.score, n:v.n}));
    const overall = list.length ? Math.round(list.reduce((a,b)=>a+b.score,0)/list.length) : null;
    const label = overall==null ? '—' : overall>=75 ? 'Financially strong' : overall>=58 ? 'Sound' : overall>=42 ? 'Mixed' : overall>=25 ? 'Weak' : 'Stressed';
    return {pillars:list, overall, label};
  }
  function summary(m){
    const n = narrate(m), F = flags(m), V = verdict(m, F), lc = lifecycle(m.D.signs), {R,D,L} = m, c=v=>fmtAmtCcy(v,m.ccy);
    const s = [];
    s.push(`${escapeHtml(m.name)} ${fin(L.revenue)?`generated revenue of ${c(L.revenue)}`:''}${fin(R.gRev)?` (${pctS(R.gRev)} YoY)`:''}${fin(R.nm)?` at a ${pctP(R.nm)} net margin`:''}${fin(L.fcf)?`, converting into ${c(L.fcf)} of free cash flow`:''}.`);
    s.push(`Its cash-flow pattern (CFO ${m.D.signs[0]}, CFI ${m.D.signs[1]}, CFF ${m.D.signs[2]}) places it in the <b>${lc[0]}</b> stage of the corporate life cycle (Dickinson 2011).`);
    if(F.green.length) s.push(`Key strengths: ${F.green.slice(0,4).join('; ').toLowerCase()}.`);
    if(F.red.length) s.push(`Key concerns: ${F.red.slice(0,4).join('; ').toLowerCase()}.`); else s.push('No major red flags were triggered by the screening rules.');
    s.push(`Overall financial-health score: <b>${V.overall ?? '—'}/100 — ${V.label}</b>.`);
    return {html:s.join(' '), text:s.join(' ').replace(/<[^>]+>/g,''), lc, F, V, n};
  }

  /* ------------------------------------ UI ------------------------------------ */
  let tok = 0;
  const charts = [];
  async function render(ticker){
    const el = document.getElementById('panel-analysis'); if(!el) return;
    const my = ++tok;
    const sec = SECURITIES.find(x=>x.t===ticker) || {};
    if(['FX','Crypto','Commodity','Index','Rates','Bond'].includes(sec.cls) || sec._kuvera){ el.innerHTML = `<div class="notebox">Financial-statement analysis applies to listed companies. ${escapeHtml(ticker)} is ${escapeHtml(sec.cls||'not a company')} — use the Technicals, Quant and Risk tabs instead.</div>`; return; }
    el.innerHTML = `<div class="qx-skel" style="height:90px;margin-bottom:12px"></div><div class="grid grid-3">${'<div class="qx-skel" style="height:220px"></div>'.repeat(3)}</div>`;
    let m; try{ m = await fetchData(ticker); }catch(e){ if(my!==tok) return; el.innerHTML = `<div class="notebox">Statement data unavailable for ${escapeHtml(ticker)}: ${escapeHtml(e.message)}. Nothing is estimated in its place.</div>`; return; }
    if(my!==tok) return;
    cache[ticker] = m;
    const S = summary(m), ms = metrics(m), c = v=>fmtAmtCcy(v, m.ccy), {L,D,H} = m;
    const groups = [...new Set(ms.map(x=>x.group))];
    const tone = t => t==='good'?'qxa-good':t==='bad'?'qxa-bad':'';
    const para = arr => arr.length ? arr.map(p=>`<p>${p}</p>`).join('') : '<p class="qxa-dim">Not enough reported data for this section.</p>';
    const ring = v => { const r=34, C=2*Math.PI*r, f = v==null?0:v/100; const col = v>=58?'var(--up)':v>=42?'var(--amber)':'var(--down)'; return `<svg width="84" height="84" viewBox="0 0 84 84"><circle cx="42" cy="42" r="${r}" fill="none" stroke="var(--line)" stroke-width="8"/><circle cx="42" cy="42" r="${r}" fill="none" stroke="${col}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${C*f} ${C}" transform="rotate(-90 42 42)" class="qxa-ring"/><text x="42" y="47" text-anchor="middle" style="font:700 19px var(--mono);fill:var(--text-0)">${v??'—'}</text></svg>`; };
    const n = Math.min(5, H.years.filter(Boolean).length), idx = [...Array(n).keys()].reverse();
    const yrs = idx.map(i=>'FY'+H.years[i]);
    const statRow = (label, arr, opt={}) => { const cells = idx.map(i=>{ const v=arr[i]; if(!fin(v)) return '—'; if(opt.pct) return (v*100).toFixed(1)+'%'; if(opt.raw) return v.toFixed(2); const cs = opt.cs && fin(H.revenue[i]) && H.revenue[i] ? `<span class="qxa-cs">${(v/H.revenue[i]*100).toFixed(1)}%</span>` : ''; const prev = arr[i+1]; const yo = opt.yoy!==false && fin(prev) && prev!==0 ? `<span class="qxa-yoy ${v>=prev?'up':'down'}">${pctS((v/Math.abs(prev)-Math.sign(prev))*100,0)}</span>` : ''; return c(v)+yo+cs; }); return [label, ...cells]; };
    el.innerHTML = `
      <div class="card qxa-hero">
        <div class="qxa-ring-wrap">${ring(S.V.overall)}<div><div class="qxa-verdict">${S.V.label}</div><div class="qxa-dim">Financial-health score</div></div></div>
        <div class="qxa-summary"><h3>Analyst summary <span class="badge fact">AUTO · LIVE DATA</span></h3><p>${S.html}</p>
          <div class="qxa-pillars">${S.V.pillars.map(p=>`<div class="qxa-pill"><span>${p.k}</span><div class="qxa-bar"><i style="width:${p.score}%;background:${p.score>=58?'var(--up)':p.score>=42?'var(--amber)':'var(--down)'}"></i></div><b>${p.score}</b></div>`).join('')}</div>
          <div class="qxa-dim" style="margin-top:6px">Score = share of the ${ms.filter(x=>x.tone).length} rated ratios below that pass their benchmark (good = 1, neutral = ½, weak = 0), averaged across pillars. A screening aid, not a recommendation.</div>
        </div>
        <div class="qxa-life"><div class="qxa-dim">Life-cycle stage</div><div class="qxa-stage">${S.lc[0]}</div><div class="qxa-signs">${['CFO','CFI','CFF'].map((k,i)=>`<span class="${m.D.signs[i]==='+'?'up':'down'}">${k} ${m.D.signs[i]}</span>`).join('')}</div><div class="qxa-dim" style="font-size:11.5px">${S.lc[1]}</div></div>
      </div>
      <div class="grid grid-2" style="margin-top:12px">
        <div class="card"><h3>Red flags <span class="badge ${S.F.red.length?'assume':'fact'}">${S.F.red.length}</span></h3>${S.F.red.length?`<ul class="qxa-list bad">${S.F.red.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul>`:'<div class="qxa-dim">None triggered.</div>'}</div>
        <div class="card"><h3>Strengths <span class="badge fact">${S.F.green.length}</span></h3>${S.F.green.length?`<ul class="qxa-list good">${S.F.green.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul>`:'<div class="qxa-dim">None triggered.</div>'}</div>
      </div>
      <div class="card" style="margin-top:12px"><h3>Cash-flow analysis — why each cash flow is positive or negative</h3>
        <div class="grid grid-3 qxa-cf">
          <div class="qxa-cfbox ${fin(L.cfo)&&L.cfo<0?'neg':'pos'}"><div class="qxa-cfh">Operating (CFO)<b>${c(L.cfo)}</b></div>${para(S.n.cfo)}</div>
          <div class="qxa-cfbox ${fin(L.cfi)&&L.cfi<0?'neg':'pos'}"><div class="qxa-cfh">Investing (CFI)<b>${c(L.cfi)}</b></div>${para(S.n.cfi)}</div>
          <div class="qxa-cfbox ${fin(L.cff)&&L.cff<0?'neg':'pos'}"><div class="qxa-cfh">Financing (CFF)<b>${c(L.cff)}</b></div>${para(S.n.cff)}</div>
        </div>
        <div class="qxa-chartbox"><canvas id="qxaWaterfall"></canvas></div>
        <div class="qxa-dim">Cash bridge for FY${H.years[0]||''}. Reported: net income, CFO, CFI, CFF, capex, dividends. Derived: D&A = EBITDA − EBIT; working capital & other = CFO − net income − D&A; other investing = CFI − capex; Δdebt from the total-debt history; other financing = CFF − dividends − Δdebt.</div>
      </div>
      <div class="grid grid-2" style="margin-top:12px">
        <div class="card"><h3>Profitability — why margins moved</h3>${para(S.n.margins)}<div class="qxa-chartbox sm"><canvas id="qxaMargins"></canvas></div></div>
        <div class="card"><h3>Growth & momentum</h3>${para(S.n.growth.concat(S.n.quarter))}<div class="qxa-chartbox sm"><canvas id="qxaGrowth"></canvas></div></div>
        <div class="card"><h3>Balance sheet & solvency</h3>${para(S.n.balance)}</div>
        <div class="card"><h3>Returns & DuPont</h3>${para(S.n.returns)}<div class="qxa-chartbox sm"><canvas id="qxaCash"></canvas></div></div>
      </div>
      <div class="card" style="margin-top:12px"><h3>Formula library — every ratio, its formula and the inputs used <span class="qxa-dim" style="font-weight:400">click a row for the explanation</span></h3>
        <div class="qxa-tabs">${groups.map((g,i)=>`<button class="chip ${i===0?'active':''}" data-qxag="${g}">${g}</button>`).join('')}<button class="chip" data-qxag="*">All</button></div>
        <div style="overflow-x:auto"><table class="datatable qxa-ftable"><thead><tr><th>Metric</th><th>Formula</th><th>Inputs</th><th style="text-align:right">Value</th><th>Read</th></tr></thead><tbody>
        ${ms.map(x=>`<tr data-g="${x.group}" class="qxa-frow" style="${x.group===groups[0]?'':'display:none'}"><td>${x.name}</td><td class="qxa-formula">${x.formula}</td><td class="qxa-dim">${x.inputs}</td><td style="text-align:right" class="${tone(x.tone)}"><b>${x.text}</b></td><td>${x.tone==='good'?'<span class="badge fact">STRONG</span>':x.tone==='bad'?'<span class="badge assume">WEAK</span>':x.value==null?'<span class="qxa-dim">n/a</span>':'<span class="qxa-dim">neutral</span>'}</td></tr><tr class="qxa-explain" style="display:none"><td colspan="5">${x.explain}</td></tr>`).join('')}
        </tbody></table></div>
      </div>
      <div class="card" style="margin-top:12px"><h3>Reported statements (annual) <span class="badge fact">LIVE</span></h3>
        <div class="qxa-tabs"><button class="chip active" data-qxacs="0">Values + YoY</button><button class="chip" data-qxacs="1">Common-size (% of revenue)</button></div>
        <div id="qxaStmt">${table(['', ...yrs], [statRow('Revenue',H.revenue), statRow('Gross profit',H.gross,{cs:1}), statRow('EBITDA',H.ebitda,{cs:1}), statRow('Net income',H.net,{cs:1}),
          statRow('Operating cash flow (FCF + capex)',H.cfo,{cs:1}), statRow('Capital expenditure',H.capex,{cs:1}), statRow('Free cash flow',H.fcf,{cs:1}),
          statRow('Total assets',H.assets), statRow('Total debt',H.debt), statRow('EPS (diluted)',H.eps,{raw:1,yoy:false}), statRow('Dividend / share',H.dps,{raw:1,yoy:false}),
          statRow('Gross margin',H.gm,{pct:1}), statRow('EBITDA margin',H.em,{pct:1}), statRow('Net margin',H.nm,{pct:1}), statRow('Cash conversion (CFO/NI)',H.conv,{raw:1,yoy:false})].filter(r=>r.slice(1).some(v=>v!=='—')))}</div>
        <div class="qxa-dim" style="margin-top:6px">Reported in ${escapeHtml(m.ccy)} · source: TradingView fundamentals (company filings) · fetched ${m.fetched.toLocaleString()} · operating cash flow history = free cash flow + capex (exact identity; verified against the reported latest-year figure).</div>
      </div>
      <div class="card" style="margin-top:12px"><h3>Peer comparison <span class="badge fact">LIVE</span></h3><div id="qxaPeers"></div></div>
      <div class="card" style="margin-top:12px"><h3>Exact line items & quarterly cash flows ${QXLI.available()?'<span class="badge fact">YOUR KEY</span>':'<span class="badge">OPTIONAL KEY</span>'}</h3><div id="qxaLI"></div></div>
      <div class="card" style="margin-top:12px"><h3>Your connected APIs</h3><div id="qxaCustom"></div></div>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="btn" id="qxaAiBtn">Ask AI to explain this analysis</button><button class="btn ghost" id="qxaReportBtn">Build full company report →</button><button class="btn ghost" id="qxaCsv">Download ratios (CSV)</button></div>`;
    // interactions
    el.querySelectorAll('[data-qxag]').forEach(b=>b.addEventListener('click',()=>{ el.querySelectorAll('[data-qxag]').forEach(x=>x.classList.toggle('active',x===b)); const g=b.dataset.qxag; el.querySelectorAll('.qxa-frow').forEach(r=>{ r.style.display = g==='*'||r.dataset.g===g ? '' : 'none'; r.nextElementSibling.style.display='none'; }); }));
    el.querySelectorAll('.qxa-frow').forEach(r=>r.addEventListener('click',()=>{ const e=r.nextElementSibling; e.style.display = e.style.display==='none' ? '' : 'none'; }));
    el.querySelectorAll('[data-qxacs]').forEach(b=>b.addEventListener('click',()=>{ el.querySelectorAll('[data-qxacs]').forEach(x=>x.classList.toggle('active',x===b)); el.querySelector('#qxaStmt').classList.toggle('cs', b.dataset.qxacs==='1'); }));
    el.querySelector('#qxaAiBtn').addEventListener('click',()=>{ if((typeof QXAI!=='undefined')) QXAI.runTool('explain', ticker); });
    el.querySelector('#qxaReportBtn').addEventListener('click',()=>{ goto('reports'); setTimeout(()=>{ const s=document.getElementById('repSec'); if(s){ s.value=ticker; } if((typeof QXR!=='undefined')) QXR.build(ticker); },60); });
    el.querySelector('#qxaCsv').addEventListener('click',()=>{ const rows=[['Group','Metric','Formula','Inputs','Value','Assessment']].concat(ms.map(x=>[x.group,x.name,x.formula,x.inputs.replace(/<[^>]+>/g,''),x.value==null?'':x.value,x.tone||'neutral'])); downloadText(rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n'), `${ticker}_ratio_analysis.csv`, 'text/csv'); });
    drawCharts(m);
    QXP.render(el.querySelector('#qxaPeers'), ticker);
    QXCUSTOM.renderCard(el.querySelector('#qxaCustom'), ticker, 'equity');
    renderLineItems(el.querySelector('#qxaLI'), ticker, m);
  }
  /* Exact statement lines from the user's FMP / Alpha Vantage / Finnhub key (modules: data/providers/line-items.js).
     Adds what the keyless totals cannot: interest & tax burden (5-step DuPont), DSO/DIO/DPO and the cash-conversion
     cycle, SBC, buybacks, and discrete quarterly cash flows. */
  async function renderLineItems(box, ticker, m){
    if(!box) return;
    if(!QXLI.available()){ box.innerHTML = `<div class="qxa-dim">Add a free key from <b>Financial Modeling Prep</b>, <b>Alpha Vantage</b> or <b>Finnhub</b> in Settings → Data providers to unlock exact line items (interest, tax, receivables, inventory, payables, buybacks, stock-based pay), the 5-step DuPont, the cash-conversion cycle and quarterly cash flows. Without a key the analysis above uses reported totals and clearly labelled derivations.</div>`; return; }
    box.innerHTML = '<div class="qx-skel" style="height:120px"></div>';
    try{
      const li = await QXLI.get(ticker); m.LI = li; const a = li.annual[0] || {}, c = v=>fmtAmtCcy(v, li.ccy || m.ccy), f = v=>typeof v==='number'&&isFinite(v);
      const rows = [];
      if(f(a.netIncome)&&f(a.pretax)&&f(a.ebit)&&f(a.revenue)&&f(a.totalAssets)&&f(a.equity)) rows.push(['5-step DuPont ROE', `${(a.netIncome/a.pretax).toFixed(2)} tax burden × ${(a.pretax/a.ebit).toFixed(2)} interest burden × ${(a.ebit/a.revenue*100).toFixed(1)}% EBIT margin × ${(a.revenue/a.totalAssets).toFixed(2)} turnover × ${(a.totalAssets/a.equity).toFixed(2)} leverage = ${(a.netIncome/a.equity*100).toFixed(1)}%`]);
      if(f(a.tax)&&f(a.pretax)&&a.pretax) rows.push(['Effective tax rate', (a.tax/a.pretax*100).toFixed(1)+'%']);
      if(f(a.ebit)&&f(a.interest)&&a.interest) rows.push(['Interest cover (EBIT / interest)', (a.ebit/Math.abs(a.interest)).toFixed(1)+'×']);
      const dso = f(a.receivables)&&f(a.revenue) ? 365*a.receivables/a.revenue : null, dio = f(a.inventory)&&f(a.cogs)&&a.cogs ? 365*a.inventory/a.cogs : null, dpo = f(a.payables)&&f(a.cogs)&&a.cogs ? 365*a.payables/a.cogs : null;
      if(dso!=null) rows.push(['Cash-conversion cycle', `DSO ${dso.toFixed(0)} + DIO ${dio!=null?dio.toFixed(0):'—'} − DPO ${dpo!=null?dpo.toFixed(0):'—'} = ${dio!=null&&dpo!=null?(dso+dio-dpo).toFixed(0)+' days':'—'}`]);
      if(f(a.sbc)&&f(a.revenue)) rows.push(['Stock-based compensation', `${c(a.sbc)} (${(a.sbc/a.revenue*100).toFixed(1)}% of revenue)`]);
      if(f(a.buybacks)) rows.push(['Share buybacks (exact)', c(a.buybacks)]);
      if(f(a.da)&&f(a.capex)) rows.push(['Capex / D&A', (Math.abs(a.capex)/a.da).toFixed(2)+'× — '+(Math.abs(a.capex)>a.da?'investing beyond maintenance':'below depreciation (under-investing or asset-light)')]);
      const Q = (li.quarterly||[]).slice(0,8).reverse();
      box.innerHTML = kv(rows.map(r=>[escapeHtml(r[0]), escapeHtml(r[1])])) + (Q.length ? table(['Quarter', ...Q.map(q=>escapeHtml(q.end))], [['Revenue', ...Q.map(q=>c(q.revenue))], ['Net income', ...Q.map(q=>c(q.netIncome))], ['Operating cash flow', ...Q.map(q=>c(q.cfo))], ['Capex', ...Q.map(q=>c(q.capex))], ['Free cash flow', ...Q.map(q=>f(q.cfo)&&f(q.capex)?c(q.cfo+q.capex):'—')], ['Dividends', ...Q.map(q=>c(q.dividends))], ['Buybacks', ...Q.map(q=>c(q.buybacks))]]) : '') + `<div class="qxa-dim" style="margin-top:6px">Source: ${escapeHtml(li.source)} · symbol ${escapeHtml(li.symbol)} · cached 24 h.</div>`;
    }catch(e){ box.innerHTML = `<div class="qxa-dim">Line items unavailable: ${escapeHtml(e.message)}</div>`; }
  }
  function downloadText(text, name, type){ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([text],{type})); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),2000); }
  function drawCharts(m){
    if(typeof Chart === 'undefined') return;
    charts.splice(0).forEach(ch=>{ try{ ch.destroy(); }catch(e){} });
    const {L,D,H} = m, up=cssVar('--up'), dn=cssVar('--down'), t1=cssVar('--text-1'), grid=cssVar('--line-soft'), amb=cssVar('--amber'), teal=cssVar('--teal');
    const fmt = v=>fmtAmtCcy(v, m.ccy);
    const base = {responsive:true, maintainAspectRatio:false, animation:{duration:700, easing:'easeOutCubic'}, plugins:{legend:{labels:{color:t1, boxWidth:10, font:{size:11}}}, tooltip:{callbacks:{}}}, scales:{x:{ticks:{color:t1}, grid:{color:grid}}, y:{ticks:{color:t1, callback:v=>fmt(v)}, grid:{color:grid}}}};
    // waterfall
    const steps = [['Net income',L.net,'abs'],['+ D&A',D.da],['± Working cap & other',D.wcOther],['= Operating CF',L.cfo,'sub'],['Capex',L.capex],['Other investing',D.cfiOther],['Dividends',L.div],['Δ Debt',D.dDebt],['Other financing',D.cffOther],['= Net change',D.netCash,'sub']].filter(s=>fin(s[1]));
    const wf = document.getElementById('qxaWaterfall');
    if(wf && steps.length>3){ let run=0; const data=[], colors=[]; steps.forEach(([l,v,k])=>{ if(k==='abs'){ data.push([0,v]); run=v; colors.push(teal); } else if(k==='sub'){ data.push([0,v]); run=v; colors.push(amb); } else { data.push([run, run+v]); run+=v; colors.push(v>=0?up:dn); } });
      charts.push(new Chart(wf, {type:'bar', data:{labels:steps.map(s=>s[0]), datasets:[{data, backgroundColor:colors, borderRadius:4, borderSkipped:false}]}, options:{...base, plugins:{legend:{display:false}, tooltip:{callbacks:{label:ctx=>{ const s=steps[ctx.dataIndex]; return s[0]+': '+fmt(s[1]); }}}}}})); }
    const n = Math.min(5, H.years.filter(Boolean).length), idx = [...Array(n).keys()].reverse(), labels = idx.map(i=>'FY'+H.years[i]);
    const mg = document.getElementById('qxaMargins');
    if(mg) charts.push(new Chart(mg, {type:'line', data:{labels, datasets:[['Gross',H.gm,teal],['EBITDA',H.em,amb],['Net',H.nm,up],['FCF',H.fm,'#60A5FA']].map(([l,a,col])=>({label:l, data:idx.map(i=>fin(a[i])?+(a[i]*100).toFixed(2):null), borderColor:col, backgroundColor:col, tension:.3, pointRadius:3}))}, options:{...base, scales:{...base.scales, y:{ticks:{color:t1, callback:v=>v+'%'}, grid:{color:grid}}}}}));
    const gr = document.getElementById('qxaGrowth');
    if(gr) charts.push(new Chart(gr, {type:'bar', data:{labels, datasets:[['Revenue',H.revenue,'rgba(45,212,191,.75)'],['Net income',H.net,'rgba(217,164,65,.85)']].map(([l,a,col])=>({label:l, data:idx.map(i=>a[i]), backgroundColor:col, borderRadius:4}))}, options:base}));
    const ca = document.getElementById('qxaCash');
    if(ca) charts.push(new Chart(ca, {type:'bar', data:{labels, datasets:[{type:'line',label:'Net income',data:idx.map(i=>H.net[i]),borderColor:amb,backgroundColor:amb,tension:.3},{label:'Operating CF',data:idx.map(i=>H.cfo[i]),backgroundColor:'rgba(62,207,142,.7)',borderRadius:4},{label:'Free CF',data:idx.map(i=>H.fcf[i]),backgroundColor:'rgba(96,165,250,.7)',borderRadius:4}]}, options:base}));
  }
  async function get(ticker){ if(cache[ticker]) return cache[ticker]; const m = await fetchData(ticker); cache[ticker]=m; return m; }
  return {render, get, metrics, narrate, flags, verdict, summary, lifecycle, fetchData};
})();
