# Business Rule Catalog — Enterprise Production Certification

> Purpose: Document every feature's intended behavior, inputs, processing rules, roles, edge cases, and regression risks before any implementation changes.

---

## 1. LEAVE MANAGEMENT

### 1.1 Leave Submission (Employee)
- **Purpose**: Employee requests time off
- **Inputs**: `user_id`, `leave_type`, `start_date`, `end_date`, `reason`
- **DB Table**: `leaves` (cols: `id, user_id, leave_type, start_date, end_date, reason, status, created_at, updated_at`)
- **Status flow**: `Pending` → `Approved` | `Rejected` (CHECK constraint `leaves_status_check`)
- **Validation**: start_date ≤ end_date, no overlap with existing Approved leaves, leave_type in allowed list
- **Role**: Employee (INSERT), TL/HR (UPDATE status)
- **Edge cases**: Past dates, zero-duration (same start/end), weekends/holidays, leave balance exceeded
- **Failure cases**: Profile not found, department has no TL (F-02), leaves table CHECK constraint rejects unknown status
- **Audit trail**: NONE — no `approved_by`, `approved_at`, `rejected_by`, `rejected_at` columns
- **Regression risk**: None (basic CRUD)

### 1.2 Leave Approval Chain (TL → HR)
- **Purpose**: TL reviews, HR finalizes
- **Current behavior**: Single-step approval (TL or HR sets status to `Approved` directly). CHECK constraint rejects "Approved by TL" intermediate state.
- **Intended behavior** (likely): Two-step — TL approves first, HR finalizes. Requires: DB schema change to allow intermediate status, or separate `tl_approved` column.
- **Role**: TL/HR
- **Edge cases**: TL and HR are same person; TL on leave themselves; no TL assigned (394/395 employees)
- **Regression risk**: High — would need schema migration for approval columns

---

## 2. COMPLAINT / GRIEVANCE MANAGEMENT

### 2.1 Complaint Filing (Employee)
- **Purpose**: Employee reports workplace issue
- **Inputs**: `user_id`, `title`, `description`, `severity`, `category`, `target_role`
- **DB Table**: `complaints` (cols: `id, user_id, title, description, status, created_at, viewed_at, resolved_at, admin_notes, severity, target_role, category`)
- **Status flow**: `Pending` → `In Review` → `Closed` | `Rejected`
- **🐛 Bug**: Setting status to `Resolved` crashes — DB trigger references `NEW.subject` (column is `title`)
- **Role**: Employee (INSERT), HR/Admin (UPDATE status, admin_notes, resolved_at)
- **Validation**: title required, description required, severity defaults to MODERATE
- **Edge cases**: Anonymous complaint (not supported), self-reporting, frivolous complaints
- **Audit trail**: Minimal — `resolved_at` timestamp, `admin_notes`. No `resolved_by` user ID.
- **Regression risk**: Fixing the trigger requires finding trigger source and modifying `subject` → `title`

---

## 3. ONBOARDING

### 3.1 Candidate → Employee Conversion
- **Purpose**: Convert hired candidate to employee record
- **Inputs**: `profile_id`, `candidate_id`, `job_id`, `start_date`
- **DB Table**: `candidate_onboarding` (cols: `id, candidate_id, profile_id, job_id, start_date, status, ...`)
- **🐛 Bug (F-04)**: `candidate_id` stores profile UUID instead of candidate UUID — `OnboardingCenter.tsx:224-233` uses `selectedCandidate.id` which is profile.id
- **Role**: HR
- **Edge cases**: Candidate created before profile (no profile.id yet), re-onboarding same candidate
- **Regression risk**: F-04 fix must use `selectedCandidate.candidate_id` instead of `selectedCandidate.id`

---

## 4. RECRUITMENT

### 4.1 Job Posting (HR/Admin)
- **Purpose**: Create and manage job openings
- **DB Table**: `job_postings` (variously `job_listings`, `jobs`)
- **Role**: HR/Admin CREATE, all SELECT

