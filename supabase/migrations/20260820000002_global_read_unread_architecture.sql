-- ============================================================================
-- Global Read/Unread Persistence Architecture & Case-Insensitive RLS Policies
-- ============================================================================

BEGIN;

-- 1. Office Chat / Messaging: Conversation Participant Read Timestamp Table
CREATE TABLE IF NOT EXISTS public.chat_reads (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  peer_id TEXT NOT NULL, -- UUID for 1-on-1 DM or 'GLOBAL' / channel id
  last_read_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_read_message_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, peer_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_reads_user_peer ON public.chat_reads (user_id, peer_id);
CREATE INDEX IF NOT EXISTS idx_chat_reads_last_read ON public.chat_reads (user_id, last_read_at);

-- RLS on chat_reads
ALTER TABLE public.chat_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_reads_select_own" ON public.chat_reads;
CREATE POLICY "chat_reads_select_own" ON public.chat_reads
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "chat_reads_insert_own" ON public.chat_reads;
CREATE POLICY "chat_reads_insert_own" ON public.chat_reads
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "chat_reads_update_own" ON public.chat_reads;
CREATE POLICY "chat_reads_update_own" ON public.chat_reads
  FOR UPDATE USING (user_id = auth.uid());

-- 2. Atomic Chat Mark-Read Database Function
CREATE OR REPLACE FUNCTION public.mark_chat_read(p_peer_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_now TIMESTAMP WITH TIME ZONE := now();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  INSERT INTO public.chat_reads (user_id, peer_id, last_read_at, updated_at)
  VALUES (v_uid, p_peer_id, v_now, v_now)
  ON CONFLICT (user_id, peer_id)
  DO UPDATE SET 
    last_read_at = v_now,
    updated_at = v_now;

  RETURN jsonb_build_object('success', true, 'peer_id', p_peer_id, 'last_read_at', v_now);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_chat_read(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_chat_read(TEXT) TO anon;

-- 3. Case-Insensitive Role-Based Access for Payroll Cycles, Payslips, & Audits
DROP POLICY IF EXISTS "payroll_cycles_access" ON public.payroll_cycles;
CREATE POLICY "payroll_cycles_access" ON public.payroll_cycles
  FOR ALL USING (
    public.user_has_role(ARRAY['admin', 'hr', 'payroll', 'ADMIN', 'HR', 'PAYROLL'])
    OR EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND (
        LOWER(role) = 'admin' 
        OR LOWER(role) = 'hr' 
        OR LOWER(role) = 'payroll'
      )
    )
  );

DROP POLICY IF EXISTS "payslips_access" ON public.payslips;
CREATE POLICY "payslips_access" ON public.payslips
  FOR ALL USING (
    employee_id = auth.uid()
    OR public.user_has_role(ARRAY['admin', 'hr', 'payroll', 'ADMIN', 'HR', 'PAYROLL'])
    OR EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND (
        LOWER(role) = 'admin' 
        OR LOWER(role) = 'hr' 
        OR LOWER(role) = 'payroll'
      )
    )
  );

DROP POLICY IF EXISTS "payroll_audit_access" ON public.payroll_audit;
CREATE POLICY "payroll_audit_access" ON public.payroll_audit
  FOR ALL USING (
    performed_by = auth.uid()
    OR public.user_has_role(ARRAY['admin', 'hr', 'payroll', 'ADMIN', 'HR', 'PAYROLL'])
    OR EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND (
        LOWER(role) = 'admin' 
        OR LOWER(role) = 'hr' 
        OR LOWER(role) = 'payroll'
      )
    )
  );

COMMIT;
