import { describe, it, expect } from "vitest";

function formatINR(amount: number): string {
  const num = Math.round(amount);
  const str = num.toString();
  const lastThree = str.slice(-3);
  const rest = str.slice(0, -3);
  const formatted = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + lastThree : lastThree;
  return "₹" + formatted;
}

describe("Payslip PDF — formatINR", () => {
  it("formats zero", () => {
    expect(formatINR(0)).toBe("₹0");
  });

  it("formats hundreds", () => {
    expect(formatINR(200)).toBe("₹200");
  });

  it("formats thousands", () => {
    expect(formatINR(5000)).toBe("₹5,000");
  });

  it("formats ten-thousands", () => {
    expect(formatINR(25000)).toBe("₹25,000");
  });

  it("formats lakhs", () => {
    expect(formatINR(125000)).toBe("₹1,25,000");
  });

  it("formats crores", () => {
    expect(formatINR(12500000)).toBe("₹1,25,00,000");
  });

  it("rounds decimals", () => {
    expect(formatINR(12345.67)).toBe("₹12,346");
  });

  it("formats typical annual CTC (12 LPA)", () => {
    expect(formatINR(1200000)).toBe("₹12,00,000");
  });

  it("formats typical monthly net pay", () => {
    expect(formatINR(75680)).toBe("₹75,680");
  });

  it("formats PF amount (capped at 1800)", () => {
    expect(formatINR(1800)).toBe("₹1,800");
  });
});

function buildPayslipFileName(name: string, month: number, year: number, version: number): string {
  const sanitizedName = name.replace(/\s+/g, "_");
  return `payslip_${sanitizedName}_${month}_${year}_v${version}.pdf`;
}

describe("Payslip PDF — fileName", () => {
  it("generates file name for simple name", () => {
    expect(buildPayslipFileName("John Doe", 6, 2026, 1)).toBe("payslip_John_Doe_6_2026_v1.pdf");
  });

  it("handles names with multiple spaces", () => {
    expect(buildPayslipFileName("Alice  Marie  Smith", 1, 2026, 2)).toBe("payslip_Alice_Marie_Smith_1_2026_v2.pdf");
  });

  it("handles single name", () => {
    expect(buildPayslipFileName("Veeresh", 12, 2025, 1)).toBe("payslip_Veeresh_12_2025_v1.pdf");
  });
});
