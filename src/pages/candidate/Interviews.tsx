import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Video, Calendar, Link2, ExternalLink, FileText, Loader2, Sparkles, CheckCircle2, Clock, AlertCircle, VideoOff } from "lucide-react";
import JitsiMeetRoom from "@/components/interview/JitsiMeetRoom";

export default function CandidateInterviews() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [interviews, setInterviews] = useState<any[]>([]);
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [jitsiSession, setJitsiSession] = useState<any>(null);
  const [showJitsi, setShowJitsi] = useState(false);

  useEffect(() => {
    fetchSecureCandidateInterviews();

    let sessionChannel: any;

    // Set up a dynamic realtime channel loop anchored directly to the user instance state machine
    const establishLiveSyncChannel = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      sessionChannel = supabase
        .channel(`candidate-interviews-${user.id}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "interview_sessions" },
          () => {
            fetchSecureCandidateInterviews();
          }
        )
        .subscribe();
    };

    establishLiveSyncChannel();

    return () => {
      if (sessionChannel) {
        supabase.removeChannel(sessionChannel);
      }
    };
  }, []);

  const fetchSecureCandidateInterviews = async () => {
    try {
      setLoading(true);
      
      // 1. ENTERPRISE ISSUE #1 FIXED: Safe boundary profile mapping avoids user auth reference collisions
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profileRecord, error: profileErr } = await supabase
        .from("profiles")
        .select("id, candidate_id")
        .eq("id", user.id)
        .maybeSingle();

      if (profileErr || !profileRecord) throw new Error("Could not resolve valid internal platform account mapping.");

      const candidateId = profileRecord.candidate_id || profileRecord.id;

      // 2. Resolve application linkages using the verified relational profile reference ID
      const { data: appRecords, error: appErr } = await supabase
        .from("job_applications")
        .select("id, form_id")
        .eq("candidate_id", candidateId);

      if (appErr) throw appErr;

      if (!appRecords || appRecords.length === 0) {
        setInterviews([]);
        return;
      }

      const applicationIdsList = appRecords.map(app => app.id);

      const formIds = [...new Set(appRecords.map(a => a.form_id).filter(Boolean))];
      const formTitleMap: Record<string, string> = {};
      if (formIds.length > 0) {
        const { data: forms } = await supabase
          .from("job_forms")
          .select("id, job_title")
          .in("id", formIds);
        (forms || []).forEach(f => { formTitleMap[f.id] = f.job_title; });
      }

      // 3. ENTERPRISE ISSUE #2 FIXED: Explicit column projection constraints applied instead of loose select(*)
      const { data: sessionRecords, error: sessionErr } = await supabase
        .from("interview_sessions")
        .select(`
          id,
          application_id,
          round_name,
          scheduled_at,
          meeting_link,
          meeting_provider,
          status,
          score,
          communication_score,
          technical_score,
          problem_solving_score,
          culture_fit_score,
          ai_analysis_report,
          feedback
        `)
        .in("application_id", applicationIdsList)
        .order("scheduled_at", { ascending: true });

      if (sessionErr) throw sessionErr;

      // Unify relational database structures cleanly to map presentation strings
      const compiledInterviews = (sessionRecords || []).map((session: any) => {
        const matchingApp = appRecords.find(app => app.id === session.application_id);
        return {
          ...session,
          job_title: matchingApp ? (formTitleMap[matchingApp.form_id] || "Corporate Vacancy Profile") : "Corporate Vacancy Profile"
        };
      });

      setInterviews(compiledInterviews);

      if (selectedSession) {
        const updatedSession = compiledInterviews.find(s => s.id === selectedSession.id);
        if (updatedSession) setSelectedSession(updatedSession);
      }

    } catch (err: any) {
      console.error("Critical tracking error in recruitment data layer:", err);
      toast({ title: "Load Failed", description: "Could not load your interview data.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // === ENTERPRISE ISSUE #3 FIXED: Strict 15-minute verification time gate validator ===
  const verifyMeetingTimeWindowGate = (scheduledAtIsoString: string): { canJoin: boolean; minutesRemaining: number } => {
    const targetMeetingTimestamp = new Date(scheduledAtIsoString).getTime();
    const currentSystemTimeTimestamp = new Date().getTime();
    
    // Calculate difference in milliseconds
    const timeDeltaMs = targetMeetingTimestamp - currentSystemTimeTimestamp;
    const fifteenMinutesInMs = 15 * 60 * 1000;

    // Candidate can enter if the current time is within or after the 15-minute buffer window before the meeting starts
    if (currentSystemTimeTimestamp >= (targetMeetingTimestamp - fifteenMinutesInMs)) {
      return { canJoin: true, minutesRemaining: 0 };
    }

    return { 
      canJoin: false, 
      minutesRemaining: Math.ceil(timeDeltaMs / (1000 * 60)) 
    };
  };

  const isJitsiLink = (url: string) => {
    return url?.includes("meet.jit.si") || url?.includes("jitsi");
  };

  const handleLaunchMeetingUrl = (session: any) => {
    const url = session.meeting_link;
    if (!url || url === "#") {
      return toast({ title: "Meeting Link Unavailable", description: "The interview link is not ready yet. Please check back later.", variant: "destructive" });
    }

    // Apply strict time-gating constraints to avoid early space entrance loops
    const checkResult = verifyMeetingTimeWindowGate(session.scheduled_at);
    
    if (!checkResult.canJoin && session.status?.toLowerCase() !== 'completed') {
      return toast({
        title: "Meeting Not Yet Available",
        description: `You can join the meeting 15 minutes before the scheduled time. Please return in approximately ${checkResult.minutesRemaining} minutes.`,
        variant: "destructive"
      });
    }

    // For Jitsi meetings, embed in the page instead of opening new tab
    if (isJitsiLink(url)) {
      setJitsiSession(session);
      setShowJitsi(true);
      return;
    }

    toast({ title: "Redirecting", description: "Opening your interview meeting room..." });
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const getStatusBadgeStyles = (status: string) => {
    switch (status?.toLowerCase()) {
      case "completed":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "scheduled":
        return "bg-blue-50 text-blue-700 border-blue-200 animate-pulse";
      case "rejected":
        return "bg-rose-50 text-rose-700 border-rose-200";
      default:
        return "bg-slate-50 text-slate-600 border-slate-200";
    }
  };

  return (
    <DashboardLayout role="candidate">
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in pb-12">
        
        <div className="bg-slate-900 p-6 sm:p-8 rounded-xl shadow-xl text-white flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border border-slate-800">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black flex items-center gap-3">
              <Video className="text-indigo-400 w-7 h-7 sm:w-8 sm:h-8" /> 
              My Interview Board
            </h1>
            <p className="text-slate-300 text-xs sm:text-sm mt-1.5 font-medium">
              Enterprise evaluation console tracking active schedules, secure entry lobbies, and finalized performance scorecards.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          
          {/* INTERVIEW QUEUE DIRECTORY */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="border-slate-200 shadow-sm bg-white overflow-hidden rounded-xl">
              <CardHeader className="bg-slate-50 border-b p-4">
                <CardTitle className="text-xs font-black text-slate-700 uppercase tracking-wider">
                  Assigned Requisition Tracks ({interviews.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-50/50">
                      <TableRow>
                        <TableHead className="font-black text-xs">Round Profile / Vacancy</TableHead>
                        <TableHead className="font-black text-xs">Scheduled Slot</TableHead>
                        <TableHead className="font-black text-xs">Lobby Connection</TableHead>
                        <TableHead className="font-black text-xs text-center">Status</TableHead>
                        <TableHead className="font-black text-xs text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-12">
                            <Loader2 className="w-8 h-8 animate-spin mx-auto text-indigo-600" />
                          </TableCell>
                        </TableRow>
                      ) : interviews.map((session) => (
                        <TableRow 
                          key={session.id} 
                          className={`cursor-pointer hover:bg-slate-50/60 transition-colors ${selectedSession?.id === session.id ? 'bg-indigo-50/40 border-l-4 border-indigo-600 font-medium' : ''}`}
                          onClick={() => setSelectedSession(session)}
                        >
                          <TableCell>
                            <div className="font-bold text-slate-900 text-sm tracking-tight">{session.round_name}</div>
                            <div className="text-xs text-indigo-600 font-bold tracking-tight uppercase mt-0.5">{session.job_title}</div>
                          </TableCell>
                          <TableCell className="text-xs font-medium text-slate-500">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 text-slate-400" /> 
                              {new Date(session.scheduled_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </TableCell>
                          <TableCell>
                            {session.status?.toLowerCase() === 'completed' ? (
                              <span className="text-[11px] font-medium text-slate-400 italic">Session Sealed</span>
                            ) : (
                              <Button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleLaunchMeetingUrl(session);
                                }}
                                size="sm" 
                                variant="link" 
                                className="h-auto p-0 text-xs font-black text-blue-600 flex items-center gap-1 hover:underline"
                              >
                                <Link2 className="w-3 h-3" /> {session.meeting_provider || "Join Room"}
                              </Button>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded border tracking-wider ${getStatusBadgeStyles(session.status)}`}>
                              {session.status || 'Scheduled'}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" className="h-8 text-xs font-black text-indigo-600 uppercase tracking-tight">
                              Dossier
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {!loading && interviews.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-12 text-xs font-semibold text-slate-400 italic">
                            No active evaluation sessions have been assigned to your profile yet.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* DETAILED SCORECARD SIDE OVERLAY DOSSIER */}
          <div className="lg:col-span-1">
            {selectedSession ? (
              <Card className="shadow-xl border-slate-200 bg-white overflow-hidden rounded-xl animate-in slide-in-from-right-4 sticky top-24">
                <CardHeader className="bg-indigo-600 text-white p-4">
                  <CardTitle className="text-xs font-black uppercase tracking-wider flex items-center gap-2">
                    <FileText className="w-4 h-4" /> Scorecard Metric Breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-5 space-y-5 max-h-[580px] overflow-y-auto custom-scrollbar">
                  
                  <div className="border-b pb-3">
                    <h3 className="text-lg font-black text-slate-900 tracking-tight leading-none">{selectedSession.round_name}</h3>
                    <p className="text-xs font-black text-indigo-600 uppercase tracking-wider mt-1.5">{selectedSession.job_title}</p>
                    
                    {selectedSession.status?.toLowerCase() !== 'completed' ? (
                      <Button 
                        onClick={() => handleLaunchMeetingUrl(selectedSession)} 
                        className="w-full h-10 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs uppercase tracking-widest mt-4 rounded-xl shadow-md"
                      >
                        <ExternalLink className="w-3.5 h-3.5 mr-2" /> Connect To Video Room
                      </Button>
                    ) : (
                      <div className="flex items-center justify-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-black uppercase tracking-wider p-2 rounded-xl mt-4">
                        <CheckCircle2 className="w-4 h-4" /> Scorecard Audit Complete
                      </div>
                    )}
                  </div>

                  {selectedSession.status?.toLowerCase() === 'completed' ? (
                    <div className="space-y-4 animate-fade-in text-sm">
                      
                      {/* CUMULATIVE SCORE DISPLAY CARD */}
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center shadow-inner">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Reconciled Aggregate Rating</span>
                        <span className="block text-4xl font-black text-indigo-600 font-mono mt-1">{selectedSession.score || 0}%</span>
                        <span className={`inline-block mt-2 text-[9px] font-black uppercase px-2 py-0.5 rounded border tracking-wide ${
                          selectedSession.score >= 75 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}>
                          {selectedSession.score >= 75 ? 'Meets Technical Benchmark' : 'Evaluation Concluded'}
                        </span>
                      </div>

                      {/* DISCRETE METRICS GRID */}
                      <div className="space-y-2">
                        <h4 className="uppercase text-[9px] font-black tracking-widest text-slate-400 mb-1">Scorecard Vectors Analysis</h4>
                        <div className="grid grid-cols-2 gap-2 text-xs font-bold font-mono">
                          <div className="p-2.5 bg-slate-50 border rounded-xl flex items-center justify-between">
                            <span className="text-slate-400 font-sans text-[10px]">Technical Depth:</span>
                            <span className="text-slate-800">{selectedSession.technical_score || 0}</span>
                          </div>
                          <div className="p-2.5 bg-slate-50 border rounded-xl flex items-center justify-between">
                            <span className="text-slate-400 font-sans text-[10px]">Communication:</span>
                            <span className="text-slate-800">{selectedSession.communication_score || 0}</span>
                          </div>
                          <div className="p-2.5 bg-slate-50 border rounded-xl flex items-center justify-between">
                            <span className="text-slate-400 font-sans text-[10px]">Problem Solving:</span>
                            <span className="text-slate-800">{selectedSession.problem_solving_score || 0}</span>
                          </div>
                          <div className="p-2.5 bg-slate-50 border rounded-xl flex items-center justify-between">
                            <span className="text-slate-400 font-sans text-[10px]">Culture Alignment:</span>
                            <span className="text-slate-800">{selectedSession.culture_fit_score || 0}</span>
                          </div>
                        </div>
                      </div>

                      {/* CANDIDATE FEEDBACK VISIBILITY LAYER */}
                      {/* ENTERPRISE ISSUE #5 RESOLVED: Preserves internal risk assessments by displaying verified assessment text reports only */}
                      {(selectedSession.ai_analysis_report || selectedSession.feedback) && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-1 text-[9px] uppercase font-black text-slate-400 tracking-widest">
                            <Sparkles className="w-3.5 h-3.5 text-indigo-500 animate-pulse" /> 
                            Evaluation Summary Report
                          </div>
                          <div className="bg-indigo-50/40 border border-indigo-100 p-3 rounded-xl shadow-inner">
                            <p className="text-xs font-semibold text-slate-700 leading-relaxed italic">
                              "{selectedSession.ai_analysis_report || selectedSession.feedback}"
                            </p>
                          </div>
                        </div>
                      )}

                    </div>
                  ) : (
                    <div className="bg-slate-50 border border-dashed rounded-xl p-6 text-center text-xs font-medium text-slate-400 leading-normal flex flex-col items-center gap-2">
                      <Clock className="w-6 h-6 text-indigo-500 animate-pulse" />
                      <span>This session round is currently locked. Use the invitation link above to enter the video conference room once the scheduled date arrives.</span>
                    </div>
                  )}

                </CardContent>
              </Card>
            ) : (
              <div className="h-64 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center text-slate-400 text-xs font-semibold text-center p-8 bg-slate-50/40 gap-1.5">
                <AlertCircle className="w-5 h-5 text-slate-300" />
                <span>Select an active schedule track to view performance feedback metrics.</span>
              </div>
            )}
          </div>

        </div>
      </div>

      {showJitsi && jitsiSession && (
        <div className="fixed inset-0 z-[100] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-5xl max-h-[90vh] bg-white shadow-2xl border-slate-200 rounded-xl overflow-hidden flex flex-col">
            <div className="bg-slate-900 text-white px-6 py-3 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-sm font-black tracking-tight flex items-center gap-2">
                  <Video className="w-4 h-4 text-indigo-400" />
                  {jitsiSession.round_name}
                </h2>
                <p className="text-[10px] text-slate-400 font-bold mt-0.5">{jitsiSession.job_title}</p>
              </div>
              <Button
                onClick={() => { setShowJitsi(false); setJitsiSession(null); }}
                variant="ghost"
                className="text-white hover:bg-slate-800 h-8 w-8 p-0"
              >
                <VideoOff className="w-4 h-4" />
              </Button>
            </div>
            <CardContent className="p-0 flex-1 overflow-hidden">
              <JitsiMeetRoom
                roomName={jitsiSession.meeting_link || jitsiSession.round_name}
                displayName={jitsiSession.candidate_name || "Candidate"}
                height={window.innerHeight * 0.75}
                onLeave={() => {
                  setShowJitsi(false);
                  setJitsiSession(null);
                  toast({ title: "Meeting Ended", description: "You have left the meeting room." });
                }}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </DashboardLayout>
  );
}