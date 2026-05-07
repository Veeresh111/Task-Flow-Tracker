import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/lib/supabase";
import { Loader2, BarChart3, TrendingUp, TrendingDown, Users, Target, Activity, PieChart as PieChartIcon } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

export default function AdminAnalytics() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Chart Data States
  const [pieData, setPieData] = useState<any[]>([]);
  const [barData, setBarData] = useState<any[]>([]);

  useEffect(() => {
    fetchDetailedAnalytics();
  }, []);

  const fetchDetailedAnalytics = async () => {
    setLoading(true);
    
    // FETCH FIX: Fetch ALL profiles first to bypass Supabase case-sensitivity
    const [profilesRes, tasksRes, logsRes] = await Promise.all([
      supabase.from('profiles').select('*'), 
      supabase.from('tasks').select('*'),
      supabase.from('work_logs').select('*')
    ]);

    // Safely filter for employees regardless of how 'Employee' is capitalized in the DB
    const profiles = profilesRes.data?.filter(p => p.role && p.role.toUpperCase() === 'EMPLOYEE') || [];
    const tasks = tasksRes.data || [];
    const logs = logsRes.data || [];

    const calculateHours = (start: string, end: string) => {
      if (!start || !end) return 0;
      try { return (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60); } 
      catch { return 0; }
    };

    // Calculate advanced metrics for every employee
    const analyticsData = profiles.map(emp => {
      const empTasks = tasks.filter(t => t.assigned_to === emp.id);
      const assignedCount = empTasks.length;
      const completedCount = empTasks.filter(t => t.status?.toLowerCase().includes('complet')).length;
      
      const empLogs = logs.filter(l => l.user_id === emp.id);
      const totalHrs = empLogs.reduce((acc, log) => acc + calculateHours((log.clock_in || log.created_at), log.clock_out), 0);

      // Performance Algorithm
      let completionRate = assignedCount > 0 ? (completedCount / assignedCount) * 100 : 0;
      let performanceStatus = "No Data";
      
      if (assignedCount > 0) {
        if (completionRate >= 80) performanceStatus = "Top Performer";
        else if (completionRate >= 50) performanceStatus = "Solid";
        else performanceStatus = "Underperforming";
      } else if (totalHrs > 0) {
        performanceStatus = "Working (No Tasks)";
      }

      return {
        id: emp.id,
        name: emp.name,
        email: emp.email,
        assignedTasks: assignedCount,
        completedTasks: completedCount,
        completionRate: completionRate,
        totalHours: totalHrs,
        status: performanceStatus
      };
    });

    // Sort by completion rate descending for the table
    analyticsData.sort((a, b) => b.completionRate - a.completionRate);
    setEmployees(analyticsData);

    // ==========================================
    // GENERATE GRAPH DATA
    // ==========================================
    
    // 1. Pie Chart Data (Distribution of Performance)
    const topCount = analyticsData.filter(e => e.status === "Top Performer").length;
    const solidCount = analyticsData.filter(e => e.status === "Solid").length;
    const underCount = analyticsData.filter(e => e.status === "Underperforming").length;
    const workingCount = analyticsData.filter(e => e.status === "Working (No Tasks)" || e.status === "No Data").length;
    
    setPieData([
      { name: "Top Performers", value: topCount, color: "#10b981" }, // Emerald
      { name: "Solid", value: solidCount, color: "#3b82f6" }, // Blue
      { name: "Needs Attention", value: underCount, color: "#ef4444" }, // Red
      { name: "No Data / Unassigned", value: workingCount, color: "#94a3b8" } // Slate
    ].filter(d => d.value > 0)); // Only show slices that have data

    // 2. Bar Chart Data (Top 10 Employees by Tasks Completed)
    const chartBarData = [...analyticsData]
      .sort((a, b) => b.completedTasks - a.completedTasks)
      .slice(0, 10)
      .map(emp => ({
        name: emp.name.split(" ")[0], // Use first name for cleaner chart
        Completed: emp.completedTasks,
        Assigned: emp.assignedTasks
      }));
    setBarData(chartBarData);

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

  const topPerformers = employees.filter(e => e.status === "Top Performer").length;
  const underperformers = employees.filter(e => e.status === "Underperforming").length;

  return (
    <DashboardLayout role="admin">
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in pb-12">
        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-8 h-8 text-blue-600" /> Employee Performance Matrix
          </h1>
          <p className="text-slate-500 mt-1">Detailed evaluation of individual productivity and task completion rates.</p>
        </div>

        {loading ? <div className="flex justify-center p-20"><Loader2 className="w-10 h-10 animate-spin text-blue-600" /></div> : (
          <>
            {/* KPI CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="shadow-sm border-slate-200">
                <CardContent className="p-6 flex items-center gap-4">
                  <div className="p-4 bg-blue-100 text-blue-600 rounded-full"><Users className="w-6 h-6"/></div>
                  <div><p className="text-sm font-bold text-slate-500 uppercase">Total Employees</p><h2 className="text-3xl font-black text-slate-800">{employees.length}</h2></div>
                </CardContent>
              </Card>
              <Card className="shadow-sm border-emerald-200 bg-emerald-50/30">
                <CardContent className="p-6 flex items-center gap-4">
                  <div className="p-4 bg-emerald-100 text-emerald-600 rounded-full"><TrendingUp className="w-6 h-6"/></div>
                  <div><p className="text-sm font-bold text-emerald-700 uppercase">Top Performers</p><h2 className="text-3xl font-black text-emerald-800">{topPerformers}</h2></div>
                </CardContent>
              </Card>
              <Card className="shadow-sm border-red-200 bg-red-50/30">
                <CardContent className="p-6 flex items-center gap-4">
                  <div className="p-4 bg-red-100 text-red-600 rounded-full"><TrendingDown className="w-6 h-6"/></div>
                  <div><p className="text-sm font-bold text-red-700 uppercase">Needs Attention</p><h2 className="text-3xl font-black text-red-800">{underperformers}</h2></div>
                </CardContent>
              </Card>
            </div>

            {/* DETAILED TABLE */}
            <Card className="shadow-sm border-slate-200">
              <CardHeader className="border-b bg-slate-50/50">
                <CardTitle className="text-lg text-slate-800 flex items-center gap-2">
                  <Target className="w-5 h-5 text-blue-500" /> Individual Analytics Report
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead className="font-bold">Employee</TableHead>
                        <TableHead className="font-bold">Total Logged Hours</TableHead>
                        <TableHead className="font-bold text-center">Tasks Assigned</TableHead>
                        <TableHead className="font-bold text-center">Tasks Completed</TableHead>
                        <TableHead className="font-bold">Completion Rate</TableHead>
                        <TableHead className="font-bold">System Rating</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {employees.map(emp => (
                        <TableRow key={emp.id} className="hover:bg-slate-50">
                          <TableCell>
                            <div className="font-bold text-slate-900">{emp.name}</div>
                            <div className="text-xs text-slate-500">{emp.email}</div>
                          </TableCell>
                          <TableCell className="font-medium text-slate-700">{emp.totalHours.toFixed(1)} hrs</TableCell>
                          <TableCell className="text-center font-medium text-amber-600">{emp.assignedTasks}</TableCell>
                          <TableCell className="text-center font-bold text-emerald-600">{emp.completedTasks}</TableCell>
                          <TableCell>
                            <div className="w-full bg-slate-200 rounded-full h-2.5 mb-1 max-w-[100px]">
                              <div className={`h-2.5 rounded-full ${emp.completionRate >= 80 ? 'bg-emerald-500' : emp.completionRate >= 50 ? 'bg-blue-500' : 'bg-red-500'}`} style={{ width: `${emp.completionRate}%` }}></div>
                            </div>
                            <span className="text-xs font-bold text-slate-600">{emp.completionRate.toFixed(0)}%</span>
                          </TableCell>
                          <TableCell>{getStatusBadge(emp.status)}</TableCell>
                        </TableRow>
                      ))}
                      {employees.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center p-8 text-slate-500">No employee records found.</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* GRAPHS SECTION */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4">
              
              {/* BAR CHART */}
              <Card className="shadow-sm border-slate-200">
                <CardHeader className="border-b bg-slate-50/50">
                  <CardTitle className="text-lg text-slate-800 flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-blue-500" /> Task Completion Volume
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="h-[300px] w-full">
                    {barData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={barData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                          <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                          <Legend wrapperStyle={{ paddingTop: '20px' }} />
                          <Bar dataKey="Assigned" fill="#94a3b8" radius={[4, 4, 0, 0]} barSize={30} />
                          <Bar dataKey="Completed" fill="#10b981" radius={[4, 4, 0, 0]} barSize={30} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex h-full items-center justify-center text-slate-400">Not enough task data for chart.</div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* PIE CHART */}
              <Card className="shadow-sm border-slate-200">
                <CardHeader className="border-b bg-slate-50/50">
                  <CardTitle className="text-lg text-slate-800 flex items-center gap-2">
                    <PieChartIcon className="w-5 h-5 text-purple-500" /> Overall Company Health
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="h-[300px] w-full">
                    {pieData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={pieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={70}
                            outerRadius={100}
                            paddingAngle={5}
                            dataKey="value"
                            stroke="none"
                          >
                            {pieData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                          <Legend verticalAlign="bottom" height={36} iconType="circle" />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex h-full items-center justify-center text-slate-400">Not enough performance data for chart.</div>
                    )}
                  </div>
                </CardContent>
              </Card>

            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}