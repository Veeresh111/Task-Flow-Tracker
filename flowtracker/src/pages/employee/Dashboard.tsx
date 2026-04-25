import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  LayoutDashboard,
  ListTodo,
  FolderKanban,
  FileText,
  AlertTriangle,
  Bell,
  MessageSquare,
  Settings,
  Clock,
  CheckCircle2,
} from "lucide-react";
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
  { id: "1", title: "Complete API Documentation", project: "API Integration", status: "in_progress" as const, progress: 60, deadline: "2024-02-18" },
  { id: "2", title: "Fix Login Bug", project: "Mobile App", status: "completed" as const, progress: 100, deadline: "2024-02-15" },
  { id: "3", title: "Database Optimization", project: "Performance", status: "not_started" as const, progress: 0, deadline: "2024-02-20" },
];

export default function EmployeeDashboard() {
  const [presenceStatus, setPresenceStatus] = useState<PresenceStatus>("offline");
  const [workMode, setWorkMode] = useState<WorkMode | undefined>(undefined);

  const handlePresenceChange = (status: PresenceStatus, mode?: WorkMode) => {
    setPresenceStatus(status);
    setWorkMode(mode);
  };

  return (
    <DashboardLayout
      role="employee"
      navItems={navItems}
      userName="Alice Brown"
      userEmail="alice.b@company.com"
      presenceStatus={presenceStatus}
      workMode={workMode}
      onPresenceChange={handlePresenceChange}
    >
      <div className="page-header">
        <h1 className="page-title">Employee Dashboard</h1>
        <p className="page-description">Track your tasks and work progress</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard title="Active Tasks" value={5} icon={ListTodo} description="2 due today" />
        <StatCard title="Completed" value={12} icon={CheckCircle2} trend={{ value: 8, isPositive: true }} />
        <StatCard title="Hours Today" value="5h 30m" icon={Clock} />
        <StatCard title="Weekly Hours" value="32h" icon={Clock} description="Target: 40h" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">My Tasks</CardTitle>
            <CardDescription>Current task assignments</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {mockTasks.map((task) => (
                <div key={task.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{task.title}</p>
                      <p className="text-sm text-muted-foreground">{task.project}</p>
                    </div>
                    <StatusBadge status={task.status} />
                  </div>
                  <Progress value={task.progress} className="h-2" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Today's Summary</CardTitle>
            <CardDescription>Your work activity for today</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">Online Time</p>
                <p className="text-2xl font-bold">5h 30m</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">Tasks Completed</p>
                <p className="text-2xl font-bold">2</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">Work Logs Added</p>
                <p className="text-2xl font-bold">3</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
