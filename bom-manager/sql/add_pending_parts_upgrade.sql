-- ============================================================
-- Pending Parts Upgrade Migration
-- Adds: assigned_to (pending_parts) + parent_id (comments)
-- ============================================================

-- 1. Add assignee column to pending_parts
ALTER TABLE pending_parts
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- 2. Add parent_id to pending_part_comments for threaded replies
ALTER TABLE pending_part_comments
  ADD COLUMN IF NOT EXISTS parent_id BIGINT REFERENCES pending_part_comments(id) ON DELETE CASCADE;

-- 3. Index for fast threaded comment lookups
CREATE INDEX IF NOT EXISTS idx_pending_part_comments_parent_id
  ON pending_part_comments(parent_id);

CREATE INDEX IF NOT EXISTS idx_pending_parts_assigned_to
  ON pending_parts(assigned_to);
