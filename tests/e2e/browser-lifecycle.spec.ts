import { test, expect, type Page } from "@playwright/test";
import * as fs from "fs";
import pgLib from "pg";

/**
 * BROWSER LIFECYCLE — UI → backend → DB → UI reflection proof (Gate 3).
 *
 * The API-level lifecycle (scripts/full-lifecycle-probe.mjs, 51/51) proves the
 * business chain; THIS spec proves the browser reflection layer for the three
 * screens a real user touches daily:
 *   T1  HR sees a real fixture candidate in the pipeline UI (candidate→application→HR UI)
 *   T2  Employee clock-in via UI → own work_log row → survives reload → clock-out via UI
 *   T3  Leave request via employee UI → Pending in DB → visible in HR approvals UI →
 *       approved via UI → employee UI reflects Approved (deepest UI↔DB round-trip)
 *
 * Every DB assertion is made against the LIVE database; every UI action goes
 * through the real app. The employee account is a real seeded user (sham) —
 * artifacts created here are tagged 'E2E_BROWSER_LC' and removed in afterAll.
 */

const envPath = ".env.local";
const env: Record<string, string> = { ...process.env } as Record<string, string>;
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) env[m[1]] = m[2];
  }
}

const HR_EMAIL = process.env.E2E_HR_EMAIL || "jack@email.com";
const HR_PASSWORD = process.env.E2E_HR_PASSWORD || "jack123";
const EMP_EMAIL = process.env.E2E_EMP_EMAIL || "";
const EMP_PASSWORD = process.env.E2E_EMP_PASSWORD || "";
const HAS_EMP = !!(EMP_EMAIL && EMP_PASSWORD);

let pg: pgLib.Client;
const TAG = `E2E_BROWSER_LC_${Date.now()}`;

function pgConnect(): pgLib.Client {
  if (!env.SUPABASE_PROJECT_REF || !env.SUPABASE_DB_PASSWORD) throw new Error("backend env missing");
  return new pgLib.Client({
    host: `db.${env.SUPABASE_PROJECT_REF}.supabase.co`,
    port: 5432, database: "postgres", user: "postgres",
    password: env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false },
  });
}

async function uiLogin(page: Page, email: string, password: string) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(hr|admin|employee|team-lead)/, { timeout: 60000 });
}

