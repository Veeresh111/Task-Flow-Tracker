import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { notificationService } from "@/lib/notifications";
import { Loader2, CheckCircle, XCircle, Calendar, User } from "lucide-react";

export default function TeamLeadApprovals() {
  const { toast } = useToast();
  const [leaves, setLeaves] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchApprovals(); }, []);

  const fetchApprovals = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    // 1. Fetch Team Lead profile data to know their department
    const { data: tlProfile } = await supabase
      .from('profiles')
      .select('department')
      .eq('id', user.id)
      .single();
    
    const tlDept = tlProfile?.department || '';

    // 2. Fetch all profiles to isolate the TL's exact team members (Smart MNC Matching)
    const { data: allProfiles } = await supabase.from('profiles').select('id, team_lead_id, department, role');
    const teamMembers = (allProfiles || []).filter(p => 
      p.id !== user.id && 
      (p.team_lead_id === user.id || (p.department === tlDept && p.role?.toUpperCase() === 'EMPLOYEE'))
    );
    
    const teamMemberIds = teamMembers.map(m => m.id);

    // If the TL has no team members yet, skip the leaves fetch entirely
    if (teamMemberIds.length === 0) {
      setLeaves([]);
      setLoading(false);
      return;
    }

    // 3. LOGIC FIX: Fetch ONLY the pending leaves for this specific TL's team!
    const { data, error } = await supabase
      .from('leaves')
      .select('*, profiles!inner(name, email, role)')
      .eq('status', 'Pending')
      .in('user_id', teamMemberIds) // The Magic Line that scopes data strictly to their team
      .order('created_at', { ascending: false });

    if (!error && data) setLeaves(data);
    setLoading(false);
  };

  const handleDecision = async (id: string, decision: 'Approved' | 'Rejected') => {
    try {
      const targetLeave = leaves.find(l => l.id === id);
      const { error } = await supabase.from('leaves').update({ status: decision }).eq('id', id);
      if (error) throw error;

      if (targetLeave?.user_id) {
        await notificationService.sendToUser(targetLeave.user_id, {
          title: `Leave Request ${decision}`,
          message: `Your ${targetLeave.leave_type} leave request (${targetLeave.start_date} to ${targetLeave.end_date}) was ${decision.toLowerCase()} by your Team Lead.`,
          type: "leave",
          link: "/employee/leaves"
        });
      }

      toast({ title: `Leave ${decision}`, variant: decision === 'Approved' ? "default" : "destructive" });
      setLeaves(leaves.filter(l => l.id !== id));
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <DashboardLayout role="team_lead">
      <div className="max-w-6xl mx-auto space-y-6 animate-fade-in pb-12">
        <div><h1 className="text-3xl font-bold tracking-tight text-slate-900">Team Approvals Inbox</h1><p className="text-slate-500 mt-1">Review pending leave requests from your employees.</p></div>
        <Card className="shadow-sm border-slate-200">
          <CardHeader className="border-b bg-amber-50/50"><CardTitle className="text-lg text-amber-800 flex items-center gap-2"><Calendar className="w-5 h-5" /> Pending Employee Leaves ({leaves.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            {loading ? <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-amber-600" /></div> : leaves.length === 0 ? <div className="p-12 text-center text-slate-500 font-medium">You are all caught up!</div> : (
              <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Leave Type</TableHead><TableHead>Dates</TableHead><TableHead>Reason</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>
                {leaves.map(l => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium"><div className="flex items-center gap-2"><User className="w-4 h-4 text-slate-400" />{l.profiles?.name}</div></TableCell>
                    <TableCell><span className="bg-slate-100 px-2 py-1 rounded text-xs font-bold text-slate-600">{l.leave_type}</span></TableCell>
                    <TableCell className="text-sm text-slate-600 font-medium">{l.start_date} to {l.end_date}</TableCell>
                    <TableCell className="text-sm text-slate-500 max-w-[200px] truncate" title={l.reason}>{l.reason}</TableCell>
                    <TableCell className="text-right"><div className="flex justify-end gap-2"><Button onClick={() => handleDecision(l.id, 'Approved')} className="bg-green-600 hover:bg-green-700 text-white h-8 text-xs"><CheckCircle className="w-3 h-3 mr-1" /> Approve</Button><Button onClick={() => handleDecision(l.id, 'Rejected')} variant="destructive" className="h-8 text-xs"><XCircle className="w-3 h-3 mr-1" /> Reject</Button></div></TableCell>
                  </TableRow>
                ))}
              </TableBody></Table></div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}