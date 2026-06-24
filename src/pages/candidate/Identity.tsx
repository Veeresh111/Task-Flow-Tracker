import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { Loader2, User, CheckCircle2, AlertTriangle } from "lucide-react";
import IdentityEnrollment from "@/components/identity/IdentityEnrollment";

export default function CandidateIdentity() {
  useEffect(() => { document.title = "Identity Verification - TaskFlow"; }, []);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [candidate, setCandidate] = useState<any>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    setUserId(user.id);

    const { data: prof } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    setProfile(prof);

    if (prof?.candidate_id) {
      const { data: cand } = await supabase.from("candidates").select("*").eq("id", prof.candidate_id).single();
      setCandidate(cand);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <DashboardLayout role="candidate">
        <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
      </DashboardLayout>
    );
  }

  const hasPhoto = profile?.avatar_url && profile.avatar_url.length > 100;

  return (
    <DashboardLayout role="candidate">
      <div className="max-w-3xl mx-auto space-y-6 animate-fade-in pb-12">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <User className="w-8 h-8 text-blue-600" /> Identity Verification
          </h1>
          <p className="text-slate-500 mt-1">Enroll your photo for identity verification during assessments and interviews.</p>
        </div>

        {hasPhoto && (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="p-4 flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-green-600 shrink-0" />
              <div>
                <p className="font-medium text-green-800">Identity Photo Enrolled</p>
                <p className="text-sm text-green-600">Your photo has been enrolled and will be used for verification.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {!hasPhoto && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="p-4 flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0" />
              <div>
                <p className="font-medium text-amber-800">Identity Not Enrolled</p>
                <p className="text-sm text-amber-600">Please enroll your photo before taking assessments. This ensures exam integrity.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {userId && (
          <IdentityEnrollment
            candidateId={candidate?.id || userId}
            userId={userId}
            onComplete={() => loadData()}
          />
        )}

        {candidate && (
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-4 space-y-3">
              <h3 className="font-medium text-slate-800">Candidate Profile</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-slate-500">Name:</span> <span className="font-medium">{candidate.full_name || profile?.name}</span></div>
                <div><span className="text-slate-500">Email:</span> <span className="font-medium">{candidate.email || profile?.email}</span></div>
                <div><span className="text-slate-500">Phone:</span> <span className="font-medium">{candidate.phone || "N/A"}</span></div>
                <div><span className="text-slate-500">Stage:</span> <span className="font-medium">{candidate.stage || "Applied"}</span></div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
