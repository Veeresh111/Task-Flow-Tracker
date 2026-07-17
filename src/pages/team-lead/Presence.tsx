import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/lib/supabase";
import { Loader2, Users, Building2, Home as HomeIcon } from "lucide-react";

export default function EmployeePresence() {
  const [activeUsers, setActiveUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchPresence(); }, []);

  const fetchPresence = async () => {
    setLoading(true);
    const { data } = await supabase.from('work_logs').select('*, profiles(name, email, role)').eq('status', 'Active').order('clock_in', { ascending: false });
    if (data) setActiveUsers(data);
    setLoading(false);
  };

  const formatTime = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  return (
    <DashboardLayout role="team_lead">
      <div className="max-w-5xl mx-auto space-y-6 animate-fade-in pb-12">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2"><Users className="w-8 h-8 text-blue-600" /> Colleague Presence</h1>
          <p className="text-slate-500 mt-1">See which of your team members are currently online and working.</p>
        </div>

        {loading ? <div className="flex justify-center p-20"><Loader2 className="w-10 h-10 animate-spin text-blue-600" /></div> : (
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="border-b bg-slate-50/50"><CardTitle className="text-lg text-slate-800">Currently Active Colleagues</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50"><TableRow><TableHead className="font-bold">Colleague</TableHead><TableHead className="font-bold">Role</TableHead><TableHead className="font-bold">Location</TableHead><TableHead className="font-bold">Clocked In At</TableHead></TableRow></TableHeader>
                <TableBody>
                  {activeUsers.map(log => (
                    <TableRow key={log.id}>
                      <TableCell><div className="font-bold text-slate-900">{log.profiles?.name}</div></TableCell>
                      <TableCell><span className="text-xs font-bold text-slate-500 uppercase">{log.profiles?.role?.replace('_', ' ')}</span></TableCell>
                      <TableCell>{log.work_location === 'WFH' ? <span className="flex items-center gap-1 text-xs font-bold text-indigo-700 bg-indigo-100 px-2 py-1 rounded w-max"><HomeIcon className="w-3 h-3"/> WFH</span> : <span className="flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-1 rounded w-max"><Building2 className="w-3 h-3"/> WFO</span>}</TableCell>
                      <TableCell className="text-emerald-600 font-medium">{formatTime(log.clock_in || log.created_at)}</TableCell>
                    </TableRow>
                  ))}
                  {activeUsers.length === 0 && <TableRow><TableCell colSpan={4} className="text-center p-8 text-slate-500">No one is currently clocked in.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}