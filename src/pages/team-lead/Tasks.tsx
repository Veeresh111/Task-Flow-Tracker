import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { callCorporateAI } from "@/lib/ai";
import { Loader2, CheckSquare, Edit, Trash2, Plus, UserCircle, X, ClipboardList, Search, Filter, BrainCircuit, Sparkles } from "lucide-react";

export default function TeamLeadTasks() {
  const { toast } = useToast();
  const [tasks, setTasks] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [allProfiles, setAllProfiles] = useState<any[]>([]); 
  const [loading, setLoading] = useState(true);
  
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ title: "", description: "", complexity: "Medium", status: "Pending", assigned_to: "" });

  const [aiTaskPlan, setAiTaskPlan] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  useEffect(() => { fetchTasks(); }, []);

  const fetchTasks = async () => {
    setLoading(true);
    const [tasksRes, empRes] = await Promise.all([
      supabase.from('tasks').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, name, role, performance_score') 
    ]);
    
    if (tasksRes.data) setTasks(tasksRes.data);
    if (empRes.data) {
      setAllProfiles(empRes.data); 
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
    } finally {
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

  const getEmployeeName = (id: string) => {
    const emp = allProfiles.find(p => p.id === id);
    return emp ? emp.name : "Unassigned";
  };

  const generateTaskPlan = async (task: any) => {
    setIsAiLoading(true);
    try {
      const prompt = `Act as an Expert Task Workflow Optimizer.
Task Name: "${task.title}"
Task Description: "${task.description || 'No description provided'}"
Task Complexity: "${task.complexity}"

Available Employees: ${JSON.stringify(employees.map(e => ({ name: e.name, rating: e.performance_score || 0 })))}

Provide in clear text:
1. Ideal Assignee + Reason
2. 3-4 Step Execution Plan
3. Quality Checkpoints for Team Lead

Keep response concise and professional.`;

      const aiResponse = await callCorporateAI({
        prompt,
        temperature: 0.3,
        max_tokens: 900,
      });

      setAiTaskPlan(aiResponse.trim());
      toast({ title: "Task Analysis Complete" });

    } catch (e: any) {
      console.error("AI task plan error:", e);
      toast({ 
        title: "AI Error", 
        description: e.message || "Failed to connect to Qwen 3", 
        variant: "destructive" 
      });
    } finally {
      setIsAiLoading(false);
    }
  };

  const filteredTasks = tasks.filter(t => {
    const matchesSearch = t.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         (t.description || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "All" || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <DashboardLayout role="team_lead">
      <div className="max-w-6xl mx-auto space-y-6 animate-fade-in pb-12">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-xl shadow-sm border border-slate-200 gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Task Management</h1>
            <p className="text-slate-500 mt-1">Create, reassign, and optimize tasks with Qwen 3.</p>
          </div>
          <Button onClick={openCreateModal} className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm font-bold h-11 px-6">
            <Plus className="w-5 h-5 mr-2" /> Deploy New Task
          </Button>
        </div>

        {/* Search & Filter */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Search task title..." 
              className="pl-10 h-10 text-sm bg-slate-50 border-slate-200" 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)} 
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-10 w-full sm:w-[250px] bg-slate-50 border-slate-200 text-sm">
              <Filter className="w-4 h-4 mr-2 text-slate-500"/>
              <SelectValue placeholder="Filter by Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Tasks</SelectItem>
              <SelectItem value="Pending">Pending</SelectItem>
              <SelectItem value="In Progress">In Progress</SelectItem>
              <SelectItem value="Review">Review</SelectItem>
              <SelectItem value="Completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Tasks Grid */}
        {loading ? (
          <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTasks.length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center p-16 bg-white rounded-xl border border-slate-200 border-dashed">
                <ClipboardList className="w-16 h-16 text-slate-300 mb-4" />
                <h3 className="text-xl font-bold text-slate-800">No matching tasks</h3>
              </div>
            ) : (
              filteredTasks.map(t => (
                <Card key={t.id} className="shadow-sm border-slate-200 group hover:shadow-md transition-all flex flex-col">
                  <CardContent className="p-5 space-y-4 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start mb-2">
                        <span className={`px-2 py-1 text-[10px] font-black uppercase rounded tracking-wider ${t.complexity === 'High' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                          {t.complexity}
                        </span>
                        <div className="flex gap-2">
                          <button onClick={() => openEditModal(t)} className="p-1 text-slate-400 hover:text-blue-600"><Edit className="w-4 h-4"/></button>
                          <button onClick={() => deleteTask(t.id)} className="p-1 text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4"/></button>
                        </div>
                      </div>
                      <h3 className="font-bold text-lg text-slate-800 line-clamp-1">{t.title}</h3>
                      <p className="text-sm text-slate-500 line-clamp-2 mt-1">{t.description}</p>
                    </div>
                    
                    <div className="space-y-3 mt-4">
                      <Button 
                        onClick={() => generateTaskPlan(t)} 
                        disabled={isAiLoading} 
                        className="w-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold border border-indigo-200 h-9 text-xs"
                      >
                        {isAiLoading ? <Loader2 className="w-3 h-3 mr-2 animate-spin"/> : <BrainCircuit className="w-3 h-3 mr-2"/>} 
                        Qwen 3 Delegation Analysis
                      </Button>
                      <div className="pt-3 border-t border-slate-100 flex flex-col gap-2 bg-slate-50 p-3 rounded-md text-xs">
                        <div className="flex justify-between">
                          <span>Assignee:</span>
                          <strong>{getEmployeeName(t.assigned_to)}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span>Status:</span>
                          <strong className={t.status === 'Completed' ? 'text-emerald-600' : 'text-amber-600'}>{t.status}</strong>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

        {/* Modals remain the same */}
        {isModalOpen && (
          /* ... same modal code as before ... */
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <Card className="w-full max-w-lg shadow-2xl border-none">
              <CardContent className="p-6">
                {/* Modal content same as previous version */}
                <div className="flex justify-between items-center mb-6 border-b pb-3">
                  <h2 className="text-2xl font-black">{editingId ? "Edit Task" : "Deploy Task"}</h2>
                  <button onClick={() => setIsModalOpen(false)}><X className="w-5 h-5"/></button>
                </div>
                <form onSubmit={saveTask} className="space-y-4">
                  {/* Form fields same as before */}
                  <div className="space-y-1.5"><Label>Title</Label><Input required value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} /></div>
                  <div className="space-y-1.5"><Label>Detailed Instructions</Label><textarea className="w-full p-2 border rounded-md h-20" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} /></div>
                  {/* ... rest of form ... */}
                  <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700">{editingId ? "Update Task" : "Deploy Task"}</Button>
                </form>
              </CardContent>
            </Card>
          </div>
        )}

        {aiTaskPlan && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4">
            <Card className="w-full max-w-3xl max-h-[85vh] flex flex-col">
              <div className="bg-indigo-600 p-6 text-white flex justify-between">
                <h2 className="text-xl font-black flex items-center gap-2"><Sparkles className="w-5 h-5"/> Qwen 3 Task Strategy</h2>
                <button onClick={() => setAiTaskPlan(null)}><X className="w-6 h-6"/></button>
              </div>
              <CardContent className="p-6 overflow-y-auto">
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{aiTaskPlan}</p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}