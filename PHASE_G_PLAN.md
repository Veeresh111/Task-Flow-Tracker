# EHCF — Enterprise HRMS Certification Framework (v1.0)

> **Formerly**: Phase G — Enterprise Operational Certification
> **Goal**: Every feature reaches L5B (Enterprise Verified) with Code + Database + Runtime + Workflow + Mathematical + Regression verification before any business-logic or schema change.
> **Methodology**: Evidence IDs, immutable baselines, certification gates, runtime verification mandate, critical chains, removal safety.
> **Status**: FROZEN at v1.0. Future changes only through versioned revisions when execution uncovers a genuine gap.

---

## Framework Version History

| Version | Date | Changes |
|---------|------|---------|
| v0.8 | 2026-06-20 | Initial certification phases (G1–G12), evidence ID system, baseline methodology |
| v0.9 | 2026-06-25 | Added G13 (Production Readiness), Evidence Register, object usage classification, grading system |
| v1.0 | 2026-06-27 | Added G14 (Continuous Certification), Enterprise Invariants, KPI Certification, Evidence Freshness + Expiry, L4R/L4S grade split, Change Impact Analysis, Severity Drift, Technical Debt Register, Certification Never Inherited, certification authority + status values, risk acceptance, KPI ownership |

---

## Evidence ID System

Every piece of evidence receives a permanent structured ID for cross-referencing across all phases. IDs follow the format `EV-{TYPE}-{OBJECT}-{NNN}` to scale cleanly across thousands of findings.

| Prefix | Evidence Type | Example |
|--------|---------------|---------|
| EV-DB-{TABLE}- | Database schema / data | `EV-DB-PROFILES-001` — profiles column inventory |
| EV-SQL-{MIGRATION}- | Migration SQL | `EV-SQL-20260620000541-001` — get_enterprise_metrics() DDL |
| EV-RPC-{NAME}- | RPC function | `EV-RPC-GET_ENTERPRISE_METRICS-001` — RPC body |
| EV-RLS-{TABLE}- | RLS policy | `EV-RLS-COMPLAINTS-001` — complaints_select_own |
| EV-UI-{PAGE}- | Frontend code / component | `EV-UI-ADMIN-DASHBOARD-001` — Dashboard.tsx line 60 |
| EV-AI-{FEATURE}- | AI prompt / output | `EV-AI-FLIGHT-RISK-001` — Flight Risk prompt |
| EV-PERF-{NAME}- | Performance measurement | `EV-PERF-PERFORMANCE-ENGINE-001` — N+1 query |
| EV-TEST-{SUITE}- | Test result / artifact | `EV-TEST-PLAYWRIGHT-001` — login test |
| EV-CONF-{NAME}- | Configuration / environment | `EV-CONF-SUPABASE-001` — project URL |
| EV-MATH-{FORMULA}- | Mathematical verification | `EV-MATH-PAYROLL-001` — payroll formula proof |

Every finding in the Evidence Register must reference at least one EV-ID. Findings without an EV-ID are considered **unsupported**.

---

## Permanent Governance Rule — Enterprise Certification

**No finding may become Enterprise Certified (L5B) unless it has ALL of:**

1. **Code verification** — The source code producing the value has been read and understood
2. **Database verification** — The originating DB schema and data have been inspected
3. **Runtime verification** — The code path was executed, observed producing output, and that output matched expectations
4. **Workflow verification** — The end-to-end workflow was executed against live/production-like data
5. **Mathematical verification** — Every formula was traced: INPUT → INTERMEDIATE → OUTPUT → EXPECTED → DIFFERENCE → REASON
6. **Regression verification** — Pre/post comparison confirmed no unintended side effects

A finding lacking any of the above six verifications cannot be graded higher than L5A.

---

## Certification Gates

Every phase transition requires passing a formal gate. No phase may begin until the previous phase's gate is closed.

### Gate Template

```
GATE: [Phase Name] → [Next Phase]
STATUS: OPEN / CLOSED

CHECKLIST:
- [ ] Phase deliverables produced and stored in flowtracker/
- [ ] Evidence coverage ≥95% (measured: X/Y findings have EV-IDs)
- [ ] No unresolved contradictions between findings
- [ ] Enterprise Baseline frozen (if applicable)
- [ ] All provisional findings documented with "Next Evidence Required"
- [ ] User approval obtained
- [ ] No P0/P1 findings blocked by insufficient evidence (must be resolved or explicitly deferred)
- [ ] Baseline hash compared: [previous hash] vs [current hash]
- [ ] Migration hash compared: [previous hash] vs [current hash]
```

### Gate Sequence

```
G1  Complete → Gate G1→G1.5 → G1.5 Complete → Gate G1.5→G2 → G2 → Gate → G3 → Gate → ...
```

If any gate check fails → **STOP**. Do not proceed until the issue is resolved.

---

## Immutable Baseline

At G1 closure, an **Enterprise Baseline v1** is frozen (`ENTERPRISE_BASELINE.md`). This baseline captures:

- Database schema hash
- Migration aggregate hash
- Git commit / branch (if available)
- Supabase project identity
- CLI and runtime versions
- Package lock hash
- Storage bucket inventory
- RPC, trigger, policy, table, view, extension counts
- Total row counts per table

Every future phase compares against this baseline. Any discrepancy must be investigated as either:
1. A legitimate schema change (requires new baseline version), or
2. An error in the baseline (requires correction + version bump), or
3. Evidence of unauthorized production change (incident).

---

## Production Ready vs Enterprise Complete

Two distinct certification tracks:

| Track | Meaning | Requirements |
|-------|---------|--------------|
| **Production Ready** | The system is safe to deploy. No fabricated data, no broken workflows, no privilege escalation, no data corruption. Users can trust what they see. | Secure, stable, authentic data, all critical paths functional, RLS enforced, no mock/simulated data in production paths |
| **Enterprise Complete** | Every intended feature is built and connected. All AI features wired, all automations running, all dashboards populated, all KPIs finalized. | Full feature parity against specification, all 13 enterprise workflows certified, no placeholder/TODO features |

