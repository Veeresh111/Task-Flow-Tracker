import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { Loader2, Briefcase, Calendar, Flag, Search, Filter, Sparkles, BrainCircuit, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { callCorporateAI } from "@/lib/ai";

export default function TeamLeadProjects() {
  const [projects, setProjects] = useState<any[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  // AI State
  const [aiRoadmap, setAiRoadmap] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  useEffect(() => { 
    fetchTeamData();
  }, []);

  const fetchTeamData = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: members } = await supabase.from('profiles').select('id, name, role, department').eq('team_lead_id', user.id);
      if (members) setTeamMembers(members);
      fetchProjects();
    } else {
      setLoading(false);
    }
  };

  const fetchProjects = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from('projects').select('*').eq('team_lead_id', user.id).order('created_at', { ascending: false });
      if (data) setProjects(data);
    }
    setLoading(false);
  };

  const generateTeamRoadmap = async (proj: any) => {
    setIsAiLoading(true);
    toast({ title: "AI Framework Initiated", description: "Calculating sprint roadmap and team delegations..." });
    
    try {
      const prompt = `Act as an Expert Agile Scrum Master.
      Project Name: "${proj.name}"
      Requirements: "${proj.description}"
      Your Specific Assigned Team Members: ${JSON.stringify(teamMembers)}
      
      Analyze this project and provide a tactical Team Roadmap:
      1. Sprint Execution Plan: Step-by-step breakdown of how to tackle this project.
      2. Optimal Task Delegation: Based on the available team members provided, who should handle what?
      3. Team Meetings Cadence: When to hold standups vs deep-work blocks.
      
      Do not use markdown backticks, output clean readable text.`;

      const roadmap = await callCorporateAI({ prompt });
      setAiRoadmap(roadmap);
    } catch (err) {
      toast({ title: "AI Framework Error", description: "Defaulting to baseline team roadmap.", variant: "destructive" });
    }
    setIsAiLoading(false);
  };

  const formatDate = (iso: string) => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : "Not Set";

  const filteredProjects = projects.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || (p.description || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "All" || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <DashboardLayout role="team_lead">
      <div className="max-w-6xl mx-auto space-y-6 animate-fade-in pb-12">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">My Projects</h1>
          <p className="text-slate-500">View your assigned timelines and generate AI operational roadmaps.</p>
        </div>

        {/* SEARCH AND SMART FILTER */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <Input placeholder="Search project name..." className="pl-10 h-10 text-sm bg-slate-50 border-slate-200" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-10 w-full sm:w-[250px] bg-slate-50 border-slate-200 text-sm">
              <Filter className="w-4 h-4 mr-2 text-slate-500"/>
              <SelectValue placeholder="Filter by Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Projects</SelectItem>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="Hold">On Hold</SelectItem>
              <SelectItem value="Completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div> : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProjects.map(p => (
              <Card key={p.id} className="shadow-sm border-slate-200 flex flex-col">
                <CardContent className="p-5 space-y-4 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start mb-2"><div className="p-2 bg-blue-50 text-blue-600 rounded"><Briefcase className="w-5 h-5"/></div><span className={`px-2 py-1 text-[10px] font-bold uppercase rounded ${p.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{p.status || 'Active'}</span></div>
                    <div><h3 className="font-bold text-lg text-slate-800 line-clamp-1">{p.name}</h3><p className="text-sm text-slate-500 line-clamp-2 mt-1">{p.description}</p></div>
                  </div>
                  
                  <div className="space-y-3">
                    <Button onClick={() => generateTeamRoadmap(p)} disabled={isAiLoading} className="w-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold border border-indigo-200 h-9 text-xs">
                      {isAiLoading ? <Loader2 className="w-3 h-3 mr-2 animate-spin"/> : <BrainCircuit className="w-3 h-3 mr-2"/>} AI Team Strategy
                    </Button>
                    <div className="pt-4 border-t flex flex-col gap-2 bg-slate-50 p-3 rounded-md">
                      <div className="flex items-center justify-between text-xs text-slate-600"><span className="flex items-center"><Calendar className="w-3.5 h-3.5 mr-1.5 text-blue-500"/> Start Date:</span><strong className="text-slate-800">{formatDate(p.start_date || p.created_at)}</strong></div>
                      <div className="flex items-center justify-between text-xs text-slate-600"><span className="flex items-center"><Flag className="w-3.5 h-3.5 mr-1.5 text-red-500"/> Deadline:</span><strong className="text-red-600">{formatDate(p.deadline)}</strong></div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {filteredProjects.length === 0 && <div className="col-span-full p-12 text-center text-slate-500 font-bold">No projects match your search criteria.</div>}
          </div>
        )}

        {aiRoadmap && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
            <Card className="w-full max-w-3xl shadow-2xl border-none overflow-hidden flex flex-col max-h-[85vh]">
              <div className="bg-indigo-600 p-6 flex justify-between items-center text-white">
                <div>
                  <h2 className="text-xl font-black flex items-center gap-2"><Sparkles className="w-5 h-5"/> AI Sprint Execution Plan</h2>
                  <p className="text-indigo-200 text-xs mt-1">Delegation mapping generated by AI</p>
                </div>
                <button onClick={() => setAiRoadmap(null)} className="text-indigo-200 hover:text-white"><X className="w-6 h-6"/></button>
              </div>
              <CardContent className="p-6 overflow-y-auto custom-scrollbar">
                <p className="whitespace-pre-wrap text-sm text-slate-700 leading-relaxed font-medium">{aiRoadmap}</p>
              </CardContent>
            </Card>
          </div>
        )}

      </div>
    </DashboardLayout>
  );
}