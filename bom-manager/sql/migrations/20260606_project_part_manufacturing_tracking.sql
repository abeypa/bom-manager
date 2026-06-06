ALTER TABLE public.pending_parts
  ADD COLUMN IF NOT EXISTS project_part_id BIGINT REFERENCES public.project_parts(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_parts_project_part_id_unique
  ON public.pending_parts(project_part_id);

CREATE INDEX IF NOT EXISTS idx_pending_parts_project_part_id
  ON public.pending_parts(project_part_id);
