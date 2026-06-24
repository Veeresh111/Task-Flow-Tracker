import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { Loader2, BarChart3, Clock, CheckSquare, Target, Activity } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";

export default function EmployeeAnalytics() {
  const [stats, setStats] = useState<any>(null);
  const [pieData, setPieData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchPersonalStats(); }, []);

  const fetchPersonalStats = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [tasksRes, logsRes] = await Promise.all([
      supabase.from('tasks').select('*').eq('assigned_to', user.id),
      supabase.from('work_logs').select('*').eq('user_id', user.id)
    ]);

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

    const assignedCount = tasks.length;
    const completedCount = tasks.filter(t => t.status?.toLowerCase().includes('complet')).length;
    const pendingCount = assignedCount - completedCount;
    const totalHrs = logs.reduce((acc, log) => acc + calculateHours((log.clock_in || log.created_at), log.clock_out), 0);
    const completionRate = assignedCount > 0 ? (completedCount / assignedCount) * 100 : 0;

    setStats({ assignedTasks: assignedCount, completedTasks: completedCount, completionRate, totalHours: totalHrs });
    setPieData([{ name: "Completed", value: completedCount, color: "#10b981" }, { name: "In Progress", value: pendingCount, color: "#f59e0b" }].filter(d => d.value > 0));
    setLoading(false);
  };

  return (
    <DashboardLayout role="employee">
      <div className="max-w-5xl mx-auto space-y-6 animate-fade-in pb-12">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200"><h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2"><BarChart3 className="w-8 h-8 text-blue-600" /> My Analytics Dashboard</h1><p className="text-slate-500 mt-1">Review your personal productivity, task completion rates, and logged hours.</p></div>

        {loading ? <div className="flex justify-center p-20"><Loader2 className="w-10 h-10 animate-spin text-blue-600" /></div> : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="shadow-sm border-slate-200"><CardContent className="p-5 flex items-center gap-4"><div className="p-3 bg-blue-100 text-blue-600 rounded-full"><Clock className="w-5 h-5"/></div><div><p className="text-xs font-bold text-slate-500 uppercase">Logged Hours</p><h2 className="text-2xl font-black text-slate-800">{stats.totalHours.toFixed(1)} <span className="text-sm font-medium text-slate-500">hrs</span></h2></div></CardContent></Card>
              <Card className="shadow-sm border-slate-200"><CardContent className="p-5 flex items-center gap-4"><div className="p-3 bg-slate-100 text-slate-600 rounded-full"><Target className="w-5 h-5"/></div><div><p className="text-xs font-bold text-slate-500 uppercase">Assigned Tasks</p><h2 className="text-2xl font-black text-slate-800">{stats.assignedTasks}</h2></div></CardContent></Card>
              <Card className="shadow-sm border-emerald-200 bg-emerald-50/30"><CardContent className="p-5 flex items-center gap-4"><div className="p-3 bg-emerald-100 text-emerald-600 rounded-full"><CheckSquare className="w-5 h-5"/></div><div><p className="text-xs font-bold text-emerald-700 uppercase">Completed</p><h2 className="text-2xl font-black text-emerald-800">{stats.completedTasks}</h2></div></CardContent></Card>
              <Card className="shadow-sm border-blue-200 bg-blue-50/30"><CardContent className="p-5 flex items-center gap-4"><div className="p-3 bg-blue-100 text-blue-600 rounded-full"><Activity className="w-5 h-5"/></div><div><p className="text-xs font-bold text-blue-700 uppercase">Success Rate</p><h2 className="text-2xl font-black text-blue-800">{stats.completionRate.toFixed(0)}%</h2></div></CardContent></Card>
            </div>

            <Card className="shadow-sm border-slate-200 mt-6 max-w-2xl mx-auto"><CardContent className="p-6"><h3 className="font-bold text-center text-slate-700 mb-6">Task Completion Distribution</h3><div className="h-[250px] w-full">{pieData.length > 0 ? (<ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" stroke="none">{pieData.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.color} />))}</Pie><Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} /><Legend verticalAlign="bottom" height={36} iconType="circle" /></PieChart></ResponsiveContainer>) : (<div className="flex h-full items-center justify-center text-slate-400">No tasks assigned to you yet.</div>)}</div></CardContent></Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}