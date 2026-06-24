import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { Loader2, Users, CheckSquare, Clock, AlertCircle } from "lucide-react";

export default function TeamLeadDashboard() {
  const [stats, setStats] = useState({ teamMembers: 0, activeProjects: 0, pendingApprovals: 0, openComplaints: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  const fetchDashboardStats = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: leadProfile } = await supabase
        .from('profiles')
        .select('department')
        .eq('id', user.id)
        .single();

      const currentLeadDept = leadProfile?.department || '';

      const [profilesRes, projectsRes, tasksRes, complaintsRes, leavesRes] = await Promise.all([
        supabase.from('profiles').select('id, role, department, team_lead_id'),
        supabase.from('projects').select('team_lead_id, status'),
        supabase.from('tasks').select('assigned_to, status, state'),
        supabase.from('complaints').select('user_id, status'),
        supabase.from('leaves').select('user_id, status')
      ]);

      const allProfiles = profilesRes.data || [];

      const teamMembers = allProfiles.filter(p => 
        p.id !== user.id && 
        (p.team_lead_id === user.id || (p.department === currentLeadDept && p.role?.toLowerCase() === 'employee'))
      );
      
      // ADVANCED DSA: O(1) HASH SET FOR BLAZING FAST LOOKUPS
      const teamMemberSet = new Set(teamMembers.map(m => m.id));

      const teamCount = teamMembers.length;
      const projCount = projectsRes.data?.filter(p => p.team_lead_id === user.id && p.status !== 'Completed').length || 0;

      const pendingTasks = tasksRes.data?.filter(t => {
        const s = (t.status || t.state || '').toLowerCase();
        const isPending = s.includes('pending') || s.includes('review') || s.includes('awaiting');
        // O(1) lookup speed
        return isPending && teamMemberSet.has(t.assigned_to);
      }).length || 0;

      const pendingLeaves = leavesRes.data?.filter(l => 
        l.status?.toLowerCase() === 'pending' && teamMemberSet.has(l.user_id)
      ).length || 0;

      const totalPendingApprovals = pendingTasks + pendingLeaves;

      const compCount = complaintsRes.data?.filter(c => 
        c.status === 'Open' && teamMemberSet.has(c.user_id)
      ).length || 0;

      setStats({
        teamMembers: teamCount,
        activeProjects: projCount,
        pendingApprovals: totalPendingApprovals,
        openComplaints: compCount
      });

    } catch (error) {
      console.error("Dashboard fetch error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout role="team_lead">
      <div className="max-w-6xl mx-auto space-y-8 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Team Lead Command Center</h1>
          <p className="text-muted-foreground">Overview of your team's current performance and pending action items.</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-purple-600" /></div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <Card className="bg-white border-slate-200 shadow-sm"><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium text-slate-500 uppercase">Team Members</CardTitle><Users className="w-4 h-4 text-blue-500" /></CardHeader><CardContent><div className="text-3xl font-bold text-slate-800">{stats.teamMembers}</div></CardContent></Card>
            <Card className="bg-white border-slate-200 shadow-sm"><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium text-slate-500 uppercase">Active Projects</CardTitle><CheckSquare className="w-4 h-4 text-emerald-500" /></CardHeader><CardContent><div className="text-3xl font-bold text-slate-800">{stats.activeProjects}</div></CardContent></Card>
            <Card className={`border shadow-sm ${stats.pendingApprovals > 0 ? "bg-amber-50 border-amber-200" : "bg-white border-slate-200"}`}><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className={`text-sm font-medium uppercase ${stats.pendingApprovals > 0 ? "text-amber-700" : "text-slate-500"}`}>Pending Approvals</CardTitle><Clock className={`w-4 h-4 ${stats.pendingApprovals > 0 ? "text-amber-600" : "text-slate-400"}`} /></CardHeader><CardContent><div className={`text-3xl font-bold ${stats.pendingApprovals > 0 ? "text-amber-700" : "text-slate-800"}`}>{stats.pendingApprovals}</div>{stats.pendingApprovals > 0 && <p className="text-xs text-amber-600 mt-1 font-medium">Leaves & Tasks waiting</p>}</CardContent></Card>
            <Card className="bg-white border-slate-200 shadow-sm"><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium text-slate-500 uppercase">Open Complaints</CardTitle><AlertCircle className="w-4 h-4 text-red-500" /></CardHeader><CardContent><div className="text-3xl font-bold text-slate-800">{stats.openComplaints}</div></CardContent></Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}