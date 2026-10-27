import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(new URL("../.github/workflows/android-debug-apk.yml", import.meta.url), "utf8");

test("Android cloud workflow builds and uploads a debug APK without release signing", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /actions\/checkout@v4/);
  assert.match(workflow, /actions\/setup-java@v4/);
  assert.match(workflow, /android-actions\/setup-android@v3/);
  assert.match(workflow, /gradle\/actions\/setup-gradle@v4/);
  assert.match(workflow, /gradle-version:\s*["']8\.9["']/);
  assert.match(workflow, /:app:assembleDebug/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /app-debug\.apk/);
  assert.doesNotMatch(workflow, /signingConfigs|SIGNING_KEY|KEYSTORE_PASSWORD|release signing/i);
});
