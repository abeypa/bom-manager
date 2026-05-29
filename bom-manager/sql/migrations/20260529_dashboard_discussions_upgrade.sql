-- 20260529_dashboard_discussions_upgrade.sql
-- Expand pending_parts into a shared work-item + discussion model.

ALTER TABLE public.pending_parts
  ALTER COLUMN project_id DROP NOT NULL;

ALTER TABLE public.pending_parts
  ADD COLUMN IF NOT EXISTS item_type TEXT NOT NULL DEFAULT 'work_item',
  ADD COLUMN IF NOT EXISTS discussion_status TEXT NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

UPDATE public.pending_parts
SET item_type = COALESCE(item_type, 'work_item')
WHERE item_type IS NULL;

UPDATE public.pending_parts
SET discussion_status = COALESCE(discussion_status, 'open')
WHERE discussion_status IS NULL;

CREATE INDEX IF NOT EXISTS idx_pending_parts_item_type
  ON public.pending_parts(item_type);

CREATE INDEX IF NOT EXISTS idx_pending_parts_discussion_status
  ON public.pending_parts(discussion_status);

CREATE INDEX IF NOT EXISTS idx_pending_parts_project_type
  ON public.pending_parts(project_id, item_type);
