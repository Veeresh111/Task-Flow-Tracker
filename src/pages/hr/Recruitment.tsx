import { useState, useRef, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, UserPlus, Sparkles, FileText, Briefcase, Mail, Video, BrainCircuit, Play, ExternalLink, Share2, FileQuestion, Edit3, Send, X, ShieldCheck, Award, FileSignature, FormInput, ListFilter, CheckCircle2, Copy } from "lucide-react";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from "recharts";
import { supabase } from "@/lib/supabase";
import { callCorporateAI } from "@/lib/ai";

// === ROUTE CONNECTIONS: Imports decoupled submodule pages cleanly ===
import ATSScanner from "./recruitment/ATSScanner";
import CandidatePipeline from "./recruitment/CandidatePipeline";
import AssessmentCenter from "./recruitment/AssessmentCenter";
import InterviewCenter from "./recruitment/InterviewCenter";
import OfferManagement from "./recruitment/OfferManagement";
import JobFormManagement from "./recruitment/JobFormManagement";
import RecruitmentAnalytics from "./recruitment/RecruitmentAnalytics";

// === RESOLVED CONSTANT DEFECT: Hardened corporate hexadecimal color palette definitions ===
const COLORS = [
  "#2563eb", // Deep Enterprise Blue
  "#16a34a", // Success Emerald Green
  "#dc2626", // Warning / Risk Crimson Red
  "#d97706", // Operational Amber Orange
  "#7c3aed"  // High-Performance Purple
];

// AI calls routed through server-side ai-proxy edge function (no client-side token exposure)

