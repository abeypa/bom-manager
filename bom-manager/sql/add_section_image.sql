-- ================================================================
-- ADD IMAGE SUPPORT TO PROJECT SECTIONS
-- ================================================================
-- Deploy: Supabase Dashboard → SQL Editor → Paste → Run
--
-- project_subsections already has image_path.
-- Part tables already have image_path.
-- Only project_sections (top-level) needs the column added.
-- ================================================================

-- Add image_path column to project_sections
ALTER TABLE project_sections 
  ADD COLUMN IF NOT EXISTS image_path TEXT;

-- ================================================================
-- DONE ✓
-- ================================================================
