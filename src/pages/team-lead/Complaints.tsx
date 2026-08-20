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
import { Loader2, ShieldAlert, CheckCircle, Clock, MessageSquare, ArrowUpRight, Search, Filter, Send, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { callCorporateAI } from "@/lib/ai";

export default function TeamLeadComplaints() {
  const { toast } = useToast();
  const [complaints, setComplaints] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // NEW: State for Search, Filter, and Filing Complaints
  const [userProfile, setUserProfile] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", category: "General Workflow" });

  useEffect(() => {
    fetchTeamComplaints();
  }, []);

  const fetchTeamComplaints = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Get current user profile for filing new complaints
    const { data: tlProfile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (tlProfile) setUserProfile(tlProfile);

    const tlDept = tlProfile?.department || '';

    // Find all employees under this TL
    const { data: allProfiles } = await supabase.from('profiles').select('id, team_lead_id, department, role');
    const teamMembers = (allProfiles || []).filter(p => 
      p.id !== user.id && 
      (p.team_lead_id === user.id || (p.department === tlDept && p.role?.toUpperCase() === 'EMPLOYEE'))
    );
    const teamIds = teamMembers.map(m => m.id);

    // Fetch complaints routed to the TEAM_LEAD from THEIR specific team
    const { data: teamComplaints } = teamIds.length > 0 
      ? await supabase.from('complaints').select('*, profiles!inner(name)').eq('target_role', 'TEAM_LEAD').in('user_id', teamIds)
      : { data: [] };

    // Fetch complaints FILED BY the Team Lead themselves
    const { data: myComplaints } = await supabase.from('complaints')
      .select('*, profiles!inner(name)')
      .eq('user_id', user.id);

    // Merge safely
    const merged = [...(teamComplaints || []), ...(myComplaints || [])];
    const uniqueMap = new Map();
    merged.forEach(c => uniqueMap.set(c.id, c));
    const finalComplaints = Array.from(uniqueMap.values()).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    setComplaints(finalComplaints);
    setLoading(false);
  };

  const getSeverityBadge = (sev: string) => {
    const s = (sev || "MODERATE").toUpperCase();
    if (s === "CRITICAL") return <span className="bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded text-[10px] font-black uppercase">Critical</span>;
    if (s === "HIGH") return <span className="bg-orange-100 text-orange-700 border border-orange-200 px-2 py-0.5 rounded text-[10px] font-black uppercase">High</span>;
    if (s === "LOW") return <span className="bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded text-[10px] font-black uppercase">Low</span>;
    return <span className="bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded text-[10px] font-black uppercase">Moderate</span>;
  };

  const updateStatus = async (id: string, newStatus: string) => {
    const { error } = await supabase.from('complaints').update({ status: newStatus }).eq('id', id);
    if (!error) {
      toast({ title: "Status Updated", description: `Complaint marked as ${newStatus}` });
      setComplaints(complaints.map(c => c.id === id ? { ...c, status: newStatus } : c));
    }
  };

  const escalateToAdmin = async (id: string) => {
    if (!window.confirm("Escalate this issue directly to the HR System Admin?")) return;
    const { error } = await supabase.from('complaints').update({ target_role: 'ADMIN', status: 'Escalated' }).eq('id', id);
    if (!error) {
      toast({ title: "Ticket Escalated", description: "Transferred to System Admin." });
      setComplaints(complaints.filter(c => c.id !== id));
    }
  };

  const dispatchChat = (userId: string, userName: string) => {
    localStorage.setItem('activeChatUserId', userId);
    localStorage.setItem('activeChatUserName', userName);
    navigate(`/team-lead/chat?userId=${userId}`, { state: { selectedUserId: userId, selectedUserName: userName } });
  };

  // NEW: Submit Complaint Function for TL
  const submitComplaint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.description || !userProfile) return;
    setSubmitting(true);

    try {
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
        target_role: 'ADMIN', // TL complaints always route to System Admin
        severity: aiSeverity,
        status: 'Open'
      }]);

      if (error) throw error;
      toast({ title: "Ticket Submitted", description: `Routed to System Admin (Severity: ${aiSeverity})` });
      setForm({ title: "", description: "", category: "General Workflow" });
      fetchTeamComplaints();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSubmitting(false);
  };

  // NEW: Smart Search & Filter Engine
  const filteredComplaints = complaints.filter(c => {
    const matchesSearch = c.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          c.profiles?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          c.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSeverity = severityFilter === "ALL" || (c.severity || "MODERATE").toUpperCase() === severityFilter;
    return matchesSearch && matchesSeverity;
  });

  return (
    <DashboardLayout role="team_lead">
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in pb-12">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <ShieldAlert className="w-8 h-8 text-amber-600" /> Team Resolutions
            </h1>
            <p className="text-slate-500 mt-1">Review internal team conflicts, or file your own escalation to the HR Admin.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* NEW: File a Ticket Form for TL */}
          <div className="lg:col-span-1">
            <Card className="shadow-sm border-slate-200 sticky top-24">
              <CardHeader className="border-b bg-slate-50/50 pb-4">
                <CardTitle className="text-lg text-slate-800 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600" /> File System Escalation
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5">
                <form onSubmit={submitComplaint} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-500 uppercase">Complaint Category</Label>
                    <select className="w-full p-2.5 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-amber-500 bg-white" value={form.category} onChange={e => setForm({...form, category: e.target.value})}>
                      <option value="General Workflow">General Workflow Issue</option>
                      <option value="Payroll & Finance">Payroll & Compensation</option>
                      <option value="Harassment / HR">Harassment / HR Violation</option>
                      <option value="IT & Infrastructure">IT / Technical Equipment</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-500 uppercase">Subject Title</Label>
                    <Input placeholder="Brief summary of issue" value={form.title} onChange={e => setForm({...form, title: e.target.value})} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-500 uppercase flex justify-between">
                      Detailed Description <span className="text-[9px] text-indigo-500">AI Triaged</span>
                    </Label>
                    <Textarea className="h-28 resize-none" placeholder="Provide specific details..." value={form.description} onChange={e => setForm({...form, description: e.target.value})} required />
                  </div>
                  <Button type="submit" disabled={submitting} className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold">
                    {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />} 
                    Escalate to Admin
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2 space-y-4">
            {/* NEW: Smart Search & Filter Bar */}
            <div className="flex flex-col md:flex-row gap-3">
              <div className="relative flex-1 shadow-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input placeholder="Search tickets by subject, description, or employee name..." className="pl-9 border-slate-300 focus-visible:ring-amber-500" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
              </div>
              <div className="flex items-center gap-2 shadow-sm">
                <Filter className="w-4 h-4 text-slate-500" />
                <select className="p-2.5 border border-slate-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-amber-500 bg-white font-bold text-slate-700" value={severityFilter} onChange={e => setSeverityFilter(e.target.value)}>
                  <option value="ALL">All Severities</option>
                  <option value="CRITICAL">Critical AI Rating</option>
                  <option value="HIGH">High AI Rating</option>
                  <option value="MODERATE">Moderate AI Rating</option>
                  <option value="LOW">Low AI Rating</option>
                </select>
              </div>
            </div>

            <Card className="shadow-sm border-slate-200 bg-white">
              <CardHeader className="border-b bg-slate-50/50">
                <CardTitle className="text-lg text-slate-800">Tickets & Resolutions ({filteredComplaints.filter(c => c.status !== 'Resolved' && c.status !== 'Closed').length} Active)</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {loading ? <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-amber-600" /></div> : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-slate-50">
                        <TableRow>
                          <TableHead className="font-bold text-slate-700">Origin / Category</TableHead>
                          <TableHead className="font-bold text-slate-700">Complaint Description</TableHead>
                          <TableHead className="font-bold text-slate-700">AI Severity</TableHead>
                          <TableHead className="font-bold text-slate-700 text-center">Status</TableHead>
                          <TableHead className="font-bold text-slate-700 text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredComplaints.map(comp => (
                          <TableRow key={comp.id} className="hover:bg-slate-50/80">
                            <TableCell>
                              <div className="font-bold text-slate-900">{comp.profiles?.name} {comp.user_id === userProfile?.id && "(You)"}</div>
                              <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1">{comp.category}</div>
                            </TableCell>
                            <TableCell>
                              <div className="font-bold text-slate-800 text-sm">{comp.title}</div>
                              <div className="text-xs text-slate-500 mt-0.5 line-clamp-2 max-w-[200px]" title={comp.description}>{comp.description}</div>
                            </TableCell>
                            <TableCell>{getSeverityBadge(comp.severity)}</TableCell>
                            <TableCell className="text-center">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${comp.status === 'Resolved' || comp.status === 'Closed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                                {comp.status === 'Resolved' || comp.status === 'Closed' ? <CheckCircle className="w-3 h-3"/> : <Clock className="w-3 h-3"/>}
                                {comp.status}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                {comp.user_id !== userProfile?.id && (
                                  <Button onClick={() => dispatchChat(comp.user_id, comp.profiles?.name)} variant="outline" size="sm" className="h-8 text-xs text-indigo-600 border-indigo-200 hover:bg-indigo-50" title="Message Employee">
                                    <MessageSquare className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                                {comp.status !== 'Resolved' && comp.status !== 'Closed' && comp.user_id !== userProfile?.id && (
                                  <>
                                    <Button onClick={() => updateStatus(comp.id, 'Resolved')} size="sm" className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" title="Mark Resolved">
                                      <CheckCircle className="w-3.5 h-3.5" />
                                    </Button>
                                    <Button onClick={() => escalateToAdmin(comp.id)} variant="outline" size="sm" className="h-8 text-xs text-red-600 border-red-200 hover:bg-red-50" title="Escalate to HR Admin">
                                      <ArrowUpRight className="w-3.5 h-3.5" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                        {filteredComplaints.length === 0 && <TableRow><TableCell colSpan={5} className="text-center p-12 text-slate-500">No complaints found matching this filter.</TableCell></TableRow>}
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