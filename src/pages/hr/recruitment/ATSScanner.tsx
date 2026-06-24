import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { UploadCloud, ClipboardPaste, FormInput, Users, Globe, Copy, Check, Briefcase } from "lucide-react";
import { BarChart, Bar, Cell, XAxis, YAxis, ResponsiveContainer } from "recharts";
import { supabase } from "@/lib/supabase";
import { callCorporateAI } from "@/lib/ai";

interface Candidate {
  id: string;
  filename: string;
  candidateName?: string;
  text: string;
  status: 'Pending' | 'Scanning' | 'Complete' | 'Error';
  score?: number;
  recommendation?: string;
  missingSkills?: string;
  skillsData?: { name: string; value: number }[];
}

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#6366f1'];

export default function ATSScanner() {
  const { toast } = useToast();
  const [aiLoading, setAiLoading] = useState(false);
  const [jdText, setJdText] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [pastedData, setPastedData] = useState(""); 
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formTitle, setFormTitle] = useState("");
  const [formStyle, setFormStyle] = useState("Standard Corporate");
  const [generatedFormSchema, setGeneratedFormSchema] = useState<any[] | null>(null);
  const [publishedForms, setPublishedForms] = useState<any[]>([]);
  const [copiedFormId, setCopiedFormId] = useState<string | null>(null);
  const [currentActiveJobFormId, setCurrentActiveJobFormId] = useState<string | null>(null);

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Hydrate corporate job forms from Supabase persistently on mount lifecycle
  useEffect(() => {
    loadPublishedFormsFromDatabase();
  }, []);

  const loadPublishedFormsFromDatabase = async () => {
    try {
      const { data, error } = await supabase
        .from("job_forms")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      if (data && data.length > 0) {
        const mappedForms = data.map((form: any) => ({
          id: form.id,
          title: form.job_title,
          link: `${window.location.origin}/apply/${form.id}`,
          status: form.status || 'Active',
          jdText: form.jd_text || "",
          created: new Date(form.created_at).toLocaleDateString()
        }));
        setPublishedForms(mappedForms);

        // Automatically select and restore the latest active job configuration upon page refresh
        const latestJob = mappedForms[0];
        setCurrentActiveJobFormId(latestJob.id);
        setFormTitle(latestJob.title);
        setJdText(latestJob.jdText);
        console.debug("Context restored to job:", latestJob.id);
      }
    } catch (err: any) {
      console.error("Failed to hydrate active job forms schema registry ledger:", err);
    }
  };

  // INTERACTIVE REQUISITION RESTORATION GATEWAY: Switches state mapping to any selected position instantly
  const handleJobSelectionChange = (jobId: string) => {
    const targetJob = publishedForms.find(f => f.id === jobId);
    if (targetJob) {
      setCurrentActiveJobFormId(targetJob.id);
      setFormTitle(targetJob.title);
      setJdText(targetJob.jdText);
      toast({
        title: "Active Job Requisition Switched",
        description: `Parsing context successfully redirected to: ${targetJob.title}`
      });
    }
  };

  const callHF = async (prompt: string, sysInstruct?: string) => {
    return callCorporateAI({
      prompt,
      systemInstruction: sysInstruct,
      temperature: 0.1,
      max_tokens: 2048,
      response_format: { type: "json_object" }
    });
  };

  const extractTextFromBinaryPayload = async (file: File): Promise<string> => {
    if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
      const arrayBuffer = await file.arrayBuffer();
      const win = window as any;

      if (!win.pdfjsLib) {
        const script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js";
        document.head.appendChild(script);
        await new Promise(res => { script.onload = res; });
      }

      const pdfjsLib = win.pdfjsLib;
      pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js";

      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      let fullText = "";

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(" ");
        fullText += pageText + "\n";
      }
      return fullText.trim();
    }

    if (file.name.endsWith(".docx")) {
      const arrayBuffer = await file.arrayBuffer();
      const win = window as any;

      if (!win.mammoth) {
        const script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js";
        document.head.appendChild(script);
        await new Promise(res => { script.onload = res; });
      }

      const result = await win.mammoth.extractRawText({ arrayBuffer });
      return result?.value || "";
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (evt) => resolve(evt.target?.result as string || "");
      reader.onerror = (err) => reject(err);
      reader.readAsText(file);
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    const newCands: Candidate[] = [];
    
    toast({ title: "Parsing Binary Files", description: "Executing genuine PDF/DOCX text extraction matrices...", variant: "default" });

    for (const file of files) {
      try {
        const textContent = await extractTextFromBinaryPayload(file);
        if (textContent.trim().length > 0) {
          newCands.push({ id: crypto.randomUUID(), filename: file.name, text: textContent, status: 'Pending' });
        } else {
          throw new Error("File empty or formatting unreadable by standard character map channels.");
        }
      } catch (err) {
        console.error(`Binary extraction failed for file: ${file.name}`, err);
        newCands.push({ id: crypto.randomUUID(), filename: file.name, text: "", status: 'Error' });
      }
    }
    setCandidates(prev => [...prev, ...newCands]);
  };

  const handlePastedData = () => {
    if (!pastedData.trim()) return toast({ title: "Empty Data", description: "Paste text strings first.", variant: "destructive" });
    const newCand: Candidate = { id: crypto.randomUUID(), filename: `Direct_Paste_${Math.floor(Math.random()*1000)}.txt`, text: pastedData, status: 'Pending' };
    setCandidates(prev => [...prev, newCand]);
    setPastedData("");
    toast({ title: "Data Ingested" });
  };

  const generateSmartFormSchema = async () => {
    if (!formTitle || !jdText) return toast({ title: "Data Required", variant: "destructive" });
    setAiLoading(true);
    try {
      const prompt = `Generate a customized job application form schema array based on Role: "${formTitle}", JD: "${jdText}". Output STRICTLY a valid JSON array matching shape: [{"id": "field_id", "label": "Label", "type": "text", "required": true}]`;
      
      const cleanGeneratedText = await callHF(prompt);
      if (!cleanGeneratedText) throw new Error("Model pipeline output evaluated to empty reference packet string.");

      const cleanText = cleanGeneratedText.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
      setGeneratedFormSchema(JSON.parse(cleanText));
      toast({ title: "Form Generated" });
    } catch {
      toast({ title: "Form Schema Compilation Failed", variant: "destructive" });
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
        requires_assessment: true,
        status: 'Active'
      }]).select().single();
      if (error) throw error;
      
      const publicLink = `${window.location.origin}/apply/${data.id}`;
      
      // FIXED STATE INCONSISTENCY: Preserved full state parameters without wipe references
      setCurrentActiveJobFormId(data.id);
      setGeneratedFormSchema(null);
      
      setPublishedForms(prev => [{ id: data.id, title: formTitle, link: publicLink, status: 'Active', created: new Date().toLocaleDateString(), jdText: jdText }, ...prev]);
      toast({ title: "Form Published Securely" });
    } catch (e: any) {
      toast({ title: "Database Error", description: e.message, variant: "destructive" });
    }
    setAiLoading(false);
  };

  const copyFormLink = (link: string, id: string) => {
    navigator.clipboard.writeText(link);
    setCopiedFormId(id);
    setTimeout(() => setCopiedFormId(null), 2000);
  };

  const runBulkScanner = async () => {
    if (!currentActiveJobFormId) {
      toast({
        title: "Active Job Requisition Required",
        description: "MNC Data Security Rule: You must generate and publish an active job form to establish a tracking scope before scanning candidates.",
        variant: "destructive"
      });
      return;
    }

    if (!jdText) return toast({ title: "JD Required", variant: "destructive" });
    if (candidates.length === 0) return toast({ title: "Queue Empty", variant: "destructive" });
    setAiLoading(true);
    const updated = [...candidates];

    for (let i = 0; i < updated.length; i++) {
      if (updated[i].status !== 'Pending') continue;
      updated[i].status = 'Scanning';
      setCandidates([...updated]);

      try {
        const prompt = `Compare candidate resume text against JD matrix. JD: ${jdText}. Candidate Resume Data: ${updated[i].text}. Output STRICTLY a valid JSON object matching shape: {"score": 85, "name": "Extracted Name", "recommendation": "Hire", "missing": "Skills", "skills": [{"name": "React", "value": 90}]}`;
        
        const generatedText = await callHF(prompt);
        if (!generatedText) throw new Error("API returned an empty or malformed token context response.");
        
        const cleanText = generatedText.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
        console.debug("AI parsed segment length:", cleanText?.length);
        const parsed = JSON.parse(cleanText);

        if (typeof parsed.score !== "number" || typeof parsed.name !== "string") {
          throw new Error("Invalid AI schema structure returned by model parsing layer.");
        }

        updated[i].candidateName = parsed.name;
        updated[i].score = parsed.score;
        updated[i].recommendation = parsed.recommendation;
        updated[i].missingSkills = parsed.missing || "None";
        updated[i].skillsData = parsed.skills || [];

        const emailMatch = updated[i].text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
        const phoneMatch = updated[i].text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\b\d{10}\b/);
        const candidateEmail = emailMatch?.[0] ?? null;

        let candidateUUID = "";
        
        if (!candidateEmail) {
          const { data: insertedCandidate, error: candError } = await supabase.from('candidates').insert([{
            full_name: updated[i].candidateName,
            email: null,
            phone: phoneMatch?.[0] ?? null,
            ats_score: updated[i].score,
            recommendation: updated[i].recommendation,
            missing_skills: updated[i].missingSkills,
            skills: updated[i].skillsData,
            stage: 'Screening'
          }]).select('id').single();
          
          if (candError) throw candError;
          candidateUUID = insertedCandidate.id;
        } else {
          const { data: existingCandidate } = await supabase.from("candidates").select("id").eq("email", candidateEmail).limit(1).maybeSingle();
          
          if (existingCandidate) {
            candidateUUID = existingCandidate.id;
          } else {
            const { data: insertedCandidate, error: candError } = await supabase.from('candidates').insert([{
              full_name: updated[i].candidateName,
              email: candidateEmail,
              phone: phoneMatch?.[0] ?? null,
              ats_score: updated[i].score,
              recommendation: updated[i].recommendation,
              missing_skills: updated[i].missingSkills,
              skills: updated[i].skillsData,
              stage: 'Screening'
            }]).select('id').single();
            
            if (candError) throw candError;
            candidateUUID = insertedCandidate.id;
          }
        }

        // PERSIST RELATION RELATIONSHIP MAPPING (via job_applications — trigger syncs to candidate_applications)
        const { error: appError } = await supabase.from('job_applications').insert([{
          candidate_id: candidateUUID,
          form_id: currentActiveJobFormId, 
          status: 'Applied',
          match_score: updated[i].score,
          parsed_resume_text: updated[i].text
        }]);

        if (appError) {
          if (appError.code === '23505') {
            console.warn(`MNC Audit Warning: Candidate application record link already established for requisition form context ${currentActiveJobFormId}. Skipping row duplicate.`);
            updated[i].status = 'Complete';
            setCandidates([...updated]);
            continue;
          }
          throw appError;
        }

        updated[i].status = 'Complete';
        setCandidates([...updated]);
      } catch (e) {
        console.error("Scanner tracking error boundary execution dropped:", e);
        updated[i].status = 'Error';
        setCandidates([...updated]);
      }
      if (i < updated.length - 1) await sleep(4000);
    }
    setAiLoading(false);
    toast({ title: "Parsing Lifecycle Finished", description: "All rows committed cleanly to cross-relational tracking indices." });
  };

  return (
    <div className="space-y-6">
      {publishedForms.length > 0 && (
        <Card className="border-blue-200 bg-blue-50/40 shadow-sm rounded-xl">
          <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <Briefcase className="w-5 h-5 text-blue-600 shrink-0" />
              <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Workspace Processing Target Context</h4>
                <p className="text-sm font-black text-slate-800 mt-0.5">Select a published opening vacancy to hydrate the parsing engine scope fields.</p>
              </div>
            </div>
            <div className="w-full sm:w-72">
              <Select value={currentActiveJobFormId || ""} onValueChange={handleJobSelectionChange}>
                <SelectTrigger className="w-full bg-white font-bold text-xs h-9 border-slate-200 shadow-sm text-slate-700">
                  <SelectValue placeholder="Choose a published open vacancy..." />
                </SelectTrigger>
                <SelectContent>
                  {publishedForms.map((form) => (
                    <SelectItem key={form.id} value={form.id} className="text-xs font-semibold">{form.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-3">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Step 1: Active Job Description</label>
          <Input placeholder="Job Title" value={formTitle} onChange={e=>setFormTitle(e.target.value)} className="bg-white" />
          <Textarea placeholder="Paste Job Description guidelines here..." className="h-64 bg-white border-slate-200" value={jdText} onChange={e=>setJdText(e.target.value)} />
        </div>
        <div className="md:col-span-2 space-y-4">
          <div className="bg-indigo-50 border border-indigo-100 p-5 rounded-xl shadow-inner space-y-4">
            <h3 className="text-sm font-black text-indigo-900 flex items-center gap-2"><FormInput className="w-4 h-4 text-indigo-600"/> Corporate Application Link Generator</h3>
            <div className="flex gap-4 items-center">
              <Button onClick={generateSmartFormSchema} disabled={aiLoading || !formTitle || !jdText} className="flex-1 bg-indigo-600 text-white font-bold h-8 text-xs">Generate Custom Form</Button>
            </div>
            {generatedFormSchema && (
              <Button onClick={publishFormToDatabase} className="w-full bg-emerald-600 font-bold text-white mt-4">Publish Form & Get Public Link</Button>
            )}
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div onClick={() => fileInputRef.current?.click()} className="h-32 border-2 border-dashed border-slate-200 rounded-xl p-6 bg-slate-50/30 text-center relative hover:bg-slate-50/70 cursor-pointer transition-colors">
              <UploadCloud className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="font-semibold text-sm text-slate-700">Click to Ingest True PDF/DOCX Resumes</p>
              <input type="file" multiple accept=".txt,.pdf,.docx" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
            </div>
            <div className="flex flex-col gap-2">
              <Textarea placeholder="Or paste raw resume text here..." className="flex-1 text-xs border-slate-200" value={pastedData} onChange={e=>setPastedData(e.target.value)}/>
              <Button onClick={handlePastedData} variant="outline" className="text-xs font-bold bg-white h-8"><ClipboardPaste className="w-3 h-3 mr-2 text-emerald-600"/> Append Raw Candidate</Button>
            </div>
          </div>
        </div>
      </div>

      {publishedForms.length > 0 && (
        <Card className="border-slate-200 shadow-sm bg-white animate-fade-in">
          <CardHeader className="bg-slate-50/60 border-b p-4">
            <div className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-emerald-600" />
              <h3 className="font-bold text-slate-800 text-sm">Active Corporate Published Forms Pipeline</h3>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-bold text-xs text-slate-700">Target Requisition Role</TableHead>
                  <TableHead className="font-bold text-xs text-slate-700">Live Application URL Endpoint</TableHead>
                  <TableHead className="font-bold text-xs text-slate-700">Created Date</TableHead>
                  <TableHead className="font-bold text-xs text-slate-700 text-center">Status</TableHead>
                  <TableHead className="font-bold text-xs text-slate-700 text-center w-24">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {publishedForms.map((form) => (
                  <TableRow key={form.id}>
                    <TableCell className="text-xs font-bold text-slate-800">{form.title}</TableCell>
                    <TableCell className="text-xs font-medium text-blue-600 font-mono select-all truncate max-w-xs">{form.link}</TableCell>
                    <TableCell className="text-xs font-semibold text-slate-500">{form.created}</TableCell>
                    <TableCell className="text-center">
                      <span className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">{form.status}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Button onClick={() => copyFormLink(form.link, form.id)} size="sm" variant="outline" className="h-7 text-[11px] font-bold px-2 text-slate-600 border-slate-200 bg-slate-50/50 hover:bg-slate-100">
                        {copiedFormId === form.id ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-sm mt-6">
        <CardHeader className="bg-slate-50 border-b flex flex-row justify-between items-center p-4">
          <CardTitle className="text-sm font-bold flex items-center gap-2"><Users className="w-5 h-5 text-indigo-600" /> Processing Queue ({candidates.length})</CardTitle>
          <Button onClick={runBulkScanner} disabled={aiLoading || candidates.length === 0} className="bg-indigo-600 text-white font-bold h-9">Run Smart Parsing Run</Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50 sticky top-0">
              <TableRow>
                <TableHead className="font-bold">File Reference</TableHead>
                <TableHead className="font-bold">Candidate Name</TableHead>
                <TableHead className="font-bold">Match Score</TableHead>
                <TableHead className="font-bold w-[250px]">Extracted Skills Graph</TableHead>
                <TableHead className="font-bold">Missing Skills</TableHead>
                <TableHead className="font-bold">AI Decision</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {candidates.map((c, idx) => (
                <TableRow key={idx}>
                  <TableCell className="text-xs font-medium text-slate-600 truncate max-w-[150px]">{c.filename}</TableCell>
                  <TableCell className="text-xs font-bold text-slate-800">{c.candidateName || "--"}</TableCell>
                  <TableCell>{c.score ? <span className="text-xl font-black text-emerald-600">{c.score}%</span> : "--"}</TableCell>
                  <TableCell>
                    {c.skillsData && c.skillsData.length > 0 && (
                      <div className="h-10 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={c.skillsData} layout="vertical" margin={{left: -20}}>
                            <XAxis type="number" hide domain={[0, 100]} />
                            <YAxis dataKey="name" type="category" style={{fontSize: 9}} width={60} />
                            <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={8}>
                              {c.skillsData.map((_entry, subIdx) => (
                                <Cell key={`cell-${subIdx}`} fill={COLORS[subIdx % COLORS.length]} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-slate-600 truncate max-w-[150px]">{c.missingSkills || "--"}</TableCell>
                  <TableCell>{c.recommendation || "--"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}