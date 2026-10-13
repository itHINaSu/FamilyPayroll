ALTER TABLE `bill_template` ADD `applies_to_new_children` integer DEFAULT true NOT NULL;--> statement-breakpoint
UPDATE `bill_template` SET `applies_to_new_children` = 0
WHERE EXISTS (
  SELECT 1 FROM `child` c
  WHERE c.`household_id` = `bill_template`.`household_id`
    AND c.`status` != 'archived'
    AND NOT EXISTS (
      SELECT 1 FROM `bill` b
      WHERE b.`template_id` = `bill_template`.`id`
        AND b.`child_id` = c.`id`
        AND b.`active` = 1
    )
);
