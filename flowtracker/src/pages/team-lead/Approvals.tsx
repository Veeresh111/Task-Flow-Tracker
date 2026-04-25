import { useState } from "react";
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

const mockPendingApprovals = [
  { id: "1", name: "David Lee", email: "david.l@company.com", department: "Engineering", phone: "+1 555-0101", requestedAt: "2024-02-15 08:30 AM" },
  { id: "2", name: "Rachel Kim", email: "rachel.k@company.com", department: "Design", phone: "+1 555-0102", requestedAt: "2024-02-15 03:15 PM" },
  { id: "3", name: "Tom Wilson", email: "tom.w@company.com", department: "Marketing", phone: "+1 555-0103", requestedAt: "2024-02-14 11:00 AM" },
];

const mockRecentApprovals = [
  { id: "4", name: "Alice Brown", email: "alice.b@company.com", status: "approved" as const, approvedAt: "2024-02-14 09:00 AM" },
  { id: "5", name: "Bob Martin", email: "bob.m@company.com", status: "approved" as const, approvedAt: "2024-02-13 02:30 PM" },
  { id: "6", name: "Mark Johnson", email: "mark.j@company.com", status: "rejected" as const, approvedAt: "2024-02-12 10:15 AM" },
];

export default function Approvals() {
  const [presenceStatus, setPresenceStatus] = useState<PresenceStatus>("offline");
  const [workMode, setWorkMode] = useState<WorkMode | undefined>(undefined);

  const handlePresenceChange = (status: PresenceStatus, mode?: WorkMode) => {
    setPresenceStatus(status);
    setWorkMode(mode);
  };

  return (
    <DashboardLayout
      role="team_lead"
      navItems={navItems}
      userName="John Smith"
      userEmail="john.smith@company.com"
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
            <div className="text-2xl font-bold text-status-pending">{mockPendingApprovals.length}</div>
            <p className="text-sm text-muted-foreground">Pending Requests</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-status-completed">
              {mockRecentApprovals.filter((a) => a.status === "approved").length}
            </div>
            <p className="text-sm text-muted-foreground">Approved This Week</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-status-blocked">
              {mockRecentApprovals.filter((a) => a.status === "rejected").length}
            </div>
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
          {mockPendingApprovals.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No pending requests</p>
          ) : (
            <div className="space-y-4">
              {mockPendingApprovals.map((request) => (
                <div key={request.id} className="flex items-center justify-between p-4 rounded-lg border border-status-pending/30 bg-status-pending/5">
                  <div className="flex items-center gap-4">
                    <Avatar className="w-12 h-12">
                      <AvatarFallback className="bg-muted text-muted-foreground">
                        {request.name.split(" ").map((n) => n[0]).join("")}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{request.name}</p>
                      <p className="text-sm text-muted-foreground">{request.email}</p>
                      <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                        <span>{request.department}</span>
                        <span>{request.phone}</span>
                        <span>Requested: {request.requestedAt}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" className="text-destructive border-destructive hover:bg-destructive/10">
                      <X className="w-4 h-4 mr-1" />
                      Reject
                    </Button>
                    <Button size="sm" className="gradient-primary text-white">
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
            {mockRecentApprovals.map((approval) => (
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
                  <p className="text-xs text-muted-foreground mt-1">{approval.approvedAt}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
