import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const hostedRequestBudgets = sqliteTable("hosted_request_budgets", {
  scope: text("scope").notNull(),
  bucket: text("bucket").notNull(),
  used: integer("used").notNull(),
}, (table) => [primaryKey({ columns: [table.scope, table.bucket] })]);

export const hostedDevices = sqliteTable("hosted_devices", {
  id: text("id").primaryKey(),
  authHash: text("auth_hash").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const hostedCheckpoints = sqliteTable("hosted_checkpoints", {
  id: text("id").primaryKey(),
  deviceId: text("device_id").notNull(),
  objectKey: text("object_key").notNull(),
  reason: text("reason").notNull(),
  appVersion: text("app_version").notNull(),
  shiftContext: text("shift_context"),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  dailyBucket: text("daily_bucket").notNull(),
  ciphertextSha256: text("ciphertext_sha256").notNull(),
  byteSize: integer("byte_size").notNull(),
  status: text("status").notNull(),
  verifiedAt: text("verified_at"),
}, (table) => [index("hosted_checkpoints_device_created_idx").on(table.deviceId, table.createdAt)]);

export const sharedReports = sqliteTable("shared_reports", {
  id: text("id").primaryKey(),
  deviceId: text("device_id").notNull(),
  viewTokenHash: text("view_token_hash").notNull().unique(),
  revokeTokenHash: text("revoke_token_hash").notNull(),
  objectKey: text("object_key").notNull(),
  reportType: text("report_type").notNull(),
  title: text("title").notNull(),
  routePrivacy: text("route_privacy").notNull(),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  status: text("status").notNull(),
  revokedAt: text("revoked_at"),
}, (table) => [index("shared_reports_device_created_idx").on(table.deviceId, table.createdAt)]);
