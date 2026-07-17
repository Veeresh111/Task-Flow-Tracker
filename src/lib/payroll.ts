import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================
// Enterprise Payroll Engine — PREVIEW ONLY
//
// These functions match the PL/pgSQL logic in the RPC
// (process_monthly_payroll) for use as a "digital twin" —
// employee salary previews, HR estimation, UI display.
//
// ACTUAL PAYROLL GENERATION is the exclusive domain of
// process_monthly_payroll() in Postgres. Frontend NEVER
// decides salary amounts. This engine is NEVER passed to
// the RPC — it's a visual preview tool only.
//
// All functions are pure, no side effects, no Supabase calls.
// ============================================================

export interface SalaryStructure {
  basic_pct: number;
  hra_pct: number;
  lta_pct: number;
  special_pct: number;
  variable_pct: number;
  pf_pct: number;
  pt_amount: number;
}

export interface PayslipBreakdown {
  annual_ctc: number;
  monthly_ctc: number;
  earnings: {
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
  };
  gross: number;
  net: number;
  // Attendance-ready fields (default 0 until attendance module integrates)
  lop_days: number;
  lop_deduction: number;
  overtime_hours: number;
  overtime_pay: number;
  bonus_amount: number;
  incentive_amount: number;
  reimbursements: Record<string, unknown>[];
}

// Default standard Indian IT salary structure
const DEFAULT_STRUCTURE: SalaryStructure = {
  basic_pct: 50,
  hra_pct: 20,
  lta_pct: 10,
  special_pct: 10,
  variable_pct: 10,
  pf_pct: 12,
  pt_amount: 200,
};

export function getDefaultSalaryStructure(): SalaryStructure {
  return { ...DEFAULT_STRUCTURE };
}

export function roundToTwo(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Calculate PF contribution (employee share).
 * PF = pf_pct% of basic pay, capped at ₹15,000 basic * 12% = ₹1,800
 */
export function calculatePF(basic: number, pfPct: number = DEFAULT_STRUCTURE.pf_pct): number {
  const pf = basic * (pfPct / 100);
  return roundToTwo(Math.min(pf, 1800));
}

/**
 * Professional Tax (Karnataka state).
 * PT = ₹200 flat for most salary bands.
 */
export function calculatePT(monthlyCtc: number, ptAmount: number = DEFAULT_STRUCTURE.pt_amount): number {
  if (monthlyCtc <= 0) return 0;
  return ptAmount;
}

/**
 * Simplified TDS based on Indian tax slabs (New Regime, FY 2025-26).
 * This is a simplified approximation. Real TDS depends on investments,
 * housing loan, 80C deductions, etc.
 */
export function calculateTDS(annualCTC: number): number {
  if (annualCTC <= 400000) return 0;
  if (annualCTC <= 800000) return roundToTwo((annualCTC - 400000) * 0.05);
  if (annualCTC <= 1200000) return roundToTwo(20000 + (annualCTC - 800000) * 0.10);
  if (annualCTC <= 1600000) return roundToTwo(60000 + (annualCTC - 1200000) * 0.15);
  if (annualCTC <= 2000000) return roundToTwo(120000 + (annualCTC - 1600000) * 0.20);
  if (annualCTC <= 2400000) return roundToTwo(200000 + (annualCTC - 2000000) * 0.25);
  return roundToTwo(300000 + (annualCTC - 2400000) * 0.30);
}

/**
 * Calculate full payslip breakdown from annual CTC.
 * All values are derived from the salary structure percentages.
 * Returns deterministic results — same input always produces same output.
 */
export function calculatePayslipBreakdown(
  annualCTC: number,
  structure: SalaryStructure = DEFAULT_STRUCTURE
): PayslipBreakdown {
  if (annualCTC <= 0) {
    return {
      annual_ctc: 0,
      monthly_ctc: 0,
      earnings: { basic: 0, hra: 0, lta: 0, special: 0, variable: 0 },
      deductions: { pf: 0, pt: 0, tds: 0 },
      gross: 0,
      net: 0,
    };
  }

  const monthlyCTC = roundToTwo(annualCTC / 12);

  const basic = roundToTwo(monthlyCTC * (structure.basic_pct / 100));
  const hra = roundToTwo(monthlyCTC * (structure.hra_pct / 100));
  const lta = roundToTwo(monthlyCTC * (structure.lta_pct / 100));
  const special = roundToTwo(monthlyCTC * (structure.special_pct / 100));
  const variable = roundToTwo(monthlyCTC * (structure.variable_pct / 100));

  const gross = roundToTwo(basic + hra + lta + special + variable);

  const pf = calculatePF(basic, structure.pf_pct);
  const pt = calculatePT(monthlyCTC, structure.pt_amount);
  const tdsMonthly = roundToTwo(calculateTDS(annualCTC) / 12);

  const totalDeductions = roundToTwo(pf + pt + tdsMonthly);
  const net = roundToTwo(gross - totalDeductions);

  return {
    annual_ctc: annualCTC,
    monthly_ctc: monthlyCTC,
    earnings: { basic, hra, lta, special, variable },
    deductions: { pf, pt, tds: tdsMonthly },
    gross,
    net,
    // Attendance fields: defaulted to 0 until attendance module is integrated
    lop_days: 0,
    lop_deduction: 0,
    overtime_hours: 0,
    overtime_pay: 0,
    bonus_amount: 0,
    incentive_amount: 0,
    reimbursements: [],
  };
}

/**
 * Format a number as Indian Rupees (INR).
 */
export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Call the backend preview_payslip_breakdown RPC for an authoritative
 * preview from the Postgres calculation engine.
 *
 * This is the RECOMMENDED way to preview payslips in production.
 * The pure JS calculatePayslipBreakdown() exists as a local-only fallback
 * and for unit testing — it must always match the RPC logic exactly.
 */
export async function callPreviewPayslipBreakdown(
  supabase: SupabaseClient,
  annualCtc: number
): Promise<PayslipBreakdown> {
  const { data, error } = await supabase.rpc('preview_payslip_breakdown', {
    p_annual_ctc: annualCtc,
  });

  if (error) throw error;

  const r = data as Record<string, unknown>;
  return {
    annual_ctc: Number(r.annual_ctc),
    monthly_ctc: Number(r.monthly_ctc),
    earnings: r.earnings as PayslipBreakdown['earnings'],
    deductions: r.deductions as PayslipBreakdown['deductions'],
    gross: Number(r.gross),
    net: Number(r.net),
    lop_days: 0,
    lop_deduction: 0,
    overtime_hours: 0,
    overtime_pay: 0,
    bonus_amount: 0,
    incentive_amount: 0,
    reimbursements: [],
  };
}
