import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/lib/supabase";
import { Loader2, BarChart3, TrendingUp, TrendingDown, Users, Target, Activity, Search, Filter, Download, Mail, Eye, X } from "lucide-react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from "recharts";
import { useNavigate } from "react-router-dom"; 
import { useToast } from "@/hooks/use-toast";

export default function TeamLeadAnalytics() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [selectedEmp, setSelectedEmp] = useState<any>(null);

  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => { fetchTeamAnalytics(); }, []);

  const fetchTeamAnalytics = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: currentLeadProfile } = await supabase.from('profiles').select('department').eq('id', user.id).single();
    const currentLeadDept = currentLeadProfile?.department || '';

    const [profilesRes, tasksRes, logsRes] = await Promise.all([
      supabase.from('profiles').select('*'),
      supabase.from('tasks').select('*'),
      supabase.from('work_logs').select('*')
    ]);

    const allProfiles = profilesRes.data || [];
    const tasks = tasksRes.data || [];
    const logs = logsRes.data || [];

    const profiles = allProfiles.filter(p => 
      p.id !== user.id && 
      (p.team_lead_id === user.id || (p.department === currentLeadDept && p.role === 'employee'))
    );

    // ADVANCED DSA: HASH TABLE INDEXING FOR O(1) LOOKUPS
    // This entirely removes the O(N * M) nested looping delay.
    const taskMap = new Map();
    tasks.forEach(t => {
      if (!taskMap.has(t.assigned_to)) taskMap.set(t.assigned_to, []);
      taskMap.get(t.assigned_to).push(t);
    });

    const logMap = new Map();
    logs.forEach(l => {
      if (!logMap.has(l.user_id)) logMap.set(l.user_id, []);
      logMap.get(l.user_id).push(l);
    });

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
      // O(1) Instant Lookup
      const empTasks = taskMap.get(emp.id) || [];
      const assignedCount = empTasks.length;
      const completedCount = empTasks.filter((t: any) => t.status?.toLowerCase().includes('complet')).length;
      
      // O(1) Instant Lookup
      const empLogs = logMap.get(emp.id) || [];
      const totalHrs = empLogs.reduce((acc: number, log: any) => acc + calculateHours((log.clock_in || log.created_at), log.clock_out), 0);

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

  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = emp.name.toLowerCase().includes(searchTerm.toLowerCase()) || emp.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === "All" || emp.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const exportToCSV = () => {
    const headers = ["Name,Email,Assigned Tasks,Completed Tasks,Completion Rate (%),Total Hours,Status"];
    const rows = filteredEmployees.map(emp =>
      `"${emp.name}","${emp.email}",${emp.assignedTasks},${emp.completedTasks},${emp.completionRate.toFixed(2)},${emp.totalHours.toFixed(2)},"${emp.status}"`
    );
    const csvContent = "data:text/csv;charset=utf-8," + headers.concat(rows).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "team_analytics_report.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const pieColors = ['#10b981', '#3b82f6', '#ef4444', '#94a3b8'];
  const pieData = [
    { name: 'Top Performer', value: employees.filter(e => e.status === 'Top Performer').length },
    { name: 'Solid', value: employees.filter(e => e.status === 'Solid').length },
    { name: 'Underperforming', value: employees.filter(e => e.status === 'Underperforming').length },
    { name: 'Other', value: employees.filter(e => !["Top Performer", "Solid", "Underperforming"].includes(e.status)).length },
  ].filter(d => d.value > 0);

  const handleOneOnOneSync = async (emp: any) => {
    try {
      const { error } = await supabase.from('notifications').insert([{
        user_id: emp.id,
        title: "1-on-1 Sync Request",
        message: "Your Team Lead has requested a 1-on-1 performance sync with you.",
        is_read: false,
        created_at: new Date().toISOString()
      }]);
      if (!error) toast({ title: "Notification Sent", description: `${emp.name} was notified.` });
    } catch (error) { console.error("Failed to push notification", error); }

    localStorage.setItem('activeChatUserId', emp.id);
    localStorage.setItem('activeChatUserName', emp.name);
    navigate(`/team-lead/chat?userId=${emp.id}`, { state: { selectedUserId: emp.id, selectedUserName: emp.name } });
  };

  return (
    <DashboardLayout role="team_lead">
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in pb-12">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-8 h-8 text-blue-600" /> Team Performance Metrics
          </h1>
          <p className="text-slate-500 mt-1">Monitor the productivity and task completion of your assigned team members.</p>
        </div>

        {loading ? <div className="flex justify-center p-20"><Loader2 className="w-10 h-10 animate-spin text-blue-600" /></div> : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="shadow-sm border-slate-200"><CardContent className="p-5 flex items-center gap-4"><div className="p-3 bg-slate-100 text-slate-600 rounded-full"><Users className="w-5 h-5"/></div><div><p className="text-xs font-bold text-slate-500 uppercase">My Team Size</p><h2 className="text-2xl font-black text-slate-800">{employees.length}</h2></div></CardContent></Card>
              <Card className="shadow-sm border-emerald-200 bg-emerald-50/30"><CardContent className="p-5 flex items-center gap-4"><div className="p-3 bg-emerald-100 text-emerald-600 rounded-full"><TrendingUp className="w-5 h-5"/></div><div><p className="text-xs font-bold text-emerald-700 uppercase">Top Performers</p><h2 className="text-2xl font-black text-slate-800">{employees.filter(e => e.status === "Top Performer").length}</h2></div></CardContent></Card>
              <Card className="shadow-sm border-blue-200 bg-blue-50/30"><CardContent className="p-5 flex items-center gap-4"><div className="p-3 bg-blue-100 text-blue-600 rounded-full"><Activity className="w-5 h-5"/></div><div><p className="text-xs font-bold text-blue-700 uppercase">Solid Core</p><h2 className="text-2xl font-black text-slate-800">{employees.filter(e => e.status === "Solid").length}</h2></div></CardContent></Card>
              <Card className="shadow-sm border-red-200 bg-red-50/30"><CardContent className="p-5 flex items-center gap-4"><div className="p-3 bg-red-100 text-red-600 rounded-full"><TrendingDown className="w-5 h-5"/></div><div><p className="text-xs font-bold text-red-700 uppercase">Needs Attention</p><h2 className="text-2xl font-black text-slate-800">{employees.filter(e => e.status === "Underperforming").length}</h2></div></CardContent></Card>
            </div>

            {employees.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="shadow-sm border-slate-200">
                  <CardHeader className="border-b bg-slate-50/50"><CardTitle className="text-lg text-slate-800">Team Status Distribution</CardTitle></CardHeader>
                  <CardContent className="p-6 h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value">
                          {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={pieColors[index % pieColors.length]} />)}
                        </Pie>
                        <RechartsTooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card className="shadow-sm border-slate-200">
                  <CardHeader className="border-b bg-slate-50/50"><CardTitle className="text-lg text-slate-800">Completion Rates by Employee</CardTitle></CardHeader>
                  <CardContent className="p-6 h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={filteredEmployees.slice(0, 10)} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                        <XAxis dataKey="name" tick={{fontSize: 12}} />
                        <YAxis />
                        <RechartsTooltip cursor={{fill: '#f1f5f9'}} />
                        <Bar dataKey="completionRate" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Completion Rate (%)" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            )}

            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
              <div className="flex w-full sm:w-auto items-center gap-3">
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input 
                    type="text" 
                    placeholder="Search employee..." 
                    className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <div className="relative w-full sm:w-48">
                  <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <select 
                    className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                  >
                    <option value="All">All Statuses</option>
                    <option value="Top Performer">Top Performers</option>
                    <option value="Solid">Solid</option>
                    <option value="Underperforming">Needs Attention</option>
                  </select>
                </div>
              </div>
              <button onClick={exportToCSV} className="w-full sm:w-auto flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                <Download className="w-4 h-4" /> Export Report
              </button>
            </div>

            <Card className="shadow-sm border-slate-200">
              <CardHeader className="border-b bg-slate-50/50"><CardTitle className="text-lg text-slate-800 flex items-center gap-2"><Target className="w-5 h-5 text-blue-500" /> My Team Analytics</CardTitle></CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-50"><TableRow><TableHead className="font-bold">Employee</TableHead><TableHead className="font-bold">Total Logged Hours</TableHead><TableHead className="font-bold text-center">Tasks Assigned</TableHead><TableHead className="font-bold text-center">Tasks Completed</TableHead><TableHead className="font-bold">Completion Rate</TableHead><TableHead className="font-bold">System Rating</TableHead><TableHead className="font-bold text-right">Actions</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {filteredEmployees.map(emp => (
                        <TableRow key={emp.id} className="hover:bg-slate-50">
                          <TableCell><div className="font-bold text-slate-900">{emp.name}</div><div className="text-xs text-slate-500">{emp.email}</div></TableCell>
                          <TableCell className="font-medium text-slate-700">{emp.totalHours.toFixed(1)} hrs</TableCell>
                          <TableCell className="text-center font-medium text-amber-600">{emp.assignedTasks}</TableCell>
                          <TableCell className="text-center font-bold text-emerald-600">{emp.completedTasks}</TableCell>
                          <TableCell><div className="w-full bg-slate-200 rounded-full h-2.5 mb-1 max-w-[100px]"><div className={`h-2.5 rounded-full ${emp.completionRate >= 80 ? 'bg-emerald-500' : emp.completionRate >= 50 ? 'bg-blue-500' : 'bg-red-500'}`} style={{ width: `${emp.completionRate}%` }}></div></div><span className="text-xs font-bold text-slate-600">{emp.completionRate.toFixed(0)}%</span></TableCell>
                          <TableCell>{getStatusBadge(emp.status)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <button onClick={() => setSelectedEmp(emp)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-colors" title="View Details">
                                <Eye className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleOneOnOneSync(emp)} className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-md transition-colors" title="Schedule 1-on-1">
                                <Mail className="w-4 h-4" />
                              </button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {filteredEmployees.length === 0 && <TableRow><TableCell colSpan={7} className="text-center p-8 text-slate-500">No employees found matching your criteria.</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {selectedEmp && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-slate-50">
              <div>
                <h2 className="text-2xl font-bold text-slate-800">{selectedEmp.name}</h2>
                <p className="text-sm text-slate-500">{selectedEmp.email}</p>
              </div>
              <button onClick={() => setSelectedEmp(null)} className="p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-700 rounded-full transition-colors"><X className="w-5 h-5"/></button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-100">
                <span className="font-semibold text-slate-700">Current AI Assessment:</span>
                {getStatusBadge(selectedEmp.status)}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 text-center">
                  <p className="text-xs font-bold text-blue-600 uppercase mb-1">Total Hours</p>
                  <p className="text-2xl font-black text-slate-800">{selectedEmp.totalHours.toFixed(1)}</p>
                </div>
                <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-100 text-center">
                  <p className="text-xs font-bold text-amber-600 uppercase mb-1">Assigned</p>
                  <p className="text-2xl font-black text-slate-800">{selectedEmp.assignedTasks}</p>
                </div>
                <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-100 text-center">
                  <p className="text-xs font-bold text-emerald-600 uppercase mb-1">Completed</p>
                  <p className="text-2xl font-black text-slate-800">{selectedEmp.completedTasks}</p>
                </div>
                <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 text-center">
                  <p className="text-xs font-bold text-indigo-600 uppercase mb-1">Success Rate</p>
                  <p className="text-2xl font-black text-slate-800">{selectedEmp.completionRate.toFixed(0)}%</p>
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button onClick={() => handleOneOnOneSync(selectedEmp)} className="flex-1 flex justify-center items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-xl transition-all shadow-sm">
                  <Mail className="w-4 h-4"/> Schedule 1-on-1 Sync
                </button>
                <button onClick={() => setSelectedEmp(null)} className="flex-1 flex justify-center items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-2.5 rounded-xl transition-all">
                  Close Report
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}