-- ============================================================
-- Pending Parts – Add priority column
-- ============================================================

ALTER TABLE pending_parts
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'Medium';
