-- ============================================================
-- MIGRATION: Correct Project > Section > Subsection > Parts
-- ============================================================
-- This renames project_main_sections → project_sections (Sections)
-- And renames project_sections → project_subsections (Subsections)
-- project_parts links to project_subsections (not sections)
-- ============================================================

-- Step 1: Rename project_main_sections to project_sections (these are the TOP-LEVEL Sections)
ALTER TABLE project_main_sections RENAME TO project_sections_new;

-- Step 2: Rename project_sections (old subsections) to project_subsections
ALTER TABLE project_sections RENAME TO project_subsections;

-- Step 3: Rename project_sections_new to project_sections
ALTER TABLE project_sections_new RENAME TO project_sections;

-- Step 4: Rename the FK column in project_subsections
-- Old: main_section_id → New: section_id
ALTER TABLE project_subsections RENAME COLUMN main_section_id TO section_id;

-- Step 5: Fix FK constraint name (optional rename for clarity)
-- project_subsections.section_id → references project_sections.id
-- The constraint should already point correctly since we renamed the table

-- Step 6: Rename FK column in project_parts
-- project_parts.project_section_id still points to what is now project_subsections
-- The column name is correct - it references the subsection (previously called section)
-- No change needed for project_parts FK column

-- Step 7: Add RLS to new tables
ALTER TABLE project_sections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow All" ON project_sections;
CREATE POLICY "Allow All" ON project_sections FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE project_subsections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow All" ON project_subsections;
CREATE POLICY "Allow All" ON project_subsections FOR ALL USING (true) WITH CHECK (true);

-- Step 8: Add order_index to project_sections if not present
ALTER TABLE project_sections ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0;

-- Step 9: Add missing columns to project_subsections if needed
ALTER TABLE project_subsections ADD COLUMN IF NOT EXISTS image_path TEXT;
ALTER TABLE project_subsections ADD COLUMN IF NOT EXISTS drawing_path TEXT;
ALTER TABLE project_subsections ADD COLUMN IF NOT EXISTS datasheet_path TEXT;

-- Verify structure
SELECT 'project_sections columns:' as info;
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'project_sections' AND table_schema = 'public' ORDER BY ordinal_position;

SELECT 'project_subsections columns:' as info;
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'project_subsections' AND table_schema = 'public' ORDER BY ordinal_position;
