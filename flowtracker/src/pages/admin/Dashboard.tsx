import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Shield, UserCheck, Briefcase } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function AdminDashboard() {
  const [stats, setStats] = useState({ employees: 0, leads: 0, admins: 0, total: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const { data, error } = await supabase.from('profiles').select('role');
        if (error) throw error;
        
        if (data) {
          setStats({
            employees: data.filter((u: any) => u.role === 'employee').length,
            leads: data.filter((u: any) => u.role === 'team_lead').length,
            admins: data.filter((u: any) => u.role === 'admin').length,
            total: data.length
          });
        }
      } catch (err) {
        console.error("Error fetching stats:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  return (
    <DashboardLayout role="admin">
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="text-muted-foreground">Real-time overview of your startup database.</p>
        </div>

        {loading ? (
          <div className="p-4 text-muted-foreground">Loading secure data...</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="border-0 shadow-md">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Registered Users</CardTitle>
                <Users className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold">{stats.total}</div></CardContent>
            </Card>
            
            <Card className="border-0 shadow-md">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Base Employees</CardTitle>
                <Briefcase className="h-4 w-4 text-gray-500" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold">{stats.employees}</div></CardContent>
            </Card>

            <Card className="border-0 shadow-md">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Team Leads</CardTitle>
                <UserCheck className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold">{stats.leads}</div></CardContent>
            </Card>

            <Card className="border-0 shadow-md">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">System Admins</CardTitle>
                <Shield className="h-4 w-4 text-purple-500" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold">{stats.admins}</div></CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}