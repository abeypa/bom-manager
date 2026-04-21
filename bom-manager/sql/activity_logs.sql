-- ================================================================
-- ACTIVITY / AUDIT LOGS — SUPABASE MIGRATION
-- ================================================================
-- Deploy this in: Supabase Dashboard → SQL Editor → New Query → Paste → Run
--
-- Comprehensive audit logging for all entity mutations.
-- Tracks who did what, when, and captures before/after state.
-- ================================================================

-- Step 1: Ensure uuid-ossp extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Step 2: Create the activity_logs table
CREATE TABLE IF NOT EXISTS activity_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  performed_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action          TEXT NOT NULL,       -- 'CREATE', 'UPDATE', 'DELETE', 'PASSWORD_RESET', 'ROLE_CHANGE', etc.
  entity_type     TEXT NOT NULL,       -- 'user', 'part', 'project', 'bom_item', 'supplier', 'purchase_order', etc.
  entity_id       TEXT NOT NULL,       -- The ID of the affected entity (stringified)
  old_values      JSONB,               -- Snapshot of values BEFORE the change (NULL for CREATE)
  new_values      JSONB,               -- Snapshot of values AFTER the change (NULL for DELETE)
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  ip              TEXT                 -- Optional: client IP address
);

-- Fix type if it was previously UUID
DO $$ 
BEGIN 
    IF (SELECT data_type FROM information_schema.columns WHERE table_name = 'activity_logs' AND column_name = 'entity_id') = 'uuid' THEN
        ALTER TABLE activity_logs ALTER COLUMN entity_id TYPE TEXT;
    END IF;
END $$;

-- Step 3: Add indexes for fast querying
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity 
  ON activity_logs(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_activity_logs_performed_by 
  ON activity_logs(performed_by);

CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at 
  ON activity_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_logs_action 
  ON activity_logs(action);

-- Step 4: Enable RLS
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all activity logs
DROP POLICY IF EXISTS "activity_logs_select" ON activity_logs;
CREATE POLICY "activity_logs_select" ON activity_logs
  FOR SELECT USING (auth.role() = 'authenticated');

-- Authenticated users can insert (for client-side logging)
DROP POLICY IF EXISTS "activity_logs_insert" ON activity_logs;
CREATE POLICY "activity_logs_insert" ON activity_logs
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Only admins can delete logs (via a custom function if needed)
-- We don't create an UPDATE or DELETE policy — logs are append-only from client

-- Step 5: Add to realtime if desired
-- ALTER PUBLICATION supabase_realtime ADD TABLE activity_logs;

-- Step 6: Helper function to log activity from PL/pgSQL triggers
CREATE OR REPLACE FUNCTION log_activity(
  p_performed_by UUID,
  p_action TEXT,
  p_entity_type TEXT,
  p_entity_id TEXT,
  p_old_values JSONB DEFAULT NULL,
  p_new_values JSONB DEFAULT NULL,
  p_ip TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  log_id UUID;
BEGIN
  INSERT INTO public.activity_logs (
    performed_by, action, entity_type, entity_id,
    old_values, new_values, ip
  ) VALUES (
    p_performed_by, p_action, p_entity_type, p_entity_id,
    p_old_values, p_new_values, p_ip
  )
  RETURNING id INTO log_id;

  RETURN log_id;
END;
$$;

GRANT EXECUTE ON FUNCTION log_activity(UUID, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT) TO authenticated;

-- ================================================================
-- OPTIONAL: Trigger-based automatic audit logging for key tables
-- Uncomment below to enable automatic logging on projects table.
-- Repeat the pattern for other tables as needed.
-- ================================================================

/*
CREATE OR REPLACE FUNCTION audit_trigger_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.activity_logs (performed_by, action, entity_type, entity_id, new_values)
    VALUES (auth.uid(), 'CREATE', TG_TABLE_NAME, NEW.id::uuid, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.activity_logs (performed_by, action, entity_type, entity_id, old_values, new_values)
    VALUES (auth.uid(), 'UPDATE', TG_TABLE_NAME, NEW.id::uuid, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.activity_logs (performed_by, action, entity_type, entity_id, old_values)
    VALUES (auth.uid(), 'DELETE', TG_TABLE_NAME, OLD.id::uuid, to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- Attach to projects (example):
CREATE TRIGGER audit_projects
  AFTER INSERT OR UPDATE OR DELETE ON projects
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
*/

-- ================================================================
-- DONE ✓
-- Verify: Dashboard → Table Editor → activity_logs should appear.
-- ================================================================
