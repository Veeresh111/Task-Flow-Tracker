import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { Loader2, Inbox, Eye, Calendar, Sparkles, BrainCircuit, ExternalLink, Search, Filter, CheckCircle2, FileText, RefreshCw, XCircle, DollarSign, PieChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export default function ApplicationHub() {
  const [loading, setLoading] = useState(true);
  const [aiScanning, setAiScanning] = useState(false);
  const [individualScanning, setIndividualScanning] = useState<string | null>(null);
  const [applications, setApplications] = useState<any[]>([]);
  const [selectedApp, setSelectedApp] = useState<any>(null);
  
  // Real Database Financial Aggregate States
  const [totalPayrollExpenditure, setTotalPayrollExpenditure] = useState<number>(0);
  const [averageEmployeeComp, setAverageEmployeeComp] = useState<number>(0);
  
  const [searchQuery, setSearchQuery] = useState("");
  const [filterJob, setFilterJob] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  
  const { toast } = useToast();

  useEffect(() => {
    fetchApplications();
    fetchLivePayrollMetrics();

    const channel = supabase
      .channel("job-applications-live-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "job_applications" },
        () => {
          fetchApplications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // CRITICAL PAYROLL BUG FIXED: Compiles real payroll database entries to build true financial tracking metrics
  const fetchLivePayrollMetrics = async () => {
    try {
      const { data, error } = await supabase
        .from("payroll_ledger")
        .select("net_payroll_pay");
      
      if (error) throw error;
      if (data && data.length > 0) {
        const globalSum = data.reduce((acc, row) => acc + Number(row.net_payroll_pay || 0), 0);
        setTotalPayrollExpenditure(globalSum);
        setAverageEmployeeComp(parseFloat((globalSum / data.length).toFixed(2)));
      }
    } catch (e) {
      console.warn("Could not query payroll_ledger records matrix fallback onto mock baseline:", e);
    }
  };

  const fetchApplications = async () => {
    try {
      setLoading(true);
      
      const { data: rawApps, error: appErr } = await supabase
        .from('job_applications')
        .select('*')
        .order('created_at', { ascending: false });

      if (appErr) throw appErr;

      if (!rawApps || rawApps.length === 0) {
        setApplications([]);
        return;
      }

      const { data: rawForms, error: formsErr } = await supabase
        .from('job_forms')
        .select('id, job_title, jd_text');

      if (formsErr) throw formsErr;

      const localizedJoinedApplications = rawApps.map((app: any) => {
        const targetFormId = app.form_id || app.job_form_id;
        const matchingForm = rawForms?.find((f: any) => f.id === targetFormId) || null;
        
        return {
          ...app,
          resume_url: app.resume_url || null,
          job_forms: matchingForm ? {
            job_title: matchingForm.job_title,
            jd_text: matchingForm.jd_text
          } : {
            job_title: "Position Context Unresolved",
            jd_text: "Requisition details missing inside database maps."
          }
        };
      });

      setApplications(localizedJoinedApplications);

      if (selectedApp) {
        const updatedApp = localizedJoinedApplications.find(a => a.id === selectedApp.id);
        if (updatedApp) setSelectedApp(updatedApp);
      }
    } catch (err: any) {
      console.error("APP ERROR FULL:", err);
      toast({ title: "Pipeline Error", description: "Failed to read application records.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const syncWithCandidateApplications = async (app: any, score: number, workflowStatus: string) => {
    const targetCandidateId = app.candidate_id;
    const targetFormId = app.form_id || app.job_form_id;

    if (!targetCandidateId || !targetFormId) return;

    try {
      await supabase
        .from('candidate_applications')
        .update({
          ai_score: score,
          status: workflowStatus,
          updated_at: new Date().toISOString()
        })
        .eq('candidate_id', targetCandidateId)
        .eq('job_form_id', targetFormId);
    } catch (e) {
      console.error("Summary workflow pipeline sync failure:", e);
    }
  };

  // HIGH SEVERITY FIX: Executing AI-inference prompts through server-side edge proxies instead of frontend browser codes
  const runATSScanner = async (processAll = false) => {
    const appsToProcess = processAll 
      ? applications 
      : applications.filter(app => app.match_score == null);

    if (appsToProcess.length === 0) {
      return toast({ title: "Queue Settled", description: "No applications found matching processing targets." });
    }

    setAiScanning(true);
    toast({ title: "Secure ATS Active", description: `Routing requests across ${appsToProcess.length} server nodes...` });

    for (let i = 0; i < appsToProcess.length; i++) {
      const app = appsToProcess[i];
      try {
        const targetJD = app.job_forms?.jd_text || 'Corporate Requisition Role Profile';
        
        // Relocated token operations safely down onto backend cloud layers
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ats-screen`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({
            jobDescription: targetJD,
            answers: app.answers || {}
          })
        });

        if (!response.ok) throw new Error(`Operational edge drop code: ${response.status}`);
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

        await syncWithCandidateApplications(app, parsed.score, calculatedStatus);

      } catch (e) {
        console.error(`Secure scanner trace failure at app node ${app.id}:`, e);
      }

      if (i < appsToProcess.length - 1) await sleep(2000);
    }

    toast({ title: "Secure Scan Concluded", description: "Evaluation ledgers synchronized cleanly." });
    fetchApplications();
    setAiScanning(false);
  };

  const runSingleATSScanner = async (app: any) => {
    setIndividualScanning(app.id);
    toast({ title: "Analyzing Profile", description: `Invoking server verification gate for ${app.candidate_name}` });

    try {
      const targetJD = app.job_forms?.jd_text || 'Corporate Requisition Role Profile';
      
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ats-screen`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
          jobDescription: targetJD,
          answers: app.answers || {}
        })
      });

      if (!response.ok) throw new Error("Operational edge proxy disconnected.");
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

      await syncWithCandidateApplications(app, parsed.score, calculatedStatus);

      toast({ title: "Analysis Complete", description: `${app.candidate_name} scored at ${parsed.score}% via Edge Vault` });
      fetchApplications();

    } catch (e) {
      toast({ title: "Scan Phase Interrupted", variant: "destructive" });
      console.error(e);
    } finally {
      setIndividualScanning(null);
    }
  };

  const uniqueJobs = ["All", ...Array.from(new Set(applications.map(a => a.job_forms?.job_title).filter(Boolean)))];
  const uniqueStatuses = ["All", "Applied", "Shortlisted", "Rejected", "Assessment Assigned", "Interview Scheduled"];

  const filteredApplications = applications.filter(app => {
    const searchMatch = (app.candidate_name?.toLowerCase() || "").includes(searchQuery.toLowerCase()) ||
                        (app.candidate_email?.toLowerCase() || "").includes(searchQuery.toLowerCase());
    const jobMatch = filterJob === "All" || app.job_forms?.job_title === filterJob;
    const statusMatch = filterStatus === "All" || app.status === filterStatus;
    return searchMatch && jobMatch && statusMatch;
  });

  return (
    <DashboardLayout role="hr">
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in pb-12">
        
        {/* Real Database Driven Financial Audit Metrics Row */}
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
            <p className="text-slate-300 mt-2">Unified live ATS scoring engine tracking active vacancy applications pipeline via secure Edge Proxy</p>
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
            <div className="bg-white p-4 rounded-xl shadow-sm border flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input placeholder="Search applicant names or email strings..." className="pl-10 h-10 text-sm" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
              </div>
              <div className="flex gap-2 sm:w-[400px]">
                <Select value={filterJob} onValueChange={setFilterJob}>
                  <SelectTrigger className="w-full text-xs h-10 font-medium">
                    <SelectValue placeholder="Position Filter" />
                  </SelectTrigger>
                  <SelectContent>
                    {uniqueJobs.map(job => <SelectItem key={job} value={job}>{job}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-full text-xs h-10 font-medium">
                    <SelectValue placeholder="Status Filter" />
                  </SelectTrigger>
                  <SelectContent>
                    {uniqueStatuses.map(st => <SelectItem key={st} value={st}>{st}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
              <CardHeader className="bg-slate-50 border-b p-4">
                <CardTitle className="text-xs font-black text-slate-700 uppercase tracking-wider">Inbound Requisition Pipe Queue ({filteredApplications.length})</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[520px] overflow-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-slate-50 z-10 border-b">
                      <TableRow>
                        <TableHead className="font-black text-xs">Candidate Parameters</TableHead>
                        <TableHead className="font-black text-xs">Linked Vacancy</TableHead>
                        <TableHead className="font-black text-xs">ATS Metric</TableHead>
                        <TableHead className="font-black text-xs text-center">Status</TableHead>
                        <TableHead className="font-black text-xs text-right">Review Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow><TableCell colSpan={5} className="text-center py-12"><Loader2 className="mx-auto animate-spin h-8 w-8 text-indigo-600" /></TableCell></TableRow>
                      ) : filteredApplications.map(app => (
                        <TableRow key={app.id} className={`cursor-pointer hover:bg-slate-50/80 transition-colors ${selectedApp?.id === app.id ? 'bg-indigo-50/50 border-l-4 border-indigo-600 font-medium' : ''}`} onClick={() => setSelectedApp(app)}>
                          <TableCell>
                            <div className="font-bold text-slate-900 text-sm">{app.candidate_name}</div>
                            <div className="text-xs text-slate-500 font-mono">{app.candidate_email}</div>
                          </TableCell>
                          <TableCell className="text-indigo-700 font-bold text-xs uppercase tracking-tight">{app.job_forms?.job_title}</TableCell>
                          <TableCell>
                            {app.match_score !== null ? (
                              <div>
                                <span className={`text-xl font-black ${app.match_score >= 75 ? 'text-emerald-600' : app.match_score >= 50 ? 'text-amber-500' : 'text-red-500'}`}>{app.match_score}</span>
                                <span className="text-xs font-bold text-slate-400">%</span>
                              </div>
                            ) : (
                              <span className="inline-block bg-slate-100 text-slate-400 text-[10px] font-bold uppercase px-2 py-0.5 rounded border">Awaiting Scan</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border tracking-wider ${
                              app.status === 'Shortlisted' || app.status === 'Assessment Passed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                              app.status === 'Rejected' ? 'bg-red-50 text-red-700 border-red-200' :
                              'bg-blue-50 text-blue-700 border-blue-200'
                            }`}>
                              {app.status || 'Applied'}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" className="h-8 text-xs font-bold text-indigo-600"><Eye className="h-4 w-4 mr-1" /> Dossier</Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* DETAIL DOSSIER SIDE PANEL */}
          <div className="lg:col-span-1">
            {selectedApp ? (
              <Card className="sticky top-24 shadow-xl border-slate-200 bg-white overflow-hidden rounded-xl animate-in slide-in-from-right-4">
                <CardHeader className="bg-indigo-600 text-white p-4">
                  <CardTitle className="text-xs font-black uppercase tracking-wider flex items-center gap-2"><FileText className="w-4 h-4"/> Candidate Dossier Overview</CardTitle>
                </CardHeader>
                <CardContent className="p-5 space-y-5 max-h-[580px] overflow-y-auto">
                  <div className="border-b pb-3">
                    <h3 className="text-xl font-black text-slate-900 tracking-tight">{selectedApp.candidate_name}</h3>
                    <p className="text-sm font-semibold text-indigo-600 mt-0.5">{selectedApp.candidate_email}</p>
                    
                    {selectedApp.resume_url ? (
                      <Button onClick={() => window.open(selectedApp.resume_url, '_blank')} variant="outline" className="w-full h-9 text-xs font-bold border-indigo-200 text-indigo-700 bg-indigo-50/40 hover:bg-indigo-50 mt-3">
                        <ExternalLink className="w-3.5 h-3.5 mr-2 text-indigo-600" /> View Candidate Attachment Resume
                      </Button>
                    ) : (
                      <p className="text-[10px] font-bold text-slate-400 italic mt-2 flex items-center gap-1"><XCircle className="w-3.5 h-3.5"/> No external CV document attached.</p>
                    )}
                  </div>

                  <div className="space-y-3">
                    <h4 className="uppercase text-[10px] font-black tracking-widest text-slate-400">AI Screening Feedback Summary</h4>
                    <div className="bg-slate-50 border p-3 rounded-xl">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">ATS Scanner Notes Verdict</p>
                      <p className="text-xs font-bold text-slate-700 mt-1 leading-relaxed">{selectedApp.ai_verdict || "Profile has not yet been processed by secure edge scoring modules."}</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="uppercase text-[10px] font-black tracking-widest text-slate-400">Structured Questionnaire Submissions</h4>
                    {Object.entries(selectedApp.answers || {}).map(([questionKey, candidateResponse]) => (
                      <div key={questionKey} className="bg-slate-50/60 border border-slate-100 p-3 rounded-xl">
                        <p className="text-[9px] uppercase font-black text-slate-400 tracking-wider mb-1">{questionKey.replace(/_/g, ' ')}</p>
                        <p className="text-xs font-semibold text-slate-800 whitespace-pre-wrap leading-relaxed">{String(candidateResponse)}</p>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2">
                    <Button onClick={() => runSingleATSScanner(selectedApp)} disabled={individualScanning === selectedApp.id} className="w-full h-11 bg-indigo-600 text-white font-black text-xs uppercase tracking-wider shadow-md rounded-xl">
                      {individualScanning === selectedApp.id ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <BrainCircuit className="w-4 h-4 mr-2" />}
                      Run Isolated Edge ATS Scan
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="h-64 border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center text-slate-400 text-xs font-semibold text-center p-8 bg-slate-50/50">
                Select a candidate record row to parse full dossier indices.
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}