-- ============================================================================
-- CRITICAL FIX: Run this in Supabase SQL Editor (Dashboard -> SQL Editor)
-- Resolves 403 Forbidden on payslips & 403/Silent Failure on notifications UPDATE
-- ============================================================================

BEGIN;

-- 1. NOTIFICATIONS: Grant authenticated users UPDATE permission on their own notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Ensure columns exist
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'info';
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS link TEXT;

DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own" ON public.notifications
  FOR SELECT USING (
    user_id = auth.uid() 
    OR public.user_has_role(ARRAY['admin', 'hr', 'ADMIN', 'HR'])
  );

DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
CREATE POLICY "notifications_update_own" ON public.notifications
  FOR UPDATE 
  USING (
    user_id = auth.uid() 
    OR public.user_has_role(ARRAY['admin', 'hr', 'ADMIN', 'HR'])
  )
  WITH CHECK (
    user_id = auth.uid() 
    OR public.user_has_role(ARRAY['admin', 'hr', 'ADMIN', 'HR'])
  );

DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;
CREATE POLICY "notifications_insert" ON public.notifications
  FOR INSERT WITH CHECK (
    auth.role() = 'authenticated'
  );

-- 2. PAYSLIPS: Grant employees permission to SELECT their OWN payslips (Fixes 403 Forbidden)
ALTER TABLE public.payslips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payslips_select_own" ON public.payslips;
DROP POLICY IF EXISTS "payslips_access" ON public.payslips;

CREATE POLICY "payslips_select_own" ON public.payslips
  FOR SELECT USING (
    employee_id = auth.uid() 
    OR public.user_has_role(ARRAY['admin', 'hr', 'payroll', 'ADMIN', 'HR', 'PAYROLL'])
    OR EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND LOWER(role) IN ('admin', 'hr', 'payroll')
    )
  );

-- 3. CANDIDATE NOTIFICATIONS: Grant UPDATE permission
ALTER TABLE public.candidate_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_notifications ADD COLUMN IF NOT EXISTS read BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.candidate_notifications ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'info';
ALTER TABLE public.candidate_notifications ADD COLUMN IF NOT EXISTS link TEXT;

DROP POLICY IF EXISTS "candidate_notifications_update_own" ON public.candidate_notifications;
CREATE POLICY "candidate_notifications_update_own" ON public.candidate_notifications
  FOR UPDATE USING (
    candidate_id = auth.uid() 
    OR candidate_id IN (SELECT id FROM public.candidates WHERE email = (SELECT email FROM public.profiles WHERE id = auth.uid()))
    OR public.user_has_role(ARRAY['admin', 'hr', 'ADMIN', 'HR'])
  );

DROP POLICY IF EXISTS "candidate_notifications_select_own" ON public.candidate_notifications;
CREATE POLICY "candidate_notifications_select_own" ON public.candidate_notifications
  FOR SELECT USING (
    candidate_id = auth.uid() 
    OR candidate_id IN (SELECT id FROM public.candidates WHERE email = (SELECT email FROM public.profiles WHERE id = auth.uid()))
    OR public.user_has_role(ARRAY['admin', 'hr', 'ADMIN', 'HR'])
  );

COMMIT;
