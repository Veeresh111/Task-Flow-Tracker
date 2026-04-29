import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";

export default function Employees() {
  const { toast } = useToast();
  const [users, setUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchUsers = async () => {
      setIsLoading(true);
      const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
      if (!error && data) setUsers(data);
      setIsLoading(false);
    };
    fetchUsers();
  }, []);

  const updateRole = async (userId: string, newRole: string) => {
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
    if (!error) {
      setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
      toast({ title: "Role Updated", description: "Successfully changed user role." });
    } else {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  return (
    <DashboardLayout role="admin">
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Employees Directory</h1>
          <p className="text-muted-foreground">Manage real startup members here.</p>
        </div>

        <Card className="border-0 shadow-lg">
          <CardHeader><CardTitle>All Startup Personnel</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <p className="text-center p-8 text-gray-500">Loading data...</p> : users.length === 0 ? <p className="text-center p-8 text-gray-500">No users yet.</p> : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader className="bg-gray-50">
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Current Role</TableHead>
                      <TableHead className="w-[180px]">Change Role</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user?.name || "No Name"}</TableCell>
                        <TableCell>{user?.email}</TableCell>
                        <TableCell>{user?.department || "No Dept"}</TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 rounded text-xs font-bold ${user?.role === 'admin' ? 'bg-purple-100 text-purple-700' : user?.role === 'team_lead' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>
                            {user?.role?.toUpperCase() || 'UNKNOWN'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Select value={user?.role || "employee"} onValueChange={(val) => updateRole(user.id, val)}>
                            <SelectTrigger className="h-8"><SelectValue placeholder="Role" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="team_lead">Team Lead</SelectItem>
                              <SelectItem value="employee">Employee</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
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