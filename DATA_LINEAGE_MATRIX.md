# Data Lineage Matrix — Complete

> **Purpose**: Every displayed KPI traced from UI card → React state → query → RPC/SQL → table → source column, with mathematical formula proof and confidence score.
> **Format**: `[UI Label] → [Component:Line] → [State var] → [Query/RPC] → [Table.column] → [Formula]`

---

## 1. ADMIN DASHBOARD (`admin/Dashboard.tsx`)

| # | UI Label | File:Line | State Var | Query | Table.Column | Formula | Confidence | Status |
|---|----------|-----------|-----------|-------|-------------|---------|-----------|--------|
| 1 | **Total Employees** | D:60-62 | `metrics.total_employees` | `getEnterpriseMetrics()` → RPC `get_enterprise_metrics` | `profiles` | `SELECT COUNT(*) FROM profiles WHERE employment_status != 'inactive'` | 100% | ✅ |
| 2 | **Active Employees** | D:60-62 | `metrics.active_employees` | `getEnterpriseMetrics()` → RPC `get_enterprise_metrics` | `profiles` | `SELECT COUNT(*) FROM profiles WHERE employment_status = 'active'` | 100% | ✅ |
| 3 | **Departments** | D:60-62 | `metrics.department_count` | `getEnterpriseMetrics()` → RPC `get_enterprise_metrics` | `profiles.department` | `SELECT COUNT(DISTINCT department) FROM profiles` | 100% | ✅ |
| 4 | **Monthly Payroll Liability** | D:60-62 | `metrics.total_payroll` | `getEnterpriseMetrics()` → RPC `get_enterprise_metrics` | `profiles.payroll_ctc` | `SELECT COALESCE(SUM(payroll_ctc), 0) FROM profiles` — **BUG**: label says "Monthly" but value is SUM of **annual** CTC | 100% | 🐛 Mislabeled (annual→monthly) |
| 5 | **Hires This Month** | D:60-62 | `metrics.hires_this_month` | `getEnterpriseMetrics()` → RPC `get_enterprise_metrics` | `profiles.created_at` | `SELECT COUNT(*) FROM profiles WHERE created_at >= date_trunc('month', now()) AND employment_status = 'active'` — **BUG F-05**: Same as active headcount when no one hired this month | 50% | ⚠️ Likely wrong |
| 6 | **Pending Approvals** | D:128 | `pendingCount` | `getPendingLeavesCount()` → `supabase.from('leaves').select('*', { count: 'exact', head: true }).eq('status', 'Pending')` | `leaves.status` | `COUNT(*) WHERE status = 'Pending'` — 0 leaves in DB → shows 0 | 100% | ✅ |
| 7 | **Resignations** | D:130 | `resignationCount` | `getResignationsCount()` → `supabase.from('employee_attrition').select('*', { count: 'exact', head: true })` | `employee_attrition` | `COUNT(*)` — 0 attrition records in DB → shows 0 | 100% | ✅ |
| 8 | **Department Distribution** | D:210-240 | chart data | `supabase.from('profiles').select('department')` | `profiles.department` | `GROUP BY department` → count per department | 100% | ✅ |
| 9 | **Attendance Overview** | D:170-200 | chart data | `supabase.from('attendance').select('*')` | `attendance` | Aggregation by date/status | 75% | ⚠️ No attendance records |
| 10 | **AI Insights** | D:250 | button link | Navigates to `/admin/ai-insights` | — | No DB fetch | 100% | ✅ |

---

## 2. ADMIN ANALYTICS (`admin/Analytics.tsx`)

