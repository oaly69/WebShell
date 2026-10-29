CREATE TABLE `hosts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`group_name` text DEFAULT '默认分组' NOT NULL,
	`hostname` text NOT NULL,
	`port` integer DEFAULT 22 NOT NULL,
	`username` text NOT NULL,
	`auth_type` text NOT NULL,
	`encrypted_cred` text NOT NULL,
	`jump_host_id` text,
	`keepalive_interval` integer DEFAULT 30,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `snippets` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`category` text DEFAULT '通用' NOT NULL,
	`command` text NOT NULL,
	`auto_enter` integer DEFAULT 1 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `vault_meta` (
	`id` text PRIMARY KEY NOT NULL,
	`kdf_salt` text NOT NULL,
	`kdf_iterations` integer DEFAULT 600000 NOT NULL,
	`verifier_cipher` text NOT NULL,
	`updated_at` integer NOT NULL
);
