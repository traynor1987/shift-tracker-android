import assert from "node:assert/strict";
import { File } from "node:buffer";
import test from "node:test";
import { applyValidatedBackup, createBackupDocument } from "../lib/backup.ts";
import { backupImportDiagnostic, validateBackupFile, type BackupClientEnvironment } from "../lib/backupImport.ts";
import { emptyData } from "../lib/domain.ts";

const stamp = new Date("2026-08-23T14:30:00.000Z");
const currentDocument = () => createBackupDocument(emptyData(), "2.1.44", stamp);
const jsonFile = (value: unknown, name = "shift-tracker-backup.json", type = "application/json") => new File([JSON.stringify(value)], name, { type });

test("APK WebView, installed PWA and browser feed identical bytes into the same backup validator", async () => {
  const document = currentDocument();
  const results = await Promise.all((["android-webview", "installed-pwa", "browser"] as BackupClientEnvironment[]).map((client) => validateBackupFile(jsonFile(document), client)));
  for (const result of results) {
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.validation.preview.appVersion, "2.1.44");
      assert.equal(result.validation.preview.formatVersion, 1);
    }
  }
  assert.deepEqual(results.map((result) => result.ok && result.validation.data), [results[0].ok && results[0].validation.data, results[0].ok && results[0].validation.data, results[0].ok && results[0].validation.data]);
});

test("browser File API accepts current and supported historical backups without MIME or filename assumptions", async () => {
  const current = await validateBackupFile(jsonFile(currentDocument(), "renamed.data", "application/octet-stream"), "browser");
  assert.equal(current.ok, true);

  const historical = emptyData();
  delete historical.settings.settingsStyle;
  const legacy = await validateBackupFile(jsonFile(historical, "old-backup.json", "text/plain"), "installed-pwa");
  assert.equal(legacy.ok, true);
  if (legacy.ok) assert.equal(legacy.validation.preview.historicalFormat, true);
});

test("UTF-8 BOM and UTF-16 document-provider encodings reach the same validator", async () => {
  const text = JSON.stringify(currentDocument());
  const utf8Bom = new File([new Uint8Array([0xef, 0xbb, 0xbf]), text], "bom.json", { type: "application/json" });
  const bomResult = await validateBackupFile(utf8Bom, "browser");
  assert.equal(bomResult.ok, true);
  assert.equal(bomResult.metadata.encoding, "utf-8-bom");

  const utf16Bytes = new Uint8Array(2 + text.length * 2);
  utf16Bytes.set([0xff, 0xfe]);
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    utf16Bytes[2 + index * 2] = code & 0xff;
    utf16Bytes[3 + index * 2] = code >> 8;
  }
  const utf16Result = await validateBackupFile(new File([utf16Bytes], "utf16.json", { type: "application/json" }), "installed-pwa");
  assert.equal(utf16Result.ok, true);
  assert.equal(utf16Result.metadata.encoding, "utf-16le");
});

test("invalid JSON and non-Shift-Tracker JSON remain rejected with safe stage codes", async () => {
  const invalid = await validateBackupFile(new File(["{broken"], "broken.json", { type: "application/json" }), "browser");
  assert.equal(invalid.ok, false);
  if (!invalid.ok) {
    assert.equal(invalid.code, "INVALID_JSON");
    assert.equal(invalid.stage, "parse");
  }

  const unrelated = await validateBackupFile(jsonFile({ kind: "some-other-product", formatVersion: 1, secret: "must-not-log" }), "installed-pwa");
  assert.equal(unrelated.ok, false);
  if (!unrelated.ok) {
    assert.equal(unrelated.code, "DOCUMENT_TYPE_MISMATCH");
    assert.equal(unrelated.metadata.documentType, "unknown");
    const diagnostic = backupImportDiagnostic(unrelated);
    assert.doesNotMatch(diagnostic, /some-other-product|must-not-log/);
  }
});

test("selecting a Today State transfer is classified without weakening Full Backup validation", async () => {
  const todayState = await validateBackupFile(jsonFile({ kind: "shift-tracker-today-state", version: 1, exportedAt: stamp.toISOString(), localDate: "2026-08-23", data: emptyData() }), "browser");
  assert.equal(todayState.ok, false);
  if (!todayState.ok) {
    assert.equal(todayState.code, "DOCUMENT_TYPE_MISMATCH");
    assert.equal(todayState.metadata.documentType, "today-state");
  }
});

test("failed browser file validation leaves the current dataset object untouched", async () => {
  const current = emptyData();
  current.settings.hourlyRatePence = 1296;
  const snapshot = structuredClone(current);
  const failed = await validateBackupFile(jsonFile({ kind: "wrong-backup", formatVersion: 1 }), "browser");
  const replacement = failed.ok ? applyValidatedBackup(current, failed.validation, true) : current;
  assert.equal(replacement, current);
  assert.deepEqual(current, snapshot);
});