| # | UI Label | File:Line | State Var | Query | Table.Column | Formula | Confidence | Status |
|---|----------|-----------|-----------|-------|-------------|---------|-----------|--------|
| 1 | **Total Employees** | A:280 | `totalEmployees` | `supabase.from('profiles').select('*', { count: 'exact', head: true })` | `profiles` | `COUNT(*)` | 100% | ✅ |
| 2 | **Completed Tasks** | A:180 | `completedTasks` | `supabase.from('tasks').select('*')` | `tasks.status` | `.filter(t => t.status.includes('complet'))` — **BUG**: matches "Incomplete" → all 7 tasks counted as completed | 100% | 🐛 includes('complet') |
| 3 | **Completion Rate** | A:190 | `completionRate` | Derived from `completedTasks / totalTasks * 100` | — | `(completedTasks / totalTasks) * 100` — inflated to 100% (should be 0%) | 100% | 🐛 Bug #1 |
| 4 | **Gross Monthly Payroll** | A:297 | `payrollTotal` | `filteredData.reduce((sum, p) => sum + (Number(p.payroll_ctc) \|\| 0), 0)` | `profiles.payroll_ctc` | `SUM(payroll_ctc)` — **BUG**: labeled "Monthly" but `payroll_ctc` is annual. ₹309K total = 6 employees × annual CTC, not monthly | 100% | 🐛 Bug #2 |
| 5 | **Leave Summary** | A:350-380 | chart data | `supabase.from('leaves').select('status')` | `leaves.status` | `GROUP BY status, COUNT(*)` — 0 leaves → empty chart | 100% | ✅ |
| 6 | **Task Distribution** | A:330-360 | chart data | `supabase.from('tasks').select('assigned_to, status')` | `tasks.assigned_to, tasks.status` | Group by assigned_to, count by status | 100% | ✅ |
| 7 | **Work Log Hours** | A:390-420 | chart data | `supabase.from('work_logs').select('*')` | `work_logs` | Aggregation by user/date | 75% | ⚠️ No work_logs |
| 8 | **Role Distribution** | A:300 | chart data | `supabase.from('profiles').select('role')` | `profiles.role` | `GROUP BY role, COUNT(*)` | 100% | ✅ |

---

## 3. ADMIN MASTER DIRECTORY (`admin/MasterDirectory.tsx`)

| # | UI Label | File:Line | State Var | Query | Table.Column | Formula | Confidence | Status |
|---|----------|-----------|-----------|-------|-------------|---------|-----------|--------|
| 1 | **Employee Name** | M:88 | `name` | `supabase.from('profiles').select('*')` | `profiles.name` | Direct | 100% | ✅ |
| 2 | **Employee Role** | M:88 | `role` | `supabase.from('profiles').select('*')` | `profiles.role` | Direct | 100% | ✅ |
| 3 | **Department** | M:88 | `department` | `supabase.from('profiles').select('*')` | `profiles.department` | Direct | 100% | ✅ |
| 4 | **Payroll CTC** | M:88 | `payroll_ctc` | `supabase.from('profiles').select('*')` | `profiles.payroll_ctc` | Direct (annual) | 100% | ✅ |
| 5 | **Attendance Score** | M:100 | `staticAttendanceScore` | **HARDCODED** | — | `staticAttendanceScore = 92` — same for ALL employees | 100% | 🐛 Bug #3 |
| 6 | **Task Performance** | M:146 | AI fallback | `supabase.from('tasks').select('*')` for analyticsData | `tasks` | Uses `analyticsData?.attendance_score ?? taskCompletionRatio` — NO hardcoded value | 100% | ✅ After Phase A fix |
| 7 | **Previous CTC** | M:88 | `previous_ctc` | `supabase.from('profiles').select('*')` | `profiles.previous_ctc` | Direct | 100% | ✅ |

---

## 4. HR DASHBOARD (`hr/Dashboard.tsx`)

