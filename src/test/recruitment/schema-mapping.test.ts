import { describe, it, expect } from "vitest";

interface RecruitmentPost {
  id: string;
  title: string;
  department: string;
  location: string;
  description: string;
  requirements: string;
  apply_link: string | null;
  assessment_required: boolean;
  assessment_id: string | null;
  created_by: string;
  status: string;
  created_at: string;
}

interface JobForm {
  id: string;
  job_title: string;
  department: string | null;
  location: string | null;
  jd_text: string | null;
  required_skills: string | null;
  apply_link: string | null;
  requires_assessment: boolean;
  assessment_id: string | null;
  created_by: string;
  status: string;
  created_at: string;
}

interface CandidateApplication {
  id: string;
  candidate_id: string;
  job_form_id: string;
  status: string;
  ai_score: number | null;
  interview_status: string | null;
  offer_status: string | null;
  assessment_score: number | null;
  interview_score: number | null;
  parsed_resume_text: string | null;
  recruiter_notes: string | null;
  assigned_recruiter: string | null;
  job_application_id: string | null;
}

interface JobApplication {
  id: string;
  candidate_id: string;
  form_id: string;
  status: string;
  match_score: number | null;
  interview_status: string | null;
  offer_status: string | null;
  assessment_score: number | null;
  interview_score: number | null;
  parsed_resume_text: string | null;
  recruiter_notes: string | null;
  assigned_recruiter: string | null;
  candidate_name: string | null;
  candidate_email: string | null;
}

function mapRecruitmentPostToJobForm(post: RecruitmentPost): Partial<JobForm> {
  return {
    job_title: post.title,
    department: post.department,
    location: post.location,
    jd_text: post.description,
    required_skills: post.requirements,
    apply_link: post.apply_link,
    requires_assessment: post.assessment_required,
    assessment_id: post.assessment_id,
    created_by: post.created_by,
    status: post.status,
  };
}

function mapCandidateAppToJobApp(ca: CandidateApplication): Partial<JobApplication> {
  return {
    candidate_id: ca.candidate_id,
    form_id: ca.job_form_id,
    status: ca.status,
    match_score: ca.ai_score,
    interview_status: ca.interview_status,
    offer_status: ca.offer_status,
    assessment_score: ca.assessment_score,
    interview_score: ca.interview_score,
    parsed_resume_text: ca.parsed_resume_text,
    recruiter_notes: ca.recruiter_notes,
    assigned_recruiter: ca.assigned_recruiter,
  };
}

function mapJobAppToCandidateApp(ja: JobApplication): Partial<CandidateApplication> {
  return {
    candidate_id: ja.candidate_id,
    job_form_id: ja.form_id,
    status: ja.status,
    ai_score: ja.match_score,
    interview_status: ja.interview_status,
    offer_status: ja.offer_status,
    assessment_score: ja.assessment_score,
    interview_score: ja.interview_score,
    parsed_resume_text: ja.parsed_resume_text,
    recruiter_notes: ja.recruiter_notes,
    assigned_recruiter: ja.assigned_recruiter,
    job_application_id: ja.id,
  };
}

describe("Schema Mapping: recruitment_posts → job_forms", () => {
  const samplePost: RecruitmentPost = {
    id: "post-1",
    title: "Senior Software Engineer",
    department: "Engineering",
    location: "Bangalore",
    description: "Build scalable systems.",
    requirements: "5+ years experience",
    apply_link: "https://apply.example.com",
    assessment_required: true,
    assessment_id: "assess-1",
    created_by: "hr-user-1",
    status: "Open",
    created_at: "2026-01-01T00:00:00Z",
  };

  it("maps all fields correctly", () => {
    const form = mapRecruitmentPostToJobForm(samplePost);
    expect(form.job_title).toBe("Senior Software Engineer");
    expect(form.department).toBe("Engineering");
    expect(form.location).toBe("Bangalore");
    expect(form.jd_text).toBe("Build scalable systems.");
    expect(form.required_skills).toBe("5+ years experience");
    expect(form.apply_link).toBe("https://apply.example.com");
    expect(form.requires_assessment).toBe(true);
    expect(form.assessment_id).toBe("assess-1");
    expect(form.created_by).toBe("hr-user-1");
    expect(form.status).toBe("Open");
  });

  it("maps null fields correctly", () => {
    const nullPost: RecruitmentPost = {
      ...samplePost,
      apply_link: null,
      assessment_id: null,
    };
    const form = mapRecruitmentPostToJobForm(nullPost);
    expect(form.apply_link).toBeNull();
    expect(form.assessment_id).toBeNull();
  });

  it("preserves field count parity", () => {
    const form = mapRecruitmentPostToJobForm(samplePost);
    const mappedKeys = Object.keys(form).sort();
    const expectedKeys = [
      "job_title", "department", "location", "jd_text",
      "required_skills", "apply_link", "requires_assessment",
      "assessment_id", "created_by", "status",
    ].sort();
    expect(mappedKeys).toEqual(expectedKeys);
  });
});

