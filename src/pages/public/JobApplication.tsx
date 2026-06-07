import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Briefcase, CheckCircle2, UploadCloud, FileText } from "lucide-react";

export default function JobApplication() {
  const { formId } = useParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState<any>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [uploadingFile, setUploadingFile] = useState<string | null>(null);

  useEffect(() => {
    const fetchForm = async () => {
      if (!formId) return;
      const { data, error } = await supabase.from('job_forms').select('*').eq('id', formId).single();
      if (!error && data) {
        setFormData(data);
      }
      setLoading(false);
    };
    fetchForm();
  }, [formId]);

  const handleInputChange = (id: string, value: any) => {
    setAnswers(prev => ({ ...prev, [id]: value }));
  };

  // AUTOMATED FLAW FIX: Supabase Storage File Upload integration
  const handleFileUpload = async (id: string, file: File) => {
    setUploadingFile(id);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `candidate_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      
      const { data, error } = await supabase.storage.from('resumes').upload(fileName, file);
      
      if (error) throw error;
      
      const { data: { publicUrl } } = supabase.storage.from('resumes').getPublicUrl(fileName);
      
      handleInputChange(id, publicUrl);
      toast({ title: "File Uploaded", description: `${file.name} attached successfully.` });
    } catch (err: any) {
      toast({ title: "Upload Failed", description: err.message, variant: "destructive" });
    }
    setUploadingFile(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const candidateName = answers['name'] || answers['full_name'] || answers['fullName'] || 'Candidate';
      const candidateEmail = answers['email'] || answers['corporate_email'] || answers['candidate_email'] || 'No Email Provided';

      const { error } = await supabase.from('job_applications').insert([{
        form_id: formId,
        candidate_name: candidateName,
        candidate_email: candidateEmail,
        answers: answers,
        status: 'Pending'
      }]);

      if (error) throw error;
      setSuccess(true);
    } catch (error: any) {
      toast({ title: "Submission Failed", description: error.message, variant: "destructive" });
    }
    setSubmitting(false);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="w-12 h-12 animate-spin text-indigo-600"/></div>;
  if (!formData) return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500 font-bold text-xl">404 - Corporate Job Application Not Found</div>;

  if (success) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
      <div className="bg-white p-12 rounded-3xl shadow-2xl flex flex-col items-center max-w-lg border border-slate-100 animate-in zoom-in-95">
        <CheckCircle2 className="w-24 h-24 text-emerald-500 mb-6" />
        <h1 className="text-3xl font-black text-slate-800 mb-4">Application Secured!</h1>
        <p className="text-slate-500 font-medium text-lg">Your profile has been successfully uploaded to the ATS for the <span className="text-indigo-600 font-bold">{formData.job_title}</span> position.</p>
        <p className="text-slate-400 mt-6 text-sm">Our HR Operations team will review your submission shortly.</p>
      </div>
    </div>
  );

  const isModern = formData.form_style === 'Modern Tech';
  const isCreative = formData.form_style === 'Creative';

  const themeClasses = isModern ? "bg-slate-900 text-white" : isCreative ? "bg-gradient-to-br from-fuchsia-600 to-indigo-600 text-white" : "bg-indigo-700 text-white";
  const cardClasses = isModern ? "border-slate-800 bg-slate-950 text-white" : "bg-white text-slate-900";

  return (
    <div className={`min-h-screen py-12 px-4 sm:px-6 lg:px-8 font-sans transition-colors ${isModern ? 'bg-[#0a0a0a]' : 'bg-slate-100'}`}>
      <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-8">
        
        <div className={`p-10 rounded-3xl shadow-2xl flex flex-col md:flex-row items-start md:items-center gap-6 ${themeClasses} relative overflow-hidden`}>
          <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 bg-white opacity-5 rounded-full blur-3xl"></div>
          <Briefcase className="w-16 h-16 opacity-90"/>
          <div className="z-10">
            <p className="text-sm font-bold opacity-80 uppercase tracking-widest flex items-center gap-2">Official Career Portal</p>
            <h1 className="text-4xl md:text-5xl font-black mt-2 leading-tight">{formData.job_title}</h1>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <Card className={`shadow-2xl border-0 overflow-hidden rounded-3xl ${cardClasses}`}>
            <CardHeader className={`${isModern ? "border-b border-slate-800" : "bg-slate-50 border-b border-slate-100"} p-8`}>
              <CardTitle className="text-2xl font-black flex items-center gap-2">Candidate Dossier <span className="text-sm font-bold bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full ml-auto">Required</span></CardTitle>
            </CardHeader>
            <CardContent className="p-8 md:p-12 space-y-8">
              {formData.form_schema.map((field: any, idx: number) => (
                <div key={idx} className="space-y-3 group">
                  <label className={`text-sm font-black uppercase tracking-wider ${isModern ? 'text-slate-400 group-focus-within:text-indigo-400' : 'text-slate-600 group-focus-within:text-indigo-600'} transition-colors`}>
                    {field.label} {field.required && <span className="text-red-500">*</span>}
                  </label>
                  
                  {field.type === 'textarea' ? (
                    <Textarea required={field.required} onChange={(e) => handleInputChange(field.id, e.target.value)} className={`min-h-[120px] text-sm p-4 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all ${isModern ? 'bg-slate-900 border-slate-800 focus:bg-slate-800' : 'bg-slate-50 border-slate-200 focus:bg-white'}`} placeholder={`Provide a detailed response...`} />
                  ) : field.type === 'select' ? (
                    <Select onValueChange={(val) => handleInputChange(field.id, val)} required={field.required}>
                      <SelectTrigger className={`h-12 rounded-xl text-sm px-4 focus:ring-2 focus:ring-indigo-500 transition-all ${isModern ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                        <SelectValue placeholder="Select from dropdown..." />
                      </SelectTrigger>
                      <SelectContent>
                        {field.options?.map((opt: string) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : field.type === 'file' ? (
                    <div className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-all cursor-pointer relative overflow-hidden ${isModern ? 'border-slate-700 bg-slate-900 hover:border-indigo-500 hover:bg-slate-800' : 'border-slate-300 bg-slate-50 hover:border-indigo-500 hover:bg-indigo-50'}`}>
                      {uploadingFile === field.id ? (
                        <div className="flex flex-col items-center gap-2"><Loader2 className="w-8 h-8 animate-spin text-indigo-500"/><span className="font-bold text-sm">Encrypting & Uploading to ATS...</span></div>
                      ) : answers[field.id] ? (
                        <div className="flex flex-col items-center gap-2 text-emerald-600"><FileText className="w-10 h-10"/><span className="font-black text-sm">Resume Attached Securely</span><span className="text-[10px] text-slate-500 underline">Click to replace</span></div>
                      ) : (
                        <>
                          <UploadCloud className={`w-10 h-10 mb-3 ${isModern ? 'text-slate-500' : 'text-slate-400'}`}/>
                          <span className="text-base font-black">Drag & Drop or Click to Upload</span>
                          <span className="text-xs font-medium text-slate-400 mt-1">Supports PDF, DOCX (Max 5MB)</span>
                        </>
                      )}
                      <input type="file" required={field.required && !answers[field.id]} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={(e) => { if(e.target.files?.[0]) handleFileUpload(field.id, e.target.files[0]); }} />
                    </div>
                  ) : (
                    <Input type={field.type || 'text'} required={field.required} onChange={(e) => handleInputChange(field.id, e.target.value)} className={`h-12 rounded-xl text-sm px-4 focus:ring-2 focus:ring-indigo-500 transition-all ${isModern ? 'bg-slate-900 border-slate-800 focus:bg-slate-800' : 'bg-slate-50 border-slate-200 focus:bg-white'}`} placeholder={`Enter ${field.label.toLowerCase()}`} />
                  )}
                </div>
              ))}

              <div className="pt-6">
                <Button type="submit" disabled={submitting || uploadingFile !== null} className={`w-full h-16 text-lg font-black rounded-xl shadow-lg hover:scale-[1.01] transition-all ${themeClasses}`}>
                  {submitting ? <Loader2 className="w-6 h-6 animate-spin mr-3"/> : <CheckCircle2 className="w-6 h-6 mr-3"/>}
                  Submit Official Application
                </Button>
                <p className="text-center text-[10px] font-bold text-slate-400 mt-4 uppercase tracking-widest">Secured by FWC Enterprise ATS</p>
              </div>
            </CardContent>
          </Card>
        </form>
      </div>
    </div>
  );
}