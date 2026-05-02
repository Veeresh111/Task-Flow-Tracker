import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/lib/supabase";
import { Clock, Loader2 } from "lucide-react";

export default function EmployeeWorkLogs() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Fetch ONLY this employee's private work logs
        const { data } = await supabase.from('work_logs').select('*').eq('user_id', user.id).order('clock_in', { ascending: false });
        if (data) setLogs(data);
      }
      setLoading(false);
    };
    fetchLogs();
  }, []);

  return (
    <DashboardLayout role="employee">
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Work Logs</h1>
          <p className="text-muted-foreground">View your historical presence and exact clocked hours.</p>
        </div>

        <Card className="border-0 shadow-lg">
          <CardHeader className="flex flex-row items-center gap-2 border-b bg-slate-50 pb-4">
            <Clock className="w-5 h-5 text-emerald-600" />
            <CardTitle>Presence History</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {loading ? <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-emerald-600" /></div> : logs.length === 0 ? <p className="text-center text-gray-500 p-8">You haven't clocked in yet.</p> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Clock In Timestamp</TableHead>
                    <TableHead>Clock Out Timestamp</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map(log => (
                    <TableRow key={log.id}>
                      <TableCell className="font-medium text-gray-900">{new Date(log.clock_in).toLocaleString()}</TableCell>
                      <TableCell className="text-gray-500">{log.clock_out ? new Date(log.clock_out).toLocaleString() : '--'}</TableCell>
                      <TableCell>
                        <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${log.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                          {log.status === 'Active' ? 'Clocked In' : 'Clocked Out'}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}