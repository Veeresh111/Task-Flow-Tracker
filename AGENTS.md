# AGENTS.md — Progress Log

## Goal
Enterprise-grade HRMS/ATS with role security, identity verification, assessment proctoring, and full recruitment lifecycle automation.

## Pipeline Status: ✅ ALL PASSING
| Check | Result |
|---|---|
| `npx playwright test src/test/ --reporter=list` | **125 passed** (85 original + 29 business-workflow + 1 lifecycle + 10 enterprise) |
| `npm run build` | passes |
| `npm run lint` | 0 errors |

## Implemented Phases

### Phase 1: Role Security Hardening ✅
- **Register.tsx**: Removed role selector — only shows "Candidate / Applicant" info box. No way to self-select HR/Admin/Employee roles.
- **auth.ts**: Hard-rejects any non-candidate signup role. Always forces `role: 'candidate'` in profile insert.
- **types/index.ts**: Fixed `UserRole` type to include `'hr' | 'candidate' | 'payroll' | 'manager'`.
- **Employee Invite Page** (`/hr/EmployeeInvite.tsx`): HR/Admin can create employee invitation profiles with role/department.
- **Employee Activation Page** (`/public/EmployeeActivation.tsx`): Invited employees can check their invitation status and get instructions to activate.
- **Routes added**: `/employee-activation`, `/admin/employee-invite`, `/hr/employee-invite`

### Phase 2: Candidate Identity Enrollment ✅
- **IdentityEnrollment component** (`/components/identity/IdentityEnrollment.tsx`): Webcam capture + photo upload for identity verification.
- **Candidate Identity Page** (`/candidate/Identity.tsx`): Dedicated page in candidate dashboard for identity enrollment.
- Stores photo in `profiles.avatar_url` column.
- Shows status: enrolled (green) or not enrolled (amber warning).
- **Route added**: `/candidate/identity`

### Phase 4: Assessment Proctoring (In-Browser) ✅
- **useProctoring hook** (`/hooks/useProctoring.ts`): Real-time detection of:
  - Tab switching (visibilitychange API)
  - Window blur/focus loss
  - Copy/paste prevention
  - Right-click prevention
  - Full-screen exit detection
  - DevTools shortcut prevention
- Violation engine: warning counting with flagging at threshold-2 and auto-disqualify at threshold.
- Logs to `proctoring_logs` table (table may not exist in live DB — graceful error handling).

### Phase 11: Enterprise Tests ✅
- **10 tests** in `src/test/e2e/enterprise-features.spec.ts`:
  - Register page only allows candidate role
  - Registration flow creates candidate-only profiles
  - Employee activation page loads
  - Employee invitation page loads (admin)
  - Identity enrollment page loads (candidate)
  - New routes resolve (not blank)
  - Proctoring prevents copy/paste/right-click
  - Auth service rejects non-candidate signup
  - Admin-created employee invitation

## Critical Security Finding: RLS Self-Role-Change Bypass

**Severity**: CRITICAL — Confirmed by automated test

**Issue**: The RLS policy `users_update_own_profile` does NOT prevent self-role elevation. Any authenticated user can call:
```js
supabase.from('profiles').update({ role: 'admin' }).eq('id', user.id)
```
and it succeeds, elevating their role from `candidate` to `admin`.

**Expected behavior** (from migration `20260619232721`):
```sql
WITH CHECK (auth.uid() = id AND role IS NOT DISTINCT FROM public.get_user_role())
```
Should reject any update where the new role differs from the current role.

**Actual behavior**: The check passes regardless — `'admin' IS NOT DISTINCT FROM 'candidate'` evaluates to true in the RLS context.

**Mitigation (in place)**:
- Application-level: `authService.signUp()` always forces `role: 'candidate'`
- Register page shows no role selector

**Required fix** (needs service_role or Supabase dashboard SQL access):
Fix the RLS function or use a different approach (e.g., trigger-based audit, application-level middleware)

