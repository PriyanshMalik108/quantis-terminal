#!/bin/sh
# Downloads the exact npm builds of the CDN libraries into tests/.libs so the Playwright tests run offline.
set -e
cd "$(dirname "$0")/../tests" && mkdir -p .libs && cd .libs
for p in chart.js@4.4.1 xlsx@0.18.5 jspdf@2.5.1 lightweight-charts@5.2.1 jspdf-autotable@3.8.4 docx@9.5.1 pptxgenjs@3.12.0; do
  n=$(echo $p | sed 's/@/-/'); [ -d "$n" ] && continue
  npm pack "$p" --silent >/dev/null && mkdir -p "$n" && tar xzf ${n}.tgz -C "$n" --strip-components=1
done
echo "test libraries ready in tests/.libs"
