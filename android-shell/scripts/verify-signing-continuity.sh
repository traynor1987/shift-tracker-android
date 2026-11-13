#!/usr/bin/env bash
set -euo pipefail

# Compare verified certificates, never trust a filename or a reused package alone.
baseline_dir=$(mktemp -d "${RUNNER_TEMP:-/tmp}/shift-signature.XXXXXX")
trap 'rm -rf "$baseline_dir"' EXIT
gh api "repos/$GITHUB_REPOSITORY/releases/latest" > "$baseline_dir/release.json"
previous_url=$(jq -er '.assets[] | select(.name | test("^Shift-Tracker-[0-9].*\\.apk$")) | .browser_download_url' "$baseline_dir/release.json")
curl --fail --silent --show-error --location "$previous_url" -o "$baseline_dir/previous.apk"
signer="$ANDROID_SDK_ROOT/build-tools/35.0.0/apksigner"
"$signer" verify --print-certs "$baseline_dir/previous.apk" > "$baseline_dir/previous-certs.txt"
sed -n 's/^Signer #[0-9]* certificate SHA-256 digest: //p' "$baseline_dir/previous-certs.txt" | sort > "$baseline_dir/previous.sha"
test -s "$baseline_dir/previous.sha"
for apk in app/build/outputs/apk/release/app-release.apk wear/build/outputs/apk/release/wear-release.apk; do
  "$signer" verify --print-certs "$apk" > "$baseline_dir/current-certs.txt"
  sed -n 's/^Signer #[0-9]* certificate SHA-256 digest: //p' "$baseline_dir/current-certs.txt" | sort > "$baseline_dir/current.sha"
  cmp "$baseline_dir/previous.sha" "$baseline_dir/current.sha"
done
echo "Phone and Wear certificates match the installed stable signing identity."
