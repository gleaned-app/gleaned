ALTER TABLE `settings` ADD `encryption_salt` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `encryption_iterations` integer DEFAULT 600000 NOT NULL;