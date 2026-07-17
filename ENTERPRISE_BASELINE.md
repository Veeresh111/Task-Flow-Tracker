# Enterprise Baseline v1

> **Framework**: EHCF (Enterprise HRMS Certification Framework)
> **Phase**: G1 — Database Integrity & Object Inventory (Closure Artifact)
> **Date**: 2026-06-26
> **Status**: FROZEN — do not modify without version bump
> **Change Policy**: Any schema, migration, or runtime metadata change requires a new baseline version. Compare against this baseline in every future audit phase.

---

## 1. Project Identity

| Field | Value |
|-------|-------|
| Project name | flowtracker |
| Supabase project | txwxtsdsbuddqfrtllsf.supabase.co |
| Git commit | **N/A** — no `.git` directory initialized |
| Branch | **N/A** |
| Working directory | `C:\Users\veere\Downloads\Task-Flow-Tracker-hackathon\Task-Flow-Tracker-hackathon\flowtracker` |
| Baseline version | v1 |

---

## 2. Environment Versions

### Runtime

| Component | Version |
|-----------|---------|
| Node.js | v24.17.0 |
| npm | 11.13.0 |

### Application Dependencies

| Package | Version |
|---------|---------|
| React | ^18.3.1 |
| TypeScript | ^5.8.3 |
| Vite | ^5.4.19 |
| @supabase/supabase-js | ^2.108.1 |
| react-router-dom | ^6.30.1 |
| tailwindcss | ^3.4.17 |

### Tooling

| Tool | Version |
|------|---------|
| Supabase CLI | 2.108.0 |
| Playwright | ^1.61.0 |

---

## 3. Immutable Hashes

| Artifact | Algorithm | Hash |
|----------|-----------|------|
| package-lock.json | SHA256 | `7539B66474063D0BB6A4812B7E1977B7407A321E6C9A56161369E9B883212024` |
| Migration files (aggregate, 29 files) | SHA256 | `381B8545D88DD192F301F0A2E565D4CF0F3A074810B7D68B938121DD9CFE1801` |

> **Migration aggregate**: All 29 `.sql` files in `supabase/migrations/` sorted by name, concatenated, SHA256 hashed. Any addition, removal, or modification to migration files will change this hash.

---

## 4. Migration Inventory

| # | Migration File | Purpose |
|---|----------------|---------|
| 1 | `20260619231324_security_migration.sql` | RLS policies, security setup |
| 2 | `20260619232721_fix_rls_recursion.sql` | RLS recursion fix, `user_has_role` function |
| 3 | `20260620000541_unified_enterprise_metrics.sql` | Enterprise metrics RPCs, team metrics |
| 4 | `20260620001000_atomic_status_sync.sql` | Status sync triggers |
| 5 | `20260620001500_fix_schema_and_notifications.sql` | Schema fixes, notification triggers |
| 6 | `20260620002000_fix_candidate_id_resolution.sql` | Candidate ID resolution, complaint notification |
| 7 | `20260620002500_add_notifications_title.sql` | Add title to notifications |
| 8 | `20260620003000_fix_all_remaining_issues.sql` | Remaining fixes, notification functions |
| 9 | `20260620003500_fix_resolve_candidate_id.sql` | Candidate ID fixes |
| 10 | `20260620004000_enable_realtime.sql` | Enable realtime for key tables |
| 11 | `20260620004500_job_forms_lifecycle.sql` | Job forms lifecycle |
| 12 | `20260620005000_assessment_flow_fix.sql` | Assessment flow fixes |
| 13 | `20260620005500_fix_assessment_duration.sql` | Assessment duration fix |
| 14 | `20260620010000_data_consolidation_phase1.sql` | Phase 1 data consolidation |
| 15 | `20260620020000_cleanup_orphaned_tables.sql` | Cleanup orphaned tables + profile enhancements |
| 16 | `20260620030000_assessment_config_and_fixes.sql` | Assessment config + proctoring |
| 17 | `20260620040000_phase4_rls_automation.sql` | Phase 4 RLS + automation |
| 18 | `20260621000000_phase5_missing_schema.sql` | Phase 5 missing schema + triggers |
| 19 | `20260622000000_phase6_missing_schema.sql` | Phase 6 missing schema + FK cascades |
| 20 | `20260623000001_phaseA_auth_attempts_fixes.sql` | Phase A auth attempts |
| 21 | `20260623000002_phaseB_token_constraints_onboarding.sql` | Phase B token constraints |
| 22 | `20260624000000_phaseC_audit_cascade_fixes.sql` | **Audit log system + FK cascade fixes** |
| 23 | `20260625000000_fixup_phase6_role_casing.sql` | Role casing fix (ADMIN→admin) |
| 24 | `20260626000000_fixup_missing_fks_columns.sql` | Missing FK/column fixes |
| 25 | `20260626000001_fix_rls_role_escalation.sql` | **Self-role-change prevention trigger** |
| 26 | `20260627000001_fix_trigger_allow_superuser.sql` | Trigger superuser fix |
| 27 | `20260628000001_fix_rls_job_applications_tokens.sql` | RLS fix for job apps/tokens |
| 28 | `20260628000002_fix_offer_letters_schema.sql` | Offer letters schema fix |
| 29 | `20260629000001_add_team_lead_notifications_policy.sql` | TL notifications policy |

