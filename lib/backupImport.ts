import { BACKUP_KIND, validateBackupDocument, type BackupValidationResult } from "./backup.ts";

export type BackupClientEnvironment = "android-webview" | "installed-pwa" | "browser";
export type BackupTextEncoding = "utf-8" | "utf-8-bom" | "utf-16le" | "utf-16be";
export type BackupDocumentType = "full-backup" | "historical-backup" | "today-state" | "unknown";
export type BackupImportFailureCode =
  | "EMPTY_FILE"
  | "FILE_READ_FAILED"
  | "TEXT_DECODE_FAILED"
  | "INVALID_JSON"
  | "DOCUMENT_TYPE_MISMATCH"
  | "UNSUPPORTED_FORMAT"
  | "INVALID_METADATA"
  | "INVALID_DATA";

type BackupFileLike = Pick<Blob, "arrayBuffer" | "size" | "type"> & { name?: string };

export interface SafeBackupImportMetadata {
  client: BackupClientEnvironment;
  byteLength: number;
  encoding: BackupTextEncoding | null;
  mime: "json" | "text" | "empty" | "other";
  extension: "json" | "other" | "none";
  documentType: BackupDocumentType;
  formatVersion: number | null;
  appVersion: string | null;
}

export type BackupFileValidationResult =
  | { ok: true; validation: Extract<BackupValidationResult, { ok: true }>; metadata: SafeBackupImportMetadata }
  | { ok: false; code: BackupImportFailureCode; stage: "read" | "decode" | "parse" | "validation"; message: string; metadata: SafeBackupImportMetadata };

const emptyMetadata = (file: BackupFileLike, client: BackupClientEnvironment): SafeBackupImportMetadata => ({
  client,
  byteLength: Number.isFinite(file.size) ? file.size : 0,
  encoding: null,
  mime: file.type === "" ? "empty" : /json/i.test(file.type) ? "json" : /^text\//i.test(file.type) ? "text" : "other",
  extension: typeof file.name !== "string" || !file.name.includes(".") ? "none" : /\.json$/i.test(file.name) ? "json" : "other",
  documentType: "unknown",
  formatVersion: null,
  appVersion: null,
});

const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));

function safeAppVersion(value: unknown) {
  return typeof value === "string" && /^\d+(?:\.\d+){1,3}(?:[-+][A-Za-z0-9.-]+)?$/.test(value) ? value : null;
}

function classifyDocument(value: unknown): Pick<SafeBackupImportMetadata, "documentType" | "formatVersion" | "appVersion"> {
  if (!record(value)) return { documentType: "unknown", formatVersion: null, appVersion: null };
  if (value.kind === BACKUP_KIND) return {
    documentType: "full-backup",
    formatVersion: Number.isInteger(value.formatVersion) ? value.formatVersion as number : null,
    appVersion: safeAppVersion(value.appVersion),
  };
  if (value.kind === "shift-tracker-today-state") return { documentType: "today-state", formatVersion: null, appVersion: null };
  if (value.version === 1 && Array.isArray(value.shifts)) return { documentType: "historical-backup", formatVersion: null, appVersion: null };
  return {
    documentType: "unknown",
    formatVersion: Number.isInteger(value.formatVersion) ? value.formatVersion as number : null,
    appVersion: safeAppVersion(value.appVersion),
  };
}

function decoding(bytes: Uint8Array): { encoding: BackupTextEncoding; offset: number } {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return { encoding: "utf-8-bom", offset: 3 };
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return { encoding: "utf-16le", offset: 2 };
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return { encoding: "utf-16be", offset: 2 };
  // Some document providers omit a UTF-16 BOM. JSON's opening brace still
  // gives us a safe, format-specific signal without guessing from MIME/name.
  if (bytes.length >= 4 && bytes[0] === 0x7b && bytes[1] === 0x00) return { encoding: "utf-16le", offset: 0 };
  if (bytes.length >= 4 && bytes[0] === 0x00 && bytes[1] === 0x7b) return { encoding: "utf-16be", offset: 0 };
  return { encoding: "utf-8", offset: 0 };
}

function decodeBytes(bytes: Uint8Array, encoding: BackupTextEncoding, offset: number) {
  const label = encoding === "utf-8-bom" ? "utf-8" : encoding;
  const decoded = new TextDecoder(label, { fatal: true }).decode(bytes.subarray(offset));
  return decoded.charCodeAt(0) === 0xfeff ? decoded.slice(1) : decoded;
}

function validationCode(validation: Extract<BackupValidationResult, { ok: false }>, documentType: BackupDocumentType): BackupImportFailureCode {
  if (documentType === "today-state" || validation.issues.some((issue) => issue.includes("backup kind"))) return "DOCUMENT_TYPE_MISMATCH";
  if (validation.issues.some((issue) => issue.includes("format version"))) return "UNSUPPORTED_FORMAT";
  if (validation.issues.some((issue) => issue.includes("metadata"))) return "INVALID_METADATA";
  return "INVALID_DATA";
}

/**
 * Browser tabs, installed PWAs and the Android hosted WebView all use this
 * exact byte -> text -> JSON -> canonical validator pipeline. Filename and
 * MIME are diagnostics only and never determine whether a backup is accepted.
 */
export async function validateBackupFile(file: BackupFileLike, client: BackupClientEnvironment): Promise<BackupFileValidationResult> {
  const metadata = emptyMetadata(file, client);
  if (file.size === 0) return { ok: false, code: "EMPTY_FILE", stage: "read", message: "The selected backup file is empty.", metadata };
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
    metadata.byteLength = bytes.byteLength;
  } catch {
    return { ok: false, code: "FILE_READ_FAILED", stage: "read", message: "The selected backup file could not be read.", metadata };
  }
  if (!bytes.byteLength) return { ok: false, code: "EMPTY_FILE", stage: "read", message: "The selected backup file is empty.", metadata };
  const detected = decoding(bytes);
  metadata.encoding = detected.encoding;
  let text: string;
  try {
    text = decodeBytes(bytes, detected.encoding, detected.offset);
  } catch {
    return { ok: false, code: "TEXT_DECODE_FAILED", stage: "decode", message: "The backup text encoding is not supported or is damaged.", metadata };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, code: "INVALID_JSON", stage: "parse", message: "The selected file does not contain valid JSON.", metadata };
  }
  Object.assign(metadata, classifyDocument(parsed));
  const validation = validateBackupDocument(parsed);
  if (!validation.ok) return { ok: false, code: validationCode(validation, metadata.documentType), stage: "validation", message: validation.message, metadata };
  return { ok: true, validation, metadata };
}

export function backupImportDiagnostic(result: BackupFileValidationResult) {
  const metadata = result.metadata;
  return [
    `client=${metadata.client}`,
    `stage=${result.ok ? "validated" : result.stage}`,
    `code=${result.ok ? "OK" : result.code}`,
    `bytes=${metadata.byteLength}`,
    `encoding=${metadata.encoding ?? "unknown"}`,
    `mime=${metadata.mime}`,
    `extension=${metadata.extension}`,
    `document=${metadata.documentType}`,
    `format=${metadata.formatVersion ?? "none"}`,
    `backupApp=${metadata.appVersion ?? "unknown"}`,
  ].join(" · ");
}
