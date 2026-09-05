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
ipa="$PWD/build/Leaf-unsigned.ipa"
mkdir "$staging/Payload"
ditto "$app" "$staging/Payload/App.app"
(cd "$staging" && ditto -c -k --keepParent Payload "$ipa")
unzip -tq build/Leaf-unsigned.ipa
(cd build && shasum -a 256 Leaf-unsigned.ipa > Leaf-unsigned.ipa.sha256)
echo 'Created build/Leaf-unsigned.ipa for LiveContainer import or local signing.'