### 4.2 Application (Candidate)
- **Purpose**: Candidate applies to job
- **DB Table**: `applications`
- **Fields**: `candidate_id`, `job_id`, `status`, `resume_url`, `cover_letter`, `applied_at`
- **Status flow**: `Applied` → `Shortlisted` → `Interview` → `Offered` → `Hired` | `Rejected`

### 4.3 Interview Scheduling
- **DB Table**: `interviews`
- **Fields**: `application_id`, `interviewer_id`, `scheduled_at`, `status`, `feedback`, `rating`
- **Role**: HR schedules, TL/Admin conducts

### 4.4 Offer Letter
- **DB Table**: `offer_letters`
- **🐛 Bug (F-08)**: All 15 offer letters have `application_id=null` and `candidate_id=null` — FK links broken. Likely code path doesn't pass these IDs.
- **Role**: HR generates, Candidate accepts/rejects
- **Regression risk**: Fix requires tracing offer creation code path and adding FK population

---

## 5. PERFORMANCE MANAGEMENT

### 5.1 Task Assignment & Tracking
- **DB Table**: `tasks` (cols: `id, assigned_to, assigned_by, title, description, status, due_date, project_id, created_at`)
- **Status flow**: `Pending` → `In Progress` → `Completed`
- **Performance Engine N+1 (`hr/PerformanceEngine.tsx:34-37`)**: 3N query pattern — fetches employees, then N tasks, then N profiles
- **Role**: TL assigns, Employee updates, HR/Admin views

### 5.2 Performance Score
- **DB Table**: `profiles.performance_score`
- **Calculation**: Unknown formula. Hardcoded `staticAttendanceScore=92` in `admin/MasterDirectory.tsx:100` is a fabricated placeholder.
- **Data**: 0 employees have meaningful performance data

---

## 6. PAYROLL

### 6.1 Salary Configuration
- **DB Table**: `profiles.payroll_ctc` — Annual CTC (confirmed from E2E trace)
- **Current state**: 488/495 employees with `payroll_ctc = 0` (unconfigured)
- **Format**: Integer, INR. Only 6 employees have non-zero values (sum ₹309K annual)
- **Display**: 4 separate payroll page implementations (admin, employee, hr, team-lead) with different breakdown formulas
- **🐛 Bug**: `admin/Analytics.tsx:297` labels annual CTC sum as "Gross Monthly Payroll"

### 6.2 Salary Revision / Payroll History
- **DB Table**: `salary_revision_history` (3 cols: `id, employee_id, created_at` — STRUCTURALLY INCOMPLETE)
- **DB Table**: `payroll_history_records` (3 cols: `id, employee_id, created_at` — STRUCTURALLY INCOMPLETE)
- **Both RLS blocked**: Only specific roles (possibly HR via application) can INSERT
- **Current state**: 0 records in both tables
- **Impact**: Cannot run payroll, cannot audit salary changes, cannot display payslips from DB
- **Regression risk**: Schema migration needed to add proper columns

---

## 7. AI FEATURES

### 7.1 HR Dashboard AI Insights (4 features)
- **Feature**: Comp Benchmarker, Onboarding Plan, Team Insights, Predictive Attrition
- **Backend**: `supabase/functions/ai-proxy/index.ts` — routes to `Qwen/Qwen3-32B:groq`
- **🐛 No DB data**: Comp Benchmarker & Onboarding Plan receive ZERO company DB records. Team Insights & Predictive Attrition receive only profile count + 5 timestamps.
- **Labels**: Zero features display `(AI prediction)` or `(AI estimate)` disclaimers

### 7.2 Admin AI Insights
- **Feature**: Department analytics, hiring predictions, workforce forecasting
- **Status**: Full DB data available ✅. Correctly uses `Number(p.payroll_ctc) || 0` with CTC guard.

### 7.3 Employee AI Insights
- **Feature**: Personalized task suggestions, productivity patterns
- **Status**: Real tasks/logs available ✅

### 7.4 Team Lead AI Insights
- **Feature**: Team performance, workload distribution
- **Status**: Real team data available ✅

---

## 8. ANALYTICS & REPORTS