---

## 5. Live Database Snapshot

### 5.1 Storage Buckets

| Bucket | Exists | Files Visible | Upload Tested | Download Tested | RLS Tested | Public Status |
|--------|--------|---------------|---------------|-----------------|------------|---------------|
| `resumes` | ✅ | 1 | ✗ | ✗ | ✗ | Unknown |
| `bgc_docs` | ✅ | 1 | ✗ | ✗ | ✗ | Unknown |
| `avatars` | ✅ | 0 | ✗ | ✗ | ✗ | Unknown |
| `offer_letters` | ✅ | 0 | ✗ | ✗ | ✗ | Unknown |

> **Note**: Bucket existence confirmed via `storage.list()`. Full certification requires: upload, download, signed URL, RLS policy verification, delete, and metadata inspection. These will be completed in a subsequent phase.

### 5.2 Table Inventory (Live DB)

**Total accessible tables**: 36 (via anon key + authenticated admin role)
**Total rows**: 1,091 (sum of accessible row counts)

> **Important**: Row counts are provided for informational purposes only. Zero rows does **not** indicate Dead. Classifications (Active/Partial/Legacy/Dead/Prototype) are the responsibility of G1.5 — do not infer object status from row counts alone.

| Table | Rows | Exists | Write Path | Read Path | Workflow Executed | Status (G1.5) |
|-------|------|--------|------------|-----------|-------------------|---------------|
| `profiles` | 514 | ✅ | ✅ | ✅ | Unknown | Pending G1.5 |
| `candidates` | 48 | ✅ | Unknown | ✅ | Unknown | Pending G1.5 |
| `job_applications` | 48 | ✅ | Unknown | ✅ | Unknown | Pending G1.5 |
| `candidate_applications` | 48 | ✅ | Unknown | ✅ | Unknown | Pending G1.5 |
| `job_forms` | 63 | ✅ | Unknown | ✅ | Unknown | Pending G1.5 |
| `messages` | 63 | ✅ | Unknown | ✅ | Unknown | Pending G1.5 |
| `assessment_tokens` | 46 | ✅ | Unknown | ✅ | Unknown | Pending G1.5 |
| `candidate_onboarding` | 42 | ✅ | Unknown | ✅ | Unknown | Pending G1.5 |
| `interview_sessions` | 39 | ✅ | Unknown | ✅ | Unknown | Pending G1.5 |
| `assessment_attempts` | 27 | ✅ | Unknown | ✅ | Unknown | Pending G1.5 |
| `offer_letters` | 15 | ✅ | Unknown | ✅ | Unknown | Pending G1.5 |
| `work_logs` | 14 | ✅ | Unknown | ✅ | Unknown | Pending G1.5 |
| `candidate_hr_messages` | 9 | ✅ | Unknown | ✅ | Unknown | Pending G1.5 |
| `tasks` | 7 | ✅ | Unknown | ✅ | Unknown | Pending G1.5 |
| `weekly_attendance` | 7 | ✅ | Unknown | ✅ | Unknown | Pending G1.5 |
| `notifications` | 6 | ✅ | ✅ (trigger) | ✅ | Unknown | Pending G1.5 |
| `reports` | 6 | ✅ | Unknown | ✅ | Unknown | Pending G1.5 |
| `hiring_stats` | 6 | ✅ | Unknown | ✅ | Unknown | Pending G1.5 |
| `pipeline_stats` | 6 | ✅ | Unknown | ✅ | Unknown | Pending G1.5 |
| `performance_trends` | 6 | ✅ | Unknown | ✅ | Unknown | Pending G1.5 |
| `employee_analytics` | 5 | ✅ | Unknown | ✅ | Unknown | Pending G1.5 |
| `background_verifications` | 3 | ✅ | Unknown | ✅ | Unknown | Pending G1.5 |
| `employee_attrition` | 2 | ✅ | Unknown | ✅ | Unknown | Pending G1.5 |
| `complaints` | 1 | ✅ | ✅ (trigger) | ✅ | Unknown | Pending G1.5 |
| `executive_metrics` | 1 | ✅ | Unknown | ✅ | Unknown | Pending G1.5 |
| `projects` | 1 | ✅ | Unknown | ✅ | Unknown | Pending G1.5 |
| `employee_onboarding` | 0 | ✅ | Unknown | ✅ | Unknown | Pending G1.5 |
| `attendance` | 0 | ✅ | Unknown | ✅ | Unknown | Pending G1.5 |
| `leaves` | 0 | ✅ | Unknown | ✅ | Unknown | Pending G1.5 |
| `salary_revision_history` | 0 | ✅ | ❌ (insert fails) | ✅ | Unknown | Pending G1.5 |
| `payroll_history_records` | 0 | ✅ | Unknown | ✅ | Unknown | Pending G1.5 |
| `assessment_questions` | 0 | ✅ | Unknown | ✅ | Unknown | Pending G1.5 |
| `assessment_results` | 0 | ✅ | Unknown | ✅ | Unknown | Pending G1.5 |
| `resignations` | 0 | ✅ | Unknown | ✅ | Unknown | Pending G1.5 |
| `candidate_notifications` | 0 | ✅ | Unknown | ✅ | Unknown | Pending G1.5 |
| `chat_messages` | 0 | ✅ | Unknown | ✅ | Unknown | Pending G1.5 |
| `promotions` + 6 history tables | 0 | ✅ | Unknown | ✅ | Unknown | Pending G1.5 — **not Dead**; these naturally remain empty until a promotion/transfer is processed |
| `proctoring_logs` | 0 | ✅ | Unknown | ✅ | Unknown | Pending G1.5 |

