-- Hardening from live defect: two notifications existed with user_id NULL
-- (invisible to every user under RLS, polluting duplicate-detection queries).
-- Every legitimate notification targets a real user; force it at the schema
-- level so a buggy caller fails loudly instead of silently creating garbage.
ALTER TABLE public.notifications ALTER COLUMN user_id SET NOT NULL;
