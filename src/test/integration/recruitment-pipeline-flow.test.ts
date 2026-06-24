import { describe, it, expect, vi } from "vitest";

// Integration tests for the full recruitment pipeline flow
// Tests the business logic end-to-end without database

interface Candidate {
  id: string;
  full_name: string;
  email: string;
  phone?: string;
  experience_years: number;
  stage: string;
}

interface JobForm {
  id: string;
  job_title: string;
  department: string;
  location: string;
  status: string;
  requires_assessment: boolean;
}

interface JobApplication {
  id: string;
  candidate_id: string;
  form_id: string;
  status: string;
  interview_status: string | null;
  match_score: number | null;
  assessment_score: number | null;
  created_at: string;
}

interface AssessmentToken {
  id: string;
  token: string;
  assessment_id: string;
  candidate_id: string;
  application_id: string;
  status: string;
  used: boolean;
  expires_at: string;
}

interface AssessmentAttempt {
  id: string;
  assessment_id: string;
  candidate_id: string;
  score: number;
  passed: boolean;
  violations: number;
}

interface OfferLetter {
  id: string;
  candidate_id: string;
  job_form_id: string;
  application_id: string;
  status: string;
  offered_ctc: number;
}

// Simulate the complete pipeline flow
class RecruitmentPipeline {
  candidates: Map<string, Candidate> = new Map();
  jobForms: Map<string, JobForm> = new Map();
  applications: Map<string, JobApplication> = new Map();
  tokens: Map<string, AssessmentToken> = new Map();
  attempts: Map<string, AssessmentAttempt> = new Map();
  offers: Map<string, OfferLetter> = new Map();

  private generateId(): string {
    return crypto.randomUUID?.() || Math.random().toString(36).substring(2);
  }

  createJobForm(job: Omit<JobForm, "id">): JobForm {
    const form: JobForm = { id: this.generateId(), ...job };
    this.jobForms.set(form.id, form);
    return form;
  }

  submitApplication(candidate: Omit<Candidate, "id">, formId: string): { candidate: Candidate; application: JobApplication } {
    const existingCand = Array.from(this.candidates.values()).find(c => c.email === candidate.email);
    const cand: Candidate = existingCand || { id: this.generateId(), ...candidate, stage: "Screening" };
    if (!existingCand) this.candidates.set(cand.id, cand);

    const existingApp = Array.from(this.applications.values()).find(
      a => a.candidate_id === cand.id && a.form_id === formId
    );
    if (existingApp) {
      throw new Error("Application Already Submitted");
    }

    const app: JobApplication = {
      id: this.generateId(),
      candidate_id: cand.id,
      form_id: formId,
      status: "Applied",
      interview_status: null,
      match_score: null,
      assessment_score: null,
      created_at: new Date().toISOString(),
    };
    this.applications.set(app.id, app);
    return { candidate: cand, application: app };
  }

  screenApplication(applicationId: string, score: number): JobApplication {
    const app = this.applications.get(applicationId);
    if (!app) throw new Error("Application not found");
    app.match_score = score;
    if (score >= 70) {
      app.status = "Shortlisted";
    } else {
      app.status = "Rejected";
    }
    this.applications.set(applicationId, app);
    return app;
  }

  createAssessmentToken(assessmentId: string, applicationId: string): AssessmentToken {
    const app = this.applications.get(applicationId);
    if (!app) throw new Error("Application not found");
    app.status = "Assessment Assigned";
    this.applications.set(applicationId, app);

    const token: AssessmentToken = {
      id: this.generateId(),
      token: this.generateId().replace(/-/g, "").toUpperCase(),
      assessment_id: assessmentId,
      candidate_id: app.candidate_id,
      application_id: applicationId,
      status: "Active",
      used: false,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };
    this.tokens.set(token.id, token);
    return token;
  }

  gradeAssessment(tokenId: string, score: number, violations: number, maxViolations: number, passingScore: number): AssessmentAttempt {
    const token = this.tokens.get(tokenId);
    if (!token) throw new Error("Token not found");
    if (token.used) throw new Error("Token already used");
    if (new Date(token.expires_at) < new Date()) throw new Error("Token expired");

    const app = this.applications.get(token.application_id);
    if (!app) throw new Error("Application not found");

    const disqualified = violations >= maxViolations;
    const passed = score >= passingScore && !disqualified;

    const attempt: AssessmentAttempt = {
      id: this.generateId(),
      assessment_id: token.assessment_id,
      candidate_id: token.candidate_id,
      score: disqualified ? 0 : score,
      passed,
      violations,
    };
    this.attempts.set(attempt.id, attempt);

    token.used = true;
    token.status = disqualified ? "Disqualified" : "Used";
    this.tokens.set(tokenId, token);

    if (disqualified) {
      app.status = "Rejected";
    } else if (passed) {
      app.status = "Assessment Passed";
      app.interview_status = "Pending Scheduling";
    } else {
      app.status = "Assessment Completed";
    }
    app.assessment_score = score;
    this.applications.set(token.application_id, app);

    return attempt;
  }

