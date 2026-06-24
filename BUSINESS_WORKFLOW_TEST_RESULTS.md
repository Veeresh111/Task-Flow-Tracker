# Business Workflow Test Results

## Summary

| Metric | Value |
|---|---|
| **Total Playwright Tests** | 114 (85 existing + 29 business workflow) |
| **All Playwright Tests** | 114 passed |
| **npm run build** | Passed |
| **npm run lint** | Passed (0 errors, warnings only) |
| **Date** | 2026-06-23 |

## Code Bugs Fixed During This Session

| Bug | File | Fix |
|---|---|---|
| `candidate_onboarding` FK constraint violation | `OnboardingCenter.tsx:214-233` | Step 2 passed `profiles.candidate_id` (candidates.id) but FK references `profiles(id)`. Replaced complex 3-step resolution with direct use of `selectedCandidate.id` (profile ID). |
| `candidate_onboarding` upsert `onConflict` fails | `OnboardingCenter.tsx:259` | No unique constraint existed on `candidate_id`. Changed `upsert` to `delete-then-insert`. |

## Pre-existing Bugs Found & Fixed Earlier

| Bug | File | Fix |
|---|---|---|
| `/apply/:formId` blank page crash | `JobApplication.tsx:444` | Added null guard for `formMeta` |
| `/reset-password` redirects to `/login` | `App.tsx` | Added `ResetPassword` import + route |
| Registration advances before password validation | `Register.tsx:53` | Added password match + length check in `handleNext` |
| Admin Dashboard crash | `Dashboard.tsx:237` | Changed `financialData` → `payrollSummary` |

## Business Workflow Tests (29 tests in 6 spec files)

| Spec File | Tests | Status |
|---|---|---|
| `candidate-application.spec.ts` | 5 | ✅ All pass |
| `assessment.spec.ts` | 5 | ✅ All pass |
| `interview.spec.ts` | 3 | ✅ All pass |
| `offer.spec.ts` | 6 | ✅ All pass |
| `onboarding.spec.ts` | 5 | ✅ All pass |
| `employee-creation.spec.ts` | 5 | ✅ All pass |

## Workflow Coverage

### 1. Candidate Application
- ✅ Seed data validation (candidates + job_forms tables queryable)
- ✅ Job application creation via Supabase upsert with unique constraint handling
- ✅ Application status transitions (Applied → … → Offer Declined/Accepted)
- ✅ `/apply/:formId` public page renders with correct job title (React Dev)
- ✅ Job application references valid candidate and form (inner join query)

### 2. Assessment
- ✅ Assessment metadata queryable with questions
- ✅ Assessment token creation, readback, and notification
- ✅ Scoring logic (correct answers, partial credit, disqualification)
- ✅ `/assessment` public page loads token input form
- ✅ Assessment attempt score record creation

### 3. Interview
- ✅ Interview session CRUD (create, update status, read back)
- ✅ Interview status transitions (Scheduled → In Progress → Completed → Reviewed)
- ✅ Full flow: create application → schedule interview → update application status

### 4. Offer
- ✅ Offer status transitions (Pending Approval → Approved → Sent → Accepted/Declined)
- ✅ `offer_letters` table queryable, insert confirmed blocked by broken trigger (error documented in test)
- ✅ Offer generation validation (requires interview cleared)
- ✅ Sequential approval flow enforcement
- ✅ Full DB lifecycle: application transitions through offer stages in DB

### 5. Onboarding
- ✅ `candidate_onboarding` table queryable
- ✅ Onboarding stages forward-only progression (7 stages)
- ✅ Precondition check: requires offer acceptance
- ✅ Document validation (4 required documents)
- ✅ `/onboarding` public page renders without crash

### 6. Employee Creation
- ✅ `profiles` table queryable with admin session (returns admin's own row)
- ✅ Candidate → employee conversion validation
- ✅ Employee record requires superset of candidate data (8 fields)
- ✅ Employee ID generation (EMP-DEPT-YYYY-NNNN format)
- ✅ Employee status transitions (Active ↔ On Leave, Resigned, Terminated)

## Database Interaction Summary

| Table | Read | Write | Notes |
|---|---|---|---|
| `candidates` | ✅ | ✅ | Seed data verified |
| `job_forms` | ✅ | — | Seed data verified |
| `job_applications` | ✅ | ✅ (upsert/update) | Unique constraint `candidate_id+form_id` |
| `assessments` | ✅ | — | Seed data verified |
| `assessment_tokens` | ✅ | ✅ | RLS bypassed with admin session |
| `assessment_attempts` | ✅ | ✅ | Unique candidate+assessment constraint |
| `interview_sessions` | ✅ | ✅ | Requires UUID and admin role |
| `offer_letters` | ✅ | ❌ | Broken trigger `record "new" has no field "candidate_id"` — migration not applied to live DB |
| `candidate_onboarding` | ✅ | ✅ (with profile ID) | FK references `profiles(id)`, NOT `candidates(id)` |
| `candidate_notifications` | ✅ | ❌ | RLS policy restricts writes |
| `profiles` | ✅ | ✅ | Admin can read/write own row |

## Known Limitations (Requiring Supabase Migration Apply)

1. **`offer_letters` broken trigger**: The migration `20260619231324` creates the table with `candidate_id UUID NOT NULL`, but the live DB table predates this migration and lacks the column. The trigger `notify_candidate_on_offer_created()` references `NEW.candidate_id` which doesn't exist. **Fix**: Run `supabase db push` to apply pending migrations.

2. **`candidate_onboarding` FK mismatch**: The FK `candidate_onboarding_candidate_id_fkey` references `profiles(id)`, but the original code path used `candidates.id`. **Fixed by simplifying the resolution to always use `selectedCandidate.id` (profile ID)**.

3. **22 unapplied Supabase migrations**: The schema inconsistencies (missing columns, wrong FK targets) are caused by old manual table creation that predates the migration system.

## Recommended Pre-Deployment Checklist

1. **Apply all Supabase migrations**: `supabase db push`
2. **Verify `offer_letters` trigger** works after migrations: attempt an INSERT
3. **Run a manual HR flow**: Apply → Assessment → Interview → Offer → Onboard → Employee
4. **Verify no hardcoded credentials** in source (confirmed: none remain in `src/`)
