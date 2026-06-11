import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log("=== MNC ATS-SCREEN SECURE EDGE FUNCTION: INVOCATION START ===");

    let body;
    try {
      body = await req.json();
    } catch (jsonErr) {
      console.error("FATAL: Failed to parse incoming request JSON body:", jsonErr);
      return new Response(JSON.stringify({ 
        error: "Malformed request payload. Body must be valid JSON." 
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { jobDescription, answers } = body;

    if (!jobDescription || !answers) {
      console.error("VALIDATION EXCEPTION: Missing required fields.");
      return new Response(JSON.stringify({ 
        error: "Missing required jobDescription or answers parameters." 
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const hfToken = Deno.env.get("HF_TOKEN");
    if (!hfToken) {
      console.error("FATAL: HF_TOKEN environment variable is missing");
      return new Response(JSON.stringify({ error: "Server configuration error: Missing HF_TOKEN" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // ====================== QWEN AI CALL ======================
    const prompt = `You are an expert ATS recruiter. Evaluate the candidate's answers against the job description.

Job Description:
${jobDescription}

Candidate Answers:
${JSON.stringify(answers, null, 2)}

Provide a score (0-100) and a short verdict. Return ONLY a JSON object in this exact format, nothing else:
{
  "score": number,
  "verdict": "string"
}`;

    const response = await fetch("https://router.huggingface.co/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${hfToken}`,
      },
      body: JSON.stringify({
        model: "Qwen/Qwen3-32B:groq",
        messages: [
          { role: "user", content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 600,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("QWEN API ERROR:", response.status, errorText);
      throw new Error(`Qwen API error: ${response.status}`);
    }

    const aiResult = await response.json();
    
    // === Added logging for debugging ===
    console.log("QWEN FULL RESPONSE:", JSON.stringify(aiResult, null, 2));

    const aiMessage = aiResult?.choices?.[0]?.message?.content || "";

    // === Robust JSON parsing (handles extra text, code blocks, etc.) ===
    const cleanedMessage = aiMessage
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    let score = 0;
    let verdict = "Profile falls below criteria requirements; needs alternative placement vetting.";

    try {
      const jsonMatch = cleanedMessage.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        
        score = typeof parsed.score === "number" 
          ? Math.round(parsed.score) 
          : 0;
        
        verdict = typeof parsed.verdict === "string" 
          ? parsed.verdict 
          : verdict;
      } else {
        console.warn("No JSON object found in Qwen response");
      }
    } catch (e) {
      console.error("Qwen JSON parse error:", e);
    }

    // Clamp score
    score = Math.max(0, Math.min(100, score));

    console.log("=== QWEN AI SCORING COMPLETE ===");
    console.log("FINAL ATS SCORE:", score);
    console.log("FINAL VERDICT:", verdict);
    console.log("=== MNC ATS-SCREEN EDGE ENGINE: INVOCATION END ===");

    return new Response(JSON.stringify({
      score: score,
      verdict: verdict
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err: any) {
    console.error("FATAL INTERNAL EXCEPTION:", err.message);
    return new Response(JSON.stringify({ 
      error: "An exception occurred inside the edge runtime execution layers.",
      trace: err.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
})