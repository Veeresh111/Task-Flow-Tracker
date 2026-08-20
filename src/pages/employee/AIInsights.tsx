import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { callFreeHFModel } from "@/lib/ai-models";
import { TelemetryEngine, EmployeeTelemetryMetrics } from "@/lib/telemetry";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Clock,
  Sparkles,
  CheckSquare,
  TrendingUp,
  Star,
  Download,
  CheckCircle2,
  AlertOctagon,
  HeartPulse,
  Flame,
  Zap,
  ShieldCheck,
  Target
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip as RechartsTooltip
} from "recharts";

export default function EmployeeAIInsights() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [telemetry, setTelemetry] = useState<EmployeeTelemetryMetrics | null>(null);
  const [daysInCompany, setDaysInCompany] = useState(0);
  const [yearsInCompany, setYearsInCompany] = useState("0.0");
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

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (!profile) return;

      const days = Math.floor((Date.now() - new Date(profile.created_at).getTime()) / (1000 * 3600 * 24));
      setDaysInCompany(days);
      setYearsInCompany((days / 365).toFixed(1));

      const { data: tasks } = await supabase
        .from('tasks')
        .select('*')
        .eq('assigned_to', user.id);

      const { data: logs } = await supabase
        .from('work_logs')
        .select('*')
        .eq('user_id', user.id);

      const metrics = TelemetryEngine.computeEmployeeMetrics(
        user.id,
        tasks || [],
        logs || [],
        profile.created_at
      );

      setTelemetry(metrics);
    } catch (error) {
      console.error("Telemetry load error:", error);
    } finally {
      setLoading(false);
    }
  };

  const generateAISummary = async () => {
    if (!telemetry) return;
    setGeneratingAI(true);
    try {
      const prompt = `Act as an elite Senior Corporate Career Coach & Engineering Director. Review this employee's telemetry:
Work Style Archetype: ${telemetry.workStyleArchetype}
Completion Rate: ${telemetry.completionRate}% (${telemetry.completedTasks}/${telemetry.totalTasks} tasks)
Task Velocity: ${telemetry.taskVelocity} tasks/hour
Total Logged Hours: ${telemetry.totalClockedHours} hours
Focus Ratio: ${Math.round(telemetry.focusRatio * 100)}%
Burnout Risk Index: ${telemetry.burnoutRiskIndex}%
Performance Rating: ${telemetry.performanceScore} / 5.0
Positive Strengths: ${telemetry.positiveAttributes.join(', ')}
Critical Risks: ${telemetry.riskFactors.length > 0 ? telemetry.riskFactors.join(', ') : 'None'}

Write an inspiring, highly professional, 2-paragraph analysis evaluating their personal efficiency, work style archetype, and providing 3 actionable steps for accelerated career advancement. Do not use markdown backticks.`;

      const aiResponseText = await callFreeHFModel({
        modelDomain: 'EMPLOYEE_TELEMETRY',
        prompt,
        maxTokens: 600
      });

      setAiSummary(aiResponseText);
      toast({
        title: "Career Analysis Generated",
        description: "AI evaluated your work style telemetry via Llama 3.2 3B."
      });
    } catch (err: any) {
      console.error("AI Generation Failure:", err);
      toast({
        title: "AI Engine Error",
        description: err.message || "Could not generate career evaluation.",
        variant: "destructive"
      });
    } finally {
      setGeneratingAI(false);
    }
  };

  const exportReport = () => {
    if (!telemetry) return;
    let csvContent = `data:text/csv;charset=utf-8,EMPLOYEE WORK STYLE & EFFICIENCY REPORT\n\n`;
    csvContent += `METRIC,VALUE\n`;
    csvContent += `Days In Company,${daysInCompany}\n`;
    csvContent += `Work Style Archetype,"${telemetry.workStyleArchetype}"\n`;
    csvContent += `Completion Rate,${telemetry.completionRate}%\n`;
    csvContent += `Total Logged Hours,${telemetry.totalClockedHours}\n`;
    csvContent += `Task Velocity,${telemetry.taskVelocity} tasks/hr\n`;
    csvContent += `Focus Ratio,${Math.round(telemetry.focusRatio * 100)}%\n`;
    csvContent += `Burnout Risk Index,${telemetry.burnoutRiskIndex}%\n`;
    csvContent += `Performance Score,${telemetry.performanceScore} / 5.0\n\n`;

    csvContent += `POSITIVE STRENGTHS\n`;
    telemetry.positiveAttributes.forEach((attr: string) => (csvContent += `"${attr}"\n`));

    csvContent += `\nRISK FACTORS\n`;
    telemetry.riskFactors.forEach((attr: string) => (csvContent += `"${attr}"\n`));

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `My_WorkStyle_Telemetry_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const taskDistribution = telemetry
    ? [
        { name: 'Completed', value: telemetry.completedTasks },
        { name: 'In Progress', value: telemetry.inProgressTasks },
        { name: 'Pending', value: telemetry.pendingTasks }
      ]
    : [];

  if (loading || !telemetry) {
    return (
      <DashboardLayout role="employee">
        <div className="flex justify-center p-32">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="employee">
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in pb-12">
        {/* Header Hero */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 rounded-2xl text-white shadow-xl">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-7 h-7 text-indigo-400" />
              <h1 className="text-2xl font-black tracking-tight text-white">
                Personal Work Style & Telemetry Insights
              </h1>
              <Badge className="bg-indigo-500/20 text-indigo-300 border-indigo-500/40 text-[10px] font-mono">
                ● LLAMA 3.2 TELEMETRY
              </Badge>
            </div>
            <p className="text-xs text-indigo-200/80 font-medium">
              Real-time analysis of execution velocity, focus continuity, burnout risk, and performance rating
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={generateAISummary}
              disabled={generatingAI}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md"
            >
              {generatingAI ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Zap className="w-4 h-4 mr-2" />
              )}
              Generate AI Career Plan
            </Button>
            <Button
              onClick={exportReport}
              variant="outline"
              className="text-white border-white/20 hover:bg-white/10 font-bold text-xs"
            >
              <Download className="w-4 h-4 mr-2" /> Export CSV
            </Button>
          </div>
        </div>

        {/* AI Career Coach Output Card */}
        {aiSummary && (
          <Card className="bg-indigo-50/80 border border-indigo-200 shadow-md rounded-2xl overflow-hidden animate-fade-in">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-indigo-900 font-black flex items-center gap-2 text-sm">
                  <Sparkles className="w-5 h-5 text-indigo-600" /> Llama 3.2 AI Career Coach Evaluation
                </h3>
                <Badge variant="outline" className="bg-indigo-100 border-indigo-300 text-indigo-800 text-[10px] font-mono">
                  {telemetry.workStyleArchetype}
                </Badge>
              </div>
              <p className="text-indigo-950 leading-relaxed font-medium text-xs whitespace-pre-wrap">
                {aiSummary}
              </p>
            </CardContent>
          </Card>
        )}

        {/* KPI Metrics Matrix */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="shadow-xs border-slate-200 border-b-4 border-b-slate-400 bg-white">
            <CardContent className="p-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" /> Tenure
              </p>
              <div className="flex items-end justify-between">
                <h2 className="text-2xl font-black text-slate-900">{daysInCompany}</h2>
                <span className="text-xs font-bold text-slate-400">{yearsInCompany} Years</span>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-xs border-slate-200 border-b-4 border-b-emerald-500 bg-white">
            <CardContent className="p-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                <CheckSquare className="w-3.5 h-3.5 text-emerald-500" /> Task Completion
              </p>
              <div className="flex items-end justify-between">
                <h2 className="text-2xl font-black text-emerald-600">{telemetry.completionRate}%</h2>
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                  {telemetry.completedTasks}/{telemetry.totalTasks} Done
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-xs border-slate-200 border-b-4 border-b-indigo-500 bg-white">
            <CardContent className="p-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5 text-indigo-500" /> Task Velocity
              </p>
              <div className="flex items-end justify-between">
                <h2 className="text-2xl font-black text-indigo-600">{telemetry.taskVelocity}</h2>
                <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                  Tasks / Hr
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-xs border-slate-200 border-b-4 border-b-amber-500 bg-white">
            <CardContent className="p-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Star className="w-3.5 h-3.5 text-amber-500" /> Performance Rating
              </p>
              <h2 className="text-2xl font-black text-amber-600">
                ⭐ {telemetry.performanceScore} <span className="text-xs text-slate-400 font-normal">/ 5.0</span>
              </h2>
            </CardContent>
          </Card>
        </div>

        {/* Work Style Archetype & Burnout Risk Banner */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-slate-200 bg-white shadow-xs md:col-span-2">
            <CardHeader className="p-4 border-b bg-slate-50/50 flex flex-row items-center justify-between">
              <CardTitle className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Target className="w-4 h-4 text-indigo-600" /> Work Style Archetype Classification
              </CardTitle>
              <Badge className="bg-indigo-600 text-white font-bold text-[10px]">
                {telemetry.workStyleArchetype}
              </Badge>
            </CardHeader>
            <CardContent className="p-5 space-y-3">
              <p className="text-xs text-slate-600 leading-relaxed font-medium">
                Your activity telemetry across logged hours ({telemetry.totalClockedHours}h) and task resolution velocity ({telemetry.taskVelocity} tasks/hr) places you in the <strong className="text-indigo-900">{telemetry.workStyleArchetype}</strong> profile.
              </p>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Active Focus Ratio</span>
                  <p className="text-lg font-black text-indigo-600 mt-0.5">{Math.round(telemetry.focusRatio * 100)}%</p>
                  <p className="text-[9px] text-slate-400">Ratio of productive task execution time</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Shift Continuity</span>
                  <p className="text-lg font-black text-emerald-600 mt-0.5">High Stability</p>
                  <p className="text-[9px] text-slate-400">Regular clock-in/out attendance pattern</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Burnout Risk Gauge */}
          <Card className="border-slate-200 bg-white shadow-xs">
            <CardHeader className="p-4 border-b bg-slate-50/50">
              <CardTitle className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-amber-500" /> Burnout Risk Index
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 flex flex-col items-center justify-center text-center">
              <div className={`w-20 h-20 rounded-full flex items-center justify-center border-4 ${
                telemetry.burnoutRiskIndex >= 70 ? 'border-red-500 bg-red-50 text-red-600' :
                telemetry.burnoutRiskIndex >= 40 ? 'border-amber-500 bg-amber-50 text-amber-600' :
                'border-emerald-500 bg-emerald-50 text-emerald-600'
              }`}>
                <span className="text-2xl font-black">{telemetry.burnoutRiskIndex}%</span>
              </div>
              <p className="text-xs font-bold text-slate-800 mt-3">
                {telemetry.burnoutRiskIndex >= 70 ? 'High Burnout Alert' :
                 telemetry.burnoutRiskIndex >= 40 ? 'Moderate Workload' : 'Optimal Work-Life Balance'}
              </p>
              <p className="text-[10px] text-slate-400 mt-1 max-w-[200px]">
                {telemetry.burnoutRiskIndex >= 70
                  ? 'Overtime and pending backlog require workload redistribution.'
                  : 'Workload parameters are within sustainable enterprise thresholds.'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Strengths & Risk Factors */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="shadow-xs border-emerald-200 bg-emerald-50/30">
            <CardHeader className="border-b border-emerald-100 pb-3">
              <CardTitle className="text-emerald-900 text-xs flex items-center gap-2 uppercase tracking-wider font-black">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Positive Career Strengths
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-2">
              {telemetry.positiveAttributes.length > 0 ? (
                telemetry.positiveAttributes.map((attr: string, i: number) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-xs font-bold text-emerald-900 bg-emerald-100/60 p-2.5 rounded-lg"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> {attr}
                  </div>
                ))
              ) : (
                <p className="text-xs text-emerald-700/70 italic">
                  Engage more with the platform to build verified positive telemetry.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-xs border-red-200 bg-red-50/30">
            <CardHeader className="border-b border-red-100 pb-3">
              <CardTitle className="text-red-900 text-xs flex items-center gap-2 uppercase tracking-wider font-black">
                <AlertOctagon className="w-4 h-4 text-red-600" /> Risk Factors & Improvement Areas
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-2">
              {telemetry.riskFactors.length > 0 ? (
                telemetry.riskFactors.map((attr: string, i: number) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-xs font-bold text-red-900 bg-red-100/60 p-2.5 rounded-lg"
                  >
                    <AlertOctagon className="w-3.5 h-3.5 text-red-600 shrink-0" /> {attr}
                  </div>
                ))
              ) : (
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 bg-emerald-100/60 p-2.5 rounded-lg">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Zero critical risks detected in current telemetry window.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Task Distribution & Total Time */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="shadow-xs border-slate-200 bg-white">
            <CardHeader className="border-b bg-slate-50/50">
              <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-600" /> Personal Task Status Distribution
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 h-[280px]">
              {telemetry.totalTasks === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                  No sprint tasks assigned yet.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={taskDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={3}
                      dataKey="value"
                      stroke="none"
                    >
                      {taskDistribution.map((_entry, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip />
                    <Legend layout="vertical" verticalAlign="middle" align="right" />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-xs border-slate-200 bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-2xl">
            <CardContent className="p-8 flex flex-col justify-center h-full">
              <HeartPulse className="w-10 h-10 text-indigo-400 mb-4 opacity-80" />
              <h3 className="text-xl font-black mb-1">Total Active Logged Hours</h3>
              <p className="text-5xl font-black text-indigo-200 mb-3">
                {telemetry.totalClockedHours} <span className="text-base text-indigo-300 font-medium">Hrs</span>
              </p>
              <p className="text-indigo-200/80 text-xs leading-relaxed">
                Authentic telemetry aggregated directly from timestamped work logs in the database. High logged hours paired with consistent task velocity produces high performance scores.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}