A system can be **Production Ready without being Enterprise Complete** (safe but missing some features), but it can **never be Enterprise Complete without being Production Ready** (unsafe features don't count as complete).

The current certification (EHCF G1-G12) certifies Enterprise Completeness. Production Readiness is a stricter subset: all Production Ready checks must pass before any G12 workflow can be certified.

---

## Production Data Authenticity Certification

Every value visible anywhere in the application must be classified into exactly one category:

| Classification | Definition | Display Rule | Example |
|---------------|------------|--------------|---------|
| **Authoritative** | Directly from Supabase/database. Zero transformation or pure pass-through. | Display without label | `profiles.name`, `profiles.email` |
| **Derived** | Calculated from database values via a documented, auditable formula. | Display without label (formula must be on record) | `payroll_ctc / 12` for monthly salary, `COUNT(*) WHERE status = 'Completed'` |
| **AI Generated** | Produced by an LLM (directly or indirectly). May include DB context but output is not deterministic. | Display with "(AI Prediction)", "(AI Estimate)", or "(AI-generated)" label | Flight Risk assessment, Career Prediction |
| **Placeholder** | Hardcoded fallback, mock data, sample/seed data, or any value not backed by live DB. | **Must be hidden in production** or display "(Placeholder)" in development only | Static `65,000` headcount fallback, simulated payslip data |

**Nothing else** — no uncategorized values — should appear in the UI.

### Certification Per Widget

```
WIDGET: [name (e.g., "Active Headcount" card on Admin Dashboard)]
PAGE: [file:line]

AUTHENTICITY CLASSIFICATION:
  [ ] Authoritative (direct DB pass-through)
  [ ] Derived (formula documented)
  [ ] AI Generated (labeled accordingly)
  [ ] Placeholder (hidden in production / labeled in dev)

EVIDENCE CHAIN:
  [ ] Source SQL/RPC identified and read
  [ ] Transformation documented (if any)
  [ ] Displayed value matches expected output
  [ ] No fallback to hardcoded value
  [ ] No simulated/mock data in production path
  [ ] AI values carry appropriate label (Prediction/Estimate/Generated)
  [ ] Error state shows "Data unavailable" not fabricated number

CERTIFIED: ✅ AUTHENTIC / ❌ FAILS
```

### Enforcement

- Every dashboard card, every report cell, every API response field must have an authenticity classification.
- Values failing certification must be corrected before the widget can be certified Production Ready.
- The `QA_AUDIT_REPORT.md` identifies critical violations: Employee Payroll (100% Placeholder), ATS screening (broken auth → effectively Placeholder), Admin Analytics (queries non-existent tables → effectively Placeholder).

---

## No Fake Data Certification

Every dashboard card, widget, and displayed value must be certified as "real" — meaning it comes from a documented backend source with no fallback to hardcoded or mock data.

### Certification Chain

```
WIDGET: [name (e.g., "Active Headcount" card on Admin Dashboard)]
PAGE: [file:line]

SQL/RPC SOURCE:
  [ ] Identified (which query or RPC)
  [ ] Read (source SQL inspected)
  [ ] Verified (returned data matches)

TRANSFORMATION:
  [ ] None (direct DB value)
  [ ] Computed (formula documented and verified)

MATH VERIFIED:
  [ ] Formula: INPUT → INTERMEDIATE → OUTPUT → EXPECTED → DIFFERENCE → REASON
  [ ] No rounding errors or precision loss

DASHBOARD VALUE:
  [ ] Displayed value matches expected output
  [ ] Formatting correct (currency, locale, units)

VERIFICATION:
  [ ] No fallback to hardcoded value
  [ ] No mock data path
  [ ] No AI-generated value without label
  [ ] Error state handles missing data gracefully

CERTIFIED: ✅ YES / ❌ NO
```

### Verification Rules

1. **No mock data** — Any test/mock/seed data must be explicitly documented. If a widget falls back to a hardcoded value when the DB is empty, it fails certification.
2. **No silent fallbacks** — If `data ?? fallback` exists, the fallback must be justified and documented.
3. **Error states** — If a query returns empty/null, the widget must show "Data unavailable" or equivalent, not a fabricated number.
4. **AI-labeled** — Any AI-generated value must carry a visible label: "(AI Prediction)", "(AI Estimate)", etc.

This certification directly supports the project's zero-fabrication requirement. Every value must be traceable to the DB or explicitly marked as AI commentary.

---

## Required Workflows for Enterprise Certification

Before G12 can pass, ALL of the following major HRMS workflows must be executed end-to-end against the live database. A workflow is **Not Certified** if any single link in the chain fails or any G1.5 sub-step (A-J) is incomplete.

| # | Workflow Chain | Key Tables | Status |
|---|----------------|------------|--------|
| 1 | **Recruitment → Onboarding → Employee** | job_forms → candidates → job_applications → assessment_tokens → assessment_attempts → interview_sessions → offer_letters → candidate_onboarding → profiles | 🟡 In Progress (14 links verified, 4 gaps found) |
| 2 | **Attendance → Payroll → Payslip** | attendance → weekly_attendance → profiles(payroll_ctc) → payroll_history_records | ⬜ Not Started |
| 3 | **Leave Request → Approval → Payroll Impact** | leaves → profiles(leave_balance) → payroll_loss_of_pay | ⬜ Not Started |
| 4 | **Task Assignment → Performance → Promotion** | tasks → work_logs → employee_analytics → profiles(performance_score) → promotions → salary_revision_history | ⬜ Not Started |
| 5 | **Complaint → Investigation → Resolution** | complaints → notifications → profiles | ⬜ Not Started |
| 6 | **Resignation → Exit Clearance → Deactivation** | resignations → employee_attrition → profiles(employment_status='inactive') | ⬜ Not Started |
| 7 | **Transfer → Department Update → Reporting Structure** | transfer_history → profiles(department, team_lead_id) | ⬜ Not Started |

Each workflow must pass all G1.5 sub-steps (G1.5-A through G1.5-J): workflow execution, runtime evidence, FK path verification, trigger execution, RPC verification, RLS matrix, AI field trace, mathematical verification, automation audit, and enterprise lifecycle execution.

---

## Database Integrity Certification (Required Per Workflow)

Every workflow must prove database integrity across its entire chain:

### Certification Checklist

```
WORKFLOW: [name]

[ ] No orphan foreign keys — every FK column references an existing row in the target table
[ ] Every FK constraint is defined in the live DB (not just in migration files)
[ ] Every trigger executes exactly once per event (ROW vs STATEMENT timing verified)
[ ] Every transaction is atomic — partial failures roll back completely
[ ] Rollback works on failure — trigger or RPC failure does not leave partial state
[ ] No duplicate records created by idempotent operations (re-running the same action)
[ ] Idempotent operations remain idempotent — INSERT with same data produces one row, not N
[ ] CASCADE rules match application intent (child rows deleted/restricted as expected)
[ ] NULL constraints prevent silent data loss (required columns cannot be null)
[ ] UNIQUE constraints prevent logical duplicates (email, reference_number, etc.)
[ ] CHECK constraints enforce valid values (status transitions, score ranges, etc.)
```

### Rationale

Enterprise systems fail more often from data integrity issues than UI bugs. A broken FK cascade can silently orphan thousands of rows. A missing UNIQUE constraint allows duplicate payroll runs. A missing CHECK constraint allows invalid status transitions that corrupt workflow state.

Each workflow must receive Database Integrity Certification (PASS/FAIL) before its G12 certification can proceed.

---

## Workflow Determinism Check (Required Per Workflow)

Enterprise systems must produce consistent results from identical inputs. Non-deterministic behavior (race conditions, unsynchronized state, session-dependent logic) can cause data corruption that surfaces weeks later.

### Procedure

```
1. Prepare fresh test data set (or clean target records)
2. Execute the complete workflow end-to-end (same as G1.5-A)
3. Capture every: database row, notification, status transition, calculated value, side effect
4. Reset the environment OR use a fresh, equivalent test data set
5. Execute the complete workflow again with identical inputs
6. Compare every row, notification, transition, and value from run 1 vs run 2
```

### Expected Results

| Artifact | Expected | Acceptable Difference | Unacceptable Difference |
|----------|----------|----------------------|------------------------|
| Created rows | Same count | Auto-generated IDs, timestamps | Different counts, different FK targets |
| Status transitions | Same sequence | — | Different paths, skipped states |
| Notifications | Same count, same recipients | Timestamps, IDs | Different recipients, different messages |
| Calculated values | Same value | Rounding at different precision | Different results from same formula |
| Side effects (audit, history) | Same entries | Timestamps | Missing entries, extra entries |

### Non-Determinism Sources to Check

- [ ] Race conditions in client-side state (two rapid clicks, double-submit)
- [ ] Session-dependent logic (`localStorage`, `sessionStorage` values affecting behavior)
- [ ] Environment-dependent logic (`window.innerWidth`, timezone, browser locale)
- [ ] Random/entropy-dependent logic (`Math.random()`, `crypto.randomUUID()` used for business data)
- [ ] AI-generated values (LLM output is inherently non-deterministic — document expected variance)
- [ ] Realtime subscription timing (event delivery order may vary)

### Reporting

```
WORKFLOW: [name]
DETERMINISM CHECK: PASS / FAIL

Run 1 artifacts: [evidence file path]
Run 2 artifacts: [evidence file path]

COMPARISON:
  Rows created:    Run1=X, Run2=Y, Match=✅/❌
  State machines:  Run1=[path], Run2=[path], Match=✅/❌
  Notifications:   Run1=N, Run2=N, Match=✅/❌
  Calculations:    Run1=[val], Run2=[val], Match=✅/❌

NON-DETERMINISM SOURCES IDENTIFIED:
  - [source 1]
  - [source 2]

VERDICT: ✅ Deterministic / ⚠️ Mostly Deterministic / ❌ Non-Deterministic
```

---

## Business Authority Requirement

Every business rule must document its **authority** — the source that defines the rule. Without this, it is impossible to distinguish intentional design from accidental implementation.

### Authority Classification

| Authority | Definition | Example |
|-----------|------------|---------|
| **Company HR Policy** | Formal HR policy document | Leave accrual rate, promotion eligibility |
| **Legal Requirement** | Required by law | Income Tax India FY2026 deductions |
| **Industry Standard** | Common practice in the industry | 50/20/10/10/10 payroll split |
| **Developer Decision** | Implemented without external mandate | AI prompt template phrasing |
| **Supabase Default** | Default behavior of the platform | RLS policy format |
| **Business Stakeholder** | Defined by a specific person/role | Dashboard layout preferences |

### Template

```
BUSINESS RULE: [what the rule says]
AUTHORITY: [Company HR Policy / Legal Requirement / Industry Standard / Developer Decision / Business Stakeholder]
AUTHORITY SOURCE: [specific document, law, person, or reference]
IMPLEMENTED IN: [file:line]
VERIFIED BY: [who confirmed this rule is correct?]
```

### Fields Requiring Authority (Non-Exhaustive)

| Field | Authority Required |
|-------|-------------------|
| `payroll_ctc` calculation | HR Policy + Tax Rules |
| Leave balance formula | Company Policy |
| Performance score formula | Developer Decision (or HR Policy) |
| AI prompt instructions | Developer Decision |
| Tax deduction rates | Legal Requirement (Income Tax India) |
| PF/ESI contribution | Legal Requirement |
| Overtime rate | Company Policy + Legal |
| Notice period duration | Company Policy + Legal |

---

## G2 Inheritance Rule

G2 (Backend Logic Audit) may only inspect objects classified as **Active** or **Partial** in G1.5.

Objects classified as:
- **Dead** → deferred to G7 (Cleanup)
- **Legacy** → deferred to G8 (Refactor)
- **Prototype** → excluded from certification; evaluated separately

This prevents the audit from wasting effort on objects that will be removed or refactored.

### Inheritance Chain (Full)

```
G1.5 Classification
  → Active / Partial → G2 (Backend), G3 (Frontend), G4 (Business Rules), G5 (Math)
  → Dead → G7 (Cleanup)
  → Legacy → G8 (Refactor)
  → Prototype → Excluded

G11 Certification
  → All Active/Partial features certified individually
  → Feeds into G12

G12 Certification
  → Only workflows composed entirely of G11-certified features
  → Workflows with any uncertified link → FAIL
```

---

## Runtime Verification Mandate

No object may be classified as **Active** based on code references alone. The required evidence chain is:

```
1. Used in Code       → grep for table/RPC/trigger name in src/
2. Executed           → confirmed the code path is reachable
3. Observed           → ran the workflow and captured the DB query/response
4. Verified           → the output matched expectations (correct data, correct format)
```

Without all four steps, the object's status is **Needs Validation**, not Active.

---

## Standing Rules (Applies to EVERY Phase)

### Rule 1 — Modification Protocol

Before any code modification, the following must be produced and approved:

```
1. EVIDENCE — The bug or gap proven via evidence chain
2. ROOT CAUSE — Why does it happen? (code, schema, logic, data)
3. DEPENDENCY GRAPH — Every page, component, RPC, table, trigger affected
4. REGRESSION ANALYSIS — What could break?
5. BUSINESS IMPACT — Who is affected? How? Severity?
6. IMPLEMENTATION PLAN — Exact files, lines, SQL changes
7. USER APPROVAL — Explicit go-ahead before any code is written
```

After implementation, the following must be verified:

```
1. FILES CHANGED — List every file modified
2. SQL CHANGED — Every ALTER TABLE, CREATE, DROP
3. MIGRATION CHANGED — Migration file contents
4. TESTS EXECUTED — Which tests passed?
5. PLAYWRIGHT — Test results with artifacts
6. REGRESSION PASSED — Pre/post comparison
7. ROLLBACK PLAN — Exact steps to revert
8. BEFORE vs AFTER — Value comparison with evidence
```

### Rule 2 — Audit-Only Mode During G1–G10

During all certification phases, the system operates in **audit-only mode**:
- Collect evidence
- Classify issues
- Produce reports
- Propose fixes

No production code is modified unless explicitly approved on a per-finding basis.

### Rule 3 — Finding Freeze (LOCKED status)

When a finding reaches L5A or L5B, it becomes:

```
LOCKED
```

No edits allowed unless new evidence emerges. If new evidence appears:

```
LOCKED
  ↓
REOPENED
  ↓
Evidence Added
  ↓
Regraded
  ↓
LOCKED
```

This preserves the audit trail. Findings below L5A/L5B remain editable.

### Rule 4 — Coverage Metrics

Every phase reports measurable completion:

```
Tables inspected:    52 / 52
RPCs inspected:     18 / 18
Triggers inspected: 24 / 24
Policies inspected: 113 / 113
Pages inspected:    41 / 41
Dashboards:         6 / 6
AI features:        8 / 8
Workflows:          18 / 18
```

Phases cannot be closed with incomplete metrics.

### Rule 5 — Freeze Requirements During Audit

During G1–G10 (entire certification phase):

```
No new feature development.

Only:
- Evidence collection
- Verification
- Documentation
- Certification
- Critical security fixes
- Production blockers
```

Scope changes during the audit invalidate prior findings. If a requirement changes mid-audit, affected findings must be re-evaluated from the beginning.

### Rule 6 — Change Impact Analysis (Every Modification)

Before any modification, produce a full impact assessment:

```
CHANGE IMPACT

Files touched:        [list every file]
Tables touched:       [list every table]
RPCs touched:         [list every RPC]
Triggers touched:     [list every trigger]
Policies touched:     [list every RLS policy]
Edge Functions:       [list every EF]
Dashboards affected:  [list every dashboard]
Roles affected:       [list every role: admin, hr, tl, employee, candidate]
API routes affected:  [list every route]

Regression Risk:      Low / Medium / High
Rollback Complexity:  Low / Medium / High
Re-certification:     Which G-phases need re-run?
```

Without this assessment, no modification may proceed.

### Rule 7 — Certification Is Never Inherited

Just because Workflow A (Recruitment) is certified does NOT mean Workflow B (Payroll) or Workflow C (Analytics) inherits that certification. Each workflow must earn certification independently — even if they share tables, RPCs, or components.

**Consequences:**
- A shared table (e.g., `profiles`) must satisfy all invariants for every workflow that uses it
- A shared RPC (e.g., `get_enterprise_metrics()`) must be re-verified for each workflow's context
- A shared component (e.g., `formatINR()`) must be tested in each workflow's display path
- Certification of one workflow does NOT reduce evidence requirements for any other workflow
- The only exception: if two workflows are IDENTICAL in every evidence chain step (schema, code, execution, observation, business rules, math, AI, security), they may share a certification record with documented justification

### Rule 8 — Certification Authority

Only the following roles may certify findings:

| Role | Can Certify | Cannot Certify |
|------|-------------|----------------|
| Automated CI pipeline | L1–L4R, L4S | L5A, L5B (requires human review) |
| QA Lead | L1–L5A | L5B (requires cross-workflow verification) |
| Database Auditor | G1, G1.5, G3, G5 | G7, G8 (requires security/AI specialization) |
| Security Reviewer | G8 | G7 (AI audit requires separate reviewer) |
| AI Ethics Reviewer | G7 | G8 (security requires separate reviewer) |
| Enterprise Architect | L5B, G12, G13, G14 | — (full authority) |

**Rules:**
- No finding may self-certify (the person who collected the evidence may not be the sole certifier)
- L5B findings require at least two independent certifiers
- G14 (Continuous Certification) automated results are valid for 30 days before requiring human review
- Certification authority may be delegated in writing with explicit scope and expiry

### Rule 9 — Risk Acceptance

When a finding cannot be resolved before deployment, a formal risk acceptance record must be created instead of leaving the finding open indefinitely.

```
RISK ACCEPTANCE

Finding ID:     WF-03
Title:          Role escalation risk
Priority:       P1 (downgraded from P0 after mitigations confirmed)
Grade:          L4R (runtime observation — full chain not demonstrated)

Business Justification:
  Application-level guards (auth.ts, ProtectedRoute.tsx) prevent exploitation
  via the frontend. Direct API exploitation requires knowledge of the
  Supabase REST endpoint and valid JWT. Risk is medium-low for production.

Approver:       [Name / Role]
Date:           YYYY-MM-DD
Expiry:         YYYY-MM-DD (must be re-evaluated by this date)

Status:         Accepted / Rejected / Superseded
```

**Rules:**
- Risk acceptance expires automatically — must be re-evaluated on or before the expiry date
- P0 findings may never be accepted — must be resolved before production deployment
- Risk acceptance records are immutable once created (may be superseded by a newer record, but never deleted)

### Rule 10 — Certification Status Values

Every certification moves through a defined lifecycle:

| Status | Definition | Can Deploy |
|--------|------------|------------|
| **Draft** | Initial state — evidence collection started | No |
| **In Progress** | Evidence collected, review not complete | No |
| **Evidence Collected** | All evidence gathered, awaiting review | No |
| **Under Review** | Certification authority reviewing evidence | No |
| **Certified** | All evidence verified, all invariants pass | Yes |
| **Suspended** | Previously certified, but new evidence or change invalidated certification | No |
| **Revoked** | Certified finding was found to be incorrect — requires full re-certification | No |

Transitions: Draft → In Progress → Evidence Collected → Under Review → Certified. Certified may transition to Suspended (on change/migration) or Revoked (on discovered error). Revoked always returns to Draft for full re-certification.

---

## Enterprise Invariants

**Invariants are permanent rules that must always hold true across the entire system.** Unlike workflow checks (which verify one path), invariants must hold for every possible execution path, every migration, every data state, and every role.

Invariants are regression-checked at G14 (Continuous Certification). If any invariant is ever violated, the system is immediately Not Certified until the violation is resolved.

### Workflow 1: Recruitment

```
Job Application
  ↓
Assessment (optional)
  ↓
Interview (optional)
  ↓
Offer Letter
  ↓
Candidate Onboarding
  ↓
Employee Profile
  ↓
Exactly once.
```

**Invariants:**
- INV-REC-01: One job application → at most one offer letter (no duplicate offers per application)
- INV-REC-02: One offer → at most one onboarding record (no double-onboarding)
- INV-REC-03: One onboarding → at most one employee profile (no duplicate profiles per hire)
- INV-REC-04: A candidate cannot be onboarded before an offer is accepted
- INV-REC-05: An offer cannot be generated before an application exists
- INV-REC-06: Assessment score, interview score, and offered CTC must be recorded at the time of each respective action — cannot be retroactively null
- INV-REC-07: candidate_onboarding.candidate_id must reference an existing profile (FK integrity)

### Workflow 2: Payroll

```
Employee Profile (payroll_ctc)
  ↓
Monthly Payslip (60/15/18 split)
  ↓
Payslip History
  ↓
Dashboard Aggregation
```

**Invariants:**
- INV-PAY-01: One employee → at most one active salary (no two active payroll_ctc values)
- INV-PAY-02: Monthly payslip × 12 ≤ annual CTC (aggregate constraint)
- INV-PAY-03: Every employee with payroll_ctc > 0 must have a payslip for every month since creation
- INV-PAY-04: Salary revision must always create a history record (never silent change)
- INV-PAY-05: Exited employees must have zero payslips after exit date

### Workflow 3: Attendance

```
Clock In
  ↓
Clock Out
  ↓
Closed Work Log
  ↓
Monthly Aggregation
```

**Invariants:**
- INV-ATT-01: Every Clock Out must have a preceding Clock In (no orphan clock-out)
- INV-ATT-02: An open Clock In must be closed before the next Clock In (no overlapping shifts without approval)
- INV-ATT-03: Total hours worked + break hours ≤ 24 per day
- INV-ATT-04: Attendance records for future dates are not permitted

### Workflow 4: Leave

```
Leave Request
  ↓
TL Approval (or auto-reject)
  ↓
HR Finalization
  ↓
Leave Balance Decrease
  ↓
Payslip Deduction (if unpaid)
```

**Invariants:**
- INV-LEAVE-01: Approved leave always decreases the remaining balance (never increase)
- INV-LEAVE-02: Rejected leave never decreases the balance (balance-CRUD consistency)
- INV-LEAVE-03: Leave dates cannot overlap (no double-booking)
- INV-LEAVE-04: Leave cannot be approved after the leave end date
- INV-LEAVE-05: Unpaid leave must reduce the corresponding month's payslip

### Workflow 5: Performance

```
Task Created
  ↓
Work Logged
  ↓
Score Calculated
  ↓
Performance Review
```

**Invariants:**
- INV-PERF-01: Score is never >100 or <0 (bounded calculation)
- INV-PERF-02: Completed tasks must have at least one work log entry
- INV-PERF-03: A task cannot be marked Completed without a corresponding score
- INV-PERF-04: Scores from different periods (monthly/quarterly/annual) must be independently stored

### Workflow 6: Promotion

```
Recommendation
  ↓
Approval
  ↓
Profile Update (designation, salary)
  ↓
Salary Revision History
  ↓
Notification
```

**Invariants:**
- INV-PROM-01: Every promotion must create a salary_revision_history record
- INV-PROM-02: A promotion cannot decrease salary unless documented with reason
- INV-PROM-03: A profile's designation cannot change without a promotion/transfer record

### Workflow 7: Transfer

```
Request
  ↓
Approval
  ↓
Department Change
  ↓
History Record
```

**Invariants:**
- INV-TRN-01: Every department change must have a transfer history record
- INV-TRN-02: A profile cannot belong to two departments simultaneously

### Workflow 8: Complaint

```
Filed
  ↓
HR Review
  ↓
Resolved
  ↓
Closed
```

**Invariants:**
- INV-COMP-01: A complaint cannot transition from Closed back to Open (no re-opening)
- INV-COMP-02: A complaint must have admin_notes before it can be marked Resolved
- INV-COMP-03: Resolution date must be ≥ filing date

### Workflow 9: Resignation

```
Submit
  ↓
Notice Period
  ↓
Exit Interview
  ↓
Settlement
  ↓
Profile Deactivation
  ↓
Attrition Record
```

**Invariants:**
- INV-RES-01: A profile cannot be deactivated without a resignation/exit record
- INV-RES-02: Final settlement must be completed before profile deactivation
- INV-RES-03: After deactivation, the employee must not be able to log in

### Cross-Cutting Invariants

- INV-CRS-01: profiles.role is always one of: admin, hr, team_lead, employee, candidate, payroll, manager
- INV-CRS-02: Every RPC with SECURITY DEFINER must also enforce auth.uid() check
- INV-CRS-03: No two profiles may share the same email
- INV-CRS-04: Every notification must have a valid user_id reference
- INV-CRS-05: Audit logs (when implemented) must be append-only (never DELETE or UPDATE)
- INV-CRS-06: Every Edge Function must verify authentication before processing

### Data Invariants (Continuous — Workflow-Independent)

These invariants must hold at all times, regardless of which workflow created or modified the data. They are checked on every invariants runner execution and do not depend on workflow context.

**Uniqueness Constraints:**
- INV-DATA-01: profiles.email — globally unique (no two profiles share the same email)
- INV-DATA-02: candidates.email — globally unique within the candidates table
- INV-DATA-03: offer_letters.reference_number — globally unique per offer

**Referential Integrity:**
- INV-DATA-04: candidate_onboarding.candidate_id must reference an existing profiles.id (never orphaned)
- INV-DATA-05: offer_letters.application_id must reference an existing job_applications.id
- INV-DATA-06: interview_sessions.application_id must reference an existing job_applications.id
- INV-DATA-07: assessment_tokens.candidate_id must reference an existing candidates.id
- INV-DATA-08: notification.user_id must reference an existing auth.users.id

**Range Constraints:**
- INV-DATA-09: profiles.payroll_ctc >= 0 (never negative salary)
- INV-DATA-10: leave_balance >= 0 (never negative leave balance)
- INV-DATA-11: assessment_attempts.score BETWEEN 0 AND 100
- INV-DATA-12: performance_score BETWEEN 0 AND 100
- INV-DATA-13: offered_ctc >= 0

**Temporal Constraints:**
- INV-DATA-14: offer_letters.offer_date <= joining_date (offer must precede joining)
- INV-DATA-15: complaint.created_at <= resolved_at (resolution cannot precede filing)
- INV-DATA-16: attendance.clock_in <= clock_out (clock-out cannot precede clock-in)
- INV-DATA-17: resigned_at >= created_at for any resigning profile

**State Consistency:**
- INV-DATA-18: An employee with payroll_ctc > 0 must have employment_status IN ('active', 'on_leave', 'terminated')
- INV-DATA-19: A candidate marked as "Hired" must have a corresponding candidate_onboarding record
- INV-DATA-20: An offer letter marked "Accepted" must have a corresponding onboarding stage > 0

---

## Versioned Certification

Every workflow certification includes version metadata to prevent stale certifications from being mistaken for current ones.

```
CERTIFICATION RECORD

Workflow:    Recruitment
Version:     1.0
Date:        YYYY-MM-DD
Certified By: <role> (automated or manual)

Evidence Register: v5 (or latest)
  Commit:     abc123
  DB Migration: 20260627
  Supabase Project: production

G-Phases Passed:
  G1   ✅  Database Integrity
  G1.5 ✅  Object Classification
  G2   ✅  Backend Logic
  G3   ✅  Data Lineage
  G4   ✅  Business Rules
  G5   ✅  Mathematics
  G6   ✅  Automation
  G7   ✅  AI Audit
  G8   ✅  Security
  G9   ✅  Performance
  G10  ✅  Enterprise Simulation
  G11  ✅  Feature Certification
  G12  ✅  Workflow Certification

Invariants Checked:
  INV-REC-01 through INV-REC-07 — all PASS

Next Re-Certification:
  YYYY-MM-DD (or trigger: schema change / migration / model deploy)
```

This record is stored in the certification report and updated each time the workflow is re-certified.

---

## Business KPIs — Certified Artifacts

Beyond workflows, every enterprise metric displayed on a dashboard or report must itself be certified. Dashboards inherit their certification from their constituent KPIs.

**Certification template per KPI:**

```
KPI: Active Headcount

SOURCE TABLE: profiles
FORMULA:      COUNT(*) WHERE employment_status IS DISTINCT FROM 'terminated'
DATA TYPE:    Integer (aggregate)
RPC:          get_enterprise_metrics() → headcount
DISPLAY PATH: admin/Dashboard.tsx:60, hr/Dashboard.tsx:37
AUTHORITY:    Company Policy — headcount = all non-terminated profiles

MATH VERIFIED: ✅ (COUNT + IS DISTINCT FROM — verified against raw DB query)
LINEAGE VERIFIED: ✅ (profiles → RPC → Dashboard card → formatNumber())
TREND VERIFIED: ❌ (month-over-month comparison not checked)

CERTIFIED: ⬜
```

**KPIs to certify:**

| KPI | Source | Formula | Priority | Owner | Certified |
|-----|--------|---------|----------|-------|-----------|
| Active Headcount | profiles | COUNT WHERE employment_status != 'terminated' | P0 | HR | ⬜ |
| Monthly Payroll Liability | profiles | SUM(payroll_ctc) / 12 | P0 | HR / Finance | ⬜ |
| Hires This Month | profiles | COUNT WHERE created_at this month | P1 | Talent Acquisition | ⬜ |
| Attrition Rate | profiles | Exits / Avg Headcount × 100 | P1 | HR | ⬜ |
| Average Attendance % | attendance | Avg daily hours / Expected hours | P2 | Operations | ⬜ |
| Leave Utilization | leave | Total days taken / Total days allotted | P2 | Operations | ⬜ |
| Task Completion Rate | tasks | Completed / Total | P2 | Engineering | ⬜ |
| Average Performance Score | tasks | Avg score across all completed tasks | P2 | Engineering | ⬜ |
| Offer Acceptance Rate | offer_letters | Accepted / Total Generated | P2 | Talent Acquisition | ⬜ |
| Average Time to Hire | job_applications → onboarding | Avg days from application to onboarding | P3 | Talent Acquisition | ⬜ |

---

## Technical Debt Register

Not all findings should block certification. The Technical Debt Register separates issues that affect correctness, security, or workflow integrity from issues that are cosmetic, stylistic, or improvement-oriented.

**Scope:** Any finding with Business Impact = LI (Low Impact) or NI (No Impact), or Priority = P4 (Cosmetic).

```
TECH-001: Hardcoded color values in DashboardLayout.css

Category:       Maintainability / Style
Priority:       P4
Cert Impact:    None — does not affect data, security, or workflow correctness
Target Fix:     v2.1 (theming sprint)
Evidence:       EV-UI-DASHBOARDLAYOUT-001

Status:         Open / Fixed / Deferred

TECH-002: Missing JSDoc comments on formatINR() utility

Category:       Documentation
Priority:       P4
Cert Impact:    None — function is self-explanatory
Target Fix:     v2.1
Status:         Open
```

**Rules:**
- A P0/P1/P2 finding may never be classified as Technical Debt
- Technical Debt does not count toward certification completeness metrics
- Technical Debt may accumulate indefinitely but must be reviewed quarterly
- Any P3 finding with a fix that takes <30 minutes should be fixed immediately, not deferred

---

## Finding Attribute: Severity Drift

Every finding tracks its severity history over time. This is critical for demonstrating that the certification process is actually improving the system.

```
SEVERITY HISTORY:

Date        Priority    Reason
2026-06-26  P0          Original classification — UPDATE succeeded under admin, full exploit chain unproven
2026-07-15  P1          Non-admin self-escalation test proved RLS blocks role change — reduced
2026-08-01  P3          Application-level guard test proved auth.ts resets escalated role — reduced again
2026-09-15  RESOLVED    Migration applied, trigger confirmed active, locks in place
```

**Severity history is immutable.** Once recorded, entries may not be edited or deleted — only appended. This prevents revisionism and preserves the audit trail.

---

## Classification Standards

### Feature Maturity

Every feature is classified as one of:

| Icon | Classification | Definition |
|------|---------------|------------|
| ✅ | **Production Ready** | All evidence chains verified, L5B certified |
| 🟡 | **Partially Implemented** | Core functionality exists, but gaps remain |
| 🔵 | **Prototype** | Basic proof of concept, not enterprise-ready |
| ⚪ | **Dead / Unused** | Code or schema exists but no execution path |
| 🔴 | **Broken** | Known defect that prevents use |

### Business Criticality (for every finding)

| Priority | Label | Definition |
|----------|-------|------------|
| P0 | **Critical** | Security breach, data corruption, payroll loss, auth bypass |
| P1 | **High** | Enterprise workflow broken (promotion, resignation, onboarding) |
| P2 | **Medium** | Incorrect analytics/reporting, mislabeled data |
| P3 | **Low** | UX inconsistency, performance degradation |
| P4 | **Cosmetic** | Cleanup, refactoring, documentation |

### Business Impact (for every finding — distinct from Priority)

Priority measures **urgency** (how fast must we fix this?). Business Impact measures **severity** (what happens to the business if we don't?).

| Impact | Label | Definition | Example |
|--------|-------|------------|---------|
| CI | **Critical** | Financial loss, legal liability, data breach | Wrong payroll formula overpays employees |
| HI | **High** | Major workflow blocked, significant data corruption | Resignation workflow crashes |
| MI | **Medium** | Analytics incorrect, minor data loss | Hires-this-month shows inflated number |
| LI | **Low** | UX confusion, cosmetic defect | Wrong currency symbol on payslip |
| NI | **None** | No business effect | Dead code, unused column |

A finding can be P0 (must fix NOW) with Low business impact (cosmetic security hardening), or P3 (can wait) with High business impact (workflow blocked but rare). Both dimensions must be recorded.

### Confidence Levels (for every finding)

Every finding includes a confidence score reflecting how many evidence sources support it.

| Confidence | Meaning | Required Evidence |
|------------|---------|-------------------|
| **100%** | Fully reproduced | Code + Database + Runtime + Workflow + Math + Regression — all verified |
| **95%** | All but regression | Code + Database + Runtime + Workflow + Math verified |
| **80%** | No runtime yet | Code + Database verified, workflow not executed |
| **60%** | Code inspection only | Code read, DB not probed, workflow not executed |
| **<60%** | Hypothesis | No direct evidence — inferential or speculated |
| **RETRACTED** | Previously reported, disproven | Original evidence contradicted by new evidence |

Confidence is recalculated whenever new evidence is added. A finding at 60% that receives runtime verification may jump to 95%.

### Evidence Grades (L1–L5B)

| Grade | Label | Definition |
|-------|-------|------------|
| L5B | **Enterprise Verified** | Full chain + workflow executed + all downstream dependencies verified |
| L5A | **Verified Code** | Full chain inspected end-to-end (UI→React→RPC→SQL→DB→Value→Rule→Formula→Display) |
| L4 | **Code Verified** | React + SQL read, business logic understood |
| L3 | **Schema Verified** | DDL + DB columns inspected |
| L2 | **Strong Evidence** | Code read, SQL not read |
| L1 | **Hypothesis** | Needs investigation |

---

### Evidence Source Classification (for every finding)

| Source | Definition | Grade Ceiling |
|--------|-----------|---------------|
| Production Database | Live data probed via SQL | L5A |
| Production Workflow | Workflow executed against live DB | L5B |
| Test Database | Separate test instance | L4 |
| Generated Test Data | Seeded for testing | L4 |
| Simulated Workflow | Mock/stub workflow | L4 |
| Static Code Analysis | Code read without execution | L4 |
| Migration SQL | DDL from migration files | L3 |
| Live RPC | RPC function read from DB | L4 |

A finding based only on Migration SQL (without live DB probe) cannot exceed L3. A finding with Static Code Analysis only cannot exceed L4. L5A requires Production Database evidence. L5B requires Production Workflow evidence.

---

### AI Metric Classification

Every displayed value in the application must be classified into exactly one of the following categories. This is mandatory before any AI audit (G7).

| Classification | Definition | Example | Certification Required |
|---------------|------------|---------|----------------------|
| **Authoritative** | Deterministic calculation from DB data, zero AI involvement | Headcount, payroll amount, leave balance | No AI audit needed |
| **Estimated** | Computed value with known assumptions called out | Projected headcount at year-end | Math verification only |
| **Predicted** | AI model output based on DB context | Flight Risk, Attrition Prediction | Full AI hallucination audit (G7) |
| **Generated** | AI model output with little or no company-specific data | Onboarding Plan, Comp Benchmarker | Full AI hallucination audit (G7) + "No Company Data" label |

**Display rules**:
- **Authoritative**: Display without label
- **Estimated**: Label with "(Estimated)"
- **Predicted**: Label with "(AI Prediction)"
- **Generated**: Label with "(AI-generated — No Company Data)" if no DB records were used

These classifications are permanent and survive across all future audit phases. A value cannot be downgraded from Authoritative to Estimated without a documented methodology change.

---

### Finding Classification

Every finding is classified into exactly one category:

| Category | Definition | Example |
|----------|-----------|---------|
| **Functional Bug** | Code behaves incorrectly per spec | `includes('complet')` matches "Incomplete" |
| **Business Logic** | Rule is incorrect or missing | No multi-step leave approval |
| **Security** | Auth/RLS bypass, data exposure | RPC lacks auth.uid() check |
| **Performance** | Query pattern, N+1, memory | PerformanceEngine 3N query pattern |
| **Architecture** | Structural design issue | 3 different payroll formulas across pages |
| **Maintainability** | Hard to understand or change | Hardcoded `$` currency symbol |
| **Technical Debt** | Accumulated shortcuts | USD→INR formatting inconsistency |
| **Future Enhancement** | Not a bug, missing capability | No payroll automation |

---

### Business Rule Authority

Every business rule must state **who decided the rule**:

```
BUSINESS RULE: Employee cannot approve their own leave
AUTHORITY: Company HR Policy
IMPLEMENTED IN: leave_approval.ts, approve_leave() RPC, RLS policy
EVIDENCE: Workflow Tested ✅
```

```
BUSINESS RULE: Payroll formula (50% basic + 20% HRA + ...)
AUTHORITY: Income Tax India FY2026, Company HR Policy
IMPLEMENTED IN: hr/Payroll.tsx:110-120
VERIFIED BY: HR + Finance (needs sign-off)
```

Without an authority, DeepSeek cannot distinguish intentional business rules from accidental implementation. Findings that reference business rules must cite the authority.

---

### Data Ownership (Required Per Table)

Every database table must specify an owner — the team or role responsible for its data quality, schema changes, and access governance.

| Table | Owner | Rationale |
|-------|-------|-----------|
| `profiles` | HR | Core employee/candidate identity data |
| `payroll_history_records` | Payroll / Finance | Compensation data — legal sensitivity |
| `salary_revision_history` | Payroll / Finance | Salary change audit trail |
| `candidates`, `job_applications`, `offer_letters` | Recruitment | Hiring pipeline |
| `attendance`, `leaves` | HR Operations | Time tracking |
| `complaints` | HR / Ethics | Grievance handling |
| `tasks`, `projects`, `work_logs` | Operations | Productivity tracking |
| `notifications` | System | Auto-generated by triggers |
| `messages`, `chat_messages` | System | Communications |
| `audit_log` | System / Security | Audit trail (future) |

**Determining ownership**:
- Tables written by application code → owner is the team that owns that feature
- Tables written only by triggers → owner is **System**
- Tables read by multiple features → owner is the primary data steward
- Tables with no current owner → **Unassigned** (must be assigned before G2)

---

### Dependency Graphs (Required Per Workflow)

Every enterprise workflow must have a visual dependency graph showing all dependent objects. Text lists are insufficient — the graph must illustrate direction of data flow.

#### Template

```
CHAIN: [Workflow Name]

SOURCE
  ↓
TABLE / RPC
  ↓
TRANSFORMATION
  ↓
CONSUMER (page / dashboard / export)
  ↓
AI FEATURE (if applicable)
  ↓
EXIT / ARCHIVE
```

#### Required Graphs (produced during G1.5 classification):

```
CHAIN: Recruitment
  job_postings → candidates → job_applications → assessments → interview_sessions → offer_letters → candidate_onboarding → profiles

CHAIN: Payroll
  profiles.payroll_ctc → salary_revision_history → payroll_history_records → [Admin Payroll, HR Payroll, Employee Payroll, TL Payroll]

CHAIN: Employee Lifecycle
  profiles → attendance → leaves → tasks → work_logs → promotions → transfer_history → resignations → employee_attrition

CHAIN: Analytics
  get_enterprise_metrics() → [admin/Dashboard, hr/Dashboard, admin/Analytics, admin/AIInsights]

CHAIN: AI
  [complaints, attendance, tasks, profiles] → ai-proxy Edge Function → [AIInsights pages]
```

Each graph must list every table, RPC, trigger, Edge Function, and page in the chain. Missing links indicate gaps in certification.

---

### Confidence Reduction Rules

If new evidence disproves a previous finding:

```
1. Previous finding had EVIDENCE CHAIN with checked items
2. New evidence contradicts one or more checked items
3. Finding status → RETRACTED
4. Reason documented: "Evidence contradicted hypothesis"
5. Original confidence → 0%
6. Finding remains in register for audit trail but is excluded from active counts
```

This prevents outdated conclusions from continuing to influence decisions.

---

### Source of Truth (Required Per Field)

Every data field must document its master source and all downstream consumers:

```
FIELD: profiles.payroll_ctc

PRIMARY SOURCE:     profiles.payroll_ctc (database column)
SECONDARY SOURCE:   salary_revision_history (historical changes)
DERIVED SOURCE:     Admin Dashboard (payroll/12 = monthly)
                    HR Payroll (50/20/10/10/10 breakdown)
                    Employee Payroll (60/15/18 monthly breakdown)
AI SOURCE:          Admin AI Insights (sent in prompt context)
EXPORT SOURCE:      Payslip CSV download
                    Financial report CSV download

VERIFICATION:       Every derived value must be traceable back to PRIMARY SOURCE
                    via a documented mathematical formula with no information loss.
```

---

### Lifecycle Map (Required Per Entity)

Instead of only a dependency graph, every major entity gets a lifecycle:

```
ENTITY: Employee

BIRTH:
  Candidate registration → Application → Interview → Offer → Onboarding
  Table: candidates → applications → interviews → offer_letters → candidate_onboarding → profiles

MODIFIED:
  Promotion → profiles.role, profiles.payroll_ctc, promotion_history
  Transfer → profiles.department, transfer_history
  Salary Revision → profiles.payroll_ctc, salary_revision_history
  Leave → leaves table
  Performance → tasks, work_logs, employee_analytics

READ:
  Dashboards (Admin, HR, TL, Employee)
  Analytics (Admin, Employee)
  Payroll pages (all 4 roles)
  AI Insights (all 5 roles)
  Master Directory
  Reports & CSV exports

ARCHIVED:
  Resignation → employee_attrition, profiles.employment_status='inactive'
  Retirement → employee_attrition, profiles.employment_status='inactive'
  Termination → employee_attrition, profiles.employment_status='inactive'

DELETED:
  No soft-delete mechanism exists. No hard-delete in application. Profile remains.
```

This immediately reveals missing lifecycle stages (e.g., no archive for resignations that preserves payroll history).

---

### Automation Ownership (Required Per Automation)

Every automation must document who owns each step:

```
AUTOMATION: Monthly Payroll Processing

STEP OWNERSHIP:
  Who starts it?     → Scheduler (cron/pg_cron)      [ OWNER: System ]
  When does it run?  → 1st of every month at 00:00   [ OWNER: System ]
  Data preparation   → RPC: generate_monthly_payroll() [ OWNER: Backend ]
  Payslip creation   → payroll_history_records INSERT  [ OWNER: Backend ]
  Ledger update      → general_ledger INSERT           [ OWNER: Backend ]
  Notification       → notifications INSERT            [ OWNER: Backend ]
  Employee view      → Employee Dashboard refresh      [ OWNER: Frontend ]
  Admin review       → Admin Payroll page              [ OWNER: Frontend ]
  Email notification → Edge Function or trigger        [ OWNER: Backend ]
  Audit log          → audit_logs INSERT               [ OWNER: Backend ]
  Error handling     → retry logic, alert HR           [ OWNER: System ]
  Rollback           → reverse migration or manual     [ OWNER: HR/Admin ]

GAPS IDENTIFIED:
  - No scheduler exists (no pg_cron, no cron job, no Edge Function schedule)
  - No generate_monthly_payroll() RPC exists
  - payroll_history_records structurally incomplete (3 cols)
  - No email notification system
  - No audit_logs table confirmed
  → AUTOMATION FAIL
```

---

## Enterprise Readiness Score

Every feature receives a weighted score instead of only PASS/FAIL.

| Area | Weight | Scoring |
|------|--------|---------|
| Database | 15% | Schema fit / FKs / triggers / indexes (0-100%) |
| Backend | 15% | RPCs / functions / Edge Functions correct (0-100%) |
| Frontend | 10% | All values displayed correctly (0-100%) |
| Workflow | 20% | End-to-end workflow tested (0-100%) |
| Security | 15% | RLS / auth / RPC checks / role enforcement (0-100%) |
| Automation | 10% | All automation steps defined and implemented (0-100%) |
| Math | 5% | All formulas verified against expected outputs (0-100%) |
| AI | 5% | Data provided / hallucinations checked / explainable (0-100%) |
| Performance | 5% | No N+1 / pagination / query cost acceptable (0-100%) |

Formula: `Score = Σ(weight × percentage)`

Grade mapping:
- 90-100%: **A** (Enterprise Ready)
- 80-89%: **B+** (Near Enterprise Ready)
- 70-79%: **B** (Functioning with gaps)
- 60-69%: **C+** (Partially Implemented)
- 50-59%: **C** (Prototype)
- Below 50%: **F** (Not Ready)

Example:

```
FEATURE: Payroll
  Database:    40%  (×0.15 = 6.0)  — 2 tables structurally incomplete
  Backend:     90%  (×0.15 = 13.5) — formulas exist, no write path
  Frontend:    70%  (×0.10 = 7.0)  — USD bug, 3 different formulas
  Workflow:    0%   (×0.20 = 0.0)  — never executed
  Security:    95%  (×0.15 = 14.25)— RLS exists, RPCs not checked
  Automation:  0%   (×0.10 = 0.0)  — no payroll automation
  Math:        60%  (×0.05 = 3.0)  — 3 formulas disagree
  AI:          N/A  (×0.05 = N/A)  — no AI for payroll
  Performance: 80%  (×0.05 = 4.0)  — no N+1 but no pagination

  SCORE: 47.75% — Grade F (Not Ready)
```

---

## AI Hallucination Audit (Required Per AI Feature)

Every AI feature must document the complete chain:

```
AI FEATURE: HR Dashboard — Flight Risk

PROMPT:
  [system prompt sent to ai-proxy]
  [user context sent]

INPUT DATA:
  [fields sent to model, e.g. attendance records count, leave count, ...]

DATABASE RECORDS USED:
  Table: [table name]
  Rows:  [count]
  Columns: [column names]
  Filter: [WHERE clause logic]

COMPUTED VALUES (pre-processing):
  [any aggregation or calculation done before sending to AI]

AI OUTPUT:
  [raw response from model]

POST-PROCESSING:
  [any formatting, truncation, or transformation done client-side]

DISPLAYED RESULT:
  [what the user actually sees]

CLASSIFICATION:
  AI Opinion / AI Prediction / AI Recommendation / AI Generated Text / AI Computation / AI Summary

VERIFICATION:
  Uses DB:             YES / NO
  Uses Company Policy: YES / NO
  Uses External Knowledge: NO (model training data only)
  Hallucination Risk:  LOW / MEDIUM / HIGH

REPRODUCIBILITY:
  [ ] Same input → same output (deterministic?)
  [ ] Confidence score provided: [value]
  [ ] Can another AI reproduce the answer?
  [ ] Can the answer be explained by the provided data?
```

---

## Enterprise Workflow Coverage

Every workflow is tracked on a master checklist:

| # | Workflow | Status | Evidence Level | Last Tested |
|---|----------|--------|---------------|-------------|
| 1 | Recruitment (Job→Application→Screen→Assess→Interview→Offer→Hire) | ⬜ Not Certified | — | — |
| 2 | Assessment (Create→Take→Score→Proctor) | ⬜ Not Certified | — | — |
| 3 | Interview (Schedule→Conduct→Feedback) | ⬜ Not Certified | — | — |
| 4 | Offer (Generate→Approve→Accept→Onboard) | ⬜ Not Certified | — | — |
| 5 | Onboarding (Candidate→Employee→Profile→Orientation) | ⬜ Not Certified | — | — |
| 6 | Attendance (Clock In→Out→Weekly→Monthly) | ⬜ Not Certified | — | — |
| 7 | Payroll (Compute→Approve→Payslip→History) | ⬜ Not Certified | — | — |
| 8 | Performance (Task→Work Log→Score→Review) | ⬜ Not Certified | — | — |
| 9 | Promotion (Recommend→Approve→Update→History→Salary Revision) | ⬜ Not Certified | — | — |
| 10 | Transfer (Request→Approve→Department Change→History) | ⬜ Not Certified | — | — |
| 11 | Leave (Submit→TL Approve→HR Finalize→Balance) | ⬜ Not Certified | — | — |
| 12 | Complaint (File→HR Review→Resolve→Close) | ⬜ Not Certified | — | — |
| 13 | Chat (Message→Read→Delete) | ⬜ Not Certified | — | — |
| 14 | Notification (Event→Create→Deliver→Dashboard) | ⬜ Not Certified | — | — |
| 15 | Resignation (Submit→Notice→Exit→Deactivate) | ⬜ Not Certified | — | — |
| 16 | Retirement (Age Trigger→Exit→Pension→Deactivate) | ⬜ Not Certified | — | — |
| 17 | Layoff (Process→Settlement→Exit→Deactivate) | ⬜ Not Certified | — | — |
| 18 | Termination (Process→Exit→Deactivate) | ⬜ Not Certified | — | — |

A workflow becomes **Certified** only after reaching L5B with full evidence chain.

---

## Data Lineage Map Template (Required Per Page)

```
[Dashboard Card / Feature Name]
↓  UI Layer
[Component name, file:line]
↓  State
[State variable, how populated]
↓  Hook / Handler
[fetch function, file:line]
↓  Query
[supabase.from('table').select('...') or rpc('name', {args})]
↓  RPC / SQL
[Actual SQL function body — MUST BE READ]
↓  Table
[database table name]
↓  Columns
[column1, column2, ...]
↓  Indexes
[index1, index2, ...] or MISSING
↓  Trigger
[trigger name, event, function body] or NONE
↓  Business Rule
[what rule does this implement?]
↓  Displayed Value
[how is it rendered? formatINR(), direct, etc.]
```

If any link is missing → page is not certified.

---

## Dependency Impact Graph Template (Required Per Field)

```
profiles.payroll_ctc
  → Payroll Pages (employee, tl, hr, admin) — display
  → Admin Dashboard — monthly/annual payroll cards
  → HR Dashboard — aggregate stats
  → Admin Analytics — Total Annual CTC card
  → Admin AI Insights — sent in AI prompt
  → Master Directory — CTC column
  → Salary Revision — input field
  → Payslip — basis for breakdown
  → Reports — exported data
  → CSV Downloads — financial report export
```

Every proposed change must include a dependency graph showing all affected pages, components, APIs, dashboards, and exports.

---

## Evidence Template (Required Per Finding)

```
FINDING ID: F-XX
EVIDENCE IDS: EV-DB-XXX, EV-SQL-XXX, EV-RPC-XXX, EV-UI-XXX (reference at least one)
TITLE:
CLASSIFICATION: Functional Bug / Business Logic / Security / Performance / Architecture / Maintainability / Technical Debt / Future Enhancement
PRIORITY: P0–P4
BUSINESS IMPACT: Critical / High / Medium / Low / None
CONFIDENCE: 100% / 95% / 80% / 60% / <60% / RETRACTED
FEATURE MATURITY: ✅ / 🟡 / 🔵 / ⚪ / 🔴
GRADE: L1–L5B
AI CLASSIFICATION: Authoritative / Estimated / Predicted / Generated / N/A
DATA OWNER: [HR / Payroll / Recruitment / System / Unassigned]

EVIDENCE SOURCE:
  [ ] Production Database (live data probed)
  [ ] Production Workflow (executed against live DB)
  [ ] Static Code Analysis (code read without execution)
  [ ] Migration SQL (DDL from migration files)
  [ ] Live RPC (RPC function read from DB)

EVIDENCE CHAIN:
[ ] UI layer inspected
[ ] React component/state inspected
[ ] Query/RPC call inspected
[ ] RPC SQL function read
[ ] Underlying SQL verified
[ ] DB table DDL inspected
[ ] DB column probed
[ ] Actual DB value confirmed
[ ] Business rule documented (with AUTHORITY)
[ ] Mathematical formula verified
[ ] Displayed value traced end-to-end
[ ] Workflow executed with real data
[ ] Downstream dependencies verified

EXECUTABLE EVIDENCE:
  SQL:     [query proving the issue]
  Code:    [file:line]
  API Response: [JSON or N/A]
  SQL Result: [query output or N/A]
  UI Screenshot: [path or N/A]
  Playwright Trace: [path or N/A]
  Before:  [value before fix]
  After:   [value after fix]

RUNTIME SCREENSHOTS (at least one for verified workflows):
  [ ] API response captured
  [ ] SQL result captured
  [ ] UI screenshot captured
  [ ] Playwright trace/screenshot captured

REPRODUCTION STEPS:
  1.
  2.
  3.

BUSINESS RULE AUTHORITY:
  Rule: [description]
  Authority: [Company Policy / Legal Requirement / Industry Standard / Developer Decision / Business Stakeholder]
  Authority Source: [specific document, law, person, or reference]
  Implemented In: [file:line or RPC or trigger]

DEPENDENCY GRAPH:
  [field] → [component 1] → [component 2] → [dashboard]

REGRESSION SURFACE:
  Files:     [list files that would change]
  Pages:     [list UI pages affected]
  RPCs:      [list RPCs affected]
  Triggers:  [list triggers affected]
  Policies:  [list RLS policies affected]
  Storage:   [list storage buckets affected]
  AI:        [list AI prompts affected]
  Exports:   [list export paths affected]
  Notifications: [list notification types affected]
  Automations:   [list automations affected]
  Tests:     [list test files affected]

PRODUCTION DATA SAFETY:
  Existing data changes:  YES / NO
  Migration required:     YES / NO
  Rollback possible:      YES / NO
  Backup required:        YES / NO
  Downtime:               YES / NO

BUSINESS IMPACT:
ROLLBACK STEPS:
STATUS: Open / Fixed / Retracted / Needs Inspection
```

---

## G1 — Database Integrity & Object Inventory

> **Status**: ✅ COMPLETE (2026-06-26)
> **Artifacts**: `flowtracker/DB_INTEGRITY_AUDIT.md`, `flowtracker/ENTERPRISE_BASELINE.md`
> **Next**: G1.5 — Object Usage Classification

**Goal**: Catalog every database object with DDL evidence and compare migration history against live DB.

### Scope

For every table, inspect:
- [ ] Full DDL (columns, types, defaults, constraints)
- [ ] Primary key
- [ ] All foreign keys: source column → target table+column, ON DELETE/UPDATE rule
- [ ] All CHECK constraints: values allowed
- [ ] All UNIQUE constraints
- [ ] All indexes: present? appropriate?
- [ ] All triggers: event, timing, function body (via `pg_get_triggerdef()`)
- [ ] All RLS policies: policy expression, target role
- [ ] All RPCs: source code, parameter list, security definer flag
- [ ] All functions: source code, return type
- [ ] All storage buckets: public policy, RLS

### Classification → Now handled by G1.5

Object classification (Active / Partial / Legacy / Dead / Prototype) has been moved to its own phase. See **G1.5 — Object Usage Classification** below.

### Tables to Inspect

From migration files + live DB probe:
- `profiles`, `candidates`, `job_postings`, `applications`, `interviews`, `offer_letters`, `candidate_onboarding`
- `leaves`, `complaints`, `employee_attrition`
- `tasks`, `projects`, `work_logs`
- `attendance`, `weekly_attendance`
- `payroll_history_records`, `salary_revision_history`
- `promotions`, `transfer_history`, `promotion_history`, `position_history`, `employee_history`, `role_history`, `department_history`
- `notifications`, `messages`, `chat_rooms`
- `reports`, `employee_analytics`, `performance_trends`
- `proctoring_logs`, `assessments`, `assessment_questions`
- `employment_history`, `education_details`
- `audit_logs` (if exists)

### Deliverable

`flowtracker/DB_INTEGRITY_AUDIT.md` — one section per table with DDL, FKs, triggers, RLS, and dependency impact.

### Stop Conditions

G1 is complete only when:

- [ ] Every table inventoried with DDL evidence
- [ ] Every FK verified against live DB
- [ ] Every function/RPC cataloged (live + migration)
- [ ] Every storage bucket cataloged
- [ ] Every finding has an Evidence Register entry
- [ ] Coverage metrics reported (tables, RPCs, triggers, policies, buckets)
- [ ] Enterprise Baseline v1 frozen (`ENTERPRISE_BASELINE.md`)
- [ ] Evidence coverage ≥95% (all findings have EV-IDs)
- [ ] No unresolved contradictions between findings
- [ ] All provisional findings documented with "Next Evidence Required"
- [ ] User approval obtained

---

## G1.5 — Object Usage Classification

### Scope

Classify every DB object using a 5-state system with runtime verification. Determines what G2 (Backend Logic) must inspect and what can be deferred to cleanup/refactor.

### Classification States

| Status | Meaning | G2 Inheritance | Next Action |
|--------|---------|----------------|-------------|
| ✅ **Active** | Used in production, verified at runtime | Inspect in G2 | — |
| 🟡 **Partial** | Used by some workflows, gaps remain | Inspect in G2 | Document gaps |
| ⚪ **Legacy** | Old but still referenced | Deferred to G8 | Refactor planning |
| 🔴 **Dead** | Never referenced in code or runtime | Deferred to G7 | Cleanup |
| 🔵 **Prototype** | Development only, not in production | Excluded | Separate evaluation |

### Objects to Classify

| Category | Count | Coverage Target |
|----------|-------|-----------------|
| Tables | ~52 (migrations) / ~36 (live) | 100% |
| RPCs (functions) | 12+ in migrations, 2 live | 100% |
| Triggers | 15+ in migrations, 1 confirmed live | 100% |
| RLS policies | ~100+ estimated | 80% (requires service_role) |
| Storage buckets | 4 confirmed | 100% |
| Edge Functions | unknown | 100% |
| Realtime subscriptions | 26 known from code | 100% |
| Cron jobs / scheduled tasks | 0 known | 100% |
| Indexes | from migrations | 80% |

### Classification Method (8-Step Active Chain)

Every object must pass through all eight gates before it can be classified as **Active**:

```
1. SCHEMA EXISTS
   Object exists in live DB (information_schema, pg_proc, pg_trigger)
   → If not found → mark MISSING

2. REFERENCED BY CODE
   grep src/ for object references (table name, RPC name, trigger name)
   → If not found → mark DEAD (provisional — confirm in step 3)

3. EXECUTED
   The code path is reachable and triggers the DB query/call
   → If code path is unreachable → mark DEAD

4. OBSERVED
   The query/call executes successfully and returns data
   → If query fails → mark BROKEN or PARTIAL

5. BUSINESS RESULT VERIFIED
   The returned data is consumed and displayed by the application
   → Cross-reference output against the expected business rule
   → If output is wrong → mark PARTIAL with bug reference

6. MATHEMATICALLY VERIFIED (for calculated values)
   Trace every formula: INPUT → INTERMEDIATE → OUTPUT → EXPECTED → DIFFERENCE → REASON
   → See Mathematical Verification template below
   → If formula is incorrect → mark PARTIAL with bug reference

7. REGRESSION VERIFIED
   Confirm no unintended side effects from the object's operation
   → Compare pre/post state, check dependent objects
   → If regression found → do not classify Active until resolved

8. CROSS-WORKFLOW VERIFIED
   For objects used by multiple workflows (e.g., profiles), verify correct behavior in EVERY workflow
   → If an object works in Recruitment but breaks in Payroll → mark PARTIAL, not Active
   → Active status requires all workflows to pass
```

**Important**: Passing steps 1-4 qualifies an object as **Partial**, not Active. Steps 5-8 elevate to **Active**. Objects failing step 5 are **Partial (incorrect output)**. Objects failing step 6 are **Partial (incorrect math)**. Objects failing step 8 are **Partial (cross-workflow gap)**. Objects with no workflow path are **Dead**.

### Classification Order

Classify objects **by enterprise workflow**, not alphabetically. This validates the most business-critical paths first:

1. **Recruitment → Onboarding → Employee** — job_forms → candidates → job_applications → assessments → assessment_tokens → assessment_attempts → interview_sessions → offer_letters → candidate_onboarding → profiles
2. **Attendance → Payroll → Payslip** — attendance → weekly_attendance → profiles(payroll_ctc) → salary_revision_history → payroll_history_records
3. **Leave Request → Approval → Payroll Impact** — leaves → profiles(leave_balance) → payroll deductions
4. **Task Assignment → Performance → Promotion** — tasks → work_logs → employee_analytics → profiles(performance_score) → promotions → salary_revision_history
5. **Complaint → Investigation → Resolution** — complaints → notifications → profiles
6. **Resignation → Exit Clearance → Deactivation** — resignations → employee_attrition → profiles(employment_status)
7. **Transfer → Department Update → Reporting Structure** — transfer_history → profiles(department, team_lead_id)

This ensures high-risk, multi-object workflows are validated before low-risk single-object ones.

### Source of Truth

Every object classification must explicitly state where the canonical value lives and whether duplicates exist:

```
FIELD: profiles.payroll_ctc
SOURCE OF TRUTH: profiles.payroll_ctc (database column)
ALTERNATIVE SOURCES: None
DUPLICATE SOURCES: executive_metrics.total_payroll (aggregate, may drift)
CANONICAL? Yes — this is the authoritative value
```

```
TABLE: profiles
SOURCE OF TRUTH: profiles table via Supabase PostgREST
ALTERNATIVE SOURCES: get_enterprise_metrics() RPC (headcount aggregations)
DUPLICATE SOURCES: candidate_applications (profile_id → candidate_id mapping)
CANONICAL? Yes — primary identity record
```

Multiple implementations of the same business concept (e.g., 3 different payroll formulas across 4 pages) must be documented as **non-canonical duplicates** until unified.

### Change Risk

Every object includes a risk rating for schema or code changes:

| Risk | Meaning | Example |
|------|---------|---------|
| **Safe** | Local change only, no downstream dependencies | Dead object with no code refs |
| **Moderate** | Few dependencies, contained impact | `transfer_history` (used by Transfer workflow only) |
| **High** | Used across several workflows | `notifications` (trigger-based, multiple consumers) |
| **Critical** | Core enterprise entity, dozens of dependencies | `profiles` (used by every workflow) |

An object with Critical change risk requires **additional regression verification** before any modification and should be the last object modified in any batch.

### Classification Template (Full)

```
OBJECT: profiles
TYPE: Table
EVIDENCE IDS: EV-DB-PROFILES-001, EV-UI-ADMIN-DASHBOARD-005, EV-RPC-GET_ENTERPRISE_METRICS-001

SCHEMA EXISTS:     ✅ — 11 columns, PK on id
CODE REFERENCE:    ✅ — 47 references in src/
EXECUTED:          ✅ — Admin Dashboard queries via get_enterprise_metrics()
OBSERVED:          ✅ — Returns 514 rows, all columns present
BUSINESS VERIFIED: ✅ — Headcount cards display correct counts in Admin Dashboard
MATH VERIFIED:     N/A — no calculation for base object
REGRESSION:        ✅ — No side effects from SELECT queries
CROSS-WORKFLOW:    ⏳ — Used by Recruitment, Payroll, Performance, Attendance, Leave, Chat, AI, Analytics, Exit. Not yet verified in all. See specific workflow sections.

SOURCE OF TRUTH:
  Canonical:     profiles table (primary identity record)
  Alternatives:  get_enterprise_metrics() RPC (headcount aggregations)
  Duplicates:    candidate_applications (profile_id → candidate_id)
  Drift Risk:    Low — single source for all profile reads

CHANGE RISK: Critical — core enterprise entity, every workflow depends on it
DATA OWNER: HR

STATUS: 🟡 Partial (cross-workflow verification incomplete — step 8 pending)
REMOVAL SAFETY: NO — core entity
CRITICAL CHAINS: Recruitment → Onboarding → Employee → Payroll → Analytics → AI → Exit
```

```
OBJECT: salary_revision_history
TYPE: Table
EVIDENCE IDS: EV-DB-SALARY_REVISION_HISTORY-001, EV-UI-HR-PAYROLL-012

SCHEMA EXISTS:     ✅ — 5 columns: id, employee_id, new_salary, revised_by, created_at
CODE REFERENCE:    ✅ — 2 references (hr/Payroll.tsx:339-352 INSERT, migration DDL)
EXECUTED:          ✅ — HR Payroll form submitted
OBSERVED:          ❌ — INSERT returns success but row not visible (RLS block, Finding N3)
BUSINESS VERIFIED: ❌ — Write path broken, data never persisted
MATH VERIFIED:     N/A
REGRESSION:        N/A
CROSS-WORKFLOW:    N/A — only used by Payroll

SOURCE OF TRUTH:
  Canonical:     salary_revision_history (historical salary changes)
  Alternatives:  None
  Duplicates:    None
  Drift Risk:    High — no data can be written currently due to RLS

CHANGE RISK: Moderate — only affects Payroll workflow
DATA OWNER: Payroll / Finance

STATUS: 🟡 Partial (write path broken — Finding N3)
REMOVAL SAFETY: UNKNOWN — payroll feature depends on it, but non-functional
CRITICAL CHAINS: Payroll
```

```
OBJECT: transfer_history
TYPE: Table
EVIDENCE IDS: EV-DB-TRANSFER_HISTORY-001

SCHEMA EXISTS:     ✅ — empty table with schema from migration
CODE REFERENCE:    ✗ — no references found in src/
EXECUTED:          ✗ — no code path triggers this table
OBSERVED:          N/A
BUSINESS VERIFIED: N/A
MATH VERIFIED:     N/A
REGRESSION:        N/A
CROSS-WORKFLOW:    N/A — no workflow currently uses this table

SOURCE OF TRUTH:
  Canonical:     transfer_history (intended as historical transfer record)
  Alternatives:  None
  Duplicates:    None
  Drift Risk:    N/A — no data, no code paths

CHANGE RISK: Safe — no dependencies, no code references
DATA OWNER: HR

STATUS: ⚪ Legacy (pending runtime verification — intended for Transfer workflow)
REMOVAL SAFETY: UNKNOWN — may be needed once Transfer workflow is implemented
CRITICAL CHAINS: Employee Lifecycle (Transfer step)
```

### Critical Chains

Every object indicates which enterprise chain(s) it belongs to:

```
CHAIN: Recruitment
  Job Posting → Application → Screening → Assessment → Interview → Offer → Onboarding
  Tables: job_postings, candidates, applications, assessments, interview_sessions, offer_letters, candidate_onboarding

CHAIN: Employee Lifecycle
  Onboarding → Attendance → Leave → Performance → Promotion → Transfer → Resignation → Exit
  Tables: profiles, employee_onboarding, attendance, leaves, tasks, work_logs, promotions, transfer_history, employee_attrition

CHAIN: Payroll
  CTC Setup → Payslip → Deductions → History → Dashboard
  Tables: profiles, salary_revision_history, payroll_history_records, payroll_ledger

CHAIN: Analytics
  Headcount → Department → Payroll → Performance → Attrition → Hire Rate
  RPCs: get_enterprise_metrics, get_team_metrics
  Tables: employee_analytics, hiring_stats, pipeline_stats, executive_metrics, performance_trends

CHAIN: AI
  Data Collection → Prompt → AI Proxy → Response → Display
  Edge Functions: ai-proxy

CHAIN: Communication
  Chat → Notifications → Complaints
  Tables: chat_messages, messages, notifications, complaints

CHAIN: Exit
  Resignation → Notice → Settlement → Deactivation → Attrition
  Tables: resignations, employee_attrition, profiles
```

### Removal Safety

For every Dead/Legacy object, document:

```
OBJECT: [name]
STATUS: Dead / Legacy
CAN REMOVE? YES / NO / UNKNOWN
REASON: [explanation]
AFFECTED:
- [ ] No workflows affected
- [ ] Code references found (dead paths)
- [ ] Migration references exist (squash needed)
- [ ] Historical data loss
```

### Runtime Coverage Target

Each object's classification records which of the 7 Active-chain steps have been completed.

| Category | Target | Method |
|----------|--------|--------|
| Tables | 36/36 accessible (100%) | *Existence*: information_schema. *Code*: grep. *Executed/Observed*: run workflow. *Business/Math/Regression*: verify output. |
| RPCs | 2/2 live (100%) | Execute + trace SQL → Dashboard → Displayed KPI → Expected → Difference → Explanation |
| Triggers | 1/1 confirmed (100%) | Fire via INSERT/UPDATE, observe side effects |
| Storage buckets | 4/4 (100%) | Upload → Download → Signed URL → RLS → Delete → Metadata |
| Realtime channels | 26/26 (100%) | Code grep + subscription test |

> **Note**: "Coverage" means steps 1-4 (Schema → Code → Execute → Observe) are complete. Steps 5-7 (Business → Math → Regression) are per-object verification targets, tracked individually, not aggregated into a single percentage.

### Deliverable

`flowtracker/OBJECT_USAGE_CLASSIFICATION.md`

### G1.5 Validation Sub-Steps (Permanent IDs: G1.5-A through G1.5-J)

Before any object may be reclassified from Partial to Active, or before G1.5 may be considered complete for any workflow, ALL of the following sub-steps must be completed for that workflow. Every finding or certification checkpoint may reference a sub-step by its permanent ID (e.g., `WF-01 failed G1.5-D and G1.5-F`).

#### G1.5-A — Complete Workflow Execution

Do NOT test tables individually. Execute the actual end-to-end workflow:

```
Example — Recruitment:
HR creates Job
↓
Candidate registers
↓
Candidate applies
↓
Resume parsed
↓
AI score generated
↓
Assessment assigned
↓
Assessment attempted
↓
Interview scheduled
↓
Interview completed
↓
Offer generated
↓
Offer accepted
↓
Onboarding completed
↓
Profile created
↓
Employee login works
```

For every transition, verify:
- [ ] Database row created/updated
- [ ] Frontend updates (UI reflects new state)
- [ ] API response returns correct data
- [ ] Triggers fire (if applicable)
- [ ] Notifications generated (if applicable)
- [ ] Audit entries created (if applicable)
- [ ] RLS enforced (correct user sees correct data)
- [ ] Realtime subscription delivers event (if applicable)

#### G1.5-B — Runtime Evidence Production

For every object in the workflow, produce:

```
SQL result     — raw query output proving data exists/structure correct
REST response  — Supabase API response for the relevant query
Supabase response — .single() or .maybeSingle() return value
Frontend render — actual rendered component showing the data
Playwright trace — recorded trace proving the UI path executes
Console logs   — request/response logs captured during execution
Realtime event — subscription payload if applicable
Trigger execution — BEFORE/AFTER trigger output (select trigger)
```

Without runtime evidence, confidence in any finding cannot exceed 80%.

#### G1.5-C — Foreign Key Path Verification

For every FK relationship in the workflow chain:

```
TABLE A
  ↓ FK (col → table.col, ON DELETE/UPDATE rule)
TABLE B

Verify:
- [ ] Orphan rows: SELECT * FROM A WHERE fk_col NOT IN (SELECT id FROM B)
- [ ] Cascade: DELETE FROM B WHERE id=X → check A rows deleted (if CASCADE)
- [ ] Delete prevented: DELETE FROM B WHERE id=X → verify RESTRICT/NO ACTION blocks it (if RESTRICT)
- [ ] Update: UPDATE B SET id=Y WHERE id=X → check A.fk_col updated (if CASCADE)
- [ ] Nullability: Can fk_col be NULL? If yes, verify application handles null FK gracefully
- [ ] Duplicate paths: Are there multiple FK paths between same tables? (e.g., candidate_applications + job_applications)
```

Example — Recruitment FK chain:
```
job_forms → job_applications → assessment_tokens → assessment_attempts → interview_sessions → offer_letters → candidate_onboarding → profiles
```

#### G1.5-D — Trigger Verification

For every trigger on every table in the workflow:

```
TRIGGER: trg_example

Verify:
- [ ] BEFORE INSERT — does the trigger run? Does it modify the row? Capture NEW.*
- [ ] AFTER INSERT — does the trigger run? Does it create side effects (notifications, audit)?
- [ ] UPDATE — same verification as INSERT (OLD vs NEW comparison)
- [ ] DELETE — does the trigger fire on delete? Does it archive/soft-delete?
- [ ] Rollback — if the trigger function raises EXCEPTION, does the entire transaction roll back?
- [ ] Failure path — what happens if the trigger's target table doesn't exist? Graceful error?
- [ ] Multiple inserts — if inserting 10 rows in a batch, does the trigger fire 10 times (ROW level) or once (STATEMENT level)?
```

Do NOT assume trigger existence = correct behavior. Every trigger must be verified by firing it.

#### G1.5-E — RPC Verification

For every RPC used in the workflow:

```
RPC: function_name(args)

Verify:
- [ ] SQL definition — read the function body (CREATE OR REPLACE FUNCTION ...)
- [ ] Input — valid arguments produce correct output
- [ ] Output — return format matches caller expectations
- [ ] Math — for calculated values: INPUT → INTERMEDIATE → OUTPUT → EXPECTED → DIFFERENCE → REASON
- [ ] NULL handling — what happens when input is NULL?
- [ ] Empty database — what happens when there are no rows?
- [ ] Large database — what happens with 500+ rows? Performance acceptable?
- [ ] Permission — does the function use SECURITY DEFINER? Is auth.uid() checked?
- [ ] Performance — EXPLAIN ANALYZE output. Index usage.
- [ ] Execution plan — can the query be optimized?
```

#### G1.5-F — RLS Verification Matrix

For every table in the workflow, produce a PASS/FAIL matrix:

```
TABLE: example_table

| Role       | SELECT | INSERT | UPDATE | DELETE |
|------------|--------|--------|--------|--------|
| Admin      | ✅/❌  | ✅/❌  | ✅/❌  | ✅/❌  |
| HR         | ✅/❌  | ✅/❌  | ✅/❌  | ✅/❌  |
| Employee   | ✅/❌  | ✅/❌  | ✅/❌  | ✅/❌  |
| Team Lead  | ✅/❌  | ✅/❌  | ✅/❌  | ✅/❌  |
| Candidate  | ✅/❌  | ✅/❌  | ✅/❌  | ✅/❌  |
| Anonymous  | ✅/❌  | ✅/❌  | ✅/❌  | ✅/❌  |
```

Test each cell by executing the operation as that role against the live API.

#### G1.5-G — AI Field Trace

For every AI-generated value in the workflow:

```
AI VALUE: match_score on job_applications

Trace:
Database
  ↓ Which records? Which columns?
Prompt
  ↓ What is the exact system prompt? User context?
Edge Function
  ↓ What does ai-proxy/index.ts do? Read the source.
Model
  ↓ Which model? (Qwen/Qwen3-32B:groq via HuggingFace router)
Response
  ↓ Raw response from model. Capture it.
Post-processing
  ↓ Any formatting/truncation/transformation client-side?
Displayed value
  ↓ What does the user actually see?

Classification:
  Uses DB:             YES / NO
  Uses Company Policy: YES / NO
  Hallucination Risk:  LOW / MEDIUM / HIGH
  Reproducible:        YES / NO (same input → same output?)

If any number cannot be traced from DB through to display, mark it as:
  "Generated — NOT Authoritative"
```

#### G1.5-H — Mathematical Verification

For every displayed KPI in the workflow:

```
KPI: [name]

SQL
  ↓ Raw query producing the value
Transformation
  ↓ Any client-side calculation
Formula
  ↓ INPUT → INTERMEDIATE → OUTPUT
Rounded value
  ↓ How is it rounded/formatted?
Displayed value
  ↓ What appears on screen?
Expected value
  ↓ What should appear based on business rules?
Difference
  ↓ Actual - Expected (0 = correct)
Reason
  ↓ Why any difference exists
```

No undocumented calculations. Every value must have a documented chain.

#### G1.5-I — Automation Audit

For every semi-automated or automated process in the workflow:

```
EVENT: [e.g., "Assessment token created on application submit"]

Determine:
  Manual?     — e.g., HR clicks "Send Offer" button
  Trigger?    — e.g., AFTER INSERT on applications → token created
  Cron job?   — e.g., monthly payroll runs
  Edge Function? — e.g., ai-proxy called
  RPC?        — e.g., get_enterprise_metrics() called on dashboard load
  Frontend?   — e.g., candidate status calculated client-side

For each, verify:
- [ ] Who starts it?
- [ ] When does it run?
- [ ] What records are created/updated?
- [ ] What notifications are sent?
- [ ] What happens on failure?
- [ ] Is there a retry mechanism?
- [ ] Is there a rollback plan?
```

#### G1.5-J — Enterprise Lifecycle Execution

Create real users in the real database (not mock objects):

```
Create:
  Admin     — can view everything, manage roles
  HR        — can manage recruitment, payroll, complaints
  Recruiter — can manage job forms, candidates, interviews
  Candidate — can view jobs, apply, take assessments, view interviews
  Employee  — can view dashboard, projects, chat
  Team Lead — can view team dashboard, approve leaves
  Manager   — can view reports, approve promotions

Then execute (against real DB):
  Project creation
  Task assignment
  Leave application + approval
  Attendance clock in/out
  Complaint filing + resolution
  Chat message + read + delete
  Promotion request + approval
  Transfer request + approval
  Salary revision
  Payroll processing
  Payslip generation
  Resignation submission
  Exit clearance
```

Everything must execute against the live Supabase database. No mocks, no test data.

---

### Reclassification After Evidence

Once a workflow's sub-steps A-J are complete, objects in that workflow may be reclassified:

```
Evidence Criteria → New Status
────────────────────────────────────────────
Steps 1-4 complete (schema + code + execute + observe):
  → 🟡 Partial (can be inherited by G2)

Steps 1-7 complete (schema through regression):
  → 🟡 Partial (ready for cross-workflow check)

Steps 1-8 complete + all workflow transitions verified:
  → ✅ Active (eligible for G2 full inspection)

Legacy/Unverified objects with no evidence of use:
  → ⚪ Legacy (deferred to G8)
  OR → 🔴 Dead (ONLY if migration/trigger/integration audit confirms zero references)
```

**Rule**: Do NOT reclassify based on code inspection alone. Only reclassify after sub-steps A-J produce evidence for that workflow.

### Stop Conditions (Updated)

G1.5 is complete only when:

For EVERY enterprise workflow (Recruitment, Payroll, Performance, Attendance, Leave, Communication, Exit):

- [ ] All objects have provisional 5-state classification (🟡 Partial / ⚪ Legacy/Unverified / 🔴 Dead / 🔵 Prototype / ✅ Active)
- [ ] Sub-steps A-J completed for that workflow against live DB
- [ ] Runtime evidence produced for every transition (SQL result, REST response, Supabase response, Frontend render, Playwright trace, Console log, Realtime event, Trigger execution)
- [ ] FK paths verified (no orphans, cascade correct, nullability documented)
- [ ] Triggers executed and verified (not just existence-checked)
- [ ] RPCs verified (definition, input, output, math, edge cases, NULL, empty, large, permissions)
- [ ] RLS matrix produced (every role × every operation per table)
- [ ] AI fields traced (DB → prompt → Edge Function → model → response → display)
- [ ] Mathematics verified (SQL → transformation → formula → rounded → displayed)
- [ ] Automation classified (manual / trigger / cron / edge function / RPC / frontend)
- [ ] Enterprise lifecycle executed (real users, real operations, real DB)
- [ ] Objects reclassified based on evidence (not code-inspection alone)
- [ ] G2 inheritance scope defined (only Active/Partial objects)
- [ ] Removal safety documented for every Legacy/Unverified object (after migration/trigger/integration audit)
- [ ] Critical chain membership recorded for every Partial/Active object
- [ ] Coverage metrics reported per workflow (objects classified, steps verified, evidence produced)
- [ ] No P0/P1 blocking findings remain unresolved for this workflow
- [ ] User approval obtained per workflow

**Gate G1.5→G2**: Only proceed when the Recruitment workflow is 100% verified (all sub-steps A-J complete, all objects reclassified based on evidence). All other workflows may remain in provisional status.

---

## G2 — Backend Logic Audit

> **Inheritance Rule**: G2 may only inspect objects classified as **Active** or **Partial** in G1.5. Dead → G7. Legacy → G8. Prototype → Excluded.

### Scope

For every RPC, function, trigger, and Edge Function:
- [ ] Source code read and verified
- [ ] Parameters documented and validated
- [ ] Edge cases tested (nulls, empty sets, invalid IDs)
- [ ] Error handling: what happens on failure?
- [ ] Caller verification: does it check auth.uid()?

### RPC Verification Chain

Don't stop at "RPC returns JSON." Every RPC that produces business metrics requires:

```
SQL

↓

Returned data

↓

Dashboard / Consumer

↓

Displayed KPI

↓

Expected KPI

↓

Difference

↓

Explanation
```

For example:

```
RPC: get_enterprise_metrics()
SQL:  SELECT COUNT(*) FROM profiles WHERE employment_status IS DISTINCT FROM 'terminated'
      → active_headcount: 513

DASHBOARD: Admin Dashboard — "Active Headcount" card
DISPLAYED: 513
EXPECTED:  513 (profiles minus terminated)
DIFFERENCE: 0
EXPLANATION: RPC counts non-terminated profiles — correct for current schema
VERIFIED: ✅
```

But:

```
RPC: get_hires_this_month()
SQL:  SELECT COUNT(*) FROM profiles WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)
      → hires_this_month: 513

DASHBOARD: Admin Dashboard — "Hires This Month" card
DISPLAYED: 513
EXPECTED:  Should count actual hire events, not profiles.created_at
DIFFERENCE: Large (likely 0 actual hires vs 513 shown)
EXPLANATION: Formula uses wrong source — profiles.created_at instead of employee_onboarding.join_date
VERIFIED: ❌ — Finding N11 (P1)
```

### Objects to Inspect

> The following list is provisional and will be narrowed by G1.5 classification.

- `get_enterprise_metrics()` (read: ✅ done)
- `get_team_metrics(lead_id)` (read: ✅ done)
- `get_active_headcount()` (read: ✅ done)
- `get_hires_this_month()` (read: ✅ done)
- `get_pending_leaves_count()` (read: ✅ done)
- `get_open_complaints_count()` (read: ✅ done)
- `get_headcount_by_role()` (read: ✅ done)
- `get_headcount_by_department()` (read: ✅ done)
- `get_total_profile_count()` (read: ✅ done)
- `fn_audit_trigger()` (partially read)
- `fn_prevent_self_role_change()` trigger (read: ✅ from migration)
- `trg_complaints_audit` (NOT read — must export from live DB)
- `ai-proxy` Edge Function (NOT read)
- Any other triggers/functions found in G1

### Deliverable

`flowtracker/BACKEND_LOGIC_AUDIT.md`

### Stop Conditions

G2 is complete only when:

- [ ] Every RPC inspected (source code read and verified)
- [ ] Every Edge Function read (`ai-proxy` source inspected)
- [ ] Every trigger execution path mapped
- [ ] Every API mutation traced
- [ ] Every auth.uid() check verified
- [ ] Every finding has an Evidence Register entry
- [ ] Coverage metrics reported (RPCs, Edge Functions, triggers)

---

## G3 — Frontend Data Lineage Audit

### Scope

For every page in `src/pages/`, produce a **Data Lineage Map** (see template above).

### Pages to Inspect

- Admin: Dashboard, Analytics, Payroll, MasterDirectory, AIInsights, Chat
- HR: Dashboard, Payroll, AIInsights, PerformanceEngine, EmployeeInvite, OnboardingCenter
- Employee: Dashboard, Analytics, Payroll, AIInsights, Projects, Chat
- Team Lead: Dashboard, AIInsights, Payroll, Analytics
- Candidate: Identity, Interviews, Assessments
- Auth: Register, Login, EmployeeActivation
- Public: AssessmentAccess

### For Each Page

- [ ] Render path identified
- [ ] Every displayed value traced
- [ ] State variables classified (DB vs hardcoded vs AI vs computed)
- [ ] Error states inspected
- [ ] Loading states inspected
- [ ] Empty states inspected
- [ ] Dependency graph produced

### Deliverable

`flowtracker/FRONTEND_LINEAGE_AUDIT.md`

### Stop Conditions

G3 is complete only when:

- [ ] Every page in `src/pages/` has a Data Lineage Map
- [ ] Every displayed value classified (DB / computed / hardcoded / AI)
- [ ] Error states, loading states, empty states documented
- [ ] Dependency graph produced per page
- [ ] Coverage metrics reported (pages inspected, values traced)

---

## G4 — Business Rule Validation

### Scope

For every feature, answer:

```
WHY does this exist?
WHO uses it?
WHAT database tables does it touch?
WHAT workflow does it follow?
WHAT approvals are required?
WHAT exceptions can occur?
WHAT validations are enforced?
WHAT are the edge cases?
WHAT are the failure modes?
WHAT is the rollback plan?
```

### Features to Document

Existing BUSINESS_RULE_CATALOG.md covers: Leave, Complaint, Onboarding, Recruitment, Performance, Payroll, AI, Analytics, Exit, Promotion.

**Missing sections to add**: Assessments, Chat, Notifications, Projects, Attendance

### Deliverable

Updated `BUSINESS_RULE_CATALOG.md`

### Stop Conditions

G4 is complete only when:

- [ ] Every feature has a documented business rule with authority
- [ ] Missing sections added (Assessments, Chat, Notifications, Projects, Attendance)
- [ ] Every business rule cites its authority (Company Policy / Legal / Industry Standard)
- [ ] Every edge case and failure mode documented

---

## G5 — Mathematical Verification

### Scope

For every calculated value, produce a **Mathematical Proof**:

```
INPUT  →  INTERMEDIATE  →  OUTPUT  →  EXPECTED  →  DIFFERENCE  →  REASON
```

### Formulas to Verify

**Payroll (CROSS-PAGE COMPARISON — same employee, same CTC)**:
- Admin Payroll: `SUM(payroll_ctc) / 12`
- HR Payroll: `baseCtc * 0.50 + 0.20 + 0.10 + 0.10 + 0.10`, then `gross * 0.18` tax, `basic * 0.12` PF
- Employee Payroll: `annualCTC / 12 * 0.60`, allowances `* 0.15`, tax `* 0.18`
- TL Payroll: Same as Employee Payroll (identical component)

**Attendance**: All dashboard variations

**Performance**: `includes('complet')` bug (FIXED), `=== 'Completed'` verification, `employee_analytics.ai_performance_score` usage, `profiles.performance_score` usage

**Analytics**: Completion rate, retention rate, attrition rate, hiring trend

**Leaves**: Balance calculation, pending count

**Experience/Tenure**: `profiles.employment_start_date` or `created_at` based

### Deliverable

`flowtracker/MATHEMATICAL_VERIFICATION.md`

### Stop Conditions

G5 is complete only when:

- [ ] Every payroll formula verified with same-employee comparison
- [ ] Attendance, performance, analytics formulas verified
- [ ] Each formula has INPUT → INTERMEDIATE → OUTPUT → EXPECTED → DIFFERENCE → REASON
- [ ] Cross-page formula differences documented with authority references

### QUALITY GATE (Before Proceeding to G6)

Before G5 is formally closed, check:

- [ ] Any unresolved P0 issues? If yes → STOP. Resolve before proceeding.
- [ ] Any unresolved P1 issues? If yes → STOP. Resolve before proceeding.
- [ ] Any workflows blocked by incomplete evidence? If yes → STOP.
- [ ] Has any previous finding been retracted in the last 3 phases? If yes → review.
- [ ] Is evidence coverage above 95% for all findings? If no → gap analysis.
- [ ] Enterprise Baseline compared: [v1 hash] vs current — any divergence?
- [ ] Migration aggregate compared: [v1 hash] vs current — any divergence?

If any answer requires STOP, do not begin G6 until the issue is resolved.

---

## G6 — Automation Verification

### Discovery Phase First

Find ALL automations in the codebase:
- [ ] Cron jobs (`pg_cron`, `supabase functions` with schedule)
- [ ] DB triggers (INSERT/UPDATE/DELETE → function)
- [ ] Scheduled Edge Functions
- [ ] Webhooks (incoming/outgoing)
- [ ] Any setInterval/setTimeout in frontend

### For Each Automation

```
WHO starts it?
WHEN does it run?
SCHEDULER defined? (cron expression)
TRIGGER defined? (event + timing)
RPC or function called?
RECORDS created?
HISTORY updated?
LEDGER updated?
NOTIFICATION sent?
DASHBOARD updated?
EMAIL sent?
AUDIT LOG written?
ERROR HANDLING defined?
RETRY LOGIC defined?
ROLLBACK defined?
```

If any step is missing → **Automation FAIL**.

### Deliverable

`flowtracker/AUTOMATION_AUDIT.md`

### Stop Conditions

G6 is complete only when:

- [ ] Every automation discovered and cataloged
- [ ] Every automation step ownership mapped (who starts, when, scheduler, trigger, RPC, records, notifications, audit)
- [ ] Gaps identified per automation
- [ ] Every automation classified PASS/FAIL

---

## G7 — AI Hallucination Audit

### Scope

Every AI feature in the application must document:

- [ ] Full prompt sent to `ai-proxy` Edge Function
- [ ] Input data: exactly what DB records, computed values, and context are provided
- [ ] Database records used: table names, row counts, column filters
- [ ] Computed values (pre-processing): any aggregation/calculation done before AI
- [ ] AI output: raw response from model
- [ ] Post-processing: any transformation done client-side before display
- [ ] Displayed result: what the user actually sees
- [ ] Classification: AI Opinion / AI Prediction / AI Recommendation / AI Generated Text / AI Computation / AI Summary
- [ ] Uses DB: YES/NO
- [ ] Uses Company Policy: YES/NO
- [ ] Hallucination risk: LOW/MEDIUM/HIGH
- [ ] Reproducibility: same input → same output? confidence score provided?
- [ ] Explainability: can the model explain which records support its conclusion?

### AI Features to Audit

1. Admin AI Insights — Department Analytics, Hiring Predictions, Workforce Forecasting
2. HR Dashboard — Flight Risk (AI Prediction), Sentiment (AI Estimate), Comp Benchmarker (AI Estimate), Onboarding Plan (AI-generated)
3. HR AIInsights — Predictive Attrition (AI Prediction), Acquisition Velocity (AI Recommendation), DEI Matrix (AI Recommendation)
4. Employee AIInsights — Task Performance Score, Productivity Pattern
5. TL AIInsights — Team Performance Insights, Workload Distribution
6. CareerPredictor component — AI Career Prediction

### Deliverable

`flowtracker/AI_HALLUCINATION_AUDIT.md`

### Prerequisite

Read `supabase/functions/ai-proxy/index.ts` — the Edge Function source code has NOT been inspected. This is the single most important piece of evidence for AI audit.

### Stop Conditions

G7 is complete only when:

- [ ] Every AI feature has a complete prompt→input→DB→output→display chain documented
- [ ] Hallucination risk assessed per feature (LOW/MEDIUM/HIGH)
- [ ] Reproducibility tested per feature
- [ ] Uses DB / Uses Company Policy flags documented per feature

---

## G8 — Security Audit

### Scope

- [ ] All RLS policies: GRANT/REVOKE per table, per operation
- [ ] All `SECURITY DEFINER` functions: privilege analysis
- [ ] All RPCs: auth.uid() checks (SEC-01, SEC-02 known open)
- [ ] Auth routes: registration (role enforcement), login, password reset
- [ ] ProtectedRoute: role verification logic
- [ ] Storage buckets: resumes, bgc_docs, avatars, offer_letters (RLS)
- [ ] API keys: full-repo grep (including deleted files)
- [ ] Session handling: token refresh, expiration
- [ ] Chat authorization: message delete (H-04 verified)
- [ ] Edge Function auth: ai-proxy access control

### Deliverable

`flowtracker/SECURITY_AUDIT.md`

### Stop Conditions

G8 is complete only when:

- [ ] Every RLS policy mapped
- [ ] Every SECURITY DEFINER function assessed
- [ ] Every RPC auth check verified
- [ ] API key search completed (full-repo grep)
- [ ] P0/P1 security findings documented with evidence

---

## G9 — Performance Audit

### Scope

- [ ] N+1 queries (PERF-01 known in PerformanceEngine)
- [ ] Realtime subscriptions: 26 known — list each, table size impact
- [ ] Pagination: missing on large tables (profiles 495 rows)
- [ ] SELECT * queries: column pruning opportunities
- [ ] Client-side aggregations: move to RPC
- [ ] HR Payroll: 200-row fetch without CTC filter
- [ ] AI proxy latency
- [ ] Dashboard cold-start load time

### Deliverable

`flowtracker/PERFORMANCE_AUDIT.md`

### Stop Conditions

G9 is complete only when:

- [ ] Every N+1 query identified
- [ ] Every realtime subscription documented with table size
- [ ] Pagination gaps documented
- [ ] AI proxy latency measured
- [ ] Dashboard load time measured
- [ ] Performance recommendations documented

---

## G10 — Enterprise Simulation

### Phase 1: Company Creation

Insert real records into Supabase:

```
1 CEO             (admin role)
3 HR              (hr role)
5 Team Leads      (team_lead role)
50 Employees      (employee role)
40 Candidates     (candidate role)
12 Departments
20 Projects
300 Tasks
500 Work Logs
150 Leaves
30 Complaints
15 Promotions
8 Transfers
6 Resignations
2 Retirements
3 Layoffs
2 Terminations
```

### Phase 2: Happy Path Workflows

Execute each workflow and verify every link in the chain:

1. **Recruitment**: HR creates job → Candidate applies → Screen → Assess → Interview → Offer → Accept → Onboard
2. **Onboarding**: Candidate→Employee conversion → Profile → Orientation complete
3. **Attendance**: 50 employees × 30 days clock in/out
4. **Leave**: Employee submit → TL approve → HR finalize → Balance update
5. **Payroll**: Monthly processing → Payslips → History → Dashboard
6. **Performance**: Task assign → Work log → Score → Review
7. **Promotion**: TL recommend → HR approve → Profile update → Salary revision → History
8. **Transfer**: Department change → Profile → History
9. **Complaint**: File → HR review → Resolve → Close
10. **Resignation**: Submit → Notice → Exit → Deactivate
11. **Retirement**: Age trigger → Exit → Pension → Deactivate
12. **Termination**: Process → Exit → Deactivate
13. **Chat**: Message → Read → Delete
14. **Notifications**: Auto-generated on every workflow event

### Phase 3: Edge Cases (Critical)

Simulate and verify:

- [ ] Employee resigns during onboarding (before orientation completes)
- [ ] HR rejects an offer after it was already approved
- [ ] Promotion followed immediately by salary revision (two sequential writes)
- [ ] Team lead resigns while owning active projects
- [ ] Employee transferred between departments mid-pay-cycle
- [ ] Complaint escalation (Employee → HR → Admin)
- [ ] Payroll calculation after promotion (changed CTC mid-cycle)
- [ ] Payroll calculation after resignation (partial month)
- [ ] Leave spanning two calendar months
- [ ] Failed assessment → retake → pass
- [ ] Failed background verification → offer rescinded
- [ ] Duplicate leave application (same dates)
- [ ] Leave application with past dates
- [ ] Clock-in without clock-out (missing punch)
- [ ] Double clock-in (two simultaneous punches)
- [ ] Overnight shift spanning two days
- [ ] Employee with zero CTC → payroll page shows what?
- [ ] Admin with no team → TL dashboard shows what?

### Phase 4: Stress Testing

Scale up and measure:

```
500 employees
100 managers
40 HR
3000 tasks
200 projects
25000 work logs
500 complaints
100 resignations
100 leaves
50 promotions
50 transfers
100 payroll runs
```

Measure:
- Query time before/after adding indexes
- Dashboard load time (cold vs warm)
- Memory usage per page
- Realtime subscription latency
- AI proxy response time (percentiles: p50, p95, p99)
- Supabase API usage count per workflow
- Client-side render time for large lists (500 employees)

### Deliverable

`flowtracker/ENTERPRISE_SIMULATION.md` (phase 1-2-3-4 sections)
+ SQL scripts at `flowtracker/simulation/` for reproducibility

### Stop Conditions

G10 is complete only when:

- [ ] Company created in Supabase (50+ employees, 40 candidates, all objects)
- [ ] All 14 happy path workflows executed and verified
- [ ] All 18 edge cases simulated and documented
- [ ] Stress testing completed at 500-employee scale
- [ ] Performance metrics collected (query time, dashboard load, AI latency)
- [ ] Every workflow has PASS/FAIL evidence

---

## G11 — Enterprise Certification

### Per-Feature Certification

Every feature gets:

```
FEATURE: [Name]
CLASSIFICATION: ✅ 🟡 🔵 ⚪ 🔴
CERTIFICATION: PASS / FAIL
LEVEL: L5B / L5A / L4 / L3 / L2 / L1

Database:     ✅ / ❌ / ⏳
Backend:      ✅ / ❌ / ⏳
Frontend:     ✅ / ❌ / ⏳
Workflow:     ✅ / ❌ / ⏳
Automation:   ✅ / ❌ / ⏳ / N/A
Math:         ✅ / ❌ / ⏳ / N/A
AI:           ✅ / ❌ / ⏳ / N/A
Security:     ✅ / ❌ / ⏳
Performance:  ✅ / ❌ / ⏳
Regression:   ✅ / ❌ / ⏳

REMAINING RISKS:
- [Px] [risk description]

DATA LINEAGE MAP: [link or inline]
DEPENDENCY GRAPH: [link or inline]
```

### Features to Certify

1. Recruitment
2. Assessments
3. Interviews
4. Offer Letters
5. Onboarding
6. Employees (Profile Management)
7. Attendance
8. Payroll
9. Performance
10. Projects & Tasks
11. Complaints / Grievance
12. Leaves
13. Chat
14. Notifications
15. Promotions & Transfers
16. Resignations, Retirement, Termination, Layoffs
17. Analytics & Reports
18. AI Insights
19. Dashboard (Admin, HR, Employee, TL)
20. Administration

### Stop Conditions

G11 is complete only when:

- [ ] All 20 features have a certification page with Enterprise Readiness Score
- [ ] Every feature has A/B/C+/C/F grade
- [ ] Every feature has remaining risks documented with P0-P4 priority
- [ ] Certification report published at `flowtracker/ENTERPRISE_CERTIFICATION_REPORT.md`

### Final Rule

Only features reaching **L5B** with **ALL PASS** across every dimension are eligible for business-logic or schema changes. Features below L5B may receive code-only fixes (labeling, formatting, error handling) but NOT business-logic changes.

---

## G12 — Enterprise Workflow Certification

### Purpose

G11 certifies individual features. G12 certifies **complete end-to-end workflows** — the chains that users actually experience. A feature may be individually certified (G11), but if the workflow connecting features is broken, the enterprise experience is broken.

### Workflows to Certify

Every complete enterprise workflow must pass certification as a whole:

| # | Workflow | Status |
|---|----------|--------|
| 1 | Recruitment (Job→Application→Screen→Assess→Interview→Offer→Accept→Onboard→Employee) | ⬜ Not Certified |
| 2 | Payroll Lifecycle (CTC Setup→Monthly→Payslip→History→Dashboard→Exit Settlement) | ⬜ Not Certified |
| 3 | Attendance Lifecycle (Clock In→Out→Weekly→Monthly→Dashboard) | ⬜ Not Certified |
| 4 | Leave Lifecycle (Submit→TL Approve→HR Finalize→Balance→Dashboard) | ⬜ Not Certified |
| 5 | Performance Lifecycle (Task→Work Log→Score→Review→Dashboard) | ⬜ Not Certified |
| 6 | Promotion Lifecycle (Recommend→Approve→Update→Salary Revision→History→Dashboard) | ⬜ Not Certified |
| 7 | Transfer Lifecycle (Request→Approve→Department Change→History) | ⬜ Not Certified |
| 8 | Complaint Lifecycle (File→HR Review→Resolve→Close→Dashboard) | ⬜ Not Certified |
| 9 | Resignation Lifecycle (Submit→Notice→Exit→Settlement→Deactivate→Attrition) | ⬜ Not Certified |
| 10 | Notification Lifecycle (Event→Create→Deliver→Dashboard Badge→Read→Clear) | ⬜ Not Certified |
| 11 | Chat Lifecycle (Message→Read→Delete→Notification) | ⬜ Not Certified |
| 12 | Analytics Lifecycle (DB→RPC→Dashboard→Display→Export) | ⬜ Not Certified |
| 13 | AI Lifecycle (Data→Prompt→AI Proxy→Response→Display→Hallucination Check) | ⬜ Not Certified |

### Certification Template

```
WORKFLOW: Recruitment
STATUS: ✅ Certified / ❌ Not Certified

COVERAGE: 100% (all objects classified Active in G1.5)
DATA LINEAGE: ✅ PASS (all data lineage maps complete — G3)
MATHEMATICAL: ✅ PASS (all formulas verified — G5)
AUTOMATION: ✅ PASS (all automation steps owned — G6)
AI: ✅ PASS (all AI features classified and hallucination-checked — G7)
SECURITY: ✅ PASS (all RLS policies, RPC auth checks verified — G8)
PERFORMANCE: ✅ PASS (no N+1, pagination verified — G9)
REGRESSION: ✅ PASS (pre/post comparison, no side effects — all phases)

REMAINING RISKS:
- [Px] [risk description]

DEPENDENCY GRAPH:
  [visual chain showing all objects in the workflow]

EVIDENCE IDS:
  EV-DB-..., EV-SQL-..., EV-RPC-..., EV-UI-..., EV-AI-..., EV-TEST-...
```

### Certification Rules

1. A workflow is **Not Certified** if any single link in the chain fails
2. A workflow is **Not Certified** if any object in the chain is not at least L5A
3. A workflow is **Not Certified** if any AI feature in the chain is not classified and hallucination-audited
4. If an object appears in multiple workflows, it must pass all of them (e.g., `profiles` appears in Recruitment, Payroll, Performance, Promotion, Transfer, Exit — must pass all 6)
5. No workflow may be certified until all its constituent features are G11-certified

### Stop Conditions

G12 is complete only when:

- [ ] All 13 workflows have a certification record
- [ ] Each workflow has coverage, data lineage, math, automation, AI, security, performance, and regression status
- [ ] Remaining risks documented per workflow
- [ ] Dependency graph produced per workflow
- [ ] Every object that appears in multiple workflows is verified in all of them
- [ ] G12 closure documented with full evidence register references

---

## G13 — Production Operations Readiness

### Purpose

G12 certifies that every workflow is functionally complete and enterprise-grade. G13 certifies that the system is **safe to deploy in a real organization** — that it will survive production loads, resist attacks, recover from failures, and provide operational visibility.

This phase goes beyond workflow correctness into infrastructure, security, reliability, and operational readiness.

### Certification Areas

#### 1. Infrastructure

| Check | Method | PASS/FAIL |
|-------|--------|-----------|
| Database backups configured | Verify backup schedule in Supabase dashboard | ⬜ |
| Point-in-time recovery enabled | Verify PITR setting | ⬜ |
| Restore tested from backup | Perform restore to staging environment | ⬜ |
| Disaster recovery plan documented | DR runbook exists | ⬜ |
| Storage bucket replication | Verify bucket config (public/private/RLS) | ⬜ |
| File integrity verification | Checksum verification for uploaded documents | ⬜ |

#### 2. Performance (Load Testing)

| Check | Target | Method |
|-------|--------|--------|
| 5,000+ employee profiles in DB | No query >2s | Load test script |
| 50+ concurrent HR users | Dashboard loads <3s | k6 / artillery |
| 500+ simultaneous candidates | Application submit <5s | k6 / artillery |
| Payroll generation benchmark | 5000 payslips <10s | Timed RPC call |
| Dashboard latency p95 | All dashboards <3s | Playwright trace timings |
| AI response time p95 | AI insight <10s | Timed Edge Function call |

#### 3. Security (Penetration Testing)

| Check | Method | PASS/FAIL |
|-------|--------|-----------|
| RLS bypass testing | Direct REST calls across all tables with various roles | ⬜ |
| SQL injection | Inject into form fields, search, URL params | ⬜ |
| XSS | Inject script tags into name fields, job titles, comments | ⬜ |
| CSRF | Attempt state-changing requests from external origin | ⬜ |
| IDOR | Access other users' data by modifying UUID in URL/body | ⬜ |
| Privilege escalation | All role transitions tested with application + direct API | ⬜ |
| File upload security | Upload executable, oversized, and malformed files | ⬜ |
| JWT/anon key exposure | Full-repo search for keys, tokens, secrets | ⬜ |
| Edge Function auth | Verify each EF checks auth + role | ⬜ |

#### 4. Reliability

| Check | Method | PASS/FAIL |
|-------|--------|-----------|
| Network interruption recovery | Disconnect mid-transaction, verify rollback | ⬜ |
| Partial transaction rollback | Multi-step workflow fails midway — verify DB state | ⬜ |
| Retry behavior | Duplicate API calls — verify idempotent handling | ⬜ |
| Duplicate submission protection | Submit same form twice — verify no duplicates | ⬜ |
| Idempotency keys | Verify idempotency on payment/settlement endpoints | ⬜ |
| Concurrency handling | Two users update same record — verify last-write-wins or lock | ⬜ |

#### 5. Observability

| Check | Method | PASS/FAIL |
|-------|--------|-----------|
| Slow query logging | Queries >500ms captured with explain plan | ⬜ |
| Database health metrics | Connection pool usage, active queries, cache hit ratio | ⬜ |
| API latency metrics | p50/p95/p99 response times per endpoint | ⬜ |
| Supabase quota monitoring | Storage, bandwidth, monthly active users tracked | ⬜ |
| Edge Function cold start tracking | Cold start frequency and duration recorded | ⬜ |
| Dashboard error boundary logging | React error boundaries send context to monitoring | ⬜ |

#### 6. Data Quality

| Check | Method | PASS/FAIL |
|-------|--------|-----------|
| Orphan detection | Automated job runs weekly to find FK orphans across all tables | ⬜ |
| Duplicate detection | Profile, candidate, application duplicates detected by email/name matching | ⬜ |
| Impossible state detection | Identify conflicting status combinations (e.g., onboarding_completed=true + candidate_id=null) | ⬜ |
| NULL integrity | Columns with implicit business NOT NULL checked (e.g., payroll_ctc for employees) | ⬜ |
| FK drift detection | Compare expected FK relationships against actual DB constraints | ⬜ |
| Data quality score | Per-table score calculated monthly with trend tracking | ⬜ |

#### 7. AI Production Readiness

| Check | Method | PASS/FAIL |
|-------|--------|-----------|
| Hallucination rate | Measured from production feedback (user confirms/rejects AI output) | ⬜ |
| Provenance tracking | Every AI output records which DB rows were sent in the prompt | ⬜ |
| Prompt versioning | Every AI feature has a versioned system prompt in source control | ⬜ |
| Model version tracking | ai-proxy logs which model served each request | ⬜ |
| Fallback on AI unavailable | AI feature shows "unavailable" UI (not error/broken page) when model is down | ⬜ |
| Token cost monitoring | Monthly token usage tracked per feature, per user role | ⬜ |
| AI response time SLA | p95 AI response <10s, p99 <20s | ⬜ |
| A/B prompt testing | Ability to test prompt variants without code deploy | ⬜ |
| Prompt determinism | Same input → same prompt → same DB rows retrieved → acceptable output variance measured | ⬜ |
| Output variance threshold | Maximum acceptable difference between two runs with same input (e.g., score ±5%) | ⬜ |

#### 8. Operational Readiness

| Check | Method | PASS/FAIL |
|-------|--------|-----------|
| Structured logging | All server errors logged with context (user, action, timestamp) | ⬜ |
| Error monitoring | Sentry / PostHog / custom error tracking configured | ⬜ |
| Production alerting | Alerts configured for: failed payroll, failed auth, RLS violations | ⬜ |
| Audit trail | All critical operations logged (role change, salary change, status change) | ⬜ |
| User-facing error handling | All API errors show user-friendly messages (not raw SQL errors) | ⬜ |
| Graceful degradation | AI feature down → fallback UI, not broken page | ⬜ |
| Maintenance mode | Ability to pause submissions during maintenance | ⬜ |

### Certification Template

```
G13 CERTIFICATION: Production Operations Readiness
STATUS: ✅ Certified / ❌ Not Certified

INFRASTRUCTURE: ✅ PASS / ❌ FAIL
  Backups: ✅ / ❌
  Restore tested: ✅ / ❌
  Disaster recovery: ✅ / ❌

PERFORMANCE: ✅ PASS / ❌ FAIL
  5000 employees: ✅ / ❌
  50 concurrent HR: ✅ / ❌
  500 concurrent candidates: ✅ / ❌
  Payroll benchmark: ✅ / ❌
  Dashboard latency: ✅ / ❌
  AI response time: ✅ / ❌

SECURITY: ✅ PASS / ❌ FAIL
  RLS bypass: ✅ / ❌
  SQL injection: ✅ / ❌
  XSS: ✅ / ❌
  CSRF: ✅ / ❌
  IDOR: ✅ / ❌
  Privilege escalation: ✅ / ❌
  File upload: ✅ / ❌

RELIABILITY: ✅ PASS / ❌ FAIL
  Network recovery: ✅ / ❌
  Rollback: ✅ / ❌
  Retry: ✅ / ❌
  Duplicate protection: ✅ / ❌
  Concurrency: ✅ / ❌

OBSERVABILITY: ✅ PASS / ❌ FAIL
  Slow query logging: ✅ / ❌
  DB health metrics: ✅ / ❌
  API latency metrics: ✅ / ❌
  Supabase quotas: ✅ / ❌

DATA QUALITY: ✅ PASS / ❌ FAIL
  Orphan detection: ✅ / ❌
  Duplicate detection: ✅ / ❌
  Impossible states: ✅ / ❌
  NULL integrity: ✅ / ❌
  FK drift detection: ✅ / ❌

AI PRODUCTION READINESS: ✅ PASS / ❌ FAIL
  Hallucination rate: ✅ / ❌
  Provenance tracking: ✅ / ❌
  Prompt versioning: ✅ / ❌
  Model tracking: ✅ / ❌
  Fallback UI: ✅ / ❌
  Token monitoring: ✅ / ❌

OPERATIONAL READINESS: ✅ PASS / ❌ FAIL
  Logging: ✅ / ❌
  Monitoring: ✅ / ❌
  Alerting: ✅ / ❌
  Audit trail: ✅ / ❌
  Error handling: ✅ / ❌

EVIDENCE IDS:
  EV-PERF-..., EV-SEC-..., EV-TEST-..., EV-CONF-...

REMAINING RISKS:
  - [Px] [risk description]

VERDICT: PRODUCTION READY / NOT PRODUCTION READY
```

### Stop Conditions

G13 is complete only when:

- [ ] All infrastructure checks pass
- [ ] All performance benchmarks met against production-like data volume
- [ ] All security penetration tests pass (no CRITICAL/HIGH findings)
- [ ] All reliability tests pass
- [ ] All observability checks pass
- [ ] All data quality checks pass
- [ ] All AI production readiness checks pass
- [ ] All operational readiness checks pass
- [ ] Full report produced with PASS/FAIL per check
- [ ] Remaining risks documented with mitigation plan
- [ ] Stakeholder sign-off obtained

### Gate G13→G14

G13→G14 passes only when:
- All 8 production operations areas have documented PASS status
- Any FAIL items have documented exception with business owner approval
- Rollback plan exists for first 30 days of production operation
- Monitoring and alerting confirmed operational

---

## G14 — Continuous Certification

### Purpose

G1 through G13 certify the system at a point in time. G14 ensures certification remains valid as the system evolves. It is the **permanent, ongoing phase** that monitors for regression after every change.

### Re-Certification Triggers

G14 automatically triggers re-certification checks after:

**Dependency-aware re-certification:** When a table changes, only workflows that depend on that table are re-run. This prevents unnecessary full re-certification on every change.

```
profiles changed
  ↓
  Payroll (profiles.payroll_ctc)
  → Analytics (headcount, payroll aggregation)
  → AI (all AI features consume profile data)
  → Notifications (user_id)
  → Recruitment (candidate_onboarding FK)
  → Performance (employee scores)
  → Attendance (employee identity)
  → Leave (employee context)
```

```
job_applications changed
  ↓
  Recruitment (core table)
  → Analytics (time-to-hire, pipeline metrics)
  → Offer (application_id FK)
  → Interview (application_id FK)
  → Assessment (application_id FK)
```

| Trigger | Affected Tables | Re-Certify Workflows |
|---------|----------------|----------------------|
| GitHub merge to main | Changed files map to tables via CHANGE IMPACT | Only workflows depending on changed tables |
| Supabase migration applied | Changed tables from migration DDL | Only workflows referencing changed tables |
| Dependency upgrade | All (performance baseline may shift) | G9 (Performance), G8 (Security) — full re-run |
| Edge Function deployment | N/A — code change only | G7 (AI), G8 (Security) — affected EFs only |
| AI prompt/model change | N/A — prompt change only | G7 (AI) — affected features only |
| RLS policy modification | Table(s) the policy covers | G8 (Security) — affected tables |
| Schema change (ALTER TABLE) | Changed table(s) | G1 (DB Integrity), G1.5 (Classification), Invariants — affected tables |
| profiles.role enum change | profiles | G8 (Security) — role escalation tests |
| New feature development | New table(s) | Full G1–G12 for new feature's workflows |

### Certification Delta Report

After each re-certification trigger, G14 produces a delta report:

```
CERTIFICATION DELTA REPORT

Date:            YYYY-MM-DD HH:MM UTC
Trigger:         GitHub merge / Migration / Schema change / Model deploy
Previous Cert:   Version 1.0 (YYYY-MM-DD)
Current Cert:    Version 1.1 (YYYY-MM-DD)

CHANGES DETECTED:
  Tables modified:    3 (profiles, job_applications, notifications)
  RPCs modified:      1 (get_enterprise_metrics)
  Triggers modified:  0
  Policies modified:  2
  EFs modified:       0
  Prompts modified:   0

NEW FAILURES:        1
  - WF-03 regressed: RLS policy on profiles.role weakened

RESOLVED FAILURES:   1
  - SCH-03: job_forms.form_schema now has DEFAULT

EVIDENCE INVALIDATED:   2
  - Bug #5: profiles.designation column now exists (L3 → L2)
  - PERF-01: N+1 query in PerformanceEngine fixed

EVIDENCE REFRESHED:     5
  - SCH-04, SCH-05, DATA-01, DATA-02, DATA-03 — retested against current DB

RISK SCORE:  Changed from 3.2 to 4.1 (WF-03 regression)
  → Gate G14→Deploy: BLOCKED until WF-03 re-certified
```

### Invariants Runner

G14 includes an automated invariants runner that checks all enterprise invariants (INV-REC-01 through INV-CRS-06) on a schedule:

```
INVARIANTS RUNNER

Schedule:    Daily at 02:00 UTC (or after every migration)
Scope:       All 9 workflows × invariants

Recent Run:  YYYY-MM-DD 02:00 UTC
  PASS: 24 / 24 invariants
  FAIL: 0 / 24 invariants
  SKIP: 0 / 24 invariants (no data for INV-TRN-03)

Trend:      ✅ 24 consecutive passes (last failure: 2026-03-15)
```

### Stop Conditions

G14 never stops — it is the permanent operating mode. However, the **initial G14 baseline** is complete only when:

- [ ] Re-certification triggers defined and wired to CI/CD pipeline
- [ ] Certification delta report template finalized
- [ ] Invariants runner deployed and passing all invariants
- [ ] Evidence freshness timestamps propagated to all findings
- [ ] Automated re-testing configured for at least the 10 most critical findings
- [ ] Risk score trending dashboard online

---

## EXECUTION ORDER WITH GATES

```
G1   (Database Integrity)           ✓ COMPLETE
  ↓ Gate G1→G1.5
G1.5 (Object Usage Classification)  ← CURRENT PHASE
  ↓ Gate G1.5→G2
G2   (Backend Logic)                [only Active/Partial objects]
  ↓ Gate G2→G3
G3   (Frontend Data Lineage)
  ↓ Gate G3→G4
G4   (Business Rule Validation)
  ↓ Gate G4→G5
G5   (Mathematical Verification)
  ↓ QUALITY GATE (P0/P1 check)
  ↓ Gate G5→G6
G6   (Automation Verification)
  ↓ Gate G6→G7
G7   (AI Hallucination Audit)
  ↓ Gate G7→G8
G8   (Security Audit)
  ↓ Gate G8→G9
G9   (Performance Audit)
  ↓ Gate G9→G10
G10  (Enterprise Simulation)
  ↓ Gate G10→G11
G11  (Enterprise Certification)
  ↓ Gate G11→G12
G12  (Enterprise Workflow Certification)
  ↓ Gate G12→G13
G13  (Production Operations Readiness)
  ↓ Gate G13→G14
G14  (Continuous Certification)
  ↓ Gate G14→Deploy
```

### Gate Sequence Detail

| Gate | From | To | Key Check |
|------|------|----|-----------|
| Gate G1→G1.5 | G1 Complete | G1.5 Start | Enterprise Baseline frozen, evidence coverage ≥95%, no contradictions |
| Gate G1.5→G2 | G1.5 Complete | G2 Start | All objects classified, removal safety documented, G2 scope defined |
| Gate G2→G3 | G2 Complete | G3 Start | All RPCs/Edge Functions inspected |
| Gate G3→G4 | G3 Complete | G4 Start | All pages have data lineage maps |
| Gate G4→G5 | G4 Complete | G5 Start | All business rules documented with authority |
| **Quality Gate** | G5 Complete | G6 Start | **P0/P1 check: STOP if unresolved** |
| Gate G6→G7 | G6 Complete | G7 Start | All automations cataloged |
| Gate G7→G8 | G7 Complete | G8 Start | AI hallucination audit complete |
| Gate G8→G9 | G8 Complete | G9 Start | All P0 security findings resolved or documented |
| Gate G9→G10 | G9 Complete | G10 Start | Performance baseline captured |
| Gate G10→G11 | G10 Complete | G11 Start | Enterprise simulation verified |
| Gate G11→G12 | G11 Complete | G12 Start | All 20 features certified individually |
| Gate G12→G13 | G12 Complete | G13 Start | All 13 enterprise workflows certified |
| Gate G13→G14 | G13 Complete | G14 Start | All 8 production operations areas verified |
| Gate G14→Deploy | G14 Complete | Deploy | Continuous certification active, invariants passing |
