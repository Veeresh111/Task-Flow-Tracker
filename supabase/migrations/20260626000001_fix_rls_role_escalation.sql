-- =============================================================
-- FIX: RLS Role Escalation Vulnerability
-- Root Cause: WITH CHECK evaluates AFTER row update, so
-- get_user_role() reads the NEW role value, not the OLD one.
-- This bypasses the check: 'admin' IS NOT DISTINCT FROM 'admin' → TRUE
-- =============================================================

-- 1. Drop the broken policy
DROP POLICY IF EXISTS "users_update_own_profile" ON public.profiles;

-- 2. Create a trigger function that prevents self-role changes
-- This is the CORRECT approach because BEFORE UPDATE triggers
-- have access to OLD.role (before modification) and NEW.role (after)
CREATE OR REPLACE FUNCTION public.prevent_self_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- If the role is changing
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    -- Allow only if the updater has admin or hr privileges
    IF NOT public.user_has_role(ARRAY['admin', 'hr']) THEN
      RAISE EXCEPTION 'Permission denied: You cannot change your own role. Only administrators can modify roles.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Apply the trigger
DROP TRIGGER IF EXISTS trg_prevent_self_role_change ON public.profiles;
CREATE TRIGGER trg_prevent_self_role_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_self_role_change();

-- 4. Recreate the RLS policy WITHOUT the WITH CHECK role check
-- (the trigger handles role change protection now)
CREATE POLICY "users_update_own_profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- =============================================================
-- VERIFICATION: Run these tests to confirm the fix
-- =============================================================
-- 
-- As candidate user:
--   UPDATE profiles SET role = 'admin' WHERE id = auth.uid();
--   → ERROR: Permission denied: You cannot change your own role.
--
-- As admin user:
--   UPDATE profiles SET role = 'admin' WHERE id = some_user_id;
--   → SUCCESS (admins can manage roles)

-- =============================================================
-- ALTERNATIVE FIX (for environments where triggers can't be used):
-- Fix get_user_role() to NOT read from profiles
-- =============================================================
-- 
-- If triggers are not feasible, this alternative approach works:
-- Store the role in auth.users.raw_app_meta_data which is immutable by users:
--
-- CREATE OR REPLACE FUNCTION public.get_user_role()
-- RETURNS TEXT
-- LANGUAGE sql
-- SECURITY DEFINER
-- STABLE
-- AS $$
--   SELECT COALESCE(
--     (SELECT raw_app_meta_data->>'role' FROM auth.users WHERE id = auth.uid()),
--     (SELECT role FROM public.profiles WHERE id = auth.uid()),
--     'employee'
--   );
-- $$;
