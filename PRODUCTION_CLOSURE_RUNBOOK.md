# Production Closure Runbook

> Scope: **only** the three external gates remaining after session 11 (checkpoint: `docs/GLM_SESSION_STATE.md`). Application code and database are production-hardened and proven — **do NOT re-audit or redesign business logic**. This file is the checklist for closing the gates, then running the final production smoke test.

## Current classification

**CONDITIONALLY READY**

| Area | Status |
|---|---|
| Database / business logic, RLS, leave, offers, recruitment, assessment/proctoring, payroll, FnF, browser E2E, ₹0 ceiling | ✅ PROVEN (live probes + Playwright) |
| Supabase Edge Function deployment | 🔴 BLOCKED (mgmt API 401 — access token invalid) |
| Email delivery (Resend) | 🔴 BLOCKED (`flowtracker.hr` domain not verified) |
| Frontend production deployment | 🔴 BLOCKED (no Vercel link; never deployed) |

Status stays **CONDITIONALLY READY** until all three 🔴 are green, then the smoke list in Step 4 runs against the real production URL.

## Step 1 — Edge Function deployment (Supabase)

**Blocker:** `SUPABASE_ACCESS_TOKEN` in `.env.local` is invalid/expired — management API returns 401 (`GET /v1/projects`, functions list, CLI `projects list` all Unauthorized). DB push still works (DB-password auth).

**External action (human, Supabase dashboard):**
1. Supabase dashboard → Account → Access Tokens → generate a new personal access token (`sbp_…`).
2. Replace `SUPABASE_ACCESS_TOKEN` in `.env.local` (never print the secret or commit it).

**Then (agent-runnable once token is fresh):**

```bash
cd Task-Flow-Tracker-hackathon/flowtracker
npx supabase functions deploy grade-assessment --project-ref txwxtsdsbuddqfrtllsf
npx supabase functions deploy ats-screen --project-ref txwxtsdsbuddqfrtllsf
```

**Deploy succeeded when:** exit code 0, no error text, and `npx supabase functions list --project-ref txwxtsdsbuddqfrtllsf` shows both functions with an advanced `updated_at`/version.

Notes:
- The deployed `grade-assessment` is already lifecycle-safe via migration `20260927000002` (max_attempts=0 default); deploying the corrected local source (counts only COMPLETED attempts) is **parity hygiene**.
- `ats-screen` is a **dead path** (zero UI callers). Deploy it so its labels match the canonical `'ai' | 'rule_based'` CHECK; if it still emits legacy labels after redeploy, decommission instead of patching (prior decision stands).

**Verification after deploy (live probes):**

```bash
node scripts/full-lifecycle-probe.mjs    # 51/51 required — re-proves grading + ATS stages end-to-end
node scripts/rls-matrix-probe.mjs        # 25/25 required — confirms no RLS regression
```

Gate 1 = ✅ when both probe suites pass unchanged.

## Step 2 — Email delivery (Gmail sender via Brevo free tier)

