# Task Flow Tracker — Anchored Project Summary

## Goal
Consolidate fragmented tables into single source of truth, fix security issues, eliminate fake AI, add real test coverage, automate HR recruitment pipeline, and connect all flows to real backend/database.

## Constraints & Preferences
- Do not remove/edit existing features without valid reason.
- Use real corporate logic — no fake placeholders, no client-side token exposure.
- Free open-source AI via HuggingFace (Qwen, DETR-ResNet-50).
- Every flow must hit real backend + database — zero fake connectivity.
- Production-grade, future-updatable, all real-world possibilities covered.

## Progress
### Done

- **Phase 1 — Data consolidation** (6 migrations): all recruitment reads/writes target `job_applications`; orphaned tables dropped; assessment config + notification fixes.

- **Phase 1.1-1.3 — Security fixes**: `ai-proxy` edge function upgraded; all browser AI routes through `callCorporateAI()`; browser never sees HF_TOKEN; `AssessmentAccess` grading delegates to edge function.

- **Phase 1.4-1.6 — AI/notification fixes**: duplicate notification removed from InterviewCenter; `max_violations` unified; AI question generation routes through `callCorporateAI()`.

- **Phase 2.1-2.3 — AI scoring + multi-round**: semantic grading in `grade-assessment`; AI interview scoring (4 dimensions); multi-round interview support.

- **Phase 3.1 — Per-notification badge dismiss**: all 5 notification pages have individual "Mark read" buttons; DashboardLayout badge uses `is_read = false`.

- **Phase 3.2 — Candidate TypeScript types**: 11 recruitment interfaces in `@/types/index.ts`.

- **Phase 3.3 — Offer pipeline sync bug**: `offer.job_form_id` → `offer.application_id`.

- **Phase 3.4 — Candidate assessment security**: scoped to tokens only.

- **Phase 3.5 — CareerPortal dead UI fix**: `selectedFormId` actually used.

- **Phase 3.6 — Unified assessment expiration**: 48h.

- **Phase 3.7 — Employee code collision fix**: `EMP-{candidateIdPrefix}{timestampBase36}`.

- **Phase 3.8 — Full verification**: `tsc --noEmit` 0 errors; `npm run test` 64/64 pass; `npm run lint` 0 errors; build success.

- **Phase 4.1-4.7 — RLS + automation + ApplyForm + remaining fixes + security + HR automation + verification**:
  - 16 RLS policies for all candidate-facing tables (OR logic for auth UID + candidate UUID)
  - 4 DB automation triggers (sync candidate stage, notify on status, init onboarding, auto-expire tokens)
  - ApplyForm.tsx rewritten to route through `job_applications` with duplicate detection
  - CandidateDashboard: real offer data, real BGC uploads, scoped assessments
  - `grade-assessment`: early return on 0 questions, candidate notification
  - `proctor-ai`: returns 503 with `ai_disabled: true` when HF_TOKEN missing
  - SmartInbox: removed HF_TOKEN, wrapped JSON.parse, recruitment pipeline push
  - HR Dashboard/AIInsights/PerformanceEngine: all use `callCorporateAI()` with real DB data
  - Status transition validation (frontend + DB CHECK constraints)
  - Timer exploit removed from AssessmentAccess
  - Full verification: tsc 0 errors, 105 tests pass, lint 0 errors, build success

- **Phase 5.0 — Deep analysis**: complete codebase audit across 5 dimensions.

- **Phase 5.1 — Missing schema migration** (`20260621000000_phase5_missing_schema.sql`):
  - `assessment_tokens.used` column (boolean default false)
  - 8 missing columns across `profiles`, `candidates`, `job_forms`, `assessment_tokens`
  - 24 indexes on FK columns and email lookups
  - CHECK constraints on 5 status columns
  - Cascade deletes on 12 FK relationships
  - 4 new automation triggers (init_offer_approvals, sync_job_app_from_offer, sync_job_app_from_interview, sync_job_app_from_token)

