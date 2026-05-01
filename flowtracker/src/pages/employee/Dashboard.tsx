import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useAuth } from "@/lib/auth-context";
import { listMyTasks, type TaskWithRefs } from "@/lib/db/tasks";

export default function EmployeeDashboard() {
  const { profile } = useAuth();
  const [myTasks, setMyTasks] = useState<TaskWithRefs[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchMyTasks() {
      if (!profile) return;
      const { data, error } = await listMyTasks(profile.id);
      if (!error && data) setMyTasks(data);
      setLoading(false);
    }
    fetchMyTasks();
  }, [profile?.id]);

  return (
    <DashboardLayout role="employee" userName={profile?.name || "Employee"} userEmail={profile?.email || ""}>
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
        <h1 className="text-2xl font-bold mb-6 text-gray-800">My Task Queue</h1>
        {loading ? (
          <p>Loading your assigned tasks...</p>
        ) : myTasks.length === 0 ? (
          <p className="text-gray-500 italic">Your queue is empty. Awaiting assignments from your Team Lead.</p>
        ) : (
          <ul className="space-y-4">
            {myTasks.map(task => (
              <li key={task.id} className="p-4 border border-gray-100 rounded-lg shadow-sm border-l-4 border-l-blue-500">
                <h3 className="font-bold text-gray-900">{task.title}</h3>
                <p className="text-sm text-gray-500 mt-2 text-blue-600 font-medium">{task.status}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </DashboardLayout>
  );
}
