CREATE TABLE `pending_mfa_challenge` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `user` ADD `totp_secret` text;--> statement-breakpoint
ALTER TABLE `user` ADD `totp_enabled_at` integer;--> statement-breakpoint
ALTER TABLE `user` ADD `totp_recovery_codes_json` text;