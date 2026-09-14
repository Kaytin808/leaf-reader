#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
app="$PWD/build/EngineBeta.xcarchive/Products/Applications/App.app"
test -d "$app"
test -f "$app/public/index.html"
test -d "$app/public/pdf-assets/cmaps"
executable=$(/usr/libexec/PlistBuddy -c 'Print CFBundleExecutable' "$app/Info.plist")
lipo -archs "$app/$executable" | grep -qw arm64
test "$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$app/Info.plist")" = 'com.kaytin808.leafreader.enginebeta'
test "$(/usr/libexec/PlistBuddy -c 'Print CFBundleDisplayName' "$app/Info.plist")" = 'Kayla’s Library Engine Beta'

staging=$(mktemp -d "$PWD/build/engine-beta-ipa.XXXXXX")
ipa="$PWD/build/Kaylas-Library-Engine-Beta-unsigned.ipa"
mkdir "$staging/Payload"
ditto "$app" "$staging/Payload/App.app"
(cd "$staging" && ditto -c -k --keepParent Payload "$ipa")
unzip -tq "$ipa"
(cd build && shasum -a 256 Kaylas-Library-Engine-Beta-unsigned.ipa > Kaylas-Library-Engine-Beta-unsigned.ipa.sha256)
echo 'Created isolated Engine Beta IPA.'
