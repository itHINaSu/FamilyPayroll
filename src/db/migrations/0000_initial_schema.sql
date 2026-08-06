CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`child_id` text NOT NULL,
	`type` text NOT NULL,
	`visible_to_child` integer DEFAULT true NOT NULL,
	`balance_cents` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_child_type_unique` ON `account` (`child_id`,`type`);--> statement-breakpoint
CREATE TABLE `app_secret` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `approval_request` (
	`id` text PRIMARY KEY NOT NULL,
	`child_id` text NOT NULL,
	`kind` text NOT NULL,
	`amount_cents` integer,
	`target_json` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`note` text,
	`requested_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`decided_by_user_id` text,
	`decided_at` integer,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `approval_child_idx` ON `approval_request` (`child_id`,`status`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_user_id` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`before_json` text,
	`after_json` text,
	`at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_entity_idx` ON `audit_log` (`entity_type`,`entity_id`,`at`);--> statement-breakpoint
CREATE TABLE `bill` (
	`id` text PRIMARY KEY NOT NULL,
	`child_id` text NOT NULL,
	`name` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`cadence` text NOT NULL,
	`due_day` integer NOT NULL,
	`nonexistent_date_rule` text DEFAULT 'next_day' NOT NULL,
	`disposition` text NOT NULL,
	`source_account_order` text NOT NULL,
	`may_use_earmarked` integer DEFAULT false NOT NULL,
	`autopay` integer DEFAULT true NOT NULL,
	`shortfall_policy` text DEFAULT 'partial_pay_carry_remainder' NOT NULL,
	`past_due_recovery` text DEFAULT 'from_gross_before_allocation' NOT NULL,
	`past_due_max_recovery_pct` integer DEFAULT 100 NOT NULL,
	`past_due_cap_cents` integer,
	`active` integer DEFAULT true NOT NULL,
	`effective_from` text NOT NULL,
	`archived_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bill_child_idx` ON `bill` (`child_id`,`active`);--> statement-breakpoint
CREATE TABLE `bill_instance` (
	`id` text PRIMARY KEY NOT NULL,
	`bill_id` text NOT NULL,
	`child_id` text NOT NULL,
	`due_date` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`paid_cents` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`policy_snapshot_json` text,
	`generated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`paid_at` integer,
	FOREIGN KEY (`bill_id`) REFERENCES `bill`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bill_instance_unique` ON `bill_instance` (`bill_id`,`due_date`);--> statement-breakpoint
CREATE INDEX `bill_instance_child_idx` ON `bill_instance` (`child_id`,`due_date`,`status`);--> statement-breakpoint
CREATE TABLE `blob` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`mime` text NOT NULL,
	`bytes` blob NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`byte_size` integer NOT NULL,
	`sha256` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `child` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`display_name` text NOT NULL,
	`birthdate` text NOT NULL,
	`photo_blob_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`joined_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`graduated_at` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `child_household_idx` ON `child` (`household_id`,`status`);--> statement-breakpoint
CREATE TABLE `completion` (
	`id` text PRIMARY KEY NOT NULL,
	`expectation_id` text NOT NULL,
	`child_id` text NOT NULL,
	`occurrence_date` text NOT NULL,
	`occurrence_index` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`claimed_by_user_id` text,
	`decided_by_user_id` text,
	`claimed_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`decided_at` integer,
	`pay_period_id` text,
	FOREIGN KEY (`expectation_id`) REFERENCES `expectation`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `completion_occurrence_unique` ON `completion` (`expectation_id`,`occurrence_date`,`occurrence_index`);--> statement-breakpoint
CREATE INDEX `completion_child_date_idx` ON `completion` (`child_id`,`occurrence_date`);--> statement-breakpoint
CREATE TABLE `device` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`dashboard_mode` text DEFAULT 'roster' NOT NULL,
	`last_seen_at` integer,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `device_token_unique` ON `device` (`token_hash`);--> statement-breakpoint
CREATE TABLE `excusal` (
	`id` text PRIMARY KEY NOT NULL,
	`child_id` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`reason` text,
	`scope` text DEFAULT 'all' NOT NULL,
	`expectation_ids` text,
	`created_by_user_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `excusal_child_idx` ON `excusal` (`child_id`,`start_date`,`end_date`);--> statement-breakpoint
CREATE TABLE `expectation` (
	`id` text PRIMARY KEY NOT NULL,
	`child_id` text NOT NULL,
	`name` text NOT NULL,
	`icon` text,
	`weekly_value_cents` integer NOT NULL,
	`cadence` text NOT NULL,
	`days_of_week` text,
	`max_occurrences` integer,
	`active` integer DEFAULT true NOT NULL,
	`effective_from` text NOT NULL,
	`archived_at` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `expectation_child_idx` ON `expectation` (`child_id`,`active`);--> statement-breakpoint
CREATE TABLE `goal` (
	`id` text PRIMARY KEY NOT NULL,
	`child_id` text NOT NULL,
	`name` text NOT NULL,
	`target_cents` integer NOT NULL,
	`photo_blob_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`achieved_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `goal_child_idx` ON `goal` (`child_id`,`status`);--> statement-breakpoint
CREATE TABLE `household` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`week_start_day` integer DEFAULT 1 NOT NULL,
	`app_url` text,
	`vapid_contact` text,
	`guardrails_enabled` integer DEFAULT true NOT NULL,
	`setup_completed_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `interest_accrual` (
	`id` text PRIMARY KEY NOT NULL,
	`child_id` text NOT NULL,
	`account_id` text NOT NULL,
	`accrual_date` text NOT NULL,
	`basis_balance_cents` integer NOT NULL,
	`annual_rate_bp` integer NOT NULL,
	`accrued_micro_cents` integer NOT NULL,
	`posted_at` integer,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `interest_accrual_unique` ON `interest_accrual` (`account_id`,`accrual_date`);--> statement-breakpoint
CREATE INDEX `interest_unposted_idx` ON `interest_accrual` (`account_id`,`posted_at`);--> statement-breakpoint
CREATE TABLE `job` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`photo_blob_id` text,
	`value_cents` integer NOT NULL,
	`eligible_child_ids` text,
	`repeat_rule` text NOT NULL,
	`repeat_n` integer,
	`limit_scope` text DEFAULT 'per_child' NOT NULL,
	`limit_count` integer DEFAULT 1 NOT NULL,
	`claim_expiry_hours` integer DEFAULT 48 NOT NULL,
	`allocation_mode` text DEFAULT 'inherit' NOT NULL,
	`requires_approval` integer DEFAULT true NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `job_household_idx` ON `job` (`household_id`,`active`);--> statement-breakpoint
CREATE TABLE `job_claim` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`child_id` text NOT NULL,
	`status` text DEFAULT 'claimed' NOT NULL,
	`value_cents_snapshot` integer NOT NULL,
	`claimed_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`expires_at` integer NOT NULL,
	`submitted_at` integer,
	`decided_by_user_id` text,
	`decided_at` integer,
	`pay_period_id` text,
	FOREIGN KEY (`job_id`) REFERENCES `job`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `job_claim_child_idx` ON `job_claim` (`child_id`,`status`);--> statement-breakpoint
CREATE INDEX `job_claim_job_idx` ON `job_claim` (`job_id`,`status`);--> statement-breakpoint
CREATE TABLE `ledger_entry` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`child_id` text NOT NULL,
	`account_id` text NOT NULL,
	`goal_id` text,
	`amount_cents` integer NOT NULL,
	`type` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`posted_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`description` text NOT NULL,
	`memo` text,
	`actor_user_id` text,
	`source` text NOT NULL,
	`reverses_entry_id` text,
	`paystub_id` text,
	`bill_instance_id` text,
	`job_claim_id` text,
	`transfer_group_id` text,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ledger_child_idx` ON `ledger_entry` (`child_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `ledger_account_idx` ON `ledger_entry` (`account_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `ledger_goal_idx` ON `ledger_entry` (`goal_id`);--> statement-breakpoint
CREATE INDEX `ledger_type_idx` ON `ledger_entry` (`type`);--> statement-breakpoint
CREATE TABLE `notification_channel` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`config_json` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `notification_log` (
	`id` text PRIMARY KEY NOT NULL,
	`event_type` text NOT NULL,
	`channel_id` text,
	`payload_hash` text NOT NULL,
	`result` text NOT NULL,
	`detail` text,
	`sent_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notification_dedupe_idx` ON `notification_log` (`payload_hash`,`sent_at`);--> statement-breakpoint
CREATE TABLE `notification_rule` (
	`id` text PRIMARY KEY NOT NULL,
	`scope_type` text NOT NULL,
	`scope_id` text NOT NULL,
	`event_type` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`lead_time_minutes` integer,
	`quiet_hours_json` text
);
--> statement-breakpoint
CREATE TABLE `pay_period` (
	`id` text PRIMARY KEY NOT NULL,
	`child_id` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`pay_date` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pay_period_unique` ON `pay_period` (`child_id`,`start_date`);--> statement-breakpoint
CREATE INDEX `pay_period_status_idx` ON `pay_period` (`status`,`pay_date`);--> statement-breakpoint
CREATE TABLE `paystub` (
	`id` text PRIMARY KEY NOT NULL,
	`child_id` text NOT NULL,
	`pay_period_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`potential_cents` integer NOT NULL,
	`earned_cents` integer NOT NULL,
	`bonus_cents` integer DEFAULT 0 NOT NULL,
	`gross_cents` integer NOT NULL,
	`past_due_recovered_cents` integer DEFAULT 0 NOT NULL,
	`net_cents` integer NOT NULL,
	`allocations_json` text NOT NULL,
	`policy_snapshot_json` text NOT NULL,
	`computed_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`revision_window_ends_at` integer NOT NULL,
	`posted_at` integer,
	`revision_count` integer DEFAULT 0 NOT NULL,
	`last_revised_by_user_id` text,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pay_period_id`) REFERENCES `pay_period`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `paystub_period_unique` ON `paystub` (`pay_period_id`);--> statement-breakpoint
CREATE INDEX `paystub_child_idx` ON `paystub` (`child_id`,`status`);--> statement-breakpoint
CREATE TABLE `paystub_line` (
	`id` text PRIMARY KEY NOT NULL,
	`paystub_id` text NOT NULL,
	`kind` text NOT NULL,
	`ref_id` text,
	`label` text NOT NULL,
	`potential_cents` integer DEFAULT 0 NOT NULL,
	`earned_cents` integer DEFAULT 0 NOT NULL,
	`detail_json` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`paystub_id`) REFERENCES `paystub`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `paystub_line_idx` ON `paystub_line` (`paystub_id`);--> statement-breakpoint
CREATE TABLE `policy_version` (
	`id` text PRIMARY KEY NOT NULL,
	`scope_type` text NOT NULL,
	`scope_id` text NOT NULL,
	`effective_from` text NOT NULL,
	`payload_json` text NOT NULL,
	`created_by_user_id` text,
	`note` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `policy_scope_idx` ON `policy_version` (`scope_type`,`scope_id`,`effective_from`);--> statement-breakpoint
CREATE TABLE `push_subscription` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh_key` text NOT NULL,
	`auth_key` text NOT NULL,
	`user_agent` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`last_success_at` integer,
	`failure_count` integer DEFAULT 0 NOT NULL,
	`expired_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_endpoint_unique` ON `push_subscription` (`endpoint`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`user_agent` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token_hash`);--> statement-breakpoint
CREATE INDEX `session_user_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`child_id` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`last_login_at` integer,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);