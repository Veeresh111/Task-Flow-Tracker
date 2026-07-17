# Test Cases — FlowTracker (Task Flow Tracker)

**Test Plan Version:** 1.0  
**Author:** Senior QA Architect / SDET Engineer  
**Scope:** Functional, Integration, E2E, Negative, Security, Load tests  
**Prerequisites:** Supabase project initialized with all 24 migrations applied, 6 edge functions deployed, HF_TOKEN configured in Supabase secrets

---

## 1. Functional Tests

### FT-001: Candidate Registration
| Field | Value |
|-------|-------|
| **ID** | FT-001 |
| **Title** | Verify candidate registration creates profile in database |
| **Precondition** | No existing account with test email |
| **Steps** | 1. Navigate to `/register` 2. Enter name "Test Candidate" 3. Enter email "test.candidate@example.com" 4. Enter password "Test@123456" 5. Select role "Candidate" 6. Click "Create Account" |
| **Expected** | `profiles` table has row with `id` = auth.uid, `role` = "candidate". `candidates` table has row with `email` = "test.candidate@example.com". Auth user is created. Redirected to `/candidate`. |
| **Actual** | Registration creates `profiles` row but NOT `candidates` row. User is redirected to login with confirmation email notice. |

### FT-002: Job Form Creation by HR
| Field | Value |
|-------|-------|
| **ID** | FT-002 |
| **Title** | Verify HR can create and publish a job form |
| **Precondition** | Logged in as HR |
| **Steps** | 1. Navigate to `/hr/recruitment` 2. Click "Job Forms" tab 3. Click "New Job Form" 4. Enter title "Senior QA Engineer", department "Engineering", location "Bangalore" 5. Add form fields (name, email, resume upload, experience years) 6. Set status to "Open" 7. Save |
| **Expected** | `job_forms` table has new row. Status is "Open". Job appears in candidate careers page. |

### FT-003: Candidate Applies to Job
| Field | Value |
|-------|-------|
| **ID** | FT-003 |
| **Title** | Verify candidate can submit a job application |
| **Precondition** | Job form exists with status "Open". PDF resume file available. |
| **Steps** | 1. Navigate to public apply URL `/apply/{formId}` 2. Enter name, email, phone, experience 3. Upload resume PDF 4. Click Submit |
| **Expected** | `candidates` table has row. `job_applications` table has row with `status` = "Applied" or "Screening". Resume uploaded to `resumes` storage bucket. `ats-screen` edge function called. |
| **Note** | ATS screening expected to FAIL due to auth mismatch. Verify error handling is graceful. |

### FT-004: View Application in HR Hub
| Field | Value |
|-------|-------|
| **ID** | FT-004 |
| **Title** | Verify HR can view submitted applications |
| **Precondition** | At least one application exists |
| **Steps** | 1. Log in as HR 2. Navigate to `/hr/applications` |
| **Expected** | Application appears in table with candidate name, job title, status, date. ATS score displayed if available. Search and filter work. |

### FT-005: Assign Assessment to Candidate
| Field | Value |
|-------|-------|
| **ID** | FT-005 |
| **Title** | Verify HR can assign an assessment to a candidate |
| **Precondition** | Application exists. Assessment exists in database. |
| **Steps** | 1. Navigate to `/hr/applications` 2. Click "Assign Assessment" on an application 3. Select assessment from dropdown 4. Confirm |
| **Expected** | `assessment_tokens` table has new row with `status` = "Active", `used` = false, `expires_at` set to 7 days from now. Token appears in candidate's Active Assessments page. |

### FT-006: Candidate Takes Assessment
| Field | Value |
|-------|-------|
| **ID** | FT-006 |
| **Title** | Verify candidate can take a proctored assessment |
| **Precondition** | Active assessment token exists. Candidate has Chrome/Edge with camera and mic. |
| **Steps** | 1. Navigate to `/candidate/assessments` 2. Click "Start Assessment" on active token 3. Enter token or redirected automatically 4. Grant camera and microphone access 5. Read instructions 6. Click "Initialize Secure Testing Frame" 7. Answer all questions 8. Click "Finalize Examination Scripts" |
| **Expected** | Fullscreen mode activates. Webcam shows live feed. Violation counter displays 0. Timer counts down. Questions render with options. Submission calls `grade-assessment` edge function. Result screen shows score, pass/fail. `assessment_tokens` updated to `used=true`, `status="Used"`. `assessment_attempts` row created. |