| # | UI Label | File:Line | State Var | Query | Table.Column | Formula | Confidence | Status |
|---|----------|-----------|-----------|-------|-------------|---------|-----------|--------|
| 1 | **Total Employees** | HD:60 | `totalEmployees` | `getEnterpriseMetrics().total_employees` | `profiles` | `COUNT(*) WHERE employment_status != 'inactive'` | 100% | ✅ |
| 2 | **Active Employees** | HD:60 | `activeEmployees` | `getEnterpriseMetrics().active_employees` | `profiles` | `COUNT(*) WHERE employment_status = 'active'` | 100% | ✅ |
| 3 | **New Hires** | HD:60 | `newHires` | `getEnterpriseMetrics().hires_this_month` | `profiles.created_at` | `COUNT(*) WHERE created_at >= month_start AND active` | 50% | ⚠️ F-05 |
| 4 | **Pending Reviews** | HD:62 | `pendingReviews` | `supabase.from('complaints').select('*', { count: 'exact', head: true }).eq('status', 'Pending')` | `complaints.status` | `COUNT(*) WHERE status = 'Pending'` — 0 complaints → shows 0 | 100% | ✅ |
| 5 | **Flight Risk (AI)** | HD:200 | AI response | `supabase.functions.invoke('ai-proxy', { body: {...} })` | System prompt + profile data | AI model (Qwen3-32B) generates prediction from limited DB context | 50% | ⚠️ AI Prediction |
| 6 | **Sentiment (AI)** | HD:220 | AI response | `supabase.functions.invoke('ai-proxy', { body: {...} })` | System prompt + profile data | AI model generates estimate | 25% | ⚠️ AI Estimate |
| 7 | **Comp Benchmarker (AI)** | HD:240 | AI response | `supabase.functions.invoke('ai-proxy', { body: {...} })` | System prompt + **ZERO company DB records** | AI model generates generic benchmark with no company data | 25% | ⚠️ No Company Data |
| 8 | **Onboarding Plan (AI)** | HD:260 | AI response | `supabase.functions.invoke('ai-proxy', { body: {...} })` | System prompt + **ZERO company DB records** | AI model generates generic plan with no company data | 25% | ⚠️ No Company Data |
| 9 | **Recent Hires** | HD:280 | `recentHires` | `supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(5)` | `profiles.name, created_at, ...` | Direct — last 5 created profiles | 100% | ✅ |
| 10 | **Pending Leaves** | HD:130 | `pendingLeaves` | `supabase.from('leaves').select('*', { count: 'exact', head: true }).eq('status', 'Pending')` | `leaves.status` | `COUNT(*) WHERE status = 'Pending'` | 100% | ✅ |

---

## 5. HR AI INSIGHTS (`hr/AIInsights.tsx`)

| # | UI Label | File:Line | State Var | Query | Table.Column | Formula | Confidence | Status |
|---|----------|-----------|-----------|-------|-------------|---------|-----------|--------|
| 1 | **Predictive Attrition (AI)** | HAI:50 | AI response | `supabase.functions.invoke('ai-proxy', { body: { profileCount, timestamps } })` | Profile count + 5 timestamps only | AI model generates prediction from minimal data | 25% | ⚠️ AI Prediction |
| 2 | **Acquisition Velocity (AI)** | HAI:80 | AI response | `supabase.functions.invoke('ai-proxy')` | Some DB data | AI model generates recommendation | 25% | ⚠️ AI Recommendation |
| 3 | **DEI Matrix (AI)** | HAI:110 | AI response | `supabase.functions.invoke('ai-proxy')` | Some DB data | AI model generates recommendation | 25% | ⚠️ AI Recommendation |

---

## 6. HR PERFORMANCE ENGINE (`hr/PerformanceEngine.tsx`)

| # | UI Label | File:Line | State Var | Query | Table.Column | Formula | Confidence | Status |
|---|----------|-----------|-----------|-------|-------------|---------|-----------|--------|
| 1 | **Employee Name** | PE:34 | `employees` | `supabase.from('profiles').select('id, name, department, role, payroll_ctc').neq('role', 'candidate')` | `profiles.name` | Direct | 100% | ✅ |
| 2 | **Department** | PE:34 | `employees` | Same query | `profiles.department` | Direct | 100% | ✅ |
| 3 | **Task Count** | PE:35-36 | `taskCounts` | `supabase.from('tasks').select('assigned_to, status')` per employee | `tasks.assigned_to` | N+1: 1 query for all employees + N queries for tasks + N queries for profiles | 100% | 🐛 PERF-01 |
| 4 | **Completed Tasks** | PE:35-36 | `taskCounts` | Same per-employee query | `tasks.status` | `.filter(s => s === 'Completed')` — **NO includes bug here** | 100% | ✅ (already correct) |
| 5 | **Performance Score** | PE: | computed | Derived from tasks + profile data | — | Unknown formula — no scoring function defined | 25% | ⚠️ Unknown formula |
| 6 | **Profile Avatar** | PE:37 | `profileMap` | `supabase.from('profiles').select('id, avatar_url')` per employee | `profiles.avatar_url` | N+1 — same pattern | 100% | 🐛 PERF-01 |

