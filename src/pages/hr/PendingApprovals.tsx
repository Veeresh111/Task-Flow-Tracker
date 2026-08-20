import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Users, UserCheck, UserX, Search, CheckCircle2, XCircle, Clock, ExternalLink, Shield, Filter, RefreshCw } from "lucide-react";

type PendingUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  created_at: string;
  candidateRecord: CandidateRecord | null;
};

type CandidateRecord = {
  id: string;
  full_name?: string;
  email?: string;
  applicationId?: string;
  applicationStatus?: string;
  jobTitle?: string;
};

type FilterType = "all" | "candidate" | "normal";

export const timeAgo = (dateStr: string) => {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
};

export default function HrPendingApprovals() {
  const { toast } = useToast();
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [roleAssignments, setRoleAssignments] = useState<Record<string, string>>({});

  useEffect(() => {
    document.title = "Pending Approvals - FWC";
    fetchPendingUsers();
  }, []);

  const fetchPendingUsers = async () => {
    setLoading(true);
    try {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, email, name, role, created_at, status")
        .eq("status", "pending_activation")
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (!profiles || profiles.length === 0) {
        setPendingUsers([]);
        setLoading(false);
        return;
      }

      const emails = profiles.map((p) => p.email).filter(Boolean);
      const candidateMap = new Map<string, CandidateRecord>();

      if (emails.length > 0) {
        const { data: candidates } = await supabase
          .from("candidates")
          .select("id, full_name, email")
          .in("email", emails);

        if (candidates && candidates.length > 0) {
          const candidateIds = candidates.map((c) => c.id);
          const { data: applications } = await supabase
            .from("job_applications")
            .select("id, status, candidate_id, job_forms!left(job_title)")
            .in("candidate_id", candidateIds);

          const appMap = new Map(
            (applications || []).map((a) => [a.candidate_id, a])
          );

          for (const c of candidates) {
            const app = appMap.get(c.id);
            candidateMap.set(c.email, {
              id: c.id,
              full_name: c.full_name,
              email: c.email,
              applicationId: app?.id,
              applicationStatus: app?.status,
              jobTitle: (app as any)?.job_forms?.job_title,
            });
          }
        }
      }

      const enriched: PendingUser[] = profiles.map((p) => ({
        id: p.id,
        email: p.email,
        name: p.name,
        role: p.role,
        created_at: p.created_at,
        candidateRecord: candidateMap.get(p.email) || null,
      }));

      setPendingUsers(enriched);
    } catch (err: any) {
      console.error("Failed to fetch pending users:", err);
      toast({
        title: "Load Failed",
        description: err.message || "Could not load pending users.",
        variant: "destructive",
      });
    }
    setLoading(false);
  };

  const handleApprove = async (user: PendingUser) => {
    const targetRole = roleAssignments[user.id] || "employee";
    setActionLoading(user.id);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ status: "active", role: targetRole })
        .eq("id", user.id);

      if (error) throw error;

      toast({
        title: "User Approved",
        description: `${user.name} has been approved as ${targetRole.replace("_", " ")}.`,
      });

      setPendingUsers((prev) => prev.filter((u) => u.id !== user.id));
    } catch (err: any) {
      toast({
        title: "Approval Failed",
        description: err.message || "Could not approve user.",
        variant: "destructive",
      });
    }
    setActionLoading(null);
  };

  const handleReject = async (user: PendingUser) => {
    const confirmed = window.confirm(
      `Are you sure you want to reject ${user.name} (${user.email})? This action cannot be undone.`
    );
    if (!confirmed) return;

    setActionLoading(user.id);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ status: "rejected" })
        .eq("id", user.id);

      if (error) throw error;

      toast({
        title: "User Rejected",
        description: `${user.name}'s access request has been rejected.`,
      });

      setPendingUsers((prev) => prev.filter((u) => u.id !== user.id));
    } catch (err: any) {
      toast({
        title: "Rejection Failed",
        description: err.message || "Could not reject user.",
        variant: "destructive",
      });
    }
    setActionLoading(null);
  };

  const filteredUsers = pendingUsers.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase());

    if (filter === "candidate") return matchesSearch && u.candidateRecord !== null;
    if (filter === "normal") return matchesSearch && u.candidateRecord === null;
    return matchesSearch;
  });

  const stats = {
    total: pendingUsers.length,
    candidates: pendingUsers.filter((u) => u.candidateRecord !== null).length,
    normal: pendingUsers.filter((u) => u.candidateRecord === null).length,
  };

  return (
    <DashboardLayout role="hr">
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in pb-12">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
              <Shield className="text-indigo-600" /> Pending User Approvals
            </h1>
            <p className="text-slate-500 mt-1">
              Review OAuth users awaiting activation. Cross-verify candidate records and assign roles.
            </p>
          </div>
          <Button
            onClick={fetchPendingUsers}
            variant="outline"
            disabled={loading}
            className="h-9 text-xs font-bold"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="shadow-sm border-b-4 border-b-indigo-500">
            <CardContent className="p-5 flex items-center gap-3">
              <div className="p-3 bg-indigo-50 rounded-full">
                <Clock className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase">Total Pending</p>
                <h2 className="text-2xl font-black text-slate-800">{stats.total}</h2>
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-sm border-b-4 border-b-emerald-500">
            <CardContent className="p-5 flex items-center gap-3">
              <div className="p-3 bg-emerald-50 rounded-full">
                <UserCheck className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase">Has Candidate Record</p>
                <h2 className="text-2xl font-black text-emerald-600">{stats.candidates}</h2>
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-sm border-b-4 border-b-amber-500">
            <CardContent className="p-5 flex items-center gap-3">
              <div className="p-3 bg-amber-50 rounded-full">
                <UserX className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase">No Candidate Record</p>
                <h2 className="text-2xl font-black text-amber-600">{stats.normal}</h2>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="shadow-sm border-slate-200">
          <CardHeader className="bg-slate-50 border-b pb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-500" />
              <div className="flex gap-1">
                {(["all", "candidate", "normal"] as const).map((f) => (
                  <Button
                    key={f}
                    variant={filter === f ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilter(f)}
                    className={`h-8 text-xs font-bold capitalize ${
                      filter === f ? "bg-indigo-600 hover:bg-indigo-700 text-white" : ""
                    }`}
                  >
                    {f === "all" ? `All (${stats.total})` : f === "candidate" ? `Candidates (${stats.candidates})` : `Normal (${stats.normal})`}
                  </Button>
                ))}
              </div>
            </div>
            <Input
              placeholder="Search by name or email..."
              className="w-full md:w-64 h-9 text-sm bg-white border-slate-200"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center p-20">
                <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center p-16 text-slate-400">
                <div className="flex justify-center mb-3">
                  <Users className="w-12 h-12 text-slate-300" />
                </div>
                <p className="font-semibold text-slate-500">
                  {pendingUsers.length === 0
                    ? "No pending approvals"
                    : "No users match the current filter"}
                </p>
                <p className="text-sm mt-1">
                  {pendingUsers.length === 0
                    ? "All OAuth users have been processed."
                    : "Try a different filter or search term."}
                </p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <th className="px-6 py-3">User</th>
                    <th className="px-6 py-3">Registered</th>
                    <th className="px-6 py-3">Candidate Status</th>
                    <th className="px-6 py-3">Role Assignment</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-900">{user.name}</div>
                        <div className="text-xs text-slate-500 font-mono mt-0.5">{user.email}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-slate-600">{timeAgo(user.created_at)}</div>
                        <div className="text-xs text-slate-400">{new Date(user.created_at).toLocaleDateString()}</div>
                      </td>
                      <td className="px-6 py-4">
                        {user.candidateRecord ? (
                          <div className="space-y-1">
                            <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 font-bold text-[10px]">
                              <UserCheck className="w-3 h-3 mr-1" /> Verified Candidate
                            </Badge>
                            {user.candidateRecord.jobTitle && (
                              <div className="text-[11px] text-slate-600 font-medium">
                                Applied for: {user.candidateRecord.jobTitle}
                              </div>
                            )}
                            {user.candidateRecord.applicationStatus && (
                              <div className="text-[10px] text-slate-500">
                                Status: {user.candidateRecord.applicationStatus}
                              </div>
                            )}
                            {user.candidateRecord.applicationId && (
                              <a
                                href={`/hr/applications?id=${user.candidateRecord.applicationId}`}
                                className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold inline-flex items-center gap-0.5"
                              >
                                <ExternalLink className="w-3 h-3" /> View Application
                              </a>
                            )}
                          </div>
                        ) : (
                          <div>
                            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 font-bold text-[10px]">
                              <UserX className="w-3 h-3 mr-1" /> No Candidate Record
                            </Badge>
                            <div className="text-[10px] text-slate-400 mt-1">
                              This user authenticated via OAuth but has no existing candidate profile.
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <select
                          className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                          value={roleAssignments[user.id] || "employee"}
                          onChange={(e) =>
                            setRoleAssignments((prev) => ({
                              ...prev,
                              [user.id]: e.target.value,
                            }))
                          }
                        >
                          <option value="employee">Employee</option>
                          <option value="team_lead">Team Lead</option>
                          <option value="hr">HR</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            onClick={() => handleApprove(user)}
                            disabled={actionLoading === user.id}
                            className="h-9 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                          >
                            {actionLoading === user.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                            )}
                            Approve
                          </Button>
                          <Button
                            onClick={() => handleReject(user)}
                            disabled={actionLoading === user.id}
                            variant="outline"
                            className="h-9 text-xs font-bold text-rose-600 border-rose-200 hover:bg-rose-50"
                          >
                            <XCircle className="w-3.5 h-3.5 mr-1" />
                            Reject
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