### FT-007: HR Schedules Interview
| Field | Value |
|-------|-------|
| **ID** | FT-007 |
| **Title** | Verify HR can schedule an interview for a candidate |
| **Precondition** | Application status is "Assessment Completed" or "Assessment Passed" |
| **Steps** | 1. Navigate to `/hr/recruitment` 2. Click "Live Interview Room" tab 3. Select candidate from pipeline 4. Schedule interview with date, time, round name, meeting link 5. Save |
| **Expected** | `interview_sessions` row created. Candidate sees interview in `/candidate/interviews`. Application status updated to "Interview Scheduled". |

### FT-008: Generate and Send Offer
| Field | Value |
|-------|-------|
| **ID** | FT-008 |
| **Title** | Verify HR can generate, approve, and send offer letter |
| **Precondition** | Application status is "Interview Cleared" |
| **Steps** | 1. Navigate to `/hr/recruitment` 2. Click "Offer Generator" tab 3. Enter candidate details 4. Click "Generate Official Letter" 5. Review AI-generated offer 6. Click "Save to Database" 7. Navigate to "Offer Management" tab 8. Approve offer 9. Click "Send to Candidate" |
| **Expected** | `offer_letters` row created with status "Pending Approval". `offer_approvals` row created. After approval, status becomes "Sent". Candidate sees offer in dashboard. |

### FT-009: Candidate Accepts Offer
| Field | Value |
|-------|-------|
| **ID** | FT-009 |
| **Title** | Verify candidate can accept an offer letter |
| **Precondition** | Offer letter status = "Sent" |
| **Steps** | 1. Navigate to `/candidate` 2. Click "Offer Vault" tab 3. Click "View" on offer 4. Click "Accept" |
| **Expected** | `respond-offer` edge function called. Offer status updated to "Accepted". HR receives notification. |
| **Note** | Expected to FAIL due to edge function auth mismatch. |

### FT-010: Employee Views Payslip
| Field | Value |
|-------|-------|
| **ID** | FT-010 |
| **Title** | Verify employee can view payslip history |
| **Precondition** | Logged in as employee |
| **Steps** | 1. Navigate to `/employee/payroll` |
| **Expected** | Display simulated payslip data (KNOWN ISSUE: data is not real). Six months of payslip history shown. Annual salary, supplements, pay grade displayed. CSV download works. |
| **Note** | This test validates the UI renders correctly, NOT that data is accurate. |

---

## 2. Integration Tests

### IT-001: Application → Token → Assessment → Grade Flow
| Field | Value |
|-------|-------|
| **ID** | IT-001 |
| **Title** | End-to-end integration of assessment pipeline |
| **Description** | Verify the entire assessment pipeline works: HR creates assessment → assigns to candidate → candidate takes it → grading edge function processes → results stored → notifications sent |
| **Steps** | 1. Create assessment via API call 2. Create application 3. Create token via ApplicationHub 4. Submit answers via grade-assessment edge function 5. Verify `assessment_attempts` has score/passed 6. Verify `assessment_tokens` marked used 7. Verify `notifications` and `candidate_notifications` created 8. Verify `job_applications.status` updated |
| **Expected** | All 8 steps complete without error. Score calculated correctly. Pass/fail determined. Status propagated to application. |

### IT-002: AI Proxy → HuggingFace Route
| Field | Value |
|-------|-------|
| **ID** | IT-002 |
| **Title** | Verify AI proxy edge function routes to HuggingFace correctly |
| **Description** | Test `ai-proxy` edge function with various prompt types |
| **Steps** | 1. Send POST to `ai-proxy` with prompt "Say hello" 2. Send POST with system instruction 3. Send POST with response_format JSON 4. Send POST with malformed body |
| **Expected** | 200 with content string for valid requests. Proper error response for malformed body. |

