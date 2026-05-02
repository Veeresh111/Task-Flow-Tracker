import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Briefcase, CheckSquare, Clock, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function TeamLeadDashboard() {
  const [stats, setStats] = useState({ teamSize: 0, projects: 0, tasks: 0, pendingApprovals: 0 });
  const [team, setTeam] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          // Get Actual Employees in Database
          const { data: teamData } = await supabase.from('profiles').select('*').eq('role', 'employee');
          if (teamData) {
            setTeam(teamData);
            setStats(s => ({ ...s, teamSize: teamData.length }));
          }

          // Get Actual Projects and Tasks Counts
          const { count: projCount } = await supabase.from('projects').select('*', { count: 'exact', head: true });
          const { count: taskCount } = await supabase.from('tasks').select('*', { count: 'exact', head: true });
          
          setStats(s => ({ 
            ...s, 
            projects: projCount || 0, 
            tasks: taskCount || 0,
            pendingApprovals: 0
          }));
        }
      } catch (error) {
        console.error("Dashboard fetch error:", error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchDashboardData();
  }, []);

  return (
    <DashboardLayout role="team_lead">
      <div className="space-y-6 animate-fade-in">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Team Lead Overview</h1>
            <p className="text-muted-foreground">Monitor your team's real-time progress and active projects.</p>
          </div>
        </div>

        {/* RESTORED ORIGINAL FRONTEND CARDS */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="border-0 shadow-md">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Team Members</CardTitle>
              <div className="p-2 bg-blue-100 rounded-lg"><Users className="w-4 h-4 text-blue-600" /></div>
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{stats.teamSize}</div></CardContent>
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
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Tasks</CardTitle>
              <div className="p-2 bg-emerald-100 rounded-lg"><CheckSquare className="w-4 h-4 text-emerald-600" /></div>
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{stats.tasks}</div></CardContent>
          </Card>
          
          <Card className="border-0 shadow-md">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pending Approvals</CardTitle>
              <div className="p-2 bg-amber-100 rounded-lg"><Clock className="w-4 h-4 text-amber-600" /></div>
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{stats.pendingApprovals}</div></CardContent>
          </Card>
        </div>

        {/* RESTORED ORIGINAL TEAM ROSTER COMPONENT */}
        <Card className="border-0 shadow-lg mt-6">
          <CardHeader>
            <CardTitle>My Team Roster</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
            ) : team.length === 0 ? (
              <div className="p-8 text-center text-gray-500 bg-gray-50 rounded-lg border border-dashed">
                No employees are registered in your team yet.
              </div>
            ) : (
              <div className="space-y-4">
                {team.slice(0, 5).map(member => (
                  <div key={member.id} className="flex items-center justify-between p-4 bg-white border rounded-xl hover:shadow-md transition-all">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white font-bold shadow-inner">
                        {member.name?.charAt(0).toUpperCase() || 'U'}
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-900">{member.name || 'Unnamed Employee'}</h4>
                        <p className="text-sm text-gray-500">{member.email}</p>
                      </div>
                    </div>
                    <span className="text-sm font-medium text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                      {member.department || 'N/A'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}