import { useState, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import {
  Users, Loader2, Search, Filter, ShieldCheck, UserCheck, AlertTriangle,
  XCircle, CheckCircle2, Clock, MessageSquare, RefreshCw,
  Briefcase, FileText
} from "lucide-react";

type UserType = "candidate_with_application" | "new_registration_no_application" | "onboarded_employee" | "pending_activation" | "rejected" | "all";

interface VerifiedUser {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  department: string;
  employment_status: string;
  registered_at: string;
  user_type: UserType;
  application_status: string | null;
  applied_position: string | null;
  match_score: number | null;
  assigned_recruiter: string | null;
  employee_code: string | null;
  payroll_ctc: number | null;
  candidate_id: string | null;
  team_lead_id: string | null;
}

const USER_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  candidate_with_application: { label: "Candidate (Has Application)", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  new_registration_no_application: { label: "New User (No Application)", color: "bg-amber-100 text-amber-700 border-amber-200" },
  onboarded_employee: { label: "Onboarded Employee", color: "bg-blue-100 text-blue-700 border-blue-200" },
  pending_activation: { label: "Pending Activation", color: "bg-purple-100 text-purple-700 border-purple-200" },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-700 border-red-200" },
};

export default function UserVerification() {
  const { toast } = useToast();
  const [users, setUsers] = useState<VerifiedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedUser, setSelectedUser] = useState<VerifiedUser | null>(null);
  const [processingAction, setProcessingAction] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [hrUsers, setHrUsers] = useState<any[]>([]);
  const [stats, setStats] = useState({
    total: 0, candidates: 0, newUsers: 0, onboarded: 0, pending: 0, rejected: 0
  });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setCurrentUserId(data.user.id);
    });
    fetchUsers();
    fetchHRUsers();
  }, []);

  const fetchHRUsers = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("id, name")
      .in("role", ["hr", "admin"]);
    setHrUsers(data || []);
  };

  const classifyUser = (profile: any, application: any, onboarding: any): UserType => {
    if (profile.status === "rejected") return "rejected";
    if (profile.status === "pending_activation") return "pending_activation";
    if (profile.role === "employee" || profile.role === "team_lead" || profile.role === "admin" || profile.role === "hr") {
      if (onboarding || profile.employment_status === "active") return "onboarded_employee";
    }
    if (profile.role === "candidate" && application) return "candidate_with_application";
    if (profile.role === "candidate" && !application) return "new_registration_no_application";
    return "new_registration_no_application";
  };

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;

      const { data: applications } = await supabase
        .from("job_applications")
        .select("id, candidate_id, candidate_email, status, form_id, match_score, assigned_recruiter, created_at")
        .order("created_at", { ascending: false });

      const { data: jobForms } = await supabase
        .from("job_forms")
        .select("id, job_title");

      const { data: onboardings } = await supabase
        .from("candidate_onboarding")
        .select("candidate_id, employee_code");

      const { data: candidates } = await supabase
        .from("candidates")
        .select("id, email, profile_id");

      const formMap = new Map((jobForms || []).map(f => [f.id, f.job_title]));
      const onboardingMap = new Map((onboardings || []).map(o => [o.candidate_id, o.employee_code]));
      const candidateEmailMap = new Map((candidates || []).map(c => [c.email?.toLowerCase(), c.id]));

      const appByEmail = new Map<string, any>();
      const appByCandidateId = new Map<string, any>();
      (applications || []).forEach(app => {
        if (app.candidate_email) appByEmail.set(app.candidate_email.toLowerCase(), app);
        if (app.candidate_id) appByCandidateId.set(app.candidate_id, app);
      });

      const verifiedUsers: VerifiedUser[] = (profiles || []).map(profile => {
        const email = (profile.email || "").toLowerCase();
        const application = appByEmail.get(email) || appByCandidateId.get(profile.id) || appByCandidateId.get(profile.candidate_id || "");
        const candidateId = candidateEmailMap.get(email) || profile.candidate_id;
        const onboarding = onboardingMap.get(profile.id) || onboardingMap.get(candidateId || "");
        const userType = classifyUser(profile, application, onboarding);

        return {
          id: profile.id,
          email: profile.email || "",
          name: profile.name || profile.full_name || "Unknown",
          role: profile.role || "unknown",
          status: profile.status || "active",
          department: profile.department || "Unassigned",
          employment_status: profile.employment_status || "active",
          registered_at: profile.created_at,
          user_type: userType,
          application_status: application?.status || null,
          applied_position: application ? (formMap.get(application.form_id) || "Unknown Position") : null,
          match_score: application?.match_score || null,
          assigned_recruiter: application?.assigned_recruiter || profile.assigned_recruiter || null,
          employee_code: onboarding || null,
          payroll_ctc: profile.payroll_ctc || null,
          candidate_id: candidateId || null,
          team_lead_id: profile.team_lead_id || null,
        };
      });

      setUsers(verifiedUsers);
      setStats({
        total: verifiedUsers.length,
        candidates: verifiedUsers.filter(u => u.user_type === "candidate_with_application").length,
        newUsers: verifiedUsers.filter(u => u.user_type === "new_registration_no_application").length,
        onboarded: verifiedUsers.filter(u => u.user_type === "onboarded_employee").length,
        pending: verifiedUsers.filter(u => u.user_type === "pending_activation").length,
        rejected: verifiedUsers.filter(u => u.user_type === "rejected").length,
      });
    } catch (err: any) {
      toast({ title: "Failed to load users", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const handleRejectUser = async (user: VerifiedUser) => {
    if (!currentUserId) return;
    setProcessingAction(user.id);
    try {
      await supabase.from("profiles").update({ status: "rejected" }).eq("id", user.id);
      await supabase.from("notifications").insert({
        user_id: user.id,
        title: "Account Disapproved",
        message: "Your registration has been reviewed and disapproved. You did not have an active job application associated with your account. Please contact HR if you believe this is an error.",
        is_read: false,
      });
      toast({ title: "User Disapproved", description: `${user.name} has been marked as rejected.` });
      fetchUsers();
    } catch (err: any) {
      toast({ title: "Action Failed", description: err.message, variant: "destructive" });
    } finally {
      setProcessingAction(null);
    }
  };

  const handleApproveUser = async (user: VerifiedUser) => {
    if (!currentUserId) return;
    setProcessingAction(user.id);
    try {
      await supabase.from("profiles").update({ status: "active" }).eq("id", user.id);
      await supabase.from("notifications").insert({
        user_id: user.id, title: "Account Approved",
        message: "Your account has been approved. You can now access the portal.", is_read: false,
      });
      toast({ title: "User Approved", description: `${user.name} has been activated.` });
      fetchUsers();
    } catch (err: any) {
      toast({ title: "Action Failed", description: err.message, variant: "destructive" });
    } finally {
      setProcessingAction(null);
    }
  };

  const handleAssignRecruiter = async (user: VerifiedUser, recruiterId: string) => {
    setProcessingAction(`assign_${user.id}`);
    try {
      if (user.candidate_id) {
        await supabase.from("job_applications").update({ assigned_recruiter: recruiterId }).eq("candidate_id", user.candidate_id);
      }
      await supabase.from("profiles").update({ assigned_recruiter: recruiterId }).eq("id", user.id);
      toast({ title: "Recruiter Assigned", description: `HR handler assigned for ${user.name}.` });
      fetchUsers();
    } catch (err: any) {
      toast({ title: "Assignment Failed", description: err.message, variant: "destructive" });
    } finally {
      setProcessingAction(null);
    }
  };

  const filteredUsers = users.filter(user => {
    if (filterType !== "all" && user.user_type !== filterType) return false;
    if (filterStatus !== "all" && user.status !== filterStatus) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return user.name.toLowerCase().includes(q) || user.email.toLowerCase().includes(q) ||
        user.department.toLowerCase().includes(q) || (user.applied_position || "").toLowerCase().includes(q) ||
        (user.employee_code || "").toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <DashboardLayout role="hr">
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in pb-12">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="text-indigo-600" /> User Verification & Classification
            </h1>
            <p className="text-slate-500 mt-1">
              Cross-verify user type, application status, and manage approvals. Real-time classification from database.
            </p>
          </div>
          <Button onClick={fetchUsers} disabled={loading} variant="outline" className="gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card className="shadow-sm border-l-4 border-l-slate-400"><CardContent className="p-4"><p className="text-[10px] font-bold text-slate-500 uppercase">Total</p><p className="text-2xl font-black text-slate-800">{stats.total}</p></CardContent></Card>
          <Card className="shadow-sm border-l-4 border-l-emerald-500"><CardContent className="p-4"><p className="text-[10px] font-bold text-slate-500 uppercase">Candidates (Has App)</p><p className="text-2xl font-black text-emerald-600">{stats.candidates}</p></CardContent></Card>
          <Card className="shadow-sm border-l-4 border-l-amber-500"><CardContent className="p-4"><p className="text-[10px] font-bold text-slate-500 uppercase">New Users (No App)</p><p className="text-2xl font-black text-amber-600">{stats.newUsers}</p></CardContent></Card>
          <Card className="shadow-sm border-l-4 border-l-blue-500"><CardContent className="p-4"><p className="text-[10px] font-bold text-slate-500 uppercase">Onboarded</p><p className="text-2xl font-black text-blue-600">{stats.onboarded}</p></CardContent></Card>
          <Card className="shadow-sm border-l-4 border-l-purple-500"><CardContent className="p-4"><p className="text-[10px] font-bold text-slate-500 uppercase">Pending</p><p className="text-2xl font-black text-purple-600">{stats.pending}</p></CardContent></Card>
          <Card className="shadow-sm border-l-4 border-l-red-500"><CardContent className="p-4"><p className="text-[10px] font-bold text-slate-500 uppercase">Rejected</p><p className="text-2xl font-black text-red-600">{stats.rejected}</p></CardContent></Card>
        </div>

        <Card className="shadow-sm border-slate-200">
          <CardHeader className="bg-slate-50 border-b pb-4">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <CardTitle className="text-lg text-slate-800 flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-600" /> Registered Users ({filteredUsers.length})
              </CardTitle>
              <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                <div className="relative flex-1 sm:w-48">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input placeholder="Search..." className="pl-10 h-10 text-sm" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                </div>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="w-full sm:w-52 h-10 text-xs"><Filter className="w-3 h-3 mr-1" /><SelectValue placeholder="Filter by type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Users</SelectItem>
                    <SelectItem value="candidate_with_application">Candidate (Has Application)</SelectItem>
                    <SelectItem value="new_registration_no_application">New User (No Application)</SelectItem>
                    <SelectItem value="onboarded_employee">Onboarded Employee</SelectItem>
                    <SelectItem value="pending_activation">Pending Activation</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-full sm:w-32 h-10 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="pending_activation">Pending</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-bold text-[11px]">User</TableHead>
                      <TableHead className="font-bold text-[11px]">Classification</TableHead>
                      <TableHead className="font-bold text-[11px]">Role/Dept</TableHead>
                      <TableHead className="font-bold text-[11px]">App Status</TableHead>
                      <TableHead className="font-bold text-[11px]">Position</TableHead>
                      <TableHead className="font-bold text-[11px]">Score</TableHead>
                      <TableHead className="font-bold text-[11px]">Emp Code</TableHead>
                      <TableHead className="font-bold text-[11px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((user) => (
                      <TableRow key={user.id} className="hover:bg-slate-50 transition-colors">
                        <TableCell>
                          <p className="font-bold text-slate-900 text-sm">{user.name}</p>
                          <p className="text-[10px] text-slate-500 font-mono">{user.email}</p>
                        </TableCell>
                        <TableCell>
                          {user.user_type !== "all" && (
                            <Badge className={`${USER_TYPE_CONFIG[user.user_type]?.color || "bg-slate-100 text-slate-600"} text-[10px] font-bold uppercase tracking-wider`}>
                              {USER_TYPE_CONFIG[user.user_type]?.label || user.user_type}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <p className="text-xs font-medium capitalize">{user.role}</p>
                          <p className="text-[10px] text-slate-500">{user.department}</p>
                        </TableCell>
                        <TableCell>
                          {user.application_status ? (
                            <Badge variant="outline" className="text-[10px] font-bold">{user.application_status}</Badge>
                          ) : <span className="text-[10px] text-slate-400">N/A</span>}
                        </TableCell>
                        <TableCell className="text-xs text-slate-700 max-w-[120px] truncate">{user.applied_position || "\u2014"}</TableCell>
                        <TableCell>
                          {user.match_score !== null ? (
                            <span className={`text-sm font-black ${user.match_score >= 75 ? "text-emerald-600" : "text-amber-500"}`}>{user.match_score}%</span>
                          ) : <span className="text-[10px] text-slate-400">\u2014</span>}
                        </TableCell>
                        <TableCell className="text-xs font-mono text-slate-600">{user.employee_code || "\u2014"}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {(user.user_type === "new_registration_no_application" || user.user_type === "pending_activation") && user.status !== "rejected" && (
                              <>
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600" onClick={() => handleRejectUser(user)} disabled={processingAction === user.id} title="Disapprove">
                                  <XCircle className="w-4 h-4" />
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-emerald-600" onClick={() => handleApproveUser(user)} disabled={processingAction === user.id} title="Approve">
                                  <CheckCircle2 className="w-4 h-4" />
                                </Button>
                              </>
                            )}
                            <Select onValueChange={(v) => handleAssignRecruiter(user, v)}>
                              <SelectTrigger className="h-7 w-7 p-0 border-0" title="Assign HR Handler">
                                <MessageSquare className="w-4 h-4 text-indigo-600" />
                              </SelectTrigger>
                              <SelectContent>
                                {hrUsers.map(hr => (
                                  <SelectItem key={hr.id} value={hr.id}>{hr.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredUsers.length === 0 && (
                      <TableRow><TableCell colSpan={8} className="text-center p-12 text-slate-400">No users found matching filters.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {selectedUser && (
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="bg-indigo-50 border-b">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-600" /> User Details: {selectedUser.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div><p className="text-[10px] font-bold text-slate-500 uppercase">Email</p><p className="font-mono">{selectedUser.email}</p></div>
              <div><p className="text-[10px] font-bold text-slate-500 uppercase">Classification</p><p>{USER_TYPE_CONFIG[selectedUser.user_type]?.label || selectedUser.user_type}</p></div>
              <div><p className="text-[10px] font-bold text-slate-500 uppercase">Role</p><p className="capitalize">{selectedUser.role}</p></div>
              <div><p className="text-[10px] font-bold text-slate-500 uppercase">Department</p><p>{selectedUser.department}</p></div>
              <div><p className="text-[10px] font-bold text-slate-500 uppercase">App Status</p><p>{selectedUser.application_status || "N/A"}</p></div>
              <div><p className="text-[10px] font-bold text-slate-500 uppercase">Applied Position</p><p>{selectedUser.applied_position || "N/A"}</p></div>
              <div><p className="text-[10px] font-bold text-slate-500 uppercase">ATS Score</p><p>{selectedUser.match_score !== null ? `${selectedUser.match_score}%` : "N/A"}</p></div>
              <div><p className="text-[10px] font-bold text-slate-500 uppercase">Employee Code</p><p>{selectedUser.employee_code || "N/A"}</p></div>
              {selectedUser.payroll_ctc && <div><p className="text-[10px] font-bold text-slate-500 uppercase">CTC</p><p>₹{selectedUser.payroll_ctc.toLocaleString("en-IN")}</p></div>}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
