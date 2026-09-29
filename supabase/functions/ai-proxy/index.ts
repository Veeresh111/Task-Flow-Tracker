import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ---------------------------------------------------------------------------
// AI PROXY — server-side inference chain (primary AI path for the app).
//
// Design (resilience, ₹0, no single point of failure):
//   Tier S1: Pollinations (OpenAI-compatible POST, keyless, free) — primary.
//   Tier S2: Hugging Face router (server secret HF_TOKEN) — secondary.
//            Multiple models are attempted in order (provider/model outages
//            degrade to the next model, not to failure).
//   If every server tier fails → 503 with an explicit error. The client then
//   runs its own keyless tier and finally its honest local fallback.
//   NO fabricated output is ever generated here.
//
// Auth: requires a VERIFIED Supabase user session (real GoTrue token).
// The anon key alone is NOT accepted. Quota abuse by anonymous callers is
// therefore impossible.
// ---------------------------------------------------------------------------

const TIMEOUT_MS = 45000;

async function callPollinations(apiMessages: unknown[], maxTokens: number, temperature: number): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch("https://text.pollinations.ai/openai/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai",
        messages: apiMessages,
        max_tokens: maxTokens,
        temperature,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      console.log(JSON.stringify({ event: "ai_proxy_tier_fail", tier: "pollinations", status: res.status }));
      return null;
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || "";
    return content.trim().length > 0 ? content : null;
  } catch (e) {
    console.log(JSON.stringify({ event: "ai_proxy_tier_fail", tier: "pollinations", error: String(e).slice(0, 120) }));
    return null;
  }
}

async function callHuggingFace(model: string, apiMessages: unknown[], maxTokens: number, temperature: number, token: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch("https://router.huggingface.co/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, messages: apiMessages, max_tokens: maxTokens, temperature }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      console.log(JSON.stringify({ event: "ai_proxy_tier_fail", tier: "huggingface", model, status: res.status }));
      return null;
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || "";
    return content.trim().length > 0 ? content : null;
  } catch (e) {
    console.log(JSON.stringify({ event: "ai_proxy_tier_fail", tier: "huggingface", model, error: String(e).slice(0, 120) }));
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ---- Auth wall: real GoTrue session required -------------------------
    const authHeader = req.headers.get('Authorization') || '';
    const rawToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!rawToken) {
      return new Response(JSON.stringify({ error: "401 Unauthorized: Authentication required." }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser(rawToken);
    if (authError || !user || user.aud !== "authenticated") {
      return new Response(JSON.stringify({ error: "401 Unauthorized: Invalid or expired session token." }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // ---- Request ----------------------------------------------------------
    const { prompt, systemInstruction, messages, temperature = 0.3, max_tokens = 2000 } = await req.json();

    const apiMessages: Array<{ role: string; content: string }> = Array.isArray(messages) && messages.length > 0
      ? messages
      : [];
    if (apiMessages.length === 0) {
      if (systemInstruction) apiMessages.push({ role: "system", content: systemInstruction });
      if (!prompt) {
        return new Response(JSON.stringify({ error: "400: prompt or messages required." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      apiMessages.push({ role: "user", content: prompt });
    }

    // ---- Tier S1: keyless free inference ----------------------------------
    const s1 = await callPollinations(apiMessages, max_tokens, temperature);
    if (s1) {
      return new Response(JSON.stringify({ content: s1, provider: "pollinations" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // ---- Tier S2: Hugging Face router with server token + model chain ----
    const HF_TOKEN = Deno.env.get("HF_TOKEN") || "";
    if (HF_TOKEN) {
      const models = [
        "Qwen/Qwen2.5-7B-Instruct",
        "Qwen/Qwen2.5-72B-Instruct",
        "meta-llama/Llama-3.1-8B-Instruct",
        "mistralai/Mistral-7B-Instruct-v0.3",
      ];
      for (const model of models) {
        const out = await callHuggingFace(model, apiMessages, max_tokens, temperature, HF_TOKEN);
        if (out) {
          return new Response(JSON.stringify({ content: out, provider: "huggingface", model }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
      }
    }

    // ---- All server tiers failed: explicit 503, nothing fabricated --------
    return new Response(JSON.stringify({
      error: "503: All AI providers are currently unreachable. No analysis was produced.",
      provider_chain: ["pollinations", "huggingface"],
    }), {
      status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "AI proxy failure" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