  scheduleInterview(applicationId: string): JobApplication {
    const app = this.applications.get(applicationId);
    if (!app) throw new Error("Application not found");
    if (app.status === "Assessment Passed") {
      app.status = "Interview Scheduled";
      app.interview_status = "Scheduled";
      this.applications.set(applicationId, app);
    } else if (app.status !== "Interview Scheduled") {
      throw new Error("Cannot schedule interview: current status " + app.status);
    }
    return app;
  }

  clearInterview(applicationId: string): JobApplication {
    const app = this.applications.get(applicationId);
    if (!app) throw new Error("Application found");
    app.status = "Interview Cleared";
    app.interview_status = "Completed";
    this.applications.set(applicationId, app);
    return app;
  }

  generateOffer(applicationId: string, ctc: number): OfferLetter {
    const app = this.applications.get(applicationId);
    if (!app) throw new Error("Application not found");
    if (app.status !== "Interview Cleared") throw new Error("Interview not cleared");

    app.status = "Offer Generated";
    this.applications.set(applicationId, app);

    const form = this.jobForms.get(app.form_id);
    const offer: OfferLetter = {
      id: this.generateId(),
      candidate_id: app.candidate_id,
      job_form_id: app.form_id!,
      application_id: applicationId,
      status: "Pending Approval",
      offered_ctc: ctc,
    };
    this.offers.set(offer.id, offer);
    return offer;
  }

  approveOffer(offerId: string): OfferLetter {
    const offer = this.offers.get(offerId);
    if (!offer) throw new Error("Offer not found");
    offer.status = "Approved";
    this.offers.set(offerId, offer);
    return offer;
  }

  sendOffer(offerId: string): OfferLetter {
    const offer = this.offers.get(offerId);
    if (!offer) throw new Error("Offer not found");
    if (offer.status !== "Approved") throw new Error("Offer not approved");
    offer.status = "Sent";
    this.offers.set(offerId, offer);
    return offer;
  }

  respondToOffer(offerId: string, action: "accepted" | "declined"): OfferLetter {
    const offer = this.offers.get(offerId);
    if (!offer) throw new Error("Offer not found");
    if (offer.status !== "Sent") throw new Error("Offer not in Sent status");

    offer.status = action === "accepted" ? "Accepted" : "Declined";
    this.offers.set(offerId, offer);

    const app = this.applications.get(offer.application_id);
    if (app) {
      app.status = action === "accepted" ? "Offer Accepted" : "Offer Declined";
      this.applications.set(offer.application_id, app);
    }

    return offer;
  }

  onboard(applicationId: string): JobApplication {
    const app = this.applications.get(applicationId);
    if (!app) throw new Error("Application not found");
    if (app.status !== "Offer Accepted") throw new Error("Offer not accepted");

    app.status = "Onboarding";
    this.applications.set(applicationId, app);

    const candidate = this.candidates.get(app.candidate_id);
    if (candidate) {
      candidate.stage = "Onboarding";
      this.candidates.set(candidate.id, candidate);
    }

    return app;
  }
}

