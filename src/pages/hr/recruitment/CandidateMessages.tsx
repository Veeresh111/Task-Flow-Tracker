import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter 
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { 
  Loader2, Send, MessageSquare, User, Megaphone, Briefcase, Plus, Calendar, MapPin, Link2 
} from "lucide-react";

export default function CandidateMessages() {
  const { toast } = useToast();
  
  // Core Communication State
  const [candidates, setCandidates] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isLoadingChats, setIsLoadingChats] = useState(true);
  const [hrUid, setHrUid] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Dynamic Feeds State
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [isLoadingAnnouncements, setIsLoadingAnnouncements] = useState(true);
  const [vacancies, setVacancies] = useState<any[]>([]);
  const [isLoadingVacancies, setIsLoadingVacancies] = useState(true);
  const [dbAssessments, setDbAssessments] = useState<any[]>([]);

  // Modals Lifecycle
  const [isAnnModalOpen, setIsAnnModalOpen] = useState(false);
  const [isJobModalOpen, setIsJobModalOpen] = useState(false);
  
  const [isPublishingAnn, setIsPublishingAnn] = useState(false);
  const [annForm, setAnnForm] = useState({ title: "", message: "", applyLink: "" });

  const [isPublishingJob, setIsPublishingJob] = useState(false);
  const [jobForm, setJobForm] = useState({
    title: "", department: "", location: "", description: "", requirements: "", applyLink: "", assessmentRequired: false, assessmentId: ""
  });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setHrUid(data.user.id);
    });
    fetchActiveCandidates();
    fetchAnnouncements();
    fetchVacancies();
    fetchAssessmentsDropdown();

    const annChannel = supabase.channel("hr-broadcast-ann")
      .on("postgres_changes", { event: "*", schema: "public", table: "recruitment_announcements" }, () => fetchAnnouncements())
      .subscribe();

    const jobChannel = supabase.channel("hr-broadcast-jobs")
      .on("postgres_changes", { event: "*", schema: "public", table: "job_forms" }, () => fetchVacancies())
      .subscribe();

    return () => {
      supabase.removeChannel(annChannel);
      supabase.removeChannel(jobChannel);
    };
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    fetchChatHistory(selectedId);

    const chatChannel = supabase.channel(`hr-candidate-chat-${selectedId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "candidate_hr_messages", filter: `candidate_id=eq.${selectedId}` }, () => {
        fetchChatHistory(selectedId);
      })
      .subscribe();

    return () => { supabase.removeChannel(chatChannel); };
  }, [selectedId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fetchAssessmentsDropdown = async () => {
    try {
      const { data, error } = await supabase.from("assessments").select("id, title");
      if (!error && data) setDbAssessments(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchActiveCandidates = async () => {
    try {
      setIsLoadingChats(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, email")
        .eq("role", "candidate")
        .order("name");
      if (error) throw error;
      setCandidates(data || []);
    } catch (err: any) {
      toast({ title: "Error fetching candidates", description: err.message, variant: "destructive" });
    } finally {
      setIsLoadingChats(false);
    }
  };

  const fetchAnnouncements = async () => {
    try {
      setIsLoadingAnnouncements(true);
      const { data, error } = await supabase.from("recruitment_announcements").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      setAnnouncements(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingAnnouncements(false);
    }
  };

  const fetchVacancies = async () => {
    try {
      setIsLoadingVacancies(true);
      const { data, error } = await supabase.from("job_forms").select("*").eq("status", "Open").order("created_at", { ascending: false });
      if (error) throw error;
      setVacancies(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingVacancies(false);
    }
  };

  const fetchChatHistory = async (candidateId: string) => {
    const { data, error } = await supabase
      .from("candidate_hr_messages")
      .select("*")
      .eq("candidate_id", candidateId)
      .order("created_at", { ascending: true });
    if (!error && data) setMessages(data);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedId || !hrUid) return;
    try {
      const { error } = await supabase.from("candidate_hr_messages").insert([{ candidate_id: selectedId, sender_id: hrUid, message: newMessage.trim() }]);
      if (error) throw error;
      setNewMessage("");
      fetchChatHistory(selectedId);
    } catch (err: any) {
      toast({ title: "Failed to send message", description: err.message, variant: "destructive" });
    }
  };

  const handlePublishAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!annForm.title.trim() || !annForm.message.trim() || !hrUid) return;
    try {
      setIsPublishingAnn(true);
      const { error } = await supabase.from("recruitment_announcements").insert([{ title: annForm.title.trim(), message: annForm.message.trim(), apply_link: annForm.applyLink.trim() || null, created_by: hrUid }]);
      if (error) throw error;
      toast({ title: "Broadcast Live", description: "Announcement updated." });
      setAnnForm({ title: "", message: "", applyLink: "" });
      setIsAnnModalOpen(false);
      fetchAnnouncements();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsPublishingAnn(false);
    }
  };

  const handlePublishJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobForm.title.trim() || !jobForm.location.trim() || !hrUid) {
      return toast({ title: "Validation Error", description: "Role title and location are required.", variant: "destructive" });
    }

    // ✅ FIXED: Comprehensive Validation Guard to avoid breaking the downstream assessment pipeline
    if (jobForm.assessmentRequired && !jobForm.assessmentId) {
      return toast({
        title: "Select Assessment Required",
        description: "Please specify a verification screening benchmark module before completing broadcast execution.",
        variant: "destructive"
      });
    }

    try {
      setIsPublishingJob(true);
      const { error } = await supabase.from("job_forms").insert([{
        job_title: jobForm.title.trim(),
        department: jobForm.department.trim() || "Engineering",
        location: jobForm.location.trim(),
        jd_text: jobForm.description.trim(),
        required_skills: jobForm.requirements.trim(),
        apply_link: jobForm.applyLink.trim() || null,
        requires_assessment: jobForm.assessmentRequired,
        assessment_id: jobForm.assessmentRequired ? jobForm.assessmentId : null,
        created_by: hrUid,
        status: "Open"
      }]);
      if (error) throw error;
      toast({ title: "Job Vacancy Deployed", description: "Corporate vacancy track configuration online." });
      setJobForm({ title: "", department: "", location: "", description: "", requirements: "", applyLink: "", assessmentRequired: false, assessmentId: "" });
      setIsJobModalOpen(false);
      fetchVacancies();
    } catch (err: any) {
      toast({ title: "Error creating post", description: err.message, variant: "destructive" });
    } finally {
      setIsPublishingJob(false);
    }
  };

  return (
    <div className="p-6 h-[calc(100vh-80px)] flex flex-col max-w-7xl mx-auto space-y-4 overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Recruitment Operations Hub</h1>
          <p className="text-gray-500 text-sm">Direct messaging pipelines, mass recruitment broadcasts, and vacancy control engine.</p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {/* Announcement Button */}
          <Dialog open={isAnnModalOpen} onOpenChange={setIsAnnModalOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="flex items-center gap-2 border-slate-200 text-slate-700 shadow-sm">
                <Megaphone className="w-4 h-4 text-amber-500" /> + Broadcast
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader><DialogTitle className="flex items-center gap-2"><Megaphone className="w-5 h-5 text-amber-500"/> Post General Announcement</DialogTitle></DialogHeader>
              <form onSubmit={handlePublishAnnouncement} className="space-y-4 pt-2">
                <Input value={annForm.title} onChange={(e) => setAnnForm({...annForm, title: e.target.value})} placeholder="Announcement Title" disabled={isPublishingAnn} />
                <Textarea value={annForm.message} onChange={(e) => setAnnForm({...annForm, message: e.target.value})} placeholder="Message Details..." className="min-h-[120px]" disabled={isPublishingAnn} />
                <Input value={annForm.applyLink} onChange={(e) => setAnnForm({...annForm, applyLink: e.target.value})} placeholder="External Pipeline URL (Optional)" disabled={isPublishingAnn} />
                <DialogFooter><Button type="submit" className="bg-blue-600 text-white w-full" disabled={isPublishingAnn}>{isPublishingAnn ? <Loader2 className="w-4 h-4 animate-spin"/> : "Publish Notification"}</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {/* Job Post Modal */}
          <Dialog open={isJobModalOpen} onOpenChange={setIsJobModalOpen}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2 shadow-sm">
                <Briefcase className="w-4 h-4" /> + New Vacancy
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto custom-scrollbar">
              <DialogHeader><DialogTitle className="flex items-center gap-2"><Briefcase className="w-5 h-5 text-blue-600"/> Open New Vacancy Position</DialogTitle></DialogHeader>
              <form onSubmit={handlePublishJob} className="space-y-4 pt-2">
                <div className="grid grid-cols-2 gap-3">
                  <Input value={jobForm.title} onChange={(e) => setJobForm({...jobForm, title: e.target.value})} placeholder="Position Title" disabled={isPublishingJob} />
                  <Input value={jobForm.department} onChange={(e) => setJobForm({...jobForm, department: e.target.value})} placeholder="Department" disabled={isPublishingJob} />
                </div>
                <Input value={jobForm.location} onChange={(e) => setJobForm({...jobForm, location: e.target.value})} placeholder="Location (e.g. Bangalore / Remote)" disabled={isPublishingJob} />
                <Textarea value={jobForm.description} onChange={(e) => setJobForm({...jobForm, description: e.target.value})} placeholder="Job Role Description..." className="min-h-[80px]" disabled={isPublishingJob} />
                <Textarea value={jobForm.requirements} onChange={(e) => setJobForm({...jobForm, requirements: e.target.value})} placeholder="Candidate Core Qualifications..." className="min-h-[80px]" disabled={isPublishingJob} />
                <Input value={jobForm.applyLink} onChange={(e) => setJobForm({...jobForm, applyLink: e.target.value})} placeholder="Custom Apply URL / Route Redirect" disabled={isPublishingJob} />
                
                <div className="flex items-center justify-between p-3 border border-slate-100 rounded-lg bg-slate-50/50">
                  <div className="space-y-0.5">
                    <label className="text-sm font-semibold text-slate-800">Pre-evaluation Screening</label>
                    <p className="text-xs text-slate-400">Tie an AI Assessment module to this application</p>
                  </div>
                  <Switch checked={jobForm.assessmentRequired} onCheckedChange={(val) => setJobForm({...jobForm, assessmentRequired: val})} />
                </div>
                
                {jobForm.assessmentRequired && (
                  <div className="space-y-1">
                    <label className="text-xs font-bold uppercase text-slate-400">Select Target Assessment Module</label>
                    <select 
                      value={jobForm.assessmentId} 
                      onChange={(e) => setJobForm({...jobForm, assessmentId: e.target.value})}
                      className="w-full h-10 px-3 rounded-md border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      disabled={isPublishingJob}
                    >
                      <option value="">-- Choose Live Assessment --</option>
                      {dbAssessments.map((ass) => (
                        <option key={ass.id} value={ass.id}>{ass.title}</option>
                      ))}
                    </select>
                  </div>
                )}
                <DialogFooter><Button type="submit" className="bg-slate-900 text-white w-full h-11" disabled={isPublishingJob}>{isPublishingJob ? <Loader2 className="w-4 h-4 animate-spin"/> : "Publish Open Track"}</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 flex-1 overflow-hidden">
        {/* Sidebar Sidecar */}
        <Card className="md:col-span-1 flex flex-col h-full overflow-hidden border border-gray-200 shadow-sm">
          <CardHeader className="bg-gray-50/50 border-b border-gray-100 py-3.5 px-4">
            <CardTitle className="text-xs font-bold tracking-wider uppercase text-gray-500 flex items-center gap-2"><User className="w-4 h-4" /> Candidate Channels</CardTitle>
          </CardHeader>
          <CardContent className="p-2 overflow-y-auto flex-1 space-y-1 custom-scrollbar">
            {isLoadingChats ? (
              <div className="flex justify-center p-4"><Loader2 className="w-5 h-5 animate-spin text-blue-600" /></div>
            ) : candidates.length === 0 ? (
              <p className="text-xs text-center p-4 text-gray-400">No active applicants found.</p>
            ) : (
              candidates.map((c) => (
                <button key={c.id} onClick={() => setSelectedId(c.id)} className={`w-full text-left p-2.5 rounded-lg flex items-center gap-3 transition-all ${selectedId === c.id ? "bg-blue-50 text-blue-700 font-semibold border border-blue-100 shadow-sm" : "hover:bg-gray-50 text-gray-700 border border-transparent"}`}>
                  <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center shrink-0"><User className="w-4 h-4" /></div>
                  <div className="truncate flex-1">
                    <p className="text-sm truncate font-medium">{c.name}</p>
                    <p className="text-xs text-slate-400 truncate">{c.email}</p>
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        {/* Dynamic Activity Workspace */}
        <div className="md:col-span-3 flex flex-col md:grid md:grid-rows-2 gap-4 h-full overflow-hidden">
          <Card className="flex-1 flex flex-col h-full overflow-hidden border border-gray-200 shadow-sm">
            {selectedId ? (
              <>
                <div className="p-3 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"/> <span className="font-semibold text-sm text-slate-800">Secure Live Candidate Stream</span></div>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedId(null)}>Close Streams</Button>
                </div>
                <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-gray-50/10 custom-scrollbar">
                  {messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.sender_id === hrUid ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[75%] p-3 rounded-xl shadow-sm text-sm ${msg.sender_id === hrUid ? "bg-blue-600 text-white rounded-br-none" : "bg-white border border-gray-100 text-gray-900 rounded-bl-none"}`}>{msg.message}</div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
                <form onSubmit={handleSendMessage} className="p-2.5 border-t border-gray-100 bg-white flex gap-2 shrink-0">
                  <Input value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Type correspondence message..." className="flex-1 h-9 text-sm" />
                  <Button type="submit" size="sm" className="bg-blue-600 px-4 h-9"><Send className="w-3.5 h-3.5" /></Button>
                </form>
              </>
            ) : (
              <div className="flex-1 flex flex-col h-full overflow-hidden">
                <div className="p-3 border-b border-gray-100 bg-gray-50/50 flex items-center gap-2 shrink-0"><Megaphone className="w-4 h-4 text-amber-500" /> <span className="font-bold text-xs tracking-wider uppercase text-slate-500">📢 Active Pipeline Broadcast Notifications</span></div>
                <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-50/30 custom-scrollbar">
                  {isLoadingAnnouncements ? (
                    <div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
                  ) : announcements.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-8">No announcement notifications broadcasted.</p>
                  ) : (
                    announcements.map((ann) => (
                      <div key={ann.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-1.5">
                        <div className="flex justify-between items-start gap-4">
                          <h3 className="font-bold text-slate-900 text-base">{ann.title}</h3>
                          <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full shrink-0 flex items-center gap-1"><Calendar className="w-2.5 h-2.5" /> {new Date(ann.created_at).toLocaleDateString()}</span>
                        </div>
                        <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{ann.message}</p>
                        {ann.apply_link && <a href={ann.apply_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 font-semibold pt-1"><Link2 className="w-3 h-3" /> External Reference Link</a>}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </Card>

          {/* Published Vacancies Feed */}
          <Card className="flex-1 flex flex-col h-full overflow-hidden border border-gray-200 shadow-sm">
            <div className="p-3 border-b border-gray-100 bg-gray-50/50 flex items-center gap-2 shrink-0"><Briefcase className="w-4 h-4 text-blue-600" /> <span className="font-bold text-xs tracking-wider uppercase text-slate-500">💼 Published Vacancies (Live on Candidate Board)</span></div>
            <div className="flex-1 p-4 overflow-y-auto custom-scrollbar bg-slate-50/10">
              {isLoadingVacancies ? (
                <div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
              ) : vacancies.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No open openings deployed.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {vacancies.map((job) => (
                    <Card key={job.id} className="border border-slate-200 bg-white flex flex-col justify-between overflow-hidden shadow-sm hover:border-blue-200 transition-all">
                      <div className="p-4 space-y-2">
                        <div className="flex justify-between items-start gap-2">
                          <h4 className="font-bold text-slate-900 text-base truncate">{job.job_title}</h4>
                          <span className="text-[10px] bg-blue-50 text-blue-700 font-bold px-2 py-0.5 rounded border border-blue-100 uppercase shrink-0">{job.department}</span>
                        </div>
                        <p className="text-xs text-slate-500 font-medium flex items-center gap-1"><MapPin className="w-3 h-3 text-slate-400" /> {job.location}</p>
                        <p className="text-xs text-slate-600 line-clamp-2 pt-1">{job.jd_text}</p>
                      </div>
                      <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-[10px] text-slate-400 font-semibold uppercase">{job.requires_assessment ? "⚡ Requires Exam" : "📄 Review Only"}</span>
                        <Button size="sm" variant="outline" className="text-xs font-semibold h-7 border-slate-200" onClick={() => toast({ title: "Preview Mode", description: `Config Target payload: ${job.apply_link || "Internal Intake Form"}` })}>Review Layout</Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}