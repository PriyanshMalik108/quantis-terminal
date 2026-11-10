"""
Test harness — serves the project from disk at https://quantis.app.test/ and answers every
third-party API call with a deterministic mock (tests/mocks.py), so tests run offline and are
repeatable. CDN libraries are served from tests/.libs (run tools/fetch_test_libs.sh once).

Use:  from harness import open_app;  pg, errs, ctx, browser = open_app(p, root='.')   # root = project dir or dist/
"""
import os, sys, mimetypes, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mocks
HERE = os.path.dirname(os.path.abspath(__file__))
LIB = os.environ.get('QUANTIS_TEST_LIBS', os.path.join(HERE, '.libs')) + '/'
LIBMAP = {
  'Chart.js/4.4.1/chart.umd.min.js': 'chart.js-4.4.1/dist/chart.umd.js',
  'xlsx/0.18.5/xlsx.full.min.js': 'xlsx-0.18.5/dist/xlsx.full.min.js',
  'jspdf/2.5.1/jspdf.umd.min.js': 'jspdf-2.5.1/dist/jspdf.umd.min.js',
  'lightweight-charts@5.2.1/dist/lightweight-charts.standalone.production.js': 'lightweight-charts-5.2.1/dist/lightweight-charts.standalone.production.js',
  'jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js': 'jspdf-autotable-3.8.4/dist/jspdf.plugin.autotable.min.js',
  'docx@9.5.1/dist/index.iife.js': 'docx-9.5.1/dist/index.iife.js',
  'pptxgenjs@3.12.0/dist/pptxgen.bundle.js': 'pptxgenjs-3.12.0/dist/pptxgen.bundle.js',
}
def serve_local(r, u, root=None):
    """Fulfil a request for https://quantis.app.test/<path> from the project (or QUANTIS_ROOT) on disk."""
    root = os.path.abspath(root or os.environ.get('QUANTIS_ROOT', os.path.join(HERE, '..')))
    rel = u.split('#')[0][len('https://quantis.app.test/'):].split('?')[0] or 'index.html'
    fp = os.path.join(root, rel)
    if not os.path.isfile(fp): return r.fulfill(status=404, body='not found')
    body = open(fp, 'rb').read(); ct = mimetypes.guess_type(fp)[0] or 'application/octet-stream'
    if fp.endswith('.html'): body = re.sub(rb'<script src="https://cdnjs[^"]*"[^>]*?>', lambda m: re.sub(rb'\s*integrity="[^"]*"', b'', m.group(0)), body)
    return r.fulfill(status=200, content_type=ct, body=body)

def open_app(p, root, viewport=(1500, 950), block=(), path='index.html'):
    root = os.path.abspath(root)
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': viewport[0], 'height': viewport[1]}, accept_downloads=True, locale='en-US', service_workers='block')
    def h(r):
        u = r.request.url.split('#')[0]
        if u.startswith('https://quantis.app.test/'):
            rel = u[len('https://quantis.app.test/'):].split('?')[0] or 'index.html'
            fp = os.path.join(root, rel)
            if os.path.isfile(fp):
                ct = mimetypes.guess_type(fp)[0] or 'application/octet-stream'
                if fp.endswith('.webmanifest'): ct = 'application/manifest+json'
                body = open(fp, 'rb').read()
                # Test libraries are npm builds, not the exact cdnjs bytes, so head-script SRI hashes are stripped
                # for the test run only (production keeps them; lazy-loaded libs are byte-identical and keep SRI).
                if fp.endswith('.html'): body = re.sub(rb'<script src="https://cdnjs[^"]*"[^>]*?>', lambda m: re.sub(rb'\s*integrity="[^"]*"', b'', m.group(0)), body)
                return r.fulfill(status=200, content_type=ct, body=body)
            return r.fulfill(status=404, body='not found')
        for k, v in LIBMAP.items():
            if u.split('?')[0].endswith(k):
                if any(x in k for x in block): return r.abort()
                return r.fulfill(status=200, content_type='application/javascript', body=open(LIB + v, 'rb').read())
        m = mocks.respond(u, r.request.method, r.request.post_data)
        if m: return r.fulfill(status=200, headers={'Access-Control-Allow-Origin': '*'}, content_type=m[0], body=m[1])
        return r.abort()
    ctx.route('**/*', h)
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e) + ' @ ' + (e.stack or '').split(chr(10))[1:3].__str__()))
    pg.goto('https://quantis.app.test/' + path)
    return pg, errs, ctx, b
