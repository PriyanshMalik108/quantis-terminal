/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantis Terminal · js/modules/reports/themes.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE   Report colour themes. Every renderer (HTML preview, PDF, Word, PowerPoint, Excel,
 *           chart images) reads colours ONLY from the resolved theme object, so a user's
 *           choice — preset or custom colours — applies identically to every export format.
 * THEME     {id, name, primary (headings, header bands), accent (highlights, KPI rules),
 *            ink (body text), muted (secondary text), rule (table lines), soft (zebra/tile fill),
 *            up, down, font: 'serif'|'sans', series:[chart colours]}
 * CUSTOM    QXTH.resolve({base:'navy', primary:'#123456', accent:'#c9a227', font:'sans'}) overlays
 *           the user's picks on a preset. Saved per browser (qxr_theme_v2).
 * EXPOSES   QXTH.{PRESETS, resolve(opt), hex2rgb(hex), mix(a,b,t), load(), save(opt)}
 * ─────────────────────────────────────────────────────────────────────────────
 */
const QXTH = (() => {
  const PRESETS = {
    navy:     {name:'Institutional Navy', primary:'#1F3A5F', accent:'#C9A227', ink:'#14181F', muted:'#5B6573', rule:'#D6DCE4', soft:'#F3F6F9', up:'#1E7B4F', down:'#B23A3A', font:'serif'},
    emerald:  {name:'Emerald',            primary:'#0F5132', accent:'#D4A017', ink:'#14181F', muted:'#55615A', rule:'#D3E2D9', soft:'#F1F7F3', up:'#1E7B4F', down:'#B23A3A', font:'serif'},
    charcoal: {name:'Charcoal & Copper',  primary:'#2B2F36', accent:'#C46A2B', ink:'#16181C', muted:'#5E636B', rule:'#DADDE1', soft:'#F4F5F6', up:'#2E7D4F', down:'#B23A3A', font:'sans'},
    burgundy: {name:'Burgundy',           primary:'#6B1E2E', accent:'#B08D57', ink:'#1A1416', muted:'#6A5A5E', rule:'#E5D7DA', soft:'#F8F2F3', up:'#2E7D4F', down:'#9E2A2A', font:'serif'},
    royal:    {name:'Royal Blue',         primary:'#1D3FBB', accent:'#F2A900', ink:'#111827', muted:'#4B5563', rule:'#D7DEF3', soft:'#F2F5FD', up:'#15803D', down:'#B91C1C', font:'sans'},
    teal:     {name:'Teal Modern',        primary:'#0E5E6F', accent:'#F28C28', ink:'#132024', muted:'#526469', rule:'#D2E3E6', soft:'#EFF6F7', up:'#15803D', down:'#B91C1C', font:'sans'},
    slate:    {name:'Slate & Gold',       primary:'#334155', accent:'#B8860B', ink:'#0F172A', muted:'#64748B', rule:'#DCE1E8', soft:'#F5F7FA', up:'#15803D', down:'#B91C1C', font:'serif'},
    mono:     {name:'Monochrome (print)', primary:'#111111', accent:'#555555', ink:'#111111', muted:'#555555', rule:'#CCCCCC', soft:'#F2F2F2', up:'#111111', down:'#111111', font:'serif'},
  };
  const hex2rgb = h => { const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(h||''); return m ? [parseInt(m[1],16), parseInt(m[2],16), parseInt(m[3],16)] : [0,0,0]; };
  const rgb2hex = a => '#'+a.map(x=>Math.max(0,Math.min(255,Math.round(x))).toString(16).padStart(2,'0')).join('');
  const mix = (a, b, t) => { const A = hex2rgb(a), B = hex2rgb(b); return rgb2hex(A.map((x,i)=>x+(B[i]-x)*t)); };
  function resolve(opt={}){
    const base = PRESETS[opt.base] || PRESETS.navy;
    const valid = h => /^#[\da-f]{6}$/i.test(h||'');
    const th = {...base, id:opt.base||'navy'};
    if(valid(opt.primary)) th.primary = opt.primary;
    if(valid(opt.accent)) th.accent = opt.accent;
    if(opt.font==='serif' || opt.font==='sans') th.font = opt.font;
    th.soft = valid(opt.primary) ? mix(th.primary, '#FFFFFF', 0.94) : th.soft;
    th.rule = valid(opt.primary) ? mix(th.primary, '#FFFFFF', 0.82) : th.rule;
    th.series = [th.primary, th.accent, mix(th.primary,'#FFFFFF',0.45), th.up, mix(th.accent,'#000000',0.3), th.down, '#6B7280'];
    th.fontCss = th.font==='serif' ? "Georgia,'Times New Roman',serif" : "Inter,'Segoe UI',Arial,sans-serif";
    th.pdfFont = th.font==='serif' ? 'times' : 'helvetica';
    th.docxFont = th.font==='serif' ? 'Georgia' : 'Calibri';
    return th;
  }
  const load = () => { try{ return JSON.parse(safeStorage.getItem('qxr_theme_v2')||'{}'); }catch(e){ return {}; } };
  const save = opt => { try{ safeStorage.setItem('qxr_theme_v2', JSON.stringify(opt)); }catch(e){} };
  return {PRESETS, resolve, hex2rgb, rgb2hex, mix, load, save};
})();
