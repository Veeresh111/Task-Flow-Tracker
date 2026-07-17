import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { callCorporateAI } from "@/lib/ai";
import { useToast } from "@/hooks/use-toast";
import { formatINRShort } from "@/lib/utils";
import { Loader2, Users, Briefcase, Building, Download, Sparkles } from "lucide-react";


export default function AdminAIInsights() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<any>(null);
  const [aiSummary, setAiSummary] = useState<string>("");
  const [generatingAI, setGeneratingAI] = useState(false);

  useEffect(() => {
    fetchGlobalIntelligence();
  }, []);

  const fetchGlobalIntelligence = async () => {
    setLoading(true);
    
    // UNIFIED METRICS: fetch authoritative headcounts from the database
    let metricsUnified: any = {};
    try {
      const { data: unified } = await supabase.rpc('get_enterprise_metrics');
      metricsUnified = unified || {};
    } catch (e) {
      console.warn("get_enterprise_metrics RPC not available:", e);
    }

    // 1. Fetch entire database for precise macro analysis — each query independently
    let profiles: any[] = [];
    let tasks: any[] = [];
    let projects: any[] = [];
    let logs: any[] = [];
    try {
      const profilesRes = await supabase.from('profiles').select('id, role, department, created_at, payroll_ctc');
      if (!profilesRes.error) profiles = profilesRes.data || [];
    } catch (e) { console.warn("profiles query failed:", e); }
    try {
      const tasksRes = await supabase.from('tasks').select('id, status, assigned_to');
      if (!tasksRes.error) tasks = tasksRes.data || [];
    } catch (e) { console.warn("tasks query failed:", e); }
    try {
      const projectsRes = await supabase.from('projects').select('id, status');
      if (!projectsRes.error) projects = projectsRes.data || [];
    } catch (e) { console.warn("projects query failed:", e); }
    try {
      const logsRes = await supabase.from('work_logs').select('user_id, clock_in, clock_out, created_at');
      if (!logsRes.error) logs = logsRes.data || [];
    } catch (e) { console.warn("work_logs query failed:", e); }

    // Helper: Title Case Formatter to fix duplicate department bugs
    const toTitleCase = (str: string) => {
      if (!str) return 'Cross-Functional';
      return str.trim().toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    };

    const hiredThisMonth = profiles.filter(p => {
      const date = p.join_date || p.created_at;
      return date && new Date(date).getMonth() === new Date().getMonth();
    }).length;

    const deptMap = new Map();
    let totalPayroll = 0;

    profiles.forEach(p => {
      const cleanDept = toTitleCase(p.department);
      if (!deptMap.has(cleanDept)) {
        deptMap.set(cleanDept, { emps: 0, payroll: 0, avgPerf: 0, perfCount: 0 });
      }
      const stat = deptMap.get(cleanDept);
      stat.emps += 1;

      const ctc = Number(p.payroll_ctc) || 0;
      if (ctc > 0) {
        stat.payroll += Math.round(ctc / 12);
        totalPayroll += Math.round(ctc / 12);
      }

      const perf = Number(p.performance_score);
      if (perf > 0) {
        stat.avgPerf += perf;
        stat.perfCount += 1;
      }
    });

    const deptHeadcountMap = new Map<string, number>();
    (metricsUnified.by_department || []).forEach((d: any) => {
      deptHeadcountMap.set(d.department, d.count);
    });

    const activeProjects = projects.filter(p => p.status !== 'Completed').length;
    const completedTasks = tasks.filter(t => t.status === 'Completed').length;

    const finalMetrics = {
      global: {
        payroll: { current: totalPayroll, previous: 0 },
        hiring: { current: metricsUnified.hires_this_month ?? hiredThisMonth, previous: 0 },
        activeProjects: { current: activeProjects || projects.length, previous: 0 },
        taskCompletion: { current: completedTasks, previous: 0 }
      },
      departments: Array.from(deptMap, ([name, data]) => ({
        name,
        headcount: deptHeadcountMap.get(name) ?? data.emps,
        avgPerformance: data.perfCount > 0 ? (data.avgPerf / data.perfCount).toFixed(1) : 'N/A',
        expended: data.payroll,
        gained: 0,
        roi: 'N/A'
      }))
    };

    setMetrics(finalMetrics);
    setLoading(false);
  };

  const generateAISummary = async () => {
  if (!metrics) return;

  setGeneratingAI(true);

  try {
    const content = await callCorporateAI({
      prompt: `Act as an elite Enterprise Financial Analyst. Review this corporate data:
${JSON.stringify(metrics.global)}

Write a highly professional, 2-paragraph executive summary detailing the company's headcount, payroll spending, hiring activity, and project portfolio. Do not use markdown.`,
      temperature: 0.7,
      max_tokens: 500,
    });

    setAiSummary(content || "Unable to generate AI summary.");
  } catch (err) {
    console.error(err);

    toast({
      title: "AI Engine Error",
      description: "Failed to generate summary using Qwen 3.",
      variant: "destructive",
    });
  }

  setGeneratingAI(false);
};
  const exportReport = () => {
    const csvRows = ["DEPARTMENT,HEADCOUNT,AVG_PERFORMANCE,MONTHLY_PAYROLL"];
    metrics.departments.forEach((d: any) => {
      csvRows.push(`"${d.name}",${d.headcount},${d.avgPerformance},${d.expended > 0 ? d.expended : 'N/A'}`);
    });
    
    const csvContent = "data:text/csv;charset=utf-8," + csvRows.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Enterprise_AI_Insight_Report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatCurrency = (val: number) => formatINRShort(val);

  if (loading || !metrics) {
    return <DashboardLayout role="admin"><div className="flex justify-center p-32"><Loader2 className="w-12 h-12 animate-spin text-indigo-600" /></div></DashboardLayout>;
  }

  return (
    <DashboardLayout role="admin">
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in pb-12">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <Sparkles className="w-8 h-8 text-indigo-600" /> Executive AI Insights
            </h1>
            <p className="text-slate-500 mt-1">Enterprise analytics: headcount, payroll, hiring, and project trends.</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={generateAISummary} disabled={generatingAI} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-sm">
              {generatingAI ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />} 
              Generate AI Summary (AI Prediction)
            </Button>
            <Button onClick={exportReport} variant="outline" className="text-slate-700 font-bold border-slate-300 shadow-sm">
              <Download className="w-4 h-4 mr-2"/> Export Report
            </Button>
          </div>
        </div>

        {aiSummary && (
          <Card className="bg-indigo-50 border border-indigo-100 shadow-sm">
            <CardContent className="p-6">
              <h3 className="text-indigo-800 font-black flex items-center gap-2 mb-2"><Sparkles className="w-5 h-5"/> Qwen3 32B (Groq) Executive Analysis</h3>
              <p className="text-indigo-900 leading-relaxed font-medium text-sm whitespace-pre-wrap">{aiSummary}</p>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="shadow-sm border-slate-200">
            <CardContent className="p-5">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1"><Briefcase className="w-3 h-3"/> Monthly Payroll</p>
              <div className="flex items-end justify-between">
                <h2 className="text-2xl font-black text-red-600">{formatCurrency(metrics.global.payroll.current)}</h2>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-slate-200">
            <CardContent className="p-5">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1"><Users className="w-3 h-3"/> Hires This Month</p>
              <div className="flex items-end justify-between">
                <h2 className="text-2xl font-black text-blue-600">{metrics.global.hiring.current}</h2>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-slate-200">
            <CardContent className="p-5">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1"><Building className="w-3 h-3"/> Active Projects</p>
              <div className="flex items-end justify-between">
                <h2 className="text-2xl font-black text-slate-800">{metrics.global.activeProjects.current}</h2>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="shadow-sm border-slate-200">
          <CardHeader className="border-b bg-slate-50/50">
            <CardTitle className="text-lg text-slate-800">Department Overview</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="font-bold text-slate-700">Department</TableHead>
                    <TableHead className="font-bold text-slate-700 text-center">Headcount</TableHead>
                    <TableHead className="font-bold text-slate-700 text-center">Avg Performance</TableHead>
                    <TableHead className="font-bold text-red-600 text-right">Monthly Payroll</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metrics.departments.map((dept: any, index: number) => (
                    <TableRow key={index} className="hover:bg-slate-50/80">
                      <TableCell className="font-bold text-slate-900">{dept.name}</TableCell>
                      <TableCell className="text-center font-medium text-slate-600">{dept.headcount}</TableCell>
                      <TableCell className="text-center font-bold text-amber-600">{dept.avgPerformance !== 'N/A' ? `⭐ ${dept.avgPerformance}` : 'N/A'}</TableCell>
                      <TableCell className="text-right font-medium text-red-600">{dept.expended > 0 ? formatCurrency(dept.expended) : 'N/A'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

      </div>
    </DashboardLayout>
  );
}