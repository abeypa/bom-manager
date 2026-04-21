-- ================================================================
-- AUTOMATIC AUDIT TRIGGERS — SUPABASE MIGRATION
-- ================================================================
-- Deploy this in: Supabase Dashboard → SQL Editor → New Query → Run
-- PREREQUISITE: Run activity_logs.sql FIRST (it creates the table)
--
-- This creates an automatic PL/pgSQL trigger function that fires
-- on INSERT/UPDATE/DELETE for all key data tables, logging every
-- change to the activity_logs table automatically.
-- ================================================================

-- Step 1: Create the universal audit trigger function
CREATE OR REPLACE FUNCTION audit_trigger_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  log_action TEXT;
  log_entity_id TEXT;
  log_old JSONB := NULL;
  log_new JSONB := NULL;
  caller_id UUID;
BEGIN
  -- Determine action type
  log_action := TG_OP;  -- 'INSERT', 'UPDATE', or 'DELETE'

  -- Get the calling user from the JWT (may be NULL for system operations)
  BEGIN
    caller_id := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    caller_id := NULL;
  END;

  -- Build old/new JSONB snapshots, extract entity ID
  IF TG_OP = 'INSERT' THEN
    log_new := to_jsonb(NEW);
    -- Remove large/sensitive fields from snapshot
    log_new := log_new - 'encrypted_password' - 'raw_app_meta_data' - 'raw_user_meta_data';
    log_entity_id := NEW.id::text;
  ELSIF TG_OP = 'UPDATE' THEN
    log_old := to_jsonb(OLD);
    log_new := to_jsonb(NEW);
    -- Remove large/sensitive fields
    log_old := log_old - 'encrypted_password' - 'raw_app_meta_data' - 'raw_user_meta_data';
    log_new := log_new - 'encrypted_password' - 'raw_app_meta_data' - 'raw_user_meta_data';
    log_entity_id := NEW.id::text;
  ELSIF TG_OP = 'DELETE' THEN
    log_old := to_jsonb(OLD);
    log_old := log_old - 'encrypted_password' - 'raw_app_meta_data' - 'raw_user_meta_data';
    log_entity_id := OLD.id::text;
  END IF;

  -- Insert into activity_logs
  INSERT INTO public.activity_logs (
    performed_by,
    action,
    entity_type,
    entity_id,
    old_values,
    new_values
  ) VALUES (
    caller_id,
    log_action,
    TG_TABLE_NAME,
    log_entity_id,
    log_old,
    log_new
  );

  -- Return the appropriate row
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Step 2: Attach triggers to all key tables
-- Each trigger fires AFTER the operation so the actual data change
-- is guaranteed to succeed before the log entry is created.

-- Projects
DROP TRIGGER IF EXISTS audit_projects ON projects;
CREATE TRIGGER audit_projects
  AFTER INSERT OR UPDATE OR DELETE ON projects
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- Project Sections (top-level)
DROP TRIGGER IF EXISTS audit_project_sections ON project_sections;
CREATE TRIGGER audit_project_sections
  AFTER INSERT OR UPDATE OR DELETE ON project_sections
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- Project Subsections
DROP TRIGGER IF EXISTS audit_project_subsections ON project_subsections;
CREATE TRIGGER audit_project_subsections
  AFTER INSERT OR UPDATE OR DELETE ON project_subsections
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- Project Parts (BOM junction)
DROP TRIGGER IF EXISTS audit_project_parts ON project_parts;
CREATE TRIGGER audit_project_parts
  AFTER INSERT OR UPDATE OR DELETE ON project_parts
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- Mechanical Manufacture
DROP TRIGGER IF EXISTS audit_mechanical_manufacture ON mechanical_manufacture;
CREATE TRIGGER audit_mechanical_manufacture
  AFTER INSERT OR UPDATE OR DELETE ON mechanical_manufacture
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- Mechanical Bought Out
DROP TRIGGER IF EXISTS audit_mechanical_bought_out ON mechanical_bought_out;
CREATE TRIGGER audit_mechanical_bought_out
  AFTER INSERT OR UPDATE OR DELETE ON mechanical_bought_out
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- Electrical Manufacture
DROP TRIGGER IF EXISTS audit_electrical_manufacture ON electrical_manufacture;
CREATE TRIGGER audit_electrical_manufacture
  AFTER INSERT OR UPDATE OR DELETE ON electrical_manufacture
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- Electrical Bought Out
DROP TRIGGER IF EXISTS audit_electrical_bought_out ON electrical_bought_out;
CREATE TRIGGER audit_electrical_bought_out
  AFTER INSERT OR UPDATE OR DELETE ON electrical_bought_out
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- Pneumatic Bought Out
DROP TRIGGER IF EXISTS audit_pneumatic_bought_out ON pneumatic_bought_out;
CREATE TRIGGER audit_pneumatic_bought_out
  AFTER INSERT OR UPDATE OR DELETE ON pneumatic_bought_out
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- Suppliers
DROP TRIGGER IF EXISTS audit_suppliers ON suppliers;
CREATE TRIGGER audit_suppliers
  AFTER INSERT OR UPDATE OR DELETE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- Purchase Orders
DROP TRIGGER IF EXISTS audit_purchase_orders ON purchase_orders;
CREATE TRIGGER audit_purchase_orders
  AFTER INSERT OR UPDATE OR DELETE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- Profiles (user metadata)
DROP TRIGGER IF EXISTS audit_profiles ON profiles;
CREATE TRIGGER audit_profiles
  AFTER INSERT OR UPDATE OR DELETE ON profiles
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- ================================================================
-- DONE ✓
-- 
-- All data changes are now automatically logged to activity_logs.
-- The manual logActivity() calls in the frontend still work as
-- a complementary layer (e.g., for custom actions like PASSWORD_RESET).
--
-- To verify: make any change in the app, then check:
--   SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 10;
-- ================================================================
