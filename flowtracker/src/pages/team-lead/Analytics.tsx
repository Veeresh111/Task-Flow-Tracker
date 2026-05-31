import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/lib/supabase";
import { Loader2, BarChart3, TrendingUp, TrendingDown, Users, Target, Activity } from "lucide-react";

export default function TeamLeadAnalytics() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchTeamAnalytics(); }, []);

  const fetchTeamAnalytics = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [profilesRes, tasksRes, logsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('team_lead_id', user.id), 
      supabase.from('tasks').select('*'),
      supabase.from('work_logs').select('*')
    ]);

    const profiles = profilesRes.data || [];
    const tasks = tasksRes.data || [];
    const logs = logsRes.data || [];

    // INDESTRUCTIBLE MATH ENGINE
    const calculateHours = (start: string | null, end: string | null) => {
      if (!start) return 0;
      try {
        const startDate = new Date(start);
        const startTime = startDate.getTime();

        let endTime;
        if (end) {
          endTime = new Date(end).getTime();
        } else {
          const now = new Date();
          const eod = new Date(startDate);
          eod.setHours(23, 59, 59, 999); 
          endTime = now.getTime() > eod.getTime() ? eod.getTime() : now.getTime();
        }

        const hours = (endTime - startTime) / 3600000;
        return hours > 24 ? 24 : (hours > 0 ? hours : 0);
      } catch { return 0; }
    };

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

      return { id: emp.id, name: emp.name, email: emp.email, assignedTasks: assignedCount, completedTasks: completedCount, completionRate, totalHours: totalHrs, status: performanceStatus };
    });

    analyticsData.sort((a, b) => b.completionRate - a.completionRate);
    setEmployees(analyticsData);
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

  return (
    <DashboardLayout role="team_lead">
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in pb-12">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200"><h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2"><BarChart3 className="w-8 h-8 text-blue-600" /> Team Performance Metrics</h1><p className="text-slate-500 mt-1">Monitor the productivity and task completion of your assigned team members.</p></div>

        {loading ? <div className="flex justify-center p-20"><Loader2 className="w-10 h-10 animate-spin text-blue-600" /></div> : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="shadow-sm border-slate-200"><CardContent className="p-5 flex items-center gap-4"><div className="p-3 bg-slate-100 text-slate-600 rounded-full"><Users className="w-5 h-5"/></div><div><p className="text-xs font-bold text-slate-500 uppercase">My Team Size</p><h2 className="text-2xl font-black text-slate-800">{employees.length}</h2></div></CardContent></Card>
              <Card className="shadow-sm border-emerald-200 bg-emerald-50/30"><CardContent className="p-5 flex items-center gap-4"><div className="p-3 bg-emerald-100 text-emerald-600 rounded-full"><TrendingUp className="w-5 h-5"/></div><div><p className="text-xs font-bold text-emerald-700 uppercase">Top Performers</p><h2 className="text-2xl font-black text-emerald-800">{employees.filter(e => e.status === "Top Performer").length}</h2></div></CardContent></Card>
              <Card className="shadow-sm border-blue-200 bg-blue-50/30"><CardContent className="p-5 flex items-center gap-4"><div className="p-3 bg-blue-100 text-blue-600 rounded-full"><Activity className="w-5 h-5"/></div><div><p className="text-xs font-bold text-blue-700 uppercase">Solid Core</p><h2 className="text-2xl font-black text-blue-800">{employees.filter(e => e.status === "Solid").length}</h2></div></CardContent></Card>
              <Card className="shadow-sm border-red-200 bg-red-50/30"><CardContent className="p-5 flex items-center gap-4"><div className="p-3 bg-red-100 text-red-600 rounded-full"><TrendingDown className="w-5 h-5"/></div><div><p className="text-xs font-bold text-red-700 uppercase">Needs Attention</p><h2 className="text-2xl font-black text-red-800">{employees.filter(e => e.status === "Underperforming").length}</h2></div></CardContent></Card>
            </div>

            <Card className="shadow-sm border-slate-200">
              <CardHeader className="border-b bg-slate-50/50"><CardTitle className="text-lg text-slate-800 flex items-center gap-2"><Target className="w-5 h-5 text-blue-500" /> My Team Analytics</CardTitle></CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-50"><TableRow><TableHead className="font-bold">Employee</TableHead><TableHead className="font-bold">Total Logged Hours</TableHead><TableHead className="font-bold text-center">Tasks Assigned</TableHead><TableHead className="font-bold text-center">Tasks Completed</TableHead><TableHead className="font-bold">Completion Rate</TableHead><TableHead className="font-bold">System Rating</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {employees.map(emp => (
                        <TableRow key={emp.id} className="hover:bg-slate-50">
                          <TableCell><div className="font-bold text-slate-900">{emp.name}</div><div className="text-xs text-slate-500">{emp.email}</div></TableCell>
                          <TableCell className="font-medium text-slate-700">{emp.totalHours.toFixed(1)} hrs</TableCell>
                          <TableCell className="text-center font-medium text-amber-600">{emp.assignedTasks}</TableCell>
                          <TableCell className="text-center font-bold text-emerald-600">{emp.completedTasks}</TableCell>
                          <TableCell><div className="w-full bg-slate-200 rounded-full h-2.5 mb-1 max-w-[100px]"><div className={`h-2.5 rounded-full ${emp.completionRate >= 80 ? 'bg-emerald-500' : emp.completionRate >= 50 ? 'bg-blue-500' : 'bg-red-500'}`} style={{ width: `${emp.completionRate}%` }}></div></div><span className="text-xs font-bold text-slate-600">{emp.completionRate.toFixed(0)}%</span></TableCell>
                          <TableCell>{getStatusBadge(emp.status)}</TableCell>
                        </TableRow>
                      ))}
                      {employees.length === 0 && <TableRow><TableCell colSpan={6} className="text-center p-8 text-slate-500">You have no employees assigned to your team yet.</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}