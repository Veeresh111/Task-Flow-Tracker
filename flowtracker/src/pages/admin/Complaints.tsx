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
import { Loader2, ShieldAlert, CheckCircle, Clock, Briefcase, Video, MessageSquare, AlertTriangle, Search, Filter, Send } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { GoogleGenerativeAI } from "@google/generative-ai";

export default function AdminComplaints() {
  const { toast } = useToast();
  const [complaints, setComplaints] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // NEW: State for Search, Filter, and Filing System Tickets
  const [userProfile, setUserProfile] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", category: "System & Infrastructure" });

  useEffect(() => {
    fetchGlobalComplaints();
  }, []);

  const fetchGlobalComplaints = async () => {
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (profile) setUserProfile(profile);
    }

    // Fetch complaints that are specifically targeted to Admin OR Escalated
    const { data } = await supabase.from('complaints')
      .select('*, profiles!inner(name, department, role)')
      .in('target_role', ['ADMIN', 'ESCALATED'])
      .order('created_at', { ascending: false });

    if (data) setComplaints(data);
    setLoading(false);
  };

  const getSeverityBadge = (sev: string) => {
    const s = (sev || "MODERATE").toUpperCase();
    if (s === "CRITICAL") return <span className="bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded text-[10px] font-black uppercase shadow-sm">Critical</span>;
    if (s === "HIGH") return <span className="bg-orange-100 text-orange-700 border border-orange-200 px-2 py-0.5 rounded text-[10px] font-black uppercase shadow-sm">High</span>;
    if (s === "LOW") return <span className="bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded text-[10px] font-black uppercase shadow-sm">Low</span>;
    return <span className="bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded text-[10px] font-black uppercase shadow-sm">Moderate</span>;
  };

  const updateStatus = async (id: string, newStatus: string) => {
    const { error } = await supabase.from('complaints').update({ status: newStatus }).eq('id', id);
    if (!error) {
      toast({ title: "Status Updated", description: `Corporate ticket marked as ${newStatus}` });
      setComplaints(complaints.map(c => c.id === id ? { ...c, status: newStatus } : c));
    }
  };

  const dispatchMediation = async (userId: string, userName: string, title: string) => {
    await supabase.from('notifications').insert([{
      user_id: userId,
      title: "Mediation Request",
      message: `HR Administration has opened a direct channel regarding your ticket: "${title}"`,
      is_read: false
    }]);
    
    localStorage.setItem('activeChatUserId', userId);
    localStorage.setItem('activeChatUserName', userName);
    navigate(`/admin/chat?userId=${userId}`, { state: { selectedUserId: userId, selectedUserName: userName } });
  };

  const routeToDepartment = async (id: string, dept: string) => {
    toast({ title: "Ticket Routed", description: `Successfully forwarded to the ${dept} department queue.` });
    updateStatus(id, `Forwarded to ${dept}`);
  };

  // NEW: Admin Submitting System Level Complaints/Alerts
  const submitComplaint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.description || !userProfile) return;
    setSubmitting(true);

    try {
      let aiSeverity = "MODERATE";
      try {
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "AQ.Ab8RN6KQXzJBhyAkPtzy70H-HJXV0zOvPoV6BjJ-ohgF3Cs_YQ";
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = `Analyze this system admin alert: "${form.title} - ${form.description}". Return EXACTLY ONE WORD determining the severity: CRITICAL, HIGH, MODERATE, or LOW. No markdown, no punctuation.`;
        const result = await model.generateContent(prompt);
        const responseText = result.response.text().trim().toUpperCase();
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
        target_role: 'ADMIN', 
        severity: aiSeverity,
        status: 'Open'
      }]);

      if (error) throw error;
      toast({ title: "Alert Broadcasted", description: `System Alert recorded (Severity: ${aiSeverity})` });
      setForm({ title: "", description: "", category: "System & Infrastructure" });
      fetchGlobalComplaints();
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
    <DashboardLayout role="admin">
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in pb-12">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <ShieldAlert className="w-8 h-8 text-indigo-600" /> HR Mediation Center
            </h1>
            <p className="text-slate-500 mt-1">Global oversight of critical escalations, payroll disputes, and system alerts.</p>
          </div>
        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="shadow-sm border-red-200 bg-red-50/50">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-3 bg-red-100 text-red-600 rounded-full"><AlertTriangle className="w-5 h-5"/></div>
              <div>
                <p className="text-xs font-bold text-red-800 uppercase tracking-wider">Critical Escalations</p>
                <h2 className="text-2xl font-black text-slate-900">{complaints.filter(c => c.severity === 'CRITICAL' && c.status !== 'Closed').length}</h2>
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-sm border-blue-200 bg-blue-50/50">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-3 bg-blue-100 text-blue-600 rounded-full"><Briefcase className="w-5 h-5"/></div>
              <div>
                <p className="text-xs font-bold text-blue-800 uppercase tracking-wider">Payroll & Finance</p>
                <h2 className="text-2xl font-black text-slate-900">{complaints.filter(c => c.category === 'Payroll & Finance' && c.status !== 'Closed').length}</h2>
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-sm border-emerald-200 bg-emerald-50/50">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-3 bg-emerald-100 text-emerald-600 rounded-full"><CheckCircle className="w-5 h-5"/></div>
              <div>
                <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Resolved Tickets</p>
                <h2 className="text-2xl font-black text-slate-900">{complaints.filter(c => c.status === 'Closed').length}</h2>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* NEW: Admin Broadcast/Alert Form */}
          <div className="lg:col-span-1">
            <Card className="shadow-sm border-slate-200 sticky top-24">
              <CardHeader className="border-b bg-slate-50/50 pb-4">
                <CardTitle className="text-lg text-slate-800 flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-indigo-600" /> Post System Alert
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5">
                <form onSubmit={submitComplaint} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-500 uppercase">Alert Category</Label>
                    <select className="w-full p-2.5 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 bg-white" value={form.category} onChange={e => setForm({...form, category: e.target.value})}>
                      <option value="System & Infrastructure">System & Infrastructure</option>
                      <option value="Company Wide Policy">Company Wide Policy</option>
                      <option value="Security Violation">Security Violation</option>
                      <option value="General Workflow">General Workflow Issue</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-500 uppercase">Subject Title</Label>
                    <Input placeholder="E.g., Server Downtime Expected" value={form.title} onChange={e => setForm({...form, title: e.target.value})} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-500 uppercase flex justify-between">
                      Alert Details <span className="text-[9px] text-indigo-500">AI Triaged</span>
                    </Label>
                    <Textarea className="h-28 resize-none" placeholder="Provide system details..." value={form.description} onChange={e => setForm({...form, description: e.target.value})} required />
                  </div>
                  <Button type="submit" disabled={submitting} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold">
                    {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />} 
                    Broadcast System Alert
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
                <Input placeholder="Search globally by subject, description, or employee name..." className="pl-9 border-slate-300 focus-visible:ring-indigo-500" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
              </div>
              <div className="flex items-center gap-2 shadow-sm">
                <Filter className="w-4 h-4 text-slate-500" />
                <select className="p-2.5 border border-slate-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white font-bold text-slate-700" value={severityFilter} onChange={e => setSeverityFilter(e.target.value)}>
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
                <CardTitle className="text-lg text-slate-800">Global Escalation Queue ({filteredComplaints.filter(c => c.status !== 'Closed').length} Active)</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {loading ? <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div> : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-slate-50">
                        <TableRow>
                          <TableHead className="font-bold text-slate-700">Origin Employee</TableHead>
                          <TableHead className="font-bold text-slate-700">Subject Details</TableHead>
                          <TableHead className="font-bold text-slate-700 text-center">AI Triage / Status</TableHead>
                          <TableHead className="font-bold text-slate-700 text-right">Department Dispatch & Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredComplaints.map(comp => (
                          <TableRow key={comp.id} className="hover:bg-slate-50/80">
                            <TableCell>
                              <div className="font-bold text-slate-900 flex items-center gap-1">
                                {comp.profiles?.name} {comp.user_id === userProfile?.id && "(System)"}
                              </div>
                              <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1">{comp.profiles?.department || 'System'} Dept</div>
                            </TableCell>
                            <TableCell>
                              <div className="font-bold text-indigo-900 text-sm flex items-center gap-2">
                                {comp.title}
                                <span className="text-[9px] bg-slate-100 border text-slate-600 px-1.5 py-0.5 rounded uppercase whitespace-nowrap">{comp.category}</span>
                              </div>
                              <div className="text-xs text-slate-500 mt-1 line-clamp-2 max-w-xs" title={comp.description}>{comp.description}</div>
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="flex flex-col gap-1.5 items-center">
                                {getSeverityBadge(comp.severity)}
                                <span className={`text-[10px] font-bold uppercase tracking-wider ${comp.status === 'Closed' ? 'text-emerald-600' : 'text-amber-600'}`}>
                                  {comp.status}
                               </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              {comp.status !== 'Closed' ? (
                                <div className="flex flex-col items-end gap-2">
                                  <div className="flex gap-2">
                                    <Button onClick={() => routeToDepartment(comp.id, 'Payroll')} variant="outline" size="sm" className="h-7 text-[10px] text-slate-600">Route Payroll</Button>
                                    <Button onClick={() => routeToDepartment(comp.id, 'Legal')} variant="outline" size="sm" className="h-7 text-[10px] text-slate-600">Route Legal</Button>
                                  </div>
                                  <div className="flex gap-2">
                                    {comp.user_id !== userProfile?.id && (
                                      <Button onClick={() => dispatchMediation(comp.user_id, comp.profiles?.name, comp.title)} size="sm" className="h-8 text-xs bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm">
                                        <Video className="w-3.5 h-3.5 mr-1.5" /> Mediation Chat
                                      </Button>
                                    )}
                                    <Button onClick={() => updateStatus(comp.id, 'Closed')} size="sm" className="h-8 text-xs bg-slate-900 hover:bg-slate-800 text-white shadow-sm">
                                      Close Ticket
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <span className="text-xs font-bold text-emerald-600 flex items-center justify-end gap-1"><CheckCircle className="w-4 h-4"/> Resolved</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                        {filteredComplaints.length === 0 && <TableRow><TableCell colSpan={4} className="text-center p-12 text-slate-500">The global escalation queue matches no records.</TableCell></TableRow>}
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