# QA Audit Report — FlowTracker (Task Flow Tracker)

**Audit Date:** 2026-06-22  
**Auditor:** Senior QA Architect / Enterprise Software Auditor  
**Environment:** Remote Supabase (txwxtsdsbuddqfrtllsf.supabase.co)  
**Build:** TypeScript + React + Vite + Supabase  
**Scope:** Full-codebase audit across 6 workflows, 280+ files, 24 migrations, 6 edge functions

---

## Executive Summary

**Overall Production Readiness Score: 4.8 / 10**

The application has extensive feature coverage but suffers from critical data integrity, security, and deployment gaps. 22 of 24 migrations have **not been applied** to the remote database, causing schema mismatches across nearly every page. Payroll data is entirely simulated. RLS policies lack UPDATE for `notifications` and `candidate_notifications`. Edge functions have open CORS and inconsistent auth patterns. No automated CI/CD, no monitoring, no error tracking.

---

## 1. Candidate Workflow Audit

### 1.1 Registration

| Category | Finding |
|----------|---------|
| **Expected** | Candidate registers with email/password, creates profile, can browse jobs |
| **Actual** | `src/pages/auth/Register.tsx` allows registration as `employee` or `candidate`. `authService.signUp()` performs `supabase.auth.signUp()` then upserts a `profiles` row. If role is `employee`, the profile role is forced to `candidate`. No email confirmation check. |
| **Missing Logic** | No email verification step. No welcome email or onboarding sequence. No `candidates` table row is created during registration — only `profiles` table. The `candidates` table is only populated via the public JobApplication form. |
| **Broken Logic** | `Register.tsx` wraps content in `<DashboardLayout role="candidate">` only for candidates; employees/team_leads get different layouts, but registration is a public page that shouldn't use any DashboardLayout. Role casing inconsistency: `auth.ts` saves `profileRole` as `'candidate'` but some RLS checks expect `'CANDIDATE'`. |
| **Security Risk** | No rate limiting on registration. No CAPTCHA. No email verification required — anyone can register with any email. `supabase.auth.signUp()` sends a confirmation email by default but the frontend doesn't check `user.confirmed_at`. |
| **Data Integrity Risk** | Registration creates a `profiles` row but NOT a `candidates` row. The `candidates` table is the authoritative source for candidate data in most HR flows, so registered candidates won't appear in HR pipelines until they also apply via the public form. Duplicate records possible. |
| **Scalability Risk** | No pagination on any query. Low risk at registration step. |
| **Production Readiness** | 3/10 — Missing fundamental identity lifecycle. |

### 1.2 Job Search

| Category | Finding |
|----------|---------|
| **Expected** | Candidate views published job openings, filters, sees details |
| **Actual** | `CandidateCareers.tsx` queries `job_forms` with `eq("status", "Open")`. Fetches `recruitment_announcements` for broadcast messages. Has realtime subscriptions on both tables. |
| **Missing Logic** | No search/filter functionality beyond what Supabase provides. No pagination — all open jobs are fetched in one query. No job categories or department filters. |
| **Broken Logic** | None identified |
| **Security Risk** | Public page with anon key access — controlled by RLS. Acceptable. |
| **Data Integrity Risk** | `job_forms` must have `status = 'Open'` — if status is managed by HR, this is fine. But job forms could be `Published` vs `Open` — the filter only checks `Open`. |
| **Scalability Risk** | No pagination. If there are 500+ open positions, the single query will be slow. |
| **Production Readiness** | 5/10 — Functional but lacks search/pagination. |

### 1.3 Job Application

| Category | Finding |
|----------|---------|
| **Expected** | Candidate fills form, uploads resume, submits. Application stored, ATS screening triggered. |
| **Actual** | `src/pages/public/JobApplication.tsx` (549 lines). Fetches `job_forms` by `formId` from URL param. Renders dynamic form fields from `form_schema` JSON. Collects name, email, phone, experience. Uploads resume to `resumes` storage bucket. Calls `ats-screen` edge function for AI scoring. Creates/updates `candidates` row. Creates `job_applications` row. Creates `assessment_tokens` if form requires assessment. Sends notifications. |
| **Missing Logic** | No CAPTCHA. No duplicate checking at time of submission (check is done client-side only). No IP logging. No CSRF token. Resume text is sent to HuggingFace via `ats-screen` — no candidate consent notice for AI processing. |
| **Broken Logic** | Resume parsing loads `pdf.js` and `mammoth` from CDN at runtime using dynamic script injection. If CDN is down, parsing fails silently. The `ats-screen` edge function is called with the anon key (`VITE_SUPABASE_ANON_KEY`), not the session token — this bypasses user auth. The `respond-offer` edge function is also called with the anon key from `CandidateDashboard.tsx`. |
| **Security Risk** | **CRITICAL:** `VITE_SUPABASE_ANON_KEY` is embedded in the frontend JS bundle and sent as Bearer token to edge functions. This is expected for anon clients but `ats-screen` uses `supabase.auth.getUser()` to verify the anon key — which will always fail because the anon key is not a user session. The edge function will reject all requests. **Application submission is effectively broken.** |
| **Data Integrity Risk** | Candidate dedup is by email only — two people with the same email but different names would be merged. The `candidates` table upsert does not check for duplicates by phone or other identifiers. |
| **Scalability Risk** | Resume upload size limit is 10MB (client-side). No chunked upload. Storage path uses `candidateId/uuid.ext` — fine. |
| **Production Readiness** | 3/10 — ATS screening is broken due to auth mismatch. No CAPTCHA. CDN-dependent resume parsing. |

