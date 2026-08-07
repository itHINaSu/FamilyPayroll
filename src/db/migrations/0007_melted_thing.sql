CREATE TABLE `bill_template` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`name` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`cadence` text NOT NULL,
	`due_day` integer NOT NULL,
	`disposition` text NOT NULL,
	`source_account_order` text NOT NULL,
	`may_use_earmarked` integer DEFAULT false NOT NULL,
	`autopay` integer DEFAULT true NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`archived_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bill_template_household_idx` ON `bill_template` (`household_id`,`active`);--> statement-breakpoint
ALTER TABLE `bill` ADD `template_id` text REFERENCES bill_template(id);--> statement-breakpoint
ALTER TABLE `bill` ADD `synced_with_template` integer DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX `bill_template_idx` ON `bill` (`template_id`);