import assert from "node:assert/strict";
import test from "node:test";
import { assessAndroidUpdate, compareVersions } from "../lib/androidUpdate.ts";

test("Android semantic version comparison handles increasing releases", () => {
  assert.equal(compareVersions("2.2.8", "2.2.6"), 1); assert.equal(compareVersions("2.2.6", "2.2.6"), 0); assert.equal(compareVersions("2.1.69", "2.2.6"), -1);
});

test("Android update offer is blocked until data, artifact and signing metadata are established", () => {
  const base = { version: "2.2.8", releasedAt: "2026-08-25T00:00:00.000Z", minimumWebDataVersion: 1, maximumWebDataVersion: 1, releaseNotes: [] };
  assert.equal(assessAndroidUpdate("2.2.6", 1, base).safeToOffer, false);
  const ready = assessAndroidUpdate("2.2.6", 1, { ...base, downloadUrl: "https://example.test/app.apk", apkSha256: "a".repeat(64), signingCertificateSha256: "b".repeat(64) });
  assert.equal(ready.safeToOffer, true); assert.equal(assessAndroidUpdate("2.2.6", 2, { ...base, downloadUrl: "https://example.test/app.apk", apkSha256: "a".repeat(64), signingCertificateSha256: "b".repeat(64) }).safeToOffer, false);
});

test("Android release assessment distinguishes current, behind and installed-ahead versions", () => {
  const manifest = { version: "2.2.9", versionCode: 14, releasedAt: "2026-08-28T00:00:00.000Z", minimumWebDataVersion: 1, maximumWebDataVersion: 1, releaseNotes: [] };
  const current = assessAndroidUpdate("2.2.9", 1, manifest);
  assert.deepEqual({ current: current.current, available: current.available, installedAhead: current.installedAhead }, { current: true, available: false, installedAhead: false });
  assert.equal(assessAndroidUpdate("2.2.8", 1, manifest).available, true);
  assert.equal(assessAndroidUpdate("2.3.0", 1, manifest).installedAhead, true);
});
