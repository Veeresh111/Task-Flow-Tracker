import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
  Plus,
  Search,
  Calendar,
  Users2,
  AlertTriangle,
} from "lucide-react";
import { PresenceStatus, WorkMode } from "@/types";
import { useAuth } from "@/lib/auth-context";
import { createProject, listProjectsAdmin, setProjectTeamLeads } from "@/lib/db/projects";
import { listTeamLeads } from "@/lib/db/profiles";
import { supabase } from "@/lib/supabase";

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

export default function Projects() {
  const { profile } = useAuth();
  const [presenceStatus, setPresenceStatus] = useState<PresenceStatus>("online");
  const [workMode, setWorkMode] = useState<WorkMode | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamLeads, setTeamLeads] = useState<{ id: string; name: string; email: string }[]>([]);

  const [newProject, setNewProject] = useState({
    name: "",
    description: "",
    deadline: "",
    teamLeadIds: [] as string[],
  });

  const handlePresenceChange = (status: PresenceStatus, mode?: WorkMode) => {
    setPresenceStatus(status);
    setWorkMode(mode);
  };

  const fetchAll = async () => {
    setLoading(true);

    const [pRes, tlRes] = await Promise.all([listProjectsAdmin(), listTeamLeads()]);

    const projectRows = pRes.data ?? [];
    setTeamLeads((tlRes.data ?? []).map((tl) => ({ id: tl.id, name: tl.name || tl.email, email: tl.email })));

    const projectIds = projectRows.map((p) => p.id);
    const { data: ptlRows } =
      projectIds.length === 0
        ? { data: [] as any[] }
        : await supabase.from("project_team_leads").select("project_id,team_lead_id").in("project_id", projectIds);

    const leadsByProject: Record<string, string[]> = {};
    for (const row of ptlRows ?? []) {
      const pid = row.project_id as string;
      if (!leadsByProject[pid]) leadsByProject[pid] = [];
      leadsByProject[pid].push(row.team_lead_id as string);
    }

    // Fetch task counts for progress display
    const { data: taskRows } = await supabase.from("tasks").select("project_id,status");
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
        return { ...p, tasks: stats, progress, teamLeadIds: leadsByProject[p.id] ?? [] };
      })
    );

    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredProjects = useMemo(() => {
    return projects.filter(
      (project) =>
        project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        project.description.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [projects, searchQuery]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-status-online/20 text-status-online border-0">Active</Badge>;
      case "completed":
        return <Badge className="bg-status-completed/20 text-status-completed border-0">Completed</Badge>;
      case "on_hold":
        return <Badge className="bg-status-pending/20 text-status-pending border-0">On Hold</Badge>;
      default:
        return null;
    }
  };

  const toggleTeamLead = (id: string) => {
    setNewProject((prev) => {
      const next = new Set(prev.teamLeadIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, teamLeadIds: Array.from(next) };
    });
  };

  const handleCreateProject = async () => {
    if (!profile) return;
    if (!newProject.name.trim()) return;

    const created = await createProject({
      name: newProject.name.trim(),
      description: newProject.description.trim(),
      deadline: newProject.deadline ? newProject.deadline : null,
      createdBy: profile.id,
    });

    if (created.error || !created.data) return;

    const assign = await setProjectTeamLeads(created.data.id, newProject.teamLeadIds);
    if (assign.error) return;

    setIsAddDialogOpen(false);
    setNewProject({ name: "", description: "", deadline: "", teamLeadIds: [] });
    fetchAll();
  };

  return (
    <DashboardLayout
      role="admin"
      navItems={navItems}
      userName={profile?.name || "Admin"}
      userEmail={profile?.email || ""}
      presenceStatus={presenceStatus}
      workMode={workMode}
      onPresenceChange={handlePresenceChange}
    >
      <div className="page-header">
        <h1 className="page-title">Projects</h1>
        <p className="page-description">Create and manage projects across teams</p>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between mb-6">
        <div className="relative w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gradient-primary text-white">
              <Plus className="w-4 h-4 mr-2" />
              Create Project
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create New Project</DialogTitle>
              <DialogDescription>
                Set up a new project and assign team leads.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="projectName">Project Name</Label>
                <Input
                  id="projectName"
                  placeholder="Enter project name"
                  value={newProject.name}
                  onChange={(e) => setNewProject((p) => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Describe the project"
                  value={newProject.description}
                  onChange={(e) => setNewProject((p) => ({ ...p, description: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="deadline">Deadline</Label>
                <Input
                  id="deadline"
                  type="date"
                  value={newProject.deadline}
                  onChange={(e) => setNewProject((p) => ({ ...p, deadline: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Assign Team Leads</Label>
                {teamLeads.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No team leads yet. You can assign later.</p>
                ) : (
                  <div className="space-y-2 max-h-44 overflow-auto rounded-md border p-3">
                    {teamLeads.map((tl) => (
                      <label key={tl.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={newProject.teamLeadIds.includes(tl.id)}
                          onCheckedChange={() => toggleTeamLead(tl.id)}
                        />
                        <span className="font-medium">{tl.name}</span>
                        <span className="text-muted-foreground">{tl.email}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button className="gradient-primary text-white" onClick={handleCreateProject}>
                Create Project
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Projects Grid */}
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading projects...</div>
      ) : filteredProjects.length === 0 ? (
        <div className="text-sm text-muted-foreground">No projects yet. Create your first project.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map((project) => (
            <Card key={project.id} className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{project.name}</CardTitle>
                    <CardDescription className="mt-1">{project.description}</CardDescription>
                  </div>
                  {getStatusBadge(project.status)}
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

                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Calendar className="w-4 h-4" />
                    <span>{project.deadline ? new Date(project.deadline).toLocaleDateString() : "No deadline"}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Users2 className="w-4 h-4" />
                    <span>{project.teamLeadIds?.length ?? 0} Lead(s)</span>
                  </div>
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
