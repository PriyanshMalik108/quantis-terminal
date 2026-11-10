/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/features/ai-assistant.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Right-rail assistant. Grounded answers first; open questions go to modules/ai.js (free AI).
 * DEPENDS   modules/ai.js (at call time)
 * EXPOSES   sendAi, llmAnswer, groundedAnswer (global — classic script, shared scope)
 * LOAD      Classic <script>, order defined in js/manifest.json. Top-level code runs at load,
 *           so it may only call functions from files listed EARLIER in the manifest.
 * NOTE      Migrated verbatim from the single-file build; inline comments marked
 *           "REAL BUG FIXED" / "post-launch fix" document past defects — keep them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* ===================== AI RESEARCH ASSISTANT (Phase 6, spec sections 33-36) =====================
   Two tiers, matching the spec's "AI must never be a hard dependency" requirement:
   1. Grounded Assistant (default, zero setup, always works) - pattern-matches the question against
      a fixed set of recognized intents and answers ONLY from real numbers already sitting in
      AppState (computed by the real engines from Phases 3-5). It cannot fabricate because it never
      generates free text from a language model - every number in its answer traces to a specific
      AppState field, and any field that's null is reported as "data unavailable", not guessed.
   2. Optional Bring-Your-Own-Key LLM - Anthropic's API genuinely supports direct browser calls via
      the documented 'anthropic-dangerous-direct-browser-access' header (verified, not assumed); if
      the user supplies their own key in Settings, questions are answered by a real model instead,
      given the SAME AppState JSON as its only permitted source of security-specific facts, with an
      explicit instruction to say "data unavailable" rather than invent anything not in that context. */
function aiPush(text, who, tag){
  const log = document.getElementById('aiLog');
  const div = document.createElement('div'); div.className = 'aimsg'+(who==='user'?' user':'');
  // Every caller passes either the user's own raw typed input or generated plain text (never
  // deliberately-constructed HTML) — escaped here at the single choke point so a ticker,
  // question, or model response containing "<"/"&" can't break the chat log or, in the case of
  // user-typed input, self-XSS the page.
  div.innerHTML = (tag ? `<span class="badge ${tag==='FACT'?'fact':tag==='MODEL'?'model':'assume'}" style="margin-right:6px;">${tag}</span>` : '') + escapeHtml(text).replace(/\n/g,'<br>');
  log.appendChild(div); log.scrollTop = log.scrollHeight;
}
function fmtPct(v, digits=1){ return v==null ? 'data unavailable' : (v>=0?'+':'')+v.toFixed(digits)+'%'; }
function fmtNum(v, digits=2){ return v==null ? 'data unavailable' : v.toFixed(digits); }

