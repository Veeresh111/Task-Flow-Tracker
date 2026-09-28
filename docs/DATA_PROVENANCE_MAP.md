# DATA PROVENANCE MAP

Authoritative source for every business fact shown in the UI. Where two sources
could compete, the **authoritative** one is named and the competing one is marked.

Conventions: `auth.uid()` = Supabase JWT subject, resolved server-side (RLS/RPC),
never a client-supplied ID.

## Employee domain

| UI element | Component | Hook/service | API/RPC | Table/column | Authorization | Source of truth |
|---|---|---|---|---|---|---|
| Logged-in name/role | DashboardLayout, dashboards | direct select | profiles select | `profiles.name`, `profiles.role` | `id = auth.uid()` | profiles row for the JWT subject |
| Assigned tasks | employee/Tasks.tsx, Dashboard | direct select | tasks select | `tasks.*` (`assigned_to`) | RLS: owner / manager-of | tasks rows |
| Active projects count | employee/Dashboard.tsx | derived | tasks select | `tasks.project_id` (distinct) | owner-scoped | derived from real task rows (not stored) |
| Hours logged | employee/Dashboard.tsx | derived | work_logs select | `clock_in`, `clock_out` | owner-scoped | computed from real timestamps; never a constant |
| Today's attendance | employee/Dashboard.tsx | direct select | work_logs select (today) | `clock_in`, `clock_out`, `status` | owner-scoped | today's real work_logs row; honest empty state if absent |
| Own work logs | employee/WorkLogs.tsx | direct select | work_logs select | `work_logs.*` | owner-scoped | work_logs rows |
| Leave requests + statuses | employee/leaves.tsx | direct select | leaves select | `leaves.status` | owner-scoped | leaves rows |
| **Leave balance** | employee leaves UI | ledger read | leave_ledgers select | latest `leave_ledgers.balance_after` per user+`paid_leave` | owner-scoped | **leave_ledgers (AUTHORITATIVE)**; `leaves` table records requests only — must never be summed to produce a balance |
| Notifications | NotificationPopover, pages | useNotifications | notifications select + realtime | `notifications.*` | recipient-scoped | notifications rows |
| Complaints | employee/Complaints.tsx | direct select | complaints select | `complaints.*` (`user_id`) | owner-scoped | complaints rows |
| Own payslips | employee/Payroll.tsx | direct select | payslips select | `payslips.gross/net/pf_amount/...` | RLS live-verified: 4 own, 0 foreign | payslips rows |
| Salary revision history | employee/Payroll.tsx | direct select | salary_revisions select | `salary_revisions.*` | owner-scoped | salary_revisions rows |
| Annual CTC display | employee/Payroll.tsx | profiles select | profiles select | `profiles.payroll_ctc` | owner-scoped | profiles.payroll_ctc |

## Payroll domain (credits are INTERNAL ledger events — never "bank transfer")

| UI element | Component | Hook/service | API/RPC | Table/column | Authorization | Source of truth |
|---|---|---|---|---|---|---|
| Payroll cycles list | hr/Payroll.tsx | direct select | payroll_cycles select | `payroll_cycles.*` | staff-only RLS (live-verified: employee 0 rows, anon 0 rows) | payroll_cycles rows |
| Cycle generation | hr/Payroll.tsx handleGenerate | RPC | `process_monthly_payroll(p_month,p_year)` | inserts payroll_cycles + payslips | auth + staff insert policies; UNIQUE(month,year)+advisory lock | DB function (frontend NEVER computes salary) |
| Cycle status transitions | hr/Payroll.tsx handleTransitionStatus | RPC | `transition_payroll_status(cycle_id,next)` | status columns + payslips.status='credited' on release + payroll_audit | role-checked inside fn; audit row same tx | DB function |
| Payroll preview math | — (digital twin) | lib/payroll.ts | mirrors `process_monthly_payroll` | none (pure) | n/a | **AUTHORITATIVE = DB function.** lib/payroll.ts is display-only and must stay in sync; it never decides salary |
| Payslip PDF/CSV | Payroll UIs | client download from fetched payslip row | — | — | read already RLS-scoped | derived from authoritative payslip row |
| Monthly scheduler | — | pg_cron `corporate-monthly-payroll` | `auto_process_monthly_payroll_idempotent(prev_month, prev_year)` (live-verified command) | — | n/a | cron command processes PREVIOUS month on the 1st (Oct salary → Nov 1); Jan-1 rollover simulated correct (12/prior-year) |

## Candidate / recruitment domain

