import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  LayoutDashboard,
  Users,
  UserCheck,
  FolderKanban,
  Activity,
  BarChart3,
  Bell,
  MessageSquare,
  Settings,
  Briefcase,
  Clock,
  AlertTriangle,
  TrendingUp,
} from "lucide-react";
import { PresenceStatus, WorkMode } from "@/types";

const navItems = [
  { title: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { title: "Team Leads", href: "/admin/team-leads", icon: UserCheck },
  { title: "Employees", href: "/admin/employees", icon: Users },
  { title: "Projects", href: "/admin/projects", icon: FolderKanban },
  { title: "Presence", href: "/admin/presence", icon: Activity },
  { title: "Analytics", href: "/admin/analytics", icon: BarChart3 },
  { title: "Complaints", href: "/admin/complaints", icon: AlertTriangle },
  { title: "Notifications", href: "/admin/notifications", icon: Bell },
  { title: "Chat", href: "/admin/chat", icon: MessageSquare },
  { title: "Settings", href: "/admin/settings", icon: Settings },
];

// Mock data
const recentTeamLeads = [
  { id: "1", name: "John Smith", status: "online" as const, workMode: "wfo" as const, teamSize: 8 },
  { id: "2", name: "Sarah Johnson", status: "online" as const, workMode: "wfh" as const, teamSize: 12 },
  { id: "3", name: "Michael Chen", status: "offline" as const, teamSize: 6 },
];

const recentProjects = [
  { id: "1", name: "Mobile App Redesign", progress: 75, teamLead: "John Smith" },
  { id: "2", name: "API Integration", progress: 45, teamLead: "Sarah Johnson" },
  { id: "3", name: "Dashboard Analytics", progress: 90, teamLead: "Michael Chen" },
];

export default function AdminDashboard() {
  const [presenceStatus, setPresenceStatus] = useState<PresenceStatus>("online");
  const [workMode, setWorkMode] = useState<WorkMode | undefined>(undefined);

  const handlePresenceChange = (status: PresenceStatus, mode?: WorkMode) => {
    setPresenceStatus(status);
    setWorkMode(mode);
  };

  return (
    <DashboardLayout
      role="admin"
      navItems={navItems}
      userName="Admin User"
      userEmail="admin@company.com"
      presenceStatus={presenceStatus}
      workMode={workMode}
      onPresenceChange={handlePresenceChange}
    >
      <div className="page-header">
        <h1 className="page-title">Admin Dashboard</h1>
        <p className="page-description">Overview of your organization's workforce and performance</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          title="Total Team Leads"
          value={12}
          icon={UserCheck}
          trend={{ value: 8, isPositive: true }}
          description="3 online now"
        />
        <StatCard
          title="Total Employees"
          value={156}
          icon={Users}
          trend={{ value: 12, isPositive: true }}
          description="89 online now"
        />
        <StatCard
          title="Active Projects"
          value={24}
          icon={Briefcase}
          description="6 due this week"
        />
        <StatCard
          title="Hours This Week"
          value="1,284"
          icon={Clock}
          trend={{ value: 5, isPositive: true }}
          description="Across all teams"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Team Leads Overview */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-lg">Team Leads</CardTitle>
              <CardDescription>Current status and activity</CardDescription>
            </div>
            <UserCheck className="w-5 h-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentTeamLeads.map((lead) => (
                <div key={lead.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-10 h-10">
                      <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                        {lead.name.split(' ').map(n => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{lead.name}</p>
                      <p className="text-sm text-muted-foreground">{lead.teamSize} team members</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={lead.status} showDot />
                    {lead.workMode && <StatusBadge status={lead.workMode} />}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Projects Progress */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-lg">Projects Progress</CardTitle>
              <CardDescription>Active project status</CardDescription>
            </div>
            <FolderKanban className="w-5 h-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentProjects.map((project) => (
                <div key={project.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{project.name}</p>
                      <p className="text-sm text-muted-foreground">Lead: {project.teamLead}</p>
                    </div>
                    <span className="text-sm font-semibold text-primary">{project.progress}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full gradient-primary rounded-full transition-all duration-500"
                      style={{ width: `${project.progress}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-lg">Work Mode Distribution</CardTitle>
              <CardDescription>Current workforce location</CardDescription>
            </div>
            <Activity className="w-5 h-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-status-wfo/10 text-center">
                <p className="text-3xl font-bold text-status-wfo">67</p>
                <p className="text-sm text-muted-foreground">Work From Office</p>
              </div>
              <div className="p-4 rounded-lg bg-status-wfh/10 text-center">
                <p className="text-3xl font-bold text-status-wfh">45</p>
                <p className="text-sm text-muted-foreground">Work From Home</p>
              </div>
            </div>
            <div className="mt-4 p-4 rounded-lg bg-muted/50 text-center">
              <p className="text-3xl font-bold text-muted-foreground">44</p>
              <p className="text-sm text-muted-foreground">Currently Offline</p>
            </div>
          </CardContent>
        </Card>

        {/* Pending Complaints */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-lg">Pending Issues</CardTitle>
              <CardDescription>Complaints requiring attention</CardDescription>
            </div>
            <AlertTriangle className="w-5 h-5 text-status-pending" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg border border-status-pending/30 bg-status-pending/5">
                <div>
                  <p className="font-medium">VPN Connection Issues</p>
                  <p className="text-sm text-muted-foreground">Raised by: John Doe • 2h ago</p>
                </div>
                <StatusBadge status="pending" />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border border-status-pending/30 bg-status-pending/5">
                <div>
                  <p className="font-medium">Access Permission Request</p>
                  <p className="text-sm text-muted-foreground">Raised by: Jane Smith • 5h ago</p>
                </div>
                <StatusBadge status="pending" />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <p className="font-medium">Hardware Upgrade Needed</p>
                  <p className="text-sm text-muted-foreground">Raised by: Mike Ross • 1d ago</p>
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
