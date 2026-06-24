# Phase 3 — Complete In-Depth Analysis Report

## Current Architecture Overview

### Database Tables Involved
| Table | Purpose |
|---|---|
| `job_forms` | Job posting definitions + `requires_assessment` flag |
| `candidates` | Candidate master data (linked to `profiles` via FK) |
| `job_applications` | SINGLE SOURCE OF TRUTH — status, scores, resume |
| `assessments` | Assessment definitions with questions + `correctAnswer` embedded in JSONB |
| `assessment_tokens` | One-time tokens linked to `candidate_id` + `assessment_id` + `application_id` |
| `assessment_attempts` | Attempt records with score, violations, passed/failed |
| `interview_sessions` | Interview records with round, scores, AI analysis |
| `offer_letters` | Offer records |
| `notifications` | HR/internal user notifications (`is_read` boolean) |
| `candidate_notifications` | Candidate notifications (`read` boolean) |

### Allowed Status Values
- **job_applications.status**: `Applied`, `Screening`, `Shortlisted`, `ATS Shortlisted`, `Recruiter Screening`, `Assessment Assigned`, `Assessment Passed`, `Assessment Completed`, `Interview Scheduled`, `Interview Cleared`, `Offer Generated`, `Offer Accepted`, `Onboarding`, `Rejected`
- **assessment_tokens.status**: `Active`, `Used`, `Expired`, `Disqualified`
- **interview_sessions.status**: `Scheduled`, `Completed`, `Cancelled`, `No Show`

### Edge Functions
| Function | What It Does | DB Access |
|---|---|---|
| `ats-screen` | ATS scoring via Qwen AI (6 dimensions) | NONE — pure AI proxy |
| `proctor-ai` | Vision proctoring via DETR + face detection | NONE — pure AI proxy |
| `ai-proxy` | General-purpose AI chat proxy | NONE — pure AI proxy |
| `grade-assessment` | Grades assessment, disqualifies, updates pipeline, sends notifications | SELECT/INSERT/UPDATE on 7 tables |

### Notification Flow
All notifications go to either `notifications` (HR/internal) or `candidate_notifications` (candidates). Most inserts happen in:
1. **Edge functions** (`grade-assessment` — assessment results)
2. **Frontend code** (`JobApplication.tsx` — new application, auto-shortlist; `ApplicationHub.tsx` — manual token assign)
3. **DB triggers** (interview scheduled, offer status change, application status change, etc.)

### Badge System
- Badge count = `SELECT count FROM notifications WHERE user_id = ? AND is_read = false` (or `candidate_notifications` for candidates)
- Badge clears immediately on navigating to any path containing `/notifications`
- Realtime subscriptions auto-refresh badge counts

---

## Current End-to-End Flow (What Actually Happens Today)

### 1. Job Form Creation
```
HR opens JobFormManagement → fills title, JD, schema → saves to job_forms
```
⚠️ **`requires_assessment` field is never set** — always undefined/false. This breaks ALL auto-assessment flows.

### 2. Candidate Applies
```
Candidate opens /apply/:formId → fills name, email, phone, resume, custom answers
  → Resume parsed (PDF/DOCX/TXT)
  → ATS screening via ats-screen edge function (Qwen AI, 6 dimensions)
  → If score >= 75: status='Shortlisted'; else: status='Screening'
  → INSERT into job_applications with scores
  → If requires_assessment===true AND score>=75:
      → assessment_tokens INSERT (UUID, status='Active', expires=48h)
      → candidate_notifications: "Pre-Exam Invitation Granted"
      → notifications (HR): "Candidate Auto-Shortlisted"
  → Always: notifications (HR): "New Application Received"
```
⚠️ Auto-token generation is **dead code** because `requires_assessment` is never true.

### 3. Assessment Taken
```
Candidate enters token on /assessment
  → Token validated (Active, used=false, not expired)
  → Questions loaded (correctAnswer stripped client-side)
  → Proctoring: camera, mic, fullscreen, blur detection, AI vision frames
  → Timer counts down (duration_minutes)
  → Submit: POST to grade-assessment
```

