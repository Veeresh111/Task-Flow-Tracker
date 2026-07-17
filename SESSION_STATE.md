# Session State — G1.5 Complete

## What Was Done This Session

### G1.5-E Recruitment RPC Verification — COMPLETE
All 11 function objects certified with 13-artifact evidence packages:
- `flowtracker/RPC_EVIDENCE.md` — full evidence register

### Evidence Corrections
- L5A → L4S downgrade for `get_enterprise_metrics` and `get_team_metrics` findings (no runtime execution in this session)

### Functions With No Current Call Sites
| Function | File | Evidence Searched |
|----------|------|-------------------|
| `sync_application_status` | `20260620001000_atomic_status_sync.sql` | Frontend, Edge Functions, triggers, cron, SQL references — zero invocations found |
| `sync_application_status_by_app_id` | `20260620001000_atomic_status_sync.sql` | Frontend, Edge Functions, triggers, cron, SQL references — zero invocations found |
| `auto_expire_job_forms` | `20260620005000_assessment_flow_fix.sql` | Frontend, Edge Functions, triggers, cron, SQL references — zero invocations found. Two versions exist with different logic. |

### Priority Findings This Session
| ID | Grade | Priority | Description |
|----|-------|----------|-------------|
| RPC-011-F2 | L4R | P1 | `auth.uid() IS NULL` path in `prevent_self_role_change` untested. Service role operations could silently bypass role-change restrictions. |
| RPC-002-F2 | L4S | P2 | `get_team_metrics.active_projects` counts ALL projects globally — no team filter column on `projects` table |
| RPC-003-F1 | L4S | P2 | `auto_expire_assessment_tokens` edge function has no scheduled trigger — never fires automatically |
| RPC-001-F1 | L4S | P3 | `hires_this_month` counts from `profiles.created_at`, not `candidate_onboarding` |

## Current G1.5 Status (Recruitment Workflow)

| Sub-step | Status | Evidence |
|----------|--------|----------|
| G1.5-A: Workflow Execution | ✅ Complete | `recruitment_workflow_evidence.json` (30 steps) |
| G1.5-B: Schema Verification | ✅ Complete | DB_INTEGRITY_AUDIT.md |
| G1.5-C: Migration Audit | ✅ Complete | DB_INTEGRITY_AUDIT.md |
| G1.5-D: Trigger Verification | ✅ Complete | `recruitment_triggers_evidence.json` (6 triggers tested) |
| **G1.5-E: RPC Verification** | **✅ Complete** | **RPC_EVIDENCE.md (11 evidence packages)** |
| G1.5-F: RLS Matrix | ⬜ Pending | Recruiter + Anonymous roles not created |
| G1.5-G: AI Provenance | ⬜ Pending | AI model not yet read (prerequisite: G7) |
| G1.5-H: Notification Audit | ⬜ Pending | Not started |
| G1.5-I: Automation Audit | ⬜ Pending | Not started |
| G1.5-J: Enterprise Lifecycle | ⬜ Pending | Not started |

## Next Session Start Point
Pick up at G1.5-F (RLS Matrix) — requires creating Recruiter and Anonymous auth users, then testing 6 roles × 10 tables × 4 operations.

## Project State for Placement/Hackathon

### What's Working
- All 6 portals: Admin, HR, Team Lead, Employee, Candidate, AI
- Authentication, RLS, role-based access
- Recruitment lifecycle: job post → apply → assess → interview → offer → onboard
- Payroll with 3 role-specific formulas
- Attendance, tasks, projects, complaints, leaves
- AI Assistant + AI Insights (Qwen3 via Groq)
- Chat, notifications, analytics
- Enterprise metrics RPC (`get_enterprise_metrics`, `get_team_metrics`)

### What Needs Attention Before Demo
1. **Remove fake data** from dashboards (heuristic ratings, fabricated revenue)
2. **Certify Recruitment** (G1.5 gate: 10 sub-steps, 4 complete)
3. **Certify Payroll** (highest-risk workflow)
4. **Apply pending migrations** (22 of 29 not applied)
5. **Fix P0 findings** (SEC-01, SEC-02 — RLS gaps)
6. **Deploy** and record demo video

### Deployment Info
- **Supabase**: `https://txwxtsdsbuddqfrtllsf.supabase.co`
- **Admin**: `prakashmulge912@gmail.com` / `changeme`
- **HR**: `jack@email.com` / `changeme`
- **Live DB**: 514 profiles, 64 job forms, 50 candidates, 50 job applications
