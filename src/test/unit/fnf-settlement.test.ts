import { describe, it, expect } from "vitest";
import { fnfService } from "@/lib/fnf-service";

describe("Enterprise FnF Settlement & Offboarding Calculator", () => {
  it("calculates accurate prorated pay and leave encashment for standard exit", () => {
    const annualCtc = 1200000; // 1,00,000 / month, 6,00,000 Basic
    const lastWorkingDay = "2026-08-20"; // 20 days in August (31 days in Aug)
    const leaveBalance = 10.0;
    const noticeShortfall = 0;
    const tenureYears = 3.0;

    const result = fnfService.calculateFnF(annualCtc, lastWorkingDay, leaveBalance, noticeShortfall, tenureYears);

    expect(result.monthlyCtc).toBe(100000);
    expect(result.annualBasic).toBe(600000);
    expect(result.daysInMonth).toBe(31);
    expect(result.daysWorked).toBe(20);

    // Prorated Salary: (100000 / 31) * 20 = 64516.13
    expect(result.proratedSalary).toBe(64516.13);

    // Leave Encashment: (600000 / 365) * 10 = 16438.36
    expect(result.leaveEncashmentAmount).toBe(16438.36);
    expect(result.noticeShortfallDeduction).toBe(0);
    expect(result.gratuityAmount).toBe(0); // < 5 years tenure

    // Net Payable: 64516.13 + 16438.36 = 80954.49
    expect(result.netPayable).toBe(80954.49);
  });

  it("calculates statutory gratuity when employee tenure is 5 or more years", () => {
    const annualCtc = 1200000; // 50,000 / month Basic
    const lastWorkingDay = "2026-08-31";
    const leaveBalance = 5.0;
    const noticeShortfall = 0;
    const tenureYears = 6.0; // 6 years tenure

    const result = fnfService.calculateFnF(annualCtc, lastWorkingDay, leaveBalance, noticeShortfall, tenureYears);

    // Gratuity: (15 * 50000 / 26) * 6 = (750000 / 26) * 6 = 28846.15 * 6 = 173076.92
    expect(result.gratuityAmount).toBe(173076.92);
    expect(result.grossSettlement).toBeGreaterThan(result.proratedSalary + result.leaveEncashmentAmount);
    expect(result.netPayable).toBeCloseTo(result.proratedSalary + result.leaveEncashmentAmount + 173076.92, 1);
  });

  it("applies notice period shortfall deductions accurately", () => {
    const annualCtc = 600000; // 50,000 / mo
    const lastWorkingDay = "2026-08-15"; // 15 days worked
    const leaveBalance = 0;
    const noticeShortfall = 10; // Left 10 days early

    const result = fnfService.calculateFnF(annualCtc, lastWorkingDay, leaveBalance, noticeShortfall, 1.0);

    // Prorated Salary: (50000 / 31) * 15 = 24193.55
    expect(result.proratedSalary).toBe(24193.55);

    // Notice Deduction: (50000 / 31) * 10 = 16129.03
    expect(result.noticeShortfallDeduction).toBe(16129.03);

    // Net: 24193.55 - 16129.03 = 8064.52
    expect(result.netPayable).toBe(8064.52);
  });
});
