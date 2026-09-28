import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Authorization wall: require a valid Supabase Auth JWT. The anon key is
    // NOT sufficient — unauthenticated callers must never reach the paid/quota
    // AI provider. This closes the previous unauthenticated abuse path.
    const authHeader = req.headers.get('Authorization') || '';
    const rawToken = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (!rawToken) {
      return new Response(JSON.stringify({ error: "401 Unauthorized: Authentication required." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser(rawToken);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "401 Unauthorized: Invalid or expired session token." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { prompt, systemInstruction, messages, temperature = 0.3, max_tokens = 2000, response_format } = await req.json();

    const HF_TOKEN = Deno.env.get("HF_TOKEN");
    if (!HF_TOKEN) {
      return new Response(JSON.stringify({ error: "Server configuration error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const apiMessages = messages || [];
    if (!messages || messages.length === 0) {
      if (systemInstruction) {
        apiMessages.push({ role: "system", content: systemInstruction });
      }
      apiMessages.push({ role: "user", content: prompt });
    }

    const requestBody: Record<string, unknown> = {
      model: "Qwen/Qwen3-32B:groq",
      messages: apiMessages,
      temperature,
      max_tokens,
    };
    if (response_format) {
      requestBody.response_format = response_format;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    const response = await fetch("https://router.huggingface.co/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${HF_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || "HF API error");
    }

    return new Response(JSON.stringify({
      content: data.choices[0].message.content
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
