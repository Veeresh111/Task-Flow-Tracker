describe('Candidate Lifecycle Phase 1: Recruiter Bulk Resume Upload & ATS Scoring', () => {
  beforeEach(() => {
    // Intercept Supabase Auth session as HR Recruiter
    cy.intercept('POST', '**/auth/v1/token*', {
      statusCode: 200,
      body: {
        access_token: 'fake-hr-jwt-token',
        token_type: 'bearer',
        expires_in: 3600,
        user: {
          id: 'hr-user-uuid-101',
          email: 'recruiter@enterprise.internal',
          user_metadata: { role: 'hr' }
        }
      }
    }).as('authSession');

    // Intercept profile query
    cy.intercept('GET', '**/rest/v1/profiles*', {
      statusCode: 200,
      body: [
        {
          id: 'hr-user-uuid-101',
          name: 'Jane Recruiter',
          email: 'recruiter@enterprise.internal',
          role: 'hr',
          department: 'Talent Acquisition',
          status: 'active'
        }
      ]
    }).as('getProfile');

    // Intercept job forms query
    cy.intercept('GET', '**/rest/v1/job_forms*', {
      statusCode: 200,
      body: [
        {
          id: 'job-form-uuid-001',
          job_title: 'Principal Distributed Systems Architect',
          status: 'Active',
          jd_text: 'Requires 10+ years experience in distributed systems, Go, Kubernetes, Kafka, and microservices.',
          requires_assessment: true,
          created_at: new Date().toISOString()
        }
      ]
    }).as('getJobForms');
  });

  it('verifies bulk resume parsing progress indicator and dynamic score display', () => {
    cy.visit('/hr/recruitment');

    // Verify recruitment dashboard loads
    cy.contains(/Recruitment|ATS Scanner|Applications/i).should('be.visible');

    // Intercept ATS screening Edge Function with realistic latency
    cy.intercept('POST', '**/functions/v1/ats-screen', {
      delayMs: 1500,
      statusCode: 200,
      body: {
        score: 92,
        verdict: 'Candidate strongly matches distributed systems architecture requirements.',
        matchedSkills: ['Distributed Systems', 'Kubernetes', 'Go', 'Kafka'],
        missingSkills: ['Terraform']
      }
    }).as('atsScreening');

    // Intercept candidate database insertion
    cy.intercept('POST', '**/rest/v1/candidates*', {
      statusCode: 201,
      body: {
        id: 'candidate-uuid-999',
        full_name: 'John Doe',
        email: 'johndoe@example.com',
        ats_score: 92,
        stage: 'Screening'
      }
    }).as('insertCandidate');

    // Select active job requisition
    cy.get('body').then(($body) => {
      if ($body.find('select, [role="combobox"]').length > 0) {
        cy.get('select, [role="combobox"]').first().click({ force: true });
      }
    });

    // Upload multiple candidate resumes
    const resume1 = {
      fileName: 'johndoe_distributed_systems.pdf',
      contents: 'Experienced Distributed Systems Engineer with 8 years in Go, Kubernetes, and Kafka architecture.',
      mimeType: 'application/pdf'
    };

    cy.get('input[type="file"]').selectFile({
      contents: Cypress.Buffer.from(resume1.contents),
      fileName: resume1.fileName,
      mimeType: resume1.mimeType
    }, { force: true });

    // Ensure parser shows scanning indicator
    cy.contains(/Parsing|Scanning|Ingested|Upload/i).should('be.visible');

    // Trigger screening pipeline
    cy.get('button').contains(/Scan|Run Bulk Scanner|Evaluate/i).click({ force: true });

    // Assert that scanning state is not instantaneous (indicates genuine processing)
    cy.contains(/Scanning|Processing|Evaluating/i).should('exist');

    // Wait for the screening completion
    cy.wait('@atsScreening', { timeout: 10000 });

    // Assert score display
    cy.contains(/92%|92/i).should('be.visible');
    cy.contains(/Distributed Systems|Go|Kubernetes/i).should('be.visible');
  });

  it('handles corrupted and zero-byte resume file uploads without crashing', () => {
    cy.visit('/hr/recruitment');

    // Upload corrupted zero-byte file
    cy.get('input[type="file"]').selectFile({
      contents: Cypress.Buffer.from(''),
      fileName: 'corrupted_zero_byte.pdf',
      mimeType: 'application/pdf'
    }, { force: true });

    // Expect system notice/error badge instead of unhandled exception
    cy.contains(/empty|corrupt|unreadable|failed|error/i, { timeout: 5000 }).should('be.visible');
  });
});
