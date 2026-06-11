import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Megaphone, Briefcase, MapPin, Calendar, Link2, Sparkles } from "lucide-react";

export default function Careers() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [vacancies, setVacancies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCareerFeeds();

    const annSub = supabase.channel("candidate-ann-feed").on("postgres_changes", { event: "*", schema: "public", table: "recruitment_announcements" }, () => fetchAnnouncements()).subscribe();
    const jobSub = supabase.channel("candidate-job-feed").on("postgres_changes", { event: "*", schema: "public", table: "recruitment_posts" }, () => fetchVacancies()).subscribe();

    return () => {
      supabase.removeChannel(annSub);
      supabase.removeChannel(jobSub);
    };
  }, []);

  const fetchCareerFeeds = async () => {
    setLoading(true);
    await Promise.all([fetchAnnouncements(), fetchVacancies()]);
    setLoading(false);
  };

  const fetchAnnouncements = async () => {
    const { data } = await supabase.from("recruitment_announcements").select("*").order("created_at", { ascending: false });
    if (data) setAnnouncements(data);
  };

  const fetchVacancies = async () => {
    // ✅ Note: Pulling job_form_id directly from schema definition mapping to prevent breaking navigation links
    const { data } = await supabase.from("recruitment_posts").select("id, title, department, location, description, requirements, apply_link, assessment_required, job_form_id").eq("status", "Open").order("created_at", { ascending: false });
    if (data) setVacancies(data);
  };

  // === SURGICALLY HARDENED PER YOUR EXPLICIT ENTERPRISE BLOCKING SPECIFICATION ===
  const handleApplyAction = async (job: any) => {
    try {
      if (job.apply_link?.startsWith("http")) {
        window.open(job.apply_link, "_blank");
        return;
      }

      const targetFormId = job.job_form_id;

      // ENTERPRISE SANITY CHECK FIXED: Strictly block dynamic recovery fallbacks to prevent candidate cross-routing leaks
      if (!targetFormId) {
        toast({
          title: "Job Configuration Error",
          description: "This job posting is not linked to an active application intake form. Please contact HR support.",
          variant: "destructive",
        });
        return;
      }

      navigate(`/apply/${targetFormId}`);
    } catch (err: any) {
      toast({
        title: "Navigation Failed",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="h-[70vh] flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
        <p className="text-slate-500 text-sm font-medium animate-pulse">Syncing career metrics and broadcast parameters...</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Corporate Careers Hub</h1>
        <p className="text-gray-500 text-sm">Review published recruitment milestones, processing matrices, and corporate placement routes.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Grid: Jobs */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center gap-2 px-1">
            <Briefcase className="w-5 h-5 text-blue-600" />
            <h2 className="text-xl font-bold text-slate-900">Current Opportunities</h2>
          </div>

          {vacancies.length === 0 ? (
            <Card className="p-8 text-center text-slate-400 border border-dashed border-slate-200">
              <Briefcase className="w-12 h-12 mx-auto mb-2 text-slate-300" />
              <p className="text-sm">No corporate tracks are open at this moment.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {vacancies.map((job) => (
                <Card key={job.id} className="border border-slate-200 bg-white flex flex-col justify-between overflow-hidden shadow-sm transition-all hover:shadow-md hover:border-slate-300">
                  <CardHeader className="p-5 pb-3 space-y-2">
                    <div className="flex justify-between items-start gap-2">
                      <CardTitle className="text-lg font-bold text-slate-900 tracking-tight leading-snug">{job.title}</CardTitle>
                      <span className="text-[10px] bg-blue-50 text-blue-700 font-bold px-2 py-0.5 rounded border border-blue-100 shrink-0 uppercase tracking-wider">{job.department}</span>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs font-medium text-slate-500 pt-0.5">
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3 text-slate-400" /> {job.location}</span>
                      {job.assessment_required && <span className="flex items-center gap-1 text-amber-600"><Sparkles className="w-3 h-3" /> Pre-exam Required</span>}
                    </div>
                  </CardHeader>
                  <CardContent className="p-5 pt-0 space-y-4">
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Description</span>
                      <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed">{job.description}</p>
                    </div>
                    {job.requirements && (
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Key Requirements</span>
                        <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed font-mono">{job.requirements}</p>
                      </div>
                    )}
                    <Button onClick={() => handleApplyAction(job)} className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs h-9 shadow-sm transition-colors mt-2">
                      Apply Now
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Right Sidebar Column: Announcements */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <Megaphone className="w-5 h-5 text-amber-500" />
            <h2 className="text-xl font-bold text-slate-900">Broadcast Alerts</h2>
          </div>

          <div className="space-y-3 max-h-[calc(100vh-220px)] overflow-y-auto pr-1 custom-scrollbar">
            {announcements.length === 0 ? (
              <Card className="p-6 text-center text-slate-400 border border-dashed border-slate-200">
                <p className="text-xs">No global updates at present.</p>
              </Card>
            ) : (
              announcements.map((ann) => (
                <div key={ann.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-2 border-l-4 border-l-amber-500">
                  <div className="flex justify-between items-start gap-4">
                    <h3 className="font-bold text-slate-900 text-sm leading-tight">{ann.title}</h3>
                    <span className="text-[9px] bg-slate-50 text-slate-400 px-1.5 py-0.5 rounded border border-slate-100 font-medium shrink-0 flex items-center gap-1">
                      <Calendar className="w-2.5 h-2.5" /> {new Date(ann.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed font-medium">{ann.message}</p>
                  {ann.apply_link && (
                    <div className="pt-0.5">
                      <a href={ann.apply_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-700 font-bold hover:underline">
                        <Link2 className="w-3 h-3" /> Secure Broadcaster Link
                      </a>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}