- **Phase 5.2 — CareerPredictor HF_TOKEN fix**: hardcoded `hf_bqNmy...` removed, now routes through `callCorporateAI()`.

- **Phase 5.3 — Status validation**: `src/lib/status-validators.ts` extracted with `isValidStatusTransition`, `isValidOfferStatusTransition`, `isValidJobFormStatusTransition`; wired into CandidatePipeline, OfferManagement, CareerPortal, JobFormManagement.

- **Phase 5.4 — Notification badge clearing**: `/notifications` path added to DashboardLayout badge clearing in both `useEffect` and `fetchBadgeCounts`.

- **Phase 5.5 — callCorporateAI error handling**: changed from silent `return ""` to `throw new Error("AI proxy unreachable after 3 retries.")`.

- **Phase 6.0 — Deep analysis**: complete codebase audit finding 55 issues (8 critical, 37 medium, 10 low) across edge functions, HR pages, candidate pages, DB schema, and migrations.

- **Phase 6.1 — SmartInbox HF_TOKEN fix**: replaced direct HuggingFace fetch with `callCorporateAI()` — `VITE_HF_TOKEN` no longer exposed to client.

- **Phase 6.2 — InterviewCenter duplicate const fix**: changed `const pipelineStageOutcome`/`const interviewOutcomeStatus` from duplicate declarations to `let` + reassignment.

- **Phase 6.3 — Payroll fake data removed**:
  - Synthetic performance charts (6-month fabricated data) replaced with empty array
  - Fake historical payslips (May/April/March 2026) replaced with empty array when no real records exist

- **Phase 6.4 — JobApplication AI score default fix**: removed hardcoded `calculatedAIScore = 60` fallback; on AI failure, `match_score` stays `null` and status goes to "Screening" (not "Shortlisted").

- **Phase 6.5 — Chat/Messages realtime leak + candidate ID fix**:
  - CandidateChat: fixed subscription cleanup (properly returns from `useEffect`), uses `profiles.candidate_id` instead of auth UID
  - CandidateMessages: resolved candidate identity via `profiles.candidate_id` instead of `profile.id`

- **Phase 6.6 — JWT auth added to all 4 edge functions**: `ai-proxy`, `ats-screen`, `proctor-ai`, `grade-assessment` now verify Supabase JWT via `Authorization` header before processing requests.

- **Phase 6.7 — Missing schema migration** (`20260622000000_phase6_missing_schema.sql`):
  - Missing columns: `candidates.full_name`, `candidates.phone`, `candidates.recommendation`, `profiles.performance_score`, `profiles.join_date`, `profiles.ai_career_prediction`, `profiles.education`, `profiles.experience`, `profiles.core_skills`, `profiles.education_details`, `background_verifications.verification_status`, `offer_letters.job_form_id`
  - New tables: `resignations`, `company_announcements`, `recruitment_announcements`, `employee_attrition`, `reports`, `hiring_stats`, `pipeline_stats`, `weekly_attendance`, `performance_trends`, `executive_metrics`
  - Additional indexes, CHECK constraints, cascade deletes
  - RLS policies for all new tables
  - Automation triggers: notify on task assigned/inserted, notify on leave status change, auto-expire job forms
  - Fix for broken RLS policy referencing non-existent `c.profile_id`
  - Restrict `projects` SELECT to admin/hr/team_lead only
  - Enable realtime for new tables

- **Phase 6.8 — Pagination added**: `.range(0, 99)` or `.limit()` added to main list queries in ApplicationHub, CandidatePipeline, OfferManagement, Payroll, PerformanceEngine, HR Notifications.

- **Phase 6.9 — AssessmentAccess fake face detection removed**: skin-pixel heuristic removed (was primitive RGB threshold, not real AI); AI proctoring catch block logs errors instead of silent `catch {}`; hardcoded `[violationCount / 3]` changed to `[violationCount / {getMaxViolations()}]`; console.log of assessment state/token removed.

