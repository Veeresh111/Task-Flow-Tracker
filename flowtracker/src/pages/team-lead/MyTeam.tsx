import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/lib/supabase";
import { Loader2, Users, Search, Filter, Phone, Mail, Award, Calendar, Briefcase, MapPin, Eye, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

export default function MyTeam() {
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [searchQuery, setSearchQuery] = useState("");
  const [skillFilter, setSkillFilter] = useState("All");
  const [ratingFilter, setRatingFilter] = useState("All");
  const [selectedProfile, setSelectedProfile] = useState<any>(null);

  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => { fetchMyTeam(); }, []);

  const fetchMyTeam = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Retrieve active lead profile configuration
    const { data: leadProfile } = await supabase
      .from('profiles')
      .select('department')
      .eq('id', user.id)
      .single();

    const currentLeadDept = leadProfile?.department || '';

    // Retrieve global listing
    const { data: allProfiles } = await supabase
      .from('profiles')
      .select('*')
      .order('name', { ascending: true });

    if (allProfiles) {
      // Synchronize with database seed configuration
      const coordinatedTeam = allProfiles.filter(p => 
        p.id !== user.id && 
        (p.team_lead_id === user.id || (p.department === currentLeadDept && p.role === 'employee'))
      );
      setTeamMembers(coordinatedTeam);
    }
    setLoading(false);
  };

  // Modern Filter Engine Configurations
  const filteredTeam = teamMembers.filter(member => {
    const matchesSearch = member.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          member.email?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesSkill = skillFilter === "All" || member.skills?.toLowerCase().includes(skillFilter.toLowerCase());
    
    let matchesRating = true;
    if (ratingFilter === "High") matchesRating = Number(member.rating) >= 4.0;
    if (ratingFilter === "Mid") matchesRating = Number(member.rating) >= 3.0 && Number(member.rating) < 4.0;
    if (ratingFilter === "Low") matchesRating = Number(member.rating) < 3.0;

    return matchesSearch && matchesSkill && matchesRating;
  });

  // SECURE NOTIFICATION & FOOLPROOF ROUTING
  const handleWorkspaceDispatch = async (member: any) => {
    try {
      // 1. Push immediate database notification
      const { error } = await supabase.from('notifications').insert([{
        user_id: member.id,
        title: "Workspace Dispatch",
        message: "Your Team Lead wants to connect with you regarding your workspace.",
        is_read: false,
        created_at: new Date().toISOString()
      }]);

      if (!error) {
        toast({ title: "Notification Sent", description: `${member.name} was notified.` });
      } else {
        console.error("Supabase Notification Error:", error);
      }
    } catch (error) {
      console.error("Failed to push notification", error);
    }

    // 2. Set strict local storage fallback so the chat page CANNOT fail to find the user
    localStorage.setItem('activeChatUserId', member.id);
    localStorage.setItem('activeChatUserName', member.name);

    // 3. Route directly to internal chat with Query Param + Router State
    navigate(`/team-lead/chat?userId=${member.id}`, { 
      state: { selectedUserId: member.id, selectedUserName: member.name } 
    });
  };

  return (
    <DashboardLayout role="team_lead">
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in pb-12">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Users className="w-8 h-8 text-indigo-600" /> My Assigned Team
          </h1>
          <p className="text-slate-500 mt-1">Manage and access comprehensive corporate profiles of your immediate engine workspace members.</p>
        </div>

        {loading ? <div className="flex justify-center p-20"><Loader2 className="w-10 h-10 animate-spin text-indigo-600" /></div> : (
          <>
            {/* Real-time Dynamic Stats Rows */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="shadow-sm border-slate-200 bg-white">
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="p-3 bg-indigo-100 text-indigo-600 rounded-full"><Users className="w-5 h-5"/></div>
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Headcount</p>
                    <h2 className="text-2xl font-black text-slate-800">{filteredTeam.length} / {teamMembers.length} Members</h2>
                  </div>
                </CardContent>
              </Card>
              <Card className="shadow-sm border-slate-200 bg-white">
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="p-3 bg-emerald-100 text-emerald-600 rounded-full"><Award className="w-5 h-5"/></div>
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Average Workspace Rating</p>
                    <h2 className="text-2xl font-black text-slate-800">
                      {(filteredTeam.reduce((acc, m) => acc + (Number(m.rating) || 0), 0) / (filteredTeam.length || 1)).toFixed(1)} / 5.0
                    </h2>
                  </div>
                </CardContent>
              </Card>
              <Card className="shadow-sm border-slate-200 bg-white">
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="p-3 bg-amber-100 text-amber-600 rounded-full"><Briefcase className="w-5 h-5"/></div>
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Department Hub</p>
                    <h2 className="text-2xl font-black text-slate-800">{teamMembers[0]?.department || 'Cross-Functional'}</h2>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Smart Engine Filter Control Dashboard Panel */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Filter name or email string..." 
                  className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="relative">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <select 
                  className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none bg-white"
                  value={skillFilter}
                  onChange={(e) => setSkillFilter(e.target.value)}
                >
                  <option value="All">All Technical Specialities</option>
                  <option value="React">React Framework Ecosystem</option>
                  <option value="TypeScript">TypeScript Architecture</option>
                  <option value="Figma">Figma Design System</option>
                  <option value="Sales">Corporate B2B Strategy</option>
                  <option value="Excel">Financial Data Modeling</option>
                </select>
              </div>

              <div className="relative">
                <Award className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <select 
                  className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none bg-white"
                  value={ratingFilter}
                  onChange={(e) => setRatingFilter(e.target.value)}
                >
                  <option value="All">All Metrics Ratings</option>
                  <option value="High">Top Core Experts (≥ 4.0)</option>
                  <option value="Mid">Standard Solid Matrix (3.0 - 3.9)</option>
                  <option value="Low">Underperforming Tier (&lt; 3.0)</option>
                </select>
              </div>
            </div>

            {/* Core Database Render Matrix Table */}
            <Card className="shadow-sm border-slate-200 bg-white">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead className="font-bold text-slate-700">Identity Structure</TableHead>
                        <TableHead className="font-bold text-slate-700">Hub Assignment</TableHead>
                        <TableHead className="font-bold text-slate-700">Core Capabilities</TableHead>
                        <TableHead className="font-bold text-slate-700 text-center">System Evaluation</TableHead>
                        <TableHead className="font-bold text-slate-700 text-right">Profile Audit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTeam.map(member => (
                        <TableRow key={member.id} className="hover:bg-slate-50/80 transition-colors">
                          <TableCell>
                            <div className="font-bold text-slate-900">{member.name}</div>
                            <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5"><Mail className="w-3 h-3"/>{member.email}</div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm font-semibold text-slate-700">{member.department}</div>
                            <div className="text-xs text-slate-400 font-medium capitalize">{member.role?.replace('_', ' ')}</div>
                          </TableCell>
                          <TableCell>
                            <span className="inline-block max-w-[240px] truncate text-xs font-medium bg-slate-100 border text-slate-700 px-2.5 py-1 rounded-md">
                              {member.skills || 'General Corporate Track'}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                              Number(member.rating) >= 4.0 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                              Number(member.rating) >= 3.0 ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-red-50 border-red-200 text-red-700'
                            }`}>
                              ★ {Number(member.rating || 0).toFixed(1)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <button 
                              onClick={() => setSelectedProfile(member)}
                              className="inline-flex items-center gap-1 bg-slate-100 hover:bg-indigo-600 hover:text-white text-slate-700 text-xs font-semibold px-3 py-1.5 rounded-md transition-all shadow-sm border border-slate-200"
                            >
                              <Eye className="w-3.5 h-3.5" /> Inspect
                            </button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {filteredTeam.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center p-12 text-slate-500">
                            No corporate team profiles synchronized matching your active lookup queries.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Modern Dynamic Profile Inspectors Modal Box View Component */}
      {selectedProfile && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-100 animate-in fade-in zoom-in duration-150">
            <div className="p-6 bg-slate-900 text-white flex justify-between items-start">
              <div>
                <h3 className="text-2xl font-black tracking-tight">{selectedProfile.name}</h3>
                <p className="text-indigo-300 text-sm font-medium mt-0.5 capitalize">{selectedProfile.role?.replace('_', ' ')} — {selectedProfile.department}</p>
              </div>
              <button onClick={() => setSelectedProfile(null)} className="p-1 rounded-full bg-slate-800 text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5"/>
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center gap-3 text-slate-600 bg-slate-50 p-3 rounded-lg border">
                  <Phone className="w-4 h-4 text-indigo-500 shrink-0"/>
                  <span className="text-sm font-medium">{selectedProfile.phone || 'No Registry Contact'}</span>
                </div>
                <div className="flex items-center gap-3 text-slate-600 bg-slate-50 p-3 rounded-lg border">
                  <Mail className="w-4 h-4 text-indigo-500 shrink-0"/>
                  <span className="text-sm font-medium truncate">{selectedProfile.email}</span>
                </div>
                <div className="flex items-center gap-3 text-slate-600 bg-slate-50 p-3 rounded-lg border">
                  <Calendar className="w-4 h-4 text-indigo-500 shrink-0"/>
                  <span className="text-sm font-medium">Joined: {selectedProfile.join_date ? new Date(selectedProfile.join_date).toLocaleDateString() : 'N/A'}</span>
                </div>
                <div className="flex items-center gap-3 text-slate-600 bg-slate-50 p-3 rounded-lg border">
                  <MapPin className="w-4 h-4 text-indigo-500 shrink-0"/>
                  <span className="text-sm font-medium truncate">{selectedProfile.address || 'Global Workspace Hub'}</span>
                </div>
              </div>

              <div className="space-y-1 bg-slate-50 border p-4 rounded-xl">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Educational Framework Matrix</h4>
                <p className="text-sm font-bold text-slate-800">{selectedProfile.education || 'MNC Certified Professional Track'}</p>
              </div>

              <div className="space-y-1 bg-slate-50 border p-4 rounded-xl">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Enterprise Tenure Experience Description</h4>
                <p className="text-sm text-slate-700 font-medium">{selectedProfile.experience || 'Verified Professional Profile Data Record.'}</p>
              </div>

              <div className="space-y-1 bg-slate-50 border p-4 rounded-xl">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Validated Technical Skill Sets</h4>
                <p className="text-sm font-bold text-indigo-600">{selectedProfile.skills || 'General Track Framework'}</p>
              </div>

              <div className="pt-2 flex gap-3">
                <button 
                  onClick={() => handleWorkspaceDispatch(selectedProfile)}
                  className="flex-1 inline-flex justify-center items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl text-sm shadow-sm transition-all"
                >
                  Connect Workspace Dispatch
                </button>
                <button 
                  onClick={() => setSelectedProfile(null)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-sm transition-all"
                >
                  Dismiss Overview Panel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}