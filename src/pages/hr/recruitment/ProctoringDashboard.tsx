import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ShieldCheck, AlertTriangle, Eye, Search, Clock, User, Award, FileText, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface ProctorSession {
  tokenId: string;
  assessmentTitle: string;
  candidateName: string;
  candidateEmail: string;
  score: number | null;
  passed: boolean | null;
  violations: number;
  proctorLog: { type: string; timestamp: string; time: string }[];
  status: string;
  completedAt: string;
  attemptId: string;
}

export default function ProctoringDashboard() {
  const { toast } = useToast();
  const [sessions, setSessions] = useState<ProctorSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedSession, setExpandedSession] = useState<string | null>(null);

  useEffect(() => {
    fetchProctoringSessions();
  }, []);

  const fetchProctoringSessions = async () => {
    try {
      setLoading(true);

      const { data: attemptsData, error: attemptsErr } = await supabase
        .from("assessment_attempts")
        .select("id, score, passed, created_at, assessment_id, candidate_id")
        .order("created_at", { ascending: false });

      if (attemptsErr) throw attemptsErr;
      if (!attemptsData || attemptsData.length === 0) {
        setSessions([]);
        return;
      }

      const candidateIds = [...new Set(attemptsData.map(a => a.candidate_id).filter(Boolean))];
      const assessmentIds = [...new Set(attemptsData.map(a => a.assessment_id).filter(Boolean))];

      let tokensData: any[] = [];
      try {
        const tokensRes = await supabase.from("assessment_tokens").select("id, status, updated_at, candidate_id, assessment_id");
        if (!tokensRes.error) tokensData = tokensRes.data || [];
      } catch (e) { console.warn("assessment_tokens query blocked by RLS:", e); }
      let assessmentsData: any[] = [];
      try {
        if (assessmentIds.length > 0) {
          const assessmentsRes = await supabase.from("assessments").select("id, title").in("id", assessmentIds);
          if (!assessmentsRes.error) assessmentsData = assessmentsRes.data || [];
        }
      } catch (e) { console.warn("assessments query failed:", e); }
      let candidatesData: any[] = [];
      try {
        if (candidateIds.length > 0) {
          const candidatesRes = await supabase.from("candidates").select("id, full_name, email").in("id", candidateIds);
          if (!candidatesRes.error) candidatesData = candidatesRes.data || [];
        }
      } catch (e) { console.warn("candidates query failed:", e); }

      const tokensByCandidate = new Map<string, any>();
      tokensData.forEach(t => {
        const key = `${t.candidate_id || ""}_${t.assessment_id || ""}`;
        if (!tokensByCandidate.has(key)) tokensByCandidate.set(key, t);
      });

      const assessmentsMap = new Map(assessmentsData.map(a => [a.id, a.title]));
      const candidatesMap = new Map(candidatesData.map(c => [c.id, c]));

      const mapped: ProctorSession[] = attemptsData.map(a => {
        const matchKey = `${a.candidate_id || ""}_${a.assessment_id || ""}`;
        const token = tokensByCandidate.get(matchKey);
        const candidate = candidatesMap.get(a.candidate_id);
        return {
          tokenId: token?.id || a.id,
          assessmentTitle: assessmentsMap.get(a.assessment_id) || "Unknown Assessment",
          candidateName: candidate?.full_name || "Unknown",
          candidateEmail: candidate?.email || "",
          score: a.score ?? null,
          passed: a.passed ?? null,
          violations: 0,
          proctorLog: [],
          status: token?.status || "completed",
          completedAt: a.created_at || "",
          attemptId: a.id || ""
        };
      });

      setSessions(mapped);
    } catch (err: any) {
      console.error("Failed to fetch proctoring sessions:", err);
      toast({ title: "Load Error", description: "Could not load proctoring sessions.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const filteredSessions = sessions.filter(s => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return s.candidateName.toLowerCase().includes(q) ||
           s.assessmentTitle.toLowerCase().includes(q) ||
           s.candidateEmail.toLowerCase().includes(q);
  });

  const toggleExpand = (tokenId: string) => {
    setExpandedSession(prev => prev === tokenId ? null : tokenId);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black tracking-tight text-slate-800 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-indigo-600" /> Proctoring Sessions
          </h1>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            View and analyze proctoring violation logs across all assessments
          </p>
        </div>
        <Button onClick={fetchProctoringSessions} variant="outline" size="sm" className="text-xs font-bold">
          <Loader2 className="w-3 h-3 mr-1" /> Refresh
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Search by candidate name, assessment, or email..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pl-9 h-10 text-sm"
        />
      </div>

      {filteredSessions.length === 0 ? (
        <Card className="border-slate-200 bg-white shadow-sm rounded-xl">
          <CardContent className="p-12 text-center">
            <ShieldCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-500">No Proctoring Sessions Found</p>
            <p className="text-xs text-slate-400 mt-1">
              {sessions.length === 0
                ? "No assessments with proctoring logs have been completed yet. Proctoring logs are recorded when a candidate completes an assessment with AI proctoring enabled."
                : "No sessions match your search criteria."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredSessions.map(session => (
            <Card key={session.tokenId} className="border-slate-200 bg-white shadow-sm rounded-xl overflow-hidden">
              <div
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50/50 transition-colors"
                onClick={() => toggleExpand(session.tokenId)}
              >
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${session.violations > 0 ? 'bg-red-100' : 'bg-emerald-100'}`}>
                    {session.violations > 0 ? (
                      <AlertTriangle className="w-5 h-5 text-red-600" />
                    ) : (
                      <ShieldCheck className="w-5 h-5 text-emerald-600" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-black text-slate-800 truncate">{session.candidateName}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${session.passed === true ? 'bg-emerald-100 text-emerald-700' : session.passed === false ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'}`}>
                        {session.passed === true ? 'Passed' : session.passed === false ? 'Failed' : session.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-slate-500 font-medium mt-0.5">
                      <span className="flex items-center gap-1"><FileText className="w-3 h-3" /> {session.assessmentTitle}</span>
                      {session.score !== null && <span className="flex items-center gap-1"><Award className="w-3 h-3" /> Score: {session.score}%</span>}
                      <span className={`flex items-center gap-1 font-bold ${session.violations > 0 ? 'text-red-600' : 'text-slate-500'}`}>
                        <AlertTriangle className="w-3 h-3" /> Violations: {session.violations}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-[10px] text-slate-400 font-medium">
                    {session.completedAt ? new Date(session.completedAt).toLocaleDateString() : ""}
                  </span>
                  {expandedSession === session.tokenId ? (
                    <ChevronUp className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  )}
                </div>
              </div>

              {expandedSession === session.tokenId && (
                <div className="border-t border-slate-100 bg-slate-50/50 p-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div className="bg-white border rounded-lg p-3">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1"><User className="w-3 h-3" /> Candidate</span>
                      <p className="text-sm font-bold text-slate-800 mt-1">{session.candidateName}</p>
                      {session.candidateEmail && <p className="text-[11px] text-slate-500">{session.candidateEmail}</p>}
                    </div>
                    <div className="bg-white border rounded-lg p-3">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1"><Award className="w-3 h-3" /> Result</span>
                      <p className="text-sm font-bold text-slate-800 mt-1">
                        {session.score !== null ? `${session.score}%` : 'N/A'}
                        {session.passed === true && <span className="text-emerald-600 ml-1">(Passed)</span>}
                        {session.passed === false && <span className="text-red-600 ml-1">(Failed)</span>}
                      </p>
                    </div>
                    <div className="bg-white border rounded-lg p-3">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Violations</span>
                      <p className={`text-sm font-bold mt-1 ${session.violations > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {session.violations} {session.violations === 1 ? 'incident' : 'incidents'}
                      </p>
                    </div>
                  </div>

                  {session.proctorLog.length > 0 && (
                    <div>
                      <h3 className="text-xs font-black uppercase tracking-wider text-slate-600 mb-2 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" /> Violation Timeline
                      </h3>
                      <div className="bg-white border rounded-lg divide-y divide-slate-100 max-h-80 overflow-y-auto">
                        {session.proctorLog.map((entry, idx) => (
                          <div key={idx} className="p-2.5 flex items-center gap-3 text-xs">
                            <span className="text-slate-400 font-mono font-bold shrink-0 w-16">
                              {entry.time || (entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : '')}
                            </span>
                            <span className="text-red-700 font-bold shrink-0 w-2 h-2 rounded-full bg-red-400" />
                            <span className="text-slate-700 font-medium">{entry.type}</span>
                            {entry.timestamp && (
                              <span className="text-slate-400 text-[10px] ml-auto shrink-0">
                                {new Date(entry.timestamp).toLocaleString()}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {session.proctorLog.length === 0 && (
                    <p className="text-xs text-slate-400 italic">No detailed violation log entries available.</p>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <div className="text-center text-[10px] text-slate-400 font-medium pb-4">
        Showing {filteredSessions.length} of {sessions.length} proctoring sessions
      </div>
    </div>
  );
}
