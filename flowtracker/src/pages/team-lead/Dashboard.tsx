import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Briefcase, CheckSquare } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";

export default function TeamLeadDashboard() {
  const { toast } = useToast();
  const [stats, setStats] = useState({ team: 0, projects: 0, tasks: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSystemState = async () => {
      try {
        setLoading(true);
        // Execute parallel concurrent asynchronous queries 
        const [teamRes, projectsRes, tasksRes] = await Promise.all([
          supabase.from('profiles').select('id', { count: 'exact' }).eq('role', 'employee'),
          supabase.from('projects').select('id', { count: 'exact' }),
          supabase.from('tasks').select('id', { count: 'exact' })
        ]);

        setStats({
          team: teamRes.count || 0,
          projects: projectsRes.count || 0,
          tasks: tasksRes.count || 0
        });
      } catch (error: any) {
        toast({ title: "Query Error", description: error.message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };
    
    fetchSystemState();
  }, [toast]);

  return (
    <DashboardLayout role="team_lead">
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Team Lead Dashboard</h1>
          <p className="text-muted-foreground">Operational metrics overview.</p>
        </div>

        {loading ? (
          <p className="text-muted-foreground">Executing data fetch...</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Department Employees</CardTitle>
                <Users className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold">{stats.team}</div></CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Active Projects</CardTitle>
                <Briefcase className="h-4 w-4 text-purple-500" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold">{stats.projects}</div></CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total Tasks</CardTitle>
                <CheckSquare className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold">{stats.tasks}</div></CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}