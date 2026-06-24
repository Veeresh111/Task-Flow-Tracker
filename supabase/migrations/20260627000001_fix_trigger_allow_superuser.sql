-- STEP 1: Drop old trigger and function
DROP TRIGGER IF EXISTS prevent_self_role_change ON profiles;
DROP FUNCTION IF EXISTS public.prevent_self_role_change();

-- STEP 2: Recreate function with auth.uid() IS NULL bypass
CREATE OR REPLACE FUNCTION public.prevent_self_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    IF auth.uid() IS NULL THEN
      RETURN NEW;
    END IF;
    IF NOT public.user_has_role(ARRAY['admin', 'hr']) THEN
      RAISE EXCEPTION 'Permission denied: You cannot change your own role. Only administrators can modify roles.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- STEP 3: Recreate the trigger
CREATE TRIGGER prevent_self_role_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  WHEN (OLD.role IS DISTINCT FROM NEW.role)
  EXECUTE FUNCTION public.prevent_self_role_change();

-- STEP 4: Promote the admin user back
UPDATE profiles SET role = 'admin' WHERE email = 'prakashmulge912@gmail.com';

-- STEP 5: Verify
SELECT id, email, role FROM profiles WHERE email = 'prakashmulge912@gmail.com';
