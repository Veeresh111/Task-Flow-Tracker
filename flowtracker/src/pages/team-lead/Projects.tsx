import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { Loader2, Briefcase, FileText } from "lucide-react";

export default function TeamLeadProjects() {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProjects = async () => {
      setLoading(true);
      const { data } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
      if (data) setProjects(data);
      setLoading(false);
    };
    fetchProjects();
  }, []);

  return (
    <DashboardLayout role="team_lead">
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Active Projects Overview</h1>
          <p className="text-muted-foreground">Study the full project descriptions before assigning tasks to your team.</p>
        </div>

        {loading ? (
          <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-purple-600" /></div>
        ) : projects.length === 0 ? (
          <div className="p-12 text-center bg-white border border-dashed rounded-lg shadow-sm">
            <p className="text-gray-500 font-medium">No active projects found in the database.</p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {projects.map(project => (
              <Card key={project.id} className="border-0 shadow-lg bg-white overflow-hidden flex flex-col">
                <CardHeader className="border-b bg-gradient-to-r from-purple-50 to-white pb-4">
                  <div className="flex justify-between items-start gap-4">
                    <CardTitle className="text-xl font-bold text-gray-900">
                      {project.name}
                    </CardTitle>
                    <div className="p-2 bg-purple-100 rounded-lg shrink-0 shadow-sm">
                      <Briefcase className="w-5 h-5 text-purple-600" />
                    </div>
                  </div>
                  <span className={`inline-block px-3 py-1 text-xs font-black rounded-full w-fit mt-2 uppercase tracking-wider ${
                    project.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                  }`}>
                    {project.status}
                  </span>
                </CardHeader>
                <CardContent className="pt-6 flex-1 bg-slate-50/30">
                  <div className="flex items-center gap-2 mb-3">
                    <FileText className="w-5 h-5 text-purple-500" />
                    <h4 className="text-sm font-bold text-gray-800 uppercase tracking-wider">Complete Project Description</h4>
                  </div>
                  <div className="p-4 bg-white border border-gray-100 rounded-lg shadow-sm">
                    {/* FLAW 4 FIXED: Displays the full, exact description written by the Admin */}
                    <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                      {project.description || "The administrator has not provided a description for this project yet."}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}