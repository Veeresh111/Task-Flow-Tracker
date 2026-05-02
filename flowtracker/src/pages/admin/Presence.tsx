import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/lib/supabase";
import { Clock, Loader2, Users } from "lucide-react";

export default function AdminPresence() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      const { data } = await supabase.from('work_logs').select('*, profiles(name, department)').order('clock_in', { ascending: false });
      if (data) setLogs(data);
      setLoading(false);
    };
    fetchLogs();
  }, []);

  return (
    <DashboardLayout role="admin">
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Company Presence</h1>
          <p className="text-muted-foreground">Monitor real-time employee Clock In and Clock Out logs.</p>
        </div>

        <Card className="border-0 shadow-lg">
          <CardHeader className="flex flex-row items-center gap-2 border-b bg-slate-50 pb-4">
            <Users className="w-5 h-5 text-blue-600" />
            <CardTitle>Global Work Logs</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {loading ? <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div> : logs.length === 0 ? <p className="text-center text-gray-500 p-8">No presence data recorded yet.</p> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee Name</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Clock In Time</TableHead>
                    <TableHead>Clock Out Time</TableHead>
                    <TableHead>Current Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map(log => (
                    <TableRow key={log.id}>
                      <TableCell className="font-bold text-gray-900">{log.profiles?.name || 'Unknown'}</TableCell>
                      <TableCell className="text-gray-600">{log.profiles?.department || 'N/A'}</TableCell>
                      <TableCell className="text-sm font-medium">{new Date(log.clock_in).toLocaleString()}</TableCell>
                      <TableCell className="text-sm text-gray-500">{log.clock_out ? new Date(log.clock_out).toLocaleString() : '--'}</TableCell>
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