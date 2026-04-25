import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  Calendar,
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

const mockProjects = [
  { id: "1", name: "Mobile App Redesign", description: "Complete redesign of the mobile application UI/UX", progress: 75, status: "active" as const, deadline: "2024-03-15", tasks: { completed: 18, total: 24 } },
  { id: "2", name: "API Integration", description: "Third-party payment gateway integration", progress: 45, status: "active" as const, deadline: "2024-04-01", tasks: { completed: 9, total: 20 } },
  { id: "3", name: "Performance Optimization", description: "Optimize database queries and caching", progress: 90, status: "active" as const, deadline: "2024-02-28", tasks: { completed: 9, total: 10 } },
];

export default function Projects() {
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
        <h1 className="page-title">Projects</h1>
        <p className="page-description">View and manage your assigned projects</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{mockProjects.length}</div>
            <p className="text-sm text-muted-foreground">Active Projects</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {mockProjects.reduce((acc, p) => acc + p.tasks.total, 0)}
            </div>
            <p className="text-sm text-muted-foreground">Total Tasks</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-status-completed">
              {mockProjects.reduce((acc, p) => acc + p.tasks.completed, 0)}
            </div>
            <p className="text-sm text-muted-foreground">Completed Tasks</p>
          </CardContent>
        </Card>
      </div>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {mockProjects.map((project) => (
          <Card key={project.id} className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-lg">{project.name}</CardTitle>
                  <CardDescription className="mt-1">{project.description}</CardDescription>
                </div>
                <Badge className="bg-status-online/20 text-status-online border-0">Active</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-muted-foreground">Progress</span>
                  <span className="font-medium">{project.progress}%</span>
                </div>
                <Progress value={project.progress} className="h-2" />
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="w-4 h-4" />
                <span>Deadline: {new Date(project.deadline).toLocaleDateString()}</span>
              </div>

              <div className="pt-3 border-t">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Tasks</span>
                  <span className="font-medium">
                    {project.tasks.completed}/{project.tasks.total} completed
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </DashboardLayout>
  );
}
