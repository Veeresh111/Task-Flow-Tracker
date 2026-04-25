import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
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
  Clock,
  TrendingUp,
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

const mockTeamMembers = [
  { id: "1", name: "Alice Brown", status: "online" as const, workMode: "wfo" as const, currentTask: "API Integration" },
  { id: "2", name: "Bob Martin", status: "online" as const, workMode: "wfh" as const, currentTask: "Bug Fixes" },
  { id: "3", name: "Carol White", status: "offline" as const, currentTask: "Code Review" },
];

const mockTasks = [
  { id: "1", title: "Complete API Documentation", assignee: "Alice Brown", status: "in_progress" as const, progress: 60 },
  { id: "2", title: "Fix Login Bug", assignee: "Bob Martin", status: "completed" as const, progress: 100 },
  { id: "3", title: "Database Optimization", assignee: "Carol White", status: "blocked" as const, progress: 30 },
];

export default function TeamLeadDashboard() {
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
        <h1 className="page-title">Team Lead Dashboard</h1>
        <p className="page-description">Manage your team and track project progress</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          title="Team Members"
          value={8}
          icon={Users}
          description="3 online now"
        />
        <StatCard
          title="Active Tasks"
          value={24}
          icon={ListTodo}
          description="5 due today"
        />
        <StatCard
          title="Completed This Week"
          value={18}
          icon={TrendingUp}
          trend={{ value: 12, isPositive: true }}
        />
        <StatCard
          title="Team Hours Today"
          value="42h"
          icon={Clock}
          description="Avg 5.25h per person"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Team Status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Team Status</CardTitle>
            <CardDescription>Current status of team members</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {mockTeamMembers.map((member) => (
                <div key={member.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Avatar className="w-10 h-10">
                        <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                          {member.name.split(' ').map(n => n[0]).join('')}
                        </AvatarFallback>
                      </Avatar>
                      <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card ${
                        member.status === "online" ? "bg-status-online" : "bg-status-offline"
                      }`} />
                    </div>
                    <div>
                      <p className="font-medium">{member.name}</p>
                      <p className="text-sm text-muted-foreground">Working on: {member.currentTask}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={member.status} />
                    {member.workMode && <StatusBadge status={member.workMode} />}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Task Progress */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Task Progress</CardTitle>
            <CardDescription>Recent task updates</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {mockTasks.map((task) => (
                <div key={task.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{task.title}</p>
                      <p className="text-sm text-muted-foreground">Assigned to: {task.assignee}</p>
                    </div>
                    <StatusBadge status={task.status} />
                  </div>
                  <Progress value={task.progress} className="h-2" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Pending Approvals */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pending Approvals</CardTitle>
            <CardDescription>Employee registration requests</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg border border-status-pending/30 bg-status-pending/5">
                <div className="flex items-center gap-3">
                  <Avatar className="w-10 h-10">
                    <AvatarFallback className="bg-muted text-muted-foreground">DL</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">David Lee</p>
                    <p className="text-sm text-muted-foreground">Engineering • Requested 2h ago</p>
                  </div>
                </div>
                <StatusBadge status="pending" />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border border-status-pending/30 bg-status-pending/5">
                <div className="flex items-center gap-3">
                  <Avatar className="w-10 h-10">
                    <AvatarFallback className="bg-muted text-muted-foreground">RK</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">Rachel Kim</p>
                    <p className="text-sm text-muted-foreground">Design • Requested 5h ago</p>
                  </div>
                </div>
                <StatusBadge status="pending" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Team Complaints */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Team Complaints</CardTitle>
            <CardDescription>Issues raised by team members</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <p className="font-medium">Network Connectivity Issue</p>
                  <p className="text-sm text-muted-foreground">Alice Brown • 1h ago</p>
                </div>
                <StatusBadge status="pending" />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <p className="font-medium">Software License Request</p>
                  <p className="text-sm text-muted-foreground">Bob Martin • 3h ago</p>
                </div>
                <StatusBadge status="resolved" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
