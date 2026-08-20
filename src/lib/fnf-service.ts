import { supabase } from "@/lib/supabase";

export interface FnFCalculation {
  annualCtc: number;
  monthlyCtc: number;
  annualBasic: number;
  lastWorkingDay: string;
  daysInMonth: number;
  daysWorked: number;
  proratedSalary: number;
  leaveBalanceAtExit: number;
  leaveEncashmentAmount: number;
  noticeShortfallDays: number;
  noticeShortfallDeduction: number;
  tenureYears: number;
  gratuityAmount: number;
  grossSettlement: number;
  totalDeductions: number;
  netPayable: number;
}

export const fnfService = {
  /**
   * Pure Deterministic Full-and-Final (FnF) Mathematical Calculator
   */
  calculateFnF(
    annualCtc: number,
    lastWorkingDayStr: string,
    leaveBalance: number = 0,
    noticeShortfallDays: number = 0,
    tenureYears: number = 0
  ): FnFCalculation {
    const lwd = new Date(lastWorkingDayStr);
    const year = lwd.getUTCFullYear();
    const month = lwd.getUTCMonth() + 1;

    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const daysWorked = lwd.getUTCDate();

    const monthlyCtc = Number((annualCtc / 12).toFixed(2));
    const annualBasic = Number((annualCtc * 0.50).toFixed(2)); // Standard 50% Basic

    // 1. Prorated Final Month Salary
    const proratedSalary = Number(((monthlyCtc / daysInMonth) * daysWorked).toFixed(2));

    // 2. Leave Encashment: (Annual Basic / 365) * Remaining PL Balance
    const safeLeaveBalance = Math.max(0, leaveBalance);
    const leaveEncashmentAmount = Number(((annualBasic / 365.0) * safeLeaveBalance).toFixed(2));

    // 3. Notice Period Shortfall Deduction
    const safeShortfallDays = Math.max(0, noticeShortfallDays);
    const noticeShortfallDeduction = Number(((monthlyCtc / daysInMonth) * safeShortfallDays).toFixed(2));

    // 4. Statutory Gratuity (Tenure >= 5 Years: (15 * Monthly Basic / 26) * Tenure Years)
    let gratuityAmount = 0;
    if (tenureYears >= 5.0) {
      const monthlyBasic = annualBasic / 12.0;
      gratuityAmount = Number(((15.0 * monthlyBasic / 26.0) * tenureYears).toFixed(2));
    }

    // 5. Net Settlement Calculation
    const grossSettlement = Number((proratedSalary + leaveEncashmentAmount + gratuityAmount).toFixed(2));
    const totalDeductions = Number(noticeShortfallDeduction.toFixed(2));
    const netPayable = Number(Math.max(0, grossSettlement - totalDeductions).toFixed(2));

    return {
      annualCtc,
      monthlyCtc,
      annualBasic,
      lastWorkingDay: lwd.toISOString().split("T")[0],
      daysInMonth,
      daysWorked,
      proratedSalary,
      leaveBalanceAtExit: safeLeaveBalance,
      leaveEncashmentAmount,
      noticeShortfallDays: safeShortfallDays,
      noticeShortfallDeduction,
      tenureYears,
      gratuityAmount,
      grossSettlement,
      totalDeductions,
      netPayable
    };
  },

  /**
   * Process Atomic Employee Offboarding & FnF Settlement via Database RPC
   */
  async processOffboarding(
    employeeId: string,
    lastWorkingDay: string,
    noticeShortfallDays: number = 0,
    settledBy?: string,
    callerRole?: string
  ) {
    try {
      // 1. Controller / Middleware RBAC Check
      if (callerRole && !["admin", "hr"].includes(callerRole.toLowerCase())) {
        console.warn(`🚨 [SECURITY_RBAC_BLOCKED] Caller with role '${callerRole}' attempted offboarding.`);
        throw new Error(`403 Forbidden: User with role '${callerRole}' is not authorized to execute FnF Settlements.`);
      }

      const { data, error } = await supabase.rpc("process_employee_fnf_settlement", {
        p_employee_id: employeeId,
        p_last_working_day: lastWorkingDay,
        p_notice_shortfall_days: noticeShortfallDays,
        p_settled_by: settledBy || null
      });

      if (error) throw error;
      if (data && data.status === 403) {
        throw new Error(data.error || "403 Forbidden: Unauthorized access.");
      }
      return data;
    } catch (err: any) {
      console.error("[FNF_SERVICE_ERROR] processOffboarding failed:", err.message);
      throw err;
    }
  },

  /**
   * Query Existing FnF Settlement Record
   */
  async getSettlement(employeeId: string) {
    const { data, error } = await supabase
      .from("fnf_settlements")
      .select("*")
      .eq("employee_id", employeeId)
      .maybeSingle();

    if (error) throw error;
    return data;
  }
};
