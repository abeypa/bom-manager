ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS original_currency TEXT,
  ADD COLUMN IF NOT EXISTS original_grand_total NUMERIC(18, 2),
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18, 6),
  ADD COLUMN IF NOT EXISTS exchange_rate_date DATE,
  ADD COLUMN IF NOT EXISTS exchange_rate_source TEXT,
  ADD COLUMN IF NOT EXISTS original_commercial_adjustment_amount NUMERIC(18, 2);

ALTER TABLE purchase_order_items
  ADD COLUMN IF NOT EXISTS original_currency TEXT,
  ADD COLUMN IF NOT EXISTS original_unit_price NUMERIC(18, 2),
  ADD COLUMN IF NOT EXISTS original_total_amount NUMERIC(18, 2);

UPDATE purchase_orders
SET
  original_currency = COALESCE(original_currency, currency),
  original_grand_total = COALESCE(original_grand_total, grand_total),
  original_commercial_adjustment_amount = COALESCE(original_commercial_adjustment_amount, commercial_adjustment_amount)
WHERE
  original_currency IS NULL
  OR original_grand_total IS NULL
  OR original_commercial_adjustment_amount IS NULL;

UPDATE purchase_order_items poi
SET
  original_currency = COALESCE(poi.original_currency, po.currency),
  original_unit_price = COALESCE(poi.original_unit_price, poi.unit_price),
  original_total_amount = COALESCE(poi.original_total_amount, poi.total_amount)
FROM purchase_orders po
WHERE po.id = poi.purchase_order_id
  AND (
    poi.original_currency IS NULL
    OR poi.original_unit_price IS NULL
    OR poi.original_total_amount IS NULL
  );
