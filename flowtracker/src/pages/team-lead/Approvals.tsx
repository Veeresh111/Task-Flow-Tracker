import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { CheckCircle, Loader2 } from "lucide-react";

export default function Approvals() {
  const { toast } = useToast();
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchApprovals = async () => {
    setLoading(true);
    // Find tasks that employees have marked as "Completed" awaiting final approval
    const { data } = await supabase.from('tasks').select('*, profiles(name), projects(name)').eq('status', 'completed').order('created_at', { ascending: false });
    if (data) setTasks(data);
    setLoading(false);
  };

  useEffect(() => { fetchApprovals(); }, []);

  const handleApprove = async (id: string) => {
    try {
      const { error } = await supabase.from('tasks').update({ status: 'approved_by_lead' }).eq('id', id);
      if (error) throw error;
      toast({ title: "Task Approved!" });
      setTasks(tasks.filter(t => t.id !== id));
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <DashboardLayout role="team_lead">
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Task Approvals</h1>
          <p className="text-muted-foreground">Review and approve tasks marked as Completed by your team.</p>
        </div>

        <Card className="border-0 shadow-lg">
          <CardHeader className="bg-amber-50 border-b pb-4">
            <CardTitle className="text-lg text-amber-900">Awaiting Lead Approval</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {loading ? <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-amber-600" /></div> : tasks.length === 0 ? <p className="text-center text-gray-500 p-8">No completed tasks are pending approval right now.</p> : (
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Task</TableHead><TableHead>Employee</TableHead><TableHead>Project</TableHead><TableHead>Action</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.map(task => (
                    <TableRow key={task.id}>
                      <TableCell className="font-bold">{task.title}</TableCell>
                      <TableCell className="text-blue-600 font-medium">{task.profiles?.name || 'Unknown'}</TableCell>
                      <TableCell className="text-gray-500">{task.projects?.name || 'N/A'}</TableCell>
                      <TableCell>
                        <Button onClick={() => handleApprove(task.id)} size="sm" className="bg-emerald-500 hover:bg-emerald-600 text-white">
                          <CheckCircle className="w-4 h-4 mr-2" /> Approve Task
                        </Button>
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