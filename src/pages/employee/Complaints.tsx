import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertTriangle, CheckCircle, Clock, ShieldAlert, Sparkles, Send } from "lucide-react";
import { callCorporateAI } from "@/lib/ai";
import { notificationService } from "@/lib/notifications";

export default function EmployeeComplaints() {
  const { toast } = useToast();
  const [complaints, setComplaints] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);

  // Smart Form State
  const [form, setForm] = useState({ title: "", description: "", category: "General Workflow", target_role: "TEAM_LEAD" });

  useEffect(() => {
    fetchComplaints();
  }, []);

  const fetchComplaints = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (profile) setUserProfile(profile);

    const { data } = await supabase.from('complaints').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    if (data) setComplaints(data);
    setLoading(false);
  };

  const getSeverityBadge = (sev: string) => {
    const s = (sev || "MODERATE").toUpperCase();
    if (s === "CRITICAL") return <span className="bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded text-[10px] font-black uppercase">Critical</span>;
    if (s === "HIGH") return <span className="bg-orange-100 text-orange-700 border border-orange-200 px-2 py-0.5 rounded text-[10px] font-black uppercase">High</span>;
    if (s === "LOW") return <span className="bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded text-[10px] font-black uppercase">Low</span>;
    return <span className="bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded text-[10px] font-black uppercase">Moderate</span>;
  };

  const submitComplaint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.description || !userProfile) return;
    setSubmitting(true);

    try {
      // AI TRIAGE ENGINE: Automatically assess severity to prevent false reporting
      let aiSeverity = "MODERATE";
      try {
        const prompt = `Analyze this corporate employee complaint: "${form.title} - ${form.description}". Return EXACTLY ONE WORD determining the severity: CRITICAL, HIGH, MODERATE, or LOW. No markdown, no punctuation.`;
        const responseText = (await callCorporateAI({ prompt })).trim().toUpperCase();
        if (["CRITICAL", "HIGH", "MODERATE", "LOW"].includes(responseText)) {
          aiSeverity = responseText;
        }
      } catch (aiError) {
        console.warn("AI Triage offline, defaulting to MODERATE", aiError);
      }

      const { error } = await supabase.from('complaints').insert([{
        user_id: userProfile.id,
        title: form.title,
        description: form.description,
        category: form.category,
        target_role: form.target_role,
        severity: aiSeverity,
        status: 'Open'
      }]);

      if (error) throw error;

      await notificationService.sendToRole(form.target_role === 'ADMIN' ? ['admin'] : ['team_lead', 'admin'], {
        title: `New Ticket Filed [${aiSeverity}]`,
        message: `${userProfile.name || 'Employee'} submitted: "${form.title}" (${form.category}).`,
        type: "complaint",
        link: form.target_role === 'ADMIN' ? "/admin/complaints" : "/team-lead/dashboard"
      });

      toast({ title: "Ticket Submitted", description: `Routed to ${form.target_role === 'ADMIN' ? 'System Admin' : 'Team Lead'} (Severity: ${aiSeverity})` });
      setForm({ title: "", description: "", category: "General Workflow", target_role: "TEAM_LEAD" });
      fetchComplaints();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSubmitting(false);
  };

  return (
    <DashboardLayout role="employee">
      <div className="max-w-6xl mx-auto space-y-6 animate-fade-in pb-12">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <ShieldAlert className="w-8 h-8 text-red-600" /> Resolution Desk
            </h1>
            <p className="text-slate-500 mt-1">Submit workflow issues, payroll concerns, or HR reports securely.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <Card className="shadow-sm border-slate-200 sticky top-24">
              <CardHeader className="border-b bg-slate-50/50 pb-4">
                <CardTitle className="text-lg text-slate-800 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-500" /> File a New Ticket
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5">
                <form onSubmit={submitComplaint} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-500 uppercase">Complaint Category</Label>
                    <select className="w-full p-2.5 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-red-500 bg-white" value={form.category} onChange={e => setForm({...form, category: e.target.value})}>
                      <option value="General Workflow">General Workflow Issue</option>
                      <option value="Payroll & Finance">Payroll & Compensation</option>
                      <option value="Harassment / HR">Harassment / HR Violation</option>
                      <option value="IT & Infrastructure">IT / Technical Equipment</option>
                    </select>
                  </div>
                  
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-500 uppercase">Chain of Command Routing</Label>
                    <select className="w-full p-2.5 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-red-500 bg-red-50 text-red-700 font-bold" value={form.target_role} onChange={e => setForm({...form, target_role: e.target.value})}>
                      <option value="TEAM_LEAD">Route to My Team Lead</option>
                      <option value="ADMIN">Escalate Directly to HR Admin</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-500 uppercase">Subject Title</Label>
                    <Input placeholder="Brief summary of issue" value={form.title} onChange={e => setForm({...form, title: e.target.value})} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-500 uppercase flex justify-between">
                      Detailed Description <span className="flex items-center gap-1 text-[9px] text-indigo-500"><Sparkles className="w-3 h-3"/> AI Triaged</span>
                    </Label>
                    <Textarea className="h-32 resize-none" placeholder="Provide specific details..." value={form.description} onChange={e => setForm({...form, description: e.target.value})} required />
                  </div>
                  <Button type="submit" disabled={submitting} className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold">
                    {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />} 
                    Submit Secure Ticket
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2">
            <Card className="shadow-sm border-slate-200">
              <CardHeader className="border-b bg-slate-50/50 pb-4">
                <CardTitle className="text-lg text-slate-800 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-blue-500" /> My Ticket History
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {loading ? <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div> : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-slate-50">
                        <TableRow>
                          <TableHead className="font-bold text-slate-700">Ticket Details</TableHead>
                          <TableHead className="font-bold text-slate-700">Routing / AI Severity</TableHead>
                          <TableHead className="font-bold text-slate-700 text-right">Current Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {complaints.map(comp => (
                          <TableRow key={comp.id} className="hover:bg-slate-50/80">
                            <TableCell>
                              <div className="font-bold text-slate-900">{comp.title}</div>
                              <div className="text-xs text-slate-500 font-medium mt-1 truncate max-w-xs">{comp.category}</div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1.5 items-start">
                                <span className="text-[10px] bg-slate-100 border text-slate-600 px-1.5 py-0.5 rounded font-bold uppercase">{comp.target_role === 'ADMIN' ? 'HR ADMIN' : 'TEAM LEAD'}</span>
                                {getSeverityBadge(comp.severity)}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${comp.status === 'Resolved' || comp.status === 'Closed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                                {comp.status === 'Resolved' || comp.status === 'Closed' ? <CheckCircle className="w-3 h-3"/> : <Clock className="w-3 h-3"/>}
                                {comp.status}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                        {complaints.length === 0 && <TableRow><TableCell colSpan={3} className="text-center p-12 text-slate-500">No complaints filed.</TableCell></TableRow>}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}