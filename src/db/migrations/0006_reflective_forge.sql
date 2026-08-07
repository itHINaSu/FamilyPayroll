CREATE TABLE `trust_area_child` (
	`id` text PRIMARY KEY NOT NULL,
	`trust_area_id` text NOT NULL,
	`child_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`trust_area_id`) REFERENCES `trust_area`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trust_area_child_unique` ON `trust_area_child` (`trust_area_id`,`child_id`);
--> statement-breakpoint
-- Backfill: every area applied to every child before this table existed, so
-- membership defaults to that for anything already in the database. Only
-- areas created and children added from here on need the application code's
-- own instantiate-for-everyone logic; this one-time INSERT is what keeps an
-- upgrade from silently emptying every child's trust view.
INSERT INTO trust_area_child (id, trust_area_id, child_id, created_at)
SELECT lower(hex(randomblob(16))), ta.id, c.id, unixepoch() * 1000
FROM trust_area ta
JOIN child c ON c.household_id = ta.household_id
WHERE NOT EXISTS (
  SELECT 1 FROM trust_area_child tac
  WHERE tac.trust_area_id = ta.id AND tac.child_id = c.id
);