const AI_INTENTS = [
  { test: /valuation|expensive|cheap|overvalued|undervalued|fair value|dcf/i,
    answer: ()=>{
      const d = AppState.dcf;
      if(!d) return {text:"I don't have a DCF computed for this security yet - open the Valuation tab to run one, then ask again.", tag:'UNCERTAIN'};
      const verdict = d.upsidePct==null ? '' : d.upsidePct>=15 ? 'This suggests the market price may be undervaluing it relative to this model.' : d.upsidePct<=-15 ? 'This suggests the market price may be running ahead of what the DCF supports - i.e. richly valued.' : "That's within a modest range either side of the model's estimate - not a strong signal alone.";
      return {text:`DCF base-case fair value for ${d.ticker}: ${fmtPrice(d.fairValueBase, d.ccy)} vs current price ${fmtPrice(d.currentPrice, d.ccy)} (${fmtPct(d.upsidePct)}).\nBear case: ${fmtPrice(d.fairValueBear, d.ccy)} \u00b7 Bull case: ${fmtPrice(d.fairValueBull, d.ccy)}.\n${verdict}\nThis is one model with explicit assumptions (WACC ${d.inputs.wacc}%, growth ${d.inputs.growth}%, terminal growth ${d.inputs.terminal}%) you set in the Valuation tab - not a market consensus.`, tag:'MODEL'};
    }},
  { test: /risk|var\b|value at risk|drawdown|volatile|volatility/i,
    answer: ()=>{
      const r = AppState.risk;
      if(!r) return {text:"No risk metrics computed yet for this security - open the Risk tab first.", tag:'UNCERTAIN'};
      return {text:`For ${r.ticker}: historical 1-day VaR (95%) is ${fmtPct(r.varHist*100)}, CVaR ${fmtPct(r.cvarHist*100)}, max drawdown over the loaded history is ${fmtPct(r.maxDrawdownPct)}. Annualized volatility \u2248 ${fmtPct(r.annualVolPct)}. Sharpe ${fmtNum(r.sharpe)}, Sortino ${fmtNum(r.sortino)}.\nThese are computed from ${r.isLive?'live':'sample'} daily returns - a real empirical calculation, not a lookup.`, tag:'FACT'};
    }},
  { test: /forecast|predict|outlook|20.?day|going to (go|move)/i,
    answer: ()=>{
      const f = AppState.forecast;
      if(!f) return {text:"No forecast computed yet - open the Prediction tab first.", tag:'UNCERTAIN'};
      return {text:`${f.horizon}-day ensemble forecast for ${f.ticker}: ${fmtPct(f.ensemblePredPct)}, range ${fmtPct(f.rangeLow)} to ${fmtPct(f.rangeHigh)} (\u00b11\u03c3 of backtested error), P(positive) ${f.probPos!=null?f.probPos.toFixed(0)+'%':'n/a'}. Confidence: ${f.confidence}.\nThis is a statistical ensemble (naive/drift/linear-regression/Holt), walk-forward backtested - not a guaranteed outcome, and no gradient-boosted or deep-learning model is running in this build (disclosed, not faked).`, tag:'MODEL'};
    }},
  { test: /technical|momentum|rsi|macd|trend|overbought|oversold/i,
    answer: ()=>{
      const t = AppState.technicals;
      if(!t) return {text:"No technicals computed yet - open the Technicals tab first.", tag:'UNCERTAIN'};
      const rsiNote = t.rsi14==null?'': t.rsi14>70?' (overbought territory)':t.rsi14<30?' (oversold territory)':' (neutral zone)';
      const trendNote = (t.sma20!=null&&t.sma50!=null) ? (t.sma20>t.sma50?'20-period SMA is above the 50-period SMA - short-term uptrend structure.':'20-period SMA is below the 50-period SMA - short-term downtrend structure.') : '';
      return {text:`RSI(14) is ${fmtNum(t.rsi14,1)}${rsiNote}. ${trendNote} MACD ${t.macd&&t.macd.macd!=null?t.macd.macd.toFixed(2):'n/a'} vs signal ${t.macd&&t.macd.signal!=null?t.macd.signal.toFixed(2):'n/a'}. 30D annualized historical volatility \u2248 ${fmtPct(t.histVol)}.\nAll computed live from the ${t.isLive?'live':'sample'} price series via the Formula Engine (RSI/MACD/SMA definitions verified in the Tests tab).`, tag:'FACT'};
    }},
  { test: /fundamental|revenue|net income|earnings|roe|margin/i,
    answer: ()=>{
      const f = AppState.fundamentals;
      if(!f) return {text:"No fundamentals loaded yet for this security - open the Fundamentals tab first.", tag:'UNCERTAIN'};
      if(!f.isLive) return {text:`No live SEC EDGAR data reached this ticker (either no CIK could be resolved for it — SEC EDGAR only covers US-listed registrants — or the fetch failed and needs your CORS proxy, see Data Sources). Fundamentals shown elsewhere in the app for this security are SAMPLE, not real filings.`, tag:'UNCERTAIN'};
      return {text:`${f.entityName||f.ticker}, from real SEC EDGAR filings: Revenue $${(f.revenue/1e6).toFixed(0)}mn, Net Income $${(f.netIncome/1e6).toFixed(0)}mn${f.roePct!=null?`, ROE ${fmtPct(f.roePct)}, Net Margin ${fmtPct(f.netMarginPct)}`:''}.\nSourced from official filed 10-K XBRL data, not estimated.`, tag:'FACT'};
    }},
  { test: /portfolio|holdings|sharpe ratio of my|diversif/i,
    answer: ()=>{
      const p = AppState.portfolio;
      if(!p) return {text:"Portfolio metrics haven't been computed yet - open the Portfolio tab first.", tag:'UNCERTAIN'};
      return {text:`Portfolio value $${p.value.toLocaleString(undefined,{maximumFractionDigits:0})}, annualized return ${fmtPct(p.annReturnPct)}, Sharpe ${fmtNum(p.sharpe)}, max drawdown ${fmtPct(p.maxDrawdownPct)}, diversification ratio ${fmtNum(p.diversificationRatio)}.\nBuilt from a disclosed deterministic sample return history per holding (not live multi-asset data yet) - see the Portfolio tab for the caveat in full.`, tag:'MODEL'};
    }},
  { test: /option|greek|delta|gamma|theta|vega|black.?scholes/i,
    answer: ()=>{
      const o = AppState.options;
      if(!o) return {text:"No option pricing run yet - open the Options tab first.", tag:'UNCERTAIN'};
      return {text:`${o.ticker} ${o.strike}-strike, ${o.days}D to expiry, IV ${o.vol}%: call $${fmtNum(o.callPrice)}, put $${fmtNum(o.putPrice)}. Delta ${fmtNum(o.delta,4)}, Gamma ${fmtNum(o.gamma,5)}, Theta ${fmtNum(o.theta,4)}/day, Vega ${fmtNum(o.vega,4)} per 1% vol.\nReal Black-Scholes output, verified against the classic textbook benchmark in the Tests tab (not looked up from a live options market - no free option-chain API is wired yet).`, tag:'MODEL'};
    }},
  { test: /compare|vs\.?|versus/i,
    answer: ()=>{ return {text:"For a full side-by-side, use the Compare tab (left nav) - it pulls live price/fundamentals/technical figures for whichever tickers you select. I can only speak in detail about the currently selected security here.", tag:'UNCERTAIN'}; }},
  { test: /cfa|level ii|quant|portfolio manager|explain.*like/i,
    answer: ()=>{
      const t = AppState.technicals, r = AppState.risk, d = AppState.dcf;
      if(!t && !r && !d) return {text:"Load Technicals, Risk, and Valuation for this security first, then ask again - I'll synthesize across whatever's actually been computed.", tag:'UNCERTAIN'};
      const parts = [];
      if(d) parts.push(`Valuation: DCF implies ${fmtPct(d.upsidePct)} vs current price.`);
      if(t) parts.push(`Technical structure: RSI ${fmtNum(t.rsi14,1)}, ${(t.sma20>t.sma50)?'uptrend (20>50 SMA)':'downtrend (20<50 SMA)'}.`);
      if(r) parts.push(`Risk: ${fmtPct(r.annualVolPct)} annualized vol, Sharpe ${fmtNum(r.sharpe)}, max drawdown ${fmtPct(r.maxDrawdownPct)}.`);
      return {text:parts.join('\n')+"\nThat's a synthesis across the real computed panels - not a single trained model's opinion.", tag:'MODEL'};
    }},
];
function groundedAnswer(question){
  const intent = AI_INTENTS.find(i=>i.test.test(question));
  if(intent) return intent.answer();
  return {text:"I can answer grounded questions about the currently selected security's fundamentals, technicals, valuation (DCF), risk (VaR/CVaR/drawdown), forecast, options, or your portfolio - try one of those, or connect your own API key in Settings for open-ended questions.", tag:'UNCERTAIN'};
}

