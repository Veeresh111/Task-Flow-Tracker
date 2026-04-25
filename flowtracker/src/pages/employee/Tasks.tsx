import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { LayoutDashboard, ListTodo, FolderKanban, FileText, AlertTriangle, Bell, MessageSquare, Settings } from "lucide-react";
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

const mockTasks = [
  { id: "1", title: "Complete API Documentation", project: "API Integration", status: "in_progress" as const, progress: 60, deadline: "2024-02-18", hoursSpent: 8 },
  { id: "2", title: "Fix Login Bug", project: "Mobile App", status: "completed" as const, progress: 100, deadline: "2024-02-15", hoursSpent: 4 },
  { id: "3", title: "Database Optimization", project: "Performance", status: "not_started" as const, progress: 0, deadline: "2024-02-20", hoursSpent: 0 },
];

export default function Tasks() {
  const [presenceStatus, setPresenceStatus] = useState<PresenceStatus>("offline");
  const [workMode, setWorkMode] = useState<WorkMode | undefined>(undefined);

  const handlePresenceChange = (status: PresenceStatus, mode?: WorkMode) => {
    setPresenceStatus(status);
    setWorkMode(mode);
  };

  return (
    <DashboardLayout role="employee" navItems={navItems} userName="Alice Brown" userEmail="alice.b@company.com" presenceStatus={presenceStatus} workMode={workMode} onPresenceChange={handlePresenceChange}>
      <div className="page-header">
        <h1 className="page-title">My Tasks</h1>
        <p className="page-description">View and update your assigned tasks</p>
      </div>

      <div className="space-y-4">
        {mockTasks.map((task) => (
          <Card key={task.id}>
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-lg">{task.title}</h3>
                  <p className="text-sm text-muted-foreground">Project: {task.project}</p>
                </div>
                <StatusBadge status={task.status} />
              </div>
              <div className="mb-4">
                <div className="flex justify-between text-sm mb-2">
                  <span>Progress</span>
                  <span>{task.progress}%</span>
                </div>
                <Progress value={task.progress} className="h-2" />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Deadline: {task.deadline}</span>
                <span className="text-muted-foreground">Hours: {task.hoursSpent}h</span>
              </div>
              <div className="flex gap-2 mt-4">
                <Button size="sm" variant="outline">Add Work Log</Button>
                <Button size="sm" className="gradient-primary text-white">Update Status</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </DashboardLayout>
  );
}
