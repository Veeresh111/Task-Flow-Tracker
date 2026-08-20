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
    const { secureToken, candidateAnswers, violationCount, proctorLog } = await req.json();

    if (!secureToken || !candidateAnswers) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: token, error: tokenErr } = await supabase
      .from("assessment_tokens")
      .select("*")
      .eq("token", secureToken)
      .eq("status", "Active")
      .eq("used", false)
      .single();

    if (tokenErr || !token) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (token.expires_at && new Date(token.expires_at) < new Date()) {
      await supabase
        .from("assessment_tokens")
        .update({ status: "Expired" })
        .eq("id", token.id);
      return new Response(JSON.stringify({ error: "Token has expired" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { data: assessment } = await supabase
      .from("assessments")
      .select("*")
      .eq("id", token.assessment_id)
      .single();

    // Server-side violation aggregation from proctor_log.
    // Client logs violations as descriptive type strings (e.g. "Tab Switch / Window Focus Lost"),
    // NOT as the literal string "violation". Count all log entries as violations.
    const actualViolations = Array.isArray(proctorLog) ? proctorLog.length : (typeof violationCount === 'number' ? violationCount : 0);
    const maxViolations = assessment?.max_violations ?? 5;

    // Enforce max_attempts
    if (assessment?.max_attempts && assessment.max_attempts > 0) {
      const { count: attemptCount } = await supabase
        .from("assessment_attempts")
        .select("*", { count: "exact", head: true })
        .eq("assessment_id", token.assessment_id)
        .eq("candidate_id", token.candidate_id);
      if (attemptCount && attemptCount >= assessment.max_attempts) {
        return new Response(JSON.stringify({
          error: `Maximum attempts (${assessment.max_attempts}) reached for this assessment.`,
          maxed_out: true
        }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    if (actualViolations >= maxViolations) {
      await supabase
        .from("assessment_tokens")
        .update({ status: "Disqualified", used: true, proctor_log: proctorLog || null })
        .eq("token", secureToken);

      if (token.application_id) {
        await supabase
          .from("job_applications")
          .update({ status: "Rejected" })
          .eq("id", token.application_id);
      }

      try {
        if (token.candidate_id) {
          await supabase.from('candidate_notifications').insert({
            candidate_id: token.candidate_id,
            title: 'Assessment Disqualified',
            message: 'Your assessment has been disqualified due to excessive proctoring violations. Please contact HR for further assistance.',
            read: false
          });
        }
      } catch (notifErr) {
        console.error("Disqualification notification error:", notifErr);
      }

      return new Response(JSON.stringify({
        disqualified: true,
        score: 0,
        correct: 0,
        total: 0,
        aiFeedback: "Assessment disqualified due to excessive proctoring violations."
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const questions = assessment?.questions || [];
    const totalQuestions = questions.length;

    if (totalQuestions === 0) {
      return new Response(JSON.stringify({ score: 0, passed: false, total: 0, correct: 0, details: "No questions in assessment" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    let correctCount = 0;
    const ambiguousAnswers: { index: number; question: string; correctAnswer: string; userAnswer: string }[] = [];

    for (let i = 0; i < totalQuestions; i++) {
      const q = questions[i];
      const userAnswer = String(candidateAnswers[i] || "").trim().toLowerCase();
      const correctAnswer = String(q.correctAnswer || q.correct_option || q.answer || "").trim().toLowerCase();
      const answerIndex = q.options?.indexOf(candidateAnswers[i]);

      if (correctAnswer && (userAnswer === correctAnswer || String(answerIndex + 1) === correctAnswer)) {
        correctCount++;
      } else if (userAnswer && correctAnswer) {
        ambiguousAnswers.push({
          index: i,
          question: q.question,
          correctAnswer: q.correctAnswer || q.correct_option || q.answer || "",
          userAnswer: candidateAnswers[i]
        });
      }
    }

    let aiEvaluatedCount = 0;
    let aiFeedback = "";

    if (ambiguousAnswers.length > 0) {
      const HF_TOKEN = Deno.env.get("HF_TOKEN");
      if (HF_TOKEN) {
        const maxRetries = 3;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
          try {
            const prompt = `You are an expert exam grader for a Fortune 500 corporate assessment platform.

TASK: For each question below, determine if the candidate's answer is semantically correct — meaning it conveys the same essential meaning as the correct answer, even if worded differently, abbreviated, or uses synonyms.

RULES:
- Accept answers that are semantically equivalent (e.g. "JS" = "JavaScript", "ML" = "Machine Learning")
- Accept answers with minor typos if the intent is clearly correct
- Reject answers that are factually wrong or describe a different concept
- Be strict on technical accuracy — partial answers are wrong unless they capture the core concept

QUESTIONS TO EVALUATE:
${ambiguousAnswers.map((a, idx) =>
  `[${idx + 1}] Question: "${a.question}"
   Expected: "${a.correctAnswer}"
   Candidate: "${a.userAnswer}"`
).join("\n\n")}

RESPOND WITH ONLY a JSON object in this exact format:
{"results": [true, false, ...]}
where each boolean corresponds to the question in order. true = correct, false = wrong.`;

            const hfRes = await fetch("https://router.huggingface.co/v1/chat/completions", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${HF_TOKEN}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                model: "Qwen/Qwen3-32B:groq",
                messages: [
                  { role: "system", content: "You are a precise exam evaluator for enterprise recruitment. Output only valid JSON. Do not include explanations, markdown, or code fences." },
                  { role: "user", content: prompt }
                ],
                temperature: 0.1,
                max_tokens: 1024,
                response_format: { type: "json_object" }
              })
            });

            if (hfRes.ok) {
              const hfData = await hfRes.json();
              let raw = hfData.choices?.[0]?.message?.content || "{}";
              // Strip thinking tags that some models emit
              raw = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<thinking>[\s\S]*?<\/thinking>/gi, "").trim();
              const clean = raw.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();

              let evaluations: boolean[] = [];
              try {
                const parsed = JSON.parse(clean);
                evaluations = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.results) ? parsed.results : []);
              } catch {
                // Try extracting array from malformed response
                const arrayMatch = clean.match(/\[[\s\S]*?\]/);
                if (arrayMatch) {
                  evaluations = JSON.parse(arrayMatch[0]);
                }
              }

              if (Array.isArray(evaluations) && evaluations.length > 0) {
                for (let i = 0; i < Math.min(evaluations.length, ambiguousAnswers.length); i++) {
                  if (evaluations[i] === true) {
                    correctCount++;
                    aiEvaluatedCount++;
                  }
                }
                break; // Success — exit retry loop
              }
            } else if (hfRes.status === 429 || hfRes.status === 503) {
              // Rate limited or service unavailable — retry with backoff
              if (attempt < maxRetries - 1) {
                await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
                continue;
              }
            }
            break; // Non-retryable response
          } catch (semanticErr) {
            console.error(`Semantic evaluation attempt ${attempt + 1} error:`, semanticErr);
            if (attempt < maxRetries - 1) {
              await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
            }
          }
        }
      }
    }

    const score = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
    const passed = score >= (assessment?.passing_score || 70);

    await supabase
      .from("assessment_tokens")
      .update({ status: "Used", used: true, proctor_log: proctorLog || null })
      .eq("token", secureToken);

    const { data: attempt } = await supabase
      .from("assessment_attempts")
      .insert([{
        candidate_id: token.candidate_id,
        assessment_id: token.assessment_id,
        application_id: token.application_id,
        token_id: token.id,
        score,
        passed,
        total_questions: totalQuestions,
        correct_answers: correctCount,
        violations: actualViolations,
        selections: candidateAnswers
      }])
      .select("id")
      .single();

    if (attempt?.id) {
      await supabase
        .from("assessment_tokens")
        .update({ attempt_id: attempt.id })
        .eq("token", secureToken);
    }

    if (passed && token.application_id) {
      let interviewDecision = "Pending Scheduling";
      let aiDecisionFeedback = "Assessment passed. Moving to interview stage.";

      try {
        const HF_TOKEN = Deno.env.get("HF_TOKEN");
        if (HF_TOKEN && ambiguousAnswers.length > 0) {
          const decisionPrompt = `Candidate scored ${score}% on the assessment (passing threshold: ${assessment?.passing_score || 70}%).
They answered ${correctCount}/${totalQuestions} questions correctly.
${aiEvaluatedCount > 0 ? `${aiEvaluatedCount} answers were validated by AI semantic evaluation.` : ""}
Based on this performance, should the candidate be moved to the interview stage?
Respond with JSON: {"decision": "proceed"/"review"/"skip", "reason": "brief explanation"}`;

          const decisionRes = await fetch("https://router.huggingface.co/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${HF_TOKEN}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model: "Qwen/Qwen3-32B:groq",
              messages: [
                { role: "system", content: "You are an AI recruitment coordinator. Make data-driven decisions about candidate readiness for interview." },
                { role: "user", content: decisionPrompt }
              ],
              temperature: 0.2,
              max_tokens: 512,
              response_format: { type: "json_object" }
            })
          });

          if (decisionRes.ok) {
            const decisionData = await decisionRes.json();
            const decisionRaw = decisionData.choices?.[0]?.message?.content || "{}";
            const decisionClean = decisionRaw.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
            const decision = JSON.parse(decisionClean);

            if (decision.decision === "skip") {
              interviewDecision = "Skipped";
              aiDecisionFeedback = `Assessment review: ${decision.reason || "Score meets threshold but AI recommends further review."}`;
            } else if (decision.decision === "review") {
              interviewDecision = "Pending Review";
              aiDecisionFeedback = `Assessment review: ${decision.reason || "Candidate scored ${score}%. Manual review recommended before interview scheduling."}`;
            } else {
              interviewDecision = "Pending Scheduling";
              aiDecisionFeedback = `Assessment passed. AI recommendation: ${decision.reason || "Proceed to interview."}`;
            }
          }
        }
      } catch (decisionErr) {
        console.error("AI decision error:", decisionErr);
      }

      await supabase
        .from("job_applications")
        .update({
          status: interviewDecision === "Skipped" ? "Rejected" : "Assessment Completed",
          interview_status: interviewDecision
        })
        .eq("id", token.application_id);

      aiFeedback = aiDecisionFeedback;

      try {
        const { data: appData } = await supabase
          .from('job_applications')
          .select('candidate_id, candidate_name, form_id')
          .eq('id', token.application_id)
          .single();

        let jobTitle = "the position";
        if (appData?.form_id) {
          const { data: form } = await supabase
            .from('job_forms')
            .select('job_title')
            .eq('id', appData.form_id)
            .single();
          if (form?.job_title) jobTitle = form.job_title;
        }

        if (appData?.candidate_id) {
          // Notify candidate
          await supabase.from('candidate_notifications').insert({
            candidate_id: appData.candidate_id,
            title: 'Assessment Graded',
            message: `Your assessment for ${jobTitle} has been graded. Score: ${score}%. Status: ${passed ? 'Passed - Moving to next stage' : 'Below passing threshold'}.`,
            read: false
          });

          // Notify HR team
          const { data: hrUsers } = await supabase
            .from('profiles')
            .select('id')
            .eq('role', 'hr');
          if (hrUsers && hrUsers.length > 0) {
            const hrNotifications = hrUsers.map((hr: any) => ({
              user_id: hr.id,
              title: "Assessment Completed - Action Required",
              message: `${appData.candidate_name || 'A candidate'} completed assessment for ${jobTitle}. Score: ${score}%. AI Decision: ${interviewDecision === 'Pending Scheduling' ? 'Proceed to Interview' : interviewDecision === 'Pending Review' ? 'Needs Manual Review' : 'Skipped'}. Review in Recruitment Pipeline.`,
              is_read: false,
              created_at: new Date().toISOString()
            }));
            await supabase.from('notifications').insert(hrNotifications);
          }

          // Additional notification when candidate is interview-ready
          if (interviewDecision === "Pending Scheduling" && hrUsers && hrUsers.length > 0) {
            const interviewReadyNotifications = hrUsers.map((hr: any) => ({
              user_id: hr.id,
              title: "Candidate Ready for Interview",
              message: `${appData.candidate_name || 'A candidate'} has passed the assessment for ${jobTitle} (Score: ${score}%). AI recommends scheduling an interview. Visit Interview Center to schedule.`,
              is_read: false,
              created_at: new Date().toISOString()
            }));
            await supabase.from('notifications').insert(interviewReadyNotifications);
          }
        }
      } catch (notifErr) {
        console.error("Notification insert error:", notifErr);
      }
    } else if (!passed) {
      aiFeedback = "Assessment completed. Score below passing threshold.";

      // Update status to Rejected
      if (token.application_id) {
        await supabase
          .from("job_applications")
          .update({ status: "Rejected" })
          .eq("id", token.application_id);
      }

      try {
        const { data: appData } = await supabase
          .from('job_applications')
          .select('candidate_id, candidate_name, form_id')
          .eq('id', token.application_id)
          .single();

        let jobTitle = "the position";
        if (appData?.form_id) {
          const { data: form } = await supabase
            .from('job_forms')
            .select('job_title')
            .eq('id', appData.form_id)
            .single();
          if (form?.job_title) jobTitle = form.job_title;
        }

        if (appData?.candidate_id) {
          await supabase.from('candidate_notifications').insert({
            candidate_id: appData.candidate_id,
            title: 'Assessment Result',
            message: `Your assessment for ${jobTitle} has been evaluated. Score: ${score}% (required: ${assessment?.passing_score || 70}%). Unfortunately, you did not pass the threshold.`,
            read: false
          });

          const { data: hrUsers } = await supabase
            .from('profiles')
            .select('id')
            .eq('role', 'hr');
          if (hrUsers && hrUsers.length > 0) {
            const hrNotifications = hrUsers.map((hr: any) => ({
              user_id: hr.id,
              title: "Assessment Completed - Below Threshold",
              message: `${appData.candidate_name || 'A candidate'} completed assessment for ${jobTitle}. Score: ${score}% (below ${assessment?.passing_score || 70}% threshold). Candidate may need review or can be moved to rejection pipeline.`,
              is_read: false,
              created_at: new Date().toISOString()
            }));
            await supabase.from('notifications').insert(hrNotifications);
          }
        }
      } catch (notifErr) {
        console.error("Failed notification error:", notifErr);
      }
    }

    return new Response(JSON.stringify({
      passed,
      score,
      total: totalQuestions,
      correct: correctCount,
      disqualified: false,
      aiFeedback
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
