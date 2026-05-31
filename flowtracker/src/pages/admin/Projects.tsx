import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
// FIXED: Added 'Users' and 'UserCircle' to the import list to prevent the crash
import { Loader2, Briefcase, Calendar, CheckSquare, Clock, ArrowRight, Eye, X, Activity, TrendingDown, Star, Users, UserCircle } from "lucide-react";

export default function AdminProjects() {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [viewProject, setViewProject] = useState<any | null>(null);
  const [projectAnalytics, setProjectAnalytics] = useState<any>(null);

  useEffect(() => { fetchProjects(); }, []);

  const fetchProjects = async () => {
    setLoading(true);
    const { data } = await supabase.from('projects')
      .select('*, tasks(*), profiles(name)')
      .order('created_at', { ascending: false });
    if (data) setProjects(data);
    setLoading(false);
  };

  const getStatusColor = (status: string) => {
    if (status === 'Completed') return 'bg-emerald-100 text-emerald-700';
    if (status === 'In Progress') return 'bg-blue-100 text-blue-700';
    return 'bg-amber-100 text-amber-700';
  };

  const loadProjectAnalytics = async (proj: any) => {
    setViewProject(proj);
    setProjectAnalytics(null);

    const { data: projectTasks } = await supabase.from('tasks')
      .select('*, profiles(name)')
      .eq('project_id', proj.id);

    if (!projectTasks) return;

    const start = new Date(proj.created_at).getTime();
    const now = proj.status === 'Completed' && proj.updated_at ? new Date(proj.updated_at).getTime() : new Date().getTime();
    const daysActive = Math.floor((now - start) / (1000 * 60 * 60 * 24));

    const contributorMap: any = {};
    projectTasks.forEach(t => {
      const empName = t.profiles?.name || 'Unassigned';
      if (!contributorMap[empName]) {
        contributorMap[empName] = { total: 0, completed: 0 };
      }
      contributorMap[empName].total += 1;
      if (t.status === 'Completed') contributorMap[empName].completed += 1;
    });

    const contributors = Object.keys(contributorMap).map(name => {
      const rate = contributorMap[name].total > 0 
        ? (contributorMap[name].completed / contributorMap[name].total) * 100 
        : 0;
      return { name, rate, total: contributorMap[name].total, completed: contributorMap[name].completed };
    });

    const topPerformers = contributors.filter(c => c.rate >= 80 && c.total > 0);
    const needsAttention = contributors.filter(c => c.rate < 50 && c.total > 0);

    setProjectAnalytics({
      daysActive,
      totalEmployees: contributors.length,
      contributors,
      topPerformers,
      needsAttention
    });
  };

  return (
    <DashboardLayout role="admin">
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in pb-12">
        <div className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div><h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2"><Briefcase className="w-8 h-8 text-blue-600" /> Central Project Hub</h1><p className="text-slate-500 mt-1">High-level overview of all company projects and their completion status.</p></div>
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
                      <Button onClick={() => loadProjectAnalytics(proj)} variant="ghost" size="sm" className="h-8 text-xs text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100">
                        <Eye className="w-3 h-3 mr-1" /> View Details
                      </Button>
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
                        <span className="flex items-center"><Calendar className="w-3.5 h-3.5 mr-1.5"/> Started {new Date(proj.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

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
              
              <CardContent className="p-6 bg-slate-50 max-h-[75vh] overflow-y-auto">
                {!projectAnalytics ? <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div> : (
                  <div className="space-y-6">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <p className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1 mb-1"><Clock className="w-3.5 h-3.5"/> Days Active</p>
                        <p className="text-2xl font-black text-slate-800">{projectAnalytics.daysActive}</p>
                      </div>
                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <p className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1 mb-1"><Users className="w-3.5 h-3.5"/> Team Size</p>
                        <p className="text-2xl font-black text-slate-800">{projectAnalytics.totalEmployees}</p>
                      </div>
                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <p className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1 mb-1"><UserCircle className="w-3.5 h-3.5"/> Project Lead</p>
                        <p className="text-lg font-bold text-slate-800 truncate">{viewProject.profiles?.name || 'Unassigned'}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-white p-5 rounded-xl border border-emerald-200 shadow-sm">
                        <h3 className="font-bold text-emerald-800 flex items-center gap-2 mb-4 border-b border-emerald-100 pb-2"><Star className="w-4 h-4 text-emerald-600"/> Top Contributors</h3>
                        {projectAnalytics.topPerformers.length > 0 ? (
                          <ul className="space-y-3">
                            {projectAnalytics.topPerformers.map((emp: any, i: number) => (
                              <li key={i} className="flex justify-between items-center text-sm">
                                <span className="font-bold text-slate-700">{emp.name}</span>
                                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded">100% ({emp.completed}/{emp.total})</span>
                              </li>
                            ))}
                          </ul>
                        ) : <p className="text-sm text-slate-500 italic">No one has 100% completion rate yet.</p>}
                      </div>

                      <div className="bg-white p-5 rounded-xl border border-red-200 shadow-sm">
                        <h3 className="font-bold text-red-800 flex items-center gap-2 mb-4 border-b border-red-100 pb-2"><TrendingDown className="w-4 h-4 text-red-600"/> Needs Attention</h3>
                        {projectAnalytics.needsAttention.length > 0 ? (
                          <ul className="space-y-3">
                            {projectAnalytics.needsAttention.map((emp: any, i: number) => (
                              <li key={i} className="flex justify-between items-center text-sm">
                                <span className="font-bold text-slate-700">{emp.name}</span>
                                <span className="text-xs font-bold text-red-700 bg-red-50 px-2 py-1 rounded">{emp.rate.toFixed(0)}% ({emp.completed}/{emp.total})</span>
                              </li>
                            ))}
                          </ul>
                        ) : <p className="text-sm text-slate-500 italic">Everyone is performing well.</p>}
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