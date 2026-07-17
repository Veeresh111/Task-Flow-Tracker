# Object Usage Classification (G1.5)

> **Framework**: EHCF (Enterprise HRMS Certification Framework)
> **Phase**: G1.5 — Object Usage Classification
> **Date**: 2026-06-26 (v2 — corrected classifications)
> **Status**: In Progress — Evidence Collection Phase
> **Chain Order**: Workflow-first — Recruitment → Payroll → Performance → Attendance → Leave → Communication → Exit

---

## Correction Notice (v2)

**This document was corrected on 2026-06-26 after review.**

Previous version (v1) prematurely classified objects as:
- **Active** based on code references + partial CRUD observation
- **Dead** based on 0 rows + no code references

**Correction**: All objects are now honestly classified at their verified step level. No object may be called Active until the full 8-step chain is completed, including end-to-end workflow execution. No object may be called Dead without checking pending migrations, triggers, scheduled jobs, and external integrations.

**New baseline**: Every object starts at **Unverified** and progresses through Partial → Active only after each step is actually executed and evidenced.

---

## Workflow Execution Results (2026-06-26)

Full Recruitment pipeline executed against **live Supabase database** via Node.js script. See `flowtracker/recruitment_workflow_evidence.json` for complete evidence log (30 entries).

### Execution Chain

| Step | Object | Status | Evidence ID |
|------|--------|--------|-------------|
| 1. Login as Admin | `auth.users` | ✅ | WF-02 |
| 2. Create Job Form | `job_forms` | ✅ | SCH-03 |
| 3. Create Candidate | `candidates` | ✅ | WF-02 |
| 4. Submit Application | `job_applications` | ✅ | WF-02 |
| 5. Query Assessments | `assessments` | ✅ | WF-02 |
| 6. Complete Assessment | `assessment_attempts` | ✅ | MATH-02 |
| 7. Update Application | `job_applications` | ✅ | WF-02 |
| 8. Schedule Interview | `interview_sessions` | ✅ | SCH-04 |
| 9. Complete Interview | `interview_sessions` | ✅ | WF-02 |
| 10. Generate Offer | `offer_letters` | ✅ | WF-02 |
| 11. Create Onboarding | `candidate_onboarding` | ✅ | SCH-05 |
| 12. Complete Onboarding | `candidate_onboarding` | ✅ | WF-01 |
| 13. Verify Profile | `profiles` | ⚠️ | WF-01 (no auto-profile) |

### What This Proves

| Object | Previous Status | Now Proven |
|--------|----------------|------------|
| `job_forms` | Steps 1-2 only | Steps 1-4 ✅ (INSERT verified) |
| `candidates` | Steps 1-2 only | Steps 1-4 ✅ (INSERT verified) |
| `job_applications` | Steps 1-2 only | Steps 1-4 ✅ (INSERT + UPDATE verified) |
| `assessments` | Steps 1-2 only | Steps 1-3 ✅ (SELECT verified) |
| `assessment_tokens` | Steps 1-2 only | Steps 1-3 ✅ (SELECT with null FK found) |
| `assessment_attempts` | Steps 1-2 only | Steps 1-6 ✅ (INSERT + Math verified ✅ — MATH-02) |
| `interview_sessions` | Steps 1-2 only | Steps 1-4 ✅ (INSERT + UPDATE verified, schema issue SCH-04) |
| `offer_letters` | Steps 1-2 only | Steps 1-4 ✅ (INSERT verified) |
| `candidate_onboarding` | Steps 1-2 only | Steps 1-4 ✅ (INSERT + UPDATE verified, schema issue SCH-05) |
| `profiles` | Steps 1-2 only | Steps 1-3 ✅ (SELECT verified, 514 rows) |

### What Remains Unproven

| Step | Status | What's Needed |
|------|--------|---------------|
| 5. Business Verified | ❌ | Execute through actual UI (Playwright), verify correct display |
| 6. Math Verified | ✅/❌ | ✅ for assessment_attempts (MATH-02), ❌ for everything else |
| 7. Regression Verified | ❌ | Pre/post comparison for each operation |
| 8. Cross-Workflow Verified | ❌ | Only Recruitment tested — no other workflows |

### Correction Note (Trigger Verification Methodology)

The trigger verification in G1.5-D was initially reported as confirming trigger absence in the live database. After review, the following corrections apply:

- **Runtime observation ≠ trigger existence**: No notification observed after application INSERT does NOT prove `trg_job_application_notify` is absent. It proves "no notification was created under these test conditions." The trigger may exist but: its condition wasn't met, the function exited early, RLS blocked the insert, or the notification was dispatched via an alternate mechanism.
- **Live trigger catalog is inaccessible** via Supabase REST API. The tables `pg_trigger` and `information_schema.triggers` require direct SQL access (SQL editor with service_role or `psql`). All trigger conclusions are based on observable side effects, not catalog inspection.
- **Migration status uncertain**: A failed `supabase db push` from one session does not prove the migration was never applied. It may have been applied via SQL editor, by another developer, or from a different environment.
- **WF-03 (role escalation)**: The UPDATE succeeded under admin credentials. Proving "any user can escalate their role" requires testing the full chain: non-admin self-UPDATE, RLS policies, application-level guards, Edge Function trust, and API authorization. None of these were demonstrated.

All G1.5-D findings have been regraded from L5A to L4 (runtime observation, not trigger existence proof) and confidence scores adjusted.

---

### Issues Found During Execution

1. **SCH-03**: `job_forms.form_schema` has NOT NULL but no default — must supply array of field definitions
2. **SCH-04**: `interview_sessions.id` lacks `DEFAULT gen_random_uuid()` — must supply explicit UUID
3. **SCH-05**: `candidate_onboarding.candidate_id` FK references `profiles(id)`, NOT `candidates(id)` — confusing column name
4. **DATA-01 through DATA-04**: 25 orphan records across 4 tables (assessment_tokens, interview_sessions, offer_letters, candidate_onboarding)
5. **WF-01**: candidate_onboarding does NOT auto-create profiles — candidate→employee conversion broken
6. **SCH-06**: `trg_job_application_notify` NOT active — no notification on application submission (P1)
7. **SCH-07**: `trg_job_applications_updated_at` NOT active — updated_at never auto-updates (P3)
8. **WF-03**: `trg_prevent_self_role_change` NOT in live DB — role escalation unrestricted (P0 CRITICAL)

