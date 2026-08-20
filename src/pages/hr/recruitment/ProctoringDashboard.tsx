import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  ShieldCheck,
  AlertTriangle,
  Eye,
  Search,
  Clock,
  User,
  Award,
  FileText,
  ChevronDown,
  ChevronUp,
  Download,
  Filter,
  CheckCircle2,
  XCircle,
  Smartphone,
  Users2,
  Mic,
  MonitorOff,
  Sparkles
} from "lucide-react";
import { supabase } from "@/lib/supabase";

interface ProctorLogEntry {
  type: string;
  timestamp: string;
  time?: string;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

interface ProctorSession {
  tokenId: string;
  assessmentTitle: string;
  candidateName: string;
  candidateEmail: string;
  score: number | null;
  passed: boolean | null;
  violations: number;
  integrityScore: number;
  proctorLog: ProctorLogEntry[];
  status: string;
  completedAt: string;
  attemptId: string;
  flaggedCategories: string[];
}

export default function ProctoringDashboard() {
  const { toast } = useToast();
  const [sessions, setSessions] = useState<ProctorSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'FLAGGED' | 'CLEAN'>('ALL');
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
        const tokensRes = await supabase
          .from("assessment_tokens")
          .select("id, status, updated_at, candidate_id, assessment_id, proctor_log");
        if (!tokensRes.error) tokensData = tokensRes.data || [];
      } catch (e) {
        console.warn("assessment_tokens query blocked by RLS:", e);
      }

      let assessmentsData: any[] = [];
      try {
        if (assessmentIds.length > 0) {
          const assessmentsRes = await supabase.from("assessments").select("id, title").in("id", assessmentIds);
          if (!assessmentsRes.error) assessmentsData = assessmentsRes.data || [];
        }
      } catch (e) {
        console.warn("assessments query failed:", e);
      }

      let candidatesData: any[] = [];
      try {
        if (candidateIds.length > 0) {
          const candidatesRes = await supabase.from("candidates").select("id, full_name, email").in("id", candidateIds);
          if (!candidatesRes.error) candidatesData = candidatesRes.data || [];
        }
      } catch (e) {
        console.warn("candidates query failed:", e);
      }

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

        let parsedLogs: ProctorLogEntry[] = [];
        if (token?.proctor_log) {
          if (Array.isArray(token.proctor_log)) {
            parsedLogs = token.proctor_log;
          } else if (typeof token.proctor_log === 'string') {
            try {
              parsedLogs = JSON.parse(token.proctor_log);
            } catch {}
          }
        }

        // Filter valid violation incidents
        const validViolations = parsedLogs.filter(
          l => !l.type.startsWith("[WARNING]") && !l.type.includes("No action taken")
        );

        // Extract flagged categories
        const flaggedCats = new Set<string>();
        validViolations.forEach(v => {
          const t = v.type.toLowerCase();
          if (t.includes("phone") || t.includes("cell")) flaggedCats.add("Device Detected");
          if (t.includes("face") || t.includes("multiple")) flaggedCats.add("Multiple Faces / Absent");
          if (t.includes("audio") || t.includes("noise") || t.includes("voice")) flaggedCats.add("Audio Anomaly");
          if (t.includes("fullscreen") || t.includes("tab") || t.includes("focus")) flaggedCats.add("Screen / Tab Switch");
          if (t.includes("devtools") || t.includes("copy")) flaggedCats.add("Security Bypass Attempt");
        });

        // Compute Proctored Integrity Score (100 - violations * 15)
        const violationPenalty = validViolations.length * 15;
        const integrityScore = Math.max(0, 100 - violationPenalty);