- **Phase 6.10 — Deep logic audit + verification**: full audit confirms all flows connected to real backend, no fake logic, no exposed tokens (edge functions use JWT, SmartInbox uses `callCorporateAI()`). Verification: `tsc --noEmit` 0 errors, `vitest` 105/105 pass, `eslint` 0 errors, `vite build` success.

### In Progress
- (none — Phase 6 complete)

### Blocked
- (none)

## Key Decisions
- **`job_applications` is single source of truth** — all reads/writes target this table; triggers sync `candidates.stage`.
- **All AI routed through `ai-proxy` edge function** — no HF token in browser; `callCorporateAI()` canonical entry point.
- **All 4 edge functions now require JWT auth** — `Authorization: Bearer <supabase_jwt>` header verified before processing.
- **Badge count uses `is_read` column** — per-notification mark-read triggers subscription → badge re-fetch.
- **RLS uses OR logic**: `candidate_id = auth.uid() OR candidate_id = (SELECT candidate_id FROM profiles WHERE id = auth.uid())`.
- **Status changes automated via DB triggers** — frontend updates `job_applications.status` → triggers sync stage/notify/init onboarding.
- **Migration `20260621000000`** fixes 4 schema gaps (missing columns, indexes, CHECK constraints, cascade deletes, automation triggers).
- **Migration `20260622000000`** fixes 15+ additional gaps (missing tables, missing columns, additional indexes/constraints/cascades, automation triggers, RLS fixes, broken policy fix).
- **AssessmentAccess proctoring** uses real AI (DETR-ResNet-50 + face detection via `proctor-ai` edge function) — no more fake RGB skin-pixel heuristic.
- **No fake default scores** — `match_score` is `null` when AI unavailable, status defaults to "Screening" requiring human review.

## Critical Context
- **SmartInbox**: routes through `callCorporateAI()` — HF_TOKEN never reaches browser. Google OAuth 2.0 flow used for Gmail API.
- **CareerPredictor**: routes through `callCorporateAI()` — no more hardcoded `hf_bqNmy...` token.
- **All 4 edge functions**: `ai-proxy`, `ats-screen`, `grade-assessment`, `proctor-ai` — all require JWT auth now. All use `HF_TOKEN` server-side only.
- **`callCorporateAI()`**: throws on failure (no more silent `""`). Callers wrap in try-catch.
- **`grade-assessment` edge function**: handles 0 questions, inserts candidate notification, updates `job_applications.status` on completion, uses service role key for DB ops (after JWT auth verified with anon key).
- **Proctoring**: real DETR-ResNet-50 object detection + face detection via HuggingFace. Catches log errors instead of silent `catch {}`.
- **Missing tables now created**: `resignations`, `company_announcements`, `recruitment_announcements`, `employee_attrition`, `reports`, `hiring_stats`, `pipeline_stats`, `weekly_attendance`, `performance_trends`, `executive_metrics` — all with RLS policies.
- **Missing columns now added**: `candidates.{full_name,phone,recommendation}`, `profiles.{performance_score,join_date,ai_career_prediction,education,experience,core_skills,education_details}`, `background_verifications.verification_status`, `offer_letters.job_form_id`.
- **Tests**: 105 tests, 7 files, all pass.

## Next Steps
1. Deploy all 3 migrations to production: `20260621000000`, `20260622000000`
2. Deploy all 4 updated edge functions (`ai-proxy`, `ats-screen`, `grade-assessment`, `proctor-ai`)
3. Verify SmartInbox Google OAuth flow end-to-end
4. Monitor edge function JWT auth in production (check for 401 errors)
5. Add proper pagination controls (prev/next buttons) to high-volume pages
6. Set up `pg_cron` or scheduled function to auto-run `auto_expire_job_forms()` daily
