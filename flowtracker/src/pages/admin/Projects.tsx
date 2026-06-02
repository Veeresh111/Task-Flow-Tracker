import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Briefcase, Calendar, CheckSquare, Clock, Eye, X, Users, UserCircle, Star, TrendingDown, Edit, PieChart, BarChart3 } from "lucide-react";

export default function AdminProjects() {
  const { toast } = useToast();
  const [projects, setProjects] = useState<any[]>([]);
  const [teamLeads, setTeamLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modals State
  const [viewProject, setViewProject] = useState<any | null>(null);
  const [projectAnalytics, setProjectAnalytics] = useState<any>(null);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<any | null>(null);
  const [selectedTL, setSelectedTL] = useState("");

  useEffect(() => { 
    fetchProjects(); 
    fetchTeamLeads();
  }, []);

  const fetchProjects = async () => {
    setLoading(true);
    const { data } = await supabase.from('projects')
      .select('*, tasks(*), profiles(name)')
      .order('created_at', { ascending: false });
    if (data) setProjects(data);
    setLoading(false);
  };

  const fetchTeamLeads = async () => {
    const { data } = await supabase.from('profiles').select('*').in('role', ['TEAM_LEAD', 'TL']);
    if (data) setTeamLeads(data);
  };

  const getStatusColor = (status: string) => {
    if (status === 'Completed') return 'bg-emerald-100 text-emerald-700';
    if (status === 'In Progress') return 'bg-blue-100 text-blue-700';
    return 'bg-amber-100 text-amber-700';
  };

  // RESTORED: Assign Team Lead Functionality
  const saveAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject) return;
    setLoading(true);
    await supabase.from('projects').update({ team_lead_id: selectedTL || null }).eq('id', editingProject.id);
    toast({ title: "Project Reassigned", description: "The Team Lead has been updated." });
    setIsAssignModalOpen(false);
    fetchProjects();
  };

  // UPGRADED: Deep Analytics with Pie/Bar Chart Data
  const loadProjectAnalytics = async (proj: any) => {
    setViewProject(proj);
    setProjectAnalytics(null);

    const { data: projectTasks } = await supabase.from('tasks').select('*, profiles(name)').eq('project_id', proj.id);
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
      daysActive,
      totalEmployees: contributors.length,
      contributors,
      overallProgress,
      topPerformers: contributors.filter(c => c.rate >= 80 && c.total > 0),
      needsAttention: contributors.filter(c => c.rate < 50 && c.total > 0)
    });
  };

  return (
    <DashboardLayout role="admin">
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in pb-12">
        <div className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div><h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2"><Briefcase className="w-8 h-8 text-blue-600" /> Central Project Hub</h1><p className="text-slate-500 mt-1">Manage projects, assign Team Leads, and view deep analytics.</p></div>
        </div>

        {loading ? <div className="flex justify-center p-20"><Loader2 className="w-10 h-10 animate-spin text-blue-600" /></div> : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {projects.map(proj => {
              const totalTasks = proj.tasks?.length || 0;
              const completedTasks = proj.tasks?.filter((t: any) => t.status === 'Completed').length || 0;
              const progress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

              return (
                <Card key={proj.id} className="shadow-sm border-slate-200 hover:shadow-md transition-all group flex flex-col">
                  <CardHeader className="pb-3 flex-none">
                    <div className="flex justify-between items-start mb-2">
                      <Badge variant="secondary" className={`${getStatusColor(proj.status)} border-none shadow-sm`}>{proj.status}</Badge>
                      <div className="flex gap-1">
                        {/* RESTORED: Edit Button */}
                        <Button onClick={() => { setEditingProject(proj); setSelectedTL(proj.team_lead_id || ""); setIsAssignModalOpen(true); }} variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-500 hover:text-blue-600 bg-slate-50 hover:bg-blue-50"><Edit className="w-4 h-4" /></Button>
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
                      <div className="flex items-center justify-between text-xs font-medium text-slate-500 pt-2 border-t border-slate-100">
                        <span className="flex items-center"><UserCircle className="w-3.5 h-3.5 mr-1.5"/> TL: {proj.profiles?.name || 'Unassigned'}</span>
                        <span className="flex items-center"><Calendar className="w-3.5 h-3.5 mr-1.5"/> {new Date(proj.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* RESTORED ASSIGN MODAL */}
        {isAssignModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <Card className="w-full max-w-md shadow-2xl border-none animate-fade-in"><CardContent className="p-6"><div className="flex justify-between items-center mb-6"><h2 className="text-xl font-bold text-slate-800">Assign Project TL</h2><button onClick={() => setIsAssignModalOpen(false)} className="text-slate-500 hover:text-slate-800"><X className="w-5 h-5"/></button></div><form onSubmit={saveAssignment} className="space-y-4"><div className="space-y-2"><Label className="text-slate-600">Select Team Lead</Label><select className="w-full p-2.5 border border-slate-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500" value={selectedTL} onChange={e => setSelectedTL(e.target.value)}><option value="">-- Unassigned --</option>{teamLeads.map(tl => <option key={tl.id} value={tl.id}>{tl.name}</option>)}</select></div><Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white mt-4">Save Assignment</Button></form></CardContent></Card>
          </div>
        )}

        {/* UPGRADED: Deep Analytics Modal with Visual Charts */}
        {viewProject && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <Card className="w-full max-w-4xl shadow-2xl border-none animate-fade-in overflow-hidden">
              <div className="bg-slate-900 p-6 text-white flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="text-2xl font-black">{viewProject.name}</h2>
                    <span className="px-2 py-1 rounded text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">{viewProject.status}</span>
                  </div>
                  <p className="text-slate-400 text-sm max-w-2xl">{viewProject.description}</p>
                </div>
                <button onClick={() => setViewProject(null)} className="text-slate-400 hover:text-white"><X className="w-6 h-6"/></button>
              </div>
              
              <CardContent className="p-6 bg-slate-50 max-h-[80vh] overflow-y-auto">
                {!projectAnalytics ? <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div> : (
                  <div className="space-y-6">
                    {/* Top KPI Bar */}
                    <div className="grid grid-cols-4 gap-4">
                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center">
                        <p className="text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1"><Clock className="w-3.5 h-3.5"/> Days Active</p>
                        <p className="text-2xl font-black text-slate-800">{projectAnalytics.daysActive}</p>
                      </div>
                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center">
                        <p className="text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1"><Users className="w-3.5 h-3.5"/> Team Size</p>
                        <p className="text-2xl font-black text-slate-800">{projectAnalytics.totalEmployees}</p>
                      </div>
                      
                      {/* NEW: CSS PIE CHART */}
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

                    {/* NEW: CSS BAR CHARTS FOR EMPLOYEE CONTRIBUTION */}
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                      <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4 border-b border-slate-100 pb-2"><BarChart3 className="w-4 h-4 text-blue-600"/> Team Contribution (Bar Chart)</h3>
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
                      ) : <p className="text-sm text-slate-500 italic">No tasks assigned yet.</p>}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-white p-5 rounded-xl border border-emerald-200 shadow-sm">
                        <h3 className="font-bold text-emerald-800 flex items-center gap-2 mb-3 border-b border-emerald-100 pb-2"><Star className="w-4 h-4 text-emerald-600"/> Top Contributors</h3>
                        {projectAnalytics.topPerformers.map((emp: any, i: number) => (
                          <div key={i} className="flex justify-between text-sm py-1 border-b border-slate-50 last:border-0"><span className="font-medium text-slate-700">{emp.name}</span><span className="font-bold text-emerald-700">100%</span></div>
                        ))}
                      </div>
                      <div className="bg-white p-5 rounded-xl border border-amber-200 shadow-sm">
                        <h3 className="font-bold text-amber-800 flex items-center gap-2 mb-3 border-b border-amber-100 pb-2"><TrendingDown className="w-4 h-4 text-amber-600"/> Needs Attention</h3>
                        {projectAnalytics.needsAttention.map((emp: any, i: number) => (
                          <div key={i} className="flex justify-between text-sm py-1 border-b border-slate-50 last:border-0"><span className="font-medium text-slate-700">{emp.name}</span><span className="font-bold text-amber-700">{emp.rate.toFixed(0)}%</span></div>
                        ))}
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