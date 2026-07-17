-- ============================================================
-- PHASE 1: DATA MODEL CONSOLIDATION
-- Single source of truth: job_applications
-- recruitment_posts → merged into job_forms
-- applications → FK fixed to job_applications
-- candidate_applications → backward-compat sync via triggers
-- ============================================================

-- ============================================================
-- A1. ADD COLUMNS TO job_applications (enrich to absorb candidate_applications)
-- ============================================================
ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS interview_status TEXT DEFAULT 'Not Scheduled',
  ADD COLUMN IF NOT EXISTS assessment_score INTEGER,
  ADD COLUMN IF NOT EXISTS interview_score INTEGER,
  ADD COLUMN IF NOT EXISTS offer_status TEXT DEFAULT 'Not Generated',
  ADD COLUMN IF NOT EXISTS parsed_resume_text TEXT,
  ADD COLUMN IF NOT EXISTS recruiter_notes TEXT,
  ADD COLUMN IF NOT EXISTS assigned_recruiter UUID,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Add updated_at trigger for job_applications
CREATE TRIGGER trg_job_applications_updated_at
  BEFORE UPDATE ON public.job_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- A2. ADD MISSING COLUMNS TO job_forms
--     (to fully absorb recruitment_posts functionality)
-- ============================================================
ALTER TABLE public.job_forms
  ADD COLUMN IF NOT EXISTS apply_link TEXT,
  ADD COLUMN IF NOT EXISTS department TEXT,
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS employment_type TEXT,
  ADD COLUMN IF NOT EXISTS required_skills TEXT,
  ADD COLUMN IF NOT EXISTS experience_required TEXT,
  ADD COLUMN IF NOT EXISTS salary_range TEXT,
  ADD COLUMN IF NOT EXISTS requirements TEXT;

-- ============================================================
-- A3. MIGRATE recruitment_posts DATA → job_forms
-- ============================================================
DO $$
DECLARE
  r RECORD;
  target_form_id UUID;
BEGIN
  FOR r IN SELECT * FROM public.recruitment_posts WHERE status = 'Open' LOOP
    -- If the post already links to a job_form, update that form with post fields
    IF r.job_form_id IS NOT NULL THEN
      UPDATE public.job_forms
      SET
        apply_link = COALESCE(apply_link, r.apply_link),
        requires_assessment = COALESCE(requires_assessment, r.assessment_required),
        jd_text = CASE WHEN (jd_text IS NULL OR jd_text = '') THEN r.description ELSE jd_text END,
        required_skills = CASE WHEN (required_skills IS NULL OR required_skills = '') THEN r.requirements ELSE required_skills END,
        department = CASE WHEN (department IS NULL OR department = '') THEN r.department ELSE department END,
        location = CASE WHEN (location IS NULL OR location = '') THEN r.location ELSE location END,
        employment_type = CASE WHEN (employment_type IS NULL OR employment_type = '') THEN r.employment_type ELSE employment_type END,
        requirements = CASE WHEN (requirements IS NULL OR requirements = '') THEN r.requirements ELSE requirements END
      WHERE id = r.job_form_id;
    ELSE
      -- Create a new job_forms record from this recruitment post
      INSERT INTO public.job_forms (
        job_title,
        jd_text,
        department,
        location,
        employment_type,
        status,
        required_skills,
        requirements,
        apply_link,
        requires_assessment,
        created_by,
        created_at
      ) VALUES (
        r.title,
        r.description,
        r.department,
        r.location,
        r.employment_type,
        r.status,
        r.requirements,
        r.requirements,
        r.apply_link,
        r.assessment_required,
        r.created_by,
        r.created_at
      )
      RETURNING id INTO target_form_id;

      -- Link the recruitment post to the new job_forms record
      UPDATE public.recruitment_posts
      SET job_form_id = target_form_id
      WHERE id = r.id;
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- A4. FIX assessment_tokens.application_id FK
--     Old: → applications(id)  [ORPHANED, 0 rows]
--     New: → job_applications(id)
-- ============================================================
-- Drop the old FK to the orphaned applications table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_assessment_tokens_applications'
  ) THEN
    ALTER TABLE public.assessment_tokens DROP CONSTRAINT fk_assessment_tokens_applications;
  END IF;
END $$;