/* Optional bring-your-own-key LLM path - only used if the user has saved a key in Settings.
   The model is given AppState as its ONLY permitted source of security-specific facts and is
   explicitly instructed not to invent anything outside it. */
async function llmAnswer(question){
  const sys = `You are a financial research assistant embedded in the Quantis terminal. You may ONLY state security-specific facts, numbers, or figures that appear in the JSON context - never invent, estimate, or recall data from training for them. If the answer is not in the context, say so and suggest which tab would compute it. You may explain general finance concepts. Be concise; use short bullet points.`;
  let analysis = null; try{ analysis = await QXAI.context(currentSecurity); }catch(e){}
  const r = await QXAI.chat([{role:'system',content:sys},{role:'system',content:'CONTEXT JSON:\n'+JSON.stringify({appState:AppState, analysis}).slice(0,14000)},{role:'user',content:question}], {maxTokens:700});
  return r.text + `\n\n— ${QXAI.PROVIDERS[r.provider].label} · ${r.model}`;
}
document.getElementById('aiSend').addEventListener('click', sendAi);
document.getElementById('aiInput').addEventListener('keydown', e=>{ if(e.key==='Enter') sendAi(); });
async function sendAi(){
  const inp=document.getElementById('aiInput'); const v=inp.value.trim(); if(!v) return;
  aiPush(v,'user'); inp.value='';
  const hasKey = QXAI.available();
  if(hasKey){
    const g0 = groundedAnswer(v); const isDirect = g0 && g0.tag && g0.tag !== 'UNCERTAIN' && /\d/.test(g0.text||'');
    if(isDirect && !/why|explain|how|should|compare|what does|mean/i.test(v)){ aiPush(g0.text, 'assistant', g0.tag); return; }
    aiPush('Thinking… (free AI can take a few seconds)', 'assistant');
    const thinking = document.getElementById('aiLog')?.lastElementChild;
    try{
      const text = await llmAnswer(v);
      if(thinking) thinking.remove();
      aiPush(text, 'assistant', 'MODEL');
      const lastMsg = document.getElementById('aiLog').lastElementChild; if(lastMsg) lastMsg.innerHTML = '<span class="badge model" style="margin-right:6px;">MODEL</span>' + QXAI.md(text);
    }catch(e){
      if(thinking) thinking.remove();
      aiPush(`The AI provider didn't answer (${escapeHtml(e.message)}) - here is the grounded answer instead.\n`, 'assistant');
      const g = groundedAnswer(v); aiPush(g.text, 'assistant', g.tag);
    }
  } else {
    const g = groundedAnswer(v);
    setTimeout(()=>aiPush(g.text, 'assistant', g.tag), 250);
  }
}
