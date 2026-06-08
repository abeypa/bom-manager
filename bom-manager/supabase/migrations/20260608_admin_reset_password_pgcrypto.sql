CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.admin_reset_user_password(
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
  caller_id := auth.uid();

  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT role INTO caller_role
  FROM public.profiles
  WHERE id = caller_id;

  IF caller_role IS NULL OR caller_role != 'admin' THEN
    RAISE EXCEPTION 'Insufficient privileges: admin role required';
  END IF;

  IF caller_id = target_user_id THEN
    RAISE EXCEPTION 'Cannot reset your own password through admin function. Use the standard password change flow.';
  END IF;

  IF length(new_password) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters';
  END IF;

  UPDATE auth.users
  SET
    encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf')),
    updated_at = now()
  WHERE id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user not found in auth system';
  END IF;

  UPDATE public.profiles
  SET updated_date = now()
  WHERE id = target_user_id;

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
    NULL;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_reset_user_password(UUID, TEXT) TO authenticated;
