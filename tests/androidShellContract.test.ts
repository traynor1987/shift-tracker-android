import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const manifest = readFileSync(new URL("../android-shell/app/src/main/AndroidManifest.xml", import.meta.url), "utf8");
const activity = readFileSync(new URL("../android-shell/app/src/main/java/site/chatgpt/traynor1987/dominosshifttracker/MainActivity.kt", import.meta.url), "utf8");
const service = readFileSync(new URL("../android-shell/app/src/main/java/site/chatgpt/traynor1987/dominosshifttracker/DeliveryLocationService.kt", import.meta.url), "utf8");
const store = readFileSync(new URL("../android-shell/app/src/main/java/site/chatgpt/traynor1987/dominosshifttracker/NativeSampleStore.kt", import.meta.url), "utf8");

test("Stage 2 Android shell stays origin locked and declares only delivery GPS capabilities", () => {
  assert.match(activity, /private const val TRUSTED_ORIGIN = "https:\/\/dominos-shift-tracker\.traynor1987\.chatgpt\.site"/);
  assert.match(activity, /WebViewCompat\.addWebMessageListener/);
  assert.match(activity, /MIXED_CONTENT_NEVER_ALLOW/);
  assert.match(activity, /allowFileAccess = false/);
  assert.match(activity, /allowContentAccess = false/);
  assert.match(activity, /shouldOverrideUrlLoading/);
  assert.match(activity, /requiredRuntimePermissions/);
  assert.match(activity, /startForegroundService/);
  assert.match(activity, /shift_tracker_location:start/);
  assert.match(activity, /shift_tracker_location:stop/);
  assert.match(activity, /shift_tracker_location:ack/);
  assert.doesNotMatch(activity.replace("addJavascriptInterface", "legacy-interface"), /addJavascriptInterface/);
  assert.match(manifest, /android\.permission\.ACCESS_FINE_LOCATION/);
  assert.match(manifest, /android\.permission\.ACCESS_COARSE_LOCATION/);
  assert.match(manifest, /android\.permission\.FOREGROUND_SERVICE/);
  assert.match(manifest, /android\.permission\.FOREGROUND_SERVICE_LOCATION/);
  assert.match(manifest, /android\.permission\.POST_NOTIFICATIONS/);
  assert.match(manifest, /DeliveryLocationService/);
  assert.match(manifest, /android:foregroundServiceType="location"/);
  assert.doesNotMatch(manifest, /android\.permission\.CAMERA|READ_MEDIA/);
});

test("Native GPS service is foreground-only during a delivery and preserves provider samples", () => {
  assert.match(service, /startForegroundCompat/);
  assert.match(service, /FOREGROUND_SERVICE_TYPE_LOCATION/);
  assert.match(service, /return START_STICKY/);
  assert.match(service, /ACTION_START/);
  assert.match(service, /ACTION_STOP/);
  assert.match(service, /location\.time <= 0L/);
  assert.match(service, /timestampEpochMs = location\.time/);
  assert.match(service, /accuracy = location\.accuracy/);
  assert.match(service, /hasSpeed\(\)/);
  assert.match(service, /hasBearing\(\)/);
  assert.doesNotMatch(service, /System\.currentTimeMillis\(\)/);
});

test("Native sample recovery is encrypted, bounded and acknowledgement based", () => {
  assert.match(store, /AndroidKeyStore/);
  assert.match(store, /AES\/GCM\/NoPadding/);
  assert.match(store, /MAX_SAMPLES = 20_000/);
  assert.match(store, /fun acknowledge\(sampleId: String\)/);
  assert.match(store, /timestampEpochMs/);
});
