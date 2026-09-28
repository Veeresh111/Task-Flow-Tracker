-- Migration: 20260916000008_security_iron_wall_and_schema_hardening.sql
-- 1. Remove legacy permissive open_policy backdoors across all core tables
-- 2. Eradicate 'OR auth.uid() IS NULL' clauses from payslips and leave_ledgers
-- 3. Enforce strict active-employee-only mutations on work_logs, leaves, and resignations
-- 4. Add updated_at to offer_letters and resignation_date to resignations
-- 5. Deduplicate foreign key on assessment_tokens

BEGIN;

-- 1. Drop all permissive open_policies
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'work_logs', 'leaves', 'tasks', 'projects', 'complaints', 
    'presence', 'interviews', 'offers', 'resignations', 'fnf_settlements'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_open_policy', t);
    END IF;
  END LOOP;
END $$;

-- 2. Harden work_logs RLS: Absolutely NO anonymous access permitted
ALTER TABLE public.work_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "work_logs_insert_own" ON public.work_logs;
DROP POLICY IF EXISTS "work_logs_update_own" ON public.work_logs;
DROP POLICY IF EXISTS "work_logs_select_own" ON public.work_logs;

CREATE POLICY "work_logs_insert_own" ON public.work_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid() 
    AND public.is_active_employee()
  );

CREATE POLICY "work_logs_update_own" ON public.work_logs
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid() 
    AND public.is_active_employee()
  );

CREATE POLICY "work_logs_select_own" ON public.work_logs
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid() 
    OR public.is_admin_or_hr()
  );

-- 3. Harden leaves RLS: Absolutely NO anonymous access permitted
ALTER TABLE public.leaves ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "leaves_insert_own" ON public.leaves;
DROP POLICY IF EXISTS "leaves_select_own" ON public.leaves;
DROP POLICY IF EXISTS "leaves_update_admin" ON public.leaves;

CREATE POLICY "leaves_insert_own" ON public.leaves
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid() 
    AND public.is_active_employee()
  );

CREATE POLICY "leaves_select_own" ON public.leaves
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid() 
    OR public.is_admin_or_hr()
  );

CREATE POLICY "leaves_update_admin" ON public.leaves
  FOR UPDATE TO authenticated
  USING (
    public.is_admin_or_hr()
  );

-- 4. Eradicate 'OR auth.uid() IS NULL' from payslips
DROP POLICY IF EXISTS payslips_rbac_select ON public.payslips;
DROP POLICY IF EXISTS payslips_rbac_all ON public.payslips;

CREATE POLICY payslips_rbac_select ON public.payslips
  FOR SELECT TO authenticated
  USING (
    employee_id = auth.uid()
    OR public.is_admin_or_hr()
    OR public.is_manager_of(employee_id)
  );

CREATE POLICY payslips_rbac_all ON public.payslips
  FOR ALL TO authenticated
  USING (
    public.is_admin_or_hr()
  )
  WITH CHECK (
    public.is_admin_or_hr()
  );

-- 5. Eradicate 'OR auth.uid() IS NULL' from leave_ledgers
DROP POLICY IF EXISTS leave_ledgers_rbac_select ON public.leave_ledgers;
DROP POLICY IF EXISTS leave_ledgers_rbac_all ON public.leave_ledgers;

CREATE POLICY leave_ledgers_rbac_select ON public.leave_ledgers
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_admin_or_hr()
    OR public.is_manager_of(user_id)
  );

CREATE POLICY leave_ledgers_rbac_all ON public.leave_ledgers
  FOR ALL TO authenticated
  USING (
    public.is_admin_or_hr()
  )
  WITH CHECK (
    public.is_admin_or_hr()
  );

-- 6. Add missing columns to offer_letters and resignations
ALTER TABLE public.offer_letters
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.resignations
  ADD COLUMN IF NOT EXISTS resignation_date DATE DEFAULT CURRENT_DATE;

-- 7. Deduplicate foreign key on assessment_tokens
ALTER TABLE public.assessment_tokens
  DROP CONSTRAINT IF EXISTS fk_assessment_tokens_assessments;

COMMIT;