**Blocker (superseded):** Resend required verifying `flowtracker.hr`, which the project does not own. **Decision (2026-09-29):** transport migrated to Brevo's free-tier HTTP API (300/day, no credit card), sending from the operator's Gmail address as the verified sender. Supabase Edge Functions cannot use raw SMTP (outbound SMTP ports are blocked at the network layer — supabase/supabase#6255), so the Gmail App Password/SMTP route is architecturally impossible from the Edge runtime. `send-email` now selects the provider server-side: `BREVO_API_KEY` present → Brevo; `RESEND_API_KEY` present → legacy rollback. Queue/cron/worker/leasing/idempotency are unchanged.

**External action (human):**
1. Create a free Brevo account (no card) → SMTP & API → generate an API key.
2. Senders & IP → add the Gmail address as a verified sender (confirmation mail to that inbox).
3. Configure server-side secrets (never `VITE_*`, never chat/commits):
   ```bash
   npx supabase secrets set BREVO_API_KEY=<key> EMAIL_FROM="AI HRMS <your-address@gmail.com>" --project-ref txwxtsdsbuddqfrtllsf
   ```
   Any previously shared App Password is compromised — it is unused by this path; revoke it in Google Account → Security.
4. Optional guard: `EMAIL_DAILY_SAFETY_LIMIT` (default 80) — an application-level cap, not a provider guarantee.

**Then (agent-runnable once secrets are set):** deploy the migrated function, then one controlled send:

```bash
npx supabase functions deploy send-email --project-ref txwxtsdsbuddqfrtllsf
```

```sql
-- pick one failed row for a controlled real send
SELECT id, recipient_email, subject FROM pending_emails WHERE status='failed' ORDER BY created_at DESC LIMIT 5;
UPDATE pending_emails SET status='pending', attempts=0 WHERE id = <one id from above>;
```

Wait ≤2 min for the email cron job (proven running every 2 min), then verify:

```sql
SELECT status, provider_message_id, error_message FROM pending_emails WHERE id = <same id>;
```

**Gate 2 = ✅ only when ALL three hold:**
1. `status='sent'`
2. non-null `provider_message_id` (Brevo accepted it)
3. a **real inbox** actually received the message

Until a real mailbox receives mail, delivery is NOT proven. Do not mass-send the backlog as a test.

## Step 3 — Frontend production deployment (Vercel)

**Blocker:** `vercel.json` exists (vite build + SPA rewrites) but there is **no `.vercel` link** — never deployed. Not a code defect.

**External action (human):**
1. Import the repo into Vercel (root directory: `Task-Flow-Tracker-hackathon/flowtracker`, framework: Vite) or run `vercel link` locally.
2. Set Production env vars (client-side, public by design):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - Nothing else — `VITE_HF_TOKEN` is intentionally unset; no secret ships in the bundle.
3. First production deploy → obtain the production URL.

**Verification (agent-runnable once deployed):** production URL loads over HTTPS with no console errors; anon users hitting protected routes hit the auth wall.

## Step 4 — Final production smoke test (ONLY after Steps 1–3)

Run against the real production URL. Evidence must be real — no fake success.

### A. Machine probes (from repo, target live project)

```bash
node scripts/full-lifecycle-probe.mjs    # 51/51
node scripts/leave-policy-probe.mjs      # 10/10
node scripts/offer-rpc-probe.mjs         # 9/9
node scripts/rls-matrix-probe.mjs        # 25/25
```

### B. Browser smoke (16 items)

1. Production URL loads over HTTPS, no console errors.
2. Anon access to protected route → redirected to auth (auth wall).
3. HR login (jack@email.com / jack123) works in production.
4. HR pipeline board reflects candidate states (T1 path).
5. Create Offer dialog → RPC → DB → pipeline reflects (T4 path).
6. Candidate self-accept via public offer link.
7. Exam handshake → submit → graded (token single-use enforced).
8. Proctoring: face enrollment binds to exam token; forged second enrollment refused.
9. Clock-in → work_log row → reload → Clock Out (T2 path).
10. Leave UI submit → HR approvals UI → Approved reflection (T3 path).
11. Employee sees only own payslip (RLS through UI).
12. Notification mark-as-read persists across reload.
13. Messaging round-trip HR↔candidate end-to-end in UI.
14. Dark-mode contrast on HR routes renders correctly.
15. Activation/HR email arrives in a real inbox (closes with Gate 2).
16. Zero fixture residue after smoke: probe rows purged (patterns: `E2E_TEST_2026*`, `E2E_FULL_LIFECYCLE_*`, `E2E_RLS_MATRIX*`, `E2E_LEAVETEST*`, `E2E_OFFERRPC*`, `E2E_BROWSER_LC*`).

Items 4–6 and 9–10 are already browser-proven locally (T1–T4); in production they re-run as smoke, not new audits.

## Guardrails

- Never edit applied migrations (`20260926000003…20260927000008`); ship fixes as **new** migrations.
- Never print secrets from `.env.local`.
- After each gate closes, verify **only** with the corresponding probe/smoke steps above — no re-audit, no redesign of proven business logic.
