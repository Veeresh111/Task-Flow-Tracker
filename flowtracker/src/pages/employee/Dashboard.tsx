import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { CheckSquare } from "lucide-react";

export default function EmployeeDashboard() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAssignedTasks = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        const { data } = await supabase
          .from('tasks')
          .select('*')
          .eq('assigned_to', user.id)
          .order('created_at', { ascending: false });
          
        if (data) setTasks(data);
      }
      setLoading(false);
    };
    fetchAssignedTasks();
  }, []);

  return (
    <DashboardLayout role="employee">
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Employee Dashboard</h1>
          <p className="text-muted-foreground">View operational queue and assigned workloads.</p>
        </div>

        <Card className="border-0 shadow-lg">
          <CardHeader className="flex flex-row items-center gap-2">
            <CheckSquare className="w-5 h-5 text-blue-600" />
            <CardTitle>My Active Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground p-4">Connecting to PostgreSQL instance...</p>
            ) : tasks.length === 0 ? (
              <div className="p-8 text-center bg-gray-50 rounded-lg border border-dashed">
                <p className="text-gray-500 font-medium">Task queue is empty.</p>
              </div>
            ) : (
               <div className="space-y-3">
                 {tasks.map(task => (
                   <div key={task.id} className="p-4 border rounded-lg bg-white shadow-sm flex justify-between items-center">
                     <div>
                       <p className="font-bold text-gray-900">{task.title}</p>
                       <p className="text-sm text-gray-500 mt-1">{task.description}</p>
                     </div>
                     <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700">
                       {task.status.toUpperCase()}
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