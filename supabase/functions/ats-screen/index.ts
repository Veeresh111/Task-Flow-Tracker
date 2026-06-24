import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

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
    const authHeader = req.headers.get('Authorization') || '';
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    let body;
    try {
      body = await req.json();
    } catch (jsonErr) {
      return new Response(JSON.stringify({ 
        error: "Malformed request payload. Body must be valid JSON." 
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { jobDescription, answers, resumeText } = body;

    if (!jobDescription || !answers) {
      return new Response(JSON.stringify({ 
        error: "Missing required jobDescription or answers parameters." 
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const hfToken = Deno.env.get("HF_TOKEN");
    if (!hfToken) {
      return new Response(JSON.stringify({ error: "Server configuration error: Missing HF_TOKEN" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const resumeSection = resumeText && resumeText.trim().length > 0
      ? `\nCandidate Resume / CV:\n${resumeText.substring(0, 10000)}`
      : '';

    const prompt = `You are an expert Corporate ATS (Applicant Tracking System) recruiter for FWC India. Evaluate the candidate holistically against the job description using REAL corporate hiring logic — NOT just keyword matching.

Analyze the following dimensions:
1. SKILLS MATCH: Identify required skills from the JD. For each skill, check if the candidate's resume or answers demonstrate it. Calculate a skills match percentage.
2. EXPERIENCE MATCH: Assess whether the candidate's total experience (years and domain relevance) meets the JD requirements.
3. EDUCATION MATCH: Check if the candidate's educational background aligns with the role requirements.
4. PROJECT RELEVANCE: Evaluate whether the candidate's past projects/achievements are relevant to the role.
5. CULTURAL & ROLE FIT: Assess communication style, leadership indicators, and overall presentation based on answers.
6. OVERALL FIT SCORE: A weighted composite score (0-100) combining all above factors.

Job Description:
${jobDescription}

Candidate Form Answers:
${JSON.stringify(answers, null, 2)}${resumeSection}

Return ONLY a valid JSON object in this exact format, no markdown, no backticks:
{
  "score": <number 0-100>,
  "verdict": "<2-3 sentence professional assessment>",
  "skills_match": <number 0-100>,
  "experience_match": <number 0-100>,
  "education_match": <number 0-100>,
  "project_relevance": <number 0-100>,
  "strengths": ["<strength 1>", "<strength 2>"],
  "gaps": ["<gap 1>", "<gap 2>"],
  "recommendation": "<Strong Hire | Hire | Consider | Reject>"
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
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Qwen API error: ${response.status}`);
    }

    const aiResult = await response.json();
    const aiMessage = aiResult?.choices?.[0]?.message?.content || "";

    const cleanedMessage = aiMessage
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    let score = 0;
    let verdict = "Pending human review";
    let skillsMatch = 0;
    let experienceMatch = 0;
    let educationMatch = 0;
    let projectRelevance = 0;
    let strengths: string[] = [];
    let gaps: string[] = [];
    let recommendation = "Review";

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

        skillsMatch = typeof parsed.skills_match === "number"
          ? Math.round(parsed.skills_match)
          : 0;

        experienceMatch = typeof parsed.experience_match === "number"
          ? Math.round(parsed.experience_match)
          : 0;

        educationMatch = typeof parsed.education_match === "number"
          ? Math.round(parsed.education_match)
          : 0;

        projectRelevance = typeof parsed.project_relevance === "number"
          ? Math.round(parsed.project_relevance)
          : 0;

        strengths = Array.isArray(parsed.strengths) ? parsed.strengths : [];
        gaps = Array.isArray(parsed.gaps) ? parsed.gaps : [];
        recommendation = typeof parsed.recommendation === "string"
          ? parsed.recommendation
          : "Review";
      }
    } catch (e) {
      console.error("Qwen JSON parse error:", e);
    }

    score = Math.max(0, Math.min(100, score));

    return new Response(JSON.stringify({
      score: score,
      verdict: verdict,
      skills_match: skillsMatch,
      experience_match: experienceMatch,
      education_match: educationMatch,
      project_relevance: projectRelevance,
      strengths: strengths,
      gaps: gaps,
      recommendation: recommendation
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ 
      error: err.message
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
})
