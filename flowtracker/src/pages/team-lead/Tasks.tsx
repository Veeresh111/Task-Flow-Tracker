import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Loader2, Plus, CheckSquare } from "lucide-react";

export default function Tasks() {
  const { toast } = useToast();
  const [tasks, setTasks] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [formData, setFormData] = useState({ title: '', description: '', project_id: '', assigned_to: '', status: 'pending' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchEverything = async () => {
    setLoading(true);
    // Fetch real data simultaneously
    const [taskRes, projRes, empRes] = await Promise.all([
      supabase.from('tasks').select('*, profiles(name), projects(name)').order('created_at', { ascending: false }),
      supabase.from('projects').select('id, name'),
      supabase.from('profiles').select('id, name').eq('role', 'employee')
    ]);
    
    if (taskRes.data) setTasks(taskRes.data);
    if (projRes.data) setProjects(projRes.data);
    if (empRes.data) setEmployees(empRes.data);
    setLoading(false);
  };

  useEffect(() => { fetchEverything(); }, []);

  // REAL BUTTON CONNECTION: Creates task and assigns it to employee in DB
  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('tasks').insert([{
        title: formData.title,
        description: formData.description,
        project_id: formData.project_id || null,
        assigned_to: formData.assigned_to || null,
        status: 'pending'
      }]);
      if (error) throw error;
      toast({ title: "Task Assigned Successfully!" });
      setShowAdd(false);
      setFormData({ title: '', description: '', project_id: '', assigned_to: '', status: 'pending' });
      fetchEverything();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DashboardLayout role="team_lead">
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Task Delegation</h1>
            <p className="text-muted-foreground">Assign tasks to your team members.</p>
          </div>
          <Button onClick={() => setShowAdd(!showAdd)} className="bg-blue-600 text-white">
            <Plus className="w-4 h-4 mr-2" /> {showAdd ? "Cancel" : "Assign Task"}
          </Button>
        </div>

        {showAdd && (
          <Card className="bg-blue-50/30 border-blue-200">
            <CardHeader><CardTitle>Create & Assign Task</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={handleAddTask} className="grid grid-cols-2 gap-4">
                <div className="space-y-2 col-span-2">
                  <Label>Task Title</Label>
                  <Input required placeholder="e.g. Design Login Screen" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Instructions</Label>
                  <Input placeholder="Details..." value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>Link to Project</Label>
                  <Select onValueChange={val => setFormData({...formData, project_id: val})}>
                    <SelectTrigger><SelectValue placeholder="Select Project" /></SelectTrigger>
                    <SelectContent>
                      {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Assign To Employee</Label>
                  <Select onValueChange={val => setFormData({...formData, assigned_to: val})}>
                    <SelectTrigger><SelectValue placeholder="Select Employee" /></SelectTrigger>
                    <SelectContent>
                      {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" disabled={isSubmitting} className="col-span-2 bg-blue-600 text-white mt-2">
                  {isSubmitting ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : <CheckSquare className="w-4 h-4 mr-2" />}
                  Assign Task Now
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle>All Team Tasks</CardTitle></CardHeader>
          <CardContent>
            {loading ? <div className="p-8 text-center"><Loader2 className="animate-spin w-6 h-6 mx-auto text-blue-600" /></div> : tasks.length === 0 ? <p className="text-center text-gray-500 p-8">No tasks assigned yet.</p> : (
              <Table>
                <TableHeader><TableRow><TableHead>Task</TableHead><TableHead>Project</TableHead><TableHead>Assigned To</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {tasks.map(t => (
                    <TableRow key={t.id}>
                      <TableCell className="font-bold">{t.title}</TableCell>
                      <TableCell>{t.projects?.name || "Unlinked"}</TableCell>
                      <TableCell className="text-blue-600 font-medium">{t.profiles?.name || "Unassigned"}</TableCell>
                      <TableCell><span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-bold uppercase">{t.status}</span></TableCell>
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