### 8.1 Admin Analytics
- **🐛 Bug**: `includes('complet')` at `admin/Analytics.tsx:189` — matches "Incomplete" as completed (inflates completion rate)
- **🐛 Bug**: `admin/Analytics.tsx:297` labels annual CTC sum as "Gross Monthly Payroll"
- **Data sources**: `profiles`, `leaves`, `tasks`, `work_logs`, `attendance`

### 8.2 Employee Analytics
- **🐛 Bug**: `includes('complet')` at `employee/Analytics.tsx:51` — same inflation bug

### 8.3 Master Directory
- **🐛 Bug**: `staticAttendanceScore=92` at `admin/MasterDirectory.tsx:100` — fabricated value, not from DB
- **🐛 Bug**: `admin/MasterDirectory.tsx:145` — AI fallbacks lack null guards (may crash on null data)

---

## 9. EXIT MANAGEMENT

### 9.1 Resignation → Attrition
- **DB Table**: `employee_attrition` (cols: `id, employee_id, employee_name, department, last_ctc, separation_reason, feedback_notes, resignation_id, resigned_by, resignation_date, created_at`)
- **Note**: `employee_name` is denormalized (copied from profile.name), `resigned_by` is UUID
- **Missing**: No `status` column, no `last_working_day` column
- **Role**: Employee initiates, HR/Admin processes
- **After exit**: `profiles.employment_status` set to `inactive` (verified ✅)

### 9.2 Attrition Analytics
- **Data sources**: `employee_attrition` table
- **KPIs**: Count by reason, monthly trend, department breakdown

---

## 10. PROMOTION / TRANSFER

### 10.1 Current Implementation
- **DB update**: Direct update of `profiles.role`, `profiles.department`, `profiles.payroll_ctc`
- **Missing column**: `profiles.designation` — does not exist in schema
- **History**: 7 empty tables exist (`promotions`, `transfer_history`, `promotion_history`, `position_history`, `employee_history`, `role_history`, `department_history`) — none have determinable schema
- **No audit trail**: Changes are destructive — original values lost after update
- **Role**: Admin/HR

---

## DATA LINEAGE MATRIX

| Displayed Field | Table | Column | Formula | Traceable? | Bug? |
|---|---|---|---|---|---|
| Employee Name | profiles | name | direct | ✅ | No |
| Employee Role | profiles | role | direct | ✅ | No |
| Department | profiles | department | direct | ✅ | No |
| Total Employees | profiles | count | COUNT(*) | ✅ | No |
| Payroll CTC | profiles | payroll_ctc | direct (annual) | ✅ | Mislabeled as monthly |
| Attendance Score | — | — | hardcoded 92 | ❌ | staticAttendanceScore |
| Task Completion | tasks | status | COUNT WHERE includes('complet') | ❌ | Matches "Incomplete" |
| Leaves Balance | leaves | count | SUM by user_id | ✅ | No |
| Comp Benchmark | — | — | AI (zero DB data) | ❌ | No disclaimer |
| Onboarding Plan | — | — | AI (zero DB data) | ❌ | No disclaimer |
| Team Insights | — | — | AI (limited DB data) | ⚠️ | No disclaimer |
| Predictive Attrition | employee_attrition | count | AI + DB | ⚠️ | No disclaimer |
| Performance Score | profiles | performance_score | unknown formula | ❌ | 0 meaningful data |
| Monthly Payroll | payroll_* | — | SUM of annual CTC | ❌ | Label is wrong |
| Salary History | salary_revision_history | — | 0 rows | ❌ | Table incomplete |
| Payslip | payroll_history_records | — | 0 rows | ❌ | Table incomplete |
| Active Headcount | profiles | employment_status | COUNT WHERE active | ✅ | No |
| Hires This Month | profiles | created_at | RPC | ⚠️ | 50% confidence |
| Team Size | profiles | team_lead_id | COUNT WHERE = tl_id | ✅ | No |
| Team Performance | tasks | status | AVG by team | ✅ | No |
| Recruitment Funnel | applications | status | COUNT by stage | ✅ | No |
| Department Count | profiles | department | COUNT GROUP BY | ✅ | No |
| AI Career Prediction | profiles | ai_career_prediction | direct | ✅ | No |
| Previous CTC | profiles | previous_ctc | direct | ✅ | No |