export default function HRRecruitment() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("resume");
  const [aiLoading, setAiLoading] = useState(false);

  // Required for Email Modal
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailTemplate, setEmailTemplate] = useState("");
  const [extractedEmails, setExtractedEmails] = useState<string[]>([]);

  // JD & Offer States
  const [jdInputs, setJdInputs] = useState({ role: "", experience: "", workMode: "Hybrid", shift: "General Shift" });
  const [structuredJD, setStructuredJD] = useState<any>(null);

  const [offerInputs, setOfferInputs] = useState({ role: "", name: "", email: "", salary: "", joinDate: "", bonus: "" });
  const [structuredOffer, setStructuredOffer] = useState<any>(null);
  const [savingOffer, setSavingOffer] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setCurrentUserId(data.user.id);
    });
  }, []);

  // Clipboard utility helper safely bound
  const copyToClipboard = async (text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied Successfully",
        description: "Application link copied to corporate clipboard memory."
      });
    } catch (err) {
      console.error("Clipboard write trace exception dropped:", err);
    }
  };

  const generateStructuredJD = async () => {
    if (!jdInputs.role || !jdInputs.experience) return toast({ title: "Fields Required", description: "Please fill out Role and Experience.", variant: "destructive" });
    setAiLoading(true);
    try {
      const prompt = `Act as an Elite MNC HR. Create a highly professional Job Description for a "${jdInputs.role}" at FWC India.
      Experience Required: ${jdInputs.experience}
      Work Mode: ${jdInputs.workMode}
      Shift: ${jdInputs.shift}

      Output STRICTLY a JSON object with this format (no markdown backticks):
      {
        "title": "Role Title",
        "overview": "2-3 highly corporate sentences about the role",
        "responsibilities": ["Resp 1", "Resp 2", "Resp 3", "Resp 4", "Resp 5"],
        "techStack": [{"skill": "Core Skill", "level": "Expert"}, {"skill": "Secondary Skill", "level": "Intermediate"}]
      }`;
      const res = await callHF(prompt);
      let cleanText = res.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
      const startIdx = cleanText.indexOf('{');
      const endIdx = cleanText.lastIndexOf('}');
      if (startIdx !== -1 && endIdx !== -1) cleanText = cleanText.substring(startIdx, endIdx + 1);
      setStructuredJD(JSON.parse(cleanText));
      toast({ title: "JD Generated", description: "Professional JD ready for dispatch." });
    } catch (e) {
      toast({ title: "Generation Failed", description: "Could not generate JD. Please try again.", variant: "destructive" });
    }
    setAiLoading(false);
  };

  const dispatchJD = () => {
    if (!structuredJD) return;
    const subject = encodeURIComponent(`Official Job Description: ${structuredJD.title}`);
    const bodyText = `FWC INDIA - ${structuredJD.title}\n\nOverview:\n${structuredJD.overview}\n\nResponsibilities:\n${structuredJD.responsibilities.map((r: string)=> `- ${r}`).join('\n')}\n\nExperience: ${jdInputs.experience} | Mode: ${jdInputs.workMode} | Shift: ${jdInputs.shift}`;
    window.location.href = `mailto:?subject=${subject}&body=${encodeURIComponent(bodyText)}`;
  };

  const generateStructuredOffer = async () => {
    if (!offerInputs.role || !offerInputs.name || !offerInputs.email || !offerInputs.salary) return toast({ title: "Fields Required", description: "Please fill all offer inputs.", variant: "destructive" });
    setAiLoading(true);
    try {
      const prompt = `Act as the CEO of FWC India. Write an official, legally sound Corporate Offer Letter.
      Candidate: ${offerInputs.name}
      Role: ${offerInputs.role}
      Total CTC: INR ${offerInputs.salary}
      Joining Date: ${offerInputs.joinDate}
      Stock/Bonus Info: ${offerInputs.bonus}

      Output STRICTLY a JSON object with this format (no markdown backticks):
      {
        "date": "Today's Date",
        "refNo": "FWC-OFF-2026-XYZ",
        "candidateName": "${offerInputs.name}",
        "paragraphs": ["Para 1 (Welcome & Role context)", "Para 2 (Detailed Compensation & Bonus)", "Para 3 (Reporting conditions & closing)"]
      }`;
      const res = await callHF(prompt);
      let cleanText = res.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
      const startIdx = cleanText.indexOf('{');
      const endIdx = cleanText.lastIndexOf('}');
      if (startIdx !== -1 && endIdx !== -1) cleanText = cleanText.substring(startIdx, endIdx + 1);
      setStructuredOffer(JSON.parse(cleanText));
      toast({ title: "Offer Generated", description: "Official FWC Offer Letter ready." });
    } catch (e) {
      toast({ title: "Generation Failed", description: "Could not generate Offer.", variant: "destructive" });
    }
    setAiLoading(false);
  };

  const dispatchOffer = () => {
    if (!structuredOffer) return;
    const subject = encodeURIComponent(`FWC India - Official Offer Letter: ${structuredOffer.candidateName}`);
    const bodyText = `Dear ${structuredOffer.candidateName},\n\nPlease find your official offer letter below.\n\n${structuredOffer.paragraphs.join('\n\n')}\n\nSincerely,\nChief Executive Officer\nFWC India`;
    window.location.href = `mailto:${offerInputs.email}?subject=${subject}&body=${encodeURIComponent(bodyText)}`;
  };

  const saveOfferToDatabase = async () => {
    if (!structuredOffer || !offerInputs.salary || !currentUserId) {
      return toast({ title: "Cannot Save", description: "Generate an offer first and ensure you are authenticated.", variant: "destructive" });
    }
    setSavingOffer(true);
    try {
      const parsedCtc = parseFloat(offerInputs.salary.replace(/,/g, '')) || 0;
      const joiningDate = offerInputs.joinDate ? new Date(offerInputs.joinDate).toISOString().split('T')[0] : null;

      const { data: candidate } = await supabase
        .from('candidates')
        .select('id')
        .eq('email', offerInputs.email.trim().toLowerCase())
        .maybeSingle();

      const { data: jobForm } = await supabase
        .from('job_forms')
        .select('id')
        .eq('job_title', offerInputs.role)
        .maybeSingle();

      // Resolve the correct job_application to link this offer and sync status
      let applicationId: string | null = null;
      if (candidate?.id && jobForm?.id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("candidate_id", candidate.id)
          .maybeSingle();
        const queryId = profile?.id || candidate.id;
        const { data: application } = await supabase
          .from("job_applications")
          .select("id")
          .eq("form_id", jobForm.id)
          .in("candidate_id", [queryId, candidate.id])
          .in("status", ["Interview Cleared", "Offer Generated"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        applicationId = application?.id || null;
      }

      const { data: offer, error: offerErr } = await supabase
        .from('offer_letters')
        .insert([{
          candidate_id: candidate?.id || null,
          job_form_id: jobForm?.id || null,
          application_id: applicationId,
          offered_ctc: parsedCtc,
          offer_date: new Date().toISOString().split('T')[0],
          joining_date: joiningDate,
          status: 'Pending Approval',
          created_by: currentUserId,
          terms: `Role: ${offerInputs.role}\nBonus/Stock: ${offerInputs.bonus}\nReference: ${structuredOffer.refNo || 'FWC-OFF-' + Date.now()}`,
          notes: `AI Generated Offer Letter. Candidate: ${offerInputs.name}, Email: ${offerInputs.email}`
        }])
        .select()
        .single();

      if (offerErr) throw offerErr;

      // Sync job_applications status to Offer Generated
      if (applicationId) {
        await supabase
          .from("job_applications")
          .update({ status: "Offer Generated" })
          .eq("id", applicationId)
          .in("status", ["Interview Cleared"]);
      }

      // Create initial approval entry
      await supabase
        .from('offer_approvals')
        .insert([{
          offer_id: offer.id,
          approver_id: currentUserId,
          approval_order: 1,
          status: 'Pending'
        }]);

      toast({
        title: "Offer Saved to Database",
        description: `Offer letter for ${offerInputs.name} stored with status 'Pending Approval'. Application synced to Offer Generated.`
      });
    } catch (err: any) {
      toast({ title: "Save Failed", description: err.message, variant: "destructive" });
    }
    setSavingOffer(false);
  };

  const callHF = async (prompt: string, sysInstruct?: string) => {
    try {
      return await callCorporateAI({ prompt, systemInstruction: sysInstruct, max_tokens: 2048 });
    } catch {
      toast({ title: "AI Offline", description: "AI proxy service unavailable.", variant: "destructive" });
      return "";
    }
  };

  return (
    <DashboardLayout role="hr">
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in pb-12">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2"><UserPlus className="text-indigo-600"/> AI Recruitment & ATS</h1>
          <p className="text-slate-500 mt-1">End-to-end automated candidate pipelines with authentic application forms.</p>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 border-b border-slate-200">
          {[
            {id: 'resume', icon: FileText, label: "App Forms & ATS Scanners"},
            {id: 'pipeline', icon: ListFilter, label: "Candidate Tracking Board"},
            {id: 'assessment', icon: FileQuestion, label: "Assessment Builder"},
            {id: 'video', icon: Video, label: "Live Interview Room"},
            {id: 'jobforms', icon: Briefcase, label: "Job Forms"},
            {id: 'jd', icon: FileText, label: "JD Generator"},
            {id: 'offer', icon: Mail, label: "Offer Generator"},
            {id: 'offers', icon: FileSignature, label: "Offer Management"},
            {id: 'analytics', icon: BarChart, label: "Analytics"}
          ].map(t => (
            <Button key={t.id} variant={activeTab === t.id ? 'default' : 'outline'} onClick={()=>setActiveTab(t.id)} className={`shadow-sm ${activeTab===t.id?'bg-indigo-600 text-white':''}`}>
              <t.icon className="w-4 h-4 mr-2"/> {t.label}
            </Button>
          ))}
        </div>

        {activeTab === 'resume' && <ATSScanner />}

        {activeTab === 'pipeline' && <CandidatePipeline />}

        {activeTab === 'assessment' && <AssessmentCenter />}

        {/* === LINKED DISCONNECTED MODULE: Renders live InterviewCenter layout cleanly === */}
        {activeTab === 'video' && <InterviewCenter />}

        {activeTab === 'jobforms' && <JobFormManagement />}

        {activeTab === 'jd' && (
          <div className="grid md:grid-cols-3 gap-6">
            <div className="md:col-span-1 space-y-4">
              <Card className="shadow-sm border-slate-200">
                <CardHeader className="bg-slate-50 border-b pb-4"><CardTitle className="text-sm font-bold">JD Parameters</CardTitle></CardHeader>
                <CardContent className="p-4 space-y-3">
                  <div className="space-y-1"><label className="text-[10px] font-bold uppercase text-slate-500">Job Role</label><Input placeholder="E.g. Cloud Architect" value={jdInputs.role} onChange={e=>setJdInputs({...jdInputs, role: e.target.value})} className="text-sm"/></div>
                  <div className="space-y-1"><label className="text-[10px] font-bold uppercase text-slate-500">Experience Required</label><Input placeholder="E.g. 5+ Years" value={jdInputs.experience} onChange={e=>setJdInputs({...jdInputs, experience: e.target.value})} className="text-sm"/></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1"><label className="text-[10px] font-bold uppercase text-slate-500">Work Mode</label>
                      <Select value={jdInputs.workMode} onValueChange={v=>setJdInputs({...jdInputs, workMode: v})}>
                        <SelectTrigger className="text-xs h-9"><SelectValue/></SelectTrigger>
                        <SelectContent><SelectItem value="On-site">On-site</SelectItem><SelectItem value="Hybrid">Hybrid</SelectItem><SelectItem value="Remote">Remote</SelectItem></SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1"><label className="text-[10px] font-bold uppercase text-slate-500">Shift</label>
                      <Select value={jdInputs.shift} onValueChange={v=>setJdInputs({...jdInputs, shift: v})}>
                        <SelectTrigger className="text-xs h-9"><SelectValue/></SelectTrigger>
                        <SelectContent><SelectItem value="General Shift">General</SelectItem><SelectItem value="Night Shift">Night</SelectItem><SelectItem value="Rotational">Rotational</SelectItem></SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button onClick={generateStructuredJD} disabled={aiLoading} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white mt-2">
                    {aiLoading ? <Loader2 className="animate-spin w-4 h-4 mr-2"/> : <Sparkles className="w-4 h-4 mr-2"/>} Generate Corporate JD
                  </Button>
                </CardContent>
              </Card>
            </div>

            <div className="md:col-span-2">
              <Card className="shadow-sm border-slate-200">
                <CardHeader className="bg-slate-50 border-b pb-4 flex flex-row justify-between items-center">
                  <CardTitle className="text-sm font-bold flex items-center gap-2"><Briefcase className="w-4 h-4 text-indigo-600"/> Official Job Description</CardTitle>
                  {structuredJD && <Button onClick={dispatchJD} variant="outline" className="h-8 text-xs font-bold text-blue-700 bg-blue-50 border-blue-200"><Mail className="w-3 h-3 mr-2"/> Dispatch via Email</Button>}
                </CardHeader>
                <CardContent className="p-0 bg-slate-100/50 min-h-[400px]">
                  {structuredJD ? (
                    <div className="p-8 max-w-2xl mx-auto bg-white shadow-xl my-8 border border-slate-200 rounded-sm">
                      <div className="flex justify-between items-center border-b-2 border-indigo-900 pb-4 mb-6">
                        <div>
                          <h2 className="text-2xl font-black text-indigo-900 tracking-tighter">FWC INDIA</h2>
                          <p className="text-[10px] font-bold text-slate-500 tracking-widest uppercase">Official Job Requisition</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-slate-800">{jdInputs.workMode} • {jdInputs.shift}</p>
                          <p className="text-xs text-slate-500 font-medium">Exp: {jdInputs.experience}</p>
                        </div>
                      </div>
                      
                      <h3 className="text-xl font-black text-slate-800 mb-2">{structuredJD.title}</h3>
                      <p className="text-sm text-slate-600 mb-6 leading-relaxed text-justify">{structuredJD.overview}</p>

                      <h4 className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-3">Core Responsibilities</h4>
                      <ul className="list-disc pl-5 space-y-1 mb-8 text-sm text-slate-700">
                        {structuredJD.responsibilities.map((r: string, i: number) => <li key={i}>{r}</li>)}
                      </ul>

                      <h4 className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-3">Required Tech Stack & Skills</h4>
                      <Table className="border border-slate-200 rounded-lg overflow-hidden">
                        <TableHeader className="bg-slate-50">
                          <TableRow>
                            <TableHead className="font-bold text-xs">Skill / Technology</TableHead>
                            <TableHead className="font-bold text-xs text-right">Proficiency Required</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {structuredJD.techStack.map((tech: any, i: number) => (
                            <TableRow key={i}>
                              <TableCell className="font-medium text-sm text-slate-800">{tech.skill}</TableCell>
                              <TableCell className="text-right text-xs font-bold text-slate-500 uppercase">{tech.level}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center p-12 text-slate-400 font-medium text-sm">Fill parameters and generate JD to view the corporate document.</div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {activeTab === 'offers' && <OfferManagement />}

        {activeTab === 'analytics' && <RecruitmentAnalytics />}

        {activeTab === 'offer' && (
          <div className="grid md:grid-cols-3 gap-6">
            <div className="md:col-span-1 space-y-4">
              <Card className="shadow-sm border-slate-200">
                <CardHeader className="bg-slate-50 border-b pb-4"><CardTitle className="text-sm font-bold">Offer Parameters</CardTitle></CardHeader>
                <CardContent className="p-4 space-y-3">
                  <div className="space-y-1"><label className="text-[10px] font-bold uppercase text-slate-500">Candidate Name</label><Input placeholder="E.g. John Doe" value={offerInputs.name} onChange={e=>setOfferInputs({...offerInputs, name: e.target.value})} className="text-sm"/></div>
                  <div className="space-y-1"><label className="text-[10px] font-bold uppercase text-slate-500">Candidate Email</label><Input type="email" placeholder="john@email.com" value={offerInputs.email} onChange={e=>setOfferInputs({...offerInputs, email: e.target.value})} className="text-sm"/></div>
                  <div className="space-y-1"><label className="text-[10px] font-bold uppercase text-slate-500">Job Title</label><Input placeholder="E.g. Senior Manager" value={offerInputs.role} onChange={e=>setOfferInputs({...offerInputs, role: e.target.value})} className="text-sm"/></div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1"><label className="text-[10px] font-bold uppercase text-slate-500">Total CTC (INR)</label><Input placeholder="24,00,000" value={offerInputs.salary} onChange={e=>setOfferInputs({...offerInputs, salary: e.target.value})} className="text-sm"/></div>
                    <div className="space-y-1"><label className="text-[10px] font-bold uppercase text-slate-500">Joining Date</label><Input type="date" value={offerInputs.joinDate} onChange={e=>setOfferInputs({...offerInputs, joinDate: e.target.value})} className="text-sm"/></div>
                  </div>
                  <div className="space-y-1"><label className="text-[10px] font-bold uppercase text-slate-500">Stock / Bonus Provision</label><Input placeholder="E.g. 10% Annual Bonus" value={offerInputs.bonus} onChange={e=>setOfferInputs({...offerInputs, bonus: e.target.value})} className="text-sm"/></div>

                  <Button onClick={generateStructuredOffer} disabled={aiLoading} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white mt-2">
                    {aiLoading ? <Loader2 className="animate-spin w-4 h-4 mr-2"/> : <FileSignature className="w-4 h-4 mr-2"/>} Generate Official Letter
                  </Button>
                </CardContent>
              </Card>
            </div>
            
            <div className="md:col-span-2">
              <Card className="shadow-sm border-slate-200">
                <CardHeader className="bg-slate-50 border-b pb-4 flex flex-row justify-between items-center">
                  <CardTitle className="text-sm font-bold flex items-center gap-2"><Mail className="w-4 h-4 text-emerald-600"/> Official Offer Letter</CardTitle>
                  <div className="flex gap-2">
                    {structuredOffer && <Button onClick={saveOfferToDatabase} disabled={savingOffer} variant="outline" className="h-8 text-xs font-bold text-indigo-700 bg-indigo-50 border-indigo-200">{savingOffer ? <Loader2 className="w-3 h-3 animate-spin mr-2"/> : <FileText className="w-3 h-3 mr-2"/>} Save to Database</Button>}
                    {structuredOffer && <Button onClick={dispatchOffer} variant="outline" className="h-8 text-xs font-bold text-emerald-700 bg-emerald-50 border-emerald-200"><Send className="w-3 h-3 mr-2"/> Dispatch to Candidate</Button>}
                  </div>
                </CardHeader>
                <CardContent className="p-0 bg-slate-200/50 min-h-[400px]">
                  {structuredOffer ? (
                    <div className="p-12 max-w-2xl mx-auto bg-white shadow-2xl my-8 border border-slate-300 relative overflow-hidden">
                      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 opacity-[0.03] pointer-events-none">
                        <ShieldCheck className="w-96 h-96 text-slate-900" />
                      </div>

                      <div className="flex justify-between items-start border-b-2 border-slate-900 pb-6 mb-8 relative z-10">
                        <div>
                          <h2 className="text-4xl font-black tracking-tighter text-slate-900">FWC INDIA</h2>
                          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Global Corporate Headquarters</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-slate-700">Date: {structuredOffer.date}</p>
                          <p className="text-xs font-medium text-slate-500 mt-1">Ref: {structuredOffer.refNo}</p>
                        </div>
                      </div>

                      <div className="relative z-10 space-y-6">
                        <h3 className="text-lg font-black text-slate-800 text-center underline uppercase tracking-widest mb-8">Letter of Employment</h3>
                        
                        <div className="space-y-4 text-slate-800 text-sm leading-relaxed text-justify font-medium">
                          {structuredOffer.paragraphs.map((p: string, i: number) => <p key={i}>{p}</p>)}
                        </div>

                        <div className="mt-16 flex justify-between items-end pt-8 border-t border-slate-200">
                           <div>
                              <p className="font-['Brush_Script_MT',cursive] text-4xl text-blue-900 mb-2 italic">{import.meta.env.VITE_CEO_NAME || 'Veeresh'}</p>
                             <p className="text-xs font-black uppercase tracking-widest text-slate-800">Chief Executive Officer</p>
                             <p className="text-[10px] font-bold text-slate-500 mt-0.5">FWC India Enterprises</p>
                           </div>
                           <div className="flex flex-col items-center">
                             <div className="w-20 h-20 rounded-full border-4 border-red-700 border-double flex items-center justify-center text-red-700 mb-2 transform -rotate-12 bg-white">
                                <Award className="w-10 h-10" />
                             </div>
                             <p className="text-[8px] font-black uppercase text-red-700 tracking-widest">Official Corporate Seal</p>
                           </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center p-12 text-slate-400 font-medium text-sm">Fill parameters and generate to view the official Offer Letter.</div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

      </div>

      {showEmailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <Card className="w-full max-w-2xl bg-white shadow-2xl border-0 overflow-hidden flex flex-col">
            <div className="bg-indigo-600 p-6 flex justify-between items-center text-white">
              <div>
                <h2 className="text-xl font-black flex items-center gap-2"><Send className="w-5 h-5"/> Dispatch Shortlist Emails</h2>
                <p className="text-indigo-200 text-xs mt-1">Found {extractedEmails.length} authentic emails to BCC securely.</p>
              </div>
              <button onClick={() => setShowEmailModal(false)} className="text-indigo-200 hover:text-white"><X className="w-6 h-6"/></button>
            </div>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Extracted Corporate Targets (BCC)</label>
                <div className="flex flex-wrap gap-2">
                  {extractedEmails.map((e, i) => <span key={i} className="bg-slate-100 text-slate-700 px-2 py-1 rounded text-[10px] font-bold border border-slate-200">{e}</span>)}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">AI Generated Message Template</label>
                <Textarea value={emailTemplate} onChange={(e) => setEmailTemplate(e.target.value)} className="h-64 resize-none text-sm bg-slate-50" />
              </div>
              <Button onClick={() => { window.open(`mailto:?bcc=${extractedEmails.join(',')}&subject=Career Opportunity at FWC India&body=${encodeURIComponent(emailTemplate)}`); setShowEmailModal(false); }} className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 font-black text-white text-lg">
                Send via Default Email Client
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

    </DashboardLayout>
  );
}