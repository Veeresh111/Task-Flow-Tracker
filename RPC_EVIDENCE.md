# RPC Evidence Register

## EV-RPC-001: `get_enterprise_metrics()`

### 1. RPC Name
`get_enterprise_metrics`

### 2. Frontend Call Sites
| File | Line | Usage |
|------|------|-------|
| `src/pages/admin/Dashboard.tsx` | 30 | Main admin dashboard — displays headcount cards, department charts, payroll summary |
| `src/pages/admin/Analytics.tsx` | 183 | Department distribution via `by_department` from RPC |
| `src/pages/admin/AIInsights.tsx` | 30 | Unifies department headcounts via `by_department` |
| `src/pages/hr/Dashboard.tsx` | 37 | HR dashboard — headcount, open complaints, pending leaves |

### 3. SQL Definition
**File**: `supabase/migrations/20260620000541_unified_enterprise_metrics.sql:108-129`

```sql
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
```

### 4. Tables Read
- `public.profiles` — via `get_active_headcount()`, `get_total_profile_count()`, `get_headcount_by_role()`, `get_headcount_by_department()`, `get_hires_this_month()`
- `public.leaves` — via `get_pending_leaves_count()`
- `public.complaints` — via `get_open_complaints_count()`

### 5. Tables Written
None — all sub-functions are `STABLE` (read-only within transaction).

### 6. Security Context
`SECURITY DEFINER` — runs as function owner, bypasses RLS. This is intentional: dashboard metrics must be consistent regardless of role. Any user with EXECUTE privilege can call this.

### 7. RLS Interaction
Bypasses RLS for all 3 underlying tables. RLS on `profiles`, `leaves`, `complaints` does not affect the returned values. Admin dashboard values may differ from what a non-admin user sees in direct queries.

### 8. Inputs
None.

### 9. Outputs
| Key | Type | Source | Description |
|-----|------|--------|-------------|
| `active_headcount` | INTEGER | `get_active_headcount()` | Non-terminated profiles count |
| `total_profiles` | INTEGER | `get_total_profile_count()` | All profiles including terminated |
| `by_role` | JSONB[] | `get_headcount_by_role()` | `{role, count}` per normalized role |
| `by_department` | JSONB[] | `get_headcount_by_department()` | `{department, count}` per normalized dept |
| `hires_this_month` | INTEGER | `get_hires_this_month()` | Non-terminated profiles where `created_at` is current month |
| `pending_leaves` | INTEGER | `get_pending_leaves_count()` | Leaves with ILIKE 'pending' status |
| `open_complaints` | INTEGER | `get_open_complaints_count()` | Complaints with ILIKE 'open' status |

### 10. Error Paths
- Missing table (`profiles`, `leaves`, `complaints`) → runtime error propagated to caller
- Missing column (`employment_status`, `role`, `department`, `created_at`, `status`, `user_id`) → runtime error
- Caller lacks EXECUTE ON FUNCTION → permission denied

### 11. UI Pages Using This RPC
- Admin Dashboard (`src/pages/admin/Dashboard.tsx:30`)
- Admin Analytics (`src/pages/admin/Analytics.tsx:183`)
- Admin AIInsights (`src/pages/admin/AIInsights.tsx:30`)
- HR Dashboard (`src/pages/hr/Dashboard.tsx:37`)

### 12. Evidence ID
`EV-RPC-001`

### 13. Certification Status
**UNDER REVIEW** — see findings below.

### Findings

| ID | Grade | Description | Priority |
|----|-------|-------------|----------|
| RPC-001-F1 | L4S | `hires_this_month` counts from `profiles.created_at` instead of `candidate_onboarding`. Known issue (AGENTS.md Phase B5). Does not affect correctness of the function — it does what it's designed to do. Business requirement change, not a bug. | P3 |
| RPC-001-F2 | L4S | Sub-functions are each `SECURITY DEFINER STABLE` — 8 separate security contexts per call. This is correct by design for dashboard consistency, but should be documented for auditors. | P4 |
| RPC-001-F3 | L4S | Function call traced in frontend code (4 call sites). No runtime execution in this session. Prior sessions observed it return data to Admin/HR dashboards, but this session did not re-verify against live DB. | N/A |

