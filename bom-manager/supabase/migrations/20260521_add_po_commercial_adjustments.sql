ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS commercial_adjustment_label TEXT,
  ADD COLUMN IF NOT EXISTS commercial_adjustment_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commercial_adjustment_amount NUMERIC(18, 2) NOT NULL DEFAULT 0;
