#!/bin/sh
# Takes the README/release screenshots in both interface languages (needs xvfb-run).
# The library shows the stories in test/fixtures; IFDB data is fetched if online.
set -e
cd "$(dirname "$0")/.."
rm -f docs/screenshots/de_*.png docs/screenshots/en_*.png
for L in de en; do
  SHOT_LANG=$L SETTINGS="{\"uiLanguage\":\"$L\",\"libraryFolders\":[\"$PWD/test/fixtures\"],\"ifdbSync\":true,\"theme\":\"lectrote\"}" \
    xvfb-run -a -s "-screen 0 1400x900x24" node test/run.mjs test/screenshots.mjs
done
ls docs/screenshots
