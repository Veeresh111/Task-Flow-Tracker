import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
// === COMPILATION FIXED: Purged non-existent ClipboardText import and replaced with FileText ===
import { Loader2, Video, BrainCircuit, Play, ShieldAlert, Calendar, Link2, CheckCircle2, Award, FileText, Sparkles, CalendarClock, Ban } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { callCorporateAI } from "@/lib/ai";

function getSupportedTimezones(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone') as string[];
  } catch {
    return [
      'Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Shanghai',
      'Asia/Riyadh', 'Europe/London', 'Europe/Berlin', 'Europe/Paris',
      'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
      'America/Toronto', 'America/Sao_Paulo', 'Australia/Sydney', 'Pacific/Auckland',
      'UTC'
    ];
  }
}

export default function InterviewCenter() {
  const { toast } = useToast();
  const [aiLoading, setAiLoading] = useState(false);
  const [globalLoading, setGlobalLoading] = useState(true);

  // Core Data Pipelines Ledgers
  const [pendingQueue, setPendingQueue] = useState<any[]>([]);
  const [activeSessions, setActiveSessions] = useState<any[]>([]);

  // Scheduling Form States
  const [selectedApplicationId, setSelectedApplicationId] = useState("");
  const [roundName, setRoundName] = useState("Technical Round 1");
  const [scheduledAt, setScheduledAt] = useState("");
  const [selectedTimezone, setSelectedTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [meetingLink, setMeetingLink] = useState("");
  const [meetingProvider, setMeetingProvider] = useState("Google Meet");

  // Multi-round tracking: default next round number
  const [nextRoundNumber, setNextRoundNumber] = useState(1);

  // Evaluation Sheet Target Session Context
  const [focusedSession, setFocusedSession] = useState<any>(null);
  const [commScore, setCommScore] = useState(70);
  const [techScore, setTechScore] = useState(70);
  const [probScore, setProbScore] = useState(70);
  const [cultScore, setCultScore] = useState(70);
  const [rawTranscript, setRawTranscript] = useState("");

  // Reschedule/Cancel States
  const [rescheduleTarget, setRescheduleTarget] = useState<any>(null);
  const [newScheduledAt, setNewScheduledAt] = useState("");
  const [newMeetingLink, setNewMeetingLink] = useState("");
  const [newTimezone, setNewTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);

  useEffect(() => {
    loadRecruitmentInterviewData();
  }, []);

  const loadRecruitmentInterviewData = async () => {
    try {
      setGlobalLoading(true);

      // Fetch pending scheduling queue from job_applications (new columns)
      const { data: queueData, error: queueErr } = await supabase
        .from("job_applications")
        .select("id, candidate_id, form_id, status, interview_status")
        .eq("interview_status", "Pending Scheduling");

      if (queueErr) throw queueErr;

      const enrichedQueue = await Promise.all((queueData || []).map(async (app: any) => {
        const [candRes, formRes] = await Promise.all([
          app.candidate_id ? supabase.from("candidates").select("id, full_name, email").eq("id", app.candidate_id).maybeSingle() : Promise.resolve({ data: null }),
          app.form_id ? supabase.from("job_forms").select("id, job_title").eq("id", app.form_id).maybeSingle() : Promise.resolve({ data: null })
        ]);
        return { ...app, candidates: candRes.data, job_forms: formRes.data };
      }));
      setPendingQueue(enrichedQueue);

      // Fetch all interview sessions
      const { data: sessionsRaw, error: sessionErr } = await supabase
        .from("interview_sessions")
        .select("*")
        .order("scheduled_at", { ascending: true });

      if (sessionErr) throw sessionErr;

      const enrichedSessions = await Promise.all((sessionsRaw || []).map(async (session: any) => {
        if (!session.application_id) return { ...session, job_application: null };
        const { data: app } = await supabase
          .from("job_applications")
          .select("id, form_id, candidate_id")
          .eq("id", session.application_id)
          .maybeSingle();

        let candidatesData = null;
        let jobFormsData = null;
        if (app) {
          const [candRes, formRes] = await Promise.all([
            app.candidate_id ? supabase.from("candidates").select("id, full_name, email").eq("id", app.candidate_id).maybeSingle() : Promise.resolve({ data: null }),
            app.form_id ? supabase.from("job_forms").select("id, job_title").eq("id", app.form_id).maybeSingle() : Promise.resolve({ data: null })
          ]);
          candidatesData = candRes.data;
          jobFormsData = formRes.data;
        }
        return { ...session, job_application: app ? { ...app, candidates: candidatesData, job_forms: jobFormsData } : null };
      }));
      setActiveSessions(enrichedSessions);

    } catch (err: any) {
      console.error("Failed to hydrate active interview session registers:", err);
    } finally {
      setGlobalLoading(false);
    }
  };

  const handleCreateInterviewSession = async () => {
    if (!selectedApplicationId || !scheduledAt || !meetingLink.trim()) {
      return toast({ 
        title: "Validation Error", 
        description: "All parameter mappings are mandatory to reserve room scopes.", 
        variant: "destructive" 
      });
    }

    try {
      setAiLoading(true);

      // Compute next round number based on existing sessions for this application
      const { data: existingRounds } = await supabase
        .from("interview_sessions")
        .select("round_number")
        .eq("application_id", selectedApplicationId)
        .order("round_number", { ascending: false })
        .limit(1);

      const nextRound = (existingRounds?.[0]?.round_number || 0) + 1;

      // Commit scheduling row record directly onto public.interview_sessions ledger
      const { data: sessionObj, error: insertErr } = await supabase
        .from("interview_sessions")
        .insert([{
          application_id: selectedApplicationId,
          round_name: roundName,
          round_number: nextRound,
          scheduled_at: new Date(scheduledAt).toISOString(),
          meeting_link: meetingLink.trim(),
          meeting_provider: meetingProvider,
          status: "Scheduled",
          feedback: "Awaiting live candidate conversation stream loop."
        }])
        .select()
        .single();

      if (insertErr) throw insertErr;

      // Note: DB trigger trg_interview_notify handles candidate notification automatically
      // with richer content including role name, meeting link, and scheduled time.

      // Update parent application record — trigger syncs candidate_applications
      await supabase
        .from("job_applications")
        .update({
          status: "Interview Scheduled",
          interview_status: "Scheduled"
        })
        .eq("id", selectedApplicationId);

      toast({ title: "Session Dispatched", description: "Interview token committed and candidate notification alerts issued." });
      
      // Flush form inputs
      setSelectedApplicationId("");
      setMeetingLink("");
      setScheduledAt("");
      
      loadRecruitmentInterviewData();
    } catch (err: any) {
      toast({ title: "Scheduling Transaction Terminated", description: err.message, variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  };

  const parseSafeBoundScoreValue = (value: string): number => {
    const rawNum = Number(value);
    if (isNaN(rawNum)) return 0;
    return Math.max(0, Math.min(100, rawNum));
  };

  const executeLiveAIScoringEngine = async () => {
    if (!focusedSession) return;
    
    setAiLoading(true);
    
    // Compute deterministic overall average score out of structured scorecard matrices
    const calculatedOverallAverage = parseFloat(((commScore + techScore + probScore + cultScore) / 4).toFixed(2));
    const passedCriteriasThreshold = calculatedOverallAverage >= 75;

    let pipelineStageOutcome = passedCriteriasThreshold ? "Interview Cleared" : "Rejected";
    let interviewOutcomeStatus = passedCriteriasThreshold ? "Completed" : "Rejected";

    try {
      // Generate AI analysis report from transcript + scores
      let aiAnalysisReport = "";
      let aiRecommendation = passedCriteriasThreshold ? "Hire" : "Reject";

      if (rawTranscript.trim()) {
        try {
          const aiPrompt = `Analyze this interview evaluation:

Role: ${focusedSession.job_application?.job_forms?.job_title || "Unknown"}
Candidate: ${focusedSession.job_application?.candidates?.full_name || "Unknown"}
Round: ${focusedSession.round_name || "Technical Round"}

Scores (0-100):
- Communication: ${commScore}
- Technical: ${techScore}
- Problem Solving: ${probScore}
- Culture Fit: ${cultScore}
- Overall: ${calculatedOverallAverage}%

Interview Transcript:
${rawTranscript.trim().substring(0, 3000)}

Provide a concise professional analysis including:
1. Key strengths observed
2. Areas of concern
3. Overall suitability recommendation
4. Suggested next steps

Output as JSON: {"strengths": "...", "concerns": "...", "verdict": "${aiRecommendation}", "next_steps": "..."}`;

          const aiResponse = await callCorporateAI({
            prompt: aiPrompt,
            temperature: 0.3,
            max_tokens: 1024,
            response_format: { type: "json_object" }
          });

          if (aiResponse) {
            const clean = aiResponse.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(clean);
            aiAnalysisReport = `Strengths: ${parsed.strengths || "N/A"}\nConcerns: ${parsed.concerns || "N/A"}\nVerdict: ${parsed.verdict || aiRecommendation}\nNext Steps: ${parsed.next_steps || "Standard follow-up process."}`;
            if (parsed.verdict && parsed.verdict !== aiRecommendation) {
              aiRecommendation = parsed.verdict === "Hire" ? "Hire" : "Reject";
            }
          }
        } catch {
          aiAnalysisReport = `Scorecard metrics evaluated. Communication: ${commScore}, Technical: ${techScore}, Problem Solving: ${probScore}, Culture Fit: ${cultScore}.`;
        }
      } else {
        aiAnalysisReport = `Scorecard metrics evaluated. Communication: ${commScore}, Technical: ${techScore}, Problem Solving: ${probScore}, Culture Fit: ${cultScore}.`;
      }

      const finalOutcome = aiRecommendation === "Hire" && passedCriteriasThreshold;
      pipelineStageOutcome = finalOutcome ? "Interview Cleared" : "Rejected";
      interviewOutcomeStatus = finalOutcome ? "Completed" : "Rejected";

      // Push final structured score dimensions back into public.interview_sessions log row
      const { error: sessionUpdateErr } = await supabase
        .from("interview_sessions")
        .update({
          status: "Completed",
          score: calculatedOverallAverage,
          communication_score: commScore,
          technical_score: techScore,
          problem_solving_score: probScore,
          culture_fit_score: cultScore,
          transcript: rawTranscript.trim(),
          ai_recommendation: aiRecommendation,
          ai_analysis_report: aiAnalysisReport,
          feedback: `Overall Score: ${calculatedOverallAverage}%. AI analysis completed.`
        })
        .eq("id", focusedSession.id);

      if (sessionUpdateErr) throw sessionUpdateErr;

      // Update job_applications (single source of truth) — trigger syncs candidate_applications
      const candidateId = focusedSession.job_application?.candidate_id;

      await supabase
        .from("job_applications")
        .update({
          status: pipelineStageOutcome,
          interview_status: interviewOutcomeStatus,
          interview_score: calculatedOverallAverage,
          ai_verdict: `Structured interview processed. Cumulative Score: ${calculatedOverallAverage}%`
        })
        .eq("id", focusedSession.application_id);

      // Keep master candidate stage directory target state synced
      if (candidateId) {
        await supabase
          .from("candidates")
          .update({ stage: pipelineStageOutcome })
          .eq("id", candidateId);
      }

      // Notify candidate of interview result
      try {
        const candidateName = focusedSession.job_application?.candidates?.full_name || focusedSession.job_application?.candidate_name || "Candidate";
        const jobTitle = focusedSession.job_application?.job_forms?.job_title || "the position";
        if (candidateId) {
          await supabase.from('candidate_notifications').insert({
            candidate_id: candidateId,
            title: finalOutcome ? 'Interview Cleared' : 'Interview Result',
            message: finalOutcome
              ? `Congratulations! You have cleared the interview for ${jobTitle} (Round: ${focusedSession.round_name || 'Technical'}). Score: ${calculatedOverallAverage}%. HR will contact you with next steps.`
              : `Your interview for ${jobTitle} (Round: ${focusedSession.round_name || 'Technical'}) has been evaluated. Score: ${calculatedOverallAverage}%. HR may schedule an additional round.`,
            read: false
          });
        }
      } catch (notifErr) {
        console.error("Interview result notification error:", notifErr);
      }

      // Pre-fill scheduling form with next round for HR decision
      if (focusedSession.application_id) {
        setSelectedApplicationId(focusedSession.application_id);
        const nextRound = (nextRoundNumber || 1) + 1;
        setRoundName(`Technical Round ${nextRound}`);
        toast({
          title: "Evaluation Committed",
          description: pipelineStageOutcome === "Rejected"
            ? "Candidate not cleared. Schedule another round below or reject."
            : "Candidate cleared! Schedule next round or proceed to offer management."
        });
      }
      setFocusedSession(null);
      setRawTranscript("");
      loadRecruitmentInterviewData();
    } catch (err: any) {
      toast({ title: "Scoring Pipeline Exception", description: err.message, variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  };

  const handleRescheduleInterview = async () => {
    if (!rescheduleTarget || !newScheduledAt) {
      return toast({ title: "Validation Error", description: "New date/time is required.", variant: "destructive" });
    }
    try {
      setAiLoading(true);
      const { error: updateErr } = await supabase
        .from("interview_sessions")
        .update({
          scheduled_at: new Date(newScheduledAt).toISOString(),
          meeting_link: newMeetingLink.trim() || rescheduleTarget.meeting_link
        })
        .eq("id", rescheduleTarget.id);
      if (updateErr) throw updateErr;
      const { data: app } = await supabase
        .from("job_applications")
        .select("candidate_id")
        .eq("id", rescheduleTarget.application_id)
        .maybeSingle();
      if (app?.candidate_id) {
        await supabase.from("candidate_notifications").insert({
          candidate_id: app.candidate_id,
          title: "Interview Rescheduled",
          message: `Your interview has been rescheduled to ${new Date(newScheduledAt).toLocaleString()}. Please check your dashboard for updated details.`,
          read: false
        });
      }
      toast({ title: "Session Rescheduled", description: "Candidate has been notified of the updated time." });
      setRescheduleTarget(null);
      setNewScheduledAt("");
      setNewMeetingLink("");
      loadRecruitmentInterviewData();
    } catch (err: any) {
      toast({ title: "Reschedule Failed", description: err.message, variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  };

  const handleCancelInterview = async (session: any) => {
    try {
      setAiLoading(true);
      const { error: updateErr } = await supabase
        .from("interview_sessions")
        .update({ status: "Cancelled" })
        .eq("id", session.id);
      if (updateErr) throw updateErr;
      const { data: app } = await supabase
        .from("job_applications")
        .select("candidate_id")
        .eq("id", session.application_id)
        .maybeSingle();
      if (app?.candidate_id) {
        await supabase.from("candidate_notifications").insert({
          candidate_id: app.candidate_id,
          title: "Interview Cancelled",
          message: "Your scheduled interview has been cancelled. Please contact HR for further details.",
          read: false
        });
      }
      toast({ title: "Session Cancelled", description: "The interview has been cancelled and the candidate notified." });
      setCancelConfirmId(null);
      loadRecruitmentInterviewData();
    } catch (err: any) {
      toast({ title: "Cancellation Failed", description: err.message, variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid lg:grid-cols-3 gap-6">
        
        {/* LEFT PANEL: ACTIVE REQUISITION SCHEDULING DESK */}
        <Card className="lg:col-span-1 border-slate-200 shadow-sm bg-white">
          <CardHeader className="bg-slate-50 border-b p-4">
            <CardTitle className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-600" /> Requisition Scheduling Desk
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black tracking-wider text-slate-500 uppercase">Select Verified Applicant</label>
                <Select value={selectedApplicationId} onValueChange={async (val) => {
                  setSelectedApplicationId(val);
                  // Auto-detect next round number
                  const { data: existingRounds } = await supabase
                    .from("interview_sessions")
                    .select("round_number, round_name")
                    .eq("application_id", val)
                    .order("round_number", { ascending: false })
                    .limit(1);
                  const next = (existingRounds?.[0]?.round_number || 0) + 1;
                  setNextRoundNumber(next);
                  setRoundName(`Technical Round ${next}`);
                }}>
                  <SelectTrigger className="bg-white text-xs h-10 font-medium">
                    <SelectValue placeholder="Choose shortlisted target candidate..." />
                  </SelectTrigger>
                  <SelectContent>
                    {pendingQueue.map((item) => (
                      <SelectItem key={item.id} value={item.id} className="text-xs font-semibold">
                        {item.candidates?.full_name} ({item.job_forms?.job_title})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {pendingQueue.length === 0 && (
                  <p className="text-[11px] font-bold text-amber-600 mt-1 flex items-center gap-1"><ShieldAlert className="w-3 h-3"/> No candidates pending interview scheduling.</p>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black tracking-wider text-slate-500 uppercase">Evaluation Round Descriptor</label>
                <Input value={roundName} onChange={e => setRoundName(e.target.value)} className="h-10 text-xs font-bold" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black tracking-wider text-slate-500 uppercase">Meeting System</label>
                  <Select value={meetingProvider} onValueChange={setMeetingProvider}>
                    <SelectTrigger className="bg-white text-xs h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Google Meet">Google Meet</SelectItem>
                      <SelectItem value="Microsoft Teams">Microsoft Teams</SelectItem>
                      <SelectItem value="Zoom Link">Zoom Pro Room</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black tracking-wider text-slate-500 uppercase">Target Date / Timestamp</label>
                  <Input type="datetime-local" required value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} className="h-10 text-xs font-bold" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black tracking-wider text-slate-500 uppercase">Timezone</label>
                  <select value={selectedTimezone} onChange={e => setSelectedTimezone(e.target.value)} className="w-full p-2.5 border border-slate-200 rounded-lg text-sm bg-white font-medium text-slate-700 outline-none">
                    {getSupportedTimezones().map(tz => (
                      <option key={tz} value={tz}>{tz}</option>
                    ))}
                  </select>
                  {scheduledAt && (
                    <p className="text-[10px] text-slate-400 mt-1">
                      Local: {new Date(scheduledAt).toLocaleString()} | {selectedTimezone}: {new Date(scheduledAt).toLocaleString('en-US', { timeZone: selectedTimezone, dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black tracking-wider text-slate-500 uppercase">Production Room Invitation URL</label>
                <Input type="url" required placeholder="https://meet.google.com/xxx-yyyy-zzz" value={meetingLink} onChange={e => setMeetingLink(e.target.value)} className="h-10 text-xs font-medium" />
              </div>

              <Button type="button" onClick={handleCreateInterviewSession} disabled={aiLoading || pendingQueue.length === 0} className="w-full bg-blue-600 text-white font-black text-xs uppercase tracking-wider h-10 shadow-md">
                {aiLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                Dispatch Session Token
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* CENTER PANEL: CORE LIVE INTERVIEW CONSOLE MONITOR */}
        <Card className="lg:col-span-2 border-slate-200 shadow-sm bg-white flex flex-col">
          <CardHeader className="bg-slate-50 border-b p-4 flex flex-row items-center justify-between">
            <CardTitle className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-2">
              <Video className="w-4 h-4 text-indigo-600" /> Active Corporate Sessions Directory
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-auto max-h-[420px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-black text-xs">Target Applicant</TableHead>
                  <TableHead className="font-black text-xs">Role / Requisition</TableHead>
                  <TableHead className="font-black text-xs">Timestamp Space</TableHead>
                  <TableHead className="font-black text-xs">Platform Connection</TableHead>
                  <TableHead className="font-black text-xs text-center">Score</TableHead>
                  <TableHead className="font-black text-xs text-right">Action Gate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeSessions.map((session) => {
                  const applicant = session.job_application?.candidates || {};
                  const jobForm = session.job_application?.job_forms || {};
                  return (
                    <TableRow key={session.id} className={focusedSession?.id === session.id ? "bg-indigo-50/50 ring-1 ring-indigo-200" : ""}>
                      <TableCell className="text-xs font-bold text-slate-800">{applicant.full_name || "N/A"}</TableCell>
                      <TableCell className="text-xs font-semibold text-slate-600">{jobForm.job_title || "General Vacancy"}</TableCell>
                      <TableCell className="text-xs font-medium text-slate-500">{new Date(session.scheduled_at).toLocaleString()}</TableCell>
                      <TableCell className="text-xs font-medium text-blue-600">
                        <a href={session.meeting_link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:underline font-mono truncate max-w-[140px]">
                          <Link2 className="w-3 h-3 shrink-0"/> {session.meeting_provider}
                        </a>
                      </TableCell>
                      <TableCell className="text-center font-black text-xs text-indigo-600">{session.score ? `${session.score}%` : '--'}</TableCell>
                      <TableCell className="text-right">
                        {session.status === 'Completed' ? (
                          <span className="text-[9px] uppercase font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">Logged</span>
                        ) : session.status === 'Cancelled' ? (
                          <span className="text-[9px] uppercase font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">Cancelled</span>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            <Button onClick={() => setFocusedSession(session)} size="sm" variant="outline" className="h-7 text-[10px] font-bold text-indigo-700 border-indigo-200 bg-indigo-50/40 hover:bg-indigo-50">Evaluate Slices</Button>
                            <Button onClick={() => { setRescheduleTarget(session); setNewScheduledAt(""); setNewMeetingLink(session.meeting_link || ""); }} size="sm" variant="outline" className="h-7 w-7 p-0 text-amber-600 border-amber-200 hover:bg-amber-50" title="Reschedule"><CalendarClock className="w-3.5 h-3.5" /></Button>
                            {cancelConfirmId === session.id ? (
                              <div className="flex items-center gap-1">
                                <Button onClick={() => handleCancelInterview(session)} size="sm" className="h-7 text-[10px] text-white bg-red-600 hover:bg-red-700 px-2">Confirm</Button>
                                <Button onClick={() => setCancelConfirmId(null)} size="sm" variant="outline" className="h-7 text-[10px] px-2 border-slate-300">Keep</Button>
                              </div>
                            ) : (
                              <Button onClick={() => setCancelConfirmId(session.id)} size="sm" variant="outline" className="h-7 w-7 p-0 text-rose-600 border-rose-200 hover:bg-rose-50" title="Cancel Interview"><Ban className="w-3.5 h-3.5" /></Button>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {activeSessions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-xs font-medium text-slate-400 italic">No historical or upcoming active session logs tracked.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* RESCHEDULE PANEL */}
      {rescheduleTarget && (
        <Card className="border-amber-100 shadow-lg bg-white overflow-hidden rounded-xl animate-in slide-in-from-bottom-4">
          <CardHeader className="bg-amber-800 text-white p-4 flex flex-row justify-between items-center">
            <div className="flex items-center gap-2">
              <CalendarClock className="w-5 h-5 text-amber-300" />
              <CardTitle className="text-sm font-black tracking-tight">Reschedule Interview Session</CardTitle>
            </div>
            <Button onClick={() => setRescheduleTarget(null)} variant="ghost" className="text-amber-200 hover:text-white hover:bg-amber-700 h-8 text-xs font-bold">Cancel</Button>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <p className="text-sm text-slate-700 font-medium">
              Rescheduling: <strong>{rescheduleTarget.job_application?.candidates?.full_name || "Candidate"}</strong> &mdash; {rescheduleTarget.round_name || `Round ${rescheduleTarget.round_number}`} ({rescheduleTarget.status})
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black tracking-wider text-slate-500 uppercase">New Date / Time</label>
                <Input type="datetime-local" value={newScheduledAt} onChange={e => setNewScheduledAt(e.target.value)} className="h-10 text-xs font-bold" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black tracking-wider text-slate-500 uppercase">Timezone</label>
                <select value={newTimezone} onChange={e => setNewTimezone(e.target.value)} className="w-full p-2.5 border border-slate-200 rounded-lg text-sm bg-white font-medium text-slate-700 outline-none">
                  {getSupportedTimezones().map(tz => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black tracking-wider text-slate-500 uppercase">Meeting Link (optional &mdash; keeps current if blank)</label>
              <Input type="url" placeholder={rescheduleTarget.meeting_link || "https://meet.google.com/..."} value={newMeetingLink} onChange={e => setNewMeetingLink(e.target.value)} className="h-10 text-xs font-medium" />
            </div>
            <Button onClick={handleRescheduleInterview} disabled={aiLoading || !newScheduledAt} className="w-full bg-amber-600 hover:bg-amber-700 text-white font-black text-xs uppercase tracking-wider h-10 shadow-md">
              {aiLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CalendarClock className="w-4 h-4 mr-2" />}
              Confirm Reschedule
            </Button>
          </CardContent>
        </Card>
      )}

      {/* DETAILED SCORECARD EVALUATOR PANEL BLOCK */}
      {focusedSession && (
        <Card className="border-indigo-100 shadow-lg bg-white overflow-hidden rounded-xl animate-in slide-in-from-bottom-4">
          <CardHeader className="bg-indigo-900 text-white p-4 flex flex-row justify-between items-center">
            <div className="flex items-center gap-2">
              <BrainCircuit className="w-5 h-5 text-indigo-300" />
              <div>
                <CardTitle className="text-sm font-black tracking-tight">Structured Scorecard Evaluation Matrix Screen</CardTitle>
                <p className="text-[10px] text-indigo-200 font-medium mt-0.5">Focus: {focusedSession.job_application?.candidates?.full_name} • {focusedSession.job_application?.job_forms?.job_title}</p>
              </div>
            </div>
            <Button onClick={() => setFocusedSession(null)} variant="ghost" className="text-indigo-200 hover:text-white hover:bg-indigo-800 h-8 text-xs font-bold">Close Panel</Button>
          </CardHeader>
          <CardContent className="p-6 grid md:grid-cols-3 gap-6">
            
            {/* Metric Input Slices */}
            <div className="md:col-span-1 space-y-4 border-r pr-6 border-slate-100">
              <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1"><Award className="w-3.5 h-3.5 text-slate-400"/> Factual Score Slices (0-100)</h4>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 block">Communication Slices</label>
                  <Input type="number" min="0" max="100" value={commScore} onChange={e=>setCommScore(parseSafeBoundScoreValue(e.target.value))} className="h-9 font-mono text-sm font-bold bg-slate-50/50" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 block">Technical Fluency</label>
                  <Input type="number" min="0" max="100" value={techScore} onChange={e=>setTechScore(parseSafeBoundScoreValue(e.target.value))} className="h-9 font-mono text-sm font-bold bg-slate-50/50" />
                </div>
                <div className="space-y-1 col-span-2">
                  <label className="text-[10px] font-bold text-slate-600 block">Problem Solving Vectors</label>
                  <Input type="number" min="0" max="100" value={probScore} onChange={e=>setProbScore(parseSafeBoundScoreValue(e.target.value))} className="h-9 font-mono text-sm font-bold bg-slate-50/50" />
                </div>
                <div className="space-y-1 col-span-2">
                  <label className="text-[10px] font-bold text-slate-600 block">Culture Alignment</label>
                  <Input type="number" min="0" max="100" value={cultScore} onChange={e=>setCultScore(parseSafeBoundScoreValue(e.target.value))} className="h-9 font-mono text-sm font-bold bg-slate-50/50" />
                </div>
              </div>

              <div className="bg-slate-50 border p-3 rounded-xl text-center">
                <span className="text-[10px] font-black text-slate-400 uppercase">Calculated Cumulative Average</span>
                <span className="block text-3xl font-black text-indigo-700 mt-1">{((commScore + techScore + probScore + cultScore)/4).toFixed(1)}%</span>
                <span className="text-[9px] font-bold text-slate-400 mt-0.5 block">Pass Threshold Boundary Marker: 75.0%</span>
              </div>
            </div>

            {/* Live Interview Transcription Input Box */}
            <div className="md:col-span-2 space-y-4 flex flex-col">
              <div className="flex items-center justify-between">
                <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1"><HeartIcon className="w-3.5 h-3.5 text-slate-400"/> Live Transcript Log Stream Capture</h4>
                <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded flex items-center gap-1"><Sparkles className="w-3 h-3 animate-pulse"/> AI Analysis Compliant Layer</span>
              </div>
              <Textarea 
                placeholder="Paste the dialogue transcript or summary text notes gathered during the Google Meet/Teams stream window. Server-side scripts will evaluate this context securely..." 
                className="flex-1 min-h-[140px] text-xs leading-relaxed font-mono bg-slate-50/30 border-slate-200 resize-none p-3 focus-visible:ring-indigo-500"
                value={rawTranscript}
                onChange={e => setRawTranscript(e.target.value)}
              />
              <div className="flex justify-end pt-1">
                <Button onClick={executeLiveAIScoringEngine} disabled={aiLoading} className="bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs uppercase tracking-widest px-6 h-10 shadow-md rounded-lg flex items-center gap-2">
                  {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Commit Grading & Finalize Session
                </Button>
              </div>
            </div>

          </CardContent>
        </Card>
      )}

    </div>
  );
}

function HeartIcon({ className }: any) { return <span className={className}>📋</span>; }