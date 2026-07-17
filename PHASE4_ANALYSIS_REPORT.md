# Phase 4 — End-to-End Recruitment Lifecycle: Offer → Onboarding → Analytics

## Overview

Phase 3 fixed the broken connections between ATS → Assessment → Interview.  
Phase 4 completes the remaining 50% of the recruitment lifecycle: **Offer Generation → Candidate Acceptance → Onboarding → Employee Creation**, plus comprehensive analytics and UX enhancements.

---

## Architecture Summary (Post-Phase 3)

```
ATS Screen → Apply → Assessment → Interview → Offer Gen → Offer Mgmt → Onboarding → Employee
   ↑                          ↑                          ↑              ↑
  Phase 1                  Phase 2                    Phase 4        Phase 4
```

---

## 1. Critical Bugs Found

### Bug 1: `offer_url` vs `offer_letter_url` Field Name Mismatch
- **DB column:** `offer_letters.offer_letter_url` (migration `20260619231324`)
- **TypeScript interface:** `OfferLetter.offer_url` (`src/types/index.ts`)
- **Candidate Dashboard reads:** `offer.offer_url` → always `undefined`
- **Effect:** The "View" button in candidate Offer Vault can never open any offer — feature is broken
- **Fix:** Align TypeScript interface to DB column name

### Bug 2: `'Offer Declined'` Not in Valid Statuses
- **DB trigger** `sync_job_app_from_offer()` sets `job_applications.status = 'Offer Declined'` when `offer_letters.status = 'Declined'`
- **Missing from:** `VALID_APPLICATION_STATUSES` in `src/lib/status-validators.ts`
- **Missing from:** `ApplicationHub.tsx` filter list
- **Missing from:** `CandidatePipeline.tsx` dropdown options
- **Effect:** Declined offers create an application with an unrecognized status — invisible in filters, breaks pipeline validation
- **Fix:** Add `'Offer Declined'` to all valid status arrays

### Bug 3: `candidate_onboarding.candidate_id` FK Mismatch
- **DB schema:** `candidate_onboarding.candidate_id` → FK to `candidates.id`
- **OnboardingCenter.tsx:** Uses `profile.id` (from `profiles`) as candidate_id for the upsert
- **Effect:** If a candidate exists only in `profiles` (not in `candidates` table), the FK constraint fails silently. The status code `code: '23503'` is logged but the onboarding still appears to succeed to the user.
- **Fix:** Resolve correct `candidates.id` via `profiles.candidate_id` before upserting

---

## 2. Missing Pipeline Transitions

### Gap 1: No Auto-Advance from Offer Accepted → Onboarding
- When `offer_letters.status = 'Accepted'`:
  - ✅ Trigger `sync_job_app_from_offer()` sets `job_applications.status = 'Offer Accepted'`
  - ✅ Trigger `sync_candidate_stage()` sets `candidates.stage = 'Offer Accepted'`
  - ❌ No trigger creates `candidate_onboarding` record
  - ❌ No trigger auto-advances `job_applications.status` to `'Onboarding'`
- **Fix:** Create DB trigger `trg_offer_accepted_advance_onboarding` that:
  - Updates `job_applications.status = 'Onboarding'` when the application is at `'Offer Accepted'`
  - Creates/updates `candidate_onboarding` row with initial stage

### Gap 2: No `job_applications.status = 'Onboarding'` on Onboarding Completion
- **OnboardingCenter.tsx** updates `profiles.role = 'employee'` and upserts `candidate_onboarding`
- ❌ Never updates `job_applications.status = 'Onboarding'`
- ❌ Never updates `candidates.stage = 'Onboarding'`
- **Effect:** The pipeline board still shows `'Offer Accepted'` even after the employee is onboarded
- **Fix:** Update `job_applications` status in `handleOnboardCandidate()`

---

## 3. Missing Frontend Features

### Feature 1: Candidate Offer Acceptance/Decline UI
- Candidates can **view** offers in their dashboard (broken — see Bug 1)
- There is **no Accept/Decline button**
- Only HR can change offer status via OfferManagement table
- **Fix:** Add Accept/Decline buttons in candidate Offer Vault + edge function for secure processing

### Feature 2: RecruitmentAnalytics.tsx (Empty File)
- File exists at `src/pages/hr/recruitment/RecruitmentAnalytics.tsx` — 0 lines
- Admin Analytics (`src/pages/admin/Analytics.tsx`) has basic pipeline bar charts
- HR Dashboard has no recruitment metrics
- **Fix:** Implement full recruitment analytics with:
  - Pipeline funnel counts per stage
  - Time-to-hire calculation (avg days from Application → Onboarding)
  - Source effectiveness (which channels produce hired candidates)
  - Offer acceptance rate
  - Monthly hiring trend

