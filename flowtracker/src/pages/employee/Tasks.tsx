import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LayoutDashboard, ListTodo, FolderKanban, FileText, AlertTriangle, Bell, MessageSquare, Settings } from "lucide-react";
import { PresenceStatus, WorkMode } from "@/types";
import { useAuth } from "@/lib/auth-context";
import { listMyTasks, updateTaskStatus, type TaskWithRefs } from "@/lib/db/tasks";
import { createWorkLog } from "@/lib/db/work-logs";

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

export default function Tasks() {
  const { profile } = useAuth();
  const [presenceStatus, setPresenceStatus] = useState<PresenceStatus>("offline");
  const [workMode, setWorkMode] = useState<WorkMode | undefined>(undefined);

  const [tasks, setTasks] = useState<TaskWithRefs[]>([]);
  const [loading, setLoading] = useState(true);

  const [workLogOpen, setWorkLogOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [workLog, setWorkLog] = useState({ summary: "", hours: "" });
  const [nextStatus, setNextStatus] = useState<TaskWithRefs["status"]>("in_progress");

  const handlePresenceChange = (status: PresenceStatus, mode?: WorkMode) => {
    setPresenceStatus(status);
    setWorkMode(mode);
  };

  const fetchTasks = async () => {
    if (!profile) return;
    setLoading(true);
    const res = await listMyTasks(profile.id);
    setTasks(res.data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    fetchTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const openWorkLog = (taskId: string) => {
    setActiveTaskId(taskId);
    setWorkLog({ summary: "", hours: "" });
    setWorkLogOpen(true);
  };

  const submitWorkLog = async () => {
    if (!profile || !activeTaskId) return;
    const hoursSpent = Number(workLog.hours);
    if (!workLog.summary.trim() || Number.isNaN(hoursSpent) || hoursSpent < 0) return;

    const res = await createWorkLog({
      taskId: activeTaskId,
      userId: profile.id,
      summary: workLog.summary.trim(),
      hoursSpent,
      workDate: null,
    });

    if (res.error) return;

    setWorkLogOpen(false);
    setActiveTaskId(null);
    fetchTasks();
  };

  const openStatus = (taskId: string, current: TaskWithRefs["status"]) => {
    setActiveTaskId(taskId);
    setNextStatus(current);
    setStatusOpen(true);
  };

  const submitStatus = async () => {
    if (!activeTaskId) return;
    const res = await updateTaskStatus(activeTaskId, nextStatus);
    if (res.error) return;
    setStatusOpen(false);
    setActiveTaskId(null);
    fetchTasks();
  };

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
        <h1 className="page-title">My Tasks</h1>
        <p className="page-description">View and update your assigned tasks</p>
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading tasks...</div>
        ) : tasks.length === 0 ? (
          <div className="text-sm text-muted-foreground">No tasks assigned yet.</div>
        ) : (
          tasks.map((task) => {
            const progress =
              task.status === "completed"
                ? 100
                : task.status === "in_progress"
                  ? 50
                  : task.status === "blocked"
                    ? 25
                    : 0;

            return (
              <Card key={task.id}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="font-semibold text-lg">{task.title}</h3>
                      <p className="text-sm text-muted-foreground">Project: {task.projects?.name ?? "-"}</p>
                    </div>
                    <StatusBadge status={task.status} />
                  </div>
                  <div className="mb-4">
                    <div className="flex justify-between text-sm mb-2">
                      <span>Progress</span>
                      <span>{progress}%</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      Deadline: {task.deadline ? new Date(task.deadline).toLocaleDateString() : "-"}
                    </span>
                    <span className="text-muted-foreground">Hours: {task.hours_spent}h</span>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <Button size="sm" variant="outline" onClick={() => openWorkLog(task.id)}>
                      Add Work Log
                    </Button>
                    <Button size="sm" className="gradient-primary text-white" onClick={() => openStatus(task.id, task.status)}>
                      Update Status
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <Dialog open={workLogOpen} onOpenChange={setWorkLogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Work Log</DialogTitle>
            <DialogDescription>Log what you worked on for this task.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Summary</Label>
              <Textarea value={workLog.summary} onChange={(e) => setWorkLog((p) => ({ ...p, summary: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Hours</Label>
              <Input value={workLog.hours} onChange={(e) => setWorkLog((p) => ({ ...p, hours: e.target.value }))} placeholder="e.g. 2" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWorkLogOpen(false)}>
              Cancel
            </Button>
            <Button className="gradient-primary text-white" onClick={submitWorkLog}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Status</DialogTitle>
            <DialogDescription>Change the current status of the task.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={nextStatus} onValueChange={(v) => setNextStatus(v as any)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_started">Not started</SelectItem>
                  <SelectItem value="in_progress">In progress</SelectItem>
                  <SelectItem value="blocked">Blocked</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusOpen(false)}>
              Cancel
            </Button>
            <Button className="gradient-primary text-white" onClick={submitStatus}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
