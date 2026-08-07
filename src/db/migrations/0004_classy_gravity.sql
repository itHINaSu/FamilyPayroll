CREATE TABLE `invite` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`role` text NOT NULL,
	`child_id` text,
	`token_hash` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`used_by_user_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invite_token_unique` ON `invite` (`token_hash`);