describe("Schema Mapping: candidate_applications ↔ job_applications", () => {
  const sampleCA: CandidateApplication = {
    id: "ca-1",
    candidate_id: "cand-1",
    job_form_id: "form-1",
    status: "Assessment Passed",
    ai_score: 85,
    interview_status: "Pending Scheduling",
    offer_status: null,
    assessment_score: 85,
    interview_score: null,
    parsed_resume_text: "John Doe resume text...",
    recruiter_notes: null,
    assigned_recruiter: null,
    job_application_id: "ja-1",
  };

  it("maps candidate_applications → job_applications fields", () => {
    const ja = mapCandidateAppToJobApp(sampleCA);
    expect(ja.candidate_id).toBe("cand-1");
    expect(ja.form_id).toBe("form-1");
    expect(ja.status).toBe("Assessment Passed");
    expect(ja.match_score).toBe(85);
    expect(ja.interview_status).toBe("Pending Scheduling");
    expect(ja.assessment_score).toBe(85);
  });

  it("maps job_applications → candidate_applications fields", () => {
    const sampleJA: JobApplication = {
      id: "ja-1",
      candidate_id: "cand-1",
      form_id: "form-1",
      status: "Assessment Passed",
      match_score: 85,
      interview_status: "Pending Scheduling",
      offer_status: null,
      assessment_score: 85,
      interview_score: null,
      parsed_resume_text: "John Doe resume text...",
      recruiter_notes: null,
      assigned_recruiter: null,
      candidate_name: "John Doe",
      candidate_email: "john@example.com",
    };

    const ca = mapJobAppToCandidateApp(sampleJA);
    expect(ca.candidate_id).toBe("cand-1");
    expect(ca.job_form_id).toBe("form-1");
    expect(ca.status).toBe("Assessment Passed");
    expect(ca.ai_score).toBe(85);
    expect(ca.job_application_id).toBe("ja-1");
  });

  it("roundtrips through both mappings", () => {
    const sampleJA: JobApplication = {
      id: "ja-rt",
      candidate_id: "cand-rt",
      form_id: "form-rt",
      status: "Shortlisted",
      match_score: 92,
      interview_status: "Not Scheduled",
      offer_status: null,
      assessment_score: null,
      interview_score: null,
      parsed_resume_text: null,
      recruiter_notes: "Strong candidate",
      assigned_recruiter: "hr-user-2",
      candidate_name: "Jane",
      candidate_email: "jane@example.com",
    };

    const ca = mapJobAppToCandidateApp(sampleJA);
    expect(ca.ai_score).toBe(92);
    expect(ca.recruiter_notes).toBe("Strong candidate");
    expect(ca.assigned_recruiter).toBe("hr-user-2");
    expect(ca.job_application_id).toBe("ja-rt");

    const jaBack = mapCandidateAppToJobApp(ca as CandidateApplication);
    expect(jaBack.match_score).toBe(92);
    expect(jaBack.recruiter_notes).toBe("Strong candidate");
    expect(jaBack.candidate_id).toBe("cand-rt");
    expect(jaBack.form_id).toBe("form-rt");
  });

  it("preserves null score fields", () => {
    const ca: CandidateApplication = {
      ...sampleCA,
      ai_score: null,
      assessment_score: null,
      interview_score: null,
    };
    const ja = mapCandidateAppToJobApp(ca);
    expect(ja.match_score).toBeNull();
    expect(ja.assessment_score).toBeNull();
    expect(ja.interview_score).toBeNull();
  });
});
