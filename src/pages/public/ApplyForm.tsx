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
        .eq("status", "Active")
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        toast({ title: "Form Offline", description: "This application window has been concluded.", variant: "destructive" });
        return;
      }
      setFormMeta(data);
      
      // Initialize dynamic payload tracking fields dictionary
      const initialFields: Record<string, string> = {};
      if (Array.isArray(data.form_schema)) {
        data.form_schema.forEach((field: any) => {
          initialFields[field.id] = "";
        });
      }
      setFormData(initialFields);
    } catch (err: any) {
      console.error("Failed to query public job form schema blueprint layout:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (fieldId: string, value: string) => {
    setFormData(prev => ({ ...prev, [fieldId]: value }));
  };

  const submitApplicationTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formMeta || !id) return;
    setSubmitting(true);

    try {
      // Extract structural metrics from the dynamic payload matrix context dictionary safely
      const candidateFullName = formData["full_name"] || formData["Full Legal Name"] || Object.values(formData)[0] || "Anonymous Applicant";
      
      // Contextual token extraction wrappers
      const stringifiedPayloadContext = JSON.stringify(formData);
      const emailMatch = stringifiedPayloadContext.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
      const phoneMatch = stringifiedPayloadContext.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);

      const resolvedEmail = formData["email"] || formData["Corporate/Personal Email"] || emailMatch?.[0] || null;
      const resolvedPhone = formData["phone"] || phoneMatch?.[0] || null;

      // Multi-layer duplicate protection verification checks
      if (resolvedEmail) {
        const { data: existingRecord } = await supabase
          .from("candidates")
          .select("id")
          .eq("email", resolvedEmail)
          .limit(1)
          .maybeSingle();

        if (existingRecord) {
          toast({
            title: "Application Pending",
            description: "A profile matching these credentials is already registered in our active recruitment pipelines.",
            variant: "destructive"
          });
          setSubmitting(false);
          return;
        }
      }

      console.log("COMMITTING INBOUND APPLICANT ROW PARAMETERS SECURELY ONTO PUBLIC.CANDIDATES LEDGER:", candidateFullName);

      // Save application directly into the database candidatos tracking index
      const { error: insertError } = await supabase.from("candidates").insert([{
        full_name: candidateFullName,
        email: resolvedEmail,
        phone: resolvedPhone,
        stage: "Applied",
        resume_text: `[PUBLIC PORTAL INGESTION MATRIX]\nJob Requisition ID: ${id}\nForm Title: ${formMeta.job_title}\n\nCandidate Response Metrics Payload:\n${JSON.stringify(formData, null, 2)}`,
        recommendation: "Awaiting AI Screening Pass"
      }]);

      if (insertError) {
        console.error("MNC Data Transaction Aborted at execution path layout:", insertError);
        throw insertError;
      }

      console.log("INSERT SUCCESS");
      toast({ title: "Application Submitted", description: "Your profile was securely committed to the FWC India core recruitment vault." });
      setFormData({});
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
                    placeholder={`Provide response context for ${field.label}...`}
                    className="min-h-[100px] text-sm bg-slate-50/40 border-slate-200 focus-visible:ring-blue-500 focus-visible:ring-1"
                  />
                ) : (
                  <Input
                    type={field.type === "file" ? "text" : field.type || "text"}
                    required={field.required}
                    value={formData[field.id] || ""}
                    onChange={(e) => handleInputChange(field.id, e.target.value)}
                    placeholder={field.type === "file" ? "Paste text, resume URL, or qualifications context strings..." : `Enter ${field.label}...`}
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
              Submit Verified Application
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}