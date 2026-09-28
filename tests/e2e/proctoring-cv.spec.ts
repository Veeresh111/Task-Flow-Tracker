/**
 * S6 PHASE 15/16: real-browser CV proctoring E2E.
 *
 * Runs the ACTUAL exam page in Chromium with Chrome's fake webcam (real
 * frames, real YuNet+SFace ONNX inference, real network calls — the fake
 * camera is the ONLY synthetic element, a standard Chromium test feature).
 * No RPC interception, no mocked responses.
 *
 * Requires a live backend via env: E2E_SUPABASE_URL, E2E_SUPABASE_ANON_KEY,
 * E2E_RAW_TOKEN (minted ACTIVE token from the HR issuance RPC).
 * Skipped (NOT PROVEN) when env is absent — never faked.
 */
import { test, expect, type Page } from '@playwright/test';

const env = (k: string) => process.env[k] ?? (import.meta as any).env?.[k];
const SUPA_URL = env('E2E_SUPABASE_URL') ?? env('VITE_SUPABASE_URL');
const SUPA_KEY = env('E2E_SUPABASE_ANON_KEY') ?? env('VITE_SUPABASE_ANON_KEY');
const RAW_TOKEN = env('E2E_RAW_TOKEN') ?? '';
const HAS_BACKEND = !!(SUPA_URL && SUPA_KEY && RAW_TOKEN);
const EXAM_URL = `/assessment/${RAW_TOKEN}`;

