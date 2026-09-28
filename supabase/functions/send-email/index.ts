import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ---------------------------------------------------------------------------
// Provider transport layer.
// The email queue → scheduler → worker → status-tracking architecture is
// unchanged. The provider is selected EXPLICITLY via the EMAIL_PROVIDER
// secret (allowed values: "brevo" | "resend"). Selection never depends on
// which key happens to exist — an invalid or under-configured selector is a
// hard configuration error, not a silent fallback.
// Secrets are Edge Function secrets (server-side only) — NEVER VITE_* / client.
// ---------------------------------------------------------------------------
const BREVO_API = "https://api.brevo.com/v3/smtp/email";
const RESEND_API = "https://api.resend.com/emails";

const ALLOWED_PROVIDERS = ["brevo", "resend"] as const;
type ProviderName = typeof ALLOWED_PROVIDERS[number];

interface ProviderPayload {
  to: string[];
  subject: string;
  html: string;
}

interface ResolvedProvider {
  provider: ProviderName;
  apiKey: string;
  from: { email: string; name: string };
}

function resolveProvider(): { config: ResolvedProvider | null; error?: string } {
  const selector = (Deno.env.get("EMAIL_PROVIDER") || "").trim().toLowerCase();
  if (!selector) {
    return { config: null, error: "EMAIL_PROVIDER is not set. Allowed values: brevo | resend." };
  }
  if (!ALLOWED_PROVIDERS.includes(selector as ProviderName)) {
    return { config: null, error: `EMAIL_PROVIDER='${selector}' is invalid. Allowed values: brevo | resend.` };
  }

  // EMAIL_FROM: "Display Name <address@host>" or bare "address@host".
  const fromRaw = (Deno.env.get("EMAIL_FROM") || "").trim();
  const angle = fromRaw.match(/^(.*)<\s*(.+@.+)\s*>$/);
  const from = {
    email: (angle ? angle[2] : fromRaw).trim(),
    name: angle ? angle[1].trim().replace(/^"|"$/g, "") : "AI HRMS",
  };
  if (!from.email) {
    return { config: null, error: "EMAIL_FROM is not configured on server." };
  }

  const apiKey = selector === "brevo"
    ? Deno.env.get("BREVO_API_KEY")
    : Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    return {
      config: null,
      error: `EMAIL_PROVIDER=${selector} but ${selector === "brevo" ? "BREVO_API_KEY" : "RESEND_API_KEY"} is not configured as an Edge Function secret.`,
    };
  }

  return { config: { provider: selector as ProviderName, apiKey, from } };
}

