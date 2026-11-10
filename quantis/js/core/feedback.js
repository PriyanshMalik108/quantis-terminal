/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/core/feedback.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Toast notifications and the in-app text prompt (askText) that replaces window.prompt.
 * DEPENDS   core/storage.js
 * EXPOSES   toast(msg,type), askText(title,hint,placeholder,validate) (global — classic script, shared scope)
 * LOAD      Classic <script>, order defined in js/manifest.json. Top-level code runs at load,
 *           so it may only call functions from files listed EARLIER in the manifest.
 * NOTE      Migrated verbatim from the single-file build; inline comments marked
 *           "REAL BUG FIXED" / "post-launch fix" document past defects — keep them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* ===================== TOASTS + IN-APP PROMPT =====================
   Blocking window.alert()/prompt() popups were replaced with non-blocking toasts and a themed
   input dialog: toast() freezes the whole page (including live-data fetches and charts), looks
   out of place against the terminal theme, and is suppressed entirely inside some embedded
   browsers/webviews, which made those actions look like they silently did nothing. */
function toast(msg, type){
  const host = document.getElementById('toastHost');
  if(!host){ console.log('[toast]', msg); return; }
  const kind = type || (/fail|error|isn't|not |invalid|blocked|empty/i.test(String(msg)) ? 'err' : 'ok');
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.setAttribute('role', kind==='err'?'alert':'status');
  el.innerHTML = `<div>${escapeHtml(String(msg))}</div><button class="tclose" aria-label="Dismiss">×</button>`;
  const close = ()=>{ el.classList.add('out'); setTimeout(()=>el.remove(), 200); };
  el.querySelector('.tclose').addEventListener('click', close);
  host.appendChild(el);
  while(host.children.length > 4) host.firstChild.remove();
  setTimeout(close, kind==='err' ? 6500 : 3800);
}
function askText(title, hint, placeholder, validate){
  return new Promise(resolve=>{
    const ov = document.getElementById('askOverlay');
    const inp = document.getElementById('askInput'), err = document.getElementById('askError');
    document.getElementById('askTitle').textContent = title;
    document.getElementById('askHint').textContent = hint || '';
    inp.value = ''; inp.placeholder = placeholder || ''; err.textContent = '';
    ov.classList.add('show');
    setTimeout(()=>inp.focus(), 60);
    const done = (val)=>{ ov.classList.remove('show'); okBtn.onclick = cancelBtn.onclick = inp.onkeydown = ov.onclick = null; resolve(val); };
    const okBtn = document.getElementById('askOk'), cancelBtn = document.getElementById('askCancel');
    const submit = ()=>{
      const v = inp.value.trim();
      if(!v){ err.textContent = 'Please enter a value.'; return; }
      const problem = validate ? validate(v) : null;
      if(problem){ err.textContent = problem; return; }
      done(v);
    };
    okBtn.onclick = submit;
    cancelBtn.onclick = ()=>done(null);
    inp.onkeydown = e=>{ if(e.key==='Enter'){ e.preventDefault(); submit(); } if(e.key==='Escape'){ e.preventDefault(); done(null); } };
    ov.onclick = e=>{ if(e.target===ov) done(null); };
  });
}
function setDataPill(live){
  const pill = document.getElementById('dataPill'), txt = document.getElementById('dataPillText');
  if(!pill || !txt) return;
  pill.classList.toggle('live', !!live); pill.classList.toggle('sample', !live);
  txt.textContent = live ? 'LIVE DATA' : 'SAMPLE DATA';
}
