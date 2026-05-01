import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  LayoutDashboard,
  Users,
  CheckCircle2,
  FolderKanban,
  ListTodo,
  AlertTriangle,
  BarChart3,
  Bell,
  MessageSquare,
  Settings,
  Check,
  X,
} from "lucide-react";
import { PresenceStatus, WorkMode } from "@/types";
import { useAuth } from "@/lib/auth-context";
import { listPendingApprovalsForTeamLead, setApprovalStatus, type ProfileSummary } from "@/lib/db/profiles";
import { supabase } from "@/lib/supabase";

const navItems = [
  { title: "Dashboard", href: "/team_lead", icon: LayoutDashboard },
  { title: "My Team", href: "/team_lead/my-team", icon: Users },
  { title: "Approvals", href: "/team_lead/approvals", icon: CheckCircle2 },
  { title: "Projects", href: "/team_lead/projects", icon: FolderKanban },
  { title: "Tasks", href: "/team_lead/tasks", icon: ListTodo },
  { title: "Complaints", href: "/team_lead/complaints", icon: AlertTriangle },
  { title: "Analytics", href: "/team_lead/analytics", icon: BarChart3 },
  { title: "Notifications", href: "/team_lead/notifications", icon: Bell },
  { title: "Chat", href: "/team_lead/chat", icon: MessageSquare },
  { title: "Settings", href: "/team_lead/settings", icon: Settings },
];

export default function Approvals() {
  const { profile } = useAuth();
  const [presenceStatus, setPresenceStatus] = useState<PresenceStatus>("offline");
  const [workMode, setWorkMode] = useState<WorkMode | undefined>(undefined);

  const [pending, setPending] = useState<ProfileSummary[]>([]);
  const [recent, setRecent] = useState<{ id: string; name: string; email: string; status: "approved" | "rejected"; at: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const handlePresenceChange = (status: PresenceStatus, mode?: WorkMode) => {
    setPresenceStatus(status);
    setWorkMode(mode);
  };

  const fetchAll = async () => {
    if (!profile) return;
    setLoading(true);

    const pRes = await listPendingApprovalsForTeamLead(profile.id);
    setPending(pRes.data ?? []);

    const { data: recentRows } = await supabase
      .from("profiles")
      .select("id,name,email,approval_status,updated_at")
      .eq("role", "employee")
      .eq("team_lead_id", profile.id)
      .in("approval_status", ["approved", "rejected"])
      .order("updated_at", { ascending: false })
      .limit(10);

    setRecent(
      (recentRows ?? []).map((r) => ({
        id: r.id,
        name: r.name || r.email,
        email: r.email,
        status: r.approval_status,
        at: r.updated_at,
      }))
    );

    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const approve = async (id: string) => {
    const res = await setApprovalStatus(id, "approved");
    if (res.error) return;
    fetchAll();
  };

  const reject = async (id: string) => {
    const res = await setApprovalStatus(id, "rejected");
    if (res.error) return;
    fetchAll();
  };

  const approvedThisWeek = useMemo(() => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return recent.filter((r) => r.status === "approved" && new Date(r.at).getTime() >= weekAgo).length;
  }, [recent]);

  const rejectedThisWeek = useMemo(() => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return recent.filter((r) => r.status === "rejected" && new Date(r.at).getTime() >= weekAgo).length;
  }, [recent]);

  return (
    <DashboardLayout
      role="team_lead"
      navItems={navItems}
      userName={profile?.name || "Team Lead"}
      userEmail={profile?.email || ""}
      presenceStatus={presenceStatus}
      workMode={workMode}
      onPresenceChange={handlePresenceChange}
    >
      <div className="page-header">
        <h1 className="page-title">Approvals</h1>
        <p className="page-description">Approve or reject employee registration requests</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-status-pending">{pending.length}</div>
            <p className="text-sm text-muted-foreground">Pending Requests</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-status-completed">{approvedThisWeek}</div>
            <p className="text-sm text-muted-foreground">Approved This Week</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-status-blocked">{rejectedThisWeek}</div>
            <p className="text-sm text-muted-foreground">Rejected This Week</p>
          </CardContent>
        </Card>
      </div>

      {/* Pending Approvals */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Pending Requests</CardTitle>
          <CardDescription>Review and approve new team member registrations</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center text-muted-foreground py-8">Loading...</p>
          ) : pending.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No pending requests</p>
          ) : (
            <div className="space-y-4">
              {pending.map((request) => (
                <div key={request.id} className="flex items-center justify-between p-4 rounded-lg border border-status-pending/30 bg-status-pending/5">
                  <div className="flex items-center gap-4">
                    <Avatar className="w-12 h-12">
                      <AvatarFallback className="bg-muted text-muted-foreground">
                        {(request.name || request.email).split(" ").map((n) => n[0]).join("")}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{request.name || request.email}</p>
                      <p className="text-sm text-muted-foreground">{request.email}</p>
                      <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                        <span>{request.department || "-"}</span>
                        <span>{request.phone || "-"}</span>
                        <span>Requested: {new Date(request.created_at).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive border-destructive hover:bg-destructive/10"
                      onClick={() => reject(request.id)}
                    >
                      <X className="w-4 h-4 mr-1" />
                      Reject
                    </Button>
                    <Button size="sm" className="gradient-primary text-white" onClick={() => approve(request.id)}>
                      <Check className="w-4 h-4 mr-1" />
                      Approve
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Approvals */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>History of approval decisions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recent.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No activity yet</p>
            ) : (
              recent.map((approval) => (
              <div key={approval.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-3">
                  <Avatar className="w-10 h-10">
                    <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                      {approval.name.split(" ").map((n) => n[0]).join("")}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{approval.name}</p>
                    <p className="text-sm text-muted-foreground">{approval.email}</p>
                  </div>
                </div>
                <div className="text-right">
                  <StatusBadge status={approval.status} />
                  <p className="text-xs text-muted-foreground mt-1">{new Date(approval.at).toLocaleString()}</p>
                </div>
              </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
