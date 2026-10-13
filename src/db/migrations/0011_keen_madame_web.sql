DROP TABLE `focus_note`;--> statement-breakpoint
DROP TABLE `house_rule`;--> statement-breakpoint
DROP TABLE `privilege`;--> statement-breakpoint
DROP TABLE `trust_area_child`;--> statement-breakpoint
DROP TABLE `trust_area_override`;--> statement-breakpoint
DROP TABLE `trust_mark`;--> statement-breakpoint
DROP TABLE `trust_state`;--> statement-breakpoint
DROP TABLE `trust_area`;--> statement-breakpoint
ALTER TABLE `job` DROP COLUMN `trust_area_id`;--> statement-breakpoint
ALTER TABLE `job` DROP COLUMN `min_trust_level`;
