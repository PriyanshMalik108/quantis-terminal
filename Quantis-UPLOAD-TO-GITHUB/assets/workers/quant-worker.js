/* Quantis Terminal · assets/workers/quant-worker.js — runs the C++ quant core (WebAssembly) off the
   main thread. Messages: {id, fn, args} → {id, ok, result | error}. See js/core/quantcore.js. */
let Q = null, ready = null;
function load(){
  if(ready) return ready;
  ready = (async () => {
    const res = await fetch(new URL('../wasm/quantcore.wasm', self.location.href));
    const bytes = await res.arrayBuffer();
    const {instance} = await WebAssembly.instantiate(bytes, {});
    Q = instance.exports; return true;
  })();
  return ready;
}
const F64 = () => new Float64Array(Q.memory.buffer);
function put(arr){ const p = Q.qc_alloc(arr.length*8); F64().set(arr, p/8); return p; }
function get(p, n){ return Array.from(new Float64Array(Q.memory.buffer, p, n)); }
const fns = {
  corr({series, method}){ const m = series.length, n = series[0].length; const flat = new Float64Array(m*n); series.forEach((s,i)=>flat.set(s, i*n)); const px = put(flat), po = Q.qc_alloc(m*m*8); Q.qc_corr_matrix(px, m, n, method==='spearman'?1:0, po); const o = get(po, m*m); return Array.from({length:m}, (_,i)=>o.slice(i*m, i*m+m)); },
  rolling({a, b, w}){ const n = a.length, pa = put(a), pb = put(b), pc = Q.qc_alloc(n*8), pbe = Q.qc_alloc(n*8); const k = Q.qc_rolling(pa, pb, n, w, pc, pbe); return {corr:get(pc,k), beta:get(pbe,k)}; },
  stats({r}){ const p = put(r), o = Q.qc_alloc(12*8); Q.qc_stats(p, r.length, o); const v = get(o, 12); return {mean:v[0], sd:v[1], skew:v[2], kurt:v[3], min:v[4], max:v[5], var95:v[6], cvar95:v[7], var99:v[8], cvar99:v[9], downside:v[10], n:v[11]}; },
  drawdown({p}){ const pp = put(p), o = Q.qc_alloc(24); Q.qc_drawdown(pp, p.length, o); const v = get(o, 3); return {depth:v[0], peak:v[1], trough:v[2]}; },
  gbm({s0, mu, sigma, days, paths, seed}){ Q.qc_seed(seed ?? Date.now()%1e9); const po = Q.qc_alloc(paths*8); Q.qc_gbm(s0, mu, sigma, days, paths, po); return get(po, paths); },
  returns({p, log}){ const pp = put(p), po = Q.qc_alloc(p.length*8); const k = Q.qc_returns(pp, p.length, po, log?1:0); return get(po, k); },
};
self.onmessage = async e => {
  const {id, fn, args} = e.data || {};
  try{ await load(); Q.qc_reset(); const t0 = performance.now(); const result = fns[fn](args); self.postMessage({id, ok:true, result, ms: performance.now()-t0}); }
  catch(err){ self.postMessage({id, ok:false, error: String(err && err.message || err)}); }
};
