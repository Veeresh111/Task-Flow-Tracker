import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { Users } from "lucide-react";

export default function CandidatePipeline() {
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCandidates();
  }, []);

  // Realtime updates for both candidate_applications and candidates tables
  useEffect(() => {
    const channel = supabase
      .channel("candidate-pipeline")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "candidate_applications"
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
      const { data, error } = await supabase
        .from('candidate_applications')
        .select(`
          *,
          candidates (
            full_name,
            email,
            phone,
            ats_score,
            recommendation
          ),
          job_forms (
            job_title
          )
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.error("Error fetching pipeline:", error);
        return;
      }

      if (data) setCandidates(data);
    } catch (err) {
      console.error("Pipeline fetch failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const updateStage = async (id: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('candidate_applications')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;

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