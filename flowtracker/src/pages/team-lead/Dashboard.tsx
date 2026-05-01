import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useAuth } from "@/lib/auth-context";
import { listTasksForTeamLead, type TaskWithRefs } from "@/lib/db/tasks";

export default function TeamLeadDashboard() {
  const { profile } = useAuth();
  const [tasks, setTasks] = useState<TaskWithRefs[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTasks() {
      if (!profile) return;
      const { data, error } = await listTasksForTeamLead(profile.id);
      if (!error && data) setTasks(data);
      setLoading(false);
    }
    fetchTasks();
  }, [profile?.id]);

  return (
    <DashboardLayout role="team_lead" userName={profile?.name || "Team Lead"} userEmail={profile?.email || ""}>
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
        <h1 className="text-2xl font-bold mb-6 text-gray-800">Team Lead Overview</h1>
        {loading ? (
          <p>Syncing with database...</p>
        ) : tasks.length === 0 ? (
          <p className="text-gray-500">No active tasks. Awaiting project creation.</p>
        ) : (
          <ul className="space-y-4">
            {tasks.map(task => (
              <li key={task.id} className="p-4 border border-gray-100 rounded-lg shadow-sm">
                <h3 className="font-bold text-gray-900">{task.title}</h3>
                <p className="text-sm text-gray-500 mt-1">Status: <span className="font-medium text-blue-600">{task.status}</span></p>
                <p className="text-sm text-gray-500">Assigned To: {task.assignee?.name || 'Unassigned'}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </DashboardLayout>
  );
}
