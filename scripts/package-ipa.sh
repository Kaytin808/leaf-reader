#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
app="$PWD/build/Leaf.xcarchive/Products/Applications/App.app"
test -d "$app"
test -f "$app/public/index.html"
test -d "$app/public/pdf-assets/cmaps"
executable=$(/usr/libexec/PlistBuddy -c 'Print CFBundleExecutable' "$app/Info.plist")
lipo -archs "$app/$executable" | grep -qw arm64
test "$(( $(/usr/libexec/PlistBuddy -c 'Print CFBundleVersion' "$app/Info.plist") ))" -gt 0

staging=$(mktemp -d "$PWD/build/ipa.XXXXXX")
ipa="$PWD/build/Kaylas-Library-unsigned.ipa"
mkdir "$staging/Payload"
ditto "$app" "$staging/Payload/App.app"
(cd "$staging" && ditto -c -k --keepParent Payload "$ipa")
unzip -tq build/Kaylas-Library-unsigned.ipa
(cd build && shasum -a 256 Kaylas-Library-unsigned.ipa > Kaylas-Library-unsigned.ipa.sha256)
echo 'Created build/Kaylas-Library-unsigned.ipa for LiveContainer import or local signing.'
