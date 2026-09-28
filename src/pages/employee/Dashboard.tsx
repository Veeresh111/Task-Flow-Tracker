import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckSquare, Clock, Briefcase, AlertCircle, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { CareerPredictor } from "@/components/dashboard/CareerPredictor";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";

export default function EmployeeDashboard() {
  useEffect(() => { document.title = "Employee Dashboard - FWC"; }, []);
  const [stats, setStats] = useState({ tasks: 0, projects: 0, hours: 0, complaints: 0 });
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  // TODAY'S ATTENDANCE — derived from the actual work_logs row for today.
  const [todayLog, setTodayLog] = useState<{ clock_in: string; clock_out: string | null; status: string } | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profileData } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        if (profileData) setProfile(profileData);

        // Fetch Tasks & Calculate Unique Projects
        const { data: taskData } = await supabase.from('tasks').select('*').eq('assigned_to', user.id).order('created_at', { ascending: false });
        if (taskData) {
          setTasks(taskData);
          // FLAW 1 FIXED: Calculates exact number of unique projects from your tasks!
          const uniqueProjects = new Set(taskData.filter(t => t.project_id !== null).map(t => t.project_id));
          setStats(prev => ({ ...prev, tasks: taskData.length, projects: uniqueProjects.size }));
        }

        const { data: complaintData } = await supabase.from('complaints').select('id').eq('user_id', user.id);
        if (complaintData) setStats(prev => ({ ...prev, complaints: complaintData.length }));

        // TODAY'S ATTENDANCE: real clock-in/clock-out from today's actual work_log
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
        const { data: todayLogs } = await supabase
          .from('work_logs')
          .select('clock_in, clock_out, status')
          .eq('user_id', user.id)
          .gte('clock_in', todayStart.toISOString())
          .order('clock_in', { ascending: false })
          .limit(1);
        if (todayLogs && todayLogs.length > 0) setTodayLog(todayLogs[0]);

        // Exact Total Hours Worked Calculation
        const { data: logs } = await supabase.from('work_logs').select('*').eq('user_id', user.id).eq('status', 'Completed');
        let totalHours = 0;
        if (logs) {
          logs.forEach((log: any) => {
            if (log.clock_in && log.clock_out) {
              const start = new Date(log.clock_in).getTime();
              const end = new Date(log.clock_out).getTime();
              totalHours += (end - start) / (1000 * 60 * 60);
            }
          });
        }
        setStats(prev => ({ ...prev, hours: parseFloat(totalHours.toFixed(1)) }));
      }
      setLoading(false);
    };
    fetchData();
  }, []);

  return (
    <DashboardLayout role="employee">
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Employee Dashboard</h1>
            <p className="text-muted-foreground">Welcome back, {profile?.name || 'User'}! Here is your workflow overview.</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="border-0 shadow-md">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Assigned Tasks</CardTitle>
              <div className="p-2 bg-blue-100 rounded-lg"><CheckSquare className="w-4 h-4 text-blue-600" /></div>
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{stats.tasks}</div></CardContent>
          </Card>
          
          <Card className="border-0 shadow-md">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Projects</CardTitle>
              <div className="p-2 bg-purple-100 rounded-lg"><Briefcase className="w-4 h-4 text-purple-600" /></div>
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{stats.projects}</div></CardContent>
          </Card>
          
          <Card className="border-0 shadow-md">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Hours Logged</CardTitle>
              <div className="p-2 bg-emerald-100 rounded-lg"><Clock className="w-4 h-4 text-emerald-600" /></div>
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{stats.hours}h</div></CardContent>
          </Card>
          
          <Card className="border-0 shadow-md">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">My Complaints</CardTitle>
              <div className="p-2 bg-red-100 rounded-lg"><AlertCircle className="w-4 h-4 text-red-600" /></div>
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{stats.complaints}</div></CardContent>
          </Card>
        </div>

        {/* TODAY'S ATTENDANCE — real clock data only; honest "not clocked in yet" state. */}
        <Card className="border-0 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="w-4 h-4" /> Today's Attendance
            </CardTitle>
          </CardHeader>
          <CardContent>
            {todayLog ? (
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">Clock In</p>
                  <p className="font-bold">{new Date(todayLog.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">Clock Out</p>
                  <p className="font-bold">
                    {todayLog.clock_out
                      ? new Date(todayLog.clock_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : '— (shift open)'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">Hours Today</p>
                  <p className="font-bold">
                    {(() => {
                      if (!todayLog.clock_in) return '0h';
                      const start = new Date(todayLog.clock_in).getTime();
                      const end = todayLog.clock_out ? new Date(todayLog.clock_out).getTime() : Date.now();
                      return `${Math.max(0, (end - start) / 3600000).toFixed(1)}h`;
                    })()}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Not clocked in yet today. Your attendance will appear here after you clock in.</p>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
          <div className="lg:col-span-2">
            <Card className="border-0 shadow-lg h-full">
              <CardHeader>
                <CardTitle>My Task Queue</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
                ) : tasks.length === 0 ? (
                  <div className="p-12 text-center border-2 border-dashed rounded-lg bg-gray-50">
                    <CheckSquare className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900">No tasks assigned</h3>
                    <p className="text-gray-500">You are all caught up! Enjoy your day.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {tasks.map(task => (
                      <div key={task.id} className="flex items-center justify-between p-4 bg-white border rounded-xl hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-4">
                          <div className="p-3 bg-blue-50 rounded-full"><CheckSquare className="w-5 h-5 text-blue-600" /></div>
                          <div>
                            <h4 className="font-semibold text-gray-900">{task.title}</h4>
                            <p className="text-sm text-gray-500">{task.description || "No description provided."}</p>
                          </div>
                        </div>
                        <span className="px-3 py-1 text-xs font-semibold text-blue-700 bg-blue-100 rounded-full">
                          {task.status.toUpperCase()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          
          <div className="lg:col-span-1">
            {/* Widget isolation: a crash here degrades to a local fallback,
                never a blank dashboard (root cause of the white screens). */}
            {profile?.id && (
              <ErrorBoundary label="Career Predictor">
                <CareerPredictor userId={profile.id} />
              </ErrorBoundary>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}