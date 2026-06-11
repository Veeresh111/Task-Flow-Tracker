import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { Loader2, Inbox, Eye, Calendar, Sparkles, BrainCircuit, ExternalLink, Search, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { GoogleGenerativeAI } from "@google/generative-ai";

export default function ApplicationHub() {
  const [loading, setLoading] = useState(true);
  const [aiScanning, setAiScanning] = useState(false);
  const [individualScanning, setIndividualScanning] = useState<string | null>(null);
  const [applications, setApplications] = useState<any[]>([]);
  const [selectedApp, setSelectedApp] = useState<any>(null);
  
  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [filterJob, setFilterJob] = useState("All");
  
  const { toast } = useToast();

  useEffect(() => {
    fetchApplications();
  }, []);

  const fetchApplications = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('job_applications')
      .select('*, job_forms(job_title, jd_text)')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setApplications(data);
      // If an app is currently selected, update its data (e.g. after a scan)
      if (selectedApp) {
        const updatedApp = data.find(a => a.id === selectedApp.id);
        if (updatedApp) setSelectedApp(updatedApp);
      }
    }
    setLoading(false);
  };

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // --- 1. GLOBAL ATS SCANNER (Batch Processing) ---
  const runATSScanner = async () => {
    const unscoredApps = applications.filter(app => app.match_score == null);
    if (unscoredApps.length === 0) return toast({ title: "Queue Empty", description: "All applications have already been scored by the AI." });

    setAiScanning(true);
    toast({ title: "Global ATS Initialized", description: `Running deep AI analysis on ${unscoredApps.length} applications...` });

    const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "AQ.Ab8RN6KQXzJBhyAkPtzy70H-HJXV0zOvPoV6BjJ-ohgF3Cs_YQ";
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    for (let i = 0; i < unscoredApps.length; i++) {
      const app = unscoredApps[i];
      try {
        const prompt = `Act as an elite Corporate ATS. 
        Job Description: "${app.job_forms?.jd_text || 'Corporate Role'}"
        Candidate Submitted Answers: ${JSON.stringify(app.answers)}
        
        Analyze all the candidate's answers deeply against the Job Description.
        Output STRICTLY a JSON object. No markdown. Format:
        {"score": 85, "verdict": "Hire"} OR {"score": 40, "verdict": "Reject"}`;

        const result = await model.generateContent(prompt);
        let cleanText = result.response.text().replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
        const startIdx = cleanText.indexOf('{');
        const endIdx = cleanText.lastIndexOf('}');
        if (startIdx !== -1 && endIdx !== -1) cleanText = cleanText.substring(startIdx, endIdx + 1);
        
        const parsed = JSON.parse(cleanText);

        await supabase.from('job_applications').update({ 
          match_score: parsed.score, 
          ai_verdict: parsed.verdict,
          status: parsed.score >= 75 ? 'Shortlisted' : 'Rejected'
        }).eq('id', app.id);

      } catch (e) {
        console.error(`AI failed for app ${app.id}`, e);
      }
      
      // Mandatory API Throttle
      if (i < unscoredApps.length - 1) await sleep(4000);
    }

    toast({ title: "Batch Scan Complete", description: "All queued candidates have been evaluated." });
    fetchApplications();
    setAiScanning(false);
  };

  // --- 2. INDIVIDUAL ATS SCANNER (Single Candidate Processing) ---
  const runSingleATSScanner = async (app: any) => {
    if (app.match_score != null) return toast({ title: "Already Scanned", description: "This candidate has already been evaluated." });

    setIndividualScanning(app.id);
    toast({ title: "Targeted ATS Initialized", description: `Analyzing candidate: ${app.candidate_name}...` });

    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "AQ.Ab8RN6KQXzJBhyAkPtzy70H-HJXV0zOvPoV6BjJ-ohgF3Cs_YQ";
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      const prompt = `Act as an elite Corporate ATS. 
      Job Description: "${app.job_forms?.jd_text || 'Corporate Role'}"
      Candidate Submitted Answers: ${JSON.stringify(app.answers)}
      
      Analyze all the candidate's answers deeply against the Job Description.
      Output STRICTLY a JSON object. No markdown. Format:
      {"score": 85, "verdict": "Hire"} OR {"score": 40, "verdict": "Reject"}`;

      const result = await model.generateContent(prompt);
      let cleanText = result.response.text().replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
      const startIdx = cleanText.indexOf('{');
      const endIdx = cleanText.lastIndexOf('}');
      if (startIdx !== -1 && endIdx !== -1) cleanText = cleanText.substring(startIdx, endIdx + 1);
      
      const parsed = JSON.parse(cleanText);

      const { error } = await supabase.from('job_applications').update({ 
        match_score: parsed.score, 
        ai_verdict: parsed.verdict,
        status: parsed.score >= 75 ? 'Shortlisted' : 'Rejected'
      }).eq('id', app.id);

      if (error) throw error;

      toast({ title: "Analysis Complete", description: `${app.candidate_name} scored ${parsed.score}% and updated in database.` });
      fetchApplications(); // Refreshes table and the opened dossier

    } catch (e: any) {
      console.error(`AI failed for app ${app.id}`, e);
      toast({ title: "Scan Failed", description: "AI encountered an error analyzing this candidate.", variant: "destructive" });
    }
    setIndividualScanning(null);
  };

  // --- SMART FILTER LOGIC ---
  const uniqueJobs = ["All", ...Array.from(new Set(applications.map(a => a.job_forms?.job_title).filter(Boolean)))];

  const filteredApplications = applications.filter(app => {
    const matchesSearch = app.candidate_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          app.candidate_email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesJob = filterJob === "All" || app.job_forms?.job_title === filterJob;
    return matchesSearch && matchesJob;
  });

  return (
    <DashboardLayout role="hr">
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in pb-12">
        
        {/* HEADER SECTION */}
        <div className="bg-slate-900 p-8 rounded-xl shadow-xl text-white flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-black flex items-center gap-3"><Inbox className="text-emerald-400 w-8 h-8"/> Central Application Hub</h1>
            <p className="text-slate-300 mt-2 font-medium max-w-2xl">
              Securely review all inbound job applications from your public corporate forms.
            </p>
          </div>
          <Button onClick={runATSScanner} disabled={aiScanning || loading} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-12 px-6 shadow-lg whitespace-nowrap">
            {aiScanning ? <Loader2 className="w-5 h-5 animate-spin mr-2"/> : <BrainCircuit className="w-5 h-5 mr-2"/>}
            Push All to ATS Scanner
          </Button>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-4">
            
            {/* SEARCH AND FILTER BAR */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input 
                  placeholder="Search candidate name or email..." 
                  className="pl-10 h-10 text-sm bg-slate-50 border-slate-200" 
                  value={searchQuery} 
                  onChange={(e) => setSearchQuery(e.target.value)} 
                />
              </div>
              <Select value={filterJob} onValueChange={setFilterJob}>
                <SelectTrigger className="h-10 w-full sm:w-[250px] bg-slate-50 border-slate-200 text-sm">
                  <Filter className="w-4 h-4 mr-2 text-slate-500"/>
                  <SelectValue placeholder="Filter by Role" />
                </SelectTrigger>
                <SelectContent>
                  {uniqueJobs.map((job: any) => <SelectItem key={job} value={job}>{job}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* APPLICATIONS TABLE */}
            <Card className="shadow-sm border-slate-200 h-full">
              <CardHeader className="bg-slate-50 border-b pb-4">
                <CardTitle className="text-lg text-slate-800">Inbound Applications ({filteredApplications.length})</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[500px] overflow-y-auto">
                  <Table>
                    <TableHeader className="bg-slate-50 sticky top-0">
                      <TableRow>
                        <TableHead className="font-bold">Candidate</TableHead>
                        <TableHead className="font-bold">Target Role</TableHead>
                        <TableHead className="font-bold">ATS Score</TableHead>
                        <TableHead className="font-bold text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow><TableCell colSpan={4} className="text-center p-12"><Loader2 className="w-8 h-8 animate-spin mx-auto text-indigo-600"/></TableCell></TableRow>
                      ) : filteredApplications.map((app) => (
                        <TableRow key={app.id} className={`cursor-pointer transition-colors ${selectedApp?.id === app.id ? 'bg-indigo-50 border-l-4 border-l-indigo-600' : 'hover:bg-slate-50'}`} onClick={() => setSelectedApp(app)}>
                          <TableCell>
                            <p className="font-bold text-slate-800">{app.candidate_name}</p>
                            <p className="text-xs text-slate-500">{app.candidate_email}</p>
                            <p className="text-[10px] text-slate-400 mt-1">{new Date(app.created_at).toLocaleDateString()}</p>
                          </TableCell>
                          <TableCell className="font-medium text-indigo-700">{app.job_forms?.job_title}</TableCell>
                          <TableCell>
                            {app.match_score != null ? (
                              <div>
                                <span className={`text-xl font-black ${app.match_score >= 75 ? 'text-emerald-600' : app.match_score >= 50 ? 'text-amber-500' : 'text-red-500'}`}>{app.match_score}%</span>
                                <div className="text-[10px] font-bold uppercase mt-1">{app.ai_verdict}</div>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400 font-bold bg-slate-100 px-2 py-1 rounded">Pending Scan</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" className="text-indigo-600"><Eye className="w-4 h-4 mr-2"/> Review</Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {filteredApplications.length === 0 && !loading && (
                        <TableRow><TableCell colSpan={4} className="text-center p-12 text-slate-500">No applications match your search filters.</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="md:col-span-1">
            {selectedApp ? (
              <Card className="shadow-2xl border-indigo-100 bg-white sticky top-24">
                <CardHeader className="bg-indigo-600 text-white rounded-t-xl flex flex-row justify-between items-center">
                  <CardTitle className="text-lg">Candidate Dossier</CardTitle>
                  {selectedApp.match_score != null && (
                    <div className="bg-white/20 px-3 py-1 rounded-full text-sm font-black flex items-center gap-1"><Sparkles className="w-4 h-4"/> ATS: {selectedApp.match_score}%</div>
                  )}
                </CardHeader>
                <CardContent className="p-6 space-y-4 max-h-[600px] overflow-y-auto custom-scrollbar flex flex-col">
                  <div className="border-b pb-4">
                    <h3 className="text-xl font-black text-slate-800">{selectedApp.candidate_name}</h3>
                    <p className="text-sm text-indigo-600 font-bold">{selectedApp.candidate_email}</p>
                    <p className="text-xs text-slate-500 mt-2 flex items-center gap-1"><Calendar className="w-3 h-3"/> Applied: {new Date(selectedApp.created_at).toLocaleString()}</p>
                  </div>
                  
                  <div className="space-y-4 flex-1">
                    <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest">Submitted Data</h4>
                    {Object.entries(selectedApp.answers).map(([key, value]) => {
                      const strVal = String(value);
                      const isLink = strVal.startsWith('http');
                      return (
                        <div key={key} className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                          <p className="text-xs font-bold text-slate-600 capitalize mb-1">{key.replace(/_/g, ' ')}</p>
                          {isLink ? (
                            <a href={strVal} target="_blank" rel="noreferrer" className="text-sm font-bold text-blue-600 flex items-center gap-1 hover:underline"><ExternalLink className="w-3 h-3"/> View Document / Resume</a>
                          ) : (
                            <p className="text-sm text-slate-900 whitespace-pre-wrap">{strVal}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* INDIVIDUAL ATS SCANNER BUTTON */}
                  <div className="pt-4 border-t border-slate-100">
                    {selectedApp.match_score == null ? (
                      <Button 
                        onClick={() => runSingleATSScanner(selectedApp)} 
                        disabled={individualScanning === selectedApp.id || aiScanning}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-12"
                      >
                        {individualScanning === selectedApp.id ? <Loader2 className="w-5 h-5 animate-spin mr-2"/> : <BrainCircuit className="w-5 h-5 mr-2"/>}
                        Run Individual AI Analysis
                      </Button>
                    ) : (
                      <Button disabled className="w-full bg-slate-100 text-slate-400 font-bold h-12">
                        <CheckCircle2 className="w-5 h-5 mr-2"/> AI Analysis Complete
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="h-full flex items-center justify-center border-2 border-dashed border-slate-200 rounded-xl p-8 text-center bg-slate-50 text-slate-400 font-medium">
                Select a candidate from the table to view their full submission dossier and run individual ATS checks.
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}