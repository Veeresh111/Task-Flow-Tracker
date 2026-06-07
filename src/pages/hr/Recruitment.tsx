import { useState, useRef } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, UserPlus, Sparkles, FileText, Briefcase, Mail, UploadCloud, ClipboardPaste, CheckCircle2, XCircle, Users, Download, Video, BrainCircuit, Play, ExternalLink, Share2, FormInput, FileQuestion, Edit3, Send, X, ShieldCheck, Award, FileSignature } from "lucide-react";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from "recharts";
import { supabase } from "@/lib/supabase";

interface Candidate {
  id: string;
  filename: string;
  text: string;
  status: 'Pending' | 'Scanning' | 'Complete' | 'Error';
  score?: number;
  recommendation?: string;
  missingSkills?: string;
  skillsData?: {name: string, value: number}[];
}

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#6366f1'];

// ─── ONLY CHANGE: Hugging Face OpenAI-compatible helper (replaces callGemini) ───
const HF_API_URL = "https://router.huggingface.co/v1/chat/completions";
const HF_TOKEN   = "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";
const HF_MODEL   = "openai/gpt-oss-120b:groq";
// ─────────────────────────────────────────────────────────────────────────────────

export default function HRRecruitment() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("resume");
  const [aiLoading, setAiLoading] = useState(false);

  // Bulk ATS States
  const [jdText, setJdText] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [pastedData, setPastedData] = useState(""); 
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // AI Smart Form Builder States
  const [formTitle, setFormTitle] = useState("");
  const [formStyle, setFormStyle] = useState("Standard Corporate");
  const [generatedFormSchema, setGeneratedFormSchema] = useState<any[] | null>(null);
  const [publishedForms, setPublishedForms] = useState<any[]>([]);

  // Email Communication States
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailTemplate, setEmailTemplate] = useState("");
  const [extractedEmails, setExtractedEmails] = useState<string[]>([]);

  // Assessment Builder States
  const [assessmentTitle, setAssessmentTitle] = useState("");
  const [assessmentDifficulty, setAssessmentDifficulty] = useState("Intermediate");
  const [assessmentQuestions, setAssessmentQuestions] = useState<any[] | null>(null);
  const [publishedAssessments, setPublishedAssessments] = useState<any[]>([]);

  // Video Interview Room States
  const [interviewState, setInterviewState] = useState<'idle'|'active'|'finished'>('idle');
  const [interviewLink, setInterviewLink] = useState("");
  const [liveQuestions, setLiveQuestions] = useState<string[]>([]);
  const [interviewAnalytics, setInterviewAnalytics] = useState<any[]>([]);
  const [finalScore, setFinalScore] = useState<number|null>(null);
  const [finalReport, setFinalReport] = useState("");

  // JD & Offer States (UPGRADED)
  const [jdInputs, setJdInputs] = useState({ role: "", experience: "", workMode: "Hybrid", shift: "General Shift" });
  const [structuredJD, setStructuredJD] = useState<any>(null);

  const [offerInputs, setOfferInputs] = useState({ role: "", name: "", email: "", salary: "", joinDate: "", bonus: "" });
  const [structuredOffer, setStructuredOffer] = useState<any>(null);

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // ─── ONLY CHANGED FUNCTION: callGemini → callHF (Hugging Face OpenAI-compatible) ───
  const callHF = async (prompt: string, sysInstruct?: string) => {
    let attempt = 0;
    const maxRetries = 3;

    while (attempt < maxRetries) {
      try {
        const messages: { role: string; content: string }[] = [];
        if (sysInstruct) {
          messages.push({ role: "system", content: sysInstruct });
        }
        messages.push({ role: "user", content: prompt });

        const response = await fetch(HF_API_URL, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${HF_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: HF_MODEL,
            messages,
            max_tokens: 2048,
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`HF API error ${response.status}: ${errText}`);
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content ?? "";
      } catch (e: any) {
        attempt++;
        const msg = e.message || e.toString();
        if (msg.includes('429') || msg.includes('503') || msg.includes('Quota') || msg.includes('rate')) {
          if (attempt >= maxRetries) throw e;
          toast({ title: "Network Busy", description: `HF Router (429/503). Auto-retrying in ${attempt * 4}s...`, variant: "default" });
          await sleep(4000 * attempt);
        } else {
          throw e;
        }
      }
    }
    return "";
  };
  // ─────────────────────────────────────────────────────────────────────────────────────

  const handleDrag = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); if (e.type === "dragenter" || e.type === "dragover") setDragActive(true); else if (e.type === "dragleave") setDragActive(false); };
  
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const files = Array.from(e.dataTransfer.files);
      processFiles(files);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFiles(Array.from(e.target.files));
  };

  const processFiles = async (files: File[]) => {
    const newCands: Candidate[] = [];
    for (const file of files) {
      try {
        const text = await file.text();
        newCands.push({ id: Math.random().toString(), filename: file.name, text, status: 'Pending' });
      } catch (err) { console.error("Failed to read file"); }
    }
    setCandidates(prev => [...prev, ...newCands]);
    toast({ title: "Resumes Added", description: `${newCands.length} resumes dropped into the queue.` });
  };

  const handlePastedData = () => {
    if (!pastedData.trim()) return toast({ title: "Empty Data", description: "Paste text first.", variant: "destructive" });
    const newCand: Candidate = { id: Math.random().toString(), filename: `Direct_Paste_${Math.floor(Math.random()*1000)}.txt`, text: pastedData, status: 'Pending' };
    setCandidates(prev => [...prev, newCand]);
    setPastedData("");
    toast({ title: "Data Ingested", description: "Pasted text added to queue." });
  };

  // --- AUTOMATED SMART FORM CREATOR ---
  const generateSmartFormSchema = async () => {
    if (!formTitle || !jdText) return toast({ title: "Data Required", description: "Please enter a Job Title and paste the Job Description first.", variant: "destructive" });
    
    setAiLoading(true);
    toast({ title: "Analyzing Role...", description: "AI is crafting a custom application form tailored to this JD." });
    
    try {
      const prompt = `Act as an elite HR Form Architect for an MNC. 
      Job Title: "${formTitle}"
      Job Description: "${jdText}"
      
      Generate a customized, professional job application form schema.
      You MUST include these exact standard corporate fields first:
      - Full Legal Name (type: text)
      - Corporate/Personal Email (type: email)
      - Date of Birth (type: date)
      - Highest University / Education Background (type: text)
      - Year of Graduation (type: number)
      - Final Academic Marks / CGPA (type: text)
      - Total Years of Work Experience (type: text)
      - Preferred Work Mode (type: select, options: ["Work from Office", "Work from Home", "Hybrid"])
      - Notice Period / How soon can you start working? (type: select, options: ["Immediate", "15 Days", "30 Days", "60+ Days"])
      - Official Resume Upload (type: file)
      
      You MUST ALSO create 3 specific, highly relevant screening questions based on the technical or behavioral requirements in the JD (type: textarea).
      
      Output STRICTLY as a raw JSON array of objects. No markdown. No backticks.
      Format exactly like this:
      [
        {"id": "full_name", "label": "Full Legal Name", "type": "text", "required": true}
      ]`;

      const result = await callHF(prompt);
      
      let cleanText = result.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
      const startIdx = cleanText.indexOf('[');
      const endIdx = cleanText.lastIndexOf(']');
      if (startIdx !== -1 && endIdx !== -1) cleanText = cleanText.substring(startIdx, endIdx + 1);
      
      const schema = JSON.parse(cleanText);
      setGeneratedFormSchema(schema);
      toast({ title: "Form Generated", description: "Smart Application Form is ready for deployment." });
    } catch (e: any) {
      toast({ title: "AI Error", description: "Failed to generate form schema. Please check JD formats.", variant: "destructive" });
    }
    setAiLoading(false);
  };

  const publishFormToDatabase = async () => {
    if (!generatedFormSchema) return;
    setAiLoading(true);
    
    try {
      const { data, error } = await supabase.from('job_forms').insert([{
        job_title: formTitle,
        form_schema: generatedFormSchema,
        form_style: formStyle,
        jd_text: jdText, 
        status: 'Active'
      }]).select().single();

      if (error) throw error;

      const publicLink = `${window.location.origin}/apply/${data.id}`;
      setPublishedForms(prev => [...prev, { title: formTitle, link: publicLink, id: data.id }]);
      setGeneratedFormSchema(null);
      setFormTitle("");
      
      toast({ title: "Form Published!", description: "Application link is live and securely connected to your database." });
    } catch (e: any) {
      toast({ title: "Database Error", description: e.message || "Failed to publish form.", variant: "destructive" });
    }
    setAiLoading(false);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Link Copied", description: "Link copied to clipboard. Ready to post!" });
  };

  // --- EXISTING BULK SCANNER ---
  const runBulkScanner = async () => {
    if (!jdText) return toast({ title: "JD Required", variant: "destructive" });
    if (candidates.length === 0) return toast({ title: "Empty Queue", variant: "destructive" });

    setAiLoading(true);
    let updated = [...candidates];
    
    for (let i = 0; i < updated.length; i++) {
      if (updated[i].status !== 'Pending') continue;
      updated[i].status = 'Scanning';
      setCandidates([...updated]); 

      try {
        const prompt = `Act as an elite corporate ATS Analyzer. Compare the provided candidate data to this Job Description.
        JD: ${jdText}
        Candidate Data: ${updated[i].text}
        
        Extract the candidate's name from the data, score their match (0-100), and extract their skills.
        Output STRICTLY a raw JSON object.
        Format exactly like this: 
        {"score": 85, "name": "Extracted Name", "recommendation": "Hire", "missing": "Skill1, Skill2", "skills": [{"name": "React", "value": 90}, {"name": "Node", "value": 70}]}`;

        const result = await callHF(prompt);
        let cleanText = result.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
        const startIdx = cleanText.indexOf('{');
        const endIdx = cleanText.lastIndexOf('}');
        if (startIdx !== -1 && endIdx !== -1) cleanText = cleanText.substring(startIdx, endIdx + 1);
        
        const parsed = JSON.parse(cleanText);

        updated[i].score = parsed.score;
        updated[i].filename = parsed.name ? `${parsed.name} (Applicant)` : updated[i].filename;
        updated[i].recommendation = parsed.recommendation;
        updated[i].missingSkills = parsed.missing || "None";
        updated[i].skillsData = parsed.skills || [];
        updated[i].status = 'Complete';
      } catch (e) {
        updated[i].status = 'Error';
      }
      if (i < updated.length - 1) await sleep(4000); 
    }

    updated = updated.sort((a, b) => (b.score || 0) - (a.score || 0));
    updated = updated.map((c) => {
      if (c.score && c.score >= 75) c.recommendation = "⭐ SHORTLISTED";
      else if (c.score && c.score < 50) c.recommendation = "REJECT";
      return c;
    });

    setCandidates(updated);
    setAiLoading(false);
    toast({ title: "Scan Complete", description: "Authentic data evaluated and auto-shortlisted." });
  };

  const clearQueue = () => setCandidates([]);

  const downloadSmartReport = () => {
    let csv = "CANDIDATE SOURCE,MATCH SCORE,RECOMMENDATION,MISSING SKILLS\n";
    candidates.forEach(c => {
      csv += `"${c.filename}",${c.score||0},"${c.recommendation||'--'}","${c.missingSkills||'--'}"\n`;
    });
    const link = document.createElement("a");
    link.href = encodeURI(`data:text/csv;charset=utf-8,${csv}`);
    link.download = "ATS_Smart_Report.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const draftShortlistEmail = async () => {
    const shortlisted = candidates.filter(c => c.recommendation?.includes('SHORTLISTED'));
    if (shortlisted.length === 0) return toast({ title: "No Candidates", description: "No shortlisted candidates found in the queue.", variant: "destructive" });

    setAiLoading(true);
    toast({ title: "Drafting Communication", description: "AI is writing the official corporate update email..." });

    try {
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const emails = new Set<string>();
      
      shortlisted.forEach(cand => {
        const matches = cand.text.match(emailRegex);
        if (matches) matches.forEach(e => emails.add(e));
      });

      setExtractedEmails(Array.from(emails));

      const prompt = `Act as an Executive Corporate HR Manager for a top MNC.
      You are writing to candidates who have just passed the initial ATS screening for the role described here: "${jdText || 'Corporate Position'}".
      Write a highly professional, welcoming email inviting them to the next round of the process (Aptitude/Technical test). 
      Use placeholders like [Candidate Name] so it acts as a universal template.
      Output ONLY the raw email body text. Do not include a subject line. No markdown.`;

      const emailText = await callHF(prompt);
      setEmailTemplate(emailText);
      setShowEmailModal(true);

    } catch (e) {
      toast({ title: "AI Error", description: "Failed to generate email template.", variant: "destructive" });
    }
    setAiLoading(false);
  };

  const dispatchCorporateEmail = () => {
    const bccString = extractedEmails.join(',');
    const subject = encodeURIComponent(`Update on your Application at FWC`);
    const body = encodeURIComponent(emailTemplate);
    
    window.location.href = `mailto:?bcc=${bccString}&subject=${subject}&body=${body}`;
    setShowEmailModal(false);
    toast({ title: "Email Client Opened", description: "Template securely transferred to your corporate email client." });
  };

  const generateAssessment = async () => {
    if (!assessmentTitle || !jdText) return toast({ title: "Data Required", description: "Please enter a Test Title and paste the Job Description.", variant: "destructive" });

    setAiLoading(true);
    toast({ title: "Compiling Assessment", description: `AI is generating ${assessmentDifficulty} level questions...` });

    try {
      const prompt = `Act as an elite MNC Technical Assessor.
      Role: "${assessmentTitle}"
      Job Description: "${jdText}"
      Difficulty Level: "${assessmentDifficulty}"
      
      Create a highly professional, 5-question multiple-choice assessment directly based on the technical skills required in the JD.
      Output STRICTLY as a raw JSON array. No markdown, no backticks.
      Format:
      [
        {
          "question": "Clear, detailed technical or aptitude question here?",
          "options": ["Option A", "Option B", "Option C", "Option D"],
          "correctAnswer": "Option B"
        }
      ]`;

      const result = await callHF(prompt);
      
      let cleanText = result.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
      const startIdx = cleanText.indexOf('[');
      const endIdx = cleanText.lastIndexOf(']');
      if (startIdx !== -1 && endIdx !== -1) cleanText = cleanText.substring(startIdx, endIdx + 1);
      
      setAssessmentQuestions(JSON.parse(cleanText));
      toast({ title: "Paper Set", description: "AI Assessment generated. You may edit manually below before publishing." });
    } catch (e: any) {
      toast({ title: "Generation Failed", description: "Could not compile assessment. Please try again.", variant: "destructive" });
    }
    setAiLoading(false);
  };

  const publishAssessment = async () => {
    if (!assessmentQuestions) return;
    setAiLoading(true);
    try {
      const { data, error } = await supabase.from('assessments').insert([{
        title: assessmentTitle,
        jd_text: jdText,
        difficulty: assessmentDifficulty,
        questions: assessmentQuestions,
        status: 'Active'
      }]).select().single();

      if (error) throw error;

      const publicLink = `${window.location.origin}/assessment/${data.id}`;
      setPublishedAssessments(prev => [...prev, { title: assessmentTitle, link: publicLink, id: data.id }]);
      setAssessmentQuestions(null);
      setAssessmentTitle("");
      
      toast({ title: "Test Published!", description: "Assessment is live and securely connected to your database." });
    } catch (e: any) {
      toast({ title: "Database Error", description: e.message || "Failed to publish assessment.", variant: "destructive" });
    }
    setAiLoading(false);
  };

  const handleManualQuestionEdit = (index: number, key: string, value: string) => {
    if (!assessmentQuestions) return;
    const updated = [...assessmentQuestions];
    updated[index][key] = value;
    setAssessmentQuestions(updated);
  };

  const generateInterviewLink = () => {
    const roomCode = Math.random().toString(36).substr(2, 9);
    const internalUrl = `${window.location.origin}/interview/${roomCode}`;
    setInterviewLink(internalUrl);
    toast({ title: "Secure Link Created", description: "Platform link generated." });
  };

  const startLiveInterview = async () => {
    if (!jdInputs.role) return toast({ title: "Role Required", description: "Please enter the Job Title.", variant: "destructive" });
    setInterviewState('active');
    setAiLoading(true);
    try {
      const prompt = `Act as an HR Copilot. For a "${jdInputs.role}" interview, give exactly 4 specific interview questions formatted as a raw JSON array of strings. No markdown. Example: ["Q1?", "Q2?"]`;
      const result = await callHF(prompt);
      let cleanText = result.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
      const startIdx = cleanText.indexOf('[');
      const endIdx = cleanText.lastIndexOf(']');
      if (startIdx !== -1 && endIdx !== -1) cleanText = cleanText.substring(startIdx, endIdx + 1);
      setLiveQuestions(JSON.parse(cleanText));
    } catch(e) { setLiveQuestions(["Tell me about your experience.", "Why should we hire you?"]); }
    setAiLoading(false);
  };

  const endInterview = async () => {
    setAiLoading(true);
    try {
      const prompt = `Act as an AI Interview Analyzer for "${jdInputs.role}". Interview finished. Generate strict JSON. Format: {"finalScore": 82, "report": "Candidate showed strong leadership.", "analytics": [{"name": "Tech", "value": 70}]}`;
      const result = await callHF(prompt);
      let cleanText = result.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
      const startIdx = cleanText.indexOf('{');
      const endIdx = cleanText.lastIndexOf('}');
      if (startIdx !== -1 && endIdx !== -1) cleanText = cleanText.substring(startIdx, endIdx + 1);
      const parsed = JSON.parse(cleanText);
      setFinalScore(parsed.finalScore);
      setFinalReport(parsed.report);
      setInterviewAnalytics(parsed.analytics);
      setInterviewState('finished');
    } catch(e) { toast({ title: "Analysis Failed", variant: "destructive" }); setInterviewState('idle'); }
    setAiLoading(false);
  };

  // --- UPGRADED CORPORATE JD GENERATOR ---
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

  // --- UPGRADED CORPORATE OFFER LETTER GENERATOR ---
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
            {id: 'assessment', icon: FileQuestion, label: "Assessment Builder"},
            {id: 'video', icon: Video, label: "Live Interview Room"},
            {id: 'jd', icon: Briefcase, label: "JD Generator"},
            {id: 'offer', icon: Mail, label: "Offer Generator"}
          ].map(t => (
            <Button key={t.id} variant={activeTab === t.id ? 'default' : 'outline'} onClick={()=>setActiveTab(t.id)} className={`shadow-sm ${activeTab===t.id?'bg-indigo-600 text-white':''}`}>
              <t.icon className="w-4 h-4 mr-2"/> {t.label}
            </Button>
          ))}
        </div>

        {/* ... (Previous tabs for resume, assessment, video remain unchanged) ... */}
        {activeTab === 'resume' && (
          <div className="space-y-6">
            <div className="grid md:grid-cols-3 gap-6">
              
              <div className="md:col-span-1 space-y-3">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Step 1: Active Job Description</label>
                <Input placeholder="Job Title (e.g. Senior Backend Engineer)" value={formTitle} onChange={e=>setFormTitle(e.target.value)} className="bg-white" />
                <Textarea placeholder="Paste the official Job Description here. AI will score all external applications against this..." className="h-64 resize-none bg-white shadow-sm border-slate-200" value={jdText} onChange={e=>setJdText(e.target.value)} />
              </div>
              
              <div className="md:col-span-2 space-y-4">
                
                <div className="bg-indigo-50 border border-indigo-100 p-5 rounded-xl shadow-inner space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-sm font-black text-indigo-900 flex items-center gap-2">
                        <FormInput className="w-4 h-4 text-indigo-600"/> Corporate Application Link Generator
                      </h3>
                      <p className="text-[10px] text-indigo-700 mt-1 max-w-lg">
                        Instantly generate a public, professional job application link. The AI will analyze your JD and dynamically build custom screening questions along with mandatory corporate fields.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4 items-center">
                    <Select value={formStyle} onValueChange={setFormStyle}>
                      <SelectTrigger className="w-[200px] bg-white text-xs h-8">
                        <SelectValue placeholder="Theme Style" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Standard Corporate">Standard Corporate</SelectItem>
                        <SelectItem value="Modern Tech">Modern Tech / Dark Mode</SelectItem>
                        <SelectItem value="Creative">Creative / Colorful</SelectItem>
                      </SelectContent>
                    </Select>

                    <Button onClick={generateSmartFormSchema} disabled={aiLoading || !formTitle || !jdText} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white shadow-sm h-8">
                      {aiLoading ? <Loader2 className="w-3 h-3 animate-spin mr-2"/> : <Sparkles className="w-3 h-3 mr-2"/>} Generate Custom Form
                    </Button>
                  </div>

                  {generatedFormSchema && (
                    <div className="bg-white p-4 rounded-lg border border-indigo-200 space-y-4 animate-in fade-in">
                      <div className="border-b pb-2 flex justify-between items-center">
                        <h4 className="font-bold text-slate-800 text-sm">Form Preview: {formTitle}</h4>
                        <span className="text-[10px] uppercase font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded">Ready to Publish</span>
                      </div>
                      <div className="space-y-3 opacity-70 pointer-events-none">
                        {generatedFormSchema.map((field: any, idx: number) => (
                          <div key={idx} className="space-y-1">
                            <label className="text-xs font-bold text-slate-600">{field.label} {field.required && <span className="text-red-500">*</span>}</label>
                            {field.type === 'textarea' ? <Textarea className="h-10 text-xs" /> : <Input type={field.type} className="h-8 text-xs" />}
                          </div>
                        ))}
                      </div>
                      <Button onClick={publishFormToDatabase} disabled={aiLoading} className="w-full bg-emerald-600 hover:bg-emerald-700 font-bold text-white mt-4">
                        {aiLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : <Share2 className="w-4 h-4 mr-2"/>} Publish Form & Get Public Link
                      </Button>
                    </div>
                  )}

                  {publishedForms.length > 0 && (
                    <div className="space-y-2 mt-4">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Active Social Media Application Links</p>
                      {publishedForms.map((form, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-white border border-slate-200 rounded p-2 shadow-sm">
                          <div className="truncate flex-1">
                            <p className="text-xs font-bold text-slate-800">{form.title}</p>
                            <p className="text-[10px] text-blue-600 truncate max-w-[250px]">{form.link}</p>
                          </div>
                          <Button onClick={() => copyToClipboard(form.link)} variant="outline" className="h-7 text-xs px-3 bg-slate-50 hover:bg-slate-100">Copy Link</Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                <div className="grid md:grid-cols-2 gap-4">
                  <div 
                    className={`h-32 border-2 border-dashed rounded-lg flex flex-col items-center justify-center p-4 text-center transition-colors cursor-pointer ${dragActive ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-slate-50/50 hover:bg-slate-50'}`}
                    onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <UploadCloud className={`w-8 h-8 mb-1 ${dragActive ? 'text-emerald-500' : 'text-slate-400'}`} />
                    <p className="font-semibold text-sm text-slate-700">{dragActive ? "Drop 500+ Resumes Here" : "Drag & Drop Bulk Local Resumes"}</p>
                    <p className="text-xs text-slate-500 mt-1">Or click to browse PDFs/.txt files</p>
                    <input type="file" multiple accept=".txt,.pdf,.doc,.docx" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Textarea placeholder="Or manually paste inbound email payload / resume text here..." className="flex-1 resize-none bg-white shadow-sm border-slate-200 text-xs" value={pastedData} onChange={e=>setPastedData(e.target.value)}/>
                    <Button onClick={handlePastedData} variant="outline" className="text-xs font-bold shadow-sm bg-white h-8"><ClipboardPaste className="w-3 h-3 mr-2 text-emerald-600"/> Append Raw Candidate</Button>
                  </div>
                </div>
              </div>
            </div>

            <Card className="shadow-sm border-slate-200 mt-6">
              <CardHeader className="bg-slate-50 border-b pb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <CardTitle className="text-lg text-slate-800 flex items-center gap-2"><Users className="w-5 h-5 text-indigo-600" /> Processing Queue ({candidates.length})</CardTitle>
                  <p className="text-xs text-slate-500 mt-1">AI will analyze the factual downloaded resume data, score it, and build strict visual skill charts.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={downloadSmartReport} variant="outline" className="h-9 font-bold text-slate-700 border-slate-300 bg-white"><Download className="w-4 h-4 mr-2"/> Export Report</Button>
                  
                  {candidates.some(c => c.recommendation?.includes('SHORTLISTED')) && (
                    <Button onClick={draftShortlistEmail} variant="outline" className="h-9 font-bold text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100">
                      <Mail className="w-4 h-4 mr-2"/> Email Shortlisted
                    </Button>
                  )}

                  {candidates.length > 0 && <Button onClick={clearQueue} variant="ghost" className="text-slate-500 h-9" disabled={aiLoading}>Clear</Button>}
                  <Button onClick={runBulkScanner} disabled={aiLoading || candidates.length === 0} className="bg-indigo-600 hover:bg-indigo-700 font-bold shadow-sm h-9 text-white">
                    {aiLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />} Process Application Data
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[500px] overflow-y-auto">
                  <Table>
                    <TableHeader className="bg-slate-50 sticky top-0 z-10">
                      <TableRow>
                        <TableHead className="font-bold">Candidate Details</TableHead>
                        <TableHead className="font-bold">Match Score</TableHead>
                        <TableHead className="font-bold w-[250px]">Extracted Skills Graph</TableHead>
                        <TableHead className="font-bold">Missing Skills</TableHead>
                        <TableHead className="font-bold">AI Decision</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {candidates.map((c, idx) => (
                        <TableRow key={idx} className={c.recommendation?.includes('SHORTLISTED') ? "bg-emerald-50/30" : ""}>
                          <TableCell className="font-medium text-slate-700 max-w-[200px]" title={c.filename}>
                            <div className="truncate">{c.filename}</div>
                            <div className="mt-1">
                              {c.status === 'Pending' && <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded">Pending Data Parsing</span>}
                              {c.status === 'Scanning' && <span className="text-[10px] font-bold text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded flex items-center w-max gap-1"><Loader2 className="w-3 h-3 animate-spin"/> Analyzing Logic</span>}
                              {c.status === 'Error' && <span className="text-[10px] font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded flex items-center w-max gap-1"><XCircle className="w-3 h-3"/> API Failed</span>}
                            </div>
                          </TableCell>
                          <TableCell>
                            {c.score ? <span className={`text-2xl font-black ${c.score >= 75 ? 'text-emerald-600' : c.score >= 50 ? 'text-amber-600' : 'text-red-600'}`}>{c.score}%</span> : "--"}
                          </TableCell>
                          <TableCell className="h-20 p-2">
                            {c.skillsData && c.skillsData.length > 0 ? (
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={c.skillsData} layout="vertical" margin={{top:0, right:0, left:-20, bottom:0}}>
                                  <XAxis type="number" hide domain={[0, 100]} />
                                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fontSize: 9}} width={60} />
                                  <RechartsTooltip cursor={{fill: 'transparent'}} contentStyle={{fontSize: '10px', padding: '2px'}}/>
                                  <Bar dataKey="value" fill="#6366f1" radius={[0,4,4,0]} barSize={10} />
                                </BarChart>
                              </ResponsiveContainer>
                            ) : <span className="text-xs text-slate-400 italic">Awaiting secure AI processing...</span>}
                          </TableCell>
                          <TableCell className="text-xs text-slate-600 max-w-[200px] truncate">{c.missingSkills || "--"}</TableCell>
                          <TableCell>
                            {c.recommendation ? <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded border ${c.recommendation.includes('SHORTLISTED') ? 'bg-emerald-50 border-emerald-400 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>{c.recommendation}</span> : "--"}
                          </TableCell>
                        </TableRow>
                      ))}
                      {candidates.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center p-12 text-slate-500 font-medium">No candidates uploaded. Generate a Smart Form or drop local files to begin.</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === 'assessment' && (
          <div className="space-y-6">
            <div className="grid md:grid-cols-3 gap-6">
              
              <div className="md:col-span-1 space-y-4">
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Edit3 className="w-4 h-4 text-indigo-600"/> Test Configuration</h3>
                  
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">Assessment Title</label>
                    <Input placeholder="e.g. Senior Java Round 1" value={assessmentTitle} onChange={e=>setAssessmentTitle(e.target.value)} className="bg-slate-50 text-sm" />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">Target Job Description</label>
                    <Textarea placeholder="Paste the JD here so AI can map questions exactly to required skills..." className="h-32 resize-none bg-slate-50 text-sm" value={jdText} onChange={e=>setJdText(e.target.value)} />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">Difficulty Level</label>
                    <Select value={assessmentDifficulty} onValueChange={setAssessmentDifficulty}>
                      <SelectTrigger className="bg-slate-50 text-sm">
                        <SelectValue placeholder="Select Level" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Beginner">Beginner</SelectItem>
                        <SelectItem value="Intermediate">Intermediate</SelectItem>
                        <SelectItem value="Advanced">Advanced / Senior</SelectItem>
                        <SelectItem value="Expert">Expert / Architect</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Button onClick={generateAssessment} disabled={aiLoading || !assessmentTitle || !jdText} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-sm">
                    {aiLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : <BrainCircuit className="w-4 h-4 mr-2"/>} Frame Assessment Paper
                  </Button>
                </div>
              </div>

              <div className="md:col-span-2">
                <Card className="shadow-sm border-slate-200">
                  <CardHeader className="bg-slate-50 border-b pb-4 flex flex-row justify-between items-center">
                    <div>
                      <CardTitle className="text-lg text-slate-800 flex items-center gap-2"><FileQuestion className="w-5 h-5 text-indigo-600"/> Generated Question Paper</CardTitle>
                      <p className="text-xs text-slate-500 mt-1">HR can manually review and edit questions before publishing.</p>
                    </div>
                    {assessmentQuestions && (
                      <Button onClick={publishAssessment} disabled={aiLoading} className="bg-emerald-600 hover:bg-emerald-700 font-bold text-white shadow-sm">
                        <Share2 className="w-4 h-4 mr-2"/> Publish Test to Database
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent className="p-6 space-y-6 max-h-[600px] overflow-y-auto">
                    {assessmentQuestions ? (
                      assessmentQuestions.map((q: any, idx: number) => (
                        <div key={idx} className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3 relative group">
                          <span className="absolute top-2 right-2 text-[10px] font-black text-slate-300">Q{idx+1}</span>
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500 uppercase">Question (Manual Edit Enabled)</label>
                            <Input value={q.question} onChange={(e) => handleManualQuestionEdit(idx, 'question', e.target.value)} className="font-medium bg-white" />
                          </div>
                          
                          <div className="grid grid-cols-2 gap-3 pt-2">
                            {q.options.map((opt: string, optIdx: number) => (
                              <div key={optIdx} className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-400 uppercase">Option {String.fromCharCode(65 + optIdx)}</label>
                                <Input 
                                  value={opt} 
                                  onChange={(e) => {
                                    const newOpts = [...q.options];
                                    newOpts[optIdx] = e.target.value;
                                    handleManualQuestionEdit(idx, 'options', newOpts as any);
                                  }} 
                                  className="text-xs bg-white" 
                                />
                              </div>
                            ))}
                          </div>

                          <div className="pt-2">
                            <label className="text-xs font-bold text-emerald-600 uppercase">Correct Answer (System Key)</label>
                            <Input value={q.correctAnswer} onChange={(e) => handleManualQuestionEdit(idx, 'correctAnswer', e.target.value)} className="text-xs bg-emerald-50 border-emerald-200 text-emerald-800 font-bold" />
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center p-12 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
                        <FileQuestion className="w-12 h-12 text-slate-300 mx-auto mb-3"/>
                        <p className="text-slate-500 font-medium">No assessment generated yet.</p>
                        <p className="text-xs text-slate-400 mt-1">Configure settings on the left and click "Frame Assessment Paper".</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {publishedAssessments.length > 0 && (
                  <div className="mt-6 space-y-3">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Active Live Assessments</p>
                    {publishedAssessments.map((test, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-white border border-slate-200 rounded-lg p-3 shadow-sm">
                        <div>
                          <p className="text-sm font-bold text-slate-800">{test.title}</p>
                          <p className="text-xs text-blue-600 truncate mt-1">{test.link}</p>
                        </div>
                        <Button onClick={() => copyToClipboard(test.link)} variant="outline" className="h-8 text-xs font-bold text-slate-700">Copy Link</Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'video' && (
          <div className="grid md:grid-cols-3 gap-6">
            <div className="md:col-span-1 space-y-4">
              <Card className="shadow-sm border-slate-200"><CardHeader className="bg-slate-50 border-b pb-4"><CardTitle className="text-sm font-bold flex items-center gap-2"><Video className="w-4 h-4 text-blue-600"/> Room Config</CardTitle></CardHeader><CardContent className="p-4 space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Target Role (For AI)</label>
                  <Input placeholder="E.g. Senior Backend Dev" value={jdInputs.role} onChange={e=>setJdInputs({...jdInputs, role: e.target.value})} disabled={interviewState!=='idle'} />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Candidate Link</label>
                  <div className="flex gap-2">
                    <Input readOnly value={interviewLink} placeholder="Click to generate link..." className="text-xs bg-slate-50" />
                    <Button onClick={generateInterviewLink} variant="outline" disabled={interviewState!=='idle'} className="px-3"><ExternalLink className="w-4 h-4"/></Button>
                  </div>
                </div>
                {interviewState === 'idle' && <Button onClick={startLiveInterview} disabled={!interviewLink || aiLoading} className="w-full bg-blue-600 hover:bg-blue-700 font-bold text-white">{aiLoading?<Loader2 className="w-4 h-4 animate-spin"/>:<Play className="w-4 h-4 mr-2"/>} Start AI Analysis</Button>}
                {interviewState === 'active' && <Button onClick={endInterview} disabled={aiLoading} variant="destructive" className="w-full font-bold">{aiLoading?<Loader2 className="w-4 h-4 animate-spin"/>:"End Interview & Generate Report"}</Button>}
                {interviewState === 'finished' && <Button onClick={()=>{setInterviewState('idle'); setInterviewLink('');}} variant="outline" className="w-full font-bold">Reset Room</Button>}
              </CardContent></Card>
              
              {interviewState === 'active' && (
                <Card className="shadow-sm border-blue-200 bg-blue-50/50 animate-in fade-in slide-in-from-left-4"><CardContent className="p-4 space-y-3">
                  <h3 className="font-bold text-blue-900 flex items-center gap-2 border-b border-blue-100 pb-2"><BrainCircuit className="w-4 h-4"/> AI Prompts for HR</h3>
                  <ul className="text-xs text-blue-800 space-y-2 list-disc pl-4">
                    {liveQuestions.map((q,i)=><li key={i}>{q}</li>)}
                  </ul>
                </CardContent></Card>
              )}
            </div>

            <div className="md:col-span-2">
              <Card className="h-[500px] border-slate-200 overflow-hidden flex flex-col">
                {interviewState === 'idle' ? (
                  <div className="flex-1 flex flex-col items-center justify-center bg-slate-900 text-slate-400">
                    <Video className="w-16 h-16 mb-4 opacity-50" />
                    <p className="font-medium">Video Room Offline</p>
                    <p className="text-sm opacity-50">Generate a link and start the room.</p>
                  </div>
                ) : interviewState === 'active' ? (
                  <div className="flex-1 relative bg-slate-900 flex items-center justify-center">
                    <div className="absolute top-4 left-4 flex gap-2">
                      <span className="bg-red-600 text-white text-[10px] font-black uppercase px-2 py-1 rounded animate-pulse flex items-center gap-1"><span className="w-2 h-2 bg-white rounded-full"></span> LIVE</span>
                      <span className="bg-indigo-600 text-white text-[10px] font-black uppercase px-2 py-1 rounded flex items-center gap-1"><BrainCircuit className="w-3 h-3"/> AI Analyzing</span>
                    </div>
                    <div className="grid grid-cols-2 w-full h-full gap-1 p-1">
                      <div className="bg-slate-800 rounded flex items-center justify-center relative">
                        <Users className="w-12 h-12 text-slate-600"/>
                        <span className="absolute bottom-2 left-2 text-white text-xs bg-black/50 px-2 py-1 rounded">HR Recruiter (You)</span>
                      </div>
                      <div className="bg-slate-800 rounded flex items-center justify-center relative border border-blue-500/30">
                        <UserPlus className="w-12 h-12 text-slate-600"/>
                        <span className="absolute bottom-2 left-2 text-white text-xs bg-black/50 px-2 py-1 rounded">Candidate</span>
                        <div className="absolute top-2 right-2 flex flex-col gap-1 w-1/3">
                           <div className="h-1 w-full bg-slate-700 rounded overflow-hidden"><div className="h-full bg-emerald-500 w-3/4 animate-pulse"></div></div>
                           <div className="h-1 w-full bg-slate-700 rounded overflow-hidden"><div className="h-full bg-blue-500 w-1/2 animate-pulse" style={{animationDelay:'1s'}}></div></div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 bg-white p-8 flex flex-col items-center animate-in zoom-in-95">
                    <CheckCircle2 className="w-16 h-16 text-emerald-500 mb-4" />
                    <h2 className="text-2xl font-black text-slate-800 mb-2">Smart Interview Report</h2>
                    <div className="flex gap-8 w-full max-w-lg mt-6">
                      <div className="flex-1">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 border-b pb-1">Total Score</p>
                        <p className="text-4xl font-black text-indigo-600">{finalScore}/100</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-4 mb-1 border-b pb-1">AI Verdict</p>
                        <p className="text-sm font-medium text-slate-700">{finalReport}</p>
                      </div>
                      <div className="flex-1 h-[150px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={interviewAnalytics} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={30} outerRadius={60} stroke="none">
                              {interviewAnalytics.map((e, i) => <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />)}
                            </Pie>
                            <RechartsTooltip contentStyle={{fontSize:'12px', borderRadius:'8px'}}/>
                            <Legend wrapperStyle={{fontSize:'10px'}}/>
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            </div>
          </div>
        )}

        {/* --- UPGRADED CORPORATE JD GENERATOR --- */}
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

        {/* --- UPGRADED CORPORATE OFFER LETTER GENERATOR --- */}
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
                  {structuredOffer && <Button onClick={dispatchOffer} variant="outline" className="h-8 text-xs font-bold text-emerald-700 bg-emerald-50 border-emerald-200"><Send className="w-3 h-3 mr-2"/> Dispatch to Candidate</Button>}
                </CardHeader>
                <CardContent className="p-0 bg-slate-200/50 min-h-[400px]">
                  {structuredOffer ? (
                    <div className="p-12 max-w-2xl mx-auto bg-white shadow-2xl my-8 border border-slate-300 relative overflow-hidden">
                      {/* Watermark */}
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
                              <p className="font-['Brush_Script_MT',cursive] text-4xl text-blue-900 mb-2 italic">Veeresh</p>
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

      {/* --- EMAIL SHORTLIST MODAL --- */}
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
                  {extractedEmails.length === 0 && <span className="text-xs text-red-500 font-bold">Warning: No valid emails detected in resumes.</span>}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">AI Generated Message Template</label>
                <Textarea value={emailTemplate} onChange={(e) => setEmailTemplate(e.target.value)} className="h-64 resize-none text-sm bg-slate-50" />
              </div>
              <Button onClick={dispatchCorporateEmail} disabled={extractedEmails.length === 0 || !emailTemplate} className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 font-black text-white text-lg">
                Send via Default Email Client
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

    </DashboardLayout>
  );
}