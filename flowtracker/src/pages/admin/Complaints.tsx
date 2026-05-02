import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Loader2, AlertCircle, CheckCircle } from "lucide-react";

export default function Complaints() {
  const { toast } = useToast();
  const [complaints, setComplaints] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchComplaints = async () => {
    setLoading(true);
    // Fetch complaints and the names of the users who submitted them
    const { data } = await supabase
      .from('complaints')
      .select('*, profiles(name, role)')
      .order('created_at', { ascending: false });
    
    if (data) setComplaints(data);
    setLoading(false);
  };

  useEffect(() => { fetchComplaints(); }, []);

  // REAL CONNECTION: Admin can resolve complaints
  const resolveComplaint = async (id: string) => {
    try {
      const { error } = await supabase.from('complaints').update({ status: 'Resolved' }).eq('id', id);
      if (error) throw error;
      
      toast({ title: "Complaint Resolved!" });
      setComplaints(complaints.map(c => c.id === id ? { ...c, status: 'Resolved' } : c));
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <DashboardLayout role="admin">
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">System Complaints</h1>
          <p className="text-muted-foreground">Manage and resolve issues submitted by your team.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3 mb-6">
          <Card className="border-0 shadow-sm bg-red-50 text-red-900 border-l-4 border-l-red-500">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-bold">Total Pending</CardTitle></CardHeader>
            <CardContent className="text-3xl font-black">{complaints.filter(c => c.status === 'Pending').length}</CardContent>
          </Card>
          <Card className="border-0 shadow-sm bg-green-50 text-green-900 border-l-4 border-l-green-500">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-bold">Total Resolved</CardTitle></CardHeader>
            <CardContent className="text-3xl font-black">{complaints.filter(c => c.status === 'Resolved').length}</CardContent>
          </Card>
        </div>

        <Card className="shadow-lg border-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><AlertCircle className="w-5 h-5 text-red-500"/> Complaints Inbox</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div> : complaints.length === 0 ? <p className="text-center text-gray-500 p-8">No complaints in the system. Great job!</p> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Submitted By</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {complaints.map(complaint => (
                    <TableRow key={complaint.id}>
                      <TableCell className="font-medium">
                        {complaint.profiles?.name || "Unknown"} <br/>
                        <span className="text-[10px] uppercase text-gray-400">{complaint.profiles?.role}</span>
                      </TableCell>
                      <TableCell className="font-bold text-gray-900">{complaint.subject}</TableCell>
                      <TableCell className="text-gray-600 max-w-xs truncate">{complaint.message}</TableCell>
                      <TableCell>
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${complaint.status === 'Resolved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {complaint.status}
                        </span>
                      </TableCell>
                      <TableCell>
                        {complaint.status !== 'Resolved' && (
                          <Button onClick={() => resolveComplaint(complaint.id)} size="sm" className="bg-emerald-500 hover:bg-emerald-600 text-white">
                            <CheckCircle className="w-4 h-4 mr-2" /> Mark Resolved
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}