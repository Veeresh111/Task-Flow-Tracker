# Decision Register

Before any code change: evidence → business rule verification → approval. No implementation without all three.

## G1.5-E Findings

| Finding | Grade | Priority | Description | Business Rule Verified | Business Impact | Implementation Approved | Rationale |
|---------|-------|----------|-------------|----------------------|-----------------|------------------------|-----------|
| RPC-011-F2 | L4R | P1 | `auth.uid() IS NULL` path in `prevent_self_role_change` untested — service role operations could silently bypass role-change restrictions | N/A | HI — potential security bypass for service-role operations. No user-facing impact currently (service key not in use). | **Pending** | Needs more evidence first. L4R observation only; service role behavior unconfirmed. |
| RPC-002-F2 | L4S | P2 | `get_team_metrics.active_projects` counts ALL non-completed projects globally — no team filter column on `projects` table | **Needs business input** | MI — Team Leads may see inflated project counts. Dashboard already works around this (re-filters independently), so current user impact is minimal. | **Pending** | Is the intended behavior "projects my team works on" or "all active projects in org"? SQL and frontend disagree; business rule not yet documented. |
| RPC-003-F1 | L4S | P2 | `auto_expire_assessment_tokens` Edge Function has no scheduled trigger — never fires automatically | **Needs business input** | MI — Old assessment tokens remain Active indefinitely. No observed user impact yet (no complaints about expired tokens). | **Pending** | Is auto-expiry a requirement, or is manual invocation sufficient? The function exists but no cron was configured — may be intentional. |
| RPC-004-F1 | L4S | P3 | Two divergent versions of `resolve_candidate_id` across migrations — active version depends on migration order | **Confirmed** | LI — Could cause candidate ID resolution failures if triggers call the wrong version. No observed failures in current DB state. | **Pending** | Schema inconsistency confirmed — same function redefined with different logic. Needs cleanup but low priority. |
| RPC-001-F1 | L4S | P3 | `hires_this_month` counts from `profiles.created_at` instead of `candidate_onboarding` | **Confirmed (known)** | LI — Off-by-N in hire counts. Documented in AGENTS.md Phase B5. Business requirement preference, not a bug. | **Deferred** | Documented known issue. |
| RPC-002-F4 | L4S | P4 | `pending_tasks` and `active_projects` returned by `get_team_metrics` but consumed by zero frontend call sites | **Confirmed** | NI — Dead return values. No user-facing impact. | **Deferred** | No user impact. Cleanup during phase reorganization. |
| RPC-005 | L4S | N/A | `sync_application_status` — no call sites identified | **Confirmed** | NI — Unused function. No impact. | **Deferred** | Keep for future atomic status sync. |
| RPC-006 | L4S | N/A | `sync_application_status_by_app_id` — no call sites identified | **Confirmed** | NI — Unused wrapper. No impact. | **Deferred** | Keep with RPC-005. |
| RPC-007-F1 | L4S | N/A | `auto_expire_job_forms` — two versions (v1: only 'Published', v2: 'Published' + 'Open'), neither called | **Confirmed** | NI — Unused function with schema inconsistency. No user impact. | **Deferred** | Schema inconsistency in unused code. |

## Next Execution Steps

1. **G1.5-F: RLS Matrix** — next sub-step
2. Revisit RPC-002-F2 and RPC-003-F1 after business rule documentation exists
3. Fix only P0/P1 after G1.5 gate completes
