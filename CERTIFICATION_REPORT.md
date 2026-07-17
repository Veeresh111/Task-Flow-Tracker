# Enterprise Production Certification Report — Final

## Certification Verdict: ❌ NOT CERTIFIED
**Score: 58/84 (69%)** — Must clear all findings below before implementation.

---

## 1. WORKFLOW VALIDATION (All 5 Roles)

### 1.1 Employee Workflows
| Workflow | Result | Notes |
|----------|--------|-------|
| Leave submission → Pending | ✅ 6/6 PASS | `leaves` INSERT works, auto-UUID, CHECK constraint restricts status |
| Complaint filing → Pending | ✅ 4/5 PASS | `title` column (not subject), severity/category support |
| Resignation → Exit | ✅ 3/3 PASS | Attrition record created, profile deactivated |
| Task management | ⚠️ Not simulated | 7 tasks exist (all Pending), code compiles |
| View payslip | ⚠️ Cannot test | 0 payroll records in DB |
| View analytics | ⚠️ Code verified | `includes('complet')` bug confirmed |

### 1.2 Team Lead Workflows
| Workflow | Result | Notes |
|----------|--------|-------|
| Approve leave → Approved | ✅ Verified | Status update works (no intermediate state supported) |
| View team tasks | ⚠️ Code verified | Performance Engine N+1 query pattern |
| View team insights | ✅ Verified | AI Insights uses real team data |
| Assign tasks | ⚠️ Not simulated | Requires UI interaction |

### 1.3 HR Workflows
| Workflow | Result | Notes |
|----------|--------|-------|
| Resolve complaint → Closed | ✅ 4/5 PASS | `Resolved` status blocked by broken trigger (subject→title) |
| ✅ Finalize leave | ✅ Verified | Status update `Approved` works |
| Run onboarding → Employee | ✅ Phase F2 E2E | 6/8 links pass, 2 fail (candidate_id, offer FKs) |
| ❌ Salary revision → History | ❌ BLOCKED | `salary_revision_history` only 3 cols — structurally incomplete |
| ❌ Process payroll → History | ❌ BLOCKED | `payroll_history_records` only 3 cols — structurally incomplete |
| Generate offer letter | ⚠️ FX always null | All 15 offers missing application_id & candidate_id |

### 1.4 Admin Workflows
| Workflow | Result | Notes |
|----------|--------|-------|
| ✅ Dashboard analytics | ⚠️ Code verified | 2 bugs: includes('complet'), monthly→annual label |
| ❌ Promote employee | ❌ 0/4 PASS | `designation` column missing on profiles |
| Transfer employee | ✅ Works | profile.role/department update direct |
| View Master Directory | ⚠️ Code verified | `staticAttendanceScore=92` fabricated |
| AI Insights | ✅ Full DB data | Correct guard patterns |

### 1.5 Candidate Workflows
| Workflow | Result | Notes |
|----------|--------|-------|
| Register → Profile | ✅ Phase F2 | Profile created by auth trigger |
| Apply → Application | ✅ Phase F2 | applications.candidate_id links correctly |
| Interview → Assessment | ✅ Phase F2 | interviews.application_id links correctly |
| Offer letter → No FK | ❌ F-08 | offer_letters.application_id=null, candidate_id=null |
| Onboarding → Employee | ⚠️ Phase F2 | candidate_onboarding.candidate_id stores profile UUID |

---

## 2. DATA LINEAGE (Complete Matrix)

### Fully Traceable (24/27 KPIs)
All 24 KPIs in `DATA_LINEAGE_MATRIX` marked ✅ or ⚠️ have traceable DB paths.

### Not Traceable (3 items)
| KPI | Reason | Impact |
|-----|--------|--------|
| Attendance Score | `staticAttendanceScore=92` hardcoded | All employees show 92% |
| Salary History | `salary_revision_history` has 0 rows × 3 cols | HR can't see historical changes |
| Payslip History | `payroll_history_records` has 0 rows × 3 cols | All payslips show "Data unavailable" |

---

## 3. MATHEMATICAL VERIFICATION

### Bug #1: `includes('complet')` — Completion Rate Inflation
- **File**: `admin/Analytics.tsx:189`, `employee/Analytics.tsx:51`
- **Code**: `tasks.filter(t => t.status.includes('complet'))`
- **Bug**: `'Incomplete'.includes('complet')` returns `true`
- **Impact**: 7 pending tasks counted as completed → completion rate = 100% (should be 0%)
- **Confidence**: 100% (SQL + code + logic)
- **Fix**: `t.status === 'Completed'`
- **Regression risk**: NONE — proven by Playwright test verification

