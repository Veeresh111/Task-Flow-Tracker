import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VectorMath } from '@/lib/dsa/VectorMath';
import { enforceRoleGuard, SecurityForbiddenError } from '@/lib/rbac-guard';
import { fnfService } from '@/lib/fnf-service';

// Mock Supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
      getSession: vi.fn(),
      signOut: vi.fn()
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(),
      maybeSingle: vi.fn(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis()
    }))
  }
}));

describe('Adversarial QA Suite: Edge Cases, Security Boundaries & Mathematical Invariants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. VectorMath Candidate Match Scoring Engine Edge Cases', () => {
    it('returns zero score safely on empty candidate resume text', () => {
      const result = VectorMath.computeCandidateMatchScore('', 'Distributed systems Kubernetes Go');
      expect(result.overallScore).toBe(0);
      expect(result.matchedSkills).toHaveLength(0);
    });

    it('returns zero score safely on empty job description text', () => {
      const result = VectorMath.computeCandidateMatchScore('Experienced React developer', '');
      expect(result.overallScore).toBe(0);
    });

    it('handles non-ASCII, binary, and corrupted unicode resume text without throwing', () => {
      const corruptedText = '\u0000\u0001\u0002\uFFFD\uFFFF\uD800 Corrupted \uDBFF data';
      expect(() => {
        const result = VectorMath.computeCandidateMatchScore(corruptedText, 'Python Docker AWS');
        expect(typeof result.overallScore).toBe('number');
      }).not.toThrow();
    });

    it('bounds score strictly between 0 and 100 on extreme inputs', () => {
      const identicalText = 'JavaScript TypeScript React Node PostgreSQL Docker AWS '.repeat(100);
      const result = VectorMath.computeCandidateMatchScore(identicalText, identicalText);
      expect(result.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.overallScore).toBeLessThanOrEqual(100);
    });
  });

  describe('2. RBAC Guard Security Boundary Invariants', () => {
    it('throws SecurityForbiddenError on null user session', async () => {
      const { supabase } = await import('@/lib/supabase');
      (supabase.auth.getUser as any).mockResolvedValue({
        data: { user: null },
        error: new Error('Session missing')
      });

      await expect(enforceRoleGuard(['admin'])).rejects.toThrow(SecurityForbiddenError);
    });

    it('blocks suspended or archived user accounts immediately', async () => {
      const { supabase } = await import('@/lib/supabase');
      (supabase.auth.getUser as any).mockResolvedValue({
        data: { user: { id: 'archived-user-123' } },
        error: null
      });

      (supabase.from as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'archived-user-123', role: 'admin', status: 'archived' },
              error: null
            })
          })
        })
      });

      await expect(enforceRoleGuard(['admin'])).rejects.toThrow(/suspended or archived/i);
    });

    it('blocks privilege escalation attempt: Employee calling Admin endpoint', async () => {
      await expect(
        enforceRoleGuard(['admin'], { userId: 'emp-1', role: 'employee' })
      ).rejects.toThrow(SecurityForbiddenError);
    });

    it('blocks Recruiter (HR) from Management Admin-only endpoints', async () => {
      await expect(
        enforceRoleGuard(['admin'], { userId: 'hr-1', role: 'hr' })
      ).rejects.toThrow(SecurityForbiddenError);
    });
  });

  describe('3. FnF Settlement Deterministic Mathematical Invariants', () => {
    it('clamps negative leave balances to zero without inflating deductions', () => {
      const calc = fnfService.calculateFnF(1200000, '2026-09-15', -5, 0, 3);
      expect(calc.leaveBalanceAtExit).toBe(0);
      expect(calc.leaveEncashmentAmount).toBe(0);
      expect(calc.netPayable).toBeGreaterThan(0);
    });

    it('calculates zero gratuity for tenure under 5 years', () => {
      const calc = fnfService.calculateFnF(1200000, '2026-09-30', 0, 0, 4.9);
      expect(calc.gratuityAmount).toBe(0);
    });

    it('calculates statutory gratuity accurately for tenure >= 5 years', () => {
      const annualCtc = 1200000;
      const calc = fnfService.calculateFnF(annualCtc, '2026-09-30', 0, 0, 5.0);
      // Monthly Basic = (1200000 * 0.5) / 12 = 50,000
      // Gratuity = (15 * 50000 / 26) * 5 = 144230.77
      expect(calc.gratuityAmount).toBeCloseTo(144230.77, 1);
    });

    it('ensures net payable is strictly non-negative when notice shortfall exceeds salary', () => {
      const calc = fnfService.calculateFnF(600000, '2026-09-02', 0, 30, 1);
      expect(calc.netPayable).toBeGreaterThanOrEqual(0);
    });
  });
});
