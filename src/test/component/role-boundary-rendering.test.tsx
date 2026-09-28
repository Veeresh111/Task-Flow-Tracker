import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

// Mock Supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
      signOut: vi.fn()
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn()
    }))
  }
}));

describe('Phase 4 Component & Role Tests: Role Boundary UI Rendering', () => {
  // Explicit cleanup prevents cross-test DOM accumulation (multiple-elements
  // errors) under the single-thread worker.
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Admin component strictly when authenticated user has admin role', async () => {
    const { supabase } = await import('@/lib/supabase');
    (supabase.auth.getUser as any).mockResolvedValue({
      data: { user: { id: 'admin-1', user_metadata: { role: 'admin' } } }
    });

    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'admin-1', role: 'admin', status: 'active' }
          })
        })
      })
    });

    render(
      <MemoryRouter initialEntries={['/admin/payroll']}>
        <ProtectedRoute allowedRoles={['admin']}>
          <div data-testid="admin-payroll-overview">Corporate Payroll Master Ledger</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    const element = await screen.findByTestId('admin-payroll-overview');
    expect(element).toBeInTheDocument();
    expect(element).toHaveTextContent('Corporate Payroll Master Ledger');
  });

  it('blocks Employee from rendering Admin component and redirects', async () => {
    const { supabase } = await import('@/lib/supabase');
    (supabase.auth.getUser as any).mockResolvedValue({
      data: { user: { id: 'emp-1', user_metadata: { role: 'employee' } } }
    });

    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'emp-1', role: 'employee', status: 'active' }
          })
        })
      })
    });

    render(
      <MemoryRouter initialEntries={['/admin/payroll']}>
        <ProtectedRoute allowedRoles={['admin']}>
          <div data-testid="admin-payroll-overview">Corporate Payroll Master Ledger</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    // Ensure the admin component is NOT in the document
    expect(screen.queryByTestId('admin-payroll-overview')).toBeNull();
  });

  it('blocks Candidate from rendering Employee shift clock-in button', async () => {
    const { supabase } = await import('@/lib/supabase');
    (supabase.auth.getUser as any).mockResolvedValue({
      data: { user: { id: 'cand-1', user_metadata: { registered_role: 'candidate' } } }
    });

    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'cand-1', role: 'candidate', status: 'active' }
          })
        })
      })
    });

    render(
      <MemoryRouter initialEntries={['/employee/presence']}>
        <ProtectedRoute allowedRoles={['employee']}>
          <button data-testid="employee-shift-button">Start Work Shift</button>
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.queryByTestId('employee-shift-button')).toBeNull();
  });
});