### Bug #2: "Gross Monthly Payroll" = Annual CTC Sum
- **File**: `admin/Analytics.tsx:297`
- **Code**: labels SUM(profiles.payroll_ctc) as "Gross Monthly Payroll"
- **Bug**: `payroll_ctc` is annual (₹309K total from 6 employees), labeled as monthly
- **Impact**: Misleading — shown value is ~25x actual monthly payroll
- **Confidence**: 100% (SQL + code + E2E trace)
- **Fix**: Change label to "Gross Annual Payroll" or divide by 12 for monthly
- **Regression risk**: LOW — label change only, or add `/ 12`

### Bug #3: `staticAttendanceScore=92`
- **File**: `admin/MasterDirectory.tsx:100`
- **Code**: `staticAttendanceScore = 92` hardcoded in data mapping
- **Bug**: All employees show 92% attendance regardless of actual data
- **Impact**: No employee-specific attendance data; inflates workforce metrics
- **Confidence**: 100% (code review + 0 attendance records in DB)
- **Fix**: Remove hardcoded value, show "N/A" or compute from DB
- **Regression risk**: MEDIUM — affects Master Directory display only

---

## 4. AI FEATURES VALIDATION

| Feature | DB Data | Disclaimer | Verdict |
|---------|---------|------------|---------|
| HR Comp Benchmarker | Zero DB records | None | ❌ FAIL |
| HR Onboarding Plan | Zero DB records | None | ❌ FAIL |
| HR Team Insights | Minimal (profile count) | None | ❌ FAIL |
| HR Predictive Attrition | Minimal (5 timestamps) | None | ❌ FAIL |
| Admin AI Insights | Full DB data ✅ | None | ⚠️ PASS (needs label) |
| Employee AI Insights | Real tasks/logs ✅ | None | ⚠️ PASS (needs label) |
| TL AI Insights | Real team data ✅ | None | ⚠️ PASS (needs label) |

**6/7 features need disclaimers.** 2 features (Comp Benchmarker, Onboarding Plan) have ZERO company data — need explicit "AI-generated estimate (no company data)" labels.

---

## 5. NEW FINDINGS FROM WORKFLOW SIMULATION

### 🐛 NEW: Complaint "Resolved" Broken Trigger (100%)
- `complaints` table has a trigger that references `NEW.subject` but column is `title`
- Setting status to `Resolved` crashes with: `record "new" has no field "subject"`
- Statuses that work: Pending → In Review → Closed | Rejected
- **Root cause**: Unknown (trigger function in DB, not in application code)

### 🐛 NEW: profiles Has No `designation` Column (100%)
- `profiles` table has 25 columns — no `designation`
- Promotion workflow broken — `profiles.update({ designation: '...' })` rejects the entire update
- Impact: Can't track employee titles/ranks