---

## EV-RPC-002: `get_team_metrics(lead_id UUID)`

### 1. RPC Name
`get_team_metrics`

### 2. Frontend Call Sites
| File | Line | Usage |
|------|------|-------|
| `src/pages/team-lead/Dashboard.tsx` | 54 | Team lead dashboard — team size, pending leaves, open complaints |
| `src/pages/team-lead/Analytics.tsx` | 36 | Team analytics — display team metrics header |
| `src/pages/team-lead/AIInsights.tsx` | 36 | Team AI insights — authoritative team headcount |

### 3. SQL Definition
**File**: `supabase/migrations/20260620000541_unified_enterprise_metrics.sql:132-156`

```sql
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
```

### 4. Tables Read
- `public.profiles` — team membership lookup (by `team_lead_id` or same `department`)
- `public.leaves` — pending leaves count for team
- `public.complaints` — open complaints count for team
- `public.tasks` — pending tasks count for team
- `public.projects` — active (non-completed) projects count

### 5. Tables Written
None — `STABLE` function.

### 6. Security Context
`SECURITY DEFINER` — bypasses RLS. Team lead sees all team data regardless of individual privacy settings.

### 7. RLS Interaction
Bypasses RLS for all 5 underlying tables. Same reasoning as EV-RPC-001: dashboard consistency.

### 8. Inputs
| Parameter | Type | Description |
|-----------|------|-------------|
| `lead_id` | UUID | The team lead's user ID |

### 9. Outputs
| Key | Type | Source | Description |
|-----|------|--------|-------------|
| `team_size` | INTEGER | `array_length(team_ids, 1)` | Count of team members (by lead_id or same dept) |
| `pending_leaves` | INTEGER | `leaves` query | Team members with ILIKE 'pending' leaves |
| `open_complaints` | INTEGER | `complaints` query | Team members with ILIKE 'open' complaints |
| `pending_tasks` | INTEGER | `tasks` query | Team members with ILIKE 'pending' tasks |
| `active_projects` | INTEGER | `projects` query | Non-completed projects |

### 10. Error Paths
- Invalid UUID → runtime error
- Missing tables/columns → runtime error
- Caller lacks EXECUTE → permission denied
- `lead_id` not found in `profiles` → `team_ids` is NULL → `array_length(NULL, 1)` returns NULL → `COALESCE(NULL, 0)` returns 0 for team_size. Other queries use `user_id = ANY(NULL)` which evaluates to FALSE → returns 0 for all counts. Graceful degradation.

### 11. UI Pages Using This RPC
- Team Lead Dashboard (`src/pages/team-lead/Dashboard.tsx:54`)
- Team Lead Analytics (`src/pages/team-lead/Analytics.tsx:36`)
- Team Lead AIInsights (`src/pages/team-lead/AIInsights.tsx:36`)

### 12. Evidence ID
`EV-RPC-002`

### 13. Certification Status
**UNDER REVIEW**

### Findings

| ID | Grade | Description | Priority |
|----|-------|-------------|----------|
| RPC-002-F1 | L4S | Team membership logic uses `team_lead_id = lead_id OR department = lead's department`. This means a team lead sees ALL employees in their department, not just direct reports. May overcount for large departments. Confirmed as intentional from frontend code (TeamLeadAnalytics.tsx:44-47 uses same logic). | P3 |
| RPC-002-F2 | L4S | `active_projects` counts ALL non-completed projects globally, not filtered to team. The `projects` table does not have a `team_lead_id` column, so no team-level filter is possible. The frontend (TeamLeadDashboard.tsx:57) re-filters independently with `p.team_lead_id === user.id`. This means EV-RPC-002's `active_projects` value is always inflated compared to what the UI actually displays. | P2 |
| RPC-002-F3 | L4S | Function call traced in frontend code (3 call sites). No runtime execution in this session. Prior sessions observed team lead dashboards rendering with data, but this session did not re-verify against live DB. | N/A |
| RPC-002-F4 | L4S | `pending_tasks` and `active_projects` are returned by the RPC but consumed by zero frontend call sites. Dead return values. TeamLeadDashboard uses `pending_leaves` (line 68) and its own `projCount` (line 57) instead. | P4 |

