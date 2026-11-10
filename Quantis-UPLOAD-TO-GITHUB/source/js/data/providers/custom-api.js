/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/data/providers/custom-api.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   "Bring your own API": users connect any JSON/HTTPS endpoint (their paid data feed,
 *           an internal service, a different free API) without code. Each connector:
 *             { id, name, url, method:'GET'|'POST', headers:{}, body:'', keyName, fields:[{label, path, format}], scope:'equity'|'all' }
 *           URL / headers / body templates accept placeholders:
 *             {symbol} Quantis ticker · {tv} TradingView symbol (EXCH:SYM) · {tvsym} symbol part only
 *             {exchange} · {cnbc} CNBC symbol · {name} security name · {key} the connector's stored key
 *           field.path is a dot path into the JSON (supports [n] indexes), e.g. "data[0].metrics.pe".
 *           field.format: 'number' | 'percent' | 'money' | 'text' | 'date'.
 * SECURITY  • Only https:// endpoints are accepted.
 *           • Values are always escaped before display (escapeHtml) — a connector cannot inject HTML/JS.
 *           • No eval/Function: paths are resolved with a tiny parser.
 *           • Connector keys are stored separately (quantis_ckey_<id>) and sent only to that URL.
 * EXPOSES   QXCUSTOM.{list(), save(conn), remove(id), run(conn, ticker), runAll(ticker), renderManager(el), renderCard(el, ticker)}
 * ─────────────────────────────────────────────────────────────────────────────
 */
