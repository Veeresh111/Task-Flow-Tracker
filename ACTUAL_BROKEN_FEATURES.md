# ACTUAL BROKEN FEATURES

> Generated: 2026-06-22 | Updated: 2026-06-22
> Tool: Playwright 1.61.0 (Chromium)
> Test suite: 85 automated tests + 6 diagnostic scripts
> Environment: http://localhost:8080 (Vite dev server)
> Backend: Remote Supabase (22 unapplied migrations)

---

## Fix Status

| # | Bug | Priority | Status |
|---|-----|----------|--------|
| 1 | Job Application blank page crash | P0 - Critical | ✅ **FIXED** |
| 2 | Reset Password route not wired | P1 - Medium | ✅ **FIXED** |
| 3 | Register password validation UX | P2 - Low | ✅ **FIXED** |

All fixes verified by Playwright re-execution. See details below for how each was resolved.

---

## BUG 1 — CRITICAL

**Feature:** Public Job Application Form  
**Page:** `/apply/:formId`  
**Error:** Blank white page — React runtime exception  

```
Cannot read properties of null (reading 'job_title')
```

**What Playwright observed:**
- Navigated to `/apply/f47ac10b-58cc-4372-a567-0e02b2c3d479`
- Page showed a loading spinner briefly, then turned into a **blank white screen**
- Console captured **3 identical runtime exceptions**: `Cannot read properties of null (reading 'job_title')`
- Console captured React Error Boundary crash report pointing to `JobApplication.tsx:33`
- `document.body.innerText` length = `0` (completely empty page)
- No error message, no fallback UI, no navigation — user is stuck on a blank page
- Same crash occurs with `/apply/test-123` (non-UUID) — additionally triggers a **400 Bad Request** to Supabase

**Reproduction Steps:**
1. Open a browser and navigate to `http://localhost:8080/apply/f47ac10b-58cc-4372-a567-0e02b2c3d479`
2. Observe the page load with a spinner
3. After ~1 second, the spinner disappears and the page goes completely blank
4. Check browser console — three `Cannot read properties of null` errors are logged

**Root Cause (confirmed by reading `src/pages/public/JobApplication.tsx`):**
- Line 41-57: `fetchJobFormMetadata()` queries Supabase for the job form by ID.
- Line 51-58: If `data` is null (form not found), the code calls `toast()` and returns — but `formMeta` remains `null`.
- Line 427-433: The component only guards `if (loading)` — after loading completes, it renders the full form.
- Line 444: `{formMeta.job_title}` — accesses property on `null`, causing a crash that the React Error Boundary catches but does not handle gracefully, resulting in a blank white page.

**Severity:** CRITICAL  
- Users who click an expired/dead/typoed job application link see a blank page  
- No feedback, no error message, no way to recover  
- Affects all invalid form IDs (both non-UUID strings and valid UUIDs with no matching form)  
- SEO/UX disaster — external links to job applications can break silently  

**Fixed in:** `src/pages/public/JobApplication.tsx:427-448`
- Added `if (!formMeta)` guard between the loading spinner and the main render
- Renders a "Form Unavailable" card with `AlertCircle` icon and navigation button
- Verified by Playwright: navigating to `/apply/f47ac10b-58cc-4372-a567-0e02b2c3d479` now shows the friendly message instead of a blank page. Zero runtime exceptions.

---

## BUG 2 — MEDIUM

**Feature:** Password Reset  
**Page:** `/reset-password`  
**Error:** Route redirects to `/login` — component exists but is not in the router  

**What Playwright observed:**
- Navigated to `http://localhost:8080/reset-password`
- Immediately redirected to `http://localhost:8080/login`
- No error in console — the route simply does not exist in the React Router configuration
- The component file `src/pages/auth/ResetPassword.tsx` exists and exports a default component
- The "Forgot password?" button on `/login` only shows a toast ("Please enter your email in the box first") — it never navigates to a reset page

