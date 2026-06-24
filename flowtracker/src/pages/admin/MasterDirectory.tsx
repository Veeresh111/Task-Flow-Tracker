import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Loader2, Users, Eye, Download, Plus, X, MapPin, Phone, GraduationCap, Briefcase, Star, Calendar, Search, Filter, FolderKanban } from "lucide-react";

export default function AdminMasterDirectory() {
  const { toast } = useToast();
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Search and Filter States (Fix for Flaw 2)
  const [searchQuery, setSearchQuery] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("ALL");

  // Modals
  const [viewProfile, setViewProfile] = useState<any | null>(null);
  const [activeProjects, setActiveProjects] = useState<any[]>([]); // New State for active projects
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newUser, setNewUser] = useState({ name: "", email: "", role: "EMPLOYEE", department: "Engineering" });

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('profiles').select('*').order('name', { ascending: true });
    if (!error && data) setEmployees(data);
    setLoading(false);
  };

  const handleExport = () => {
    // Only exports the currently filtered data
    const dataToExport = filteredEmployees;
    const csvContent = "data:text/csv;charset=utf-8,"
      + "Name,Email,Role,Department,Phone,Join Date,Rating\n"
      + dataToExport.map(e => `${e.name},${e.email},${e.role},${e.department || 'N/A'},${e.phone || 'N/A'},${e.join_date || 'N/A'},${e.rating || 'N/A'}`).join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", "master_hr_directory.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: "Export Successful", description: "HR Directory downloaded." });
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const newId = crypto.randomUUID(); 
      await supabase.from('profiles').insert([{ 
        id: newId, name: newUser.name, email: newUser.email, role: newUser.role, department: newUser.department, join_date: new Date().toISOString()
      }]);
      toast({ title: "User Profile Created", description: "Profile saved to the Master Directory." });
      setIsAddModalOpen(false);
      fetchData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setLoading(false);
  };

  // FIX FOR FLAW 3: Fetch active projects when a profile is viewed
  const handleViewProfile = async (emp: any) => {
    setViewProfile(emp);
    setActiveProjects([]); // Reset while loading
    
    try {
      // Find tasks assigned to this user that are NOT completed
      const { data: tasks } = await supabase.from('tasks')
        .select('*, projects(name)')
        .eq('assigned_to', emp.id)
        .neq('status', 'Completed');
        
      if (tasks) setActiveProjects(tasks);
    } catch (err) {
      console.error("Failed to fetch user projects", err);
    }
  };

  const formatDate = (date: string) => date ? new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
  
  // Calculate days active for a project
  const calculateDaysActive = (createdStr: string) => {
    if (!createdStr) return 0;
    const start = new Date(createdStr).getTime();
    const now = new Date().getTime();
    return Math.floor((now - start) / (1000 * 60 * 60 * 24));
  };

  // SEARCH AND FILTER ENGINE (Fix for Flaw 2)
  const uniqueDepartments = Array.from(new Set(employees.map(e => e.department).filter(Boolean)));
  
  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = 
      (emp.name && emp.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (emp.email && emp.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (emp.phone && emp.phone.includes(searchQuery));
      
    const matchesDept = departmentFilter === "ALL" || emp.department === departmentFilter;
    
    return matchesSearch && matchesDept;
  });

  return (
    <DashboardLayout role="admin">
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in pb-12">
        
        {/* HEADER SECTION WITH NEW SEARCH BAR */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <Users className="w-8 h-8 text-blue-600" /> Master HR Directory
            </h1>
            <p className="text-slate-500 mt-1">Comprehensive professional records for all active staff.</p>
          </div>
          
          <div className="flex flex-wrap gap-2 w-full lg:w-auto">
            {/* NEW: Robust Search Engine */}
            <div className="relative flex-1 lg:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
              <Input 
                placeholder="Search name, email, phone..." 
                className="pl-9 h-10 w-full"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            
            {/* NEW: Department Filter Dropdown */}
            <div className="relative">
              <select 
                className="h-10 pl-3 pr-8 border border-slate-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white min-w-[140px]"
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
              >
                <option value="ALL">All Departments</option>
                {uniqueDepartments.map(dept => (
                  <option key={dept as string} value={dept as string}>{dept as string}</option>
                ))}
              </select>
              <Filter className="absolute right-2.5 top-3 h-4 w-4 text-slate-500 pointer-events-none" />
            </div>

            <Button onClick={handleExport} variant="outline" className="h-10"><Download className="w-4 h-4 mr-2" /> Export</Button>
            <Button onClick={() => setIsAddModalOpen(true)} className="h-10 bg-blue-600 hover:bg-blue-700 text-white"><Plus className="w-4 h-4 mr-2" /> Hire</Button>
          </div>
        </div>

        <Card className="shadow-sm border-slate-200">
          <CardContent className="p-0">
            {loading ? <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div> : (
              <div className="overflow-x-auto h-[600px] relative">
                <Table>
                  <TableHeader className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                    <TableRow>
                      <TableHead className="font-bold">Staff Member</TableHead>
                      <TableHead className="font-bold">Role & Dept</TableHead>
                      <TableHead className="font-bold">Contact</TableHead>
                      <TableHead className="font-bold">Join Date</TableHead>
                      <TableHead className="font-bold text-center">Rating</TableHead>
                      <TableHead className="font-bold text-right">Records</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEmployees.map(emp => (
                      <TableRow key={emp.id} className="hover:bg-slate-50">
                        <TableCell>
                          <div className="font-bold text-slate-900">{emp.name}</div>
                          <div className="text-xs text-slate-500">ID: {emp.id.split('-')[0]}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm font-bold text-slate-700">{emp.department || 'Unassigned'}</div>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 uppercase">{emp.role?.replace('_', ' ')}</span>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm text-slate-600">{emp.email}</div>
                          <div className="text-xs text-slate-500">{emp.phone || 'No phone'}</div>
                        </TableCell>
                        <TableCell className="text-sm font-medium text-slate-700">{formatDate(emp.join_date)}</TableCell>
                        <TableCell className="text-center">
                          <span className="inline-flex items-center gap-1 font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded">
                            <Star className="w-3.5 h-3.5 fill-amber-500"/> {emp.rating || '0.0'}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button onClick={() => handleViewProfile(emp)} variant="outline" className="h-8 text-xs border-indigo-200 text-indigo-700 hover:bg-indigo-50">
                            <Eye className="w-3 h-3 mr-1" /> View Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredEmployees.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-center p-12 text-slate-500">No employees match your search criteria.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* FULL PROFILE MODAL (Includes Active Projects Fix) */}
        {viewProfile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <Card className="w-full max-w-3xl shadow-2xl border-none animate-fade-in overflow-hidden">
              <div className="bg-slate-900 p-6 text-white flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-bold">{viewProfile.name}</h2>
                  <p className="text-slate-400">{viewProfile.department} | {viewProfile.role?.replace('_', ' ')}</p>
                </div>
                <button onClick={() => setViewProfile(null)} className="text-slate-400 hover:text-white"><X className="w-6 h-6"/></button>
              </div>
              
              <CardContent className="p-6 max-h-[75vh] overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Left Column: Core Info */}
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Contact Info</h3>
                      <div className="space-y-3 text-sm text-slate-700">
                        <p className="flex items-center gap-3"><MapPin className="w-4 h-4 text-slate-400"/> {viewProfile.address || 'Not provided'}</p>
                        <p className="flex items-center gap-3"><Phone className="w-4 h-4 text-slate-400"/> {viewProfile.phone || 'Not provided'}</p>
                      </div>
                    </div>
                    
                    <div className="pt-4 border-t">
                      <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Professional Info</h3>
                      <div className="space-y-3 text-sm text-slate-700">
                        <p className="flex items-center gap-3"><Calendar className="w-4 h-4 text-slate-400"/> Joined: <strong className="text-slate-900">{formatDate(viewProfile.join_date)}</strong></p>
                        <p className="flex items-center gap-3"><Star className="w-4 h-4 text-amber-500"/> Rating: <strong className="text-slate-900">{viewProfile.rating || 'N/A'} / 5.0</strong></p>
                      </div>
                    </div>

                    {/* NEW SECTION: Active Projects (Flaw 3 Fix) */}
                    <div className="pt-4 border-t">
                      <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <FolderKanban className="w-4 h-4" /> Active Assignments
                      </h3>
                      {activeProjects.length > 0 ? (
                        <ul className="space-y-2">
                          {activeProjects.map(task => (
                            <li key={task.id} className="bg-blue-50 border border-blue-100 p-3 rounded-md text-sm">
                              <div className="font-bold text-blue-900 mb-1">{task.title}</div>
                              <div className="flex justify-between text-xs text-blue-700">
                                <span>Project: {task.projects?.name || 'General Task'}</span>
                                <span className="font-bold">{calculateDaysActive(task.created_at)} days active</span>
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-slate-500 italic bg-slate-50 p-3 rounded border border-slate-100">Currently unassigned or all projects completed.</p>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Resume Details */}
                  <div className="space-y-4 bg-slate-50 p-5 rounded-xl border border-slate-100">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Resume Data</h3>
                    <div className="space-y-4">
                      <div>
                        <p className="flex items-center gap-1 text-xs font-bold text-slate-500 mb-1"><GraduationCap className="w-3.5 h-3.5"/> Education</p>
                        <p className="text-sm text-slate-800 font-medium">{viewProfile.education || 'No data on file'}</p>
                      </div>
                      <div>
                        <p className="flex items-center gap-1 text-xs font-bold text-slate-500 mb-1"><Briefcase className="w-3.5 h-3.5"/> Experience</p>
                        <p className="text-sm text-slate-800 font-medium">{viewProfile.experience || 'No data on file'}</p>
                      </div>
                      <div>
                        <p className="flex items-center gap-1 text-xs font-bold text-slate-500 mb-1"><Star className="w-3.5 h-3.5"/> Core Skills</p>
                        <p className="text-sm text-slate-800 font-medium leading-relaxed">{viewProfile.skills || 'No data on file'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ADD EMPLOYEE MODAL (Includes HR Fixes) */}
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <Card className="w-full max-w-md shadow-2xl border-none animate-fade-in">
              <CardContent className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold text-slate-800">Add New Hire</h2>
                  <button onClick={() => setIsAddModalOpen(false)} className="text-slate-500 hover:text-slate-800"><X className="w-5 h-5"/></button>
                </div>
                <form onSubmit={handleAddUser} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Full Name</Label>
                    <Input required value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <Label>Email Address</Label>
                    <Input required type="email" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>System Role</Label>
                      <select className="w-full p-2.5 border border-slate-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500" value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value})}>
                        <option value="EMPLOYEE">Employee</option>
                        <option value="TEAM_LEAD">Team Lead</option>
                        {/* FLAW 1 FIX: HR Role added */}
                        <option value="HR_ADMIN">HR Representative</option> 
                        <option value="ADMIN">System Admin</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label>Department</Label>
                      <select className="w-full p-2.5 border border-slate-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500" value={newUser.department} onChange={e => setNewUser({...newUser, department: e.target.value})}>
                        <option value="Engineering">Engineering</option>
                        <option value="Design">Design</option>
                        <option value="Sales">Sales</option>
                        <option value="Finance">Finance</option>
                        {/* FLAW 1 FIX: HR Department added */}
                        <option value="Human Resources">Human Resources</option>
                        <option value="Marketing">Marketing</option>
                      </select>
                    </div>
                  </div>
                  <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white mt-4 font-bold h-10">Save to Master Directory</Button>
                </form>
              </CardContent>
            </Card>
          </div>
        )}

      </div>
    </DashboardLayout>
  );
}