### 5.3 RPCs (Live DB)

| RPC | Exists | Notes |
|-----|--------|-------|
| `get_enterprise_metrics` | ✅ | Returns JSONB with headcount, hires, leaves, complaints |
| `get_user_role` | ✅ | Returns text role for current user |
| All others (12+ defined in migrations) | ❌ | Not found in live `information_schema.routines` |

### 5.4 Triggers (Live DB)

| Trigger | Table | Exists | Notes |
|---------|-------|--------|-------|
| `notify_on_complaint` | complaints | ✅ | Creates notification on complaint INSERT |
| `prevent_self_role_change` | profiles | ❌ | Defined in migration #25, not applied |
| 10 audit triggers + `fn_audit_trigger` | various | ❌ | Defined in migration #22, not applied |
| `trg_complaints_audit` | complaints | ❌ | Part of audit trigger batch (#22) |
| Various status-sync triggers | various | ❌ | Defined in migrations #4-8, #18, not confirmed |

### 5.5 Database Extensions

> **Not probed**: Requires access to `pg_extension` system catalog. Likely includes `pgcrypto`, `uuid-ossp`, `pg_stat_statements`. Confirm with service_role key.

---

## 6. Schema Drift Summary (Migration vs Live)

| Category | In Migrations | In Live DB | Match? |
|----------|---------------|------------|--------|
| Tables | 52+ definitions | 36 accessible + 7 RLS-locked 🔒 | **Partial** — 18 tables unaccounted for |
| RPCs | 12+ | 2 | **Divergent** — 10+ missing |
| Triggers | 15+ | 1 confirmed | **Divergent** — 14+ unconfirmed |
| Columns | ~200+ across all migrations | ~150+ across live tables | **Partial** — 25 undocumented additions |
| Policies | ~100+ (estimated) | Unknown | **Unknown** — not fully probed |

---

## 7. Baseline Exclusions

The following were **not captured** in v1. They will be added in a subsequent baseline version once the required access is available:

- `pg_extension` list (requires service_role)
- `pg_stat_statements` query performance baseline (requires superuser)
- Storage bucket public/private status (requires service_role)
- Complete RLS policy dump (requires service_role)
- Complete trigger DDL export (requires service_role)
- Schema-only `pg_dump` (requires database connection string)
- `supabase_migrations.schema_migrations` table dump (requires service_role)

---

## 8. Baseline Certification

> **This baseline is FROZEN as of 2026-06-26.**
>
> All future audit phases (G1.5 through G11) must compare against this baseline.
> Any discrepancy between the live DB and this baseline should be treated as:
> 1. A schema change since baseline (new baseline version required), OR
> 2. An error in the baseline (correction + version bump required), OR
> 3. Evidence of unauthorized production change (incident).

---

## 9. Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| v1 | 2026-06-26 | G1 Audit | Initial baseline at G1 closure |