### Feature 3: HR Dashboard Pipeline Metrics
- HR Dashboard currently shows only headcount, payroll, complaints, leaves
- **Fix:** Add recruitment pipeline summary cards (candidates in pipeline, interviews this week, pending offers, new hires this month)

### Feature 4: Interview Scheduling Enhancement
- No timezone handling (uses `datetime-local` — browser-local only)
- No reschedule/cancel UI
- No candidate availability management
- **Fix:** Add timezone selector, reschedule/cancel actions

### Feature 5: PDF Offer Letter Generation
- AI generates offer letter text client-side
- Never saved as PDF to storage
- `offer_letter_url` never populated
- **Fix:** Generate PDF client-side using html2canvas/jspdf, upload to Supabase Storage, save URL

---

## 4. OnboardingCenter Gaps

### Gap 1: No Filter for "Offer Accepted" Only
- Shows ALL candidates from `profiles` + `candidates`
- No linkage to `job_applications.status === 'Offer Accepted'`
- **Fix:** Add query filter for `job_applications.status = 'Offer Accepted'`
- Also show candidates who've passed interview but haven't received offers yet

### Gap 2: No Joining Date Collection
- Onboarding form has no joining date field
- `profiles.join_date` never set
- **Fix:** Add joining date input field

### Gap 3: No `employment_status` Update
- `profiles.role = 'employee'` is set
- `profiles.employment_status` is NOT set to `'active'`
- **Fix:** Update `employment_status` to `'active'` during onboarding

### Gap 4: No Employee Code Format Standardization
- Employee code generated ad-hoc: `EMP-{id substring}{timestamp base36}`
- No configurable prefix or sequence
- **Fix:** Use consistent format with department prefix

---

## 5. Notification Gaps

- ❌ No HR notification when candidate accepts/declines an offer (candidate-side)
- ❌ No reminder for pending offer approvals (stuck in "Pending Approval" for >48h)
- ✅ DB trigger already notifies candidate on offer created (INSERT) and offer status change (UPDATE)

---

## 6. Implementation Checklist

### Phase 4A — Critical Bug Fixes

| # | Task | Files | Priority |
|---|---|---|---|
| 4A.1 | Fix TypeScript `offer_url` → `offer_letter_url` | `src/types/index.ts`, `src/pages/candidate/Dashboard.tsx` | Critical |
| 4A.2 | Add `'Offer Declined'` to valid statuses | `src/lib/status-validators.ts` | Critical |
| 4A.3 | Fix `candidate_onboarding` FK resolution in OnboardingCenter | `src/pages/hr/OnboardingCenter.tsx` | Critical |
| 4A.4 | Create DB migration: `trg_offer_accepted_advance_onboarding` | New migration file | Critical |
| 4A.5 | Update `job_applications.status` on onboarding complete | `src/pages/hr/OnboardingCenter.tsx` | Critical |

### Phase 4B — Candidate Offer Response

| # | Task | Files | Priority |
|---|---|---|---|
| 4B.1 | Create edge function `respond-offer` for secure candidate response | `supabase/functions/respond-offer/index.ts` | High |
| 4B.2 | Add Accept/Decline buttons in candidate Offer Vault | `src/pages/candidate/Dashboard.tsx` | High |
| 4B.3 | HR notifications for candidate offer response (via edge function) | `supabase/functions/respond-offer/index.ts` | High |

### Phase 4C — Analytics Implementation

| # | Task | Files | Priority |
|---|---|---|---|
| 4C.1 | Implement RecruitmentAnalytics.tsx with full funnel | `src/pages/hr/recruitment/RecruitmentAnalytics.tsx` | High |
| 4C.2 | Add recruitment pipeline cards to HR Dashboard | `src/pages/hr/Dashboard.tsx` | High |
| 4C.3 | Register RecruitmentAnalytics route if missing | `src/App.tsx` | High |

### Phase 4D — Onboarding Enhancement

| # | Task | Files | Priority |
|---|---|---|---|
| 4D.1 | Filter OnboardingCenter to 'Offer Accepted' candidates | `src/pages/hr/OnboardingCenter.tsx` | High |
| 4D.2 | Add joining date field to onboarding form | `src/pages/hr/OnboardingCenter.tsx` | High |
| 4D.3 | Set `employment_status = 'active'` on onboard | `src/pages/hr/OnboardingCenter.tsx` | High |

### Phase 4E — Interview UX