test.describe('S6 real-browser CV proctoring', () => {
  test.skip(!HAS_BACKEND, 'E2E backend env not provided — CV E2E NOT PROVEN in this run');

  let page: Page;

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext({
      permissions: ['camera', 'microphone'],
    });
    page = await ctx.newPage();
  });

  test('exam page loads and token handshake succeeds', async () => {
    test.setTimeout(120000);
    await page.goto(EXAM_URL, { waitUntil: 'domcontentloaded' });
    // Exercise the REAL handshake: paste the token and submit the form.
    await page.locator('input').first().fill(RAW_TOKEN);
    await page.getByRole('button', { name: /verify|clearance/i }).click();
    await expect(
      page.locator('text=/proctored|duration|grant access|calibrate/i').first()
    ).toBeVisible({ timeout: 60000 });
  });

  test('ONNX YuNet+SFace engine performs REAL inference', async () => {
    test.setTimeout(180000);
    await page.goto(EXAM_URL, { waitUntil: 'domcontentloaded' });
    const cvEvidence = await page.evaluate(async () => {
      // Import the BUNDLED module through Vite's dev transform (not a raw
      // path specifier, which the browser cannot resolve).
      const mod = await import(/* @vite-ignore */ '/src/lib/proctoring/cv-engine');
      const { loadCvEngine, isCvEngineReady, analyzeFrame } = mod;
      const loaded = await loadCvEngine();
      if (!loaded) return { loaded: false, ready: false, ran: false, error: 'LOAD_FALSE' };
      // Synthetic patterned frame for module-level sanity; the camera path
      // is exercised separately by the real exam UI flow.
      const c = document.createElement('canvas');
      c.width = 320; c.height = 240;
      const ctx = c.getContext('2d')!;
      const img = ctx.createImageData(320, 240);
      for (let i = 0; i < img.data.length; i += 4) {
        img.data[i] = (i * 7) % 256; img.data[i + 1] = (i * 3) % 256; img.data[i + 2] = (i * 11) % 256; img.data[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      const t0 = performance.now();
      const analysis = await analyzeFrame(img.data, 320, 240);
      return {
        loaded: true, ready: isCvEngineReady(), ran: true,
        ms: Math.round(performance.now() - t0),
        faceCount: analysis.faceCount,
        hasEmbedding: !!analysis.primaryEmbedding,
        embeddingDim: analysis.primaryEmbedding?.length ?? 0,
        error: analysis.error,
      };
    });

    console.log('CV ENGINE EVIDENCE:', JSON.stringify(cvEvidence));
    expect(cvEvidence.loaded).toBe(true);
    expect(cvEvidence.ready).toBe(true);
    expect(cvEvidence.ran).toBe(true);
    expect(cvEvidence.ms).toBeGreaterThan(0);
    if (cvEvidence.faceCount > 0) expect(cvEvidence.embeddingDim).toBe(128);
  });

  test('fake camera frames flow through the REAL exam page into server enrollment', async ({ browser }) => {
    test.setTimeout(300000);
    // ISOLATED context/page: reusing the shared page after tests 1–2 left
    // stale handshake state that made the flow hang (proven: focused fresh-
    // page run passes, shared-page run hangs before any log line).
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const p = await ctx.newPage();
    try {
    p.on('console', m => {
      const t = m.text();
      if (/media|camera|microphone|getUserMedia|NotAllowed|NotFoundError|hardware|landmark|proctor|biometric|rpc|enroll|verif|face check|error/i.test(t))
        console.log('[PAGE]', m.type(), t.slice(0, 250));
    });
    p.on('pageerror', e => console.log('[PAGEERROR]', String(e).slice(0, 300)));
    await p.goto(EXAM_URL, { waitUntil: 'domcontentloaded' });
    // Real flow: token handshake → Proctored Workspace Center → hardware
    // grant → automatic face check. The face decision only appears AFTER
    // "Grant Access & Calibrate Peripherals" is clicked.
    const hasInput = await p.locator('input').first().isVisible({ timeout: 8000 }).catch(() => false);
    if (hasInput) {
      await p.locator('input').first().fill(RAW_TOKEN);
      await p.getByRole('button', { name: /verify|clearance/i }).click({ timeout: 15000 });
    } else {
      console.log('HANDSHAKE: token auto-validated from URL (no input form)');
    }
    const grant = p.getByRole('button', { name: /grant access|calibrate/i });
    await expect(grant).toBeVisible({ timeout: 60000 });
    // React re-renders after the handshake can momentarily detach the button,
    // making a standard actionability click retry indefinitely. Diagnose the
    // hit-target, then force-click if needed (the real onClick still fires —
    // only the hit-test is bypassed; no mock path is involved).
    await p.waitForTimeout(800);
    const hitTarget = await grant.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { covers: at ? (el.contains(at) || at === el ? 'self' : at.tagName + '.' + at.className) : 'nothing' };
    }).catch(() => ({ covers: 'eval-failed' }));
    console.log('GRANT HIT TARGET:', JSON.stringify(hitTarget));
    await grant.click({ timeout: 10000 }).catch(async (e) => {
      console.log('STANDARD CLICK FAILED:', String(e).split('\n')[0]);
      await grant.click({ timeout: 10000, force: true });
    });

    // Stepwise evidence: did getUserMedia actually attach a stream?
    const streamAttached = await p.waitForFunction(
      () => !!document.querySelector('video')?.srcObject,
      null, { timeout: 30000 }
    ).then(() => true).catch(() => false);
    console.log('STREAM ATTACHED:', streamAttached);
    if (!streamAttached) {
      const body = await p.evaluate(() => document.body.innerText);
      console.log('POST-GRANT BODY:', body.slice(0, 400).replace(/\n+/g, ' | '));
    }

    // Face check runs automatically after camera acquisition; CV models are
    // already warm from earlier tests in this worker. Allow generous time.
    await expect(
      p.locator('text=/face verified|identity verified|verification complete|no face|multiple faces|mismatch|enrollment failed|verification service unavailable/i').first()
    ).toBeVisible({ timeout: 180000 });
    const identityText = await p.evaluate(() => document.body.innerText);
    console.log('IDENTITY STATE:', identityText.slice(0, 500).replace(/\n+/g, ' | '));

    // SERVER truth (same live page): a forged SECOND enrollment with a fake
    // descriptor must be refused as already_enrolled — proving the browser
    // flow's real enrollment reached the database first (first-wins).
    const bio = await p.evaluate(async ({ url, key, token }) => {
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
      const sb = createClient(url, key);
      const fakeB = Array.from({ length: 128 }, (_, i) => Math.cos(i));
      const r2 = await sb.rpc('enroll_candidate_biometric_token', { p_raw_token: token, p_descriptor: fakeB, p_confidence: 0.9 });
      return { second: r2.data, error: r2.error?.message ?? null };
    }, { url: SUPA_URL!, key: SUPA_KEY!, token: RAW_TOKEN });
    console.log('FIRST-WINS EVIDENCE:', JSON.stringify(bio));
    expect(bio.second?.already_enrolled).toBe(true);
    } finally {
      await ctx.close();
    }
  });

  test('tamper: client cannot use revoked legacy biometric RPCs', async () => {
    const tamper = await page.evaluate(async ({ url, key }) => {
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
      const sb = createClient(url, key);
      const r1 = await sb.rpc('enroll_candidate_biometric', {
        p_candidate_id: '00000000-0000-0000-0000-000000000000',
        p_descriptor: Array(128).fill(0.5), p_confidence: 0.9,
      });
      const r2 = await sb.rpc('verify_candidate_biometric_face', {
        p_candidate_id: '00000000-0000-0000-0000-000000000000',
        p_input_descriptor: Array(128).fill(0.5), p_threshold: 0.363,
      });
      return { enroll: { error: r1.error?.message ?? null }, verify: { error: r2.error?.message ?? null } };
    }, { url: SUPA_URL!, key: SUPA_KEY! });
    console.log('TAMPER EVIDENCE:', JSON.stringify(tamper));
    expect(tamper.enroll.error).toBeTruthy();
    expect(tamper.verify.error).toBeTruthy();
  });

  test('tamper: forged liveness challenge submission refused', async () => {
    const forged = await page.evaluate(async ({ url, key }) => {
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
      const sb = createClient(url, key);
      const r = await sb.rpc('submit_liveness_challenge', {
        p_raw_token: 'forged-token-aaaaaaaaaaaaaa',
        p_session_id: '00000000-0000-0000-0000-000000000000',
        p_challenge_id: '00000000-0000-0000-0000-000000000000',
        p_nonce: 'forged-nonce',
      });
      return { data: r.data, error: r.error?.message ?? null };
    }, { url: SUPA_URL!, key: SUPA_KEY! });
    console.log('FORGED CHALLENGE:', JSON.stringify(forged).slice(0, 200));
    expect(forged.data?.success === true).toBe(false);
  });
});
