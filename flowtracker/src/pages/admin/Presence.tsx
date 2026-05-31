import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/lib/supabase";
import { Loader2, Clock, Building2, Home as HomeIcon, MapPin, History } from "lucide-react";

export default function AdminPresence() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchPresence(); }, []);

  const fetchPresence = async () => {
    setLoading(true);
    const { data } = await supabase.from('work_logs').select('*, profiles(name, email, role)').order('clock_in', { ascending: false });
    if (data) setLogs(data);
    setLoading(false);
  };

  const formatTime = (iso: string) => iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : "--";
  const formatDate = (iso: string) => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : "--";

  // INDESTRUCTIBLE MATH ENGINE
  const calculateHours = (start: string | null, end: string | null) => {
    if (!start) return 0;
    try {
      const startDate = new Date(start);
      const startTime = startDate.getTime();

      let endTime;
      if (end) {
        endTime = new Date(end).getTime();
      } else {
        const now = new Date();
        const eod = new Date(startDate);
        eod.setHours(23, 59, 59, 999); 
        endTime = now.getTime() > eod.getTime() ? eod.getTime() : now.getTime();
      }

      const hours = (endTime - startTime) / 3600000;
      return hours > 24 ? 24 : (hours > 0 ? hours : 0);
    } catch { return 0; }
  };

  const activeUsers = logs.filter(l => l.status === 'Active');
  const historicalLogs = logs.filter(l => l.status !== 'Active');
  const wfoCount = activeUsers.filter(u => u.work_location === 'WFO').length;
  const wfhCount = activeUsers.filter(u => u.work_location === 'WFH').length;

  return (
    <DashboardLayout role="admin">
      <div className="max-w-6xl mx-auto space-y-6 animate-fade-in pb-12">
        <div className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div><h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2"><MapPin className="w-8 h-8 text-blue-600" /> Time & Presence</h1><p className="text-slate-500 mt-1">Live location tracking and historical attendance records.</p></div>
        </div>

        {loading ? <div className="flex justify-center p-20"><Loader2 className="w-10 h-10 animate-spin text-blue-600" /></div> : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="shadow-sm border-slate-200"><CardContent className="p-6 flex items-center gap-4"><div className="p-4 bg-blue-100 text-blue-600 rounded-full"><Clock className="w-6 h-6"/></div><div><p className="text-sm font-bold text-slate-500 uppercase">Total Online Now</p><h2 className="text-3xl font-black text-slate-800">{activeUsers.length}</h2></div></CardContent></Card>
              <Card className="shadow-sm border-emerald-200 bg-emerald-50/30"><CardContent className="p-6 flex items-center gap-4"><div className="p-4 bg-emerald-100 text-emerald-600 rounded-full"><Building2 className="w-6 h-6"/></div><div><p className="text-sm font-bold text-emerald-700 uppercase">In Office (WFO)</p><h2 className="text-3xl font-black text-emerald-800">{wfoCount}</h2></div></CardContent></Card>
              <Card className="shadow-sm border-indigo-200 bg-indigo-50/30"><CardContent className="p-6 flex items-center gap-4"><div className="p-4 bg-indigo-100 text-indigo-600 rounded-full"><HomeIcon className="w-6 h-6"/></div><div><p className="text-sm font-bold text-indigo-700 uppercase">Working From Home</p><h2 className="text-3xl font-black text-indigo-800">{wfhCount}</h2></div></CardContent></Card>
            </div>

            <Card className="shadow-sm border-blue-200">
              <CardHeader className="border-b bg-blue-50/50"><CardTitle className="text-lg text-blue-800 flex items-center gap-2"><Clock className="w-5 h-5 text-blue-500" /> Currently On The Clock</CardTitle></CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-50"><TableRow><TableHead className="font-bold text-slate-600">Employee Details</TableHead><TableHead className="font-bold text-slate-600">Role</TableHead><TableHead className="font-bold text-slate-600">Location</TableHead><TableHead className="font-bold text-slate-600">Clocked In At</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {activeUsers.map(log => (
                        <TableRow key={log.id} className="hover:bg-slate-50 transition-colors">
                          <TableCell><div className="font-bold text-slate-900">{log.profiles?.name}</div><div className="text-xs text-slate-500">{log.profiles?.email}</div></TableCell>
                          <TableCell><span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{log.profiles?.role?.replace('_', ' ')}</span></TableCell>
                          <TableCell>{log.work_location === 'WFH' ? <span className="flex items-center gap-1 text-xs font-bold text-indigo-700 bg-indigo-100 px-2 py-1 rounded w-max"><HomeIcon className="w-3 h-3"/> Working From Home</span> : <span className="flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-1 rounded w-max"><Building2 className="w-3 h-3"/> In Office (WFO)</span>}</TableCell>
                          <TableCell className="text-emerald-600 font-medium"><span className="text-xs text-slate-400 block">{formatDate(log.clock_in || log.created_at)}</span>{formatTime(log.clock_in || log.created_at)}</TableCell>
                        </TableRow>
                      ))}
                      {activeUsers.length === 0 && <TableRow><TableCell colSpan={4} className="text-center p-8 text-slate-500">No one is currently clocked in.</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-slate-200 mt-8">
              <CardHeader className="border-b bg-slate-50/50"><CardTitle className="text-lg text-slate-800 flex items-center gap-2"><History className="w-5 h-5 text-slate-500" /> Historical Attendance Records</CardTitle></CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto max-h-[500px]">
                  <Table>
                    <TableHeader className="bg-slate-50 sticky top-0 z-10 shadow-sm"><TableRow><TableHead className="font-bold text-slate-600">Date</TableHead><TableHead className="font-bold text-slate-600">Employee</TableHead><TableHead className="font-bold text-slate-600">Location</TableHead><TableHead className="font-bold text-slate-600">Clock In</TableHead><TableHead className="font-bold text-slate-600">Clock Out</TableHead><TableHead className="font-bold text-slate-600">Total Hours</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {historicalLogs.map(log => (
                        <TableRow key={log.id} className="hover:bg-slate-50">
                          <TableCell className="font-medium text-slate-900">{formatDate(log.clock_in || log.created_at)}</TableCell>
                          <TableCell><div className="font-bold text-slate-800">{log.profiles?.name}</div><div className="text-[10px] text-slate-500 uppercase">{log.profiles?.role?.replace('_', ' ')}</div></TableCell>
                          <TableCell>{log.work_location === 'WFH' ? <span className="text-xs font-bold text-indigo-600">WFH</span> : <span className="text-xs font-bold text-emerald-600">WFO</span>}</TableCell>
                          <TableCell className="text-sm text-slate-600">{formatTime(log.clock_in || log.created_at)}</TableCell>
                          <TableCell className="text-sm text-slate-600">{formatTime(log.clock_out)}</TableCell>
                          <TableCell className="font-bold text-slate-800">{calculateHours(log.clock_in || log.created_at, log.clock_out).toFixed(2)} hrs</TableCell>
                        </TableRow>
                      ))}
                      {historicalLogs.length === 0 && <TableRow><TableCell colSpan={6} className="text-center p-8 text-slate-500">No historical records found.</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}