### IT-003: Proctoring → Violation → Auto-Submit
| Field | Value |
|-------|-------|
| **ID** | IT-003 |
| **Title** | Verify violation threshold triggers auto-submission |
| **Description** | During assessment, trigger max violations and verify auto-submission |
| **Steps** | 1. Start assessment 2. Wait 45 seconds (grace period) 3. Trigger violations (tab switch, resize, etc.) 4. Reach max_violations (default 5) 5. Verify auto-submission triggered 6. Verify `assessment_tokens.status` = "Disqualified" |
| **Expected** | After grace period, each violation increments counter. At max violations, assessment auto-submits with disqualified=true. Token marked as Disqualified. Application status set to Rejected. |

### IT-004: Offer → Respond → Notification
| Field | Value |
|-------|-------|
| **ID** | IT-004 |
| **Title** | Verify offer response triggers notification to HR |
| **Description** | When candidate accepts/declines offer, HR should receive notification |
| **Steps** | 1. Set up offer with status "Sent" 2. Call `respond-offer` edge function with action "accepted" 3. Check `notifications` table for HR users 4. Check `offer_letters.status` updated to "Accepted" |
| **Expected** | Offer status updated. HR notifications created with correct title and message. |

### IT-005: Token Expiry → expire-tokens Function
| Field | Value |
|-------|-------|
| **ID** | IT-005 |
| **Title** | Verify expired tokens are cleaned up |
| **Description** | `expire-tokens` edge function should mark expired tokens |
| **Steps** | 1. Create token with `expires_at` in the past 2. Call `expire-tokens` edge function 3. Verify token `status` = "Expired" |
| **Expected** | Expired tokens marked as "Expired". Valid tokens unchanged. |

---

## 3. End-to-End Tests

### E2E-001: Full Candidate Journey
| Field | Value |
|-------|-------|
| **ID** | E2E-001 |
| **Title** | Complete candidate lifecycle from registration to onboarding |
| **Duration** | ~30 minutes |
| **Steps** | **Phase 1 — Registration & Job Search** 1. Register as candidate 2. Browse careers page 3. View job openings 4. **Phase 2 — Apply** 5. Click "Apply Now" on a job 6. Fill application form with PDF resume 7. Submit 8. **Phase 3 — Assessment** 9. Wait for HR to assign assessment 10. Navigate to Active Assessments 11. Start assessment 12. Complete all questions 13. Submit 14. **Phase 4 — Interview** 15. Wait for HR to schedule interview 16. View interview details 17. **Phase 5 — Offer** 18. View offer letter in Offer Vault 19. Accept offer 20. **Phase 6 — Onboarding** 21. Upload BGC documents 22. Complete onboarding |
| **Expected** | Every phase completes successfully. Data flows through all tables. Notifications at each stage. No errors in console. |

### E2E-002: HR Full Recruitment Cycle
| Field | Value |
|-------|-------|
| **ID** | E2E-002 |
| **Title** | Complete HR recruitment cycle from job creation to onboarding |
| **Duration** | ~20 minutes |
| **Steps** | **Phase 1 — Job Setup** 1. Login as HR 2. Generate JD via AI 3. Create job form with form schema 4. Publish form 5. **Phase 2 — Review Applications** 6. View applications in ApplicationHub 7. Use ATS scanner 8. Change application status 9. **Phase 3 — Assess** 10. Create assessment 11. Assign to candidate 12. **Phase 4 — Interview** 13. Schedule interview 14. **Phase 5 — Offer** 15. Generate offer letter 16. Save to database 17. Approve offer 18. Send to candidate 19. **Phase 6 — Onboard** 20. View candidate in OnboardingCenter 21. Verify BGC documents 22. Mark onboarding complete |
| **Expected** | Every phase completes. Data persists across page navigations. No console errors. |

### E2E-003: Employee + Team Lead Work Cycle
| Field | Value |
|-------|-------|
| **ID** | E2E-003 |
| **Title** | Employee logs work, TL approves leave, views analytics |
| **Duration** | ~15 minutes |
| **Steps** | **Employee:** 1. Login as employee 2. Clock in 3. View tasks 4. Complete a task 5. Submit leave request 6. Clock out 7. View daily report 8. **Team Lead:** 9. Login as team lead 10. View dashboard with team stats 11. View team analytics 12. Approve leave 13. Send 1-on-1 sync request |
| **Expected** | Clock in/out works. Leave request visible to TL. TL approves. Task completion counted in analytics. |

