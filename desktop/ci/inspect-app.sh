#!/usr/bin/env bash
# Prints what matters about the packaged app: architectures, minimum macOS of
# each slice, signature, Info.plist minimum, artifact sizes and checksums.
# Usage: inspect-app.sh <path to Fabtice.app>
set -uo pipefail
APP="$1"
BIN="$APP/Contents/MacOS/Fabtice"
FW="$APP/Contents/Frameworks/Electron Framework.framework/Electron Framework"

echo "== main executable"
file "$BIN"
lipo -archs "$BIN"

minos() {
  # minimum macOS recorded in a Mach-O slice (LC_BUILD_VERSION or LC_VERSION_MIN_MACOSX);
  # copied first because Xcode's otool wrapper mishandles parentheses in paths
  local tmp; tmp=$(mktemp)
  cp "$1" "$tmp"
  otool -arch "$2" -l "$tmp" | awk '/LC_BUILD_VERSION/{b=1} b&&/minos/{print $2; exit} /LC_VERSION_MIN_MACOSX/{v=1} v&&/version/{print $2; exit}'
  rm -f "$tmp"
}
for arch in x86_64 arm64; do
  echo "minos $arch: main=$(minos "$BIN" "$arch") framework=$(minos "$FW" "$arch")"
done

echo "== Info.plist"
/usr/libexec/PlistBuddy -c 'Print :LSMinimumSystemVersion' "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP/Contents/Info.plist"

echo "== highest minos over every Mach-O in the bundle"
find "$APP" -type f -perm -u+x -o -type f -name '*.dylib' | while read -r f; do
  if file "$f" | grep -q 'Mach-O'; then
    for arch in $(lipo -archs "$f" 2>/dev/null); do echo "$(minos "$f" "$arch") $arch ${f#"$APP"/}"; done
  fi
done | sort -V | tail -5

echo "== signature"
codesign -dv --verbose=2 "$APP" 2>&1 | grep -E 'Identifier|Format|Signature|TeamIdentifier|flags' || true
codesign --verify --deep --strict --verbose=2 "$APP" 2>&1 | tail -3
spctl --assess --type execute --verbose "$APP" 2>&1 | tail -2 || true

echo "== Electron fuses (RunAsNode must stay enabled)"
npx --yes @electron/fuses@2.1.3 read --app "$APP" 2>&1 | tail -12 || true
