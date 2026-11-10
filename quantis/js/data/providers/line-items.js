/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/data/providers/line-items.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Exact, line-by-line financial statements (annual + quarterly) from the user's own
 *           FREE API key: Financial Modeling Prep, Alpha Vantage or Finnhub. The keyless
 *           TradingView data used elsewhere gives totals; these providers add the individual
 *           lines (D&A, interest, tax, receivables, inventory, payables, buybacks, SBC…) that
 *           unlock 5-step DuPont, cash-conversion cycle, FCFF/FCFE and quarterly cash flows.
 * DEPENDS   getKey() (settings), cachedFetch(), fetchWithTimeout()
 * EXPOSES   QXLI.{available(), get(ticker), providers, SCHEMA}
 *
 * NORMALISED SCHEMA (every provider maps into this; null = not reported)
 *   period = { end:'YYYY-MM-DD', fy:2025, fp:'FY'|'Q1'..'Q4', ccy,
 *     revenue, cogs, grossProfit, rnd, sga, ebit, da, ebitda, interest, pretax, tax, netIncome, epsDil,
 *     cash, receivables, inventory, currentAssets, ppe, goodwill, totalAssets,
 *     payables, shortDebt, longDebt, currentLiabilities, totalLiabilities, equity, retained,
 *     cfo, capex(<0), cfi, cff, dividends(<0), buybacks(<0), debtNet, sbc, dWC }
 *   result = { source, ccy, annual:[newest→oldest], quarterly:[newest→oldest], fetched }
 *
 * PROVIDER NOTES (read before changing)
 *   • FMP "stable" API: best coverage incl. many non-US listings (e.g. RELIANCE.NS). 250 calls/day free.
 *   • Alpha Vantage: US listings; 25 calls/day free → results are cached for 24 h per symbol.
 *   • Finnhub financials-reported: SEC filings as filed (US). 10-Q cash-flow values are
 *     YEAR-TO-DATE, so quarterly cash flows are de-cumulated (Q2 = H1 − Q1 …) in finnhubPeriods().
 *   • Order of preference = order in PROVIDERS below (first one with a key and data wins).
 *   • Keys never leave the browser except to the provider itself (see docs/SECURITY.md for the
 *     server-side key proxy option in production).
 * ─────────────────────────────────────────────────────────────────────────────
 */