---

## 4. Negative Tests

### NT-001: Apply Without Resume
| Field | Value |
|-------|-------|
| **ID** | NT-001 |
| **Title** | Verify application is rejected without resume |
| **Steps** | 1. Navigate to public apply form 2. Fill all fields except resume 3. Click Submit |
| **Expected** | Toast error: "Resume Required". Application NOT submitted. |

### NT-002: Apply With Duplicate Email
| Field | Value |
|-------|-------|
| **ID** | NT-002 |
| **Title** | Verify duplicate application detection |
| **Precondition** | Candidate already applied to this job |
| **Steps** | 1. Navigate to apply form for same job 2. Fill fields with same email 3. Click Submit |
| **Expected** | Toast error: "Application Already Submitted". No duplicate `job_applications` row. |

### NT-003: Expired Assessment Token
| Field | Value |
|-------|-------|
| **ID** | NT-003 |
| **Title** | Verify expired tokens cannot start assessment |
| **Precondition** | Token with `expires_at` in the past |
| **Steps** | 1. Navigate to `/candidate/assessments` 2. Find expired token 3. Click "Start Assessment" |
| **Expected** | Button disabled or shows "Token Expired". Cannot proceed. |

### NT-004: Invalid Assessment Token
| Field | Value |
|-------|-------|
| **ID** | NT-004 |
| **Title** | Verify invalid token at assessment access page |
| **Steps** | 1. Navigate to `/assessment` 2. Enter random UUID as token 3. Click "Verify Invitation Clearance" |
| **Expected** | Toast error: "Invalid Assessment Link". Token not accepted. |

### NT-005: Submit Assessment Without Answering All Questions
| Field | Value |
|-------|-------|
| **ID** | NT-005 |
| **Title** | Verify partial submission works (unanswered = 0) |
| **Steps** | 1. Start assessment 2. Answer only half the questions 3. Click "Finalize Examination Scripts" | 4. Confirm |
| **Expected** | Submission accepted. Unanswered questions counted as incorrect. Score calculated correctly. |

### NT-006: HR Cannot Access Employee Pages
| Field | Value |
|-------|-------|
| **ID** | NT-006 |
| **Title** | Verify role-based access control |
| **Steps** | 1. Login as HR 2. Navigate to `/employee/dashboard` 3. Navigate to `/admin/employees` |
| **Expected** | Redirected to `/hr` or appropriate page. 403 or redirect. |

### NT-007: Candidate Cannot Access HR Pages
| Field | Value |
|-------|-------|
| **ID** | NT-007 |
| **Title** | Verify candidate cannot access HR functions |
| **Steps** | 1. Login as candidate 2. Navigate to `/hr/recruitment` 3. Navigate to `/admin/dashboard` |
| **Expected** | Redirected to `/candidate`. Cannot view HR pages. |

### NT-008: File Upload Exceeds Size Limit
| Field | Value |
|-------|-------|
| **ID** | NT-008 |
| **Title** | Verify resume upload > 10MB is rejected |
| **Steps** | 1. On apply form 2. Select file > 10MB 3. Attempt upload |
| **Expected** | Toast error: "File Size Restriction". File not uploaded. |

### NT-009: Invalid Status Transition
| Field | Value |
|-------|-------|
| **ID** | NT-009 |
| **Title** | Verify invalid application status transitions are blocked |
| **Steps** | 1. Set application to "Rejected" 2. Attempt to change to "Interview Scheduled" |
| **Expected** | Status change prevented. Error message shown. Status stays as "Rejected". |

### NT-010: Database Constraint Violation (Duplicate Token)
| Field | Value |
|-------|-------|
| **ID** | NT-010 |
| **Title** | Verify UNIQUE constraint on assessment_tokens.token |
| **Precondition** | Migrations must be applied (token UNIQUE constraint) |
| **Steps** | 1. Create assessment token 2. Insert another row with same token value |
| **Expected** | Database rejects duplicate. Error code 23505 (unique_violation). |

---

## 5. Security Tests

