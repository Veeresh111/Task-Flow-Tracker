import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/lib/supabase";

export default function MyTeam() {
  const [team, setTeam] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTeam = async () => {
      setLoading(true);
      const { data } = await supabase.from('profiles').select('*').eq('role', 'employee');
      if (data) setTeam(data);
      setLoading(false);
    };
    fetchTeam();
  }, []);

  return (
    <DashboardLayout role="team_lead">
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Team</h1>
          <p className="text-muted-foreground">Manage your department personnel.</p>
        </div>

        <Card className="border-0 shadow-lg">
          <CardHeader><CardTitle>Team Roster</CardTitle></CardHeader>
          <CardContent>
            {loading ? <p className="text-muted-foreground p-4">Loading backend records...</p> : team.length === 0 ? <p className="p-4 text-gray-500">No employees have registered yet.</p> : (
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
                    {team.map(member => (
                      <TableRow key={member.id}>
                        <TableCell className="font-medium">{member?.name || 'N/A'}</TableCell>
                        <TableCell>{member?.email}</TableCell>
                        <TableCell>{member?.department || 'N/A'}</TableCell>
                        <TableCell>{member?.phone || 'N/A'}</TableCell>
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