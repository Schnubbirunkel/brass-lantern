#!/bin/sh
# Tests that run in CI with the committed fixture stories (needs xvfb-run).
set -e
cd "$(dirname "$0")/.."
python3 tools/check-i18n.py
mkdir -p test/stories
cp -n test/fixtures/advent.z5 test/fixtures/advent.ulx test/stories/ 2>/dev/null || true
xvfb-run -a -s "-screen 0 1400x900x24" node test/run.mjs test/smoke.mjs
xvfb-run -a -s "-screen 0 1400x900x24" node test/run.mjs test/savemap.mjs
xvfb-run -a -s "-screen 0 1400x900x24" node test/run.mjs test/dragstatus.mjs
LANTERN_FAKE_WIN=/ xvfb-run -a -s "-screen 0 1400x900x24" node test/run.mjs test/winpaths-ci.mjs
echo "All tests passed."
