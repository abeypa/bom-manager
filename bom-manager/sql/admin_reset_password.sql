-- ================================================================
-- ADMIN PASSWORD RESET — SUPABASE RPC FUNCTION
-- ================================================================
-- Deploy this in: Supabase Dashboard → SQL Editor → New Query → Paste → Run
--
-- This function allows admin users to change another user's password
-- using SECURITY DEFINER to access the Supabase Auth admin API
-- from within a PL/pgSQL function.
-- ================================================================

-- Step 1: Create the admin_reset_user_password function
CREATE OR REPLACE FUNCTION admin_reset_user_password(
  target_user_id UUID,
  new_password TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id UUID;
  caller_role TEXT;
BEGIN
  -- Get the calling user's ID from the JWT
  caller_id := auth.uid();
  
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Verify the caller is an admin
  SELECT role INTO caller_role
  FROM public.profiles
  WHERE id = caller_id;

  IF caller_role IS NULL OR caller_role != 'admin' THEN
    RAISE EXCEPTION 'Insufficient privileges: admin role required';
  END IF;

  -- Prevent self-password-reset through this function
  IF caller_id = target_user_id THEN
    RAISE EXCEPTION 'Cannot reset your own password through admin function. Use the standard password change flow.';
  END IF;

  -- Validate password
  IF length(new_password) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters';
  END IF;

  -- Update the user's password in auth.users
  -- This uses the internal Supabase auth schema, accessible via SECURITY DEFINER
  UPDATE auth.users
  SET
    encrypted_password = crypt(new_password, gen_salt('bf')),
    updated_at = now()
  WHERE id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user not found in auth system';
  END IF;

  -- Update the profiles table timestamp
  UPDATE public.profiles
  SET updated_date = now()
  WHERE id = target_user_id;

  -- Log this action (if activity_logs table exists)
  BEGIN
    INSERT INTO public.activity_logs (
      performed_by,
      action,
      entity_type,
      entity_id,
      old_values,
      new_values
    ) VALUES (
      caller_id,
      'PASSWORD_RESET',
      'user',
      target_user_id,
      NULL,
      jsonb_build_object('password_changed', true, 'changed_by_admin', true)
    );
  EXCEPTION WHEN undefined_table THEN
    -- activity_logs table doesn't exist yet, skip logging
    NULL;
  END;
END;
$$;

-- Grant execute permission to authenticated users (admin check is inside)
GRANT EXECUTE ON FUNCTION admin_reset_user_password(UUID, TEXT) TO authenticated;

-- ================================================================
-- DONE ✓
-- Test by calling:
--   SELECT admin_reset_user_password('target-uuid', 'new-password');
-- ================================================================
