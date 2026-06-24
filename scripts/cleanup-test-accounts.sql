-- ============================================================
-- Cleanup E2E Test Accounts — FK-safe deletion order
-- Run via Supabase Dashboard SQL Editor (service_role required)
-- Run each step, verify count, then proceed
-- ============================================================

-- STEP 0: Verify what will be deleted
SELECT '=== VERIFICATION ===' as step;
SELECT COUNT(*) as e2e_job_forms FROM public.job_forms WHERE job_title LIKE 'E2E%';
SELECT COUNT(*) as test_candidates FROM public.candidates WHERE email LIKE '%@test.com';
SELECT COUNT(*) as test_applications FROM public.job_applications WHERE candidate_email LIKE '%@test.com';

-- STEP 1-5: Delete child records first (FK dependencies)
BEGIN;

-- 1. candidate_stage_history (if exists)
DELETE FROM public.candidate_stage_history
WHERE application_id IN (SELECT id FROM public.job_applications WHERE candidate_email LIKE '%@test.com');

-- 2. assessment_invites (if exists)
DELETE FROM public.assessment_invites
WHERE candidate_id IN (SELECT id FROM public.candidates WHERE email LIKE '%@test.com');

-- 3. assessment_attempts
DELETE FROM public.assessment_attempts
WHERE candidate_id IN (SELECT id FROM public.candidates WHERE email LIKE '%@test.com');

-- 4. assessment_tokens
DELETE FROM public.assessment_tokens
WHERE candidate_id IN (SELECT id FROM public.candidates WHERE email LIKE '%@test.com');

-- 5. candidate_notifications
DELETE FROM public.candidate_notifications
WHERE candidate_id IN (SELECT id FROM public.candidates WHERE email LIKE '%@test.com');

-- STEP 6: Delete job_applications
DELETE FROM public.job_applications
WHERE candidate_email LIKE '%@test.com';

-- STEP 7: Delete candidate_applications (if exists)
DELETE FROM public.candidate_applications
WHERE candidate_id IN (SELECT id FROM public.candidates WHERE email LIKE '%@test.com');

-- STEP 8: Delete candidates
DELETE FROM public.candidates
WHERE email LIKE '%@test.com';

-- STEP 9: Delete assessments linked to E2E forms
DELETE FROM public.assessments
WHERE job_form_id IN (SELECT id FROM public.job_forms WHERE job_title LIKE 'E2E%');

-- STEP 10: Delete recruitment_posts linked to E2E forms (if exists)
DELETE FROM public.recruitment_posts
WHERE job_form_id IN (SELECT id FROM public.job_forms WHERE job_title LIKE 'E2E%');

-- STEP 11: Delete E2E job forms
DELETE FROM public.job_forms
WHERE job_title LIKE 'E2E%';

-- STEP 12: Delete profiles (cleanup from admin API that may have missed some)
DELETE FROM public.profiles
WHERE email LIKE '%@test.com';

-- STEP 13: Delete auth users (requires service_role)
DELETE FROM auth.users
WHERE email LIKE '%@test.com';

COMMIT;

-- STEP 14: Verify cleanup
SELECT '=== VERIFICATION AFTER CLEANUP ===' as step;
SELECT COUNT(*) as remaining_e2e_forms FROM public.job_forms WHERE job_title LIKE 'E2E%';
SELECT COUNT(*) as remaining_test_candidates FROM public.candidates WHERE email LIKE '%@test.com';
SELECT COUNT(*) as remaining_test_apps FROM public.job_applications WHERE candidate_email LIKE '%@test.com';
SELECT COUNT(*) as remaining_test_profiles FROM public.profiles WHERE email LIKE '%@test.com';
SELECT COUNT(*) as remaining_test_auth_users FROM auth.users WHERE email LIKE '%@test.com';
