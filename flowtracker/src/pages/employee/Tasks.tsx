import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Loader2, CheckSquare } from "lucide-react";

export default function EmployeeTasks() {
  const { toast } = useToast();
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMyTasks = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      // REAL DATA: Fetch only tasks assigned to this specific employee
      const { data, error } = await supabase
        .from('tasks')
        .select('*, projects(name)')
        .eq('assigned_to', user.id)
        .order('created_at', { ascending: false });
        
      if (!error && data) setTasks(data);
    }
    setLoading(false);
  };

  useEffect(() => { fetchMyTasks(); }, []);

  // REAL CONNECTION: Updates the task status in the database instantly
  const updateTaskStatus = async (taskId: string, newStatus: string) => {
    try {
      const { error } = await supabase.from('tasks').update({ status: newStatus }).eq('id', taskId);
      if (error) throw error;
      
      setTasks(tasks.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
      toast({ title: "Status Updated", description: "Your progress has been saved." });
    } catch (err: any) {
      toast({ title: "Update Failed", description: err.message, variant: "destructive" });
    }
  };

  return (
    <DashboardLayout role="employee">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Assignments</h1>
          <p className="text-muted-foreground">Manage and update the tasks assigned to you by your Team Lead.</p>
        </div>

        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckSquare className="w-5 h-5 text-blue-600" /> Task List
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
            ) : tasks.length === 0 ? (
              <div className="p-12 text-center bg-gray-50 border-2 border-dashed rounded-lg">
                <p className="text-gray-500 font-medium">You have no tasks assigned yet.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Task Title</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Update Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.map(task => (
                    <TableRow key={task.id}>
                      <TableCell className="font-bold">{task.title}</TableCell>
                      <TableCell className="text-gray-500">{task.description || "N/A"}</TableCell>
                      <TableCell>{task.projects?.name || "Unlinked"}</TableCell>
                      <TableCell>
                        <Select value={task.status} onValueChange={(val) => updateTaskStatus(task.id, val)}>
                          <SelectTrigger className="w-[140px]">
                            <SelectValue placeholder="Status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="in_progress">In Progress</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}