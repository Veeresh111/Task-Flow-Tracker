import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Loader2, ShieldCheck, FileText, CheckCircle2, UploadCloud, BrainCircuit, Play, GraduationCap, XCircle, Eye, Briefcase, Check, AlertTriangle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { OfferLetter } from "@/types";

export default function CandidateDashboard() {
  useEffect(() => { document.title = "Candidate Dashboard - TaskFlow"; }, []);
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("bgc");
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>('candidate');

  // States
  const [bgcDocs, setBgcDocs] = useState<any[]>([]);
  const [allCandidatesDocs, setAllCandidatesDocs] = useState<any[]>([]);
  const [assessments, setAssessments] = useState<any[]>([]);
  const [offers, setOffers] = useState<OfferLetter[]>([]);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [respondingOfferId, setRespondingOfferId] = useState<string | null>(null);

  useEffect(() => {
    fetchCandidateData();
  }, []);

  const fetchCandidateData = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUserId(user.id);
      
      // Determine Role
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      const currentRole = profile?.role?.toLowerCase() || 'candidate';
      setUserRole(currentRole);

      // Fetch Docs based on Role (Candidate sees own, HR sees all)
      if (currentRole === 'hr' || currentRole === 'admin') {
        const { data: allDocs } = await supabase
          .from('background_verifications')
          .select('*, profiles(name)')
          .order('uploaded_at', { ascending: false });

        if (allDocs) setAllCandidatesDocs(allDocs);
      } else {
        const { data: myDocs } = await supabase.from('background_verifications').select('*').eq('candidate_id', user.id);
        if (myDocs) setBgcDocs(myDocs);
      }
      
      // Fetch assessments assigned to this candidate via tokens
      const { data: apps } = await supabase
        .from('job_applications')
        .select('id')
        .eq('candidate_id', user.id);

      if (apps && apps.length > 0) {
        const appIds = apps.map(a => a.id);
        const { data: myTokens } = await supabase
          .from('assessment_tokens')
          .select('assessment_id')
          .in('application_id', appIds)
          .not('assessment_id', 'is', null);

        if (myTokens && myTokens.length > 0) {
          const assessmentIds = [...new Set(myTokens.map(t => t.assessment_id))];
          const { data: myAssessments } = await supabase
            .from('assessments')
            .select('*')
            .in('id', assessmentIds);
          if (myAssessments) setAssessments(myAssessments);
        }
      }

      // Fetch offer letters for this candidate
      const { data: myOffers } = await supabase
        .from('offer_letters')
        .select('*')
        .eq('candidate_id', user.id)
        .order('created_at', { ascending: false });
      if (myOffers && myOffers.length > 0) {
        const formIds = [...new Set(myOffers.map(o => o.job_form_id).filter(Boolean))];
        if (formIds.length > 0) {
          const { data: forms } = await supabase
            .from('job_forms')
            .select('id, job_title')
            .in('id', formIds);
          const formsMap = new Map((forms || []).map(f => [f.id, f]));
          setOffers(myOffers.map(o => ({ ...o, job_forms: formsMap.get(o.job_form_id) || { job_title: '' } })));
        } else {
          setOffers(myOffers);
        }
      } else {
        setOffers(myOffers || []);
      }
    }
    setLoading(false);
  };

  const handleBgcUpload = async (e: React.ChangeEvent<HTMLInputElement>, docType: string) => {
    if (!e.target.files || !e.target.files[0]) return;
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({ title: "Session Expired", description: "Please re-authenticate to upload records.", variant: "destructive" });
      return;
    }
    
    setUploadingDoc(true);
    const file = e.target.files[0];

    try {
      // 1. Upload to secure bucket
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}-${docType.replace(/\s+/g, '')}-${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('bgc_docs').upload(fileName, file, { upsert: true });
      
      if (uploadError) throw uploadError;
      
      // 2. Store record — no AI auto-approval. HR will manually verify.
      const { data: existingDoc } = await supabase.from('background_verifications').select('id').eq('candidate_id', user.id).eq('document_type', docType).maybeSingle();

      const { data: { publicUrl } } = supabase.storage.from('bgc_docs').getPublicUrl(fileName);

      if (existingDoc) {
        const { error: updateError } = await supabase.from('background_verifications').update({
          status: 'Submitted',
          file_url: publicUrl,
          remarks: 'Pending manual verification by HR.'
        }).eq('id', existingDoc.id);
        
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('background_verifications')
          .insert([{
            candidate_id: user.id,
            document_type: docType,
            file_url: publicUrl,
            status: 'Submitted',
            remarks: 'Pending manual verification by HR.'
          }]);

        if (insertError) {
          console.error("INSERT ERROR:", insertError);
          throw insertError;
        }
      }

      toast({ title: "Upload Successful", description: "Document submitted for HR verification." });
      fetchCandidateData();
    } catch (err: any) {
      toast({ title: "Upload Failed", description: err.message, variant: "destructive" });
    }
    setUploadingDoc(false);
  };

  const handleOfferResponse = async (offerId: string, action: 'accepted' | 'declined') => {
    setRespondingOfferId(offerId);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/respond-offer`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({ offerId, action })
        }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to process offer response");
      toast({
        title: action === 'accepted' ? "Offer Accepted" : "Offer Declined",
        description: action === 'accepted'
          ? "Congratulations! Your acceptance has been recorded. HR will contact you for onboarding."
          : "Your decision has been recorded. You can revisit offers in your vault.",
      });
      fetchCandidateData();
    } catch (err: any) {
      toast({ title: "Response Failed", description: err.message, variant: "destructive" });
    }
    setRespondingOfferId(null);
  };

  return (
    <DashboardLayout role={userRole}>
      <div className="max-w-6xl mx-auto space-y-6 animate-fade-in pb-12">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            {userRole === 'hr' || userRole === 'admin' ? "BGC Verification Center" : "Candidate Hub"}
          </h1>
          <p className="text-slate-500 mt-1">
            {userRole === 'hr' || userRole === 'admin' ? "Review and verify uploaded candidate documents." : "Complete your background verification and take assessments."}
          </p>
        </div>

        {/* HR VIEW: Candidate Verification Queue */}
        {(userRole === 'hr' || userRole === 'admin') ? (
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="bg-slate-50 border-b">
              <CardTitle className="text-lg flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-indigo-600"/> Candidate Document Queue</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-bold">Candidate Name</TableHead>
                    <TableHead className="font-bold">Document Type</TableHead>
                    <TableHead className="font-bold">AI Status</TableHead>
                    <TableHead className="font-bold text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allCandidatesDocs.map((doc: any) => (
                    <TableRow key={doc.id}>
                      <TableCell className="font-medium text-slate-800">{doc.profiles?.name || 'Unknown Candidate'}</TableCell>
                      <TableCell className="text-slate-600">{doc.document_type}</TableCell>
                      <TableCell>
                        <span className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded text-xs font-bold border border-emerald-200">
                          {doc.status || 'Submitted'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => window.open(doc.file_url, '_blank')} className="text-blue-600 border-blue-200 hover:bg-blue-50">
                          <Eye className="w-4 h-4 mr-2"/> View Document
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {allCandidatesDocs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center p-8 text-slate-500">No candidate documents pending verification.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : (
          /* CANDIDATE VIEW: Uploads & Assessments */
          <>
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
                        <div key={idx} className="border border-slate-200 rounded-xl p-5 relative overflow-hidden group bg-white shadow-sm">
                          <div className="absolute top-0 left-0 w-full h-1 bg-indigo-500"></div>
                          <h4 className="font-bold text-slate-800 mb-4">{docType}</h4>
                          
                          {existingDoc ? (
                            <div className="space-y-3">
                              <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 p-2 rounded border border-emerald-200">
                                <CheckCircle2 className="w-4 h-4"/>
                                <span className="text-xs font-bold uppercase">{existingDoc.status || 'Submitted'}</span>
                              </div>
                              <p className="text-[10px] text-slate-500 italic">{existingDoc.remarks || 'No remarks available.'}</p>
                              <div className="relative mt-2">
                                <input type="file" onChange={(e) => handleBgcUpload(e, docType)} disabled={uploadingDoc} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                                <Button disabled={uploadingDoc} variant="outline" size="sm" className="w-full text-xs">Update Document</Button>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <div className="flex items-center gap-2 text-amber-600 bg-amber-50 p-2 rounded border border-amber-200 mb-4">
                                <XCircle className="w-4 h-4"/>
                                <span className="text-xs font-bold uppercase">Pending Upload</span>
                              </div>
                              <div className="relative">
                                <input type="file" onChange={(e) => handleBgcUpload(e, docType)} disabled={uploadingDoc} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                                <Button disabled={uploadingDoc} variant="outline" className="w-full border-dashed border-2"><UploadCloud className="w-4 h-4 mr-2"/> {uploadingDoc ? 'Uploading...' : 'Select File'}</Button>
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
              <div className="space-y-4">
                {offers.length === 0 ? (
                  <div className="text-center p-20 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
                    <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4"/>
                    <h3 className="text-xl font-bold text-slate-800">Your Offer Vault</h3>
                    <p className="text-slate-500 mt-2">Official offer letters will appear here once dispatched by HR.</p>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {offers.map(offer => (
                      <Card key={offer.id} className="border-slate-200 shadow-sm">
                        <CardContent className="p-5 flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-lg">
                              <Briefcase className="w-5 h-5" />
                            </div>
                            <div>
                              <h4 className="font-bold text-slate-800">{offer.job_forms?.job_title || 'Position'}</h4>
                              <p className="text-xs text-slate-500 mt-0.5">
                                Status: <span className="font-semibold">{offer.status}</span>
                                {offer.offered_ctc && ` • CTC: ₹${Number(offer.offered_ctc).toLocaleString('en-IN')}`}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {offer.offer_letter_url && (
                              <Button variant="outline" size="sm" onClick={() => window.open(offer.offer_letter_url, '_blank')}>
                                <Eye className="w-4 h-4 mr-1" /> View
                              </Button>
                            )}
                            {offer.status === 'Sent' && (
                              <>
                                <Button
                                  size="sm"
                                  disabled={respondingOfferId === offer.id}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                  onClick={() => handleOfferResponse(offer.id, 'accepted')}
                                >
                                  {respondingOfferId === offer.id ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Check className="w-3 h-3 mr-1" />}
                                  Accept
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={respondingOfferId === offer.id}
                                  className="text-red-600 border-red-200 hover:bg-red-50"
                                  onClick={() => handleOfferResponse(offer.id, 'declined')}
                                >
                                  Decline
                                </Button>
                              </>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}