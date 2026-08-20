import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { notificationService } from "@/lib/notifications";
import { Loader2, Calendar, FileMinus, Send, CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react";

export default function EmployeeLeaves() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [resignations, setResignations] = useState<any[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  const [leaveData, setLeaveData] = useState({ type: "Casual", start: "", end: "", reason: "" });
  const [resignationData, setResignationData] = useState({ date: "", reason: "" });

  useEffect(() => { fetchHistory(); }, []);

  const fetchHistory = async () => {
    setFetching(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUserId(user.id);
      const [leavesRes, resigRes] = await Promise.all([
        supabase.from('leaves').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('resignations').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
      ]);
      if (leavesRes.data) setLeaves(leavesRes.data);
      if (resigRes.data) setResignations(resigRes.data);
    }
    setFetching(false);
  };

  const handleLeaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    setLoading(true);
    try {
      const { error } = await supabase.from('leaves').insert([{
        user_id: userId, leave_type: leaveData.type, start_date: leaveData.start, end_date: leaveData.end, reason: leaveData.reason, status: 'Pending'
      }]);
      if (error) throw error;

      await notificationService.sendToRole(['team_lead', 'hr', 'admin'], {
        title: "New Leave Request Submitted",
        message: `Employee requested ${leaveData.type} leave from ${leaveData.start} to ${leaveData.end}.`,
        type: "leave",
        link: "/team-lead/leaves"
      });

      toast({ title: "Leave Request Submitted", description: "Sent to Team Lead & HR for approval." });
      setLeaveData({ type: "Casual", start: "", end: "", reason: "" });
      fetchHistory();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const handleResignationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    if (!window.confirm("Are you absolutely sure you want to submit your official resignation?")) return;
    setLoading(true);
    try {
      const { error } = await supabase.from('resignations').insert([{
        user_id: userId, expected_last_day: resignationData.date, reason: resignationData.reason, status: 'Pending'
      }]);
      if (error) throw error;

      await notificationService.sendToRole(['hr', 'admin'], {
        title: "Official Resignation Submitted",
        message: `An employee submitted an official resignation notice. Expected last day: ${resignationData.date}.`,
        type: "hr",
        link: "/hr/leaves"
      });

      toast({ title: "Resignation Submitted", description: "HR has been notified." });
      setResignationData({ date: "", reason: "" });
      fetchHistory();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const StatusBadge = ({ status }: { status: string }) => {
    if (status === 'Approved') return <span className="flex items-center gap-1 text-xs font-bold bg-green-100 text-green-700 px-2 py-1 rounded uppercase"><CheckCircle2 className="w-3 h-3"/> Approved</span>;
    if (status === 'Rejected') return <span className="flex items-center gap-1 text-xs font-bold bg-red-100 text-red-700 px-2 py-1 rounded uppercase"><XCircle className="w-3 h-3"/> Rejected</span>;
    return <span className="flex items-center gap-1 text-xs font-bold bg-amber-100 text-amber-700 px-2 py-1 rounded uppercase"><Clock className="w-3 h-3"/> Pending</span>;
  };

  return (
    <DashboardLayout role="employee">
      <div className="max-w-6xl mx-auto space-y-8 animate-fade-in pb-12">
        <div><h1 className="text-3xl font-bold tracking-tight">HR & Leave Portal</h1><p className="text-muted-foreground">Manage your time off requests and employment status.</p></div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card className="border-blue-100 shadow-md">
            <CardHeader className="bg-blue-50/50 border-b pb-4"><CardTitle className="flex items-center gap-2 text-blue-800"><Calendar className="w-5 h-5" /> Request Time Off</CardTitle></CardHeader>
            <CardContent className="pt-6">
              <form onSubmit={handleLeaveSubmit} className="space-y-4">
                <div className="space-y-2"><Label>Leave Type</Label><select required className="w-full p-2 border rounded-md" value={leaveData.type} onChange={e => setLeaveData({...leaveData, type: e.target.value})}><option value="Casual">Casual Leave</option><option value="Sick">Sick Leave</option><option value="Vacation">Vacation</option><option value="Unpaid">Unpaid Leave</option></select></div>
                <div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label>Start Date</Label><Input type="date" required value={leaveData.start} onChange={e => setLeaveData({...leaveData, start: e.target.value})} /></div><div className="space-y-2"><Label>End Date</Label><Input type="date" required value={leaveData.end} onChange={e => setLeaveData({...leaveData, end: e.target.value})} /></div></div>
                <div className="space-y-2"><Label>Reason</Label><textarea required className="w-full p-2 border rounded-md h-20 resize-none" value={leaveData.reason} onChange={e => setLeaveData({...leaveData, reason: e.target.value})} /></div>
                <Button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white"><Send className="w-4 h-4 mr-2" /> Submit Request</Button>
              </form>
            </CardContent>
          </Card>

          <Card className="border-red-100 shadow-md">
            <CardHeader className="bg-red-50/50 border-b pb-4"><CardTitle className="flex items-center gap-2 text-red-800"><FileMinus className="w-5 h-5" /> Official Resignation</CardTitle><CardDescription className="text-red-600">This action is highly sensitive.</CardDescription></CardHeader>
            <CardContent className="pt-6">
              <form onSubmit={handleResignationSubmit} className="space-y-4">
                <div className="space-y-2"><Label>Expected Last Working Day</Label><Input type="date" required value={resignationData.date} onChange={e => setResignationData({...resignationData, date: e.target.value})} /></div>
                <div className="space-y-2"><Label>Reason for Leaving</Label><textarea required className="w-full p-2 border rounded-md h-32 resize-none" placeholder="Please provide your formal reason..." value={resignationData.reason} onChange={e => setResignationData({...resignationData, reason: e.target.value})} /></div>
                <Button type="submit" disabled={loading} variant="destructive" className="w-full"><AlertTriangle className="w-4 h-4 mr-2" /> Initiate Offboarding</Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <Card className="shadow-sm">
          <CardHeader className="border-b bg-slate-50/50"><CardTitle className="text-lg">Your Request History</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="p-4 border-b bg-slate-50"><h3 className="font-bold text-slate-700 text-sm uppercase">Leave Requests</h3></div>
            {leaves.length === 0 ? <p className="p-4 text-sm text-slate-500 text-center">No leave requests found.</p> : (
              <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Dates</TableHead><TableHead>Reason</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>
                {leaves.map(l => (<TableRow key={l.id}><TableCell className="font-semibold">{l.leave_type}</TableCell><TableCell className="text-sm text-slate-600">{l.start_date} to {l.end_date}</TableCell><TableCell className="text-sm text-slate-600 max-w-[200px] truncate" title={l.reason}>{l.reason}</TableCell><TableCell><StatusBadge status={l.status} /></TableCell></TableRow>))}
              </TableBody></Table></div>
            )}
            <div className="p-4 border-y bg-slate-50 mt-4"><h3 className="font-bold text-slate-700 text-sm uppercase">Resignation Status</h3></div>
            {resignations.length === 0 ? <p className="p-4 text-sm text-slate-500 text-center">No resignation records found.</p> : (
              <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Submitted On</TableHead><TableHead>Last Day</TableHead><TableHead>Reason</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>
                {resignations.map(r => (<TableRow key={r.id}><TableCell className="text-sm">{new Date(r.created_at).toLocaleDateString()}</TableCell><TableCell className="font-bold text-red-600">{r.expected_last_day}</TableCell><TableCell className="text-sm text-slate-600 max-w-[200px] truncate" title={r.reason}>{r.reason}</TableCell><TableCell><StatusBadge status={r.status} /></TableCell></TableRow>))}
              </TableBody></Table></div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}