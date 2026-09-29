-- ============================================================
-- Production defect fixes (live-observed in production app):
--   1. employee_analytics had NO INSERT/UPDATE policy → admin analytics
--      save always failed with 42501 (new row violates row-level security).
--   2. notifications had NO dedupe → identical status notifications were
--      inserted repeatedly (observed: 14x "Offer Accepted — Ready to Hire"
--      for the same admin). Adds an idempotency guard + one-time cleanup
--      of existing duplicates (keeps the earliest row of each group).
-- ============================================================

-- ---- 1. employee_analytics write policies (admin/HR manage analytics) ----
DROP POLICY IF EXISTS employee_analytics_staff_insert ON public.employee_analytics;
CREATE POLICY employee_analytics_staff_insert
  ON public.employee_analytics
  FOR INSERT
  WITH CHECK (public.user_has_role(ARRAY['admin'::text, 'hr'::text]));

DROP POLICY IF EXISTS employee_analytics_staff_update ON public.employee_analytics;
CREATE POLICY employee_analytics_staff_update
  ON public.employee_analytics
  FOR UPDATE
  USING (public.user_has_role(ARRAY['admin'::text, 'hr'::text]))
  WITH CHECK (public.user_has_role(ARRAY['admin'::text, 'hr'::text]));

-- ---- 2. Notification dedupe guard ----------------------------------------
-- Suppresses an insert when an identical notification (same recipient, title,
-- and link) already exists and is still unread, or was created within the
-- last 60 minutes. Real repeated events after the window still notify.
CREATE OR REPLACE FUNCTION public.suppress_duplicate_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.user_id = NEW.user_id
      AND n.title = NEW.title
      AND COALESCE(n.link, '') = COALESCE(NEW.link, '')
      AND (
        n.is_read = false
        OR n.created_at > now() - interval '60 minutes'
      )
  ) THEN
    RETURN NULL; -- duplicate: silently skip insert
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_suppress_duplicate_notification ON public.notifications;
CREATE TRIGGER trg_suppress_duplicate_notification
  BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.suppress_duplicate_notification();

-- ---- 3. One-time cleanup of existing duplicates ---------------------------
-- Keeps the EARLIEST row of each (user_id, title, link) duplicate group;
-- removes later duplicates only. Legitimate history (first occurrence of each
-- notification) is fully preserved.
DELETE FROM public.notifications n
USING public.notifications older
WHERE n.user_id = older.user_id
  AND n.title = older.title
  AND COALESCE(n.link, '') = COALESCE(older.link, '')
  AND older.created_at < n.created_at;
