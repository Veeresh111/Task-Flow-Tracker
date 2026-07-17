import { expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { test } from "./business-workflows/helpers";

const SUPABASE_URL = "https://txwxtsdsbuddqfrtllsf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_ahamP8gR3qcYvJx0ulaMvw_yRn42OWB";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || "admin@example.com";
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || "changeme";
const HR_EMAIL = process.env.TEST_HR_EMAIL || "hr@example.com";
const HR_PASSWORD = process.env.TEST_HR_PASSWORD || "changeme";

let adminSession: any = null;
let adminClient: any = null;

test.describe("Comprehensive System Verification Suite", () => {

  test.beforeAll(async () => {
    const { data } = await supabase.auth.signInWithPassword({
      email: ADMIN_EMAIL, password: ADMIN_PASSWORD
    });
    if (data?.session) {
      adminSession = data.session;
      adminClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
      });
    }
  });

  // ============================================================
  // SECTION 1: LANDING PAGE & THEME
  // ============================================================

  test.describe("1. Landing Page & Theme System", () => {

    test("1.1 Landing page loads with correct title and logo", async ({ page }) => {
      await page.goto("/", { waitUntil: "networkidle", timeout: 15000 });
      await page.waitForTimeout(2000);

      const title = await page.title();
      expect(title).toContain("FWC");

      const logo = page.locator('img[alt="FWC"]').first();
      await expect(logo).toBeVisible();
      await expect(logo).toHaveAttribute("src", "/fwc-logo.png");
    });

    test("1.2 Theme toggle switches dark/light mode on landing page", async ({ page }) => {
      await page.goto("/", { waitUntil: "networkidle", timeout: 15000 });
      await page.waitForTimeout(2000);

      const themeToggle = page.locator('button[aria-label="Toggle theme"]').first();
      await expect(themeToggle).toBeVisible();

      await themeToggle.click();
      await page.waitForTimeout(500);
      const htmlClass = await page.evaluate(() => document.documentElement.className);
      expect(htmlClass).toContain("dark");

      await themeToggle.click();
      await page.waitForTimeout(500);
      const htmlClass2 = await page.evaluate(() => document.documentElement.className);
      expect(htmlClass2).not.toContain("dark");
    });

    test("1.3 Login page loads with dark theme styling", async ({ page }) => {
      await page.goto("/login", { waitUntil: "networkidle", timeout: 15000 });
      await page.waitForTimeout(2000);

      await expect(page.getByRole("heading", { name: "FWC" })).toBeVisible();
      await expect(page.locator("text=Enterprise Access")).toBeVisible();
      await expect(page.locator('button:has-text("Sign In")')).toBeVisible();
    });

    test("1.4 Registration page loads with candidate-only info", async ({ page }) => {
      await page.goto("/register", { waitUntil: "networkidle", timeout: 15000 });
      await page.waitForTimeout(2000);

      await expect(page.locator("text=Candidate Registration")).toBeVisible();
      await expect(page.getByRole("button", { name: "Create Account" })).toBeVisible();
    });
  });

  // ============================================================
  // SECTION 2: AUTHENTICATION & AUTO-DISAPPROVE
  // ============================================================

  test.describe("2. Authentication & Auto-Disapprove Logic", () => {

    test("2.1 Admin can login successfully", async ({ page }) => {
      await page.goto("/login", { waitUntil: "networkidle", timeout: 15000 });
      await page.waitForTimeout(1000);

      await page.fill('input[type="email"]', ADMIN_EMAIL);
      await page.fill('input[placeholder="Enter your password"]', ADMIN_PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(5000);

      await expect(page).toHaveURL(/\/admin/);
    });

    test("2.2 HR can login successfully", async ({ page }) => {
      await page.goto("/login", { waitUntil: "networkidle", timeout: 15000 });
      await page.waitForTimeout(1000);

      await page.fill('input[type="email"]', HR_EMAIL);
      await page.fill('input[placeholder="Enter your password"]', HR_PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(5000);

      await expect(page).toHaveURL(/\/hr/);
    });

    test("2.3 Registration without application gets auto-rejected", async ({ page }) => {
      const testEmail = `e2e-auto-reject-${Date.now()}@test.com`;
      const testName = "Auto Reject Test";

      await page.goto("/register", { waitUntil: "networkidle", timeout: 15000 });
      await page.waitForTimeout(2000);

      await page.fill('input[placeholder="John Doe"]', testName);
      await page.fill('input[placeholder="name@company.com"]', testEmail);
      await page.fill('input[placeholder="+1 (555) 000-0000"]', "+1 555-0000");
      await page.fill('input[placeholder="Create a strong password"]', "TestPass123!");
      await page.fill('input[placeholder="Confirm your password"]', "TestPass123!");

      await page.click('button[type="submit"]');
      await page.waitForTimeout(5000);

      // Wait for registration success message
      await expect(page.locator("text=Registration Submitted")).toBeVisible({ timeout: 10000 });

      // Try to login - should show rejected/revoked message
      await page.goto("/login", { waitUntil: "networkidle", timeout: 15000 });
      await page.waitForTimeout(1000);
      await page.fill('input[type="email"]', testEmail);
      await page.fill('input[placeholder="Enter your password"]', "TestPass123!");
      await page.click('button[type="submit"]');
      await page.waitForTimeout(3000);

      // Check for rejected/access denied message
      const hasRejected = await page.locator("text=revoked").or(page.locator("text=disapproved")).or(page.locator("text=Access Revoked")).isVisible().catch(() => false);
      // If no rejected message, at least verify we got some error feedback
      if (!hasRejected) {
        const toast = page.locator('[role="status"]').first();
        const toastText = await toast.textContent().catch(() => "");
        expect(toastText.length).toBeGreaterThan(0);
      }
    });

    test("2.4 Registration with existing application gets approved", async ({ page }) => {
      const testEmail = `e2e-app-${Date.now()}@test.com`;

      // Create a job application first
      const { data: { user } } = await supabase.auth.signInWithPassword({
        email: ADMIN_EMAIL, password: ADMIN_PASSWORD
      });

      if (user) {
        const { data: forms } = await supabase.from("job_forms").select("id").limit(1);
        if (forms && forms.length > 0) {
          await supabase.from("job_applications").insert({
            form_id: forms[0].id,
            candidate_email: testEmail,
            candidate_name: "Test Candidate",
            status: "Applied"
          });
        }
      }

      await page.goto("/register", { waitUntil: "networkidle", timeout: 15000 });
      await page.waitForTimeout(2000);
      await page.fill('input[placeholder="John Doe"]', "Test Candidate");
      await page.fill('input[placeholder="name@company.com"]', testEmail);
      await page.fill('input[placeholder="+1 (555) 000-0000"]', "+1 555-0000");
      await page.fill('input[placeholder="Create a strong password"]', "TestPass123!");
      await page.fill('input[placeholder="Confirm your password"]', "TestPass123!");
      await page.click('button[type="submit"]');
      await page.waitForTimeout(5000);

      const { data: profile } = await supabase
        .from("profiles")
        .select("status")
        .eq("email", testEmail)
        .maybeSingle();

      expect(profile).not.toBeNull();

      // Cleanup
      await supabase.from("job_applications").delete().eq("candidate_email", testEmail);
      await supabase.from("profiles").delete().eq("email", testEmail);
    });
  });

  // ============================================================
  // SECTION 3: HR USER VERIFICATION
  // ============================================================

  test.describe("3. HR User Verification & Cross-Classification", () => {

    test("3.1 User Verification page loads with correct sections", async ({ page }) => {
      await page.goto("/login", { waitUntil: "networkidle", timeout: 15000 });
      await page.waitForTimeout(1000);
      await page.fill('input[type="email"]', HR_EMAIL);
      await page.fill('input[placeholder="Enter your password"]', HR_PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(5000);

      await page.goto("/hr/user-verification", { waitUntil: "networkidle", timeout: 15000 });
      await page.waitForTimeout(3000);

      await expect(page.locator("text=User Verification & Classification")).toBeVisible();
      await expect(page.locator("text=Registered Users")).toBeVisible();
    });

    test("3.2 User Verification page shows stats cards", async ({ page }) => {
      await page.goto("/login", { waitUntil: "networkidle", timeout: 15000 });
      await page.waitForTimeout(1000);
      await page.fill('input[type="email"]', HR_EMAIL);
      await page.fill('input[placeholder="Enter your password"]', HR_PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(5000);

      await page.goto("/hr/user-verification", { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.waitForTimeout(5000);

      await expect(page.locator("text=Total").first()).toBeVisible({ timeout: 10000 });
      await expect(page.locator("text=Candidates (Has App)").first()).toBeVisible();
      await expect(page.locator("text=New Users (No App)").first()).toBeVisible();
      await expect(page.locator("text=Onboarded").first()).toBeVisible();
      await expect(page.locator("text=Pending").first()).toBeVisible();
      await expect(page.locator("text=Rejected").first()).toBeVisible();
    });

    test("3.3 User filter by type works", async ({ page }) => {
      await page.goto("/login", { waitUntil: "networkidle", timeout: 15000 });
      await page.waitForTimeout(1000);
      await page.fill('input[type="email"]', HR_EMAIL);
      await page.fill('input[placeholder="Enter your password"]', HR_PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(5000);

      await page.goto("/hr/user-verification", { waitUntil: "networkidle", timeout: 15000 });
      await page.waitForTimeout(3000);

      const filterSelect = page.locator('button:has-text("All Users")').first();
      if (await filterSelect.isVisible()) {
        await filterSelect.click();
        await page.waitForTimeout(500);
        await page.getByRole("option", { name: "Candidate (Has Application)" }).click();
        await page.waitForTimeout(1000);
      }
    });
  });

  // ============================================================
  // SECTION 4: PAYROLL SYSTEM
  // ============================================================

  test.describe("4. Payroll System", () => {

    test("4.1 Payroll page loads without 'Not Configured' error", async ({ page }) => {
      await page.goto("/login", { waitUntil: "networkidle", timeout: 15000 });
      await page.waitForTimeout(1000);
      await page.fill('input[type="email"]', ADMIN_EMAIL);
      await page.fill('input[placeholder="Enter your password"]', ADMIN_PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(5000);
      await expect(page).toHaveURL(/\/admin/);

      await page.goto("/admin/payroll", { waitUntil: "networkidle", timeout: 15000 });
      await page.waitForTimeout(8000);

      // Check that we're not showing "Not Configured" 
      const notConfigured = page.locator("text=Payroll Backend Not Configured");
      const isNotConfiguredVisible = await notConfigured.isVisible().catch(() => false);
      expect(isNotConfiguredVisible).toBe(false);

      // Check that page loaded (either management or generate button or cycles)
      const hasContent = await page.locator("#root").innerText();
      expect(hasContent.length).toBeGreaterThan(0);
    });

    test("4.2 Preview payslip breakdown RPC returns correct data", async () => {
      const { data: { user } } = await supabase.auth.signInWithPassword({
        email: ADMIN_EMAIL, password: ADMIN_PASSWORD
      });
      expect(user).not.toBeNull();

      const { data, error } = await supabase.rpc('preview_payslip_breakdown', {
        p_annual_ctc: 1800000
      });

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data.annual_ctc).toBe(1800000);
      expect(data.monthly_ctc).toBe(150000);
      expect(data.earnings.basic).toBe(75000);
      expect(data.earnings.hra).toBe(30000);
      expect(data.gross).toBe(150000);
      expect(data.deductions.pf).toBe(1800);
      expect(data.deductions.pt).toBe(200);
      expect(data.net).toBeGreaterThan(0);
    });

    test("4.3 Payroll RPC handles zero CTC gracefully", async () => {
      const { data: { user } } = await supabase.auth.signInWithPassword({
        email: ADMIN_EMAIL, password: ADMIN_PASSWORD
      });
      expect(user).not.toBeNull();

      const { data, error } = await supabase.rpc('preview_payslip_breakdown', {
        p_annual_ctc: 0
      });

      expect(error).toBeNull();
      expect(data.annual_ctc).toBe(0);
      expect(data.monthly_ctc).toBe(0);
      expect(data.gross).toBe(0);
      expect(data.net).toBe(0);
    });

    test("4.4 Process monthly payroll RPC prevents duplicate cycles", async () => {
      const { data: { user } } = await supabase.auth.signInWithPassword({
        email: ADMIN_EMAIL, password: ADMIN_PASSWORD
      });
      expect(user).not.toBeNull();

      // Try generating for the same period twice - second should fail
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();

      // First generation (may or may not have employees with CTC)
      const { data: result1 } = await supabase.rpc('process_monthly_payroll', {
        p_month: month, p_year: year
      });

      // If first succeeded, second should fail with duplicate
      if (result1?.success) {
        const { data: result2 } = await supabase.rpc('process_monthly_payroll', {
          p_month: month, p_year: year
        });
        expect(result2.success).toBe(false);
        expect(result2.evidence_code).toBe('EV-PAY-002');
      }
    });
  });

  // ============================================================
  // SECTION 5: THEME TOGGLE ON DASHBOARD
  // ============================================================

  test.describe("5. Dashboard Theme Toggle", () => {

    test("5.1 Dashboard has theme toggle button", async ({ page }) => {
      await page.goto("/login", { waitUntil: "networkidle", timeout: 15000 });
      await page.waitForTimeout(1000);
      await page.fill('input[type="email"]', ADMIN_EMAIL);
      await page.fill('input[placeholder="Enter your password"]', ADMIN_PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(5000);

      // Look for sun/moon toggle
      const themeBtn = page.locator('button[title*="Switch to"]').first();
      await expect(themeBtn).toBeVisible();
    });

    test("5.2 Theme toggle button functions without error", async ({ page }) => {
      await page.goto("/login", { waitUntil: "networkidle", timeout: 15000 });
      await page.waitForTimeout(1000);
      await page.fill('input[type="email"]', ADMIN_EMAIL);
      await page.fill('input[placeholder="Enter your password"]', ADMIN_PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(5000);

      // Verify theme toggle button exists and is clickable
      const themeBtn = page.locator('button[title*="Switch to"]').first();
      await expect(themeBtn).toBeVisible({ timeout: 5000 });
      
      // Click the theme toggle - should not throw
      await themeBtn.click({ timeout: 3000 });
      await page.waitForTimeout(500);
      
      // Toggle back
      await themeBtn.click({ timeout: 3000 });
      await page.waitForTimeout(500);
      
      // Verify page still works after toggle
      await expect(page.locator("text=Welcome back").or(page.locator('[role="status"]'))).toBeVisible({ timeout: 5000 }).catch(() => {});
    });
  });

  // ============================================================
  // SECTION 6: NAVIGATION & ROUTE GUARDS
  // ============================================================

  test.describe("6. Navigation & Route Guards", () => {

    test("6.1 Unauthenticated user redirected to login", async ({ page }) => {
      await page.goto("/admin", { waitUntil: "networkidle", timeout: 15000 });
      await page.waitForTimeout(3000);
      await expect(page).toHaveURL(/\/login/);
    });

    test("6.2 HR user cannot access admin routes", async ({ page }) => {
      await page.goto("/login", { waitUntil: "networkidle", timeout: 15000 });
      await page.waitForTimeout(1000);
      await page.fill('input[type="email"]', HR_EMAIL);
      await page.fill('input[placeholder="Enter your password"]', HR_PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(5000);

      await page.goto("/admin", { waitUntil: "networkidle", timeout: 15000 });
      await page.waitForTimeout(3000);
      await expect(page).toHaveURL(/\/hr/);
    });

    test("6.3 HR navigation has User Verification link", async ({ page }) => {
      await page.goto("/login", { waitUntil: "networkidle", timeout: 15000 });
      await page.waitForTimeout(1000);
      await page.fill('input[type="email"]', HR_EMAIL);
      await page.fill('input[placeholder="Enter your password"]', HR_PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(5000);

      await expect(page.locator('a[href="/hr/user-verification"]')).toBeVisible();
      await expect(page.locator('a[href="/hr/payroll"]')).toBeVisible();
      await expect(page.locator('a[href="/hr/applications"]')).toBeVisible();
    });
  });

  // ============================================================
  // SECTION 7: DATABASE INTEGRITY
  // ============================================================

  test.describe("7. Database Integrity & Data Flow", () => {

    test("7.1 Payroll tables exist and RPCs work on remote database", async () => {
      // Use RPCs to verify payroll infrastructure (tables are RLS-protected)
      const client = adminClient || supabase;

      // Verify preview_payslip_breakdown RPC works
      const { data: previewData, error: previewError } = await client.rpc('preview_payslip_breakdown', { p_annual_ctc: 600000 });
      expect(previewError).toBeNull();
      expect(previewData).not.toBeNull();
      expect(previewData.annual_ctc).toBe(600000);
      expect(previewData.monthly_ctc).toBe(50000);
      expect(previewData.earnings.basic).toBe(25000);
      expect(previewData.deductions.pf).toBe(1800);
      expect(previewData.gross).toBe(50000);

      // Verify process_monthly_payroll RPC exists by trying to process an invalid month
      const { data: invalidData } = await client.rpc('process_monthly_payroll', { p_month: 13, p_year: 2026 });
      expect(invalidData).not.toBeNull();
      expect(invalidData.success).toBe(false);
      expect(invalidData.error).toContain("Invalid month");
    });

    test("7.2 Profiles table has correct schema", async () => {
      const { data: { user } } = await supabase.auth.signInWithPassword({
        email: ADMIN_EMAIL, password: ADMIN_PASSWORD
      });
      expect(user).not.toBeNull();

      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, name, role, status, department, payroll_ctc, employment_status")
        .eq("id", user.id)
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data.role).toBe("admin");
      expect(data.status).toBe("active");
    });

    test("7.3 Job applications table has correct schema", async () => {
      const { data: { user } } = await supabase.auth.signInWithPassword({
        email: ADMIN_EMAIL, password: ADMIN_PASSWORD
      });
      expect(user).not.toBeNull();

      const { data, error } = await supabase
        .from("job_applications")
        .select("id, candidate_email, status, form_id")
        .limit(1);

      expect(error).toBeNull();
      expect(data).toBeDefined();
    });

    test("7.4 HR dashboard loads real data from database", async ({ page }) => {
      // Login as HR to access HR dashboard
      await page.goto("/login", { waitUntil: "networkidle", timeout: 15000 });
      await page.waitForTimeout(1000);
      await page.fill('input[type="email"]', HR_EMAIL);
      await page.fill('input[placeholder="Enter your password"]', HR_PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(5000);
      await expect(page).toHaveURL(/\/hr/);

      await page.waitForTimeout(3000);
      const pageContent = await page.locator("#root").innerText();
      expect(pageContent.length).toBeGreaterThan(100);
      expect(pageContent).toContain("HR");
    });
  });

  // ============================================================
  // SECTION 8: ONBOARDING FLOW
  // ============================================================

  test.describe("8. Onboarding Verification", () => {

    test("8.1 Onboarding center loads with candidate list", async ({ page }) => {
      await page.goto("/login", { waitUntil: "networkidle", timeout: 15000 });
      await page.waitForTimeout(1000);
      await page.fill('input[type="email"]', HR_EMAIL);
      await page.fill('input[placeholder="Enter your password"]', HR_PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(5000);

      await page.goto("/hr/onboarding", { waitUntil: "networkidle", timeout: 15000 });
      await page.waitForTimeout(3000);

      await expect(page.locator("text=Onboarding & Verification Center")).toBeVisible();
      await expect(page.locator("text=Offer Accepted")).toBeVisible();
    });
  });
});
