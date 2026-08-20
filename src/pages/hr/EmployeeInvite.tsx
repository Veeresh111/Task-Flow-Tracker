import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail, UserPlus, CheckCircle2, AlertCircle, Send } from "lucide-react";

export default function EmployeeInvite() {
  useEffect(() => { document.title = "Invite Employee - FWC"; }, []);
  const navigate = useNavigate();
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    role: "employee",
    department: "Engineering",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ success: boolean; message: string } | null>(null);
  const [existingInvites, setExistingInvites] = useState<any[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(true);

  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    fetchProfile();
    fetchInvites();
  }, []);

  const fetchProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("profiles").select("id, role").eq("id", user.id).single();
    setProfile(data);
  };

  const fetchInvites = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("id, name, email, role, department, employment_status, created_at")
      .eq("employment_status", "invited")
      .order("created_at", { ascending: false });
    if (data) setExistingInvites(data);
    setLoadingInvites(false);
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setInviteResult(null);

    try {
      const inviteId = crypto.randomUUID();
      const { error: insertErr } = await supabase.from("profiles").insert({
        id: inviteId,
        name: formData.name,
        email: formData.email,
        role: formData.role,
        department: formData.department,
        employment_status: "invited",
        verification_status: "pending",
      });

      if (insertErr) {
        if (insertErr.message.includes("violates row-level security") || insertErr.code === "PGRST104") {
          setInviteResult({
            success: false,
            message: "You don't have permission to create employee profiles directly. Please ask an admin to create the employee profile, or use the registration page for new candidates.",
          });
          return;
        }
        throw insertErr;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("notifications").insert({
          user_id: user.id,
          title: "Employee Invitation Sent",
          message: `Invitation sent to ${formData.name} (${formData.email}) as ${formData.role}. They will need to register and claim their account.`,
          is_read: false,
        });
      }

      setInviteResult({
        success: true,
        message: `Invitation created for ${formData.name}. They can register at /register and an admin will assign their role.`,
      });
      setFormData({ name: "", email: "", role: "employee", department: "Engineering" });
      fetchInvites();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const isAdmin = profile?.role === "admin";

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in pb-12">
      <div className="flex items-center justify-between bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <UserPlus className="w-8 h-8 text-blue-600" /> Employee Invitations
          </h1>
          <p className="text-slate-500 mt-1">Create and manage employee account invitations.</p>
        </div>
        <Button variant="outline" onClick={() => navigate(isAdmin ? "/admin/employees" : "/hr/directory")} className="gap-2">
          <Mail className="w-4 h-4" /> Employee Directory
        </Button>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Invite New Employee</CardTitle>
            <CardDescription>Send an invitation for an employee to join the system.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleInvite} className="space-y-4">
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input required value={formData.name} onChange={e => setFormData(f => ({ ...f, name: e.target.value }))} placeholder="Jane Doe" />
              </div>
              <div className="space-y-2">
                <Label>Email Address</Label>
                <Input required type="email" value={formData.email} onChange={e => setFormData(f => ({ ...f, email: e.target.value }))} placeholder="jane@company.com" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Role</Label>
                  <select className="w-full p-2.5 border border-slate-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500" value={formData.role} onChange={e => setFormData(f => ({ ...f, role: e.target.value }))}>
                    <option value="employee">Employee</option>
                    <option value="hr">HR</option>
                    <option value="team_lead">Team Lead</option>
                    <option value="payroll">Payroll</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Department</Label>
                  <select className="w-full p-2.5 border border-slate-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500" value={formData.department} onChange={e => setFormData(f => ({ ...f, department: e.target.value }))}>
                    <option value="Engineering">Engineering</option>
                    <option value="Design">Design</option>
                    <option value="Sales">Sales</option>
                    <option value="Finance">Finance</option>
                    <option value="Human Resources">Human Resources</option>
                    <option value="Marketing">Marketing</option>
                  </select>
                </div>
              </div>

              <Button type="submit" disabled={isLoading} className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-2">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Send Invitation
              </Button>
            </form>

            {inviteResult && (
              <div className={`mt-4 p-3 rounded-lg flex gap-2 items-start text-sm ${inviteResult.success ? "bg-green-50 text-green-800 border border-green-200" : "bg-amber-50 text-amber-800 border border-amber-200"}`}>
                {inviteResult.success ? <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" /> : <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />}
                <span>{inviteResult.message}</span>
              </div>
            )}

            <div className="mt-6 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <p className="text-xs font-medium text-slate-600 mb-1">Invitation Flow:</p>
              <ol className="text-xs text-slate-500 space-y-1 list-decimal list-inside">
                <li>Admin or HR creates invitation profile with role/department</li>
                <li>Employee registers at /register as a candidate</li>
                <li>Admin/HR updates the employee's role in the Employee Directory</li>
                <li>Employee accesses their assigned portal</li>
              </ol>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Pending Invitations</CardTitle>
            <CardDescription>Employees who haven't claimed their accounts yet.</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingInvites ? (
              <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
            ) : existingInvites.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <UserPlus className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                <p className="font-medium">No pending invitations</p>
                <p className="text-sm">Use the form to invite new employees.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {existingInvites.map(inv => (
                  <div key={inv.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <div>
                      <p className="font-medium text-sm text-slate-800">{inv.name}</p>
                      <p className="text-xs text-slate-500">{inv.email} — {inv.role}</p>
                    </div>
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-medium">
                      Pending
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
