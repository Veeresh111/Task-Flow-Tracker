import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  // Handle secure preflight CORS handshake validation header mappings
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log("=== MNC ATS-SCREEN SECURE EDGE FUNCTION: INVOCATION START ===");

    // Safeguard: Read JSON payload safely with a protective try/catch block
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
    console.log("DIAGNOSTIC TRACE - JOB DESCRIPTION EXISTS:", !!jobDescription);
    console.log("DIAGNOSTIC TRACE - CANDIDATE ANSWERS EXIST:", !!answers);

    if (!jobDescription || !answers) {
      console.error("VALIDATION EXCEPTION: Missing required processing matrix fields.");
      return new Response(JSON.stringify({ 
        error: "Missing required jobDescription or answers matrix parameters." 
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // === SWITCHED TO THE HIGH-STABILITY DETERMINISTIC ATS ENGINE WORKFLOW ===
    const answerText = JSON.stringify(answers).toLowerCase();
    const jdText = String(jobDescription).toLowerCase();

    // Tokenize Job Description into core technical skill vector keyword arrays
    // Filter out stop words and short conversational fillers (length > 3)
    const stopWords = new Set(["with", "from", "that", "this", "then", "your", "have", "will", "should", "could", "would", "about", "their", "there"]);
    const keywords = jdText
      .split(/\W+/)
      .filter(word => word.length > 3 && !stopWords.has(word));

    console.log(`DETERMINISTIC VECTOR EXTRACTOR: Evaluated ${keywords.length} core keyword strings.`);

    let score = 0;
    let verdict = "Profile falls below criteria requirements; needs alternative placement vetting.";

    if (keywords.length > 0) {
      // Track overlapping matching parameters in text pools
      const matches = keywords.filter(k => answerText.includes(k));
      const uniqueMatches = Array.from(new Set(matches));
      const uniqueKeywords = Array.from(new Set(keywords));
      
      console.log(`DETERMINISTIC VECTOR EXTRACTOR: Encountered ${uniqueMatches.length} matching skill keys.`);

      // Compute weighted percentage score
      const scoreCalculation = (uniqueMatches.length / uniqueKeywords.length) * 100;
      
      // Scale and add an experiential bonus weight if candidate states numerical values above threshold
      const genericExperienceBoost = /\b([2-9]|\d{2,})\b/.test(answerText) ? 10 : 0;
      score = Math.round(scoreCalculation + genericExperienceBoost);
    }

    // Clamp computed ranges perfectly to corporate threshold boundaries
    score = Math.max(0, Math.min(100, score));

    if (score >= 75) {
      verdict = "Candidate displays strong technical qualification markers across core keyword buckets.";
    } else if (score >= 50) {
      verdict = "Candidate displays partial domain alignment. Profile queued for detailed recruiter manual review.";
    }

    console.log("=== COMPILATION COMPLETE: DETERMINISTIC SCORING RESULTS ===");
    console.log("CALIBRATED OBJECTIVE ATS SCORE:", score);
    console.log("CALIBRATED GENERATED SUMMARY VERDICT:", verdict);
    console.log("=== MNC ATS-SCREEN EDGE ENGINE: INVOCATION END ===");

    return new Response(JSON.stringify({
      score: score,
      verdict: verdict
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err: any) {
    console.error("FATAL INTERNAL EXCEPTION HANDLED BY EDGE ROUTER GATE:", err.message);
    return new Response(JSON.stringify({ 
      error: "An exception occurred inside the edge runtime execution layers.",
      trace: err.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
})