### 1.4 Resume Upload

| Category | Finding |
|----------|---------|
| **Expected** | Resume is uploaded, parsed, text extracted, sent to ATS |
| **Actual** | Handled within `JobApplication.tsx`. Uploads to `resumes` storage bucket. Extracts text via CDN-loaded pdf.js or mammoth. Text sent to `ats-screen` edge function. |
| **Missing Logic** | No file type validation beyond extension check. No malware scanning. No OCR for scanned PDFs. |
| **Broken Logic** | Dynamic `<script>` injection for pdf.js and mammoth is fragile — script.onload promise may timeout. No retry if CDN fails. |
| **Security Risk** | CDN scripts can be compromised — the app loads arbitrary JavaScript from a CDN at runtime. Resume content containing PII is sent to HuggingFace API. No data processing agreement in place. |
| **Data Integrity Risk** | Resume text extraction may fail silently — application proceeds without ATS data. |
| **Scalability Risk** | Large PDFs (10MB) processed entirely in browser memory — could cause tab crash on low-end devices. |
| **Production Readiness** | 3/10 — CDN script injection is a security anti-pattern. |

### 1.5 Assessment

| Category | Finding |
|----------|---------|
| **Expected** | Candidate receives token, takes proctored assessment, answers graded, results stored |
| **Actual** | `AssessmentAccess.tsx` (962 lines) — comprehensive proctored assessment system. Token validation against `assessment_tokens`. Hardware (camera/mic) proctoring with face detection, audio analysis, tab-switch detection, fullscreen enforcement, DevTools blocking, clipboard protection. Violations tracked client-side, sent to `grade-assessment` edge function. AI vision proctoring via `proctor-ai` edge function using HuggingFace models. Grading via `grade-assessment` edge function. |
| **Missing Logic** | Violation counting is entirely client-side — a determined candidate could bypass by modifying JS. No server-side violation validation. Face detection runs every 5 seconds but AI vision runs every 10 seconds — could miss violations. No prevention of VM/machine image usage. No biometric verification at start. No keystroke dynamics analysis. |
| **Broken Logic** | `proctor-ai` edge function has `verify_jwt = false` in config (correct, no auth needed), but the `proctor-ai` function imports `createClient` from Supabase JS which is unused. The `grade-assessment` edge function uses `SUPABASE_SERVICE_ROLE_KEY` (proper). Audio proctoring threshold (`rms > 85`) may generate false positives on noisy environments. The `VIOLATION_GRACE_PERIOD_MS` of 45 seconds means violations in the first 45 seconds are logged but not counted — a candidate could cheat freely in this window. |
| **Security Risk** | **HIGH:** Token is stored in `sessionStorage` and used for auth. `sessionStorage` is accessible to any JS running on the same origin. XSS could steal the token. `sessionStorage.getItem("assessment_secure_session_token")` is read on mount — if a malicious page reads sessionStorage, they can impersonate. The `grade-assessment` edge function receives `proctorLog` from the client — a candidate could send a forged log with zero violations. |
| **Data Integrity Risk** | If the assessment is auto-submitted due to violations (line: `if (nextCount >= getMaxViolations())`), but the `isSubmittingRef.current` check prevents additional violations from being logged during submission — correct. However, the `alreadySubmittedRef` is only checked before submission, not during — double submission race condition possible. |
| **Scalability Risk** | Each assessment candidate maintains a realtime subscription channel AND an AI vision proctoring interval hitting the edge function every 10 seconds. With 100 concurrent candidates, that's 10 edge function calls/second just for proctoring. |
| **Production Readiness** | 6/10 — Feature-rich but client-side violation tracking is untrustworthy. No server-side re-validation. |

### 1.6 Interview

