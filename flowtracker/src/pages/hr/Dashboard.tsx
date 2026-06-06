import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { Loader2, Users, Wallet, AlertTriangle, UserCheck, Sparkles, TrendingDown, HeartPulse, DollarSign, Target } from "lucide-react";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { CareerPredictor } from "@/components/dashboard/CareerPredictor";

export default function HRDashboard() {
  const [stats, setStats] = useState({ totalEmployees: 0, openComplaints: 0, pendingLeaves: 0 });
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

    const { data: profs } = await supabase.from('profiles').select('*');
    const { count: cComp } = await supabase.from('complaints').select('*', { count: 'exact' }).eq('status', 'Open');
    const { count: cLeave } = await supabase.from('leaves').select('*', { count: 'exact' }).eq('status', 'Pending');
    
    if (profs) setEmployees(profs);
    setStats({ totalEmployees: profs?.length || 0, openComplaints: cComp || 0, pendingLeaves: cLeave || 0 });
    setLoading(false);
  };

  const callGemini = async (prompt: string) => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(prompt);
    return result.response.text();
  };

  // AI Feature 5: Flight Risk Predictor
  const analyzeFlightRisk = async () => {
    if (!selectedEmp) return;
    setAiLoading('flight');
    try {
      const emp = employees.find(e => e.id === selectedEmp);
      const { data: logs } = await supabase.from('work_logs').select('*').eq('user_id', emp.id).limit(10);
      const { data: leaves } = await supabase.from('leaves').select('*').eq('user_id', emp.id);
      
      const prompt = `Act as an HR Attrition AI. Analyze this employee: Role: ${emp.role}, Dept: ${emp.department}. Recent logs count: ${logs?.length}. Leaves requested: ${leaves?.length}. Predict their flight risk (Low/Medium/High) and give a 2-sentence retention strategy. No markdown.`;
      setFlightRiskScore(await callGemini(prompt));
    } catch (e) { setFlightRiskScore("Error analyzing data."); }
    setAiLoading(null);
  };

  // AI Feature 6: Org Sentiment Analyzer
  const analyzeSentiment = async () => {
    setAiLoading('sentiment');
    try {
      const { data: comps } = await supabase.from('complaints').select('title, description, severity').limit(20);
      const dump = JSON.stringify(comps);
      const prompt = `Act as an HR Morale AI. Read these recent company complaints: ${dump}. Calculate an overall Org Sentiment Score (1-100) and summarize the main cultural issues in 3 bullet points. No markdown.`;
      setOrgSentiment(await callGemini(prompt));
    } catch (e) { setOrgSentiment("Error analyzing data."); }
    setAiLoading(null);
  };

  // AI Feature 7: Compensation Benchmarker
  const benchmarkComp = async () => {
    if (!compRole) return;
    setAiLoading('comp');
    try {
      const prompt = `Act as a Global Compensation AI. Provide the current market salary range (in INR) for the role "${compRole}" in India for 2026. Give Low, Median, and High brackets, and 2 key skills driving top pay. No markdown.`;
      setCompResult(await callGemini(prompt));
    } catch (e) { setCompResult("Error fetching market data."); }
    setAiLoading(null);
  };

  // AI Feature 8: Smart Onboarding Plan
  const generateOnboarding = async () => {
    if (!onboardRole) return;
    setAiLoading('onboard');
    try {
      const prompt = `Act as an HR Enablement AI. Generate a concise Day 1 to Day 30 onboarding plan for a new "${onboardRole}". Include exactly 4 milestones. No markdown.`;
      setOnboardResult(await callGemini(prompt));
    } catch (e) { setOnboardResult("Error generating plan."); }
    setAiLoading(null);
  };

  return (
    <DashboardLayout role="hr">
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in pb-12">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h1 className="text-3xl font-bold text-slate-900">HR Command Center</h1>
          <p className="text-slate-500 mt-1">Core HRMS Management & AI Predictive Analytics</p>
        </div>

        {/* CORE HRMS KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="shadow-sm border-b-4 border-b-blue-500"><CardContent className="p-5">
            <p className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1"><Users className="w-3 h-3"/> Headcount</p>
            <h2 className="text-2xl font-black text-slate-800">{stats.totalEmployees}</h2>
          </CardContent></Card>
          <Card className="shadow-sm border-b-4 border-b-emerald-500"><CardContent className="p-5">
            <p className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1"><Wallet className="w-3 h-3"/> Est. Payroll</p>
            <h2 className="text-2xl font-black text-emerald-600">₹{(stats.totalEmployees * 65000 / 100000).toFixed(1)}L</h2>
          </CardContent></Card>
          <Card className="shadow-sm border-b-4 border-b-amber-500"><CardContent className="p-5">
            <p className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> Ethics Cases</p>
            <h2 className="text-2xl font-black text-amber-600">{stats.openComplaints}</h2>
          </CardContent></Card>
          <Card className="shadow-sm border-b-4 border-b-indigo-500"><CardContent className="p-5">
            <p className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1"><UserCheck className="w-3 h-3"/> Leaves Queue</p>
            <h2 className="text-2xl font-black text-indigo-600">{stats.pendingLeaves}</h2>
          </CardContent></Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* AI Feature 5 */}
          <Card className="shadow-sm bg-gradient-to-br from-red-50 to-white border-red-100">
            <CardHeader className="pb-3 border-b border-red-100/50">
              <CardTitle className="text-lg text-red-900 flex items-center gap-2"><TrendingDown className="w-5 h-5 text-red-600"/> AI Flight Risk Predictor</CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              <select className="w-full p-2 border rounded text-sm bg-white" value={selectedEmp} onChange={e=>setSelectedEmp(e.target.value)}>
                <option value="">Select Employee to Analyze...</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name} ({e.department})</option>)}
              </select>
              <Button onClick={analyzeFlightRisk} disabled={!selectedEmp || aiLoading === 'flight'} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold">
                {aiLoading === 'flight' ? <Loader2 className="w-4 h-4 animate-spin"/> : <Sparkles className="w-4 h-4 mr-2"/>} Predict Attrition Risk
              </Button>
              {flightRiskScore && <div className="p-3 bg-white border border-red-200 rounded text-sm text-slate-700">{flightRiskScore}</div>}
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
                {aiLoading === 'sentiment' ? <Loader2 className="w-4 h-4 animate-spin"/> : <Sparkles className="w-4 h-4 mr-2"/>} Scan Company Morale
              </Button>
              {orgSentiment && <div className="p-3 bg-white border border-purple-200 rounded text-sm text-slate-700 whitespace-pre-wrap">{orgSentiment}</div>}
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
                {aiLoading === 'comp' ? <Loader2 className="w-4 h-4 animate-spin"/> : <Sparkles className="w-4 h-4 mr-2"/>} Get Salary Bands
              </Button>
              {compResult && <div className="p-3 bg-emerald-50 border border-emerald-200 rounded text-sm text-slate-700 whitespace-pre-wrap">{compResult}</div>}
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
                {aiLoading === 'onboard' ? <Loader2 className="w-4 h-4 animate-spin"/> : <Sparkles className="w-4 h-4 mr-2"/>} Generate 30-Day Plan
              </Button>
              {onboardResult && <div className="p-3 bg-blue-50 border border-blue-200 rounded text-sm text-slate-700 whitespace-pre-wrap">{onboardResult}</div>}
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