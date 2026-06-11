import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
// === COMPILATION FIXED: Purged non-existent ClipboardText import and replaced with FileText ===
import { Loader2, Video, BrainCircuit, Play, ShieldAlert, Calendar, Link2, CheckCircle2, Award, FileText, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";

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
  const [meetingLink, setMeetingLink] = useState("");
  const [meetingProvider, setMeetingProvider] = useState("Google Meet");

  // Evaluation Sheet Target Session Context
  const [focusedSession, setFocusedSession] = useState<any>(null);
  const [commScore, setCommScore] = useState(70);
  const [techScore, setTechScore] = useState(70);
  const [probScore, setProbScore] = useState(70);
  const [cultScore, setCultScore] = useState(70);
  const [rawTranscript, setRawTranscript] = useState("");

  useEffect(() => {
    loadRecruitmentInterviewData();
  }, []);

  const loadRecruitmentInterviewData = async () => {
    try {
      setGlobalLoading(true);

      // Ingest all candidate profiles who cleared the assessment phase and are pending scheduling
      const { data: queueData, error: queueErr } = await supabase
        .from("candidate_applications")
        .select(`
          id,
          candidate_id,
          job_form_id,
          status,
          interview_status,
          candidates ( id, full_name, email ),
          job_forms ( id, job_title )
        `)
        .eq("interview_status", "Pending Scheduling");

      if (queueErr) throw queueErr;
      setPendingQueue(queueData || []);

      // Ingest active sessions directory history logs
      const { data: sessionData, error: sessionErr } = await supabase
        .from("interview_sessions")
        .select(`
          *,
          candidate_applications (
            id,
            job_form_id,
            candidate_id,
            candidates ( id, full_name, email ),
            job_forms ( id, job_title )
          )
        `)
        .order("scheduled_at", { ascending: true });

      if (sessionErr) throw sessionErr;
      setActiveSessions(sessionData || []);

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

      // Commit scheduling row record directly onto public.interview_sessions ledger
      const { data: sessionObj, error: insertErr } = await supabase
        .from("interview_sessions")
        .insert([{
          application_id: selectedApplicationId,
          round_name: roundName,
          scheduled_at: new Date(scheduledAt).toISOString(),
          meeting_link: meetingLink.trim(),
          meeting_provider: meetingProvider,
          status: "Scheduled",
          feedback: "Awaiting live candidate conversation stream loop."
        }])
        .select()
        .single();

      if (insertErr) throw insertErr;

      // Fetch target application context to isolate candidate_id parameters securely
      const selectedApp = pendingQueue.find(q => q.id === selectedApplicationId);
      if (selectedApp?.candidate_id) {
        // Trigger alert notification directly inside public.candidate_notifications table trace
        await supabase
          .from("candidate_notifications")
          .insert([{
            candidate_id: selectedApp.candidate_id,
            title: "Interview Requisition Scheduled",
            message: `Your live proctored evaluation session for role [${selectedApp.job_forms?.job_title}] has been scheduled on ${new Date(scheduledAt).toLocaleString()}. Access Link: ${meetingLink.trim()}`
          }]);
      }

      // Update parent candidate application metrics phase context mapping indices
      await supabase
        .from("candidate_applications")
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

    const pipelineStageOutcome = passedCriteriasThreshold ? "Interview Cleared" : "Rejected";
    const interviewOutcomeStatus = passedCriteriasThreshold ? "Completed" : "Rejected";

    try {
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
          ai_recommendation: passedCriteriasThreshold ? "Hire" : "Reject",
          ai_analysis_report: `Deterministic scorecard metrics evaluated. Communication: ${commScore}, Technical: ${techScore}, Problem Solving: ${probScore}, Culture Fit: ${cultScore}.`,
          feedback: `Overall Score: ${calculatedOverallAverage}%. Manual assessment finalized.`
        })
        .eq("id", focusedSession.id);

      if (sessionUpdateErr) throw sessionUpdateErr;

      // Cascade data updates down to update candidate_applications rows cleanly
      await supabase
        .from("candidate_applications")
        .update({
          status: pipelineStageOutcome,
          interview_status: interviewOutcomeStatus,
          interview_score: calculatedOverallAverage
        })
        .eq("id", focusedSession.application_id);

      // ARCHITECTURAL SYNCHRONIZATION ALIGNMENT MATRIX: Fixed form_id schema layout match mapping
      const candidateApp = focusedSession.candidate_applications || {};
      const candidateId = candidateApp.candidate_id;
      const jobFormId = candidateApp.job_form_id;

      if (candidateId && jobFormId) {
        // Maps update constraints strictly using verified column parameters ('form_id')
        await supabase
          .from("job_applications")
          .update({
            status: pipelineStageOutcome,
            ai_verdict: `Structured interview processed. Cumulative Score: ${calculatedOverallAverage}%`
          })
          .eq("candidate_id", candidateId)
          .eq("form_id", jobFormId);
      }

      // Keep master candidate stage directory target state synced with active verified table fields
      if (candidateId) {
        await supabase
          .from("candidates")
          .update({ stage: pipelineStageOutcome })
          .eq("id", candidateId);
      }

      toast({ title: "Evaluation Committed", description: "Hiring criteria matrices computed and cross-tab data pools synchronized." });
      setFocusedSession(null);
      setRawTranscript("");
      loadRecruitmentInterviewData();
    } catch (err: any) {
      toast({ title: "Scoring Pipeline Exception", description: err.message, variant: "destructive" });
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
                <Select value={selectedApplicationId} onValueChange={setSelectedApplicationId}>
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
                  const applicant = session.candidate_applications?.candidates || {};
                  const jobForm = session.candidate_applications?.job_forms || {};
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
                        ) : (
                          <Button 
                            onClick={() => {
                              if (session.status === "Completed") {
                                toast({ title: "Session Sealed", description: "Completed assessments cannot be evaluated further.", variant: "destructive" });
                                return;
                              }
                              setFocusedSession(session);
                            }} 
                            size="sm" 
                            variant="outline" 
                            disabled={session.status === "Completed"}
                            className="h-7 text-[10px] font-bold text-indigo-700 border-indigo-200 bg-indigo-50/40 hover:bg-indigo-50 disabled:opacity-40"
                          >
                            Evaluate Slices
                          </Button>
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

      {/* DETAILED SCORECARD EVALUATOR PANEL BLOCK */}
      {focusedSession && (
        <Card className="border-indigo-100 shadow-lg bg-white overflow-hidden rounded-xl animate-in slide-in-from-bottom-4">
          <CardHeader className="bg-indigo-900 text-white p-4 flex flex-row justify-between items-center">
            <div className="flex items-center gap-2">
              <BrainCircuit className="w-5 h-5 text-indigo-300" />
              <div>
                <CardTitle className="text-sm font-black tracking-tight">Structured Scorecard Evaluation Matrix Screen</CardTitle>
                <p className="text-[10px] text-indigo-200 font-medium mt-0.5">Focus: {focusedSession.candidate_applications?.candidates?.full_name} • {focusedSession.candidate_applications?.job_forms?.job_title}</p>
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
                <Button onClick={executeLiveAIScoringEngine} disabled={aiLoading || !rawTranscript.trim()} className="bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs uppercase tracking-widest px-6 h-10 shadow-md rounded-lg flex items-center gap-2">
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