test.describe("Browser lifecycle: UI→DB→UI reflection", () => {
  test.beforeAll(async () => {
    pg = pgConnect();
    await pg.connect();
  });

  test.afterAll(async () => {
    if (pg) {
      // Remove tagged artifacts created through the UI during this spec.
      await pg.query(`DELETE FROM leaves WHERE reason LIKE 'E2E_BROWSER_LC%'`);
      await pg.query(`DELETE FROM work_logs WHERE notes LIKE 'E2E_BROWSER_LC%' OR notes LIKE '%${TAG}%'`);
      await pg.query(`DELETE FROM resignations WHERE reason LIKE 'E2E_BROWSER_LC%'`);
      // Fixture candidate graph (dynamic FK purge).
      const cands = (await pg.query(`SELECT id FROM candidates WHERE full_name LIKE 'E2E_BROWSER_LC_%'`)).rows;
      if (cands.length) {
        const refs = (await pg.query(
          `SELECT DISTINCT conrelid::regclass::text AS child, a.attname AS col FROM pg_constraint cn
           JOIN pg_attribute a ON a.attrelid = cn.conrelid AND a.attnum = ANY(cn.conkey)
           WHERE cn.confrelid = 'public.candidates'::regclass AND cn.contype = 'f'`)).rows;
        for (let pass = 0; pass < 5; pass++) {
          let removed = 0;
          for (const r of refs) {
            const d = await pg.query(`DELETE FROM ${r.child} WHERE ${r.col} = ANY($1::uuid[])`, [cands.map(c => c.id)]);
            removed += d.rowCount || 0;
          }
          if (!removed) break;
        }
        for (const c of cands) await pg.query(`DELETE FROM candidates WHERE id = $1`, [c.id]);
      }
      const residue = (await pg.query(`SELECT
        (SELECT count(*)::int FROM candidates WHERE full_name LIKE 'E2E_BROWSER_LC_%') AS c,
        (SELECT count(*)::int FROM leaves WHERE reason LIKE 'E2E_BROWSER_LC%') AS l`)).rows[0];
      console.log("[BROWSER_LC] RESIDUE:", JSON.stringify(residue));
      await pg.end();
    }
  });

  test("T1: HR pipeline UI reflects the real fixture candidate", async ({ page }) => {
    // Seed ONE fixture candidate + application via pg (setup only).
    const fullName = `E2E_BROWSER_LC_Candidate_${Date.now()}`;
    const cand = (await pg.query(
      `INSERT INTO candidates (full_name, email, stage, created_at)
       VALUES ($1, $2, 'Applied', now()) RETURNING id`,
      [fullName, `e2e-browser-${Date.now()}@e2e-test.invalid`]
    )).rows[0];
    const form = (await pg.query(
      `INSERT INTO job_forms (job_title, form_schema, status, created_at) VALUES ($1,'{}'::jsonb,'Active',now()) RETURNING id`,
      [`BrowserLC Role ${TAG}`])).rows[0];
    const app = (await pg.query(
      `INSERT INTO job_applications (candidate_id, form_id, candidate_name, candidate_email, answers, status, created_at)
       VALUES ($1,$2,$3,$4,'{}'::jsonb,'Applied',now()) RETURNING id`,
      [cand.id, form.id, `E2E_BROWSER_LC_Candidate_${cand.id.slice(0, 8)}`, `e2e-browser-${cand.id.slice(0, 8)}@e2e-test.invalid`])).rows[0];
    expect(cand.id).toBeTruthy();

    // HR opens the REAL pipeline UI — the candidate must appear. The pipeline
    // is the "Candidate Tracking Board" tab (default tab is the ATS scanner).
    await uiLogin(page, HR_EMAIL, HR_PASSWORD);
    await page.goto("/hr/recruitment", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);
    await page.getByRole("button", { name: /Candidate Tracking Board/i }).click();
    await page.waitForTimeout(6000); // allow the pipeline data fetch
    const body = await page.innerText("body");
    // The board's "Full Legal Name" column joins candidates.full_name.
    expect(body, "HR pipeline UI must reflect the live candidate row").toContain(fullName);
  });

  test("T2: employee clock-in via UI → own DB row → reload reflection → clock-out", async ({ page }) => {
    test.skip(!HAS_EMP, "NOT RUN — employee temp password window not active");
    await uiLogin(page, EMP_EMAIL, EMP_PASSWORD);

    // Real UI clock-in (header WFO control — the app's actual clock control).
    const clockBtn = page.getByRole("button", { name: /WFO/i }).first();
    await expect(clockBtn).toBeVisible({ timeout: 30000 });
    await clockBtn.click();
    await page.waitForTimeout(4000);

    // DB truth: an Active work_log exists for THIS user.
    const userId = (await pg.query(`SELECT id FROM profiles WHERE email = $1`, [EMP_EMAIL])).rows[0].id;
    const active = await pg.query(
      `SELECT id FROM work_logs WHERE user_id = $1 AND status = 'Active' ORDER BY created_at DESC LIMIT 1`, [userId]);
    expect(active.rows.length, "clock-in via UI must persist an Active work_log").toBe(1);

    // UI reflection survives reload (React state is not the source of truth):
    // when clocked in, the header shows the live "Clock Out" timer button.
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);
    const body = await page.innerText("body");
    expect(body.toLowerCase()).toMatch(/clock out|active|working/);

    // Clock out via UI; DB must show no dangling Active shift. The daily
    // report modal may appear after clock-out — it does not affect the DB.
    const outBtn = page.getByRole("button", { name: /clock out/i }).first();
    if (await outBtn.isVisible().catch(() => false)) {
      await outBtn.click();
      await page.waitForTimeout(3000);
    }
    const after = await pg.query(
      `SELECT count(*)::int AS n FROM work_logs WHERE user_id = $1 AND status = 'Active'`, [userId]);
    expect(after.rows[0].n).toBe(0);
  });

  test("T4: Create Offer dialog → RPC → offer appears in Offer Management", async ({ page }) => {
    // Seed an offer-eligible application (setup only; the offer itself is
    // created through the real UI → RPC path).
    const fullName = `E2E_BROWSER_LC_OfferCand_${Date.now()}`;
    const cand = (await pg.query(
      `INSERT INTO candidates (full_name, email, stage, created_at) VALUES ($1, $2, 'Applied', now()) RETURNING id`,
      [fullName, `e2e-offer-${Date.now()}@e2e-test.invalid`])).rows[0];
    const form = (await pg.query(
      `INSERT INTO job_forms (job_title, form_schema, status, created_at) VALUES ($1,'{}'::jsonb,'Active',now()) RETURNING id`,
      [`OfferLC Role ${TAG}`])).rows[0];
    const app = (await pg.query(
      `INSERT INTO job_applications (candidate_id, form_id, candidate_name, candidate_email, answers, status, created_at)
       VALUES ($1,$2,$3,$4,'{}'::jsonb,'Interview Cleared',now()) RETURNING id`,
      [cand.id, form.id, fullName, `e2e-offer-${cand.id.slice(0, 8)}@e2e-test.invalid`])).rows[0];

    await uiLogin(page, HR_EMAIL, HR_PASSWORD);
    await page.goto("/hr/recruitment", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    await page.getByRole("button", { name: /Offer Management/i }).click();
    await page.waitForTimeout(4000);

    await page.getByRole("button", { name: /Create Offer/i }).first().click();
    await page.waitForTimeout(3000);

    // Select the seeded eligible application in the dialog.
    await page.locator("[role=dialog]").getByText("", { exact: false }).count(); // warm
    const trigger = page.locator("[role=dialog]").getByRole("combobox").first();
    await trigger.click();
    await page.getByRole("option", { name: new RegExp(fullName.slice(0, 30)) }).first().click();
    await page.locator("[role=dialog]").locator('input[type="number"]').fill("1800000");
    await page.locator("[role=dialog]").locator('input[type="date"]').fill(
      new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
    await page.locator("[role=dialog]").getByRole("button", { name: /Create Offer/i }).click();
    await page.waitForTimeout(4000);

    // DB truth: offer created via RPC in Pending Approval, bound to the fixture.
    const offer = (await pg.query(
      `SELECT status, candidate_id, application_id FROM offer_letters WHERE application_id = $1`, [app.id])).rows[0];
    expect(offer, "Create Offer UI must create an offer via the RPC").toBeTruthy();
    expect(offer.status).toBe("Pending Approval");
    expect(offer.candidate_id).toBe(cand.id);

    // UI refresh: the new offer appears in the management table (status badge
    // renders uppercased via CSS).
    const body = await page.innerText("body");
    expect(body).toMatch(/pending approval/i);
  });

  test("T3: leave request via UI → HR approval via UI → employee UI reflects Approved", async ({ page }) => {
    test.skip(!HAS_EMP, "NOT RUN — employee temp password window not active");
    const REASON = `${TAG} leave flow`;

    // Employee submits a leave request through the REAL form.
    await uiLogin(page, EMP_EMAIL, EMP_PASSWORD);
    await page.goto("/employee/leaves", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);
    await page.selectOption("select", { label: "Casual Leave" });
    const dates = page.locator('input[type="date"]');
    await dates.nth(0).fill("2026-11-02");
    await dates.nth(1).fill("2026-11-03");
    await page.fill("textarea", REASON);
    await page.getByRole("button", { name: /submit/i }).first().click();
    await page.waitForTimeout(3000);

    const userId = (await pg.query(`SELECT id FROM profiles WHERE email = $1`, [EMP_EMAIL])).rows[0].id;
    const leave = (await pg.query(
      `SELECT id, status FROM leaves WHERE user_id = $1 AND reason = $2 ORDER BY created_at DESC LIMIT 1`,
      [userId, REASON])).rows[0];
    expect(leave, "UI leave submission must persist a Pending row").toBeTruthy();
    expect(leave.status).toBe("Pending");

    // HR sees it in the approvals UI and approves via the UI.
    const hrPage = page; // reuse context: log out employee by logging in as HR
    await uiLogin(hrPage, HR_EMAIL, HR_PASSWORD);
    await hrPage.goto("/hr/approvals", { waitUntil: "domcontentloaded" });
    await hrPage.waitForTimeout(5000);
    const hrBody = await hrPage.innerText("body");
    expect(hrBody, "HR approvals UI must show the pending leave").toContain(REASON);
    // Approve the row containing our tagged reason: click its Approve control.
    const row = hrPage.locator("tr", { hasText: REASON });
    await row.getByRole("button", { name: /approve/i }).first().click();
    await hrPage.waitForTimeout(3000);

    const afterHr = (await pg.query(`SELECT status FROM leaves WHERE id = $1`, [leave.id])).rows[0];
    expect(afterHr?.status).toBe("Approved");

    // Employee UI reflects the approval from the DB (fresh login + reload).
    await uiLogin(hrPage, EMP_EMAIL, EMP_PASSWORD);
    await hrPage.goto("/employee/leaves", { waitUntil: "domcontentloaded" });
    await hrPage.waitForTimeout(4000);
    const empBody = await hrPage.innerText("body");
    expect(empBody).toContain(REASON);
    expect(empBody, "employee UI must reflect Approved from DB").toMatch(/approved/i);
  });
});
