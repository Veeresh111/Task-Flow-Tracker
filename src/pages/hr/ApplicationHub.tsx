import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { Loader2, Inbox, Eye, Calendar, Sparkles, BrainCircuit, ExternalLink, Search, Filter, CheckCircle2, FileText, RefreshCw, XCircle, DollarSign, PieChart, Award, UserPlus, MessageSquare, BadgeCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { JobApplication, Assessment, JobForm } from "@/types";

export default function ApplicationHub() {
  const [loading, setLoading] = useState(true);
  const [aiScanning, setAiScanning] = useState(false);
  const [individualScanning, setIndividualScanning] = useState<string | null>(null);
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [selectedApp, setSelectedApp] = useState<JobApplication | null>(null);
  
  // Financial Metrics
  const [totalPayrollExpenditure, setTotalPayrollExpenditure] = useState<number>(0);
  const [averageEmployeeComp, setAverageEmployeeComp] = useState<number>(0);
  
  const [searchQuery, setSearchQuery] = useState("");
  const [filterJob, setFilterJob] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterScoreRange, setFilterScoreRange] = useState("All");
  const [filterRecruiter, setFilterRecruiter] = useState("All");
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const PAGE_SIZE = 50;

  // Assessment Assignment
  const [assigningAssessment, setAssigningAssessment] = useState<string | null>(null);
  const [availableAssessments, setAvailableAssessments] = useState<Assessment[]>([]);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string>("");

  // HR Recruiter Assignment
  const [hrUsers, setHrUsers] = useState<any[]>([]);
  const [assigningRecruiter, setAssigningRecruiter] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const { toast } = useToast();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setCurrentUserId(data.user.id);
    });
    fetchHRUsers();
    fetchApplications();
  }, [page]);

  const fetchHRUsers = async () => {
    const { data } = await supabase.from("profiles").select("id, name, email").in("role", ["hr", "admin"]);
    setHrUsers(data || []);
  };

  useEffect(() => {
    fetchLivePayrollMetrics();
    fetchAvailableAssessments();

    const channel = supabase
      .channel("job-applications-live-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "job_applications" }, () => fetchApplications())
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  const fetchAvailableAssessments = async () => {
    try {
      const { data } = await supabase
        .from('assessments')
        .select('id, title, difficulty, passing_score, duration_minutes')
        .eq('status', 'Active')
        .order('created_at', { ascending: false });
      setAvailableAssessments(data || []);
    } catch (e) {
      console.error("Failed to load assessments", e);
    }
  };

  const fetchLivePayrollMetrics = async () => {
    try {
      const { data } = await supabase
        .from("payroll_ledger")
        .select("net_payroll_pay");
      
      if (data && data.length > 0) {
        const globalSum = data.reduce((acc, row) => acc + Number(row.net_payroll_pay || 0), 0);
        setTotalPayrollExpenditure(globalSum);
        setAverageEmployeeComp(parseFloat((globalSum / data.length).toFixed(2)));
        return;
      }
    } catch (e) {
      console.warn("Payroll metrics fallback:", e);
    }
    try {
      const { data: profiles } = await supabase.from('profiles').select('payroll_ctc').not('role', 'eq', 'candidate');
      if (profiles && profiles.length > 0) {
        const knownSalaries = profiles.filter(p => Number(p.payroll_ctc) > 0);
        const totalCtc = knownSalaries.reduce((acc, p) => acc + Number(p.payroll_ctc), 0);
        setTotalPayrollExpenditure(totalCtc);
        setAverageEmployeeComp(knownSalaries.length > 0 ? parseFloat((totalCtc / knownSalaries.length).toFixed(2)) : 0);
      }
    } catch (e2) {
      console.warn("Payroll calc fallback:", e2);
    }
  };

  const fetchApplications = async () => {
    try {
      setLoading(true);
      const { count } = await supabase
        .from('job_applications')
        .select('*', { count: 'exact', head: true });
      if (count !== null) setTotalCount(count);

      const { data: rawApps } = await supabase
        .from('job_applications')
        .select('*')
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      const { data: rawForms } = await supabase
        .from('job_forms')
        .select('id, job_title, jd_text');

      const localizedJoinedApplications = (rawApps || []).map((app: JobApplication) => {
        const targetFormId = app.form_id || app.job_form_id;
        const matchingForm = rawForms?.find((f: JobForm) => f.id === targetFormId) || null;
        return {
          ...app,
          job_forms: matchingForm ? {
            job_title: matchingForm.job_title,
            jd_text: matchingForm.jd_text
          } : { job_title: "Position Context Unresolved", jd_text: "" }
        };
      });

      setApplications(localizedJoinedApplications);
      if (selectedApp) {
        const updated = localizedJoinedApplications.find(a => a.id === selectedApp.id);
        if (updated) setSelectedApp(updated);
      }
    } catch (err) {
      console.error("APP ERROR FULL:", err);
      toast({ title: "Pipeline Error", description: "Failed to read application records.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // === FIXED ASSESSMENT ASSIGNMENT (Matches your real schema) ===
  const assignAssessment = async (app: JobApplication) => {
    if (!app.candidate_id) {
      return toast({ 
        title: "Data Missing", 
        description: "This application is missing candidate_id. Please fix the database row.", 
        variant: "destructive" 
      });
    }
    if (!selectedAssessmentId) {
      return toast({ title: "Selection Required", description: "Please select an assessment first.", variant: "destructive" });
    }

    setAssigningAssessment(app.id);
    try {
      // Duplicate protection
      const { data: existing } = await supabase
        .from("assessment_tokens")
        .select("id")
        .eq("candidate_id", app.candidate_id)
        .eq("used", false);

      if (existing && existing.length > 0) {
        return toast({ 
          title: "Already Assigned", 
          description: "This candidate already has an active assessment token.", 
          variant: "destructive" 
        });
      }

      const newToken = crypto.randomUUID();
      const selectedAssessment = availableAssessments.find(a => a.id === selectedAssessmentId);

      const assessmentTitle = selectedAssessment?.title || "Unknown";
      const assessmentDuration = selectedAssessment?.duration_minutes ?? "N/A";
      const assessmentPassingScore = selectedAssessment?.passing_score ?? "N/A";

      const { error: tokenErr } = await supabase
        .from("assessment_tokens")
        .insert([{
          candidate_id: app.candidate_id,
          assessment_id: selectedAssessmentId,
          application_id: app.id,
          token: newToken,
          used: false,
          status: "Active",
          expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
        }]);

      if (tokenErr) {
        console.error("TOKEN INSERT ERROR:", tokenErr);
        throw tokenErr;
      }

      await supabase
        .from("candidate_notifications")
        .insert([{
          candidate_id: app.candidate_id,
          title: "Assessment Assigned",
          message: `You have been assigned "${assessmentTitle}" assessment.\nDuration: ${assessmentDuration} minutes\nPassing Score: ${assessmentPassingScore}%\nToken: ${newToken}`,
          read: false
        }]);

      // Update application status
      await supabase
        .from('job_applications')
        .update({ status: "Assessment Assigned" })
        .eq('id', app.id);

      toast({ 
        title: "✅ Assessment Assigned", 
        description: `Token: ${newToken} sent to ${app.candidate_name}` 
      });

      fetchApplications();
      setSelectedAssessmentId("");
    } catch (err) {
      console.error("ASSIGNMENT FULL ERROR:", err);
      toast({ title: "Assignment Failed", description: err.message, variant: "destructive" });
    } finally {
      setAssigningAssessment(null);
    }
  };

  const getAccessToken = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    return sessionData?.session?.access_token;
  };

  const runATSScanner = async (processAll = false) => {
    const appsToProcess = processAll ? applications : applications.filter(app => app.match_score == null);
    if (appsToProcess.length === 0) {
      return toast({ title: "Queue Settled", description: "No applications found matching processing targets." });
    }

    setAiScanning(true);
    toast({ title: "Secure ATS Active", description: `Processing ${appsToProcess.length} applications...` });

    const accessToken = await getAccessToken();
    if (!accessToken) {
      setAiScanning(false);
      return toast({ title: "Auth Error", description: "Not authenticated. Please refresh.", variant: "destructive" });
    }

    for (let i = 0; i < appsToProcess.length; i++) {
      const app = appsToProcess[i];
      try {
        const targetJD = app.job_forms?.jd_text || 'Corporate Requisition Role Profile';

        const requestBody: Record<string, any> = {
          jobDescription: targetJD,
          answers: app.answers || {}
        };

        if (app.parsed_resume_text) {
          requestBody.resumeText = app.parsed_resume_text;
        }

        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ats-screen`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${accessToken}`
          },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) throw new Error(`Edge function error: ${response.status}`);
        const parsed = await response.json();

        const calculatedStatus = parsed.score >= 75 ? 'Shortlisted' : 'Rejected';

        await supabase
          .from('job_applications')
          .update({
            match_score: parsed.score,
            ai_verdict: parsed.verdict,
            status: calculatedStatus
          })
          .eq('id', app.id);

      } catch (e) {
        console.error(`Scanner failed for app ${app.id}:`, e);
      }
      if (i < appsToProcess.length - 1) await new Promise(r => setTimeout(r, 1500));
    }

    toast({ title: "Scan Completed", description: "All applications processed." });
    fetchApplications();
    setAiScanning(false);
  };

  const runSingleATSScanner = async (app: JobApplication) => {
    setIndividualScanning(app.id);
    try {
      const targetJD = app.job_forms?.jd_text || 'Corporate Requisition Role Profile';

      const requestBody: Record<string, any> = {
        jobDescription: targetJD,
        answers: app.answers || {}
      };

      if (app.parsed_resume_text) {
        requestBody.resumeText = app.parsed_resume_text;
      }

      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error("Not authenticated");
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ats-screen`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) throw new Error("Edge function failed");
      const parsed = await response.json();

      const calculatedStatus = parsed.score >= 75 ? 'Shortlisted' : 'Rejected';

      await supabase
        .from('job_applications')
        .update({
          match_score: parsed.score,
          ai_verdict: parsed.verdict,
          status: calculatedStatus
        })
        .eq('id', app.id);

      toast({ title: "Analysis Complete", description: `${app.candidate_name} scored ${parsed.score}%` });
      fetchApplications();
    } catch (e) {
      toast({ title: "Scan Failed", variant: "destructive" });
    } finally {
      setIndividualScanning(null);
    }
  };

  const uniqueJobs = ["All", ...Array.from(new Set(applications.map(a => a.job_forms?.job_title).filter(Boolean)))];
  const uniqueStatuses = ["All", "Applied", "Screening", "Shortlisted", "ATS Shortlisted", "Recruiter Screening", "Assessment Assigned", "Assessment Passed", "Assessment Completed", "Interview Scheduled", "Interview Cleared", "Offer Generated", "Offer Accepted", "Offer Declined", "Onboarding", "Rejected"];

  const filteredApplications = applications.filter(app => {
    const searchMatch = !searchQuery ||
      (app.candidate_name?.toLowerCase() || "").includes(searchQuery.toLowerCase()) ||
      (app.candidate_email?.toLowerCase() || "").includes(searchQuery.toLowerCase());
    const jobMatch = filterJob === "All" || app.job_forms?.job_title === filterJob;
    const statusMatch = filterStatus === "All" || app.status === filterStatus;
    const scoreMatch = filterScoreRange === "All" ||
      (filterScoreRange === "75-100" && (app.match_score || 0) >= 75) ||
      (filterScoreRange === "50-74" && (app.match_score || 0) >= 50 && (app.match_score || 0) < 75) ||
      (filterScoreRange === "0-49" && (app.match_score || 0) < 50) ||
      (filterScoreRange === "unscored" && app.match_score == null);
    const recruiterMatch = filterRecruiter === "All" || app.assigned_recruiter === filterRecruiter;
    return searchMatch && jobMatch && statusMatch && scoreMatch && recruiterMatch;
  });

  return (
    <DashboardLayout role="hr">
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in pb-12">
        
        {/* Payroll Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card className="border-slate-200 bg-white p-4 flex items-center gap-4 shadow-sm">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl"><DollarSign className="w-6 h-6" /></div>
            <div>
              <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 block">Total Ledger Expenditures</span>
              <span className="text-xl font-black text-slate-900 font-mono">₹{totalPayrollExpenditure.toLocaleString('en-IN')}</span>
            </div>
          </Card>
          <Card className="border-slate-200 bg-white p-4 flex items-center gap-4 shadow-sm">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl"><PieChart className="w-6 h-6" /></div>
            <div>
              <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 block">Average Comp Metrics</span>
              <span className="text-xl font-black text-slate-900 font-mono">₹{averageEmployeeComp.toLocaleString('en-IN')}</span>
            </div>
          </Card>
        </div>

        <div className="bg-slate-900 p-8 rounded-xl shadow-xl text-white flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border border-slate-800">
          <div>
            <h1 className="text-3xl font-black flex items-center gap-3"><Inbox className="text-emerald-400 w-8 h-8"/> Central Application Hub</h1>
            <p className="text-slate-300 mt-2">Unified live ATS scoring engine tracking active vacancy applications pipeline</p>
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <Button onClick={() => runATSScanner(false)} disabled={aiScanning || loading} variant="outline" className="text-white border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-bold flex-1 md:flex-none">
              {aiScanning ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <BrainCircuit className="w-4 h-4 mr-1" />}
              Scan Pending
            </Button>
            <Button onClick={() => runATSScanner(true)} disabled={aiScanning || loading} className="bg-emerald-600 hover:bg-emerald-700 text-xs font-black uppercase tracking-wider flex-1 md:flex-none">
              {aiScanning ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
              Force Re-scan All
            </Button>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            {/* Smart Search & Filters */}
            <div className="bg-white p-4 rounded-xl shadow-sm border flex flex-col gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input placeholder="Smart Search: name, email, position..." className="pl-10 h-10 text-sm" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Select value={filterJob} onValueChange={setFilterJob}>
                  <SelectTrigger className="w-40 text-xs h-9 font-medium">
                    <SelectValue placeholder="Position" />
                  </SelectTrigger>
                  <SelectContent>
                    {uniqueJobs.map(job => <SelectItem key={job} value={job}>{job}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-36 text-xs h-9 font-medium">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {uniqueStatuses.map(st => <SelectItem key={st} value={st}>{st}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterScoreRange} onValueChange={setFilterScoreRange}>
                  <SelectTrigger className="w-32 text-xs h-9 font-medium">
                    <SelectValue placeholder="ATS Score" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Scores</SelectItem>
                    <SelectItem value="75-100">75-100% (Shortlisted)</SelectItem>
                    <SelectItem value="50-74">50-74% (Marginal)</SelectItem>
                    <SelectItem value="0-49">0-49% (Low)</SelectItem>
                    <SelectItem value="unscored">Not Scanned</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterRecruiter} onValueChange={setFilterRecruiter}>
                  <SelectTrigger className="w-36 text-xs h-9 font-medium">
                    <SelectValue placeholder="Assigned To" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Recruiters</SelectItem>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {hrUsers.map(hr => (
                      <SelectItem key={hr.id} value={hr.id}>{hr.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Main Table */}
            <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
              <CardHeader className="bg-slate-50 border-b p-4">
                <CardTitle className="text-xs font-black text-slate-700 uppercase tracking-wider">Inbound Requisition Pipe Queue ({filteredApplications.length})</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[520px] overflow-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-slate-50 z-10 border-b">
                      <TableRow>
                        <TableHead className="font-black text-xs">Candidate</TableHead>
                        <TableHead className="font-black text-xs">Vacancy</TableHead>
                        <TableHead className="font-black text-xs">ATS Score</TableHead>
                        <TableHead className="font-black text-xs text-center">Status</TableHead>
                        <TableHead className="font-black text-xs text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow><TableCell colSpan={5} className="text-center py-12"><Loader2 className="mx-auto animate-spin h-8 w-8 text-indigo-600" /></TableCell></TableRow>
                      ) : filteredApplications.map(app => (
                        <TableRow key={app.id} className={`cursor-pointer hover:bg-slate-50/80 transition-colors ${selectedApp?.id === app.id ? 'bg-indigo-50/50 border-l-4 border-indigo-600' : ''}`} onClick={() => setSelectedApp(app)}>
                          <TableCell>
                            <div className="font-bold text-slate-900">{app.candidate_name}</div>
                            <div className="text-xs text-slate-500 font-mono">{app.candidate_email}</div>
                          </TableCell>
                          <TableCell className="text-indigo-700 font-medium">{app.job_forms?.job_title}</TableCell>
                          <TableCell>
                            {app.match_score !== null ? (
                              <span className={`text-xl font-black ${app.match_score >= 75 ? 'text-emerald-600' : 'text-amber-500'}`}>{app.match_score}%</span>
                            ) : <span className="text-slate-400 text-xs">Pending Scan</span>}
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={`text-[10px] font-black uppercase px-3 py-1 rounded border tracking-wider ${
                              app.status === 'Assessment Assigned' || app.status === 'Assessment Passed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 
                              app.status === 'Rejected' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-blue-50 text-blue-700 border-blue-200'
                            }`}>
                              {app.status || 'Applied'}
                            </span>
                          </TableCell>
                          <TableCell className="text-right space-x-2">
                            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setSelectedApp(app); }}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            {app.status !== "Assessment Assigned" && (
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="text-emerald-700 border-emerald-200"
                                onClick={(e) => { e.stopPropagation(); assignAssessment(app); }}
                                disabled={assigningAssessment === app.id}
                              >
                                {assigningAssessment === app.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Award className="w-3 h-3 mr-1" />}
                                Assign
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
            <div className="flex items-center justify-between px-1 py-3">
              <span className="text-xs text-slate-500 font-medium">Showing {Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount} total</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={(page + 1) * PAGE_SIZE >= totalCount} onClick={() => setPage(p => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          </div>

          {/* FULL DOSSIER SIDE PANEL */}
          <div className="lg:col-span-1">
            {selectedApp ? (
              <Card className="sticky top-24 shadow-xl border-slate-200 bg-white overflow-hidden rounded-xl">
                <CardHeader className="bg-indigo-600 text-white p-4">
                  <CardTitle className="text-xs font-black uppercase tracking-wider flex items-center gap-2"><FileText className="w-4 h-4"/> Candidate Dossier</CardTitle>
                </CardHeader>
                <CardContent className="p-5 space-y-6 max-h-[calc(100vh-120px)] overflow-y-auto">

                  <div>
                    <h3 className="text-xl font-black text-slate-900">{selectedApp.candidate_name}</h3>
                    <p className="text-sm text-indigo-600">{selectedApp.candidate_email}</p>
                  </div>

                  {/* Resume Link with multiple fallbacks */}
                  {(() => {
                    const resumeLink = selectedApp.resume_url || 
                                      selectedApp.answers?.resume_url || 
                                      selectedApp.answers?.resume || 
                                      selectedApp.answers?.cv || 
                                      selectedApp.answers?.cv_link;
                    return resumeLink && (
                      <Button onClick={() => window.open(resumeLink, '_blank')} variant="outline" className="w-full">
                        <ExternalLink className="w-4 h-4 mr-2" /> View Resume / CV
                      </Button>
                    );
                  })()}

                  {/* Submitted Answers */}
                  {selectedApp.answers && Object.keys(selectedApp.answers).length > 0 && (
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">Submitted Information</h4>
                      <div className="space-y-3">
                        {Object.entries(selectedApp.answers).map(([key, value]) => (
                          <div key={key} className="bg-slate-50 border border-slate-100 p-3 rounded-xl">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                              {key.replace(/_/g, " ")}
                            </p>
                            <p className="text-sm text-slate-800 whitespace-pre-wrap">
                              {String(value)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* HR Recruiter Assignment Section */}
                  <div className="border-t pt-4">
                    <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">ASSIGN HR HANDLER</h4>
                    <Select
                      value={selectedApp.assigned_recruiter || ""}
                      onValueChange={async (recruiterId) => {
                        setAssigningRecruiter(selectedApp.id);
                        try {
                          await supabase.from("job_applications").update({ assigned_recruiter: recruiterId }).eq("id", selectedApp.id);
                          toast({ title: "HR Assigned", description: "Recruiter assigned to this application." });
                          fetchApplications();
                        } catch (err: any) {
                          toast({ title: "Assignment Failed", description: err.message, variant: "destructive" });
                        } finally {
                          setAssigningRecruiter(null);
                        }
                      }}
                    >
                      <SelectTrigger className="mb-3" disabled={assigningRecruiter === selectedApp.id}>
                        <SelectValue placeholder={selectedApp.assigned_recruiter ? "Change Handler" : "Assign HR Handler"} />
                      </SelectTrigger>
                      <SelectContent>
                        {hrUsers.map(hr => (
                          <SelectItem key={hr.id} value={hr.id}>{hr.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedApp.assigned_recruiter && (
                      <p className="text-[10px] text-emerald-600 font-bold mb-3 flex items-center gap-1">
                        <BadgeCheck className="w-3 h-3" /> Assigned to {hrUsers.find(h => h.id === selectedApp.assigned_recruiter)?.name || "Unknown"}
                      </p>
                    )}
                  </div>

                  {/* Assessment Assignment Section */}
                  <div className="border-t pt-5">
                    <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">ASSIGN ASSESSMENT</h4>
                    <Select value={selectedAssessmentId} onValueChange={setSelectedAssessmentId}>
                      <SelectTrigger className="mb-3">
                        <SelectValue placeholder="Select Assessment" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableAssessments.map(ass => (
                          <SelectItem key={ass.id} value={ass.id}>
                            {ass.title} ({ass.difficulty})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Button 
                      onClick={() => assignAssessment(selectedApp)} 
                      disabled={!selectedAssessmentId || assigningAssessment === selectedApp.id}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 h-11"
                    >
                      {assigningAssessment === selectedApp.id ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : <Award className="w-4 h-4 mr-2" />}
                      Assign Selected Assessment
                    </Button>
                  </div>

                </CardContent>
              </Card>
            ) : (
              <div className="h-64 border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center text-slate-400 text-xs font-semibold text-center p-8 bg-slate-50/50">
                Select a candidate from the table to view full dossier and assign assessments
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}