import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";

export default function MyTeam() {
  const { profile } = useAuth();
  const [team, setTeam] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTeam = async () => {
      if (!profile) return;
      setLoading(true);
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'employee')
        .eq('team_lead_id', profile.id)
        .eq('approval_status', 'approved')
        .order('created_at', { ascending: false });
      if (data) setTeam(data);
      setLoading(false);
    };
    fetchTeam();
  }, [profile?.id]);

  return (
    <DashboardLayout role="team_lead" userName={profile?.name || "Team Lead"} userEmail={profile?.email || ""}>
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
