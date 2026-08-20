-- ============================================================
-- Fix Notifications RLS Policies & Add Atomic Mark-as-Read RPC
-- ============================================================

BEGIN;

-- 1. Ensure columns and defaults exist on public.notifications
ALTER TABLE public.notifications 
  ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.notifications 
  ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'info';

ALTER TABLE public.notifications 
  ADD COLUMN IF NOT EXISTS link TEXT;

-- 2. Ensure columns and defaults exist on public.candidate_notifications
ALTER TABLE public.candidate_notifications 
  ADD COLUMN IF NOT EXISTS read BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.candidate_notifications 
  ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'info';

ALTER TABLE public.candidate_notifications 
  ADD COLUMN IF NOT EXISTS link TEXT;

-- 3. Fix RLS Policies for public.notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own" ON public.notifications
  FOR SELECT USING (
    user_id = auth.uid() 
    OR public.user_has_role(ARRAY['admin', 'hr'])
  );

DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;
CREATE POLICY "notifications_insert" ON public.notifications
  FOR INSERT WITH CHECK (
    auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
CREATE POLICY "notifications_update_own" ON public.notifications
  FOR UPDATE USING (
    user_id = auth.uid() 
    OR public.user_has_role(ARRAY['admin', 'hr'])
  );

DROP POLICY IF EXISTS "notifications_delete_own" ON public.notifications;
CREATE POLICY "notifications_delete_own" ON public.notifications
  FOR DELETE USING (
    user_id = auth.uid() 
    OR public.user_has_role(ARRAY['admin'])
  );

-- 4. Fix RLS Policies for public.candidate_notifications
ALTER TABLE public.candidate_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "candidate_notifications_select_own" ON public.candidate_notifications;
CREATE POLICY "candidate_notifications_select_own" ON public.candidate_notifications
  FOR SELECT USING (
    candidate_id = auth.uid()
    OR candidate_id IN (SELECT id FROM public.candidates WHERE email = (SELECT email FROM public.profiles WHERE id = auth.uid()))
    OR candidate_id IN (SELECT candidate_id FROM public.profiles WHERE id = auth.uid() AND candidate_id IS NOT NULL)
    OR public.user_has_role(ARRAY['admin', 'hr'])
  );

DROP POLICY IF EXISTS "candidate_notifications_insert" ON public.candidate_notifications;
CREATE POLICY "candidate_notifications_insert" ON public.candidate_notifications
  FOR INSERT WITH CHECK (
    auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS "candidate_notifications_update_own" ON public.candidate_notifications;
CREATE POLICY "candidate_notifications_update_own" ON public.candidate_notifications
  FOR UPDATE USING (
    candidate_id = auth.uid()
    OR candidate_id IN (SELECT id FROM public.candidates WHERE email = (SELECT email FROM public.profiles WHERE id = auth.uid()))
    OR candidate_id IN (SELECT candidate_id FROM public.profiles WHERE id = auth.uid() AND candidate_id IS NOT NULL)
    OR public.user_has_role(ARRAY['admin', 'hr'])
  );

-- 5. High-Performance Atomic RPC: mark_all_notifications_read()
CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_cand_id UUID;
  v_user_count INT := 0;
  v_cand_count INT := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  -- Update standard user notifications
  UPDATE public.notifications
  SET is_read = true
  WHERE user_id = v_uid AND (is_read IS NULL OR is_read = false);
  GET DIAGNOSTICS v_user_count = ROW_COUNT;

  -- Resolve candidate_id
  SELECT candidate_id INTO v_cand_id FROM public.profiles WHERE id = v_uid;

  -- Update candidate notifications
  UPDATE public.candidate_notifications
  SET read = true
  WHERE (candidate_id = v_uid OR (v_cand_id IS NOT NULL AND candidate_id = v_cand_id))
    AND (read IS NULL OR read = false);
  GET DIAGNOSTICS v_cand_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'updated_user_notifications', v_user_count,
    'updated_candidate_notifications', v_cand_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO anon;

-- 6. High-Performance Atomic RPC: mark_notification_read(p_id)
CREATE OR REPLACE FUNCTION public.mark_notification_read(p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_cand_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  -- Update in notifications
  UPDATE public.notifications
  SET is_read = true
  WHERE id = p_id AND (user_id = v_uid OR public.user_has_role(ARRAY['admin', 'hr']));

  -- Update in candidate_notifications
  SELECT candidate_id INTO v_cand_id FROM public.profiles WHERE id = v_uid;
  UPDATE public.candidate_notifications
  SET read = true
  WHERE id = p_id AND (
    candidate_id = v_uid 
    OR (v_cand_id IS NOT NULL AND candidate_id = v_cand_id)
    OR public.user_has_role(ARRAY['admin', 'hr'])
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_notification_read(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(UUID) TO anon;

COMMIT;
