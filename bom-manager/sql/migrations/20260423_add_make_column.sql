-- Migration: Add 'make' column to master part tables
-- Created: 2026-04-23
-- Purpose: Support Brand/Make tracking for bought-out and manufactured components.

-- 1. Add 'make' column to all specified categories
ALTER TABLE electrical_bought_out ADD COLUMN IF NOT EXISTS make TEXT;
ALTER TABLE mechanical_bought_out ADD COLUMN IF NOT EXISTS make TEXT;
ALTER TABLE mechanical_manufacture ADD COLUMN IF NOT EXISTS make TEXT;
ALTER TABLE pneumatic_bought_out ADD COLUMN IF NOT EXISTS make TEXT;

-- 2. Create indexes for professional search performance (GEO/Search optimization)
CREATE INDEX IF NOT EXISTS idx_electrical_bo_make ON electrical_bought_out(make);
CREATE INDEX IF NOT EXISTS idx_mechanical_bo_make ON mechanical_bought_out(make);
CREATE INDEX IF NOT EXISTS idx_mechanical_mf_make ON mechanical_manufacture(make);
CREATE INDEX IF NOT EXISTS idx_pneumatic_bo_make ON pneumatic_bought_out(make);

-- 3. Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
