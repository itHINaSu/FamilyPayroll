ALTER TABLE `responsibility_template` ADD `applies_to_new_children` integer DEFAULT true NOT NULL;--> statement-breakpoint
-- Backfill: a template some current child doesn't have was a one-child
-- responsibility, so new children shouldn't get it either.
UPDATE `responsibility_template` SET `applies_to_new_children` = 0
WHERE EXISTS (
  SELECT 1 FROM `child` c
  WHERE c.`household_id` = `responsibility_template`.`household_id`
    AND c.`status` != 'archived'
    AND NOT EXISTS (
      SELECT 1 FROM `responsibility` r
      WHERE r.`template_id` = `responsibility_template`.`id`
        AND r.`child_id` = c.`id`
        AND r.`active` = 1
    )
);