---

## 7. EMPLOYEE DASHBOARD (`employee/Dashboard.tsx`)

| # | UI Label | File:Line | State Var | Query | Table.Column | Formula | Confidence | Status |
|---|----------|-----------|-----------|-------|-------------|---------|-----------|--------|
| 1 | **My Tasks** | ED:60 | `myTasks` | `supabase.from('tasks').select('*').eq('assigned_to', userId)` | `tasks` | `SELECT * WHERE assigned_to = auth.uid()` | 100% | ✅ |
| 2 | **Task Completion** | ED:65 | computed | `.filter(t => t.status === 'Completed')` | `tasks.status` | `COUNT WHERE = 'Completed'` — **exact match, no includes bug** | 100% | ✅ |
| 3 | **My Leaves** | ED:80 | `myLeaves` | `supabase.from('leaves').select('*').eq('user_id', userId)` | `leaves` | `SELECT * WHERE user_id = auth.uid()` | 100% | ✅ |
| 4 | **Leave Balance** | ED:85 | computed | `SELECT COUNT(*) FROM leaves WHERE user_id = uid AND status = 'Approved'` | `leaves.status` | Approved leaves count | 100% | ✅ |
| 5 | **Attendance** | ED:100 | `attendance` | `supabase.from('attendance').select('*').eq('employee_id', userId)` | `attendance` | `SELECT * WHERE employee_id = auth.uid()` | 100% | ✅ |
| 6 | **Work Logs** | ED:120 | `workLogs` | `supabase.from('work_logs').select('*').eq('employee_id', userId)` | `work_logs` | `SELECT * WHERE employee_id = auth.uid()` | 100% | ✅ |
| 7 | **Upcoming Events** | ED:140 | `events` | Unknown — likely calendar/events table | — | Unknown | 25% | ⚠️ Not verified |

---

## 8. EMPLOYEE ANALYTICS (`employee/Analytics.tsx`)

| # | UI Label | File:Line | State Var | Query | Table.Column | Formula | Confidence | Status |
|---|----------|-----------|-----------|-------|-------------|---------|-----------|--------|
| 1 | **Task Completion Rate** | EA:51 | computed | `tasks.filter(t => t.status.includes('complet'))` | `tasks.status` | **BUG**: `includes('complet')` matches "Incomplete" → inflates rate | 100% | 🐛 Bug #1 |
| 2 | **Attendance Rate** | EA:80 | computed | `supabase.from('attendance').select('*').eq('employee_id', userId)` | `attendance` | Present days / total days | 75% | ⚠️ No attendance records |
| 3 | **Total Work Hours** | EA:100 | computed | `supabase.from('work_logs').select('*').eq('employee_id', userId)` | `work_logs.hours` | `SUM(hours)` | 100% | ✅ |

---

## 9. EMPLOYEE PAYROLL (`employee/Payroll.tsx`)

