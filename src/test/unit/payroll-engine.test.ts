import { describe, it, expect } from "vitest";
import {
  getDefaultSalaryStructure,
  roundToTwo,
  calculatePF,
  calculatePT,
  calculateTDS,
  calculatePayslipBreakdown,
  formatINR,
  type SalaryStructure,
  type PayslipBreakdown,
} from "@/lib/payroll";

describe("Payroll Engine — getDefaultSalaryStructure", () => {
  it("returns the standard Indian IT structure", () => {
    const s = getDefaultSalaryStructure();
    expect(s.basic_pct).toBe(50);
    expect(s.hra_pct).toBe(20);
    expect(s.lta_pct).toBe(10);
    expect(s.special_pct).toBe(10);
    expect(s.variable_pct).toBe(10);
    expect(s.pf_pct).toBe(12);
    expect(s.pt_amount).toBe(200);
  });

  it("returns a new object each call (immutable)", () => {
    const a = getDefaultSalaryStructure();
    const b = getDefaultSalaryStructure();
    a.basic_pct = 99;
    expect(b.basic_pct).toBe(50);
  });
});

describe("Payroll Engine — roundToTwo", () => {
  it("rounds to 2 decimal places", () => {
    expect(roundToTwo(100.456)).toBe(100.46);
    expect(roundToTwo(100.454)).toBe(100.45);
  });

  it("handles integers", () => {
    expect(roundToTwo(100)).toBe(100);
  });

  it("handles zero", () => {
    expect(roundToTwo(0)).toBe(0);
  });

  it("handles negative numbers", () => {
    expect(roundToTwo(-50.123)).toBe(-50.12);
  });
});

describe("Payroll Engine — calculatePF", () => {
  it("calculates 12% of basic for low salaries", () => {
    const basic = 20000; // monthly
    // 12% of 20000 = 2400, but capped at 1800
    expect(calculatePF(basic, 12)).toBe(1800);
  });

  it("caps PF at ₹1,800 per month", () => {
    const basic = 50000;
    expect(calculatePF(basic, 12)).toBe(1800);
  });

  it("returns correct PF below cap", () => {
    const basic = 10000;
    expect(calculatePF(basic, 12)).toBe(1200);
  });

  it("returns 0 for zero basic", () => {
    expect(calculatePF(0, 12)).toBe(0);
  });

  it("uses custom PF percentage", () => {
    expect(calculatePF(10000, 10)).toBe(1000);
  });
});

describe("Payroll Engine — calculatePT", () => {
  it("returns ₹200 for active salary", () => {
    expect(calculatePT(50000, 200)).toBe(200);
  });

  it("returns 0 for zero salary", () => {
    expect(calculatePT(0, 200)).toBe(0);
  });

  it("uses custom PT amount", () => {
    expect(calculatePT(50000, 150)).toBe(150);
  });
});

describe("Payroll Engine — calculateTDS", () => {
  it("returns 0 for CTC ≤ ₹4,00,000", () => {
    expect(calculateTDS(400000)).toBe(0);
    expect(calculateTDS(250000)).toBe(0);
  });

  it("calculates 5% for ₹4,00,001–₹8,00,000", () => {
    expect(calculateTDS(600000)).toBe(10000); // (600000 - 400000) * 0.05
    expect(calculateTDS(800000)).toBe(20000); // (800000 - 400000) * 0.05
  });

  it("calculates 10% for ₹8,00,001–₹12,00,000", () => {
    // 20000 + (1000000 - 800000) * 0.10
    expect(calculateTDS(1000000)).toBe(40000);
    expect(calculateTDS(1200000)).toBe(60000);
  });

  it("calculates 15% for ₹12,00,001–₹16,00,000", () => {
    // 60000 + (1400000 - 1200000) * 0.15
    expect(calculateTDS(1400000)).toBe(90000);
    expect(calculateTDS(1600000)).toBe(120000);
  });

  it("calculates 20% for ₹16,00,001–₹20,00,000", () => {
    // 120000 + (1800000 - 1600000) * 0.20
    expect(calculateTDS(1800000)).toBe(160000);
    expect(calculateTDS(2000000)).toBe(200000);
  });

  it("calculates 25% for ₹20,00,001–₹24,00,000", () => {
    // 200000 + (2200000 - 2000000) * 0.25
    expect(calculateTDS(2200000)).toBe(250000);
    expect(calculateTDS(2400000)).toBe(300000);
  });

  it("calculates 30% for CTC > ₹24,00,000", () => {
    // 300000 + (3000000 - 2400000) * 0.30
    expect(calculateTDS(3000000)).toBe(480000);
  });

  it("handles exact bracket boundaries", () => {
    expect(calculateTDS(400000)).toBe(0);
    expect(calculateTDS(800000)).toBe(20000);
    expect(calculateTDS(1200000)).toBe(60000);
    expect(calculateTDS(1600000)).toBe(120000);
    expect(calculateTDS(2000000)).toBe(200000);
    expect(calculateTDS(2400000)).toBe(300000);
  });
});

