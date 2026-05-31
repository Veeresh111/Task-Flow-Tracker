import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/lib/supabase";
import { Loader2, Clock, Calendar, CheckCircle2, Building2, Home as HomeIcon } from "lucide-react";

export default function TeamLeadWorkLogs() {
  const [workLogs, setWorkLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from('work_logs').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
      if (data) setWorkLogs(data);
    }
    setLoading(false);
  };

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

  const formatDateString = (iso: string) => iso ? new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : "--";
  const formatTimeStr = (ms: number | null) => ms ? new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : "--";

  const dailySummaries: { [key: string]: any } = {};
  
  workLogs.forEach(log => {
    const startTime = log?.clock_in || log?.created_at;
    if (!startTime) return;
    const dateStr = formatDateString(startTime);
    if (dateStr === "--") return;
    
    const duration = calculateHours(startTime, log?.clock_out);
    const startMs = new Date(startTime).getTime();
    const endMs = log?.clock_out ? new Date(log.clock_out).getTime() : null;
    
    if (!dailySummaries[dateStr]) {
      dailySummaries[dateStr] = {
        date: dateStr,
        totalHours: 0,
        status: 'Completed',
        sortDate: startMs,
        firstIn: startMs,
        lastOut: endMs,
        location: log.work_location || 'WFO'
      };
    }
    
    dailySummaries[dateStr].totalHours += duration;
    if (startMs < dailySummaries[dateStr].firstIn) dailySummaries[dateStr].firstIn = startMs;
    if (endMs && (!dailySummaries[dateStr].lastOut || endMs > dailySummaries[dateStr].lastOut)) dailySummaries[dateStr].lastOut = endMs;
    
    if (log.status === 'Active') {
      dailySummaries[dateStr].status = 'Active';
      dailySummaries[dateStr].lastOut = null; 
    }
  });

  const aggregatedData = Object.values(dailySummaries).sort((a, b) => b.sortDate - a.sortDate);
  const totalLifetimeHours = aggregatedData.reduce((acc, sum) => acc + sum.totalHours, 0);

  return (
    <DashboardLayout role="team_lead">
      <div className="max-w-6xl mx-auto space-y-6 animate-fade-in pb-12">
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <Calendar className="w-8 h-8 text-blue-600" />
              My Timesheet
            </h1>
            <p className="text-slate-500 mt-1">Your official daily attendance and work hours record.</p>
          </div>
          <div className="bg-blue-50 px-4 py-3 rounded-lg border border-blue-100 flex items-center gap-3">
             <div className="p-2 bg-blue-100 text-blue-600 rounded-full"><Clock className="w-5 h-5"/></div>
             <div>
                <p className="text-xs font-bold text-blue-600 uppercase tracking-wider">Total Career Hours</p>
                <p className="text-xl font-black text-slate-800">{totalLifetimeHours.toFixed(1)} hrs</p>
             </div>
          </div>
        </div>

        {loading ? <div className="flex justify-center p-20"><Loader2 className="w-10 h-10 animate-spin text-blue-600" /></div> : (
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="border-b bg-slate-50/50">
              <CardTitle className="text-lg text-slate-800 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" /> Daily Attendance Record
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="font-bold text-slate-600">Date</TableHead>
                      <TableHead className="font-bold text-slate-600">Location</TableHead>
                      <TableHead className="font-bold text-slate-600">Clocked In</TableHead>
                      <TableHead className="font-bold text-slate-600">Clocked Out</TableHead>
                      <TableHead className="font-bold text-slate-600">Daily Total</TableHead>
                      <TableHead className="font-bold text-slate-600">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {aggregatedData.map((summary, idx) => (
                      <TableRow key={idx} className="hover:bg-slate-50 transition-colors">
                        <TableCell className="font-medium text-slate-900">{summary.date}</TableCell>
                        
                        <TableCell>
                          {summary.location === 'WFH' ? (
                            <span className="flex items-center gap-1 text-xs font-bold text-indigo-700 bg-indigo-100 px-2 py-1 rounded w-max"><HomeIcon className="w-3 h-3"/> WFH</span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-1 rounded w-max"><Building2 className="w-3 h-3"/> WFO</span>
                          )}
                        </TableCell>

                        <TableCell className="text-emerald-600 font-medium">{formatTimeStr(summary.firstIn)}</TableCell>
                        <TableCell className="text-red-500 font-medium">{formatTimeStr(summary.lastOut)}</TableCell>
                        <TableCell className="font-bold text-slate-800 text-base">
                          {summary.status === 'Active' ? <span className="text-blue-500 text-sm font-medium">In Progress...</span> : `${summary.totalHours.toFixed(2)} hrs`}
                        </TableCell>
                        <TableCell>
                          {summary.status === 'Active' 
                            ? <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider animate-pulse border border-blue-200">On The Clock</span> 
                            : <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border border-slate-200">Shift Ended</span>
                          }
                        </TableCell>
                      </TableRow>
                    ))}
                    {aggregatedData.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-center p-8 text-slate-500">No time recorded yet. Click "WFO" or "WFH" at the top to start your first shift.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}