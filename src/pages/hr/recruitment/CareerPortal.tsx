import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { isValidJobFormStatusTransition } from "@/lib/status-validators";
import { Loader2, Briefcase, Plus, CheckCircle, XCircle } from "lucide-react";

export default function CareerPortal() {
  const { toast } = useToast();
  const [jobs, setJobs] = useState<any[]>([]);
  const [jobForms, setJobForms] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [location, setLocation] = useState("");
  const [type, setType] = useState("Full Time");
  const [description, setDescription] = useState("");
  const [requirements, setRequirements] = useState("");
  const [assessmentRequired, setAssessmentRequired] = useState(false);
  const [selectedFormId, setSelectedFormId] = useState("");

  useEffect(() => {
    fetchJobs();
    fetchJobForms();
  }, []);

  const fetchJobForms = async () => {
    try {
      const { data } = await supabase
        .from("job_forms")
        .select("id, job_title")
        .in("status", ["Published", "Draft"])
        .order("job_title");
      setJobForms(data || []);
    } catch {
      // non-fatal
    }
  };

  const fetchJobs = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("job_forms")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setJobs(data || []);
    } catch (err: any) {
      toast({ title: "Fetch Failed", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !department) return;
    setIsSubmitting(true);

    try {
      const { data: userData } = await supabase.auth.getUser();

      if (selectedFormId) {
        // Publish existing form as Open
        const { error } = await supabase
          .from("job_forms")
          .update({
            job_title: title,
            department,
            location,
            employment_type: type,
            jd_text: description,
            requirements,
            requires_assessment: assessmentRequired,
            status: "Open"
          })
          .eq("id", selectedFormId);
        if (error) throw error;
      } else {
        // Create new job form
        const { error } = await supabase.from("job_forms").insert([
          {
            job_title: title,
            department,
            location,
            employment_type: type,
            jd_text: description,
            requirements,
            requires_assessment: assessmentRequired,
            created_by: userData.user?.id,
            status: "Open"
          }
        ]);
        if (error) throw error;
      }

      toast({ title: "Success", description: "Job vacancy published successfully." });
      
      // Reset Form
      setTitle("");
      setDescription("");
      setRequirements("");
      setSelectedFormId("");
      fetchJobs();
      fetchJobForms();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleJobStatus = async (id: string, currentStatus: string) => {
    const nextStatus = currentStatus === "Open" ? "Closed" : "Open";
    if (!isValidJobFormStatusTransition(currentStatus, nextStatus)) {
      toast({ title: "Invalid Transition", description: `Cannot move job form from "${currentStatus}" to "${nextStatus}".`, variant: "destructive" });
      return;
    }
    try {
      const { error } = await supabase
        .from("job_forms")
        .update({ status: nextStatus })
        .eq("id", id);
      if (error) throw error;
      toast({ title: "Status Updated", description: `Job is now marked as ${nextStatus}.` });
      fetchJobs();
    } catch (err: any) {
      toast({ title: "Update Failed", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">ATS Career Portal</h1>
        <p className="text-gray-500">Post vacancies, coordinate job criteria, and manage corporate listings.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Job Creation Panel */}
        <Card className="lg:col-span-1 h-fit shadow-md border border-gray-200">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <Plus className="w-5 h-5 text-blue-600" /> Create Job Vacancy
            </CardTitle>
            <CardDescription>Publish technical requirements directly to candidate views.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateJob} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Job Title</Label>
                <Input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Senior Software Engineer" />
              </div>
              <div className="space-y-1.5">
                <Label>Department</Label>
                <Input required value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Engineering" />
              </div>
              <div className="space-y-1.5">
                <Label>Location</Label>
                <Input required value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Bangalore, Remote" />
              </div>
              <div className="space-y-1.5">
                <Label>Employment Type</Label>
                <select value={type} onChange={(e) => setType(e.target.value)} className="w-full rounded-md border border-gray-200 p-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="Full Time">Full Time</option>
                  <option value="Part Time">Part Time</option>
                  <option value="Contract">Contract</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full rounded-md border border-gray-200 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Describe the role responsibilities..." />
              </div>
              <div className="space-y-1.5">
                <Label>Requirements</Label>
                <textarea value={requirements} onChange={(e) => setRequirements(e.target.value)} rows={3} className="w-full rounded-md border border-gray-200 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="List technology requirements..." />
              </div>
              <div className="space-y-1.5">
                <Label>Linked Application Form</Label>
                <select value={selectedFormId} onChange={(e) => setSelectedFormId(e.target.value)} className="w-full rounded-md border border-gray-200 p-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">-- Select a Job Form --</option>
                  {jobForms.map((f) => (
                    <option key={f.id} value={f.id}>{f.job_title}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2 py-2">
                <input type="checkbox" id="assessment_required" checked={assessmentRequired} onChange={(e) => setAssessmentRequired(e.target.checked)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4" />
                <Label htmlFor="assessment_required" className="cursor-pointer font-medium">Require Automated Technical Assessment</Label>
              </div>
              <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Publish Vacancy"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Published Jobs Management List */}
        <Card className="lg:col-span-2 shadow-md border border-gray-200">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-gray-700" /> Currently Published Positions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
            ) : jobs.length === 0 ? (
              <div className="text-center p-8 text-gray-400">No active vacancies currently open.</div>
            ) : (
              <div className="space-y-4">
                {jobs.map((job) => (
                  <div key={job.id} className="p-4 border border-gray-100 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gray-50/50 hover:bg-gray-50 transition-colors">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-lg text-gray-900">{job.job_title}</h3>
                        <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${job.status === "Open" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>{job.status}</span>
                      </div>
                      <p className="text-sm text-gray-600">{job.department} • {job.location} • <span className="font-medium text-gray-700">{job.employment_type}</span></p>
                      {job.requires_assessment && <p className="text-xs text-blue-600 font-medium">⚡ Hardwired to secure Technical Assessment flow</p>}
                    </div>
                    <div className="flex items-center gap-2 self-end md:self-center">
                      <Button onClick={() => toggleJobStatus(job.id, job.status)} variant="outline" size="sm" className="flex items-center gap-1">
                        {job.status === "Open" ? <XCircle className="w-4 h-4 text-red-500" /> : <CheckCircle className="w-4 h-4 text-green-500" />}
                        {job.status === "Open" ? "Close" : "Reopen"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}