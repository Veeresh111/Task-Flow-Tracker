import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { authService } from "@/lib/auth";

export default function Employees() {
  const { toast } = useToast();
  const [users, setUsers] = useState<any[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', password: '', role: 'employee', department: 'Engineering' });

  const fetchUsers = async () => {
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (data) setUsers(data);
  };

  useEffect(() => { fetchUsers(); }, []);

  const updateRole = async (id: string, role: string) => {
    await supabase.from('profiles').update({ role }).eq('id', id);
    setUsers(users.map(u => u.id === id ? { ...u, role } : u));
    toast({ title: "Role Updated" });
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await authService.adminCreateUser(formData);
      toast({ title: "User Added" });
      setShowAdd(false);
      fetchUsers();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <DashboardLayout role="admin">
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">User Management</h1>
          <Button onClick={() => setShowAdd(!showAdd)} className="bg-blue-600 text-white">{showAdd ? "Cancel" : "+ Add User"}</Button>
        </div>

        {showAdd && (
          <Card className="bg-blue-50/50 border-blue-200">
            <CardHeader><CardTitle>Create New User</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={handleAdd} className="grid grid-cols-2 gap-4">
                <Input placeholder="Name" required onChange={e => setFormData({...formData, name: e.target.value})} />
                <Input type="email" placeholder="Email" required onChange={e => setFormData({...formData, email: e.target.value})} />
                <Input type="password" placeholder="Password (min 6)" required onChange={e => setFormData({...formData, password: e.target.value})} />
                <Select onValueChange={val => setFormData({...formData, role: val})} defaultValue="employee">
                  <SelectTrigger><SelectValue placeholder="Role" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employee">Employee</SelectItem>
                    <SelectItem value="team_lead">Team Lead</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
                <Button type="submit" className="col-span-2 bg-blue-600 text-white">Create User</Button>
              </form>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle>All Employees</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Change Role</TableHead></TableRow></TableHeader>
              <TableBody>
                {users.map(u => (
                  <TableRow key={u.id}>
                    <TableCell>{u.name || "N/A"}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell className="uppercase text-xs font-bold text-gray-500">{u.role}</TableCell>
                    <TableCell>
                      <Select value={u.role || 'employee'} onValueChange={v => updateRole(u.id, v)}>
                        <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
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
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}