| UI element | Component | Hook/service | API/RPC | Table/column | Authorization | Source of truth |
|---|---|---|---|---|---|---|
| Candidate profile | candidate pages | direct select | candidates/profiles select | `candidates.*` mapped by `profiles.auth_user_id` chain | owner or HR | candidates row bound to authenticated identity |
| Applications | candidate Dashboard, hr ApplicationHub | direct select | job_applications select | `job_applications.status` | owner (candidate) / HR staff | job_applications rows |
| ATS score | hr ATSScanner + candidate views | scan writes | candidates/job_applications insert | `candidates.ats_score` + **`candidates.evaluation_method`** ('ai' \| 'rule_based' \| NULL-legacy) | HR write, scoped read | persisted ATS result; legacy rows honestly NULL; UI labels AI vs Rule-based |
| Match score on application | hr pipeline views | direct select | job_applications select | `job_applications.match_score` | HR staff | job_applications row (kept in sync by trigger; candidates.ats_score is the candidate-level fact) |
| Resume text | hr pipeline views | direct select | job_applications select | `job_applications.parsed_resume_text` | HR staff | parsed from the actually-uploaded file at scan time |
| Assessment invitations/tokens | AssessmentCenter, AssessmentAccess | RPCs + direct | assessment_tokens | `assessment_tokens.token/status/expires_at` | token-bound; anon select scoped by migration 20260921000018–20 | assessment_tokens rows |
| Assessment results | candidate Dashboard, HR centers | direct select | assessment_attempts select | `score/passed` | candidate owner / HR | assessment_attempts rows |
| Interviews | candidate Interviews, hr InterviewCenter | direct select | interview_sessions select | `status/score/scheduled_at` | participant / HR | interview_sessions rows |
| Offers | OfferManagement, candidate Dashboard | direct select | offer_letters select | `status/offered_ctc` | candidate owner / HR | offer_letters rows |
| Onboarding | OnboardingCenter | direct select | candidate_onboarding | `stage/status` | HR staff / owner | candidate_onboarding rows |
| HR↔candidate messages | CandidateMessages, candidate Messages | direct select + realtime | messages select/insert | `messages.*` (sender/recipient/application binding) | RLS: only participants | messages rows; no local-only chat state is authoritative |

## HR aggregates

| UI element | Component | API/RPC | Source of truth |
|---|---|---|---|
| Headcount / open complaints / pending leaves | hr/Dashboard.tsx | `get_enterprise_metrics()` RPC | DB aggregates — single call shared across dashboards to avoid divergent counts |
| Est. payroll (HR KPI) | hr/Dashboard.tsx | profiles select | SUM of real `payroll_ctc` over non-terminated; missing CTC counted & displayed as "unassigned" — never invented |

## Identity continuity (candidate → employee)

| Transition | Mechanism | Source of truth |
|---|---|---|
| auth user → profile | `profiles.id = auth.users.id` | profiles row |
| profile → candidate identity | candidate registration flow; candidate-scoped RLS | candidates / profiles.role='candidate' |
| candidate → application | `job_applications.candidate_id` FK | job_applications row |
| offer → hire | `hire-candidate` Edge Function + hiring RPCs | employee record created with reconciliation; profile role transition audited |
| employee → offboarding | resignation → approval → `auto_offboard_employees()` cron | profiles.role='ARCHIVED', status inactive, employment_status terminated + audit_logs row |

**Rule enforced:** no candidate UUID is ever treated as `auth.users.id`; every
person-facing query resolves through `auth.uid()` → `profiles` → domain row.

## Known competing sources (documented, not silently dual)

1. **Payroll math:** `lib/payroll.ts` (preview) vs `process_monthly_payroll` (DB).
   DB is authoritative; preview must match and never overrides. Status: acceptable
   by design, kept in sync via unit tests.
2. **Candidate ATS facts:** `candidates.ats_score` (per candidate) vs
   `job_applications.match_score` (per application). Both are written at scan time;
   the application-level score is authoritative for pipeline ranking, the
   candidate-level score for the candidate record. Distinct grains — not duplicates.
3. **Leave balance:** `leave_ledgers.balance_after` is authoritative; any UI that
   derives balance by summing `leaves` rows is a defect and must be fixed on sight.

## Verification

Evidence scripts: `scripts/verify-live-db.mjs`, `scripts/live-e2e-verification.mjs`,
results in `scripts/live-e2e-results.json`. Browser E2E status per feature:
see `docs/LIVE_FEATURE_TRUTH_MATRIX.md`.