        return {
          tokenId: token?.id || a.id,
          assessmentTitle: assessmentsMap.get(a.assessment_id) || "Enterprise Assessment",
          candidateName: candidate?.full_name || "Applicant",
          candidateEmail: candidate?.email || "",
          score: a.score ?? null,
          passed: a.passed ?? null,
          violations: validViolations.length,
          integrityScore,
          proctorLog: parsedLogs,
          status: token?.status || "completed",
          completedAt: a.created_at || "",
          attemptId: a.id || "",
          flaggedCategories: Array.from(flaggedCats)
        };
      });

      setSessions(mapped);
    } catch (err: any) {
      console.error("Failed to fetch proctoring sessions:", err);
      toast({
        title: "Load Error",
        description: "Could not load proctoring sessions.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredSessions = sessions.filter(s => {
    // Search query filter
    const matchesSearch =
      !searchQuery ||
      s.candidateName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.assessmentTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.candidateEmail.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    // Status filter
    if (statusFilter === 'FLAGGED') return s.violations > 0;
    if (statusFilter === 'CLEAN') return s.violations === 0;
    return true;
  });

  const toggleExpand = (tokenId: string) => {
    setExpandedSession(prev => (prev === tokenId ? null : tokenId));
  };

  const exportProctoringAuditCSV = () => {
    if (sessions.length === 0) return;
    let csv = "CANDIDATE_NAME,EMAIL,ASSESSMENT,SCORE,RESULT,VIOLATIONS_COUNT,INTEGRITY_SCORE,DATE\n";
    sessions.forEach(s => {
      csv += `"${s.candidateName}","${s.candidateEmail}","${s.assessmentTitle}",${s.score ?? 'N/A'},"${s.passed ? 'PASSED' : s.passed === false ? 'FAILED' : s.status}",${s.violations},${s.integrityScore}%,"${s.completedAt}"\n`;
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Proctoring_Audit_Report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: "Audit Exported", description: "Proctoring audit CSV downloaded successfully." });
  };

  const totalSessions = sessions.length;
  const cleanSessionsCount = sessions.filter(s => s.violations === 0).length;
  const flaggedSessionsCount = sessions.filter(s => s.violations > 0).length;
  const avgIntegrity = totalSessions > 0
    ? Math.round(sessions.reduce((acc, s) => acc + s.integrityScore, 0) / totalSessions)
    : 100;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-80 space-y-3">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
        <p className="text-xs font-bold text-slate-500 tracking-wider uppercase">Loading Proctoring Telemetry Feed...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 p-4">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 rounded-2xl text-white shadow-xl">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-7 h-7 text-indigo-400" />
            <h1 className="text-2xl font-black tracking-tight text-white">
              AI Proctoring Command Center
            </h1>
            <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-[10px] font-mono">
              ● REAL-TIME AI ACTIVE
            </Badge>
          </div>
          <p className="text-xs text-indigo-200/80 font-medium">
            AI-driven vision, multi-face tracking, cheating device detection, and acoustic surveillance audit records
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={fetchProctoringSessions}
            variant="outline"
            size="sm"
            className="text-xs font-bold bg-white/10 hover:bg-white/20 text-white border-white/20"
          >
            <Loader2 className="w-3.5 h-3.5 mr-1.5" /> Refresh Telemetry
          </Button>
          <Button
            onClick={exportProctoringAuditCSV}
            size="sm"
            className="text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" /> Export Audit CSV
          </Button>
        </div>
      </div>

      {/* Cyber Metrics HUD Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-slate-200 bg-white shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Exam Sessions</p>
              <p className="text-2xl font-black text-slate-900 mt-0.5">{totalSessions}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
              <FileText className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Clean / Zero Violations</p>
              <p className="text-2xl font-black text-emerald-600 mt-0.5">{cleanSessionsCount}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Flagged Incidents</p>
              <p className="text-2xl font-black text-red-600 mt-0.5">{flaggedSessionsCount}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center text-red-600">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Avg Integrity Score</p>
              <p className="text-2xl font-black text-indigo-600 mt-0.5">{avgIntegrity}%</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
              <Sparkles className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Controls & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search candidates by name, email, or assessment title..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9 h-10 text-xs bg-white border-slate-200"
          />
        </div>

        <div className="flex gap-2 w-full sm:w-auto shrink-0">
          <Button
            size="sm"
            variant={statusFilter === 'ALL' ? 'default' : 'outline'}
            onClick={() => setStatusFilter('ALL')}
            className={`text-xs font-bold h-10 ${statusFilter === 'ALL' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}
          >
            All Sessions ({totalSessions})
          </Button>
          <Button
            size="sm"
            variant={statusFilter === 'FLAGGED' ? 'default' : 'outline'}
            onClick={() => setStatusFilter('FLAGGED')}
            className={`text-xs font-bold h-10 ${statusFilter === 'FLAGGED' ? 'bg-red-600 text-white' : 'text-red-600 border-red-200'}`}
          >
            <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Flagged ({flaggedSessionsCount})
          </Button>
          <Button
            size="sm"
            variant={statusFilter === 'CLEAN' ? 'default' : 'outline'}
            onClick={() => setStatusFilter('CLEAN')}
            className={`text-xs font-bold h-10 ${statusFilter === 'CLEAN' ? 'bg-emerald-600 text-white' : 'text-emerald-700 border-emerald-200'}`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Clean ({cleanSessionsCount})
          </Button>
        </div>
      </div>

      {/* Session Cards Feed */}
      {filteredSessions.length === 0 ? (
        <Card className="border-slate-200 bg-white shadow-xs rounded-2xl">
          <CardContent className="p-16 text-center">
            <ShieldCheck className="w-14 h-14 text-slate-300 mx-auto mb-3" />
            <p className="text-base font-black text-slate-700">No Proctoring Records Found</p>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              {sessions.length === 0
                ? "Candidate proctoring sessions will automatically populate here as applicants complete exams with AI vision and audio surveillance."
                : "No proctoring sessions match your current search and filter criteria."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredSessions.map(session => {
            const isFlagged = session.violations > 0;
            return (
              <Card
                key={session.tokenId}
                className={`border bg-white shadow-xs rounded-xl overflow-hidden transition-all ${
                  isFlagged ? "border-red-200" : "border-slate-200"
                }`}
              >
                <div
                  className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50/60 transition-colors"
                  onClick={() => toggleExpand(session.tokenId)}
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                        isFlagged ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-600"
                      }`}
                    >
                      {isFlagged ? (
                        <AlertTriangle className="w-6 h-6 animate-pulse" />
                      ) : (
                        <ShieldCheck className="w-6 h-6" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-black text-slate-900 truncate">
                          {session.candidateName}
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-bold ${
                            session.passed === true
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : session.passed === false
                              ? "bg-red-50 text-red-700 border-red-200"
                              : "bg-slate-50 text-slate-600 border-slate-200"
                          }`}
                        >
                          {session.passed === true ? "Passed Exam" : session.passed === false ? "Failed Exam" : session.status}
                        </Badge>

                        {/* Integrity Badge */}
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-bold ${
                            session.integrityScore >= 80
                              ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                              : session.integrityScore >= 50
                              ? "bg-amber-50 text-amber-800 border-amber-300"
                              : "bg-red-50 text-red-800 border-red-300"
                          }`}
                        >
                          Integrity: {session.integrityScore}%
                        </Badge>
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-slate-500 font-medium mt-1 flex-wrap">
                        <span className="flex items-center gap-1">
                          <FileText className="w-3 h-3 text-slate-400" /> {session.assessmentTitle}
                        </span>
                        {session.score !== null && (
                          <span className="flex items-center gap-1">
                            <Award className="w-3 h-3 text-slate-400" /> Score: {session.score}%
                          </span>
                        )}
                        <span
                          className={`flex items-center gap-1 font-bold ${
                            isFlagged ? "text-red-600" : "text-emerald-600"
                          }`}
                        >
                          <AlertTriangle className="w-3 h-3" /> Violations: {session.violations}
                        </span>
                      </div>

                      {/* Flagged Category Chips */}
                      {session.flaggedCategories.length > 0 && (
                        <div className="flex gap-1.5 mt-2 flex-wrap">
                          {session.flaggedCategories.map((cat, ci) => (
                            <span
                              key={ci}
                              className="text-[9px] font-bold uppercase tracking-wider bg-red-50 border border-red-200 text-red-700 px-2 py-0.5 rounded-md"
                            >
                              {cat}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-[10px] text-slate-400 font-medium">
                      {session.completedAt ? new Date(session.completedAt).toLocaleString() : ""}
                    </span>
                    {expandedSession === session.tokenId ? (
                      <ChevronUp className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                </div>

                {/* Expanded Session Audit Panel */}
                {expandedSession === session.tokenId && (
                  <div className="border-t border-slate-100 bg-slate-50/50 p-5 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                          <User className="w-3 h-3 text-indigo-600" /> Candidate Record
                        </span>
                        <p className="text-sm font-black text-slate-900 mt-1">{session.candidateName}</p>
                        {session.candidateEmail && (
                          <p className="text-[11px] font-mono text-slate-500 mt-0.5">{session.candidateEmail}</p>
                        )}
                      </div>

                      <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                          <Award className="w-3 h-3 text-indigo-600" /> Exam Result
                        </span>
                        <p className="text-sm font-black text-slate-900 mt-1">
                          {session.score !== null ? `${session.score}%` : "Pending"}
                          {session.passed === true && (
                            <span className="text-emerald-600 text-xs ml-1.5 font-bold">(Passed)</span>
                          )}
                          {session.passed === false && (
                            <span className="text-red-600 text-xs ml-1.5 font-bold">(Failed)</span>
                          )}
                        </p>
                      </div>

                      <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3 text-indigo-600" /> Security Verdict
                        </span>
                        <p
                          className={`text-sm font-black mt-1 ${
                            session.violations > 0 ? "text-red-600" : "text-emerald-600"
                          }`}
                        >
                          {session.violations === 0
                            ? "Verified Clean Assessment"
                            : `${session.violations} Security Incidents Flagged`}
                        </p>
                      </div>
                    </div>

                    {/* Violation Timeline Log */}
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 mb-2 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-indigo-600" /> Proctoring Incident Timeline
                      </h4>

                      {session.proctorLog.length > 0 ? (
                        <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-72 overflow-y-auto">
                          {session.proctorLog.map((entry, idx) => (
                            <div key={idx} className="p-3 flex items-center justify-between text-xs hover:bg-slate-50/50">
                              <div className="flex items-center gap-3">
                                <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                                <span className="font-semibold text-slate-800">{entry.type}</span>
                              </div>
                              <span className="text-[10px] font-mono text-slate-400 shrink-0">
                                {entry.timestamp
                                  ? new Date(entry.timestamp).toLocaleTimeString()
                                  : entry.time || "Logged"}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
                          <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-1" />
                          <p className="text-xs font-bold text-slate-600">Zero Violations Logged</p>
                          <p className="text-[10px] text-slate-400">Candidate adhered strictly to proctored exam conditions.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <div className="text-center text-[11px] text-slate-400 font-medium pb-6">
        Displaying {filteredSessions.length} of {sessions.length} proctored examination sessions
      </div>
    </div>
  );
}
