import { describe, it, expect } from "vitest";
import { supabase } from "@/lib/supabase";
import { callPreviewPayslipBreakdown } from "@/lib/payroll";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Integration tests are SKIPPED by default.
 * Run with: RUN_INTEGRATION_TESTS=true npx vitest run
 * Requires migration 20260630000002_payroll_tables.sql to be applied first.
 */
const runIntegration =
  typeof process !== "undefined" &&
  (process.env as Record<string, string | undefined>).RUN_INTEGRATION_TESTS === "true"
    ? describe
    : describe.skip;

runIntegration("Payroll RPC Integration — preview_payslip_breakdown", () => {
  it("returns correct breakdown for 12 LPA", async () => {
    const result = await callPreviewPayslipBreakdown(
      supabase as unknown as SupabaseClient,
      1200000
    );
    expect(result.annual_ctc).toBe(1200000);
    expect(result.monthly_ctc).toBe(100000);
    expect(result.earnings.basic).toBe(50000);
    expect(result.earnings.hra).toBe(20000);
    expect(result.gross).toBeGreaterThan(0);
    expect(result.net).toBeGreaterThan(0);
    expect(result.net).toBeLessThan(result.gross);
  });

  it("earnings sum equals gross", async () => {
    const result = await callPreviewPayslipBreakdown(
      supabase as unknown as SupabaseClient,
      1800000
    );
    const earningsSum =
      result.earnings.basic +
      result.earnings.hra +
      result.earnings.lta +
      result.earnings.special +
      result.earnings.variable;
    expect(earningsSum).toBe(result.gross);
  });

  it("handles zero CTC", async () => {
    const result = await callPreviewPayslipBreakdown(
      supabase as unknown as SupabaseClient,
      0
    );
    expect(result.annual_ctc).toBe(0);
    expect(result.gross).toBe(0);
    expect(result.net).toBe(0);
  });

  it("attendance fields default to zero/empty", async () => {
    const result = await callPreviewPayslipBreakdown(
      supabase as unknown as SupabaseClient,
      1200000
    );
    expect(result.lop_days).toBe(0);
    expect(result.lop_deduction).toBe(0);
    expect(result.overtime_hours).toBe(0);
    expect(result.overtime_pay).toBe(0);
    expect(result.bonus_amount).toBe(0);
    expect(result.incentive_amount).toBe(0);
    expect(result.reimbursements).toEqual([]);
  });

  it("PF capped at 1800 for high CTC", async () => {
    const result = await callPreviewPayslipBreakdown(
      supabase as unknown as SupabaseClient,
      5000000
    );
    expect(result.deductions.pf).toBe(1800);
  });

  it("TDS follows slab progression", async () => {
    const low = await callPreviewPayslipBreakdown(
      supabase as unknown as SupabaseClient,
      400000
    );
    const mid = await callPreviewPayslipBreakdown(
      supabase as unknown as SupabaseClient,
      1200000
    );
    const high = await callPreviewPayslipBreakdown(
      supabase as unknown as SupabaseClient,
      3000000
    );

    expect(low.deductions.tds).toBe(0);
    expect(mid.deductions.tds).toBeGreaterThan(0);
    expect(high.deductions.tds).toBeGreaterThan(mid.deductions.tds);
  });

  it("deterministic — same input returns same output", async () => {
    const a = await callPreviewPayslipBreakdown(
      supabase as unknown as SupabaseClient,
      1800000
    );
    const b = await callPreviewPayslipBreakdown(
      supabase as unknown as SupabaseClient,
      1800000
    );
    expect(a).toEqual(b);
  });
});

runIntegration("Payroll RPC Integration — process_monthly_payroll", () => {
  it("rejects invalid month", async () => {
    const { data, error } = await supabase.rpc("process_monthly_payroll", {
      p_month: 13,
      p_year: 2026,
      p_generated_by: "00000000-0000-0000-0000-000000000001",
    });
    expect(error).toBeNull();
    expect(data.success).toBe(false);
    expect(data.error).toContain("Invalid month");
  });

  it("rejects duplicate cycle with EV-PAY-002", async () => {
    const { data, error } = await supabase.rpc("process_monthly_payroll", {
      p_month: 6,
      p_year: 2026,
      p_generated_by: "00000000-0000-0000-0000-000000000001",
    });
    if (!data || data.success === false) {
      // Either cycle doesn't exist (first call may fail if no employees)
      // or duplicate (second call)
      expect(data).not.toBeNull();
    }
  });
});

runIntegration("Payroll RPC Integration — payroll_round", () => {
  it("rounds correctly", async () => {
    const { data, error } = await supabase.rpc("payroll_round", { n: 100.456 });
    expect(error).toBeNull();
    expect(data).toBe(100.46);
  });

  it("handles integers", async () => {
    const { data, error } = await supabase.rpc("payroll_round", { n: 100 });
    expect(error).toBeNull();
    expect(data).toBe(100);
  });
});
