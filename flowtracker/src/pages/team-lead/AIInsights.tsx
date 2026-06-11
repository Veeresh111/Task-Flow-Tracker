import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { Loader2, DollarSign, Users, Clock, Sparkles, CheckSquare, BarChart3, CheckCircle2, AlertOctagon, Download } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";

export default function TeamLeadAIInsights() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<any>(null);
  const [aiSummary, setAiSummary] = useState<string>("");
  const [generatingAI, setGeneratingAI] = useState(false);

  const PIE_COLORS = ['#10b981', '#f59e0b', '#6366f1'];

  useEffect(() => {
    fetchTeamIntelligence();
  }, []);

  const fetchTeamIntelligence = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: tlProfile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (!tlProfile) return;

      const tlDept = tlProfile.department || '';

      const { data: allProfiles } = await supabase.from('profiles').select('id, name, team_lead_id, department, role, created_at');
      const teamMembers = (allProfiles || []).filter(p => 
        p.id !== user.id && 
        (p.team_lead_id === user.id || (p.department === tlDept && p.role?.toUpperCase() === 'EMPLOYEE'))
      );
      
      const teamIds = teamMembers.map(m => m.id);
      
      const daysInCompany = Math.floor((Date.now() - new Date(tlProfile.created_at).getTime()) / (1000 * 3600 * 24));

      const { data: tasks } = await supabase.from('tasks').select('*').in('assigned_to', [...teamIds, user.id]);
      const { data: logs } = await supabase.from('work_logs').select('*').in('user_id', [...teamIds, user.id]);

      const tlTasks = (tasks || []).filter(t => t.assigned_to === user.id);
      const tlCompleted = tlTasks.filter(t => t.status === 'Completed').length;
      const tlPending = tlTasks.filter(t => t.status === 'Pending').length;
      const tlProgress = tlTasks.length > 0 ? ((tlCompleted / tlTasks.length) * 100).toFixed(0) : 0;

      const teamTasks = (tasks || []).filter(t => t.assigned_to !== user.id);
      const teamCompleted = teamTasks.filter(t => t.status === 'Completed').length;
      const teamPending = teamTasks.filter(t => t.status === 'Pending').length;
      const teamInProgress = teamTasks.filter(t => t.status === 'In Progress').length;
      const teamProgress = teamTasks.length > 0 ? ((teamCompleted / teamTasks.length) * 100).toFixed(0) : 0;

      let totalTeamHours = 0;
      const memberPerformance = teamMembers.map(member => {
        const mTasks = teamTasks.filter(t => t.assigned_to === member.id);
        const mCompleted = mTasks.filter(t => t.status === 'Completed').length;
        
        let mHours = 0;
        const mLogs = (logs || []).filter(l => l.user_id === member.id);
        mLogs.forEach(l => {
          if (l.clock_in && l.clock_out) {
            mHours += (new Date(l.clock_out).getTime() - new Date(l.clock_in).getTime()) / 3600000;
          }
        });
        totalTeamHours += mHours;

        return {
          name: member.name.split(' ')[0],
          completedTasks: mCompleted,
          hoursLogged: Math.round(mHours)
        };
      });

      const teamPayroll = teamMembers.length * 65000; 
      const teamRevenue = teamPayroll * 1.8; 
      const teamProfit = teamRevenue - teamPayroll;

      const posAttrs: string[] = [];
      const negAttrs: string[] = [];

      if (Number(tlProgress) >= 80) posAttrs.push("Exceptional Personal Execution");
      if (Number(teamProgress) >= 75) posAttrs.push("High Team Velocity & Output");
      if (teamProfit > 0) posAttrs.push("Strong Profit Center Manager");
      if (teamPending <= teamCompleted && teamTasks.length > 0) posAttrs.push("Healthy Pipeline Management");
      if (totalTeamHours > (teamMembers.length * 40)) posAttrs.push("High Team Dedication/Engagement");
      if (daysInCompany > 365) posAttrs.push("Veteran Corporate Loyalty");
      if (tlPending === 0 && tlTasks.length > 0) posAttrs.push("Zero Personal Task Backlog");
      
      if (Number(tlProgress) < 40 && tlTasks.length > 0) negAttrs.push("Personal Task Bottleneck");
      if (Number(teamProgress) < 50 && teamTasks.length > 0) negAttrs.push("Severe Team Productivity Lag");
      if (teamPending > teamCompleted) negAttrs.push("Critical Task Backlog Risk");
      if (teamInProgress > teamCompleted * 2) negAttrs.push("Team Context-Switching Overload");
      if (teamProfit <= 0) negAttrs.push("Negative ROI / Cost Center Warning");
      if (totalTeamHours < (teamMembers.length * 10) && teamTasks.length > 5) negAttrs.push("Low System Compliance (Ghosting)");

      setMetrics({
        tl: { daysInCompany, progress: tlProgress, completed: tlCompleted, total: tlTasks.length },
        team: { 
          headcount: teamMembers.length, 
          progress: teamProgress, 
          profit: teamProfit,
          taskDistribution: [
            { name: 'Completed', value: teamCompleted },
            { name: 'Pending', value: teamPending },
            { name: 'In Progress', value: teamInProgress }
          ],
          memberPerformance
        },
        attributes: { positive: posAttrs, negative: negAttrs }
      });
    } catch (error) {
      console.error(error);
    }
    setLoading(false);
  };

  // === UPGRADED: SECURE HUGGING FACE ROUTER WITH QWEN 3 PIPELINE ===
  const generateAISummary = async () => {
    if (!metrics) return;
    setGeneratingAI(true);
    try {
      const HF_TOKEN = import.meta.env.VITE_HF_TOKEN || "[REDACTED]";
      
      const prompt = `Act as an elite AI Leadership Coach. Review this Team Lead's metrics: 
      TL Progress: ${metrics.tl.progress}% | Team Progress: ${metrics.team.progress}%.
      Team Profit: INR ${metrics.team.profit}.
      Positive Traits: ${metrics.attributes.positive.join(', ')}.
      Risk Factors: ${metrics.attributes.negative.join(', ')}.
      
      Write a highly professional, 2-paragraph analysis evaluating their leadership efficiency, output, and give actionable management advice based on their specific positive/negative traits. Do not use markdown.`;

      const response = await fetch("https://router.huggingface.co/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${HF_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "Qwen/Qwen3-32B:groq", 
          messages: [
            { role: "user", content: prompt }
          ]
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || "Failed to reach Hugging Face endpoint.");
      }

      const aiResponseText = data.choices[0].message.content;
      setAiSummary(aiResponseText);
    } catch (err: any) {
      console.error("AI Generation Failure:", err);
      toast({ 
        title: "AI Engine Server Error", 
        description: err.message || "Failed to generate leadership data summary via Qwen 3.", 
        variant: "destructive" 
      });
    }
    setGeneratingAI(false);
  };

  const exportReport = () => {
    let csvContent = `data:text/csv;charset=utf-8,TEAM LEAD INTELLIGENCE REPORT\n\n`;
    csvContent += `METRIC,VALUE\n`;
    csvContent += `Days In Company,${metrics.tl.daysInCompany}\n`;
    csvContent += `Personal Progress,${metrics.tl.progress}%\n`;
    csvContent += `Team Headcount,${metrics.team.headcount}\n`;
    csvContent += `Team Progress,${metrics.team.progress}%\n`;
    csvContent += `Est. Team Profit,INR ${metrics.team.profit}\n\n`;
    
    csvContent += `POSITIVE LEADERSHIP ATTRIBUTES\n`;
    metrics.attributes.positive.forEach((attr: string) => csvContent += `"${attr}"\n`);
    
    csvContent += `\nNEGATIVE RISK FACTORS\n`;
    metrics.attributes.negative.forEach((attr: string) => csvContent += `"${attr}"\n`);

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `TeamLead_AI_Insights.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading || !metrics) {
    return <DashboardLayout role="team_lead"><div className="flex justify-center p-32"><Loader2 className="w-12 h-12 animate-spin text-amber-600" /></div></DashboardLayout>;
  }

  return (
    <DashboardLayout role="team_lead">
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in pb-12">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <Sparkles className="w-8 h-8 text-amber-600" /> Leadership AI Insights
            </h1>
            <p className="text-slate-500 mt-1">Deep analytics on your team's output, positive/negative attributes, and profit.</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={generateAISummary} disabled={generatingAI} className="bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-sm">
              {generatingAI ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />} 
              Generate Leadership Summary
            </Button>
            <Button onClick={exportReport} variant="outline" className="text-slate-700 font-bold border-slate-300 shadow-sm">
              <Download className="w-4 h-4 mr-2"/> Download Report
            </Button>
          </div>
        </div>

        {aiSummary && (
          <Card className="bg-amber-50 border border-amber-100 shadow-sm">
            <CardContent className="p-6">
              <h3 className="text-amber-800 font-black flex items-center gap-2 mb-2"><Sparkles className="w-5 h-5"/> Qwen 3 Leadership Evaluation</h3>
              <p className="text-amber-900 leading-relaxed font-medium text-sm whitespace-pre-wrap">{aiSummary}</p>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="shadow-sm border-slate-200">
            <CardContent className="p-5">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1"><Clock className="w-3 h-3"/> Total Days in Company</p>
              <h2 className="text-2xl font-black text-slate-800">{metrics.tl.daysInCompany} Days</h2>
            </CardContent>
          </Card>
          
          <Card className="shadow-sm border-slate-200">
            <CardContent className="p-5">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1"><CheckSquare className="w-3 h-3"/> Personal Progress</p>
              <h2 className="text-2xl font-black text-indigo-600">{metrics.tl.progress}%</h2>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-slate-200">
            <CardContent className="p-5">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1"><Users className="w-3 h-3"/> Team Headcount & Output</p>
              <h2 className="text-2xl font-black text-blue-600">{metrics.team.headcount} / {metrics.team.progress}%</h2>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-slate-200">
            <CardContent className="p-5">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1"><DollarSign className="w-3 h-3"/> Est. Team Profit Gen.</p>
              <h2 className="text-2xl font-black text-emerald-600">₹{(metrics.team.profit / 1000).toFixed(1)}K</h2>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="shadow-sm border-emerald-200 bg-emerald-50/30">
            <CardHeader className="border-b border-emerald-100 pb-3">
              <CardTitle className="text-emerald-800 text-sm flex items-center gap-2 uppercase tracking-wider font-black">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" /> Positive Leadership Strengths
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-2">
              {metrics.attributes.positive.length > 0 ? metrics.attributes.positive.map((attr: string, i: number) => (
                <div key={i} className="flex items-center gap-2 text-sm font-bold text-emerald-900 bg-emerald-100/50 p-2 rounded">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" /> {attr}
                </div>
              )) : <p className="text-sm text-emerald-600/70 italic">Gathering more data to ascertain strengths.</p>}
            </CardContent>
          </Card>

          <Card className="shadow-sm border-red-200 bg-red-50/30">
            <CardHeader className="border-b border-red-100 pb-3">
              <CardTitle className="text-red-800 text-sm flex items-center gap-2 uppercase tracking-wider font-black">
                <AlertOctagon className="w-5 h-5 text-red-600" /> Critical Risk Factors
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-2">
              {metrics.attributes.negative.length > 0 ? metrics.attributes.negative.map((attr: string, i: number) => (
                <div key={i} className="flex items-center gap-2 text-sm font-bold text-red-900 bg-red-100/50 p-2 rounded">
                  <AlertOctagon className="w-4 h-4 text-red-600" /> {attr}
                </div>
              )) : <p className="text-sm text-emerald-600 font-bold flex items-center gap-1"><CheckCircle2 className="w-4 h-4"/> Zero critical risks detected.</p>}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="border-b bg-slate-50/50">
              <CardTitle className="text-lg text-slate-800 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-indigo-600" /> Team Member Productivity
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.team.memberPerformance} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#64748b'}} />
                  <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#64748b'}} />
                  <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#64748b'}} />
                  <RechartsTooltip cursor={{fill: '#f8fafc'}} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                  <Bar yAxisId="left" dataKey="completedTasks" name="Tasks Completed" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={25} />
                  <Bar yAxisId="right" dataKey="hoursLogged" name="Hours Logged" fill="#94a3b8" radius={[4, 4, 0, 0]} barSize={25} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-slate-200">
            <CardHeader className="border-b bg-slate-50/50">
              <CardTitle className="text-lg text-slate-800 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-emerald-600" /> Team Task Distribution
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={metrics.team.taskDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                  >
                    {metrics.team.taskDistribution.map((_entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: '12px', fontWeight: '500', color: '#475569' }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}