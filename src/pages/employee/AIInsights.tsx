import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Clock, Sparkles, CheckSquare, TrendingUp, Star, Download, CheckCircle2, AlertOctagon } from "lucide-react";
import { PieChart, Pie, Cell, Legend, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";

export default function EmployeeAIInsights() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<any>(null);
  const [aiSummary, setAiSummary] = useState<string>("");
  const [generatingAI, setGeneratingAI] = useState(false);

  const PIE_COLORS = ['#10b981', '#f59e0b', '#ef4444'];

  useEffect(() => {
    fetchEmployeeIntelligence();
  }, []);

  const fetchEmployeeIntelligence = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (!profile) return;

      const daysInCompany = Math.floor((Date.now() - new Date(profile.created_at).getTime()) / (1000 * 3600 * 24));
      const yearsInCompany = (daysInCompany / 365).toFixed(1);

      const { data: tasks } = await supabase.from('tasks').select('*').eq('assigned_to', user.id);
      const { data: logs } = await supabase.from('work_logs').select('*').eq('user_id', user.id);

      const completed = (tasks || []).filter(t => t.status === 'Completed').length;
      const pending = (tasks || []).filter(t => t.status === 'Pending').length;
      const inProgress = (tasks || []).filter(t => t.status === 'In Progress').length;
      const total = tasks?.length || 0;
      const progress = total > 0 ? ((completed / total) * 100).toFixed(0) : 0;

      let totalHours = 0;
      (logs || []).forEach(l => {
        if (l.clock_in && l.clock_out) {
          totalHours += (new Date(l.clock_out).getTime() - new Date(l.clock_in).getTime()) / 3600000;
        }
      });

      const velocity = totalHours > 0 ? (completed / totalHours) : 0;

      let aiRating = 3.0;
      if (total > 0 && totalHours > 0) {
        const completionRate = completed / total;
        const rawScore = (completionRate * 3) + (Math.min(velocity, 0.5) * 4); 
        aiRating = Math.max(1.0, Math.min(rawScore, 5.0)); 
      } else if (total > 0 && totalHours === 0) {
        aiRating = 2.0; 
      }

      const posAttrs: string[] = [];
      const negAttrs: string[] = [];

      if (aiRating >= 4.0) posAttrs.push("Top Tier Corporate Performer");
      if (Number(progress) >= 80) posAttrs.push("High Task Resolution Rate");
      if (totalHours > 160) posAttrs.push("Exceptional Dedication & Output");
      if (velocity >= 0.5) posAttrs.push("Hyper-Fast Execution Velocity");
      if (pending === 0 && total > 0) posAttrs.push("Inbox Zero / Reliable Output");
      if (daysInCompany > 365) posAttrs.push("Consistent Long-Term Loyalty");
      if (completed > 10) posAttrs.push("Proven Track Record");

      if (aiRating < 3.0) negAttrs.push("Needs Improvement Indicator");
      if (Number(progress) < 40 && total > 0) negAttrs.push("Severe Completion Lag");
      if (pending > completed) negAttrs.push("High Procrastination Risk");
      if (inProgress > completed * 2) negAttrs.push("Task Overload / Burnout Warning");
      if (totalHours < 40 && total > 5) negAttrs.push("Low System Engagement / Ghosting");
      if (velocity > 0 && velocity < 0.1) negAttrs.push("Extremely Slow Execution Velocity");

      setMetrics({
        daysInCompany,
        yearsInCompany,
        progress,
        completed,
        total,
        totalHours: Math.round(totalHours),
        aiRating: aiRating.toFixed(1),
        velocity: velocity.toFixed(2),
        taskDistribution: [
          { name: 'Completed', value: completed },
          { name: 'In Progress', value: inProgress },
          { name: 'Pending', value: pending }
        ],
        attributes: { positive: posAttrs, negative: negAttrs }
      });
    } catch (error) {
      console.error(error);
    }
    setLoading(false);
  };

  // === MUTATED AI PIPELINE LINK: HUGGING FACE ROUTER WITH QWEN 3 ===
  const generateAISummary = async () => {
    if (!metrics) return;
    setGeneratingAI(true);
    try {
      const HF_TOKEN = import.meta.env.VITE_HF_TOKEN || "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";
      
      const prompt = `Act as an elite Corporate Career Coach. Review this employee's metrics: 
      Progress: ${metrics.progress}% | Rating: ${metrics.aiRating}/5.0 | Velocity: ${metrics.velocity}.
      Positive Traits: ${metrics.attributes.positive.join(', ')}.
      Risk Factors: ${metrics.attributes.negative.join(', ')}.
      
      Write a highly professional, 2-paragraph analysis evaluating their personal efficiency, dedication, and provide actionable career advancement advice based on their positive/negative traits. Do not use markdown.`;

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
        title: "AI Engine Error", 
        description: err.message || "Could not generate career evaluation via Qwen 3.", 
        variant: "destructive" 
      });
    }
    setGeneratingAI(false);
  };

  const exportReport = () => {
    let csvContent = `data:text/csv;charset=utf-8,EMPLOYEE INTELLIGENCE REPORT\n\n`;
    csvContent += `METRIC,VALUE\n`;
    csvContent += `Days In Company,${metrics.daysInCompany}\n`;
    csvContent += `Overall Progress,${metrics.progress}%\n`;
    csvContent += `Total Logged Hours,${metrics.totalHours}\n`;
    csvContent += `Task Velocity,${metrics.velocity} tasks/hr\n`;
    csvContent += `AI Performance Rating,${metrics.aiRating} / 5.0\n\n`;
    
    csvContent += `POSITIVE CAREER ATTRIBUTES\n`;
    metrics.attributes.positive.forEach((attr: string) => csvContent += `"${attr}"\n`);
    
    csvContent += `\nCRITICAL RISK FACTORS\n`;
    metrics.attributes.negative.forEach((attr: string) => csvContent += `"${attr}"\n`);

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `My_AI_Performance_Report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading || !metrics) {
    return <DashboardLayout role="employee"><div className="flex justify-center p-32"><Loader2 className="w-12 h-12 animate-spin text-blue-600" /></div></DashboardLayout>;
  }

  return (
    <DashboardLayout role="employee">
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in pb-12">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <Sparkles className="w-8 h-8 text-blue-600" /> Personal AI Analytics
            </h1>
            <p className="text-slate-500 mt-1">Deep analytics on your personal velocity, positive/negative attributes, and AI rating.</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={generateAISummary} disabled={generatingAI} className="bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-sm">
              {generatingAI ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />} 
              Generate Career Evaluation
            </Button>
            <Button onClick={exportReport} variant="outline" className="text-slate-700 font-bold border-slate-300 shadow-sm">
              <Download className="w-4 h-4 mr-2"/> Download Report
            </Button>
          </div>
        </div>

        {aiSummary && (
          <Card className="bg-blue-50 border border-blue-100 shadow-sm">
            <CardContent className="p-6">
              <h3 className="text-blue-800 font-black flex items-center gap-2 mb-2"><Sparkles className="w-5 h-5"/> Qwen 3 AI Career Evaluation</h3>
              <p className="text-blue-900 leading-relaxed font-medium text-sm whitespace-pre-wrap">{aiSummary}</p>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="shadow-sm border-slate-200 border-b-4 border-b-slate-400">
            <CardContent className="p-5">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1"><Clock className="w-3 h-3"/> Total Days in Company</p>
              <div className="flex items-end justify-between">
                <h2 className="text-2xl font-black text-slate-800">{metrics.daysInCompany}</h2>
                <span className="text-xs font-bold text-slate-400">{metrics.yearsInCompany} Years</span>
              </div>
            </CardContent>
          </Card>
          
          <Card className="shadow-sm border-slate-200 border-b-4 border-b-emerald-500">
            <CardContent className="p-5">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1"><CheckSquare className="w-3 h-3"/> My Task Progress</p>
              <div className="flex items-end justify-between">
                <h2 className="text-2xl font-black text-emerald-600">{metrics.progress}%</h2>
                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">{metrics.completed}/{metrics.total} Done</span>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-slate-200 border-b-4 border-b-indigo-500">
            <CardContent className="p-5">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1"><TrendingUp className="w-3 h-3"/> Work Velocity</p>
              <div className="flex items-end justify-between">
                <h2 className="text-2xl font-black text-indigo-600">{metrics.velocity}</h2>
                <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">Tasks / Hr</span>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-slate-200 border-b-4 border-b-amber-500">
            <CardContent className="p-5">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1"><Star className="w-3 h-3"/> AI Performance Rating</p>
              <h2 className="text-2xl font-black text-amber-600">⭐ {metrics.aiRating} <span className="text-sm text-slate-400">/ 5.0</span></h2>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
          <Card className="shadow-sm border-emerald-200 bg-emerald-50/30">
            <CardHeader className="border-b border-emerald-100 pb-3">
              <CardTitle className="text-emerald-800 text-sm flex items-center gap-2 uppercase tracking-wider font-black">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" /> Positive Career Strengths
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-2">
              {metrics.attributes.positive.length > 0 ? metrics.attributes.positive.map((attr: string, i: number) => (
                <div key={i} className="flex items-center gap-2 text-sm font-bold text-emerald-900 bg-emerald-100/50 p-2 rounded">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" /> {attr}
                </div>
              )) : <p className="text-sm text-emerald-600/70 italic">Engage more with the system to build positive metrics.</p>}
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
                <Sparkles className="w-5 h-5 text-emerald-600" /> Personal Task Distribution
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 h-[320px]">
              {metrics.total === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-400 font-medium">No tasks assigned yet.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={metrics.taskDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={3}
                      dataKey="value"
                      stroke="none"
                    >
                      {metrics.taskDistribution.map((_entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: '12px', fontWeight: '500', color: '#475569' }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm border-slate-200 bg-gradient-to-br from-slate-900 to-indigo-900 text-white">
            <CardContent className="p-8 flex flex-col justify-center h-full">
              <Sparkles className="w-12 h-12 text-indigo-400 mb-6 opacity-80" />
              <h3 className="text-2xl font-black mb-2">Total Hours Logged</h3>
              <p className="text-5xl font-black text-indigo-200 mb-4">{metrics.totalHours} <span className="text-xl text-indigo-300 font-medium">Hrs</span></p>
              <p className="text-indigo-200/80 text-sm leading-relaxed">
                Your total accumulated time actively working and tracking productivity within the FWC ecosystem. High hours combined with high velocity yields top AI ratings.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}