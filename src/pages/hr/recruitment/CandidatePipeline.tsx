import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { isValidStatusTransition } from "@/lib/status-validators";
import { JobApplication } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { notificationService } from "@/lib/notifications";

export default function CandidatePipeline() {
  const { toast } = useToast();
  const [candidates, setCandidates] = useState<JobApplication[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCandidates();
  }, []);

  // Realtime updates — listen on job_applications (single source of truth) and candidates
  useEffect(() => {
    const channel = supabase
      .channel("candidate-pipeline")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "job_applications"
        },
        () => fetchCandidates()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "candidates"
        },
        () => fetchCandidates()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchCandidates = async () => {
    try {
      setLoading(true);
      // Read from job_applications (authoritative source) joined to candidates and job_forms
      const { data: apps, error: appsError } = await supabase
        .from('job_applications')
        .select('*')
        .order('created_at', { ascending: false })
        .range(0, 99);

      if (appsError) {
        console.error("Error fetching pipeline:", appsError);
        return;
      }

      // Fetch candidates and job_forms separately for joining
      const { data: allCandidates } = await supabase
        .from('candidates')
        .select('id, full_name, email, phone, ats_score, recommendation');

      const { data: allForms } = await supabase
        .from('job_forms')
        .select('id, job_title');

      const candidateMap = new Map((allCandidates || []).map(c => [c.id, c]));
      const formMap = new Map((allForms || []).map(f => [f.id, f]));

      // Merge data — mimic the same shape as old candidate_applications join
      const merged = (apps || []).map(app => ({
        ...app,
        candidates: candidateMap.get(app.candidate_id) || {
          full_name: app.candidate_name || 'N/A',
          email: app.candidate_email || 'No Email',
          phone: null,
          ats_score: app.match_score,
          recommendation: app.ai_verdict
        },
        job_forms: formMap.get(app.form_id) || { job_title: 'General Application' },
        // Map job_applications fields to expected pipeline fields
        ai_score: app.match_score,
        assessment_score: null,
        interview_score: null,
        offer_status: app.status === 'Offer Generated' || app.status === 'Offer Accepted' ? app.status : 'Not Generated'
      }));

      setCandidates(merged);
    } catch (err) {
      console.error("Pipeline fetch failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const updateStage = async (id: string, newStatus: string) => {
    try {
      const app = candidates.find(c => c.id === id);
      if (app && !isValidStatusTransition(app.status, newStatus)) {
        toast({ title: "Invalid Transition", description: `Cannot move from "${app.status}" to "${newStatus}".`, variant: "destructive" });
        return;
      }

      // Update job_applications (authoritative source)
      const { error } = await supabase
        .from('job_applications')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;

      // Sync master candidates.stage (trigger handles candidate_applications sync)
      if (app?.candidate_id) {
        await supabase
          .from('candidates')
          .update({ stage: newStatus })
          .eq('id', app.candidate_id);

        await notificationService.sendToCandidate(app.candidate_id, {
          title: `Application Status Updated: ${newStatus}`,
          message: `Your application for ${app.job_forms?.job_title || 'the position'} has moved to stage "${newStatus}".`,
          type: "recruitment",
          link: "/candidate/dashboard"
        });
      }

      toast({
        title: "Stage Updated",
        description: `Candidate status transitioned to "${newStatus}".`
      });

      fetchCandidates();
    } catch (err) {
      console.error("Status update failed:", err);
    }
  };

  if (loading) {
    return (
      <Card className="shadow-sm border-slate-200">
        <CardContent className="p-12 text-center">
          <div className="flex justify-center mb-4">
            <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
          </div>
          <p className="text-slate-500 font-medium">Loading recruitment pipeline...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-sm border-slate-200">
      <CardHeader className="bg-slate-50 border-b">
        <CardTitle className="text-base font-bold flex items-center gap-2">
          <Users className="w-5 h-5 text-blue-600"/> Enterprise Recruitment Tracking Board
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="font-bold">Full Legal Name</TableHead>
              <TableHead className="font-bold">Applied Role</TableHead>
              <TableHead className="font-bold">Contact Channel</TableHead>
              <TableHead className="font-bold">AI Score</TableHead>
              <TableHead className="font-bold">Assessment</TableHead>
              <TableHead className="font-bold">Interview</TableHead>
              <TableHead className="font-bold">Offer</TableHead>
              <TableHead className="font-bold">AI Decision</TableHead>
              <TableHead className="font-bold">Current Status</TableHead>
              <TableHead className="font-bold">Application Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {candidates.map((app) => {
              const candidate = app.candidates || {};
              const job = app.job_forms || {};
              return (
                <TableRow key={app.id}>
                  <TableCell className="font-bold text-slate-800 text-sm">
                    {candidate.full_name || 'N/A'}
                  </TableCell>
                  <TableCell className="text-sm font-medium text-slate-700">
                    {job.job_title || 'General Application'}
                  </TableCell>
                  <TableCell className="text-xs text-slate-500">
                    {candidate.email || "No Email"} <br/> 
                    {candidate.phone || "No Phone"}
                  </TableCell>
                  <TableCell className="font-black text-blue-600 text-sm">
                    {app.ai_score ?? candidate.ats_score ?? '--'}%
                  </TableCell>
                  <TableCell className="text-sm font-medium">
                    {app.assessment_score ?? '--'}
                  </TableCell>
                  <TableCell className="text-sm font-medium">
                    {app.interview_score ?? '--'}
                  </TableCell>
                  <TableCell className="text-sm font-medium">
                    {app.offer_status || 'Not Generated'}
                  </TableCell>
                  <TableCell className="text-xs font-semibold text-slate-600">
                    {candidate.recommendation || 'Pending'}
                  </TableCell>
                  <TableCell>
                    <Select value={app.status || 'Applied'} onValueChange={(v) => updateStage(app.id, v)}>
                      <SelectTrigger className="w-44 h-8 text-xs font-bold">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Applied">Applied</SelectItem>
                        <SelectItem value="ATS Shortlisted">ATS Shortlisted</SelectItem>
                        <SelectItem value="Recruiter Screening">Recruiter Screening</SelectItem>
                        <SelectItem value="Assessment Assigned">Assessment Assigned</SelectItem>
                        <SelectItem value="Assessment Completed">Assessment Completed</SelectItem>
                        <SelectItem value="Assessment Passed">Assessment Passed</SelectItem>
                        <SelectItem value="Interview Scheduled">Interview Scheduled</SelectItem>
                        <SelectItem value="Interview Cleared">Interview Cleared</SelectItem>
                        <SelectItem value="Offer Generated">Offer Generated</SelectItem>
                        <SelectItem value="Offer Accepted">Offer Accepted</SelectItem>
                        <SelectItem value="Onboarding">Onboarding</SelectItem>
                        <SelectItem value="Rejected">Rejected</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-xs text-slate-500">
                    {new Date(app.created_at).toLocaleString()}
                  </TableCell>
                </TableRow>
              );
            })}
            {candidates.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="text-center p-12 text-slate-500">
                  No applications found. New candidates will appear here automatically.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}