-- Backfill NULL application_ids by matching candidate_id between tokens and job_applications
UPDATE public.assessment_tokens t
SET application_id = ja.id
FROM public.job_applications ja
WHERE t.application_id IS NULL
  AND t.candidate_id = ja.candidate_id
  AND ja.status IN ('Applied', 'Screening', 'Shortlisted', 'Assessment Assigned');

-- Add new FK to job_applications
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_assessment_tokens_job_application'
  ) THEN
    ALTER TABLE public.assessment_tokens
      ADD CONSTRAINT fk_assessment_tokens_job_application
      FOREIGN KEY (application_id) REFERENCES public.job_applications(id);
  END IF;
END $$;

-- ============================================================
-- A5. CREATE AFTER INSERT TRIGGER ON job_applications
--     → auto-insert into candidate_applications (backward compat)
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_job_application_to_candidate_app()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.candidate_applications (
    candidate_id,
    job_form_id,
    status,
    ai_score,
    interview_status,
    created_at,
    job_application_id,
    parsed_resume_text
  ) VALUES (
    NEW.candidate_id,
    NEW.form_id,
    NEW.status,
    NEW.match_score,
    COALESCE(NEW.interview_status, 'Not Scheduled'),
    NEW.created_at,
    NEW.id,
    NEW.parsed_resume_text
  )
  ON CONFLICT (candidate_id, job_form_id) DO UPDATE SET
    status = EXCLUDED.status,
    ai_score = EXCLUDED.ai_score,
    interview_status = EXCLUDED.interview_status,
    job_application_id = EXCLUDED.job_application_id,
    parsed_resume_text = EXCLUDED.parsed_resume_text;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_job_applications_sync_to_candidate ON public.job_applications;
CREATE TRIGGER trg_job_applications_sync_to_candidate
  AFTER INSERT ON public.job_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_job_application_to_candidate_app();

-- ============================================================
-- A6. CREATE AFTER UPDATE TRIGGER ON job_applications
--     → auto-sync candidate_applications (backward compat)
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_job_application_update_to_candidate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.candidate_applications
  SET
    status = NEW.status,
    ai_score = NEW.match_score,
    interview_status = COALESCE(NEW.interview_status, candidate_applications.interview_status),
    interview_score = NEW.interview_score,
    offer_status = CASE
      WHEN NEW.offer_status IS NOT NULL THEN NEW.offer_status
      ELSE candidate_applications.offer_status
    END,
    parsed_resume_text = NEW.parsed_resume_text,
    recruiter_notes = NEW.recruiter_notes,
    assigned_recruiter = NEW.assigned_recruiter
  WHERE job_application_id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_job_applications_update_sync ON public.job_applications;
CREATE TRIGGER trg_job_applications_update_sync
  AFTER UPDATE ON public.job_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_job_application_update_to_candidate();

-- ============================================================
-- A7. ADD NOT NULL TO job_applications.candidate_id
--     Fill NULLs first by matching on candidate_email
-- ============================================================
UPDATE public.job_applications
SET candidate_id = c.id
FROM public.candidates c
WHERE job_applications.candidate_id IS NULL
  AND LOWER(job_applications.candidate_email) = LOWER(c.email);

-- Only add NOT NULL if all rows now have candidate_id
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.job_applications WHERE candidate_id IS NULL) THEN
    ALTER TABLE public.job_applications ALTER COLUMN candidate_id SET NOT NULL;
  END IF;
END $$;

-- ============================================================
-- A8. ADD UNIQUE CONSTRAINT ON job_applications(candidate_id, form_id)
--     Remove existing duplicates first (keep most recent)
-- ============================================================
DELETE FROM public.job_applications a
USING (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY candidate_id, form_id ORDER BY created_at DESC
  ) AS rn
  FROM public.job_applications
  WHERE candidate_id IS NOT NULL AND form_id IS NOT NULL
) dups
WHERE a.id = dups.id AND dups.rn > 1;

DROP INDEX IF EXISTS idx_job_applications_candidate_form;
CREATE UNIQUE INDEX IF NOT EXISTS idx_job_applications_candidate_form
  ON public.job_applications (candidate_id, form_id);

