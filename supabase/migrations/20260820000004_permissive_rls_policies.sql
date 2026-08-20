-- ============================================================================
-- Fully Permissive RLS Policies for Notifications, Chat Reads, and Payslips
-- Ensures all demo users, authenticated sessions, and service roles can
-- perform SELECT, INSERT, and UPDATE without 403 Forbidden errors.
-- ============================================================================

BEGIN;

-- 1. NOTIFICATIONS TABLE
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'info';
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS link TEXT;

DROP POLICY IF EXISTS "notifications_all_access" ON public.notifications;
DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;

CREATE POLICY "notifications_all_access" ON public.notifications
  FOR ALL
  TO public, anon, authenticated
  USING (true)
  WITH CHECK (true);

-- 2. CHAT READS TABLE
CREATE TABLE IF NOT EXISTS public.chat_reads (
  user_id TEXT NOT NULL,
  peer_id TEXT NOT NULL,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_read_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, peer_id)
);

ALTER TABLE public.chat_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_reads_all_access" ON public.chat_reads;
DROP POLICY IF EXISTS "chat_reads_select_policy" ON public.chat_reads;
DROP POLICY IF EXISTS "chat_reads_insert_policy" ON public.chat_reads;
DROP POLICY IF EXISTS "chat_reads_update_policy" ON public.chat_reads;

CREATE POLICY "chat_reads_all_access" ON public.chat_reads
  FOR ALL
  TO public, anon, authenticated
  USING (true)
  WITH CHECK (true);

-- 3. PAYSLIPS TABLE
ALTER TABLE public.payslips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payslips_all_access" ON public.payslips;
DROP POLICY IF EXISTS "payslips_select_own" ON public.payslips;
DROP POLICY IF EXISTS "payslips_access" ON public.payslips;

CREATE POLICY "payslips_all_access" ON public.payslips
  FOR ALL
  TO public, anon, authenticated
  USING (true)
  WITH CHECK (true);

-- 4. CANDIDATE NOTIFICATIONS TABLE
ALTER TABLE public.candidate_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "candidate_notifications_all_access" ON public.candidate_notifications;
DROP POLICY IF EXISTS "candidate_notifications_update_own" ON public.candidate_notifications;
DROP POLICY IF EXISTS "candidate_notifications_select_own" ON public.candidate_notifications;

CREATE POLICY "candidate_notifications_all_access" ON public.candidate_notifications
  FOR ALL
  TO public, anon, authenticated
  USING (true)
  WITH CHECK (true);

-- 5. Set clean baseline: Mark all current demo notifications as read
UPDATE public.notifications SET is_read = true WHERE is_read = false;

COMMIT;
