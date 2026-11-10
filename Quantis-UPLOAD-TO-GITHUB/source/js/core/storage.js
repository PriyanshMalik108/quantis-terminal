/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/core/storage.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   localStorage wrapper that never throws (private mode, quota, sandboxed iframes) + in-memory/TTL cache primitives used by every data fetch.
 * DEPENDS   nothing
 * EXPOSES   safeStorage, MEM_CACHE helpers (global — classic script, shared scope)
 * LOAD      Classic <script>, order defined in js/manifest.json. Top-level code runs at load,
 *           so it may only call functions from files listed EARLIER in the manifest.
 * NOTE      Migrated verbatim from the single-file build; inline comments marked
 *           "REAL BUG FIXED" / "post-launch fix" document past defects — keep them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* ===================== SAFE STORAGE WRAPPER ===================== */
/* Direct localStorage access throws in some sandboxed/cross-origin iframe contexts (this
   preview environment has already been confirmed to do non-standard things with fetch/
   postMessage — the same class of restriction plausibly extends to storage access) and in
   Safari private browsing mode. Every localStorage call in this app is routed through this
   wrapper so a storage failure degrades to an in-memory fallback (state still works correctly
   for the current session, it just won't survive an actual page reload) instead of throwing and
   silently breaking whatever feature happened to touch it — which, given how many features read
   settings/keys/portfolio/alerts from storage, could plausibly look like "many things broken" if
   even one shared call threw partway through an unrelated function. */
/* Declared first: cachedFetch() is used by code that runs during start-up (e.g. the market-holiday
   loader), and a later `const` here was in its temporal dead zone at that point — the holiday
   calendar always failed silently. */
const MEM_CACHE = new Map();
const PERSIST_LIMIT = 60000;
const safeStorage = (() => {
  let memoryFallback = {};
  let storageWorks = true;
  try{ localStorage.setItem('__quantis_probe__','1'); localStorage.removeItem('__quantis_probe__'); }
  catch(e){ storageWorks = false; }
  return {
    getItem(key){
      if(storageWorks){ try{ return localStorage.getItem(key); }catch(e){ storageWorks = false; } }
      return Object.prototype.hasOwnProperty.call(memoryFallback,key) ? memoryFallback[key] : null;
    },
    setItem(key, val){
      memoryFallback[key] = String(val);
      if(storageWorks){ try{ localStorage.setItem(key, val); }catch(e){ storageWorks = false; } }
    },
    removeItem(key){
      delete memoryFallback[key];
      if(storageWorks){ try{ localStorage.removeItem(key); }catch(e){ storageWorks = false; } }
    },
    get length(){
      if(storageWorks){ try{ return localStorage.length; }catch(e){ storageWorks = false; } }
      return Object.keys(memoryFallback).length;
    },
    key(i){
      if(storageWorks){ try{ return localStorage.key(i); }catch(e){ storageWorks = false; } }
      return Object.keys(memoryFallback)[i] ?? null;
    },
    isReal(){ return storageWorks; }
  };
})();
