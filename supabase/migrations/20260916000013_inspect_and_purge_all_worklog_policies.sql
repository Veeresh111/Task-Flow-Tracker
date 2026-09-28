-- Migration: 20260916000013_inspect_and_purge_all_worklog_policies.sql
-- 1. Purge ANY and ALL legacy policies on work_logs and leaves
-- 2. Strictly enforce that ONLY active employees (status = 'active') can insert/update work_logs and leaves
-- 3. Provide an RPC to inspect policies

BEGIN;

-- Helper to inspect policies
CREATE OR REPLACE FUNCTION public.get_table_policies(p_table text)
RETURNS TABLE (
  policyname name,
  cmd text,
  qual text,
  with_check text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT policyname, cmd, qual, with_check
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = p_table;
$$;

-- Drop EVERY existing policy on work_logs
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'work_logs' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.work_logs;', pol.policyname);
  END LOOP;
END $$;

-- Drop EVERY existing policy on leaves
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'leaves' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.leaves;', pol.policyname);
  END LOOP;
END $$;

-- Recreate strictly guarded work_logs policies
ALTER TABLE public.work_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "work_logs_insert_active_only" ON public.work_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND status = 'active'
        AND COALESCE(employment_status, 'active') = 'active'
    )
  );

CREATE POLICY "work_logs_update_active_only" ON public.work_logs
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND status = 'active'
        AND COALESCE(employment_status, 'active') = 'active'
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND status = 'active'
        AND COALESCE(employment_status, 'active') = 'active'
    )
  );

CREATE POLICY "work_logs_select_own_or_admin" ON public.work_logs
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'hr', 'team_lead')
        AND status = 'active'
    )
  );

-- Recreate strictly guarded leaves policies
ALTER TABLE public.leaves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leaves_insert_active_only" ON public.leaves
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND status = 'active'
        AND COALESCE(employment_status, 'active') = 'active'
    )
  );

CREATE POLICY "leaves_update_admin_only" ON public.leaves
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'hr')
        AND status = 'active'
    )
  );

CREATE POLICY "leaves_select_own_or_admin" ON public.leaves
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'hr', 'team_lead')
        AND status = 'active'
    )
  );

COMMIT;
