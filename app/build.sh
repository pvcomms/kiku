#!/bin/zsh
# Build Kiku.app into a fresh temp dir and install it into /Applications (old copy goes to the Trash).
set -e
cd "$(dirname "$0")/.."
BUILD=$(mktemp -d /tmp/kiku-build.XXXXXX)
OUT="$BUILD/Kiku.app"
mkdir -p "$OUT/Contents/MacOS" "$OUT/Contents/Resources" "$BUILD/icon.iconset"
qlmanage -t -s 1024 -o "$BUILD" assets/icon.svg >/dev/null 2>&1
mv "$BUILD/icon.svg.png" "$BUILD/icon-1024.png"
for s in 16 32 128 256 512; do
  sips -z $s $s "$BUILD/icon-1024.png" --out "$BUILD/icon.iconset/icon_${s}x${s}.png" >/dev/null
  d=$((s*2)); sips -z $d $d "$BUILD/icon-1024.png" --out "$BUILD/icon.iconset/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$BUILD/icon.iconset" -o "$OUT/Contents/Resources/Kiku.icns"
cp app/Info.plist "$OUT/Contents/Info.plist"
swiftc -O -swift-version 5 -o "$OUT/Contents/MacOS/Kiku" app/main.swift -framework Cocoa -framework WebKit
codesign --force --sign - "$OUT" >/dev/null 2>&1
if [ -d /Applications/Kiku.app ]; then mv /Applications/Kiku.app ~/.Trash/Kiku-$(date +%s).app; fi
cp -R "$OUT" /Applications/Kiku.app
echo "installed /Applications/Kiku.app (build dir: $BUILD)"
