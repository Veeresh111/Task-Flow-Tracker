import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Loader2, Users, UserCircle, Edit, UserX, X, ShieldAlert } from "lucide-react";

export default function AdminEmployees() {
  const { toast } = useToast();
  const [employees, setEmployees] = useState<any[]>([]);
  const [teamLeads, setTeamLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmpId, setEditingEmpId] = useState<string | null>(null);
  const [selectedTL, setSelectedTL] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('profiles').select('*').order('name', { ascending: true });
    
    if (!error && data) {
      // Filter dynamically to avoid case-sensitivity bugs
      const emps = data.filter(p => p.role && p.role.toUpperCase() === 'EMPLOYEE');
      const tls = data.filter(p => p.role && (p.role.toUpperCase() === 'TEAM_LEAD' || p.role.toUpperCase() === 'TL'));
      
      setEmployees(emps);
      setTeamLeads(tls);
    }
    setLoading(false);
  };

  const getTeamLeadName = (tlId: string) => {
    if (!tlId) return "Unassigned";
    const tl = teamLeads.find(t => t.id === tlId);
    return tl ? tl.name : "Unassigned";
  };

  // ASSIGNMENT LOGIC
  const openAssignModal = (empId: string, currentTlId: string) => {
    setEditingEmpId(empId);
    setSelectedTL(currentTlId || "");
    setIsModalOpen(true);
  };

  const saveAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmpId) return;
    setLoading(true);
    
    try {
      const { error } = await supabase.from('profiles').update({ team_lead_id: selectedTL || null }).eq('id', editingEmpId);
      if (error) throw error;
      toast({ title: "Hierarchy Updated", description: "The employee has been reassigned successfully." });
      setIsModalOpen(false);
      fetchData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setLoading(false);
    }
  };

  // TERMINATION LOGIC
  const handleTerminate = async (id: string, name: string) => {
    if (!window.confirm(`CRITICAL WARNING: Are you absolutely sure you want to terminate ${name}? This will instantly revoke their system access.`)) return;
    
    setLoading(true);
    try {
      // Archiving them triggers the firewall in DashboardLayout to kick them out
      const { error } = await supabase.from('profiles').update({ role: 'ARCHIVED' }).eq('id', id);
      if (error) throw error;
      toast({ title: "Employee Terminated", description: `${name}'s access has been permanently revoked.`, variant: "destructive" });
      fetchData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setLoading(false);
    }
  };

  return (
    <DashboardLayout role="admin">
      <div className="max-w-6xl mx-auto space-y-6 animate-fade-in pb-12">
        
        <div className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <Users className="w-8 h-8 text-blue-600" /> Employee Directory
            </h1>
            <p className="text-slate-500 mt-1">Manage team assignments and employment status.</p>
          </div>
        </div>

        <Card className="shadow-sm border-slate-200">
          <CardContent className="p-0">
            {loading ? <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div> : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="font-bold text-slate-600">Employee Details</TableHead>
                      <TableHead className="font-bold text-slate-600">Assigned Team Lead</TableHead>
                      <TableHead className="font-bold text-right text-slate-600">Administrative Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employees.map(emp => (
                      <TableRow key={emp.id} className="hover:bg-slate-50">
                        <TableCell>
                          <div className="font-bold text-slate-900">{emp.name}</div>
                          <div className="text-xs text-slate-500">{emp.email}</div>
                        </TableCell>
                        <TableCell>
                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${emp.team_lead_id ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-500'}`}>
                            <UserCircle className="w-3 h-3 inline mr-1" />
                            {getTeamLeadName(emp.team_lead_id)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button onClick={() => openAssignModal(emp.id, emp.team_lead_id)} variant="outline" className="h-8 text-xs border-blue-200 text-blue-700 hover:bg-blue-50">
                              <Edit className="w-3 h-3 mr-1" /> Assign Manager
                            </Button>
                            <Button onClick={() => handleTerminate(emp.id, emp.name)} variant="destructive" className="h-8 text-xs bg-red-600 hover:bg-red-700">
                              <UserX className="w-3 h-3 mr-1" /> Terminate
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {employees.length === 0 && (
                      <TableRow><TableCell colSpan={3} className="text-center p-8 text-slate-500">No active employees found in the system.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* REASSIGNMENT MODAL */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <Card className="w-full max-w-md shadow-2xl border-none animate-fade-in">
              <CardContent className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold text-slate-800">Assign Team Lead</h2>
                  <button onClick={() => setIsModalOpen(false)} className="text-slate-500 hover:text-slate-800"><X className="w-5 h-5"/></button>
                </div>
                <form onSubmit={saveAssignment} className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-slate-600">Select Manager</Label>
                    <select className="w-full p-2.5 border border-slate-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500" value={selectedTL} onChange={e => setSelectedTL(e.target.value)}>
                      <option value="">-- Unassigned --</option>
                      {teamLeads.map(tl => (
                        <option key={tl.id} value={tl.id}>{tl.name}</option>
                      ))}
                    </select>
                  </div>
                  <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white mt-4">Save Assignment</Button>
                </form>
              </CardContent>
            </Card>
          </div>
        )}

      </div>
    </DashboardLayout>
  );
}