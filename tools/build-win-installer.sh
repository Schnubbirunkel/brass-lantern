#!/bin/sh
# Builds the Windows installer from dist/win-unpacked with NSIS (works on Linux/macOS without Wine).
# Uses a system makensis if installed (e.g. `apt install nsis`), otherwise the one electron-builder downloaded.
set -e
cd "$(dirname "$0")/.."
VERSION=$(node -p "require('./package.json').version")
ICON=$(ls "$PWD"/dist/.icon-ico/*.ico 2>/dev/null | head -1)
[ -z "$ICON" ] && ICON="$PWD/build/icon.ico"
ARGS="-V2 -DOUTFILE=$PWD/dist/BrassLantern-Setup-$VERSION.exe -DSRCDIR=$PWD/dist/win-unpacked -DICON=$ICON -DVERSION=$VERSION build/win/installer.nsi"
if command -v makensis >/dev/null 2>&1; then
  makensis $ARGS
  exit 0
fi
OS=linux; CACHE=~/.cache/electron-builder
[ "$(uname)" = "Darwin" ] && OS=mac && CACHE=~/Library/Caches/electron-builder
BIN=$(find "$CACHE" -path '*nsis-3*' -name makensis -path "*/$OS/*" | head -1)
[ -z "$BIN" ] && { echo "makensis not found – install NSIS (e.g. apt install nsis)"; exit 1; }
N=$(dirname "$BIN")/..
NSISDIR="$N" "$BIN" $ARGS
