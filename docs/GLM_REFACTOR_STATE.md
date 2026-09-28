# GLM REFACTOR STATE — resumption file (read me first)

Last updated: 2026-09-26 (session 3)

## Completed (previous sessions, verified by tests)
- Truthful AI layer: `src/lib/ai-models.ts`, `src/lib/ai.ts`, `src/lib/telemetry.ts`
  - Offline path returns `AI_UNAVAILABLE` / explicit "AI Offline" text. No fabricated scores.
- ATS evaluation-method labeling: `src/pages/hr/recruitment/ATSScanner.tsx`
  - Per-row `evaluationMethod: 'ai' | 'rule_based'`, persisted to `candidates.evaluation_method`, shown in UI.
- Payroll credit convention migration CREATED (not yet deployed):
  - `supabase/migrations/20260926000001_ats_evaluation_method_and_payroll_credit_convention.sql`
  - Contents: `candidates.evaluation_method` column; cron reschedule to PREVIOUS month;
    `transition_payroll_status` marks payslips `credited` on release.
- HR/employee payroll UI wording: "Salary Credited (Released)" / generate targets previous month.
- Employee dashboard: today's attendance card from real `work_logs` row; honest empty state.
- Dark mode: removed `--muted-foreground` hijack; graded gray text scale (WCAG AA); unified heading color.
- Tests: `src/test/unit/ai-free-models.test.ts` rewritten to enforce truthful offline contract.
- Verified locally: `tsc --noEmit` clean; `npm run build` OK; `npm test` 448 passed / 0 failed.

## In progress
- Live deployment of migration 20260926000001 (access token + project ref found in .env.local).

## Verified (local only)
- Typecheck, build, 448 unit/integration tests.

## Not verified
- Live DB schema (candidates.evaluation_method), live cron job command, live function bodies.
- Browser E2E (Playwright flows), dark-mode browser sweep, IDOR probes.

## Blocked
- None currently — Supabase access token present in .env.local (previous session's claim of no access was wrong).

## Next exact action
1. `npx supabase migration list` against SUPABASE_PROJECT_REF → check if 20260926000001 applied.
2. If missing: `npx supabase db push` → then query live schema to VERIFY (not just push).
3. Then Playwright E2E: candidate/HR/employee/payroll/theme/security flows.

## Files changed (session 2)
- src/lib/ai-models.ts, src/lib/ai.ts, src/lib/telemetry.ts
- src/pages/hr/recruitment/ATSScanner.tsx, src/pages/hr/Payroll.tsx, src/pages/employee/Payroll.tsx
- src/pages/employee/Dashboard.tsx, src/pages/employee/WorkLogs.tsx
- src/index.css
- src/test/unit/ai-free-models.test.ts
- supabase/migrations/20260926000001_ats_evaluation_method_and_payroll_credit_convention.sql (NEW)

## Migrations created vs deployed
- Created: 20260926000001 — Deployed: NO (verify then push)

## Tests run
- npm test → 448 passed | 11 skipped | 0 failed (last full run)
