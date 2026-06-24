-- ============================================================
-- UNIFIED ENTERPRISE METRICS — SINGLE SOURCE OF TRUTH
-- All dashboards MUST query these functions to ensure
-- consistent headcounts, totals, and KPIs across the app.
-- ============================================================

-- 1. Core headcount: active (non-terminated) profiles
CREATE OR REPLACE FUNCTION public.get_active_headcount()
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COUNT(*)::INTEGER FROM public.profiles
  WHERE employment_status IS DISTINCT FROM 'terminated';
$$;

-- 2. Headcount broken down by role
CREATE OR REPLACE FUNCTION public.get_headcount_by_role()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('role', role, 'count', cnt))
    FILTER (WHERE role IS NOT NULL),
    '[]'::jsonb
  )
  FROM (
    SELECT LOWER(TRIM(role)) AS role, COUNT(*)::INTEGER AS cnt
    FROM public.profiles
    WHERE employment_status IS DISTINCT FROM 'terminated'
      AND role IS NOT NULL
    GROUP BY LOWER(TRIM(role))
    ORDER BY cnt DESC
  ) sub;
$$;

-- 3. Headcount broken down by department
CREATE OR REPLACE FUNCTION public.get_headcount_by_department()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('department', dept, 'count', cnt))
    FILTER (WHERE dept IS NOT NULL),
    '[]'::jsonb
  )
  FROM (
    SELECT INITCAP(TRIM(COALESCE(department, 'Cross-Functional'))) AS dept,
           COUNT(*)::INTEGER AS cnt
    FROM public.profiles
    WHERE employment_status IS DISTINCT FROM 'terminated'
    GROUP BY INITCAP(TRIM(COALESCE(department, 'Cross-Functional')))
    ORDER BY cnt DESC
  ) sub;
$$;

-- 4. Total raw profile count (including terminated)
CREATE OR REPLACE FUNCTION public.get_total_profile_count()
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COUNT(*)::INTEGER FROM public.profiles;
$$;

-- 5. Hires this calendar month
CREATE OR REPLACE FUNCTION public.get_hires_this_month()
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COUNT(*)::INTEGER FROM public.profiles
  WHERE employment_status IS DISTINCT FROM 'terminated'
    AND created_at IS NOT NULL
    AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE);
$$;

-- 6. Pending leaves count
CREATE OR REPLACE FUNCTION public.get_pending_leaves_count()
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COUNT(*)::INTEGER FROM public.leaves
  WHERE status ILIKE 'pending';
$$;

-- 7. Open complaints count
CREATE OR REPLACE FUNCTION public.get_open_complaints_count()
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COUNT(*)::INTEGER FROM public.complaints
  WHERE status ILIKE 'open';
$$;

-- 8. ALL dashboard metrics in ONE call (for admins/HR)
CREATE OR REPLACE FUNCTION public.get_enterprise_metrics()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'active_headcount',       (SELECT public.get_active_headcount()),
    'total_profiles',         (SELECT public.get_total_profile_count()),
    'by_role',                (SELECT public.get_headcount_by_role()),
    'by_department',          (SELECT public.get_headcount_by_department()),
    'hires_this_month',       (SELECT public.get_hires_this_month()),
    'pending_leaves',         (SELECT public.get_pending_leaves_count()),
    'open_complaints',        (SELECT public.get_open_complaints_count())
  ) INTO result;

  RETURN result;
END;
$$;

-- 9. Team-level metrics (for team leads)
CREATE OR REPLACE FUNCTION public.get_team_metrics(lead_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  team_ids UUID[];
  result JSONB;
BEGIN
  SELECT ARRAY_AGG(id) INTO team_ids FROM public.profiles
  WHERE team_lead_id = lead_id
     OR department = (SELECT department FROM public.profiles WHERE id = lead_id);

  SELECT jsonb_build_object(
    'team_size',              COALESCE(array_length(team_ids, 1), 0),
    'pending_leaves',         (SELECT COUNT(*)::INTEGER FROM public.leaves WHERE status ILIKE 'pending' AND user_id = ANY(team_ids)),
    'open_complaints',        (SELECT COUNT(*)::INTEGER FROM public.complaints WHERE status ILIKE 'open' AND user_id = ANY(team_ids)),
    'pending_tasks',          (SELECT COUNT(*)::INTEGER FROM public.tasks WHERE assigned_to = ANY(team_ids) AND status ILIKE 'pending'),
    'active_projects',        (SELECT COUNT(*)::INTEGER FROM public.projects WHERE status IS DISTINCT FROM 'Completed')
  ) INTO result;

  RETURN result;
END;
$$;
