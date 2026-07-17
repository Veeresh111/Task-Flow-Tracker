import { describe, it, expect } from "vitest";

function getPayrollPeriod(date: Date): { month: number; year: number } {
  let month = date.getMonth();
  let year = date.getFullYear();
  if (month === 0) {
    month = 12;
    year -= 1;
  }
  return { month, year };
}

describe("Auto Payroll Generation — Period Determination", () => {
  it("returns previous month for January (month 0)", () => {
    const d = new Date(2026, 0, 1);
    const { month, year } = getPayrollPeriod(d);
    expect(month).toBe(12);
    expect(year).toBe(2025);
  });

  it("returns previous month for January 15", () => {
    const d = new Date(2026, 0, 15);
    const { month, year } = getPayrollPeriod(d);
    expect(month).toBe(12);
    expect(year).toBe(2025);
  });

  it("returns previous month for February 1", () => {
    const d = new Date(2026, 1, 1);
    const { month, year } = getPayrollPeriod(d);
    expect(month).toBe(1);
    expect(year).toBe(2026);
  });

  it("returns previous month for March 1", () => {
    const d = new Date(2026, 2, 1);
    const { month, year } = getPayrollPeriod(d);
    expect(month).toBe(2);
    expect(year).toBe(2026);
  });

  it("returns previous month for December 1", () => {
    const d = new Date(2026, 11, 1);
    const { month, year } = getPayrollPeriod(d);
    expect(month).toBe(11);
    expect(year).toBe(2026);
  });

  it("returns previous month for the 15th of any month", () => {
    const d = new Date(2026, 5, 15);
    const { month, year } = getPayrollPeriod(d);
    expect(month).toBe(5);
    expect(year).toBe(2026);
  });

  it("returns previous month for the 31st of any month", () => {
    const d = new Date(2026, 6, 31);
    const { month, year } = getPayrollPeriod(d);
    expect(month).toBe(6);
    expect(year).toBe(2026);
  });

  it("handles year boundary correctly (Jan 1, 2027)", () => {
    const d = new Date(2027, 0, 1);
    const { month, year } = getPayrollPeriod(d);
    expect(month).toBe(12);
    expect(year).toBe(2026);
  });

  it("salary credited on 1st should be for previous month's work", () => {
    // Employee works in June, salary credited on July 1st
    const creditDate = new Date(2026, 6, 1);
    const { month, year } = getPayrollPeriod(creditDate);
    expect(month).toBe(6);
    expect(year).toBe(2026);
  });
});
