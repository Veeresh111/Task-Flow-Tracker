import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { callCorporateAI } from "@/lib/ai";
import { Loader2, Users, Wallet, AlertTriangle, UserCheck, Sparkles, TrendingDown, HeartPulse, DollarSign, Target, Shield } from "lucide-react";
import { CareerPredictor } from "@/components/dashboard/CareerPredictor";

export default function HRDashboard() {
  useEffect(() => { document.title = "HR Dashboard - FWC"; }, []);
  const [stats, setStats] = useState({ totalEmployees: 0, openComplaints: 0, pendingLeaves: 0, candidatesInPipeline: 0, interviewsThisWeek: 0, pendingOffers: 0, newHiresThisMonth: 0, pendingApprovals: 0 });
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  // AI Feature States
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const [selectedEmp, setSelectedEmp] = useState("");
  const [flightRiskScore, setFlightRiskScore] = useState("");
  const [orgSentiment, setOrgSentiment] = useState("");
  const [compRole, setCompRole] = useState("");
  const [compResult, setCompResult] = useState("");
  const [onboardRole, setOnboardRole] = useState("");
  const [onboardResult, setOnboardResult] = useState("");

  useEffect(() => { fetchHRData(); }, []);

  const fetchHRData = async () => {
    setLoading(true);
    
    const { data: { user } } = await supabase.auth.getUser();
    if (user) setUserId(user.id);

    // UNIFIED METRICS: single RPC call ensures consistent counts across all dashboards
    const { data: unified } = await supabase.rpc('get_enterprise_metrics');
    const metrics = unified || {};

    const { data: profs } = await supabase.from('profiles').select('*, payroll_ctc, employment_status');
    
    if (profs) setEmployees(profs);
    setStats({
      totalEmployees: metrics.active_headcount ?? (profs || []).filter((p: any) => p.employment_status !== 'terminated').length,
      openComplaints: metrics.open_complaints ?? 0,
      pendingLeaves: metrics.pending_leaves ?? 0,
      candidatesInPipeline: 0,
      interviewsThisWeek: 0,
      pendingOffers: 0,
      newHiresThisMonth: 0
    });

    // Fetch recruitment pipeline stats
    const { data: allApps } = await supabase.from('job_applications').select('status');
    const pipelineStatuses = ['Applied', 'Screening', 'Shortlisted', 'ATS Shortlisted', 'Recruiter Screening', 'Assessment Assigned', 'Assessment Passed', 'Assessment Completed', 'Interview Scheduled', 'Interview Cleared'];
    const pipelineCount = (allApps || []).filter(a => pipelineStatuses.includes(a.status)).length;
    const offerCount = (allApps || []).filter(a => a.status === 'Offer Generated' || a.status === 'Offer Accepted').length;

    // Fetch pending user verifications (new registrations without applications)
    const { count: pendingVerifications } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending_activation');
    setStats(prev => ({ ...prev, pendingApprovals: pendingVerifications || 0 }));

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: weekSessions } = await supabase
      .from('interview_sessions')
      .select('id')
      .gte('scheduled_at', weekAgo);
    const interviewCount = weekSessions?.length || 0;

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const { data: monthHires } = await supabase
      .from('candidate_onboarding')
      .select('id')
      .gte('created_at', monthStart);
    const hiresCount = monthHires?.length || 0;

    const { count: pendingCount } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending_activation') as any;

    setStats(prev => ({
      ...prev,
      candidatesInPipeline: pipelineCount,
      interviewsThisWeek: interviewCount,
      pendingOffers: offerCount,
      newHiresThisMonth: hiresCount,
      pendingApprovals: pendingCount || 0
    }));
    setLoading(false);
  };



  // AI Feature 5: Flight Risk Predictor
  const analyzeFlightRisk = async () => {
    if (!selectedEmp) return;
    setAiLoading('flight');
    try {
      const emp = employees.find(e => e.id === selectedEmp);
      const { data: logs } = await supabase.from('work_logs').select('*').eq('user_id', emp.id).limit(10);
      const { data: leaves } = await supabase.from('leaves').select('*').eq('user_id', emp.id);
      
      const prompt = `Act as an HR Attrition AI. Analyze this employee: Role: ${emp.role}, Dept: ${emp.department}. Recent logs count: ${logs?.length}. Leaves requested: ${leaves?.length}. Predict their flight risk (Low/Medium/High) and give a 2-sentence retention strategy. Plain text only sentence by sentence. No markdown. No asterisks.`;
      setFlightRiskScore(await callCorporateAI({ prompt, systemInstruction: "You are an HR analytics AI specializing in attrition prediction." }));
    } catch (e) { setFlightRiskScore("Error analyzing system organizational data."); }
    setAiLoading(null);
  };

  // AI Feature 6: Org Sentiment Analyzer
  const analyzeSentiment = async () => {
    setAiLoading('sentiment');
    try {
      const { data: comps } = await supabase.from('complaints').select('title, description, severity').limit(20);
      const dump = JSON.stringify(comps);
      const prompt = `Act as an HR Morale AI. Read these recent company complaints: ${dump}. Calculate an overall Org Sentiment Score (1-100) and summarize the main cultural issues in 3 clean bullet points. Plain text sentence by sentence. No markdown. No asterisks.`;
      setOrgSentiment(await callCorporateAI({ prompt, systemInstruction: "You are an HR analytics AI specializing in organizational sentiment analysis." }));
    } catch (e) { setOrgSentiment("Error extracting cultural metrics."); }
    setAiLoading(null);
  };

  // AI Feature 7: Compensation Benchmarker
  const benchmarkComp = async () => {
    if (!compRole) return;
    setAiLoading('comp');
    try {
      const prompt = `Act as a Global Compensation AI. Provide the current market salary range (in INR) for the role "${compRole}" in India for 2026. Give Low, Median, and High brackets, and 2 key skills driving top pay. Plain text organized line by line. No markdown. No asterisks.`;
      setCompResult(await callCorporateAI({ prompt, systemInstruction: "You are an HR analytics AI specializing in compensation benchmarking." }));
    } catch (e) { setCompResult("Error fetching market financial data."); }
    setAiLoading(null);
  };

  // AI Feature 8: Smart Onboarding Plan
  const generateOnboarding = async () => {
    if (!onboardRole) return;
    setAiLoading('onboard');
    try {
      const prompt = `Act as an HR Enablement AI. Generate a concise Day 1 to Day 30 onboarding plan for a new "${onboardRole}". Include exactly 4 milestones. Plain text step by step. No markdown. No asterisks.`;
      setOnboardResult(await callCorporateAI({ prompt, systemInstruction: "You are an HR analytics AI specializing in employee onboarding." }));
    } catch (e) { setOnboardResult("Error generating strategic roadmap."); }
    setAiLoading(null);
  };

  return (
    <DashboardLayout role="hr">
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in pb-12">
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">HR Command Center</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Core HRMS Management & AI Predictive Analytics</p>
        </div>

        {/* CORE HRMS KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="shadow-sm border-b-4 border-b-blue-500 dark:bg-slate-800"><CardContent className="p-5">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase flex items-center gap-1"><Users className="w-3 h-3"/> Headcount</p>
            <h2 className="text-2xl font-black text-slate-800 dark:text-white">{stats.totalEmployees}</h2>
          </CardContent></Card>
          <Card className="shadow-sm border-b-4 border-b-emerald-500 dark:bg-slate-800"><CardContent className="p-5">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase flex items-center gap-1"><Wallet className="w-3 h-3"/> Est. Payroll</p>
            <h2 className="text-2xl font-black text-emerald-600">₹{(() => { let sum = 0; let missing = 0; employees.filter((e: any) => e.employment_status !== 'terminated').forEach((e: any) => { const sal = Number(e.payroll_ctc); if (sal > 0) { sum += sal; } else { missing++; } }); const display = (sum / 100000).toFixed(1) + 'L'; return display + (missing > 0 ? ` (${missing} unassigned)` : ''); })()}</h2>
          </CardContent></Card>
          <Card className="shadow-sm border-b-4 border-b-amber-500 dark:bg-slate-800"><CardContent className="p-5">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> Ethics Cases</p>
            <h2 className="text-2xl font-black text-amber-600">{stats.openComplaints}</h2>
          </CardContent></Card>
          <Card className="shadow-sm border-b-4 border-b-indigo-500 dark:bg-slate-800"><CardContent className="p-5">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase flex items-center gap-1"><UserCheck className="w-3 h-3"/> Leaves Queue</p>
            <h2 className="text-2xl font-black text-indigo-600">{stats.pendingLeaves}</h2>
          </CardContent></Card>
        </div>

        {/* USER VERIFICATION & PENDING APPROVALS */}
        {stats.pendingApprovals > 0 && (
          <a href="/hr/user-verification" className="block group">
            <Card className="shadow-sm border-l-4 border-l-indigo-500 bg-gradient-to-r from-indigo-50 to-white hover:from-indigo-100 hover:to-indigo-50 dark:from-indigo-950/30 dark:to-slate-900 dark:hover:from-indigo-900/40 dark:hover:to-slate-800 transition-all cursor-pointer">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-indigo-100 dark:bg-indigo-900/50 rounded-full group-hover:bg-indigo-200 dark:group-hover:bg-indigo-800/50 transition-colors">
                    <Shield className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div>
                    <p className="font-bold text-indigo-900 dark:text-indigo-200 text-sm">Pending User Verifications</p>
                    <p className="text-xs text-indigo-600/70 dark:text-indigo-400/70 mt-0.5">
                      {stats.pendingApprovals} user{stats.pendingApprovals !== 1 ? "s" : ""} need classification — click to verify
                    </p>
                  </div>
                </div>
                <Badge className="bg-indigo-600 text-white text-xs font-bold px-3 py-1.5 group-hover:bg-indigo-700 transition-colors">
                  {stats.pendingApprovals} Pending
                </Badge>
              </CardContent>
            </Card>
          </a>
        )}

        {/* RECRUITMENT PIPELINE METRICS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="shadow-sm border-b-4 border-b-cyan-500 dark:bg-slate-800"><CardContent className="p-5">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase flex items-center gap-1"><Users className="w-3 h-3"/> Pipeline Active</p>
            <h2 className="text-2xl font-black text-cyan-700 dark:text-cyan-400">{stats.candidatesInPipeline}</h2>
          </CardContent></Card>
          <Card className="shadow-sm border-b-4 border-b-violet-500 dark:bg-slate-800"><CardContent className="p-5">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase flex items-center gap-1"><UserCheck className="w-3 h-3"/> Interviews (Week)</p>
            <h2 className="text-2xl font-black text-violet-700 dark:text-violet-400">{stats.interviewsThisWeek}</h2>
          </CardContent></Card>
          <Card className="shadow-sm border-b-4 border-b-orange-500 dark:bg-slate-800"><CardContent className="p-5">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase flex items-center gap-1"><Target className="w-3 h-3"/> Pending Offers</p>
            <h2 className="text-2xl font-black text-orange-700 dark:text-orange-400">{stats.pendingOffers}</h2>
          </CardContent></Card>
          <Card className="shadow-sm border-b-4 border-b-emerald-500 dark:bg-slate-800"><CardContent className="p-5">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase flex items-center gap-1"><Sparkles className="w-3 h-3"/> New Hires (Month)</p>
            <h2 className="text-2xl font-black text-emerald-700 dark:text-emerald-400">{stats.newHiresThisMonth}</h2>
          </CardContent></Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* AI Feature 5 */}
          <Card className="shadow-sm bg-gradient-to-br from-red-50 to-white border-red-100">
            <CardHeader className="pb-3 border-b border-red-100/50">
              <ThemeRiskTitle />
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              <select className="w-full p-2 border rounded text-sm bg-white" value={selectedEmp} onChange={e=>setSelectedEmp(e.target.value)}>
                <option value="">Select Employee to Analyze...</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name} ({e.department})</option>)}
              </select>
              <Button onClick={analyzeFlightRisk} disabled={!selectedEmp || aiLoading === 'flight'} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold">
                {aiLoading === 'flight' ? <Loader2 className="w-4 h-4 animate-spin"/> : <Sparkles className="w-4 h-4 mr-2"/>} Predict Attrition Risk (AI Prediction)
              </Button>
              {flightRiskScore && <div className="p-3 bg-white border border-red-200 rounded text-sm text-slate-700 whitespace-pre-wrap"><span className="text-[10px] font-bold text-red-500 uppercase tracking-wider block mb-1">AI Prediction</span>{flightRiskScore}</div>}
            </CardContent>
          </Card>

          {/* AI Feature 6 */}
          <Card className="shadow-sm bg-gradient-to-br from-purple-50 to-white border-purple-100">
            <CardHeader className="pb-3 border-b border-purple-100/50">
              <CardTitle className="text-lg text-purple-900 flex items-center gap-2"><HeartPulse className="w-5 h-5 text-purple-600"/> AI Culture & Sentiment Tracker</CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-4 flex flex-col justify-between">
              <p className="text-sm text-slate-500">Scans all employee ethics complaints to calculate company morale.</p>
              <Button onClick={analyzeSentiment} disabled={aiLoading === 'sentiment'} className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold">
                {aiLoading === 'sentiment' ? <Loader2 className="w-4 h-4 animate-spin"/> : <Sparkles className="w-4 h-4 mr-2"/>} Scan Company Morale (AI Prediction)
              </Button>
              {orgSentiment && <div className="p-3 bg-white border border-purple-200 rounded text-sm text-slate-700 whitespace-pre-wrap"><span className="text-[10px] font-bold text-purple-500 uppercase tracking-wider block mb-1">AI Prediction</span>{orgSentiment}</div>}
            </CardContent>
          </Card>

          {/* AI Feature 7 */}
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="pb-3 border-b bg-slate-50/50">
              <CardTitle className="text-lg text-slate-800 flex items-center gap-2"><DollarSign className="w-5 h-5 text-emerald-600"/> AI Market Comp Benchmarker</CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              <Input placeholder="E.g., Senior React Developer" value={compRole} onChange={e=>setCompRole(e.target.value)} />
              <Button onClick={benchmarkComp} disabled={!compRole || aiLoading === 'comp'} className="w-full bg-emerald-600 text-white font-bold">
                {aiLoading === 'comp' ? <Loader2 className="w-4 h-4 animate-spin"/> : <Sparkles className="w-4 h-4 mr-2"/>} Get Salary Bands (AI Estimate)
              </Button>
              {compResult && <div className="p-3 bg-emerald-50 border border-emerald-200 rounded text-sm text-slate-700 whitespace-pre-wrap"><span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider block mb-1">AI Estimate (No Company Data)</span>{compResult}</div>}
            </CardContent>
          </Card>

          {/* AI Feature 8 */}
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="pb-3 border-b bg-slate-50/50">
              <CardTitle className="text-lg text-slate-800 flex items-center gap-2"><Target className="w-5 h-5 text-blue-600"/> Smart Onboarding Generator</CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              <Input placeholder="E.g., Marketing Manager" value={onboardRole} onChange={e=>setOnboardRole(e.target.value)} />
              <Button onClick={generateOnboarding} disabled={!onboardRole || aiLoading === 'onboard'} className="w-full bg-blue-600 text-white font-bold">
                {aiLoading === 'onboard' ? <Loader2 className="w-4 h-4 animate-spin"/> : <Sparkles className="w-4 h-4 mr-2"/>} Generate 30-Day Plan (AI-generated)
              </Button>
              {onboardResult && <div className="p-3 bg-blue-50 border border-blue-200 rounded text-sm text-slate-700 whitespace-pre-wrap"><span className="text-[10px] font-bold text-blue-500 uppercase tracking-wider block mb-1">AI-generated Plan</span>{onboardResult}</div>}
            </CardContent>
          </Card>
        </div>
        
        {userId && (
          <div className="mt-8 max-w-lg">
            <CareerPredictor userId={userId} />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function ThemeRiskTitle() {
  return (
    <CardTitle className="text-lg text-red-900 flex items-center gap-2">
      <TrendingDown className="w-5 h-5 text-red-600"/> AI Flight Risk Predictor
    </CardTitle>
  );
}