CREATE TABLE `responsibility_template` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`name` text NOT NULL,
	`icon` text,
	`weekly_value_cents` integer NOT NULL,
	`cadence` text NOT NULL,
	`days_of_week` text,
	`max_occurrences` integer,
	`active` integer DEFAULT true NOT NULL,
	`archived_at` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `responsibility_template_household_idx` ON `responsibility_template` (`household_id`,`active`);--> statement-breakpoint
ALTER TABLE `responsibility` ADD `template_id` text REFERENCES responsibility_template(id);--> statement-breakpoint
ALTER TABLE `responsibility` ADD `synced_with_template` integer DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX `responsibility_template_idx` ON `responsibility` (`template_id`);