const QXCUSTOM = (() => {
  const KEY = 'quantis_custom_apis_v1';
  const list = () => { try{ return JSON.parse(safeStorage.getItem(KEY) || '[]'); }catch(e){ return []; } };
  const persist = arr => safeStorage.setItem(KEY, JSON.stringify(arr));
  const ckey = id => safeStorage.getItem('quantis_ckey_'+id) || '';
  function save(c){
    if(!/^https:\/\//i.test(c.url||'')) throw new Error('The endpoint must start with https://');
    if(!c.name) throw new Error('Give the connector a name');
    c.id = c.id || 'c'+Date.now().toString(36);
    const arr = list().filter(x=>x.id!==c.id); arr.push({...c, key:undefined}); persist(arr);
    if(c.key != null) safeStorage.setItem('quantis_ckey_'+c.id, c.key);
    return c;
  }
  function remove(id){ persist(list().filter(x=>x.id!==id)); safeStorage.removeItem && safeStorage.removeItem('quantis_ckey_'+id); }
  function vars(ticker, c){
    const sec = (typeof SECURITIES!=='undefined' && SECURITIES.find(x=>x.t===ticker)) || (typeof SECURITY_UNIVERSE!=='undefined' && SECURITY_UNIVERSE.find(x=>x.t===ticker)) || {};
    const tv = (LD.tvSymbol && LD.tvSymbol(ticker)) || ticker;
    return {symbol:ticker, tv, tvsym:String(tv).split(':').pop(), exchange:String(tv).split(':')[0], cnbc:(LD.cnbcSymbol && LD.cnbcSymbol(ticker)) || ticker, name:sec.n||ticker, key:ckey(c.id)};
  }
  const fill = (tpl, v, enc) => String(tpl||'').replace(/\{(symbol|tv|tvsym|exchange|cnbc|name|key)\}/g, (_,k) => enc ? encodeURIComponent(v[k]??'') : (v[k]??''));
  function at(obj, path){
    // "a.b[0].c" → obj.a.b[0].c — no eval
    const parts = String(path||'').match(/[^.[\]]+/g) || [];
    return parts.reduce((o,k)=> o==null ? undefined : o[k], obj);
  }
  function fmt(v, f){
    if(v==null) return '—';
    const n = typeof v==='number' ? v : parseFloat(v);
    if(f==='percent' && isFinite(n)) return (Math.abs(n)<=1.5 ? n*100 : n).toFixed(2)+'%';
    if(f==='money' && isFinite(n)) return Math.abs(n)>=1e9 ? (n/1e9).toFixed(2)+'B' : Math.abs(n)>=1e6 ? (n/1e6).toFixed(2)+'M' : n.toLocaleString();
    if(f==='number' && isFinite(n)) return n.toLocaleString(undefined,{maximumFractionDigits:4});
    if(f==='date') { const d = new Date(typeof v==='number' && v<1e12 ? v*1000 : v); return isNaN(d) ? String(v) : d.toISOString().slice(0,10); }
    return typeof v==='object' ? JSON.stringify(v).slice(0,120) : String(v);
  }
  async function run(c, ticker){
    const v = vars(ticker, c); const url = fill(c.url, v, true);
    if(!/^https:\/\//i.test(url)) throw new Error('https only');
    let headers = {}; try{ headers = JSON.parse(fill(c.headers||'{}', v, false) || '{}'); }catch(e){ throw new Error('Headers must be valid JSON'); }
    const opt = {method:c.method||'GET', headers}; if(opt.method==='POST') opt.body = fill(c.body||'', v, false);
    const j = await cachedJson('qxcus_'+c.id+'_'+ticker+'_'+(c.updated||''), 5*60e3, async () => { const r = await fetchWithTimeout(url, opt, 15000); if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); });
    return (c.fields||[]).map(f => ({label:f.label, value: at(j, f.path), text: fmt(at(j, f.path), f.format)}));
  }
  async function runAll(ticker, scope){
    const out = [];
    for(const c of list()){ if(scope && c.scope && c.scope!=='all' && c.scope!==scope) continue; try{ out.push({name:c.name, rows: await run(c, ticker)}); }catch(e){ out.push({name:c.name, error:e.message}); } }
    return out;
  }
  async function renderCard(el, ticker, scope){
    if(!el) return; const conns = list().filter(c=>!scope || !c.scope || c.scope==='all' || c.scope===scope);
    if(!conns.length){ el.innerHTML = `<div class="qxa-dim">No custom APIs connected. Add your own data feed in <a href="#" onclick="goto('sources');return false;">Data Sources → Your own APIs</a>.</div>`; return; }
    el.innerHTML = '<div class="qx-skel" style="height:60px"></div>';
    const res = await runAll(ticker, scope);
    el.innerHTML = res.map(r => `<div class="qxcu-block"><b>${escapeHtml(r.name)}</b>${r.error ? `<div class="qxa-dim">Unavailable: ${escapeHtml(r.error)}</div>` : kv(r.rows.map(x=>[escapeHtml(x.label), escapeHtml(x.text)]))}</div>`).join('');
  }
  function renderManager(el){
    if(!el) return;
    const conns = list();
    el.innerHTML = `
      <div class="notebox" style="margin-bottom:10px">Connect any HTTPS JSON API — a paid feed you already have, your company's internal service, or another free API. Placeholders: <code>{symbol}</code> <code>{tv}</code> <code>{tvsym}</code> <code>{exchange}</code> <code>{cnbc}</code> <code>{name}</code> <code>{key}</code>. Results appear in Research → Overview and in reports. Keys are kept in this browser only.</div>
      ${conns.length ? `<table class="datatable" data-nosort><thead><tr><th>Name</th><th>Endpoint</th><th>Fields</th><th></th></tr></thead><tbody>${conns.map(c=>`<tr><td>${escapeHtml(c.name)}</td><td class="qxa-dim" style="max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(c.url)}</td><td>${(c.fields||[]).length}</td><td style="white-space:nowrap"><button class="btn secondary small" data-cu-test="${c.id}">Test</button> <button class="btn secondary small" data-cu-edit="${c.id}">Edit</button> <button class="btn secondary small" data-cu-del="${c.id}">Delete</button></td></tr>`).join('')}</tbody></table>` : '<div class="qxa-dim" style="margin-bottom:8px">No connectors yet.</div>'}
      <details class="qxcu-form" ${conns.length?'':'open'}><summary>+ Add / edit a connector</summary>
        <input type="hidden" id="cuId">
        <div class="grid grid-2"><div class="formrow"><label>Name</label><input id="cuName" placeholder="e.g. My broker fundamentals"></div>
        <div class="formrow"><label>Applies to</label><select id="cuScope"><option value="all">All securities</option><option value="equity">Equities</option><option value="crypto">Crypto</option><option value="bond">Bonds</option><option value="fund">Funds</option></select></div></div>
        <div class="formrow"><label>Endpoint URL (https)</label><input id="cuUrl" placeholder="https://api.example.com/v1/metrics?symbol={tvsym}&apikey={key}"></div>
        <div class="grid grid-2"><div class="formrow"><label>Method</label><select id="cuMethod"><option>GET</option><option>POST</option></select></div><div class="formrow"><label>API key (stored only in this browser)</label><input id="cuKey" type="password" placeholder="optional"></div></div>
        <div class="formrow"><label>Headers (JSON, optional)</label><input id="cuHeaders" placeholder='{"Authorization":"Bearer {key}"}'></div>
        <div class="formrow"><label>Body (POST only)</label><input id="cuBody" placeholder='{"symbol":"{tvsym}"}'></div>
        <div class="formrow"><label>Fields — one per line: Label | json.path | format(number|percent|money|text|date)</label><textarea id="cuFields" rows="4" placeholder="P/E | data[0].pe | number&#10;Dividend yield | data[0].dy | percent"></textarea></div>
        <button class="btn" id="cuSave">Save connector</button> <span class="qxa-dim" id="cuMsg"></span>
      </details>`;
    const $ = id => el.querySelector('#'+id);
    const fillForm = c => { $('cuId').value=c.id||''; $('cuName').value=c.name||''; $('cuScope').value=c.scope||'all'; $('cuUrl').value=c.url||''; $('cuMethod').value=c.method||'GET'; $('cuKey').value=c.id?ckey(c.id):''; $('cuHeaders').value=c.headers||''; $('cuBody').value=c.body||''; $('cuFields').value=(c.fields||[]).map(f=>`${f.label} | ${f.path} | ${f.format||'text'}`).join('\n'); el.querySelector('details').open = true; };
    $('cuSave').onclick = () => {
      try{
        const fields = $('cuFields').value.split('\n').map(l=>l.split('|').map(s=>s.trim())).filter(a=>a[0]&&a[1]).map(([label,path,format])=>({label,path,format:format||'text'}));
        if(!fields.length) throw new Error('Add at least one field');
        save({id:$('cuId').value||null, name:$('cuName').value.trim(), scope:$('cuScope').value, url:$('cuUrl').value.trim(), method:$('cuMethod').value, key:$('cuKey').value, headers:$('cuHeaders').value.trim(), body:$('cuBody').value, fields, updated:Date.now()});
        toast('Connector saved.', 'ok'); renderManager(el);
      }catch(e){ $('cuMsg').textContent = e.message; }
    };
    el.querySelectorAll('[data-cu-del]').forEach(b=>b.onclick=()=>{ remove(b.dataset.cuDel); renderManager(el); });
    el.querySelectorAll('[data-cu-edit]').forEach(b=>b.onclick=()=>fillForm(list().find(c=>c.id===b.dataset.cuEdit)));
    el.querySelectorAll('[data-cu-test]').forEach(b=>b.onclick=async()=>{ const c = list().find(x=>x.id===b.dataset.cuTest); try{ const rows = await run(c, currentSecurity); toast(`${c.name} (${currentSecurity}): `+rows.map(r=>r.label+' = '+r.text).join(', '), 'ok'); }catch(e){ toast(c.name+' failed: '+e.message, 'err'); } });
  }
  return {list, save, remove, run, runAll, renderManager, renderCard, _at: at};
})();
