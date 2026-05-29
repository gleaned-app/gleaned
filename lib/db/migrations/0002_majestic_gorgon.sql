CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth_key` text NOT NULL,
	`lang` text DEFAULT 'en' NOT NULL,
	`tz` text DEFAULT 'UTC' NOT NULL,
	`created_at` text NOT NULL
);