### ST-001: Anon Key in Edge Functions — Exploit
| Field | Value |
|-------|-------|
| **ID** | ST-001 |
| **Title** | Verify edge functions reject anon key as auth |
| **Severity** | CRITICAL |
| **Steps** | 1. Extract `VITE_SUPABASE_ANON_KEY` from JS bundle 2. Call `ats-screen` with Authorization: `Bearer {anon_key}` 3. Call `respond-offer` with same header 4. Check response |
| **Expected** | Both return 401 Unauthorized. JWT validation rejects anon key. |
| **Note** | Currently expected to PASS (anon key IS rejected). The bug is that the frontend sends anon key instead of session token, causing the function to fail for legitimate users. |

### ST-002: XSS via Form Schema
| Field | Value |
|-------|-------|
| **ID** | ST-002 |
| **Title** | Verify XSS injection in job form schema is not rendered |
| **Steps** | 1. As HR, create job form with `form_schema` containing `<script>alert('XSS')</script>` in a field label 2. As candidate, navigate to apply form 3. Check if script executes |
| **Expected** | React escapes HTML. Script does not execute. Alert not shown. |

### ST-003: XSS via Application Answers
| Field | Value |
|-------|-------|
| **ID** | ST-003 |
| **Title** | Verify XSS injection in application answers |
| **Steps** | 1. Submit application with `<img src=x onerror=alert(1)>` in a text field 2. As HR, view application in ApplicationHub |
| **Expected** | HTML not rendered. Script does not execute. ApplicationHub renders safely. |

### ST-004: localStorage Token Theft
| Field | Value |
|-------|-------|
| **ID** | ST-004 |
| **Title** | Verify assessment token not exposed to other origins |
| **Steps** | 1. Start assessment 2. Open browser DevTools → Application → Session Storage 3. Check for "assessment_secure_session_token" |
| **Expected** | Token exists in sessionStorage. But should NOT be accessible to other browser tabs (sessionStorage is per-tab). Verify no page accidentally reads from window.opener or postMessage. |

### ST-005: Gmail OAuth Token in localStorage
| Field | Value |
|-------|-------|
| **ID** | ST-005 |
| **Title** | Verify Gmail OAuth token security |
| **Steps** | 1. Connect Smart Inbox 2. Open DevTools → Application → Local Storage 3. Check `fwc_gmail_token` |
| **Expected** | Token exists in localStorage. XSS could exfiltrate this. Recommendation: use HTTP-only cookies or backend-only token handling. |

### ST-006: Public Storage URL Access
| Field | Value |
|-------|-------|
| **ID** | ST-006 |
| **Title** | Verify BGC documents are not publicly accessible |
| **Steps** | 1. Candidate uploads BGC doc 2. Copy URL from network request or database 3. Open in incognito browser (not logged in) |
| **Expected** | Should return 403/404 if RLS on storage bucket is configured. If using `getPublicUrl()`, the file will be accessible — this is a finding. |

### ST-007: SQL Injection via RPC
| Field | Value |
|-------|-------|
| **ID** | ST-007 |
| **Title** | Verify no raw SQL injection possible |
| **Steps** | 1. Attempt SQL injection in all input fields (public forms, search bars, etc.) 2. Try: `' OR 1=1 --`, `'; DROP TABLE profiles; --`, etc. |
| **Expected** | Supabase JS SDK parameterizes all queries. No raw SQL is executed. Input should be safely handled. |

### ST-008: CSRF — Protected Route from External Origin
| Field | Value |
|-------|-------|
| **ID** | ST-008 |
| **Title** | Verify CSRF protection on state-changing operations |
| **Steps** | 1. From external site, create auto-submitting form to `{SUPABASE_URL}/rest/v1/job_applications` with credentials 2. Check if state changes |
| **Expected** | Supabase REST API rejects requests without valid auth JWT. CSRF not possible. |

### ST-009: Rate Limiting Abuse
| Field | Value |
|-------|-------|
| **ID** | ST-009 |
| **Title** | Verify edge functions have rate limiting |
| **Steps** | 1. Call `ai-proxy` edge function 100 times in 1 second 2. Check response codes |
| **Expected** | No rate limiting — all requests return 200 or 500. **Finding: rate limiting is missing.** |