-- ============================================================
-- A9. ADD CHECK CONSTRAINT ON job_applications.status
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints cc
    JOIN information_schema.constraint_column_usage ccu ON cc.constraint_name = ccu.constraint_name
    WHERE ccu.table_name = 'job_applications' AND ccu.column_name = 'status'
  ) THEN
    ALTER TABLE public.job_applications
      ADD CONSTRAINT chk_job_applications_status
      CHECK (status IN (
        'Applied', 'Screening', 'Shortlisted', 'ATS Shortlisted',
        'Recruiter Screening', 'Assessment Assigned',
        'Assessment Passed', 'Assessment Completed',
        'Interview Scheduled', 'Interview Cleared',
        'Offer Generated', 'Offer Accepted',
        'Onboarding', 'Rejected'
      ));
  END IF;
END $$;

-- ============================================================
-- A10. ADD INDEXES ON job_applications
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_job_applications_status ON public.job_applications (status);
CREATE INDEX IF NOT EXISTS idx_job_applications_interview_status ON public.job_applications (interview_status);
CREATE INDEX IF NOT EXISTS idx_job_applications_candidate_id ON public.job_applications (candidate_id);
CREATE INDEX IF NOT EXISTS idx_job_applications_form_id ON public.job_applications (form_id);

-- ============================================================
-- ADD candidate_applications.job_application_id INDEX for sync performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_candidate_applications_job_app_id
  ON public.candidate_applications (job_application_id);

-- ============================================================
-- UPDATE existing DB TRIGGER FUNCTIONS to resolve via job_applications
-- ============================================================

-- Update notify_on_interview_scheduled to resolve candidate_id from job_applications
CREATE OR REPLACE FUNCTION public.notify_on_interview_scheduled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_candidate_id UUID;
  v_job_title TEXT;
BEGIN
  -- Try job_applications first (new), fall back to candidate_applications (legacy)
  SELECT ja.candidate_id, jf.job_title
  INTO v_candidate_id, v_job_title
  FROM public.job_applications ja
  LEFT JOIN public.job_forms jf ON ja.form_id = jf.id
  WHERE ja.id = NEW.application_id;

  IF v_candidate_id IS NULL THEN
    SELECT ca.candidate_id, jf.job_title
    INTO v_candidate_id, v_job_title
    FROM public.candidate_applications ca
    LEFT JOIN public.job_forms jf ON ca.job_form_id = jf.id
    WHERE ca.id = NEW.application_id;
  END IF;

  IF v_candidate_id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.candidate_notifications (candidate_id, title, message, read)
      VALUES (
        v_candidate_id,
        'Interview Scheduled',
        'Your interview has been scheduled. Please check your dashboard for details.',
        false
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$;

-- Update notify_on_offer_status_change to resolve via job_applications
CREATE OR REPLACE FUNCTION public.notify_on_offer_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_candidate_id UUID;
  v_job_title TEXT;
  v_notif_title TEXT;
  v_notif_msg TEXT;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    -- Resolve candidate_id: try job_applications first, then offer_letters.candidate_id
    IF NEW.application_id IS NOT NULL THEN
      SELECT ja.candidate_id, jf.job_title
      INTO v_candidate_id, v_job_title
      FROM public.job_applications ja
      LEFT JOIN public.job_forms jf ON ja.form_id = jf.id
      WHERE ja.id = NEW.application_id;
    END IF;

    IF v_candidate_id IS NULL THEN
      v_candidate_id := NEW.candidate_id;
    END IF;

    v_notif_title := 'Offer ' || NEW.status;
    v_notif_msg := 'Your offer has been updated to: ' || NEW.status || '. Please check your dashboard.';

    IF v_candidate_id IS NOT NULL THEN
      BEGIN
        INSERT INTO public.candidate_notifications (candidate_id, title, message, read)
        VALUES (v_candidate_id, v_notif_title, v_notif_msg, false);
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;

    -- Notify HR admins on approval events
    IF NEW.status IN ('Approved', 'Accepted', 'Declined') THEN
      BEGIN
        INSERT INTO public.notifications (user_id, title, message)
        SELECT id, v_notif_title, v_notif_msg || ' (Action required for candidate)'
        FROM public.profiles
        WHERE role IN ('hr', 'admin');
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Note: candidate_applications has UNIQUE(candidate_id, job_form_id) constraint
-- named 'unique_candidate_job' which the sync triggers use via ON CONFLICT.
-- Keeping this constraint ensures the upsert works correctly.
