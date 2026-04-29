import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/lib/supabase";

export default function TeamLeads() {
  const [leads, setLeads] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchLeads = async () => {
      setIsLoading(true);
      const { data, error } = await supabase.from('profiles').select('*').eq('role', 'team_lead').order('created_at', { ascending: false });
      if (!error && data) setLeads(data);
      setIsLoading(false);
    };
    fetchLeads();
  }, []);

  return (
    <DashboardLayout role="admin">
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Team Leads Directory</h1>
          <p className="text-muted-foreground">View your active managers.</p>
        </div>

        <Card className="border-0 shadow-lg">
          <CardHeader><CardTitle>Active Managers</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <p className="text-center p-8 text-gray-500">Loading data...</p> : leads.length === 0 ? <p className="text-center p-8 text-gray-500">No team leads found.</p> : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader className="bg-gray-50">
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Phone</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leads.map((lead) => (
                      <TableRow key={lead.id}>
                        <TableCell className="font-medium">{lead?.name || "No Name"}</TableCell>
                        <TableCell>{lead?.email}</TableCell>
                        <TableCell>{lead?.department || "No Dept"}</TableCell>
                        <TableCell>{lead?.phone || "No Phone"}</TableCell>
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