### 4. Assessment Graded
```
grade-assessment edge function:
  → Validates token → loads assessment config
  → If violations >= max_violations: DISQUALIFY (token='Disqualified', notify candidate)
  → Grade: exact match + semantic AI evaluation (Qwen)
  → Score = round(correct/total * 100), Pass = score >= passing_score
  → UPDATE token: status='Used', used=true, proctor_log=...
  → INSERT assessment_attempts
  → IF PASSED:
      → AI interview decision (Qwen: proceed/review/skip)
      → UPDATE job_applications: status='Assessment Completed', interview_status
      → Notify candidate: "Assessment Graded" + HR: "Assessment Completed - Action Required"
  → IF FAILED:
      → Notify candidate: "Assessment Result" + HR: "Assessment Completed - Below Threshold"
      → ⚠️ NO UPDATE to job_applications.status — stays at previous status
```

### 5. Pipeline → Interview
```
HR views CandidatePipeline → sees candidates with "Assessment Completed" status
  → HR can manually change to "Interview Scheduled"
  → HR opens InterviewCenter → selects candidate → creates interview session
  → DB trigger: trg_interview_notify → candidate_notifications: "Interview Scheduled"
  → job_applications.status = 'Interview Scheduled'
```

### 6. Interview Grading
```
HR enters scores (Comm, Tech, Problem Solving, Culture Fit) + transcript
  → Average >= 75 AND AI says "Hire" → PASSED
  → IF PASSED: job_applications.status = 'Interview Cleared'
  → IF FAILED: job_applications.status = 'Rejected'
  → ⚠️ NO candidate notification on grading result
```

### 7. Post-Interview → Offer
```
HR opens Offer Generator or Offer Management
  → Creates offer → offer_letters (Pending Approval → Approved → Sent)
  → DB triggers notify candidate for offer creation and status changes
```

---

## Critical Bugs Blocking Phase 3

### B1. `requires_assessment` Never Set (CRITICAL)
**File**: `JobFormManagement.tsx`, `ATSScanner.tsx`
The `job_forms.requires_assessment` boolean column exists in DB but no UI writes to it. Auto-assessment token generation in `JobApplication.tsx` lines 324-390 is dead code.

### B2. No Status Update on Assessment Failure (CRITICAL)
**File**: `supabase/functions/grade-assessment/index.ts`
When candidate FAILS assessment, `job_applications.status` is NOT updated. It stays at "Assessment Assigned" forever. Should go to "Rejected".

### B3. No Candidate Notification on Interview Grading (CRITICAL)
**File**: `InterviewCenter.tsx`
After HR grades interview (pass or fail), no `candidate_notifications` record is created. Candidate has no way to know their interview result.

### B4. ATSScanner vs JobApplication Stage Inconsistency
**Files**: `ATSScanner.tsx` line 293 vs `JobApplication.tsx` line 200
One creates candidates with `stage: 'Applied'`, the other with `stage: 'Screening'`.

### B5. ApplicationHub Filter List Incomplete
**File**: `ApplicationHub.tsx` line 303
Missing statuses: "Screening", "ATS Shortlisted", "Recruiter Screening", "Assessment Passed", "Interview Cleared", "Offer Generated", "Offer Accepted", "Onboarding"

### B6. InterviewCenter Inverted Next-Round Logic
**File**: `InterviewCenter.tsx` lines 285-295
After rejecting a candidate, the component pre-fills for the next round. Should pre-fill on pass (when more rounds needed), not on reject.

### B7. No Interview-Grade Notification to Candidate
**File**: `InterviewCenter.tsx`
After `executeInterviewGrading` completes, no `candidate_notifications` insert. Candidate is left in the dark.

---

## What Already Works (Needs No Change)

✅ **ATS Screening**: Works — 6-dimension AI evaluation via Qwen, returns score/verdict/strengths/gaps  
✅ **Resume Parsing**: PDF/DOCX/TXT extraction in client + stored in `parsed_resume_text`  
✅ **Token Generation**: Creates UUID token with `candidate_id`, `assessment_id`, `application_id` linkage  
✅ **One-Time Token**: `used` boolean + `status` CHECK constraint enforced server-side by `grade-assessment`  
✅ **Duplicate Application Prevention**: `UNIQUE (candidate_id, form_id)` on `job_applications`  
✅ **Proctoring**: Camera, mic, fullscreen, blur/detection, AI vision frames (DETR + face detection)  
✅ **Badge Disappearance**: Badge count based on `is_read=false` query + clears on navigate to `/notifications`  
✅ **DB Triggers for Notifications**: Interview scheduled, offer created, application status change all auto-notify candidate  
✅ **Interview Scheduling UI**: InterviewCenter creates sessions, DB trigger notifies candidate  
✅ **Interview Grading with AI**: Scores + transcript → AI analysis → pass/fail decision  
✅ **Offer Pipeline**: Create → Approve → Send → Accept/Decline with DB triggers  
✅ **Real-time Subscriptions**: Badge counts and notification lists auto-refresh  