---

## EV-RPC-003: `auto_expire_assessment_tokens()`

### 1. RPC Name
`auto_expire_assessment_tokens`

### 2. Frontend Call Sites
None — called from Edge Function only.

### 3. Edge Function Call Site
**File**: `supabase/functions/expire-tokens/index.ts:20`
```ts
const { data, error } = await supabase.rpc('auto_expire_assessment_tokens');
```
Uses `SUPABASE_SERVICE_ROLE_KEY` — bypasses RLS intentionally.

### 4. SQL Definition
**File**: `supabase/migrations/20260620040000_phase4_rls_automation.sql:230-240`

```sql
CREATE OR REPLACE FUNCTION public.auto_expire_assessment_tokens()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.assessment_tokens
  SET status = 'Expired'
  WHERE status = 'Active' AND expires_at IS NOT NULL AND expires_at < now();
END;
$$;
```

### 5. Tables Read
- `public.assessment_tokens` — WHERE filter to find expired tokens

### 6. Tables Written
- `public.assessment_tokens` — SET status = 'Expired'

### 7. Security Context
`SECURITY DEFINER` with `SET search_path = public` — runs as owner, safe from search path injection.

### 8. RLS Interaction
Bypasses RLS (SECURITY DEFINER + called from Edge Function using service role key).

### 9. Inputs
None.

### 10. Outputs
`void` — returns nothing.

### 11. Error Paths
- `assessment_tokens` table missing → runtime error
- `expires_at` column missing → runtime error
- Edge Function deployment not triggered → function never called

### 12. Scheduling
- Edge Function is deployed and configured in `supabase/config.toml:439-443` (`verify_jwt = false`)
- No `pg_cron` or external cron configured — depends on manual invocation or Supabase Dashboard scheduled function

### 13. UI Pages
None — background maintenance function.

### 14. Evidence ID
`EV-RPC-003`

### 15. Certification Status
**UNDER REVIEW**

### Findings

| ID | Grade | Description | Priority |
|----|-------|-------------|----------|
| RPC-003-F1 | L4S | No cron/trigger configured to invoke the Edge Function. Code path exists but is not scheduled. Tokens will never auto-expire unless manually triggered. | P2 |
| RPC-003-F2 | L4S | Edge Function verified as deployed in config. Code traced end-to-end: config.toml → index.ts → RPC call. | N/A |

---

## EV-RPC-004: `resolve_candidate_id(input_id UUID)`

### 1. RPC Name
`resolve_candidate_id`

### 2. Frontend Call Sites
None — never called via `supabase.rpc()`.

### 3. Trigger Call Sites
Used internally by ~8 trigger functions across migrations:
- `notify_on_chat_message`
- `notify_candidate_on_hr_message`
- `notify_on_interview_scheduled`
- `notify_on_offer_status_change`
- `notify_candidate_on_application_status`
- `notify_on_complaint`
- `notify_candidate_on_assessment`
- `notify_candidate_on_offer_created`

### 4. RLS Policy Usage
Used in 3 RLS policies in `20260622000000_phase6_missing_schema.sql:309-321`:
- `candidate_applications` SELECT policy
- `candidate_hr_messages` SELECT policy
- `background_verifications` SELECT policy

### 5. SQL Definition (v1 — original)
**File**: `supabase/migrations/20260620003500_fix_resolve_candidate_id.sql:5-22`

```sql
CREATE OR REPLACE FUNCTION public.resolve_candidate_id(input_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id FROM public.candidates WHERE id = input_id;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  SELECT candidate_id INTO v_id FROM public.profiles WHERE id = input_id AND candidate_id IS NOT NULL;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  RETURN input_id;
END;
$$;
```

### 6. SQL Definition (v2 — simplified for RLS)
**File**: `supabase/migrations/20260622000000_phase6_missing_schema.sql:295-303`

