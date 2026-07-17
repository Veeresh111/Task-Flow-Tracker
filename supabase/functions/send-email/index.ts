import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const RESEND_API = "https://api.resend.com/emails";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ error: "RESEND_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Mode 1: Process the pending email queue
    if (body.process_queue) {
      return await processQueue(resendApiKey, corsHeaders);
    }

    // Mode 2: Direct send (for payslip notifications)
    if (!body.type || !body.to || !body.subject || !body.html) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: type, to, subject, html" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const result = await sendEmail(resendApiKey, {
      from: body.from || "FlowTracker <noreply@flowtracker.hr>",
      to: [body.to],
      subject: body.subject,
      html: body.html,
    });

    return new Response(JSON.stringify({ success: true, id: result.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function processQueue(apiKey: string, headers: Record<string, string>) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: pending, error: fetchError } = await supabase
    .from("pending_emails")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(10);

  if (fetchError) throw fetchError;
  if (!pending || pending.length === 0) {
    return new Response(JSON.stringify({ success: true, processed: 0 }), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  let sent = 0;
  let failed = 0;

  for (const email of pending) {
    try {
      const result = await sendEmail(apiKey, {
        from: "FlowTracker <noreply@flowtracker.hr>",
        to: [email.recipient_email],
        subject: email.subject,
        html: email.html_body,
      });

      await supabase
        .from("pending_emails")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", email.id);

      sent++;
    } catch (err: any) {
      await supabase
        .from("pending_emails")
        .update({
          status: "failed",
          error_message: err.message?.slice(0, 500),
        })
        .eq("id", email.id);

      failed++;
    }
  }

  return new Response(
    JSON.stringify({ success: true, processed: pending.length, sent, failed }),
    { status: 200, headers: { ...headers, "Content-Type": "application/json" } },
  );
}

async function sendEmail(apiKey: string, payload: {
  from: string;
  to: string[];
  subject: string;
  html: string;
}) {
  const response = await fetch(RESEND_API, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || `Resend API error: ${response.status}`);
  }

  return data;
}
