-- ============================================================================
-- Comprehensive Grants and Permissive Access for Supabase PostgREST
-- Resolves 403 Forbidden across all payroll, chat_reads, payslips, and core tables
-- ============================================================================

BEGIN;

-- 1. Grant Schema Usage to all roles
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO postgres, anon, authenticated, service_role;

-- 2. Ensure chat_reads table exists
CREATE TABLE IF NOT EXISTS public.chat_reads (
  user_id TEXT NOT NULL,
  peer_id TEXT NOT NULL,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_read_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, peer_id)
);

-- 3. Ensure all relevant tables exist and apply permissive RLS policies + explicit table grants
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'payroll_cycles', 'payslips', 'payroll_audit', 'salary_structures', 'salary_components',
    'chat_reads', 'messages', 'notifications', 'candidate_notifications',
    'profiles', 'candidates', 'job_forms', 'job_applications',
    'tasks', 'projects', 'complaints', 'leaves', 'presence', 'work_logs', 'interviews', 'offers', 'audit_logs'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_open_policy', t);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO public, anon, authenticated USING (true) WITH CHECK (true);', t || '_open_policy', t);
      EXECUTE format('GRANT ALL ON TABLE public.%I TO anon, authenticated, service_role;', t);
    END IF;
  END LOOP;
END $$;

COMMIT;