describe("Recruitment Pipeline Integration", () => {
  let pipeline: RecruitmentPipeline;
  let jobForm: JobForm;
  let candidate: Candidate;
  let application: JobApplication;

  beforeEach(() => {
    pipeline = new RecruitmentPipeline();

    jobForm = pipeline.createJobForm({
      job_title: "Senior QA Engineer",
      department: "Engineering",
      location: "Bangalore",
      status: "Open",
      requires_assessment: true,
    });
  });

  it("completes full candidate lifecycle from application to onboarding", () => {
    // Phase 1: Submit Application
    const result = pipeline.submitApplication(
      { full_name: "Test User", email: "test@example.com", experience_years: 5, stage: "" },
      jobForm.id,
    );
    candidate = result.candidate;
    application = result.application;
    expect(application.status).toBe("Applied");

    // Phase 2: ATS Screening
    pipeline.screenApplication(application.id, 85);
    expect(pipeline.applications.get(application.id)!.status).toBe("Shortlisted");
    expect(pipeline.applications.get(application.id)!.match_score).toBe(85);

    // Phase 3: Assessment
    const token = pipeline.createAssessmentToken("assess-1", application.id);
    expect(pipeline.applications.get(application.id)!.status).toBe("Assessment Assigned");
    expect(token.status).toBe("Active");

    // Phase 4: Grade Assessment (Pass)
    pipeline.gradeAssessment(token.id, 80, 0, 5, 70);
    expect(pipeline.applications.get(application.id)!.status).toBe("Assessment Passed");
    expect(pipeline.tokens.get(token.id)!.used).toBe(true);
    expect(pipeline.tokens.get(token.id)!.status).toBe("Used");

    // Phase 5: Interview
    pipeline.scheduleInterview(application.id);
    expect(pipeline.applications.get(application.id)!.status).toBe("Interview Scheduled");
    pipeline.clearInterview(application.id);
    expect(pipeline.applications.get(application.id)!.status).toBe("Interview Cleared");

    // Phase 6: Offer
    const offer = pipeline.generateOffer(application.id, 2400000);
    expect(offer.status).toBe("Pending Approval");
    expect(pipeline.applications.get(application.id)!.status).toBe("Offer Generated");

    pipeline.approveOffer(offer.id);
    expect(pipeline.offers.get(offer.id)!.status).toBe("Approved");

    pipeline.sendOffer(offer.id);
    expect(pipeline.offers.get(offer.id)!.status).toBe("Sent");

    // Phase 7: Accept Offer
    pipeline.respondToOffer(offer.id, "accepted");
    expect(pipeline.offers.get(offer.id)!.status).toBe("Accepted");
    expect(pipeline.applications.get(application.id)!.status).toBe("Offer Accepted");

    // Phase 8: Onboarding
    pipeline.onboard(application.id);
    expect(pipeline.applications.get(application.id)!.status).toBe("Onboarding");
    expect(pipeline.candidates.get(candidate.id)!.stage).toBe("Onboarding");
  });

  it("rejects candidate with low ATS score", () => {
    const { application: app } = pipeline.submitApplication(
      { full_name: "Low Scorer", email: "low@example.com", experience_years: 1, stage: "" },
      jobForm.id,
    );
    pipeline.screenApplication(app.id, 45);
    expect(pipeline.applications.get(app.id)!.status).toBe("Rejected");
  });

  it("disqualifies candidate with excessive violations", () => {
    const { application: app } = pipeline.submitApplication(
      { full_name: "Cheater", email: "cheat@example.com", experience_years: 3, stage: "" },
      jobForm.id,
    );
    pipeline.screenApplication(app.id, 80);
    const token = pipeline.createAssessmentToken("assess-2", app.id);
    const attempt = pipeline.gradeAssessment(token.id, 90, 6, 5, 70);
    expect(attempt.passed).toBe(false);
    expect(attempt.score).toBe(0);
    expect(pipeline.applications.get(app.id)!.status).toBe("Rejected");
    expect(pipeline.tokens.get(token.id)!.status).toBe("Disqualified");
  });

  it("prevents duplicate applications", () => {
    pipeline.submitApplication(
      { full_name: "Dup", email: "dup@example.com", experience_years: 2, stage: "" },
      jobForm.id,
    );
    expect(() => {
      pipeline.submitApplication(
        { full_name: "Dup Again", email: "dup@example.com", experience_years: 2, stage: "" },
        jobForm.id,
      );
    }).toThrow("Application Already Submitted");
  });

  it("prevents offer generation before interview clearance", () => {
    const { application: app } = pipeline.submitApplication(
      { full_name: "Early", email: "early@example.com", experience_years: 4, stage: "" },
      jobForm.id,
    );
    pipeline.screenApplication(app.id, 80);
    const token = pipeline.createAssessmentToken("assess-3", app.id);
    pipeline.gradeAssessment(token.id, 75, 0, 5, 70);
    // Try to generate offer without interview
    expect(() => pipeline.generateOffer(app.id, 1000000)).toThrow("Interview not cleared");
  });

  it("prevents sending unapproved offer", () => {
    const { application: app } = pipeline.submitApplication(
      { full_name: "Unapproved", email: "unapp@example.com", experience_years: 5, stage: "" },
      jobForm.id,
    );
    pipeline.screenApplication(app.id, 90);
    const token = pipeline.createAssessmentToken("assess-4", app.id);
    pipeline.gradeAssessment(token.id, 85, 0, 5, 70);
    pipeline.scheduleInterview(app.id);
    pipeline.clearInterview(app.id);
    const offer = pipeline.generateOffer(app.id, 3000000);
    // Try to send without approval
    expect(() => pipeline.sendOffer(offer.id)).toThrow("Offer not approved");
  });

  it("handles offer decline flow", () => {
    const { application: app } = pipeline.submitApplication(
      { full_name: "Decliner", email: "decline@example.com", experience_years: 5, stage: "" },
      jobForm.id,
    );
    pipeline.screenApplication(app.id, 90);
    const token = pipeline.createAssessmentToken("assess-5", app.id);
    pipeline.gradeAssessment(token.id, 85, 0, 5, 70);
    pipeline.scheduleInterview(app.id);
    pipeline.clearInterview(app.id);
    const offer = pipeline.generateOffer(app.id, 3000000);
    pipeline.approveOffer(offer.id);
    pipeline.sendOffer(offer.id);

    pipeline.respondToOffer(offer.id, "declined");
    expect(pipeline.offers.get(offer.id)!.status).toBe("Declined");
    expect(pipeline.applications.get(app.id)!.status).toBe("Offer Declined");
  });
});
