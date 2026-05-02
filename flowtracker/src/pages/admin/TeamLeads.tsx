import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";

export default function TeamLeads() {
  const { toast } = useToast();
  const [teamLeads, setTeamLeads] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchTeamLeads = async () => {
      try {
        setIsLoading(true);
        // ONLY fetch users who have been promoted to team_lead
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('role', 'team_lead')
          .order('created_at', { ascending: false });
          
        if (error) throw error;
        setTeamLeads(data || []);
      } catch (error: any) {
        toast({ title: "Database Error", description: error.message, variant: "destructive" });
      } finally {
        setIsLoading(false);
      }
    };
    fetchTeamLeads();
  }, [toast]);

  return (
    <DashboardLayout role="admin">
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Team Leads Directory</h1>
          <p className="text-muted-foreground">View all officially promoted managers in the startup.</p>
        </div>

        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle>Active Managers</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="p-8 text-center text-gray-500">Loading managers...</div>
            ) : teamLeads.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                No Team Leads found. Go to the Employees tab to promote someone!
              </div>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader className="bg-gray-50">
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Phone Number</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teamLeads.map((lead) => (
                      <TableRow key={lead.id}>
                        <TableCell className="font-medium">{lead.name || "N/A"}</TableCell>
                        <TableCell>{lead.email}</TableCell>
                        <TableCell>{lead.department || "N/A"}</TableCell>
                        <TableCell>{lead.phone || "N/A"}</TableCell>
                      </TableRow>
                    ))}
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