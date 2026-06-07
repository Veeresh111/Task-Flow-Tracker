import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Loader2, CheckSquare, Clock, AlertTriangle, ClipboardList } from "lucide-react";

export default function EmployeeTasks() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    try {
      setLoading(true);
      setError(null);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) throw new Error("Authentication error. Please log in again.");

      const { data, error: fetchErr } = await supabase
        .from('tasks')
        .select('*')
        .eq('assigned_to', user.id)
        .order('created_at', { ascending: false });

      if (fetchErr) throw fetchErr;
      
      setTasks(data || []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to load tasks.");
    } finally {
      setLoading(false);
    }
  };

  const markComplete = async (id: string) => {
    try {
      const { error } = await supabase.from('tasks').update({ status: 'Completed' }).eq('id', id);
      if (error) throw error;
      toast({ title: "Task Completed!", description: "Great job. Your Team Lead will be notified." });
      fetchTasks();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  // ULTRA-SAFE FORMATTERS
  const formatDate = (iso: string | null | undefined) => {
    if (!iso) return "Not Set";
    try {
      const d = new Date(iso);
      const today = new Date();
      if (d.toDateString() === today.toDateString()) return "Today";
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return "Invalid Date";
    }
  };

  const formatTime = (iso: string | null | undefined) => {
    if (!iso) return "--:--";
    try {
      return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } catch {
      return "--:--";
    }
  };

  // ERROR STATE
  if (error) {
    return (
      <DashboardLayout role="employee">
        <div className="max-w-4xl mx-auto p-8 mt-12 bg-red-50 border-2 border-red-200 rounded-xl flex items-start gap-4">
          <AlertTriangle className="w-8 h-8 text-red-600 flex-shrink-0" />
          <div>
            <h1 className="text-xl font-bold text-red-800">Failed to Load Tasks</h1>
            <p className="text-red-600 mt-1">{error}</p>
            <button onClick={fetchTasks} className="mt-4 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700">Try Again</button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="employee">
      <div className="max-w-6xl mx-auto space-y-6 animate-fade-in pb-12">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Your Action Items</h1>
          <p className="text-slate-500">Tasks assigned to you by your Team Lead.</p>
        </div>

        {loading ? (
          <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            
            {/* EMPTY STATE UI */}
            {tasks.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center p-16 bg-white rounded-xl border border-slate-200 border-dashed">
                <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-4">
                  <ClipboardList className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-1">You are all caught up!</h3>
                <p className="text-slate-500 text-center max-w-md">There are currently no tasks assigned to you. When your manager assigns a new task, it will appear right here.</p>
              </div>
            )}

            {tasks.map(t => (
              <Card key={t.id} className="shadow-sm border-slate-200 hover:shadow-md transition-shadow">
                <CardContent className="p-5 space-y-4">
                  
                  <div className="flex justify-between items-start">
                    <span className={`px-2 py-1 text-[10px] font-black uppercase rounded tracking-wider ${t.complexity === 'High' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                      {t.complexity || "Standard"} Priority
                    </span>
                    <span className={`px-2 py-1 text-[10px] font-bold uppercase rounded ${t.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {t.status || "Pending"}
                    </span>
                  </div>

                  <div>
                    <h3 className="font-bold text-lg text-slate-800 line-clamp-2">{t.title}</h3>
                    {t.description && (
                      <p className="text-sm text-slate-500 mt-2 line-clamp-3 leading-relaxed whitespace-pre-wrap">
                        {t.description}
                      </p>
                    )}
                  </div>

                  <div className="bg-slate-50 p-3 rounded border border-slate-100">
                    <div className="flex items-center text-xs text-slate-500 mb-1">
                      <Clock className="w-3.5 h-3.5 mr-1.5 text-blue-500"/> Assigned on: 
                      <strong className="ml-1 text-slate-800">{formatDate(t.created_at)}</strong>
                    </div>
                    <div className="flex items-center text-xs text-slate-500 ml-5">
                      at <strong className="ml-1 text-slate-800">{formatTime(t.created_at)}</strong>
                    </div>
                  </div>

                  {t.status !== 'Completed' && (
                    <Button onClick={() => markComplete(t.id)} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-sm">
                      <CheckSquare className="w-4 h-4 mr-2" /> Mark as Done
                    </Button>
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