import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Loader2, Users, UserCircle, Edit, UserX, X, TrendingUp, Plus, ShieldCheck, Search, Filter } from "lucide-react";

export default function AdminEmployees() {
  useEffect(() => { document.title = "Employees - FWC"; }, []);
  const { toast } = useToast();
  const [employees, setEmployees] = useState<any[]>([]);
  const [teamLeads, setTeamLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // NEW: Search and Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("ALL");
  const [performanceFilter, setPerformanceFilter] = useState("ALL");

  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingEmpId, setEditingEmpId] = useState<string | null>(null);
  const [selectedTL, setSelectedTL] = useState("");
  
  // NEW: Department field added to User creation
  const [newUser, setNewUser] = useState({ name: "", email: "", role: "EMPLOYEE", department: "Engineering" });

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('profiles').select('*').order('name', { ascending: true });
    if (!error && data) {
      setEmployees(data.filter(p => p.role && p.role.toUpperCase() === 'EMPLOYEE'));
      setTeamLeads(data.filter(p => p.role && (p.role.toUpperCase() === 'TEAM_LEAD' || p.role.toUpperCase() === 'TL')));
    }
    setLoading(false);
  };

  const getTeamLeadName = (tlId: string) => {
    if (!tlId) return "Unassigned";
    const tl = teamLeads.find(t => t.id === tlId);
    return tl ? tl.name : "Unassigned";
  };

  const saveAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmpId) return;
    setLoading(true);
    await supabase.from('profiles').update({ team_lead_id: selectedTL || null }).eq('id', editingEmpId);
    toast({ title: "Hierarchy Updated" });
    setIsAssignModalOpen(false);
    fetchData();
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const newId = crypto.randomUUID(); 
      // NEW: Includes department in insert
      await supabase.from('profiles').insert([{ id: newId, name: newUser.name, email: newUser.email, role: newUser.role, department: newUser.department }]);
      toast({ title: "User Profile Created", description: "They can now securely register using this email." });
      setIsAddModalOpen(false);
      fetchData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setLoading(false);
  };

  const updateRole = async (id: string, name: string, newRole: string) => {
    if (!window.confirm(`Are you sure you want to change ${name}'s role to ${newRole}?`)) return;
    setLoading(true);
    await supabase.from('profiles').update({ role: newRole, team_lead_id: null }).eq('id', id);
    toast({ title: "Role Updated Successfully" });
    fetchData();
  };

  // NEW: Search & Filter Engine
  const uniqueDepartments = Array.from(new Set(employees.map(e => e.department).filter(Boolean)));
  
  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = 
      (emp.name && emp.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (emp.email && emp.email.toLowerCase().includes(searchQuery.toLowerCase()));
      
    const matchesDept = departmentFilter === "ALL" || emp.department === departmentFilter;
    
    let matchesPerf = true;
    if (performanceFilter === "TOP") matchesPerf = emp.rating >= 4.0;
    if (performanceFilter === "NEEDS_ATTENTION") matchesPerf = emp.rating < 3.0;
    
    return matchesSearch && matchesDept && matchesPerf;
  });

  return (
    <DashboardLayout role="admin">
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in pb-12">
        
        {/* NEW: Updated Header with Search & Filters */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div><h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2"><Users className="w-8 h-8 text-blue-600" /> Employee Directory</h1><p className="text-slate-500 mt-1">Manage team assignments, promotions, and terminations.</p></div>
          
          <div className="flex flex-wrap gap-2 w-full lg:w-auto">
            <div className="relative flex-1 lg:w-48">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
              <Input placeholder="Search..." className="pl-9 h-10 w-full" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
            
            <div className="relative">
              <select className="h-10 pl-3 pr-8 border border-slate-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white" value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)}>
                <option value="ALL">All Depts</option>
                {uniqueDepartments.map(dept => (<option key={dept as string} value={dept as string}>{dept as string}</option>))}
              </select>
              <Filter className="absolute right-2.5 top-3 h-4 w-4 text-slate-500 pointer-events-none" />
            </div>

            <div className="relative">
              <select className="h-10 pl-3 pr-8 border border-slate-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white" value={performanceFilter} onChange={(e) => setPerformanceFilter(e.target.value)}>
                <option value="ALL">Any Rating</option>
                <option value="TOP">Top Performers (4.0+)</option>
                <option value="NEEDS_ATTENTION">Needs Attention (&lt;3.0)</option>
              </select>
              <Filter className="absolute right-2.5 top-3 h-4 w-4 text-slate-500 pointer-events-none" />
            </div>

            <Button onClick={() => setIsAddModalOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white h-10"><Plus className="w-4 h-4 mr-2" /> Add Employee</Button>
          </div>
        </div>

        <Card className="shadow-sm border-slate-200">
          <CardContent className="p-0">
            {loading ? <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div> : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-50"><TableRow><TableHead className="font-bold">Employee</TableHead><TableHead className="font-bold">Department</TableHead><TableHead className="font-bold">Assigned Manager</TableHead><TableHead className="font-bold text-right">Administrative Actions</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {filteredEmployees.map(emp => (
                      <TableRow key={emp.id} className="hover:bg-slate-50">
                        <TableCell><div className="font-bold text-slate-900">{emp.name}</div><div className="text-xs text-slate-500">{emp.email}</div></TableCell>
                        <TableCell><span className="text-sm font-bold text-slate-600">{emp.department || 'Unassigned'}</span></TableCell>
                        <TableCell><span className={`px-3 py-1 rounded-full text-xs font-bold ${emp.team_lead_id ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-500'}`}><UserCircle className="w-3 h-3 inline mr-1" />{getTeamLeadName(emp.team_lead_id)}</span></TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button onClick={() => { setEditingEmpId(emp.id); setSelectedTL(emp.team_lead_id || ""); setIsAssignModalOpen(true); }} variant="outline" className="h-8 text-xs border-blue-200 text-blue-700 hover:bg-blue-50"><Edit className="w-3 h-3 mr-1" /> Reassign</Button>
                            <Button onClick={() => updateRole(emp.id, emp.name, 'TEAM_LEAD')} className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"><TrendingUp className="w-3 h-3 mr-1" /> Make TL</Button>
                            <Button onClick={() => updateRole(emp.id, emp.name, 'ADMIN')} className="h-8 text-xs bg-indigo-600 hover:bg-indigo-700 text-white"><ShieldCheck className="w-3 h-3 mr-1" /> Make Admin</Button>
                            <Button onClick={() => updateRole(emp.id, emp.name, 'ARCHIVED')} variant="destructive" className="h-8 text-xs"><UserX className="w-3 h-3 mr-1" /> Fire</Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredEmployees.length === 0 && <TableRow><TableCell colSpan={4} className="text-center p-8 text-slate-500">No employees match your criteria.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {isAssignModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <Card className="w-full max-w-md shadow-2xl border-none animate-fade-in"><CardContent className="p-6"><div className="flex justify-between items-center mb-6"><h2 className="text-xl font-bold text-slate-800">Assign Team Lead</h2><button onClick={() => setIsAssignModalOpen(false)} className="text-slate-500 hover:text-slate-800"><X className="w-5 h-5"/></button></div><form onSubmit={saveAssignment} className="space-y-4"><div className="space-y-2"><Label className="text-slate-600">Select Manager</Label><select className="w-full p-2.5 border border-slate-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500" value={selectedTL} onChange={e => setSelectedTL(e.target.value)}><option value="">-- Unassigned --</option>{teamLeads.map(tl => <option key={tl.id} value={tl.id}>{tl.name}</option>)}</select></div><Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white mt-4">Save Assignment</Button></form></CardContent></Card>
          </div>
        )}

        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <Card className="w-full max-w-md shadow-2xl border-none animate-fade-in">
              <CardContent className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold text-slate-800">Add New User</h2>
                  <button onClick={() => setIsAddModalOpen(false)} className="text-slate-500 hover:text-slate-800"><X className="w-5 h-5"/></button>
                </div>
                <form onSubmit={handleAddUser} className="space-y-4">
                  <div className="space-y-2"><Label>Full Name</Label><Input required value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} /></div>
                  <div className="space-y-2"><Label>Email Address</Label><Input required type="email" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} /></div>
                  
                  {/* NEW: Explicit Department and Role Selector */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>System Role</Label>
                      <select className="w-full p-2.5 border border-slate-300 rounded-md text-sm outline-none" value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value})}>
                        <option value="EMPLOYEE">Standard Employee</option>
                        <option value="TEAM_LEAD">Team Lead</option>
                        <option value="HR_ADMIN">HR Representative</option>
                        <option value="ADMIN">System Admin</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label>Department</Label>
                      <select className="w-full p-2.5 border border-slate-300 rounded-md text-sm outline-none" value={newUser.department} onChange={e => setNewUser({...newUser, department: e.target.value})}>
                        <option value="Engineering">Engineering</option>
                        <option value="Design">Design</option>
                        <option value="Sales">Sales</option>
                        <option value="Finance">Finance</option>
                        <option value="Human Resources">Human Resources</option>
                        <option value="Marketing">Marketing</option>
                      </select>
                    </div>
                  </div>

                  <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white mt-4 font-bold">Create User Profile</Button>
                </form>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}