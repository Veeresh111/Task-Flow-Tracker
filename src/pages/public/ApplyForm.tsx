import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ShieldCheck, ClipboardCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function ApplyForm() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [formMeta, setFormMeta] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchFormConfiguration();
  }, [id]);

  const fetchFormConfiguration = async () => {
    if (!id) return;
    try {
      const { data, error } = await supabase
        .from("job_forms")
        .select("*")
        .eq("id", id)
        .eq("status", "Open")
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        toast({ title: "Form Offline", description: "This application window has been concluded.", variant: "destructive" });
        return;
      }
      setFormMeta(data);

      const initialFields: Record<string, string> = {};
      if (Array.isArray(data.form_schema)) {
        data.form_schema.forEach((field: any) => {
          initialFields[field.id] = "";
        });
      }
      setFormData(initialFields);
    } catch {
      toast({ title: "Load Failed", description: "Could not load the application form.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (fieldId: string, value: string) => {
    setFormData(prev => ({ ...prev, [fieldId]: value }));
  };

  const getFieldValue = (labels: string[]): string | undefined => {
    for (const key of Object.keys(formData)) {
      if (labels.some(l => key.toLowerCase().includes(l.toLowerCase()))) {
        return formData[key];
      }
    }
    return undefined;
  };

  const submitApplicationTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formMeta || !id) return;
    setSubmitting(true);

    try {
      const fullName = getFieldValue(["full_name", "full name", "name"]) || Object.values(formData)[0] || "Anonymous Applicant";
      const email = getFieldValue(["email", "email address", "e-mail"]) || null;
      const phone = getFieldValue(["phone", "phone number", "mobile", "contact"]) || null;

      // Check if candidate already applied to this specific job
      if (email) {
        const { data: existingCandidate } = await supabase
          .from("candidates")
          .select("id")
          .eq("email", email)
          .limit(1)
          .maybeSingle();

        if (existingCandidate) {
          const { data: existingApp } = await supabase
            .from("job_applications")
            .select("id")
            .eq("candidate_id", existingCandidate.id)
            .eq("form_id", id)
            .limit(1)
            .maybeSingle();

          if (existingApp) {
            toast({
              title: "Already Applied",
              description: "You have already submitted an application for this position.",
              variant: "destructive"
            });
            setSubmitting(false);
            return;
          }
        }

        // Create or reuse candidate record
        let candidateId = existingCandidate?.id;
        if (!candidateId) {
          const { data: newCandidate, error: candErr } = await supabase
            .from("candidates")
            .insert([{
              full_name: fullName,
              email,
              phone,
              stage: "Applied",
              recommendation: "Awaiting AI Screening"
            }])
            .select("id")
            .single();

          if (candErr) throw candErr;
          candidateId = newCandidate.id;
        }

        // Create job application (triggers sync to candidate_applications + candidates.stage)
        const { error: appErr } = await supabase
          .from("job_applications")
          .insert([{
            form_id: id,
            candidate_id: candidateId,
            candidate_name: fullName,
            candidate_email: email,
            status: "Applied",
            answers: formData
          }]);

        if (appErr) throw appErr;

        toast({ title: "Application Submitted", description: "Your application has been received successfully." });
        setFormData({});
        navigate("/candidate/notifications");
      } else {
        toast({ title: "Email Required", description: "Please provide an email address to submit your application.", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Submission Failed", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50/50">
        <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!formMeta) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
        <ShieldCheck className="w-16 h-16 text-slate-300 mb-2" />
        <h2 className="text-xl font-black text-slate-800">404 - Recruitment Window Closed</h2>
        <p className="text-sm text-slate-500 max-w-sm mt-1">This specific workflow form token reference matrix could not be resolved or is flagged as inactive.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50 py-12 px-4 sm:px-6 lg:px-8">
      <Card className="max-w-xl mx-auto shadow-xl border-slate-200 overflow-hidden bg-white rounded-xl">
        <div className="bg-slate-900 p-6 text-white border-b border-slate-800">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6 text-blue-400" />
            <h1 className="text-xl font-black tracking-tight">FWC India Careers</h1>
          </div>
          <p className="text-xs text-slate-400 font-medium mt-1">Official Candidate Entry Form Portal • Requisition: {formMeta.job_title}</p>
        </div>

        <CardContent className="p-8">
          <form onSubmit={submitApplicationTransaction} className="space-y-5">
            {Array.isArray(formMeta.form_schema) && formMeta.form_schema.map((field: any) => (
              <div key={field.id} className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block uppercase tracking-wide">
                  {field.label} {field.required && <span className="text-rose-500 font-bold">*</span>}
                </label>

                {field.type === "textarea" ? (
                  <Textarea
                    required={field.required}
                    value={formData[field.id] || ""}
                    onChange={(e) => handleInputChange(field.id, e.target.value)}
                    placeholder={`Enter ${field.label}...`}
                    className="min-h-[100px] text-sm bg-slate-50/40 border-slate-200 focus-visible:ring-blue-500 focus-visible:ring-1"
                  />
                ) : field.type === "file" ? (
                  <Input
                    type="text"
                    value={formData[field.id] || ""}
                    onChange={(e) => handleInputChange(field.id, e.target.value)}
                    placeholder="Paste a link to your document or file..."
                    className="h-10 text-sm bg-slate-50/40 border-slate-200 focus-visible:ring-blue-500 focus-visible:ring-1"
                  />
                ) : (
                  <Input
                    type={field.type || "text"}
                    required={field.required}
                    value={formData[field.id] || ""}
                    onChange={(e) => handleInputChange(field.id, e.target.value)}
                    placeholder={`Enter ${field.label}...`}
                    className="h-10 text-sm bg-slate-50/40 border-slate-200 focus-visible:ring-blue-500 focus-visible:ring-1"
                  />
                )}
              </div>
            ))}

            <Button
              type="submit"
              disabled={submitting}
              className="w-full bg-blue-600 hover:bg-blue-700 font-bold text-white h-11 text-sm shadow-md mt-4 rounded-lg"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
              Submit Application
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
