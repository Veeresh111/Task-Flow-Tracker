# Phase 1: Data Consolidation & Security Fix — Implementation Checklist

## Mapping User Requirements → Implementation Status

| # | Requirement | Status | What Remains |
|---|-------------|--------|--------------|
| 1 | Auto ATS + resume analysis (corporate logic, not keyword matching) | ✅ DONE | ats-screen edge function uses Qwen via HF for holistic eval |
| 2 | Auto assessment token for shortlisted candidates | ✅ DONE | JobApplication.tsx auto-generates when score >= 75 |
| 3 | One-time assessment, one-time job application per job | ✅ DONE | UNIQUE(candidate_id, form_id) on job_applications; used flag on tokens |
| 4 | Proctored assessment (eye-tracking, video/audio) | ⚠️ PARTIAL | proctor-ai NOT registered in config.toml; AssessmentAccess grades client-side (security risk) |
| 5 | Assessment results in candidate tracking system | ✅ DONE | Sync triggers propagate to candidate_applications + candidates.stage |
| 6 | AI auto-decides interview move + notifications | ⚠️ PARTIAL | Uses threshold (score >= 75), not AI. Notification triggers exist but duplicate with client-side |
| 7 | Everything connected to backend + database | ✅ DONE | All writes go through Supabase client/edge functions |
| 8 | Open source models for resume screening + proctoring | ✅ DONE | Qwen/Qwen3-32B:groq, DETR-ResNet-50, face-detection via HF |
| 9 | Interview scheduling with auto-notifications | ⚠️ PARTIAL | Duplicate: trigger + client-side both fire notifications |
| 10 | HR decides interview score + result (real AI) | ❌ NOT DONE | Uses arithmetic average, not AI. Labeled "AI Scoring Engine" deceptively |
| 11 | Professional notifications with badge auto-dismiss | ⚠️ PARTIAL | Bulk dismiss on page visit; no per-notification mark-as-read |

## Verified Issues (No Broken FK Constraints Found)

After deep analysis of all 15 migration files:
- `assessment_tokens.application_id` FK was already repointed from `applications` → `job_applications` in phase 1 migration ✅
- `assessment_attempts.application_id` has **no FK constraint** (loose column) — no DB error risk
- `offer_letters.application_id` has **no FK constraint** (loose column) — no DB error risk
- `assessments.job_posting_id` has **no FK constraint** (loose column) — no DB error risk

## Implementation Plan (Ordered by Priority)

### 🔴 PHASE 1 — Critical Fixes (Security + Correctness)

#### [ ] 1.1 Create missing `deno.json` for edge functions
- **Problem:** config.toml references `./functions/ats-screen/deno.json` which doesn't exist
- **Impact:** Edge functions may fail to deploy
- **Files:** `supabase/functions/ats-screen/deno.json`, `supabase/functions/grade-assessment/deno.json`, `supabase/functions/ai-proxy/deno.json`, `supabase/functions/proctor-ai/deno.json`

#### [ ] 1.2 Register `proctor-ai` in config.toml
- **Problem:** `proctor-ai` edge function exists but has no `[functions.proctor-ai]` section → won't deploy
- **Files:** `supabase/config.toml`

#### [ ] 1.3 Fix AssessmentAccess client-side grading (SECURITY)
- **Problem:** `executeAssessmentGradingEngine()` in AssessmentAccess.tsx fetches assessments with correct answers to browser, grades locally — exposes answer key to client
- **Fix:** Delegate grading to `grade-assessment` edge function (like AssessmentCenter.tsx does)
- **Files:** `src/pages/public/AssessmentAccess.tsx`

#### [ ] 1.4 Fix VITE_HF_TOKEN exposure (SECURITY)
- **Problem:** ATSScanner.tsx, HR/Dashboard.tsx, SmartInbox.tsx make direct HuggingFace calls with VITE_HF_TOKEN exposed in browser
- **Fix:** Route all HF calls through `ai-proxy` edge function or `callCorporateAI()`
- **Files:** `src/pages/hr/recruitment/ATSScanner.tsx`, `src/pages/hr/Dashboard.tsx`, `src/pages/hr/SmartInbox.tsx`

#### [ ] 1.5 Remove duplicate notifications on interview schedule
- **Problem:** DB trigger `trg_interview_notify` already creates candidate_notification on INSERT to interview_sessions. InterviewCenter.tsx lines 132-139 also create one. Double notification.
- **Fix:** Remove client-side notification insert; let the trigger handle it
- **Files:** `src/pages/hr/recruitment/InterviewCenter.tsx`

#### [ ] 1.6 Unify violation thresholds
- **Problem:** AssessmentCenter uses 3 max violations, AssessmentAccess uses 5 max
- **Fix:** Both should read from a single source — the assessment's own `max_attempts` field or assessment_tokens setting
- **Files:** `src/pages/public/AssessmentAccess.tsx`, `src/pages/hr/recruitment/AssessmentCenter.tsx`, `supabase/functions/grade-assessment/index.ts`

### 🟡 PHASE 2 — AI Enhancements

#### [ ] 2.1 Upgrade grade-assessment to semantic AI scoring
- **Problem:** Uses exact string match against `correctAnswer` — no semantic understanding
- **Fix:** After exact match pass, use HF Qwen to evaluate open-ended/semantic answers
- **Files:** `supabase/functions/grade-assessment/index.ts`

#### [ ] 2.2 Fix AI question generation in AssessmentCenter
- **Problem:** Calls `ats-screen` edge function for questions but discards the response — shows success toast but generates nothing
- **Files:** `src/pages/hr/recruitment/AssessmentCenter.tsx`

#### [ ] 2.3 Real AI interview scoring
- **Problem:** "AI Scoring Engine" is just arithmetic average of 4 manual scores (Communication + Technical + Problem Solving + Culture Fit / 4)
- **Fix:** After computing average, call HF Qwen to analyze transcript + scores → generate reasoned AI report
- **Files:** `src/pages/hr/recruitment/InterviewCenter.tsx`

#### [ ] 2.4 Multi-round interview support
- **Problem:** Only "Technical Round 1" default; no way to add subsequent rounds
- **Fix:** Allow HR to add more rounds, track round_number, final selection only after all rounds done
- **Files:** `src/pages/hr/recruitment/InterviewCenter.tsx`, `src/pages/candidate/Interviews.tsx`

### 🟢 PHASE 3 — Polish & Types

#### [ ] 3.1 Per-notification badge dismiss
- **Problem:** All notifications marked as read on page visit; no individual mark-as-read
- **Files:** `src/pages/candidate/Notifications.tsx`, `src/pages/hr/Notifications.tsx`, `src/components/layout/DashboardLayout.tsx`

#### [ ] 3.2 Candidate TypeScript types
- **Problem:** All recruitment pages use `any` instead of proper types
- **Files:** `src/types/index.ts` (add Candidate, JobApplication, Assessment, etc. interfaces)
