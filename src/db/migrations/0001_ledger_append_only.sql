-- Invariant I2: the ledger is append-only.
--
-- Enforced in the database rather than in application code, because the whole
-- point of an immutable ledger is that no future code path can quietly violate
-- it. Corrections are new rows with reverses_entry_id set; the original stays.
--
-- The one permitted mutation is deleting a child, which cascades. Ledger rows
-- should outlive participation (invariant I7 archives children instead of
-- deleting them), so the delete trigger fires unconditionally.

CREATE TRIGGER ledger_entry_no_update
BEFORE UPDATE ON ledger_entry
BEGIN
  SELECT RAISE(ABORT, 'ledger_entry is append-only: post a reversing entry instead of updating (invariant I2)');
END;
--> statement-breakpoint

CREATE TRIGGER ledger_entry_no_delete
BEFORE DELETE ON ledger_entry
BEGIN
  SELECT RAISE(ABORT, 'ledger_entry is append-only: post a reversing entry instead of deleting (invariant I2)');
END;
--> statement-breakpoint

-- Invariant I5: a posted pay stub is immutable and carries its own policy
-- snapshot. Drafts stay editable so the revision window works; the transition
-- draft -> posted is the last change a stub ever sees.

CREATE TRIGGER paystub_posted_immutable
BEFORE UPDATE ON paystub
WHEN OLD.status = 'posted'
BEGIN
  SELECT RAISE(ABORT, 'a posted paystub is immutable: use an adjustment ledger entry (invariant I5)');
END;
--> statement-breakpoint

CREATE TRIGGER paystub_posted_no_delete
BEFORE DELETE ON paystub
WHEN OLD.status = 'posted'
BEGIN
  SELECT RAISE(ABORT, 'a posted paystub cannot be deleted (invariant I5)');
END;
