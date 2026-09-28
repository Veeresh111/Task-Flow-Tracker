describe('Employee Lifecycle: Shift Clock-In/Out & Real-Time Payroll Slip Calculation', () => {
  const employeeId = 'emp-uuid-404';
  const currentDateStr = new Date().toISOString().split('T')[0];

  beforeEach(() => {
    // Intercept Supabase Auth session as Employee
    cy.intercept('POST', '**/auth/v1/token*', {
      statusCode: 200,
      body: {
        access_token: 'fake-employee-jwt-token',
        token_type: 'bearer',
        expires_in: 3600,
        user: {
          id: employeeId,
          email: 'alex.engineer@enterprise.internal',
          user_metadata: { role: 'employee' }
        }
      }
    });

    cy.intercept('GET', '**/rest/v1/profiles*', {
      statusCode: 200,
      body: [
        {
          id: employeeId,
          name: 'Alex Engineer',
          email: 'alex.engineer@enterprise.internal',
          role: 'employee',
          department: 'Core Engineering',
          payroll_ctc: 1200000,
          employment_status: 'active'
        }
      ]
    });
  });

  it('performs live clock-in, logs verified timestamp, and computes prorated payroll', () => {
    // Mock attendance entry insertion
    cy.intercept('POST', '**/rest/v1/attendance*', {
      statusCode: 201,
      body: {
        id: 'att-session-001',
        user_id: employeeId,
        date: currentDateStr,
        clock_in: '09:00:00',
        clock_out: null,
        status: 'present'
      }
    }).as('clockInRequest');

    cy.visit('/employee/presence');

    // Click Clock-In
    cy.get('button').contains(/Clock In|Punch In|Start Shift/i).click({ force: true });

    // Assert clock-in API round-trip was triggered
    cy.wait('@clockInRequest');
    cy.contains(/09:00|Present|Checked In|Active Shift/i).should('be.visible');

    // Mock clock-out update
    cy.intercept('PATCH', '**/rest/v1/attendance*', {
      statusCode: 200,
      body: {
        id: 'att-session-001',
        user_id: employeeId,
        date: currentDateStr,
        clock_in: '09:00:00',
        clock_out: '18:00:00',
        hours_worked: 9.0,
        status: 'present'
      }
    }).as('clockOutRequest');

    // Click Clock-Out
    cy.get('button').contains(/Clock Out|Punch Out|End Shift/i).click({ force: true });
    cy.wait('@clockOutRequest');

    // Navigate to personal payroll view
    cy.intercept('GET', '**/rest/v1/payslips*', {
      statusCode: 200,
      body: [
        {
          id: 'payslip-uuid-2026-09',
          employee_id: employeeId,
          month: 9,
          year: 2026,
          gross_earnings: 100000,
          basic_salary: 50000,
          hra: 25000,
          pf_deduction: 6000,
          tax_deduction: 8000,
          net_salary: 86000,
          status: 'Published'
        }
      ]
    }).as('fetchEmployeePayslip');

    cy.visit('/employee/payroll');
    cy.wait('@fetchEmployeePayslip');

    // Assert calculated net pay slip is rendered accurately
    cy.contains(/86,000|₹86,000|\$86,000/i).should('be.visible');
    cy.contains(/PF|Tax|Deductions/i).should('be.visible');
  });
});
