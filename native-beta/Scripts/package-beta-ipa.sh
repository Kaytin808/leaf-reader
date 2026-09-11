#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "$0")/../.." && pwd)"
build_dir="$root_dir/build/readium-beta"
archive="$build_dir/KaylasLibraryReadiumBeta.xcarchive"
app="$archive/Products/Applications/KaylasLibraryReadiumBeta.app"
staging="$build_dir/ipa-staging"
ipa="$build_dir/Kaylas-Library-Readium-Beta-unsigned.ipa"

test -d "$app"
rm -rf "$staging"
mkdir -p "$staging/Payload"
ditto "$app" "$staging/Payload/KaylasLibraryReadiumBeta.app"

(
  cd "$staging"
  /usr/bin/zip -qry "$ipa" Payload
)

shasum -a 256 "$ipa" > "$ipa.sha256"
/usr/bin/unzip -tq "$ipa"
test -s "$ipa"

echo "Packaged $(du -h "$ipa" | awk '{print $1}') Readium beta IPA"
