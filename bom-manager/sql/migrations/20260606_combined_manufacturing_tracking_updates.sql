-- 20260606_combined_manufacturing_tracking_updates.sql
-- Combined manufacturing-tracking schema update.
-- Safe to rerun because every change uses IF NOT EXISTS semantics where possible.

ALTER TABLE public.work_item_updates
  ADD COLUMN IF NOT EXISTS images JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_delivery_date DATE;

ALTER TABLE public.pending_parts
  ADD COLUMN IF NOT EXISTS project_part_id BIGINT REFERENCES public.project_parts(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_parts_project_part_id_unique
  ON public.pending_parts(project_part_id);

CREATE INDEX IF NOT EXISTS idx_pending_parts_project_part_id
  ON public.pending_parts(project_part_id);
