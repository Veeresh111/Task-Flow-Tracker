import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { VectorMath } from "@/lib/dsa/VectorMath";
import { notificationService } from "@/lib/notifications";

export default function JobApplication() {
  useEffect(() => { document.title = "Apply - FWC"; }, []);
  const { formId } = useParams<{ formId: string }>();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Lifecycle & Form Metadata States
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formMeta, setFormMeta] = useState<any>(null);
  const [filteredSchema, setFilteredSchema] = useState<any[]>([]);
  const [submissionComplete, setSubmissionComplete] = useState(false);

  // Core Applicant Information Inputs
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [experienceYears, setExperienceYears] = useState("");
  
  // Custom Dynamic Structural Questionnaire Fields Answer Map
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>({});
  
  // Resume Upload Document Reference Node
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeParsedText, setResumeParsedText] = useState("");

  useEffect(() => {
    fetchJobFormMetadata();
  }, [formId]);

  const fetchJobFormMetadata = async () => {
    if (!formId) return;
    try {
      const { data, error } = await supabase
        .from("job_forms")
        .select("*")
        .eq("id", formId)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        toast({
          title: "Form Unavailable",
          description: "The requested job requisition application link has been deactivated or removed.",
          variant: "destructive"
        });
        return;
      }
      setFormMeta(data);

      let questionsList: any[] = [];
      if (data.form_schema) {
        try {
          questionsList = typeof data.form_schema === "string" 
            ? JSON.parse(data.form_schema) 
            : data.form_schema;
        } catch (e) {
          console.error("Schema parse exception:", e);
          questionsList = [];
        }
      }

      const verifiedQuestions = Array.isArray(questionsList) ? questionsList : [];
      
      // Filter out standard baseline keys from the dynamic loop using field.id strings
      const isolatedSchema = verifiedQuestions.filter((field: any) => {
        const fieldKey = String(field.id || field.label || "").toLowerCase().trim();
        return !["full_name", "full name", "email", "email address", "phone", "phone number", "experience_years", "experience"].includes(fieldKey);
      });

      setFilteredSchema(isolatedSchema);

      // Pre-map storage keys directly using field.id to protect against label changes breaking historical indices
      const preMappedAnswers: Record<string, string> = {};
      isolatedSchema.forEach((q: any, idx: number) => {
        const questionKey = q.id || `custom_field_${idx + 1}`;
        preMappedAnswers[questionKey] = "";
      });
      setCustomAnswers(preMappedAnswers);

    } catch (err: any) {
      console.error("Failed to fetch public job application form requirements:", err);
    } finally {
      setLoading(false);
    }
  };

  const extractResumeTextFromFile = async (file: File): Promise<string> => {
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
    return await file.text();
  };

  const handleFileChangeSelection = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "File Size Restriction",
          description: "File size must not exceed 10MB.",
          variant: "destructive"
        });
        return;
      }
      setResumeFile(file);
      try {
        const extractedText = await extractResumeTextFromFile(file);
        setResumeParsedText(extractedText);
      } catch (parseErr) {
        console.error("Resume text extraction failed:", parseErr);
        toast({
          title: "Resume Parsing Notice",
          description: "Could not extract text from this file format. The system will evaluate based on form answers only.",
        });
      }
    }
  };

  const handleCustomAnswerChange = (questionKey: string, value: string) => {
    setCustomAnswers(prev => ({ ...prev, [questionKey]: value }));
  };

  const handleFormSubmissionPipeline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formMeta || submitting) return;

    if (!resumeFile) {
      return toast({
        title: "Resume Required",
        description: "Please attach your resume to continue with your application.",
        variant: "destructive"
      });
    }

    setSubmitting(true);
    toast({ title: "Processing Application", description: "Reviewing your application. Please wait..." });

    try {
      const cleanEmail = email.trim().toLowerCase();

      // 1. Resolve or provision master record within public.candidates ledger
      let candidateRecordId = null;
      const { data: existingCandidate, error: matchErr } = await supabase
        .from("candidates")
        .select("id")
        .eq("email", cleanEmail)
        .maybeSingle();

      if (matchErr) throw matchErr;

      if (!existingCandidate) {
        const { data: newCand, error: createErr } = await supabase
          .from("candidates")
          .insert([{
            full_name: fullName.trim(),
            email: cleanEmail,
            phone: phone.trim(),
            experience_years: Number(experienceYears) || 0,
            stage: "Screening"
          }])
          .select("id")
          .single();

        if (createErr) throw createErr;
        candidateRecordId = newCand.id;
      } else {
        candidateRecordId = existingCandidate.id;

        // Check for pre-existing applications to avoid pipeline duplicates
        // Use job_applications (authoritative source) for duplicate detection
        const { data: existingJobApp, error: jobAppCheckErr } = await supabase
          .from("job_applications")
          .select("id, status")
          .eq("candidate_id", candidateRecordId)
          .eq("form_id", formMeta.id)
          .maybeSingle();

        if (jobAppCheckErr) throw jobAppCheckErr;

        if (existingJobApp) {
          toast({
            title: "Application Already Submitted",
            description: `You have already applied for this position. Current status: ${existingJobApp.status}.`,
            variant: "destructive"
          });
          setSubmitting(false);
          return;
        }

        await supabase
          .from("candidates")
          .update({ experience_years: Number(experienceYears) || 0, stage: "Screening" })
          .eq("id", candidateRecordId);
      }

      // DI-1 FIX: Link profiles to candidates — if a registered user with this email exists, set their candidate_id
      const { data: matchingProfile } = await supabase
        .from("profiles")
        .select("id, candidate_id")
        .eq("email", cleanEmail)
        .maybeSingle();

      if (matchingProfile && !matchingProfile.candidate_id) {
        await supabase
          .from("profiles")
          .update({ candidate_id: candidateRecordId })
          .eq("id", matchingProfile.id);
      }

      // 2. Stream binary document payload directly into public object storage buckets
      const fileExtension = resumeFile.name.split('.').pop();
      const storageFilePath = `${candidateRecordId}/${crypto.randomUUID()}.${fileExtension}`;
      
      let computedResumeUrl = '';
      const { error: uploadError } = await supabase.storage
        .from("resumes")
        .upload(storageFilePath, resumeFile, { cacheControl: '3600', upsert: true });

      if (uploadError) {
        console.error("Resume upload failed (non-fatal):", uploadError.message);
      } else {
        const { data: urlData } = await supabase.storage
          .from("resumes")
          .createSignedUrl(storageFilePath, 86400);
        computedResumeUrl = urlData?.signedUrl || '';
      }

      await supabase
        .from("candidates")
        .update({ resume_url: computedResumeUrl })
        .eq("id", candidateRecordId);

      // 3. ATS SCREENING via secure edge function (no HF_TOKEN exposed client-side)
      let calculatedAIScore: number | null = null;
      let calculatedAIVerdict = "Pending human review";

      try {
        const targetJD = formMeta.jd_text || 'Corporate Requisition Role Profile';
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ats-screen`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
          body: JSON.stringify({
            jobDescription: targetJD,
            answers: customAnswers,
            resumeText: resumeParsedText || ""
          }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          const parsed = await response.json();
          calculatedAIScore = Math.max(0, Math.min(100, Number(parsed.score || 0)));
          calculatedAIVerdict = parsed.verdict || calculatedAIVerdict;
        } else {
          const dsaScore = VectorMath.computeCandidateMatchScore(resumeParsedText || "", targetJD);
          calculatedAIScore = dsaScore.overallScore;
          calculatedAIVerdict = `Automated vector analysis: ${dsaScore.overallScore}% compatibility with required requisition parameters.`;
        }
      } catch (aiExc) {
        console.error("AI pre-screening failed, engaging VectorMath engine:", aiExc);
        const targetJD = formMeta.jd_text || 'Corporate Requisition Role Profile';
        const dsaScore = VectorMath.computeCandidateMatchScore(resumeParsedText || "", targetJD);
        calculatedAIScore = dsaScore.overallScore;
        calculatedAIVerdict = `Automated vector analysis: ${dsaScore.overallScore}% compatibility with required requisition parameters.`;
      }

      const passThresholdGated = calculatedAIScore !== null && calculatedAIScore >= 75;
      const initialStatusValue = passThresholdGated ? "Shortlisted" : "Screening";

      // 4. Commit application payload cleanly to public.job_applications single source of truth
      const { data: applicationRow, error: applicationErr } = await supabase
        .from("job_applications")
        .insert([{
          form_id: formMeta.id,
          candidate_id: candidateRecordId,
          candidate_name: fullName.trim(),
          candidate_email: cleanEmail,
          answers: customAnswers,
          resume_url: computedResumeUrl,
          parsed_resume_text: resumeParsedText || null,
          match_score: calculatedAIScore,
          ai_verdict: calculatedAIVerdict,
          status: initialStatusValue
        }])
        .select()
        .single();

      if (applicationErr) throw applicationErr;

      // 5. PHASE 3 REALIZED: Dynamic screening invitation workflow validation logic
      let tokenIssuedAlert = false;
      let finalPipelineStatus = initialStatusValue;

      if (formMeta.requires_assessment && passThresholdGated) {
        const { data: targetAssessment } = await supabase
          .from("assessments")
          .select("id")
          .eq("job_form_id", formMeta.id)
          .eq("status", "Active")
          .limit(1)
          .maybeSingle();

        if (targetAssessment) {
          const secureUUIDToken = crypto.randomUUID();
          
          // Commit token invite to assessment_tokens with a 48-hour expiration window
          const { error: tokenInsertErr } = await supabase
            .from("assessment_tokens")
            .insert([{
              assessment_id: targetAssessment.id,
              candidate_id: candidateRecordId,
              application_id: applicationRow.id,
              token: secureUUIDToken,
              status: "Active",
              used: false,
              expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
            }]);

          if (!tokenInsertErr) {
            tokenIssuedAlert = true;
            finalPipelineStatus = "Assessment Assigned";
            
            // Push direct candidate notification with deep link
            await notificationService.sendToCandidate(candidateRecordId, {
              title: "Pre-Exam Assessment Granted",
              message: `Congratulations! Your screening index has passed our AI threshold criteria. Your unique access token is [ ${secureUUIDToken} ]. Start your exam window within 48 hours.`,
              type: "assessment",
              link: `/assessment/${secureUUIDToken}`
            });

            // Notify HR & Admin team about new shortlisted candidate
            await notificationService.sendToRole(['hr', 'admin'], {
              title: "Candidate Auto-Shortlisted",
              message: `${fullName.trim()} has applied & auto-shortlisted for ${formMeta.job_title} (ATS Score: ${calculatedAIScore || 'N/A'}%). Assessment token auto-assigned.`,
              type: "recruitment",
              link: "/hr/recruitment"
            });

            // Update primary job applications status row to match timeline change
            await supabase
              .from("job_applications")
              .update({ status: "Assessment Assigned" })
              .eq("id", applicationRow.id);
          } else {
            // Standard application notification to HR/Admin
            await notificationService.sendToRole(['hr', 'admin'], {
              title: "New Job Application Received",
              message: `${fullName.trim()} applied for ${formMeta.job_title} (ATS Score: ${calculatedAIScore || 'N/A'}%). Review in Recruitment Pipeline.`,
              type: "recruitment",
              link: "/hr/recruitment"
            });
          }
        }
      }

      // Notify HR team about new application submission
      try {
        const { data: hrUsers } = await supabase
          .from('profiles')
          .select('id')
          .eq('role', 'hr');
        if (hrUsers && hrUsers.length > 0) {
          const hrNotifications = hrUsers.map((hr: any) => ({
            user_id: hr.id,
            title: "New Application Received",
            message: `${fullName.trim()} has applied for ${formMeta.job_title}. ATS Score: ${calculatedAIScore !== null ? calculatedAIScore + '%' : 'Pending'}. Status: ${finalPipelineStatus}.`,
            is_read: false,
            created_at: new Date().toISOString()
          }));
          await supabase.from('notifications').insert(hrNotifications);
        }
      } catch (hrNotifErr) {
        console.error("HR notification error:", hrNotifErr);
      }

      // Stage sync handled automatically by DB trigger trg_job_applications_sync_stage
      setSubmissionComplete(true);
      toast({ title: "Application Submitted", description: "Your application has been submitted successfully." });
    } catch (err: any) {
      toast({
        title: "Submission Failed",
        description: "Could not submit your application. Please try again.",
        variant: "destructive"
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!formMeta) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50/50">
        <Card className="max-w-md mx-auto shadow-xl border-slate-200 bg-white overflow-hidden text-center rounded-xl">
          <div className="bg-amber-600 p-8 text-white">
            <AlertCircle className="w-16 h-16 mx-auto mb-2" />
            <h1 className="text-xl font-black tracking-tight uppercase">Form Unavailable</h1>
          </div>
          <CardContent className="p-6 pt-8 space-y-4">
            <p className="text-sm text-slate-600 leading-relaxed">
              The requested job requisition application link has been deactivated or removed.
            </p>
            <Button onClick={() => navigate("/login")} variant="outline" className="h-10 text-xs font-bold w-full max-w-xs">
              Return to Careers Portal
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50 py-12 px-4 sm:px-6 lg:px-8 font-sans">
      {!submissionComplete ? (
        <div className="max-w-3xl mx-auto grid md:grid-cols-3 gap-6 animate-fade-in items-start">
          
          <div className="md:col-span-1 space-y-4">
            <Card className="border-slate-200 bg-white shadow-md rounded-xl overflow-hidden">
              <div className="bg-slate-900 p-4 text-white">
                <span className="bg-indigo-600 text-[9px] font-black uppercase px-2 py-0.5 rounded tracking-wider">FWC India Vacancy</span>
                <h2 className="text-sm font-black tracking-tight mt-1">{formMeta.job_title}</h2>
              </div>
              <CardContent className="p-4 text-xs font-medium text-slate-500 leading-relaxed text-justify max-h-[300px] overflow-y-auto">
                <p className="font-bold text-slate-700 uppercase tracking-wider mb-1.5 text-[10px]">Position Overview:</p>
                {formMeta.jd_text || "No public overview attached to this portal node definition."}
              </CardContent>
            </Card>
          </div>

          <div className="md:col-span-2">
            <Card className="shadow-xl border-slate-200 bg-white rounded-xl overflow-hidden">
              <div className="border-b bg-slate-50 p-4">
                <h1 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2"><FileText className="w-4 h-4 text-indigo-600"/> Candidate Intake Form</h1>
              </div>
              <CardContent className="p-6">
                <form onSubmit={handleFormSubmissionPipeline} className="space-y-5">
                  
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black tracking-wider text-slate-500 uppercase flex items-center gap-1"><User className="w-3 h-3"/> Full Legal Name</label>
                      <Input required type="text" placeholder="John Smith" value={fullName} onChange={e => setFullName(e.target.value)} className="h-10 text-sm border-slate-200 focus-visible:ring-indigo-500" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black tracking-wider text-slate-500 uppercase flex items-center gap-1"><Mail className="w-3 h-3"/> Email Address</label>
                      <Input required type="email" placeholder="john.smith@example.com" value={email} onChange={e => setEmail(e.target.value)} className="h-10 text-sm border-slate-200 focus-visible:ring-indigo-500" />
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black tracking-wider text-slate-500 uppercase flex items-center gap-1"><Phone className="w-3 h-3"/> Contact Phone Number</label>
                      <Input required type="tel" placeholder="+91 98765 43210" value={phone} onChange={e => setPhone(e.target.value)} className="h-10 text-sm border-slate-200 focus-visible:ring-indigo-500" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black tracking-wider text-slate-500 uppercase flex items-center gap-1"><Briefcase className="w-3 h-3"/> Total Experience (Years)</label>
                      <Input required type="number" min="0" max="50" placeholder="5" value={experienceYears} onChange={e => setExperienceYears(e.target.value)} className="h-10 text-sm border-slate-200 focus-visible:ring-indigo-500" />
                    </div>
                  </div>

                  {filteredSchema.length > 0 && (
                    <div className="space-y-4 pt-2 border-t border-slate-100">
                      <h3 className="text-[10px] font-black text-indigo-600 uppercase tracking-wider">Position Custom Metrics Questionnaire</h3>
                      {filteredSchema.map((q: any, idx: number) => {
                        const questionKey = q.id || `custom_field_${idx + 1}`;
                        const questionLabel = q.label || q.question || questionKey;
                        return (
                          <div key={idx} className="space-y-1">
                            <label className="text-[10px] font-black text-slate-700 leading-normal block">{questionLabel}</label>
                            <Textarea required placeholder="Provide comprehensive response context..." className="min-h-[80px] text-xs leading-relaxed border-slate-200 bg-slate-50/30 p-2.5 resize-none" value={customAnswers[questionKey] || ""} onChange={e => handleCustomAnswerChange(questionKey, e.target.value)} />
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="space-y-1.5 pt-2 border-t border-slate-100">
                    <label className="text-[10px] font-black tracking-wider text-slate-500 uppercase">Curriculum Vitae Document File (PDF / DOCX)</label>
                    <div className="border-2 border-dashed border-slate-200 hover:border-indigo-500 transition-colors bg-slate-50/50 rounded-xl p-6 relative flex flex-col items-center justify-center text-center group">
                      <input type="file" required accept=".pdf,.docx,.doc" onChange={handleFileChangeSelection} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                      <UploadCloud className="w-10 h-10 text-slate-400 group-hover:text-indigo-600 transition-colors mb-2" />
                      {resumeFile ? (
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-slate-800 truncate max-w-xs">{resumeFile.name}</p>
                          <p className="text-[10px] font-mono text-indigo-600">{(resumeFile.size / (1024 * 1024)).toFixed(2)} MB • File Payload Locked</p>
                        </div>
                      ) : (
                        <div>
                          <p className="text-xs font-bold text-slate-700">Click or drag your CV document here to attach</p>
                          <p className="text-[10px] text-slate-400 font-medium mt-0.5">Supports layout sizes up to 10MB</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <Button type="submit" disabled={submitting} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs uppercase tracking-widest h-12 shadow-lg rounded-xl mt-4">
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
                    Submit Application
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

        </div>
      ) : (
        <Card className="max-w-md mx-auto shadow-2xl border-slate-200 bg-white overflow-hidden text-center rounded-xl animate-scale-in">
          <div className="bg-emerald-600 p-8 text-white">
            <CheckCircle2 className="w-16 h-16 mx-auto mb-2" />
            <h1 className="text-xl font-black tracking-tight uppercase">Dossier Transmitted</h1>
            <p className="text-xs text-white/80 font-medium mt-1">Information stream safely securely persisted to corporate logs.</p>
          </div>
          <CardContent className="p-6 pt-8 space-y-4">
            <div className="bg-slate-50 border p-4 rounded-xl text-left flex gap-3 items-start max-w-sm mx-auto">
              <Sparkles className="w-5 h-5 text-indigo-600 mt-0.5 shrink-0 animate-pulse" />
              <div>
                <p className="text-[11px] font-black text-slate-400 uppercase">Automated ATS Screening Notice</p>
                <p className="text-xs font-medium text-slate-600 leading-relaxed mt-1">Your intake responses are currently being evaluated by our AI pre-screening matrix layers. If your objective match score meets our technical criteria threshold, an **Individualized Examination Token link** will be dispatched to your email notifications directory shortly.</p>
              </div>
            </div>
            <Button onClick={() => navigate("/login")} variant="outline" className="h-10 text-xs font-bold w-full max-w-xs mt-2">Return to Careers Portal</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}