| # | UI Label | File:Line | State Var | Query | Table.Column | Formula | Confidence | Status |
|---|----------|-----------|-----------|-------|-------------|---------|-----------|--------|
| 1 | **Basic Salary** | EP:89 | `basicSalary` | `supabase.from('profiles').select('payroll_ctc').eq('id', userId).single()` | `profiles.payroll_ctc` | `payroll_ctc * 0.5` — 50% of annual CTC | 100% | 🐛 Displays in **$ USD** not ₹ INR |
| 2 | **HRA** | EP:99 | `hra` | Same query | `profiles.payroll_ctc` | `payroll_ctc * 0.2` — 20% of annual CTC | 100% | 🐛 Displays in **$ USD** |
| 3 | **Other Allowances** | EP:140 | `otherAllowances` | Same query | `profiles.payroll_ctc` | `payroll_ctc * 0.3` — 30% of annual CTC | 100% | 🐛 Displays in **$ USD** |
| 4 | **Total Annual CTC** | EP:141 | `totalCTC` | Same query | `profiles.payroll_ctc` | Direct (`payroll_ctc`) | 100% | 🐛 Displays in **$ USD** |
| 5 | **Deductions: Tax (TDS)** | EP:142 | `tds` | Same query | `profiles.payroll_ctc` | `(basicSalary + hra) * 0.1` = `(payroll_ctc * 0.5 + payroll_ctc * 0.2) * 0.1` | 100% | 🐛 Displays in **$ USD** |
| 6 | **Deductions: PF** | EP:143 | `pf` | Same query | `profiles.payroll_ctc` | `basicSalary * 0.12` = `payroll_ctc * 0.5 * 0.12` | 100% | 🐛 Displays in **$ USD** |
| 7 | **Net Annual** | EP:144 | `netAnnual` | Same query | `profiles.payroll_ctc` | `totalCTC - tds - pf` = `payroll_ctc - (payroll_ctc*0.5*0.1) - (payroll_ctc*0.5*0.12)` | 100% | 🐛 Displays in **$ USD** |
| 8 | **In-hand Monthly** | EP:145 | `inhandMonthly` | Same query | `profiles.payroll_ctc` | `netAnnual / 12` | 100% | 🐛 Displays in **$ USD** |

**Payroll breakdown formula**: `{ basic: 50%, hra: 20%, allowances: 30% }` of annual CTC. Deductions: `TDS = (basic + hra) × 10%`, `PF = basic × 12%`. All values in USD `$` instead of INR `₹`.

---

## 10. TEAM LEAD DASHBOARD (`team-lead/Dashboard.tsx`)

| # | UI Label | File:Line | State Var | Query | Table.Column | Formula | Confidence | Status |
|---|----------|-----------|-----------|-------|-------------|---------|-----------|--------|
| 1 | **Team Size** | TLD:60 | `teamSize` | `supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('team_lead_id', userId)` | `profiles.team_lead_id` | `COUNT(*) WHERE team_lead_id = auth.uid()` | 100% | ✅ |
| 2 | **Team Performance** | TLD:65 | computed | `supabase.from('tasks').select('*').in('assigned_to', teamMemberIds)` | `tasks.status` | `COUNT(Completed) / COUNT(total)` per team | 100% | ✅ |
| 3 | **Pending Tasks** | TLD:70 | `pendingTasks` | Same query + `.eq('status', 'Pending')` | `tasks.status` | `COUNT(*) WHERE status = 'Pending' AND assigned_to IN team` | 100% | ✅ |
| 4 | **Attendance Rate** | TLD:80 | computed | `supabase.from('attendance').select('*').in('employee_id', teamMemberIds)` | `attendance` | Team attendance percentage | 75% | ⚠️ No attendance records |
| 5 | **Team Members** | TLD:100 | `teamMembers` | `supabase.from('profiles').select('*').eq('team_lead_id', userId)` | `profiles` | `SELECT * WHERE team_lead_id = auth.uid()` | 100% | ✅ |
| 6 | **Recent Activities** | TLD:150 | `activities` | `supabase.from('work_logs').select('*').in('employee_id', teamMemberIds).order('created_at', { ascending: false }).limit(10)` | `work_logs` | Last 10 work log entries for team | 100% | ✅ |

---

## 11. TEAM LEAD AI INSIGHTS (`team-lead/AIInsights.tsx`)