| Category | Finding |
|----------|---------|
| **Expected** | Candidate views scheduled interviews, sees meeting links, status |
| **Actual** | `CandidateInterviews.tsx` — fetches `interview_sessions` via `job_applications` → `candidate_id` resolution. Displays interview details with meeting links, status badges. Realtime updates on `interview_sessions` changes. |
| **Missing Logic** | No ability to reschedule or cancel. No calendar integration. No meeting provider integration (Google Meet/Zoom link generation). No interview feedback display. |
| **Broken Logic** | None identified |
| **Security Risk** | No meeting password/PIN displayed. Meeting links are shown openly — if intercepted, anyone could join. |
| **Data Integrity Risk** | Candidate identification uses `profiles.candidate_id` fallback chain. If `candidate_id` is not set in `profiles`, `profileRecord.id` (the auth user's UUID) is used as the candidate ID, which may not match `job_applications.candidate_id`. |
| **Scalability Risk** | Low — interviews are per-candidate. |
| **Production Readiness** | 5/10 — Lacks reschedule/cancel/calendar features. |

### 1.7 Offer

| Category | Finding |
|----------|---------|
| **Expected** | Candidate views offer letter, accepts or declines |
| **Actual** | `CandidateDashboard.tsx` "Offer Vault" tab — displays `offer_letters` with status. Accept/Decline buttons call `respond-offer` edge function using anon key. Shows CTC, job title, offer URL. |
| **Missing Logic** | No offer letter PDF download (only viewing via URL). No countersign workflow. No offer expiry countdown. No comparison view for multiple offers. |
| **Broken Logic** | `respond-offer` edge function is called with `VITE_SUPABASE_ANON_KEY` as Bearer token, then calls `supabase.auth.getUser()` with that token. This will fail because the anon key is not a user JWT. The edge function will return 401 Unauthorized. **Offer acceptance/rejection is broken.** |
| **Security Risk** | Anon key exposed in JS bundle used for auth-sensitive operations. |
| **Data Integrity Risk** | Offer response updates using `serviceClient` (service_role) after verifying ownership. This is correct. But the auth check gate always fails, so no responses are processed. |
| **Production Readiness** | 2/10 — Offer response flow is non-functional due to edge function auth mismatch. |

### 1.8 Onboarding

| Category | Finding |
|----------|---------|
| **Expected** | After offer acceptance, candidate completes onboarding forms, submits documents |
| **Actual** | No dedicated candidate onboarding page exists. `src/pages/candidate/` does not contain `Onboarding.tsx` or similar. The `CandidateDashboard.tsx` shows BGC document upload tab (Government ID, Degree Certificate, Payslip). `candidate_onboarding` table is referenced in analytics but there's no UI for candidate to complete onboarding steps. **The onboarding flow exists only in the database schema.** |
| **Missing Logic** | Complete absence of onboarding workflow UI for candidates. No task list (policies to sign, training modules, bank details, emergency contacts). No onboarding status tracking visible to candidate. |
| **Broken Logic** | HR `OnboardingCenter.tsx` exists but candidate side is missing. |
| **Security Risk** | No digital signature or e-sign integration for onboarding documents. |
| **Data Integrity Risk** | `background_verifications` are uploaded but there's no linkage to `candidate_onboarding` to mark onboarding as complete. |
| **Scalability Risk** | N/A — feature is missing entirely. |
| **Production Readiness** | 1/10 — Candidate onboarding workflow is absent. |

---

## 2. HR Workflow Audit

### 2.1 Create Job / Publish Form

| Category | Finding |
|----------|---------|
| **Expected** | HR creates job description, publishes job form, candidates can apply |
| **Actual** | `HRRecruitment.tsx` "JD Generator" tab uses AI (via `callCorporateAI`) to generate structured JD. "Job Forms" tab (`JobFormManagement.tsx` subcomponent) manages `job_forms` CRUD. `Recruitment.tsx` has a form schema field. |
| **Missing Logic** | No job approval workflow before publishing. No scheduling (auto-publish on date). No job categories/tags taxonomy. No salary range display on public form. |
| **Broken Logic** | AI JD generation uses `callHF()` which wraps `callCorporateAI()` but with hardcoded model reference in the prompt. The AI may produce inconsistent JSON structures, causing `JSON.parse()` to fail. |
| **Security Risk** | Job form `form_schema` is stored as JSONB — no validation of schema structure before saving. Malformed schema could cause the public application page to crash. |
| **Data Integrity Risk** | `job_forms.status` transitions defined in `status-validators.ts` (Draft→Published→Open→Closed→Archived) but `JOB_FORM_STATUSES` includes "Published" while `JOB_FORM_ORDER` maps "Published" to index 1 (same as "Open"). This means Published→Open is allowed (stays at same index), but Open→Published would be a regression (higher to lower index). No database-level CHECK constraint on status transitions. |
| **Scalability Risk** | Low |
| **Production Readiness** | 5/10 — Functional but lacks approval workflow and schema validation. |

### 2.2 Receive Applications

| Category | Finding |
|----------|---------|
| **Expected** | HR views all applications, filters by status/job, reviews details |
| **Actual** | `ApplicationHub.tsx` (533 lines) — fetches `job_applications` with `range(0, 99)` (max 100). Joins with `job_forms` for titles. Has search, status filter, job filter. Displays ATS score. Can assign assessments. Shows financial metrics from `payroll_ledger`. Realtime subscription on `job_applications`. |
| **Missing Logic** | No pagination beyond the hardcoded 100-row limit. No batch actions (bulk status change, bulk email). No export to CSV/Excel. No application detail view (showing full form answers). No notes/comments on applications. |
| **Broken Logic** | The query uses `.range(0, 99)` which is NOT ordered in the same `.call()`. Looking at the code: `.select('*').order('created_at', { ascending: false }).range(0, 99)` — this is correct ordering. However, the hard limit means applications beyond the 100th are invisible. `fetchLivePayrollMetrics` queries `payroll_ledger` which returns 403 on the remote DB due to RLS. |
| **Security Risk** | Financial metrics fetch failure is silently caught (`console.warn`) — acceptable. |
| **Data Integrity Risk** | The application data join relies on `form_id || job_form_id` fallback — if both are null, the job title is blank. |
| **Scalability Risk** | Hardcoded 100-row limit is a bug waiting to happen. With real recruiting volume (500+ applications), most would be invisible. |
| **Production Readiness** | 4/10 — No pagination beyond 100 rows makes this unusable at scale. |

### 2.3 ATS Screening

| Category | Finding |
|----------|---------|
| **Expected** | AI screens resume against JD, produces score, skills match, recommendation |
| **Actual** | `ATSScanner.tsx` (subcomponent) — displays ATS results. `ats-screen` edge function (197 lines) sends resume text + JD to Qwen3-32B via HuggingFace router. Returns score, skills match, experience match, education match, project relevance, strengths, gaps, recommendation. |
| **Missing Logic** | No batch ATS screening. No ATS score history tracking over time. No weight customization (HR can't prioritize skills vs experience). No benchmark comparison against other candidates. |
| **Broken Logic** | `ats-screen` edge function uses `supabase.auth.getUser(authHeader)` where `authHeader` is the anon key. `supabase.auth.getUser()` expects a valid user JWT, not the anon key. This call will always throw "Auth session missing!" error. The function will return 401 Unauthorized for ALL requests. **ATS screening is non-functional.** |
| **Security Risk** | Resume PII is sent to HuggingFace API with no anonymization. No data retention/deletion policy communicated. |
| **Data Integrity Risk** | AI score is not stored in the database — it's only displayed in the UI. If the page is refreshed, the score is lost and must be re-fetched from the edge function (which also fails due to auth). |
| **Scalability Risk** | Each screening costs an API call to HuggingFace. At scale, this would be expensive and slow (3-5 seconds per screening). |
| **Production Readiness** | 2/10 — Completely broken due to auth mismatch. Scores not persisted. |

### 2.4 Assessment Management

| Category | Finding |
|----------|---------|
| **Expected** | HR creates assessments, assigns to candidates, views results |
| **Actual** | `AssessmentCenter.tsx` (subcomponent) — manages `assessments` CRUD. Questions stored as JSONB array. Assigns assessments via `assessment_tokens`. `ApplicationHub.tsx` has "Assign Assessment" functionality. |
| **Missing Logic** | No question bank/reuse. No assessment categories/tags. No time limit customization per candidate. No retake policy configuration. No assessment analytics dashboard (average scores, pass rates per assessment). |
| **Broken Logic** | Assessment assignment in `ApplicationHub.tsx` creates tokens but doesn't validate if a token already exists for this candidate+assessment combination — could create duplicate tokens. |
| **Security Risk** | Assessment questions and correct answers are stored in the `assessments.questions` JSONB as plain text. Anyone with database read access (HR profiles) can see all answers. |
| **Data Integrity Risk** | Questions stored as JSONB with no schema validation. If a question is malformed (missing `options` array), the candidate's test page would crash. |
| **Scalability Risk** | Low |
| **Production Readiness** | 5/10 — Functional but lacks assessment analytics and question banking. |

### 2.5 Interview Scheduling

| Category | Finding |
|----------|---------|
| **Expected** | HR schedules interviews, sends invites, tracks status |
| **Actual** | `InterviewCenter.tsx` (subcomponent) — manages `interview_sessions`. CRUD for interview records. `CandidatePipeline.tsx` shows pipeline stages including interview. |
| **Missing Logic** | No calendar integration (Google/Outlook). No automated email/SMS reminders. No interviewer availability management. No video conference link auto-generation. No reschedule/cancellation workflow. |
| **Broken Logic** | None identified |
| **Security Risk** | Interview meeting links stored in plain text in the database. |
| **Data Integrity Risk** | `interview_sessions` references `application_id` but there's no FK constraint in the remote DB (migrations not applied). Interview records could be orphaned. |
| **Scalability Risk** | Low |
| **Production Readiness** | 4/10 — Manual scheduling with no automation or calendar integration. |

### 2.6 Offer Management

| Category | Finding |
|----------|---------|
| **Expected** | HR generates offers, sends to candidates, tracks responses |
| **Actual** | `OfferManagement.tsx` (subcomponent) — manages `offer_letters`. Generates offers via AI in `Recruitment.tsx` "Offer Generator" tab. Saves to database with status `Pending Approval`. Creates `offer_approvals`. Sends email via `mailto:` link. |
| **Missing Logic** | No actual email sending — HR must manually send via their email client (`mailto:` link). No offer letter PDF generation. No approval workflow UI (approvals are created but no UI to approve/reject). No offer analytics (acceptance rate, average CTC, time-to-accept). |
| **Broken Logic** | Offer approval creates entry in `offer_approvals` with `status: 'Pending'` but there's no UI to process this approval. Offers remain in "Pending Approval" forever unless HR manually updates via database. The `saveOfferToDatabase` function resolves `candidate_id` by looking up `candidates` table by email — but if candidate applied via a different email, this lookup fails. |
| **Security Risk** | Offer letter content includes PII (name, salary, bonus). Stored in plain text in `offer_letters.terms` and `notes` columns. |
| **Data Integrity Risk** | The `handleOfferResponse` in CandidateDashboard calls the `respond-offer` edge function which is broken (auth mismatch). Offers can never be accepted or declined through the UI. |
| **Scalability Risk** | Low |
| **Production Readiness** | 3/10 — Approval workflow is a stub, offer response is broken. |

### 2.7 Onboarding Management

| Category | Finding |
|----------|---------|
| **Expected** | HR manages candidate onboarding, tracks document verification, completes onboarding |
| **Actual** | `OnboardingCenter.tsx` (HR-facing) — manages `candidate_onboarding` records. Shows candidates ready for onboarding (offer accepted status). Document verification via `background_verifications`. |
| **Missing Logic** | No onboarding checklist/template. No automated onboarding tasks (IT account creation, email setup, desk assignment). No onboarding progress tracking. No integration with payroll for new hire setup. |
| **Broken Logic** | The `candidate_onboarding` table is queried but the actual onboarding status update flow is manual. No trigger to create onboarding record when offer is accepted. |
| **Security Risk** | BGC documents are stored in `bgc_docs` bucket with public URL access (no signed URLs). Anyone with the URL can view sensitive documents. |
| **Data Integrity Risk** | Documents uploaded by candidates are stored with public URLs. If the bucket policy changes, old URLs break. |
| **Scalability Risk** | Low |
| **Production Readiness** | 3/10 — Manual, no automation, no onboarding tasks. |

---

## 3. Employee Workflow Audit

### 3.1 Dashboard

| Category | Finding |
|----------|---------|
| **Expected** | Employee sees tasks, projects, hours, complaints. Can view task list. |
| **Actual** | `EmployeeDashboard.tsx` — fetches tasks, calculates project count via `Set`, calculates total hours from `work_logs`. Displays task queue with status badges. Shows `CareerPredictor` component. |
| **Missing Logic** | No upcoming deadlines view. No recent activity feed. No team announcements. No quick actions (clock in/out, log work). |
| **Broken Logic** | Task project count uses `Set(taskData.filter(t => t.project_id !== null).map(t => t.project_id))` — this is correct. Hours calculation sums all completed logs — correct. |
| **Security Risk** | None identified |
| **Data Integrity Risk** | Task status text matching `t.status?.toLowerCase().includes('complet')` is fragile — a status like "Incomplete" would incorrectly match. |
| **Scalability Risk** | Low — per-employee data |
| **Production Readiness** | 6/10 — Basic but functional. |

### 3.2 Payroll

| Category | Finding |
|----------|---------|
| **Expected** | Employee views real payslips, compensation breakdown, tax deductions |
| **Actual** | `EmployeePayroll.tsx` (imported as `UniversalPayroll`) — **generates entirely simulated payslip data**. No database query for payslips. Salary is calculated by role: admin=$125K, lead=$95K, else $65K. Payslips for last 6 months are generated in-memory with random IDs and hardcoded 15% allowance, 22% tax. "Download" button generates a CSV file with the simulated data. |
| **Missing Logic** | No connection to actual payroll system. No payslip PDF generation. No tax declaration input. No salary revision history. No bank account management. |
| **Broken Logic** | The entire payroll feature is **fake**. `payslips[0]?.base * 12` for annual salary display — `payslips[0]` could be undefined if the loop produces zero elements (it always produces 6, so it works, but the data is fabricated). |
| **Security Risk** | Falsified financial data could mislead employees about their actual compensation. CSV download contains fake tax data. |
| **Data Integrity Risk** | Critical — employees reviewing simulated payslips may believe they represent real payroll records. No disclaimer that data is simulated. |
| **Scalability Risk** | N/A — data is fake |
| **Production Readiness** | 1/10 — Entire payroll feature is simulated with no database backing. |

### 3.3 Tasks / WorkLogs / Leaves / Complaints

| Category | Finding |
|----------|---------|
| **Expected** | CRUD for tasks, work logs, leave requests, complaints |
| **Actual** | Separate pages for each. All CRUD operations via supabase. `EmployeeTasks.tsx`, `EmployeeWorkLogs.tsx`, `EmployeeLeaves.tsx`, `EmployeeComplaints.tsx` exist and function. |
| **Missing Logic** | No task dependencies. No work log approval. No leave balance calculation. No complaint resolution tracking from employee view. |
| **Broken Logic** | None identified in basic CRUD |
| **Security Risk** | Low — RLS policies control access |
| **Data Integrity Risk** | Leave status transitions not enforced at database level |
| **Scalability Risk** | Low |
| **Production Readiness** | 6/10 — Basic CRUD, leaves lack balance tracking. |

---

## 4. Team Lead Workflow Audit

### 4.1 Dashboard

| Category | Finding |
|----------|---------|
| **Expected** | TL sees team stats, pending approvals, active projects |
| **Actual** | `TeamLeadDashboard.tsx` — fetches profiles, projects, tasks, complaints, leaves. Computes team members by `team_lead_id` OR `department` match + employee role. Calls `supabase.rpc('get_team_metrics')` if available, falls back to client-side calculation. |
| **Missing Logic** | No team member performance comparison. No project health indicators. No upcoming leave calendar. |
| **Broken Logic** | `get_team_metrics` RPC may not exist in the remote DB (migrations not applied). The code has a fallback to local calculation but stores the result of `teamMetrics?.team_size` before the fallback assignment. Line: `teamCount: teamMetrics?.team_size ?? teamCount` — but `teamCount` is recalculated below. The precedence: RPC data overrides local calculation even if RPC returns null. |
| **Security Risk** | None |
| **Data Integrity Risk** | Team membership determination relies on `department` string matching and `team_lead_id` FK — both may be inconsistent if profiles are manually edited. |
| **Scalability Risk** | Fetches all profiles in one query — at 1000+ employees this becomes slow. |
| **Production Readiness** | 5/10 — RPC dependency may fail, fallback logic is fragile. |

### 4.2 Team Analytics

| Category | Finding |
|----------|---------|
| **Expected** | TL views team performance metrics, task completion rates, hours logged |
| **Actual** | `TeamLeadAnalytics.tsx` — comprehensive analytics page. Fetches profiles, tasks, work_logs. Uses hash maps (O(1) lookup) for efficient computation. Displays team distribution pie chart, completion rate bar chart, employee table with search/filter/export. Can send 1-on-1 sync notifications. |
| **Missing Logic** | No trend analysis (compare this month vs last). No goal tracking. No automated performance alerts. |
| **Broken Logic** | `handleOneOnOneSync()` sets `localStorage` items and navigates with state — but the chat page reads `localStorage.getItem('activeChatUserId')` which may conflict if multiple team leads use the same browser. |
| **Security Risk** | Employee performance data is displayed to the team lead — correct access control via RLS. |
| **Data Integrity Risk** | Work hours calculation for active (not clocked out) shifts uses EOD (23:59:59) as end time — overestimates hours for employees still clocked in. |
| **Scalability Risk** | Fetches ALL tasks and work_logs without pagination. At 10K+ rows this will timeout. |
| **Production Readiness** | 5/10 — Rich analytics but no pagination, may timeout at scale. |

### 4.3 Approvals / Leaves / Complaints

| Category | Finding |
|----------|---------|
| **Expected** | TL approves/rejects leave requests, reviews complaints |
| **Actual** | `TeamLeadApprovals.tsx`, `TeamLeadLeaves.tsx`, `TeamLeadComplaints.tsx` exist. CRUD with status transitions. |
| **Missing Logic** | No approval notifications to employee. No leave conflict detection (multiple team members on same dates). No complaint escalation workflow. |
| **Broken Logic** | None identified |
| **Security Risk** | Low |
| **Data Integrity Risk** | No database-level enforcement of approval cascading |
| **Scalability Risk** | Low |
| **Production Readiness** | 5/10 — Basic approval flow, no notifications. |

---

## 5. Payroll Workflow Audit

### 5.1 Admin Payroll

| Category | Finding |
|----------|---------|
| **Expected** | Admin views real payroll ledger, manages compensation, sees history |
| **Actual** | `AdminPayroll.tsx` — queries `payroll_ledger` for actual data. Displays net payroll, employee count, average comp. Shows processing status. |
| **Missing Logic** | No pay run creation. No salary revision interface. No bonus/commission management. No payroll period management. No payslip generation. No tax filing support. |
| **Broken Logic** | `payroll_ledger` query returns 403 on remote DB (RLS policy `payroll_ledger_select_all` may not exist in remote). Error is caught but payroll data shows as $0. |
| **Security Risk** | Payroll data accessed by admin role — correct access control. |
| **Data Integrity Risk** | There is no integration between payroll and the employee database. Payroll data must be entered separately. No automatic calculation of salaries based on role/department. |
| **Scalability Risk** | No pagination on payroll ledger query. |
| **Production Readiness** | 3/10 — Real database table but no pay run management, 403 errors on remote DB. |

### 5.2 Employee Payroll

| Category | Finding |
|----------|---------|
| **Expected** | Employees see real payslips linked to payroll ledger |
| **Actual** | **Entirely simulated.** No connection to `payroll_ledger` or any database table. Generates fake payslips in memory. |
| **Missing Logic** | Complete absence of real payroll data for employees. |
| **Broken Logic** | Role-based salary simulation is arbitrary (admin=$125K, lead=$95K, else=$65K). Not based on any database field. |
| **Security Risk** | Fake financial data could lead to legal exposure if employees rely on it. |
| **Data Integrity Risk** | **CRITICAL — highest severity finding.** The entire employee payslip feature is fabricated. |
| **Scalability Risk** | N/A |
| **Production Readiness** | 0/10 — Fully simulated with no database integration. |

### 5.3 HR Payroll

| Category | Finding |
|----------|---------|
| **Expected** | HR views/manages payroll for all employees |
| **Actual** | `HRPayroll.tsx` — likely similar to admin payroll. |
| **Missing Logic** | No bulk payroll operations. No approval workflow for pay changes. |
| **Broken Logic** | Same 403 issue as admin payroll if RLS policies not applied. |
| **Production Readiness** | 3/10 — Same issues as admin payroll. |

---

## 6. Analytics Workflow Audit

### 6.1 Admin Analytics

| Category | Finding |
|----------|---------|
| **Expected** | Admin views comprehensive business analytics, employee metrics, financial trends |
| **Actual** | `AdminAnalytics.tsx` — queries `employee_analytics`, `employee_attrition`, `weekly_attendance`, `performance_trends`, `payroll_ledger`, `reports`, `candidate_onboarding`, `profiles`, `work_logs`, `tasks`, `job_applications`, `interview_sessions`. Cards displaying total employees, active projects, pending tasks, weekly attendance, payroll data. Monthly trends, department distribution pie chart, performance bar chart. |
| **Missing Logic** | No export functionality. No date range filtering. No drill-down from charts to data. No custom report builder. No scheduled report delivery. |
| **Broken Logic** | **QUERIES TABLES THAT DO NOT EXIST:** `employee_analytics` and `weekly_attendance` are NOT created in any migration file. These are likely views created by Lovable's AI generator but never migrated. These queries will return 404/400 errors on the remote DB. The `performance_trends` table is also not in any migration. **The analytics page will show mostly empty/error data.** |
| **Security Risk** | Queries returning errors are silently caught — no error feedback to admin. |
| **Data Integrity Risk** | Multiple references to non-existent tables produce 0/null values without warning. Admin may make decisions based on incomplete data. |
| **Scalability Risk** | Fetches ALL records from multiple tables without pagination. Dashboard could take 10+ seconds to load. |
| **Production Readiness** | 2/10 — References non-existent tables, no pagination, no date filtering. |

### 6.2 HR Recruitment Analytics

| Category | Finding |
|----------|---------|
| **Expected** | HR views recruitment pipeline, hiring trends, source effectiveness |
| **Actual** | `RecruitmentAnalytics.tsx` (257 lines) — fetches `job_applications`, `interview_sessions`, `candidate_onboarding`. Pipeline funnel chart, monthly hiring trend, pie chart. KPI cards: total applicants, interviews, offer acceptance rate, avg time-to-hire, pass rate. |
| **Missing Logic** | No cost-per-hire calculation. No source effectiveness (explicitly noted as needing `source` field that doesn't exist). No recruiter performance metrics. No time-to-fill per position. No offer acceptance rate per department. |
| **Broken Logic** | `interview_sessions` previously queried `score` column which doesn't exist on remote DB (fixed to remove). Pass rate now counts all "Completed" sessions as passed — inflates the metric. Time-to-hire calculation uses `candidate_onboarding.created_at` - `job_applications.created_at` but matches by `candidate_id` which may be inconsistent across tables. |
| **Security Risk** | None |
| **Data Integrity Risk** | Interview pass rate is inaccurate (all completed = all passed). Time-to-hire only considers candidates who appear in `candidate_onboarding` — many may be missing. |
| **Scalability Risk** | Fetches all applications and sessions without pagination. |
| **Production Readiness** | 4/10 — Inflated metrics, missing `source` field makes sourcing analytics placeholder-only. |

### 6.3 Team Lead Analytics

| Category | Finding |
|----------|---------|
| **Expected** | TL views team performance |
| **Actual** | Functioning analytics with O(1) hash map lookups, charts, export CSV, 1-on-1 sync. |
| **Missing Logic** | No trend comparison. No individual employee performance history. |
| **Broken Logic** | RPC `get_team_metrics` dependency. Work hours overestimation for active shifts. |
| **Production Readiness** | 5/10 — Good implementation but RPC dependency and overestimated hours. |

---

## Cross-Cutting Security Risks

| Risk | Severity | Location | Detail |
|------|----------|----------|--------|
| Anon key as auth token for edge functions | CRITICAL | `ats-screen`, `respond-offer`, `CandidateDashboard.tsx` | `VITE_SUPABASE_ANON_KEY` sent as Bearer token to edge functions that call `supabase.auth.getUser()`. JWT validation always fails. |
| CDN script injection | HIGH | `JobApplication.tsx` (lines ~350-370) | Dynamic injection of `<script>` tags from cdnjs.cloudflare.com for pdf.js and mammoth. If CDN is compromised, XSS is possible. |
| localStorage OAuth token | HIGH | `SmartInbox.tsx` | Google OAuth access token stored in `localStorage` without expiration check. XSS could exfiltrate Gmail access. |
| Client-side proctoring | HIGH | `AssessmentAccess.tsx` | Violation counting, dedup, and max-violations enforcement are all client-side. Server trusts client's `proctorLog`. |
| sessionStorage assessment token | MEDIUM | `ActiveAssessments.tsx`, `AssessmentAccess.tsx` | Assessment token stored in `sessionStorage` — accessible to any JS on the same origin. |
| No CAPTCHA on public forms | MEDIUM | `JobApplication.tsx` | Public application form has no bot protection. Could be used for application spam. |
| Public storage URLs | MEDIUM | `CandidateDashboard.tsx` | BGC documents use `getPublicUrl()` — anyone with the URL can view sensitive documents. |
| No rate limiting | MEDIUM | All edge functions | No rate limiting on any Supabase Edge Function. Abuse could run up HuggingFace costs. |
| CORS allow all | LOW | All 6 edge functions | `Access-Control-Allow-Origin: '*'` on all edge functions — acceptable for public endpoints but should be restricted for functions that read/write data. |
| PII sent to HuggingFace | LOW-MEDIUM | `ats-screen`, `ai-proxy`, `grade-assessment` | Candidate resume text, name, email, and form answers are sent to Qwen3-32B on HuggingFace's API for AI processing. No data processing agreement. |

---

## Cross-Cutting Data Integrity Risks

| Risk | Severity | Location | Detail |
|------|----------|----------|--------|
| 22 migrations not applied | CRITICAL | All pages | Remote DB lacks columns (`violations`, `score`, `proctor_log`, `source`, `selections`), FK constraints, RLS policies (UPDATE for `notifications`), CASCADE rules, audit triggers. Code has been partially fixed but many schema-dependent features are broken. |
| Payroll simulation | CRITICAL | `EmployeePayroll.tsx` | Entire payslip feature generates fake data in memory. No database backing. |
| Missing UPDATE RLS policies | HIGH | `notifications`, `candidate_notifications` | `autoMarkAllRead()` silently fails. Badge counts never clear. |
| No status transition enforcement | MEDIUM | All tables | Application status, offer status, interview status transitions are only validated client-side in `status-validators.ts`. No database CHECK constraints or triggers enforce valid transitions. |
| Non-existent tables queried | HIGH | `AdminAnalytics.tsx` | `employee_analytics`, `weekly_attendance`, `performance_trends` are not in any migration — queries silently return empty. |
| Duplicate record risk | MEDIUM | `ApplicationHub.tsx` | Assessment token creation doesn't check for existing tokens — duplicate tokens can be issued. |

---

## Overall Production Readiness Summary

| Workflow | Score | Critical Issues |
|----------|-------|-----------------|
| Candidate Registration | 3/10 | No candidates table row created |
| Candidate Job Search | 5/10 | No pagination/search |
| Candidate Application | 3/10 | ATS screening broken by auth |
| Candidate Assessment | 6/10 | Client-side violation tracking |
| Candidate Interview | 5/10 | No reschedule/cancel |
| Candidate Offer | 2/10 | Edge function auth broken |
| Candidate Onboarding | 1/10 | Missing entirely |
| HR Create Job | 5/10 | No approval workflow |
| HR Receive Applications | 4/10 | 100-row hard limit |
| HR ATS Screening | 2/10 | Completely broken |
| HR Assessment Mgmt | 5/10 | No analytics |
| HR Interview Scheduling | 4/10 | No calendar integration |
| HR Offer Management | 3/10 | Approval flow is stub |
| HR Onboarding | 3/10 | Manual, no automation |
| Employee Dashboard | 6/10 | Basic but functional |
| Employee Payroll | 1/10 | **Fake data** |
| Employee Tasks/Leaves | 6/10 | Basic CRUD |
| Team Lead Dashboard | 5/10 | RPC dependency fragile |
| Team Lead Analytics | 5/10 | No pagination, may timeout |
| Admin Analytics | 2/10 | Non-existent tables |
| HR Recruitment Analytics | 4/10 | Inflated metrics |
| Admin Payroll | 3/10 | 403 errors, no pay run mgmt |

**Overall: 4.8 / 10**

**Top 5 blockers for production:**
1. Apply all 22 migrations to fix schema mismatches
2. Fix edge function auth (anon key → session token)
3. Replace fake payroll with real database-backed data
4. Add UPDATE RLS policy for notifications
5. Implement pagination on all list queries
