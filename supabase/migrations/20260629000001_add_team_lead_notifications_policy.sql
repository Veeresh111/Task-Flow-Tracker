BEGIN;

DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;

CREATE POLICY "notifications_insert" ON public.notifications
  FOR INSERT WITH CHECK (
    public.user_has_role(ARRAY['admin', 'hr', 'team_lead', 'employee'])
  );

END;
