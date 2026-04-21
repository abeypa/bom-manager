-- ================================================================
-- ADD SORT ORDER TO PROJECT PARTS
-- ================================================================
-- Deploy: Supabase Dashboard → SQL Editor → Paste → Run
-- ================================================================

-- Add sort_order column to project_parts if it doesn't exist
ALTER TABLE project_parts 
  ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- Optional: Initialize sort_order based on ID or created_date
-- UPDATE project_parts SET sort_order = id;

-- ================================================================
-- DONE ✓
-- ================================================================