const QXLI = (() => {
  const num = v => { if(v==null || v==='None' || v==='') return null; const n = +v; return isFinite(n) ? n : null; };
  const neg = v => v==null ? null : -Math.abs(v);
  // All provider calls go through pfetch(): direct when the user has their own key, via the owner's key proxy otherwise.
  const pfetch = (url, opt, ms) => { const px = (safeStorage.getItem('quantis_key_keyproxy')||'').trim().replace(/\/+$/,''); return url.includes('__KEY__') && px ? fetchWithTimeout(px + '/?url=' + encodeURIComponent(url), opt, ms) : fetchWithTimeout(url, opt, ms); };
  const first = (o, ...ks) => { for(const k of ks){ const v = num(o && o[k]); if(v!=null) return v; } return null; };
  const sym = {
    // Map a Quantis/TradingView ticker to each provider's symbol format.
    fmp: t => { const tv = LD.tvSymbol(t) || ''; const [ex, s] = tv.split(':'); const suf = {NSE:'.NS', BSE:'.BO', LSE:'.L', XETR:'.DE', TSE:'.T', HKEX:'.HK', ASX:'.AX', TSX:'.TO', SIX:'.SW', EURONEXT:'.PA', KRX:'.KS'}[ex]; return s ? s + (suf||'') : t; },
    av: t => { const tv = LD.tvSymbol(t) || ''; const [ex, s] = tv.split(':'); const suf = {BSE:'.BSE', NSE:'.BSE', LSE:'.LON', TSX:'.TRT', XETR:'.DEX'}[ex]; return s ? s + (suf||'') : t; },
    fh: t => { const tv = LD.tvSymbol(t) || ''; return (tv.split(':')[1]) || t; },
  };

  /* ---------------------------------- FMP ---------------------------------- */
  async function fmp(t, key){
    const s = sym.fmp(t), base = 'https://financialmodelingprep.com/stable/';
    const get = async (ep, period) => { const r = await pfetch(`${base}${ep}?symbol=${encodeURIComponent(s)}&period=${period}&limit=${period==='annual'?6:8}&apikey=${(key==='__KEY__' ? '__KEY__' : encodeURIComponent(key))}`, {}, 15000); if(!r.ok) throw new Error('FMP HTTP '+r.status); const j = await r.json(); if(!Array.isArray(j)) throw new Error((j && (j['Error Message']||j.message)) || 'FMP: unexpected reply'); return j; };
    const build = async period => {
      const [is, bs, cf] = await Promise.all([get('income-statement', period), get('balance-sheet-statement', period), get('cash-flow-statement', period)]);
      return is.map(i => { const b = bs.find(x=>x.date===i.date) || {}, c = cf.find(x=>x.date===i.date) || {};
        return {end:i.date, fy:+(i.fiscalYear||i.calendarYear||String(i.date).slice(0,4)), fp: period==='annual' ? 'FY' : (i.period||''), ccy:i.reportedCurrency,
          revenue:first(i,'revenue'), cogs:first(i,'costOfRevenue'), grossProfit:first(i,'grossProfit'), rnd:first(i,'researchAndDevelopmentExpenses'), sga:first(i,'sellingGeneralAndAdministrativeExpenses'),
          ebit:first(i,'operatingIncome','ebit'), da:first(i,'depreciationAndAmortization') ?? first(c,'depreciationAndAmortization'), ebitda:first(i,'ebitda'), interest:first(i,'interestExpense'), pretax:first(i,'incomeBeforeTax'), tax:first(i,'incomeTaxExpense'), netIncome:first(i,'netIncome'), epsDil:first(i,'epsDiluted','epsdiluted'),
          cash:first(b,'cashAndCashEquivalents'), receivables:first(b,'netReceivables','accountsReceivables'), inventory:first(b,'inventory'), currentAssets:first(b,'totalCurrentAssets'), ppe:first(b,'propertyPlantEquipmentNet'), goodwill:first(b,'goodwill'), totalAssets:first(b,'totalAssets'),
          payables:first(b,'accountPayables','accountsPayables'), shortDebt:first(b,'shortTermDebt'), longDebt:first(b,'longTermDebt'), currentLiabilities:first(b,'totalCurrentLiabilities'), totalLiabilities:first(b,'totalLiabilities'), equity:first(b,'totalStockholdersEquity','totalEquity'), retained:first(b,'retainedEarnings'),
          cfo:first(c,'operatingCashFlow','netCashProvidedByOperatingActivities'), capex:neg(first(c,'capitalExpenditure','investmentsInPropertyPlantAndEquipment')), cfi:first(c,'netCashProvidedByInvestingActivities','netCashUsedForInvestingActivites'), cff:first(c,'netCashProvidedByFinancingActivities','netCashUsedProvidedByFinancingActivities'),
          dividends:neg(first(c,'commonDividendsPaid','dividendsPaid','netDividendsPaid')), buybacks:neg(first(c,'commonStockRepurchased')), debtNet:first(c,'netDebtIssuance','debtRepayment'), sbc:first(c,'stockBasedCompensation'), dWC:first(c,'changeInWorkingCapital')};
      });
    };
    const [annual, quarterly] = await Promise.all([build('annual'), build('quarter').catch(()=>[])]);
    if(!annual.length) throw new Error('FMP has no statements for '+s);
    return {source:'Financial Modeling Prep', symbol:s, annual, quarterly};
  }

  /* ------------------------------ Alpha Vantage ------------------------------ */
  async function av(t, key){
    const s = sym.av(t);
    const get = async fn => { const r = await pfetch(`https://www.alphavantage.co/query?function=${fn}&symbol=${encodeURIComponent(s)}&apikey=${(key==='__KEY__' ? '__KEY__' : encodeURIComponent(key))}`, {}, 20000); const j = await r.json(); if(j.Note || j.Information) throw new Error('Alpha Vantage: '+(j.Note||j.Information).slice(0,120)); if(!j.annualReports) throw new Error('Alpha Vantage has no statements for '+s); return j; };
    const is = await get('INCOME_STATEMENT'), bs = await get('BALANCE_SHEET'), cf = await get('CASH_FLOW'); // sequential: free tier rejects bursts
    const map = (I, B, C, fp) => I.map(i => { const b = B.find(x=>x.fiscalDateEnding===i.fiscalDateEnding) || {}, c = C.find(x=>x.fiscalDateEnding===i.fiscalDateEnding) || {};
      return {end:i.fiscalDateEnding, fy:+String(i.fiscalDateEnding).slice(0,4), fp, ccy:i.reportedCurrency,
        revenue:first(i,'totalRevenue'), cogs:first(i,'costOfRevenue','costofGoodsAndServicesSold'), grossProfit:first(i,'grossProfit'), rnd:first(i,'researchAndDevelopment'), sga:first(i,'sellingGeneralAndAdministrative'),
        ebit:first(i,'operatingIncome','ebit'), da:first(i,'depreciationAndAmortization') ?? first(c,'depreciationDepletionAndAmortization'), ebitda:first(i,'ebitda'), interest:first(i,'interestExpense'), pretax:first(i,'incomeBeforeTax'), tax:first(i,'incomeTaxExpense'), netIncome:first(i,'netIncome'), epsDil:null,
        cash:first(b,'cashAndCashEquivalentsAtCarryingValue'), receivables:first(b,'currentNetReceivables'), inventory:first(b,'inventory'), currentAssets:first(b,'totalCurrentAssets'), ppe:first(b,'propertyPlantEquipment'), goodwill:first(b,'goodwill'), totalAssets:first(b,'totalAssets'),
        payables:first(b,'currentAccountsPayable'), shortDebt:first(b,'shortTermDebt','currentDebt'), longDebt:first(b,'longTermDebt','longTermDebtNoncurrent'), currentLiabilities:first(b,'totalCurrentLiabilities'), totalLiabilities:first(b,'totalLiabilities'), equity:first(b,'totalShareholderEquity'), retained:first(b,'retainedEarnings'),
        cfo:first(c,'operatingCashflow'), capex:neg(first(c,'capitalExpenditures')), cfi:first(c,'cashflowFromInvestment'), cff:first(c,'cashflowFromFinancing'), dividends:neg(first(c,'dividendPayoutCommonStock','dividendPayout')), buybacks:neg(first(c,'paymentsForRepurchaseOfCommonStock')),
        debtNet:first(c,'proceedsFromIssuanceOfLongTermDebtAndCapitalSecuritiesNet'), sbc:null, dWC:null}; });
    return {source:'Alpha Vantage', symbol:s, annual: map(is.annualReports.slice(0,6), bs.annualReports||[], cf.annualReports||[], 'FY'), quarterly: map((is.quarterlyReports||[]).slice(0,8), bs.quarterlyReports||[], cf.quarterlyReports||[], 'Q')};
  }

  /* --------------------------------- Finnhub --------------------------------- */
  const FH = { // us-gaap concept → schema field (first match wins)
    revenue:['Revenues','RevenueFromContractWithCustomerExcludingAssessedTax','SalesRevenueNet'], cogs:['CostOfRevenue','CostOfGoodsAndServicesSold'], grossProfit:['GrossProfit'], rnd:['ResearchAndDevelopmentExpense'], sga:['SellingGeneralAndAdministrativeExpense'],
    ebit:['OperatingIncomeLoss'], interest:['InterestExpense'], pretax:['IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest','IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments'], tax:['IncomeTaxExpenseBenefit'], netIncome:['NetIncomeLoss'], epsDil:['EarningsPerShareDiluted'],
    cash:['CashAndCashEquivalentsAtCarryingValue'], receivables:['AccountsReceivableNetCurrent'], inventory:['InventoryNet'], currentAssets:['AssetsCurrent'], ppe:['PropertyPlantAndEquipmentNet'], goodwill:['Goodwill'], totalAssets:['Assets'],
    payables:['AccountsPayableCurrent'], shortDebt:['LongTermDebtCurrent','CommercialPaper'], longDebt:['LongTermDebtNoncurrent'], currentLiabilities:['LiabilitiesCurrent'], totalLiabilities:['Liabilities'], equity:['StockholdersEquity'], retained:['RetainedEarningsAccumulatedDeficit'],
    cfo:['NetCashProvidedByUsedInOperatingActivities'], capex:['PaymentsToAcquirePropertyPlantAndEquipment'], cfi:['NetCashProvidedByUsedInInvestingActivities'], cff:['NetCashProvidedByUsedInFinancingActivities'], dividends:['PaymentsOfDividends','PaymentsOfDividendsCommonStock'], buybacks:['PaymentsForRepurchaseOfCommonStock'], sbc:['ShareBasedCompensation','AllocatedShareBasedCompensationExpense'], da:['DepreciationDepletionAndAmortization','DepreciationAmortizationAndAccretionNet','DepreciationAndAmortization'],
  };
  const FLOW = ['revenue','cogs','grossProfit','rnd','sga','ebit','interest','pretax','tax','netIncome','cfo','capex','cfi','cff','dividends','buybacks','sbc','da'];
  function finnhubPeriods(data, quarterly){
    const out = data.map(d => { const all = [].concat(d.report?.ic||[], d.report?.bs||[], d.report?.cf||[]); const pick = arr => { for(const c of arr){ const hit = all.find(x=>x.concept==='us-gaap_'+c || x.concept===c); if(hit && num(hit.value)!=null) return num(hit.value); } return null; };
      const p = {end:String(d.endDate||'').slice(0,10), fy:d.year, fp: quarterly ? 'Q'+d.quarter : 'FY', q:d.quarter, ccy:'USD'}; Object.entries(FH).forEach(([k,arr])=>p[k]=pick(arr));
      ['capex','dividends','buybacks'].forEach(k=>p[k]=neg(p[k])); p.ebitda = p.ebit!=null && p.da!=null ? p.ebit + p.da : null; return p; });
    if(quarterly){
      // 10-Q cash-flow statements are cumulative year-to-date → convert to discrete quarters.
      const cfKeys = ['cfo','capex','cfi','cff','dividends','buybacks','sbc','da'];
      out.forEach(p => { if(p.q > 1){ const prev = out.find(x=>x.fy===p.fy && x.q===p.q-1); cfKeys.forEach(k=>{ p[k] = (p[k]!=null && prev && prev[k]!=null) ? p[k]-prev[k] : (p.q>1 ? null : p[k]); }); } });
    }
    return out.sort((a,b)=>b.end.localeCompare(a.end));
  }
  async function finnhub(t, key){
    const s = sym.fh(t);
    const get = async f => { const r = await pfetch(`https://finnhub.io/api/v1/stock/financials-reported?symbol=${encodeURIComponent(s)}&freq=${f}&token=${(key==='__KEY__' ? '__KEY__' : encodeURIComponent(key))}`, {}, 20000); if(!r.ok) throw new Error('Finnhub HTTP '+r.status); const j = await r.json(); if(!j.data || !j.data.length) throw new Error('Finnhub has no filings for '+s); return j.data; };
    const [a, q] = await Promise.all([get('annual'), get('quarterly').catch(()=>[])]);
    return {source:'Finnhub (SEC filings as reported)', symbol:s, annual: finnhubPeriods(a.slice(0,6), false), quarterly: finnhubPeriods(q.slice(0,12), true).slice(0,8)};
  }

  const PROVIDERS = [['fmp', 'Financial Modeling Prep', fmp], ['alphavantage', 'Alpha Vantage', av], ['finnhub', 'Finnhub', finnhub]];
  /* KEY PROXY (production): when the site owner deploys server/cloudflare-worker/key-proxy.js and sets its URL
     in Settings (quantis_key_keyproxy), provider keys live ONLY on the server. The browser sends the provider URL
     with the placeholder "__KEY__"; the worker swaps in the secret, so no key is ever shipped to users. */
  const proxyUrl = () => (safeStorage.getItem('quantis_key_keyproxy')||'').trim().replace(/\/+$/,'');
  const proxied = k => !getKey(k) && !!proxyUrl();
  const keyFor = k => getKey(k) || (proxyUrl() ? '__KEY__' : '');
  const available = () => PROVIDERS.some(([k]) => keyFor(k));
  async function get(ticker){
    const errs = [];
    for(const [k, label, fn] of PROVIDERS){
      const key = keyFor(k); if(!key) continue;
      try{
        const r = await cachedFetch(`qxli1_${k}_${ticker}`, 24*3600e3, () => fn(ticker, key));
        r.ccy = (r.annual[0] && r.annual[0].ccy) || null; r.fetched = r.fetched || new Date().toISOString();
        return r;
      }catch(e){ errs.push(label+': '+e.message); }
    }
    throw new Error(errs.length ? errs.join(' · ') : 'no statement API key configured (Settings → Data providers)');
  }
  return {available, get, providers: PROVIDERS.map(p=>p[0]), _finnhubPeriods: finnhubPeriods, _sym: sym};
})();