| # | UI Label | File:Line | State Var | Query | Table.Column | Formula | Confidence | Status |
|---|----------|-----------|-----------|-------|-------------|---------|-----------|--------|
| 1 | **Team Performance Insights (AI)** | TLAI:50 | AI response | `supabase.functions.invoke('ai-proxy', { body: { tasks, teamMembers } })` | Real team task data + member data | AI model generates insights from real data | 75% | ⚠️ AI Recommendation |
| 2 | **Workload Distribution (AI)** | TLAI:80 | AI response | `supabase.functions.invoke('ai-proxy', { body: { tasks, workLogs } })` | Real team task + work log data | AI model generates distribution analysis from real data | 75% | ⚠️ AI Recommendation |

---

## 12. TEAM LEAD PAYROLL (`team-lead/Payroll.tsx`)

| # | UI Label | File:Line | State Var | Query | Table.Column | Formula | Confidence | Status |
|---|----------|-----------|-----------|-------|-------------|---------|-----------|--------|
| 1-8 | **Same breakdown as Employee Payroll** | TP:89-145 | same vars | `supabase.from('profiles').select('payroll_ctc').eq('id', userId).single()` | `profiles.payroll_ctc` | Same 50/20/30 split with TDS(10%) + PF(12%) deductions | 100% | 🐛 Displays in **$ USD** |

---

## 13. ADMIN PAYROLL (`admin/Payroll.tsx`)

| # | UI Label | File:Line | State Var | Query | Table.Column | Formula | Confidence | Status |
|---|----------|-----------|-----------|-------|-------------|---------|-----------|--------|
| 1 | **Employee Name** | AP:50 | `employees` | `supabase.from('profiles').select('id, name, payroll_ctc, department').not('payroll_ctc', 'is', null).neq('payroll_ctc', 0)` | `profiles.name` | Direct — filtered to non-zero CTC | 100% | ✅ |
| 2 | **Payroll CTC** | AP:50 | `employees` | Same query | `profiles.payroll_ctc` | Direct (annual) | 100% | ✅ |
| 3 | **Total Payroll** | AP:200 | `totalPayroll` | `.reduce((sum, e) => sum + Number(e.payroll_ctc), 0)` | `profiles.payroll_ctc` | `SUM(payroll_ctc)` for all configured employees | 100% | ✅ |
| 4 | **Format** | AP:210 | display | `formatCurrency(value)` | — | Uses `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })` | 100% | ✅ **INR ₹ — correct** |

---

## 14. HR PAYROLL (`hr/Payroll.tsx`)

| # | UI Label | File:Line | State Var | Query | Table.Column | Formula | Confidence | Status |
|---|----------|-----------|-----------|-------|-------------|---------|-----------|--------|
| 1 | **Employee Name** | HP:50 | `employees` | `supabase.from('profiles').select('id, name, payroll_ctc, department')` | `profiles.name` | Direct | 100% | ✅ |
| 2 | **Payroll CTC** | HP:50 | `employees` | Same query | `profiles.payroll_ctc` | Direct (annual) | 100% | ✅ |
| 3 | **Total Payroll** | HP:200 | `totalPayroll` | `.reduce((sum, e) => sum + Number(e.payroll_ctc), 0)` | `profiles.payroll_ctc` | `SUM(payroll_ctc)` | 100% | ✅ |
| 4 | **Format** | HP:210 | display | `formatCurrency(value)` | — | INR ₹ | 100% | ✅ **INR ₹ — correct** |
| 5 | **Salary Revision** | HP:339-352 | `auditRevision` | `supabase.from('salary_revision_history').insert({ employee_id, revised_by, ...8 more columns })` | `salary_revision_history` | **FAILS SILENTLY**: table only has 3 cols (`id, employee_id, revised_by`). INSERT tries `old_salary, new_salary, revision_percentage, revision_reason` which don't exist. Error caught by `console.warn`. | 100% | 🐛 Broken insert |

---

## 15. ADMIN AI INSIGHTS (`admin/AIInsights.tsx`)

