import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Loader2, UserCircle, UserX, TrendingDown, ShieldCheck, Search, Filter } from "lucide-react";

export default function AdminTeamLeads() {
  const { toast } = useToast();
  const [teamLeads, setTeamLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // NEW: Search and Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("ALL");
  const [experienceFilter, setExperienceFilter] = useState("ALL");

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('profiles').select('*').order('name', { ascending: true });
    if (!error && data) {
      setTeamLeads(data.filter(p => p.role && (p.role.toUpperCase() === 'TEAM_LEAD' || p.role.toUpperCase() === 'TL')));
    }
    setLoading(false);
  };

  const updateRole = async (id: string, name: string, newRole: string) => {
    if (!window.confirm(`Are you sure you want to change ${name}'s role to ${newRole}?`)) return;
    setLoading(true);
    await supabase.from('profiles').update({ role: newRole }).eq('id', id);
    toast({ title: "Role Updated Successfully" });
    fetchData();
  };

  // Helper to extract numbers from the experience string
  const getYearsExp = (expString: string) => {
    if (!expString) return 0;
    const match = expString.match(/(\d+)/);
    return match ? parseInt(match[0]) : 0;
  };

  const uniqueDepartments = Array.from(new Set(teamLeads.map(e => e.department).filter(Boolean)));

  // NEW: Filter Logic
  const filteredTLs = teamLeads.filter(tl => {
    const matchesSearch = 
      (tl.name && tl.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (tl.email && tl.email.toLowerCase().includes(searchQuery.toLowerCase()));
      
    const matchesDept = departmentFilter === "ALL" || tl.department === departmentFilter;
    
    let matchesExp = true;
    const years = getYearsExp(tl.experience);
    if (experienceFilter === "5PLUS") matchesExp = years >= 5;
    if (experienceFilter === "10PLUS") matchesExp = years >= 10;
    
    return matchesSearch && matchesDept && matchesExp;
  });

  return (
    <DashboardLayout role="admin">
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in pb-12">
        
        {/* NEW: Updated Header with Search & Filters */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2"><UserCircle className="w-8 h-8 text-purple-600" /> Leadership Directory</h1>
            <p className="text-slate-500 mt-1">Manage executive access, promotions, and terminations.</p>
          </div>
          
          <div className="flex flex-wrap gap-2 w-full lg:w-auto">
            <div className="relative flex-1 lg:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
              <Input placeholder="Search leaders..." className="pl-9 h-10 w-full" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
            
            <div className="relative">
              <select className="h-10 pl-3 pr-8 border border-slate-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-purple-500 appearance-none bg-white min-w-[140px]" value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)}>
                <option value="ALL">All Departments</option>
                {uniqueDepartments.map(dept => (<option key={dept as string} value={dept as string}>{dept as string}</option>))}
              </select>
              <Filter className="absolute right-2.5 top-3 h-4 w-4 text-slate-500 pointer-events-none" />
            </div>

            <div className="relative">
              <select className="h-10 pl-3 pr-8 border border-slate-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-purple-500 appearance-none bg-white min-w-[140px]" value={experienceFilter} onChange={(e) => setExperienceFilter(e.target.value)}>
                <option value="ALL">Any Experience</option>
                <option value="5PLUS">5+ Years Exp</option>
                <option value="10PLUS">10+ Years Exp</option>
              </select>
              <Filter className="absolute right-2.5 top-3 h-4 w-4 text-slate-500 pointer-events-none" />
            </div>
          </div>
        </div>

        <Card className="shadow-sm border-slate-200">
          <CardContent className="p-0">
            {loading ? <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-purple-600" /></div> : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-50"><TableRow><TableHead className="font-bold">Manager Details</TableHead><TableHead className="font-bold">Department</TableHead><TableHead className="font-bold">Experience</TableHead><TableHead className="font-bold text-right">Administrative Actions</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {filteredTLs.map(tl => (
                      <TableRow key={tl.id} className="hover:bg-slate-50">
                        <TableCell><div className="font-bold text-slate-900">{tl.name}</div><div className="text-xs text-slate-500">{tl.email}</div></TableCell>
                        {/* NEW: Added Department Display */}
                        <TableCell><span className="px-3 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-700">{tl.department || 'General'} Head</span></TableCell>
                        <TableCell className="text-sm text-slate-600 font-medium">{tl.experience || 'Not listed'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button onClick={() => updateRole(tl.id, tl.name, 'ADMIN')} variant="outline" className="h-8 text-xs border-indigo-200 text-indigo-700 hover:bg-indigo-50"><ShieldCheck className="w-3 h-3 mr-1" /> Promote to Admin</Button>
                            <Button onClick={() => updateRole(tl.id, tl.name, 'EMPLOYEE')} variant="outline" className="h-8 text-xs border-amber-200 text-amber-700 hover:bg-amber-50"><TrendingDown className="w-3 h-3 mr-1" /> Demote</Button>
                            <Button onClick={() => updateRole(tl.id, tl.name, 'ARCHIVED')} variant="destructive" className="h-8 text-xs bg-red-600 hover:bg-red-700"><UserX className="w-3 h-3 mr-1" /> Terminate</Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredTLs.length === 0 && <TableRow><TableCell colSpan={4} className="text-center p-8 text-slate-500">No active Team Leads match your criteria.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}