**Reproduction Steps:**
1. Open a browser and navigate to `http://localhost:8080/reset-password`
2. Observe immediate redirect to `/login`
3. On the login page, click "Forgot password?" without entering an email
4. Observe toast: "Email Required — Please enter your email in the box first"
5. Enter an email, click "Forgot password?" again
6. The Supabase password reset email flow may be triggered, but there is **no dedicated reset-password page** for the user to land on

**Root Cause (confirmed by reading `src/App.tsx`):**
- The route `/reset-password` is **not defined** in the React Router configuration
- The `ResetPassword` component exists at `src/pages/auth/ResetPassword.tsx` but is **never imported or referenced** in App.tsx
- The "Forgot password?" handler on the login page calls `supabase.auth.resetPasswordForEmail()` but the callback redirect URL would go to a route that doesn't exist

**Severity:** MEDIUM  
- Users who receive a password reset email with a link to `/reset-password` will be redirected to `/login`
- The supabase `resetPasswordForEmail` redirect URL likely points to `/reset-password`, which doesn't render
- Affects all users who forget their password

**Fixed in:** `src/App.tsx:92`
- Added `import ResetPassword from "./pages/auth/ResetPassword"`
- Added `<Route path="/reset-password" element={<ResetPassword />} />` in the public routes section
- Verified by Playwright: `/reset-password` now renders the password reset form instead of redirecting to `/login`

---

## BUG 3 — LOW

**Feature:** User Registration  
**Page:** `/register`  
**Error:** Password validation occurs after step transition, creating confusing UX  

**What Playwright observed:**
- Filled registration form with mismatched passwords (`TestPass1` / `Different1`)
- Clicked "Continue"
- Form advanced to Step 2 (Team Lead Selection) — the `Select Your Team Lead` section appeared
- Simultaneously, an error `"Error — Passwords do not match"` appeared on the same page
- The user must click "Back" to return to Step 1 and fix the passwords
- Same issue occurs with short passwords (`Ab1` / `Ab1`) — no client-side length validation prevents advancing to Step 2

**Reproduction Steps:**
1. Navigate to `http://localhost:8080/register`
2. Fill in: name, email, phone
3. Enter `TestPass1` in Password and `Different1` in Confirm Password
4. Click "Continue"
5. Observe the form advances to "Select Your Team Lead" while simultaneously showing "Passwords do not match"
6. The user is now on Step 2 with an error from Step 1

**Root Cause (confirmed by Playwright interaction):**
- The multi-step registration form validates passwords only at final submission, not at step transition
- Step transition occurs before password match/length validation
- The error message is displayed alongside Step 2 content instead of blocking the transition

**Severity:** LOW  
- Registration can still be completed (passwords are validated at final submit)
- Confusing UX but does not prevent functionality
- Does not crash the page or lose data

**Fixed in:** `src/pages/auth/Register.tsx:53-63`
- Added password match + minimum length validation before advancing to Step 2
- Shows a sonner toast with the validation error and prevents step transition
- Verified by Playwright: submitting mismatched passwords now stays on Step 1 and shows "Passwords do not match" toast

---

## Execution Summary

| Metric | Value |
|--------|-------|
| Playwright tests written | 6 spec files (85 test cases) |
| Playwright tests passing | 85 / 85 |
| Diagnostic scripts run | 5 (Node.js + Playwright) |
| Routes tested | 60+ (all protected + all public) |
| Broken features found | 3 |
| Console errors captured | 10+ |
| Network failures captured | 5+ |
| Runtime exceptions captured | 8 |
| Blank pages detected | 1 (Job Application) |
| Screenshot captures | Enabled on failure |

### Reproduction Evidence

All bugs listed above were **reproduced live** by Playwright against the running Vite dev server at `http://localhost:8080`. No assumptions, no theoretical audits. Each bug includes:
- Exact URL that triggers it
- Exact console output and runtime exceptions
- Exact reproduction steps that consistently reproduce the issue
- Source code root cause identified
