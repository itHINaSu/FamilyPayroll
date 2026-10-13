-- Pay the morning after the period ends instead of days later.
UPDATE `policy_version`
SET `payload_json` = json_set(`payload_json`, '$.pay.payDateOffsetDays', 1)
WHERE json_extract(`payload_json`, '$.pay.payDateOffsetDays') > 1;--> statement-breakpoint
-- Anything already waiting on the old, longer gap pays on the next run.
UPDATE `pay_period`
SET `pay_date` = date(`end_date`, '+1 day')
WHERE `status` != 'posted' AND `pay_date` > date(`end_date`, '+1 day');