```sql
CREATE OR REPLACE FUNCTION resolve_candidate_id(auth_uid UUID)
RETURNS UUID AS $$
DECLARE
  result UUID;
BEGIN
  SELECT candidate_id INTO result FROM profiles WHERE id = auth_uid AND candidate_id IS NOT NULL;
  RETURN COALESCE(result, auth_uid);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 7. Tables Read
- `public.candidates` — direct ID lookup (v1 only)
- `public.profiles` — candidate_id lookup (both versions)

### 8. Tables Written
None — `STABLE` function.

### 9. Security Context
`SECURITY DEFINER` — bypasses RLS. Required because it's called inside RLS policies and triggers that need to resolve identity without recursion.

### 10. RLS Interaction
Bypasses RLS. This is critical — RLS policies call this function to resolve candidate identity. If it were `SECURITY INVOKER`, RLS recursion would break the policies.

### 11. Inputs
| Parameter | Type | Description |
|-----------|------|-------------|
| `input_id` (v1) or `auth_uid` (v2) | UUID | Profile ID or candidate ID |

### 12. Outputs
| Type | Description |
|------|-------------|
| UUID | The resolved candidate ID |

### 13. Resolution Logic
1. Check if input IS a candidate ID → return it
2. Check if input has a `candidate_id` in profiles → return it
3. Fallback → return input unchanged

### 14. Error Paths
- `candidates` or `profiles` table missing → runtime error
- Multiple `candidate_id` matches → returns first (non-deterministic without ORDER BY)

### 15. UI Pages
None directly — used indirectly by notifications, RLS policies, and triggers that power the UI.

### 16. Evidence ID
`EV-RPC-004`

### 17. Certification Status
**UNDER REVIEW**

### Findings

| ID | Grade | Description | Priority |
|----|-------|-------------|----------|
| RPC-004-F1 | L4S | Two versions exist in separate migrations (v1 in `20260620003500`, v2 in `20260622000000`). The later redefinition removes the `candidates.id` direct lookup step. Depending on migration order, the active version differs. | P3 |
| RPC-004-F2 | L4S | No ORDER BY on `profiles` lookup — if a profile has multiple `candidate_id` values (shouldn't happen with proper schema, but no unique constraint on `candidate_id`), the result is non-deterministic. | P3 |
| RPC-004-F3 | L4S | Widely used in triggers and RLS policies. Verified by code trace across ~11 call sites. | N/A |

---

## EV-RPC-005: `sync_application_status(...)` — No Current Call Sites

### 1. RPC Name
`sync_application_status`

### 2. Call Sites
**NONE** — not called from frontend, edge functions, triggers, or scheduled jobs.

### 3. SQL Definition
**File**: `supabase/migrations/20260620001000_atomic_status_sync.sql:8-53`

```sql
CREATE OR REPLACE FUNCTION public.sync_application_status(
  p_candidate_id UUID,
  p_form_id UUID,
  p_new_status TEXT,
  p_interview_status TEXT DEFAULT NULL,
  p_interview_score DECIMAL DEFAULT NULL,
  p_ai_verdict TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.job_applications SET status = COALESCE(p_new_status, status), ai_verdict = COALESCE(p_ai_verdict, ai_verdict), updated_at = now()
  WHERE candidate_id = p_candidate_id AND (form_id = p_form_id OR job_form_id = p_form_id);

  UPDATE public.candidate_applications SET status = COALESCE(p_new_status, status), interview_status = COALESCE(p_interview_status, interview_status), interview_score = COALESCE(p_interview_score, interview_score), updated_at = now()
  WHERE candidate_id = p_candidate_id AND job_form_id = p_form_id;

  UPDATE public.candidates SET stage = COALESCE(p_new_status, stage), updated_at = now()
  WHERE id = p_candidate_id;

  IF NOT FOUND THEN
    RAISE NOTICE 'sync_application_status: no matching records for candidate_id=%, form_id=%', p_candidate_id, p_form_id;
  END IF;
END;
$$;
```

### 4. Tables Written
- `public.job_applications`
- `public.candidate_applications`
- `public.candidates`

### 5. Security Context
`SECURITY DEFINER`

### 6. Evidence ID
`EV-RPC-005`

### 7. Verdict
**No current call sites identified** — search of frontend, Edge Functions, triggers, cron schedules, and SQL function references found zero invocations. The recruitment workflow uses trigger functions (`sync_job_application_to_candidate_app`, `sync_candidate_stage`, etc.) and direct frontend table queries instead. Likely designed as a future atomic replacement for the trigger-based approach.

---

## EV-RPC-006: `sync_application_status_by_app_id(...)` — No Current Call Sites

### 1. RPC Name
`sync_application_status_by_app_id`

### 2. Call Sites
**NONE** — not called from frontend, edge functions, triggers, or scheduled jobs.

### 3. SQL Definition
**File**: `supabase/migrations/20260620001000_atomic_status_sync.sql:56-83`

```sql
CREATE OR REPLACE FUNCTION public.sync_application_status_by_app_id(
  p_application_id UUID,
  p_new_status TEXT,
  p_interview_status TEXT DEFAULT NULL,
  p_interview_score DECIMAL DEFAULT NULL,
  p_ai_verdict TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_candidate_id UUID;
  v_form_id UUID;
BEGIN
  SELECT candidate_id, COALESCE(form_id, job_form_id) INTO v_candidate_id, v_form_id
  FROM public.job_applications WHERE id = p_application_id;

  IF v_candidate_id IS NULL THEN
    RAISE NOTICE 'sync_application_status_by_app_id: application_id=% not found', p_application_id;
    RETURN;
  END IF;

  PERFORM public.sync_application_status(v_candidate_id, v_form_id, p_new_status, p_interview_status, p_interview_score, p_ai_verdict);
END;
$$;
```

### 4. Tables Read
- `public.job_applications` — lookup by application_id

### 5. Tables Written
Delegates to `sync_application_status` — same 3 tables.

### 6. Security Context
`SECURITY DEFINER`

### 7. Evidence ID
`EV-RPC-006`

### 8. Verdict
**No current call sites identified** — wrapper around EV-RPC-005. Both have zero invocations across frontend, Edge Functions, triggers, cron, and SQL references. The frontend updates `job_applications.status` directly via `supabase.from('job_applications').update(...)`, and triggers propagate changes.

---

## EV-RPC-007: `auto_expire_job_forms()` — No Current Call Sites

### 1. RPC Name
`auto_expire_job_forms`

### 2. Call Sites
**NONE** — no trigger, no edge function, no cron, no frontend code.

### 3. SQL Definition (v1)
**File**: `supabase/migrations/20260620005000_assessment_flow_fix.sql:8-21`

```sql
CREATE OR REPLACE FUNCTION public.auto_expire_job_forms()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.job_forms
  SET status = 'Expired', updated_at = now()
  WHERE status = 'Published'
    AND expires_at IS NOT NULL
    AND expires_at < now();
END;
$$;
```

### 4. SQL Definition (v2 — broader status filter)
**File**: `supabase/migrations/20260622000000_phase6_missing_schema.sql:283-292`

```sql
CREATE OR REPLACE FUNCTION auto_expire_job_forms()
RETURNS void AS $$
BEGIN
  UPDATE job_forms
  SET status = 'Expired'
  WHERE status IN ('Published', 'Open')
    AND expires_at IS NOT NULL
    AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 5. Tables Written
- `public.job_forms` — SET status = 'Expired'

### 6. Evidence ID
`EV-RPC-007`

### 7. Verdict
**No current call sites identified** — documented in `docs/ANCHORED_SUMMARY.md` as "Set up pg_cron or scheduled function" (TODO, not done). Two versions with slightly different logic (v1 only 'Published', v2 adds 'Open'). Neither is invoked by any trigger, Edge Function, or cron schedule in the codebase.

---

## EV-RPC-008: `get_user_role()`

### 1. RPC Name
`get_user_role`

### 2. Call Sites
Called from RLS policies and other SECURITY DEFINER functions only. Never called via `supabase.rpc()` from frontend.

### 3. SQL Definition
**File**: `supabase/migrations/20260619232721_fix_rls_recursion.sql:5-12`

```sql
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;
```

### 4. Tables Read
- `public.profiles` — role column lookup

### 5. Tables Written
None.

### 6. Security Context
`SECURITY DEFINER` — critical: this breaks the RLS recursion cycle. Without this, policies querying `profiles` while checking `profiles` would recurse infinitely.

### 7. RLS Interaction
Bypasses RLS. This is the **foundation of the entire RLS system** — all policies that check role use `user_has_role()` which calls `get_user_role()`.

### 8. Evidence ID
`EV-RPC-008`

### 9. Certification Status
**Certified — L4S** (used across 30+ RLS policies, code-traced in migration file).

---

## EV-RPC-009: `get_user_department()`

### 1. RPC Name
`get_user_department`

### 2. Call Sites
Called from RLS policies only. Never called via `supabase.rpc()`.

### 3. SQL Definition
**File**: `supabase/migrations/20260619232721_fix_rls_recursion.sql:15-22`

```sql
CREATE OR REPLACE FUNCTION public.get_user_department()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT department FROM public.profiles WHERE id = auth.uid();
$$;
```

### 4. Tables Read
- `public.profiles` — department column lookup

### 5. Security Context
`SECURITY DEFINER` — breaks RLS recursion.

### 6. Evidence ID
`EV-RPC-009`

### 7. Certification Status
**Certified — L4S**

---

## EV-RPC-010: `user_has_role(roles TEXT[])`

### 1. RPC Name
`user_has_role`

### 2. Call Sites
Called from ~30+ RLS policies across all tables. Never called via `supabase.rpc()`.

### 3. SQL Definition
**File**: `supabase/migrations/20260619232721_fix_rls_recursion.sql:25-32`

```sql
CREATE OR REPLACE FUNCTION public.user_has_role(roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(public.get_user_role() = ANY(roles), false);
$$;
```

### 4. Tables Read
None directly — delegates to `get_user_role()`.

### 5. Security Context
`SECURITY DEFINER` — critical for RLS.

### 6. Evidence ID
`EV-RPC-010`

### 7. Certification Status
**Certified — L4S**

---

## EV-RPC-011: `prevent_self_role_change()`

### 1. RPC Name
`prevent_self_role_change`

### 2. Call Sites
Trigger function — fires on `BEFORE UPDATE ON public.profiles`.

### 3. SQL Definition
**File**: `supabase/migrations/20260627000001_fix_trigger_allow_superuser.sql:6-22`

```sql
CREATE OR REPLACE FUNCTION public.prevent_self_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    IF auth.uid() IS NULL THEN
      RETURN NEW;
    END IF;
    IF NOT public.user_has_role(ARRAY['admin', 'hr']) THEN
      RAISE EXCEPTION 'Permission denied: You cannot change your own role. Only administrators can modify roles.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
```

### 4. Tables Read
None directly — delegates to `user_has_role()`.

### 5. Tables Written
Trigger acts on `public.profiles` — blocks UPDATE when role changes for non-admin users.

### 6. Security Context
`SECURITY DEFINER` — required to check `auth.uid()` and `user_has_role()` without RLS recursion.

### 7. Runtime Verification
This trigger was verified in prior sessions:
- UPDATE on admin profile: role change succeeded ✅
- UPDATE on non-admin profile with role change: blocked with error ✅
- Testing acknowledged as L4R (runtime observation), not L5A (because `auth.uid() IS NULL` path was not tested — no service role access)

### 8. Evidence ID
`EV-RPC-011`

### 9. Certification Status
**UNDER REVIEW**

### Findings

| ID | Grade | Description | Priority |
|----|-------|-------------|----------|
| RPC-011-F1 | L4R | Non-admin role change blocked ✅ (verified in trigger verification session). Admin role change succeeded ✅. | N/A |
| RPC-011-F2 | L4R | `auth.uid() IS NULL` path not tested. Service role key not available. If this path is ever triggered by a service-role operation, it would silently allow role changes without the `user_has_role` check. | P1 |

