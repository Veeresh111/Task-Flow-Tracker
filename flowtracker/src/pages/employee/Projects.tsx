import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { LayoutDashboard, ListTodo, FolderKanban, FileText, AlertTriangle, Bell, MessageSquare, Settings, Calendar } from "lucide-react";
import { PresenceStatus, WorkMode } from "@/types";
import { useAuth } from "@/lib/auth-context";
import { listProjectsForEmployee } from "@/lib/db/projects";
import { supabase } from "@/lib/supabase";

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

export default function Projects() {
  const { profile } = useAuth();
  const [presenceStatus, setPresenceStatus] = useState<PresenceStatus>("offline");
  const [workMode, setWorkMode] = useState<WorkMode | undefined>(undefined);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const handlePresenceChange = (status: PresenceStatus, mode?: WorkMode) => { setPresenceStatus(status); setWorkMode(mode); };

  const fetchAll = async () => {
    if (!profile) return;
    setLoading(true);

    const pRes = await listProjectsForEmployee(profile.id);
    const projectRows = pRes.data ?? [];
    const ids = projectRows.map((p) => p.id);

    const { data: taskRows } =
      ids.length === 0
        ? { data: [] as any[] }
        : await supabase.from("tasks").select("project_id,status,assignee_id").in("project_id", ids);

    const byProject: Record<string, { myTasks: number; total: number; completed: number }> = {};
    for (const t of taskRows ?? []) {
      const pid = t.project_id as string;
      if (!byProject[pid]) byProject[pid] = { myTasks: 0, total: 0, completed: 0 };
      byProject[pid].total += 1;
      if (t.status === "completed") byProject[pid].completed += 1;
      if (t.assignee_id === profile.id) byProject[pid].myTasks += 1;
    }

    setProjects(
      projectRows.map((p) => {
        const stats = byProject[p.id] ?? { myTasks: 0, total: 0, completed: 0 };
        const progress = stats.total === 0 ? 0 : Math.round((stats.completed / stats.total) * 100);
        return { ...p, myTasks: stats.myTasks, progress };
      })
    );

    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  return (
    <DashboardLayout
      role="employee"
      navItems={navItems}
      userName={profile?.name || "Employee"}
      userEmail={profile?.email || ""}
      presenceStatus={presenceStatus}
      workMode={workMode}
      onPresenceChange={handlePresenceChange}
    >
      <div className="page-header">
        <h1 className="page-title">Projects</h1>
        <p className="page-description">View projects you're assigned to</p>
      </div>
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading projects...</div>
      ) : projects.length === 0 ? (
        <div className="text-sm text-muted-foreground">No projects yet.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {projects.map((project) => (
            <Card key={project.id}>
              <CardHeader>
                <div className="flex justify-between">
                  <CardTitle>{project.name}</CardTitle>
                  <Badge className="bg-status-online/20 text-status-online border-0">Active</Badge>
                </div>
                <CardDescription>{project.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>Progress</span>
                    <span>{project.progress}%</span>
                  </div>
                  <Progress value={project.progress} className="h-2" />
                </div>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {project.deadline ? new Date(project.deadline).toLocaleDateString() : "-"}
                  </span>
                  <span>My Tasks: {project.myTasks}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
