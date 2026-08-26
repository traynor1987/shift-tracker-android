#!/usr/bin/env bash
set -euo pipefail

umask 077

OUTPUT_PATH="${1:-shift-tracker-release.jks}"
ALIAS="shifttracker"

if [[ -e "$OUTPUT_PATH" ]]; then
  printf 'Refusing to overwrite existing keystore: %s\n' "$OUTPUT_PATH" >&2
  exit 1
fi

command -v keytool >/dev/null 2>&1 || {
  printf 'keytool was not found. Install Java 17 first.\n' >&2
  exit 1
}

printf 'Creating the permanent Shift Tracker signing identity.\n'
printf 'Keep this keystore and both passwords safe. Losing them prevents future APK updates.\n\n'

keytool -genkeypair \
  -v \
  -keystore "$OUTPUT_PATH" \
  -alias "$ALIAS" \
  -keyalg RSA \
  -keysize 4096 \
  -validity 10000 \
  -dname "CN=Shift Tracker, OU=Personal Apps, O=James Traynor, C=GB"

BASE64_PATH="$OUTPUT_PATH.base64"
base64 "$OUTPUT_PATH" | tr -d '\n' > "$BASE64_PATH"
printf '\nCreated:\n  %s\n  %s\n\n' "$OUTPUT_PATH" "$BASE64_PATH"
printf 'GitHub Actions secret names:\n'
printf '  SHIFT_TRACKER_KEYSTORE_BASE64  = contents of %s\n' "$BASE64_PATH"
printf '  SHIFT_TRACKER_KEYSTORE_PASSWORD = the keystore password you entered\n'
printf '  SHIFT_TRACKER_KEY_ALIAS         = %s\n' "$ALIAS"
printf '  SHIFT_TRACKER_KEY_PASSWORD      = the key password you entered\n'
printf '\nNever commit either generated file to Git. Store the .jks in two secure places.\n'
