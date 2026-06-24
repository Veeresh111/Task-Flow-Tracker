-- ============================================================
-- Enable Realtime for all notification and messaging tables
-- Without this, real-time subscriptions silently fail.
-- Each table is checked before adding to avoid errors.
-- ============================================================
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'notifications',
    'candidate_notifications',
    'messages',
    'candidate_hr_messages',
    'offer_letters',
    'interview_sessions',
    'assessment_tokens',
    'complaints',
    'tasks',
    'leaves',
    'candidate_applications',
    'job_applications'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables
  LOOP
    PERFORM FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = tbl;
    IF NOT FOUND THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    END IF;
  END LOOP;
END;
$$;
