CREATE TABLE IF NOT EXISTS `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`password_salt` text NOT NULL,
	`kdf_salt` text NOT NULL,
	`kdf_iterations` integer DEFAULT 600000 NOT NULL,
	`verifier_cipher` text NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `users_username_unique` ON `users` (`username`);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `__new_user_settings` (
	`user_id` text DEFAULT 'default' NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	PRIMARY KEY(`user_id`, `key`)
);
--> statement-breakpoint
INSERT OR IGNORE INTO `__new_user_settings`("user_id", "key", "value") SELECT 'default', "key", "value" FROM `user_settings`;
--> statement-breakpoint
DROP TABLE IF EXISTS `user_settings`;
--> statement-breakpoint
ALTER TABLE `__new_user_settings` RENAME TO `user_settings`;
--> statement-breakpoint
PRAGMA foreign_keys=ON;
--> statement-breakpoint
ALTER TABLE `hosts` ADD `user_id` text DEFAULT 'default' NOT NULL;
--> statement-breakpoint
ALTER TABLE `snippets` ADD `user_id` text DEFAULT 'default' NOT NULL;