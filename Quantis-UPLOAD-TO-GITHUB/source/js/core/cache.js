/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/core/cache.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   cachedFetch(key, ttl, fn) — memory + localStorage cache used by all providers.
 * DEPENDS   core/storage.js
 * EXPOSES   cachedFetch, fetchWithTimeout (global — classic script, shared scope)
 * LOAD      Classic <script>, order defined in js/manifest.json. Top-level code runs at load,
 *           so it may only call functions from files listed EARLIER in the manifest.
 * NOTE      Migrated verbatim from the single-file build; inline comments marked
 *           "REAL BUG FIXED" / "post-launch fix" document past defects — keep them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* ===================== CACHE LAYER (spec section 43) =====================
   Every live fetch goes through this: check fresh cache -> fetch -> store with
   timestamp+source -> on total failure, serve stale cache if any exists (offline mode)
   before ever falling back to sample data. Nothing here is fabricated: cache reads
   are always labeled with their real fetch timestamp, and staleness is disclosed. */
/* Two-tier cache. Large payloads (10 years of daily OHLC is ~200 KB per ticker) used to be
   written straight to localStorage, which fills its ~5 MB quota after a couple of dozen tickers —
   after which EVERY write fails silently, including the user's own workspaces, portfolio and
   alerts. Big entries now live in memory for the session; only small ones are persisted. */
function reviveDates(v){
  if(typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/.test(v)) return new Date(v);
  if(Array.isArray(v)) return v.map(reviveDates);
  if(v && typeof v === 'object' && !(v instanceof Date)){ const o = {}; for(const k in v) o[k] = reviveDates(v[k]); return o; }
  return v;
}
function cacheGet(key){
  if(MEM_CACHE.has(key)) return MEM_CACHE.get(key);
  try{ const raw = safeStorage.getItem('quantis_cache_'+key); if(!raw) return null; const e = JSON.parse(raw); e.value = reviveDates(e.value); return e; }catch(e){ return null; }
}
function cacheSet(key, value, source){
  const entry = {value, source, ts: Date.now()};
  MEM_CACHE.set(key, entry);
  try{
    const json = JSON.stringify(entry);
    if(json.length <= PERSIST_LIMIT) safeStorage.setItem('quantis_cache_'+key, json);
  }catch(e){ /* storage unavailable/full — live fetch still works, just not persisted */ }
}
/* One-time cleanup of oversized cache entries written by earlier versions (they can starve the
   quota needed for the user's own saved data). */
(function pruneOversizedCache(){
  try{
    const ls = window.localStorage; const drop = [];
    for(let i=0;i<ls.length;i++){ const k = ls.key(i); if(k && k.startsWith('quantis_cache_')){ const v = ls.getItem(k); if(v && v.length > PERSIST_LIMIT) drop.push(k); } }
    drop.forEach(k=>ls.removeItem(k));
  }catch(e){}
})();
async function cachedFetch(key, ttlMs, fetchFn){
  const cached = cacheGet(key);
  if(cached && (Date.now() - cached.ts) < ttlMs){
    return {...cached.value, via: cached.source, cacheStatus: 'fresh cache', cachedAt: new Date(cached.ts).toLocaleTimeString()};
  }
  try{
    const result = await fetchFn();
    cacheSet(key, result, result.via);
    return {...result, cacheStatus: 'live fetch', cachedAt: new Date().toLocaleTimeString()};
  }catch(err){
    if(cached){
      // Offline-mode fallback: serve stale cache rather than sample, and say so honestly.
      return {...cached.value, via: cached.source, cacheStatus: `stale cache (live fetch failed: ${escapeHtml(err.message)})`, cachedAt: new Date(cached.ts).toLocaleTimeString()};
    }
    throw err;
  }
}

/**
 * cachedJson(key, ttlMs, fetchFn) — like cachedFetch but returns the value UNCHANGED.
 * DEVELOPER NOTE: cachedFetch spreads the result into a new object to attach cache metadata,
 * which turns arrays into {0:…,1:…} and overwrites any `via` field. New code (v4 modules) uses
 * this wrapper instead, which stores {v: value} and hands back exactly what fetchFn returned.
 * Same storage, same stale-on-error fallback.
 */
async function cachedJson(key, ttlMs, fetchFn){
  const r = await cachedFetch('j:'+key, ttlMs, async () => ({v: await fetchFn()}));
  return r.v;
}
