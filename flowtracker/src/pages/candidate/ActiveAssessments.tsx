import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { Loader2, Award, Clock, PlayCircle, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ActiveAssessments() {
  const { toast } = useToast();
  const navigate = useNavigate();
  
  const [assessments, setAssessments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActiveAssessments();
  }, []);

  const fetchActiveAssessments = async () => {
    try {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: "Please log in to view assessments", variant: "destructive" });
        return;
      }

      // Get candidate record (most common pattern)
      const { data: candidate } = await supabase
        .from("candidates")
        .select("id")
        .eq("email", user.email)
        .single();

      const candidateId = candidate?.id || user.id;

      // Load assignments
      const { data: assignments, error } = await supabase
        .from("candidate_assessments")
        .select("*")
        .eq("candidate_id", candidateId)
        .eq("status", "Assigned")
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (!assignments || assignments.length === 0) {
        setAssessments([]);
        return;
      }

      // Get job_form_ids
      const jobFormIds = [...new Set(assignments.map(a => a.job_form_id).filter(Boolean))];

      // Load assessment details via job_form_id
      const { data: assessmentDefs } = await supabase
        .from("assessments")
        .select("id, title, difficulty, passing_score, duration_minutes, job_form_id")
        .in("job_form_id", jobFormIds);

      // Merge data
      const merged = assignments.map(item => ({
        ...item,
        assessment: assessmentDefs?.find(a => a.job_form_id === item.job_form_id)
      }));

      setAssessments(merged);
    } catch (err: any) {
      console.error("Failed to load assessments:", err);
      toast({ 
        title: "Failed to load assessments", 
        description: err.message, 
        variant: "destructive" 
      });
    } finally {
      setLoading(false);
    }
  };

  const startAssessment = (token: string, item: any) => {
    if (!token) {
      return toast({ title: "Token missing", variant: "destructive" });
    }

    sessionStorage.setItem("assessment_secure_session_token", token);
    
    toast({ 
      title: "Starting Assessment", 
      description: item.assessment?.title || "Technical Assessment" 
    });

    navigate("/assessment");
  };

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
            No active assessments assigned yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {assessments.map((item) => {
            const ass = item.assessment || {};
            return (
              <Card key={item.id} className="border-slate-200 hover:shadow-md transition-all">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">
                    {ass.title || "Technical Assessment"}
                  </CardTitle>
                  <p className="text-sm text-slate-500">
                    {ass.difficulty} • {ass.duration_minutes} minutes • Pass: {ass.passing_score}%
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <Clock className="w-4 h-4" />
                    <span>Assigned: {new Date(item.created_at).toLocaleDateString()}</span>
                  </div>

                  <Button 
                    onClick={() => startAssessment(item.assessment_token, item)}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 h-11 font-bold"
                  >
                    <PlayCircle className="w-5 h-5 mr-2" />
                    Start Assessment
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}