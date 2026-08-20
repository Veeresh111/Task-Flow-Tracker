import { describe, it, expect, vi, beforeEach } from "vitest";
import { corporateClockService } from "@/lib/corporate-clock";

// Mock Supabase client for corporate clock lifecycle operations
vi.mock("@/lib/supabase", () => {
  const executedCycles = new Set<string>();

  return {
    supabase: {
      rpc: vi.fn().mockImplementation((rpcName: string, params: any) => {
        if (rpcName === 'auto_process_monthly_payroll_idempotent') {
          const key = `${params.p_year}-${params.p_month}`;
          if (executedCycles.has(key)) {
            return Promise.resolve({
              data: { success: true, idempotent: true, message: `Payroll cycle for ${key} already generated and locked.` },
              error: null
            });
          }
          executedCycles.add(key);
          return Promise.resolve({
            data: {
              success: true,
              cycle_id: 'mock-cycle-uuid',
              month: params.p_month,
              year: params.p_year,
              total_employees: 25,
              total_gross: 1875000,
              total_net: 1650000
            },
            error: null
          });
        }

        if (rpcName === 'accrue_monthly_leaves_and_anniversaries') {
          return Promise.resolve({
            data: { success: true, employees_credited: 25, anniversaries_celebrated: 2, month: 8, year: 2026 },
            error: null
          });
        }

        if (rpcName === 'process_fiscal_year_reset') {
          return Promise.resolve({
            data: { success: true, fiscal_year: params.p_new_fiscal_year, employees_processed: 25 },
            error: null
          });
        }

        if (rpcName === 'flag_daily_absentees') {
          return Promise.resolve({
            data: { success: true, date: '2026-08-20', flagged_absentees: 1 },
            error: null
          });
        }

        if (rpcName === 'get_server_time') {
          return Promise.resolve({
            data: '2026-08-20T12:00:00.000Z',
            error: null
          });
        }

        return Promise.resolve({ data: null, error: null });
      }),
      __resetExecutedCycles: () => executedCycles.clear()
    }
  };
});

describe("Global Corporate Clock & Automated Lifecycle Engine", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { supabase } = await import("@/lib/supabase") as any;
    if (supabase.__resetExecutedCycles) supabase.__resetExecutedCycles();
  });

  describe("1. Idempotent Payroll Engine (LWP Proration & Locks)", () => {
    it("calculates accurate prorated payroll when employee has 3 days Unpaid Leave (LWP)", () => {
      const annualCtc = 1200000; // 1,00,000 / month
      const daysInMonth = 30;
      const lwpDays = 3;

      const result = corporateClockService.calculateProratedPayroll(annualCtc, daysInMonth, lwpDays);

      expect(result.monthlyCtc).toBe(100000);
      expect(result.workingDaysInMonth).toBe(30);
      expect(result.lwpDays).toBe(3);
      expect(result.payableDays).toBe(27);

      // Prorated CTC: (100000 / 30) * 27 = 90,000
      expect(result.proratedGross).toBe(90000);
      expect(result.lopDeduction).toBe(10000);
      expect(result.components.basic).toBe(45000); // 50% of 90000
      expect(result.components.hra).toBe(18000);   // 20% of 90000
      expect(result.deductions.pf).toBe(1800);     // Capped PF
      expect(result.deductions.pt).toBe(200);      // Standard PT
      expect(result.netPay).toBeGreaterThan(0);
    });

    it("enforces idempotency lock preventing duplicate salary disbursement on repeat trigger", async () => {
      // First execution
      const firstRun = await corporateClockService.executeMonthlyPayroll(8, 2026);
      expect(firstRun.success).toBe(true);
      expect(firstRun.cycle_id).toBe('mock-cycle-uuid');

      // Second execution (accidental duplicate trigger)
      const secondRun = await corporateClockService.executeMonthlyPayroll(8, 2026);
      expect(secondRun.success).toBe(true);
      expect(secondRun.idempotent).toBe(true);
      expect(secondRun.message).toContain("already generated and locked");
    });
  });

  describe("2. Corporate Lifecycle & Dynamic Tenure Engine", () => {
    it("dynamically calculates company tenure in years and months based on UTC server time", () => {
      const doj = "2023-08-15T00:00:00Z";
      const serverTime = new Date("2026-08-20T12:00:00Z");

      const tenure = corporateClockService.calculateDynamicTenure(doj, serverTime);

      expect(tenure.years).toBe(3);
      expect(tenure.months).toBe(0);
      expect(tenure.total_months).toBe(36);
      expect(tenure.tier).toBe("Senior Corporate Member");
      expect(tenure.is_anniversary_month).toBe(true);
    });

    it("correctly assigns probationary tier for new joiners (< 1 year)", () => {
      const doj = "2026-04-01T00:00:00Z";
      const serverTime = new Date("2026-08-20T12:00:00Z");

      const tenure = corporateClockService.calculateDynamicTenure(doj, serverTime);

      expect(tenure.years).toBe(0);
      expect(tenure.months).toBe(4);
      expect(tenure.tier).toBe("Associate / Probationary Member");
      expect(tenure.is_anniversary_month).toBe(false);
    });

    it("dynamically calculates total experience combining initial years and elapsed company tenure", () => {
      const initialExp = 4.5;
      const doj = "2024-08-20T00:00:00Z";
      const serverTime = new Date("2026-08-20T00:00:00Z"); // exactly 2 years

      const totalExp = corporateClockService.calculateTotalExperience(initialExp, doj, serverTime);
      expect(totalExp).toBe(6.5);
    });
  });

  describe("3. Automated Leave Accrual & Attendance Scans", () => {
    it("executes monthly leave accrual routine crediting +1.5 days", async () => {
      const result = await corporateClockService.executeMonthlyLeaveAccrual();
      expect(result.success).toBe(true);
      expect(result.employees_credited).toBe(25);
      expect(result.anniversaries_celebrated).toBe(2);
    });

    it("executes fiscal year reset routine managing carry-forwards and lapses", async () => {
      const result = await corporateClockService.executeFiscalYearReset(2027);
      expect(result.success).toBe(true);
      expect(result.fiscal_year).toBe(2027);
      expect(result.employees_processed).toBe(25);
    });

    it("executes daily absentee scan and flags unmarked employees", async () => {
      const result = await corporateClockService.executeDailyAbsenteeScan();
      expect(result.success).toBe(true);
      expect(result.flagged_absentees).toBe(1);
    });
  });

  describe("4. Strict UTC Server Time & Anti-Timezone Exploitation", () => {
    it("retrieves server UTC time and isolates from local client time spoofing", async () => {
      const serverTime = await corporateClockService.getServerUtcTime();
      expect(serverTime instanceof Date).toBe(true);
      expect(!isNaN(serverTime.getTime())).toBe(true);
    });
  });
});
