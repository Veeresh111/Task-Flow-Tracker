import { supabase } from "@/lib/supabase";

export interface CorporateTenure {
  years: number;
  months: number;
  total_months: number;
  tier: string;
  is_anniversary_month: boolean;
  date_of_joining?: string;
}

export interface ProratedPayrollResult {
  monthlyCtc: number;
  workingDaysInMonth: number;
  lwpDays: number;
  payableDays: number;
  proratedGross: number;
  lopDeduction: number;
  components: {
    basic: number;
    hra: number;
    lta: number;
    special: number;
    variable: number;
  };
  deductions: {
    pf: number;
    pt: number;
    tds: number;
    totalDeductions: number;
  };
  netPay: number;
}

export const corporateClockService = {
  /**
   * 1. Server-Side Strict UTC Clock (Guards Against Client Timezone Exploitation)
   */
  async getServerUtcTime(): Promise<Date> {
    try {
      // Direct SQL UTC now() from Postgres
      const { data, error } = await supabase.rpc('get_server_time');
      if (!error && data) {
        return new Date(data);
      }
    } catch {
      // Fall through to strict UTC instantiation
    }
    const now = new Date();
    return new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      now.getUTCHours(),
      now.getUTCMinutes(),
      now.getUTCSeconds()
    ));
  },

  /**
   * 2. Dynamic Experience & Company Tenure Calculation (No Naive +1 Counter)
   */
  calculateDynamicTenure(dateOfJoining: string | Date, serverTime: Date = new Date()): CorporateTenure {
    const doj = new Date(dateOfJoining);
    if (isNaN(doj.getTime()) || doj > serverTime) {
      return {
        years: 0,
        months: 0,
        total_months: 0,
        tier: "Associate / Probationary Member",
        is_anniversary_month: false
      };
    }

    let totalMonths = (serverTime.getUTCFullYear() - doj.getUTCFullYear()) * 12 + (serverTime.getUTCMonth() - doj.getUTCMonth());
    if (serverTime.getUTCDate() < doj.getUTCDate()) {
      totalMonths = Math.max(0, totalMonths - 1);
    }

    const years = Math.floor(totalMonths / 12);
    const months = totalMonths % 12;
    const isAnniversary = serverTime.getUTCMonth() === doj.getUTCMonth() && years >= 1;

    let tier = "Associate / Probationary Member";
    if (years >= 5) {
      tier = "Principal / Veteran Staff";
    } else if (years >= 3) {
      tier = "Senior Corporate Member";
    } else if (years >= 1) {
      tier = "Confirmed Staff Member";
    }

    return {
      years,
      months,
      total_months: totalMonths,
      tier,
      is_anniversary_month: isAnniversary,
      date_of_joining: doj.toISOString()
    };
  },

  /**
   * Calculate Total Experience in Years dynamically from joining date and baseline experience.
   */
  calculateTotalExperience(initialExperienceYears: number, dateOfJoining: string | Date, serverTime: Date = new Date()): number {
    const tenure = this.calculateDynamicTenure(dateOfJoining, serverTime);
    const tenureYears = Number((tenure.total_months / 12).toFixed(2));
    return Number((initialExperienceYears + tenureYears).toFixed(2));
  },

  /**
   * 3. Pure Deterministic Payroll Proration Engine (With LWP / LOP Deductions)
   */
  calculateProratedPayroll(
    annualCtc: number,
    daysInMonth: number,
    lwpDays: number = 0
  ): ProratedPayrollResult {
    const monthlyCtc = Number((annualCtc / 12).toFixed(2));
    const safeLwpDays = Math.max(0, Math.min(daysInMonth, lwpDays));
    const payableDays = Math.max(0, daysInMonth - safeLwpDays);

    const proratedMonthlyCtc = Number(((monthlyCtc / daysInMonth) * payableDays).toFixed(2));
    const lopDeduction = Number((monthlyCtc - proratedMonthlyCtc).toFixed(2));

    // Components (50% Basic, 20% HRA, 10% LTA, 10% Special, 10% Variable)
    const basic = Number((proratedMonthlyCtc * 0.50).toFixed(2));
    const hra = Number((proratedMonthlyCtc * 0.20).toFixed(2));
    const lta = Number((proratedMonthlyCtc * 0.10).toFixed(2));
    const special = Number((proratedMonthlyCtc * 0.10).toFixed(2));
    const variable = Number((proratedMonthlyCtc * 0.10).toFixed(2));
    const proratedGross = Number((basic + hra + lta + special + variable).toFixed(2));

    // Deductions (PF: 12% capped at 1800, PT: 200 if gross > 15000, TDS: estimated monthly)
    const pf = Number(Math.min(basic * 0.12, 1800).toFixed(2));
    const pt = proratedGross > 15000 ? 200 : 0;
    const taxableAnnual = Math.max(0, annualCtc - 500000);
    const tds = Number(((taxableAnnual * 0.10) / 12).toFixed(2));
    const totalDeductions = Number((pf + pt + tds + lopDeduction).toFixed(2));

    const netPay = Number(Math.max(0, proratedGross - (pf + pt + tds)).toFixed(2));

    return {
      monthlyCtc,
      workingDaysInMonth: daysInMonth,
      lwpDays: safeLwpDays,
      payableDays,
      proratedGross,
      lopDeduction,
      components: { basic, hra, lta, special, variable },
      deductions: { pf, pt, tds, totalDeductions },
      netPay
    };
  },

  /**
   * 4. Monthly Payroll Controller Execution (Invokes Idempotent Database RPC)
   */
  async executeMonthlyPayroll(month: number, year: number) {
    try {
      const { data, error } = await supabase.rpc('auto_process_monthly_payroll_idempotent', {
        p_month: month,
        p_year: year
      });
      if (error) throw error;
      return data;
    } catch (err: any) {
      console.error("[CORPORATE_CLOCK_ERROR] executeMonthlyPayroll failed:", err.message);
      throw err;
    }
  },

  /**
   * 5. Monthly Leave Accrual & Anniversary Loyalty Milestone Grant
   */
  async executeMonthlyLeaveAccrual() {
    try {
      const { data, error } = await supabase.rpc('accrue_monthly_leaves_and_anniversaries');
      if (error) throw error;
      return data;
    } catch (err: any) {
      console.error("[CORPORATE_CLOCK_ERROR] executeMonthlyLeaveAccrual failed:", err.message);
      throw err;
    }
  },

  /**
   * 6. Fiscal Year Reset Sub-routine (Carries forward and lapses expired leaves)
   */
  async executeFiscalYearReset(newFiscalYear: number) {
    try {
      const { data, error } = await supabase.rpc('process_fiscal_year_reset', {
        p_new_fiscal_year: newFiscalYear
      });
      if (error) throw error;
      return data;
    } catch (err: any) {
      console.error("[CORPORATE_CLOCK_ERROR] executeFiscalYearReset failed:", err.message);
      throw err;
    }
  },

  /**
   * 7. Daily Absentee Auto-Flagging Execution
   */
  async executeDailyAbsenteeScan() {
    try {
      const { data, error } = await supabase.rpc('flag_daily_absentees');
      if (error) throw error;
      return data;
    } catch (err: any) {
      console.error("[CORPORATE_CLOCK_ERROR] executeDailyAbsenteeScan failed:", err.message);
      throw err;
    }
  }
};
