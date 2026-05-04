import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from "@/lib/supabase";
import { Loader2 } from "lucide-react";

export default function EmployeeAnalytics() {
  const [loading, setLoading] = useState(true);
  const [taskData, setTaskData] = useState<any[]>([]);

  useEffect(() => {
    const fetchRealData = async () => {
      setLoading(true);
      const { data: tasks } = await supabase.from('tasks').select('status');
      if (tasks) {
        const pending = tasks.filter(t => t.status === 'pending').length;
        const progress = tasks.filter(t => t.status === 'in_progress').length;
        const completed = tasks.filter(t => t.status === 'completed').length;
        
        setTaskData([
          { name: 'Pending', count: pending },
          { name: 'In Progress', count: progress },
          { name: 'Completed', count: completed },
        ]);
      }
      setLoading(false);
    };

    fetchRealData();
  }, []);

  return (
    <DashboardLayout role="employee">
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Real-Time Analytics</h1>
          <p className="text-muted-foreground">Live metrics synced directly from the database.</p>
        </div>

        {loading ? (
          <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
        ) : (
          <Card className="shadow-lg border-0">
            <CardHeader><CardTitle>Task Status Distribution</CardTitle></CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={taskData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} />
                  <YAxis axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: 'transparent' }} />
                  <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}