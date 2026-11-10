/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/data/proxy-chain.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Optional user-configured CORS proxy (Settings) for sources that block browsers.
 * DEPENDS   core/*
 * EXPOSES   getCustomProxy, proxiedFetch (global — classic script, shared scope)
 * LOAD      Classic <script>, order defined in js/manifest.json. Top-level code runs at load,
 *           so it may only call functions from files listed EARLIER in the manifest.
 * NOTE      Migrated verbatim from the single-file build; inline comments marked
 *           "REAL BUG FIXED" / "post-launch fix" document past defects — keep them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/* ===================== SHARED CORS-PROXY ATTEMPT CHAIN =====================
   Used by both Stooq (prices) and SEC EDGAR (fundamentals) — both confirmed to lack
   browser CORS support, so both need: direct attempt -> user's own proxy -> public
   fallback proxy, in that order, with every attempt disclosed on failure. */
/* Every free public CORS proxy gets abused, rate-limited, or blocked at different times —
   corsproxy.io alone (the old single fallback) is a common single point of failure. This now
   tries direct, then your own proxy (if configured — the one truly reliable option, see
   downloadProxyWorker below), then THREE different public proxies in sequence, each capped at
   8s so one hanging proxy can't stall the whole chain. On total failure it reports every single
   attempt's own error (not just the last one) so a real diagnosis is possible instead of one
   opaque "HTTP 400". Still never fabricates: if every one fails, that's disclosed honestly. */
/* Timeout without AbortController/AbortSignal — this sandbox's preview environment relays
   fetch() calls to a parent frame via postMessage, and AbortSignal objects cannot survive the
   structured-clone algorithm that postMessage uses. Attaching one to fetch's options (the
   previous implementation: `signal: ctrl.signal`) threw "Failed to execute 'postMessage' on
   'Window': AbortSignal object could not be cloned" on literally the first line of every single
   live-data attempt in the whole app — the root cause of every source showing "all N attempts
   failed" simultaneously. Promise.race achieves the same effective timeout (the caller stops
   waiting after `ms`) without ever creating or passing an AbortSignal, so it's safe in both this
   sandboxed preview AND a normal deployed browser. The one real tradeoff: the underlying network
   request isn't actually cancelled when the timeout wins the race, it just stops being awaited —
   acceptable, since the alternative was every live feature being completely broken. */
async function fetchWithTimeout(url, opts, ms){
  const timeoutPromise = new Promise((_, reject) => setTimeout(()=>reject(new Error('timed out after '+ms+'ms')), ms));
  return await Promise.race([fetch(url, opts), timeoutPromise]);
}
async function fetchViaProxyChain(targetUrl, extraHeaders){
  const attempts = [];
  attempts.push({label:'direct', url: targetUrl});
  const custom = getCustomProxy();
  if(custom) attempts.push({label:'your proxy', url: custom + encodeURIComponent(targetUrl)});
  // Previously tried corsproxy.io first among the public fallbacks — as of 2026 its free tier
  // has tightened to mostly localhost/dev-tool origins and was returning HTTP 404 for real
  // deployed sites in testing, so it's now tried last instead of first. Corsfix and cors.x2u.in
  // are currently the more reliable no-signup options for a real deployed origin like GitHub
  // Pages; codetabs and allorigins remain solid middle options. This list reflects what's
  // actually working right now, not what used to be — free proxy availability shifts over time
  // and this is the kind of thing worth re-checking periodically, same as any dependency.
  /* REAL BUG FIXED HERE: this was requesting the wrong domain entirely. Corsfix's actual proxy
     endpoint lives on the "proxy." subdomain (proxy.corsfix.com), not bare corsfix.com — and its
     URL format is a literal "?" prefix directly before the raw target URL (confirmed against
     Corsfix's own official GitHub repo: fetch("https://proxy.corsfix.com/?https://example.com")),
     not "corsfix.com/" + url like this was doing. The previous URL pointed at Corsfix's marketing
     site, not its proxy — guaranteed to fail every time, exactly matching this attempt's
     "public proxy (corsfix.com)" failure seen in testing. */
  /* The free public CORS proxies previously tried here (corsfix, allorigins, codetabs, cors.x2u,
     corsproxy.io) were all re-tested from a real browser in Oct 2026: every one is now dead,
     rate-blocked or paywalled. Each added up to 8 s of timeout before failing, so a single card
     could take ~40 s to give up. Only direct + your own proxy remain; everything that matters is
     now served by keyless, CORS-open providers (see the live data layer) and never reaches here. */

  // "Sticky" ordering: once ANY provider succeeds in this browser tab's session, try it FIRST
  // on every subsequent call instead of re-walking the whole list from the top every time. Pure
  // zero-config automatic behavior — nothing to set up, just makes repeat requests faster and
  // more likely to succeed once a working path has actually been found for this session.
  let lastGood = null;
  try{ lastGood = sessionStorage.getItem('quantis_last_good_proxy'); }catch(e){}
  if(lastGood){
    const idx = attempts.findIndex(a=>a.label===lastGood);
    if(idx > 0){ const [a] = attempts.splice(idx,1); attempts.unshift(a); }
  }

  const failures = [];
  for(const a of attempts){
    try{
      const res = await fetchWithTimeout(a.url, {mode:'cors', headers: extraHeaders||{}}, 8000);
      if(!res.ok) throw new Error('HTTP '+res.status);
      try{ sessionStorage.setItem('quantis_last_good_proxy', a.label); }catch(e){}
      return {res, via: a.label};
    }catch(err){
      // err.name is never 'AbortError' anymore — the AbortController/AbortSignal timeout
      // mechanism was removed (see fetchWithTimeout above); Promise.race's timeout rejects with
      // a plain Error carrying its own "timed out after Nms" message, which err.message already
      // captures below, so no special-casing is needed here anymore.
      const reason = err.message || 'network error (often means: blocked, or page not served over http/https)';
      failures.push(`${a.label} — ${reason}`);
    }
  }
  // Report every attempt, not just the last — a single "HTTP 400" told you nothing about
  // the other providers that were also tried and also failed before it.
  // The full per-route failure list used to be put straight into the error message, producing
  // multi-line red walls of text in every card. It now goes to the console; the UI gets one line.
  console.warn('[Quantis] '+targetUrl.slice(0,120)+' unreachable →', failures);
  const err = new Error('live source unreachable (direct + '+(attempts.length-1)+' proxy routes failed)');
  err.details = failures;
  throw err;
}

