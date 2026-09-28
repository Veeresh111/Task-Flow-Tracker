# GLM SESSION STATE — resumption checkpoint (read me first)

Last updated: 2026-09-29 (session 12b — owner authorized Brevo; explicit provider
selector + real daily-limit enforcement; new sbp_ token AUTH PASSES but org
403 on txwxtsdsbuddqfrtllsf — deploy still pending correct account)

## SESSION 12 — EMAIL TRANSPORT MIGRATION (Gate B path change)
- PRODUCT DECISION (owner-confirmed): replace Resend with **Brevo free-tier
  HTTP API** (300/day, no credit card), sender = operator's Gmail address as
  verified sender. Root cause of Resend block: project does not own
  flowtracker.hr. SMTP route ruled out: Supabase Edge Functions block outbound
  SMTP ports (supabase/supabase#6255) — App Password/SMTP is architecturally
  impossible from the Edge runtime (phase-0 inspection + web verification).
- CHANGE (single file): supabase/functions/send-email/index.ts — provider
  abstraction added; server-side selection by configured secret (BREVO_API_KEY
  preferred, RESEND_API_KEY = legacy rollback, unchanged Resend code path).
  Queue/leasing/backoff/idempotency/auth (EV-EMAIL-401) byte-preserved.
  Brevo message-id from data.messageId; sender from EMAIL_FROM (parsed).
  NO daily-limit enforcement code shipped — EMAIL_DAILY_SAFETY_LIMIT is
  documented operator guidance only (honesty: not a Google guarantee, not yet
  enforced).
- SUPPORT: .env.example created (placeholders only); .gitignore `!.env.example`
  negation added; PRODUCTION_CLOSURE_RUNBOOK.md Gate B section rewritten to
  the Brevo path incl. secrets command + single controlled-send verification.
- SECURITY: App Password shared in chat = treated as compromised, never used,
  must be revoked. All provider secrets stay Edge Function secrets (never
  VITE_*). Nothing secret printed in logs/docs/tests.
- DEPLOY STATUS (12b): NOT deployed. New sbp_ token (provided in chat — treat
  as sensitive, rotate post-handoff) AUTHENTICATES (projects list 200) but the
  account lacks membership in the org owning txwxtsdsbuddqfrtllsf → functions
  list = 403. Human must either invite that account to the org (owner/developer
  role) or generate a token under an account that IS a member.
- HARDENING (12b, owner-authorized): EMAIL_PROVIDER selector is now EXPLICIT
  (brevo|resend; missing/invalid/under-configured = hard 500, no silent
  fallback). Daily safety limit REALLY ENFORCED on queue path: pre-claim count
  of sent rows since UTC midnight vs EMAIL_DAILY_SAFETY_LIMIT; at cap →
  limit_reached:true, rows stay 'pending' (never deleted/marked sent); count
  error fails closed. Direct sends (JWT operator one-offs) outside cap.
- VERCEL (Gate C signal): project aihrms_platform exists
  (vercel.com/veeresh111s-projects/aihrms_platform); claimed deployment URL
  aihrmsplatform-pqaggqn2b-veeresh111s-projects.vercel.app — NOT yet verified
  this session (pending curl checks: reachable, serves this app, correct
  Supabase project, no secret exposure).
- GATE B (owner-selected: Brevo free tier). Remaining human steps: Brevo
  account + verified Gmail sender + `npx supabase secrets set EMAIL_PROVIDER
  =brevo BREVO_API_KEY=… EMAIL_FROM=… --project-ref txwxtsdsbuddqfrtllsf`
  (key NEVER in chat) + deploy send-email + ONE controlled send proving
  sent+provider_message_id+mailbox receipt. Resend rollback = flip selector.

## SESSION 11 — CLOSURE STATE
PRODUCT DECISIONS (owner-confirmed):
- LEAVE POLICY = C (HR override). Implemented migration 20260927000005
  (+20260927000006 audit-table fix: live table is audit_logs, NOT admin_audit_logs):
  per-user advisory lock (no concurrent-balance race), explicit override row
  (action=LEAVE_OVERDRAFT_OVERRIDE). Probe scripts/leave-policy-probe.mjs 10/10:
  sufficient/insufficient/boundary/duplicate/reversal/concurrent-chain/override-audit/RLS.
- OFFER CREATION = A. create_offer_for_application RPC (20260927000007 + grant
  scope 20260927000008: authenticated-only) — server derives identity, validates
  state/CTC/date, creates Pending Approval, syncs pipeline via authoritative GUC,
  audits OFFER_CREATED. Minimal UI: Create Offer dialog in OfferManagement.tsx.
  Probe scripts/offer-rpc-probe.mjs 9/9. Browser T4 proves UI→RPC→DB→UI.
- CLEANUP: dead functions mark-read/expire-tokens/generate-payslip-pdf removed
  (local dirs + config.toml). Truthfulness fix: assistant no longer claims PDF
  payslips (CSV is real).
- ATS local source now canonical ('ai'/'rule_based') — DEPLOYED copy still old
  (deployment BLOCKED: mgmt API 401). grade-assessment local correction also
  undeployed. DATABASE = fully applied (20260927000001..08 live).
- RLS matrix probe scripts/rls-matrix-probe.mjs 25/25 (anon/candA/candB/empA/
  empB/hr/admin), residue 0.
- FULL SUITE: 27 tests → 26 passed / 1 gated skip (media gen; proven separately).
  tsc 0, build 0, 448 unit. Browser lifecycle 4/4 incl. Create Offer T4.
- REMAINING EXTERNAL BLOCKERS: Gate A = org-membership 403 on project token
  (human: org invite or member-account token); Gate B = Brevo sender/secrets
  + controlled-send proof; Gate C = Vercel production URL verification.
- CLOSURE RUNBOOK: PRODUCTION_CLOSURE_RUNBOOK.md (repo root) documents the
  three external gates + exact post-action verification commands + the
  16-item production smoke list. Final classification: CONDITIONALLY READY.
  After each gate closes, verify with the matching probe/smoke steps only —
  no re-audit, no redesign of proven business logic.

## SESSION 10 BLOCK

## SESSION 10 — GATE STATUS (surgical pass, no redesign)
- GATE 1 EMAIL: BLOCKED OUTSIDE CODE — Resend 403 'flowtracker.hr domain not
  verified'. Queue/scheduler/worker/provider-call all proven; delivery NOT
  PROVEN until domain verified + controlled send (provider_message_id + inbox).
- GATE 2 EDGE DEPLOY: BLOCKED OUTSIDE ENV — mgmt API 401 + no Docker/WSL.
  Local grade-assessment source corrected (completed-attempts counting); the
  DEPLOYED copy is stale but passed the lifecycle path after migrations
  20260927000001-4. ats-screen: DEAD PATH (zero UI callers) + vocabulary
  mismatch with candidates_evaluation_method_check ('ai'|'rule_based') —
  redeploy-with-canonical-labels OR formally decommission.
- GATE 3 BROWSER LIFECYCLE: DONE — tests/e2e/browser-lifecycle.spec.ts 3/3:
  T1 HR pipeline UI reflects live candidate row (via Candidate Tracking Board
  tab); T2 UI clock-in (header WFO)→Active work_log→reload reflection→clock-out
  →no dangling shift; T3 leave UI submit→Pending→HR approvals UI shows→approve
  via UI→employee UI reflects Approved. Zero residue, window open/close clean.
- DEFECT #6 FIXED: CandidatePipeline.tsx missing `Users` import — the HR
  Candidate Tracking Board crashed ('Application failed to render: Users is
  not defined') for real users. One-line import fix, browser-proven.
- PDF TRUTH: zero UI callers of pdf_url/generate-payslip-pdf → decommission
  candidate (no user-facing breakage).
- VITE_HF_TOKEN: NOT SET in .env.local → no AI secret ships in the client
  bundle (Tier 2 HF uses optional user-supplied localStorage token only).
- PENDING DECISIONS (need product owner, NOT code): leave-overdraft policy
  (A deny / B capped-negative / C HR-override / D per-leave-type); offer
  creation first-class UI (currently DB-authorized insert only).
- FULL SUITE (session 10): 21 passed / 5 skipped (media-gen gate + 4 employee-
  window tests; each passed in dedicated runs) / 0 failed. tsc 0, build 0,
  448/448 unit.

## SESSION 9 BLOCK (full lifecycle 51/51)

## SESSION 9 — FULL CANDIDATE→EMPLOYEE LIFECYCLE: 51/51 PASS (scripts/full-lifecycle-probe.mjs)
One tagged fixture driven through REAL application paths end-to-end: application →
ATS (multi-tier AI chain, truthful method persisted) → prompt-injection resisted →
HR shortlist → assessment (UI insert) → HR token RPC → exam handshake/attempt →
grade-assessment edge fn (200, persisted, token→attempt binding) → pipeline advance
(Assessment Completed→Interview→Offer Generated) → offer (state machine approve/send)
→ candidate SELF-ACCEPT via RPC → pipeline 'Offer Accepted' → hire-candidate edge fn
(hiring-op state machine completed) → activation via real token from queued email →
same auth identity → clock-in/out → leave+HR approval → ledger consumed (-2.00) →
payroll 10/2026 (cron-equiv) → payslip (gross 150000/net 134666.67, RLS-visible,
idempotent) → resignation → FnF → offboarded → stale-JWT (own history only, no staff
reads, no cross-employee enumeration) → IDOR (candidate B blocked from A's offer:
RPC denied + zero rows; anon zero rows) → identity-continuity single query all 1s.
CLEANUP VERIFIED zero residue (incl. probe-created 10/2026 cycle).

### SESSION 9 FIXES (all deployed live)
- 20260927000001: assessments grants restored for authenticated (RLS kept; the real
  HR UI insert path was 42501-dead).
- 20260927000002: assessments.max_attempts default 0 + rows updated — the DEPLOYED
  grader counts in-flight attempts, so max_attempts=1 rejected EVERY first submission
  (zero graded attempts existed live). Token single-use = real authority. Local
  grade-assessment source fixed to count only COMPLETED attempts (deploy pending).
- 20260927000003: assessment_attempts +violations/selections/ai_feedback/
  application_id/token_id (grader 500'd writing ai_feedback).
- 20260927000004: guard_job_application_status_authority now trusts
  app.authoritative_transition GUC for authenticated callers too — candidate
  self-acceptance previously rolled back with EV-RBAC-102 (GUC is unforgeable).
- AssessmentAccess.tsx: grade-assessment + proctor-ai fetches now send anon-key
  Bearer (deployed functions require VERIFY_JWT header; UI previously sent none →
  exam submission 401).
- AI TRUTH: server edge path (ats-screen) = REAL HF Qwen inference, method
  ai_llm_qwen3 (proven live, score 92); BUT its method strings violate the
  candidates_evaluation_method_check CHECK ('ai'|'rule_based') → ats-screen is NOT
  in the UI path (dead, deployed). Real UI path = client-side multi-tier
  (Pollinations → HF router w/ VITE_HF_TOKEN → ai-proxy → VectorMath), truthful
  'ai'|'rule_based' labels; probe ran deterministic tier (78, Hire) without token.
- EMAIL TRUTH: provider IS called; Resend 403 'flowtracker.hr domain is not
  verified' — delivery NOT PROVEN (DNS/domain verification outside code); queue
  correctly marks failed, no fake sent.

## SESSION 8 BLOCK (unchanged facts)

## SESSION 8 RESULTS (all live-verified on project txwxtsdsbuddqfrtllsf)
- DEPENDENCY RECOVERY: reverted npm-audit-fix drift (vite 8→5, vitest 5→3,
  react-router-dom 7→6, face-api.js 0.20→0.22.2); KEPT onnxruntime-web + pg.
  Baseline: tsc 0, build 0, 448 unit tests pass.
- FIX: jack@email.com auth hash had been clobbered by earlier probe cleanup —
  repaired with crypt('jack123', gen_salt('bf',10)); GoTrue 200 verified.
- FIX: playwright.config.ts top-level timeout 90s (was default 30s; cold dev
  server boot blew the first tests' budget). NEVER put test timeout in use:{}.
- live-truth 5/5, dashboard-stability 2/2, rbac-security 3/3 (rewritten to
  real probe identities), offboarding 3/3 (rewritten), time-travel 4/4
  (rewritten), proctoring-cv 5/5 WITH REAL FACE MEDIA.
- FULL PLAYWRIGHT SUITE: 22 passed / 1 skipped (media generator, gated by
  E2E_GEN_MEDIA=1; run explicitly and it passes).
- MIGRATION 20260926000003 DEPLOYED (scheduler RPC privilege lockdown):
  EXECUTE revoked from PUBLIC/anon/authenticated on auto_process_monthly_
  payroll_idempotent, accrue_monthly_leaves_and_anniversaries,
  flag_daily_absentees, process_fiscal_year_reset; service_role granted.
  Live-proof before: anon RPC returned success:true. After: 401/42501.
- MIGRATION 20260926000004 DEPLOYED (anniversary grant fix): column typo
  `v_month`→`month` in anniversary INSERT + per-employee exception isolation
  (previously ANY anniversary employee aborted the WHOLE monthly accrual run).
  Live-proven: probe joined 2025-09-01 got +1.5 accrual AND +2.0 grant.
- PROCTORING CHAIN PROVEN (real Chrome fake camera + real y4m face media):
  stream attached → UI 'Face verified' → enrollment bound to token's candidate
  → forged 2nd enrollment refused (already_enrolled:true) → bogus token 404 →
  legacy RPCs permission-denied → forged liveness EV-TOKEN-404.
- NEW helpers: tests/e2e/helpers/probe-user.ts (tagged probe identities via
  auth.users+identities+profile-update pattern; provider_id=email);
  scripts/cleanup_e2e_pair.cjs (dynamic FK-graph purge of E2E_TEST_2026* —
  VERIFIED zero residue; handles 11 FK child tables).
- Fixture hygiene: 18 accumulated E2E_TEST candidates + 89 dependent rows
  purged; employee password windows open/close verified (window_closed:false).
- CRON EVIDENCE: 6 active jobs; email-queue job SUCCEEDED every 2min in
  cron.job_run_details. Payroll/accrual run 1st of month as postgres.
- FnF live semantics (test asserts): status='inactive' + employment_status=
  'offboarded'; ledger history INTACT (no zeroing — old test assertion was fake);
  math 66,666.67/19,726.03/16,666.67/69,726.03 for the 1.2M fixture.
- leave_ledgers RLS: self OR is_admin_or_hr() OR is_manager_of(user_id) —
  stale session sees exactly its own rows (asserted = own count).
- payroll_cycles_select_released: status='released' cycles are public-by-policy.

## LEGACY SESSION 7 FACTS (still true)

## LIVE VERIFIED (live project txwxtsdsbuddqfrtllsf) — session 7 block
- Migration 20260926000001 deployed+verified (evaluation_method column; previous-month
  cron command; transition_payroll_status credited semantics in live function body)
- Migration 20260926000002 deployed+verified (candidate_hr_messages sender-integrity
  trigger) — closed a LIVE-FOUND spoofing hole: candidate could forge sender_id=HR
- Live API E2E scripts/live-e2e-verification.mjs: 16/16 PASS
- STALE-JWT probe scripts/stale-jwt-probe.mjs: PASSING, repeatable, no residue
  (pre-termination HR JWT loses ALL staff reads: cycles/payslips/tasks 0, user_has_role false)
- Messaging round-trip scripts/messaging-roundtrip-probe.mjs: 11/11 PASS
  (HR send → candidate read → candidate reply → HR read exact reply → IDOR read blocked
   → IDOR cross-write blocked → ANTI-SPOOF blocked (new trigger) → survives re-login → cleanup)
- Employee payslip/work-log isolation: 4 own / 0 foreign (live)
- Payroll RPC idempotency: EV-PAY-002 rejection on existing cycle (live)
- Edge functions live-probed: 9 deployed+guarding (400/401); 3 → 404:
  mark-read, expire-tokens, generate-payslip-pdf
- Browser E2E tests/e2e/live-truth.spec.ts: 5/5 PASS (HR login+refresh, dark-mode
  computed-contrast sweep on 3 HR routes, employee payslip UI isolation, empty states, anon auth wall)

## KEY ENVIRONMENT FACTS (do not re-derive)
- E2E password windows: UPDATE auth.users SET encrypted_password =
  crypt(pw, gen_salt('bf',10)); CLOSE with random valid hash. Never crypt(pw, uuid-text).
- auth.users sign-in requirements: role='authenticated', token columns '' not NULL,
  matching auth.identities row (email_verified true)
- profiles.role CHECK: admin|team_lead|employee|hr|candidate|archived (offboarding='archived')
- set_config('request.jwt.claims',...,false) in autocommit scripts; true only in transactions
- Supabase access token (sbp_...): valid for db push/pg; management API (functions
  deploy/list, projects list) returns 401 — scope missing
- Docker Desktop cannot start: WSL not installed; wsl --install requires admin elevation
  → EDGE FUNCTION DEPLOY BLOCKED in this environment
- Frontend calls ONLY these edge functions: ai-proxy, ats-screen, grade-assessment,
  proctor-ai (all deployed). mark-read/expire-tokens/generate-payslip-pdf are NOT called
  by the frontend (notifications mark-as-read goes direct to table via
  notificationService.markAsRead → notifications/candidate_notifications update).
  PAYROLL/HR pages use direct table/RPC paths.

## DECISIONS
- 3 undeployed functions: frontend never calls them → deployment optional; deletion
  candidate for dead-code cleanup rather than deployment (avoid deploy risk for dead code)
- rbac-security.spec.ts test 1 uses fake fixture UUIDs that don't exist → will rewrite
  to real-identity probes; tests 2-3 (anon probes) already pass

## NEXT EXACT ACTIONS (priority order)
1. Assessment chain live probe: find active assessment+token for a candidate session;
   verify get_assessment RPC, submit, grade path. If no live token exists, mint via HR
   RPC (hr_token_issuance) for an application in Assessment Assigned state.
2. Rewrite tests/e2e/rbac-security.spec.ts: replace fixture UUIDs with real-identity
   probes (or delete test 1; keep anon probes; point to live scripts as canonical).
3. Candidate-role dark-mode Playwright sweep + mobile viewport sweep.
4. Optional: realtime notification proof (subscribe → insert → observe).
5. Final regression: tsc, npm test, npm run build, playwright live-truth spec.

## Test results this session
- tsc --noEmit: clean; npm test: 448 pass/0 fail (session 6 baseline, src unchanged since)
- Live API E2E: 16/16; stale-JWT: PASS; messaging: 11/11; browser: 5/5
- rbac-security.spec.ts: 2 pass / 1 fail (stale fixtures — fix queued)
