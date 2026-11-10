/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/modules/ai.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Free-first AI provider chain (Pollinations keyless → user keys for Groq/Gemini/OpenRouter/Anthropic/OpenAI) and the AI Lab tools.
 * DEPENDS   QXA (context), LD.news
 * EXPOSES   QXAI (single global namespace object — keep new public functions on it)
 * PATTERN   IIFE module: private helpers stay inside the closure; only the returned object is global.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* =====================================================================================
   QUANTIS AI — free-first provider layer + AI Lab
   Default: Pollinations (keyless, free, open-weight model; no sign-up). Optional free keys:
   Groq, Google Gemini, OpenRouter (free models). Paid: Anthropic, OpenAI. Every tool is
   grounded on the JSON the terminal computed from live data, and its output is labelled.
   ===================================================================================== */
const QXAI = (() => {
  const PROVIDERS = {
    pollinations:{label:'Pollinations — free, no key', key:null, model:'openai', url:'https://text.pollinations.ai/openai', fmt:'openai', note:'Keyless and free; shared queue, so answers can take 5–20 s. Prompts are sent to pollinations.ai.'},
    groq:{label:'Groq — free key', key:'groq', model:'llama-3.3-70b-versatile', url:'https://api.groq.com/openai/v1/chat/completions', fmt:'openai', note:'Free key at console.groq.com (no card). Very fast.'},
    gemini:{label:'Google Gemini — free key', key:'gemini', model:'gemini-2.5-flash', url:'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', fmt:'openai', note:'Free key at aistudio.google.com.'},
    openrouter:{label:'OpenRouter — free models', key:'openrouter', model:'meta-llama/llama-3.3-70b-instruct:free', url:'https://openrouter.ai/api/v1/chat/completions', fmt:'openai', note:'Free key at openrouter.ai; models ending in “:free” cost nothing.'},
    anthropic:{label:'Anthropic Claude — your key', key:'anthropic', model:'claude-haiku-4-5', url:'https://api.anthropic.com/v1/messages', fmt:'anthropic', note:'Billed to your Anthropic account.'},
    openai:{label:'OpenAI — your key', key:'openai', model:'gpt-4.1-mini', url:'https://api.openai.com/v1/chat/completions', fmt:'openai', note:'Billed to your OpenAI account.'},
  };
  const keyOf = p => p.key ? (safeStorage.getItem('quantis_key_'+p.key)||'').trim() : '';
  const pref = () => safeStorage.getItem('quantis_ai_provider') || 'auto';
  const modelFor = id => (safeStorage.getItem('quantis_ai_model_'+id)||'').trim() || PROVIDERS[id].model;
  function chain(){
    const p = pref();
    if(p === 'off') return [];
    if(p !== 'auto' && PROVIDERS[p] && (!PROVIDERS[p].key || keyOf(PROVIDERS[p]))) return [p, ...(p!=='pollinations'?['pollinations']:[])];
    const order = ['anthropic','openai','groq','gemini','openrouter'].filter(id=>keyOf(PROVIDERS[id]));
    return order.concat(['pollinations']);
  }
  const available = () => chain().length > 0;
  let queue = Promise.resolve(), lastPoll = 0;
  async function callOne(id, messages, opts){
    const P = PROVIDERS[id], model = modelFor(id), max = opts.maxTokens || 900;
    if(id==='pollinations'){ const wait = Math.max(0, lastPoll + 3500 - Date.now()); if(wait) await new Promise(r=>setTimeout(r,wait)); lastPoll = Date.now(); }
    let res;
    if(P.fmt==='anthropic'){
      const sys = messages.filter(m=>m.role==='system').map(m=>m.content).join('\n\n');
      res = await fetchWithTimeout(P.url, {method:'POST', headers:{'Content-Type':'application/json','x-api-key':keyOf(P),'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
        body:JSON.stringify({model, max_tokens:max, system:sys, messages:messages.filter(m=>m.role!=='system')})}, 60000);
      if(!res.ok) throw new Error(P.label+': HTTP '+res.status);
      const d = await res.json(); return {text:(d.content||[]).map(b=>b.text||'').join(''), provider:id, model};
    }
    const headers = {'Content-Type':'application/json'}; if(P.key) headers.Authorization = 'Bearer '+keyOf(P);
    if(id==='openrouter'){ headers['HTTP-Referer'] = location.origin || 'https://quantis.app'; headers['X-Title'] = 'Quantis Terminal'; }
    const body = {model, messages, max_tokens:max, temperature: opts.temperature ?? 0.3};
    if(id==='pollinations'){ body.private = true; body.referrer = 'quantis-terminal'; }
    res = await fetchWithTimeout(P.url, {method:'POST', headers, body:JSON.stringify(body)}, 70000);
    if(!res.ok){ let msg=''; try{ msg = (await res.text()).slice(0,140); }catch(e){} throw new Error(P.label+': HTTP '+res.status+(msg?' — '+msg:'')); }
    const d = await res.json();
    const text = d?.choices?.[0]?.message?.content;
    if(!text) throw new Error(P.label+': empty answer');
    return {text, provider:id, model:d.model||model};
  }
  function chat(messages, opts={}){
    const run = async () => {
      const ids = chain(); if(!ids.length) throw new Error('AI is switched off in Settings');
      const errs = [];
      for(const id of ids){ try{ return await callOne(id, messages, opts); }catch(e){ errs.push(e.message); } }
      throw new Error(errs.join(' · '));
    };
    const p = queue.then(run, run); queue = p.catch(()=>{}); return p;
  }
  function md(t){
    // tiny, safe markdown → HTML (escape first)
    const lines = escapeHtml(String(t||'').replace(/<think>[\s\S]*?<\/think>/g,'').trim()).split('\n');
    let html = '', list = null;
    const inline = s => s.replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g,'$1<i>$2</i>').replace(/`([^`]+)`/g,'<code>$1</code>');
    for(const raw of lines){
      const l = raw.trim();
      const bul = /^([-*•]|\d+[.)])\s+(.*)/.exec(l);
      if(bul){ const tag = /\d/.test(bul[1]) ? 'ol' : 'ul'; if(list!==tag){ if(list) html += `</${list}>`; html += `<${tag}>`; list = tag; } html += `<li>${inline(bul[2])}</li>`; continue; }
      if(list){ html += `</${list}>`; list = null; }
      if(!l){ continue; }
      const h = /^(#{1,4})\s+(.*)/.exec(l); if(h){ html += `<h4>${inline(h[2])}</h4>`; continue; }
      if(/^\|.*\|$/.test(l)){ if(/^\|[\s:|-]+\|$/.test(l)) continue; html += `<div class="qxai-tr">${l.slice(1,-1).split('|').map(c=>`<span>${inline(c.trim())}</span>`).join('')}</div>`; continue; }
      html += `<p>${inline(l)}</p>`;
    }
    if(list) html += `</${list}>`;
    return html;
  }

  /* ---------------------------- grounding context ---------------------------- */
  async function context(ticker){
    const sec = SECURITIES.find(x=>x.t===ticker) || SECURITY_UNIVERSE.find(x=>x.t===ticker) || {t:ticker};
    const ctx = {security:{ticker, name:sec.n, exchange:sec.ex, country:sec.ctry, sector:sec.sector, currency:sec.ccy, price:sec.px, changePct:sec.chgPct}, asOf:new Date().toISOString()};
    try{ const m = await QXA.get(ticker); const S = QXA.summary(m);
      ctx.fundamentals = {currency:m.ccy, industry:m.industry, employees:m.employees, latestFiscalYear:m.H.years[0], analystSummary:S.text, lifecycle:S.lc[0], redFlags:S.F.red, strengths:S.F.green, healthScore:S.V.overall,
        ratios:Object.fromEntries(QXA.metrics(m).filter(x=>x.value!=null).map(x=>[x.name, x.text])),
        cashFlow:{CFO:m.L.cfo, CFI:m.L.cfi, CFF:m.L.cff, capex:m.L.capex, dividends:m.L.div, netIncome:m.L.net, DandA:m.D.da, workingCapitalAndOther:m.D.wcOther},
        history:{years:m.H.years.slice(0,5), revenue:m.H.revenue.slice(0,5), netIncome:m.H.net.slice(0,5), fcf:m.H.fcf.slice(0,5), grossMargin:m.H.gm.slice(0,5).map(v=>v==null?null:+(v*100).toFixed(1))}};
    }catch(e){ ctx.fundamentals = 'not available: '+e.message; }
    try{ if(AppState && AppState.technicals) ctx.technicals = AppState.technicals; if(AppState && AppState.risk) ctx.risk = AppState.risk; if(AppState && AppState.dcf) ctx.dcf = AppState.dcf; }catch(e){}
    return ctx;
  }
  const RULES = 'Ground every company-specific fact and number ONLY in the JSON context provided. If something is not in the context, say it is not available rather than guessing. Do not give personalised investment advice or tell the user to buy or sell. Write clearly for a non-finance reader, define jargon briefly, use short sections with bold headings and bullet points.';
  const TOOLS = {
    explain:{title:'Explain this company\'s financials in plain English', needs:'ticker', icon:'📘', desc:'Turns the ratio analysis into a clear story: what the company earns, how it uses cash, and what stands out.',
      prompt:c=>`Explain the financial position of ${c.security.name} (${c.security.ticker}) to a beginner. Cover: 1) how the business makes and converts money, 2) why each cash flow (operating, investing, financing) is positive or negative and where it comes from, 3) margin trends and why, 4) balance-sheet strength, 5) the three most important takeaways. Use a simple everyday analogy once.`},
    bullbear:{title:'Bull case vs bear case', needs:'ticker', icon:'⚖️', desc:'Builds the strongest optimistic and pessimistic arguments from the same data, so you see both sides.',
      prompt:c=>`Write a balanced bull case and bear case for ${c.security.name}. For each: 4–5 bullet points, each tied to a specific metric in the context. Finish with "What would change the picture" — 3 measurable things to monitor.`},
    forensic:{title:'Forensic accounting check', needs:'ticker', icon:'🔎', desc:'Looks for earnings-quality warnings: cash vs profit gaps, accruals, leverage, dilution, distress scores.',
      prompt:c=>`Act as a forensic accountant. Using only the context, assess earnings quality and balance-sheet risk for ${c.security.name}: cash conversion, accruals, working capital, leverage, interest cover, distress scores (Altman, Zmijewski, Piotroski), dilution/buybacks. Rate each area Low/Medium/High concern with one-line reasoning, then give an overall verdict.`},
    questions:{title:'Critical-thinking questions', needs:'ticker', icon:'❓', desc:'The questions a sceptical analyst would ask management or check in the annual report before forming a view.',
      prompt:c=>`List 10 sharp, specific questions a sceptical analyst should investigate about ${c.security.name} before forming a view, grouped under Growth, Profitability, Cash flow, Balance sheet, and Risks. Each question must reference a number or trend in the context and say where in an annual report to look for the answer.`},
    devil:{title:'Devil\'s advocate on your thesis', needs:'ticker+text', icon:'😈', placeholder:'Type your investment thesis, e.g. "Margins will keep expanding because of pricing power"', desc:'Paste your view; the AI argues against it using the data, and lists what evidence would prove you right or wrong.',
      prompt:(c,t)=>`The user's thesis on ${c.security.name}: "${t}". Act as a rigorous devil's advocate. 1) Restate the thesis fairly. 2) Give the strongest counter-arguments grounded in the context. 3) Identify hidden assumptions. 4) List evidence that would confirm vs refute the thesis. 5) Conclude with how confident one can reasonably be given the data.`},
    concept:{title:'Explain any finance concept', needs:'text', icon:'🎓', placeholder:'e.g. What is ROIC and why does it matter?', desc:'Ask about any term — EBITDA, DCF, beta, Altman Z — and get a step-by-step explanation with a worked numeric example.',
      prompt:(c,t)=>`Teach this finance concept to a complete beginner: "${t}". Structure: What it is (one sentence) → Why it matters → Formula (if any) → Step-by-step worked example with simple made-up numbers → How to interpret it → Common mistakes. If the currently selected company (${c.security.name}) has a relevant value in the context, show it as a real-world example.`},
    news:{title:'News sentiment & what it means', needs:'ticker', icon:'📰', desc:'Reads the latest headlines for the company and summarises tone, themes and possible impact.',
      prompt:(c)=>`Classify each headline in context.news as Positive / Negative / Neutral for ${c.security.name} with a 5-word reason, then summarise the overall tone, the main themes, and what (if anything) they could mean for the company's fundamentals shown in the context. Do not invent events beyond the headlines.`},
    compare:{title:'Compare two companies', needs:'ticker+text', icon:'🆚', placeholder:'Second ticker, e.g. MSFT', desc:'Side-by-side reasoning on growth, profitability, cash generation and balance sheet for two companies.',
      prompt:(c,t)=>`Compare ${c.security.name} with ${c.other?.security?.name||t} using only both contexts (context and context.other). Use a compact table for 8 key metrics, then explain which company is stronger on growth, profitability, cash generation and balance-sheet safety, and why. End with what each company would need to improve.`},
  };
  async function runTool(id, ticker, text, outEl){
    const T = TOOLS[id]; ticker = ticker || currentSecurity;
    if(!outEl){ goto('ailab'); setTimeout(()=>{ const sel=document.getElementById('qxaiTool'); if(sel){ sel.value=id; sel.dispatchEvent(new Event('change')); } const tk=document.getElementById('qxaiTicker'); if(tk) tk.value=ticker; document.getElementById('qxaiRun')?.click(); },80); return; }
    outEl.innerHTML = `<div class="qxai-wait"><span class="qxai-dot"></span><span class="qxai-dot"></span><span class="qxai-dot"></span> Gathering live data for ${escapeHtml(ticker)} and asking the AI…</div>`;
    try{
      const c = await context(ticker);
      if(id==='news'){ try{ const n = await LD.news(c.security.name || ticker); c.news = n.items.slice(0,12).map(x=>({title:x.title, date:x.date?new Date(x.date).toISOString().slice(0,10):null})); }catch(e){ c.news = []; } if(!c.news.length) throw new Error('no recent headlines found for this company'); }
      if(id==='compare'){ const o = (text||'').trim().toUpperCase(); if(!SECURITY_UNIVERSE.some(x=>x.t===o) && !SECURITIES.some(x=>x.t===o)) throw new Error(`"${o}" isn't in the built-in universe — type a listed ticker such as MSFT`); c.other = await context(o); }
      const prompt = T.prompt(c, text||'');
      const r = await chat([{role:'system', content:'You are a CFA-charterholder equity analyst and patient teacher inside the Quantis research terminal. '+RULES}, {role:'system', content:'CONTEXT JSON:\n'+JSON.stringify(c).slice(0,14000)}, {role:'user', content:prompt}], {maxTokens:1400});
      outEl.innerHTML = `<div class="qxai-meta"><span class="badge model">AI-GENERATED</span> ${escapeHtml(PROVIDERS[r.provider].label)} · ${escapeHtml(r.model)} · grounded on live data for ${escapeHtml(ticker)} · ${new Date().toLocaleTimeString()}<button class="btn ghost small qxai-copy">Copy</button></div><div class="qxai-out">${md(r.text)}</div><div class="qxa-dim" style="margin-top:8px">AI text can contain mistakes. Check every number against the Analysis tab, which shows the source formula for each.</div>`;
      outEl.querySelector('.qxai-copy').onclick = ()=>{ navigator.clipboard?.writeText(r.text).then(()=>toast('Copied.','ok')); };
      return r;
    }catch(e){
      outEl.innerHTML = `<div class="notebox"><b>The AI could not answer:</b> ${escapeHtml(e.message)}.<br>Free keyless AI is a shared service and is sometimes busy — wait a few seconds and press Run again, or add a free Groq / Gemini key in Settings → AI for faster, more reliable answers.${id!=='concept'&&id!=='compare'?'<br><br><b>Rule-based analysis (no AI) for '+escapeHtml(ticker)+':</b> <span id="qxaiFallback">loading…</span>':''}</div>`;
      if(id!=='concept' && id!=='compare'){ try{ const m = await QXA.get(ticker); const S = QXA.summary(m); const f = outEl.querySelector('#qxaiFallback'); if(f) f.innerHTML = S.html; }catch(e2){ const f = outEl.querySelector('#qxaiFallback'); if(f) f.textContent = 'unavailable'; } }
    }
  }
  function renderLab(){
    const box = document.getElementById('qxaiLab'); if(!box || box.dataset.ready) { syncLab(); return; }
    box.dataset.ready = '1';
    box.innerHTML = `
      <div class="qxai-grid">${Object.entries(TOOLS).map(([k,t])=>`<button class="qxai-card" data-tool="${k}"><span class="qxai-ic">${t.icon}</span><b>${t.title}</b><span>${t.desc}</span></button>`).join('')}</div>
      <div class="card" style="margin-top:12px">
        <div class="qxai-form">
          <label>Tool<select id="qxaiTool">${Object.entries(TOOLS).map(([k,t])=>`<option value="${k}">${t.title}</option>`).join('')}</select></label>
          <label id="qxaiTickerWrap">Company<input id="qxaiTicker" list="qxcSymList" spellcheck="false"></label>
          <label id="qxaiTextWrap" style="flex:2">Your input<input id="qxaiText"></label>
          <button class="btn" id="qxaiRun">Run</button>
        </div>
        <div class="qxa-dim" id="qxaiProv" style="margin:6px 0 10px"></div>
        <div id="qxaiOut" class="qxai-result"><div class="qxa-dim">Pick a tool above and press Run. Answers are grounded on the live data the terminal has fetched for the company.</div></div>
      </div>`;
    const sel = box.querySelector('#qxaiTool');
    const sync = ()=>{ const T = TOOLS[sel.value]; box.querySelector('#qxaiTickerWrap').style.display = T.needs.includes('ticker') ? '' : 'none'; box.querySelector('#qxaiTextWrap').style.display = T.needs.includes('text') ? '' : 'none'; box.querySelector('#qxaiText').placeholder = T.placeholder || ''; box.querySelectorAll('.qxai-card').forEach(c=>c.classList.toggle('active', c.dataset.tool===sel.value)); };
    sel.addEventListener('change', sync);
    box.querySelectorAll('.qxai-card').forEach(c=>c.addEventListener('click',()=>{ sel.value = c.dataset.tool; sync(); (TOOLS[sel.value].needs.includes('text') ? box.querySelector('#qxaiText') : box.querySelector('#qxaiRun')).focus(); }));
    box.querySelector('#qxaiRun').addEventListener('click', ()=>{
      const T = TOOLS[sel.value]; const tk = box.querySelector('#qxaiTicker').value.trim().toUpperCase() || currentSecurity; const txt = box.querySelector('#qxaiText').value.trim();
      if(T.needs.includes('text') && !txt){ toast('Type your input first.','warn'); box.querySelector('#qxaiText').focus(); return; }
      if(T.needs.includes('ticker') && !SECURITY_UNIVERSE.some(x=>x.t===tk) && !SECURITIES.some(x=>x.t===tk)){ toast(`"${tk}" isn't in the built-in universe.`, 'warn'); return; }
      runTool(sel.value, tk, txt, box.querySelector('#qxaiOut'));
    });
    box.querySelector('#qxaiText').addEventListener('keydown', e=>{ if(e.key==='Enter') box.querySelector('#qxaiRun').click(); });
    sync(); syncLab();
  }
  function syncLab(){
    const tk = document.getElementById('qxaiTicker'); if(tk && !tk.value) tk.value = currentSecurity;
    const pv = document.getElementById('qxaiProv'); if(pv){ const ids = chain(); pv.innerHTML = ids.length ? `Provider: <b>${escapeHtml(PROVIDERS[ids[0]].label)}</b> (${escapeHtml(modelFor(ids[0]))})${ids.length>1?` · fallback: ${ids.slice(1).map(i=>escapeHtml(PROVIDERS[i].label)).join(', ')}`:''} · change in Settings → AI.` : 'AI is switched off in Settings.'; }
  }
  /* settings block injected into the existing Settings modal */
  function settingsHtml(){
    return `<div class="notebox" style="margin:14px 0 10px;"><b>AI provider.</b> Works out of the box with a free, keyless model (Pollinations). Add a free Groq, Gemini or OpenRouter key for faster, more reliable answers. Keys stay in this browser and are sent only to that provider.</div>
      <div class="formrow"><label>AI provider</label><select id="qxaiPref"><option value="auto">Automatic — best available (keys first, then free keyless)</option>${Object.entries(PROVIDERS).map(([k,p])=>`<option value="${k}">${p.label}</option>`).join('')}<option value="off">Off — rule-based answers only</option></select></div>
      <div class="formrow"><label>Google Gemini API key (free — aistudio.google.com)</label><input id="keyGemini" placeholder="AIza…"></div>
      <div class="formrow"><label>OpenRouter API key (free models — openrouter.ai)</label><input id="keyOpenrouter" placeholder="sk-or-…"></div>
      <div class="formrow"><label>Model override for the selected provider (optional)</label><input id="qxaiModel" placeholder="leave blank for the default"></div>`;
  }
  function loadSettings(){
    const set = (id,v)=>{ const e=document.getElementById(id); if(e) e.value=v; };
    set('qxaiPref', pref()); set('keyGemini', safeStorage.getItem('quantis_key_gemini')||''); set('keyOpenrouter', safeStorage.getItem('quantis_key_openrouter')||'');
    const p = pref(); set('qxaiModel', PROVIDERS[p] ? (safeStorage.getItem('quantis_ai_model_'+p)||'') : '');
    const e = document.getElementById('qxaiModel'); if(e) e.placeholder = PROVIDERS[p] ? 'default: '+PROVIDERS[p].model : 'choose a specific provider to override its model';
  }
  function saveSettingsAi(){
    const g = id=>{ const e=document.getElementById(id); return e ? e.value.trim() : ''; };
    safeStorage.setItem('quantis_ai_provider', g('qxaiPref')||'auto');
    safeStorage.setItem('quantis_key_gemini', g('keyGemini')); safeStorage.setItem('quantis_key_openrouter', g('keyOpenrouter'));
    const p = g('qxaiPref'); if(PROVIDERS[p]) safeStorage.setItem('quantis_ai_model_'+p, g('qxaiModel'));
    syncLab();
  }
  return {chat, available, chain, runTool, renderLab, md, context, settingsHtml, loadSettings, saveSettingsAi, PROVIDERS, TOOLS};
})();
