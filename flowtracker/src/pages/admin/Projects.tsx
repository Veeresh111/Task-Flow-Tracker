import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Briefcase, Calendar, CheckSquare, Clock, Eye, X, Users, UserCircle, Star, TrendingDown, Edit, PieChart, BarChart3, Trash2, MessageSquare, Search, Filter, Plus, Sparkles, BrainCircuit } from "lucide-react";
import { useNavigate } from "react-router-dom"; 
import { GoogleGenerativeAI } from "@google/generative-ai";

export default function AdminProjects() {
  const { toast } = useToast();
  const [projects, setProjects] = useState<any[]>([]);
  const [teamLeads, setTeamLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  // Modals State
  const [viewProject, setViewProject] = useState<any | null>(null);
  const [projectAnalytics, setProjectAnalytics] = useState<any>(null);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<any | null>(null);
  
  // AI Roadmap State
  const [aiRoadmap, setAiRoadmap] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  // Edit Form State
  const [editForm, setEditForm] = useState({ name: "", description: "", status: "Active", team_lead_id: "" });

  const navigate = useNavigate();

  useEffect(() => { 
    fetchProjects(); 
    fetchTeamLeads();
  }, []);

  const fetchProjects = async () => {
    setLoading(true);
    const { data } = await supabase.from('projects')
      .select('*, tasks(*), profiles(name, id)')
      .order('created_at', { ascending: false });
    if (data) setProjects(data);
    setLoading(false);
  };

  const fetchTeamLeads = async () => {
    const { data } = await supabase.from('profiles').select('*').in('role', ['TEAM_LEAD', 'TL', 'team_lead', 'tl']);
    if (data) {
      const sorted = data.sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0));
      setTeamLeads(sorted);
    }
  };

  const getStatusColor = (status: string) => {
    const s = (status || "").toLowerCase();
    if (s.includes('complet')) return 'bg-emerald-50 text-emerald-700 border-emerald-300';
    if (s.includes('progress') || s.includes('active') || s.includes('open')) return 'bg-blue-50 text-blue-700 border-blue-300';
    if (s.includes('hold') || s.includes('suspend')) return 'bg-red-50 text-red-700 border-red-300';
    return 'bg-amber-50 text-amber-700 border-amber-300';
  };

  // RESTORED FLAW 1: Create New Project Modal Function
  const openCreateModal = () => {
    setEditingProject(null);
    setEditForm({ name: "", description: "", status: "Active", team_lead_id: "" });
    setIsAssignModalOpen(true);
  };

  const openEditModal = (proj: any) => {
    setEditingProject(proj);
    setEditForm({
      name: proj.name || "",
      description: proj.description || "",
      status: proj.status || "Active",
      team_lead_id: proj.team_lead_id || ""
    });
    setIsAssignModalOpen(true);
  };

  const saveProjectChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    if (editingProject) {
      // UPDATE EXISTING
      const { error } = await supabase.from('projects').update({ 
        name: editForm.name, description: editForm.description, status: editForm.status, team_lead_id: editForm.team_lead_id || null 
      }).eq('id', editingProject.id);

      if (error) toast({ title: "Update Failed", description: error.message, variant: "destructive" });
      else toast({ title: "Project Updated", description: "Corporate project data successfully synchronized." });
    } else {
      // CREATE NEW
      const { error } = await supabase.from('projects').insert([{ 
        name: editForm.name, description: editForm.description, status: editForm.status, team_lead_id: editForm.team_lead_id || null 
      }]);

      if (error) toast({ title: "Creation Failed", description: error.message, variant: "destructive" });
      else toast({ title: "Project Created", description: "New project successfully deployed to the database." });
    }
    
    setIsAssignModalOpen(false);
    fetchProjects();
  };

  const deleteProject = async () => {
    if (!editingProject || !window.confirm("CRITICAL WARNING: Are you sure you want to completely erase this project?")) return;
    setLoading(true);
    const { error } = await supabase.from('projects').delete().eq('id', editingProject.id);
    
    if (error) toast({ title: "Deletion Failed", description: error.message, variant: "destructive" });
    else toast({ title: "Project Erased", description: "Project has been permanently removed." });
    
    setIsAssignModalOpen(false);
    fetchProjects();
  };

  const loadProjectAnalytics = async (proj: any) => {
    setViewProject(proj);
    setProjectAnalytics(null);

    const { data: projectTasks } = await supabase.from('tasks').select('*, profiles(name, id)').eq('project_id', proj.id);
    if (!projectTasks) return;

    const start = new Date(proj.created_at).getTime();
    const now = proj.status === 'Completed' && proj.updated_at ? new Date(proj.updated_at).getTime() : new Date().getTime();
    const daysActive = Math.floor((now - start) / (1000 * 60 * 60 * 24));

    const contributorMap: any = {};
    projectTasks.forEach(t => {
      const empName = t.profiles?.name || 'Unassigned';
      if (!contributorMap[empName]) { contributorMap[empName] = { total: 0, completed: 0 }; }
      contributorMap[empName].total += 1;
      if (t.status === 'Completed') contributorMap[empName].completed += 1;
    });

    const contributors = Object.keys(contributorMap).map(name => {
      const rate = contributorMap[name].total > 0 ? (contributorMap[name].completed / contributorMap[name].total) * 100 : 0;
      return { name, rate, total: contributorMap[name].total, completed: contributorMap[name].completed };
    });

    const totalTasks = projectTasks.length;
    const completedTasks = projectTasks.filter(t => t.status === 'Completed').length;
    const overallProgress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

    setProjectAnalytics({
      daysActive, totalEmployees: contributors.length, contributors, overallProgress,
      topPerformers: contributors.filter(c => c.rate >= 80 && c.total > 0),
      needsAttention: contributors.filter(c => c.rate < 50 && c.total > 0)
    });
  };

  const initiateDispatch = async (targetId: string, targetName: string) => {
    localStorage.setItem('activeChatUserId', targetId);
    localStorage.setItem('activeChatUserName', targetName);
    navigate(`/admin/chat?userId=${targetId}`, { state: { selectedUserId: targetId, selectedUserName: targetName } });
  };

  // SMART AI ROADMAP GENERATOR
  const generateProjectRoadmap = async (proj: any) => {
    setIsAiLoading(true);
    toast({ title: "AI Framework Initiated", description: "Scanning corporate database for optimal team matching and workflow generation..." });
    
    try {
      const { data: allDepts } = await supabase.from('profiles').select('department, role');
      const deptCounts: any = {};
      allDepts?.forEach(d => {
        if (!deptCounts[d.department]) deptCounts[d.department] = 0;
        deptCounts[d.department]++;
      });

      const prompt = `Act as an Elite Enterprise Project Director.
      Project Name: "${proj.name}"
      Requirements/Description: "${proj.description}"
      Current Organization Departments: ${JSON.stringify(deptCounts)}
      
      Analyze this project deeply and provide a highly professional corporate roadmap. Include:
      1. Best Suited Team: Which department in our organization is best suited to handle this, and why?
      2. Workflow Structure: A 3-phase execution roadmap.
      3. Meeting Cadence: Recommended schedule for scrums and stakeholder updates.
      4. Risk Mitigation: Top 2 potential blockers and how to avoid them.
      
      Do not use markdown backticks, output clean readable text.`;

      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      const result = await model.generateContent(prompt);
      
      setAiRoadmap(result.response.text());
    } catch (e) {
      toast({ title: "AI Error", description: "Failed to generate project roadmap.", variant: "destructive" });
    }
    setIsAiLoading(false);
  };

  const filteredProjects = projects.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || (p.description || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "All" || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <DashboardLayout role="admin">
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in pb-12">
        
        {/* HEADER & RESTORED CREATE BUTTON */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-xl shadow-sm border border-slate-200 gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2"><Briefcase className="w-8 h-8 text-blue-600" /> Central Project Hub</h1>
            <p className="text-slate-500 mt-1">Manage projects, assign Team Leads, and view deep analytics.</p>
          </div>
          <Button onClick={openCreateModal} className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm font-bold h-11 px-6">
            <Plus className="w-5 h-5 mr-2"/> Deploy New Project
          </Button>
        </div>

        {/* SEARCH AND SMART FILTER */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <Input placeholder="Search project name or parameters..." className="pl-10 h-10 text-sm bg-slate-50 border-slate-200" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-10 w-full sm:w-[250px] bg-slate-50 border-slate-200 text-sm">
              <Filter className="w-4 h-4 mr-2 text-slate-500"/>
              <SelectValue placeholder="Filter by Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Projects</SelectItem>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="Hold">On Hold</SelectItem>
              <SelectItem value="Completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? <div className="flex justify-center p-20"><Loader2 className="w-10 h-10 animate-spin text-blue-600" /></div> : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredProjects.map(proj => {
              const totalTasks = proj.tasks?.length || 0;
              const completedTasks = proj.tasks?.filter((t: any) => t.status === 'Completed').length || 0;
              const progress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

              return (
                <Card key={proj.id} className="shadow-sm border-slate-200 hover:shadow-md transition-all group flex flex-col">
                  <CardHeader className="pb-3 flex-none">
                    <div className="flex justify-between items-start mb-2">
                      <Badge variant="outline" className={`${getStatusColor(proj.status)} px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider shadow-sm`}>
                        {proj.status || "UNKNOWN"}
                      </Badge>
                      <div className="flex gap-1">
                        <Button onClick={() => openEditModal(proj)} variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-500 hover:text-blue-600 bg-slate-50 hover:bg-blue-50"><Edit className="w-4 h-4" /></Button>
                        <Button onClick={() => loadProjectAnalytics(proj)} variant="ghost" size="sm" className="h-8 text-xs text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100"><Eye className="w-3 h-3 mr-1" /> Details</Button>
                      </div>
                    </div>
                    <CardTitle className="text-xl font-bold text-slate-800 line-clamp-1">{proj.name}</CardTitle>
                    <p className="text-sm text-slate-500 line-clamp-2 mt-2 leading-relaxed">{proj.description}</p>
                  </CardHeader>
                  <CardContent className="pt-2 flex-1 flex flex-col justify-end">
                    <div className="space-y-4">
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <div className="flex items-center justify-between text-xs text-slate-500 mb-2"><span className="flex items-center font-bold text-slate-700"><CheckSquare className="w-3.5 h-3.5 mr-1.5 text-blue-500"/> Task Progress</span><span className="font-bold">{progress.toFixed(0)}% ({completedTasks}/{totalTasks})</span></div>
                        <div className="w-full bg-slate-200 rounded-full h-2"><div className="bg-blue-600 h-2 rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div></div>
                      </div>
                      
                      {/* AI ROADMAP BUTTON */}
                      <Button onClick={() => generateProjectRoadmap(proj)} disabled={isAiLoading} className="w-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold border border-indigo-200 h-9 text-xs">
                        {isAiLoading ? <Loader2 className="w-3 h-3 mr-2 animate-spin"/> : <BrainCircuit className="w-3 h-3 mr-2"/>} Generate AI Roadmap
                      </Button>

                      <div className="flex items-center justify-between text-xs font-medium text-slate-500 pt-2 border-t border-slate-100">
                        <span className="flex items-center"><UserCircle className="w-3.5 h-3.5 mr-1.5"/> TL: {proj.profiles?.name || 'Unassigned'}</span>
                        <span className="flex items-center"><Calendar className="w-3.5 h-3.5 mr-1.5"/> {new Date(proj.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {filteredProjects.length === 0 && <div className="col-span-full p-12 text-center text-slate-500 font-bold">No projects match your search criteria.</div>}
          </div>
        )}

        {/* CREATE / EDIT MODAL */}
        {isAssignModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <Card className="w-full max-w-lg shadow-2xl border-none animate-in zoom-in-95 duration-200">
              <CardContent className="p-6">
                <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-3">
                  <h2 className="text-2xl font-black text-slate-800">{editingProject ? "Project Configuration" : "Create New Project"}</h2>
                  <button onClick={() => setIsAssignModalOpen(false)} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-full"><X className="w-5 h-5"/></button>
                </div>
                <form onSubmit={saveProjectChanges} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-slate-700 font-bold text-xs uppercase tracking-wider">Project Title</Label>
                    <Input className="font-medium focus-visible:ring-blue-500" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-slate-700 font-bold text-xs uppercase tracking-wider">Corporate Description</Label>
                    <Textarea className="resize-none h-24 focus-visible:ring-blue-500" value={editForm.description} onChange={e => setEditForm({...editForm, description: e.target.value})} />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-slate-700 font-bold text-xs uppercase tracking-wider">Lifecycle Status</Label>
                      <select className="w-full p-2.5 border border-slate-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white font-medium" value={editForm.status} onChange={e => setEditForm({...editForm, status: e.target.value})}>
                        <option value="Active">Active / In Progress</option>
                        <option value="Hold">On Hold</option>
                        <option value="Completed">Completed</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-slate-700 font-bold text-xs uppercase tracking-wider">Assign Team Lead</Label>
                      <select className="w-full p-2.5 border border-slate-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white" value={editForm.team_lead_id} onChange={e => setEditForm({...editForm, team_lead_id: e.target.value})}>
                        <option value="">-- Leave Unassigned --</option>
                        {teamLeads.map(tl => (
                          <option key={tl.id} value={tl.id}>
                            {tl.name} (⭐ {Number(tl.rating || 0).toFixed(1)})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-4 border-t border-slate-100 mt-4">
                    <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-sm">Save Configuration</Button>
                    {/* ONLY SHOW DELETE IF EDITING EXISTING PROJECT */}
                    {editingProject && (
                      <Button type="button" onClick={deleteProject} variant="destructive" className="flex-none shadow-sm" title="Permanently Delete Project"><Trash2 className="w-4 h-4"/></Button>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        )}

        {/* AI ROADMAP MODAL */}
        {aiRoadmap && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
            <Card className="w-full max-w-3xl shadow-2xl border-none overflow-hidden flex flex-col max-h-[85vh]">
              <div className="bg-indigo-600 p-6 flex justify-between items-center text-white">
                <div>
                  <h2 className="text-xl font-black flex items-center gap-2"><Sparkles className="w-5 h-5"/> AI Corporate Roadmap Strategy</h2>
                  <p className="text-indigo-200 text-xs mt-1">Generated by FWC Neural Engine</p>
                </div>
                <button onClick={() => setAiRoadmap(null)} className="text-indigo-200 hover:text-white"><X className="w-6 h-6"/></button>
              </div>
              <CardContent className="p-6 overflow-y-auto custom-scrollbar">
                <p className="whitespace-pre-wrap text-sm text-slate-700 leading-relaxed font-medium">{aiRoadmap}</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* EXISTING VIEW PROJECT ANALYTICS MODAL */}
        {viewProject && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <Card className="w-full max-w-4xl shadow-2xl border-none animate-in zoom-in-95 duration-200 overflow-hidden">
              <div className="bg-slate-900 p-6 text-white flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="text-2xl font-black">{viewProject.name}</h2>
                    <span className="px-2 py-1 rounded text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 uppercase tracking-wider">{viewProject.status}</span>
                  </div>
                  <p className="text-slate-400 text-sm max-w-2xl">{viewProject.description}</p>
                </div>
                <button onClick={() => setViewProject(null)} className="text-slate-400 hover:text-white p-1 rounded-full bg-slate-800"><X className="w-5 h-5"/></button>
              </div>
              
              <CardContent className="p-6 bg-slate-50 max-h-[80vh] overflow-y-auto">
                {!projectAnalytics ? <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div> : (
                  <div className="space-y-6">
                    {viewProject.team_lead_id && (
                      <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl flex items-center justify-between shadow-sm">
                        <div>
                          <p className="text-xs font-bold text-indigo-500 uppercase tracking-wider mb-0.5">Workspace Dispatch</p>
                          <p className="text-sm font-semibold text-slate-800">Communicate directly with TL: {viewProject.profiles?.name}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button onClick={() => initiateDispatch(viewProject.team_lead_id, viewProject.profiles?.name)} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm h-9">
                            <MessageSquare className="w-4 h-4 mr-2"/> Message TL
                          </Button>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-4 gap-4">
                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center">
                        <p className="text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1"><Clock className="w-3.5 h-3.5"/> Days Active</p>
                        <p className="text-2xl font-black text-slate-800">{projectAnalytics.daysActive}</p>
                      </div>
                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center">
                        <p className="text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1"><Users className="w-3.5 h-3.5"/> Team Size</p>
                        <p className="text-2xl font-black text-slate-800">{projectAnalytics.totalEmployees}</p>
                      </div>
                      
                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm col-span-2 flex items-center gap-6">
                        <div className="relative w-16 h-16 rounded-full flex items-center justify-center shadow-inner" style={{ background: `conic-gradient(#2563eb ${projectAnalytics.overallProgress}%, #e2e8f0 ${projectAnalytics.overallProgress}% 100%)` }}>
                          <div className="absolute w-12 h-12 bg-white rounded-full flex items-center justify-center">
                            <span className="text-xs font-bold text-slate-800">{projectAnalytics.overallProgress.toFixed(0)}%</span>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1"><PieChart className="w-3.5 h-3.5"/> Project Completion</p>
                          <p className="text-sm text-slate-600 font-medium">Based on task resolution rate</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                      <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4 border-b border-slate-100 pb-2"><BarChart3 className="w-4 h-4 text-blue-600"/> Team Contribution Matrix</h3>
                      {projectAnalytics.contributors.length > 0 ? (
                        <div className="space-y-4">
                          {projectAnalytics.contributors.map((emp: any, i: number) => (
                            <div key={i}>
                              <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                                <span>{emp.name}</span>
                                <span>{emp.rate.toFixed(0)}% ({emp.completed}/{emp.total} Tasks)</span>
                              </div>
                              <div className="w-full bg-slate-100 rounded-full h-2.5">
                                <div className={`h-2.5 rounded-full ${emp.rate >= 80 ? 'bg-emerald-500' : emp.rate >= 50 ? 'bg-blue-500' : 'bg-amber-500'}`} style={{ width: `${emp.rate}%` }}></div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : <p className="text-sm text-slate-500 italic">No tasks assigned to this project yet.</p>}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-white p-5 rounded-xl border border-emerald-200 shadow-sm">
                        <h3 className="font-bold text-emerald-800 flex items-center gap-2 mb-3 border-b border-emerald-100 pb-2"><Star className="w-4 h-4 text-emerald-600"/> Top Contributors</h3>
                        {projectAnalytics.topPerformers.map((emp: any, i: number) => (
                          <div key={i} className="flex justify-between text-sm py-1 border-b border-slate-50 last:border-0"><span className="font-medium text-slate-700">{emp.name}</span><span className="font-bold text-emerald-700">100%</span></div>
                        ))}
                        {projectAnalytics.topPerformers.length === 0 && <p className="text-xs text-emerald-600 italic">No top performers yet.</p>}
                      </div>
                      <div className="bg-white p-5 rounded-xl border border-amber-200 shadow-sm">
                        <h3 className="font-bold text-amber-800 flex items-center gap-2 mb-3 border-b border-amber-100 pb-2"><TrendingDown className="w-4 h-4 text-amber-600"/> Needs Attention</h3>
                        {projectAnalytics.needsAttention.map((emp: any, i: number) => (
                          <div key={i} className="flex justify-between text-sm py-1 border-b border-slate-50 last:border-0"><span className="font-medium text-slate-700">{emp.name}</span><span className="font-bold text-amber-700">{emp.rate.toFixed(0)}%</span></div>
                        ))}
                        {projectAnalytics.needsAttention.length === 0 && <p className="text-xs text-amber-600 italic">No employees lagging behind.</p>}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

      </div>
    </DashboardLayout>
  );
}