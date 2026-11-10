/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/modules/reports/visuals.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Turns chart SPECS in a report model into themed PNG/JPEG images (white background)
 *           so the same picture can go into HTML, PDF, Word and PowerPoint. Rendered off-screen
 *           with Chart.js (no animation); the gauge is drawn directly on a canvas.
 * SPEC KINDS line · bar · waterfall · doughnut · radar · football · gauge · hist
 *   line      {kind, title, labels, series:[{name,data,dash?,fill?}], yFmt?:'pct'|'money'|'num', log?}
 *   bar       {kind, title, labels, series:[…], stacked?, horizontal?, yFmt?}
 *   waterfall {kind, title, steps:[[label, value, 'abs'|'sub'?]], yFmt}
 *   doughnut  {kind, title, labels, data}
 *   radar     {kind, title, labels, series:[{name,data}], max?}
 *   football  {kind, title, rows:[{label, lo, hi}], marker?:{value,label}, xFmt?}
 *   gauge     {kind, title, value 0–100, label}
 *   hist      {kind, title, data:[returns %], bins?}
 * EXPOSES   QXRV.render(specs, theme, ccy) → {key: {png, jpg, w, h}}
 * ─────────────────────────────────────────────────────────────────────────────
 */
const QXRV = (() => {
  const W = 1600, H = 720;
  const fmtMoney = (v, ccy) => typeof fmtAmtCcy==='function' ? fmtAmtCcy(v, ccy) : String(v);
  const yf = (f, ccy) => f==='pct' ? (v=>v.toFixed(0)+'%') : f==='money' ? (v=>fmtMoney(v, ccy)) : f==='x' ? (v=>v.toFixed(1)+'×') : (v=>Math.abs(v)>=1e6 ? (v/1e6).toFixed(1)+'M' : Number(v).toLocaleString(undefined,{maximumFractionDigits:2}));
  function canvas(w=W, h=H){ const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  const bgPlugin = {id:'qxbg', beforeDraw:ch=>{ const g = ch.ctx; g.save(); g.fillStyle = '#FFFFFF'; g.fillRect(0,0,ch.width,ch.height); g.restore(); }};
  function chartJs(spec, th, ccy){
    const font = {family: th.font==='serif' ? 'Georgia' : 'Arial', size:22}, tick = {color:th.muted, font}, grid = {color:th.rule};
    const title = spec.title ? {display:true, text:spec.title, color:th.ink, font:{...font, size:26, weight:'bold'}, align:'start', padding:{bottom:18}} : {display:false};
    const legend = {labels:{color:th.ink, font, boxWidth:22}};
    const col = i => th.series[i % th.series.length];
    let cfg;
    if(spec.kind==='line') cfg = {type:'line', data:{labels:spec.labels, datasets:spec.series.map((s,i)=>({label:s.name, data:s.data, borderColor:s.color||col(i), backgroundColor:QXTH.mix(s.color||col(i),'#FFFFFF',0.85), borderWidth:s.width||3.2, pointRadius:0, tension:0.15, fill:!!s.fill, borderDash:s.dash?[10,7]:[]}))},
      options:{plugins:{title, legend:{...legend, display:spec.series.length>1}}, scales:{x:{ticks:{...tick, maxTicksLimit:8, maxRotation:0}, grid:{display:false}}, y:{type:spec.log?'logarithmic':'linear', ticks:{...tick, maxTicksLimit:7, autoSkip:true, callback:function(v){ if(spec.log){ const e = Math.log10(Math.abs(v)); if(Math.abs(e-Math.round(e))>1e-9 && !/^[125]/.test(String(Math.abs(v)))) return ''; } return yf(spec.yFmt, ccy)(v); }}, grid}}}};
    else if(spec.kind==='bar') cfg = {type:'bar', data:{labels:spec.labels, datasets:spec.series.map((s,i)=>({label:s.name, data:s.data, backgroundColor:s.colors || s.color || col(i), borderRadius:6, maxBarThickness:90}))},
      options:{indexAxis:spec.horizontal?'y':'x', plugins:{title, legend:{...legend, display:spec.series.length>1}}, scales:{x:{stacked:!!spec.stacked, ticks:{...tick, ...(spec.horizontal?{callback:yf(spec.yFmt, ccy)}:{})}, grid:{display:!!spec.horizontal, color:th.rule}}, y:{stacked:!!spec.stacked, ticks:{...tick, ...(spec.horizontal?{}:{callback:yf(spec.yFmt, ccy)})}, grid:{display:!spec.horizontal, color:th.rule}}}}};
    else if(spec.kind==='waterfall'){ let run = 0; const data = [], colors = [];
      spec.steps.forEach(([l,v,k])=>{ if(k==='abs' || k==='sub'){ data.push([0,v]); run = v; colors.push(k==='abs'?th.primary:th.accent); } else { data.push([run, run+v]); run += v; colors.push(v>=0?th.up:th.down); } });
      cfg = {type:'bar', data:{labels:spec.steps.map(s=>s[0]), datasets:[{data, backgroundColor:colors, borderRadius:5}]}, options:{plugins:{title, legend:{display:false}}, scales:{x:{ticks:{...tick, font:{...font, size:18}, maxRotation:0, autoSkip:false, callback:function(v){ const s = this.getLabelForValue(v); return s.length>16 ? s.split(' ').reduce((a,w)=>{ const l = a[a.length-1]; if((l+' '+w).trim().length>14) a.push(w); else a[a.length-1] = (l+' '+w).trim(); return a; }, ['']) : s; }}, grid:{display:false}}, y:{ticks:{...tick, callback:yf(spec.yFmt, ccy)}, grid}}}}; }
    else if(spec.kind==='doughnut') cfg = {type:'doughnut', data:{labels:spec.labels, datasets:[{data:spec.data, backgroundColor:spec.labels.map((_,i)=>col(i)), borderColor:'#fff', borderWidth:4}]}, options:{cutout:'58%', plugins:{title, legend:{...legend, position:'right'}}}};
    else if(spec.kind==='radar') cfg = {type:'radar', data:{labels:spec.labels, datasets:spec.series.map((s,i)=>({label:s.name, data:s.data, borderColor:col(i), backgroundColor:QXTH.mix(col(i),'#FFFFFF',0.75)+'B0', borderWidth:3, pointRadius:4, pointBackgroundColor:col(i)}))}, options:{plugins:{title, legend:{...legend, display:spec.series.length>1}}, scales:{r:{min:0, max:spec.max||100, ticks:{display:false, stepSize:25}, grid:{color:th.rule}, angleLines:{color:th.rule}, pointLabels:{color:th.ink, font:{...font, size:22}}}}}};
    else if(spec.kind==='football'){ const rows = spec.rows.filter(r=>isFinite(r.lo)&&isFinite(r.hi));
      cfg = {type:'bar', data:{labels:rows.map(r=>r.label), datasets:[{data:rows.map(r=>[r.lo, r.hi]), backgroundColor:rows.map((_,i)=>QXTH.mix(th.primary,'#FFFFFF',0.15+0.12*i)), borderRadius:6, barThickness:46}]},
        options:{indexAxis:'y', plugins:{title, legend:{display:false}}, scales:{x:{ticks:{...tick, callback:yf(spec.xFmt||'num', ccy)}, grid}, y:{ticks:{...tick, font:{...font, size:21}}, grid:{display:false}}}},
        plugins:[{id:'mk', afterDatasetsDraw:ch=>{ if(!spec.marker) return; const x = ch.scales.x.getPixelForValue(spec.marker.value); const g = ch.ctx; g.save(); g.strokeStyle = th.down; g.lineWidth = 4; g.setLineDash([12,8]); g.beginPath(); g.moveTo(x, ch.chartArea.top); g.lineTo(x, ch.chartArea.bottom); g.stroke(); g.setLineDash([]); g.fillStyle = th.down; g.font = 'bold 22px Arial'; g.textAlign = 'center'; g.fillText(spec.marker.label, x, ch.chartArea.top - 8); g.restore(); }}]}; }
    else if(spec.kind==='hist'){ const d = spec.data.filter(isFinite); const bins = spec.bins||30; const lo = Math.min(...d), hi = Math.max(...d), w = (hi-lo)/bins || 1; const counts = new Array(bins).fill(0); d.forEach(v=>counts[Math.min(bins-1, Math.floor((v-lo)/w))]++);
      cfg = {type:'bar', data:{labels:counts.map((_,i)=>(lo+w*(i+0.5)).toFixed(1)+'%'), datasets:[{data:counts, backgroundColor:counts.map((_,i)=>lo+w*(i+0.5)<0?th.down:th.up), barPercentage:1, categoryPercentage:0.96}]}, options:{plugins:{title, legend:{display:false}}, scales:{x:{ticks:{...tick, maxTicksLimit:10}, grid:{display:false}}, y:{ticks:tick, grid}}}}; }
    return cfg;
  }
  function gauge(spec, th){
    const c = canvas(900, 520), g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0,0,c.width,c.height);
    const cx = 450, cy = 400, r = 300, v = Math.max(0, Math.min(100, spec.value||0));
    const zones = [[0,25,th.down],[25,45,QXTH.mix(th.down,th.accent,0.6)],[45,65,th.accent],[65,80,QXTH.mix(th.accent,th.up,0.6)],[80,100,th.up]];
    zones.forEach(([a,b,col])=>{ g.beginPath(); g.strokeStyle = col; g.lineWidth = 60; g.arc(cx, cy, r, Math.PI*(1+a/100), Math.PI*(1+b/100)); g.stroke(); });
    const ang = Math.PI*(1+v/100); g.strokeStyle = th.ink; g.lineWidth = 10; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + (r-40)*Math.cos(ang), cy + (r-40)*Math.sin(ang)); g.stroke();
    g.fillStyle = th.ink; g.beginPath(); g.arc(cx, cy, 20, 0, 2*Math.PI); g.fill();
    g.textAlign = 'center'; g.font = 'bold 84px Arial'; g.fillText(String(Math.round(v)), cx, cy - 90); g.font = '30px Arial'; g.fillStyle = th.muted; g.fillText(spec.label||'', cx, cy + 70);
    if(spec.title){ g.font = 'bold 30px Arial'; g.fillStyle = th.ink; g.fillText(spec.title, cx, 44); }
    return c;
  }
  async function render(specs, th, ccy){
    const out = {}; if(typeof Chart==='undefined') return out;
    for(const [key, spec] of Object.entries(specs||{})){
      try{
        let c;
        if(spec.kind==='gauge') c = gauge(spec, th);
        else { c = canvas(spec.w||W, spec.h||H); const cfg = chartJs(spec, th, ccy); if(!cfg) continue; const ch = new Chart(c.getContext('2d'), {...cfg, options:{...cfg.options, animation:false, responsive:false, devicePixelRatio:1, layout:{padding:{left:10,right:24,top:10,bottom:6}}}, plugins:[bgPlugin, ...(cfg.plugins||[])]}); ch.destroy && setTimeout(()=>ch.destroy(), 0); }
        out[key] = {png:c.toDataURL('image/png'), jpg:c.toDataURL('image/jpeg', 0.9), w:c.width, h:c.height};
      }catch(e){ console.warn('[report chart]', key, e); }
    }
    return out;
  }
  return {render};
})();
