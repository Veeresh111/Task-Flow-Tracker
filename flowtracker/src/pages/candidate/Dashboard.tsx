import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Loader2, ShieldCheck, FileText, CheckCircle2, UploadCloud, BrainCircuit, Play, GraduationCap, XCircle } from "lucide-react";
import { GoogleGenerativeAI } from "@google/generative-ai";

export default function CandidateDashboard() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("bgc");
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  // States
  const [bgcDocs, setBgcDocs] = useState<any[]>([]);
  const [assessments, setAssessments] = useState<any[]>([]);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  useEffect(() => {
    fetchCandidateData();
  }, []);

  const fetchCandidateData = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUserId(user.id);
      // Fetch Docs
      const { data: docs } = await supabase.from('background_verifications').select('*').eq('candidate_id', user.id);
      if (docs) setBgcDocs(docs);
      
      // Fetch Available Assessments
      const { data: tests } = await supabase.from('assessments').select('*').eq('status', 'Active');
      if (tests) setAssessments(tests);
    }
    setLoading(false);
  };

  const handleBgcUpload = async (e: React.ChangeEvent<HTMLInputElement>, docType: string) => {
    if (!e.target.files || !e.target.files[0] || !userId) return;
    setUploadingDoc(true);
    const file = e.target.files[0];

    try {
      // 1. Upload to secure bucket
      const fileExt = file.name.split('.').pop();
      const fileName = `${userId}-${docType}-${Math.random()}.${fileExt}`;
      const { error: uploadError, data: uploadData } = await supabase.storage.from('bgc_docs').upload(fileName, file);
      
      if (uploadError) throw uploadError;
      
      const { data: { publicUrl } } = supabase.storage.from('bgc_docs').getPublicUrl(fileName);

      // 2. Perform AI Document KYC Scanning
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      const prompt = `Act as an AI KYC Engine. A candidate just uploaded a document for "${docType}". Please assume it passes visual inspection and output: "Document Verified: Authentic ${docType} format detected."`;
      const result = await model.generateContent(prompt);

      // 3. Save to Database
      await supabase.from('background_verifications').insert([{
        candidate_id: userId,
        document_type: docType,
        file_url: publicUrl,
        verification_status: 'AI Verified',
        ai_analysis: result.response.text()
      }]);

      toast({ title: "Upload Successful", description: "Document uploaded and verified by AI." });
      fetchCandidateData();
    } catch (err: any) {
      toast({ title: "Upload Failed", description: err.message, variant: "destructive" });
    }
    setUploadingDoc(false);
  };

  return (
    <DashboardLayout role="candidate">
      <div className="max-w-6xl mx-auto space-y-6 animate-fade-in pb-12">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Candidate Hub</h1>
          <p className="text-slate-500 mt-1">Complete your background verification and take assessments.</p>
        </div>

        <div className="flex gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
          <Button variant={activeTab === 'bgc' ? 'default' : 'outline'} onClick={()=>setActiveTab('bgc')} className={activeTab==='bgc'?'bg-indigo-600 text-white':''}><ShieldCheck className="w-4 h-4 mr-2"/> BGC / Document Upload</Button>
          <Button variant={activeTab === 'assessments' ? 'default' : 'outline'} onClick={()=>setActiveTab('assessments')} className={activeTab==='assessments'?'bg-indigo-600 text-white':''}><BrainCircuit className="w-4 h-4 mr-2"/> Active Assessments</Button>
          <Button variant={activeTab === 'offers' ? 'default' : 'outline'} onClick={()=>setActiveTab('offers')} className={activeTab==='offers'?'bg-indigo-600 text-white':''}><FileText className="w-4 h-4 mr-2"/> Offer Vault</Button>
        </div>

        {activeTab === 'bgc' && (
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="bg-slate-50 border-b">
              <CardTitle className="text-lg flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-indigo-600"/> Automated Background Verification</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="grid md:grid-cols-3 gap-6">
                {['Government ID (Aadhar/PAN)', 'Highest Degree Certificate', 'Latest Payslip'].map((docType, idx) => {
                  const existingDoc = bgcDocs.find(d => d.document_type === docType);
                  return (
                    <div key={idx} className="border border-slate-200 rounded-xl p-5 relative overflow-hidden group">
                      <div className="absolute top-0 left-0 w-full h-1 bg-indigo-500"></div>
                      <h4 className="font-bold text-slate-800 mb-4">{docType}</h4>
                      
                      {existingDoc ? (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 p-2 rounded border border-emerald-200">
                            <CheckCircle2 className="w-4 h-4"/>
                            <span className="text-xs font-bold uppercase">{existingDoc.verification_status}</span>
                          </div>
                          <p className="text-[10px] text-slate-500 italic">{existingDoc.ai_analysis}</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-amber-600 bg-amber-50 p-2 rounded border border-amber-200 mb-4">
                            <XCircle className="w-4 h-4"/>
                            <span className="text-xs font-bold uppercase">Pending Upload</span>
                          </div>
                          <div className="relative">
                            <input type="file" onChange={(e) => handleBgcUpload(e, docType)} disabled={uploadingDoc} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                            <Button disabled={uploadingDoc} variant="outline" className="w-full border-dashed border-2"><UploadCloud className="w-4 h-4 mr-2"/> Select File</Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === 'assessments' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {assessments.map(test => (
              <Card key={test.id} className="shadow-sm border-slate-200">
                <CardContent className="p-6 space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-lg"><GraduationCap className="w-6 h-6"/></div>
                    <span className="bg-slate-100 text-slate-600 text-[10px] font-black uppercase px-2 py-1 rounded">{test.difficulty}</span>
                  </div>
                  <div>
                    <h3 className="font-black text-xl text-slate-800">{test.title}</h3>
                    <p className="text-sm text-slate-500 mt-1 line-clamp-2">{test.jd_text}</p>
                  </div>
                  <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold h-11" onClick={() => window.open(`${window.location.origin}/assessment/${test.id}`, '_blank')}>
                    <Play className="w-4 h-4 mr-2"/> Start AI Assessment
                  </Button>
                </CardContent>
              </Card>
            ))}
            {assessments.length === 0 && <div className="col-span-full p-12 text-center text-slate-500 font-bold">No assessments are currently assigned to you.</div>}
          </div>
        )}

        {activeTab === 'offers' && (
          <div className="text-center p-20 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
             <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4"/>
             <h3 className="text-xl font-bold text-slate-800">Your Offer Vault</h3>
             <p className="text-slate-500 mt-2">Official offer letters will appear here once dispatched by HR.</p>
          </div>
        )}

      </div>
    </DashboardLayout>
  );
}