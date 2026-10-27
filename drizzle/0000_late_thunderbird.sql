CREATE TABLE `hosted_checkpoints` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`object_key` text NOT NULL,
	`reason` text NOT NULL,
	`app_version` text NOT NULL,
	`shift_context` text,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`daily_bucket` text NOT NULL,
	`ciphertext_sha256` text NOT NULL,
	`byte_size` integer NOT NULL,
	`status` text NOT NULL,
	`verified_at` text
);
--> statement-breakpoint
CREATE TABLE `hosted_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`auth_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shared_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`view_token_hash` text NOT NULL,
	`revoke_token_hash` text NOT NULL,
	`object_key` text NOT NULL,
	`report_type` text NOT NULL,
	`title` text NOT NULL,
	`route_privacy` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`status` text NOT NULL,
	`revoked_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shared_reports_view_token_hash_unique` ON `shared_reports` (`view_token_hash`);