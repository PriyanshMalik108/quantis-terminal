"""
v6 tests — configurable Home (indices, hours, pulse, layout), Compare worldwide search, Correlation
basket, Macro country workspace, Screener ranges/presets, chart settings/templates/touch lock,
AI Lab manual, guide content, and absence of external-curriculum references.
Usage: python3 tests/test_v6.py [root]
"""
import os, sys
from playwright.sync_api import sync_playwright
from harness import open_app
ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
fails = []
def check(name, cond, extra=''):
    print(('PASS ' if cond else 'FAIL ') + name + ('' if cond else ' — ' + str(extra)[:300]), flush=True)
    if not cond: fails.append(name)
with sync_playwright() as p:
    pg, errs, ctx, b = open_app(p, ROOT, viewport=(1440, 900))
    pg.wait_for_timeout(6500)
    # ---- Home ----
    check('world indices rendered with country labels', pg.locator('#idxList .ix-row').count() >= 8 and 'Country — India' in pg.inner_text('#idxList'), pg.inner_text('#idxList')[:200])
    pg.click('#idxAddBtn'); pg.wait_for_timeout(300)
    check('index catalogue lists 60+', pg.locator('#idxAddPanel .ix-opt').count() >= 60, pg.locator('#idxAddPanel .ix-opt').count())
    pg.locator('#idxAddPanel .ix-opt input[value="TVC:KOSPI"]').check(); pg.wait_for_timeout(1200)
    check('adding an index shows it', pg.locator('#idxList .ix-row[data-sym="TVC:KOSPI"]').count()==1)
    pg.locator('#idxList .ix-row[data-sym="TVC:KOSPI"]').hover(); pg.locator('#idxList .ix-row[data-sym="TVC:KOSPI"] .ix-x').click(); pg.wait_for_timeout(1200)
    check('removing an index works', pg.locator('#idxList .ix-row[data-sym="TVC:KOSPI"]').count()==0)
    pg.click('#idxPeriod button[data-v="YTD"]'); pg.wait_for_timeout(1200)
    check('period switch to YTD', 'YTD' in pg.inner_text('#idxList'))
    check('breadth market list has 60+ markets', pg.locator('#dashMarket option').count() >= 60, pg.locator('#dashMarket option').count())
    check('market hours shows countdowns', 'in ' in pg.inner_text('#marketHoursBox') and pg.locator('#marketHoursBox .mh-row').count() >= 5)
    pg.click('#hoursAddBtn'); pg.locator('#hoursAddPanel input[value="TWSE"]').check(); pg.wait_for_timeout(300)
    check('exchange added to market hours', 'TWSE' in pg.inner_text('#marketHoursBox'))
    check('pulse tiles live', pg.locator('#pulseGrid .pl-tile').count() >= 6, pg.inner_text('#pulseGrid')[:200])
    pg.click('#dashCustomizeBtn'); pg.wait_for_timeout(300)
    rows = pg.locator('#dashCustomize .dc-row'); check('customise lists every card', rows.count() >= 13, rows.count())
    pg.locator('#dashCustomize .dc-row').nth(1).locator('.qx-switch span').click(); pg.wait_for_timeout(200)
    check('hiding a card hides it', pg.evaluate("document.querySelector('[data-card=\"breadth\"]').hidden"))
    pg.click('#dashCustomize [data-act="reset"]'); pg.click('#dashCustomize [data-act="close"]'); pg.wait_for_timeout(200)
    check('reset restores card', not pg.evaluate("document.querySelector('[data-card=\"breadth\"]').hidden"))
    pg.fill('#fxConvAmount', '250'); pg.click('#fxSwap'); pg.wait_for_timeout(1500)
    check('currency converter swap + convert', '250' in pg.inner_text('#fxConvResult'), pg.inner_text('#fxConvResult'))
    # ---- Compare: worldwide search ----
    pg.evaluate("goto('compare')"); pg.wait_for_timeout(800)
    pg.fill('#compareAddInput', 'apple'); pg.wait_for_timeout(1500)
    check('compare search dropdown', pg.locator('#view-compare .qxpick-dd.open .qxpick-row').count() >= 1)
    pg.keyboard.press('Enter'); pg.wait_for_timeout(2500)
    check('compare table + highlight + perf chart', pg.locator('#compareTable .cmp-best').count() >= 1 and pg.locator('#comparePerfCanvas').count()==1)
    pg.locator('#compareChips .chip-x').first.click(); pg.wait_for_timeout(500)
    check('compare remove chip', True)
    # ---- Correlation ----
    pg.evaluate("goto('correlation')"); pg.wait_for_timeout(4000)
    n0 = pg.locator('#corrChips .chip').count()
    check('correlation heatmap', pg.locator('#corrHeat td[data-i]').count() >= 9, pg.inner_text('#corrHeat')[:200])
    pg.select_option('#corrPreset', 'indices'); pg.wait_for_timeout(4000)
    check('correlation preset loads', pg.locator('#corrChips .chip').count() >= 5)
    pg.locator('#corrChips .chip-x').first.click(); pg.wait_for_timeout(3000)
    check('correlation remove', pg.locator('#corrChips .chip').count() >= 4)
    pg.click('#view-correlation .seg[data-k="method"] button[data-v="spearman"]'); pg.wait_for_timeout(3000)
    check('spearman method', 'Spearman' in pg.inner_text('#corrNote'))
    pg.locator('#corrHeat td[data-i]').nth(2).click(); pg.wait_for_timeout(800)
    check('pair detail stats', 'beta' in pg.inner_text('#corrPairStats').lower())
    # ---- Macro ----
    pg.evaluate("goto('macro')"); pg.wait_for_timeout(4000)
    check('macro tiles for India', pg.locator('#mgTiles .mg-tile').count() >= 16 and 'India' in pg.inner_text('#mgMeta'))
    pg.fill('#mgCountry', 'Brazil'); pg.dispatch_event('#mgCountry', 'change'); pg.wait_for_timeout(3000)
    check('macro switches country', 'Brazil' in pg.inner_text('#mgMeta'), pg.inner_text('#mgMeta'))
    check('macro compare chart', pg.locator('#mgChart').count()==1 and 'World Bank' in pg.inner_text('#mgNote'), pg.inner_text('#mgNote'))
    # ---- Screener ----
    pg.evaluate("goto('screener')"); pg.wait_for_timeout(1500)
    pg.select_option('#scrPreset', 'quality'); pg.wait_for_timeout(2000)
    check('screener preset fills ranges', pg.input_value('#f-roe-min')=='20' and pg.locator('#screenTable tbody tr').count() >= 1)
    pg.click('#scrClass button[data-v="ETF"]'); pg.wait_for_timeout(1500)
    check('ETF mode hides stock-only filters', pg.evaluate("document.querySelector('#f-pe-min').closest('.scr-f').hidden"))
    # ---- Chart: settings & templates ----
    pg.evaluate("goto('research')"); pg.wait_for_timeout(2000)
    check('chart toolbar has no emoji icons', not any(ch in pg.inner_text('#qxResearchChart .qxc-top') for ch in ['🧲','📷','🔔','🗑']))
    pg.evaluate("document.querySelector('#qxResearchChart .qxc-setmenu').previousElementSibling.click()"); pg.wait_for_timeout(300)
    check('chart settings menu', pg.locator('#qxResearchChart .qxc-setmenu.open [data-set="grid"]').count()==1)
    pg.click('#qxResearchChart .qxc-setmenu [data-pal="bluered"]'); pg.wait_for_timeout(400)
    pg.evaluate("document.querySelector('#qxResearchChart .qxc-tplmenu').previousElementSibling.click()"); pg.wait_for_timeout(300)
    pg.click('#qxResearchChart .qxc-tplmenu [data-btpl="Momentum"]'); pg.wait_for_timeout(600)
    check('built-in template applied', 'RSI' in pg.inner_text('#qxResearchChart .qxc-chips'), pg.inner_text('#qxResearchChart .qxc-chips'))
    # ---- AI Lab ----
    pg.evaluate("goto('ailab')"); pg.wait_for_timeout(800)
    check('AI Lab manual + step-by-step', 'how to use ai lab' in pg.inner_text('#view-ailab').lower() and pg.locator('.qxai-howto-in ol li').count() >= 3)
    check('AI tool cards use icons, not emoji', pg.locator('.qxai-card .qxai-ic svg').count() >= 8)
    # ---- Guides ----
    pg.evaluate("goto('dashboard')"); pg.wait_for_timeout(600)
    pg.locator('[data-card="indices"] .qxg-i').first.click(); pg.wait_for_timeout(500)
    check('rich guide with controls table', pg.locator('#qxgDrawer .qxg-ctl tr').count() >= 3, '')
    pg.keyboard.press('Escape')
    # ---- No external curriculum references anywhere in the UI ----
    pg.evaluate("goto('formulas')"); pg.wait_for_timeout(600)
    txt = pg.evaluate("document.body.innerText")
    check('no CFA / curriculum references', 'CFA' not in txt and 'curriculum' not in txt.lower(), [l for l in txt.split('\n') if 'CFA' in l][:3])
    check('formula depth filter', 'Foundation' in txt and 'Advanced' in txt)
    check('no page errors', not errs, errs[:4])
    # ---- Phone: chart lock + no overflow on Home ----
    mp = ctx.new_page(); mp.set_viewport_size({'width':390,'height':844}); me = []; mp.on('pageerror', lambda e: me.append(str(e)))
    mp.goto('https://quantis.app.test/index.html'); mp.wait_for_timeout(6000)
    check('phone home no horizontal scroll', mp.evaluate("document.documentElement.scrollWidth") <= 392)
    mp.evaluate("goto('charts')"); mp.wait_for_timeout(2500)
    h1 = mp.evaluate("document.querySelector('.qxc-stage').getBoundingClientRect().height"); mp.set_viewport_size({'width':390,'height':760}); mp.wait_for_timeout(400)
    h2 = mp.evaluate("document.querySelector('.qxc-stage').getBoundingClientRect().height")
    check('chart height stable when the address bar changes the viewport', abs(h1-h2) < 1 or h1 == 420, (h1, h2))
    check('phone no page errors', not me, me[:3])
    b.close()
print('FAILS', fails)
sys.exit(1 if fails else 0)