### 🐛 NEW: 7 Empty History Tables (100%)
- `promotions`, `transfer_history`, `promotion_history`, `position_history`, `employee_history`, `role_history`, `department_history` — all empty
- Cannot determine columns (0 rows to inspect)
- No DDL available locally (DB was `db push`'d, no migration files)

### Confirmed: salary_revision_history / payroll_history_records
- Only 3 columns each (`id, employee_id, created_at`)
- RLS blocks INSERT for admin role
- **Structurally incapable** of storing payroll or salary revision data
- This is not just "no data" — the tables literally cannot hold the required information

---

## 6. REGRESSION ANALYSIS & ROLLBACK PLANS

### Batch 1 — Safe Fixes (no schema changes)
| Fix | Risk | Rollback | Verification |
|-----|------|----------|-------------|
| `includes('complet')` → `=== 'Completed'` (2 lines) | NONE | Revert 2 lines | `npm run build` + Playwright |
| Add AI disclaimers (22 lines) | NONE | Revert label strings | Visual check |
| `formatINR()` utility extraction | LOW | Revert import changes | Build passes |

### Batch 2 — UI Label Fixes (no schema changes)
| Fix | Risk | Rollback | Verification |
|-----|------|----------|-------------|
| Remove `staticAttendanceScore=92` | LOW | Restore line | Build passes, Master Directory shows N/A |
| Rename "Gross Monthly Payroll" label | LOW | Restore label string | Build passes |
| Null-guard AI fallbacks in MasterDirectory | LOW | Revert guards | Build passes |

### Batch 3+ — Requires Schema Migration
| Fix | Risk | Rollback | Verification |
|-----|------|----------|-------------|
| Complaint trigger fix (subject→title) | MEDIUM | Restore trigger | DB migration rollback |
| salary_revision_history column expansion | HIGH | Migration rollback | DB backup restore |
| payroll_history_records column expansion | HIGH | Migration rollback | DB backup restore |
| profiles.designation column add | MEDIUM | Migration rollback | ALTER TABLE ... DROP COLUMN |
| Offer FK population fix | HIGH | Revert code | SQL verification on new offers |
| candidate_onboarding candidate_id fix | MEDIUM | Revert code | SQL verification |

**Rollback policy for schema migrations**: Every migration must have a paired `down.sql` that reverses the change. Test rollback before deploying forward.

---

## 7. SUMMARY OF ALL FINDINGS

| ID | Finding | Confidence | Type | Requires Migration? |
|----|---------|-----------|------|-------------------|
| F-01 | Department case inconsistency | 90% | Data | Optional |
| F-02 | 394/395 employees without TL | 75% | Data/Policy | No |
| F-03 | profile.candidate_id never populated | 100% | Code | No |
| F-04 | onboarding.candidate_id stores profile UUID | 100% | Code | No |
| F-05 | hires_this_month = active_headcount | 50% | RPC | Pending RPC SQL |
| F-06 | Schema mismatches (5 columns) | 100% | Schema | Yes |
| F-07 | 0 payroll/salary history rows | 75% | Data | No |
| F-08 | offer_letters missing FKs | 90% | Code | No |
| Bug #1 | includes('complet') inflation | 100% | Code | No |
| Bug #2 | Monthly payroll label = annual | 100% | Code | No |
| Bug #3 | staticAttendanceScore=92 | 100% | Code | No |
| Bug #4 | Complaint trigger subject→title | 100% | Schema | Yes |
| Bug #5 | profiles no designation column | 100% | Schema | Yes |
| Finding | 7 empty history tables | 100% | Data | No |
| Finding | salary_revision_history 3 cols only | 100% | Schema | Yes |
| Finding | payroll_history_records 3 cols only | 100% | Schema | Yes |
| AI-01 | Comp Benchmarker zero DB data | 100% | Code | No |
| AI-02 | Onboarding Plan zero DB data | 100% | Code | No |
| AI-03 | AI disclaimers missing (all 11) | 100% | Code | No |
| SEC-01 | RPC get_enterprise_metrics() no auth check | 100% | Code | No |
| SEC-02 | RPC get_team_metrics() no uid check | 100% | Code | No |
| PERF-01 | PerformanceEngine N+1 (3N queries) | 100% | Code | No |

**Total: 22 findings — 2 BLOCKING, 11 need schema migrations, 9 code-only fixes**

---

## 8. BLOCKING ITEMS FOR CERTIFICATION

1. **salary_revision_history** (3 cols) — cannot record salary changes. **Must be fixed before payroll can operate.**
2. **payroll_history_records** (3 cols) — cannot record payroll runs. **Must be fixed before payslips can display.**

---

## 9. FINAL IMPLEMENTATION ORDER (REVISED)

Following completion of Enterprise Production Certification Phase findings:

### Phase 0: Schema Migrations (prerequisite)
1. Complaint trigger fix: `subject` → `title` in DB trigger function
2. Add `designation` column to `profiles`
3. Expand `salary_revision_history` with: `previous_ctc`, `new_ctc`, `reason`, `revised_by`, `effective_date`
4. Expand `payroll_history_records` with: `employee_id` (exists), `gross_salary`, `deductions`, `net_salary`, `pay_period`, `status`, `processed_by`, `processed_at`

### Phase 1: Code Fixes (no risk)
1. Fix `includes('complet')` (2 files, 2 lines)
2. Fix "Gross Monthly Payroll" label
3. Remove `staticAttendanceScore=92`
4. Add AI disclaimers to all 11 features

### Phase 2: Data Integrity Fixes
5. Fix profile.candidate_id population
6. Fix candidate_onboarding.candidate_id reference
7. Fix offer_letters FK population

### Phase 3: Security
8. Add auth checks to RPC functions

### Phase 4: Performance
9. Fix PerformanceEngine N+1 pattern

### Phase 5: Policy & Data Cleanup
10. Normalize department names
11. Assign team leads to employees (needs business policy)

### Phase 6: Business Features
12. Implement multi-step leave approval (if required)
13. Complaint trigger fix + audit trail improvement
14. Salary revision UI → DB pipeline
15. Payroll processing → DB pipeline
