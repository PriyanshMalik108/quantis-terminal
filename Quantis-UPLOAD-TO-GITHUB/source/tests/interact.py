import os, sys, json
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(__file__))
import mocks as mock
from harness import serve_local, LIB
libmap={'Chart.js/4.4.1/chart.umd.min.js':LIB+'chart.js-4.4.1/dist/chart.umd.js','xlsx/0.18.5/xlsx.full.min.js':LIB+'xlsx-0.18.5/dist/xlsx.full.min.js','jspdf/2.5.1/jspdf.umd.min.js':LIB+'jspdf-2.5.1/dist/jspdf.umd.min.js', 'lightweight-charts@5.2.1/dist/lightweight-charts.standalone.production.js': LIB+'lightweight-charts-5.2.1/dist/lightweight-charts.standalone.production.js', 'jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js': LIB+'jspdf-autotable-3.8.4/dist/jspdf.plugin.autotable.min.js', 'docx@9.5.1/dist/index.iife.js': LIB+'docx-9.5.1/dist/index.iife.js'}
MOBILE='--mobile' in sys.argv
fails=[]
def check(name, cond, extra=''):
    print(('PASS ' if cond else 'FAIL ')+name+(' — '+str(extra)[:200] if extra and not cond else ''), flush=True)
    if not cond: fails.append(name)
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={'width':390,'height':844} if MOBILE else {'width':1440,'height':900}, is_mobile=MOBILE, has_touch=MOBILE, accept_downloads=True, service_workers='block', locale='en-US')
    def h(r):
        u=r.request.url
        if u.startswith('https://quantis.app.test'): return serve_local(r, u)
        for k,v in libmap.items():
            if u.endswith(k): return r.fulfill(status=200, content_type='application/javascript', body=open(v,'rb').read())
        m=mock.respond(u, r.request.method, r.request.post_data) if os.environ.get('MOCK') else None
        if m: return r.fulfill(status=200, headers={'Access-Control-Allow-Origin':'*'}, content_type=m[0], body=m[1])
        return r.abort()
    ctx.route('**/*', h)
    pg=ctx.new_page()
    errs=[]
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('dialog', lambda d: (errs.append('DIALOG '+d.message), d.dismiss()))
    pg.goto('https://quantis.app.test/index.html'); pg.wait_for_timeout(5000)
    if not MOBILE:
        # workspace create via in-app prompt
        pg.click('#wsNewBtn'); pg.wait_for_timeout(300)
        check('ask modal opens', pg.is_visible('#askOverlay.show'))
        pg.fill('#askInput','Banks'); pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
        check('workspace created+active', pg.inner_text('.wstab.active')=='Banks')
        pg.click('.wstab[data-ws="Default Workspace"]')
        # watchlist add via + button
        pg.click('.navitem[data-view="research"]'); pg.wait_for_timeout(1500)
        pg.click('#wlAddBtn'); pg.fill('#askInput','ZZZZ'); pg.click('#askOk'); pg.wait_for_timeout(200)
        check('invalid ticker shows inline error', 'universe' in pg.inner_text('#askError'))
        pg.fill('#askInput','tsla'); pg.click('#askOk'); pg.wait_for_timeout(500)
        check('TSLA added to watchlist', pg.locator('.wl-item[data-t="TSLA"]').count()==1)
        pg.click('.wl-item[data-t="TSLA"]'); pg.wait_for_timeout(2500)
        check('header switched to Tesla', 'Tesla' in pg.inner_text('#secName'))
        # chart controls
        for t in ['bars','line','candles']:
            pg.click('#qxResearchChart .qxc-typebtn'); pg.click(f'#qxResearchChart [data-type="{t}"]'); pg.wait_for_timeout(250)
        pg.click('#qxResearchChart [data-range="1M"]'); pg.wait_for_timeout(300)
        pg.click('#qxResearchChart .qxc-indbtn'); pg.click('#qxResearchChart [data-ind="bb"]'); pg.wait_for_timeout(300)
        check('chart toolbar no errors', not errs, errs)
        pg.click('#qxResearchChart .qxc-cmpbtn'); pg.fill('#qxResearchChart .qxc-cmpinput','NVDA'); pg.keyboard.press('Enter'); pg.wait_for_timeout(2000)
        check('compare overlay rendered', 'vs NVDA' in pg.inner_text('#qxResearchChart .qxc-chips'), pg.inner_text('#qxResearchChart .qxc-chips'))
        # AI
        pg.evaluate("if(getComputedStyle(document.getElementById('aiInput')).display==='none' || !document.getElementById('aiInput').offsetParent) QXL.toggle('ai', true)"); pg.wait_for_timeout(400); pg.fill('#aiInput','what is the valuation?'); pg.click('#aiSend'); pg.wait_for_timeout(800)
        check('AI answered', 'fair value' in pg.inner_text('#aiLog').lower() or 'dcf' in pg.inner_text('#aiLog').lower(), pg.inner_text('#aiLog')[-300:])
        # palette keyboard
        pg.keyboard.press('Control+k'); pg.wait_for_timeout(300)
        pg.keyboard.type('micro'); pg.wait_for_timeout(500); pg.keyboard.press('ArrowDown'); pg.keyboard.press('Enter'); pg.wait_for_timeout(1500)
        check('palette Enter selects', 'Microsoft' in pg.inner_text('#secName'), pg.inner_text('#secName'))
        # notes
        pg.click('.navitem[data-view="portfolio"]'); pg.wait_for_timeout(2500)
        pg.locator('.notes-btn').first.click(); pg.fill('#notesTextarea','thesis'); pg.click('#notesOverlay .btn:not(.secondary)'); pg.wait_for_timeout(1500)
        check('note saved', pg.locator('.notes-btn.has-note').count()>=1)
        # export
        pg.click('.navitem[data-view="export"]'); pg.wait_for_timeout(300)
        for fmt in ['csv','json','md','xlsx']:
            pg.click(f'#exportFormatChips .chip[data-fmt="{fmt}"]')
            try:
                with pg.expect_download(timeout=4000) as d: pg.click('text=Export Selected')
                check('export '+fmt, d.value.suggested_filename.endswith('.'+fmt), d.value.suggested_filename)
            except Exception as e: check('export '+fmt, False, e)
        # reports
        pg.click('.navitem[data-view="reports"]'); pg.wait_for_timeout(300)
        check('report sec = current', pg.eval_on_selector('#repSec','e=>e.value')=='MSFT', pg.eval_on_selector('#repSec','e=>e.value'))
        pg.click('text=Generate Report'); pg.wait_for_timeout(5000)
        check('report preview', 'MASTER REPORT' in pg.inner_text('#reportPreview'), pg.inner_text('#reportPreview')[:200])
        # options use selected
        pg.click('.navitem[data-view="options"]'); pg.wait_for_timeout(500)
        pg.click('text=Use selected security'); pg.wait_for_timeout(500)
        check('options loaded MSFT', 'MSFT' in pg.inner_text('#optUnderlyingLabel'))
        # PDF exports
        pg.click('.navitem[data-view="research"]'); pg.wait_for_timeout(800)
        try:
            with pg.expect_download(timeout=5000) as d: pg.click('text=Export PDF')
            check('security pdf', d.value.suggested_filename.endswith('.pdf'))
        except Exception as e: check('security pdf', False, e)
        # theme toggle
        pg.click('#themeBtn'); pg.wait_for_timeout(400)
        check('light theme applied', pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--bg-0').trim()")=='#F4F5F7')
        pg.click('#themeBtn')
        # settings open/close via Esc
        pg.click('#settingsBtn'); pg.wait_for_timeout(300); pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
        check('Esc closes settings', not pg.is_visible('#settingsOverlay.show'))
        # screener save
        pg.click('.navitem[data-view="screener"]'); pg.fill('#fPe','30'); pg.click('text=Run Screen'); pg.click('text=Save as new screen'); pg.fill('#askInput','Cheap'); pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
        check('screen saved', 'Cheap' in pg.inner_text('#savedScreensList'))
    else:
        pg.click('#mnMore'); pg.wait_for_timeout(400)
        check('more sheet opens', pg.evaluate("getComputedStyle(document.getElementById('moreSheet')).visibility")=='visible')
        pg.click('#moreSheet .msitem[data-view="backtest"]'); pg.wait_for_timeout(800)
        check('backtest via more', pg.is_visible('#view-backtest'))
        check('more sheet closed', pg.evaluate("getComputedStyle(document.getElementById('moreSheet')).visibility")=='hidden')
        check('bottom nav clickable', pg.evaluate("document.elementFromPoint(195,820).closest('#mobilenav')!==null"))
        pg.click('#mnMore'); pg.wait_for_timeout(300); pg.mouse.click(195,200); pg.wait_for_timeout(400)
        check('backdrop closes sheet', pg.evaluate("getComputedStyle(document.getElementById('moreSheet')).visibility")=='hidden')
        pg.click('#mnMore'); pg.click('#msAiToggle'); pg.wait_for_timeout(300)
        check('AI overlay mobile', pg.is_visible('#rightrail'))
        pg.click('#aiMobileClose')
        w=pg.evaluate("document.documentElement.scrollWidth")
        check('no page horizontal scroll', w<=390, w)
    check('no page errors', not errs, errs)
    b.close()
print('FAILS', fails)
