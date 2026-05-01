import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import DashboardLayout from "@/components/layout/DashboardLayout";

export default function Employees() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEmployees();
  }, []);

  async function fetchEmployees() {
    const { data, error } = await supabase.from('profiles').select('*').eq('role', 'employee');
    if (!error && data) setEmployees(data);
    setLoading(false);
  }

  async function promoteToLead(id: string) {
    await supabase.from('profiles').update({ role: 'team_lead' }).eq('id', id);
    fetchEmployees(); // Refresh list dynamically
  }

  return (
    <DashboardLayout role="admin">
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
        <h1 className="text-2xl font-bold mb-6 text-gray-800">Employees Directory</h1>
        {loading ? (
          <p>Loading database data...</p>
        ) : employees.length === 0 ? (
          <p className="text-gray-500">No employees found. Waiting for users to register.</p>
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
              {employees.map(emp => (
                <tr key={emp.id} className="hover:bg-gray-50 transition-colors">
                  <td className="p-4 font-medium text-gray-900">{emp.name || 'Unknown'}</td>
                  <td className="p-4 text-gray-500">{emp.email}</td>
                  <td className="p-4">
                    <button 
                      onClick={() => promoteToLead(emp.id)} 
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      Promote to Team Lead
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