### ST-010: Phone/Email Enumeration
| Field | Value |
|-------|-------|
| **ID** | ST-010 |
| **Title** | Verify registration error messages don't leak user existence |
| **Steps** | 1. Register with an email that already exists 2. Observe error message |
| **Expected** | Error should be generic ("Registration failed") rather than "User already registered". |

---

## 6. Load Tests

### LT-001: Concurrent Assessment Submissions
| Field | Value |
|-------|-------|
| **ID** | LT-001 |
| **Title** | Verify grade-assessment handles concurrent submissions |
| **Scenario** | 50 candidates submit assessments simultaneously |
| **Method** | Use k6/Artillery to POST to `grade-assessment` edge function with 50 concurrent VUs |
| **Expected** | < 10% error rate. All requests processed within 30 seconds. No duplicate `assessment_attempts` rows. No race conditions on token status updates. |

### LT-002: AI Proxy Throughput
| Field | Value |
|-------|-------|
| **ID** | LT-002 |
| **Title** | Measure AI proxy throughput |
| **Scenario** | 20 concurrent requests to `ai-proxy` with short prompts |
| **Method** | k6 script sending prompts of varying length |
| **Expected** | Edge function handles concurrent requests. HuggingFace rate limits may throttle. Average response time < 5s for short prompts. Error rate documented. |

### LT-003: Application Hub Query Performance
| Field | Value |
|-------|-------|
| **ID** | LT-003 |
| **Title** | Measure ApplicationHub page load with 10K applications |
| **Scenario** | 10,000 `job_applications` rows in database |
| **Method** | Seed database with 10K applications. Measure page load time. |
| **Expected** | Query with `.range(0, 99)` should be fast (< 500ms). But UI only shows first 100 — usability issue. |

### LT-004: Dashboard Concurrent Users
| Field | Value |
|-------|-------|
| **ID** | LT-004 |
| **Title** | Measure dashboard performance with concurrent users |
| **Scenario** | 100 HR users viewing `/hr/applications` and `/hr/recruitment` simultaneously |
| **Method** | k6 browser-based testing simulating page loads |
| **Expected** | All pages load within 3 seconds. Supabase realtime channels handle 100 concurrent subscriptions. |

### LT-005: Real-time Subscription Scalability
| Field | Value |
|-------|-------|
| **ID** | LT-005 |
| **Title** | Verify realtime subscriptions scale |
| **Scenario** | 500 candidates each with open realtime channel for notifications + announcements |
| **Method** | Create 500 candidate auth users, each opening DashboardLayout |
| **Expected** | Supabase Realtime handles 500 concurrent channels. Message delivery within 2 seconds. No connection drops. |

### LT-006: Storage Upload Throughput
| Field | Value |
|-------|-------|
| **ID** | LT-006 |
| **Title** | Measure resume upload performance |
| **Scenario** | 100 concurrent resume uploads (2MB each) |
| **Method** | k6 script uploading files to `resumes` bucket |
| **Expected** | Uploads complete within 10 seconds each. No storage quota errors. |

---

## Test Execution Summary

| Category | Total Tests | Priority | Automation Feasibility |
|----------|-------------|----------|----------------------|
| Functional | 10 | P0 | High (Playwright/Cypress) |
| Integration | 5 | P0 | High (Jest + Supabase local) |
| End-to-End | 3 | P0 | Medium (Playwright) |
| Negative | 10 | P1 | High (Jest + Playwright) |
| Security | 10 | P0 | Medium (Manual + Automated) |
| Load | 6 | P2 | High (k6) |
| **Total** | **44** | | |

### Priority Definitions
- **P0:** Blocking — must pass before any production deployment
- **P1:** Critical — should pass, documented exceptions acceptable
- **P2:** Important — non-blocking, tracked for performance baseline

### Recommended Test Infrastructure
- **Unit/Integration:** Vitest (already configured with `vitest.config.ts`)
- **E2E:** Playwright with Supabase local dev environment (`supabase start`)
- **API/Load:** k6 with custom thresholds
- **Security:** OWASP ZAP for DAST, manual code review for SAST
- **CI:** GitHub Actions with Supabase local + Playwright + k6 matrix