// Application-level daily safety cap (NOT a provider guarantee). When reached,
// the worker stops claiming and leaves queued emails untouched ('pending') for
// controlled processing after the daily window — never deleted, never marked sent.
function dailySafetyLimit(): number | null {
  const raw = (Deno.env.get("EMAIL_DAILY_SAFETY_LIMIT") || "").trim();
  if (!raw) return null; // unset → no application-level cap
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

function startOfUtcDayIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const resolved = resolveProvider();
    if (!resolved.config) {
      return new Response(
        JSON.stringify({ error: resolved.error }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const provider = resolved.config;

    // WORKER AUTH: the scheduler (pg_cron → pg_net) authenticates with the
    // shared x-cron-secret; user-facing direct sends must carry a Supabase
    // JWT. Unauthenticated queue processing is refused (EV-EMAIL-401).
    const cronSecret = Deno.env.get("EMAIL_CRON_SECRET") || "";
    const providedCronSecret = req.headers.get("x-cron-secret") || "";
    const isQueueMode = body.process_queue || req.headers.get("x-process-queue") === "true";
    const authHeader = req.headers.get("Authorization") || "";
    const hasJwt = authHeader.startsWith("Bearer ") && authHeader.length > 40;

    if (isQueueMode) {
      const secretConfigured = cronSecret.length > 0;
      const secretValid = secretConfigured && providedCronSecret.length > 0 && providedCronSecret === cronSecret;
      if (!secretValid && !hasJwt) {
        return new Response(
          JSON.stringify({ error: "Queue processing requires x-cron-secret or an authenticated session (EV-EMAIL-401)." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    } else if (!hasJwt) {
      // Direct sends are a privileged operation — no anonymous emails.
      return new Response(
        JSON.stringify({ error: "Direct email sending requires an authenticated session (EV-EMAIL-401)." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Mode 1: Process the pending email worker queue
    if (isQueueMode) {
      const batchSize = Math.min(Number(body.batch_size) || 10, 50);
      return await processQueue(provider, corsHeaders, batchSize);
    }

    // Mode 2: Direct send (for real-time high-priority notifications).
    // Note: the daily safety cap is enforced on the queue (bulk) path; direct
    // sends are operator-authenticated one-offs outside the cap.
    if (!body.to || !body.subject || !body.html) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: to, subject, html" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const idempotencyKey = body.idempotency_key || `direct-${crypto.randomUUID()}`;
    const result = await sendViaProvider(provider, {
      to: Array.isArray(body.to) ? body.to : [body.to],
      subject: body.subject,
      html: body.html,
    }, idempotencyKey);

    return new Response(JSON.stringify({ success: true, id: result.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Failed to process email request." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function processQueue(provider: ResolvedProvider, headers: Record<string, string>, batchSize: number) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Daily safety limit: count rows already SENT since the start of the UTC day.
  // Checked BEFORE claiming so queued emails are preserved in 'pending' with
  // no lease churn when the cap is reached (explicit blocked-by-limit state).
  const limit = dailySafetyLimit();
  if (limit !== null) {
    const { count: sentToday, error: countErr } = await supabase
      .from("pending_emails")
      .select("*", { count: "exact", head: true })
      .eq("status", "sent")
      .gte("sent_at", startOfUtcDayIso());
    if (countErr) {
      // Fail closed on the safety check only if it cannot be evaluated.
      return new Response(
        JSON.stringify({ success: false, error: `Daily-limit check failed: ${countErr.message}` }),
        { status: 500, headers: { ...headers, "Content-Type": "application/json" } },
      );
    }
    if ((sentToday ?? 0) >= limit) {
      console.log(JSON.stringify({
        event: "email_daily_limit_reached", daily_sent: sentToday, daily_limit: limit, provider: provider.provider,
      }));
      return new Response(
        JSON.stringify({
          success: true, processed: 0, sent: 0, failed: 0,
          limit_reached: true, daily_sent: sentToday ?? 0, daily_limit: limit,
        }),
        { status: 200, headers: { ...headers, "Content-Type": "application/json" } },
      );
    }
  }

  const workerId = `worker-${crypto.randomUUID().slice(0, 8)}`;
  const leaseSeconds = 180;

  // 1. Claim batch of emails atomically via claim_pending_emails RPC
  let pendingList: any[] = [];
  const { data: claimed, error: claimErr } = await supabase.rpc("claim_pending_emails", {
    p_worker_id: workerId,
    p_batch_size: batchSize,
    p_lease_seconds: leaseSeconds
  });

  if (!claimErr && Array.isArray(claimed)) {
    pendingList = claimed;
  } else {
    // Fallback if RPC is unavailable in legacy environment
    const nowIso = new Date().toISOString();
    const { data: fallbackData, error: fetchError } = await supabase
      .from("pending_emails")
      .select("*")
      .or(`status.eq.pending,and(status.eq.processing,locked_until.lt.${nowIso})`)
      .order("created_at", { ascending: true })
      .limit(batchSize);

    if (fetchError) throw fetchError;
    pendingList = fallbackData || [];
  }

  if (pendingList.length === 0) {
    return new Response(JSON.stringify({ success: true, processed: 0, sent: 0, failed: 0 }), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  let sent = 0;
  let failed = 0;

  for (const email of pendingList) {
    // Durable, stable logical idempotency key: preserves identity across all retry attempts
    const idempotencyKey = email.idempotency_key || `email/${email.id}`;

    try {
      const result = await sendViaProvider(provider, {
        to: [email.recipient_email],
        subject: email.subject,
        html: email.html_body,
      }, idempotencyKey);

      await supabase
        .from("pending_emails")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          provider_message_id: result.id,
          idempotency_key: idempotencyKey,
          error_message: null,
          locked_until: null,
        })
        .eq("id", email.id);

      sent++;
    } catch (err: any) {
      const currentAttempts = (email.attempts || 1);
      const statusCode = Number(err.status) || 0;
      // 400, 401, 403, 422 indicate invalid credentials, bad recipient syntax, or unverified senders (non-retryable)
      const isPermanentFailure = [400, 401, 403, 422].includes(statusCode);
      const isMaxRetriesReached = isPermanentFailure || currentAttempts >= 5;
      const backoffMinutes = Math.pow(2, Math.min(currentAttempts, 6));
      const nextAttempt = new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString();

      await supabase
        .from("pending_emails")
        .update({
          status: isMaxRetriesReached ? "failed" : "pending",
          idempotency_key: idempotencyKey,
          error_message: `[Status ${statusCode || 'ERR'}] ${err.message?.slice(0, 450) || "Unknown provider error"}`,
          next_attempt_at: isMaxRetriesReached ? null : nextAttempt,
          locked_until: null,
        })
        .eq("id", email.id);

      failed++;
    }
  }

  return new Response(
    JSON.stringify({ success: true, processed: pendingList.length, sent, failed, workerId }),
    { status: 200, headers: { ...headers, "Content-Type": "application/json" } },
  );
}

// Sends through the configured provider. Returns { id } = provider message id.
// Each invocation opens its own short-lived HTTPS request — no persistent
// connections (correct for the serverless Edge Function runtime).
async function sendViaProvider(
  provider: ResolvedProvider,
  payload: ProviderPayload,
  idempotencyKey: string
): Promise<{ id: string }> {
  if (provider.provider === "brevo") {
    const response = await fetch(BREVO_API, {
      method: "POST",
      headers: {
        "accept": "application/json",
        "api-key": provider.apiKey,
        "content-type": "application/json",
        // Brevo has no idempotency header; the queue's stable idempotency_key
        // is the source of truth for dedupe. Carried as metadata for traceability.
        "X-Mailin-custom": JSON.stringify({ idempotency_key: idempotencyKey }),
      },
      body: JSON.stringify({
        sender: { name: provider.from.name, email: provider.from.email },
        to: payload.to.map((email) => ({ email })),
        subject: payload.subject,
        htmlContent: payload.html,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error: any = new Error(data.message || `Brevo API error (${response.status}): ${JSON.stringify(data)}`);
      error.status = response.status;
      throw error;
    }
    return { id: data.messageId || `brevo-${crypto.randomUUID()}` };
  }

  // Legacy rollback path: Resend HTTPS API (unchanged behavior).
  const response = await fetch(RESEND_API, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      from: provider.from.name
        ? `${provider.from.name} <${provider.from.email}>`
        : provider.from.email,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    const error: any = new Error(data.message || `Resend API error (${response.status}): ${JSON.stringify(data)}`);
    error.status = response.status;
    throw error;
  }

  return { id: data.id };
}
