import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { fnfService } from "@/lib/fnf-service";
import { Loader2, CheckCircle, XCircle, Calendar, User, FileMinus, AlertTriangle } from "lucide-react";

export default function AdminApprovals() {
  const { toast } = useToast();
  const [leaves, setLeaves] = useState<any[]>([]);
  const [resignations, setResignations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => { fetchApprovals(); }, []);

  const fetchApprovals = async () => {
    setLoading(true);
    const [leavesRes, resignationsRes] = await Promise.all([
      supabase.from('leaves').select('*, profiles!inner(name, email, role)').eq('status', 'Pending').neq('profiles.role', 'EMPLOYEE').order('created_at', { ascending: false }),
      supabase.from('resignations').select('*, profiles(name, email, role)').eq('status', 'Pending').order('created_at', { ascending: false })
    ]);
    if (leavesRes.data) setLeaves(leavesRes.data);
    if (resignationsRes.data) setResignations(resignationsRes.data);
    setLoading(false);
  };

  const handleLeaveAction = async (id: string, decision: string) => {
    setProcessingId(id);
    try {
      const { error } = await supabase.from('leaves').update({ status: decision }).eq('id', id);
      if (error) throw error;
      toast({ title: `Leave Request ${decision}` });
      fetchApprovals();
    } catch (err: any) {
      toast({ title: "Action Failed", description: err.message, variant: "destructive" });
    } finally {
      setProcessingId(null);
    }
  };

  const handleResignationApproval = async (resignation: any) => {
    setProcessingId(resignation.id);
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      const lastDay = resignation.expected_last_day || new Date().toISOString().split('T')[0];

      // 1. Authoritative Full & Final Settlement via Database RPC
      const fnfResult = await fnfService.processOffboarding(
        resignation.user_id,
        lastDay,
        0, // noticeShortfallDays
        currentUser?.id,
        'admin'
      );

      // 2. Mark resignation status as Approved
      const { error: resErr } = await supabase
        .from('resignations')
        .update({ status: 'Approved', updated_at: new Date().toISOString() })
        .eq('id', resignation.id);

      if (resErr) throw resErr;

      // 3. Mark employment_status as resigned and archive profile
      await supabase
        .from('profiles')
        .update({
          employment_status: 'resigned',
          status: 'archived',
          offboarding_date: new Date(lastDay).toISOString()
        })
        .eq('id', resignation.user_id);

      // 4. Record Audit Trail
      await supabase.from('audit_log').insert([{
        actor_id: currentUser?.id,
        actor_role: 'admin',
        action: 'EMPLOYEE_OFFBOARDED_FNF_SETTLED',
        entity_type: 'profiles',
        entity_id: resignation.user_id,
        new_values: {
          resignation_id: resignation.id,
          last_working_day: lastDay,
          fnf_id: fnfResult?.fnf_id,
          net_payable: fnfResult?.net_payable
        }
      }]);

      toast({
        title: "Offboarding Finalized",
        description: `Successfully processed ${resignation.profiles?.name}. FnF Settlement net payable: ₹${fnfResult?.net_payable?.toLocaleString('en-IN') || 0}. Account archived.`,
      });

      fetchApprovals();
    } catch (err: any) {
      console.error("Offboarding error:", err);
      toast({
        title: "Offboarding Failed",
        description: err.message || "Failed to process Full-and-Final settlement.",
        variant: "destructive"
      });
    } finally {
      setProcessingId(null);
    }
  };

  const handleResignationRejection = async (id: string) => {
    setProcessingId(id);
    try {
      const { error } = await supabase.from('resignations').update({ status: 'Rejected' }).eq('id', id);
      if (error) throw error;
      toast({ title: "Resignation Request Rejected" });
      fetchApprovals();
    } catch (err: any) {
      toast({ title: "Action Failed", description: err.message, variant: "destructive" });
    } finally {
      setProcessingId(null);
    }
  };

  // TIMESTAMPS
  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return "Today";
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  const formatTime = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  return (
    <DashboardLayout role="admin">
      <div className="max-w-6xl mx-auto space-y-8 animate-fade-in pb-12">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Executive Approvals & HR Operations</h1>
          <p className="text-slate-500 mt-1">Review pending leave requests and process formal employee offboarding with FnF settlement.</p>
        </div>
        
        <Card className="shadow-sm border-red-200">
          <CardHeader className="border-b bg-red-50/50">
            <CardTitle className="text-lg text-red-800 flex items-center gap-2">
              <FileMinus className="w-5 h-5" /> Pending Resignations & Offboarding ({resignations.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin" /></div>
            ) : resignations.length === 0 ? (
              <div className="p-12 text-center text-slate-500">No pending resignations.</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Submitted On</TableHead>
                      <TableHead>Last Working Day</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resignations.map(r => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">
                          <div>{r.profiles?.name}</div>
                          <div className="text-xs text-slate-500">{r.profiles?.role}</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-bold text-slate-800">{formatDate(r.created_at)}</div>
                          <div className="text-xs text-slate-500">at {formatTime(r.created_at)}</div>
                        </TableCell>
                        <TableCell className="font-bold text-red-600">{r.expected_last_day}</TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate">{r.reason}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            onClick={() => handleResignationApproval(r)}
                            disabled={processingId === r.id}
                            className="bg-red-600 hover:bg-red-700 text-white h-8 text-xs mr-2"
                          >
                            {processingId === r.id ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <AlertTriangle className="w-3 h-3 mr-1" />}
                            Execute FnF & Offboard
                          </Button>
                          <Button
                            onClick={() => handleResignationRejection(r.id)}
                            disabled={processingId === r.id}
                            variant="outline"
                            className="h-8 text-xs"
                          >
                            Reject
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200">
          <CardHeader className="border-b bg-amber-50/50">
            <CardTitle className="text-lg text-amber-800 flex items-center gap-2">
              <Calendar className="w-5 h-5" /> Team Lead Leave Requests ({leaves.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin" /></div>
            ) : leaves.length === 0 ? (
              <div className="p-12 text-center text-slate-500">No pending leaves.</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Team Lead</TableHead>
                      <TableHead>Submitted On</TableHead>
                      <TableHead>Dates</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leaves.map(l => (
                      <TableRow key={l.id}>
                        <TableCell className="font-medium">
                          <User className="w-4 h-4 inline mr-2 text-slate-400" />{l.profiles?.name}
                        </TableCell>
                        <TableCell>
                          <div className="font-bold text-slate-800">{formatDate(l.created_at)}</div>
                          <div className="text-xs text-slate-500">at {formatTime(l.created_at)}</div>
                        </TableCell>
                        <TableCell className="text-sm font-medium">{l.start_date} to {l.end_date}</TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate">{l.reason}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            onClick={() => handleLeaveAction(l.id, 'Approved')}
                            disabled={processingId === l.id}
                            className="bg-green-600 hover:bg-green-700 text-white h-8 text-xs mr-2"
                          >
                            <CheckCircle className="w-3 h-3 mr-1" /> Approve
                          </Button>
                          <Button
                            onClick={() => handleLeaveAction(l.id, 'Rejected')}
                            disabled={processingId === l.id}
                            variant="destructive"
                            className="h-8 text-xs"
                          >
                            <XCircle className="w-3 h-3 mr-1" /> Reject
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}