describe("Payroll Engine — calculatePayslipBreakdown", () => {
  const CTC = 1200000; // ₹12 LPA
  const result = calculatePayslipBreakdown(CTC);

  it("stores annual CTC correctly", () => {
    expect(result.annual_ctc).toBe(1200000);
  });

  it("calculates monthly CTC as annual / 12", () => {
    expect(result.monthly_ctc).toBe(100000);
  });

  it("calculates earnings components from default structure", () => {
    expect(result.earnings.basic).toBe(50000);   // 50% of 100000
    expect(result.earnings.hra).toBe(20000);     // 20%
    expect(result.earnings.lta).toBe(10000);     // 10%
    expect(result.earnings.special).toBe(10000); // 10%
    expect(result.earnings.variable).toBe(10000); // 10%
  });

  it("gross equals sum of all earnings", () => {
    const { basic, hra, lta, special, variable } = result.earnings;
    expect(result.gross).toBe(basic + hra + lta + special + variable);
  });

  it("calculates deductions correctly", () => {
    // PF = min(50000 * 0.12, 1800) = 1800
    expect(result.deductions.pf).toBe(1800);
    // PT = 200
    expect(result.deductions.pt).toBe(200);
    // TDS = (1200000 - 800000) * 0.10 + 20000 = 60000 annual → 5000 monthly
    expect(result.deductions.tds).toBe(5000);
  });

  it("net = gross - total deductions", () => {
    const totalDed = result.deductions.pf + result.deductions.pt + result.deductions.tds;
    expect(result.net).toBe(result.gross - totalDed);
  });

  it("uses custom salary structure when provided", () => {
    const customStructure: SalaryStructure = {
      basic_pct: 60,
      hra_pct: 10,
      lta_pct: 5,
      special_pct: 15,
      variable_pct: 10,
      pf_pct: 12,
      pt_amount: 200,
    };
    const customResult = calculatePayslipBreakdown(CTC, customStructure);
    expect(customResult.earnings.basic).toBe(60000); // 60% of 100000
    expect(customResult.earnings.lta).toBe(5000);    // 5%
  });

  it("returns zeros for zero CTC", () => {
    const zero = calculatePayslipBreakdown(0);
    expect(zero.annual_ctc).toBe(0);
    expect(zero.monthly_ctc).toBe(0);
    expect(zero.earnings.basic).toBe(0);
    expect(zero.deductions.pf).toBe(0);
    expect(zero.gross).toBe(0);
    expect(zero.net).toBe(0);
  });

  it("attendance fields default to zero/empty", () => {
    const result = calculatePayslipBreakdown(1200000);
    expect(result.lop_days).toBe(0);
    expect(result.lop_deduction).toBe(0);
    expect(result.overtime_hours).toBe(0);
    expect(result.overtime_pay).toBe(0);
    expect(result.bonus_amount).toBe(0);
    expect(result.incentive_amount).toBe(0);
    expect(result.reimbursements).toEqual([]);
  });

  it("handles high CTC (₹50 LPA)", () => {
    const high = calculatePayslipBreakdown(5000000);
    expect(high.monthly_ctc).toBe(416666.67);
    expect(high.earnings.basic).toBe(208333.34);
    // PF capped at 1800, PT = 200, TDS at 30% slab
    const totalDed = high.deductions.pf + high.deductions.pt + high.deductions.tds;
    expect(high.net).toBe(high.gross - totalDed);
  });

  it("produces deterministic results (same input = same output)", () => {
    const a = calculatePayslipBreakdown(750000);
    const b = calculatePayslipBreakdown(750000);
    expect(a).toEqual(b);
  });
});

describe("Payroll Engine — formatINR", () => {
  it("formats as INR currency", () => {
    expect(formatINR(50000)).toContain("₹");
    expect(formatINR(50000)).toContain("50");
  });

  it("handles lakh format", () => {
    const formatted = formatINR(1200000);
    expect(formatted).toContain("₹");
    expect(formatted).toContain("12");
  });

  it("handles zero", () => {
    expect(formatINR(0)).toContain("0");
  });
});