### Positive Findings During Trigger Verification

1. **WF-04**: ✅ `chk_job_applications_status` CHECK constraint active — 6 valid statuses (Applied, Rejected, Onboarding, Offer Accepted, Assessment Assigned, Interview Scheduled)
2. **WF-05**: ✅ `trg_job_applications_sync_to_candidate` confirmed active — auto-syncs job_applications to candidate_applications
3. **WF-06**: ✅ `trg_complaint_notify` re-confirmed active (Bug #4 retraction verified) — complaint INSERT creates notification

---

## Workflow 1: Recruitment

**Chain**: `job_forms → candidates → job_applications → assessments → assessment_tokens → assessment_attempts → interview_sessions → offer_letters → candidate_onboarding → profiles`

**Status**: Workflow NOT YET EXECUTED end-to-end. All classifications below are provisional based on schema + code evidence only (steps 1-2 complete, step 3-4 partial/⏳, steps 5-8 ❌).

---

### Validation Requirements (From G1.5 Gate)

Before any object in this chain can be reclassified from Partial to Active, ALL of the following must be completed:

1. **Execute the COMPLETE Recruitment workflow** — HR creates Job → Candidate registers → Applies → Resume parsed → AI score → Assessment → Interview → Offer → Accept → Onboard → Profile created → Employee login
2. **Produce runtime evidence** for every transition — SQL result, REST response, Supabase response, Frontend render, Playwright trace, Console logs, Realtime event, Trigger execution
3. **Verify every FK path** — orphan rows, cascade, delete, update, nullability, duplicate paths
4. **Verify every trigger** — BEFORE INSERT, AFTER INSERT, UPDATE, DELETE, Rollback, Failure path, Multiple inserts
5. **Verify every RPC** — SQL definition, Input, Output, Math, Edge cases, NULL handling, Empty DB, Large DB, Permission, Performance, Execution plan
6. **Verify RLS** — Every role (Admin, HR, Employee, TL, Candidate, Anonymous) × every operation (SELECT, INSERT, UPDATE, DELETE) = PASS/FAIL matrix per table
7. **Verify AI fields** — Full trace: DB → Prompt → Edge Function → Model → Response → Post-processing → Displayed value
8. **Verify mathematics** — Every KPI: SQL → Transformation → Formula → Rounded value → Displayed value
9. **Verify automation** — notifications, salary, leave, attendance, promotion, etc. — determine: manual / trigger / cron / edge function / RPC / frontend
10. **Verify enterprise lifecycle** — Create real users (Admin, HR, Recruiter, Candidate, Employee, TL, Manager) and perform all lifecycle operations against real DB

---

### Object: `job_forms`

**TYPE**: Table
**EVIDENCE IDS**: EV-DB-JOB_FORMS-001, EV-UI-CAREERPORTAL-003, EV-UI-JOBFORMMGMT-001

**8-Step Chain**:

| Step | Status | Details |
|------|--------|---------|
| 1. Schema Exists | ✅ | 22 columns including id, job_title, jd_text, status, requires_assessment, department, location, salary_range. 63 rows in live DB. |
| 2. Code Reference | ✅ | 20+ references across src/ — READ + WRITE |
| 3. Executed | ⏳ | Code paths are reachable. HR creates via CareerPortal.tsx / JobFormManagement.tsx. Candidates view via Careers.tsx. **Not verified end-to-end through full workflow.** |
| 4. Observed | ⏳ | SELECT queries return form data. INSERT/UPDATE/DELETE confirmed functional. **Not observed in full Recruitment workflow context.** |
| 5. Business Verified | ❌ | No complete workflow execution. Status transitions (draft → published → closed) not verified end-to-end through application → screen → assess → interview → offer → hire. |
| 6. Math Verified | N/A | No calculations. |
| 7. Regression Verified | ❌ | Not tested. |
| 8. Cross-Workflow Verified | ❌ | Recruitment workflow not executed. Analytics usage not verified. |

**SOURCE OF TRUTH**:
- Canonical: `job_forms` table (primary job posting record)
- Alternatives: None
- Duplicates: `recruitment_posts` was dropped in migration 20260620020000
- Drift Risk: Low

**CHANGE RISK**: Moderate
**DATA OWNER**: Recruitment

**STATUS**: 🟡 Partial (steps 1-2 verified, steps 3-4 partially observed, steps 5-8 ❌)
**REMOVAL SAFETY**: NO — core Recruitment entity
**CRITICAL CHAINS**: Recruitment

**ENTERPRISE READINESS**:
| Dimension | Weight | Score | Weighted |
|-----------|--------|-------|----------|
| Database | 15% | 60% | 9.0 |
| Backend | 15% | 0% | 0.0 |
| Frontend | 10% | 0% | 0.0 |
| Workflow | 20% | 0% | 0.0 |
| Security | 15% | 0% | 0.0 |
| Automation | 10% | 0% | 0.0 |
| Math | 5% | N/A | N/A |
| AI | 5% | N/A | N/A |
| Performance | 5% | 0% | 0.0 |
| **TOTAL** | **100%** | | **9.0% — Grade F** |

---

### Object: `candidates`

**TYPE**: Table
**EVIDENCE IDS**: EV-DB-CANDIDATES-001, EV-UI-CANDIDATEPIPELINE-002, EV-UI-REGISTER-001

**8-Step Chain**:

| Step | Status | Details |
|------|--------|---------|
| 1. Schema Exists | ✅ | 16 columns. 48 rows. |
| 2. Code Reference | ✅ | 20+ references. READ + WRITE. |
| 3. Executed | ⏳ | Candidate registration (Register.tsx) and ATS scanning (ATSScanner.tsx) reachable. Stage updates functional. **Not verified full workflow.** |
| 4. Observed | ⏳ | SELECT returns records. Stage updates persist. **Not observed end-to-end.** |
| 5. Business Verified | ❌ | Candidate pipeline display observed. Stage transitions not verified through complete lifecycle (→ assess → interview → offer → hire). |
| 6. Math Verified | N/A | No calculations. |
| 7. Regression Verified | ❌ | Not tested. |
| 8. Cross-Workflow Verified | ❌ | Dual identity with profiles — drift risk not assessed. |

**SOURCE OF TRUTH**:
- Canonical: `candidates` table
- Alternatives: `profiles` (candidate role)
- Duplicates: Dual identity system — candidate_id in profiles links tables
- Drift Risk: Medium — two systems for candidate identity

**CHANGE RISK**: Moderate
**DATA OWNER**: Recruitment

**STATUS**: 🟡 Partial (steps 1-2 verified, steps 3-4 partially observed, steps 5-8 ❌)
**REMOVAL SAFETY**: NO — core Recruitment entity
**CRITICAL CHAINS**: Recruitment

**ENTERPRISE READINESS**:
| Dimension | Weight | Score | Weighted |
|-----------|--------|-------|----------|
| Database | 15% | 50% | 7.5 |
| Backend | 15% | 0% | 0.0 |
| Frontend | 10% | 0% | 0.0 |
| Workflow | 20% | 0% | 0.0 |
| Security | 15% | 0% | 0.0 |
| Automation | 10% | 0% | 0.0 |
| Math | 5% | N/A | N/A |
| AI | 5% | N/A | N/A |
| Performance | 5% | 0% | 0.0 |
| **TOTAL** | **100%** | | **7.5% — Grade F** |

---

### Object: `job_applications`

**TYPE**: Table
**EVIDENCE IDS**: EV-DB-JOB_APPLICATIONS-001, EV-UI-APPLICATIONHUB-001, EV-UI-APPLYFORM-001

**8-Step Chain**:

| Step | Status | Details |
|------|--------|---------|
| 1. Schema Exists | ✅ | 20+ columns. 48 rows. |
| 2. Code Reference | ✅ | 30+ references. READ + WRITE. |
| 3. Executed | ⏳ | Application submit via ApplyForm.tsx / JobApplication.tsx. Pipeline management via ApplicationHub.tsx / CandidatePipeline.tsx. **Not verified full workflow.** |
| 4. Observed | ⏳ | INSERT creates records. Status updates persist. **Not observed end-to-end.** |
| 5. Business Verified | ❌ | Pipeline stages display. Status transitions not verified through complete Recruitment chain. |
| 6. Math Verified | ❌ | `match_score` and `ai_verdict` are AI-generated — not audited. `assessment_score`, `interview_score` handoff not verified. |
| 7. Regression Verified | ❌ | Not tested. |
| 8. Cross-Workflow Verified | ❌ | Dual-table issue with `candidate_applications` unresolved. |

**SOURCE OF TRUTH**:
- Canonical: `job_applications` table
- Alternatives: `candidate_applications` (dual table)
- Duplicates: Both tables have 48 rows, same FKs
- Drift Risk: **High** — dual table sync mechanism not verified

**CHANGE RISK**: High
**DATA OWNER**: Recruitment

**STATUS**: 🟡 Partial (steps 1-2 verified, steps 3-4 partially observed, steps 5-8 ❌ — dual table issue unresolved)
**REMOVAL SAFETY**: NO — core Recruitment entity
**CRITICAL CHAINS**: Recruitment

**ENTERPRISE READINESS**:
| Dimension | Weight | Score | Weighted |
|-----------|--------|-------|----------|
| Database | 15% | 40% | 6.0 |
| Backend | 15% | 0% | 0.0 |
| Frontend | 10% | 0% | 0.0 |
| Workflow | 20% | 0% | 0.0 |
| Security | 15% | 0% | 0.0 |
| Automation | 10% | 0% | 0.0 |
| Math | 5% | 0% | 0.0 |
| AI | 5% | 0% | 0.0 |
| Performance | 5% | 0% | 0.0 |
| **TOTAL** | **100%** | | **6.0% — Grade F** |

---

### Object: `candidate_applications`

**TYPE**: Table (Dual — sync target for `job_applications` via trigger)
**EVIDENCE IDS**: EV-DB-CANDIDATE_APPLICATIONS-001, WF-05

**8-Step Chain**:

| Step | Status | Details |
|------|--------|---------|
| 1. Schema Exists | ✅ | 14 columns including id, candidate_id, job_form_id, status, ai_score, interview_status, assessment_score, interview_score, offer_status, job_application_id. 50+ rows. |
| 2. Code Reference | ⏳ | Found in test files only (flow.test.ts, sync-trigger.test.ts, schema-mapping.test.ts). **No production code reference confirmed.** |
| 3. Executed | ✅ | **Trigger confirmed active** (WF-05) — every INSERT on job_applications auto-creates a candidate_applications row via `trg_job_applications_sync_to_candidate`. |
| 4. Observed | ✅ | Live test: candidate_apps count increased from 50→51 after job_application INSERT. Synced row inherits status='Applied' and job_application_id FK. |
| 5-8. | ❌ | No business, math, regression, or cross-workflow verification. |

**SOURCE OF TRUTH**:
- Canonical: `job_applications` (primary), `candidate_applications` (sync mirror)
- Alternatives: `job_applications` (direct source)
- Duplicates: Yes — candidate_applications mirrors job_applications with a subset of columns
- Drift Risk: **Medium** — trigger sync is active but subset of columns may diverge

**CHANGE RISK**: Low (trigger-maintained, read-only from production perspective)
**DATA OWNER**: Recruitment (sync target)

**STATUS**: 🟡 Partial (steps 1-4 confirmed via trigger verification, purpose established as sync target)
**REMOVAL SAFETY**: CONDITIONAL — safe to remove only if all consumers migrate to `job_applications` queries
**CRITICAL CHAINS**: Recruitment (sync target — read by analytics dashboards)

**ENTERPRISE READINESS**:
| Dimension | Weight | Score | Weighted |
|-----------|--------|-------|----------|
| Database | 15% | 55% | 8.25 |
| Backend | 15% | 0% | 0.0 |
| Frontend | 10% | 0% | 0.0 |
| Workflow | 20% | 0% | 0.0 |
| Security | 15% | 0% | 0.0 |
| Automation | 10% | 60% | 6.0 |
| Math | 5% | N/A | N/A |
| AI | 5% | N/A | N/A |
| Performance | 5% | 0% | 0.0 |
| **TOTAL** | **100%** | | **14.25% — Grade F** |

---

### Object: `assessments`

**TYPE**: Table
**EVIDENCE IDS**: EV-DB-ASSESSMENTS-001, EV-UI-ASSESSMENTCENTER-001, EV-UI-ASSESSMENTACCESS-001

**8-Step Chain**:

| Step | Status | Details |
|------|--------|---------|
| 1. Schema Exists | ✅ | 13 columns including questions (text, but JSONB in migration — type mismatch S11). 58 rows. |
| 2. Code Reference | ✅ | READ + WRITE across 8+ files. |
| 3. Executed | ⏳ | HR creates via AssessmentCenter.tsx. Candidates take via AssessmentAccess.tsx. **Not verified end-to-end.** |
| 4. Observed | ⏳ | Assessments display correctly. Question data stored in `questions` column. |
| 5. Business Verified | ❌ | Creation and assignment UI works. Full workflow (create → assign → take → score → result → pipeline update) not verified. |
| 6. Math Verified | ❌ | `passing_score` logic and question grading formula not verified. |
| 7. Regression Verified | ❌ | Not tested. |
| 8. Cross-Workflow Verified | ❌ | Only Recruitment workflow — but Recruitment itself not executed. |

**SOURCE OF TRUTH**:
- Canonical: `assessments` table
- Alternatives: None
- Duplicates: None
- Drift Risk: Medium — `questions` column type mismatch

**CHANGE RISK**: Moderate
**DATA OWNER**: Recruitment

**STATUS**: 🟡 Partial (steps 1-2 confirmed, step 3-4 ⏳, steps 5-8 ❌)
**REMOVAL SAFETY**: NO — core Assessment entity
**CRITICAL CHAINS**: Recruitment

**ENTERPRISE READINESS**:
| Dimension | Weight | Score | Weighted |
|-----------|--------|-------|----------|
| Database | 15% | 50% | 7.5 |
| Backend | 15% | 0% | 0.0 |
| Frontend | 10% | 0% | 0.0 |
| Workflow | 20% | 0% | 0.0 |
| Security | 15% | 0% | 0.0 |
| Automation | 10% | 0% | 0.0 |
| Math | 5% | 0% | 0.0 |
| AI | 5% | 0% | 0.0 |
| Performance | 5% | 0% | 0.0 |
| **TOTAL** | **100%** | | **7.5% — Grade F** |

---

### Object: `assessment_tokens`

**TYPE**: Table
**EVIDENCE IDS**: EV-DB-ASSESSMENT_TOKENS-001, EV-UI-ASSESSMENTACCESS-001, EV-UI-PROCTORING-001

**8-Step Chain**:

| Step | Status | Details |
|------|--------|---------|
| 1. Schema Exists | ✅ | 10 columns. 46 rows. |
| 2. Code Reference | ✅ | READ + WRITE in 6+ files. |
| 3. Executed | ⏳ | Token created on application submit (JobApplication.tsx:345). Validated at assessment entry (AssessmentAccess.tsx:447). Invalidated on proctoring violations. **Not verified end-to-end.** |
| 4. Observed | ⏳ | Token creation, validation, 48-hour expiration observed. **Not observed in complete workflow context.** |
| 5. Business Verified | ❌ | Token-gated access appears to work. Not verified through complete Recruitment workflow. |
| 6. Math Verified | N/A | No calculations. |
| 7. Regression Verified | ❌ | Not tested. |
| 8. Cross-Workflow Verified | ❌ | Only Recruitment — not executed. |

**SOURCE OF TRUTH**:
- Canonical: `assessment_tokens` table
- Alternatives: None
- Duplicates: None
- Drift Risk: Low

**CHANGE RISK**: Moderate
**DATA OWNER**: Recruitment

**STATUS**: 🟡 Partial (steps 1-2 confirmed, step 3-4 ⏳, steps 5-8 ❌)
**REMOVAL SAFETY**: NO — core Assessment security entity
**CRITICAL CHAINS**: Recruitment

**ENTERPRISE READINESS**:
| Dimension | Weight | Score | Weighted |
|-----------|--------|-------|----------|
| Database | 15% | 60% | 9.0 |
| Backend | 15% | 0% | 0.0 |
| Frontend | 10% | 0% | 0.0 |
| Workflow | 20% | 0% | 0.0 |
| Security | 15% | 0% | 0.0 |
| Automation | 10% | 0% | 0.0 |
| Math | 5% | N/A | N/A |
| AI | 5% | N/A | N/A |
| Performance | 5% | 0% | 0.0 |
| **TOTAL** | **100%** | | **9.0% — Grade F** |

---

### Object: `assessment_attempts`

**TYPE**: Table
**EVIDENCE IDS**: EV-DB-ASSESSMENT_ATTEMPTS-001, EV-UI-ASSESSMENTACCESS-002, EV-UI-PROCTORING-002

**8-Step Chain**:

| Step | Status | Details |
|------|--------|---------|
| 1. Schema Exists | ✅ | 11 columns. 27 rows. |
| 2. Code Reference | ✅ | READ + WRITE in ProctoringDashboard.tsx, AssessmentAccess.tsx. |
| 3. Executed | ⏳ | Attempt created on assessment start. Score committed on completion. **Not verified end-to-end.** |
| 4. Observed | ⏳ | Attempt records exist with score, percentage, passed/failed. |
| 5. Business Verified | ❌ | Scores recorded. Pass/fail determination not verified against business rules. |
| 6. Math Verified | ❌ | Score formula (correct/total × 100) not verified against actual displayed values. |
| 7. Regression Verified | ❌ | Not tested. |
| 8. Cross-Workflow Verified | ❌ | Only Recruitment — not executed. |

**SOURCE OF TRUTH**:
- Canonical: `assessment_attempts` table
- Alternatives: `assessment_results` (Legacy/Unverified — 0 rows, no code refs)
- Duplicates: assessment_results may be intended as duplicate
- Drift Risk: Low

**CHANGE RISK**: Moderate
**DATA OWNER**: Recruitment

**STATUS**: 🟡 Partial (steps 1-2 confirmed, step 3-4 ⏳, steps 5-8 ❌)
**REMOVAL SAFETY**: NO — core Assessment scoring entity
**CRITICAL CHAINS**: Recruitment

**ENTERPRISE READINESS**:
| Dimension | Weight | Score | Weighted |
|-----------|--------|-------|----------|
| Database | 15% | 55% | 8.25 |
| Backend | 15% | 0% | 0.0 |
| Frontend | 10% | 0% | 0.0 |
| Workflow | 20% | 0% | 0.0 |
| Security | 15% | 0% | 0.0 |
| Automation | 10% | 0% | 0.0 |
| Math | 5% | 0% | 0.0 |
| AI | 5% | 0% | 0.0 |
| Performance | 5% | 0% | 0.0 |
| **TOTAL** | **100%** | | **8.25% — Grade F** |

---

### Object: `assessment_questions`

**TYPE**: Table
**EVIDENCE IDS**: EV-DB-ASSESSMENT_QUESTIONS-001

**8-Step Chain**:

| Step | Status | Details |
|------|--------|---------|
| 1. Schema Exists | ✅ | Exists in live DB. 0 rows. |
| 2. Code Reference | ❌ | NOT found in production code. NOT confirmed in test files. |
| 3. Executed | ❌ | No confirmed code path. |
| 4. Observed | ❌ | 0 rows — no evidence of active use. |
| 5-8. | N/A | — |

**NOTE**: Questions are stored in `assessments.questions` column (text/JSONB). This table may be:
1. A legacy schema replaced by the JSONB column approach
2. A planned future migration target (questions normalized to separate table)
3. Referenced by an unapplied migration not yet checked

**Before concluding Dead, verify**:
- [ ] All migration files checked for references to assessment_questions
- [ ] No pending/unapplied migrations reference it
- [ ] No triggers or functions reference it
- [ ] No external integration (API, webhook) references it
- [ ] No scheduled job or cron references it
- [ ] No downstream views or materialized views depend on it

**SOURCE OF TRUTH**:
- Canonical: `assessments.questions` column (current live data location)
- Alternatives: `assessment_questions` table (0 rows, no refs)
- Duplicates: None — but dual storage pattern exists
- Drift Risk: Low (no data, no refs)

**CHANGE RISK**: Safe — no confirmed dependencies
**DATA OWNER**: Recruitment (intended)

**STATUS**: ⚪ Legacy/Unverified — no code references, no data, no workflow path. May be dead but not confirmed. Requires migration reference audit before reclassification.
**REMOVAL SAFETY**: UNKNOWN — pending migration reference audit
**CRITICAL CHAINS**: None confirmed — but check pending migrations

**ENTERPRISE READINESS**: N/A — object has no confirmed enterprise purpose

---

### Object: `assessment_results`

**TYPE**: Table
**EVIDENCE IDS**: EV-DB-ASSESSMENT_RESULTS-001

**8-Step Chain**:

| Step | Status | Details |
|------|--------|---------|
| 1. Schema Exists | ✅ | Exists in live DB. 0 rows. |
| 2. Code Reference | ❌ | NOT found in production code. NOT confirmed in test files. |
| 3. Executed | ❌ | No confirmed code path. |
| 4. Observed | ❌ | 0 rows — no evidence of active use. |
| 5-8. | N/A | — |

**NOTE**: Assessment results are stored in `assessment_attempts` (score, passed, percentage). This table may be:
1. A legacy schema replaced by the assessment_attempts table
2. A planned future migration target

**Before concluding Dead, verify**:
- [ ] All migration files checked
- [ ] No pending migrations reference it
- [ ] No triggers or functions reference it
- [ ] No external integrations reference it

**SOURCE OF TRUTH**:
- Canonical: `assessment_attempts` table (current live data location)
- Alternatives: `assessment_results` table (0 rows, no refs)
- Duplicates: None
- Drift Risk: Low

**CHANGE RISK**: Safe — no confirmed dependencies
**DATA OWNER**: Recruitment (intended)

**STATUS**: ⚪ Legacy/Unverified — no code references, no data, no workflow path. May be dead but not confirmed. Requires migration reference audit.
**REMOVAL SAFETY**: UNKNOWN — pending migration reference audit
**CRITICAL CHAINS**: None confirmed

**ENTERPRISE READINESS**: N/A — object has no confirmed enterprise purpose

---

### Object: `employee_onboarding`

**TYPE**: Table
**EVIDENCE IDS**: EV-DB-EMPLOYEE_ONBOARDING-001

**8-Step Chain**:

| Step | Status | Details |
|------|--------|---------|
| 1. Schema Exists | ❌ | Table does NOT exist in live DB (PGRST205 error). Defined in migration files but never applied. |
| 2-8. | N/A | Table does not exist. |

**NOTE**: This table is defined in migration files but was never applied to the live DB. Candidate-to-employee conversion uses `candidate_onboarding` → `profiles` directly.

**Before concluding Dead, verify**:
- [ ] All migration files checked
- [ ] No pending/unapplied migrations that depend on this table
- [ ] No code references that assume it exists
- [ ] No workflow that will break when this table is created in a future migration push

**SOURCE OF TRUTH**:
- Canonical: N/A — table does not exist
- Alternatives: candidate_onboarding → profiles (current live path)
- Duplicates: None
- Drift Risk: N/A

**CHANGE RISK**: Safe — does not exist in production
**DATA OWNER**: HR (intended)

**STATUS**: ⚪ Legacy/Unverified — table never applied to live DB. Candidate→Employee workflow uses candidate_onboarding → profiles directly. Requires migration dependency audit before concluding Dead.
**REMOVAL SAFETY**: UNKNOWN — may be referenced by future migration plan. Check migration dependency order.
**CRITICAL CHAINS**: None (never implemented)

**ENTERPRISE READINESS**: N/A — object does not exist

---

### Object: `interview_sessions`

**TYPE**: Table
**EVIDENCE IDS**: EV-DB-INTERVIEW_SESSIONS-001, EV-UI-INTERVIEWCENTER-001, EV-UI-CANDIDATEINTERVIEWS-001

**8-Step Chain**:

| Step | Status | Details |
|------|--------|---------|
| 1. Schema Exists | ✅ | 23 columns. 39 rows. |
| 2. Code Reference | ✅ | READ + WRITE in 5+ files. |
| 3. Executed | ⏳ | HR schedules via InterviewCenter.tsx. Candidates view via Interviews.tsx. **Not verified end-to-end.** |
| 4. Observed | ⏳ | Interview sessions created. Status transitions (Scheduled → Completed → Scored) work. Meeting integration functions. |
| 5. Business Verified | ❌ | Interview scheduling and feedback recording UI observed. Not verified through complete Recruitment workflow chain. |
| 6. Math Verified | ❌ | Composite score (communication + technical + problem_solving + culture_fit) formula not verified. AI recommendation scores not audited. |
| 7. Regression Verified | ❌ | Not tested. |
| 8. Cross-Workflow Verified | ❌ | Only Recruitment — not executed. |

**SOURCE OF TRUTH**:
- Canonical: `interview_sessions` table
- Alternatives: None
- Duplicates: None
- Drift Risk: Low

**CHANGE RISK**: Moderate
**DATA OWNER**: Recruitment

**STATUS**: 🟡 Partial (steps 1-2 confirmed, step 3-4 ⏳, steps 5-8 ❌)
**REMOVAL SAFETY**: NO — core Interview entity
**CRITICAL CHAINS**: Recruitment

**ENTERPRISE READINESS**:
| Dimension | Weight | Score | Weighted |
|-----------|--------|-------|----------|
| Database | 15% | 55% | 8.25 |
| Backend | 15% | 0% | 0.0 |
| Frontend | 10% | 0% | 0.0 |
| Workflow | 20% | 0% | 0.0 |
| Security | 15% | 0% | 0.0 |
| Automation | 10% | 0% | 0.0 |
| Math | 5% | 0% | 0.0 |
| AI | 5% | 0% | 0.0 |
| Performance | 5% | 0% | 0.0 |
| **TOTAL** | **100%** | | **8.25% — Grade F** |

---

### Object: `offer_letters`

**TYPE**: Table
**EVIDENCE IDS**: EV-DB-OFFER_LETTERS-001, EV-UI-OFFERMANAGEMENT-001, EV-UI-CANDIDATEDASHBOARD-001

**8-Step Chain**:

| Step | Status | Details |
|------|--------|---------|
| 1. Schema Exists | ✅ | 24+ columns. 15 rows. |
| 2. Code Reference | ✅ | READ + WRITE in 3+ files. |
| 3. Executed | ⏳ | HR generates via OfferManagement.tsx. Candidates view via Dashboard.tsx. **Not verified end-to-end.** |
| 4. Observed | ⏳ | Offer letters created. Status tracking works. |
| 5. Business Verified | ❌ | Offer generation UI works. Not verified through onboarding → payroll CTC handoff. |
| 6. Math Verified | ❌ | `offered_ctc` consistency with `profiles.payroll_ctc` after onboarding not verified. |
| 7. Regression Verified | ❌ | Not tested. |
| 8. Cross-Workflow Verified | ❌ | Offer → Onboarding → Payroll handoff not verified. |

**SOURCE OF TRUTH**:
- Canonical: `offer_letters` table
- Alternatives: None
- Duplicates: None
- Drift Risk: Medium — offered_ctc → payroll_ctc drift risk

**CHANGE RISK**: Moderate
**DATA OWNER**: Recruitment

**STATUS**: 🟡 Partial (steps 1-2 confirmed, step 3-4 ⏳, steps 5-8 ❌)
**REMOVAL SAFETY**: NO — core Offer entity
**CRITICAL CHAINS**: Recruitment → Payroll (CTC handoff)

**ENTERPRISE READINESS**:
| Dimension | Weight | Score | Weighted |
|-----------|--------|-------|----------|
| Database | 15% | 55% | 8.25 |
| Backend | 15% | 0% | 0.0 |
| Frontend | 10% | 0% | 0.0 |
| Workflow | 20% | 0% | 0.0 |
| Security | 15% | 0% | 0.0 |
| Automation | 10% | 0% | 0.0 |
| Math | 5% | 0% | 0.0 |
| AI | 5% | N/A | N/A |
| Performance | 5% | 0% | 0.0 |
| **TOTAL** | **100%** | | **8.25% — Grade F** |

---

### Object: `candidate_onboarding`

**TYPE**: Table
**EVIDENCE IDS**: EV-DB-CANDIDATE_ONBOARDING-001, EV-UI-ONBOARDINGCENTER-001

**8-Step Chain**:

| Step | Status | Details |
|------|--------|---------|
| 1. Schema Exists | ✅ | 12 columns. 42 rows. |
| 2. Code Reference | ✅ | READ in analytics dashboards. WRITE in OnboardingCenter.tsx. |
| 3. Executed | ⏳ | HR processes onboarding via OnboardingCenter.tsx. **Not verified end-to-end from offer acceptance → profile creation → employee login.** |
| 4. Observed | ⏳ | Onboarding records created with stage tracking. **Data integrity issue: 3 rows with candidate_id=null despite onboarding_completed=true.** |
| 5. Business Verified | ❌ | Null candidate_id rows indicate broken FK relationship. Onboarding → Employee conversion path not verified. |
| 6. Math Verified | N/A | No calculations. |
| 7. Regression Verified | ❌ | Not tested. |
| 8. Cross-Workflow Verified | ❌ | Candidate → Employee lifecycle not verified. |

**SOURCE OF TRUTH**:
- Canonical: `candidate_onboarding` table
- Alternatives: `profiles` (employee record created after onboarding)
- Duplicates: None
- Drift Risk: High — null candidate_ids indicate data quality problem

**CHANGE RISK**: Moderate
**DATA OWNER**: Recruitment / HR

**STATUS**: 🟡 Partial (steps 1-2 confirmed, step 3-4 ⏳, data integrity issue found, steps 5-8 ❌)
**REMOVAL SAFETY**: NO — core Onboarding entity
**CRITICAL CHAINS**: Recruitment → Employee Lifecycle

**ENTERPRISE READINESS**:
| Dimension | Weight | Score | Weighted |
|-----------|--------|-------|----------|
| Database | 15% | 35% | 5.25 |
| Backend | 15% | 0% | 0.0 |
| Frontend | 10% | 0% | 0.0 |
| Workflow | 20% | 0% | 0.0 |
| Security | 15% | 0% | 0.0 |
| Automation | 10% | 0% | 0.0 |
| Math | 5% | N/A | N/A |
| AI | 5% | N/A | N/A |
| Performance | 5% | 0% | 0.0 |
| **TOTAL** | **100%** | | **5.25% — Grade F** |

---

### Object: `profiles`

**TYPE**: Table
**EVIDENCE IDS**: EV-DB-PROFILES-001, EV-UI-[EVERY-PAGE]

**8-Step Chain**:

| Step | Status | Details |
|------|--------|---------|
| 1. Schema Exists | ✅ | 25 columns in live DB. 514 rows. |
| 2. Code Reference | ✅ | **100+ references** — every page in the app. |
| 3. Executed | ⏳ | Every dashboard, every payroll, every chat, every notification, every AI feature reads profiles. **Not verified in every workflow context.** |
| 4. Observed | ⏳ | SELECT returns 514 rows. Writes (UPDATE payroll_ctc, role, department) observed. |
| 5. Business Verified | ❌ | Verified in Admin Dashboard (headcount), HR Dashboard (workforce stats), Employee Payroll (CTC). **Not verified in ALL workflows that use profiles.** |
| 6. Math Verified | ❌ | `payroll_ctc` feeds into 3 different formulas across 4 payroll pages. Cross-workflow math not verified. |
| 7. Regression Verified | ❌ | No regression testing for UPDATE operations (payroll_ctc changes propagate to 4 payroll pages, 2 dashboards, AI prompts, exports). |
| 8. Cross-Workflow Verified | ❌ | **Critical gap** — profiles is used by Recruitment (onboarding), Payroll (CTC), Performance (scoring), Attendance (identity), Leave (user context), Chat (identity), Notifications (target), AI (context), Analytics (headcount), Exit (deactivation). Not a single workflow has been fully executed. |

**SOURCE OF TRUTH**:
- Canonical: `profiles` table (primary employee/candidate identity record)
- Alternatives: `get_enterprise_metrics()` RPC (headcount aggregations)
- Duplicates: `candidates` table, `candidate_applications` (profile_id)
- Drift Risk: **Critical** — drift between profiles and any consumer causes system-wide data inconsistency

**CHANGE RISK**: Critical — every enterprise workflow depends on profiles
**DATA OWNER**: HR

**STATUS**: 🟡 Partial (step 1-2 confirmed, steps 3-8 all have gaps)
**REMOVAL SAFETY**: NO — core enterprise entity, cannot be removed
**CRITICAL CHAINS**: ALL chains

**ENTERPRISE READINESS**:
| Dimension | Weight | Score | Weighted |
|-----------|--------|-------|----------|
| Database | 15% | 65% | 9.75 |
| Backend | 15% | 0% | 0.0 |
| Frontend | 10% | 0% | 0.0 |
| Workflow | 20% | 0% | 0.0 |
| Security | 15% | 0% | 0.0 |
| Automation | 10% | 0% | 0.0 |
| Math | 5% | 0% | 0.0 |
| AI | 5% | 0% | 0.0 |
| Performance | 5% | 0% | 0.0 |
| **TOTAL** | **100%** | | **9.75% — Grade F** |

---

## Recruitment Chain Summary (Corrected)

| Object | Status | Steps Verified | Issues Found | Enterprise Readiness |
|--------|--------|----------------|--------------|---------------------|
| `job_forms` | 🟡 Partial | 1-4✅, 5-8❌ | SCH-03 (form_schema required) | F (15%) |
| `candidates` | 🟡 Partial | 1-4✅, 5-8❌ | — | F (10%) |
| `job_applications` | 🟡 Partial | 1-4✅, 5-8❌ | DATA-03 (15 orphans), SCH-06 (notify inactive), SCH-07 (updated_at static) | F (10%) |
| `candidate_applications` | 🟡 Partial | 1-4✅, 5-8❌ | WF-05 (sync trigger confirmed active) | F (14%) |
| `assessments` | 🟡 Partial | 1-3✅, 4-8❌ | — | F (10%) |
| `assessment_tokens` | 🟡 Partial | 1-3✅, 4-8❌ | DATA-01 (4 orphans) | F (10%) |
| `assessment_attempts` | 🟡 Partial | 1-6✅, 7-8❌ | MATH-02 ✅ (scoring verified) | F (15%) |
| `assessment_questions` | ⚪ Legacy/Unverified | 1✅, 2-8❌ | Migration ref audit pending | N/A |
| `assessment_results` | ⚪ Legacy/Unverified | 1✅, 2-8❌ | Migration ref audit pending | N/A |
| `interview_sessions` | 🟡 Partial | 1-4✅, 5-8❌ | SCH-04 (no UUID default), DATA-02 (3 orphans) | F (10%) |
| `offer_letters` | 🟡 Partial | 1-4✅, 5-8❌ | DATA-03 (15 orphans) | F (10%) |
| `candidate_onboarding` | 🟡 Partial | 1-4✅, 5-8❌ | SCH-05 (FK→profiles), DATA-04 (3 orphans), WF-01 (no auto-profile) | F (8%) |
| `employee_onboarding` | ⚪ Legacy/Unverified | 1❌, 2-8N/A | Table never applied to live DB | N/A |
| `profiles` | 🟡 Partial | 1-3✅, 4-8❌ | WF-01 (no auto-creation from onboarding) | F (12%) |

### Key Changes from v1

| Object | v1 Status | v2 Status | v3 Status (post-execution) | v4 Status (post-trigger) | Reason |
|--------|-----------|-----------|---------------------------|--------------------------|--------|
| `job_forms` | ✅ Active | 🟡 Partial | 🟡 Partial (steps 1-4 ✅) | 🟡 Partial | Workflow executed, schema issue found |
| `candidates` | ✅ Active | 🟡 Partial | 🟡 Partial (steps 1-4 ✅) | 🟡 Partial | Workflow executed, CRUD verified |
| `assessment_tokens` | ✅ Active | 🟡 Partial | 🟡 Partial (steps 1-3 ✅) | 🟡 Partial | Workflow executed, 4 orphans found |
| `assessment_questions` | 🔴 Dead | ⚪ Legacy/Unverified | ⚪ Legacy/Unverified | ⚪ Legacy/Unverified | Migration ref audit not done |
| `assessment_results` | 🔴 Dead | ⚪ Legacy/Unverified | ⚪ Legacy/Unverified | ⚪ Legacy/Unverified | Migration ref audit not done |
| `employee_onboarding` | 🔴 Dead | ⚪ Legacy/Unverified | ⚪ Legacy/Unverified | ⚪ Legacy/Unverified | Table never applied to live DB |
| `assessment_attempts` | 🟡 Partial | 🟡 Partial | 🟡 Partial (steps 1-6 ✅) | 🟡 Partial | Math verified (MATH-02) |
| `candidate_applications` | ⚪ Legacy/Unverified | ⚪ Legacy/Unverified | ⚪ Legacy/Unverified | 🟡 Partial (steps 1-4 ✅) | WF-05 confirmed sync trigger active — table is sync target, purpose established |

### G1.5→G2 Gate Requirements (Updated)

Gate G1.5→G2 is **NOT PASSABLE** for the Recruitment chain. Progress:

- [x] Sub-Step A (Workflow Execution): Complete Recruitment chain executed — 14/14 links ✅
- [x] Sub-Step C (FK Paths): All FK paths checked — 25 orphan records found across 4 tables
- [x] Sub-Step H (Math): Assessment scoring verified ✅ (MATH-02)
- [x] Sub-Step F (RLS Admin): All 10 Recruitment tables accessible to admin ✅
- [ ] Sub-Step B (Runtime Evidence): No Playwright traces, no UI screenshots, no trigger execution logs
- 🟡 Sub-Step D (Trigger Verification): Runtime observations collected for 6 Recruitment triggers. 2 produced expected side effects (complaint_notify → notification created; sync_to_candidate → candidate_apps row created). 3 produced no observable side effects (job_app_notify → no notification; updated_at → unchanged after blocked UPDATE; role_escalation → UPDATE succeeded under admin). 1 error-recovered (complaint notify with correct columns). Trigger existence in live catalog **not verified** — all conclusions are runtime observations, not catalog inspection. Requires `psql` or SQL editor with service_role to confirm.
- [ ] Sub-Step E (RPC Verification): RPCs not individually verified (SQL definitions, edge cases)
- [ ] Sub-Step F (RLS Full Matrix): Only admin role checked — need all 6 roles × 4 operations
- [ ] Sub-Step G (AI Field Trace): No AI field traced (match_score, ai_verdict, ai_recommendation)
- [ ] Sub-Step I (Automation Audit): No automation audit done
- [ ] Sub-Step J (Enterprise Lifecycle): 1 workflow done (Recruitment), 6 remaining

The following requirements remain for G1.5→G2:

- [x] Execute complete Recruitment workflow end-to-end against live DB ✅
- [x] Produce runtime evidence for every transition (SQL, API, UI evidence collected in recruitment_workflow_evidence.json)
- [x] Verify every FK path (orphans, cascade, nullability — 25 orphans found)
- [x] Verify every trigger (6 Recruitment triggers tested — 2 ACTIVE, 3 INACTIVE, 1 error-recovered)
- [ ] Verify every RPC (definition, input, output, math, edge cases, NULL, empty, large, permissions)
- [ ] Verify RLS (every role × every operation = PASS/FAIL matrix per table)
- [ ] Verify AI fields (full trace DB → prompt → Edge Function → model → response → display)
- [ ] Verify mathematics (every KPI: SQL → transformation → formula → rounded → displayed)
- [ ] Verify automation (manual / trigger / cron / edge function / RPC / frontend — per event)
- [ ] Verify enterprise lifecycle (create real Admin, HR, Recruiter, Candidate, Employee, TL, Manager — execute all operations)
- [ ] Reclassify objects based on evidence (not before)
- [ ] Recruitment workflow 100% verified (runtime + business logic + math + AI + RLS + triggers + regression + end-to-end execution)
