import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Loader2, UserCircle, UserX, ShieldAlert } from "lucide-react";

export default function AdminTeamLeads() {
  const { toast } = useToast();
  const [teamLeads, setTeamLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('profiles').select('*').order('name', { ascending: true });
    
    if (!error && data) {
      // Filter dynamically to avoid case-sensitivity bugs
      const tls = data.filter(p => p.role && (p.role.toUpperCase() === 'TEAM_LEAD' || p.role.toUpperCase() === 'TL'));
      setTeamLeads(tls);
    }
    setLoading(false);
  };

  // TERMINATION LOGIC
  const handleTerminate = async (id: string, name: string) => {
    if (!window.confirm(`CRITICAL WARNING: Are you absolutely sure you want to terminate Manager ${name}? \n\nNote: Employees assigned to this manager will need to be reassigned.`)) return;
    
    setLoading(true);
    try {
      // Archiving them triggers the firewall in DashboardLayout to kick them out
      const { error } = await supabase.from('profiles').update({ role: 'ARCHIVED' }).eq('id', id);
      if (error) throw error;
      toast({ title: "Manager Terminated", description: `${name}'s access has been permanently revoked.`, variant: "destructive" });
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
              <UserCircle className="w-8 h-8 text-purple-600" /> Leadership Directory
            </h1>
            <p className="text-slate-500 mt-1">Manage executive access and leadership status.</p>
          </div>
        </div>

        <Card className="shadow-sm border-slate-200">
          <CardContent className="p-0">
            {loading ? <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-purple-600" /></div> : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="font-bold text-slate-600">Manager Details</TableHead>
                      <TableHead className="font-bold text-slate-600">System Role</TableHead>
                      <TableHead className="font-bold text-right text-slate-600">Administrative Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teamLeads.map(tl => (
                      <TableRow key={tl.id} className="hover:bg-slate-50">
                        <TableCell>
                          <div className="font-bold text-slate-900">{tl.name}</div>
                          <div className="text-xs text-slate-500">{tl.email}</div>
                        </TableCell>
                        <TableCell>
                          <span className="px-3 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-700">
                            Department Head
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button onClick={() => handleTerminate(tl.id, tl.name)} variant="destructive" className="h-8 text-xs bg-red-600 hover:bg-red-700">
                            <UserX className="w-3 h-3 mr-1" /> Terminate
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {teamLeads.length === 0 && (
                      <TableRow><TableCell colSpan={3} className="text-center p-8 text-slate-500">No active Team Leads found in the system.</TableCell></TableRow>
                    )}
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