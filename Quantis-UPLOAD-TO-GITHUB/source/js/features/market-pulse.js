/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/features/market-pulse.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Live market pulse strip.
 * DEPENDS   data/*
 * EXPOSES   fetchLivePulse (global — classic script, shared scope)
 * LOAD      Classic <script>, order defined in js/manifest.json. Top-level code runs at load,
 *           so it may only call functions from files listed EARLIER in the manifest.
 * NOTE      Migrated verbatim from the single-file build; inline comments marked
 *           "REAL BUG FIXED" / "post-launch fix" document past defects — keep them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* ===================== LIVE MARKET PULSE (CoinGecko + Frankfurter — free, keyless) ===================== */
/* Home v2: the pulse card is user-configurable and rendered by QXH (js/features/home.js). */
async function fetchLivePulse(){ if(typeof QXH!=='undefined') return QXH.refreshPulse(); return fetchLivePulseLegacy(); }
async function fetchLivePulseLegacy(){
  const badge = document.getElementById('pulseBadge');
  const note = document.getElementById('pulseNote');
  let ok = 0, fail = 0, notes = [];
  try{
    const d = await cachedFetch('crypto_btc_eth', 5*60*1000, async ()=>{
      const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd');
      if(!r.ok) throw new Error('HTTP '+r.status);
      const j = await r.json();
      return {btc:j.bitcoin.usd, eth:j.ethereum.usd, via:'CoinGecko'};
    });
    document.getElementById('pulseBtc').textContent = '$'+d.btc.toLocaleString();
    document.getElementById('pulseEth').textContent = '$'+d.eth.toLocaleString();
    if(d.cacheStatus!=='live fetch') notes.push(`crypto: ${d.cacheStatus} (as of ${d.cachedAt})`);
    ok++;
  }catch(e){
    document.getElementById('pulseBtc').textContent = 'unavailable';
    document.getElementById('pulseEth').textContent = 'unavailable';
    fail++;
  }
  try{
    const d = await cachedFetch('fx_eurusd', 5*60*1000, async ()=>{
      const r = await fetch('https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD');
      if(!r.ok) throw new Error('HTTP '+r.status);
      const j = await r.json();
      return {rate:j.rates.USD, via:'Frankfurter/ECB'};
    });
    document.getElementById('pulseEurUsd').textContent = d.rate.toFixed(4);
    if(d.cacheStatus!=='live fetch') notes.push(`EUR/USD: ${d.cacheStatus} (as of ${d.cachedAt})`);
    ok++;
  }catch(e){
    document.getElementById('pulseEurUsd').textContent = 'unavailable';
    fail++;
  }
  try{
    const d = await cachedFetch('fx_usdinr', 5*60*1000, async ()=>{
      const r = await fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR');
      if(!r.ok) throw new Error('HTTP '+r.status);
      const j = await r.json();
      return {rate:j.rates.INR, via:'Frankfurter/ECB'};
    });
    document.getElementById('pulseUsdInr').textContent = d.rate.toFixed(2);
    if(d.cacheStatus!=='live fetch') notes.push(`USD/INR: ${d.cacheStatus} (as of ${d.cachedAt})`);
    ok++;
  }catch(e){
    document.getElementById('pulseUsdInr').textContent = 'unavailable';
    fail++;
  }
  if(fail===0){ badge.textContent='LIVE'; badge.className='badge fact'; note.textContent = notes.length ? notes.join(' · ') : 'Live as of this page load — CoinGecko (crypto) and Frankfurter/ECB (FX), both free and keyless, cached for 5 minutes.'; }
  else if(ok===0){ badge.textContent='UNAVAILABLE'; badge.className='badge'; badge.style.color='var(--down)'; note.textContent='Could not reach the live providers, and no cached values are available from a prior successful fetch in this browser. Not showing fabricated numbers.'; }
  else { badge.textContent='PARTIAL'; badge.className='badge model'; note.textContent='Some live feeds succeeded, some did not — see "unavailable" fields above.'+(notes.length?' '+notes.join(' · '):''); }
}
document.getElementById('helpOverlay').addEventListener('click', e=>{ if(e.target.id==='helpOverlay') e.target.classList.remove('show'); });
document.addEventListener('keydown', e=>{
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='k'){ e.preventDefault(); openPalette(); }
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='f'){ e.preventDefault(); openPalette(); }
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='e'){ e.preventDefault(); goto('export'); }
  // BUG FIXED: Ctrl+S was advertised in both the Save button's tooltip and the in-app Shortcuts
  // help screen, but no handler for it actually existed — pressing it did nothing (or worse,
  // would have triggered the browser's native "Save Page As" dialog once a listener existed
  // without preventDefault). Now genuinely wired to the same saveWorkspace() the button calls.
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='s'){ e.preventDefault(); saveWorkspace(); }
  const ae = document.activeElement;
  const typing = ae && (['INPUT','TEXTAREA','SELECT'].includes(ae.tagName) || ae.isContentEditable);
  if(e.key==='?' && !typing){ document.getElementById('helpOverlay').classList.add('show'); }
  if(e.key==='Escape'){
    closePalette();
    ['helpOverlay','settingsOverlay','notesOverlay'].forEach(id=>document.getElementById(id).classList.remove('show'));
    toggleMoreSheet(false);
    document.getElementById('rightrail').classList.remove('mobile-show');
  }
});
