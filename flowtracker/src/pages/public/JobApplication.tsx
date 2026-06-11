import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ShieldCheck, FileText, UploadCloud, CheckCircle2, AlertCircle, User, Mail, Phone, Briefcase, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function JobApplication() {
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

  const handleFileChangeSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "File Size Restriction",
          description: "MNC Data Compliance: Maximum allowable size threshold for resume vectors is 10MB.",
          variant: "destructive"
        });
        return;
      }
      setResumeFile(file);
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
        description: "Please attach your official curriculum vitae file to satisfy eligibility parameters.",
        variant: "destructive"
      });
    }

    setSubmitting(true);
    toast({ title: "Processing Intake", description: "Invoking automated AI screening engine protocols..." });

    try {
      const cleanEmail = email.trim().toLowerCase();

      // 1. Resolve or provision master profile within public.candidates ledger
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

        // Check for pre-existing records to avoid pipeline duplicates
        const { data: existingApplication, error: appCheckErr } = await supabase
          .from("candidate_applications")
          .select("id, status")
          .eq("candidate_id", candidateRecordId)
          .eq("job_form_id", formMeta.id)
          .maybeSingle();

        if (appCheckErr) throw appCheckErr;

        if (existingApplication) {
          toast({
            title: "Application Already Exists",
            description: `MNC Guard: You have already logged a submission for this position vacancy. Current Status: [${existingApplication.status}].`,
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

      // 2. Stream binary document payload directly into public object storage buckets
      const fileExtension = resumeFile.name.split('.').pop();
      const storageFilePath = `${candidateRecordId}/${crypto.randomUUID()}.${fileExtension}`;
      
      const { error: uploadError } = await supabase.storage
        .from("resumes")
        .upload(storageFilePath, resumeFile, { cacheControl: '3600', upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("resumes")
        .getPublicUrl(storageFilePath);

      const computedResumePublicUrl = urlData.publicUrl;

      await supabase
        .from("candidates")
        .update({ resume_url: computedResumePublicUrl })
        .eq("id", candidateRecordId);

      // 3. PHASE 2 REALIZED: Invoke client-side HuggingFace proxy to compute structural matching score
      const hfToken = import.meta.env.VITE_HF_TOKEN;
      let calculatedAIScore = 60;
      let calculatedAIVerdict = "Pending human review parameters.";

      if (hfToken) {
        try {
          const targetJD = formMeta.jd_text || 'Corporate Requisition Role Profile';
          const prompt = `Act as an elite Corporate ATS evaluation processor. 
          Job Description: "${targetJD}"
          Candidate Questionnaire Answers: ${JSON.stringify(customAnswers)}
          Output STRICTLY a valid raw JSON object matching this structure (no markdown wrapper backticks): {"score": 85, "verdict": "Candidate displays adequate domain alignment."}`;

          const response = await fetch("https://router.huggingface.co/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${hfToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "Qwen/Qwen3-32B:groq",
              messages: [{ role: "user", content: prompt }],
              temperature: 0.1
            })
          });

          if (response.ok) {
            const resData = await response.json();
            let cleanText = resData.choices?.[0]?.message?.content || "{}";
            cleanText = cleanText.replace(/```json/gi, "").replace(/```/g, "").trim();
            const parsed = JSON.parse(cleanText);
            calculatedAIScore = Math.max(0, Math.min(100, Number(parsed.score || 60)));
            calculatedAIVerdict = parsed.verdict || calculatedAIVerdict;
          }
        } catch (aiExc) {
          console.warn("Background AI pre-screening exception bypassed safely:", aiExc);
        }
      }

      const passThresholdGated = calculatedAIScore >= 75;
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
          resume_url: computedResumePublicUrl,
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
              token: secureUUIDToken,
              status: "Active",
              expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
            }]);

          if (!tokenInsertErr) {
            tokenIssuedAlert = true;
            finalPipelineStatus = "Assessment Assigned";
            
            // Push direct candidate notification (Simulating automated outreach mailer dispatch)
            await supabase
              .from("candidate_notifications")
              .insert([{
                candidate_id: candidateRecordId,
                title: "Pre-Exam Invitation Granted",
                message: `Congratulations! Your screening index has passed our AI threshold score model criteria. Your unique access token is [ ${secureUUIDToken} ]. Navigate to the portal, input this hash string, and start your exam window within 48 hours.`
              }]);

            // Update primary job applications status row to match timeline change
            await supabase
              .from("job_applications")
              .update({ status: "Assessment Assigned" })
              .eq("id", applicationRow.id);
          }
        }
      }

      // 6. Push synchronized status record to candidate_applications master tracking boards
      const { error: trackingError } = await supabase
        .from("candidate_applications")
        .insert([{
          candidate_id: candidateRecordId,
          job_form_id: formMeta.id,
          job_application_id: applicationRow.id,
          status: finalPipelineStatus,
          ai_score: calculatedAIScore,
          interview_status: "Pending",
          offer_status: "Pending"
        }]);

      if (trackingError) throw trackingError;

      // Keep master candidate profile state synchronized
      await supabase
        .from("candidates")
        .update({ stage: finalPipelineStatus })
        .eq("id", candidateRecordId);

      setSubmissionComplete(true);
      toast({ title: "Dossier Transmitted", description: "Application files successfully written onto corporate ledgers." });
    } catch (err: any) {
      toast({
        title: "Submission Stream Failed",
        description: err.message || "An exception occurred during database updates.",
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
                    Dispatch Recruitment Dossier
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