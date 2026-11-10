import os, sys
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(__file__))
import mocks as mock
from harness import serve_local, LIB
libmap={'Chart.js/4.4.1/chart.umd.min.js':LIB+'chart.js-4.4.1/dist/chart.umd.js','xlsx/0.18.5/xlsx.full.min.js':LIB+'xlsx-0.18.5/dist/xlsx.full.min.js','jspdf/2.5.1/jspdf.umd.min.js':LIB+'jspdf-2.5.1/dist/jspdf.umd.min.js', 'lightweight-charts@5.2.1/dist/lightweight-charts.standalone.production.js': LIB+'lightweight-charts-5.2.1/dist/lightweight-charts.standalone.production.js', 'jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js': LIB+'jspdf-autotable-3.8.4/dist/jspdf.plugin.autotable.min.js', 'docx@9.5.1/dist/index.iife.js': LIB+'docx-9.5.1/dist/index.iife.js'}
fails=[]
def check(name, cond, extra=''):
    print(('PASS ' if cond else 'FAIL ')+name+('' if cond else ' — '+str(extra)[:300]), flush=True)
    if not cond: fails.append(name)
def run(block_chart=False):
    with sync_playwright() as p:
        b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1440,'height':900}, accept_downloads=True, locale='en-US', service_workers='block')
        reqs=[]
        def h(r):
            u=r.request.url; reqs.append(u)
            if u.startswith('https://quantis.app.test'): return serve_local(r, u)
            for k,v in libmap.items():
                if u.endswith(k):
                    if block_chart and 'Chart.js' in k: return r.abort()
                    return r.fulfill(status=200, content_type='application/javascript', body=open(v,'rb').read())
            m=mock.respond(u, r.request.method, r.request.post_data)
            if m: return r.fulfill(status=200, headers={'Access-Control-Allow-Origin':'*'}, content_type=m[0], body=m[1])
            return r.abort()
        ctx.route('**/*', h)
        pg=ctx.new_page(); errs=[]
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('dialog', lambda d: (errs.append('DIALOG '+d.message), d.dismiss()))
        pg.goto('https://quantis.app.test/index.html'); pg.wait_for_timeout(6000)
        if block_chart:
            pg.click('.navitem[data-view="research"]'); pg.wait_for_timeout(2500)
            check('pro chart still renders without Chart.js', pg.locator('#qxResearchChart canvas').count() > 0)
            check('no page errors (chart blocked)', not errs, errs)
            b.close(); return
        check('firebase not loaded up front', not any('firebasejs' in u for u in reqs))
        check('favicon + description present', pg.evaluate("!!document.querySelector('link[rel=icon]') && !!document.querySelector('meta[name=description]')"))
        pg.click('.navitem[data-view="research"]'); pg.wait_for_timeout(3000)
        px = pg.evaluate("SECURITIES.find(s=>s.t==='AAPL').px")
        pg.click('#tabs .tabbtn[data-tab="options"]'); pg.wait_for_timeout(600)
        spot = float(pg.input_value('#bsSpot'))
        check('research options tab uses selected price', abs(spot-px)<0.01, (spot, px))
        pg.click('#tabs .tabbtn[data-tab="valuation"]'); pg.wait_for_timeout(2500)
        check('relative valuation live', 'LIVE' in pg.inner_text('#panel-valuation .card:first-child'), pg.inner_text('#panel-valuation .card:first-child')[:200])
        pg.click('#tabs .tabbtn[data-tab="fundamentals"]'); pg.wait_for_timeout(2500)
        import re as _re
        check('market cap formatted', bool(_re.search(r'\$\d+\.\d\dT', pg.inner_text('#panel-fundamentals'))), pg.inner_text('#panel-fundamentals')[:400])
        pg.evaluate("selectSecurity('RELIANCE')"); pg.wait_for_timeout(3000)
        pg.click('.navitem[data-view="options"]'); pg.wait_for_timeout(800)
        check('options follow selection (RELIANCE)', 'RELIANCE' in pg.inner_text('#optUnderlyingLabel'), pg.inner_text('#optUnderlyingLabel'))
        check('options show ₹', '₹' in pg.inner_text('#bsGreeksRow'), pg.inner_text('#bsGreeksRow')[:120])
        pg.fill('#bsSpot','100'); pg.keyboard.press('Enter'); pg.wait_for_timeout(400)
        check('manual edit switches to manual', 'Manual' in pg.inner_text('#optUnderlyingLabel'))
        pg.evaluate("selectSecurity('MSFT')"); pg.wait_for_timeout(1500); pg.click('.navitem[data-view="options"]'); pg.wait_for_timeout(500)
        check('manual inputs preserved', pg.input_value('#bsSpot')=='100')
        pg.click('.navitem[data-view="portfolio"]'); pg.wait_for_timeout(2500)
        n0 = pg.locator('#pfHoldingsTable tbody tr, #pfHoldings tbody tr').count()
        pg.fill('#pfAddTicker','GOOGL'); pg.fill('#pfAddQty','2'); pg.fill('#pfAddAvg','150'); pg.press('#pfAddAvg','Enter'); pg.wait_for_timeout(2500)
        check('enter adds position', 'GOOGL' in pg.inner_text('#view-portfolio'))
        pg.focus('.navitem[data-view="macro"]'); pg.keyboard.press('Enter'); pg.wait_for_timeout(500)
        check('keyboard nav works', pg.is_visible('#view-macro'))
        check('icon buttons have aria-label', pg.evaluate("[...document.querySelectorAll('button[title]')].every(b=>b.getAttribute('aria-label'))"))
        check('no page errors', not errs, errs)
        b.close()
run(); run(block_chart=True)
print('FAILS', fails)
