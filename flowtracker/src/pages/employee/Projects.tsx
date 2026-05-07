import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { Loader2, Briefcase, Calendar, Flag } from "lucide-react";

export default function EmployeeProjects() {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchProjects(); }, []);

  const fetchProjects = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      // Fetch projects assigned to their Team Lead (or you can fetch all if company is open)
      const { data } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
      if (data) setProjects(data);
    }
    setLoading(false);
  };

  const formatDate = (iso: string) => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : "Not Set";

  return (
    <DashboardLayout role="employee">
      <div className="max-w-6xl mx-auto space-y-6 animate-fade-in pb-12">
        <div><h1 className="text-3xl font-bold tracking-tight text-slate-900">Projects</h1><p className="text-slate-500">View active timelines.</p></div>
        {loading ? <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div> : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map(p => (
              <Card key={p.id} className="shadow-sm border-slate-200">
                <CardContent className="p-5 space-y-4">
                  <div className="flex justify-between items-start"><div className="p-2 bg-blue-50 text-blue-600 rounded"><Briefcase className="w-5 h-5"/></div><span className={`px-2 py-1 text-[10px] font-bold uppercase rounded ${p.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{p.status || 'Active'}</span></div>
                  <div><h3 className="font-bold text-lg text-slate-800 line-clamp-1">{p.name}</h3><p className="text-sm text-slate-500 line-clamp-2 mt-1">{p.description}</p></div>
                  <div className="pt-4 border-t flex flex-col gap-2 bg-slate-50 p-3 rounded-md mt-2">
                    <div className="flex items-center justify-between text-xs text-slate-600"><span className="flex items-center"><Calendar className="w-3.5 h-3.5 mr-1.5 text-blue-500"/> Start Date:</span><strong className="text-slate-800">{formatDate(p.start_date || p.created_at)}</strong></div>
                    <div className="flex items-center justify-between text-xs text-slate-600"><span className="flex items-center"><Flag className="w-3.5 h-3.5 mr-1.5 text-red-500"/> Deadline:</span><strong className="text-red-600">{formatDate(p.deadline)}</strong></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}