---

## Phase 3 Required Changes — Detailed Plan

### 1. `requires_assessment` Toggle in Job Form Creation
- **File**: `JobFormManagement.tsx`
- **Change**: Add checkbox/toggle labeled "Require Assessment for Shortlisted Candidates"
- **Database**: `job_forms.requires_assessment` (BOOLEAN, default false) — already exists
- This unblocks the auto-token generation flow in JobApplication.tsx

### 2. Auto-Token Generation on ATS Pass (Fixing the Dead Code)
- The code exists in `JobApplication.tsx` lines 324-390 but was blocked by B1
- After fixing B1, this flow activates automatically when `requires_assessment=true` AND `score >= 75`

### 3. Fix `grade-assessment` Status on Fail
- **File**: `supabase/functions/grade-assessment/index.ts`
- **Change**: After grading fails, set `job_applications.status = 'Rejected'`

### 4. Fix `grade-assessment` Status on Disqualify
- **File**: `supabase/functions/grade-assessment/index.ts`
- **Change**: On disqualification, set `job_applications.status = 'Rejected'`

### 5. Add Candidate Notification on Interview Grading
- **File**: `InterviewCenter.tsx` — after `executeInterviewGrading` completes
- **Insert**: `candidate_notifications` with title "Interview Result" and score/pass/fail message
- Also notify HR: insert into `notifications` for all HR users

### 6. Enhance InterviewCenter Next-Round Logic
- **File**: `InterviewCenter.tsx` lines 285-295
- **Change**: Fix the inverted conditional — pre-fill next round when passed, not when failed

### 7. Add Eye Gaze Tracking in Proctor-AI
- **File**: `supabase/functions/proctor-ai/index.ts`
- **Change**: Add dedicated gaze/eye-direction detection model call
- **Model**: `negative0/headpose-estimation` or similar HuggingFace model
- Use head pose angles (yaw, pitch, roll) to determine if candidate is looking at screen

### 8. Video + Audio Sensing Enhancement
- **Current**: AudioContext RMS monitoring for suspicious audio
- **Enhancement**: Add audio peak frequency analysis to detect pre-recorded audio playback vs live speech
- **Current**: 15-second AI frame capture
- **Enhancement**: Reduce to 10-second interval for more responsive proctoring

### 9. Professional Notification System Enhancements
- On visit to Notifications page: mark ALL notifications as `is_read=true` (not just clear badge)
- Add `notification_preferences` table or config for HR users to choose which events trigger notifications
- Add notification categories (assessment, interview, offer, general)

### 10. Fix ATSScanner Status Consistency
- Change ATSScanner to use `stage: 'Screening'` (matching JobApplication.tsx)

### 11. Fix ApplicationHub Filter List
- Add all missing status values to the filter dropdown

### 12. Add HR Notification When Candidate Is Ready for Interview
- After `grade-assessment` sets `interview_status = 'Pending Scheduling'`, notify HR
- Title: "Candidate Ready for Interview"
- Message: "[candidate] has passed assessment for [job]. AI recommends proceeding to interview. Schedule now in Interview Center."

---

## Summary: What Needs Code Changes

| # | File | Change Type | Description |
|---|---|---|---|
| 1 | `JobFormManagement.tsx` | **Enhancement** | Add `requires_assessment` toggle to form creation |
| 2 | `grade-assessment/index.ts` | **Bug Fix** | Set status='Rejected' on fail and disqualify |
| 3 | `InterviewCenter.tsx` | **Bug Fix + Enhancement** | Fix next-round logic; add candidate notification on grading |
| 4 | `proctor-ai/index.ts` | **Enhancement** | Add head pose/gaze detection model |
| 5 | `AssessmentAccess.tsx` | **Enhancement** | Tighten AI proctoring interval (10s); add audio frequency analysis |
| 6 | `ATSScanner.tsx` | **Consistency Fix** | Use `stage: 'Screening'` instead of `'Applied'` |
| 7 | `ApplicationHub.tsx` | **Bug Fix** | Add all missing statuses to filter list |
| 8 | `grade-assessment/index.ts` | **Enhancement** | Add HR notification for interview-ready candidates |
| 9 | `App.tsx` | **Route** | (no new routes needed) |
| 10 | `DashboardLayout.tsx` | **Enhancement** | Auto-mark-read all notifications on page visit |
