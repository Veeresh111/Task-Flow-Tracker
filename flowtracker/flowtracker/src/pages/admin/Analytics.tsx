import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast"; // NEW: For authentic popup notifications
import { supabase } from "@/lib/supabase";
import { 
  Loader2, BarChart3, TrendingUp, TrendingDown, Users, Target, Activity, PieChart as PieChartIcon, 
  Briefcase, Calendar, DollarSign, FileText, UserPlus 
} from "lucide-react";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  PieChart, Pie, Cell, AreaChart, Area, LineChart, Line 
} from "recharts";

const DEPT_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

export default function AdminAnalytics() {
  const { toast } = useToast();
  const [allData, setAllData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Existing State
  const [pieData, setPieData] = useState<any[]>([]);
  const [barData, setBarData] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState("ALL"); 

  // Authentic Database States (Replacing all dummy data)
  const [departmentData, setDepartmentData] = useState<any[]>([]);
  const [hiringData, setHiringData] = useState<any[]>([]);
  const [pipelineData, setPipelineData] = useState<any[]>([]);
  const [weeklyAtt, setWeeklyAtt] = useState<any[]>([]);
  const [perfTrend, setPerfTrend] = useState<any[]>([]);
  const [execMetrics, setExecMetrics] = useState<any>({});

  useEffect(() => { fetchDetailedAnalytics(); }, []);

  const fetchDetailedAnalytics = async () => {
    setLoading(true);
    
    // FETCH 1: Core App Data
    const [profilesRes, tasksRes, logsRes] = await Promise.all([
      supabase.from('profiles').select('*'), 
      supabase.from('tasks').select('*'),
      supabase.from('work_logs').select('*')
    ]);

    // FETCH 2: Authentic Executive Data (Gracefully returns empty if tables don't exist yet)
    const [hireRes, pipeRes, attRes, perfRes, execRes] = await Promise.all([
      supabase.from('hiring_stats').select('*').order('id', {ascending: true}),
      supabase.from('pipeline_stats').select('*').order('id', {ascending: true}),
      supabase.from('weekly_attendance').select('*').order('id', {ascending: true}),
      supabase.from('performance_trends').select('*').order('id', {ascending: true}),
      supabase.from('executive_metrics').select('*').single()
    ]);

    if (hireRes.data) setHiringData(hireRes.data);
    if (pipeRes.data) setPipelineData(pipeRes.data);
    if (attRes.data) setWeeklyAtt(attRes.data);
    if (perfRes.data) setPerfTrend(perfRes.data);
    if (execRes.data) setExecMetrics(execRes.data);

    const profiles = profilesRes.data || [];
    const tasks = tasksRes.data || [];
    const logs = logsRes.data || [];

    const calculateHours = (start: string | null, end: string | null) => {
      if (!start) return 0;
      try { 
        const startTime = new Date(start).getTime();
        const endTime = end ? new Date(end).getTime() : new Date().getTime();
        const diff = endTime - startTime;
        return diff > 0 ? diff / 3600000 : 0; 
      } catch { return 0; }
    };

    const deptCounts = profiles.reduce((acc: any, p: any) => {
      const d = p.department || 'Unassigned';
      acc[d] = (acc[d] || 0) + 1;
      return acc;
    }, {});
    setDepartmentData(Object.keys(deptCounts).map(k => ({ name: k, value: deptCounts[k] })));

    const analyticsData = profiles.map(emp => {
      const empTasks = tasks.filter(t => t.assigned_to === emp.id);
      const assignedCount = empTasks.length;
      const completedCount = empTasks.filter(t => t.status?.toLowerCase().includes('complet')).length;
      const empLogs = logs.filter(l => l.user_id === emp.id);
      const totalHrs = empLogs.reduce((acc, log) => acc + calculateHours((log.clock_in || log.created_at), log.clock_out), 0);

      let completionRate = assignedCount > 0 ? (completedCount / assignedCount) * 100 : 0;
      let performanceStatus = "No Data";
      if (assignedCount > 0) {
        if (completionRate >= 80) performanceStatus = "Top Performer";
        else if (completionRate >= 50) performanceStatus = "Solid";
        else performanceStatus = "Underperforming";
      } else if (totalHrs > 0) { performanceStatus = "Working (No Tasks)"; }

      return {
        id: emp.id, name: emp.name, email: emp.email, role: emp.role, department: emp.department,
        assignedTasks: assignedCount, completedTasks: completedCount, completionRate, totalHours: totalHrs, status: performanceStatus
      };
    });

    analyticsData.sort((a, b) => b.completionRate - a.completionRate);
    setAllData(analyticsData);

    const topCount = analyticsData.filter(e => e.status === "Top Performer").length;
    const solidCount = analyticsData.filter(e => e.status === "Solid").length;
    const underCount = analyticsData.filter(e => e.status === "Underperforming").length;
    
    setPieData([{ name: "Top Performers", value: topCount, color: "#10b981" }, { name: "Solid", value: solidCount, color: "#3b82f6" }, { name: "Needs Attention", value: underCount, color: "#ef4444" }].filter(d => d.value > 0));
    setBarData([...analyticsData].sort((a, b) => b.completedTasks - a.completedTasks).slice(0, 10).map(emp => ({ name: emp.name.split(" ")[0], Completed: emp.completedTasks, Assigned: emp.assignedTasks })));
    setLoading(false);
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
      case "Top Performer": return <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold border border-emerald-200 flex items-center gap-1 w-max"><TrendingUp className="w-3 h-3"/> Top Performer</span>;
      case "Solid": return <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-bold border border-blue-200 flex items-center gap-1 w-max"><Activity className="w-3 h-3"/> Solid</span>;
      case "Underperforming": return <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-bold border border-red-200 flex items-center gap-1 w-max"><TrendingDown className="w-3 h-3"/> Needs Attention</span>;
      default: return <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-xs font-bold border border-slate-200 w-max">{status}</span>;
    }
  };

  // FIX: Export Data to CSV
  const handleExport = () => {
    const csvContent = "data:text/csv;charset=utf-8,"
      + "Name,Email,Role,Assigned Tasks,Completed Tasks,Completion Rate,Status\n"
      + filteredData.map(e => `${e.name},${e.email},${e.role},${e.assignedTasks},${e.completedTasks},${e.completionRate.toFixed(2)}%,${e.status}`).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "company_analytics_report.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: "Export Successful", description: "Your report has been downloaded." });
  };

  // FIX: New Report Backend Connection
  const handleNewReport = async () => {
    const { error } = await supabase.from('reports').insert([{ generated_at: new Date().toISOString(), type: 'Executive Overview' }]);
    if (error) {
      toast({ title: "Database Notice", description: "Reports table not yet configured by client.", variant: "destructive" });
    } else {
      toast({ title: "Report Saved", description: "A new executive snapshot has been saved to the database." });
    }
  };

  // FIX: Initiate Meeting Backend Connection
  const initiateMeeting = async (empName: string, empId: string) => {
    const { error } = await supabase.from('tasks').insert([{
      title: `1-on-1 Performance Sync: ${empName}`,
      assigned_to: empId,
      status: 'Pending',
      description: 'Automated request: Please schedule a face-to-face meeting to discuss recent performance metrics and morale.',
      complexity: 'High'
    }]);
    
    if (error) {
      toast({ title: "Error scheduling meeting", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Meeting Initiated", description: `A high-priority face-to-face meeting task has been sent to ${empName}.` });
    }
  };

  // FIX: Tab Filtering Case Sensitivity Bug
  const filteredData = allData.filter(emp => {
    if (activeTab === "ALL") return true;
    const safeRole = emp.role?.toUpperCase() || "";
    if (activeTab === "TEAM_LEAD") return safeRole === "TEAM_LEAD" || safeRole === "TL";
    if (activeTab === "EMPLOYEE") return safeRole === "EMPLOYEE";
    return true;
  });

  return (
    <DashboardLayout role="admin">
      <div className="max-w-[1400px] mx-auto space-y-6 animate-fade-in pb-12">
        
        <div className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900">Executive Overview</h1>
            <p className="text-slate-500 mt-1">Company-wide performance, hiring and people analytics</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExport}>Export</Button>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleNewReport}>+ New Report</Button>
          </div>
        </div>

        {loading ? <div className="flex justify-center p-20"><Loader2 className="w-10 h-10 animate-spin text-blue-600" /></div> : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="shadow-sm border-slate-200"><CardContent className="p-6">
                <div className="flex justify-between items-start mb-2"><p className="text-sm font-semibold text-slate-600">Total Employees</p><Users className="w-5 h-5 text-indigo-600"/></div>
                <h2 className="text-3xl font-black text-slate-900 mb-1">{allData.length}</h2>
                <p className="text-xs font-medium text-emerald-600 flex items-center"><TrendingUp className="w-3 h-3 mr-1"/> Live Data</p>
              </CardContent></Card>
              
              <Card className="shadow-sm border-slate-200"><CardContent className="p-6">
                <div className="flex justify-between items-start mb-2"><p className="text-sm font-semibold text-slate-600">Open Positions</p><Briefcase className="w-5 h-5 text-cyan-500"/></div>
                <h2 className="text-3xl font-black text-slate-900 mb-1">{execMetrics.open_positions || 0}</h2>
                <p className="text-xs font-medium text-emerald-600 flex items-center"><TrendingUp className="w-3 h-3 mr-1"/> {execMetrics.open_growth || 0}% <span className="text-slate-500 ml-1 font-normal">{execMetrics.urgent_positions || 0} urgent</span></p>
              </CardContent></Card>

              <Card className="shadow-sm border-slate-200"><CardContent className="p-6">
                <div className="flex justify-between items-start mb-2"><p className="text-sm font-semibold text-slate-600">Interviews Today</p><Calendar className="w-5 h-5 text-amber-600"/></div>
                <h2 className="text-3xl font-black text-slate-900 mb-1">{execMetrics.interviews_today || 0}</h2>
                <p className="text-xs font-medium text-red-500 flex items-center"><TrendingDown className="w-3 h-3 mr-1"/> {execMetrics.interview_growth || 0}% <span className="text-slate-500 ml-1 font-normal">vs yesterday</span></p>
              </CardContent></Card>

              <Card className="shadow-sm border-slate-200"><CardContent className="p-6">
                <div className="flex justify-between items-start mb-2"><p className="text-sm font-semibold text-slate-600">Monthly Payroll</p><DollarSign className="w-5 h-5 text-emerald-500"/></div>
                <h2 className="text-3xl font-black text-slate-900 mb-1">${execMetrics.monthly_payroll || 0}M</h2>
                <p className="text-xs font-medium text-emerald-600 flex items-center"><TrendingUp className="w-3 h-3 mr-1"/> {execMetrics.payroll_growth || 0}% <span className="text-slate-500 ml-1 font-normal">processed on time</span></p>
              </CardContent></Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="shadow-sm border-slate-200"><CardHeader className="pb-2"><CardTitle className="text-base font-bold text-slate-800">Hiring & Attrition</CardTitle><p className="text-xs text-slate-500">Authentic DB Source</p></CardHeader>
                <CardContent className="h-[280px]">
                  {hiringData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={hiringData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorHires" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/><stop offset="95%" stopColor="#6366f1" stopOpacity={0}/></linearGradient>
                          <linearGradient id="colorAttr" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3}/><stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/></linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                        <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                        <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                        <Area type="monotone" dataKey="hires" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#colorHires)" />
                        <Area type="monotone" dataKey="attrition" stroke="#06b6d4" strokeWidth={2} fillOpacity={1} fill="url(#colorAttr)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (<div className="h-full flex items-center justify-center text-slate-400 text-sm">No authentic database records found.</div>)}
                </CardContent>
              </Card>

              <Card className="shadow-sm border-slate-200"><CardHeader className="pb-2"><CardTitle className="text-base font-bold text-slate-800">Department Distribution</CardTitle><p className="text-xs text-slate-500">Headcount split (Live Data)</p></CardHeader>
                <CardContent className="h-[280px]">
                  {departmentData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={departmentData} cx="50%" cy="50%" innerRadius={65} outerRadius={95} paddingAngle={3} dataKey="value" stroke="none">
                          {departmentData.map((entry, index) => (<Cell key={`cell-${index}`} fill={DEPT_COLORS[index % DEPT_COLORS.length]} />))}
                        </Pie>
                        <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (<div className="h-full flex items-center justify-center text-slate-400 text-sm">No department data.</div>)}
                </CardContent>
              </Card>

              <Card className="shadow-sm border-slate-200"><CardHeader className="pb-2"><CardTitle className="text-base font-bold text-slate-800">Hiring Pipeline</CardTitle><p className="text-xs text-slate-500">Authentic DB Source</p></CardHeader>
                <CardContent className="h-[280px]">
                  {pipelineData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart layout="vertical" data={pipelineData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                        <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                        <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#475569', fontWeight: 500 }} width={80} />
                        <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                        <Bar dataKey="value" fill="#4f46e5" radius={[0, 4, 4, 0]} barSize={22} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (<div className="h-full flex items-center justify-center text-slate-400 text-sm">No authentic database records found.</div>)}
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="shadow-sm border-slate-200"><CardHeader className="pb-2"><CardTitle className="text-base font-bold text-slate-800">Weekly Attendance</CardTitle><p className="text-xs text-slate-500">Authentic DB Source</p></CardHeader>
                <CardContent className="h-[280px]">
                  {weeklyAtt.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={weeklyAtt} margin={{ top: 20, right: 20, left: -20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                        <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                        <Legend iconType="square" wrapperStyle={{ fontSize: '12px' }} />
                        <Bar dataKey="present" stackId="a" fill="#10b981" radius={[0, 0, 4, 4]} barSize={35} />
                        <Bar dataKey="remote" stackId="a" fill="#0ea5e9" barSize={35} />
                        <Bar dataKey="leave" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={35} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (<div className="h-full flex items-center justify-center text-slate-400 text-sm">No authentic database records found.</div>)}
                </CardContent>
              </Card>

              <Card className="shadow-sm border-slate-200"><CardHeader className="pb-2"><CardTitle className="text-base font-bold text-slate-800">Performance Trend</CardTitle><p className="text-xs text-slate-500">Authentic DB Source</p></CardHeader>
                <CardContent className="h-[280px]">
                  {perfTrend.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={perfTrend} margin={{ top: 20, right: 20, left: -20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                        <YAxis domain={[3, 5]} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                        <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                        <Line type="monotone" dataKey="score" stroke="#6366f1" strokeWidth={3} dot={{ r: 6, fill: '#6366f1', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 8 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (<div className="h-full flex items-center justify-center text-slate-400 text-sm">No authentic database records found.</div>)}
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="shadow-sm border-slate-200"><CardContent className="p-6">
                <div className="flex justify-between items-start mb-2"><p className="text-sm font-semibold text-slate-600">Attendance Rate</p><Activity className="w-5 h-5 text-emerald-600"/></div>
                <h2 className="text-3xl font-black text-slate-900 mb-1">{execMetrics.attendance_rate || 0}%</h2>
                <p className="text-xs font-medium text-emerald-600 flex items-center"><TrendingUp className="w-3 h-3 mr-1"/> {execMetrics.attendance_growth || 0}%</p>
              </CardContent></Card>
              
              <Card className="shadow-sm border-slate-200"><CardContent className="p-6">
                <div className="flex justify-between items-start mb-2"><p className="text-sm font-semibold text-slate-600">Retention Rate</p><TrendingUp className="w-5 h-5 text-indigo-600"/></div>
                <h2 className="text-3xl font-black text-slate-900 mb-1">{execMetrics.retention_rate || 0}%</h2>
                <p className="text-xs font-medium text-emerald-600 flex items-center"><TrendingUp className="w-3 h-3 mr-1"/> {execMetrics.retention_growth || 0}%</p>
              </CardContent></Card>

              <Card className="shadow-sm border-slate-200"><CardContent className="p-6">
                <div className="flex justify-between items-start mb-2"><p className="text-sm font-semibold text-slate-600">Resumes Screened</p><FileText className="w-5 h-5 text-cyan-500"/></div>
                <h2 className="text-3xl font-black text-slate-900 mb-1">{execMetrics.resumes_screened || 0}</h2>
                <p className="text-xs font-medium text-emerald-600 flex items-center"><TrendingUp className="w-3 h-3 mr-1"/> {execMetrics.resumes_growth || 0}%</p>
              </CardContent></Card>

              <Card className="shadow-sm border-slate-200"><CardContent className="p-6">
                <div className="flex justify-between items-start mb-2"><p className="text-sm font-semibold text-slate-600">New Hires (MTD)</p><UserPlus className="w-5 h-5 text-slate-700"/></div>
                <h2 className="text-3xl font-black text-slate-900 mb-1">{execMetrics.new_hires || 0}</h2>
                <p className="text-xs font-medium text-emerald-600 flex items-center"><TrendingUp className="w-3 h-3 mr-1"/> {execMetrics.hires_growth || 0}%</p>
              </CardContent></Card>
            </div>

            <div className="w-full border-t border-slate-300 my-4" />

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-8">
              <Card className="shadow-sm border-slate-200"><CardContent className="p-5 flex items-center gap-4"><div className="p-3 bg-slate-100 text-slate-600 rounded-full"><Users className="w-5 h-5"/></div><div><p className="text-xs font-bold text-slate-500 uppercase">Total Workforce</p><h2 className="text-2xl font-black text-slate-800">{allData.length}</h2></div></CardContent></Card>
              <Card className="shadow-sm border-emerald-200 bg-emerald-50/30"><CardContent className="p-5 flex items-center gap-4"><div className="p-3 bg-emerald-100 text-emerald-600 rounded-full"><TrendingUp className="w-5 h-5"/></div><div><p className="text-xs font-bold text-emerald-700 uppercase">Top Performers</p><h2 className="text-2xl font-black text-emerald-800">{allData.filter(e => e.status === "Top Performer").length}</h2></div></CardContent></Card>
              <Card className="shadow-sm border-blue-200 bg-blue-50/30"><CardContent className="p-5 flex items-center gap-4"><div className="p-3 bg-blue-100 text-blue-600 rounded-full"><Activity className="w-5 h-5"/></div><div><p className="text-xs font-bold text-blue-700 uppercase">Solid Core</p><h2 className="text-2xl font-black text-blue-800">{allData.filter(e => e.status === "Solid").length}</h2></div></CardContent></Card>
              <Card className="shadow-sm border-red-200 bg-red-50/30"><CardContent className="p-5 flex items-center gap-4"><div className="p-3 bg-red-100 text-red-600 rounded-full"><TrendingDown className="w-5 h-5"/></div><div><p className="text-xs font-bold text-red-700 uppercase">Needs Attention</p><h2 className="text-2xl font-black text-red-800">{allData.filter(e => e.status === "Underperforming").length}</h2></div></CardContent></Card>
            </div>

            <Card className="shadow-sm border-slate-200">
              <CardHeader className="border-b bg-slate-50/50 flex flex-row items-center justify-between">
                <CardTitle className="text-lg text-slate-800 flex items-center gap-2"><Target className="w-5 h-5 text-blue-500" /> Individual Analytics Report</CardTitle>
                <div className="flex gap-2">
                  <Button onClick={() => setActiveTab("ALL")} variant={activeTab === "ALL" ? "default" : "outline"} className="h-8 text-xs">All Staff</Button>
                  <Button onClick={() => setActiveTab("TEAM_LEAD")} variant={activeTab === "TEAM_LEAD" ? "default" : "outline"} className="h-8 text-xs">Team Leads</Button>
                  <Button onClick={() => setActiveTab("EMPLOYEE")} variant={activeTab === "EMPLOYEE" ? "default" : "outline"} className="h-8 text-xs">Employees</Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto max-h-[400px]">
                  <Table>
                    <TableHeader className="bg-slate-50"><TableRow><TableHead className="font-bold">Staff Member</TableHead><TableHead className="font-bold">Total Logged Hours</TableHead><TableHead className="font-bold text-center">Tasks Assigned</TableHead><TableHead className="font-bold text-center">Tasks Completed</TableHead><TableHead className="font-bold">Completion Rate</TableHead><TableHead className="font-bold">System Rating</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {filteredData.map(emp => (
                        <TableRow key={emp.id} className="hover:bg-slate-50">
                          <TableCell><div className="font-bold text-slate-900">{emp.name}</div><div className="text-xs text-slate-500 uppercase font-bold tracking-wider">{emp.role?.replace('_', ' ')}</div></TableCell>
                          <TableCell className="font-medium text-slate-700">{emp.totalHours.toFixed(1)} hrs</TableCell>
                          <TableCell className="text-center font-medium text-amber-600">{emp.assignedTasks}</TableCell>
                          <TableCell className="text-center font-bold text-emerald-600">{emp.completedTasks}</TableCell>
                          <TableCell><div className="w-full bg-slate-200 rounded-full h-2.5 mb-1 max-w-[100px]"><div className={`h-2.5 rounded-full ${emp.completionRate >= 80 ? 'bg-emerald-500' : emp.completionRate >= 50 ? 'bg-blue-500' : 'bg-red-500'}`} style={{ width: `${emp.completionRate}%` }}></div></div><span className="text-xs font-bold text-slate-600">{emp.completionRate.toFixed(0)}%</span></TableCell>
                          <TableCell>{getStatusBadge(emp.status)}</TableCell>
                        </TableRow>
                      ))}
                      {filteredData.length === 0 && <TableRow><TableCell colSpan={6} className="text-center p-8 text-slate-500">No records found for this category.</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4">
              <Card className="shadow-sm border-slate-200"><CardHeader className="border-b bg-slate-50/50"><CardTitle className="text-lg text-slate-800 flex items-center gap-2"><BarChart3 className="w-5 h-5 text-blue-500" /> Task Completion Volume</CardTitle></CardHeader><CardContent className="p-6"><div className="h-[300px] w-full">{barData.length > 0 ? (<ResponsiveContainer width="100%" height="100%"><BarChart data={barData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} /><Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} /><Legend wrapperStyle={{ paddingTop: '20px' }} /><Bar dataKey="Assigned" fill="#94a3b8" radius={[4, 4, 0, 0]} barSize={30} /><Bar dataKey="Completed" fill="#10b981" radius={[4, 4, 0, 0]} barSize={30} /></BarChart></ResponsiveContainer>) : (<div className="flex h-full items-center justify-center text-slate-400">Not enough task data for chart.</div>)}</div></CardContent></Card>
              
              {/* FIX: Overall Company Health & Morale Management Section */}
              <div className="flex flex-col gap-6">
                <Card className="shadow-sm border-slate-200 h-[380px]"><CardHeader className="border-b bg-slate-50/50"><CardTitle className="text-lg text-slate-800 flex items-center gap-2"><PieChartIcon className="w-5 h-5 text-purple-500" /> Overall Company Health</CardTitle></CardHeader><CardContent className="p-6"><div className="h-[280px] w-full">{pieData.length > 0 ? (<ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={70} outerRadius={100} paddingAngle={5} dataKey="value" stroke="none">{pieData.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.color} />))}</Pie><Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} /><Legend verticalAlign="bottom" height={36} iconType="circle" /></PieChart></ResponsiveContainer>) : (<div className="flex h-full items-center justify-center text-slate-400">Not enough performance data for chart.</div>)}</div></CardContent></Card>
              </div>
            </div>

            {/* FIX: New Section for Employee Lists & Meeting Button */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-2">
              <Card className="shadow-sm border-emerald-200 bg-emerald-50/30">
                <CardHeader className="pb-3 border-b border-emerald-100">
                  <CardTitle className="text-lg text-emerald-800">Top Performers List</CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <ul className="space-y-2">
                    {allData.filter(e => e.status === "Top Performer").map(emp => (
                      <li key={emp.id} className="flex justify-between items-center p-3 bg-white rounded shadow-sm border border-emerald-100">
                        <div>
                          <span className="font-bold text-slate-800 block">{emp.name}</span>
                          <span className="text-xs text-slate-500">{emp.department || "Unassigned"}</span>
                        </div>
                        <span className="text-xs font-bold bg-emerald-100 text-emerald-700 px-2 py-1 rounded">Score: {emp.completionRate.toFixed(0)}%</span>
                      </li>
                    ))}
                  </ul>
                  {allData.filter(e => e.status === "Top Performer").length === 0 && <p className="text-sm text-slate-500 mt-2">No top performers currently.</p>}
                </CardContent>
              </Card>

              <Card className="shadow-sm border-red-200 bg-red-50/30">
                <CardHeader className="pb-3 border-b border-red-100">
                  <CardTitle className="text-lg text-red-800">Needs Attention List</CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <ul className="space-y-2">
                    {allData.filter(e => e.status === "Underperforming").map(emp => (
                      <li key={emp.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 bg-white rounded shadow-sm border border-red-100 gap-2">
                        <div>
                          <span className="font-bold text-slate-800 block">{emp.name}</span>
                          <span className="text-xs text-red-500 font-medium">Score: {emp.completionRate.toFixed(0)}%</span>
                        </div>
                        <Button onClick={() => initiateMeeting(emp.name, emp.id)} size="sm" variant="destructive" className="h-8 text-xs font-bold w-full sm:w-auto">
                          Initiate 1-on-1 Meeting
                        </Button>
                      </li>
                    ))}
                  </ul>
                  {allData.filter(e => e.status === "Underperforming").length === 0 && <p className="text-sm text-slate-500 mt-2">No employees need attention currently.</p>}
                </CardContent>
              </Card>
            </div>

          </>
        )}
      </div>
    </DashboardLayout>
  );
}