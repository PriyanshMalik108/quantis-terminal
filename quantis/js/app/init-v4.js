/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/app/init-v4.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Start-up for the v4 modules (loaded after js/app/init.js):
 *             • Alerts view  → indicator & drawn-line alerts card (QXAL) + background evaluator
 *             • Data Sources → full source catalogue with live probes (QXSRC) + "Your own APIs" (QXCUSTOM)
 *             • Research header → quick link to Universal Search
 *             • Progressive Web App registration (sw.js) + "Install app" button
 * Each step is wrapped in runInit() so a failure is logged and isolated.
 * ─────────────────────────────────────────────────────────────────────────────
 */
runInit('alerts-pro card', ()=>{
  const body = document.querySelector('#view-alerts .viewbody'); if(!body) return;
  const card = document.createElement('div'); card.className = 'card'; card.style.marginTop = '12px';
  card.innerHTML = '<h3>Indicator & drawn-line alerts <span class="badge fact">NEW</span></h3><div id="qxalHost"></div>';
  body.appendChild(card); QXAL.mount(card.querySelector('#qxalHost')); QXAL.start();
});
runInit('source catalogue', ()=>{
  const body = document.querySelector('#view-sources .viewbody'); if(!body) return;
  const cat = document.createElement('div'); cat.className = 'card'; cat.style.marginBottom = '12px';
  const rows = QXSRC.catalogue.map(s=>`<tr><td><b>${escapeHtml(s.name)}</b></td><td>${escapeHtml(s.cat)}</td><td class="qxa-dim">${escapeHtml(s.scope)}</td><td>${s.key ? (getKey(s.key) ? '<span class="badge fact">KEY SET</span>' : (s.keyOptional ? '<span class="badge">KEY OPTIONAL</span>' : '<span class="badge assume">NEEDS FREE KEY</span>')) : '<span class="badge fact">KEYLESS</span>'}</td><td data-probe="${s.id}" class="qxa-dim">${s.probe ? '—' : 'n/a'}</td><td><a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">docs ↗</a></td></tr>`).join('');
  cat.innerHTML = `<h3>Source catalogue — ${QXSRC.catalogue.length} free sources <button class="btn secondary small" id="qxsrcTest" style="margin-left:auto">Test all now</button></h3><div style="overflow-x:auto"><table class="datatable"><thead><tr><th>Source</th><th>Category</th><th>What it provides</th><th>Access</th><th>Live check</th><th></th></tr></thead><tbody>${rows}</tbody></table></div><div class="qxa-dim" style="margin-top:6px">Every keyless source is called directly from your browser (CORS-open, verified). Keys are optional and stay in your browser.</div>`;
  body.insertBefore(cat, body.firstChild);
  cat.querySelector('#qxsrcTest').onclick = async () => { for(const s of QXSRC.catalogue){ if(!s.probe) continue; const td = cat.querySelector(`[data-probe="${s.id}"]`); td.textContent = '…'; const r = await QXSRC.probe(s.id); td.innerHTML = r.ok ? `<span style="color:var(--up)">✓ ${r.ms} ms</span>` : `<span style="color:var(--down)" title="${escapeHtml(r.msg||'')}">✗ ${escapeHtml(String(r.msg||'').slice(0,40))}</span>`; } };
  const cu = document.createElement('div'); cu.className = 'card'; cu.style.marginBottom = '12px';
  cu.innerHTML = '<h3>Your own APIs <span class="badge model">CUSTOM</span></h3><div id="qxcuHost"></div>';
  body.insertBefore(cu, cat.nextSibling); QXCUSTOM.renderManager(cu.querySelector('#qxcuHost'));
});
runInit('progressive web app', ()=>{
  if(!('serviceWorker' in navigator) || !/^https:/.test(location.protocol)) return;
  navigator.serviceWorker.register('sw.js').catch(e=>console.warn('[Quantis] service worker not registered:', e.message));
  let deferred = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e;
    if(document.getElementById('qxInstall')) return; const b = document.createElement('button'); b.id = 'qxInstall'; b.className = 'btn small'; b.textContent = 'Install app'; b.title = 'Install Quantis as an app (works offline for charts and saved data)';
    b.onclick = async () => { deferred.prompt(); const r = await deferred.userChoice; if(r.outcome==='accepted') b.remove(); };
    const bar = document.getElementById('topbar'); if(bar) bar.insertBefore(b, bar.lastElementChild); });
});
runInit('deep links (#view)', ()=>{
  // index.html#explorer / #charts / #reports … (also used by the PWA shortcuts in manifest.webmanifest)
  const open = () => { const v = (location.hash||'').slice(1); if(v && document.getElementById('view-'+v)) goto(v); };
  window.addEventListener('hashchange', open); setTimeout(open, 50);
});
