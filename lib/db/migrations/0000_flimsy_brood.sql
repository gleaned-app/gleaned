CREATE TABLE `entries` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`next_review` text,
	`review_interval` real,
	`data_enc` blob NOT NULL
);
--> statement-breakpoint
CREATE INDEX `entries_date` ON `entries` (`date`);--> statement-breakpoint
CREATE INDEX `entries_next_review` ON `entries` (`next_review`);--> statement-breakpoint
CREATE TABLE `threads` (
	`id` text PRIMARY KEY NOT NULL,
	`done` integer DEFAULT 0 NOT NULL,
	`due_date` text,
	`color` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`data_enc` blob NOT NULL
);
--> statement-breakpoint
CREATE INDEX `threads_due` ON `threads` (`done`,`due_date`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` text PRIMARY KEY DEFAULT 'gleaned_settings' NOT NULL,
	`password_verifier` text,
	`language` text DEFAULT 'de' NOT NULL,
	`week_start` text DEFAULT 'monday' NOT NULL,
	`theme` text DEFAULT 'system' NOT NULL,
	`body_font` text DEFAULT 'sans' NOT NULL,
	`default_view` text DEFAULT 'journal' NOT NULL,
	`auto_lock_after_minutes` integer DEFAULT 15 NOT NULL,
	`custom_entry_types` text DEFAULT '[]' NOT NULL,
	`context_sources` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sessions_expires` ON `sessions` (`expires_at`);