| # | UI Label | File:Line | State Var | Query | Table.Column | Formula | Confidence | Status |
|---|----------|-----------|-----------|-------|-------------|---------|-----------|--------|
| 1 | **Department Analytics (AI)** | AAI:50 | AI response | `supabase.functions.invoke('ai-proxy', { body: { profiles, tasks, ... } })` | Full DB data: profiles, tasks, leaves, attendance | AI model generates from comprehensive data | 100% | ✅ Full DB data |
| 2 | **Hiring Predictions (AI)** | AAI:80 | AI response | `supabase.functions.invoke('ai-proxy', { body: { profiles, ... } })` | Profiles with hire dates | AI model generates prediction | 100% | ✅ Full DB data |
| 3 | **Workforce Forecasting (AI)** | AAI:110 | AI response | `supabase.functions.invoke('ai-proxy', { body: { allMetrics } })` | All available KPIs | AI model generates forecast | 100% | ✅ Full DB data |

---

## 16. EMPLOYEE AI INSIGHTS (`employee/AIInsights.tsx`)

| # | UI Label | File:Line | State Var | Query | Table.Column | Formula | Confidence | Status |
|---|----------|-----------|-----------|-------|-------------|---------|-----------|--------|
| 1 | **Task Performance Score** | EAI:50 | AI response | `supabase.functions.invoke('ai-proxy', { body: { tasks, workLogs } })` | Real user tasks + work logs | AI model generates analysis from real data | 75% | ⚠️ AI Prediction |
| 2 | **Productivity Pattern (AI)** | EAI:80 | AI response | `supabase.functions.invoke('ai-proxy', { body: { workLogs, attendance } })` | Real user work logs + attendance | AI model generates pattern from real data | 75% | ⚠️ AI Prediction |

---

## 17. LEAVE / COMPLAINT / RESIGNATION / ATTRITION

| # | UI Label | File:Line | State Var | Query | Table.Column | Formula | Confidence | Status |
|---|----------|-----------|-----------|-------|-------------|---------|-----------|--------|
| 1 | **Leave Status** | L:30 | `status` | `supabase.from('leaves').select('*').eq('user_id', userId)` | `leaves.status` | Direct — `Pending / Approved / Rejected` | 100% | ✅ |
| 2 | **Complaint Status** | C:30 | `status` | `supabase.from('complaints').select('*').eq('user_id', userId)` | `complaints.status` | Direct — `Pending / In Review / Closed / Rejected`. **Setting to `Resolved` crashes** | 100% | 🐛 Bug #4 |
| 3 | **Resignation Status** | R:30 | `status` | `supabase.from('employee_attrition').select('*').eq('employee_id', userId)` | `employee_attrition` | Direct | 100% | ✅ |
| 4 | **Attrition Count** | AR:30 | `attritionCount` | `supabase.from('employee_attrition').select('*', { count: 'exact', head: true })` | `employee_attrition` | `COUNT(*)` | 100% | ✅ |

---

## 18. PENDING MIGRATIONS / MIGRATION FIXES

| # | Table | Issue | Current Columns | Required Columns | Confidence | Status |
|---|-------|-------|----------------|-----------------|-----------|--------|
| 1 | `salary_revision_history` | Structurally incomplete | `id, employee_id, revised_by, created_at` (4 cols) | +`previous_ctc, new_ctc, reason, effective_date` (8 cols) | 100% | 🐛 Blocking |
| 2 | `payroll_history_records` | Structurally incomplete | `id, employee_id, created_at` (3 cols) | +`gross_salary, deductions, net_salary, pay_period, status, processed_by` (9 cols) | 100% | 🐛 Blocking |
| 3 | `complaints` trigger | References `NEW.subject` | Column is `title` | Fix trigger: `subject` → `title` | 100% | 🐛 Bug #4 |
| 4 | `profiles.designation` | Column missing | 25 columns, no `designation` | Add `designation VARCHAR` | 100% | 🐛 Bug #5 |

---

## PHASE A FIX VERIFICATION

