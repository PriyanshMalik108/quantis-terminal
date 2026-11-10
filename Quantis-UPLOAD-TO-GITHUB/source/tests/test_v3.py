import os, sys, re
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mocks as mock
from harness import serve_local, LIB
D = os.path.dirname(os.path.abspath(__file__)) + '/'
# LIB comes from harness (tests/.libs)
libmap = {'Chart.js/4.4.1/chart.umd.min.js': LIB+'chart.js-4.4.1/dist/chart.umd.js', 'xlsx/0.18.5/xlsx.full.min.js': LIB+'xlsx-0.18.5/dist/xlsx.full.min.js', 'jspdf/2.5.1/jspdf.umd.min.js': LIB+'jspdf-2.5.1/dist/jspdf.umd.min.js',
  'lightweight-charts@5.2.1/dist/lightweight-charts.standalone.production.js': LIB+'lightweight-charts-5.2.1/dist/lightweight-charts.standalone.production.js',
  'jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js': LIB+'jspdf-autotable-3.8.4/dist/jspdf.plugin.autotable.min.js', 'docx@9.5.1/dist/index.iife.js': LIB+'docx-9.5.1/dist/index.iife.js'}
fails = []
def check(name, cond, extra=''):
    print(('PASS ' if cond else 'FAIL ') + name + ('' if cond else ' — ' + str(extra)[:400]), flush=True)
    if not cond: fails.append(name)
SHOTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.out') + '/'; os.makedirs(SHOTS, exist_ok=True)
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width':1500,'height':950}, accept_downloads=True, locale='en-US', service_workers='block')
    def h(r):
        u = r.request.url
        if u.startswith('https://quantis.app.test'): return serve_local(r, u)
        for k, v in libmap.items():
            if u.split('?')[0].endswith(k): return r.fulfill(status=200, content_type='application/javascript', body=open(v,'rb').read())
        m = mock.respond(u, r.request.method, r.request.post_data)
        if m: return r.fulfill(status=200, headers={'Access-Control-Allow-Origin':'*'}, content_type=m[0], body=m[1])
        return r.abort()
    ctx.route('**/*', h)
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append('console: '+m.text) if m.type=='error' and 'net::' not in m.text and 'Failed to load resource' not in m.text else None)
    pg.goto('https://quantis.app.test/index.html'); pg.wait_for_timeout(6000)
    check('heatmap tiles', pg.locator('#qxHeatmap .qxh-t').count() > 20, pg.inner_text('#qxHeatmap')[:200])
    check('guide buttons present', pg.locator('.qxg-i').count() > 5, pg.locator('.qxg-i').count())
    pg.screenshot(path=SHOTS+'dashboard.png')
    pg.locator('#view-dashboard .viewhead .qxg-i').click(); pg.wait_for_timeout(500)
    check('guide drawer opens', 'Step by step' in pg.text_content('#qxgDrawer'))
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    # research chart
    pg.click('.navitem[data-view="research"]'); pg.wait_for_timeout(3500)
    check('research LW chart rendered', pg.locator('#qxResearchChart canvas').count() > 0)
    check('legend shows OHLC', 'O ' in pg.text_content('#qxResearchChart .qxc-legend'), pg.inner_text('#qxResearchChart .qxc-legend'))
    pg.screenshot(path=SHOTS+'research.png')
    pg.click('#qxResearchChart [data-iv="5M"]'); pg.wait_for_timeout(1500)
    check('intraday 5m loads', 'intraday' in pg.inner_text('#qxResearchChart .qxc-foot'), pg.inner_text('#qxResearchChart .qxc-foot'))
    pg.click('#qxResearchChart [data-iv="1D"]'); pg.wait_for_timeout(1200)
    for t in ['heikin','renko','linebreak','baseline','hollow','area','columns','candles']:
        pg.click('#qxResearchChart .qxc-typebtn'); pg.click(f'#qxResearchChart [data-type="{t}"]'); pg.wait_for_timeout(250)
    check('chart types no errors', not errs, errs)
    pg.click('#qxResearchChart .qxc-indbtn'); pg.click('#qxResearchChart [data-ind="rsi"]'); pg.wait_for_timeout(300)
    pg.click('#qxResearchChart .qxc-indbtn'); pg.click('#qxResearchChart [data-ind="macd"]'); pg.wait_for_timeout(300)
    pg.click('#qxResearchChart .qxc-indbtn'); pg.click('#qxResearchChart [data-ind="ichi"]'); pg.wait_for_timeout(300)
    for ind in ['bb','st','psar','vwap','adx','stochrsi','pivots','lr','aroon','hv']:
        pg.click('#qxResearchChart .qxc-indbtn'); pg.click(f'#qxResearchChart [data-ind="{ind}"]'); pg.wait_for_timeout(120)
    check('indicator chips', pg.locator('#qxResearchChart .qxc-chip').count() >= 12, pg.locator('#qxResearchChart .qxc-chip').count())
    check('indicators no errors', not errs, errs)
    pg.screenshot(path=SHOTS+'research_ind.png')
    # remove extras
    while pg.locator('#qxResearchChart .qxc-chip').count() > 4: pg.locator('#qxResearchChart .qxc-chip [data-rm]').last.click(); pg.wait_for_timeout(60)
    # drawing: horizontal line
    pg.click('#qxResearchChart [data-tool="hline"]'); box = pg.locator('#qxResearchChart .qxc-canvas').bounding_box()
    pg.mouse.click(box['x']+box['width']*0.5, box['y']+box['height']*0.15); pg.wait_for_timeout(300)
    pg.click('#qxResearchChart [data-tool="trend"]')
    pg.mouse.move(box['x']+box['width']*0.3, box['y']+box['height']*0.2); pg.mouse.down(); pg.mouse.move(box['x']+box['width']*0.6, box['y']+box['height']*0.1, steps=5); pg.mouse.up(); pg.wait_for_timeout(300)
    check('drawings rendered', pg.locator('#qxResearchChart .qxc-draw g').count() >= 2, pg.locator('#qxResearchChart .qxc-draw g').count())
    pg.click('#qxResearchChart .qxc-cmpbtn'); pg.fill('#qxResearchChart .qxc-cmpinput', 'MSFT'); pg.keyboard.press('Enter'); pg.wait_for_timeout(1500)
    check('compare chip', 'vs MSFT' in pg.inner_text('#qxResearchChart .qxc-chips'))
    try:
        with pg.expect_download(timeout=8000) as dl: pg.click('#qxResearchChart .qxc-shot')
        check('screenshot download', dl.value.suggested_filename.endswith('.png'))
    except Exception as e: check('screenshot download', False, [e, pg.locator('.toast').all_inner_texts() if pg.locator('.toast').count() else 'no toast'])
    # analysis tab
    pg.click('#tabs .tabbtn[data-tab="analysis"]'); pg.wait_for_timeout(2500)
    t = pg.inner_text('#panel-analysis')
    t2 = pg.text_content('#panel-analysis'); check('analysis summary', 'Analyst summary' in t2 and 'Life-cycle stage' in t2, t2[:300])
    check('cash flow narrative', 'Operating cash flow was' in t and 'Investing cash flow was' in t and 'Financing cash flow was' in t, t[:600])
    check('margins narrative', 'Gross margin' in t, '')
    check('formula library rows', pg.locator('.qxa-frow').count() > 25, pg.locator('.qxa-frow').count())
    check('waterfall canvas', pg.locator('#qxaWaterfall').count() == 1)
    pg.locator('.qxa-frow').first.click(); pg.wait_for_timeout(200)
    check('formula explain expands', pg.locator('.qxa-explain').first.is_visible())
    check('analysis no errors', not errs, errs)
    pg.screenshot(path=SHOTS+'analysis.png', full_page=False)
    pg.locator('#panel-analysis').screenshot(path=SHOTS+'analysis_full.png')
    # AI from research
    pg.fill('#aiInput', 'why are margins rising?'); pg.keyboard.press('Enter'); pg.wait_for_timeout(6000)
    check('assistant uses free AI', 'MODEL' in pg.inner_text('#aiLog'), pg.inner_text('#aiLog')[-300:])
    # charts view
    pg.click('.navitem[data-view="charts"]'); pg.wait_for_timeout(2500)
    check('charts view 1 chart', pg.locator('#qxChartGrid .qxc-cell').count() == 1)
    pg.click('#qxLayoutBtns [data-layout="4"]'); pg.wait_for_timeout(3500)
    check('charts view 4 charts', pg.locator('#qxChartGrid .qxc-cell').count() == 4)
    check('grid charts have canvases', pg.locator('#qxChartGrid canvas').count() >= 4)
    pg.screenshot(path=SHOTS+'charts4.png')
    pg.click('#qxLayoutBtns [data-layout="1"]'); pg.wait_for_timeout(800)
    # AI Lab
    pg.click('.navitem[data-view="ailab"]'); pg.wait_for_timeout(800)
    pg.click('.qxai-card[data-tool="bullbear"]'); pg.click('#qxaiRun'); pg.wait_for_timeout(8000)
    check('ai lab output', 'AI-GENERATED' in pg.inner_text('#qxaiOut'), pg.inner_text('#qxaiOut')[:300])
    pg.click('.qxai-card[data-tool="concept"]'); pg.fill('#qxaiText', 'What is ROIC?'); pg.click('#qxaiRun'); pg.wait_for_timeout(7000)
    check('ai concept output', 'Cash flow' in pg.inner_text('#qxaiOut'), pg.inner_text('#qxaiOut')[:300])
    pg.screenshot(path=SHOTS+'ailab.png')
    # reports
    pg.click('.navitem[data-view="reports"]'); pg.wait_for_timeout(600)
    pg.fill('#qxrBy', 'Test Author'); pg.check('#qxrConf')
    pg.click('text=Generate Report'); pg.wait_for_function("document.querySelector('#reportPreview .qxr4')", timeout=30000)
    rt = pg.inner_text('#reportPreview')
    check('report built', 'MASTER REPORT' in rt and 'Cash-flow analysis' in rt and 'Conclusion' in rt, rt[:400])
    check('report confidentiality', 'All rights reserved to Test Author' in rt)
    pg.screenshot(path=SHOTS+'report.png')
    for k, ext in [('pdf','.pdf'),('docx','.docx'),('xlsx','.xlsx'),('csv','.csv'),('md','.md'),('html','.html'),('json','.json')]:
        try:
            with pg.expect_download(timeout=20000) as dl: pg.click(f'[data-qxr-exp="{k}"]')
            path = SHOTS + 'v3_' + dl.value.suggested_filename; dl.value.save_as(path)
            check(f'export {k}', dl.value.suggested_filename.endswith(ext) and os.path.getsize(path) > 1500, (dl.value.suggested_filename, os.path.getsize(path)))
        except Exception as e: check(f'export {k}', False, e)
    # settings AI block
    pg.click('#settingsBtn'); pg.wait_for_timeout(400)
    check('AI settings present', pg.locator('#qxaiPref').count() == 1)
    pg.select_option('#qxaiPref', 'groq'); pg.wait_for_timeout(100)
    pg.evaluate("document.getElementById('settingsOverlay').classList.remove('show')")
    # sortable table
    pg.click('.navitem[data-view="screener"]'); pg.wait_for_timeout(2500)
    ths = pg.locator('#view-screener table.datatable thead th')
    if ths.count() > 2:
        ths.nth(2).click(); pg.wait_for_timeout(200)
        check('sortable table', pg.locator('#view-screener th[data-sort]').count() == 1)
    check('no page errors overall', not errs, errs)
    # mobile
    mp = ctx.new_page(); mp.set_viewport_size({'width':390,'height':844}); merrs = []
    mp.on('pageerror', lambda e: merrs.append(str(e)))
    mp.goto('https://quantis.app.test/index.html'); mp.wait_for_timeout(5000)
    mp.evaluate("goto('research')"); mp.wait_for_timeout(2500)
    mp.screenshot(path=SHOTS+'mobile_research.png')
    sw = mp.evaluate("document.documentElement.scrollWidth"); check('mobile no h-scroll', sw <= 392, sw)
    mp.evaluate("goto('reports')"); mp.wait_for_timeout(500); mp.screenshot(path=SHOTS+'mobile_reports.png')
    check('mobile no errors', not merrs, merrs)
    b.close()
print('FAILS', fails)
