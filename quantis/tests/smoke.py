"""Smoke test: app boots with zero page errors and the formula self-tests pass. Usage: python3 tests/smoke.py [root]"""
import sys, json
from playwright.sync_api import sync_playwright
from harness import open_app
root = sys.argv[1] if len(sys.argv) > 1 else '.'
with sync_playwright() as p:
    pg, errs, ctx, b = open_app(p, root)
    pg.wait_for_timeout(6000)
    t = pg.evaluate("runFormulaTests()")
    print('formula tests', json.dumps(t))
    for v in ['research','charts','ailab','screener','reports','macro','options','portfolio','dashboard']:
        pg.evaluate(f"goto('{v}')"); pg.wait_for_timeout(1200)
    print('page errors', errs[:10]); b.close()
    sys.exit(1 if errs or (isinstance(t, dict) and t.get('fail')) else 0)
