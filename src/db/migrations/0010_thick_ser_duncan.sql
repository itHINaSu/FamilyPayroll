ALTER TABLE `responsibility` ADD `pay_mode` text DEFAULT 'expected' NOT NULL;--> statement-breakpoint
ALTER TABLE `responsibility` ADD `all_or_nothing` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `responsibility_template` ADD `pay_mode` text DEFAULT 'expected' NOT NULL;--> statement-breakpoint
ALTER TABLE `responsibility_template` ADD `all_or_nothing` integer DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE `responsibility` SET `pay_mode` = 'optional' WHERE `cadence` = 'up_to_n';--> statement-breakpoint
UPDATE `responsibility_template` SET `pay_mode` = 'optional' WHERE `cadence` = 'up_to_n';
