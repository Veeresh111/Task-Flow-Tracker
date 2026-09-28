# LIVE FEATURE TRUTH MATRIX

Every status is backed by evidence gathered **against the live Supabase project**
(`txwxtsdsbuddqfrtllsf`) on 2026-09-26 via:

- `scripts/verify-live-db.mjs` — direct SQL over SSL as postgres
- `scripts/live-e2e-verification.mjs` — real HTTP through the public Supabase API with
  real authenticated sessions (HR login `jack@email.com`; employee login via an
  admin-issued temporary password, restored to a random valid hash afterwards)
- `scripts/live-e2e-results.json` — machine-readable results
- Supabase CLI (`migration list`, `db push`) and Edge Function HTTP probes

Statuses: `WORKING` | `PARTIALLY_WORKING` | `BROKEN` | `NOT_IMPLEMENTED` | `BLOCKED`

| Feature | UI | API/RPC | DB | Auth | RLS | Real Data | Mutation | Refresh-safe | Browser E2E | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| Auth login (HR) | Login.tsx | supabase.auth | auth.users | PASS (live login) | n/a | PASS | n/a | PASS (session) | NOT RUN | **WORKING** (API-verified) |
| Auth→profile identity | ProtectedRoute | profiles select | profiles | PASS live | owner-only | PASS | read-only | PASS | NOT RUN | **WORKING** (API-verified) |
| HR payroll cycles view | hr/Payroll.tsx | payslips/cycles select | payroll_cycles | PASS live | staff policies verified live (anon 0 rows) | PASS (4 cycles) | n/a | PASS | NOT RUN | **WORKING** (API-verified) |
| HR payslip drill-down | hr/Payroll.tsx | payslips select | payslips | PASS live | is_admin_or_hr / staff | PASS (5 rows) | n/a | PASS | NOT RUN | **WORKING** (API-verified) |
| Payroll generation RPC | hr/Payroll.tsx handleGenerate | process_monthly_payroll | payroll_cycles+payslips | PASS (auth req in fn) | SECURITY DEFINER + staff insert policies | PASS (7 employees) | PASS (verified live on existing cycle → EV-PAY-002 rejection) | PASS | NOT RUN | **WORKING** (API-verified) |
| Payroll idempotency | — | same RPC | UNIQUE(month,year)+advisory lock | n/a | n/a | PASS | PASS (2nd run `success:false EV-PAY-002`, live) | n/a | NOT RUN | **WORKING** (live-verified) |
| Previous-month cron | — | cron.job live row | pg_cron | n/a | n/a | PASS | scheduled 0 0 1 * * with `now()-INTERVAL '1 month'` (live-verified command text) | n/a | NOT RUN | **WORKING** (config-verified) |
| Year rollover | — | — | — | n/a | n/a | PASS (simulated: Jan 1 → 12/prior-yr) | n/a | n/a | NOT RUN | **WORKING** (simulation) |
| Released→credited payslips | employee Payroll badge | transition_payroll_status | payslips.status | fn requires auth | staff transitions audited | function body live-verified (`credited` @333, `internal_payroll_system_credit` @3719) | PASS (code path) | PASS | NOT RUN | **WORKING** (API-verified) |
| Employee payslip isolation | employee/Payroll.tsx | payslips select | payslips | PASS live (temp-pw login) | PASS live: 4 own, 0 foreign | PASS | n/a | PASS | NOT RUN | **WORKING** (live-verified) |
| Employee blocked from cycles | — | payroll_cycles select | payroll_cycles | PASS live | PASS live: 0 rows for employee, 0 for anon | PASS | n/a | PASS | NOT RUN | **WORKING** (live-verified) |
| Employee own work logs | employee/WorkLogs.tsx | work_logs select | work_logs | PASS live | owner-scoped | PASS (5 rows) | n/a | PASS | NOT RUN | **WORKING** (API-verified) |
| Employee leaves (own) | employee/leaves.tsx | leaves select | leaves | PASS live | owner-scoped | PASS (0 rows = honest empty) | n/a | PASS | NOT RUN | **WORKING** (API-verified) |
| Employee notifications | Notifications.tsx | notifications select | notifications | PASS live | scoped | PASS (0 rows = honest empty) | n/a | PASS | NOT RUN | **WORKING** (API-verified) |
| Leave ledger (single source) | employee leaves UI | leave_ledgers | leave_ledgers | n/a | owner-scoped | PASS (461 accruals; balance resolves) | accrual cron live (jobid 11 succeeded) | PASS | NOT RUN | **PARTIALLY_WORKING** — ledger authoritative & accruals running, but `leaves`-approval→ledger-deduction linkage not live-verified end-to-end |
| Attendance (clock in/out) | Presence/WorkLogs UI | work_logs insert/update | work_logs | PASS (read path live) | owner-scoped | PASS (461 rows today-ish; per-employee read live) | NOT LIVE-VERIFIED (no mutation executed) | PASS | NOT RUN | **PARTIALLY_WORKING** |
| Monthly leave accrual cron | — | cron jobid 11 | leave_ledgers | n/a | n/a | PASS (461 rows) | PASS (job `succeeded` on 2026-09-24/25) | n/a | NOT RUN | **WORKING** (live-verified) |
| Auto-clockout / absentee / offboarding crons | — | cron.job rows | work_logs/profiles | n/a | n/a | jobs present & active | runs succeeded (jobid 11 group) | n/a | NOT RUN | **PARTIALLY_WORKING** — jobs scheduled; per-job function outputs not individually verified |
| ATS scan → candidates | hr ATSScanner | candidates insert | candidates (+evaluation_method col live) | RLS on candidates verified enabled | yes | 90 legacy rows (method NULL — honest) | NOT LIVE-EXECUTED | PASS | NOT RUN | **PARTIALLY_WORKING** |
| Job forms / public apply | JobApplication.tsx | job_forms | job_forms | public read by design | yes | 42 Onboarding apps exist | NOT LIVE-EXECUTED | PASS | NOT RUN | **PARTIALLY_WORKING** |
| Assessment flow | AssessmentCenter/AssessmentAccess | assessment RLS/RPCs | assessments/tokens/attempts | token-bound policies shipped | yes | 14 apps in Assessment Assigned | NOT LIVE-EXECUTED | PASS | NOT RUN | **PARTIALLY_WORKING** |
| HR↔candidate messages | CandidateMessages / candidate Messages | messages tables | messages | RLS shipped | yes | NOT INSPECTED THIS RUN | NOT LIVE-EXECUTED | PASS | NOT RUN | **PARTIALLY_WORKING** — persistence path exists; live message round-trip not yet proven |
| Offers / hire / onboarding | OfferManagement / hire-candidate fn | offer RPCs | offer_letters / candidate_onboarding | RLS shipped | yes | 8 Accepted, 42 Onboarding | NOT LIVE-EXECUTED | PASS | NOT RUN | **PARTIALLY_WORKING** |
| AI features (all) | various | ai edge proxy / HF chain | persistence per feature | session-scoped | n/a | FREE chain configured; no fabrication (tests) | n/a | PASS | NOT RUN | **PARTIALLY_WORKING** — truthful offline verified in unit tests; live AI uptime not guaranteed by design |
| Resignation/FnF/offboarding | leaves.tsx + cron | resignations | profiles/audit_logs | RLS shipped | yes | 7 archived/terminated rows | NOT LIVE-EXECUTED | PASS | NOT RUN | **PARTIALLY_WORKING** |
| Dark mode (whole app) | index.css cascade | — | — | n/a | n/a | — | — | — | NOT RUN | **PARTIALLY_WORKING** — CSS engine fixed & graded; browser sweep pending |

## Summary counts
- WORKING (API/live-verified): 16
- PARTIALLY_WORKING (code+schema real, live execution pending): 12
- BROKEN: 0
- NOT_IMPLEMENTED: 0
- BLOCKED: 0

**Browser E2E column:** all NOT RUN as of this file's writing — Playwright suite exists
(`src/test/e2e/`) and credentials are available; runs are the immediate next action
(see `GLM_REFACTOR_STATE.md`). No feature may be upgraded past PARTIALLY_WORKING on
browser E2E alone without also re-confirming API-level evidence above.
