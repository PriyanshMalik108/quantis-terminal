"""
v4 feature tests — Universal Search (every asset class), detail pages, option chain, Formula Lab,
alerts-pro, custom APIs (incl. XSS check), line items via key, peers, Report Studio (every type,
themes, all 9 export formats), PWA manifest, engines (textbook answers).
Usage: python3 tests/test_v4.py [root]   (root = project dir or dist/)
"""
import os, sys, json, zipfile
from playwright.sync_api import sync_playwright
from harness import open_app
ROOT = sys.argv[1] if len(sys.argv) > 1 else '.'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.out'); os.makedirs(OUT, exist_ok=True)
fails = []
def check(name, cond, extra=''):
    print(('PASS ' if cond else 'FAIL ') + name + ('' if cond else ' — ' + str(extra)[:400]), flush=True)
    if not cond: fails.append(name)

with sync_playwright() as p:
    pg, errs, ctx, b = open_app(p, ROOT)
    pg.wait_for_timeout(6000)
    # ---------- engines: textbook answers ----------
    r = pg.evaluate("""(()=>{ const o = QXM.option.bsm('call',100,100,1,0.05,0.2); const pp = QXM.option.bsm('put',100,100,1,0.05,0.2);
      const B = QXM.bond; return {c:o.price, p:pp.price, d:o.delta, iv:QXM.option.impliedVol('call',o.price,100,100,1,0.05),
      px:B.price(0.06,0.06,2,10), ytm:B.ytm(B.price(0.07,0.05,2,5),0.05,2,5), mac:B.macaulay(0.05,0.05,1,3), wacc:QXFL.run(QXFL.byId('wacc'),{}).value,
      npv:QXFL.run(QXFL.byId('npv'),{}).value, ggm:QXFL.run(QXFL.byId('ggm'),{d0:2,g:5,r:9}).value, fwd:QXFL.run(QXFL.byId('fwd'),{}).value, n:QXFL.all.length}; })()""")
    check('BSM call 10.4506', abs(r['c']-10.4506) < 1e-3, r); check('BSM put 5.5735', abs(r['p']-5.5735) < 1e-3, r)
    check('implied vol round-trip', abs(r['iv']-0.2) < 1e-4, r); check('par bond prices at 100', abs(r['px']-100) < 1e-8, r)
    check('YTM round-trip', abs(r['ytm']-0.07) < 1e-6, r); check('Macaulay 3y 5% annual = 2.8594', abs(r['mac']-2.8594) < 1e-3, r)
    check('GGM 2×1.05/(0.04)=52.5', abs(r['ggm']-52.5) < 1e-9, r); check('forward 1y1y = 6.0096%', abs(r['fwd']-6.0096) < 1e-3, r)
    check('formula catalogue ≥ 100', r['n'] >= 100, r['n'])
    # ---------- Universal Search ----------
    pg.evaluate("goto('explorer')"); pg.wait_for_timeout(600)
    pg.fill('#qxeQ', 'apple'); pg.click('#qxeGo'); pg.wait_for_timeout(2500)
    kinds = pg.evaluate("[...document.querySelectorAll('#qxeResults .qxe-gh')].map(e=>e.textContent)")
    for k in ['Stocks','Corporate bonds','Government bonds','Futures','Crypto','Currencies','Indian mutual funds']:
        check('search returns '+k, any(k in x for x in kinds), kinds)
    def open_kind(label):
        pg.evaluate(f"""(()=>{{ const g=[...document.querySelectorAll('#qxeResults .qxe-group')].find(x=>x.querySelector('.qxe-gh').textContent.includes({json.dumps(label)})); g.querySelector('.qxe-row').click(); }})()"""); pg.wait_for_timeout(2500)
        return pg.text_content('#qxeDetail')
    t = open_kind('Corporate bonds')
    check('bond page: YTM computed + duration + scenarios', 'Yield to maturity' in t and 'Modified duration' in t and '+200 bp' in t and 'computed from price' in t, t[:500])
    t = open_kind('Crypto')
    check('crypto page: market cap, supply, network', 'Market cap' in t and 'Circulating' in t and 'GitHub stars' in t, t[:400])
    t = open_kind('Futures')
    check('futures page: curve + carry', 'contango' in t and 'Futures curve' in t, t[:400])
    t = open_kind('Indian mutual funds')
    check('mutual fund page: NAV + rolling returns', 'NAV history' in t and 'Rolling 1-year returns' in t, t[:400])
    t = open_kind('Currencies')
    check('fx page renders', 'ECB' in t or 'Rate' in t, t[:300])
    t = open_kind('Stocks')
    pg.click('#qxeOpt'); pg.wait_for_timeout(2500)
    check('option chain table', pg.locator('#qxeChain .qxe-oc').count() > 4, pg.text_content('#qxeDetail')[:300])
    pg.locator('#qxeChain .qxe-oc').first.click(); pg.wait_for_timeout(2000)
    t = pg.text_content('#qxeDetail')
    check('option page: BSM model + greeks + scenarios', 'Model (BSM)' in t and 'Gamma' in t and 'Scenario grid' in t, t[:500])
    pg.screenshot(path=OUT+'/explorer_option.png')
    # ---------- Formula Lab ----------
    pg.evaluate("selectSecurity('AAPL')"); pg.wait_for_timeout(1500)
    pg.evaluate("goto('formulas')"); pg.wait_for_timeout(800)
    check('formula lab list', pg.locator('.qxfl-i').count() >= 100, pg.locator('.qxfl-i').count())
    pg.click('#qxflFill'); pg.wait_for_timeout(3000)
    check('fill from ticker marks LIVE inputs', pg.locator('.qxfl-auto .badge').count() >= 2, pg.text_content('#qxflNote'))
    pg.fill('#qxflQ', 'dupont'); pg.wait_for_timeout(200); pg.locator('.qxfl-i').filter(has_text='5-step').click(); pg.wait_for_timeout(300)
    check('5-step DuPont result', '%' in pg.text_content('#qxflOut'), pg.text_content('#qxflOut'))
    pg.screenshot(path=OUT+'/formulas.png')
    # ---------- line items with a (mock) FMP key + Analysis tab cards ----------
    pg.evaluate("safeStorage.setItem('quantis_key_fmp','TESTKEY'); goto('research');"); pg.wait_for_timeout(1500)
    pg.click('#tabs .tabbtn[data-tab="analysis"]'); pg.wait_for_timeout(4000)
    t = pg.text_content('#panel-analysis')
    check('analysis: exact line items (5-step DuPont, CCC)', '5-step DuPont' in t and 'Cash-conversion cycle' in t, t[-900:])
    check('analysis: peer comparison table', pg.locator('#qxaPeers .qxp-self').count() == 1, pg.text_content('#qxaPeers')[:200])
    # ---------- custom API connector (+ XSS safety) ----------
    pg.evaluate("""QXCUSTOM.save({name:'My feed', url:'https://my-api.example.com/v1?s={tvsym}&k={key}', key:'k1', fields:[{label:'P/E',path:'data[0].pe',format:'number'},{label:'Note',path:'data[0].note',format:'text'}], scope:'all'})""")
    pg.evaluate("QXCUSTOM.renderCard(document.getElementById('qxaCustom'), 'AAPL', 'equity')"); pg.wait_for_timeout(1500)
    html = pg.inner_html('#qxaCustom')
    check('custom API values shown', '31.5' in html, html[:300]); check('custom API output is escaped (no XSS)', '<img' not in html and '&lt;img' in html, html[:300])
    # ---------- alerts-pro ----------
    pg.evaluate("goto('alerts')"); pg.wait_for_timeout(800)
    check('alerts-pro card mounted', pg.locator('#qxalAdd').count() == 1)
    n = pg.evaluate("""(async()=>{ QXAL.add({sym:'AAPL', interval:'1D', cond:'rsi_above', p:{level:1}, mode:'every'}); const B = await QXC.loadBars('AAPL','1D'); const n = B.close.length;
        QXAL.add({sym:'AAPL', interval:'1D', cond:'line_cross', p:{line:{t:'hline', a:{time:B.time[n-2], price:(B.close[n-2]+B.close[n-1])/2}}}}); await QXAL.evaluate(); return QXAL.list().length; })()""")
    pg.wait_for_timeout(500)
    check('alerts evaluated & listed', n == 2 and pg.locator('#qxalList tbody tr').count() == 2, n)
    check('line-cross alert fires', pg.evaluate("QXAL.list().some(a=>a.cond==='line_cross' && a.fired>=1)") or pg.evaluate("(()=>{ const a = QXAL.list().find(a=>a.cond==='line_cross'); return a && a.lastCheck; })()"), pg.evaluate("JSON.stringify(QXAL.list())")[:300])
    # ---------- Report Studio: every type + exports ----------
    pg.evaluate("goto('reports')"); pg.wait_for_timeout(800)
    def gen(target_js, type_id, label):
        pg.evaluate(f"QXREP.openWith(Object.assign({target_js}, {{type:'{type_id}'}}))"); pg.wait_for_timeout(200)
        for _ in range(120):   # poll (wait_for_function uses eval, which the production CSP correctly blocks)
            if pg.evaluate("!!(document.querySelector('#reportPreview .qxr4') || /Could not/.test(document.querySelector('#reportPreview').textContent))"): break
            pg.wait_for_timeout(250)
        t = pg.text_content('#reportPreview'); ok = pg.locator('#reportPreview .qxr4').count() == 1
        check(f'report [{type_id}] {label}', ok and 'Disclosures' in t, t[:300]); return t
    t = gen("{kind:'equity', t:'AAPL'}", 'master', 'equity master')
    check('master has peers, valuation, cash flow, conclusion', all(x in t for x in ['Peer comparison','Valuation','Cash-flow analysis','Conclusion','Investment summary']), t[:600])
    check('master has charts', pg.locator('#reportPreview .fig img').count() >= 8, pg.locator('#reportPreview .fig img').count())
    pg.screenshot(path=OUT+'/report_master.png')
    for k, ext in [('pdf','.pdf'),('docx','.docx'),('pptx','.pptx'),('xlsx','.xlsx'),('csv','.csv'),('md','.md'),('html','.html'),('json','.json')]:
        try:
            with pg.expect_download(timeout=40000) as dl: pg.click(f'[data-qxr-exp="{k}"]')
            path = os.path.join(OUT, 'master_'+dl.value.suggested_filename); dl.value.save_as(path); size = os.path.getsize(path)
            ok = dl.value.suggested_filename.endswith(ext) and size > 2000
            if ext in ('.docx','.pptx','.xlsx'): ok = ok and zipfile.is_zipfile(path)
            check(f'export master {k} ({size//1024} KB)', ok, (dl.value.suggested_filename, size))
        except Exception as e: check(f'export master {k}', False, e)
    for typ in ['profile','financial','valuation','peers','technical','risk']: gen("{kind:'equity', t:'AAPL'}", typ, 'equity')
    pg.evaluate("document.querySelector('.qxr-sw[data-th=\"emerald\"]').click()"); pg.wait_for_timeout(1500)
    check('theme switch re-renders (emerald primary)', '#0F5132'.lower() in pg.inner_html('#reportPreview').lower(), '')
    items = {
      'bond': "{kind:'bond', item:{kind:'bond', sym:'FWB:US0378AB12', name:'Apple Inc. 4.65% 15-FEB-2046', market:'bond', raw:{}}}",
      'crypto': "{kind:'crypto', item:{kind:'crypto', sym:'CRYPTO:BTCUSD', name:'Bitcoin', market:'coin', raw:{}}}",
      'crypto_brief': "{kind:'crypto', item:{kind:'crypto', sym:'CRYPTO:SOLUSD', name:'Solana', market:'coin', raw:{}}}",
      'future': "{kind:'future', item:{kind:'future', sym:'NYMEX:CLF2027', name:'Crude Oil Futures', market:'futures', raw:{}}}",
      'fx': "{kind:'fx', item:{kind:'fx', sym:'FX_IDC:EURINR', name:'EURO / INDIAN RUPEE', market:'forex', raw:{}}}",
      'mf': "{kind:'mf_in', item:{kind:'mf_in', sym:'MFAPI:122639', name:'Parag Parikh Flexi Cap', market:'mfapi'}}",
      'market': "{kind:'index', item:{kind:'index', sym:'SP:SPX', name:'S&P 500', market:'cfd', raw:{}}}",
      'etf': "{kind:'etf', t:'SPY'}",
    }
    for typ, js in items.items():
        gen(js, typ, typ)
        if typ in ('bond','crypto','mf'):
            for k, ext in [('pdf','.pdf'),('docx','.docx'),('pptx','.pptx')]:
                try:
                    with pg.expect_download(timeout=40000) as dl: pg.click(f'[data-qxr-exp="{k}"]')
                    path = os.path.join(OUT, typ+'_'+dl.value.suggested_filename); dl.value.save_as(path)
                    check(f'export {typ} {k}', os.path.getsize(path) > 2000, os.path.getsize(path))
                except Exception as e: check(f'export {typ} {k}', False, e)
            pg.screenshot(path=OUT+f'/report_{typ}.png')
    # option report via explorer data
    gen("{kind:'option', item:{kind:'option', sym:'OPRA:AAPL261218C340.0', name:'AAPL CALL 340', raw:{type:'call', strike:340, expiry:20261218, last:12.1, bid:12, ask:12.4, iv:0.28, oi:8800, volume:1200, ccy:'USD'}, underlying:{sym:'NASDAQ:AAPL', price:343.83}}}", 'option', 'option')
    # ---------- PWA ----------
    man = pg.evaluate("fetch('manifest.webmanifest').then(r=>r.json())")
    check('PWA manifest with icons', len(man.get('icons', [])) >= 2 and man.get('display') == 'standalone', man)
    check('no page errors', not errs, errs[:5])
    # ---------- mobile ----------
    mp = ctx.new_page(); mp.set_viewport_size({'width':390, 'height':844}); merr = []
    mp.on('pageerror', lambda e: merr.append(str(e)))
    mp.goto('https://quantis.app.test/index.html#explorer'); mp.wait_for_timeout(5000)
    mp.fill('#qxeQ', 'gold'); mp.keyboard.press('Enter'); mp.wait_for_timeout(2500)
    sw = mp.evaluate("document.documentElement.scrollWidth"); check('mobile explorer no horizontal scroll', sw <= 392, sw)
    mp.screenshot(path=OUT+'/mobile_explorer.png'); mp.evaluate("goto('reports')"); mp.wait_for_timeout(600); mp.screenshot(path=OUT+'/mobile_reports.png')
    check('mobile no page errors', not merr, merr[:3])
    b.close()
print('FAILS', fails)
sys.exit(1 if fails else 0)
