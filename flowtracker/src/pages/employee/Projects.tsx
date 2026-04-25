import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { LayoutDashboard, ListTodo, FolderKanban, FileText, AlertTriangle, Bell, MessageSquare, Settings, Calendar } from "lucide-react";
import { PresenceStatus, WorkMode } from "@/types";

const navItems = [
  { title: "Dashboard", href: "/employee", icon: LayoutDashboard },
  { title: "My Tasks", href: "/employee/tasks", icon: ListTodo },
  { title: "Projects", href: "/employee/projects", icon: FolderKanban },
  { title: "Work Logs", href: "/employee/work-logs", icon: FileText },
  { title: "Complaints", href: "/employee/complaints", icon: AlertTriangle },
  { title: "Notifications", href: "/employee/notifications", icon: Bell },
  { title: "Chat", href: "/employee/chat", icon: MessageSquare },
  { title: "Settings", href: "/employee/settings", icon: Settings },
];

const mockProjects = [
  { id: "1", name: "API Integration", description: "Third-party payment gateway", progress: 45, deadline: "2024-04-01", myTasks: 3 },
  { id: "2", name: "Mobile App Redesign", description: "UI/UX improvements", progress: 75, deadline: "2024-03-15", myTasks: 2 },
];

export default function Projects() {
  const [presenceStatus, setPresenceStatus] = useState<PresenceStatus>("offline");
  const [workMode, setWorkMode] = useState<WorkMode | undefined>(undefined);

  const handlePresenceChange = (status: PresenceStatus, mode?: WorkMode) => { setPresenceStatus(status); setWorkMode(mode); };

  return (
    <DashboardLayout role="employee" navItems={navItems} userName="Alice Brown" userEmail="alice.b@company.com" presenceStatus={presenceStatus} workMode={workMode} onPresenceChange={handlePresenceChange}>
      <div className="page-header">
        <h1 className="page-title">Projects</h1>
        <p className="page-description">View projects you're assigned to</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {mockProjects.map((project) => (
          <Card key={project.id}>
            <CardHeader>
              <div className="flex justify-between"><CardTitle>{project.name}</CardTitle><Badge className="bg-status-online/20 text-status-online border-0">Active</Badge></div>
              <CardDescription>{project.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div><div className="flex justify-between text-sm mb-2"><span>Progress</span><span>{project.progress}%</span></div><Progress value={project.progress} className="h-2" /></div>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span className="flex items-center gap-1"><Calendar className="w-4 h-4" />{project.deadline}</span>
                <span>My Tasks: {project.myTasks}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </DashboardLayout>
  );
}