| # | Task | Files | Priority |
|---|---|---|---|
| 4E.1 | Add timezone selector to interview scheduling | `src/pages/hr/recruitment/InterviewCenter.tsx` | Medium |
| 4E.2 | Add reschedule/cancel actions | `src/pages/hr/recruitment/InterviewCenter.tsx` | Medium |

### Phase 4F — PDF Offer Letters

| # | Task | Files | Priority |
|---|---|---|---|
| 4F.1 | Install jspdf, generate PDF, upload to storage | `src/pages/hr/Recruitment.tsx` | Medium |
| 4F.2 | Save storage URL to `offer_letter_url` | `src/pages/hr/Recruitment.tsx` | Medium |

### Phase 4G — Verification

| # | Task | Files | Priority |
|---|---|---|---|
| 4G.1 | TypeScript build check | - | Critical |
| 4G.2 | Lint check | - | Critical |
| 4G.3 | Run existing tests | `src/test/recruitment/` | Critical |
| 4G.4 | Full flow recheck: ATS → Offer → Onboarding → Employee | Manual | Critical |
| 4G.5 | Cross-system compatibility: env vars, localStorage, media devices | All files | High |

---

## 7. Database Migration: Offer → Onboarding Auto-Advance

```sql
-- Migration: 20260623000000_phase4_offer_to_onboarding.sql
CREATE OR REPLACE FUNCTION public.advance_to_onboarding()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'Accepted' AND (OLD.status IS DISTINCT FROM 'Accepted') THEN
    -- Advance job_application to Onboarding
    UPDATE public.job_applications
    SET status = 'Onboarding'
    WHERE id = NEW.application_id
      AND status NOT IN ('Rejected', 'Offer Declined');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_offer_advance_onboarding ON public.offer_letters;
CREATE TRIGGER trg_offer_advance_onboarding
  AFTER UPDATE OF status ON public.offer_letters
  FOR EACH ROW
  WHEN (NEW.status = 'Accepted')
  EXECUTE FUNCTION public.advance_to_onboarding();
```

---

## 8. Offer Statuses — Complete Mapping

```
offer_letters.status          job_applications.status         candidates.stage
────────────────────────      ──────────────────────────      ─────────────────
Pending Approval              Offer Generated                 Offer Generated
Approved                      Offer Generated                 Offer Generated
Sent                          Offer Generated                 Offer Generated
Accepted (trigger)     →      Offer Accepted                  Offer Accepted
Accepted (trigger)     →      Onboarding (Phase 4)            Onboarding (Phase 4)
Declined (trigger)      →     Offer Declined (fixed)          Rejected
Expired                       Offer Generated (no change)     Offer Generated
```

---

## 9. Files to Modify (Complete List)

| File | Changes |
|---|---|
| `src/types/index.ts` | `OfferLetter.offer_url` → `offer_letter_url` |
| `src/pages/candidate/Dashboard.tsx` | Fix field name, add Accept/Decline buttons |
| `src/lib/status-validators.ts` | Add `'Offer Declined'` to `VALID_APPLICATION_STATUSES` |
| `src/pages/hr/OnboardingCenter.tsx` | Fix FK resolution, add joining date, filter by offer status, update job_applications, set employment_status |
| `src/pages/hr/Dashboard.tsx` | Add recruitment pipeline metric cards |
| `src/pages/hr/recruitment/RecruitmentAnalytics.tsx` | Implement full analytics (funnel, time-to-hire, sources) |
| `src/pages/hr/Recruitment.tsx` | Add PDF generation + storage upload |
| `src/pages/hr/recruitment/InterviewCenter.tsx` | Add timezone selector, reschedule/cancel |
| `supabase/functions/respond-offer/index.ts` | NEW edge function for candidate offer response |
| `supabase/migrations/20260623000000_phase4_offer_to_onboarding.sql` | NEW migration for auto-advance trigger |
| `src/App.tsx` | Verify RecruitmentAnalytics route exists |

---

## 10. Risk Assessment

| Risk | Impact | Mitigation |
|---|---|---|
| `candidate_onboarding` FK failures | High — silently breaks onboarding | Fix with proper `candidates.id` resolution |
| Offer Declined status invisible | High — lost candidates in pipeline | Add to valid status arrays |
| Trigger cascade infinite loop | Medium — chained triggers could recurse | Use `OLD.status IS DISTINCT FROM NEW.status` guards |
| PDF generation fails on mobile | Low — offer generation is HR-only, desktop | Wrap in try/catch, fallback to text-only |
| Edge function auth bypass | High — candidate could accept another's offer | Validate `candidate_id` matches auth user via JWT |
