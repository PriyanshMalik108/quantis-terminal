#!/bin/sh
# Runs every suite against the source tree and the production build. Usage: tests/run_all.sh
cd "$(dirname "$0")"
echo "== smoke (source)";   python3 smoke.py ..        2>&1 | tail -2
echo "== smoke (dist)";     python3 smoke.py ../dist   2>&1 | tail -2
echo "== v4 (source)";      python3 test_v4.py .. 2>&1 | tee .out/v4.log | grep -E "^FAIL|^FAILS"; echo "passed: $(grep -c ^PASS .out/v4.log)"
echo "== v4 (dist)";        QUANTIS_ROOT=../dist python3 test_v4.py ../dist 2>&1 | tee .out/v4dist.log | grep -E "^FAIL|^FAILS|Error"; echo "passed: $(grep -c ^PASS .out/v4dist.log)"
echo "== v3";               python3 test_v3.py 2>&1 | grep -E "^FAIL|^FAILS"
echo "== interact";         MOCK=1 python3 interact.py 2>&1 | grep -E "^FAIL|^FAILS"
echo "== interact mobile";  MOCK=1 python3 interact.py --mobile 2>&1 | grep -E "^FAIL|^FAILS"
echo "== interact2";        python3 interact2.py 2>&1 | grep -E "^FAIL|^FAILS"
