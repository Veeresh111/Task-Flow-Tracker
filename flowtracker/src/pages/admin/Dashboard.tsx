import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import DashboardLayout from "@/components/layout/DashboardLayout";

export default function AdminDashboard() {
  const [stats, setStats] = useState({ employees: 0, leads: 0, admins: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      const { data } = await supabase.from('profiles').select('role');
      if (data) {
        setStats({
          employees: data.filter(u => u.role === 'employee').length,
          leads: data.filter(u => u.role === 'team_lead').length,
          admins: data.filter(u => u.role === 'admin').length,
        });
      }
      setLoading(false);
    }
    fetchStats();
  }, []);

  return (
    <DashboardLayout role="admin">
      <h1 className="text-3xl font-bold mb-8 text-gray-800">Admin Dashboard</h1>
      {loading ? (
        <p>Loading real-time statistics...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <h3 className="text-gray-500 font-medium mb-2">Base Employees</h3>
            <p className="text-4xl font-bold text-gray-900">{stats.employees}</p>
          </div>
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <h3 className="text-gray-500 font-medium mb-2">Team Leads</h3>
            <p className="text-4xl font-bold text-blue-600">{stats.leads}</p>
          </div>
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <h3 className="text-gray-500 font-medium mb-2">System Admins</h3>
            <p className="text-4xl font-bold text-purple-600">{stats.admins}</p>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}