import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { Loader2, Award, Clock, PlayCircle, RefreshCw, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ActiveAssessments() {
  useEffect(() => { document.title = "My Assessments - TaskFlow"; }, []);
  const { toast } = useToast();
  const navigate = useNavigate();
  const [assessments, setAssessments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActiveAssessments();
  }, []);

  const resolveCandidateId = async (userId: string): Promise<string> => {
    const { data: profile } = await supabase
      .from("profiles")
      .select("candidate_id")
      .eq("id", userId)
      .maybeSingle();
    if (profile?.candidate_id) return profile.candidate_id;

    const { data: { user } } = await supabase.auth.getUser();
    const { data: candidate } = await supabase
      .from("candidates")
      .select("id")
      .eq("email", user?.email)
      .maybeSingle();
    if (candidate?.id) return candidate.id;

    return userId;
  };

  const fetchActiveAssessments = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: "Please log in to view assessments", variant: "destructive" });
        return;
      }

      const candidateId = await resolveCandidateId(user.id);

      const { data: tokens, error: tokenError } = await supabase
        .from("assessment_tokens")
        .select("*")
        .eq("candidate_id", candidateId)
        .eq("status", "Active")
        .eq("used", false)
        .order("created_at", { ascending: false });

      if (tokenError) {
        console.warn("Assessment tokens query failed (may be RLS):", tokenError);
        setAssessments([]);
        return;
      }

      const activeTokens = (tokens || []).filter(t =>
        !t.expires_at || new Date(t.expires_at) > new Date()
      );

      const assessmentIds = [...new Set(activeTokens.map(t => t.assessment_id).filter(Boolean))];

      const assessmentsMap = new Map<string, any>();
      if (assessmentIds.length > 0) {
        const { data: assessments } = await supabase
          .from("assessments")
          .select("id, title, difficulty, passing_score, duration_minutes")
          .in("id", assessmentIds);
        (assessments || []).forEach(a => assessmentsMap.set(a.id, a));
      }

      const merged = activeTokens.map(t => {
        const assessment = assessmentsMap.get(t.assessment_id) || {};
        return {
          id: t.id,
          assessment_token: t.token,
          token_id: t.id,
          created_at: t.created_at,
          expires_at: t.expires_at,
          job_form_id: t.assessment_id,
          assessment,
          assessment_title: assessment.title || "Technical Assessment",
          difficulty: assessment.difficulty || "Medium",
          duration_minutes: assessment.duration_minutes || 30,
          passing_score: assessment.passing_score || 70
        };
      });

      setAssessments(merged);
    } catch (err: any) {
      console.error("Failed to load assessments:", err);
      toast({ title: "Failed to load assessments", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const startAssessment = (token: string) => {
    if (!token) {
      return toast({ title: "Token missing", variant: "destructive" });
    }
    sessionStorage.setItem("assessment_secure_session_token", token);
    navigate("/assessment");
  };

  const isExpired = (date: string) => date && new Date(date) < new Date();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Award className="w-6 h-6 text-indigo-600" /> Active Assessments
        </h2>
        <Button variant="outline" size="sm" onClick={fetchActiveAssessments}>
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      ) : assessments.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-slate-500">
            No active assessments assigned yet. Complete an application that requires an assessment to receive a token.
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {assessments.map((item) => (
            <Card key={item.id} className={`border-slate-200 hover:shadow-md transition-all ${isExpired(item.expires_at) ? 'opacity-60' : ''}`}>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  {item.assessment_title}
                  {isExpired(item.expires_at) && (
                    <span className="text-[9px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded border border-red-200">EXPIRED</span>
                  )}
                </CardTitle>
                <p className="text-sm text-slate-500">
                  {item.difficulty} &bull; {item.duration_minutes} min &bull; Pass: {item.passing_score}%
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Clock className="w-4 h-4" />
                  <span>Assigned: {new Date(item.created_at).toLocaleDateString()}</span>
                </div>
                {item.expires_at && (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    <span>Expires: {new Date(item.expires_at).toLocaleDateString()}</span>
                  </div>
                )}
                <Button
                  onClick={() => startAssessment(item.assessment_token)}
                  disabled={isExpired(item.expires_at)}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 h-11 font-bold disabled:opacity-50"
                >
                  <PlayCircle className="w-5 h-5 mr-2" />
                  {isExpired(item.expires_at) ? "Token Expired" : "Start Assessment"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