## Phase 3: Face Verification ✅
- **useFaceVerification hook** (`/hooks/useFaceVerification.ts`): face-api.js integration for:
  - Face detection during identity enrollment (live feedback in webcam preview)
  - Face descriptor extraction and storage in localStorage
  - Face matching at assessment entry (compares live face to enrolled descriptor)
  - Periodic face re-verification every 30s during assessment
  - Graceful degradation if face-api.js models fail to load (CDN)
- IdentityEnrollment updated to show face detection confidence score
- AssessmentAccess.tsx updated: face check before exam entry + periodic re-checks

## Phase 5: Jitsi Meet Integration ✅
- **JitsiMeetRoom component** (`/components/interview/JitsiMeetRoom.tsx`): Vanilla Jitsi External API integration
  - Embeds Jitsi Meet iframe directly in interview page
  - Configures audio muting, toolbar, interface (no watermark)
  - Uses `meet.jit.si` domain; room name sanitized from meeting_link
  - Shows loading spinner while connecting
- CandidateInterviews.tsx updated:
  - Jitsi links detected automatically (contains `meet.jit.si` or `jitsi`)
  - Opens embedded modal instead of new tab
  - Fullscreen overlay with video controls
  - `onLeave` callback cleans up on close
  - Non-Jitsi links still open in new tab (backward compatible)

## Application-Level RLS Mitigation ✅
- **auth.ts**: `verifyAndResetRole()` function — if `user_metadata.registered_role` != `profiles.role` and role is elevated, auto-resets to `candidate`
- **ProtectedRoute.tsx**: Second line of defense — re-verifies role on every route navigation
- Logs security events and creates notifications on role reset

## Known Issues (Unchanged)
1. `resumes` storage bucket doesn't exist in live Supabase
2. `offer_letters` insert blocked by broken trigger
3. `candidate_onboarding` FK mismatch (22 unapplied migrations)
4. `proctoring_logs` table doesn't exist in live DB

## New Files
| File | Purpose |
|---|---|
| `src/pages/auth/Register.tsx` | Rewritten — candidate-only registration, no role selector |
| `src/lib/auth.ts` | Hardened — rejects non-candidate signup roles + application-level role verification |
| `src/types/index.ts` | Fixed UserRole type |
| `src/pages/hr/EmployeeInvite.tsx` | HR employee invitation page |
| `src/pages/public/EmployeeActivation.tsx` | Employee activation/check page |
| `src/pages/candidate/Identity.tsx` | Candidate identity enrollment page |
| `src/components/identity/IdentityEnrollment.tsx` | Webcam/photo capture + face-api.js face detection integration |
| `src/hooks/useProctoring.ts` | In-browser assessment proctoring hook |
| `src/hooks/useFaceVerification.ts` | face-api.js face detection + recognition for identity verification |
| `src/components/interview/JitsiMeetRoom.tsx` | Embedded Jitsi Meet iframe for interviews |
| `src/test/e2e/enterprise-features.spec.ts` | 10 enterprise feature tests |
| `AGENTS.md` | This file |

## Modified Files
| File | Changes |
|---|---|
| `src/components/auth/ProtectedRoute.tsx` | Added application-level role verification (second defense layer) |
| `src/components/identity/IdentityEnrollment.tsx` | Added face detection feedback during photo capture |
| `src/pages/public/AssessmentAccess.tsx` | Added face verification before & during assessment, face model loading |
| `src/pages/candidate/Interviews.tsx` | Added Jitsi Meet embedded room for Jitsi links |

## Supabase Context
- URL: `https://txwxtsdsbuddqfrtllsf.supabase.co`
- Anon key: `sb_publishable_ahamP8gR3qcYvJx0ulaMvw_yRn42OWB`
- No storage buckets exist
- 22 migrations unapplied
- RLS role-change bypass confirmed
