import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/lib/supabase";
import { Loader2, Clock, UserCircle, Calendar, Activity, Timer, TrendingUp, Award, Zap, AlertTriangle } from "lucide-react";

export default function AdminPresence() {
  const [users, setUsers] = useState<any[]>([]);
  const [workLogs, setWorkLogs] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [complaints, setComplaints] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("ALL");
  const [loading, setLoading] = useState(true);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setRenderError(null);
      
      const [profilesRes, logsRes, tasksRes, compRes] = await Promise.all([
        supabase.from('profiles').select('*').order('name', { ascending: true }),
        supabase.from('work_logs').select('*').order('created_at', { ascending: false }),
        supabase.from('tasks').select('*'),
        supabase.from('complaints').select('*')
      ]);

      if (profilesRes.error) throw new Error("Profiles Error: " + profilesRes.error.message);
      
      setUsers(profilesRes.data || []);
      setWorkLogs(logsRes.data || []);
      setTasks(tasksRes.data || []);
      setComplaints(compRes.data || []);
      
    } catch (err: any) {
      setRenderError(err.message || "Database connection error.");
    } finally {
      setLoading(false);
    }
  };

  const calculateHours = (start: string, end: string) => {
    if (!start || !end) return 0;
    try { return (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60); } 
    catch { return 0; }
  };

  const formatDateString = (iso: string) => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : "--";
  const formatTimeStr = (ms: number | null) => ms ? new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : "--";

  // ==========================================
  // FIRST-IN / LAST-OUT AGGREGATION ENGINE
  // ==========================================
  const filteredLogs = selectedUserId === "ALL" ? workLogs : workLogs.filter(log => log?.user_id === selectedUserId);
  
  const dailySummaries: { [key: string]: any } = {};
  
  filteredLogs.forEach(log => {
    const startTime = log?.clock_in || log?.created_at;
    if (!startTime) return;
    const dateStr = formatDateString(startTime);
    if (dateStr === "--") return;
    
    const key = `${log.user_id}_${dateStr}`;
    const duration = calculateHours(startTime, log?.clock_out);
    const startMs = new Date(startTime).getTime();
    const endMs = log?.clock_out ? new Date(log.clock_out).getTime() : null;
    
    if (!dailySummaries[key]) {
      dailySummaries[key] = {
        user_id: log.user_id,
        date: dateStr,
        totalHours: 0,
        status: 'Completed',
        sortDate: startMs,
        firstIn: startMs,
        lastOut: endMs
      };
    }
    
    // Accumulate exact hours
    dailySummaries[key].totalHours += duration;

    // Track Absolute First Clock-In of the day
    if (startMs < dailySummaries[key].firstIn) {
      dailySummaries[key].firstIn = startMs;
    }

    // Track Absolute Final Clock-Out of the day
    if (endMs && (!dailySummaries[key].lastOut || endMs > dailySummaries[key].lastOut)) {
      dailySummaries[key].lastOut = endMs;
    }

    // If any shift is currently active, mark the whole day as active
    if (log.status === 'Active') {
      dailySummaries[key].status = 'Active';
      dailySummaries[key].lastOut = null; // Still working
    }
  });

  const aggregatedData = Object.values(dailySummaries).sort((a, b) => b.sortDate - a.sortDate);

  const totalHours = aggregatedData.reduce((acc, sum) => acc + sum.totalHours, 0);
  const activeNowCount = workLogs.filter(log => log?.status === 'Active').length;
  
  // Overall Efficiency Engine
  const totalSystemComplaints = complaints.length || 1;
  const userStats = users.map(user => {
    const userLogs = workLogs.filter(l => l?.user_id === user?.id);
    const totalHrs = userLogs.reduce((acc, log) => acc + calculateHours((log?.clock_in || log?.created_at), log?.clock_out), 0);
    const uniqueDays = new Set(userLogs.map(l => new Date(l.created_at).toDateString())).size || 1;
    const expectedHrs = uniqueDays * 8;
    const timeScore = Math.min(100, (totalHrs / expectedHrs) * 100);

    let finalEfficiency = 0;
    if (user.role === 'ADMIN' || user.role === 'TL') {
      const resolvedComplaints = complaints.filter(c => c.status === 'Resolved' && c.admin_notes).length;
      const resolutionScore = Math.min(100, (resolvedComplaints / (totalSystemComplaints * 0.5)) * 100) || 100; 
      finalEfficiency = (timeScore * 0.5) + (resolutionScore * 0.5);
    } else {
      const totalAssigned = tasks.filter(t => t.assigned_to === user.id).length || 1;
      const completedTasks = tasks.filter(t => t.assigned_to === user.id && t.status?.toLowerCase().includes('complet')).length;
      const taskScore = (completedTasks / totalAssigned) * 100;
      finalEfficiency = (timeScore * 0.5) + (taskScore * 0.5);
    }
    return { id: user?.id, hrs: totalHrs, efficiency: Math.min(100, finalEfficiency) };
  });

  let displayEfficiency = selectedUserId === "ALL" 
    ? (users.length > 0 ? userStats.reduce((acc, u) => acc + u.efficiency, 0) / users.length : 0)
    : (userStats.find(u => u?.id === selectedUserId)?.efficiency || 0);

  if (renderError) return <DashboardLayout role="admin"><div className="p-8 text-red-600 bg-red-50 rounded-xl"><h1>Error: {renderError}</h1><button onClick={fetchData} className="mt-4 px-4 py-2 bg-red-600 text-white rounded">Retry</button></div></DashboardLayout>;

  return (
    <DashboardLayout role="admin">
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in pb-12">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <Activity className="w-8 h-8 text-blue-600" /> Executive Presence Dashboard
            </h1>
            <p className="text-slate-500 mt-1">First-In / Last-Out daily tracking & performance efficiency.</p>
          </div>
          <div className="w-full md:w-72">
            <select className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none font-medium text-slate-700" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
              <option value="ALL">🏢 Entire Company Overview</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center p-20"><Loader2 className="w-10 h-10 animate-spin text-blue-600" /></div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card><CardContent className="p-5 flex items-center gap-4"><div className="p-3 bg-blue-100 rounded-full text-blue-600"><Clock className="w-6 h-6" /></div><div><p className="text-xs font-bold text-slate-500 uppercase">Total Logged Time</p><h2 className="text-2xl font-black">{totalHours.toFixed(1)} <span className="text-sm font-medium">hrs</span></h2></div></CardContent></Card>
              <Card><CardContent className="p-5 flex items-center gap-4"><div className="p-3 bg-emerald-100 rounded-full text-emerald-600"><Zap className="w-6 h-6" /></div><div><p className="text-xs font-bold text-slate-500 uppercase">Active Right Now</p><h2 className="text-2xl font-black">{activeNowCount} <span className="text-sm font-medium">online</span></h2></div></CardContent></Card>
              <Card className="bg-amber-50 border-amber-200"><CardContent className="p-5 flex items-center gap-4"><div className="p-3 rounded-full bg-amber-100 text-amber-600"><Award className="w-6 h-6" /></div><div><p className="text-xs font-bold text-amber-700 uppercase">Overall Efficiency</p><h2 className="text-3xl font-black text-amber-900">{displayEfficiency.toFixed(0)}%</h2><p className="text-xs text-amber-700 font-medium">Based on Time + Output</p></div></CardContent></Card>
            </div>

            <Card className="shadow-sm border-slate-200">
              <CardHeader className="border-b bg-slate-50/50"><CardTitle className="text-lg flex items-center gap-2"><Timer className="w-5 h-5 text-slate-500" />Daily Aggregated Work Log</CardTitle></CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        {selectedUserId === "ALL" && <TableHead>Employee</TableHead>}
                        <TableHead>Date</TableHead>
                        <TableHead>First Clock-In</TableHead>
                        <TableHead>Final Clock-Out</TableHead>
                        <TableHead>Daily Hours</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {aggregatedData.map((summary, idx) => {
                        const user = users.find(u => u.id === summary.user_id);
                        return (
                          <TableRow key={idx}>
                            {selectedUserId === "ALL" && <TableCell className="font-medium"><div className="flex flex-col"><span>{user?.name || 'Unknown'}</span><span className="text-xs text-slate-500">{user?.role}</span></div></TableCell>}
                            <TableCell className="font-medium">{summary.date}</TableCell>
                            <TableCell className="text-emerald-600 font-medium">{formatTimeStr(summary.firstIn)}</TableCell>
                            <TableCell className="text-red-500 font-medium">{formatTimeStr(summary.lastOut)}</TableCell>
                            <TableCell className="font-bold text-slate-700">
                              {summary.status === 'Active' ? <span className="text-blue-500 text-xs">Running...</span> : `${summary.totalHours.toFixed(2)}h`}
                            </TableCell>
                            <TableCell>{summary.status === 'Active' ? <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs animate-pulse font-bold uppercase">Working</span> : <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-bold uppercase">Completed</span>}</TableCell>
                          </TableRow>
                        );
                      })}
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