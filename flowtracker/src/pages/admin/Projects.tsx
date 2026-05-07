import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Loader2, Briefcase, Calendar, Flag, Edit, Trash2, Plus, UserCircle, X } from "lucide-react";

export default function AdminProjects() {
  const { toast } = useToast();
  const [projects, setProjects] = useState<any[]>([]);
  const [teamLeads, setTeamLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: "", description: "", status: "Active", team_lead_id: "", start_date: "", deadline: "" });

  useEffect(() => { 
    fetchData(); 
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const [projRes, tlRes] = await Promise.all([
      supabase.from('projects').select('*, profiles(name)').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, name, role') // Fetching roles to filter safely in code
    ]);
    
    if (projRes.data) setProjects(projRes.data);
    
    if (tlRes.data) {
      // FIX: Dynamically checks for TL, TEAM_LEAD, team_lead to prevent blank dropdowns
      const leads = tlRes.data.filter(p => 
        p.role && (p.role.toUpperCase() === 'TEAM_LEAD' || p.role.toUpperCase() === 'TL')
      );
      setTeamLeads(leads);
    }
    
    setLoading(false);
  };

  const openCreateModal = () => {
    setEditingId(null);
    setFormData({ name: "", description: "", status: "Active", team_lead_id: "", start_date: "", deadline: "" });
    setIsModalOpen(true);
  };

  const openEditModal = (project: any) => {
    setEditingId(project.id);
    setFormData({
      name: project.name,
      description: project.description,
      status: project.status || "Active",
      team_lead_id: project.team_lead_id || "",
      start_date: project.start_date || "",
      deadline: project.deadline || ""
    });
    setIsModalOpen(true);
  };

  const saveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingId) {
        await supabase.from('projects').update(formData).eq('id', editingId);
        toast({ title: "Project Updated!" });
      } else {
        await supabase.from('projects').insert([formData]);
        toast({ title: "Project Created!" });
      }
      setIsModalOpen(false);
      fetchData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setLoading(false);
    }
  };

  const deleteProject = async (id: string) => {
    if (!window.confirm("Delete this project? All associated tasks will be lost.")) return;
    setLoading(true);
    await supabase.from('projects').delete().eq('id', id);
    toast({ title: "Project Deleted", variant: "destructive" });
    fetchData();
  };

  const formatDate = (iso: string) => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : "Not Set";

  return (
    <DashboardLayout role="admin">
      <div className="max-w-6xl mx-auto space-y-6 animate-fade-in pb-12">
        <div className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div><h1 className="text-3xl font-bold tracking-tight text-slate-900">Project Directory</h1><p className="text-slate-500">Manage, edit, and assign company projects.</p></div>
          <Button onClick={openCreateModal} className="bg-blue-600 hover:bg-blue-700 text-white"><Plus className="w-4 h-4 mr-2" /> New Project</Button>
        </div>

        {loading ? <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div> : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map(p => (
              <Card key={p.id} className="shadow-sm border-slate-200 group">
                <CardContent className="p-5 space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="p-2 bg-blue-50 text-blue-600 rounded"><Briefcase className="w-5 h-5"/></div>
                    <div className="flex gap-2">
                      <button onClick={() => openEditModal(p)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Edit className="w-4 h-4"/></button>
                      <button onClick={() => deleteProject(p.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4"/></button>
                    </div>
                  </div>
                  <div>
                    <span className={`px-2 py-1 text-[10px] font-bold uppercase rounded ${p.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{p.status || 'Active'}</span>
                    <h3 className="font-bold text-lg text-slate-800 line-clamp-1 mt-2">{p.name}</h3>
                    <p className="text-sm text-slate-500 line-clamp-2 mt-1">{p.description}</p>
                  </div>
                  <div className="pt-4 border-t flex flex-col gap-2 bg-slate-50 p-3 rounded-md mt-2">
                    <div className="flex items-center justify-between text-xs text-slate-600"><span className="flex items-center"><UserCircle className="w-3.5 h-3.5 mr-1.5 text-purple-500"/> Lead:</span><strong className="text-slate-800 truncate max-w-[100px]">{p.profiles?.name || "Unassigned"}</strong></div>
                    <div className="flex items-center justify-between text-xs text-slate-600"><span className="flex items-center"><Calendar className="w-3.5 h-3.5 mr-1.5 text-blue-500"/> Start Date:</span><strong className="text-slate-800">{formatDate(p.start_date || p.created_at)}</strong></div>
                    <div className="flex items-center justify-between text-xs text-slate-600"><span className="flex items-center"><Flag className="w-3.5 h-3.5 mr-1.5 text-red-500"/> Deadline:</span><strong className="text-red-600">{formatDate(p.deadline)}</strong></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* CREATE / EDIT MODAL */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <Card className="w-full max-w-lg shadow-2xl animate-fade-in border-none">
              <CardContent className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold">{editingId ? "Edit Project" : "Create New Project"}</h2>
                  <button onClick={() => setIsModalOpen(false)} className="text-slate-500 hover:text-slate-800"><X className="w-5 h-5"/></button>
                </div>
                <form onSubmit={saveProject} className="space-y-4">
                  <div className="space-y-2"><Label>Project Name</Label><Input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} /></div>
                  <div className="space-y-2"><Label>Description</Label><textarea required className="w-full p-2 border rounded-md h-20 resize-none text-sm" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} /></div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Status</Label><select className="w-full p-2 border rounded-md text-sm" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}><option value="Active">Active</option><option value="On Hold">On Hold</option><option value="Completed">Completed</option></select></div>
                    <div className="space-y-2"><Label>Assign Team Lead</Label><select className="w-full p-2 border rounded-md text-sm" value={formData.team_lead_id} onChange={e => setFormData({...formData, team_lead_id: e.target.value})}><option value="">-- Select --</option>{teamLeads.map(tl => (<option key={tl.id} value={tl.id}>{tl.name}</option>))}</select></div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Start Date</Label><Input type="date" value={formData.start_date} onChange={e => setFormData({...formData, start_date: e.target.value})} /></div>
                    <div className="space-y-2"><Label>Deadline</Label><Input type="date" value={formData.deadline} onChange={e => setFormData({...formData, deadline: e.target.value})} /></div>
                  </div>

                  <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white mt-4">{editingId ? "Save Changes" : "Create Project"}</Button>
                </form>
              </CardContent>
            </Card>
          </div>
        )}

      </div>
    </DashboardLayout>
  );
}