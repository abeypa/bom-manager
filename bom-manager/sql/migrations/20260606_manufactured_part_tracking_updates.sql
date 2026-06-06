-- 20260606_manufactured_part_tracking_updates.sql
-- Add image evidence and delivery-date revision fields for manufacturing updates.

ALTER TABLE public.work_item_updates
  ADD COLUMN IF NOT EXISTS images JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_delivery_date DATE;