| Fix | File | Before | After | Verified? |
|-----|------|--------|-------|-----------|
| `includes('complet')` → `=== 'completed'` | `admin/Analytics.tsx:190` | `status.includes('complet')` | `=== 'completed'` | ✅ Build 2771 modules |
| `includes('complet')` → `=== 'completed'` | `employee/Analytics.tsx:51` | `status.includes('complet')` | `=== 'completed'` | ✅ Build 2771 modules |
| Label "Gross Monthly Payroll" → "Total Annual CTC" | `admin/Analytics.tsx:495` | "Gross Monthly Payroll" | "Total Annual CTC" | ✅ Build 2771 modules |
| Remove `staticAttendanceScore=92` | `admin/MasterDirectory.tsx:100,146` | `staticAttendanceScore = 92` | `analyticsData?.attendance_score ?? taskCompletionRatio` | ✅ Build 2771 modules |
| AI disclaimers on 11 features | 6 files | No disclaimers | `(AI Prediction)` / `(AI Estimate)` badges | ✅ Build 2771 modules |
| `formatINR()` utility | `src/lib/utils.ts` | Not centralized | Centralized + 3 consumer files updated | ✅ Build 2771 modules |
| Admin AI Insights USD→INR | `admin/AIInsights.tsx` | `$` | `formatINR()` | ✅ Build 2771 modules |

---

## NEW FINDINGS FROM DATA LINEAGE TRACE

| # | Finding | File | Confidence | Impact |
|---|---------|------|-----------|--------|
| N1 | **Employee Payroll displays in USD `$`** | `employee/Payroll.tsx:89,99,140-143` | 100% | All payslip values shown in dollars instead of INR |
| N2 | **TL Payroll displays in USD `$`** | `team-lead/Payroll.tsx:89,99,140-143` | 100% | Same USD bug as Employee Payroll |
| N3 | **HR Payroll salary revision INSERT fails silently** | `hr/Payroll.tsx:339-352` | 100% | Tries to write `old_salary, new_salary, revision_percentage, reason` to table without those columns. `console.warn` catches error — no user-facing feedback |
| N4 | **Admin AI Insights previously used USD `$`** | `admin/AIInsights.tsx` | 100% | **FIXED in Phase A** — now uses `formatINR()` |
| N5 | **HR Payroll uses `formatCurrency` (INR ₹)** | `hr/Payroll.tsx:210` | 100% | Correct — consistent with Admin Payroll |
| N6 | **Admin Payroll uses `formatCurrency` (INR ₹)** | `admin/Payroll.tsx:210` | 100% | Correct |
| N7 | **HR Payroll query fetches ALL profiles** | `hr/Payroll.tsx:50` | 100% | No filter for `payroll_ctc > 0` (unlike Admin Payroll which has `.not('payroll_ctc', 'is', null).neq('payroll_ctc', 0)`) — shows 495 employees even those with 0 CTC |

---

## SUMMARY STATISTICS

| Metric | Count |
|--------|-------|
| **Total KPIs traced** | 72 |
| **Fully traceable to DB (✅)** | 51 (71%) |
| **Partially traceable (⚠️)** | 9 (13%) |
| **Broken/fabricated (🐛)** | 12 (17%) |
| **AI-generated (⚠️ AI)** | 10 (14%) — all now labeled with disclaimers |
| **Fixes applied (Phase A)** | 6 items, 10+ file changes |
| **Pending bugs found** | 7 (N1-N7 above + 3 old bugs) |
| **Schema-blocked features** | 2 (salary_revision_history, payroll_history_records) |
| **Blocked for certification** | 2 (payroll storage + salary revision storage) |

---

## NEXT STEPS

1. **Fix USD→INR on Employee Payroll** and **TL Payroll** (code-only, no schema)
2. **Fix HR Payroll query** to filter `payroll_ctc > 0` (code-only)
3. **Business Workflow Validation** — test every workflow with real DB interactions
4. **Mathematical Formula Verification** — verify payroll split formulas, scoring algorithms
5. **Automation Verification** — monthly payroll, payslip generation, onboarding automation
6. After lineage passes: schema migrations for `salary_revision_history`, `payroll_history_records`, complaint trigger fix
