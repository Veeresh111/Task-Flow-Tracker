import { useEffect, useState } from "react";
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
import { useAuth } from "@/lib/auth-context";
import { listProjectsForTeamLead } from "@/lib/db/projects";
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

export default function Projects() {
  const { profile } = useAuth();
  const [presenceStatus, setPresenceStatus] = useState<PresenceStatus>("offline");
  const [workMode, setWorkMode] = useState<WorkMode | undefined>(undefined);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const handlePresenceChange = (status: PresenceStatus, mode?: WorkMode) => {
    setPresenceStatus(status);
    setWorkMode(mode);
  };

  const fetchAll = async () => {
    if (!profile) return;
    setLoading(true);

    const pRes = await listProjectsForTeamLead(profile.id);
    const projectRows = pRes.data ?? [];
    const ids = projectRows.map((p) => p.id);

    const { data: taskRows } =
      ids.length === 0
        ? { data: [] as any[] }
        : await supabase.from("tasks").select("project_id,status").in("project_id", ids);

    const byProject: Record<string, { total: number; completed: number }> = {};
    for (const t of taskRows ?? []) {
      const pid = t.project_id as string;
      if (!byProject[pid]) byProject[pid] = { total: 0, completed: 0 };
      byProject[pid].total += 1;
      if (t.status === "completed") byProject[pid].completed += 1;
    }

    setProjects(
      projectRows.map((p) => {
        const stats = byProject[p.id] ?? { total: 0, completed: 0 };
        const progress = stats.total === 0 ? 0 : Math.round((stats.completed / stats.total) * 100);
        return { ...p, tasks: stats, progress };
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
      role="team_lead"
      navItems={navItems}
      userName={profile?.name || "Team Lead"}
      userEmail={profile?.email || ""}
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
            <div className="text-2xl font-bold">{projects.length}</div>
            <p className="text-sm text-muted-foreground">Active Projects</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {projects.reduce((acc, p) => acc + p.tasks.total, 0)}
            </div>
            <p className="text-sm text-muted-foreground">Total Tasks</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-status-completed">
              {projects.reduce((acc, p) => acc + p.tasks.completed, 0)}
            </div>
            <p className="text-sm text-muted-foreground">Completed Tasks</p>
          </CardContent>
        </Card>
      </div>

      {/* Projects Grid */}
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading projects...</div>
      ) : projects.length === 0 ? (
        <div className="text-sm text-muted-foreground">No assigned projects yet.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
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
                  <span>
                    Deadline: {project.deadline ? new Date(project.deadline).toLocaleDateString() : "-"}
                  </span>
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
      )}
    </DashboardLayout>
  );
}
