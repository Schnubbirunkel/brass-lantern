#!/bin/sh
# Builds the Windows installer from dist/win-unpacked with NSIS (works on Linux/macOS without Wine).
set -e
cd "$(dirname "$0")/.."
VERSION=$(node -p "require('./package.json').version")
N=$(dirname "$(find ~/.cache/electron-builder -path '*nsis-3*' -name makensis -path '*/linux/*' | head -1)")/..
[ "$(uname)" = "Darwin" ] && N=$(dirname "$(find ~/Library/Caches/electron-builder -path '*nsis-3*' -name makensis -path '*/mac/*' | head -1)")/..
ICON=$(ls "$PWD"/dist/.icon-ico/*.ico | head -1)
NSISDIR="$N" "$N/$( [ "$(uname)" = "Darwin" ] && echo mac || echo linux )/makensis" -V2 \
  -DOUTFILE="$PWD/dist/BrassLantern-Setup-$VERSION.exe" -DSRCDIR="$PWD/dist/win-unpacked" -DICON="$ICON" -DVERSION="$VERSION" build/win/installer.nsi