/* Stooq CSV provider — free, keyless, official CORS not guaranteed.
   Fallback chain: direct → user's own proxy (if configured) → public fallback proxy → sample data.
   Never fabricates: every stage that fails is disclosed in the Data Quality panel. */
function getCustomProxy(){
  try{
    let v = (safeStorage.getItem('quantis_key_customproxy')||'').trim();
    if(!v) return '';
    // Root cause of "your proxy — HTTP 400" even with a correctly deployed worker: the worker
    // returns 400 for any request with no ?url= query param at all, and that's exactly what
    // happens if the saved value doesn't already end in "?url=" — the app was concatenating the
    // target URL straight onto whatever was saved with zero normalization, so a small formatting
    // difference in what got pasted (missing "?url=", or pasted mid-typing) silently produced a
    // malformed request that LOOKED like the worker itself was broken. Now the base URL is always
    // rebuilt from scratch into the correct shape regardless of how it was originally pasted.
    let base = v.replace(/[?&]url=?.*$/i, ''); // strip any existing (possibly malformed) url-param suffix
    base = base.replace(/\/+$/, ''); // strip trailing slash(es)
    if(!/^https?:\/\//i.test(base)) return ''; // not a usable URL at all — treat as unset rather than guess
    return base + '/?url=';
  }catch(e){ return ''; }
}
function parseStooqCsv(text){
  const lines = text.trim().split('\n');
  if(lines.length < 5 || !lines[0].toLowerCase().startsWith('date')) throw new Error('Unexpected Stooq response');
  const rows = lines.slice(1).map(l=>l.split(','));
  // Stooq's CSV is Date,Open,High,Low,Close,Volume — capture real OHLC, not just Close.
  const opens = rows.map(r=>parseFloat(r[1]));
  const highs = rows.map(r=>parseFloat(r[2]));
  const lows = rows.map(r=>parseFloat(r[3]));
  const closes = rows.map(r=>parseFloat(r[4])).filter(v=>!isNaN(v));
  const dates = rows.map(r=>r[0]);
  // Was hardcoded to the last 180 days regardless of how much real history Stooq actually
  // returned (Stooq's CSV typically goes back years) — the direct cause of technicals/charts
  // never actually reflecting multi-year history even when it was sitting right there in the
  // response. Now keeps up to ~10 years (2600 trading days) of what Stooq gives back.
  const HIST_DAYS = 2600;
  const tail = closes.slice(-HIST_DAYS);
  const tailDates = dates.slice(-HIST_DAYS);
  const tailOpen = opens.slice(-HIST_DAYS), tailHigh = highs.slice(-HIST_DAYS), tailLow = lows.slice(-HIST_DAYS);
  if(tail.length < 10) throw new Error('Too little Stooq history');
  return {labels: tailDates, data: tail, ohlc: {open:tailOpen, high:tailHigh, low:tailLow, close:tail},
    lastDate: tailDates[tailDates.length-1], lastClose: tail[tail.length-1], prevClose: tail[tail.length-2]};
}
async function fetchStooqHistoryLive(ticker){
  const stooqUrl = `https://stooq.com/q/d/l/?s=${ticker.toLowerCase()}.us&i=d`;
  const {res, via} = await fetchViaProxyChain(stooqUrl);
  const text = await res.text();
  const parsed = parseStooqCsv(text);
  parsed.via = via;
  return parsed;
}
async function fetchStooqHistory(ticker){
  return cachedFetch('stooq_'+ticker, 15*60*1000, ()=>fetchStooqHistoryLive(ticker));
}
