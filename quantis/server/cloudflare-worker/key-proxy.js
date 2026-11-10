/**
 * Quantis Terminal · server/cloudflare-worker/key-proxy.js
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY       A website cannot hide anything it sends to the browser — including API keys. For a
 *           public deployment where YOU pay for / own the data keys, put them here instead:
 *           the browser sends the provider URL with the placeholder "__KEY__", this worker checks
 *           the request, injects the secret server-side and returns the provider's JSON.
 * SECURITY  • Only allow-listed upstream hosts (no open proxy).
 *           • Only your site's origin(s) may call it (ALLOWED_ORIGINS).
 *           • Per-IP rate limit (in-memory per isolate; use Cloudflare Rate Limiting or KV for strict limits).
 *           • GET only; responses cached at the edge for CACHE_TTL seconds to save your quota.
 *           • Keys are Worker SECRETS — never in code or git:  wrangler secret put FMP_KEY  (etc.)
 * DEPLOY    npm i -g wrangler && wrangler login
 *           wrangler deploy server/cloudflare-worker/key-proxy.js --name quantis-keys --compatibility-date 2026-01-01
 *           wrangler secret put FMP_KEY / AV_KEY / FINNHUB_KEY
 *           Then in Quantis → Settings → "Key proxy URL" paste https://quantis-keys.<you>.workers.dev
 * ─────────────────────────────────────────────────────────────────────────────
 */
const ALLOWED_ORIGINS = ['https://your-quantis-domain.com', 'http://localhost:8080'];   // ← edit
const UPSTREAMS = { // host → secret name
  'financialmodelingprep.com': 'FMP_KEY',
  'www.alphavantage.co': 'AV_KEY',
  'finnhub.io': 'FINNHUB_KEY',
};
const CACHE_TTL = 6 * 3600, RATE = 60; // requests per minute per IP
const hits = new Map();
export default {
  async fetch(req, env, ctx){
    const origin = req.headers.get('Origin') || '';
    const cors = {'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0], 'Vary':'Origin', 'Access-Control-Allow-Methods':'GET', 'X-Content-Type-Options':'nosniff'};
    if(req.method === 'OPTIONS') return new Response(null, {headers: cors});
    if(req.method !== 'GET') return new Response('Method not allowed', {status:405, headers:cors});
    if(!ALLOWED_ORIGINS.includes(origin)) return new Response('Forbidden origin', {status:403, headers:cors});
    const ip = req.headers.get('CF-Connecting-IP') || 'x', now = Date.now(), w = hits.get(ip) || [];
    const recent = w.filter(t => now - t < 60e3); if(recent.length >= RATE) return new Response('Rate limited', {status:429, headers:cors}); recent.push(now); hits.set(ip, recent);
    let target; try{ target = new URL(new URL(req.url).searchParams.get('url')); }catch(e){ return new Response('Bad url', {status:400, headers:cors}); }
    const secretName = UPSTREAMS[target.hostname];
    if(target.protocol !== 'https:' || !secretName) return new Response('Upstream not allowed', {status:403, headers:cors});
    const secret = env[secretName]; if(!secret) return new Response('Key not configured', {status:503, headers:cors});
    const upstream = target.toString().replace(/__KEY__/g, encodeURIComponent(secret));
    const cache = caches.default, cacheKey = new Request(target.toString(), {method:'GET'});
    let res = await cache.match(cacheKey);
    if(!res){ const r = await fetch(upstream, {headers:{'Accept':'application/json'}}); res = new Response(r.body, {status:r.status, headers:{'Content-Type': r.headers.get('Content-Type')||'application/json', 'Cache-Control':`public, max-age=${CACHE_TTL}`}}); if(r.ok) ctx.waitUntil(cache.put(cacheKey, res.clone())); }
    const out = new Response(res.body, res); Object.entries(cors).forEach(([k,v])=>out.headers.set(k,v)); return out;
  }
};
