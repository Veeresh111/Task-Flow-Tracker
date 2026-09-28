describe('Manager Lifecycle: Shift / Leave Approval & Rejection Cycle', () => {
  const managerId = 'tl-uuid-301';

  beforeEach(() => {
    cy.intercept('POST', '**/auth/v1/token*', {
      statusCode: 200,
      body: {
        access_token: 'fake-tl-jwt-token',
        token_type: 'bearer',
        expires_in: 3600,
        user: {
          id: managerId,
          email: 'manager.lead@enterprise.internal',
          user_metadata: { role: 'team_lead' }
        }
      }
    });

    cy.intercept('GET', '**/rest/v1/profiles*', {
      statusCode: 200,
      body: [
        {
          id: managerId,
          name: 'Sarah TeamLead',
          email: 'manager.lead@enterprise.internal',
          role: 'team_lead',
          department: 'Core Engineering',
          status: 'active'
        }
      ]
    });
  });

  it('allows manager to review and approve pending shift/leave adjustment', () => {
    // Intercept pending approvals query
    cy.intercept('GET', '**/rest/v1/leaves*', {
      statusCode: 200,
      body: [
        {
          id: 'leave-request-uuid-001',
          user_id: 'emp-uuid-404',
          leave_type: 'Casual',
          start_date: '2026-09-20',
          end_date: '2026-09-22',
          reason: 'Family event',
          status: 'Pending',
          profiles: {
            name: 'Alex Engineer',
            email: 'alex.engineer@enterprise.internal',
            role: 'employee'
          }
        }
      ]
    }).as('fetchPendingApprovals');

    cy.visit('/team-lead/approvals');
    cy.wait('@fetchPendingApprovals');

    cy.contains(/Alex Engineer/i).should('be.visible');
    cy.contains(/Family event/i).should('be.visible');

    // Intercept decision update
    cy.intercept('PATCH', '**/rest/v1/leaves*', {
      statusCode: 200,
      body: {
        id: 'leave-request-uuid-001',
        status: 'Approved'
      }
    }).as('approveLeave');

    // Click Approve
    cy.get('button').contains(/Approve/i).click({ force: true });
    cy.wait('@approveLeave');

    // Verify confirmation feedback
    cy.contains(/Approved|Success|Updated/i).should('be.visible');
  });

  it('allows manager to reject unauthorized shift adjustment with audit feedback', () => {
    cy.intercept('GET', '**/rest/v1/leaves*', {
      statusCode: 200,
      body: [
        {
          id: 'leave-request-uuid-002',
          user_id: 'emp-uuid-505',
          leave_type: 'Emergency',
          start_date: '2026-09-25',
          end_date: '2026-09-28',
          reason: 'Personal time',
          status: 'Pending',
          profiles: {
            name: 'Bob Intern',
            email: 'bob.intern@enterprise.internal',
            role: 'employee'
          }
        }
      ]
    }).as('fetchInternLeave');

    cy.visit('/team-lead/approvals');
    cy.wait('@fetchInternLeave');

    cy.intercept('PATCH', '**/rest/v1/leaves*', {
      statusCode: 200,
      body: {
        id: 'leave-request-uuid-002',
        status: 'Rejected'
      }
    }).as('rejectLeave');

    // Click Reject
    cy.get('button').contains(/Reject/i).click({ force: true });
    cy.wait('@rejectLeave');

    cy.contains(/Rejected|Updated/i).should('be.visible');
  });
});
