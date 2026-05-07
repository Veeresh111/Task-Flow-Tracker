import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Loader2, CheckSquare, Edit, Trash2, Plus, UserCircle, X, ClipboardList } from "lucide-react";

export default function TeamLeadTasks() {
  const { toast } = useToast();
  const [tasks, setTasks] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [allProfiles, setAllProfiles] = useState<any[]>([]); // Added to safely map names
  const [loading, setLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ title: "", description: "", complexity: "Medium", status: "Pending", assigned_to: "" });

  useEffect(() => { fetchTasks(); }, []);

  const fetchTasks = async () => {
    setLoading(true);
    
    // BULLETPROOF FETCH: Fetches tables separately to prevent silent Join crashes
    const [tasksRes, empRes] = await Promise.all([
      supabase.from('tasks').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, name, role') 
    ]);
    
    if (tasksRes.data) setTasks(tasksRes.data);
    
    if (empRes.data) {
      setAllProfiles(empRes.data); // Save all to map names safely
      // Filter dynamically to populate dropdown
      const validEmployees = empRes.data.filter(p => p.role && p.role.toUpperCase() === 'EMPLOYEE');
      setEmployees(validEmployees);
    }
    
    setLoading(false);
  };

  const openCreateModal = () => {
    setEditingId(null);
    setFormData({ title: "", description: "", complexity: "Medium", status: "Pending", assigned_to: "" });
    setIsModalOpen(true);
  };

  const openEditModal = (task: any) => {
    setEditingId(task.id);
    setFormData({
      title: task.title,
      description: task.description || "",
      complexity: task.complexity || "Medium",
      status: task.status || "Pending",
      assigned_to: task.assigned_to || ""
    });
    setIsModalOpen(true);
  };

  const saveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingId) {
        await supabase.from('tasks').update(formData).eq('id', editingId);
        toast({ title: "Task Updated!" });
      } else {
        await supabase.from('tasks').insert([formData]);
        toast({ title: "Task Created!" });
      }
      setIsModalOpen(false);
      fetchTasks();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setLoading(false);
    }
  };

  const deleteTask = async (id: string) => {
    if (!window.confirm("Delete this task permanently?")) return;
    setLoading(true);
    await supabase.from('tasks').delete().eq('id', id);
    toast({ title: "Task Deleted", variant: "destructive" });
    fetchTasks();
  };

  // Safe Name Mapper
  const getEmployeeName = (id: string) => {
    const emp = allProfiles.find(p => p.id === id);
    return emp ? emp.name : "Unassigned";
  };

  return (
    <DashboardLayout role="team_lead">
      <div className="max-w-6xl mx-auto space-y-6 animate-fade-in pb-12">
        <div className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Task Management</h1>
            <p className="text-slate-500">Create and reassign tasks dynamically.</p>
          </div>
          <Button onClick={openCreateModal} className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm">
            <Plus className="w-4 h-4 mr-2" /> New Task
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            
            {/* EMPTY STATE UI - So it never looks "broken" if no tasks exist */}
            {tasks.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center p-16 bg-white rounded-xl border border-slate-200 border-dashed">
                <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-4">
                  <ClipboardList className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-1">No Tasks Found</h3>
                <p className="text-slate-500 text-center max-w-md">There are currently no tasks assigned. Click the "New Task" button above to create and assign an action item to your team.</p>
              </div>
            )}

            {tasks.map(t => (
              <Card key={t.id} className="shadow-sm border-slate-200 group hover:shadow-md transition-all">
                <CardContent className="p-5 space-y-4">
                  <div className="flex justify-between items-start">
                    <span className={`px-2 py-1 text-[10px] font-black uppercase rounded tracking-wider ${t.complexity === 'High' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                      {t.complexity}
                    </span>
                    <div className="flex gap-2">
                      <button onClick={() => openEditModal(t)} className="p-1 text-slate-400 hover:text-blue-600 rounded transition-colors"><Edit className="w-4 h-4"/></button>
                      <button onClick={() => deleteTask(t.id)} className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"><Trash2 className="w-4 h-4"/></button>
                    </div>
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-slate-800 line-clamp-1">{t.title}</h3>
                    <p className="text-sm text-slate-500 line-clamp-2 mt-1">{t.description}</p>
                  </div>
                  <div className="pt-4 border-t flex flex-col gap-2 bg-slate-50 p-3 rounded-md mt-2">
                    <div className="flex items-center justify-between text-xs text-slate-600">
                      <span className="flex items-center"><UserCircle className="w-3.5 h-3.5 mr-1.5 text-purple-500"/> Assignee:</span>
                      <strong className="text-slate-800 truncate max-w-[120px]">{getEmployeeName(t.assigned_to)}</strong>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-600">
                      <span className="flex items-center"><CheckSquare className="w-3.5 h-3.5 mr-1.5 text-emerald-500"/> Status:</span>
                      <strong className="text-emerald-700">{t.status}</strong>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* MODAL */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <Card className="w-full max-w-lg shadow-2xl border-none animate-fade-in">
              <CardContent className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold">{editingId ? "Edit Task" : "Create Task"}</h2>
                  <button onClick={() => setIsModalOpen(false)} className="text-slate-500 hover:text-slate-800 transition-colors"><X className="w-5 h-5"/></button>
                </div>
                <form onSubmit={saveTask} className="space-y-4">
                  <div className="space-y-2"><Label>Title</Label><Input required value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} /></div>
                  <div className="space-y-2"><Label>Detailed Instructions</Label><textarea className="w-full p-2 border rounded-md h-20 resize-none text-sm outline-none focus:ring-2 focus:ring-blue-500" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Complexity</Label><select className="w-full p-2 border rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500" value={formData.complexity} onChange={e => setFormData({...formData, complexity: e.target.value})}><option value="Low">Low</option><option value="Medium">Medium</option><option value="High">High</option></select></div>
                    <div className="space-y-2"><Label>Status</Label><select className="w-full p-2 border rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}><option value="Pending">Pending</option><option value="In Progress">In Progress</option><option value="Review">Review</option><option value="Completed">Completed</option></select></div>
                  </div>
                  <div className="space-y-2">
                    <Label>Assign Employee</Label>
                    <select required className="w-full p-2 border rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500" value={formData.assigned_to} onChange={e => setFormData({...formData, assigned_to: e.target.value})}>
                      <option value="">-- Select Employee --</option>
                      {employees.map(e => (<option key={e.id} value={e.id}>{e.name}</option>))}
                    </select>
                  </div>
                  <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white mt-4 shadow-sm">{editingId ? "Update Task" : "Create Task"}</Button>
                </form>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}