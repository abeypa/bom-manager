-- Add discount_percent column to project_parts table
-- This allows snapshots of parts to retain their specific discount rate at the time of addition.

ALTER TABLE project_parts 
ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5, 2) NOT NULL DEFAULT 0;

-- Optional: Update existing records to inherit current master discount (one-time heal)
-- Note: This is an approximation of what the discount was.
UPDATE project_parts pp
SET discount_percent = COALESCE(
  CASE 
    WHEN pp.part_type = 'mechanical_manufacture' THEN (SELECT discount_percent FROM mechanical_manufacture WHERE id = pp.part_id)
    WHEN pp.part_type = 'mechanical_bought_out' THEN (SELECT discount_percent FROM mechanical_bought_out WHERE id = pp.part_id)
    WHEN pp.part_type = 'electrical_manufacture' THEN (SELECT discount_percent FROM electrical_manufacture WHERE id = pp.part_id)
    WHEN pp.part_type = 'electrical_bought_out' THEN (SELECT discount_percent FROM electrical_bought_out WHERE id = pp.part_id)
    WHEN pp.part_type = 'pneumatic_bought_out' THEN (SELECT discount_percent FROM pneumatic_bought_out WHERE id = pp.part_id)
    ELSE 0
  END,
  0
)
WHERE discount_percent = 0;
