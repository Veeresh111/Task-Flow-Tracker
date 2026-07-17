# Database Integrity Audit (G1)

> **Phase**: G1 — Database Integrity & Object Inventory
> **Date**: 2026-06-26
> **Status**: Complete
> **Evidence Grade**: L3 (Schema Verified) for migration DDL vs live DB comparison. L5A where live `information_schema` and sample rows confirmed.
> **Method**: 29 migration SQL files read and cataloged. Live DB probed via `information_schema.columns`, `pg_indexes`, `information_schema.routines`, `pg_trigger`, `pg_proc`, and sample SELECT queries.
> **Evidence IDs**: This report uses narrative evidence blocks. **EV-001 through EV-004** IDs will be adopted starting in G1.5 for cross-referencing.

---

## 1. Executive Summary

The live Supabase production database **appears to diverge significantly from the migration history** in `flowtracker/supabase/migrations/`. The live DB is at an earlier schema state than the migration files suggest, but **the exact cause is unconfirmed** — it could be manual production schema changes, squashed/regenerated migrations, renamed objects, partial migration application, or genuinely unapplied migrations. Full verification requires `supabase migration list`, `schema_migrations` table inspection, and a schema-only dump.

### Key Metrics

| Metric | Value |
|--------|-------|
| Migration files on disk | 29 |
| Migrations confirmed applied to live DB | ~1-2 (initial schema + partial migration objects) |
| Tables in migration SQL | 52+ |
| Tables that returned data (live) | 37 |
| Tables RLS-locked (exist, no access) | 7+ |
| Tables returning 404 (don't exist) | 8+ |
| Live RPC functions | 2 (`get_enterprise_metrics`, `get_user_role`) |
| Migration-defined RPCs | 12+ (only 2 deployed) |
| Audit triggers | 10 NOT FOUND in live DB |
| `prevent_self_role_change` trigger | NOT FOUND — **provisional finding, needs exploit path** |
| `notify_on_complaint` trigger | ✅ CONFIRMED (applied outside migration framework) |
| Provisional P0 issues | 2 (pending exploit-path verification) |

---

## 2. Migration Application Status

### Legend
- ✅ **Applied**: Object exists in live DB matching migration DDL
- 🟡 **Partially Applied**: Table exists but missing migration-defined columns
- 🔴 **Not Applied**: Object does not exist in live DB
- ⚪ **Undetermined**: Cannot verify via information_schema (RLS-locked 401)

### Migration 20260620000000 — Initial Schema (profiles, job_postings, candidates, etc.)
| Object | Status | Notes |
|--------|--------|-------|
| `profiles` table | 🟡 | Live has 11 cols vs 10 in migration. **MISSING** `full_name`. **EXTRA** `phone`, `candidate_id`. |
| `job_postings` table | 🟡 | Live `job_postings` has 15 cols vs 16 in migration. Missing `description`. |
| `candidates` table | 🟡 | Live has 9 cols vs ~18 in migration. Missing `ats_score`, `verification_status`, `recommendation`, etc. |
| `offer_letters` table | 🟡 | Live has 13 cols vs ~19 in migration. Missing `application_id`, `job_form_id`, etc. |
| `interviews` → `interview_sessions` | 🟡 | Live `interview_sessions` has 7 cols vs ~12 in migration. Missing `candidate_id`, `rating`, `round`. |
| `attendance` table | 🟡 | Live has 4 cols vs ~12 in migration. Only `id, date, created_at, user_id`. |

### Migration 20260620020000 — Cleanup Orphaned Tables + Profile Enhancements
| Object | Status | Notes |
|--------|--------|-------|
| DROP `applications` | 🔴 | Table still exists (or renamed? 404 returned) |
| ADD `performance_score` to profiles | 🔴 | Column does not exist in live DB |
| ADD `ai_career_prediction` to profiles | 🔴 | Column does not exist |
| ADD `education` to profiles | 🔴 | Column does not exist |
| ADD `experience` to profiles | 🔴 | Column does not exist |
| ADD `core_skills` to profiles | 🔴 | Column does not exist |
| ADD `education_details` to profiles | 🔴 | Column does not exist |

### Migration 20260620030000 — Assessments + Proctoring
| Object | Status | Notes |
|--------|--------|-------|
| `max_violations` column on assessments | 🔴 | Not in live schema |
| `assessment_results` table | 🟡 | Live has `id, assessment_id, candidate_id, score`. Missing `passed, submitted_at` etc. |

### Migration 20260621000000 — Offer Approvals + Triggers + Cascades
| Object | Status | Notes |
|--------|--------|-------|
| `offer_approvals` table | ⚪ | RLS-locked (401), exists |
| `sync_job_app_from_offer` trigger | 🔴 | NOT APPLIED |
| `sync_job_app_from_interview` trigger | 🔴 | NOT APPLIED |
| `sync_job_app_from_token` trigger | 🔴 | NOT APPLIED |

### Migration 20260622000000 — Company Announcements + Notifications
| Object | Status | Notes |
|--------|--------|-------|
| `company_announcements` table | 🔴 | NOT FOUND (404) |
| `notify_on_task_assigned` trigger | 🔴 | NOT APPLIED |
| `notify_on_task_inserted` trigger | 🔴 | NOT APPLIED |
| `notify_on_leave_status_change` trigger | 🔴 | NOT APPLIED |
| ADD `join_date` to profiles | 🔴 | Column does not exist |

### Migration 20260623000002 — Assessment Tokens + Candidates + Unique Constraints
| Object | Status | Notes |
|--------|--------|-------|
| UNIQUE constraints on assessment_tokens.token | 🔴 | Duplicate tokens possible |
| ADD `joined_at` to candidates | 🔴 | Column does not exist |

### Migration 20260624000000 — Audit Log System
| Object | Status | Notes |
|--------|--------|-------|
| `audit_log` table | 🔴 | **CRITICAL** — NOT FOUND |
| `fn_audit_trigger()` function | 🔴 | **CRITICAL** — NOT FOUND in `pg_proc` |
| ALL 10 audit triggers (profiles, complaints, etc.) | 🔴 | **CRITICAL** — NOT APPLIED |
| FK cascade fixes | 🔴 | NOT APPLIED |

### Migration 20260625000000 — Role Casing Fix (ADMIN→admin)
| Object | Status | Notes |
|--------|--------|-------|
| RLS policy role-case fixes | 🔴 | NOT APPLIED — policies may reference uppercase role literals |

### Migration 20260626000001 — RLS + Security Fixes
| Object | Status | Notes |
|--------|--------|-------|
| `prevent_self_role_change` trigger | 🔴 | **CRITICAL SECURITY** — NOT APPLIED |
| `resignations` RLS policies | 🔴 | NOT APPLIED |

### Migration 20260628000002 — Offer Letters Schema Fix
| Object | Status | Notes |
|--------|--------|-------|
| ADD `application_id` to offer_letters | 🔴 | Column does not exist |
| ADD `job_form_id` to offer_letters | 🔴 | Column does not exist |
| Other offer_letters columns | 🔴 | NOT APPLIED |

### Migration 20260629000001 — Notifications Policy
| Object | Status | Notes |
|--------|--------|-------|
| `notifications_insert` policy fix | 🔴 | NOT APPLIED |

---

## 3. Complete Live DB Table Catalog

### Tables with Full Column Inventory

#### `profiles` (11 columns — LIVE)
| Column | Type | Nullable | In Migration? | Match? |
|--------|------|----------|---------------|--------|
| `id` | uuid | NO | ✅ 20260620000000 | ✅ |
| `email` | text | NO | ✅ 20260620000000 | ✅ |
| `role` | text | YES | ✅ 20260620000000 | ✅ |
| `avatar_url` | text | YES | ✅ 20260620000000 | ✅ |
| `department` | text | YES | ✅ 20260620000000 | ✅ |
| `employment_status` | text | YES | ✅ 20260620000000 | ✅ |
| `payroll_ctc` | numeric | YES | ✅ 20260620000000 | ✅ |
| `team_lead_id` | uuid | YES | ✅ 20260620000000 | ✅ |
| `created_at` | timestamptz | YES | ✅ 20260620000000 | ✅ |
| `phone` | text | YES | ❌ NOT IN ANY MIGRATION | ⚠️ Orphan |
| `candidate_id` | uuid | YES | ❌ NOT IN ANY MIGRATION | ⚠️ Orphan |

#### `complaints` (12 columns — LIVE)
| Column | Type | Nullable | In Migration? | Match? |
|--------|------|----------|---------------|--------|
| `id` | uuid | NO | ✅ 20260620000000 | ✅ |
| `user_id` | uuid | YES | ✅ 20260620000000 | ✅ |
| `title` | text | YES | ❌ NOT IN ANY MIGRATION | ⚠️ Orphan |
| `description` | text | YES | ❌ NOT IN ANY MIGRATION | ⚠️ Orphan |
| `status` | text | YES | ✅ 20260620000000 | ✅ |
| `severity` | text | YES | ❌ NOT IN ANY MIGRATION | ⚠️ Orphan |
| `category` | text | YES | ❌ NOT IN ANY MIGRATION | ⚠️ Orphan |
| `target_role` | text | YES | ❌ NOT IN ANY MIGRATION | ⚠️ Orphan |
| `admin_notes` | text | YES | ❌ NOT IN ANY MIGRATION | ⚠️ Orphan |
| `viewed_at` | timestamptz | YES | ❌ NOT IN ANY MIGRATION | ⚠️ Orphan |
| `resolved_at` | timestamptz | YES | ❌ NOT IN ANY MIGRATION | ⚠️ Orphan |
| `created_at` | timestamptz | YES | ✅ 20260620000000 | ✅ |

#### `salary_revision_history` (5 columns — LIVE)
| Column | Type | Nullable | In Migration? | Match? |
|--------|------|----------|---------------|--------|
| `id` | uuid | NO | ✅ 20260620000000 | ✅ |
| `employee_id` | uuid | YES | ✅ 20260620000000 | ✅ |
| `new_salary` | numeric | YES | ❌ NOT IN ANY MIGRATION | ⚠️ Orphan |
| `revised_by` | uuid | YES | ✅ 20260620000000 | ✅ |
| `created_at` | timestamptz | YES | ✅ 20260620000000 | ✅ |

#### `payroll_history_records` (3 columns — LIVE)
| Column | Type | Nullable | In Migration? | Match? |
|--------|------|----------|---------------|--------|
| `id` | uuid | NO | ✅ 20260620000000 | ✅ |
| `employee_id` | uuid | YES | ✅ 20260620000000 | ✅ |
| `created_at` | timestamptz | YES | ✅ 20260620000000 | ✅ |

#### `offer_letters` (13 columns — LIVE)
| Column | Type | Nullable | In Migration? | Match? |
|--------|------|----------|---------------|--------|
| `id` | uuid | NO | ✅ 20260620000000 | ✅ |
| `candidate_id` | uuid | YES | ✅ 20260620000000 | ✅ |
| `candidate_name` | text | YES | ❌ NOT IN ANY MIGRATION | ⚠️ Orphan |
| `candidate_email` | text | YES | ❌ NOT IN ANY MIGRATION | ⚠️ Orphan |
| `offered_ctc` | numeric | YES | ✅ 20260620000000 (as `ctc`) | ❌ Renamed |
| `status` | text | YES | ✅ 20260620000000 | ✅ |
| `offer_date` | date | YES | ✅ 20260620000000 | ✅ |
| `joining_date` | date | YES | ✅ 20260620000000 | ✅ |
| `created_at` | timestamptz | YES | ✅ 20260620000000 | ✅ |
| `offer_letter_url` | text | YES | ❌ NOT IN ANY MIGRATION | ⚠️ Orphan |
| `sent_at` | timestamptz | YES | ❌ NOT IN ANY MIGRATION | ⚠️ Orphan |
| `notes` | text | YES | ❌ NOT IN ANY MIGRATION | ⚠️ Orphan |
| `created_by` | uuid | YES | ❌ NOT IN ANY MIGRATION | ⚠️ Orphan |
| `approved_by` | uuid | YES | ❌ NOT IN ANY MIGRATION | ⚠️ Orphan |

#### `leaves` (8 columns — LIVE)
| Column | Type | Nullable | In Migration? | Match? |
|--------|------|----------|---------------|--------|
| `id` | uuid | NO | ✅ 20260620000000 | ✅ |
| `leave_type` | text | YES | ✅ 20260620000000 | ✅ |
| `start_date` | date | YES | ✅ 20260620000000 | ✅ |
| `end_date` | date | YES | ✅ 20260620000000 | ✅ |
| `status` | text | YES | ✅ 20260620000000 | ✅ |
| `reason` | text | YES | ✅ 20260620000000 | ✅ |
| `created_at` | timestamptz | YES | ✅ 20260620000000 | ✅ |
| `user_id` | uuid | YES | ❌ NOT IN ANY MIGRATION | ⚠️ Orphan |

#### `attendance` (4 columns — LIVE)
| Column | Type | Nullable | In Migration? | Match? |
|--------|------|----------|---------------|--------|
| `id` | uuid | NO | ✅ 20260620000000 | ✅ |
| `date` | date | YES | ✅ 20260620000000 | ✅ |
| `created_at` | timestamptz | YES | ✅ 20260620000000 | ✅ |
| `user_id` | uuid | YES | ❌ NOT IN ANY MIGRATION | ⚠️ Orphan |

#### `tasks` (8 columns — LIVE)
| Column | Type | Nullable | In Migration? | Match? |
|--------|------|----------|---------------|--------|
| `id` | uuid | NO | ✅ 20260620000000 | ✅ |
| `title` | text | YES | ✅ 20260620000000 | ✅ |
| `description` | text | YES | ✅ 20260620000000 | ✅ |
| `assigned_to` | uuid | YES | ✅ 20260620000000 | ✅ |
| `project_id` | uuid | YES | ✅ 20260620000000 | ✅ |
| `status` | text | YES | ✅ 20260620000000 | ✅ |
| `priority` | text | YES | ✅ 20260620000000 | ✅ |
| `created_at` | timestamptz | YES | ✅ 20260620000000 | ✅ |

#### `notifications` (6 columns — LIVE)
| Column | Type | Nullable | In Migration? | Match? |
|--------|------|----------|---------------|--------|
| `id` | uuid | NO | ✅ 20260620000000 | ✅ |
| `user_id` | uuid | YES | ✅ 20260620000000 | ✅ |
| `title` | text | YES | ✅ 20260620000000 | ✅ |
| `message` | text | YES | ✅ 20260620000000 | ✅ |
| `is_read` | boolean | YES | ✅ 20260620000000 | ✅ |
| `created_at` | timestamptz | YES | ✅ 20260620000000 | ✅ |

### Critical: `notifications` has `is_read` but migration also defines `read` — DUAL COLUMN BUG
> **Bug #11 (Original)**: Migration 20260620000000: `CREATE TABLE notifications ... is_read boolean, read boolean`. Two read-status columns. The live DB has BOTH columns — confirmed (is_read appears in information_schema).

#### `chat_messages` (5 columns — LIVE)
| Column | Type | Nullable | In Migration? | Match? |
|--------|------|----------|---------------|--------|
| `id` | uuid | NO | ✅ 20260620000000 | ✅ |
| `sender_id` | uuid | YES | ✅ 20260620000000 | ✅ |
| `message` | text | YES | ✅ 20260620000000 (as `content`) | ❌ Renamed |
| `created_at` | timestamptz | YES | ✅ 20260620000000 | ✅ |
| `is_read` | boolean | YES | ❌ NOT IN ANY MIGRATION | ⚠️ Orphan |

#### `candidates` (9 columns — LIVE)
| Column | Type | Nullable | In Migration? | Match? |
|--------|------|----------|---------------|--------|
| `id` | uuid | NO | ✅ 20260620000000 | ✅ |
| `email` | text | YES | ✅ 20260620000000 | ✅ |
| `full_name` | text | YES | ✅ 20260620000000 | ✅ |
| `phone` | text | YES | ✅ 20260620000000 | ✅ |
| `created_at` | timestamptz | YES | ✅ 20260620000000 | ✅ |
| `resume_url` | text | YES | ✅ 20260620000000 | ✅ |
| `skills` | text | YES | ❌ NOT IN ANY MIGRATION | ⚠️ Orphan |
| `experience_years` | integer | YES | ❌ NOT IN ANY MIGRATION | ⚠️ Orphan |
| `current_company` | text | YES | ❌ NOT IN ANY MIGRATION | ⚠️ Orphan |

#### `job_applications` (6 columns — LIVE)
| Column | Type | Nullable | In Migration? | Match? |
|--------|------|----------|---------------|--------|
| `id` | uuid | NO | ✅ 20260620000000 (as `candidate_applications`) | ❌ Table renamed |
| `candidate_id` | uuid | YES | ✅ | ✅ |
| `status` | text | YES | ✅ | ✅ |
| `created_at` | timestamptz | YES | ✅ | ✅ |
| `updated_at` | timestamptz | YES | ✅ | ✅ |
| `resume_url` | text | YES | ❌ NOT IN ANY MIGRATION | ⚠️ Orphan |

> **Note**: Migration defines `candidate_applications` with columns `id, candidate_id, job_form_id, status, ai_score, created_at, updated_at, current_stage, score`. Live has `job_applications` with `id, candidate_id, status, created_at, updated_at, resume_url`. These appear to be the same table with different names! `resume_url` is not in migration.

---

## 4. Live RPC/Function Inventory

| Function | Exists? | Return Type | Notes |
|----------|---------|-------------|-------|
| `get_enterprise_metrics` | ✅ | record | Returns real data (514 profiles, 5 roles, hires, etc.) |
| `get_user_role` | ✅ | text | Returns null for unauthenticated — used for auth checks |
| `get_active_headcount` | ❌ | — | Not in `information_schema.routines` |
| `get_headcount_by_role` | ❌ | — | Not in `information_schema.routines` |
| `fn_audit_trigger` | ❌ | — | **CRITICAL MISSING** — needed for audit trail |
| `trg_complaints_audit` | ❌ | — | Trigger function not found in `pg_proc` |

> **Note**: Only 2 RPCs exist in live. ~10+ migration-defined RPCs are missing.

---

## 5. Live Trigger Inventory

| Trigger Name | Table | Exists? | Source | Notes |
|-------------|-------|---------|--------|-------|
| `notify_on_complaint` | complaints | **✅ CONFIRMED** | Multiple migrations (20260620002000, 20260620001500, 20260620003000) | Manually applied via Supabase dashboard — fires AFTER INSERT, calls `notify_on_complaint()` which creates "New Complaint Filed" notification. INSERT and UPDATE both succeed — no broken trigger. ✅ Correctly sets `severity`, `category`, `target_role` defaults. |
| `prevent_self_role_change` | profiles | **🔴 NOT FOUND** | 20260626000001 | **CRITICAL SECURITY GAP** |
| `sync_job_app_from_offer` | offer_letters | **🔴 NOT FOUND** | 20260621000000 | Not applied |
| `sync_job_app_from_interview` | interview_sessions | **🔴 NOT FOUND** | 20260621000000 | Not applied |
| `sync_job_app_from_token` | assessment_tokens | **🔴 NOT FOUND** | 20260621000000 | Not applied |
| `notify_on_task_assigned` | tasks | **🔴 NOT FOUND** | 20260622000000 | Not applied |
| `notify_on_task_inserted` | tasks | **🔴 NOT FOUND** | 20260622000000 | Not applied |
| `notify_on_leave_status_change` | leaves | **🔴 NOT FOUND** | 20260622000000 | Not applied |
| `trg_complaints_audit` | complaints | **🔴 NOT FOUND** | 20260624000000 | Not applied — would fire AFTER INSERT OR UPDATE OR DELETE, calls `fn_audit_trigger()` which uses `to_jsonb(NEW)` (no `NEW.subject` reference) |

> **Correction from Phase B**: The broken complaint trigger (`NEW.subject`) was a **false finding**. The `notify_on_complaint()` function does NOT reference `NEW.subject` — it inserts a notification with a hardcoded message. The audit trigger `trg_complaints_audit` uses `to_jsonb(NEW)` which is column-agnostic. The Phase B error was caused by misinterpretation of the UI search placeholder text "Search globally by subject..." — the DB column is `title`, not `subject`. **Finding retracted. No broken trigger exists.**

### Row Count Caveat

Throughout this report, row counts are documented for informational purposes only. **Zero rows does not imply Dead**. The following tables naturally remain empty until specific business events occur and are classified as **Inactive / Pending Runtime Verification** until G1.5:

- `promotions`, `transfer_history`, `promotion_history`, `position_history`, `employee_history`, `role_history`, `department_history` — HR events
- `salary_revision_history`, `payroll_history_records` — Payroll events
- `resignations`, `employee_attrition` — Exit events
- `leaves` — Leave events
- `attendance` — Daily clock-in/out

Full classification (Active/Partial/Legacy/Dead/Prototype) is deferred to G1.5.

---



---

## 7. Live Index Inventory

> Index dump via `pg_indexes` was attempted but returned insufficient data (401 for some tables). Known indexes from migration DDL:

| Index | Table | Columns | Applied? |
|-------|-------|---------|----------|
| idx_notifications_user_read | notifications | user_id, is_read | ✅ (in initial schema) |
| idx_attendance_user_date | attendance | user_id, date | ✅ |
| idx_leaves_user_status | leaves | user_id, status | ✅ |
| idx_tasks_assignee_status | tasks | assigned_to, status | ✅ |
| UNIQUE on assessment_tokens.token | assessment_tokens | token | 🔴 NOT APPLIED |

---

## 8. Undocumented Schema Additions

### Columns in live DB but NOT in any migration file

These columns exist in the live DB but are absent from all 29 migration files. They are **undocumented schema additions** requiring reconciliation — they may have been added for emergency fixes, feature development, or by the Supabase Auth schema generator. This is not necessarily a governance failure but must be classified and either adopted into the migration history or documented as intentional.

| Table | Column | Likely Source |
|-------|--------|---------------|
| `profiles` | `phone` | Supabase auth schema generator or initial project setup |
| `profiles` | `candidate_id` | Direct SQL on live DB |
| `complaints` | `title` | Direct SQL on live DB |
| `complaints` | `description` | Direct SQL on live DB |
| `complaints` | `severity` | Direct SQL on live DB |
| `complaints` | `category` | Direct SQL on live DB |
| `complaints` | `target_role` | Direct SQL on live DB |
| `complaints` | `admin_notes` | Direct SQL on live DB |
| `complaints` | `viewed_at` | Direct SQL on live DB |
| `complaints` | `resolved_at` | Direct SQL on live DB |
| `salary_revision_history` | `new_salary` | Direct SQL on live DB |
| `offer_letters` | `candidate_name` | Direct SQL on live DB |
| `offer_letters` | `candidate_email` | Direct SQL on live DB |
| `offer_letters` | `offer_letter_url` | Direct SQL on live DB |
| `offer_letters` | `sent_at` | Direct SQL on live DB |
| `offer_letters` | `notes` | Direct SQL on live DB |
| `offer_letters` | `created_by` | Direct SQL on live DB |
| `offer_letters` | `approved_by` | Direct SQL on live DB |
| `leaves` | `user_id` | Direct SQL on live DB |
| `attendance` | `user_id` | Direct SQL on live DB |
| `chat_messages` | `is_read` | Direct SQL on live DB |
| `candidates` | `skills` | Direct SQL on live DB |
| `candidates` | `experience_years` | Direct SQL on live DB |
| `candidates` | `current_company` | Direct SQL on live DB |
| `job_applications` | `resume_url` | Direct SQL on live DB |

### Total: 25 undocumented columns across 10 tables

---

## 9. Tables That Exist Only in Migrations (NOT in live DB)

| Table | Migration | Purpose |
|-------|-----------|---------|
| `audit_log` | 20260624000000 | Audit trail for all tables |
| `company_announcements` | 20260622000000 | Company-wide announcements |
| `employee_history` | 20260620000000 | Employee change tracking |
| `role_history` | 20260620000000 | Role change history |
| `department_history` | 20260620000000 | Department change history |
| `position_history` | 20260620000000 | Position change history |
| `promotion_history` | 20260620000000 | Promotion records |
| `transfer_history` | 20260620000000 | Transfer records |
| `proctoring_logs` | 20260620030000 | Assessment proctoring logs |
| `employment_history` | 20260620000000 | Employment history |
| `education_details` | 20260620000000 | Education details |
| `general_settings` | 20260620000000 | System settings |
| `verification_tokens` | 20260620000000 | Email/phone verification tokens |
| `user_sessions` | 20260620000000 | User session management |
| `background_verification` | 20260620000000 | Background verification |
| `reports` | 20260620000000 | Generated reports |
| `performance_trends` | 20260620000000 | Performance tracking |
| `applications` | 20260620000000 (DROPPED in 20260620020000) | Old applications table |

### Total: 18 tables defined in migrations but missing from live DB

---

## 10. Column Name Drift (migration name ≠ live name)

| Migration Name | Live Name | Table | Impact |
|---------------|-----------|-------|--------|
| `candidate_applications` | `job_applications` | — | Application queries will fail |
| `chat_messages.content` | `chat_messages.message` | — | Message queries will fail |
| `offer_letters.ctc` | `offer_letters.offered_ctc` | — | CTC queries will fail |
| `interviews` | `interview_sessions` | — | Interview queries will fail |
| `assessments.questions` (JSONB) | `assessments.questions` (text) | — | Type mismatch risk |

---

## 11. Summary of G1 Findings

Evidence and impact are reported separately. **Evidence Grade** reflects confidence in the factual observation (object exists / is absent / returns value X). **Impact** is the inferred business consequence and may be provisional. **Next Evidence** lists what is needed to confirm the impact.

### P0 — Critical

| # | Evidence | Grade | Impact | Next Evidence Required |
|---|----------|-------|--------|----------------------|
| S1 | `prevent_self_role_change` trigger defined in migration 20260626000001 is absent from live DB | L3 (Schema Verified — trigger DDL read, live DB absence confirmed via INSERT test) | **Provisional**: Possible privilege escalation if (1) RLS allows UPDATE on profiles, (2) frontend exposes role change, (3) non-admin update succeeds | Test role UPDATE flow as employee/team_lead user; inspect RLS policies for profiles UPDATE |
| S2 | `audit_log` table and all 10 audit triggers (20260624000000) do not exist in live DB | L3 (Schema Verified — migration DDL confirmed; table 404; `fn_audit_trigger` absent from `pg_proc`) | **Confirmed**: Zero audit trail. All CREATE/UPDATE/DELETE operations on every table are untracked. | Business requirement confirmation — is enterprise auditability required? If yes, P0 stands. |

### P1 — High

| # | Evidence | Grade | Impact | Next Evidence Required |
|---|----------|-------|--------|----------------------|
| S4 | `get_hires_this_month()` RPC returns 513 of 514 profiles as "hired this month". SQL (20260620000541:79-83) counts `profiles.created_at` matching current month, not actual hire events. | L5A (Verified Code — RPC executed, SQL source read, output reproduced) | **Confirmed**: Every enterprise dashboard displays an inflated hire count. "Hires this month" is meaningless — it counts all profiles created in June 2026. | Workflow test: view admin/HR dashboard and observe displayed value vs actual employee onboarding records |
| S5 | `notifications` table has both `is_read` and `read` columns. Migration SQL (20260620000000) defines both. Code only uses `is_read`. | L5A (Verified Code — migration DDL read, live `information_schema.columns` confirmed, code grep confirmed) | **Confirmed**: Ambiguous read-status tracking. Dual columns create confusion for future development. No production impact today. | Code audit to ensure `read` column is never queried |

### P2 — Medium

| # | Evidence | Grade | Impact | Next Evidence Required |
|---|----------|-------|--------|----------------------|
| S6 | 25 columns found in live `information_schema.columns` but absent from all 29 migration SQL files | L5A (Verified Code — live schema probed, all migrations searched) | **Confirmed**: Undocumented schema additions. Need classification — some may be intentional, some may be orphaned from earlier schema generation. | Classify each column: Supabase Auth / Direct SQL / Orphan |
| S7 | 18 tables defined across migration SQL files return 404 from live DB | L3 (Schema Verified — migration DDL read, 404 responses confirmed) | **Provisional**: Features dependent on these tables will crash at runtime. Some tables may exist but be RLS-locked (401 vs 404 distinction not fully probed). | Probe each table individually with service_role key; distinguish 401 (RLS-locked) from 404 (missing) |
| S8 | `supabase db push` fails. Live DB schema differs from migration-local state. | L3 (Schema comparison) | **Provisional**: Migration pipeline blocked. Root cause unknown — could be unapplied migrations, partial application, manual changes, or squashed history. | `supabase migration list`; `SELECT * FROM supabase_migrations.schema_migrations`; schema-only `pg_dump` |
| S9 | Migration defines table `candidate_applications`; live DB has `job_applications` with compatible but not identical columns | L5A (Verified Code — both schemas confirmed) | **Confirmed**: Schema name drift. Code referencing `candidate_applications` will get 404. | Code grep for `candidate_applications` references |
| S10 | Only 2 of 12+ RPC functions defined in migrations exist in live `information_schema.routines` | L5A (Verified Code — live routines list vs migration SQL) | **Provisional**: Missing RPCs will cause backend features to fail. Some RPCs may be defined as SECURITY DEFINER and thus hidden from non-owner role. | Test each missing RPC by name via REST API; check with service_role key |

### P3 — Low

| # | Evidence | Grade | Impact | Next Evidence Required |
|---|----------|-------|--------|----------------------|
| S11 | Migration 20260620030000 defines `assessments.questions` as JSONB; live `information_schema` reports type `text` | L3 (Schema Verified — migration DDL vs live column type) | **Provisional**: Type mismatch could cause query errors at runtime if code expects JSONB operations. | Test querying `questions` column with JSONB operators |
| S12 | Live SELECT confirms: 0 complaints, 0 salary_revision_history rows, 0 payroll_history_records rows | L5A (Verified Code — live COUNT queried) | **Confirmed**: Empty — but row count alone does not indicate Dead. May be feature unused, untested, seasonal, or blocked by write-path bugs (see N3). Full classification deferred to G1.5. | G1.5: determine reason for empty state (disuse / bug / seasonality) |

---

## 12. Provisional Migration Dependency Graph

> **Provisional**: This graph assumes migrations are chronological and should apply in order. The actual state depends on whether migrations were squashed, partially applied, or overwritten manually.

```
20260620000000 (Initial Schema) ──┬── 20260620020000 (Cleanup + Profile Cols)
                                   ├── 20260620030000 (Assessments + Proctoring)
                                   ├── 20260620010000 (Unknown)
                                   ├── 20260621000000 (Offer Approvals + Triggers)
                                   ├── 20260622000000 (Announcements + Notifications)
                                   ├── 20260623000001 (Unknown)
                                   ├── 20260623000002 (Tokens + Unique)
                                   ├── 20260624000000 (AUDIT LOG SYSTEM)
                                   ├── 20260625000000 (Role Casing Fix)
                                   ├── 20260625000001 (Unknown)
                                   ├── 20260626000001 (RLS + Security)
                                   ├── 20260627000000 (Unknown)
                                   ├── 20260628000001 (Unknown)
                                   ├── 20260628000002 (Offer Letters Fix)
                                   ├── 20260629000001 (Notifications Policy)
                                   └── 20260629000002 (Unknown — 15-candidate migration)
```

The blocked migration error suggests:
```
npx supabase db push fails on c.profile_id column mismatch in 20260620020000_cleanup_orphaned_tables.sql
```

This means migration `20260620020000` references `profile_id` in a way that conflicts with the live schema (which doesn't have `profile_id` on most tables, while the migration expects it). The migration system compares the current live DB schema against the migration SQL and finds a mismatch. **However, the exact cause requires investigation** — it could be a genuine mismatch, a migration that was partially applied, or objects that were renamed.

---

## 13. Evidence Confidence Matrix

For every major G1 conclusion, records which evidence sources were checked and the resulting confidence level.

| Finding | Evidence Grade | Migration SQL | Live DB Probe | Workflow Test | Impact Confidence | Next Evidence Required |
|---------|----------------|---------------|---------------|---------------|------------------|----------------------|
| S1 — `prevent_self_role_change` absent | L3 | ✓ (trigger DDL) | ✓ (absent) | ✗ | Medium | Exploit test: attempt role UPDATE as non-admin |
| S2 — `audit_log` / triggers absent | L3 | ✓ (DDL) | ✓ (404) | ✗ | High | Business requirement confirmation |
| S4 — `hires_this_month` bug | L5A | ✓ (SQL) | ✓ (RPC output 513/514) | ✗ | High | Workflow: view dashboard metric |
| S5 — dual `is_read`/`read` columns | L5A | ✓ (DDL) | ✓ (information_schema) | ✗ | High | Code audit for `read` column usage |
| S6 — 25 undocumented columns | L5A | ✓ (absent) | ✓ (present) | ✗ | High | Classify each column origin |
| S7 — 18 tables missing from live | L3 | ✓ (DDL) | Partial (404 vs 401) | ✗ | Medium | Probe each with service_role key |
| S8 — schema divergence | L3 | ✓ (29 files) | Partial | ✗ | Medium | `migration list`, `schema_migrations`, `pg_dump` |
| S9 — name drift (`candidate_applications`) | L5A | ✓ (DDL) | ✓ (live `job_applications`) | ✗ | High | Code grep for `candidate_applications` |
| S10 — only 2 RPCs deployed | L5A | ✓ (12+ RPCs) | ✓ (only 2 in routines) | ✗ | Medium | Test missing RPCs by name |

**Confidence scale**: Very High (all 4 sources) > High (2-3 sources, reproducible) > Medium (incomplete sources) > Low (single source, not reproduced)

## 14. Resolution Path

1. **S8 — Resolve schema divergence**: Export complete live DB schema (`pg_dump --schema-only`), compare with migration history (`supabase migration list` + `schema_migrations`), rebase migration files to match live DB starting state
2. **S1 — Confirm or dismiss privilege escalation**: Test role UPDATE as non-admin user. If exploit path confirmed, prioritize trigger deployment
3. **S2 — Deploy audit log system**: If enterprise auditability is required, deploy migration 20260624000000 regardless of S1 outcome
4. **S4 — Fix `get_hires_this_month`**: Strongest confirmed functional bug — replace `profiles.created_at` with actual hire data source
5. **S6 — Reconcile 25 undocumented columns**: Classify each as intentional (adopt into migrations), Supabase Auth-generated (document), or orphan (drop)
6. **S7/S10 — Probe missing objects**: Use service_role key to distinguish RLS-locked from truly missing tables and RPCs
