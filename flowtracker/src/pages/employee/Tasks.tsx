import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { Loader2, CheckSquare, Clock, AlertCircle } from "lucide-react";

export default function EmployeeTasks() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from('tasks').select('*').eq('assigned_to', user.id).order('created_at', { ascending: false });
      if (data) setTasks(data);
    }
    setLoading(false);
  };

  const markComplete = async (id: string) => {
    await supabase.from('tasks').update({ status: 'Completed' }).eq('id', id);
    fetchTasks();
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return "Today";
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  const formatTime = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  return (
    <DashboardLayout role="employee">
      <div className="max-w-6xl mx-auto space-y-6 animate-fade-in pb-12">
        <div><h1 className="text-3xl font-bold tracking-tight text-slate-900">Your Action Items</h1><p className="text-slate-500">Tasks assigned to you by your Team Lead.</p></div>

        {loading ? <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div> : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {tasks.map(t => (
              <Card key={t.id} className="shadow-sm border-slate-200">
                <CardContent className="p-5 space-y-4">
                  <div className="flex justify-between items-start">
                    <span className={`px-2 py-1 text-[10px] font-black uppercase rounded tracking-wider ${t.complexity === 'High' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>{t.complexity} Priority</span>
                    <span className={`px-2 py-1 text-[10px] font-bold uppercase rounded ${t.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{t.status}</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-slate-800 line-clamp-2">{t.title}</h3>
                  </div>
                  <div className="bg-slate-50 p-3 rounded border border-slate-100">
                    <div className="flex items-center text-xs text-slate-500 mb-1"><Clock className="w-3.5 h-3.5 mr-1.5 text-blue-500"/> Assigned on: <strong className="ml-1 text-slate-800">{formatDate(t.created_at)}</strong></div>
                    <div className="flex items-center text-xs text-slate-500 ml-5">at <strong className="ml-1 text-slate-800">{formatTime(t.created_at)}</strong></div>
                  </div>
                  {t.status !== 'Completed' && (
                    <Button onClick={() => markComplete(t.id)} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"><CheckSquare className="w-4 h-4 mr-2" /> Mark as Done</Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}