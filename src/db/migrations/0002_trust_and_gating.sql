CREATE TABLE `focus_note` (
	`id` text PRIMARY KEY NOT NULL,
	`child_id` text NOT NULL,
	`text` text NOT NULL,
	`created_by_user_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `focus_note_child_idx` ON `focus_note` (`child_id`);--> statement-breakpoint
CREATE TABLE `house_rule` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`trust_area_id` text NOT NULL,
	`text` text NOT NULL,
	`default_weight` integer DEFAULT 1 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`trust_area_id`) REFERENCES `trust_area`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `house_rule_household_idx` ON `house_rule` (`household_id`,`active`);--> statement-breakpoint
CREATE TABLE `privilege` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`trust_area_id` text NOT NULL,
	`name` text NOT NULL,
	`icon` text,
	`min_level` integer DEFAULT 3 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`trust_area_id`) REFERENCES `trust_area`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `privilege_household_idx` ON `privilege` (`household_id`,`active`);--> statement-breakpoint
CREATE TABLE `trust_area` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`name` text NOT NULL,
	`icon` text,
	`drain_amount` integer,
	`drain_interval_hours` integer,
	`cap_load` integer,
	`thresholds_json` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `trust_area_household_idx` ON `trust_area` (`household_id`,`active`);--> statement-breakpoint
CREATE TABLE `trust_area_override` (
	`id` text PRIMARY KEY NOT NULL,
	`child_id` text NOT NULL,
	`trust_area_id` text NOT NULL,
	`drain_amount` integer,
	`drain_interval_hours` integer,
	`cap_load` integer,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`trust_area_id`) REFERENCES `trust_area`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trust_override_unique` ON `trust_area_override` (`child_id`,`trust_area_id`);--> statement-breakpoint
CREATE TABLE `trust_mark` (
	`id` text PRIMARY KEY NOT NULL,
	`child_id` text NOT NULL,
	`trust_area_id` text NOT NULL,
	`house_rule_id` text,
	`weight` integer NOT NULL,
	`note` text,
	`occurred_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_by_user_id` text,
	`retracted_at` integer,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`trust_area_id`) REFERENCES `trust_area`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `trust_mark_child_idx` ON `trust_mark` (`child_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `trust_state` (
	`id` text PRIMARY KEY NOT NULL,
	`child_id` text NOT NULL,
	`trust_area_id` text NOT NULL,
	`load` integer DEFAULT 0 NOT NULL,
	`last_drained_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`pinned_level` integer,
	`pin_expires_at` integer,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`trust_area_id`) REFERENCES `trust_area`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trust_state_unique` ON `trust_state` (`child_id`,`trust_area_id`);--> statement-breakpoint
ALTER TABLE `job` ADD `trust_area_id` text;--> statement-breakpoint
ALTER TABLE `job` ADD `min_trust_level` integer;