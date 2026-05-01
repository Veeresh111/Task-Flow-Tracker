import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import DashboardLayout from "@/components/layout/DashboardLayout";

export default function TeamLeads() {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLeads();
  }, []);

  async function fetchLeads() {
    const { data, error } = await supabase.from('profiles').select('*').eq('role', 'team_lead');
    if (!error && data) setLeads(data);
    setLoading(false);
  }

  async function demoteToEmployee(id: string) {
    await supabase.from('profiles').update({ role: 'employee' }).eq('id', id);
    fetchLeads(); // Refresh list dynamically
  }

  return (
    <DashboardLayout role="admin">
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
        <h1 className="text-2xl font-bold mb-6 text-gray-800">Team Leads Directory</h1>
        {loading ? (
          <p>Loading database data...</p>
        ) : leads.length === 0 ? (
          <p className="text-gray-500">No team leads found. Promote an employee first.</p>
        ) : (
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-gray-600 uppercase text-sm font-semibold">
              <tr>
                <th className="p-4 rounded-tl-lg">Name</th>
                <th className="p-4">Email</th>
                <th className="p-4 rounded-tr-lg">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {leads.map(lead => (
                <tr key={lead.id} className="hover:bg-gray-50 transition-colors">
                  <td className="p-4 font-medium text-gray-900">{lead.name || 'Unknown'}</td>
                  <td className="p-4 text-gray-500">{lead.email}</td>
                  <td className="p-4">
                    <button 
                      onClick={() => demoteToEmployee(lead.id)} 
                      className="bg-red-50 hover:bg-red-100 text-red-600 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      Demote to Employee
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </DashboardLayout>
  );
}